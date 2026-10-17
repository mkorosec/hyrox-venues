// Renderer, cameras (bird's eye / follow / POV) and the runner avatar.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

export function createViewer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'labels';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e9edf1');
  const hemi = new THREE.HemisphereLight('#ffffff', '#8f9aa6', 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 1.6);
  sun.position.set(-60, 140, 80);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 3000);
  camera.position.set(0, 170, 140);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 8;
  controls.maxDistance = 600;

  // Runner avatar
  const runner = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.0, 6, 12), new THREE.MeshStandardMaterial({ color: '#e5322d' }));
  body.position.y = 0.9;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshStandardMaterial({ color: '#f1c7a5' }));
  head.position.y = 1.72;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 32), new THREE.MeshBasicMaterial({ color: '#e5322d', side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  runner.add(body, head, ring);
  scene.add(runner);

  let mode = 'overview';
  let fly = null; // { pos, target } camera animation for bird's eye framing
  const heading = new THREE.Vector3(0, 0, -1);
  const look = { yaw: 0, pitch: 0 };
  controls.addEventListener('start', () => { fly = null; });

  // Drag to look around in POV / follow modes.
  let drag = null;
  renderer.domElement.addEventListener('pointerdown', e => { if (mode !== 'overview') drag = [e.clientX, e.clientY]; });
  window.addEventListener('pointerup', () => { drag = null; });
  window.addEventListener('pointermove', e => {
    if (!drag) return;
    look.yaw -= (e.clientX - drag[0]) * 0.005;
    look.pitch = THREE.MathUtils.clamp(look.pitch - (e.clientY - drag[1]) * 0.004, -0.9, 0.6);
    drag = [e.clientX, e.clientY];
  });

  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  function setMode(m) {
    mode = m;
    controls.enabled = m === 'overview';
    runner.visible = m !== 'pov';
    look.yaw = look.pitch = 0;
    if (m === 'overview') {
      const p = runner.position;
      fly = { pos: new THREE.Vector3(p.x, 70, p.z + 60), target: p.clone() };
    }
  }

  /** Frame a set of world points from above (bird's eye mode only). */
  function frame(points) {
    if (mode !== 'overview' || !points.length) return;
    const box = new THREE.Box3().setFromPoints(points);
    const c = box.getCenter(new THREE.Vector3());
    const size = Math.max(25, box.getSize(new THREE.Vector3()).length());
    fly = { pos: new THREE.Vector3(c.x, size * 0.75 + 15, c.z + size * 0.55 + 15), target: c };
  }

  /** Bird's eye camera placed at `pos`, aimed at `target` (orbiting then pivots around the target). */
  function lookFrom(pos, target) {
    fly = { pos, target };
  }

  function setRunner(pos, dir) {
    runner.position.copy(pos);
    if (dir) heading.lerp(dir, 0.15).normalize();
    runner.rotation.y = Math.atan2(-heading.x, -heading.z);
  }

  const lookDir = () => heading.clone()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), look.yaw)
    .add(new THREE.Vector3(0, Math.tan(look.pitch), 0));

  function update(dt) {
    const a = 1 - Math.exp(-dt * 4);
    const p = runner.position;
    if (mode === 'overview') {
      if (fly) {
        camera.position.lerp(fly.pos, a);
        controls.target.lerp(fly.target, a);
        if (camera.position.distanceTo(fly.pos) < 0.5) fly = null;
      }
      controls.update();
    } else if (mode === 'follow') {
      const d = lookDir();
      const want = p.clone().addScaledVector(d, -11).add(new THREE.Vector3(0, 7, 0));
      camera.position.lerp(want, a);
      camera.lookAt(p.clone().addScaledVector(d, 6));
    } else {
      camera.position.copy(p).add(new THREE.Vector3(0, 1.7, 0));
      camera.lookAt(camera.position.clone().addScaledVector(lookDir(), 10).add(new THREE.Vector3(0, -0.4, 0)));
    }
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  return { scene, camera, controls, renderer, lights: { hemi, sun }, setMode, frame, lookFrom, setRunner, update, get mode() { return mode; } };
}
