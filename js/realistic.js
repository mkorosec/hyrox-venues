// "Realistic" look: same geometry as the model, dressed the way HYROX halls look in race photos.
// Dark carpet and rubber floors, black barriers with crowds behind them, a steel roof with LED strips,
// soft shadows and other athletes on course. Textures are CC0 (see tools/fetch-textures.sh).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as G from './geometry.js';

const TEX = 'assets/textures/';
const ATHLETE_ZONES = ['warmup', 'relay', 'bagdrop', 'finish', 'lane', 'recovery', 'tunnel'];
const NO_CROWD_ZONES = ['grandstand', 'sponsor', 'store', 'stage', 'crossing', 'building', 'registration', 'checkin'];
const CLOTHES = ['#1b1c1f', '#24262b', '#2f3540', '#3b3f46', '#f2f2f2', '#c8ccd2', '#2d4a7a', '#7a2d2d', '#3e6b48', '#d9b400', '#8a4f9e', '#d96a2b'];
const SKIN = ['#f1c7a5', '#e0ac85', '#c68b63', '#8d5a3b', '#5c3a26'];
const KIT = ['#111111', '#111111', '#f5f5f5', '#e5322d', '#ffd400', '#1e88e5', '#00c389'];

export function createRealisticLook(venue, race, model, viewer) {
  const { M, k, loop } = race;
  const rnd = mulberry32(17); // deterministic crowd: same venue looks the same on every load
  const pick = a => a[Math.floor(rnd() * a.length)];
  const local = (p, h = 0) => new THREE.Vector3(p[0], h, -p[1]);
  const rectM = r => G.bbox([M([r[0], r[1]]), M([r[2], r[3]])]);
  const hallM = venue.hall.outline.map(M);
  const hb = G.bbox(hallM);
  const wh = venue.hall.wallHeight || 12;

  const extras = new THREE.Group();
  extras.userData.look = 'real';
  extras.visible = false;
  model.root.add(extras);

  // ---------- materials ----------
  const loader = new THREE.TextureLoader();
  const tex = (name, tile, srgb) => {
    const t = loader.load(TEX + name);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / tile, 1 / tile);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const pbr = (name, tile, opts) => new THREE.MeshStandardMaterial({
    map: tex(`${name}_color.jpg`, tile, true), normalMap: tex(`${name}_normal.jpg`, tile), ...opts,
  });
  const MATS = {
    concrete: pbr('concrete', 6, { roughness: 0.65 }),
    carpet: pbr('carpet', 2, { roughness: 1, normalScale: new THREE.Vector2(0.5, 0.5) }),
    rubber: pbr('rubber', 2.4, { roughness: 0.8 }),
    ground: new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 1 }),
  };
  const swaps = [];
  model.root.traverse(o => {
    if (!o.isMesh || !o.userData.role) return;
    const real = MATS[o.userData.role].clone(); // per mesh, so a highlighted station floor tints alone
    real.side = THREE.DoubleSide;
    real.userData = { base: '#ffffff', highlight: '#8fb8ff' };
    swaps.push({ mesh: o, model: o.material, real });
  });

  // ---------- athlete-area test (decides where barriers go and which side the crowd stands on) ----------
  const W = venue.runCourse.width * k, CW = venue.roxzone.corridorWidth * k;
  const zonePolys = (kinds) => (venue.zones || []).filter(z => kinds.includes(z.kind))
    .map(z => z.rect ? rectPolyM(rectM(z.rect)) : z.poly.map(M));
  const athletePolys = [...venue.stations.map(s => rectPolyM(rectM(s.area))), ...zonePolys(ATHLETE_ZONES)];
  const noCrowd = zonePolys(NO_CROWD_ZONES);
  const photoSpots = (venue.photoSpots || []).map(s => M(s.at)); // keep a clear view at the suggested photo spots
  const inHall = p => p[0] > hb.minX + 0.3 && p[0] < hb.maxX - 0.3 && p[1] > hb.minY + 0.3 && p[1] < hb.maxY - 0.3;
  const athlete = p =>
    !inHall(p) ||
    Math.sqrt(G.project(loop, p).d2) < W / 2 + 0.15 ||
    Math.sqrt(G.project(race.corridor, p).d2) < CW / 2 + 0.15 ||
    athletePolys.some(poly => inPoly(p, poly));

  // ---------- barriers: black banners along the edges between athlete and spectator areas ----------
  const barrierLines = [
    offset(loop, W / 2 + 0.25), offset(loop, -(W / 2 + 0.25)),
    offset(race.corridor, -(CW / 2 + 0.2)),
    ...venue.stations.map(s => { const b = rectM(s.area); return [[b.maxX + 0.25, b.maxY], [b.maxX + 0.25, b.minY - 0.25], [b.minX - 0.25, b.minY - 0.25], [b.minX - 0.25, b.maxY]]; }),
    ...zonePolys(['finish']).map(p => [...p, p[0]]),
  ];
  const gates = [venue.roxzone.in, venue.roxzone.out].map(M);
  const crossings = zonePolys(['crossing']);
  const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTexture(), roughness: 0.9 });
  const spectatorSpots = [];
  const posts = [];
  for (const line of barrierLines) {
    let run = [];
    const flush = () => { if (run.length > 2) extras.add(verticalStrip(run, 0.04, 1.1, bannerMat)); run = []; };
    const L = G.length(line);
    for (let s = 0; s <= L; s += 0.5) {
      const { p, dir } = G.pointAt(line, s);
      const n = [-dir[1], dir[0]];
      const a = athlete([p[0] + n[0], p[1] + n[1]]), b = athlete([p[0] - n[0], p[1] - n[1]]);
      const blocked = a === b || gates.some(g => G.dist(g, p) < 3.2) || crossings.some(c => inPoly(p, grow(c, 0.6)));
      if (blocked) { flush(); continue; }
      run.push(p);
      if (Math.round(s * 2) % 5 === 0) posts.push(p);
      const side = a ? [-n[0], -n[1]] : n; // spectators stand on the non-athlete side
      spectatorSpots.push({ p, side, along: dir });
    }
    flush();
  }
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 1.15, 0.06), new THREE.MeshStandardMaterial({ color: '#111' }), posts.length);
  posts.forEach((p, i) => postMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p[0], 0.575, -p[1])));
  extras.add(postMesh);

  // ---------- crowd: rows behind the barriers + seated on the grandstands ----------
  const people = [];
  const taken = new Set();
  const free = p => {
    const key = `${Math.round(p[0] / 0.5)},${Math.round(p[1] / 0.5)}`;
    if (taken.has(key)) return false;
    taken.add(key);
    return true;
  };
  for (const { p, side, along } of spectatorSpots) {
    [0.8, 0.45, 0.2].forEach((chance, row) => {
      if (rnd() > chance) return;
      const d = 0.45 + row * 0.6 + rnd() * 0.15, j = (rnd() - 0.5) * 0.3;
      const q = [p[0] + side[0] * d + along[0] * j, p[1] + side[1] * d + along[1] * j];
      if (athlete(q) || noCrowd.some(z => inPoly(q, z)) || photoSpots.some(s => G.dist(s, q) < 2.2) || !free(q)) return;
      people.push({ p: q, h: 0, face: Math.atan2(-side[0], side[1]) + (rnd() - 0.5) * 0.8, seated: false });
    });
  }
  for (const z of (venue.zones || []).filter(z => z.kind === 'grandstand')) {
    const b = rectM(z.rect), steps = 6, depth = (b.maxX - b.minX) / steps, east = z.facing !== 'west';
    for (let i = 0; i < steps; i++) {
      const x = east ? b.maxX - depth * (i + 0.5) : b.minX + depth * (i + 0.5);
      for (let y = b.minY + 0.4; y < b.maxY - 0.3; y += 0.55) {
        if (rnd() < 0.72 && !photoSpots.some(s => G.dist(s, [x, y]) < 2.2)) people.push({ p: [x, y], h: 0.6 * (i + 1), face: east ? Math.PI / 2 : -Math.PI / 2, seated: true });
      }
    }
  }
  const crowd = personMeshes(people.length, 0.95);
  people.forEach((o, i) => crowd.place(i, o.p, o.h, o.face, o.seated ? 0.62 : 0.9 + rnd() * 0.18, pick(CLOTHES), pick(SKIN)));
  crowd.done();
  extras.add(crowd.group);

  // ---------- other athletes: running the course and working at stations ----------
  const L = G.length(loop);
  const runners = Array.from({ length: 44 }, () => ({ s: rnd() * L, v: 3.1 + rnd() * 1.6, off: (rnd() - 0.5) * (W - 1.4) }));
  const field = personMeshes(runners.length, 1);
  runners.forEach((r, i) => field.color(i, pick(KIT), pick(SKIN)));
  extras.add(field.group);
  const stationAthletes = [];
  for (const s of venue.stations) {
    const b = rectM(s.area);
    for (let i = 0; i < 5; i++) stationAthletes.push([b.minX + 1 + rnd() * (b.maxX - b.minX - 2), b.minY + 2 + rnd() * (b.maxY - b.minY - 4)]);
  }
  const working = personMeshes(stationAthletes.length, 1);
  stationAthletes.forEach((p, i) => working.place(i, p, 0, rnd() * Math.PI * 2, 0.95, pick(KIT), pick(SKIN)));
  working.done();
  extras.add(working.group);

  // ---------- hall shell: opaque inward-facing walls, roof space frame, LED strips ----------
  const realWalls = new THREE.Group();
  realWalls.userData.look = 'real';
  realWalls.visible = false;
  const wallMat = new THREE.MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.95 });
  const skirtMat = new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.9 });
  const cx = (hb.minX + hb.maxX) / 2, cy = (hb.minY + hb.maxY) / 2;
  hallM.forEach((a, i) => {
    const b = hallM[(i + 1) % hallM.length];
    const len = G.dist(a, b), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let n = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    if (n[0] * (cx - mid[0]) + n[1] * (cy - mid[1]) < 0) n = [-n[0], -n[1]]; // point inwards
    for (const [h0, h1, m, inset] of [[0, wh, wallMat, 0], [0, 3, skirtMat, 0.05]]) {
      // single-sided planes facing in: from outside (bird's eye) the near wall disappears like a doll's house
      const w = new THREE.Mesh(new THREE.PlaneGeometry(len, h1 - h0), m);
      w.position.copy(local([mid[0] + n[0] * inset, mid[1] + n[1] * inset], (h0 + h1) / 2));
      w.rotation.y = Math.atan2(n[0], -n[1]);
      realWalls.add(w);
    }
  });
  model.layers.walls.add(realWalls);

  const roof = new THREE.Group();
  const beamMat = new THREE.MeshStandardMaterial({ color: '#30333a', roughness: 0.6, metalness: 0.6 });
  for (let x = hb.minX + 6; x < hb.maxX; x += 6) roof.add(boxAt(0.25, 0.6, hb.maxY - hb.minY, [x, cy], wh, beamMat));
  for (let y = hb.minY + 6; y < hb.maxY; y += 6) roof.add(boxAt(hb.maxX - hb.minX, 0.6, 0.25, [cx, y], wh - 0.6, beamMat));
  const ledSpots = [];
  for (let x = hb.minX + 6; x < hb.maxX - 3; x += 6) for (let y = hb.minY + 3; y < hb.maxY; y += 6) ledSpots.push([x + 3, y]);
  const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 0.08, 0.18),
    new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f4f7ff', emissiveIntensity: 2.2 }), ledSpots.length);
  ledSpots.forEach((p, i) => leds.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p[0], wh - 1, -p[1])));
  roof.add(leds);
  extras.add(roof);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(hb.maxX - hb.minX, hb.maxY - hb.minY),
    new THREE.MeshStandardMaterial({ color: '#1d1f23', roughness: 1 }));
  ceiling.rotation.x = Math.PI / 2; // faces down: culled (invisible) when looking from above
  ceiling.position.copy(local([cx, cy], wh + 0.8));
  extras.add(ceiling);

  // ---------- start arch, finish gantry, flags ----------
  const startAt = M(venue.start.path[Math.max(0, venue.start.path.length - 2)]);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.55, 12, 32, Math.PI), new THREE.MeshStandardMaterial({ color: '#1d2a5a', roughness: 0.5 }));
  arch.position.copy(local(startAt, 0));
  arch.rotation.y = Math.PI / 2;
  extras.add(arch);

  const fl = venue.finish.line;
  if (fl) {
    const g = new THREE.Group();
    const black = new THREE.MeshStandardMaterial({ color: '#0d0d0f', roughness: 0.5 });
    const led = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffffff', emissiveIntensity: 1.5 });
    const span = fl.length * k * 0.8;
    for (const s of [-1, 1]) {
      g.add(boxAt(1.3, 5.6, 1.3, [s * span / 2, 0], 0, black));
      for (let i = 0; i < 3; i++) {
        const slash = boxAt(0.9, 0.16, 0.02, [s * span / 2, -0.66], 2 + i * 0.7, led);
        slash.rotation.z = 0.35;
        g.add(slash);
      }
    }
    g.add(boxAt(span + 1.3, 1.2, 1.3, [0, 0], 5.6, black));
    g.position.copy(local(M(fl.center), 0));
    g.rotation.y = THREE.MathUtils.degToRad(fl.angleDeg);
    extras.add(g);
  }

  const flagMat = new THREE.MeshStandardMaterial({ map: flagTexture(), roughness: 0.8, side: THREE.DoubleSide });
  const finishPoly = zonePolys(['finish'])[0] || [];
  for (const p of [...finishPoly.slice(1, 4).map(q => [q[0], q[1]]), M([790, 310]), M([890, 300]), M([705, 540]), M([200, 545])]) {
    extras.add(boxAt(0.06, 4.6, 0.06, p, 0, new THREE.MeshStandardMaterial({ color: '#222' })));
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 3), flagMat);
    f.position.copy(local([p[0] + 0.42, p[1]], 3));
    extras.add(f);
  }

  // ---------- lighting / renderer ----------
  const { renderer, lights, scene } = viewer;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const saved = {
    bg: scene.background.clone(), tone: renderer.toneMapping, exposure: renderer.toneMappingExposure,
    hemi: lights.hemi.intensity, sun: lights.sun.intensity, sunColor: lights.sun.color.clone(),
  };
  const sun = lights.sun;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 75, bottom: -75, near: 10, far: 400 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;

  let enabled = false;
  function setEnabled(on) {
    enabled = on;
    for (const s of swaps) s.mesh.material = on ? s.real : s.model;
    model.root.traverse(o => {
      if (o.userData.look === 'model') o.visible = !on;
      if (o.userData.look === 'real') o.visible = on;
      if (o.isMesh || o.isInstancedMesh) {
        o.castShadow = on && !o.userData.role;
        o.receiveShadow = on;
      }
    });
    renderer.shadowMap.enabled = on;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sun.castShadow = on;
    renderer.toneMapping = on ? THREE.ACESFilmicToneMapping : saved.tone;
    renderer.toneMappingExposure = on ? 1.05 : saved.exposure;
    scene.environment = on ? env : null;
    scene.background = on ? new THREE.Color('#1f2125') : saved.bg;
    lights.hemi.intensity = on ? 0.45 : saved.hemi;
    sun.intensity = on ? 1.5 : saved.sun;
    sun.color.copy(on ? new THREE.Color('#eef2ff') : saved.sunColor);
    renderer.shadowMap.needsUpdate = true;
  }

  function update(camera, dt) {
    if (!enabled) return;
    roof.visible = camera.position.y < wh - 0.5; // the roof would only hide the race from bird's eye
    const cam = model.root.worldToLocal(camera.position.clone());
    runners.forEach((r, i) => {
      r.s = (r.s + r.v * dt) % L;
      const { p, dir } = G.pointAt(loop, r.s);
      const q = [p[0] - dir[1] * r.off, p[1] + dir[0] * r.off];
      const tooClose = Math.hypot(q[0] - cam.x, q[1] + cam.z) < 2.5; // don't run through the POV camera
      field.place(i, q, 0, 0, tooClose ? 0 : 1);
    });
    field.done();
  }

  return { setEnabled, update };
}

