// Azura Bay — procedural city: roads, districts, buildings, beach, harbor.
// All layout is generated once from a fixed seed, so every load looks identical.
// Written fresh for the gta6-01 round-3 entry.

import { makeRng, rand, randInt, choice, clamp, resolveCircleBox, pointInBox } from './util.js';

export const WORLD = 3200;

const PALETTE = [
  '#ff6b5e', '#ff9f43', '#f7c948', '#2ec4b6', '#4d96ff', '#9b5de5',
  '#ef476f', '#06d6a0', '#ffbf69', '#5e60ce', '#e07a5f', '#81b29a',
];

function buildRoads() {
  // Each road is an axis-aligned segment with a travel range.
  const vertical = [
    { x: 300, from: 140, to: 2500 },
    { x: 700, from: 140, to: 3060 },
    { x: 1100, from: 140, to: 3060 },
    { x: 1500, from: 140, to: 3060 },
    { x: 1900, from: 140, to: 3060 },
    { x: 2300, from: 140, to: 3060 },
    { x: 2620, from: 140, to: 3060 }, // beachfront avenue
  ];
  const horizontal = [
    { y: 300, from: 140, to: 3060 },
    { y: 700, from: 140, to: 3060 },
    { y: 1100, from: 140, to: 3060 },
    { y: 1500, from: 140, to: 3060 },
    { y: 1900, from: 140, to: 3060 },
    { y: 2300, from: 140, to: 3060 },
    { y: 2700, from: 640, to: 3060 }, // skirts the harbor water
  ];
  return { vertical, horizontal };
}

function buildGraph(roads) {
  const nodes = new Map();
  const key = (x, y) => x + ',' + y;
  const add = (x, y) => {
    const k = key(x, y);
    if (!nodes.has(k)) nodes.set(k, { x, y, links: [] });
    return nodes.get(k);
  };
  const link = (a, b) => {
    if (!a.links.includes(b)) a.links.push(b);
    if (!b.links.includes(a)) b.links.push(a);
  };
  for (const v of roads.vertical) {
    const pts = [];
    for (const h of roads.horizontal) {
      if (h.from <= v.x && v.x <= h.to && v.from <= h.y && h.y <= v.to) pts.push(add(v.x, h.y));
    }
    pts.sort((a, b) => a.y - b.y);
    for (let i = 0; i + 1 < pts.length; i++) link(pts[i], pts[i + 1]);
  }
  for (const h of roads.horizontal) {
    const pts = [];
    for (const v of roads.vertical) {
      if (v.from <= h.y && h.y <= v.to && h.from <= v.x && v.x <= h.to) pts.push(add(v.x, h.y));
    }
    pts.sort((a, b) => a.x - b.x);
    for (let i = 0; i + 1 < pts.length; i++) link(pts[i], pts[i + 1]);
  }
  return { nodes, key };
}

