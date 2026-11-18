// Azura Bay — every moving thing: the player (on foot and driving), traffic,
// pedestrians, police, guards, bullets, pickups and particles.
// Written fresh for the gta6-01 round-3 entry.

import { clamp, dist, dist2, angleTo, angleDiff, turnToward, rand, choice, makeRng } from './util.js';
import { collideWorld, nearestRoadPoint, randomGraphNode, isWater } from './city.js';
import { currentObjective } from './missions.js';

export const CAR_COLORS = ['#ff4757', '#ffa502', '#2ed573', '#1e90ff', '#eccc68', '#ff6b81', '#7bed9f', '#a55eea', '#f5f6fa', '#ff7f50'];
export const SHIRT_COLORS = ['#ff6b81', '#2ed573', '#1e90ff', '#ffa502', '#eccc68', '#a55eea', '#ff4757', '#70a1ff'];

export function makePlayer(city) {
  const s = city.locations.safehouse;
  return {
    x: s.x, y: s.y, angle: -Math.PI / 2, speed: 0,
    onFoot: true, car: null, health: 100, lastHurt: -99,
    boost: 100, shootCd: 0, moving: false,
  };
}

// ---------- player ----------

export function updatePlayer(G, dt) {
  const p = G.player, inp = G.input;
  p.shootCd = Math.max(0, p.shootCd - dt);
  p.boost = Math.min(100, p.boost + (inp.down('shift') ? -26 * dt : 14 * dt));
  const now = G.time;

  if (p.onFoot) {
    let mx = (inp.down('d', 'arrowright') ? 1 : 0) - (inp.down('a', 'arrowleft') ? 1 : 0);
    let my = (inp.down('s', 'arrowdown') ? 1 : 0) - (inp.down('w', 'arrowup') ? 1 : 0);
    const len = Math.hypot(mx, my);
    p.moving = len > 0;
    if (len > 0) { mx /= len; my /= len; }
    const spd = inp.down('shift') ? 340 : 220;
    p.x += mx * spd * dt;
    p.y += my * spd * dt;
    // Aim at the mouse (world space).
    const wx = G.camera.x + inp.mouse.x - G.view.w / 2;
    const wy = G.camera.y + inp.mouse.y - G.view.h / 2;
    if (dist(p.x, p.y, wx, wy) > 24) p.angle = angleTo(p.x, p.y, wx, wy);
    const c = collideWorld(G.city, p.x, p.y, 12);
    p.x = c.x; p.y = c.y;
    if (isWater(G.city, p.x, p.y)) { p.x = G.lastLand.x; p.y = G.lastLand.y; }
    else { G.lastLand.x = p.x; G.lastLand.y = p.y; }
    // Shoot.
    if ((inp.down(' ', 'mouse') || inp.mouse.down) && p.shootCd <= 0) {
      p.shootCd = 0.22;
      G.audio.gunshot();
      spawnMuzzle(G, p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20);
      G.bullets.push({ x: p.x + Math.cos(p.angle) * 22, y: p.y + Math.sin(p.angle) * 22, vx: Math.cos(p.angle) * 900, vy: Math.sin(p.angle) * 900, life: 0.5, fromPlayer: true });
    }
    // Enter / steal a car.
    if (inp.hit('e')) tryEnterCar(G);
  } else {
    const car = p.car;
    // Staged chase (?shot=wanted): the car keeps driving itself west so the
    // screenshot catches a chase, not a parked car.
    const fwd = (inp.down('w', 'arrowup') || G.shotMode === 'wanted') ? 1 : 0;
    const back = inp.down('s', 'arrowdown') ? 1 : 0;
    const steer = (inp.down('a', 'arrowleft') ? -1 : 0) + (inp.down('d', 'arrowright') ? 1 : 0);
    const boosting = inp.down('shift') && p.boost > 0;
    // Staged chase (?shot=wanted): the car keeps driving itself west so the
    // screenshot catches a chase, not a parked car — at a cruise speed that
    // keeps it inside downtown for the shot.
    const autopilot = G.shotMode === 'wanted';
    const top = (car.sport ? 620 : 520) * (boosting ? 1.32 : 1) * (autopilot ? 0.55 : 1);
    if (fwd) car.speed += (boosting ? 620 : 430) * dt;
    else if (back) car.speed -= car.speed > 0 ? 520 * dt : 260 * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 260 * dt);
    if (inp.down(' ')) { // handbrake: hard stop + drift smoke
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 900 * dt);
      if (Math.abs(car.speed) > 120 && Math.random() < 0.6) spawnSkid(G, car.x, car.y);
    }
    car.speed = clamp(car.speed, -180, top);
    const grip = clamp(Math.abs(car.speed) / 240, 0.35, 1);
    car.angle += steer * 2.7 * grip * dt * (car.speed < 0 ? -1 : 1);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const before = { x: car.x, y: car.y };
    const c = collideWorld(G.city, nx, ny, 19);
    car.x = c.x; car.y = c.y;
    const hitWall = dist2(before.x, before.y, nx, ny) > 0 && (c.x !== nx || c.y !== ny);
    if (hitWall && Math.abs(car.speed) > 260) {
      spawnSparks(G, car.x, car.y, 10);
      G.audio.noiseBurst(0.15, 0.2, 900);
      car.speed *= -0.25;
      damagePlayer(G, 4);
    }
    p.x = car.x; p.y = car.y; p.angle = car.angle; p.speed = car.speed;
    p.moving = Math.abs(car.speed) > 20;
    if (Math.abs(car.speed) > 60 && Math.random() < 0.25) spawnExhaust(G, car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20);
    G.audio.setEngine(Math.abs(car.speed) / 620, true);
    if (inp.hit('e')) exitCar(G);
  }

  // Health regen after 5s without damage.
  if (now - p.lastHurt > 5 && p.health < 100) p.health = Math.min(100, p.health + 3 * dt);
}

