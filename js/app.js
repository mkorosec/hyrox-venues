import * as THREE from 'three';
import { buildRace, checkRace } from './route.js';
import { buildVenueScene } from './scene.js';
import { createViewer } from './viewer.js';
import { createCityMap } from './citymap.js';
import { createRealisticLook } from './realistic.js';
import * as G from './geometry.js';

const $ = s => document.querySelector(s);
const SPEED = { arrival: 5, start: 5, run: 16, roxzone: 4, station: 2.5, finish: 4 }; // metres/second at 1×
const KIND_LABEL = { arrival: 'Arrival', start: 'Start', run: 'Run', roxzone: 'Roxzone', station: 'Station', finish: 'Finish' };

const index = await (await fetch('venues/index.json')).json();
const venueId = new URLSearchParams(location.search).get('venue') || index.venues[0].id;
const venue = await (await fetch(`venues/${venueId}/venue.json`)).json();
const race = buildRace(venue);
checkRace(venue, race).forEach(p => console.warn(`[venue] ${p}`));
const segs = race.segments;

const viewer = createViewer($('#stage-3d'));
const model = buildVenueScene(venue, race);
viewer.scene.add(model.root);
const world = p => model.toWorld(p);

const state = { i: 0, d: 0, playing: false, mult: 2, hold: 0, held: false };

// ---------- header & event info ----------
const ev = venue.event, v = venue.venue;
$('#title').textContent = ev.name;
$('#subtitle').textContent = `${new Date(ev.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })} · ${v.name} · ${v.hall} · ${v.entrance}`;
document.title = `${ev.name} – race planner`;
$('#schedule').innerHTML = `<table>${ev.schedule.map(([d, t]) => `<tr><td>${d}</td><td>${t}</td></tr>`).join('')}</table>
  <p class="muted">${ev.scheduleNote}</p><p><strong>Check-in:</strong> ${ev.checkIn}</p>`;

// ---------- segment list ----------
const groups = new Map();
segs.forEach((s, i) => { if (!groups.has(s.group)) groups.set(s.group, []); groups.get(s.group).push(i); });
$('#segments').innerHTML = [...groups].map(([g, ids]) => {
  const head = g === 0 ? 'Getting in' : `${g} · ${segs.find(s => s.group === g && s.kind === 'station').info.name}`;
  return `<li class="group"><span>${head}</span><ol>${ids.map(i =>
    `<li><button data-i="${i}" class="seg k-${segs[i].kind}"><i></i>${segs[i].title}<em>${Math.round(segs[i].length)} m</em></button></li>`).join('')}</ol></li>`;
}).join('');
$('#segments').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) select(+b.dataset.i, { stop: true }); });

// ---------- race strip ----------
$('#strip').innerHTML = segs.map((s, i) =>
  `<button data-i="${i}" class="k-${s.kind}" style="flex-grow:${Math.max(s.length, 60)}" title="${s.title}"></button>`).join('');
$('#strip').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) select(+b.dataset.i, { stop: true }); });

// ---------- selection & playback ----------
function select(i, { stop = false, frame = true } = {}) {
  state.i = Math.max(0, Math.min(segs.length - 1, i));
  state.d = 0; state.hold = 0; state.held = false;
  if (stop) setPlaying(false);
  const s = segs[state.i];
  model.setActive(s);
  if (frame) viewer.frame(s.points.map(p => world(p)));
  document.querySelectorAll('[data-i].on').forEach(b => b.classList.remove('on'));
  document.querySelectorAll(`[data-i="${state.i}"]`).forEach(b => b.classList.add('on'));
  // Scroll only the side panel (scrollIntoView would also scroll the page on small screens).
  const item = document.querySelector(`#segments [data-i="${state.i}"]`), panel = $('#panel');
  const top = item.offsetTop - panel.offsetTop;
  if (top < panel.scrollTop || top > panel.scrollTop + panel.clientHeight - 40) panel.scrollTop = top - panel.clientHeight / 2;
  showDetail(s);
}

function showDetail(s, answer) {
  $('#detail').innerHTML = `
    ${answer ? `<p class="answer">${answer}</p>` : ''}
    <div class="kind k-${s.kind}">${KIND_LABEL[s.kind]}</div>
    <h2>${s.title}</h2>
    <p class="pre">${s.text || ''}</p>
    <p class="muted">${Math.round(s.length)} m on this leg${s.kind === 'run' ? ` · loop ${Math.round(s.lapLength)} m` : ''}</p>`;
}

