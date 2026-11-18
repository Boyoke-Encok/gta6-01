// Azura Bay — synthesized sound: every effect and the music loop are built
// from WebAudio oscillators and noise, no audio files. Written fresh for gta6-01.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      // Engine hum: two detuned saws through a lowpass, gain follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = 55.7;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(filt);
      osc2.connect(filt);
      filt.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
      osc2.start();
      this.engineOsc2 = osc2;
      this.startMusic();
    } catch (e) {
      this.ctx = null;
    }
  }

  setEngine(speed01, driving) {
    if (!this.ctx || !this.engineGain) return;
    const target = this.muted ? 0 : driving ? 0.028 + speed01 * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    const f = 52 + speed01 * 110;
    this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(f * 1.007, this.ctx.currentTime, 0.1);
  }

  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noiseBurst(dur, vol, lowpass) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass || 1200;
    const g = this.ctx.createGain();
    g.gain.value = vol || 0.25;
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t);
  }

  gunshot() { this.noiseBurst(0.12, 0.3, 3000); this.blip(180, 0.08, 'square', 0.1, 60); }
  explosion() { this.noiseBurst(0.7, 0.5, 500); this.blip(90, 0.6, 'sine', 0.35, 28); }
  pickup() { this.blip(660, 0.09, 'sine', 0.14); setTimeout(() => this.blip(880, 0.12, 'sine', 0.14), 80); }
  cash() { this.blip(990, 0.08, 'triangle', 0.14); setTimeout(() => this.blip(1320, 0.14, 'triangle', 0.14), 70); }
  sirenBlip() { this.blip(720, 0.22, 'sine', 0.05, 960); }
  busted() { this.blip(220, 0.5, 'sawtooth', 0.16, 110); }
  missionDone() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.22, 'triangle', 0.16), i * 110));
  }
  fail() { this.blip(330, 0.3, 'sawtooth', 0.14, 165); }

  // Laid-back synthwave bassline + hats, scheduled a bar at a time.
  startMusic() {
    if (this.musicTimer) return;
    const bass = [55, 0, 65.41, 0, 49, 0, 58.27, 0, 55, 0, 65.41, 0, 73.42, 65.41, 58.27, 49];
    const stepDur = 0.21;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const n = bass[this.musicStep % bass.length];
      this.musicStep++;
      if (n) this.blip(n, stepDur * 0.9, 'triangle', 0.05);
      if (this.musicStep % 2 === 0) this.noiseBurst(0.03, 0.015, 8000);
      if (this.musicStep % 16 === 0) this.blip(440, 0.4, 'sine', 0.03, 660);
    }, stepDur * 1000);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.engineGain) this.engineGain.gain.value = 0;
    return this.muted;
  }
}
