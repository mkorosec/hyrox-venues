// Builds the three.js model of a venue from the venue file + computed race route.
// Venue metres (x east, y north) map to three.js as (x, height, -y), re-centred on the hall.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as G from './geometry.js';

const C = {
  ground: '#cfd2cc', hall: '#ecebe6', wall: '#9aa3ad', athlete: '#3f4248', track: '#2a2c30',
  corridor: '#4d5057', yellow: '#ffd400', white: '#ffffff', route: '#0a84ff', routeAll: '#6aa9e8',
  equipment: '#1f2125', metal: '#8a9097',
};
const ZONE_COLORS = {
  warmup: '#596470', relay: '#4f5964', bagdrop: '#6d7782', tunnel: '#1d2a5a', finish: '#3f4248',
  lane: '#3f4248', grandstand: '#b7bec7', recovery: '#7d8b96', stage: '#ffd400', sponsor: '#d6dbe1', store: '#f6f6f3',
  building: '#dfe2e6', registration: '#6d7782', checkin: '#c9ced5',
};
// Floors athletes move on; the realistic look gives them the rubber material.
const ATHLETE_ZONES = new Set(['warmup', 'relay', 'bagdrop', 'finish', 'lane', 'recovery']);
const POI_ICON = { water: '💧', energy: '⚡', medic: '➕', wc: 'WC', food: '🍴', changing: '👕', help: '?' };

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...extra });

