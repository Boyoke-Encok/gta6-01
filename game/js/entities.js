// All moving things: the player, drivable cars, road traffic, pedestrians,
// police chasers, gang shooters, pickups and particles. Every function takes
// the game state G (owned by main.js) and a dt; state transitions (busted /
// wasted) are left to main.js, which reads G.bustT / G.health each frame.
import { clamp, dist, lerp, rand, randi, choice, turnToward, angleDiff, circleVsBox } from './util.js';
import { ROAD_V, ROAD_H, ROAD_W, WORLD, nearestRoad, randomNode, nextNode, hitSolid, resolveSolids, onRoad } from './city.js';

export const CAR_COLORS = ['#c0392b', '#2980b9', '#f39c12', '#7f8c8d', '#8e44ad', '#16a085', '#d5dbdb', '#2c3e50', '#e67e22'];
export const PED_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8', '#00cec9'];

export function makeCar(x, y, angle, color, kind) {
  return { x, y, angle, speed: 0, color, kind, nodeA: null, nodeB: null, t: 0, segLen: 1, hp: 100, disabled: false, smokeT: 0, w: 44, h: 22 };
}
export function spawnTraffic(city, rng, n) {
  const cars = [];
  for (let i = 0; i < n; i++) {
    const a = randomNode(rng);
    const b = nextNode(a, null, rng);
    const c = makeCar(a.x, a.y, Math.atan2(b.y - a.y, b.x - a.x), choice(rng, CAR_COLORS), 'traffic');
    c.nodeA = a; c.nodeB = b; c.t = rng();
    c.speed = rand(rng, 130, 200);
    cars.push(c);
  }
  return cars;
}
export function spawnParked(city, rng, n, avoid) {
  const cars = [];
  let tries = 0;
  while (cars.length < n && tries++ < 300) {
    const road = choice(rng, ROAD_V);
    const y = rand(rng, 260, 2940);
    const x = road + (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 16);
    const angle = rng() < 0.5 ? 0 : Math.PI;
    if (avoid && avoid.some((p) => dist(x, y, p.x, p.y) < 160)) continue;
    if (hitSolid(city, x, y, 24, true)) continue;
    cars.push(makeCar(x, y, angle, choice(rng, CAR_COLORS), 'parked'));
  }
  return cars;
}
export function spawnPeds(city, rng, n) {
  const peds = [];
  for (let i = 0; i < n; i++) {
    const road = choice(rng, ROAD_V);
    const side = rng() < 0.5 ? -1 : 1;
    const x = road + side * (ROAD_W / 2 + 14);
    const y = rand(rng, 260, 2940);
    peds.push({ x, y, angle: rng() * Math.PI * 2, speed: rand(rng, 45, 75), color: choice(rng, PED_COLORS), axis: 'v', at: road, dir: rng() < 0.5 ? 1 : -1, panic: 0, dead: false, deadT: 0, walkPhase: rng() * 6 });
  }
  return peds;
}
export function spawnPickups(city, rng) {
  const out = [];
  const spots = [];
  for (let i = 0; i < 14; i++) {
    const road = choice(rng, [...ROAD_V, ...ROAD_H]);
    const along = rand(rng, 300, 2900);
    const off = (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 26);
    const p = ROAD_V.includes(road) ? { x: road + off, y: along } : { x: along, y: road + off };
    if (!hitSolid(city, p.x, p.y, 20, false)) spots.push(p);
  }
  spots.slice(0, 6).forEach((p) => out.push({ x: p.x, y: p.y, type: 'med', amount: 50, bob: rand(rng, 0, 6) }));
  spots.slice(6).forEach((p) => out.push({ x: p.x, y: p.y, type: 'cash', amount: randi(rng, 40, 150), bob: rand(rng, 0, 6) }));
  return out;
}
export function addParticle(G, x, y, vx, vy, life, color, size) {
  G.particles.push({ x, y, vx, vy, life, maxLife: life, color, size });
}
export function addTracer(G, x1, y1, x2, y2) {
  G.tracers.push({ x1, y1, x2, y2, life: 0.09 });
}
export function burst(G, x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(Math.random, speed * 0.4, speed);
    addParticle(G, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(Math.random, 0.25, 0.6), color, rand(Math.random, 2, 4));
  }
}
export function commitCrime(G, stars) {
  const before = G.wanted;
  G.wanted = Math.min(5, G.wanted + stars);
  G.crimeTimer = 0;
  if (G.wanted > before) G.toast('Wanted level up: ' + '★'.repeat(G.wanted));
}
export function damagePlayer(G, amt) {
  if (G.state !== 'playing') return;
  G.player.health -= amt;
  G.player.lastHurt = G.time;
  G.camera.shake = Math.max(G.camera.shake, 6);
  if (G.player.health <= 0) G.player.health = 0;
}
// --- player ---------------------------------------------------------------
export function updatePlayer(G, dt) {
  const p = G.player;
  const inp = G.input;
  if (p.onFoot) {
    const ax = inp.moveAxis();
    const sprint = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
    const spd = sprint ? 330 : 205;
    p.speed = (ax.x || ax.y) ? spd : 0;
    if (ax.x || ax.y) p.angle = Math.atan2(ax.y, ax.x);
    p.x += ax.x * spd * dt;
    p.y += ax.y * spd * dt;
    p.x = clamp(p.x, 30, WORLD - 30);
    p.y = clamp(p.y, 30, WORLD - 30);
    resolveSolids(G.city, p, 16, false);
    if (inp.wasPressed('Space')) playerShoot(G);
    if (inp.wasPressed('KeyE')) tryEnterCar(G);
  } else if (p.car) {
    const c = p.car;
    const d = inp.driveAxis();
    const boost = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
    const hand = inp.isDown('Space');
    const top = boost ? 520 : 420;
    if (d.throttle > 0) c.speed += (boost ? 640 : 480) * dt;
    else if (d.throttle < 0) c.speed += (c.speed > 30 ? -760 : -300) * dt;
    else c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 260 * dt);
    if (hand) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 900 * dt);
    c.speed = clamp(c.speed, -180, top);
    const steerAuthority = clamp(Math.abs(c.speed) / 120, 0, 1);
    c.angle += d.steer * 2.7 * steerAuthority * dt * Math.sign(c.speed || 1) * (hand ? 1.5 : 1);
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    c.x = clamp(c.x, 30, WORLD - 30);
    c.y = clamp(c.y, 30, WORLD - 30);
    if (resolveSolids(G.city, c, 20, true)) {
      if (Math.abs(c.speed) > 220) { G.sound.crash(); G.camera.shake = 8; burst(G, c.x, c.y, '#888', 8, 120); }
      c.speed *= 0.35;
    }
    p.x = c.x; p.y = c.y; p.angle = c.angle; p.speed = Math.abs(c.speed);
    if (inp.wasPressed('KeyE')) exitCar(G);
  }
  // Health regen after 4s without damage.
  if (G.time - p.lastHurt > 4 && p.health > 0 && p.health < 100) p.health = Math.min(100, p.health + 2.5 * dt);
  // Car collisions with traffic.
  if (!p.onFoot && p.car) {
    for (const o of G.cars) {
      if (o === p.car || o.kind === 'cop') continue;
      const dd = dist(p.car.x, p.car.y, o.x, o.y);
      if (dd < 46 && dd > 0.01) {
        const push = (46 - dd) / 2;
        const nx = (p.car.x - o.x) / dd, ny = (p.car.y - o.y) / dd;
        p.car.x += nx * push; p.car.y += ny * push;
        o.x -= nx * push; o.y -= ny * push;
        if (o.kind === 'traffic') { o.speed *= 0.4; o.stoppedT = 1.2; }
        p.car.speed *= 0.85;
        if (Math.abs(p.car.speed) > 200) G.sound.crash();
      }
    }
  }
}
export function playerShoot(G) {
  const p = G.player;
  if (G.shootCd > 0) return;
  G.shootCd = 0.28;
  G.sound.shot();
  commitCrime(G, 0);
  G.wanted = Math.max(G.wanted, 1);
  G.crimeTimer = 0;
  const range = 340;
  const ox = p.x + Math.cos(p.angle) * 20;
  const oy = p.y + Math.sin(p.angle) * 20;
  let best = null, bestD = range;
  const consider = (x, y, ref) => {
    const d = dist(p.x, p.y, x, y);
    if (d < bestD && Math.abs(angleDiff(p.angle, Math.atan2(y - p.y, x - p.x))) < 0.22) { best = ref; bestD = d; }
  };
  for (const g of G.gang) if (g.hp > 0) consider(g.x, g.y, { type: 'gang', ref: g });
  for (const c of G.cops) if (!c.disabled) consider(c.x, c.y, { type: 'cop', ref: c });
  for (const pd of G.peds) if (!pd.dead) consider(pd.x, pd.y, { type: 'ped', ref: pd });
  const ex = p.x + Math.cos(p.angle) * (best ? bestD : range);
  const ey = p.y + Math.sin(p.angle) * (best ? bestD : range);
  addTracer(G, ox, oy, ex, ey);
  burst(G, ox, oy, '#ffd34d', 4, 90);
  if (!best) { for (const pd of G.peds) if (!pd.dead && dist(p.x, p.y, pd.x, pd.y) < 420) pd.panic = 2.5; return; }
  if (best.type === 'gang') {
    best.ref.hp -= 50;
    burst(G, best.ref.x, best.ref.y, '#e74c3c', 8, 140);
    if (best.ref.hp <= 0) { G.player.kills++; G.score += 25; G.toast('Gang member down'); }
  } else if (best.type === 'cop') {
    best.ref.hp -= 34;
    burst(G, best.ref.x, best.ref.y, '#f39c12', 8, 140);
    if (best.ref.hp <= 0 && !best.ref.disabled) { best.ref.disabled = true; commitCrime(G, 1); G.toast('Cop car disabled'); }
  } else {
    best.ref.dead = true; best.ref.deadT = 0;
    commitCrime(G, 1);
    G.toast('Civilian down — wanted up');
  }
}
export function tryEnterCar(G) {
  const p = G.player;
  let best = null, bestD = 80;
  for (const c of G.cars) {
    const d = dist(p.x, p.y, c.x, c.y);
    if (d < bestD) { best = c; bestD = d; }
  }
  if (!best) return false;
  if (best.kind === 'traffic') { best.kind = 'parked'; commitCrime(G, 1); G.toast('Car jacked!'); }
  else if (best.kind === 'gold') { commitCrime(G, 1); G.toast('Gold coupe taken!'); }
  else G.toast('In the car');
  p.car = best;
  p.onFoot = false;
  p.x = best.x; p.y = best.y; p.angle = best.angle;
  G.sound.click();
  return true;
}
export function exitCar(G) {
  const p = G.player;
  if (!p.car) return;
  const c = p.car;
  p.onFoot = true;
  p.x = c.x + Math.cos(c.angle + Math.PI / 2) * 34;
  p.y = c.y + Math.sin(c.angle + Math.PI / 2) * 34;
  p.speed = 0;
  p.car = null;
  G.sound.click();
}
// --- traffic ----------------------------------------------------------------
export function updateTraffic(G, dt) {
  for (const c of G.cars) {
    if (c.kind !== 'traffic' || c.disabled) continue;
    if (c.stoppedT > 0) { c.stoppedT -= dt; continue; }
    const a = c.nodeA, b = c.nodeB;
    const segLen = Math.max(1, dist(a.x, a.y, b.x, b.y));
    c.t += (c.speed * dt) / segLen;
    if (c.t >= 1) {
      c.nodeA = b;
      c.nodeB = nextNode(b, a, G.rng);
      c.t = 0;
    }
    const ang = Math.atan2(c.nodeB.y - c.nodeA.y, c.nodeB.x - c.nodeA.x);
    c.angle = ang;
    const rx = -Math.sin(ang) * 22, ry = Math.cos(ang) * 22;
    c.x = lerp(c.nodeA.x, c.nodeB.x, c.t) + rx;
    c.y = lerp(c.nodeA.y, c.nodeB.y, c.t) + ry;
    // Brake for the player's car ahead.
    const p = G.player;
    if (!p.onFoot && p.car) {
      const ahead = (p.car.x - c.x) * Math.cos(ang) + (p.car.y - c.y) * Math.sin(ang);
      const side = Math.abs((p.car.x - c.x) * -Math.sin(ang) + (p.car.y - c.y) * Math.cos(ang));
      if (ahead > 0 && ahead < 90 && side < 40) c.stoppedT = 0.4;
    }
  }
}
// --- pedestrians --------------------------------------------------------------
export function updatePeds(G, dt) {
  const p = G.player;
  for (const pd of G.peds) {
    if (pd.dead) { pd.deadT += dt; continue; }
    pd.walkPhase += dt * 6;
    if (pd.panic > 0) {
      pd.panic -= dt;
      const away = Math.atan2(pd.y - p.y, pd.x - p.x);
      pd.angle = away;
      pd.x += Math.cos(away) * 150 * dt;
      pd.y += Math.sin(away) * 150 * dt;
    } else {
      pd.x += Math.cos(pd.angle) * pd.speed * dt;
      pd.y += Math.sin(pd.angle) * pd.speed * dt;
      // Turn at intersections onto the crossing sidewalk.
      const near = nearestRoad(pd.x, pd.y);
      if (near.d < 26 && Math.random() < 0.02) {
        pd.angle = Math.atan2(near.y - pd.y, near.x - pd.x) + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      }
      if (pd.x < 240 || pd.x > 2960 || pd.y < 240 || pd.y > 2960) pd.angle += Math.PI;
    }
    pd.x = clamp(pd.x, 220, 2980);
    pd.y = clamp(pd.y, 220, 2980);
    resolveSolids(G.city, pd, 12, false);
    // Run over by a fast car.
    if (!p.onFoot && p.car && Math.abs(p.car.speed) > 130 && dist(pd.x, pd.y, p.car.x, p.car.y) < 34) {
      pd.dead = true; pd.deadT = 0;
      burst(G, pd.x, pd.y, '#c0392b', 10, 160);
      commitCrime(G, 1);
      G.toast('Pedestrian hit — wanted up');
    }
  }
  G.peds = G.peds.filter((pd) => !pd.dead || pd.deadT < 6);
}
// --- police -------------------------------------------------------------------
export function wantedCopCount(wanted) {
  return wanted <= 0 ? 0 : Math.min(2 + wanted, 8);
}
export function spawnCop(G) {
  const p = G.player;
  const a = Math.random() * Math.PI * 2;
  const sx = clamp(p.x + Math.cos(a) * 650, 260, 2940);
  const sy = clamp(p.y + Math.sin(a) * 650, 260, 2940);
  const near = nearestRoad(sx, sy);
  const c = makeCar(near.x, near.y, Math.atan2(p.y - near.y, p.x - near.x), '#1a1a2e', 'cop');
  c.speed = 120;
  G.cops.push(c);
}
export function updateCops(G, dt) {
  const p = G.player;
  const want = wantedCopCount(G.wanted);
  while (G.cops.length < want) spawnCop(G);
  if (G.wanted === 0) G.cops.length = 0;
  let touching = 0, nearCount = 0;
  for (const c of G.cops) {
    if (c.disabled) { c.smokeT += dt; continue; }
    const targetA = Math.atan2(p.y - c.y, p.x - c.x);
    const top = 250 + G.wanted * 24;
    c.angle = turnToward(c.angle, targetA, 3.4 * dt);
    c.speed = clamp(c.speed + 420 * dt, 0, top);
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    c.x = clamp(c.x, 30, WORLD - 30);
    c.y = clamp(c.y, 30, WORLD - 30);
    if (resolveSolids(G.city, c, 20, true)) c.speed *= 0.5;
    const d = dist(c.x, c.y, p.x, p.y);
    if (d < 56) touching++;
    if (d < 150) nearCount++;
    // Ram the player's car.
    if (!p.onFoot && p.car && d < 48) {
      const nx = (p.car.x - c.x) / (d || 1), ny = (p.car.y - c.y) / (d || 1);
      p.car.x += nx * 60 * dt * 10;
      p.car.y += ny * 60 * dt * 10;
      p.car.speed *= 0.985;
      G.camera.shake = Math.max(G.camera.shake, 4);
      if (Math.random() < 0.1) G.sound.crash();
    }
  }
  // Bust timers.
  if (p.onFoot && touching > 0) G.bustT += dt; else G.bustT = Math.max(0, G.bustT - dt * 2);
  if (!p.onFoot && nearCount >= 2) G.surroundT += dt; else G.surroundT = Math.max(0, G.surroundT - dt * 2);
  G.cops = G.cops.filter((c) => dist(c.x, c.y, p.x, p.y) < 1600 || G.wanted > 0);
}
// --- gang ---------------------------------------------------------------------
export function spawnGang(G, x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 40 + Math.random() * 90;
    G.gang.push({ x: clamp(x + Math.cos(a) * r, 60, WORLD - 60), y: clamp(y + Math.sin(a) * r, 60, WORLD - 60), angle: a, hp: 100, shootCd: rand(Math.random, 0.4, 1.2), home: { x, y } });
  }
}
export function updateGang(G, dt) {
  const p = G.player;
  for (const g of G.gang) {
    if (g.hp <= 0) continue;
    const d = dist(g.x, g.y, p.x, p.y);
    if (d < 420) {
      g.angle = Math.atan2(p.y - g.y, p.x - g.x);
      g.shootCd -= dt;
      if (g.shootCd <= 0) {
        g.shootCd = 0.9 + Math.random() * 0.5;
        G.sound.enemyShot();
        addTracer(G, g.x, g.y, p.x, p.y);
        const hitChance = d < 200 ? 0.55 : 0.3;
        if (Math.random() < hitChance) damagePlayer(G, rand(Math.random, 7, 11));
      }
    } else {
      // Drift back toward home turf.
      const hd = dist(g.x, g.y, g.home.x, g.home.y);
      if (hd > 120) {
        const a = Math.atan2(g.home.y - g.y, g.home.x - g.x);
        g.angle = a;
        g.x += Math.cos(a) * 55 * dt;
        g.y += Math.sin(a) * 55 * dt;
      }
    }
    resolveSolids(G.city, g, 14, false);
  }
  G.gang = G.gang.filter((g) => g.hp > 0 || dist(g.x, g.y, p.x, p.y) < 900);
}
// --- pickups / particles --------------------------------------------------------
export function updatePickups(G, dt) {
  const p = G.player;
  for (const pk of G.pickups) {
    pk.bob += dt * 3;
    const r = p.onFoot ? 36 : 52;
    if (dist(pk.x, pk.y, p.x, p.y) < r) {
      pk.taken = true;
      if (pk.type === 'med') { p.health = Math.min(100, p.health + pk.amount); G.toast('Medkit +' + pk.amount + ' HP'); }
      else { p.money += pk.amount; G.score += pk.amount; G.toast('Cash +' + '$' + pk.amount); G.sound.coin(); }
      G.sound.pickup();
    }
  }
  G.pickups = G.pickups.filter((pk) => !pk.taken);
  G.cashTimer -= dt;
  if (G.cashTimer <= 0) {
    G.cashTimer = 30;
    const road = choice(Math.random, ROAD_V);
    const y = rand(Math.random, 300, 2900);
    G.pickups.push({ x: road + 70, y, type: 'cash', amount: randi(Math.random, 40, 120), bob: 0 });
  }
}
export function updateParticles(G, dt) {
  for (const pt of G.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.98; pt.vy *= 0.98;
  }
  G.particles = G.particles.filter((pt) => pt.life > 0);
  for (const t of G.tracers) t.life -= dt;
  G.tracers = G.tracers.filter((t) => t.life > 0);
}
