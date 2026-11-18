// Solmar: a 3200x3200 city. Grid roads + ring road, districts, buildings,
// beach + sea to the south, harbor water to the east. Built from a seed so
// ?seed= replays the same layout. Pure data + queries; no rendering here.
import { clamp, mulberry32, rand, randi, choice } from './util.js';

export const WORLD = 3200;
export const ROAD_W = 90;
export const ROAD_V = [200, 700, 1300, 1900, 2500, 3000];
export const ROAD_H = [200, 700, 1300, 1900, 2500, 3000];

// Named spots the missions and the spawn point use. All sit on or beside roads.
export const PLACES = {
  spawn: { x: 700, y: 640, label: 'Safehouse' },
  safehouse: { x: 700, y: 640, label: 'Safehouse' },
  taxi: { x: 1300, y: 1240, label: 'Taxi stand' },
  dropoff: { x: 2500, y: 1900, label: 'Hotel drop-off' },
  goldcar: { x: 1900, y: 700, label: 'Gold coupe' },
  garage: { x: 700, y: 1900, label: 'Chop shop' },
  harbor: { x: 2900, y: 700, label: 'Harbor pier' },
  downtown: { x: 1300, y: 1900, label: 'Downtown office' },
  bank: { x: 1900, y: 1240, label: 'Solmar Bank' },
  stop1: { x: 2500, y: 700, label: 'Rooftop bar' },
  stop2: { x: 1300, y: 2500, label: 'Beach cafe' },
  stop3: { x: 2500, y: 2500, label: 'Boardwalk' },
  vault: { x: 1900, y: 1300, label: 'Vault' },
};

const PALETTES = {
  downtown: ['#8a7f8d', '#6f7d8c', '#9c8a7a', '#7a6f87', '#5f6f7a'],
  suburb: ['#c9a689', '#a8b8a0', '#b8a888', '#98a8b8', '#c0b090'],
  beach: ['#e8d8b0', '#f0e0c0', '#d8c8a8'],
  harbor: ['#7a8a99', '#8a7a6a', '#6a7a8a'],
};

// A road-graph node is an intersection {x, y}; adjacency is built once.
function buildGraph() {
  const nodes = new Map();
  const key = (x, y) => x + ',' + y;
  for (const x of ROAD_V) for (const y of ROAD_H) nodes.set(key(x, y), { x, y, next: [] });
  const link = (ax, ay, bx, by) => {
    const na = nodes.get(key(ax, ay));
    const nb = nodes.get(key(bx, by));
    na.next.push(nb);
    nb.next.push(na);
  };
  for (const y of ROAD_H) {
    const xs = [...ROAD_V].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) link(xs[i], y, xs[i + 1], y);
  }
  for (const x of ROAD_V) {
    const ys = [...ROAD_H].sort((a, b) => a - b);
    for (let i = 0; i < ys.length - 1; i++) link(x, ys[i], x, ys[i + 1]);
  }
  return nodes;
}
export const GRAPH = buildGraph();
export const NODES = [...GRAPH.values()];

export function randomNode(rng) {
  return NODES[Math.floor(rng() * NODES.length)];
}
export function nextNode(node, prev, rng) {
  const opts = node.next.filter((n) => n !== prev);
  return opts.length ? opts[Math.floor(rng() * opts.length)] : node.next[0];
}
// Closest point on any road centerline, plus which road it sits on.
export function nearestRoad(x, y) {
  let best = null;
  for (const rx of ROAD_V) {
    const py = clamp(y, 200, 3000);
    const d = Math.hypot(x - rx, y - py);
    if (!best || d < best.d) best = { x: rx, y: py, d, axis: 'v', at: rx };
  }
  for (const ry of ROAD_H) {
    const px = clamp(x, 200, 3000);
    const d = Math.hypot(x - px, y - ry);
    if (!best || d < best.d) best = { x: px, y: ry, d, axis: 'h', at: ry };
  }
  return best;
}
export function onRoad(x, y) {
  return nearestRoad(x, y).d <= ROAD_W / 2 + 4;
}
export function isWater(x, y) {
  if (y > 3100) return true; // southern sea
  if (x > 3080 && y > 300 && y < 1500) return true; // harbor basin
  return false;
}
export function isBeach(x, y) {
  return y >= 3000 && y <= 3100 && x >= 150 && x <= 3050;
}
export function districtAt(x, y) {
  if (isWater(x, y)) return 'sea';
  if (isBeach(x, y)) return 'beach';
  if (x > 2550 && y < 1500) return 'harbor';
  if (x >= 1000 && x <= 2200 && y >= 1000 && y <= 2200) return 'downtown';
  if (x < 1000 && y < 1000) return 'suburbs';
  if (y > 2550) return 'beachfront';
  return 'midtown';
}

