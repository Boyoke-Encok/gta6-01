// Everything drawn: the city, the actors, the markers, the minimap and the
// DOM HUD. Reads the game state G; never mutates it except the toast list.
import { clamp, lerp, dist, fmtMoney, fmtClock, fmtTimer } from './util.js';
import { WORLD, ROAD_V, ROAD_H, ROAD_W, PLACES } from './city.js';

const VIEW_W = 1280, VIEW_H = 800;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawCarShape(ctx, x, y, angle, color, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  rr(ctx, -21, -9, 44, 22, 6); ctx.fill();
  ctx.translate(0, -2);
  ctx.fillStyle = '#111';
  rr(ctx, -20, -12, 42, 24, 6); ctx.fill();
  ctx.fillStyle = color;
  rr(ctx, -21, -11, 44, 22, 6); ctx.fill();
  ctx.fillStyle = 'rgba(20,30,45,0.85)';
  rr(ctx, -8, -9, 14, 18, 3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  rr(ctx, 8, -9, 6, 18, 2); ctx.fill();
  if (opts.cop) {
    ctx.fillStyle = '#eee';
    rr(ctx, -6, -11, 12, 22, 3); ctx.fill();
    const flash = Math.floor(opts.time * 6) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2d2d' : '#2d5bff';
    rr(ctx, -4, -11, 8, 5, 2); ctx.fill();
    ctx.fillStyle = flash ? '#2d5bff' : '#ff2d2d';
    rr(ctx, -4, 6, 8, 5, 2); ctx.fill();
  }
  if (opts.gold) { ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; rr(ctx, -21, -11, 44, 22, 6); ctx.stroke(); }
  if (opts.disabled) { ctx.fillStyle = 'rgba(60,60,60,0.6)'; rr(ctx, -21, -11, 44, 22, 6); ctx.fill(); }
  ctx.restore();
}
export function drawWorld(ctx, G) {
  const cam = G.camera;
  const x0 = Math.max(0, cam.x - VIEW_W / 2 - 60), y0 = Math.max(0, cam.y - VIEW_H / 2 - 60);
  const x1 = Math.min(WORLD, cam.x + VIEW_W / 2 + 60), y1 = Math.min(WORLD, cam.y + VIEW_H / 2 + 60);
  ctx.fillStyle = '#67755c';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // Sea + beach (south) and harbor basin (east).
  ctx.fillStyle = '#2f6f9f';
  ctx.fillRect(x0, Math.max(y0, 3100), x1 - x0, y1 - Math.max(y0, 3100));
  ctx.fillRect(Math.max(x0, 3080), Math.max(y0, 300), Math.min(x1, WORLD) - Math.max(x0, 3080), Math.min(y1, 1500) - Math.max(y0, 300));
  ctx.fillStyle = '#e0c98f';
  ctx.fillRect(x0, Math.max(y0, 3000), x1 - x0, Math.min(y1, 3100) - Math.max(y0, 3000));
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const wy = 3120 + i * 16 + Math.sin(G.time * 1.2 + i * 2) * 3;
    if (wy < y0 || wy > y1) continue;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 40) ctx.lineTo(x, wy + Math.sin(x * 0.02 + G.time + i) * 2);
    ctx.stroke();
  }
  // City blocks.
  const edges = [200, 700, 1300, 1900, 2500, 3000];
  for (let bi = 0; bi < 5; bi++) for (let bj = 0; bj < 5; bj++) {
    const bx0 = edges[bi] + ROAD_W / 2 + 4, bx1 = edges[bi + 1] - ROAD_W / 2 - 4;
    const by0 = edges[bj] + ROAD_W / 2 + 4, by1 = edges[bj + 1] - ROAD_W / 2 - 4;
    if (bx1 < x0 || bx0 > x1 || by1 < y0 || by0 > y1) continue;
    const park = (bi === 1 && bj === 3) || (bi === 3 && bj === 1);
    ctx.fillStyle = park ? '#4f7a45' : (by0 > 2900 ? '#d8c088' : '#7a7d78');
    ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
  }
  // Harbor docks.
  ctx.fillStyle = '#8a6a45';
  for (const dy of [600, 900, 1200]) ctx.fillRect(3000, dy - 14, 150, 28);
  ctx.strokeStyle = '#5a4630'; ctx.lineWidth = 2;
  for (const dy of [600, 900, 1200]) for (let x = 3020; x < 3150; x += 22) { ctx.beginPath(); ctx.moveTo(x, dy - 14); ctx.lineTo(x, dy + 14); ctx.stroke(); }
  // Roads: sidewalk underlay, asphalt, then dashed centers between crossings.
  for (const x of ROAD_V) {
    ctx.fillStyle = '#9aa0a3'; ctx.fillRect(x - ROAD_W / 2 - 8, 200, ROAD_W + 16, 2800);
    ctx.fillStyle = '#3a3d42'; ctx.fillRect(x - ROAD_W / 2, 200, ROAD_W, 2800);
  }
  for (const y of ROAD_H) {
    ctx.fillStyle = '#9aa0a3'; ctx.fillRect(200, y - ROAD_W / 2 - 8, 2800, ROAD_W + 16);
    ctx.fillStyle = '#3a3d42'; ctx.fillRect(200, y - ROAD_W / 2, 2800, ROAD_W);
  }
  ctx.fillStyle = '#d8b93c';
  const dash = (x, y, w, h) => ctx.fillRect(x, y, w, h);
  for (const x of ROAD_V) {
    for (let y = 230; y < 2980; y += 64) {
      if (ROAD_H.some((hy) => Math.abs(y - hy) < 70)) continue;
      dash(x - 3, y, 6, 32);
    }
  }
  for (const y of ROAD_H) {
    for (let x = 230; x < 2980; x += 64) {
      if (ROAD_V.some((vx) => Math.abs(x - vx) < 70)) continue;
      dash(x, y - 3, 32, 6);
    }
  }
  // Buildings, trees, cranes.
  for (const b of G.city.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    if (b.kind === 'tower') {
      ctx.fillStyle = 'rgba(255,255,180,0.5)';
      const cols = Math.max(2, Math.floor(b.w / 26)), rows = Math.max(2, Math.floor(b.h / 26));
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        if ((i * 7 + j * 3 + b.hgt) % 3 === 0) ctx.fillRect(b.x + 8 + i * 26, b.y + 8 + j * 26, 9, 11);
      }
    } else if (b.kind === 'container') {
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(b.x + (b.w / 5) * i, b.y); ctx.lineTo(b.x + (b.w / 5) * i, b.y + b.h); ctx.stroke(); }
    }
  }
  for (const t of G.city.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    ctx.fillStyle = '#2f6b2f';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a8a3a';
    ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#333'; ctx.lineWidth = 5;
  for (const [cx, cy] of [[3060, 500], [3060, 1050]]) {
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 120); ctx.moveTo(cx - 40, cy - 120); ctx.lineTo(cx + 60, cy - 120); ctx.stroke();
  }
}
export function drawEntities(ctx, G) {
  const p = G.player;
  const cam = G.camera;
  const inView = (x, y, m = 80) => x > cam.x - VIEW_W / 2 - m && x < cam.x + VIEW_W / 2 + m && y > cam.y - VIEW_H / 2 - m && y < cam.y + VIEW_H / 2 + m;
  // Mission marker beacon + edge arrow.
  const mk = G.missionMgr.marker();
  if (mk && G.state === 'playing' && !G.freeRoam) {
    const pulse = 1 + Math.sin(G.time * 5) * 0.15;
    ctx.save();
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mk.x, mk.y, 34 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,215,0,0.25)';
    ctx.beginPath(); ctx.arc(mk.x, mk.y, 34 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(mk.x, mk.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,215,0,0.08)';
    ctx.fillRect(mk.x - 3, mk.y - 260, 6, 260);
    ctx.restore();
    if (!inView(mk.x, mk.y, -40)) {
      const sx = clamp(mk.x, cam.x - VIEW_W / 2 + 40, cam.x + VIEW_W / 2 - 40);
      const sy = clamp(mk.y, cam.y - VIEW_H / 2 + 40, cam.y + VIEW_H / 2 - 40);
      const a = Math.atan2(mk.y - sy, mk.x - sx);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a);
      ctx.fillStyle = '#ffd700';
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -11); ctx.lineTo(-10, 11); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  for (const pk of G.pickups) {
    if (!inView(pk.x, pk.y)) continue;
    const bob = Math.sin(pk.bob) * 3;
    if (pk.type === 'med') {
      ctx.fillStyle = '#fff';
      rr(ctx, pk.x - 11, pk.y - 11 + bob, 22, 22, 4); ctx.fill();
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(pk.x - 3, pk.y - 8 + bob, 6, 16);
      ctx.fillRect(pk.x - 8, pk.y - 3 + bob, 16, 6);
    } else {
      ctx.fillStyle = '#27ae60';
      ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', pk.x, pk.y + bob + 0.5);
    }
  }
  for (const pd of G.peds) {
    if (!inView(pd.x, pd.y)) continue;
    const bob = pd.dead ? 0 : Math.sin(pd.walkPhase) * 2;
    ctx.save(); ctx.translate(pd.x, pd.y + bob);
    if (pd.dead) { ctx.rotate(Math.PI / 2); ctx.fillStyle = '#7a2020'; }
    else ctx.fillStyle = pd.color;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0c8a0';
    ctx.beginPath(); ctx.arc(Math.cos(pd.angle) * 4, Math.sin(pd.angle) * 4, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  for (const c of G.cars) {
    if (!inView(c.x, c.y)) continue;
    if (c === p.car) continue;
    drawCarShape(ctx, c.x, c.y, c.angle, c.color, { gold: c.kind === 'gold', disabled: c.disabled });
  }
  for (const c of G.cops) {
    if (!inView(c.x, c.y)) continue;
    drawCarShape(ctx, c.x, c.y, c.angle, '#1a1a2e', { cop: true, time: G.time, disabled: c.disabled });
    if (c.disabled) {
      ctx.fillStyle = 'rgba(120,120,120,0.5)';
      ctx.beginPath(); ctx.arc(c.x + Math.sin(G.time * 3) * 6, c.y - 14, 10, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (const g of G.gang) {
    if (g.hp <= 0 || !inView(g.x, g.y)) continue;
    ctx.save(); ctx.translate(g.x, g.y);
    ctx.fillStyle = '#8e1f1f';
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(g.angle) * 22, Math.sin(g.angle) * 22); ctx.stroke();
    ctx.fillStyle = '#f0c8a0';
    ctx.beginPath(); ctx.arc(Math.cos(g.angle) * 5, Math.sin(g.angle) * 5, 5, 0, Math.PI * 2); ctx.fill();
    if (g.hp < 100) {
      ctx.fillStyle = '#333'; ctx.fillRect(-14, -22, 28, 5);
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(-14, -22, 28 * (g.hp / 100), 5);
    }
    ctx.restore();
  }
  // Player.
  if (p.onFoot) {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 4, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(p.angle) * 24, Math.sin(p.angle) * 24); ctx.stroke();
    ctx.fillStyle = '#f0c8a0';
    ctx.beginPath(); ctx.arc(Math.cos(p.angle) * 5, Math.sin(p.angle) * 5, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (p.car) {
    drawCarShape(ctx, p.car.x, p.car.y, p.car.angle, '#e74c3c', {});
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('RAE', p.car.x, p.car.y - 20);
  }
  for (const t of G.tracers) {
    ctx.strokeStyle = 'rgba(255,220,80,' + (t.life / 0.09) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
  }
  for (const pt of G.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
export function drawMinimap(G) {
  const mm = document.getElementById('minimap');
  if (!mm) return;
  const ctx = mm.getContext('2d');
  const s = 180 / WORLD;
  ctx.clearRect(0, 0, 180, 180);
  ctx.fillStyle = '#3a4a35'; ctx.fillRect(0, 0, 180, 180);
  ctx.fillStyle = '#2f6f9f'; ctx.fillRect(0, 3100 * s, 180, 100 * s);
  ctx.fillStyle = '#e0c98f'; ctx.fillRect(0, 3000 * s, 180, 100 * s);
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
  for (const x of ROAD_V) { ctx.beginPath(); ctx.moveTo(x * s, 200 * s); ctx.lineTo(x * s, 3000 * s); ctx.stroke(); }
  for (const y of ROAD_H) { ctx.beginPath(); ctx.moveTo(200 * s, y * s); ctx.lineTo(3000 * s, y * s); ctx.stroke(); }
  ctx.fillStyle = '#888';
  for (const b of G.city.buildings) ctx.fillRect(b.x * s, b.y * s, Math.max(1, b.w * s), Math.max(1, b.h * s));
  const mk = G.missionMgr.marker();
  if (mk && G.state === 'playing' && !G.freeRoam) {
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(mk.x * s, mk.y * s, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#ff2d2d';
  for (const c of G.cops) { ctx.beginPath(); ctx.arc(c.x * s, c.y * s, 2.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(G.player.x * s, G.player.y * s, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(G.player.x * s, G.player.y * s, 5, 0, Math.PI * 2); ctx.stroke();
}
// --- HUD ----------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
export function updateHUD(G) {
  const p = G.player;
  const stars = $('stars');
  if (stars) {
    stars.textContent = '★'.repeat(G.wanted) + '☆'.repeat(5 - G.wanted);
    stars.className = 'stars' + (G.wanted >= 3 ? ' hot' : '');
  }
  const hf = $('health-fill');
  if (hf) {
    hf.style.width = Math.max(0, p.health) + '%';
    hf.className = 'health-fill' + (p.health < 30 ? ' low' : '');
  }
  const hn = $('health-num');
  if (hn) hn.textContent = Math.ceil(p.health);
  const money = $('money');
  if (money) money.textContent = fmtMoney(p.money);
  const score = $('score');
  if (score) score.textContent = 'Score ' + Math.floor(G.score);
  const clock = $('clock');
  if (clock) clock.textContent = fmtClock(G.clock);
  // Mission banner lives top-center, clear of the money readout top-right.
  const banner = $('mission-banner');
  if (banner) {
    const m = G.missionMgr;
    if (G.state === 'playing' && !G.freeRoam && m.current()) {
      banner.style.display = 'block';
      $('mission-text').textContent = m.objectiveText();
      const t = $('mission-timer');
      if (m.timer !== Infinity) { t.style.display = 'inline'; t.textContent = '⏱ ' + fmtTimer(m.timer); }
      else t.style.display = 'none';
      const hold = m.step();
      const hb = $('hold-bar');
      if (hold && hold.type === 'hold' && m.hold > 0) {
        hb.style.display = 'block';
        hb.firstElementChild.style.width = (m.hold / hold.holdTime * 100) + '%';
      } else hb.style.display = 'none';
    } else if (G.state === 'playing' && G.freeRoam) {
      banner.style.display = 'block';
      $('mission-text').textContent = 'Free roam — press F to resume jobs';
      $('mission-timer').style.display = 'none';
      $('hold-bar').style.display = 'none';
    } else banner.style.display = 'none';
  }
  const toasts = $('toasts');
  if (toasts) {
    const now = G.time;
    G.toasts = G.toasts.filter((t) => now - t.at < 4);
    toasts.innerHTML = G.toasts.slice(-3).map((t) => '<div class="toast">' + t.text + '</div>').join('');
  }
  // Minimap only exists while playing; otherwise it would sit empty.
  const mm = $('minimap');
  if (mm) mm.style.display = (G.state === 'playing' || G.state === 'paused' || G.state === 'panel') ? 'block' : 'none';
  // Overlays.
  const show = (id, on) => { const el = $(id); if (el) el.style.display = on ? 'flex' : 'none'; };
  show('overlay-menu', G.state === 'menu');
  show('overlay-pause', G.state === 'paused');
  show('overlay-busted', G.state === 'busted');
  show('overlay-wasted', G.state === 'wasted');
  show('overlay-win', G.state === 'win');
  show('overlay-panel', G.state === 'panel');
  if (G.state === 'menu') {
    const best = $('menu-best');
    if (best) best.textContent = G.save.best > 0 ? 'Best take: ' + fmtMoney(G.save.best) + ' · furthest job: M' + (G.save.furthest || 1) : 'No jobs run yet. Six jobs. One city.';
    const cont = $('btn-continue');
    if (cont) cont.style.display = G.save.furthest > 1 ? 'inline-block' : 'none';
  }
  if (G.state === 'win') {
    const wm = $('win-money');
    if (wm) wm.textContent = fmtMoney(p.money);
  }
  if (G.state === 'panel') {
    const list = $('panel-list');
    if (list) {
      const { MISSIONS } = G;
      list.innerHTML = MISSIONS.map((m, i) => {
        const st = i < G.missionMgr.index || G.missionMgr.done ? 'done' : i === G.missionMgr.index ? 'current' : 'locked';
        return '<div class="panel-row ' + st + '"><span>M' + m.id + ' · ' + m.name + '</span><span>' + fmtMoney(m.reward) + ' · ' + st + '</span></div>';
      }).join('');
    }
  }
}