// ---------- helpers ----------

function rectPolyM(b) { return [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]]; }

function grow(poly, d) {
  const b = G.bbox(poly);
  return rectPolyM({ minX: b.minX - d, minY: b.minY - d, maxX: b.maxX + d, maxY: b.maxY + d });
}

function inPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Polyline shifted sideways by d (positive = to the left of the direction of travel). */
function offset(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const l = G.dist(a, b) || 1;
    return [p[0] - (b[1] - a[1]) / l * d, p[1] + (b[0] - a[0]) / l * d];
  });
}

function boxAt(w, h, d, p, elev, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(p[0], elev + h / 2, -p[1]);
  return m;
}

/** Vertical banner following a polyline; texture u runs in metres so the print repeats every 6 m. */
function verticalStrip(pts, h0, h1, material) {
  // Two single-sided faces (front + back) so the print reads correctly from both sides.
  const pos = [], uv = [], idx = [];
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    let s = 0;
    pts.forEach((p, i) => {
      if (i) s += G.dist(pts[i - 1], p);
      pos.push(p[0], h0, -p[1], p[0], h1, -p[1]);
      uv.push(side * s / 6, 0, side * s / 6, 1);
      if (i < pts.length - 1) {
        const a = base + i * 2;
        idx.push(...(side > 0 ? [a, a + 2, a + 1, a + 1, a + 2, a + 3] : [a, a + 1, a + 2, a + 1, a + 3, a + 2]));
      }
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

/** Instanced low-poly people: a body and a head mesh sharing transforms. */
function personMeshes(count, height) {
  const body = new THREE.InstancedMesh(personBody(),
    new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: true }), count);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 10, 8).translate(0, 1.62, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.7 }), count);
  const group = new THREE.Group();
  group.add(body, head);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const color = (i, c, s) => { body.setColorAt(i, new THREE.Color(c)); head.setColorAt(i, new THREE.Color(s)); };
  return {
    group,
    color,
    place(i, p, h, rot, scale, c, s) {
      q.setFromAxisAngle(up, rot);
      m.compose(new THREE.Vector3(p[0], h, -p[1]), q, new THREE.Vector3(1, scale * height, 1));
      body.setMatrixAt(i, m);
      head.setMatrixAt(i, m);
      if (c) color(i, c, s);
    },
    done() {
      for (const x of [body, head]) {
        x.instanceMatrix.needsUpdate = true;
        if (x.instanceColor) x.instanceColor.needsUpdate = true;
        x.computeBoundingSphere();
      }
    },
  };
}

function bannerTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0c0e';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#f2f2f2';
  g.font = '700 54px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.letterSpacing = '18px';
  g.fillText('FITNESS RACING', c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function flagTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0c0e';
  g.fillRect(0, 0, 128, 512);
  g.fillStyle = '#ffd400';
  g.fillRect(0, 0, 128, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lathe-turned silhouette (legs, hips, torso, shoulders, neck); legs are shaded darker than the top. */
function personBody() {
  const profile = [[0.001, 0], [0.09, 0.02], [0.11, 0.45], [0.14, 0.85], [0.15, 0.95], [0.16, 1.15], [0.2, 1.38], [0.17, 1.45], [0.06, 1.5], [0.001, 1.52]];
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 9);
  const pos = geo.attributes.position, colors = [];
  for (let i = 0; i < pos.count; i++) {
    const legs = pos.getY(i) < 0.9;
    colors.push(...(legs ? [0.32, 0.33, 0.36] : [1, 1, 1]));
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}