// Buildings + containers + trees, generated from the seed. Blocks are the
// cells between roads; each block holds 0-4 boxes. Parks stay empty.
export function buildCity(seed) {
  const rng = mulberry32(seed);
  const buildings = [];
  const trees = [];
  const parks = new Set(['1,3', '3,1']);
  const edges = [200, 700, 1300, 1900, 2500, 3000];
  for (let bi = 0; bi < 5; bi++) {
    for (let bj = 0; bj < 5; bj++) {
      const x0 = edges[bi] + ROAD_W / 2 + 14;
      const x1 = edges[bi + 1] - ROAD_W / 2 - 14;
      const y0 = edges[bj] + ROAD_W / 2 + 14;
      const y1 = edges[bj + 1] - ROAD_W / 2 - 14;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      if (parks.has(bi + ',' + bj)) {
        for (let t = 0; t < 7; t++) trees.push({ x: rand(rng, x0 + 20, x1 - 20), y: rand(rng, y0 + 20, y1 - 20), r: rand(rng, 12, 20) });
        continue;
      }
      if (district === 'harbor') {
        for (let c = 0; c < 5; c++) {
          buildings.push({ x: rand(rng, x0, x1 - 90), y: rand(rng, y0, y1 - 40), w: rand(rng, 60, 110), h: rand(rng, 26, 40), hgt: 1, color: choice(rng, ['#b0503c', '#3c78b0', '#c09030', '#4a9a5a']), kind: 'container' });
        }
        continue;
      }
      if (district === 'beachfront' || district === 'beach') {
        buildings.push({ x: x0 + 40, y: y0 + 30, w: x1 - x0 - 80, h: rand(rng, 90, 140), hgt: randi(rng, 3, 6), color: choice(rng, PALETTES.beach), kind: 'hotel' });
        for (let t = 0; t < 4; t++) trees.push({ x: rand(rng, x0 + 20, x1 - 20), y: y1 - rand(rng, 10, 50), r: rand(rng, 10, 16) });
        continue;
      }
      const tall = district === 'downtown';
      const n = tall ? randi(rng, 2, 3) : randi(rng, 3, 5);
      const pal = tall ? PALETTES.downtown : PALETTES.suburb;
      for (let i = 0; i < n; i++) {
        const w = tall ? rand(rng, 120, 200) : rand(rng, 70, 130);
        const h = tall ? rand(rng, 120, 200) : rand(rng, 60, 110);
        const bx = rand(rng, x0, Math.max(x0 + 1, x1 - w));
        const by = rand(rng, y0, Math.max(y0 + 1, y1 - h));
        buildings.push({ x: bx, y: by, w, h, hgt: tall ? randi(rng, 4, 9) : randi(rng, 1, 2), color: choice(rng, pal), kind: tall ? 'tower' : 'house' });
      }
      for (let t = 0; t < (tall ? 1 : 3); t++) trees.push({ x: rand(rng, x0 + 16, x1 - 16), y: rand(rng, y0 + 16, y1 - 16), r: rand(rng, 10, 16) });
    }
  }
  return { buildings, trees };
}
// First solid hit for a circle, or null. Water also blocks cars (not feet).
export function hitSolid(city, x, y, r, isCar) {
  for (const b of city.buildings) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < r * r) return b;
  }
  if (isCar && isWater(x, y)) return { water: true };
  return null;
}
// Push a circle out of every solid it overlaps. Returns true if it hit.
export function resolveSolids(city, e, r, isCar) {
  let hit = false;
  for (const b of city.buildings) {
    const nx = clamp(e.x, b.x, b.x + b.w);
    const ny = clamp(e.y, b.y, b.y + b.h);
    let dx = e.x - nx;
    let dy = e.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 === 0) { e.y = b.y - r; continue; }
    const d = Math.sqrt(d2);
    dx /= d; dy /= d;
    e.x = nx + dx * r;
    e.y = ny + dy * r;
  }
  if (isCar && isWater(e.x, e.y)) { hit = true; }
  return hit;
}
