// Azura Bay — all canvas drawing: a prerendered static city layer plus
// animated water, traffic lights, swaying palms, vehicles, people, particles
// and the minimap. Written fresh for the gta6-01 round-3 entry.

import { clamp, lerp } from './util.js';
import { lightState } from './city.js';

let staticLayer = null;
let miniBase = null;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

export function buildStaticLayer(city) {
  const c = document.createElement('canvas');
  c.width = 3200; c.height = 3200;
  const ctx = c.getContext('2d');

  // Grass base.
  ctx.fillStyle = '#5cb85f';
  ctx.fillRect(0, 0, 3200, 3200);
  // Mow stripes for texture.
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = 0; y < 3200; y += 80) ctx.fillRect(0, y, 3200, 40);

  // Parks.
  for (const p of city.parks) {
    ctx.fillStyle = '#3f9e4d';
    rr(ctx, p.x, p.y, p.w, p.h, 18); ctx.fill();
    ctx.fillStyle = '#4db2e8';
    ctx.beginPath(); ctx.ellipse(p.x + p.w * 0.68, p.y + p.h * 0.62, 42, 26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.ellipse(p.x + p.w * 0.68, p.y + p.h * 0.62, 30, 16, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Beach sand + sea base.
  ctx.fillStyle = '#f2d492';
  ctx.fillRect(city.sand.x0, 0, city.sand.x1 - city.sand.x0, 3200);
  ctx.fillStyle = 'rgba(180,130,60,0.35)';
  for (let i = 0; i < 900; i++) {
    const x = city.sand.x0 + Math.random() * (city.sand.x1 - city.sand.x0);
    const y = Math.random() * 3200;
    ctx.fillRect(x, y, 2, 2);
  }
  const seaGrad = ctx.createLinearGradient(city.sea.x0, 0, 3200, 0);
  seaGrad.addColorStop(0, '#19b8c4');
  seaGrad.addColorStop(0.5, '#0e8fb8');
  seaGrad.addColorStop(1, '#0b5f9e');
  ctx.fillStyle = seaGrad;
  ctx.fillRect(city.sea.x0, 0, 3200 - city.sea.x0, 3200);
  // Harbor water.
  const hw = city.harborWater;
  ctx.fillStyle = '#1b8fb5';
  ctx.fillRect(hw.x, hw.y, hw.w, hw.h);
  ctx.fillStyle = '#2aa5c9';
  ctx.fillRect(hw.x, hw.y, hw.w, 26);

  // Roads: asphalt, edge lines, center dashes, zebra crossings.
  ctx.fillStyle = '#3a3f4a';
  for (const v of city.roads.vertical) ctx.fillRect(v.x - 26, v.from, 52, v.to - v.from);
  for (const h of city.roads.horizontal) ctx.fillRect(h.from, h.y - 26, h.to - h.from, 52);
  ctx.strokeStyle = '#f7c948';
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 18]);
  for (const v of city.roads.vertical) {
    ctx.beginPath(); ctx.moveTo(v.x, v.from); ctx.lineTo(v.x, v.to); ctx.stroke();
  }
  for (const h of city.roads.horizontal) {
    ctx.beginPath(); ctx.moveTo(h.from, h.y); ctx.lineTo(h.to, h.y); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  for (const v of city.roads.vertical) {
    ctx.beginPath(); ctx.moveTo(v.x - 22, v.from); ctx.lineTo(v.x - 22, v.to); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(v.x + 22, v.from); ctx.lineTo(v.x + 22, v.to); ctx.stroke();
  }
  for (const h of city.roads.horizontal) {
    ctx.beginPath(); ctx.moveTo(h.from, h.y - 22); ctx.lineTo(h.to, h.y - 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h.from, h.y + 22); ctx.lineTo(h.to, h.y + 22); ctx.stroke();
  }
  // Zebra crossings at every intersection.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const n of city.graph.nodes.values()) {
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(n.x - 24 + i * 10, n.y - 34, 6, 12);
      ctx.fillRect(n.x - 24 + i * 10, n.y + 22, 6, 12);
    }
  }
  // Sidewalk blocks between roads in downtown.
  ctx.fillStyle = '#d9d2c2';
  for (let i = 0; i + 1 < 4; i++) {
    for (let j = 0; j + 1 < 4; j++) {
      const x0 = [1100, 1500, 1900][i], x1 = [1500, 1900, 2300][i];
      const y0 = [300, 700, 1100][j], y1 = [700, 1100, 1500][j];
      ctx.fillRect(x0 - 26, y0 - 26, x1 - x0 + 52, y1 - y0 + 52);
    }
  }

  // Buildings: long soft shadow, colored body, dark roof, lit windows.
  for (const b of city.buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(b.x + b.tall * 0.4, b.y + b.tall * 0.4, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(b.x, b.y, b.w, 8);
    // Roof in the building's own hue, darker — never flat navy, so the city
    // stays colorful and sun-soaked instead of reading as night.
    ctx.fillStyle = shade(b.color, 0.72);
    ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    // AC boxes on the roof.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(b.x + 14, b.y + 14, 16, 12);
    ctx.fillRect(b.x + b.w - 34, b.y + b.h - 30, 18, 12);
    // Windows around the facade.
    const cols = Math.max(2, Math.floor(b.w / 26));
    const rows = Math.max(2, Math.floor(b.h / 30));
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        const wx = b.x + 10 + cx * ((b.w - 20) / cols);
        const wy = b.y + 12 + cy * ((b.h - 24) / rows);
        const lit = ((cx * 7 + cy * 13 + Math.floor(b.seed * 90)) % 5) < 2;
        ctx.fillStyle = lit ? '#ffd166' : '#22314f';
        ctx.fillRect(wx, wy, 10, 13);
      }
    }
  }
  // Houses.
  for (const h of city.houses) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(h.x + 5, h.y + 5, h.w, h.h);
    ctx.fillStyle = h.color;
    ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.fillStyle = h.roof;
    ctx.beginPath();
    ctx.moveTo(h.x - 4, h.y + 14);
    ctx.lineTo(h.x + h.w / 2, h.y - 12);
    ctx.lineTo(h.x + h.w + 4, h.y + 14);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(h.x + 8, h.y + 18, 9, 10);
    ctx.fillRect(h.x + h.w - 17, h.y + 18, 9, 10);
  }
  // Umbrellas on the sand.
  for (const u of city.umbrellas) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(u.x + 4, u.y + 5, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = u.color;
    ctx.beginPath(); ctx.arc(u.x, u.y, 15, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(u.x, u.y, 15, Math.PI, 0); ctx.closePath();
    ctx.fillStyle = u.color;
    ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(u.x - 15, u.y); ctx.lineTo(u.x, u.y - 15); ctx.closePath(); ctx.fill();
  }
  // Harbor containers + docks + cranes.
  for (const cn of city.containers) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(cn.x + 3, cn.y + 3, cn.w, cn.h);
    ctx.fillStyle = cn.color;
    ctx.fillRect(cn.x, cn.y, cn.w, cn.h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 1; i < 5; i++) ctx.fillRect(cn.x + i * 11, cn.y, 2, cn.h);
    if (cn.stack) {
      ctx.fillStyle = shade(cn.color, 0.75);
      ctx.fillRect(cn.x + 4, cn.y - 12, cn.w - 8, 12);
    }
  }
  ctx.fillStyle = '#8a6b46';
  ctx.fillRect(620, 2500, 26, 560);
  ctx.fillStyle = '#a67c52';
  for (let y = 2500; y < 3060; y += 40) ctx.fillRect(620, y, 26, 4);
  for (const cr of city.cranes) {
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(cr.x - 10, cr.y - cr.h, 20, cr.h);
    ctx.fillRect(cr.x - 10, cr.y - cr.h, 120, 14);
    ctx.fillStyle = '#d9a514';
    ctx.fillRect(cr.x + 96, cr.y - cr.h + 14, 4, 60);
    ctx.fillRect(cr.x + 96, cr.y - cr.h + 70, 16, 12);
  }
  staticLayer = c;
}