function tryEnterCar(G) {
  const p = G.player;
  // Hold-E objectives own the E key: standing at a safe/vault and pressing E
  // cracks it — it must never steal a passing traffic car instead.
  const obj = currentObjective(G);
  if (obj && obj.hold && dist(p.x, p.y, obj.x, obj.y) < obj.r) return;
  // Mission 2's Comet takes priority: if you park your old car next to it,
  // E must steal the Comet, not climb back into your own car.
  if (G.sportCar && !G.sportCar.taken && dist(p.x, p.y, G.sportCar.x, G.sportCar.y) < 56) {
    G.sportCar.taken = true;
    p.car = G.sportCar; p.onFoot = false;
    G.toast('Comet stolen — nice wheels');
    addWanted(G, 1, 'Car theft');
    G.audio.cash();
    return;
  }
  // Own parked car.
  if (G.parkedCar && dist(p.x, p.y, G.parkedCar.x, G.parkedCar.y) < 56) {
    p.car = G.parkedCar; G.parkedCar = null; p.onFoot = false;
    G.toast('Back behind the wheel');
    return;
  }
  // Steal nearest traffic car.
  let best = null, bd = 60;
  for (const t of G.traffic) {
    const d = dist(p.x, p.y, t.x, t.y);
    if (d < bd) { bd = d; best = t; }
  }
  if (best) {
    G.traffic.splice(G.traffic.indexOf(best), 1);
    best.kind = 'player';
    p.car = best; p.onFoot = false;
    G.toast('Car jacked');
    addWanted(G, 1, 'Car theft');
  }
}

function exitCar(G) {
  const p = G.player;
  if (!p.car) return;
  const car = p.car;
  const sx = car.x - Math.sin(car.angle) * 26, sy = car.y + Math.cos(car.angle) * 26;
  p.x = sx; p.y = sy; p.onFoot = true; p.car = null;
  G.parkedCar = car;
  G.audio.setEngine(0, false);
}

export function damagePlayer(G, amount) {
  const p = G.player;
  if (G.time - p.lastHurt < 0.4) return;
  p.health -= amount;
  p.lastHurt = G.time;
  if (p.health <= 0) { p.health = 0; G.lose('wasted'); }
}

export function addWanted(G, stars, why) {
  G.wanted = clamp(G.wanted + stars, 0, 5);
  G.lastCrime = G.time;
  if (why) G.toast(why + ' — wanted level ' + G.wanted);
}

// ---------- traffic ----------

export function spawnTraffic(city, count) {
  const rng = makeRng(777);
  const list = [];
  const nodes = [...city.graph.nodes.values()];
  for (let i = 0; i < count; i++) {
    const n = nodes[Math.floor(rng() * nodes.length)];
    const links = n.links;
    const next = links[Math.floor(rng() * links.length)];
    list.push({
      x: n.x + rand(rng, -8, 8), y: n.y + rand(rng, -8, 8),
      angle: angleTo(n.x, n.y, next.x, next.y), speed: rand(rng, 120, 180),
      target: next, from: n, color: choice(rng, CAR_COLORS), kind: 'traffic',
      brake: 0, hp: 3,
    });
  }
  return list;
}

