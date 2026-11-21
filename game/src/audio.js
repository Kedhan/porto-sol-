// Cinder Bay audio: all sounds are synthesized with WebAudio — no audio files.
export class AudioEngine {
  constructor() { this.ctx = null; this.muted = false; this.musicTimer = null; this.engineOsc = null; this.engineGain = null; this.sirenOsc = null; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      this.startMusic();
    } catch { this.ctx = null; }
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }
  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.12, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + dur);
  }
  noise(dur, vol, low) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = low || 1200;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.25;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
  }
  shoot() { this.noise(0.12, 0.3, 2400); this.blip(180, 0.08, 'square', 0.1); }
  enemyShoot() { this.noise(0.1, 0.14, 1600); }
  pickup() { this.blip(660, 0.09, 'sine', 0.16); setTimeout(() => this.blip(990, 0.14, 'sine', 0.16), 90); }
  cash() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'sine', 0.16), i * 90)); }
  crash() { this.noise(0.3, 0.35, 700); }
  horn() { this.blip(370, 0.25, 'square', 0.1); }
  busted() { this.blip(220, 0.5, 'sawtooth', 0.2); setTimeout(() => this.blip(165, 0.7, 'sawtooth', 0.2), 400); }
  setEngine(speed01) {
    if (!this.ctx || this.muted) return;
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth';
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      this.engineOsc.connect(f); f.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    this.engineOsc.frequency.value = 55 + speed01 * 140;
    this.engineGain.gain.value = speed01 > 0.02 ? 0.05 + speed01 * 0.05 : 0;
  }
  siren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'sine';
      const g = this.ctx.createGain(); g.gain.value = 0.045;
      this.sirenOsc.connect(g); g.connect(this.master); this.sirenOsc.start();
      this.sirenTimer = setInterval(() => { if (this.sirenOsc) this.sirenOsc.frequency.value = this.sirenOsc.frequency.value > 800 ? 620 : 920; }, 420);
    } else if (!on && this.sirenOsc) {
      clearInterval(this.sirenTimer); try { this.sirenOsc.stop(); } catch { /* already stopped */ }
      this.sirenOsc = null;
    }
  }
  startMusic() {
    // Laid-back sun-soaked bass line, looped.
    const bass = [110, 0, 131, 0, 98, 0, 147, 123, 110, 0, 131, 165, 98, 0, 123, 147];
    let i = 0;
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const f = bass[i % bass.length]; i++;
      if (f) this.blip(f, 0.32, 'triangle', 0.09);
      if (i % 4 === 0) this.blip(220, 0.1, 'sine', 0.03);
    }, 240);
  }
}