export function buildMiniBase(city) {
  const c = document.createElement('canvas');
  c.width = 200; c.height = 200;
  const ctx = c.getContext('2d');
  const s = 200 / 3200;
  ctx.fillStyle = '#69b578';
  ctx.fillRect(0, 0, 200, 200);
  ctx.fillStyle = '#f2d492';
  ctx.fillRect(city.sand.x0 * s, 0, (city.sand.x1 - city.sand.x0) * s, 200);
  ctx.fillStyle = '#0e8fb8';
  ctx.fillRect(city.sea.x0 * s, 0, 200 - city.sea.x0 * s, 200);
  ctx.fillStyle = '#1b8fb5';
  ctx.fillRect(city.harborWater.x * s, city.harborWater.y * s, city.harborWater.w * s, city.harborWater.h * s);
  ctx.strokeStyle = '#3a3f4a';
  ctx.lineWidth = 2;
  for (const v of city.roads.vertical) {
    ctx.beginPath(); ctx.moveTo(v.x * s, v.from * s); ctx.lineTo(v.x * s, v.to * s); ctx.stroke();
  }
  for (const h of city.roads.horizontal) {
    ctx.beginPath(); ctx.moveTo(h.from * s, h.y * s); ctx.lineTo(h.to * s, h.y * s); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (const b of city.buildings) ctx.fillRect(b.x * s, b.y * s, Math.max(2, b.w * s), Math.max(2, b.h * s));
  miniBase = c;
}

function drawCar(ctx, x, y, angle, color, opts) {
  opts = opts || {};
  const w = opts.w || 46, h = opts.h || 23;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(3, 4, w / 2, h / 2 + 2, 0, 0, Math.PI * 2); ctx.fill();
  // Body.
  ctx.fillStyle = color;
  rr(ctx, -w / 2, -h / 2, w, h, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  rr(ctx, -w / 2, -h / 2, w, 5, 6); ctx.fill();
  // Roof + windshield.
  ctx.fillStyle = shade(color, 0.72);
  rr(ctx, -w * 0.18, -h / 2 + 3, w * 0.36, h - 6, 4); ctx.fill();
  ctx.fillStyle = '#bfe8ff';
  ctx.fillRect(w * 0.2, -h / 2 + 4, 5, h - 8);
  // Headlights / taillights.
  ctx.fillStyle = '#fff7ae';
  ctx.fillRect(w / 2 - 2, -h / 2 + 2, 3, 4);
  ctx.fillRect(w / 2 - 2, h / 2 - 6, 3, 4);
  ctx.fillStyle = '#ff2e2e';
  ctx.fillRect(-w / 2 - 1, -h / 2 + 2, 3, 4);
  ctx.fillRect(-w / 2 - 1, h / 2 - 6, 3, 4);
  if (opts.police) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-w * 0.1, -h / 2 + 1, w * 0.2, h - 2);
    const flash = Math.floor(performance.now() / 260) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2e2e' : '#2e6bff';
    ctx.beginPath(); ctx.arc(-2, -h / 2 + 1, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = flash ? '#2e6bff' : '#ff2e2e';
    ctx.beginPath(); ctx.arc(6, -h / 2 + 1, 4, 0, Math.PI * 2); ctx.fill();
  }
  if (opts.sport) {
    ctx.fillStyle = '#111827';
    ctx.fillRect(-w / 2 - 6, -h / 2 + 1, 4, h - 2);
  }
  ctx.restore();
}

function drawPerson(ctx, x, y, angle, shirt, bob, isPlayer) {
  ctx.save();
  ctx.translate(x, y);
  const b = Math.sin(bob) * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(2, 5, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(angle);
  ctx.fillStyle = shirt;
  rr(ctx, -7, -8 + b * 0.3, 14, 16, 6); ctx.fill();
  ctx.fillStyle = '#f2c89b';
  ctx.beginPath(); ctx.arc(10, 0, 6.5, 0, Math.PI * 2); ctx.fill();
  if (isPlayer) {
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(10, -1, 7, Math.PI, 0); ctx.fill();
  }
  ctx.restore();
}

export function drawGame(G) {
  const ctx = G.ctx, view = G.view, cam = G.camera;
  const time = G.time;
  ctx.clearRect(0, 0, view.w, view.h);
  ctx.save();
  ctx.translate(view.w / 2, view.h / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  // Static city.
  if (staticLayer) {
    const vx0 = Math.max(0, cam.x - view.w / 2 / cam.zoom - 40);
    const vy0 = Math.max(0, cam.y - view.h / 2 / cam.zoom - 40);
    const vw = Math.min(3200 - vx0, view.w / cam.zoom + 80);
    const vh = Math.min(3200 - vy0, view.h / cam.zoom + 80);
    ctx.drawImage(staticLayer, vx0, vy0, vw, vh, vx0, vy0, vw, vh);
  }

  // Animated sea foam along the shore.
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 3;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    for (let y = 0; y <= 3200; y += 60) {
      const x = 2960 + k * 26 + Math.sin(y * 0.012 + time * 1.4 + k * 2) * 10;
      if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Traffic lights.
  for (const l of G.city.lights) {
    if (Math.abs(l.x - cam.x) > view.w / 2 / cam.zoom + 60 || Math.abs(l.y - cam.y) > view.h / 2 / cam.zoom + 60) continue;
    const st = lightState(l, time);
    ctx.fillStyle = '#222';
    ctx.fillRect(l.x + 30, l.y - 34, 10, 26);
    ctx.fillStyle = st === 0 ? '#2ed573' : '#333';
    ctx.beginPath(); ctx.arc(l.x + 35, l.y - 28, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = (st === 1 || st === 3) ? '#f7c948' : '#333';
    ctx.beginPath(); ctx.arc(l.x + 35, l.y - 21, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = st === 2 ? '#ff4757' : '#333';
    ctx.beginPath(); ctx.arc(l.x + 35, l.y - 14, 3.4, 0, Math.PI * 2); ctx.fill();
  }

  // Swaying palms.
  for (const pl of G.city.palms) {
    if (Math.abs(pl.x - cam.x) > view.w / 2 / cam.zoom + 80 || Math.abs(pl.y - cam.y) > view.h / 2 / cam.zoom + 80) continue;
    const sway = Math.sin(time * 1.2 + pl.sway) * 0.14;
    ctx.strokeStyle = '#8a6b46';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(pl.x, pl.y); ctx.lineTo(pl.x + 3, pl.y - 26); ctx.stroke();
    ctx.strokeStyle = '#2fae4e';
    ctx.lineWidth = 3;
    for (let f = 0; f < 5; f++) {
      const a = -Math.PI / 2 + (f - 2) * 0.5 + sway;
      ctx.beginPath(); ctx.moveTo(pl.x + 3, pl.y - 26);
      ctx.quadraticCurveTo(pl.x + 3 + Math.cos(a) * 12, pl.y - 26 + Math.sin(a) * 12, pl.x + 3 + Math.cos(a) * 22, pl.y - 26 + Math.sin(a) * 22 + 6);
      ctx.stroke();
    }
    ctx.fillStyle = '#6b4f2a';
    ctx.beginPath(); ctx.arc(pl.x + 3, pl.y - 26, 4, 0, Math.PI * 2); ctx.fill();
  }

  // Mission marker: pulsing beacon + ring.
  const obj = G.objective;
  if (obj && G.state === 'play') {
    const pulse = 1 + Math.sin(time * 4) * 0.12;
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(obj.x, obj.y, 34 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,209,102,0.25)';
    ctx.beginPath(); ctx.arc(obj.x, obj.y, 34 * pulse, 0, Math.PI * 2); ctx.fill();
    const grad = ctx.createLinearGradient(obj.x, obj.y - 130, obj.x, obj.y);
    grad.addColorStop(0, 'rgba(255,209,102,0)');
    grad.addColorStop(1, 'rgba(255,209,102,0.75)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(obj.x - 13, obj.y - 130);
    ctx.lineTo(obj.x + 13, obj.y - 130);
    ctx.lineTo(obj.x, obj.y - 8);
    ctx.closePath(); ctx.fill();
  }

  // Parked cars.
  if (G.parkedCar) drawCar(ctx, G.parkedCar.x, G.parkedCar.y, G.parkedCar.angle, G.parkedCar.color, {});
  // Sports car + player car read bigger on the contact sheet.
  if (G.sportCar && !G.sportCar.taken) drawCar(ctx, G.sportCar.x, G.sportCar.y, G.sportCar.angle, '#ff2e4d', { sport: true, w: 48, h: 23 });

  // Traffic + police.
  for (const t of G.traffic) drawCar(ctx, t.x, t.y, t.angle, t.color, {});
  for (const c of G.policeCars) drawCar(ctx, c.x, c.y, c.angle, '#1f2937', { police: true });

  // Pedestrians, foot cops, guards.
  for (const ped of G.peds) {
    if (ped.dead) continue;
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.shirt, ped.bob, false);
  }
  for (const c of G.footCops) drawPerson(ctx, c.x, c.y, c.angle, '#1f2937', time * 8, false);
  for (const g of G.guards) {
    if (g.dead) continue;
    drawPerson(ctx, g.x, g.y, g.angle, '#7f1d1d', time * 8, false);
    ctx.fillStyle = '#111';
    ctx.fillRect(g.x - 8, g.y - 16, 16, 3);
    ctx.fillStyle = '#ff4757';
    ctx.fillRect(g.x - 8, g.y - 16, 16 * (g.hp / 3), 3);
  }

  // Player.
  const p = G.player;
  if (p.onFoot) {
    drawPerson(ctx, p.x, p.y, p.angle, '#ff8c1a', time * 9, true);
  } else if (p.car) {
    drawCar(ctx, p.car.x, p.car.y, p.car.angle, p.car.color, { sport: !!p.car.sport, w: p.car.sport ? 48 : 46, h: 23, police: p.car.kind === 'police' });
  }

  // Bullets.
  ctx.strokeStyle = '#ffe14d';
  ctx.lineWidth = 3;
  for (const b of G.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Pickups.
  for (const k of G.pickups) {
    const bobY = Math.sin(time * 3 + k.x) * 3;
    if (k.kind === 'medkit') {
      ctx.fillStyle = '#fff';
      rr(ctx, k.x - 10, k.y - 10 + bobY, 20, 20, 4); ctx.fill();
      ctx.fillStyle = '#e63946';
      ctx.fillRect(k.x - 7, k.y - 2 + bobY, 14, 5);
      ctx.fillRect(k.x - 2.5, k.y - 7 + bobY, 5, 14);
    } else {
      ctx.fillStyle = '#2ed573';
      rr(ctx, k.x - 9, k.y - 6 + bobY, 18, 12, 3); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', k.x, k.y + 3 + bobY);
    }
  }

  // Particles.
  for (const pt of G.particles) {
    const a = 1 - pt.life / pt.max;
    if (pt.kind === 'smoke' || pt.kind === 'exhaust') {
      ctx.fillStyle = 'rgba(120,120,120,' + (a * 0.5) + ')';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (1 + pt.life), 0, Math.PI * 2); ctx.fill();
    } else if (pt.kind === 'fire') {
      ctx.fillStyle = 'rgba(255,' + Math.floor(lerp(90, 180, a)) + ',30,' + a + ')';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * a + 2, 0, Math.PI * 2); ctx.fill();
    } else if (pt.kind === 'spark') {
      ctx.strokeStyle = 'rgba(255,220,80,' + a + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(pt.x - pt.vx * 0.03, pt.y - pt.vy * 0.03); ctx.stroke();
    } else if (pt.kind === 'muzzle') {
      ctx.fillStyle = 'rgba(255,230,120,' + a + ')';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 9 * a + 2, 0, Math.PI * 2); ctx.fill();
    } else if (pt.kind === 'skid') {
      ctx.fillStyle = 'rgba(20,20,20,' + (a * 0.45) + ')';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.restore();

  // Sun glare + vignette, screen space.
  const glare = ctx.createRadialGradient(view.w * 0.12, view.h * 0.1, 40, view.w * 0.12, view.h * 0.1, view.w * 0.55);
  glare.addColorStop(0, 'rgba(255,236,170,0.20)');
  glare.addColorStop(1, 'rgba(255,236,170,0)');
  ctx.fillStyle = glare;
  ctx.fillRect(0, 0, view.w, view.h);
  const vg = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.45, view.w / 2, view.h / 2, view.h * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(10,10,40,0.22)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, view.w, view.h);
}

export function drawMinimap(G) {
  const cv = G.minimapCanvas;
  if (!cv || !miniBase) return;
  const ctx = cv.getContext('2d');
  const s = 200 / 3200;
  ctx.clearRect(0, 0, 200, 200);
  ctx.drawImage(miniBase, 0, 0);
  // Viewport rect.
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    (G.camera.x - G.view.w / 2 / G.camera.zoom) * s,
    (G.camera.y - G.view.h / 2 / G.camera.zoom) * s,
    (G.view.w / G.camera.zoom) * s, (G.view.h / G.camera.zoom) * s,
  );
  // Objective.
  if (G.objective && G.state === 'play') {
    const pulse = 5 + Math.sin(G.time * 5) * 2;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(G.objective.x * s, G.objective.y * s, pulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }
  // Police.
  const flash = Math.floor(G.time * 3) % 2 === 0;
  ctx.fillStyle = flash ? '#ff2e2e' : '#2e6bff';
  for (const c of G.policeCars) {
    ctx.beginPath(); ctx.arc(c.x * s, c.y * s, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  // Player arrow.
  const p = G.player;
  ctx.save();
  ctx.translate(p.x * s, p.y * s);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -5); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