function setPlaying(on) {
  state.playing = on;
  $('#play').textContent = on ? '❚❚ Pause' : '▶ Play';
}

function holdAt(s) { return s.hold ? G.dist(s.points[0], s.points[1]) : Infinity; }

function step(dt) {
  const s = segs[state.i];
  if (state.playing) {
    if (state.hold > 0) state.hold -= dt * state.mult;
    else {
      state.d += SPEED[s.kind] * state.mult * dt;
      if (!state.held && state.d >= holdAt(s)) { state.d = holdAt(s); state.held = true; state.hold = s.hold; }
      if (state.d >= s.length) {
        if (state.i < segs.length - 1) select(state.i + 1);
        else { state.d = s.length; setPlaying(false); }
      }
    }
  }
  const cur = segs[state.i];
  const { p, dir } = G.pointAt(cur.points, Math.min(state.d, cur.length));
  viewer.setRunner(world(p), state.d > 0 || state.playing ? new THREE.Vector3(dir[0], 0, -dir[1]) : null);
  hud(cur);
}

function hud(s) {
  let sub = `${Math.round(Math.min(state.d, s.length))} / ${Math.round(s.length)} m`;
  if (s.kind === 'run') {
    const seen = state.d < s.toFirstSighting ? 0 : 1 + Math.floor((state.d - s.toFirstSighting + 0.5) / s.lapLength);
    sub = `IN arch seen ${seen} / ${venue.runCourse.enterOnInSighting} · ${sub}`;
  }
  if (s.kind === 'station') sub = state.hold > 0 ? `${s.info.spec} – working…` : `${s.info.spec}`;
  $('#hud-title').textContent = s.title;
  $('#hud-sub').textContent = sub;
  const pct = (state.i + Math.min(1, state.d / (s.length || 1))) / segs.length;
  $('#strip').style.setProperty('--pct', `${pct * 100}%`);
}

$('#play').onclick = () => {
  if (!state.playing && state.i === segs.length - 1 && state.d >= segs[state.i].length) select(0);
  setPlaying(!state.playing);
};
$('#prev').onclick = () => select(state.i - 1, { stop: true });
$('#next').onclick = () => select(state.i + 1, { stop: true });
$('#speed').onchange = e => { state.mult = +e.target.value; };

// ---------- camera modes & layers ----------
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
function setMode(m) {
  viewer.setMode(m);
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('#stage').dataset.mode = m;
  if (m === 'overview') viewer.frame(segs[state.i].points.map(p => world(p)));
}

// 'Show on map': look (3D model / organizer map overlay) and per-layer toggles.
let realistic = null;
document.querySelectorAll('#look input').forEach(r => r.onchange = () => {
  if (!r.checked) return;
  if (model.overlay) model.overlay.visible = r.value === 'map';
  if (r.value === 'real' && !realistic) realistic = createRealisticLook(venue, race, model, viewer); // built on first use
  realistic?.setEnabled(r.value === 'real');
});
const layerOn = {};
function setLayer(name, on) {
  layerOn[name] = on;
  if (model.layers[name]) model.layers[name].visible = on;
  $('#stage').classList.toggle(`hide-${name}`, !on);
}
const isPhone = matchMedia('(max-width: 860px)');
document.querySelectorAll('#toggles input').forEach(cb => {
  if (isPhone.matches && cb.dataset.layer === 'labels') cb.checked = false; // area labels clutter a small screen
  setLayer(cb.dataset.layer, cb.checked);
  cb.onchange = () => setLayer(cb.dataset.layer, cb.checked);
});

// Phones: header + panel are a menu overlay; picking something closes it so the result is visible.
$('#menu-open').onclick = () => document.body.classList.add('menu-open');
$('#menu-close').onclick = () => document.body.classList.remove('menu-open');
$('#menu').addEventListener('click', e => {
  if (e.target.closest('#segments button, #questions button, #spots button, #modes button, #open-city')) document.body.classList.remove('menu-open');
});

// ---------- city map ----------
let city = null;
function openCity() {
  $('#city').hidden = false;
  if (!city) city = createCityMap($('#citymap'), venue);
  city.map.invalidateSize();
}
$('#open-city').onclick = openCity;
$('#close-city').onclick = () => { $('#city').hidden = true; };
$('#city-info').innerHTML = `
  <h3>${v.name}</h3><p>${v.address}<br>Use <strong>${v.entrance}</strong>, race in <strong>${v.hall}</strong>.</p>
  <h4>Public transport</h4><ul>${venue.city.transport.map(t => `<li>${t}</li>`).join('')}</ul>
  <h4>Parking</h4><ul>${venue.city.parking.map(t => `<li>${t}</li>`).join('')}</ul>
  <p class="muted">${venue.city.unknowns}</p>`;

