// The six jobs, in order. A mission is a list of steps; a step is a place to
// reach, a hold-E action, or a car to enter. The manager owns the current
// mission/step, the timer and the hold progress; main.js wires the effects
// (money, wanted, spawns) through the hooks below.
import { dist } from './util.js';
import { PLACES } from './city.js';
import { commitCrime, spawnGang } from './entities.js';

export const MISSIONS = [
  {
    id: 1, name: 'First Fare', reward: 400,
    briefing: 'Pick up the client downtown, then drop them at the hotel. You need a car for the drop-off.',
    steps: [
      { type: 'goto', at: 'taxi', label: 'Pick up the client', radius: 75 },
      { type: 'goto', at: 'dropoff', label: 'Drop off the client', radius: 75, needCar: true },
    ],
  },
  {
    id: 2, name: 'Hot Wheels', reward: 600,
    briefing: 'A gold coupe is parked uptown. Take it — then lose the heat at the chop shop.',
    steps: [
      { type: 'goto', at: 'goldcar', label: 'Find the gold coupe', radius: 90 },
      { type: 'enter', at: 'goldcar', label: 'Steal the gold coupe', radius: 90 },
      { type: 'goto', at: 'garage', label: 'Deliver to the chop shop', radius: 75, needCar: true },
    ],
  },
  {
    id: 3, name: 'Harbor Run', reward: 800,
    briefing: 'Grab the package at the harbor pier, then run it downtown. Fast.',
    steps: [
      { type: 'goto', at: 'harbor', label: 'Pick up the package', radius: 75 },
      { type: 'goto', at: 'downtown', label: 'Deliver the package', radius: 75, needCar: true },
    ],
  },
  {
    id: 4, name: 'Bank Job', reward: 1500,
    briefing: 'Crack the bank safe — hold E for 3 seconds — then shake the heat and get home.',
    steps: [
      { type: 'goto', at: 'bank', label: 'Reach the bank', radius: 75 },
      { type: 'hold', at: 'bank', label: 'Hold E to crack the safe', radius: 80, holdTime: 3 },
      { type: 'goto', at: 'safehouse', label: 'Escape to the safehouse', radius: 90 },
    ],
  },
  {
    id: 5, name: "Kingpin's Errand", reward: 1200, timeLimit: 180,
    briefing: 'Three stops, three minutes. Rooftop bar, beach cafe, boardwalk. Do not be late.',
    steps: [
      { type: 'goto', at: 'stop1', label: 'Stop 1: Rooftop bar', radius: 75 },
      { type: 'goto', at: 'stop2', label: 'Stop 2: Beach cafe', radius: 75 },
      { type: 'goto', at: 'stop3', label: 'Stop 3: Boardwalk', radius: 75 },
    ],
  },
  {
    id: 6, name: 'The Big Score', reward: 5000,
    briefing: 'The vault. Four guards. A five-star tail. Crack it, then run home.',
    steps: [
      { type: 'goto', at: 'vault', label: 'Reach the vault', radius: 75 },
      { type: 'hold', at: 'vault', label: 'Hold E to crack the vault', radius: 80, holdTime: 3 },
      { type: 'goto', at: 'safehouse', label: 'Escape to the safehouse', radius: 90 },
    ],
  },
];