export function buildCity() {
  const rng = makeRng(20261119);
  const roads = buildRoads();
  const graph = buildGraph(roads);

  // ---- buildings: downtown towers + suburban houses ----
  const buildings = [];
  const houses = [];
  const vxs = [1100, 1500, 1900, 2300];
  const hys = [300, 700, 1100, 1500];
  for (let i = 0; i + 1 < vxs.length; i++) {
    for (let j = 0; j + 1 < hys.length; j++) {
      const bx = vxs[i] + 30, by = hys[j] + 30;
      const bw = vxs[i + 1] - vxs[i] - 60, bh = hys[j + 1] - hys[j] - 60;
      const n = randInt(rng, 1, 2);
      for (let k = 0; k < n; k++) {
        const w = n === 1 ? bw : bw / 2 - 8;
        const h = n === 1 ? bh : bh - 8;
        const x = bx + (n === 1 ? 0 : k * (bw / 2 + 8));
        const y = by;
        buildings.push({
          x, y, w, h,
          color: choice(rng, PALETTE),
          roof: choice(rng, ['#2b2d42', '#3d405b', '#4a4e69']),
          tall: rand(rng, 18, 64),
          lit: rng(),
          seed: rng(),
        });
      }
    }
  }
  // Downtown fringe towers along the avenues.
  for (const [x, y, w, h] of [
    [2360, 340, 120, 180], [2360, 760, 120, 220], [2360, 1180, 120, 180],
    [980, 340, 90, 150], [980, 1180, 90, 150], [1560, 1560, 130, 130],
  ]) {
    buildings.push({ x, y, w, h, color: choice(rng, PALETTE), roof: '#2b2d42', tall: rand(rng, 30, 70), lit: rng(), seed: rng() });
  }
  // Suburban houses with gardens.
  for (let gx = 340; gx < 1060; gx += 120) {
    for (let gy = 1560; gy < 2260; gy += 130) {
      if (rng() < 0.22) continue;
      houses.push({
        x: gx + rand(rng, 0, 30), y: gy + rand(rng, 0, 30), w: 52, h: 40,
        color: choice(rng, ['#ffafcc', '#ffc8dd', '#cdb4db', '#bde0fe', '#fdffb6', '#caffbf']),
        roof: choice(rng, ['#b23a48', '#7f4f24', '#335c67']),
      });
    }
  }

  // ---- parks, palms, umbrellas ----
  const parks = [
    { x: 2360, y: 1620, w: 300, h: 220 },
    { x: 760, y: 360, w: 260, h: 200 },
    { x: 1620, y: 2360, w: 320, h: 240 },
  ];
  const palms = [];
  for (let y = 220; y < 3000; y += randInt(rng, 90, 150)) {
    palms.push({ x: rand(rng, 2680, 2740), y, sway: rand(rng, 0, 6) });
    if (rng() < 0.6) palms.push({ x: rand(rng, 2840, 2920), y: y + rand(rng, -30, 30), sway: rand(rng, 0, 6) });
  }
  for (const p of parks) {
    for (let i = 0; i < 7; i++) palms.push({ x: rand(rng, p.x + 20, p.x + p.w - 20), y: rand(rng, p.y + 20, p.y + p.h - 20), sway: rand(rng, 0, 6) });
  }
  const umbrellas = [];
  for (let i = 0; i < 14; i++) {
    umbrellas.push({ x: rand(rng, 2700, 2920), y: rand(rng, 300, 2900), color: choice(rng, PALETTE) });
  }

  // ---- harbor: containers, cranes, docks ----
  const containers = [];
  for (let gx = 740; gx < 1060; gx += 70) {
    for (let gy = 2540; gy < 2960; gy += 60) {
      if (rng() < 0.3) continue;
      containers.push({ x: gx, y: gy, w: 58, h: 26, color: choice(rng, PALETTE), stack: rng() < 0.4 });
    }
  }
  const cranes = [
    { x: 660, y: 2560, h: 150 }, { x: 660, y: 2900, h: 170 },
  ];

  // ---- traffic lights at downtown intersections ----
  const lights = [];
  for (const n of graph.nodes.values()) {
    if (n.x >= 1100 && n.x <= 2300 && n.y >= 300 && n.y <= 1500) {
      lights.push({ x: n.x, y: n.y, offset: rand(rng, 0, 12) });
    }
  }

  const city = {
    size: WORLD,
    roads,
    graph,
    buildings,
    houses,
    parks,
    palms,
    umbrellas,
    containers,
    cranes,
    lights,
    sea: { x0: 2960 },
    sand: { x0: 2660, x1: 2960 },
    harborWater: { x: 120, y: 2500, w: 500, h: 580 },
    locations: {
      safehouse: { x: 1500, y: 1440, name: "Vera's Garage" },
      hotel: { x: 2820, y: 620, name: 'Azura Grand Hotel' },
      marina: { x: 2720, y: 1180, name: 'Marina' },
      docks: { x: 680, y: 2780, name: 'Harbor Docks' },
      tower: { x: 1900, y: 660, name: 'Meridian Tower' },
      bank: { x: 1500, y: 900, name: 'Azura National Bank' },
      vault: { x: 1900, y: 1060, name: 'Meridian Vault' },
      boat: { x: 2880, y: 2180, name: 'Escape Boat' },
      drops: [
        { x: 760, y: 760, name: 'Drop 1 — Coral Court' },
        { x: 2340, y: 1940, name: 'Drop 2 — Palm Row' },
        { x: 1160, y: 2740, name: 'Drop 3 — Dockside' },
      ],
    },
  };
  return city;
}

// ---- queries used by gameplay ----

export function isWater(city, x, y) {
  if (x >= city.sea.x0) return true;
  const hw = city.harborWater;
  return x >= hw.x && x <= hw.x + hw.w && y >= hw.y && y <= hw.y + hw.h;
}

export function collideWorld(city, x, y, r) {
  // Buildings, houses, containers and cranes push circles out.
  for (const b of city.buildings) {
    const c = resolveCircleBox(x, y, r, b.x, b.y, b.w, b.h);
    if (c) { x = c.x; y = c.y; }
  }
  for (const h of city.houses) {
    const c = resolveCircleBox(x, y, r, h.x, h.y, h.w, h.h);
    if (c) { x = c.x; y = c.y; }
  }
  for (const ctn of city.containers) {
    const c = resolveCircleBox(x, y, r, ctn.x, ctn.y, ctn.w, ctn.h);
    if (c) { x = c.x; y = c.y; }
  }
  for (const cr of city.cranes) {
    const c = resolveCircleBox(x, y, r, cr.x - 14, cr.y - 14, 28, 28);
    if (c) { x = c.x; y = c.y; }
  }
  x = clamp(x, 60, WORLD - 60);
  y = clamp(y, 60, WORLD - 60);
  return { x, y };
}

export function nearestRoadPoint(city, x, y) {
  let best = null, bd = Infinity;
  for (const v of city.roads.vertical) {
    if (y < v.from || y > v.to) continue;
    const d = Math.abs(x - v.x);
    if (d < bd) { bd = d; best = { x: v.x, y }; }
  }
  for (const h of city.roads.horizontal) {
    if (x < h.from || x > h.to) continue;
    const d = Math.abs(y - h.y);
    if (d < bd) { bd = d; best = { x, y: h.y }; }
  }
  return best || { x: 1500, y: 1500 };
}

export function randomGraphNode(city, rng) {
  const arr = [...city.graph.nodes.values()];
  return arr[Math.floor(rng() * arr.length)];
}

export function pointInBuilding(city, x, y) {
  for (const b of city.buildings) if (pointInBox(x, y, b.x, b.y, b.w, b.h)) return true;
  for (const h of city.houses) if (pointInBox(x, y, h.x, h.y, h.w, h.h)) return true;
  return false;
}

// Traffic-light state at an intersection: 0 = NS green, 1 = NS yellow, 2 = EW green, 3 = EW yellow.
export function lightState(light, time) {
  const t = (time + light.offset) % 13;
  if (t < 5.5) return 0;
  if (t < 7) return 1;
  if (t < 11.5) return 2;
  return 3;
}
