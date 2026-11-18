// Azura Bay — small math + random helpers shared by every module.
// Written fresh for the gta6-01 round-3 entry. No dependencies.

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}
export function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function turnToward(angle, target, maxStep) {
  const d = angleDiff(angle, target);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

// Deterministic seeded RNG (mulberry32) so the city layout is identical every load.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function rand(rng, a, b) { return a + rng() * (b - a); }
export function randInt(rng, a, b) { return Math.floor(rand(rng, a, b + 1)); }
export function choice(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// Circle vs axis-aligned box: push the circle out, return corrected position.
export function resolveCircleBox(px, py, r, bx, by, bw, bh) {
  const cx = clamp(px, bx, bx + bw);
  const cy = clamp(py, by, by + bh);
  const dx = px - cx, dy = py - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: cx + (dx / d) * r, y: cy + (dy / d) * r };
  }
  // Center inside the box: push out along the smallest penetration axis.
  const left = px - bx, right = bx + bw - px, top = py - by, bot = by + bh - py;
  const m = Math.min(left, right, top, bot);
  if (m === left) return { x: bx - r, y: py };
  if (m === right) return { x: bx + bw + r, y: py };
  if (m === top) return { x: px, y: by - r };
  return { x: px, y: by + bh + r };
}

export function pointInBox(px, py, bx, by, bw, bh) {
  return px >= bx && px <= bx + bw && py >= by && py <= by + bh;
}

export function formatMoney(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}
export function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}
