// Azura Bay — game loop, state machine, HUD, save, screenshot staging.
// Written fresh for the gta6-01 round-3 entry.

import { buildCity } from './city.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { drawGame, drawMinimap, buildStaticLayer, buildMiniBase } from './render.js';
import {
  makePlayer, updatePlayer, damagePlayer, addWanted, spawnTraffic, updateTraffic,
  spawnPeds, updatePeds, scarePeds, updatePolice, updateGuards, updateBullets,
  updatePickups, spawnSmoke, spawnExplosion, updateParticles,
} from './entities.js';
import { makeMissions, missionTitle, currentObjective, updateMissions, onSportCarStolen } from './missions.js';
import { clamp, formatMoney, formatClock } from './util.js';

const $ = (id) => document.getElementById(id);

function freshState(city) {
  return {
    city,
    player: makePlayer(city),
    traffic: spawnTraffic(city, 16),
    peds: spawnPeds(city, 34),
    policeCars: [],
    footCops: [],
    guards: [],
    bullets: [],
    particles: [],
    pickups: [
      { kind: 'medkit', x: 2440, y: 1700 },
      { kind: 'medkit', x: 900, y: 500 },
      { kind: 'medkit', x: 1500, y: 2100 },
      { kind: 'cash', x: 1900, y: 1500 },
      { kind: 'cash', x: 700, y: 1900 },
    ],
    sportCar: { x: city.locations.marina.x, y: city.locations.marina.y, angle: 0.4, color: '#ff2e4d', kind: 'sport', sport: true, taken: false, speed: 0 },
    parkedCar: null,
    missions: makeMissions(),
    missionsCompleted: 0,
    money: 0,
    wanted: 0,
    lastCrime: -99,
    bustTimer: 0,
    time: 0,
    state: 'title',
    loseReason: '',
    camera: { x: 1600, y: 1600, zoom: 1 },
    view: { w: 1280, h: 800 },
    lastLand: { x: city.locations.safehouse.x, y: city.locations.safehouse.y },
    objective: null,
    startedAt: 0,
  };
}

class Game {
  constructor() {
    this.city = buildCity();
    buildStaticLayer(this.city);
    buildMiniBase(this.city);
    Object.assign(this, freshState(this.city));
    this.input = new Input();
    this.audio = new AudioSys();
    this.canvas = $('game');
    this.ctx = this.canvas.getContext('2d');
    this.minimapCanvas = $('minimap');
    this.best = this.loadBest();
    this.toasts = [];
    this.last = performance.now();
    this.titlePan = 0;
    this.wantedDecay = 0;
    this.setupOverlays();
    this.applyShotParam();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.__game = this.debugApi();
    requestAnimationFrame((t) => this.frame(t));
  }

  loadBest() {
    try {
      const raw = localStorage.getItem('azura-bay-save');
      if (raw) return JSON.parse(raw);
    } catch (e) { /* fresh save */ }
    return { bestScore: 0, bestMoney: 0 };
  }

  saveBest() {
    const score = this.score();
    if (score > this.best.bestScore) this.best.bestScore = score;
    if (this.money > this.best.bestMoney) this.best.bestMoney = this.money;
    try { localStorage.setItem('azura-bay-save', JSON.stringify(this.best)); } catch (e) { /* no storage */ }
  }

  score() { return Math.floor(this.money + this.missionsCompleted * 250); }

  setupOverlays() {
    $('start-btn').addEventListener('click', () => this.startGame());
    $('continue-btn').addEventListener('click', () => this.startGame());
    $('restart-btn').addEventListener('click', () => this.reset());
    $('resume-btn').addEventListener('click', () => { this.state = 'play'; this.syncOverlays(); });
    $('end-restart-btn').addEventListener('click', () => this.reset());
    if (this.best.bestScore > 0) {
      $('continue-btn').style.display = 'inline-block';
      $('best-line').textContent = 'Best score ' + this.best.bestScore + ' · Best cash ' + formatMoney(this.best.bestMoney);
    }
  }

