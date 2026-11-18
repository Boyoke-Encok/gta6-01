// Synthesized sound: no audio files, everything is WebAudio oscillators and
// filtered noise. Lazy init on first user gesture; every call is a no-op
// until then (headless runs stay silent) and when muted.
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.25, freq = 1200) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  shot() { this.noise(0.12, 0.5, 2500); this.tone(160, 0.08, 'square', 0.15, 60); }
  enemyShot() { this.noise(0.1, 0.22, 1800); }
  crash() { this.noise(0.25, 0.4, 500); this.tone(70, 0.2, 'sawtooth', 0.2, 40); }
  pickup() { this.tone(660, 0.09, 'sine', 0.22); setTimeout(() => this.tone(990, 0.12, 'sine', 0.22), 70); }
  coin() { this.tone(880, 0.07, 'triangle', 0.2); setTimeout(() => this.tone(1318, 0.1, 'triangle', 0.2), 60); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.25), i * 90)); }
  busted() { this.tone(392, 0.5, 'sawtooth', 0.25, 196); }
  wasted() { this.tone(220, 0.8, 'sawtooth', 0.25, 55); }
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.25), i * 110)); }
  click() { this.tone(700, 0.05, 'square', 0.12); }
  // Two-tone siren that follows the wanted level; call setSiren(0) to stop.
  setSiren(level) {
    if (!this.ctx) return;
    if (level <= 0) {
      if (this.sirenOsc) { try { this.sirenOsc.stop(); } catch {} this.sirenOsc = null; }
      return;
    }
    if (!this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.05;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 1.6;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
      this.sirenOsc.frequency.value = 780;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start(); lfo.start();
      this._sirenLfo = lfo;
    }
    if (this.sirenGain) this.sirenGain.gain.value = 0.03 + level * 0.012;
  }
  // Engine hum that follows the driven car's speed (0..1).
  setEngine(ratio, driving) {
    if (!this.ctx) return;
    if (!driving || ratio <= 0.02) {
      if (this.engineOsc) { try { this.engineOsc.stop(); } catch {} this.engineOsc = null; }
      return;
    }
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.04;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 500;
      this.engineOsc.connect(f); f.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    this.engineOsc.frequency.value = 60 + ratio * 220;
    if (this.engineGain) this.engineGain.gain.value = 0.02 + ratio * 0.05;
  }
  // Simple bassline loop: A minor groove, 8th notes at 112 BPM.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const bass = [55, 0, 55, 65.4, 0, 55, 49, 0, 55, 0, 55, 65.4, 82.4, 0, 73.4, 0];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const f = bass[this.musicStep % bass.length];
      this.musicStep++;
      if (f) this.tone(f, 0.22, 'triangle', 0.16);
      if (this.musicStep % 4 === 2) this.noise(0.03, 0.05, 6000);
    }, 268);
  }
  stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } }
}
