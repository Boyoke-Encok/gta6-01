// Small pure helpers shared by every module. No imports, no side effects.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const TAU = Math.PI * 2;

// Shortest signed difference between two angles, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}
// Turn `from` toward `to` by at most `maxStep` radians.
export function turnToward(from, to, maxStep) {
  const d = angleDiff(from, to);
  return from + clamp(d, -maxStep, maxStep);
}
// Deterministic RNG (mulberry32) so ?seed= replays the same city.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rand = (rng, a, b) => a + rng() * (b - a);
export const randi = (rng, a, b) => Math.floor(rand(rng, a, b + 1));
export const choice = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const fmtMoney = (n) => '$' + Math.floor(n).toLocaleString('en-US');
export const fmtClock = (mins) => {
  const h = Math.floor(mins / 60) % 24;
  const m = Math.floor(mins % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
};
export const fmtTimer = (s) => {
  const v = Math.max(0, Math.ceil(s));
  return Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0');
};
// Circle vs axis-aligned box: push the circle out, return true on overlap.
export function circleVsBox(cx, cy, r, b) {
  const nx = clamp(cx, b.x, b.x + b.w);
  const ny = clamp(cy, b.y, b.y + b.h);
  const dx = cx - nx;
  const dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 === 0) return { x: 0, y: -r, depth: r };
  const d = Math.sqrt(d2);
  return { x: (dx / d) * (r - d), y: (dy / d) * (r - d), depth: r - d };
}
