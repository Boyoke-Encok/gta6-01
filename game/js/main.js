// Solmar Heat: game loop, state machine, save/load, debug hooks and the
// ?shot= staging the screenshot harness uses. Owns the state G every other
// module reads. No network, no libraries: canvas + ES modules only.
import { clamp, lerp, fmtMoney } from './util.js';
import { WORLD, buildCity, PLACES, nearestRoad } from './city.js';
import { SoundEngine } from './audio.js';
import { Input } from './input.js';
import {
  CAR_COLORS, makeCar, spawnTraffic, spawnParked, spawnPeds, spawnPickups,
  updatePlayer, updateTraffic, updatePeds, updateCops, updateGang,
  updatePickups, updateParticles, damagePlayer, exitCar,
} from './entities.js';
import { MissionManager, MISSIONS } from './missions.js';
import { drawWorld, drawEntities, drawMinimap, updateHUD } from './render.js';

const SAVE_KEY = 'solmar_heat_save';
const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || '1') || 1;
const SHOT = params.get('shot') || '';

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push('rejection: ' + String(e.reason)));

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const G = {
  state: 'menu',
  time: 0,
  clock: 18 * 60,
  seed: SEED,
  city: buildCity(SEED),
  rng: Math.random,
  sound: new SoundEngine(),
  input: new Input(),
  player: null,
  cars: [],
  cops: [],
  peds: [],
  gang: [],
  pickups: [],
  particles: [],
  tracers: [],
  wanted: 0,
  crimeTimer: 0,
  bustT: 0,
  surroundT: 0,
  shootCd: 0,
  cashTimer: 30,
  missionsDone: 0,
  score: 0,
  camera: { x: 1600, y: 1600, shake: 0 },
  freeRoam: false,
  toasts: [],
  save: { best: 0, furthest: 1 },
  missionMgr: null,
  MISSIONS,
  goldCar: null,
  autoDrive: false,
  shotMode: SHOT,
};
G.toast = (text) => G.toasts.push({ text, at: G.time });
G.saveGame = () => {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch {}
};
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) { const s = JSON.parse(raw); if (s && typeof s.best === 'number') G.save = s; }
} catch {}
G.missionMgr = new MissionManager(G);

function resetWorld() {
  G.cars = spawnTraffic(G.city, Math.random, 16);
  G.cars.push(...spawnParked(G.city, Math.random, 10, [PLACES.spawn]));
  const gold = makeCar(PLACES.goldcar.x, PLACES.goldcar.y, 0, '#ffd700', 'gold');
  G.cars.push(gold);
  G.goldCar = gold;
  G.peds = spawnPeds(G.city, Math.random, 34);
  G.pickups = spawnPickups(G.city, Math.random);
  G.cops = [];
  G.gang = [];
  G.particles = [];
  G.tracers = [];
  G.wanted = 0; G.crimeTimer = 0; G.bustT = 0; G.surroundT = 0;
  G.cashTimer = 30;
  G.freeRoam = false;
  G.autoDrive = false;
}
function resetPlayer() {
  G.player = {
    x: PLACES.spawn.x, y: PLACES.spawn.y, angle: -Math.PI / 2, speed: 0,
    onFoot: true, car: null, health: 100, money: 0, kills: 0, lastHurt: -99,
  };
}
function newGame() {
  resetWorld();
  resetPlayer();
  G.missionsDone = 0;
  G.score = 0;
  G.clock = 18 * 60;
  G.missionMgr.start(0);
  G.state = 'playing';
  G.sound.init();
  G.sound.startMusic();
  G.camera.x = G.player.x; G.camera.y = G.player.y;
}
function continueGame() {
  newGame();
  const idx = Math.max(0, Math.min(5, (G.save.furthest || 1) - 1));
  G.missionMgr.start(idx);
  G.toast('Continuing at mission ' + (idx + 1));
}
function restartMission() {
  resetWorld();
  resetPlayer();
  G.player.money = G._keptMoney || 0;
  G.missionMgr.restartCurrent();
  G.state = 'playing';
  G.camera.x = G.player.x; G.camera.y = G.player.y;
}
function toMenu() {
  G.state = 'menu';
  G.sound.setSiren(0);
  G.sound.setEngine(0, false);
}
function setBusted() {
  if (G.state !== 'playing') return;
  if (G.player.car) { G.player.car = null; G.player.onFoot = true; }
  G.state = 'busted';
  G.sound.busted();
  G.sound.setSiren(0);
  G.sound.setEngine(0, false);
}
function setWasted() {
  if (G.state !== 'playing') return;
  G.state = 'wasted';
  G.sound.wasted();
  G.sound.setSiren(0);
  G.sound.setEngine(0, false);
}
function setWin() {
  G.state = 'win';
  G.sound.win();
  G.sound.setSiren(0);
  G.sound.setEngine(0, false);
  if (G.player.money > (G.save.best || 0)) { G.save.best = G.player.money; G.saveGame(); }
}