  applyShotParam() {
    const shot = new URLSearchParams(location.search).get('shot');
    this.shotMode = shot || null;
    if (!shot) return;
    if (shot === 'start') { this.state = 'title'; return; }
    if (shot === 'play' || shot === 'wanted') {
      this.startGame(true);
      const p = this.player;
      // Play shot: driving south toward the garage marker, which stays in
      // frame below the car so the mission reads at a glance.
      const car = { x: 1500, y: 1250, angle: Math.PI / 2, speed: 0, color: '#ffa502', kind: 'player', hp: 3 };
      p.car = car; p.onFoot = false; p.x = car.x; p.y = car.y;
      this.missions.index = 1; this.missions.stage = 1;
      this.money = 400; this.missionsCompleted = 0;
      if (shot === 'wanted') {
        this.wanted = 3;
        this.lastCrime = this.time; // staged heat starts fresh, no instant decay
        this.missions.index = 3; this.missions.stage = 2;
        // Stage the chase far from the safehouse objective so police rams
        // can never shove the car into the marker by themselves. The car
        // drives west on the avenue with the chase behind it.
        p.car.x = 1900; p.car.y = 1100; p.x = 1900; p.y = 1100;
        p.car.angle = Math.PI; p.angle = Math.PI; p.car.speed = 380;
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          this.policeCars.push({ x: p.x + Math.cos(a) * 260, y: p.y + Math.sin(a) * 260, angle: a, speed: 200, color: '#111827', kind: 'police', siren: 0 });
        }
        spawnSmoke(this, p.x, p.y, 10);
      }
      return;
    }
    if (shot === 'end') {
      this.startGame(true);
      this.money = 9500; this.missionsCompleted = 6;
      this.missions.done = true; this.missions.index = 6;
      this.player.x = this.city.locations.boat.x;
      this.player.y = this.city.locations.boat.y;
      this.win(true);
      // Frame the escape: sea and beach on the right, boat in view.
      this.camera.x = 2920; this.camera.y = 2180; this.camera.zoom = 0.9;
    }
  }

  startGame(silent) {
    if (this.state === 'play') return;
    this.state = 'play';
    this.audio.ensure();
    this.syncOverlays();
    if (!silent) this.toast('Welcome to Azura Bay — follow the gold marker!');
  }

  reset() {
    const keepCity = this.city;
    const fresh = freshState(keepCity);
    for (const k of Object.keys(fresh)) this[k] = fresh[k];
    this.state = 'play';
    this.audio.ensure();
    this.syncOverlays();
    this.toast('Fresh start — good luck, Milo!');
  }

  win(staged) {
    if (this.state === 'win') return;
    this.state = 'win';
    this.saveBest();
    this.audio.missionDone();
    if (!staged) spawnExplosion(this, this.player.x, this.player.y);
    this.syncOverlays();
  }

  lose(reason) {
    if (this.state !== 'play') return;
    this.state = 'lose';
    this.loseReason = reason;
    this.saveBest();
    this.audio.busted();
    this.syncOverlays();
  }

  addMoney(n) {
    this.money += n;
    if (n > 0) this.audio.cash();
  }

  toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    $('hud-toasts').appendChild(el);
    this.toasts.push({ el, at: this.time });
    while ($('hud-toasts').children.length > 4) $('hud-toasts').firstChild.remove();
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 5200);
  }

  syncOverlays() {
    $('title-screen').style.display = this.state === 'title' ? 'flex' : 'none';
    $('pause-screen').style.display = this.state === 'paused' ? 'flex' : 'none';
    $('end-screen').style.display = (this.state === 'win' || this.state === 'lose') ? 'flex' : 'none';
    $('hud').style.display = this.state === 'play' || this.state === 'paused' ? 'block' : 'none';
    if (this.state === 'win') {
      $('end-title').textContent = 'THE BIG SCORE — YOU WIN!';
      $('end-sub').textContent = 'Milo sails off with ' + formatMoney(this.money) + ' · Score ' + this.score() + ' · Best ' + this.best.bestScore;
      $('end-title').style.color = '#ffd166';
    } else if (this.state === 'lose') {
      $('end-title').textContent = this.loseReason === 'busted' ? 'BUSTED!' : 'WASTED!';
      $('end-sub').textContent = this.loseReason === 'busted'
        ? 'The Azura Bay PD finally caught up with you.'
        : 'Milo went down in the streets of Azura Bay.';
      $('end-title').style.color = '#ff4757';
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.view.w = w; this.view.h = h;
    this.canvas.width = w; this.canvas.height = h;
  }

  clampCamera() {
    // Never show the page background past the world's edge.
    const hw = this.view.w / 2 / this.camera.zoom;
    const hh = this.view.h / 2 / this.camera.zoom;
    this.camera.x = clamp(this.camera.x, hw, 3200 - hw);
    this.camera.y = clamp(this.camera.y, hh, 3200 - hh);
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now;
    this.update(dt);
    this.render();
    this.input.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  update(dt) {
    if (this.state === 'title') {
      this.titlePan += dt * 0.02;
      // Slow orbit over downtown so the cover shows towers, not suburbs.
      this.camera.x = 1950 + Math.sin(this.titlePan) * 450;
      this.camera.y = 950 + Math.cos(this.titlePan * 0.7) * 300;
      this.camera.zoom = 0.62;
      this.clampCamera();
      this.time += dt;
      if (this.input.hit('enter') || this.input.anyKey && this.input.mouse.down) this.startGame();
      return;
    }
    if (this.state === 'paused') {
      if (this.input.hit('p', 'escape')) { this.state = 'play'; this.syncOverlays(); }
      return;
    }
    if (this.state === 'win' || this.state === 'lose') {
      if (this.input.hit('r')) this.reset();
      this.time += dt;
      updateParticles(this, dt);
      this.clampCamera();
      return;
    }

    // --- play ---
    this.time += dt;
    if (this.input.hit('p', 'escape')) { this.state = 'paused'; this.syncOverlays(); return; }
    if (this.input.hit('n')) { const m = this.audio.toggleMute(); this.toast(m ? 'Sound off' : 'Sound on'); }
    if (this.input.hit('m')) {
      const mp = $('mission-panel');
      mp.style.display = mp.style.display === 'block' ? 'none' : 'block';
      this.renderMissionPanel();
    }
    if (this.input.hit('f')) {
      this.missions.freeRoam = !this.missions.freeRoam;
      this.toast(this.missions.freeRoam ? 'Free roam — no missions, just the city' : 'Missions back on');
    }

    updatePlayer(this, dt);
    updateTraffic(this, dt);
    updatePeds(this, dt);
    updatePolice(this, dt);
    updateGuards(this, dt);
    updateBullets(this, dt);
    updatePickups(this, dt);
    updateParticles(this, dt);
    updateMissions(this, dt);

    // Wanted decay: 10s clean, then one star per 8s.
    if (this.wanted > 0 && this.time - this.lastCrime > 10) {
      this.wantedDecay += dt;
      if (this.wantedDecay > 8) { this.wantedDecay = 0; this.wanted--; this.toast('Heat cooling off — wanted ' + this.wanted); }
    } else this.wantedDecay = 0;

    // Sports-car steal advances mission 2.
    if (this.sportCar.taken && this.missions.index === 1 && this.missions.stage === 0) {
      onSportCarStolen(this);
    }

    // Camera follows the player with a little lookahead.
    const p = this.player;
    const look = p.onFoot ? 0 : clamp(Math.abs(p.speed) / 500, 0, 1) * 90;
    const tx = p.x + Math.cos(p.angle) * look;
    const ty = p.y + Math.sin(p.angle) * look;
    this.camera.x += (tx - this.camera.x) * Math.min(1, 5 * dt);
    this.camera.y += (ty - this.camera.y) * Math.min(1, 5 * dt);
    const targetZoom = p.onFoot ? 1 : clamp(1 - Math.abs(p.speed) / 2400, 0.8, 1);
    this.camera.zoom += (targetZoom - this.camera.zoom) * Math.min(1, 2 * dt);
    this.clampCamera();

    // Car-to-car bumps. The player's car is heavy: a ram shoves the other
    // car mostly, not the player — a parked player car must not drift.
    const cars = [...this.traffic];
    if (!p.onFoot && p.car) cars.push(p.car);
    for (const c of this.policeCars) cars.push(c);
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1600 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const overlap = 40 - d;
          const fa = a === p.car ? 0.15 : b === p.car ? 0.85 : 0.5;
          const fb = 1 - fa;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * overlap * fa; a.y -= ny * overlap * fa;
          b.x += nx * overlap * fb; b.y += ny * overlap * fb;
        }
      }
    }

    this.updateHud();
  }

  renderMissionPanel() {
    const el = $('mission-list');
    el.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const li = document.createElement('li');
      const st = this.missions.done || i < this.missions.index ? '✓ DONE' : i === this.missions.index ? '▶ NOW' : '· LOCKED';
      li.textContent = missionTitle(this.missions, i) + ' — ' + st;
      li.className = i === this.missions.index && !this.missions.done ? 'now' : '';
      el.appendChild(li);
    }
  }

  updateHud() {
    // Stars.
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < this.wanted ? '★' : '☆';
    $('hud-stars').textContent = stars;
    $('hud-stars').className = 'stars' + (this.wanted >= 3 ? ' hot' : '');
    $('hud-money').textContent = formatMoney(this.money) + '  ·  Score ' + this.score();
    $('hud-clock').textContent = formatClock(this.time);
    $('hud-health-fill').style.width = clamp(this.player.health, 0, 100) + '%';
    $('hud-health-fill').style.background = this.player.health > 50 ? '#2ed573' : this.player.health > 25 ? '#ffa502' : '#ff4757';
    const obj = currentObjective(this);
    this.objective = obj;
    if (obj) {
      $('hud-mission-title').textContent = missionTitle(this.missions, this.missions.index);
      $('hud-mission-obj').textContent = obj.text;
      $('hud-mission-timer').textContent = this.missions.timer > 0 ? formatClock(this.missions.timer) : '';
      $('hud-mission-timer').style.color = this.missions.timer > 0 && this.missions.timer < 30 ? '#ff4757' : '#ffd166';
    } else {
      $('hud-mission-title').textContent = this.missions.done ? 'Story complete!' : 'Free Roam';
      $('hud-mission-obj').textContent = this.missions.done ? 'You beat Azura Bay. Press R to play again.' : 'Explore the city — press F for missions.';
      $('hud-mission-timer').textContent = '';
    }
    $('bust-warning').style.display = this.bustTimer > 0.25 ? 'block' : 'none';
    $('hud-boost-fill').style.width = clamp(this.player.boost, 0, 100) + '%';
    $('hud-boost').style.display = this.player.onFoot ? 'none' : 'block';
  }

  render() {
    if (this.state === 'title') {
      // Title screen shows the living city behind the overlay.
      this.objective = null;
      drawGame(this);
      drawMinimap(this);
      return;
    }
    drawGame(this);
    drawMinimap(this);
  }

  debugApi() {
    const self = this;
    return {
      get state() { return self.state; },
      get wanted() { return self.wanted; },
      get money() { return self.money; },
      get mission() { return self.missions.index; },
      get health() { return self.player.health; },
      get player() { return { x: self.player.x, y: self.player.y, onFoot: self.player.onFoot }; },
      get score() { return self.score(); },
      teleport(x, y) { self.player.x = x; self.player.y = y; if (!self.player.onFoot && self.player.car) { self.player.car.x = x; self.player.car.y = y; } self.lastLand.x = x; self.lastLand.y = y; },
      setWanted(n) { self.wanted = n; self.lastCrime = self.time; },
      damage(n) { damagePlayer(self, n); },
      addWanted(n) { addWanted(self, n); },
      start() { self.startGame(); },
      reset() { self.reset(); },
      winNow() { self.missions.done = true; self.missions.index = 6; self.money = 9500; self.missionsCompleted = 6; self.win(); },
      bustNow() { self.bustTimer = 9; self.lose('busted'); },
      completeMission(i) { self.missions.index = i; self.missions.stage = 0; },
      snapshot() {
        return JSON.stringify({
          state: self.state, wanted: self.wanted, money: self.money,
          mission: self.missions.index, stage: self.missions.stage,
          health: Math.round(self.player.health), score: self.score(),
          x: Math.round(self.player.x), y: Math.round(self.player.y),
          onFoot: self.player.onFoot,
        });
      },
    };
  }
}

new Game();