export function buildVenueScene(venue, race) {
  const { M, k } = race;
  const hallM = venue.hall.outline.map(M);
  const hb = G.bbox(hallM);
  const center = [(hb.minX + hb.maxX) / 2, (hb.minY + hb.maxY) / 2];
  const root = new THREE.Group();
  root.position.set(-center[0], 0, center[1]);

  const toWorld = (p, h = 0) => new THREE.Vector3(p[0] - center[0], h, -(p[1] - center[1]));
  const local = (p, h = 0) => new THREE.Vector3(p[0], h, -p[1]);
  const rectM = r => { const a = M([r[0], r[1]]), b = M([r[2], r[3]]); return G.bbox([a, b]); };
  const rectPts = b => [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]];

  const labels = [];
  const label = (text, cls, pos) => {
    const el = document.createElement('div');
    el.className = `lbl ${cls}`;
    el.textContent = text;
    const o = new CSS2DObject(el);
    o.position.copy(pos);
    root.add(o);
    labels.push(o);
    return o;
  };

  const flat = (pts, color, h, opts = {}) => {
    const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, opts.material || mat(color, opts.matOpts));
    m.position.y = h;
    root.add(m);
    return m;
  };

  const box = (w, h, d, color, p, elev = 0, rotY = 0, material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material || mat(color));
    m.position.copy(local(p, elev + h / 2));
    m.rotation.y = rotY;
    root.add(m);
    return m;
  };

  // --- ground, hall floor, walls ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), mat(C.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center[0], -0.02, -center[1]);
  ground.userData.role = 'ground';
  root.add(ground);
  flat(hallM, C.hall, 0).userData.role = 'concrete';

  const walls = new THREE.Group();
  root.add(walls);
  const wallMat = mat(C.wall, { transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const wh = venue.hall.wallHeight || 12;
  hallM.forEach((a, i) => {
    const b = hallM[(i + 1) % hallM.length];
    const len = G.dist(a, b);
    const w = box(len, wh, 0.4, null, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 0, Math.atan2(b[1] - a[1], b[0] - a[0]), wallMat);
    w.renderOrder = 2;
    w.userData.look = 'model'; // the realistic look has its own opaque walls
    walls.add(w);
  });
  if (venue.hall.door) {
    const d = M(venue.hall.door.at);
    box(4, 3.2, 0.6, C.route, d, 0);
    label(venue.hall.door.name, 'zone strong', local(d, 4));
  }

  // --- organizer map overlay (toggle) ---
  let overlay = null;
  if (venue.overlay) {
    const e = venue.overlay.extent;
    const b = rectM(e);
    const tex = new THREE.TextureLoader().load(`venues/${venue.id}/${venue.overlay.image}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    overlay = new THREE.Mesh(new THREE.PlaneGeometry(b.maxX - b.minX, b.maxY - b.minY),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, depthWrite: false }));
    overlay.rotation.x = -Math.PI / 2;
    overlay.position.copy(local([(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2], 0.3));
    overlay.renderOrder = 5;
    overlay.visible = false;
    root.add(overlay);
  }

  // --- run course & roxzone corridor ---
  ribbon(root, race.loop, venue.runCourse.width * k, C.track, 0.04, true).userData.role = 'carpet';
  ribbonEdges(root, race.loop, venue.runCourse.width * k, 0.05);
  chevrons(root, race.loop, 14, 1.1, C.white, 0.06, 0.55);
  ribbon(root, race.corridor, venue.roxzone.corridorWidth * k, C.corridor, 0.035, false).userData.role = 'carpet';
  label('RUN COURSE', 'zone', toLocalOnLoop(race.loop, 0.4, local));
  label('ROXZONE', 'zone', local(G.pointAt(race.corridor, G.length(race.corridor) * 0.62).p, 0.5));

  // --- zones ---
  const hatchTex = hatchTexture();
  for (const z of venue.zones || []) {
    const pts = z.rect ? rectPts(rectM(z.rect)) : z.poly.map(M);
    const c = G.bbox(pts);
    const mid = [(c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2];
    if (z.kind === 'crossing') {
      flat(pts, null, 0.07, { material: new THREE.MeshBasicMaterial({ map: hatchTex, transparent: true }) });
      continue;
    }
    if (z.kind === 'grandstand') { grandstand(root, c, z.facing === 'west' ? -1 : 1); label(z.name, 'zone', local(mid, 5)); continue; }
    if (z.kind === 'building') {
      const b = box(c.maxX - c.minX, 4, c.maxY - c.minY, ZONE_COLORS.building, mid, 0, 0,
        mat(ZONE_COLORS.building, { transparent: true, opacity: 0.5, depthWrite: false }));
      b.renderOrder = 3;
      label(z.name, 'zone strong', local(mid, 5.5));
      continue;
    }
    const zf = flat(pts, ZONE_COLORS[z.kind] || '#cccccc', z.kind === 'tunnel' ? 0.06 : 0.02);
    if (ATHLETE_ZONES.has(z.kind)) zf.userData.role = 'rubber';
    if (z.kind === 'tunnel') startTunnel(root, c);
    if (z.kind === 'stage') box(c.maxX - c.minX, 1, c.maxY - c.minY, C.yellow, mid);
    if (z.kind === 'sponsor' || z.kind === 'store') box(c.maxX - c.minX, 2.6, c.maxY - c.minY, ZONE_COLORS[z.kind], mid, 0, 0,
      mat(ZONE_COLORS[z.kind], { transparent: true, opacity: 0.85 }));
    label(z.name, z.kind === 'warmup' || z.kind === 'finish' ? 'zone strong' : 'zone', local(mid, 2));
  }

  // --- stations ---
  const stationViz = new Map();
  for (const st of venue.stations) {
    const b = rectM(st.area);
    const floor = flat(rectPts(b), C.athlete, 0.03);
    floor.userData.role = 'rubber';
    floor.material.userData = { base: C.athlete, highlight: '#2f4f73' };
    equipment(root, st.type, b, local, box);
    const mid = [(b.minX + b.maxX) / 2, b.maxY - Math.min(25, (b.maxY - b.minY) / 2)];
    const lbl = label(`${String(st.n).padStart(2, '0')} ${stationName(st.type)}`, 'station', local(mid, 3.2));
    floorArrow(root, M(st.entry), -1, '#7ee081');
    floorArrow(root, M(st.exit), 1, '#ffffff');
    const outline = new THREE.Group();
    ribbon(outline, [...rectPts(b), rectPts(b)[0]], 0.8, C.route, 0.15, true);
    outline.visible = false;
    root.add(outline);
    stationViz.set(st.n, { floor, outline, el: lbl.element });
  }

  // --- gates: IN / OUT arches, finish ---
  for (const [name, at] of [['IN', venue.roxzone.in], ['OUT', venue.roxzone.out]]) {
    const p = M(at);
    arch(root, p, 5, 4.2, C.yellow);
    label(name, 'gate', local(p, 5.2));
  }
  const fl = venue.finish.line;
  if (fl) {
    const fm = new THREE.Mesh(new THREE.PlaneGeometry(fl.length * k, fl.width * k), mat(C.yellow));
    fm.rotation.x = -Math.PI / 2;
    fm.rotation.z = THREE.MathUtils.degToRad(fl.angleDeg);
    fm.position.copy(local(M(fl.center), 0.06));
    root.add(fm);
    const g = arch(root, M(fl.center), fl.length * k * 0.7, 5, '#111111');
    g.rotation.y = THREE.MathUtils.degToRad(fl.angleDeg);
    g.userData.look = 'model';
    label('FINISH', 'gate', local(M(fl.center), 6.2));
  }

  // --- points of interest ---
  const pois = new THREE.Group();
  root.add(pois);
  for (const p of venue.pois || []) {
    const at = M(p.at);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4), mat(C.metal));
    pole.position.copy(local(at, 1.2));
    pois.add(pole);
    label(POI_ICON[p.kind] || p.kind, `poi poi-${p.kind}`, local(at, 2.9));
  }

  // --- spectator photo spots: camera pin + translucent view wedge towards what you'd shoot ---
  const spotPins = new THREE.Group();
  root.add(spotPins);
  const spotWedges = new THREE.Group();
  root.add(spotWedges);
  const spotMat = new THREE.MeshBasicMaterial({ color: '#e5007d', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  for (const s of venue.photoSpots || []) {
    const at = M(s.at), look = M(s.look);
    const h = s.height || 1.6;
    const d = Math.min(G.dist(at, look), 22), a = Math.atan2(look[1] - at[1], look[0] - at[0]), half = 0.35;
    const tip = local(at, h), l = local([at[0] + Math.cos(a + half) * d, at[1] + Math.sin(a + half) * d], 0.2),
      r = local([at[0] + Math.cos(a - half) * d, at[1] + Math.sin(a - half) * d], 0.2);
    const geo = new THREE.BufferGeometry().setFromPoints([tip, l, r]);
    const wedge = new THREE.Mesh(geo, spotMat);
    wedge.renderOrder = 4;
    spotWedges.add(wedge);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, h), mat('#e5007d'));
    pin.position.copy(local(at, h / 2));
    spotPins.add(pin);
    label('📷', 'spot', local(at, h + 1.2));
  }

  // --- route lines ---
  const routeAll = new THREE.Group();
  for (const s of race.segments) {
    if (s.kind === 'run' || s.points.length < 2) continue;
    ribbon(routeAll, s.points, 0.45, C.routeAll, 0.09, false, { transparent: true, opacity: 0.7 });
  }
  root.add(routeAll);

  const active = new THREE.Group();
  root.add(active);
  const markers = new THREE.Group();
  root.add(markers);

  // Highlight the station a leg belongs to (its run, Roxzone walks and the station itself).
  function highlightStation(n) {
    for (const [sn, v] of stationViz) {
      const on = sn === n;
      v.outline.visible = on;
      v.floor.material.color.set(v.floor.material.userData[on ? 'highlight' : 'base']);
      v.el.classList.toggle('active', on);
    }
  }

  function setActive(seg) {
    highlightStation(seg.group);
    active.clear();
    markers.clear();
    if (seg.points.length > 1) {
      ribbon(active, seg.points, 1.3, C.route, 0.11, false);
      chevrons(active, seg.points, 5, 0.6, C.white, 0.13, 1);
    }
    for (const w of seg.waypoints || []) {
      if (!w.name) continue;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.3, 20), mat(C.route));
      m.position.copy(local(w.at, 0.2));
      markers.add(m);
    }
  }

  const layers = { walls, pois, spots: spotPins, route: routeAll };
  return { root, center, toWorld, overlay, labels, setActive, layers, spotWedges, hallSize: [hb.maxX - hb.minX, hb.maxY - hb.minY] };
}

// ---------- helpers ----------


function toLocalOnLoop(loop, frac, local) {
  return local(G.pointAt(loop, G.length(loop) * frac).p, 0.6);
}

function stationName(type) {
  return { skierg: 'SKI ERG', sledpush: 'SLED PUSH', sledpull: 'SLED PULL', burpees: 'BURPEE BROAD JUMPS',
    row: 'ROWING', farmers: 'FARMERS CARRY', lunges: 'SANDBAG LUNGES', wallballs: 'WALL BALLS' }[type];
}

/** Flat strip of constant width along a polyline. */
function ribbon(parent, pts, width, color, h, closed, matOpts = {}) {
  const n = pts.length;
  const pos = [];
  const uv = []; // metres: u along the strip, v across it (lets textures tile at real size)
  let s = 0;
  const idx = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[i - 1] || (closed ? pts[n - 2] : pts[i]);
    const next = pts[i + 1] || (closed ? pts[1] : pts[i]);
    let tx = next[0] - prev[0], ty = next[1] - prev[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    pos.push(pts[i][0] + nx * width / 2, h, -(pts[i][1] + ny * width / 2));
    pos.push(pts[i][0] - nx * width / 2, h, -(pts[i][1] - ny * width / 2));
    if (i > 0) s += G.dist(pts[i - 1], pts[i]);
    uv.push(s, 0, s, width);
    if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, ...matOpts }));
  parent.add(m);
  return m;
}

function ribbonEdges(parent, pts, width, h) {
  for (const sgn of [1, -1]) {
    const edge = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const l = G.dist(a, b) || 1;
      return [p[0] - (b[1] - a[1]) / l * sgn * width / 2, p[1] + (b[0] - a[0]) / l * sgn * width / 2];
    });
    ribbon(parent, edge, 0.15, '#f2f2f2', h, false);
  }
}

/** Flat arrow heads every `spacing` metres pointing along the polyline. */
function chevrons(parent, pts, spacing, size, color, h, opacity) {
  const total = G.length(pts);
  const pos = [];
  for (let d = spacing / 2; d < total; d += spacing) {
    const { p, dir } = G.pointAt(pts, d);
    const nx = -dir[1], ny = dir[0];
    const tip = [p[0] + dir[0] * size, p[1] + dir[1] * size];
    const l = [p[0] - dir[0] * size * 0.4 + nx * size * 0.7, p[1] - dir[1] * size * 0.4 + ny * size * 0.7];
    const r = [p[0] - dir[0] * size * 0.4 - nx * size * 0.7, p[1] - dir[1] * size * 0.4 - ny * size * 0.7];
    for (const q of [tip, l, r]) pos.push(q[0], h, -q[1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  parent.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: opacity < 1, opacity })));
}

/** Arrow painted on the floor at a station mouth: dir -1 = pointing south (into station), 1 = north (out). */
function floorArrow(parent, p, dir, color) {
  const s = 1.1;
  const pts = [[0, dir * s], [-s * 0.7, -dir * s * 0.3], [s * 0.7, -dir * s * 0.3]];
  const shape = new THREE.Shape(pts.map(q => new THREE.Vector2(q[0], q[1])));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  m.position.set(p[0], 0.12, -(p[1] + dir * 1.5));
  parent.add(m);
}

function arch(parent, p, span, height, color) {
  const g = new THREE.Group();
  const m = mat(color);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, height, 0.35), m);
    post.position.set(s * span / 2, height / 2, 0);
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 0.35, 0.7, 0.35), m);
  beam.position.set(0, height, 0);
  g.add(beam);
  g.position.set(p[0], 0, -p[1]);
  parent.add(g);
  return g;
}

function startTunnel(parent, b) {
  const len = b.maxX - b.minX, w = b.maxY - b.minY;
  const m = mat('#1d2a5a', { transparent: true, opacity: 0.75 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, w), m);
  roof.position.set((b.minX + b.maxX) / 2, 3.2, -(b.minY + b.maxY) / 2);
  parent.add(roof);
  for (const y of [b.minY, b.maxY]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(len, 3.2, 0.2), m);
    side.position.set((b.minX + b.maxX) / 2, 1.6, -y);
    parent.add(side);
  }
}

/** Stepped seating; facing = +1 faces east (+x), -1 faces west. */
function grandstand(parent, b, facing) {
  const steps = 6, depth = (b.maxX - b.minX) / steps, len = b.maxY - b.minY;
  for (let i = 0; i < steps; i++) {
    const h = 0.6 * (i + 1);
    const x = facing > 0 ? b.maxX - depth * (i + 0.5) : b.minX + depth * (i + 0.5);
    const m = new THREE.Mesh(new THREE.BoxGeometry(depth, h, len), mat(i % 2 ? '#aab2bc' : '#bcc3cb'));
    m.position.set(x, h / 2, -(b.minY + b.maxY) / 2);
    parent.add(m);
  }
}

function hatchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffffff';
  g.lineWidth = 6;
  for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 64, 0); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}

/** Simplified equipment so each station reads at a glance. Positions are indicative, not surveyed. */
function equipment(root, type, b, local, box) {
  const W = b.maxX - b.minX, H = b.maxY - b.minY, cx = (b.minX + b.maxX) / 2;
  const dark = C.equipment, yellow = C.yellow;
  const along = (spacing, margin, fn) => { for (let y = b.maxY - margin; y > b.minY + margin; y -= spacing) fn(y); };
  const lane = (x0, y0, x1, y1) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    box(len, 0.02, 0.12, '#e8e8e8', [(x0 + x1) / 2, (y0 + y1) / 2], 0.04, Math.atan2(y1 - y0, x1 - x0));
  };
  switch (type) {
    case 'skierg':
    case 'row':
      for (const fx of [0.28, 0.72]) {
        along(type === 'row' ? 2.4 : 2.6, 4, y => {
          const x = b.minX + W * fx;
          if (type === 'skierg') {
            box(0.6, 0.12, 1.1, dark, [x, y], 0.03);
            box(0.3, 2.3, 0.25, dark, [x, y + 0.3], 0.03);
            box(0.5, 0.08, 0.08, yellow, [x, y + 0.3], 2.3);
          } else {
            box(2.4, 0.3, 0.5, dark, [x, y], 0.03);
            box(0.5, 0.9, 0.5, dark, [x - (fx < 0.5 ? -1 : 1) * 1.1, y], 0.03);
          }
        });
      }
      break;
    case 'sledpush':
    case 'sledpull': {
      const laneLen = 12.5, x0 = type === 'sledpush' ? b.minX + 2 : b.maxX - 2 - laneLen;
      along(3.6, 3, y => {
        lane(x0, y - 1.8, x0 + laneLen, y - 1.8);
        const sx = type === 'sledpush' ? x0 + 0.8 : x0 + laneLen - 0.8;
        box(1.2, 0.35, 1.1, dark, [sx, y], 0.03);
        box(0.08, 1.2, 0.08, C.metal, [sx - 0.4, y + 0.4], 0.38);
        box(0.08, 1.2, 0.08, C.metal, [sx - 0.4, y - 0.4], 0.38);
        if (type === 'sledpull') box(laneLen - 2, 0.04, 0.04, '#d9c08c', [x0 + laneLen / 2, y], 0.15);
      });
      break;
    }
    case 'burpees':
    case 'lunges':
    case 'farmers':
      lane(cx, b.minY + 2, cx, b.maxY - 2);
      if (type === 'farmers') {
        for (let i = 0; i < 6; i++) for (const s of [-0.35, 0.35]) {
          const kb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshStandardMaterial({ color: dark }));
          kb.position.copy(local([b.minX + 1 + i * (W - 2) / 5, b.maxY - 3 + s], 0.2));
          root.add(kb);
        }
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 16), new THREE.MeshStandardMaterial({ color: '#ff8a00' }));
        cone.position.copy(local([cx, b.minY + 3.2], 0.45));
        root.add(cone);
      }
      if (type === 'lunges') for (let i = 0; i < 5; i++) box(0.9, 0.25, 0.35, '#5b5148', [b.minX + 1.2 + i * (W - 2.4) / 4, b.maxY - 3], 0.03);
      break;
    case 'wallballs':
      for (const x of [b.minX + 0.4, b.maxX - 0.4]) {
        // open rig: posts + top beam, so spectators can see through it
        along(3, 2.5, y => box(0.12, 3.4, 0.12, '#2f3237', [x, y - 1.5], 0.03));
        box(0.15, 0.15, H - 5, '#2f3237', [x, (b.minY + b.maxY) / 2], 3.4);
        along(3, 4, y => box(0.35, 0.5, 0.5, yellow, [x, y], 2.7));
        along(3, 4, y => {
          const ball = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshStandardMaterial({ color: '#c62828' }));
          ball.position.copy(local([x + (x < cx ? 1.2 : -1.2), y], 0.18));
          root.add(ball);
        });
      }
      break;
  }
}