export class MissionManager {
  constructor(G) {
    this.G = G;
    this.index = 0;
    this.stepIdx = 0;
    this.timer = Infinity;
    this.hold = 0;
    this.done = false;
    this.hintT = 0;
    this.stepStarted = false;
  }
  current() { return this.done ? null : MISSIONS[this.index]; }
  step() { const m = this.current(); return m ? m.steps[this.stepIdx] : null; }
  marker() {
    const s = this.step();
    if (!s) return null;
    if (s.type === 'enter' && this.G.goldCar) return { x: this.G.goldCar.x, y: this.G.goldCar.y, label: s.label };
    const p = PLACES[s.at];
    return { x: p.x, y: p.y, label: s.label };
  }
  objectiveText() {
    const m = this.current();
    if (!m) return this.done ? 'All jobs done.' : '';
    const s = this.step();
    return 'M' + m.id + ' · ' + m.name + ' — ' + (s ? s.label : '');
  }
  start(i) {
    this.index = i;
    this.stepIdx = 0;
    this.hold = 0;
    this.done = false;
    this.stepStarted = false;
    this._guardsSpawned = false;
    const m = MISSIONS[i];
    this.timer = m.timeLimit || Infinity;
    this.G.toast('Mission ' + m.id + ': ' + m.name + ' — ' + m.briefing);
    this.G.sound.missionDone();
  }
  restartCurrent() { this.start(this.index); }
  // Debug / test hook: finish the whole current mission at once.
  completeMission() {
    const m = this.current();
    if (!m) return;
    const id = m.id;
    while (this.current() && this.current().id === id && this.step()) this.advance(true);
  }
  advance(silent) {
    const m = this.current();
    const s = this.step();
    if (!m || !s) return;
    this.onStepDone(m, s);
    this.stepIdx++;
    this.hold = 0;
    this.stepStarted = false;
    if (this.stepIdx >= m.steps.length) this.finishMission(m);
    else if (!silent) this.G.toast(this.step().label);
  }
  onStepDone(m, s) {
    const G = this.G;
    if (m.id === 4 && s.type === 'hold') { commitCrime(G, 2); G.toast('Alarm tripped — the heat is on!'); }
    if (m.id === 6 && s.type === 'hold') { commitCrime(G, 2); G.toast('Vault open — run!'); }
  }
  onStepStart(m, s) {
    const G = this.G;
    if (m.id === 6 && s.type === 'hold' && !this._guardsSpawned) {
      this._guardsSpawned = true;
      spawnGang(G, PLACES.vault.x, PLACES.vault.y, 4);
      G.toast('Four guards on the vault!');
    }
    if (m.id === 6 && s.type === 'goto' && s.at === 'safehouse') {
      G.wanted = 5; G.crimeTimer = 0;
      G.toast('Five stars — lose the tail!');
    }
  }
  finishMission(m) {
    const G = this.G;
    G.player.money += m.reward;
    G.score += m.reward + 100;
    G.missionsDone++;
    G.sound.missionDone();
    G.toast('Mission complete: ' + m.name + ' +$' + m.reward.toLocaleString('en-US'));
    if (G.player.money > (G.save.best || 0)) { G.save.best = G.player.money; G.saveGame(); }
    if (m.id === 6) { this.done = true; return; }
    this.index++;
    this.stepIdx = 0;
    this.hold = 0;
    this._guardsSpawned = false;
    const next = MISSIONS[this.index];
    this.timer = next.timeLimit || Infinity;
    G.toast('Mission ' + next.id + ': ' + next.name + ' — ' + next.briefing);
  }
  update(dt) {
    const G = this.G;
    if (G.freeRoam || this.done || G.state !== 'playing') return;
    const m = this.current();
    const s = this.step();
    if (!m || !s) return;
    if (!this.stepStarted) { this.stepStarted = true; this.onStepStart(m, s); }
    if (this.timer !== Infinity) {
      this.timer -= dt;
      if (this.timer <= 0) {
        G.toast('Too slow — the job fell through. Try again.');
        this.restartCurrent();
        return;
      }
    }
    const p = G.player;
    if (s.type === 'goto' || s.type === 'hold') {
      const mk = this.marker();
      const d = dist(p.x, p.y, mk.x, mk.y);
      if (s.type === 'goto') {
        if (d < s.radius) {
          if (s.needCar && p.onFoot) {
            this.hintT -= dt;
            if (this.hintT <= 0) { this.hintT = 3; G.toast('You need a car for this.'); }
            return;
          }
          this.advance();
        }
        return;
      }
      // hold step
      if (d < s.radius && G.input.isDown('KeyE')) {
        this.hold += dt;
        if (this.hold >= s.holdTime) this.advance();
      } else {
        this.hold = Math.max(0, this.hold - dt * 2);
      }
      return;
    }
    if (s.type === 'enter') {
      if (p.car && p.car.kind === 'gold') this.advance();
    }
  }
}
