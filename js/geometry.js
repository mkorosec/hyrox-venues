// Pure 2D polyline helpers. Points are [x, y] in metres, y pointing "map up".
// No DOM / three.js here so the validator can run it under Node.

export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function length(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

/** Point and unit direction at arc length d along an open polyline. */
export function pointAt(pts, d) {
  if (pts.length === 1) return { p: pts[0], dir: [0, 1] };
  let acc = 0;
  let lastDir = [0, 1];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = dist(a, b);
    if (seg === 0) continue;
    lastDir = [(b[0] - a[0]) / seg, (b[1] - a[1]) / seg];
    if (acc + seg >= d) {
      const t = Math.max(0, (d - acc) / seg);
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dir: lastDir };
    }
    acc += seg;
  }
  return { p: pts[pts.length - 1], dir: lastDir };
}

/** Closest point on a polyline: { s (arc length), p }. */
export function project(pts, q) {
  let best = { s: 0, p: pts[0], d2: Infinity };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const seg2 = dx * dx + dy * dy;
    const t = seg2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / seg2)) : 0;
    const p = [a[0] + dx * t, a[1] + dy * t];
    const d2 = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
    if (d2 < best.d2) best = { s: acc + Math.sqrt(seg2) * t, p, d2 };
    acc += Math.sqrt(seg2);
  }
  return best;
}

/** Sub-polyline between arc lengths s0 and s1 (reversed if s1 < s0). */
export function slice(pts, s0, s1) {
  if (s1 < s0) return slice(pts, s1, s0).reverse();
  const out = [pointAt(pts, s0).p];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += dist(pts[i - 1], pts[i]);
    if (acc > s0 && acc < s1) out.push(pts[i]);
  }
  out.push(pointAt(pts, s1).p);
  return out;
}

/**
 * Walk `distance` metres forward along a closed loop (last point == first) starting at arc length s0.
 * Wraps around as many times as needed.
 */
export function loopWalk(loop, s0, distance) {
  const cum = [0];
  for (let i = 1; i < loop.length; i++) cum.push(cum[i - 1] + dist(loop[i - 1], loop[i]));
  const L = cum[cum.length - 1];
  const out = [pointAt(loop, s0).p];
  let s = s0, remaining = distance;
  while (remaining > 1e-9) {
    const j = cum.findIndex(c => c > s + 1e-9);
    const step = cum[j] - s;
    if (step >= remaining) {
      out.push(pointAt(loop, s + remaining).p);
      break;
    }
    out.push(loop[j]);
    remaining -= step;
    s = cum[j] >= L - 1e-9 ? 0 : cum[j];
  }
  return out;
}

/**
 * Round the corners of a polygon. Each corner is [x, y, radius]; radius 0 keeps a sharp corner.
 * Returns a closed polyline (last point repeats the first) when closed is true.
 */
export function fillet(corners, closed = true, samples = 8) {
  const n = corners.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = corners[i];
    const r = c[2] || 0;
    const hasPrev = closed || i > 0, hasNext = closed || i < n - 1;
    if (!r || !hasPrev || !hasNext) { out.push([c[0], c[1]]); continue; }
    const p = corners[(i - 1 + n) % n], q = corners[(i + 1) % n];
    const lp = dist(p, c), lq = dist(c, q);
    const t = Math.min(r, lp / 2, lq / 2);
    const a = [c[0] + (p[0] - c[0]) * t / lp, c[1] + (p[1] - c[1]) * t / lp];
    const b = [c[0] + (q[0] - c[0]) * t / lq, c[1] + (q[1] - c[1]) * t / lq];
    for (let k = 0; k <= samples; k++) {
      const u = k / samples, v = 1 - u;
      // quadratic Bezier a -> (control c) -> b
      out.push([v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1]]);
    }
  }
  if (closed) out.push(out[0]);
  return out;
}

export const mod = (a, n) => ((a % n) + n) % n;

/** Signed turn from heading h to heading a: > 0 left, < 0 right (y-up frame). */
export const turn = (h, a) => h[0] * a[1] - h[1] * a[0];

export function bbox(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