// ---------- spectator photo spots ----------
const spots = venue.photoSpots || [];
$('#spots').innerHTML = spots.map((s, i) =>
  `<li><button data-spot="${i}" class="seg k-spot"><i></i>${s.name}<em>${s.bestFor}</em></button></li>`).join('');
$('#spots').addEventListener('click', e => { const b = e.target.closest('button[data-spot]'); if (b) showSpot(+b.dataset.spot); });

function showSpot(i) {
  const s = spots[i];
  setPlaying(false);
  setMode('overview');
  viewer.lookFrom(model.toWorld(race.M(s.at), s.height || 1.6), model.toWorld(race.M(s.look), 1));
  document.querySelectorAll('[data-spot].on').forEach(b => b.classList.remove('on'));
  document.querySelector(`[data-spot="${i}"]`).classList.add('on');
  $('#detail').innerHTML = `
    <div class="kind k-spot">Photo spot</div>
    <h2>${s.name}</h2>
    <p>${s.tip}</p>
    <p class="muted">Best for: ${s.bestFor}${s.height ? ' · seated, raised' : ' · standing'}. ${venue.photoSpotsNote}</p>`;
}

// ---------- quick questions ----------
const segByKey = key => segs.findIndex(s => s.key === key);
const QUESTIONS = {
  enter: () => {
    select(segByKey('arrival'), { stop: true });
    return `Come in through <strong>${v.entrance}</strong>, register, walk to the ${v.hall} entrance and through the hall to bag drop and the warm-up area. The blue line shows the way.`;
  },
  park: () => { openCity(); return null; },
  first: () => {
    const i = segByKey('rox-in1');
    select(i, { stop: true });
    return `Station 01 is the SkiErg in the north-east corner. After Run 1 you go through the IN arch and walk about ${Math.round(segs[i].length)} m along the Roxzone.`;
  },
  walk: () => {
    select(segByKey('start'));
    setMode('follow');
    setPlaying(true);
    return 'Playing the whole race from the start tunnel. Switch to POV to see it at eye level, and drag to look around.';
  },
  finish: () => {
    select(segByKey('finish'), { stop: true });
    return 'There is no Roxzone exit after Wall Balls. Leave the station at its south end and you are in the Finish Zone.';
  },
  photos: () => {
    setPlaying(false);
    setMode('overview');
    viewer.frame(spots.map(s => world(race.M(s.at))));
    return `${spots.length} suggested spots (📷, the pink wedge shows what you'd see). ` +
      'Pick one under “Photo spots for spectators” to look from there. ' + venue.photoSpotsNote;
  },
  facilities: () => {
    setMode('overview');
    viewer.frame((venue.pois || []).map(p => world(race.M(p.at))));
    $('#stage').classList.add('pulse-poi');
    setTimeout(() => $('#stage').classList.remove('pulse-poi'), 4000);
    const count = kind => (venue.pois || []).filter(p => p.kind === kind).length;
    return `💧 ${count('water')} water stations and ⚡ ${count('energy')} energy point on the Roxzone corridor, ➕ ${count('medic')} medic points (one in the Finish Zone), WC ×${count('wc')}, 🍴 food ×${count('food')}, 👕 changing room by the bag drop.`;
  },
};
$('#questions').addEventListener('click', e => {
  const b = e.target.closest('button[data-q]');
  if (!b) return;
  const answer = QUESTIONS[b.dataset.q]();
  if (answer) showDetail(segs[state.i], answer);
});

window.addEventListener('keydown', e => {
  if (e.target.matches('input, select')) return;
  if (e.code === 'Space') { e.preventDefault(); $('#play').click(); }
  if (e.code === 'ArrowRight') $('#next').click();
  if (e.code === 'ArrowLeft') $('#prev').click();
});

// ---------- go ----------
select(0);
viewer.frame(model.hallSize ? [world([0, 0]), world([model.hallSize[0], model.hallSize[1]])] : []);
let last = performance.now();
(function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  step(dt);
  realistic?.update(viewer.camera, dt);
  model.spotWedges.visible = layerOn.spots && viewer.camera.position.y > 8; // only useful from above; hides your own wedge at a spot
  viewer.update(dt);
  requestAnimationFrame(loop);
})(last);