export function updateTraffic(G, dt) {
  for (const t of G.traffic) {
    // Arrived at target node: pick the next one.
    if (dist2(t.x, t.y, t.target.x, t.target.y) < 100) {
      const opts = t.target.links.filter((n) => n !== t.from);
      const next = opts.length ? opts[Math.floor(Math.random() * opts.length)] : t.target.links[0];
      t.from = t.target;
      t.target = next || t.from;
    }
    const want = angleTo(t.x, t.y, t.target.x, t.target.y);
    t.angle = turnToward(t.angle, want, 3.2 * dt);
    // Red light ahead: stop.
    let stop = false;
    for (const l of G.city.lights) {
      if (dist2(t.x, t.y, l.x, l.y) < 3600) {
        const st = lightStateOf(G, l);
        const ns = Math.abs(Math.sin(t.angle)) > 0.7; // moving north/south
        if ((ns && (st === 2 || st === 3)) || (!ns && (st === 0 || st === 1))) stop = true;
      }
    }
    // Car ahead: slow down.
    for (const o of G.traffic) {
      if (o === t) continue;
      const d = dist(t.x, t.y, o.x, o.y);
      if (d < 46 && Math.abs(angleDiff(t.angle, angleTo(t.x, t.y, o.x, o.y))) < 0.7) stop = true;
    }
    const p = G.player;
    if (!p.onFoot && p.car && dist(t.x, t.y, p.car.x, p.car.y) < 52 &&
      Math.abs(angleDiff(t.angle, angleTo(t.x, t.y, p.car.x, p.car.y))) < 0.7) stop = true;
    t.speed += ((stop ? 0 : 150) - t.speed) * Math.min(1, 1.6 * dt);
    t.x += Math.cos(t.angle) * t.speed * dt;
    t.y += Math.sin(t.angle) * t.speed * dt;
  }
}

function lightStateOf(G, l) {
  const t = (G.time + l.offset) % 13;
  if (t < 5.5) return 0;
  if (t < 7) return 1;
  if (t < 11.5) return 2;
  return 3;
}

// ---------- pedestrians ----------

export function spawnPeds(city, count) {
  const rng = makeRng(4242);
  const list = [];
  for (let i = 0; i < count; i++) {
    const n = randomGraphNode(city, rng);
    list.push({
      x: n.x + rand(rng, -30, 30), y: n.y + rand(rng, -30, 30),
      angle: rand(rng, 0, Math.PI * 2), speed: rand(rng, 38, 68),
      shirt: choice(rng, SHIRT_COLORS), bob: rand(rng, 0, 6),
      flee: 0, fx: 0, fy: 0, dead: false,
    });
  }
  return list;
}

export function updatePeds(G, dt) {
  for (const ped of G.peds) {
    if (ped.dead) continue;
    ped.bob += dt * 8;
    if (ped.flee > 0) {
      ped.flee -= dt;
      ped.x += ped.fx * 165 * dt;
      ped.y += ped.fy * 165 * dt;
    } else {
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
      if (Math.random() < 0.004) ped.angle = rand(Math.random, 0, Math.PI * 2);
      if (Math.random() < 0.002) {
        const rp = nearestRoadPoint(G.city, ped.x, ped.y);
        ped.angle = angleTo(ped.x, ped.y, rp.x + rand(Math.random, -40, 40), rp.y + rand(Math.random, -40, 40));
      }
    }
    const c = collideWorld(G.city, ped.x, ped.y, 10);
    ped.x = c.x; ped.y = c.y;
    if (isWater(G.city, ped.x, ped.y)) { ped.angle += Math.PI; ped.x += Math.cos(ped.angle) * 30; ped.y += Math.sin(ped.angle) * 30; }
  }
}

export function scarePeds(G, x, y, radius) {
  for (const ped of G.peds) {
    if (ped.dead) continue;
    const d = dist(ped.x, ped.y, x, y);
    if (d < radius) {
      ped.flee = 2;
      const a = angleTo(x, y, ped.x, ped.y);
      ped.fx = Math.cos(a); ped.fy = Math.sin(a);
    }
  }
}

// ---------- police ----------