// --- debug hooks (also what the verification harness drives) ---------------
window.__game = {
  get state() { return G.state; },
  get wanted() { return G.wanted; },
  get money() { return G.player ? G.player.money : 0; },
  get health() { return G.player ? G.player.health : 0; },
  get missionsDone() { return G.missionsDone; },
  get score() { return G.score; },
  get player() { return G.player; },
  get errors() { return window.__errors; },
  warp(x, y) {
    const p = G.player;
    if (!p) return;
    p.x = clamp(x, 30, WORLD - 30);
    p.y = clamp(y, 30, WORLD - 30);
    if (p.car) { p.car.x = p.x; p.car.y = p.y; p.car.speed = 0; }
    G.bustT = 0; G.surroundT = 0;
    G.camera.x = p.x; G.camera.y = p.y;
  },
  giveCar(color) {
    const p = G.player;
    if (!p) return null;
    const c = makeCar(p.x + 40, p.y, p.angle, color || '#e74c3c', 'parked');
    G.cars.push(c);
    p.car = c; p.onFoot = false;
    p.x = c.x; p.y = c.y; p.angle = c.angle;
    return c;
  },
  setWanted(n) { G.wanted = clamp(n, 0, 5); G.crimeTimer = 0; },
  setHealth(n) { if (G.player) G.player.health = clamp(n, 0, 100); },
  startMission(i) {
    if (G.state === 'menu' || G.state === 'busted' || G.state === 'wasted') { G.state = 'playing'; }
    if (!G.player) resetPlayer();
    G.missionMgr.start(clamp(i, 0, 5));
  },
  completeMission() { G.missionMgr.completeMission(); },
  mission() {
    const m = G.missionMgr.current();
    const s = G.missionMgr.step();
    const mk = G.missionMgr.marker();
    return m ? { id: m.id, name: m.name, reward: m.reward, step: s ? s.type : null, label: s ? s.label : null, marker: mk, timer: G.missionMgr.timer, hold: G.missionMgr.hold } : null;
  },
  forceBusted() { setBusted(); },
  forceWasted() { if (G.player) G.player.health = 0; setWasted(); },
  newGame, toMenu,
};

// --- input: buttons + keys ---------------------------------------------------
document.getElementById('btn-new').addEventListener('click', () => { G.sound.init(); G.sound.click(); newGame(); });
document.getElementById('btn-continue').addEventListener('click', () => { G.sound.init(); G.sound.click(); continueGame(); });
document.getElementById('btn-how').addEventListener('click', () => { G.sound.click(); document.getElementById('howto').classList.toggle('open'); });
document.getElementById('btn-menu').addEventListener('click', () => { G.sound.click(); toMenu(); });
document.getElementById('btn-retry').addEventListener('click', () => { G.sound.click(); G._keptMoney = G.player.money; restartMission(); });
document.getElementById('btn-retry2').addEventListener('click', () => { G.sound.click(); G._keptMoney = G.player.money; restartMission(); });
document.getElementById('btn-win-menu').addEventListener('click', () => { G.sound.click(); toMenu(); });
document.getElementById('btn-win-again').addEventListener('click', () => { G.sound.click(); newGame(); });
canvas.addEventListener('click', () => G.sound.init());
window.addEventListener('blur', () => { if (G.state === 'playing') G.state = 'paused'; });