export function updatePolice(G, dt) {
  const wanted = G.wanted;
  const wantCars = Math.min(wanted, 5);
  const wantCops = wanted >= 3 ? 2 : wanted >= 1 ? 1 : 0;
  const p = G.player;
  // Spawn / despawn cars.
  while (G.policeCars.length < wantCars) {
    const a = Math.random() * Math.PI * 2;
    const d = 560 + Math.random() * 260;
    const rp = nearestRoadPoint(G.city, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
    G.policeCars.push({ x: rp.x, y: rp.y, angle: 0, speed: 0, color: '#111827', kind: 'police', siren: Math.random() * 2 });
  }
  while (G.policeCars.length > wantCars) G.policeCars.pop();
  while (G.footCops.length < wantCops) {
    const a = Math.random() * Math.PI * 2;
    G.footCops.push({ x: p.x + Math.cos(a) * 420, y: p.y + Math.sin(a) * 420, angle: 0, speed: 190 });
  }
  while (G.footCops.length > wantCops) G.footCops.pop();

  // Chase.
  for (const c of G.policeCars) {
    const want = angleTo(c.x, c.y, p.x, p.y);
    c.angle = turnToward(c.angle, want, 3.4 * dt);
    // Close in fast, then hold contact pressure instead of shoving the
    // player's car across the map (a rammed car must not drift hundreds of
    // pixels — that once auto-completed a mission by itself).
    const dd = dist(c.x, c.y, p.x, p.y);
    const target = dd > 60 ? 565 : dd < 52 ? 120 : 300;
    c.speed += (target - c.speed) * Math.min(1, 1.8 * dt);
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    const cc = collideWorld(G.city, c.x, c.y, 19);
    c.x = cc.x; c.y = cc.y;
    c.siren += dt;
    if (c.siren > 0.9) { c.siren = 0; G.audio.sirenBlip(); }
    // Ram the player.
    if (!p.onFoot && p.car && dist(c.x, c.y, p.car.x, p.car.y) < 46) {
      p.car.speed *= 0.94;
      damagePlayer(G, 2);
      if (Math.random() < 0.3) spawnSparks(G, (c.x + p.car.x) / 2, (c.y + p.car.y) / 2, 5);
    }
  }
  for (const c of G.footCops) {
    const want = angleTo(c.x, c.y, p.x, p.y);
    c.angle = want;
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    const cc = collideWorld(G.city, c.x, c.y, 11);
    c.x = cc.x; c.y = cc.y;
  }

  // Bust timer. A hold-E (cracking a safe) buys a breather: the cops close
  // in but cannot bust you mid-crack, so the hold missions stay winnable.
  // A staged chase (?shot=wanted) never busts either — it is a photo, and
  // the bust overlay would hide the chase.
  const holding = G.missions && G.missions.hold > 0;
  const staged = G.shotMode === 'wanted';
  let busting = false;
  if (p.onFoot) {
    for (const c of G.footCops) if (dist(c.x, c.y, p.x, p.y) < 44) busting = true;
    for (const c of G.policeCars) if (dist(c.x, c.y, p.x, p.y) < 52) busting = true;
    G.bustTimer += (busting && !holding && !staged) ? dt : -dt * 2;
  } else if (p.car) {
    let near = 0;
    for (const c of G.policeCars) if (dist(c.x, c.y, p.car.x, p.car.y) < 110) near++;
    busting = near >= 2 && Math.abs(p.car.speed) < 15;
    G.bustTimer += (busting && !holding && !staged) ? dt : -dt * 2;
  }
  G.bustTimer = clamp(G.bustTimer, 0, 3);
  const bustAt = p.onFoot ? 1.2 : 2.5;
  if (G.bustTimer >= bustAt) G.lose('busted');
}

// ---------- guards (mission 6) ----------

export function updateGuards(G, dt) {
  const p = G.player;
  for (const g of G.guards) {
    if (g.dead) continue;
    const d = dist(g.x, g.y, p.x, p.y);
    g.shootCd -= dt;
    if (d < 520) {
      g.angle = angleTo(g.x, g.y, p.x, p.y);
      if (d > 180) {
        g.x += Math.cos(g.angle) * 120 * dt;
        g.y += Math.sin(g.angle) * 120 * dt;
      }
      if (g.shootCd <= 0 && d < 460) {
        g.shootCd = 1.4;
        G.audio.gunshot();
        // Guards are shaky shots: a spread cone so a stationary player is
        // hit about half the time — the vault hold stays survivable.
        const aim = g.angle + (Math.random() - 0.5) * 0.6;
        G.bullets.push({ x: g.x + Math.cos(g.angle) * 20, y: g.y + Math.sin(g.angle) * 20, vx: Math.cos(aim) * 700, vy: Math.sin(aim) * 700, life: 0.7, fromPlayer: false });
      }
    }
    const c = collideWorld(G.city, g.x, g.y, 11);
    g.x = c.x; g.y = c.y;
  }
}

// ---------- bullets ----------

export function updateBullets(G, dt) {
  const p = G.player;
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0;
    if (!dead) {
      if (b.fromPlayer) {
        for (const ped of G.peds) {
          if (!ped.dead && dist2(b.x, b.y, ped.x, ped.y) < 200) {
            ped.dead = true; dead = true;
            spawnSparks(G, ped.x, ped.y, 6);
            scarePeds(G, ped.x, ped.y, 220);
            addWanted(G, 1, 'Pedestrian down');
            break;
          }
        }
        if (!dead) for (const g of G.guards) {
          if (!g.dead && dist2(b.x, b.y, g.x, g.y) < 200) {
            g.hp -= 1; dead = true;
            spawnSparks(G, g.x, g.y, 6);
            if (g.hp <= 0) { g.dead = true; G.addMoney(50); G.toast('Guard down +$50'); }
            break;
          }
        }
        if (!dead) for (const c of G.policeCars) {
          if (dist2(b.x, b.y, c.x, c.y) < 420) {
            dead = true; spawnSparks(G, b.x, b.y, 5);
            addWanted(G, 1, 'Shots fired at police');
            break;
          }
        }
        if (!dead) for (const t of G.traffic) {
          if (dist2(b.x, b.y, t.x, t.y) < 420) {
            dead = true; t.hp -= 1; spawnSparks(G, b.x, b.y, 5);
            if (t.hp <= 0) { t.speed = 0; spawnSmoke(G, t.x, t.y, 8); }
            break;
          }
        }
      } else {
        if (dist2(b.x, b.y, p.x, p.y) < 220) {
          dead = true;
          damagePlayer(G, 7);
          spawnSparks(G, p.x, p.y, 4);
        }
      }
    }
    if (dead) G.bullets.splice(i, 1);
  }
}