function handleKeys() {
  const inp = G.input;
  if (inp.wasPressed('KeyN')) {
    G.sound.setMuted(!G.sound.muted);
    G.toast(G.sound.muted ? 'Sound off' : 'Sound on');
  }
  if (G.state === 'playing') {
    if (inp.wasPressed('KeyP')) { G.state = 'paused'; return; }
    if (inp.wasPressed('KeyM')) { G.state = 'panel'; return; }
    if (inp.wasPressed('KeyF')) {
      G.freeRoam = !G.freeRoam;
      G.toast(G.freeRoam ? 'Free roam — jobs paused' : 'Back on the job');
      return;
    }
    if (inp.wasPressed('KeyR')) { G._keptMoney = G.player.money; restartMission(); return; }
  } else if (G.state === 'paused') {
    if (inp.wasPressed('KeyP')) G.state = 'playing';
  } else if (G.state === 'panel') {
    if (inp.wasPressed('KeyM') || inp.wasPressed('Escape')) G.state = 'playing';
  } else if (G.state === 'busted' || G.state === 'wasted') {
    if (inp.wasPressed('KeyR')) { G._keptMoney = G.player.money; restartMission(); }
  } else if (G.state === 'win') {
    if (inp.wasPressed('KeyR')) newGame();
  } else if (G.state === 'menu') {
    if (inp.wasPressed('Enter')) newGame();
  }
}

// --- main loop ----------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.time += dt;
  handleKeys();
  if (G.state === 'menu') {
    updateTraffic(G, dt);
    updatePeds(G, dt);
    updateParticles(G, dt);
    G.camera.x = clamp(1600 + Math.sin(G.time * 0.07) * 500, 700, 2500);
    G.camera.y = clamp(1600 + Math.cos(G.time * 0.05) * 400, 700, 2500);
  } else if (G.state === 'playing') {
    if (G.autoDrive) G.input.down.add('KeyW');
    G.clock += dt * 0.5;
    G.shootCd = Math.max(0, G.shootCd - dt);
    updatePlayer(G, dt);
    updateTraffic(G, dt);
    updatePeds(G, dt);
    updateCops(G, dt);
    updateGang(G, dt);
    updatePickups(G, dt);
    updateParticles(G, dt);
    G.missionMgr.update(dt);
    // Wanted decays after 25s without a crime.
    G.crimeTimer += dt;
    if (G.wanted > 0 && G.crimeTimer > 25) { G.wanted--; G.crimeTimer = 0; }
    // End conditions.
    if (G.player.health <= 0) setWasted();
    else if (G.bustT > 1.2 || G.surroundT > 2.5) setBusted();
    else if (G.missionMgr.done) setWin();
    // Camera follows the player.
    const p = G.player;
    G.camera.x = clamp(lerp(G.camera.x, p.x, 1 - Math.pow(0.001, dt)), 640, WORLD - 640);
    G.camera.y = clamp(lerp(G.camera.y, p.y, 1 - Math.pow(0.001, dt)), 400, WORLD - 400);
    G.sound.setSiren(G.wanted);
    G.sound.setEngine(p.car ? Math.abs(p.car.speed) / 520 : 0, !!p.car);
  }
  if (G.camera.shake > 0) G.camera.shake = Math.max(0, G.camera.shake - dt * 30);
  const shx = G.camera.shake > 0 ? (Math.random() - 0.5) * G.camera.shake : 0;
  const shy = G.camera.shake > 0 ? (Math.random() - 0.5) * G.camera.shake : 0;
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(-G.camera.x + canvas.width / 2 + shx, -G.camera.y + canvas.height / 2 + shy);
  drawWorld(ctx, G);
  drawEntities(ctx, G);
  ctx.restore();
  if (G.state === 'playing' || G.state === 'paused' || G.state === 'panel') drawMinimap(G);
  updateHUD(G);
  G.input.endFrame();
}

// --- ?shot= staging for screenshots -------------------------------------------
function stageShot() {
  if (!SHOT) return;
  if (SHOT === 'start') {
    G.state = 'menu';
    G.camera.x = 1600; G.camera.y = 1600;
    resetWorld();
    resetPlayer();
    return;
  }
  if (SHOT === 'play') {
    newGame();
    window.__game.warp(1600, 1300);
    window.__game.giveCar('#e74c3c');
    G.player.car.angle = 0;
    G.player.car.speed = 260;
    window.__game.setWanted(1);
    G.autoDrive = true;
    return;
  }
  if (SHOT === 'wanted') {
    newGame();
    window.__game.warp(1600, 1300);
    window.__game.giveCar('#e74c3c');
    G.player.car.angle = 0;
    G.player.car.speed = 300;
    window.__game.setWanted(5);
    G.autoDrive = true;
    return;
  }
  if (SHOT === 'end') {
    newGame();
    G.player.money = 9500;
    G.score = 9500 + 600;
    G.missionsDone = 6;
    G.missionMgr.done = true;
    setWin();
    G.toasts = [];
    G.camera.x = 1600; G.camera.y = 1600;
    return;
  }
}
resetWorld();
resetPlayer();
stageShot();
requestAnimationFrame(frame);