// ---------- pickups ----------

export function updatePickups(G, dt) {
  const p = G.player;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const k = G.pickups[i];
    if (dist2(p.x, p.y, k.x, k.y) < 900) {
      if (k.kind === 'medkit') { p.health = Math.min(100, p.health + 50); G.toast('Medkit +50 HP'); }
      else { G.addMoney(50); G.toast('Cash +$50'); }
      G.audio.pickup();
      G.pickups.splice(i, 1);
    }
  }
}

// ---------- particles ----------

export function spawnSmoke(G, x, y, n) {
  for (let i = 0; i < n; i++) addParticle(G, x, y, 'smoke');
}
export function spawnSparks(G, x, y, n) {
  for (let i = 0; i < n; i++) addParticle(G, x, y, 'spark');
}
export function spawnMuzzle(G, x, y) { addParticle(G, x, y, 'muzzle'); }
export function spawnSkid(G, x, y) { addParticle(G, x, y, 'skid'); }
export function spawnExhaust(G, x, y) { addParticle(G, x, y, 'exhaust'); }
export function spawnExplosion(G, x, y) {
  for (let i = 0; i < 22; i++) addParticle(G, x, y, Math.random() < 0.5 ? 'fire' : 'smoke');
  G.audio.explosion();
  scarePeds(G, x, y, 320);
}

function addParticle(G, x, y, kind) {
  if (G.particles.length > 340) G.particles.shift();
  const a = Math.random() * Math.PI * 2;
  const sp = kind === 'spark' ? rand(Math.random, 120, 320) : rand(Math.random, 12, 70);
  G.particles.push({
    x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
    life: 0, max: kind === 'smoke' ? rand(Math.random, 0.9, 1.6) : kind === 'skid' ? 1.4 : rand(Math.random, 0.25, 0.6),
    size: kind === 'smoke' ? rand(Math.random, 10, 20) : kind === 'skid' ? 7 : rand(Math.random, 3, 7),
    kind,
  });
}

export function updateParticles(G, dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const pt = G.particles[i];
    pt.life += dt;
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx *= 0.96; pt.vy *= 0.96;
    if (pt.life >= pt.max) G.particles.splice(i, 1);
  }
}
