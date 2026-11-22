// Red Mesa Heat — audio.js
// All sounds are synthesized with WebAudio — no audio files.
// Guarded everywhere: a headless browser with no audio must never crash the game.
(function () {
  'use strict';
  function AudioEngine() {
    this.ctx = null; this.master = null; this.muted = false;
    this.musicTimer = null; this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenTimer = null; this.sirenGain = null;
  }
  AudioEngine.prototype.ensure = function () {
    if (this.ctx) { if (this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) {} } return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.45;
      this.master.connect(this.ctx.destination);
      this.startMusic();
    } catch (e) { this.ctx = null; }
  };
  AudioEngine.prototype.setMuted = function (m) {
    this.muted = m;
    if (this.master) { try { this.master.gain.value = m ? 0 : 0.45; } catch (e) {} }
  };
  AudioEngine.prototype.blip = function (freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    try {
      var o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.12, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + dur);
    } catch (e) {}
  };
  AudioEngine.prototype.noise = function (dur, vol, low) {
    if (!this.ctx || this.muted) return;
    try {
      var len = Math.floor(this.ctx.sampleRate * dur);
      var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = this.ctx.createBufferSource(); src.buffer = buf;
      var f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = low || 1200;
      var g = this.ctx.createGain(); g.gain.value = vol || 0.25;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
    } catch (e) {}
  };
  AudioEngine.prototype.shoot = function () { this.noise(0.12, 0.3, 2400); this.blip(180, 0.08, 'square', 0.1); };
  AudioEngine.prototype.enemyShoot = function () { this.noise(0.1, 0.12, 1600); };
  AudioEngine.prototype.pickup = function () { var s = this; this.blip(660, 0.09, 'sine', 0.16); setTimeout(function () { s.blip(990, 0.14, 'sine', 0.16); }, 90); };
  AudioEngine.prototype.cash = function () { var s = this; [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { s.blip(f, 0.16, 'sine', 0.16); }, i * 90); }); };
  AudioEngine.prototype.crash = function () { this.noise(0.3, 0.35, 700); };
  AudioEngine.prototype.horn = function () { this.blip(370, 0.25, 'square', 0.09); };
  AudioEngine.prototype.busted = function () { var s = this; this.blip(220, 0.5, 'sawtooth', 0.2); setTimeout(function () { s.blip(165, 0.7, 'sawtooth', 0.2); }, 400); };
  AudioEngine.prototype.setEngine = function (speed01) {
    if (!this.ctx || this.muted) return;
    try {
      if (!this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth';
        this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
        var f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
        this.engineOsc.connect(f); f.connect(this.engineGain); this.engineGain.connect(this.master);
        this.engineOsc.start();
      }
      this.engineOsc.frequency.value = 55 + speed01 * 140;
      this.engineGain.gain.value = speed01 > 0.02 ? 0.05 + speed01 * 0.05 : 0;
    } catch (e) {}
  };
  AudioEngine.prototype.siren = function (on) {
    if (!this.ctx) return;
    try {
      if (on && !this.sirenOsc) {
        this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'sine';
        this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0.04;
        this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master); this.sirenOsc.start();
        var s = this;
        this.sirenTimer = setInterval(function () { if (s.sirenOsc) s.sirenOsc.frequency.value = s.sirenOsc.frequency.value > 800 ? 620 : 920; }, 420);
      } else if (!on && this.sirenOsc) {
        clearInterval(this.sirenTimer);
        try { this.sirenOsc.stop(); } catch (e) {}
        this.sirenOsc = null;
      }
    } catch (e) {}
  };
  AudioEngine.prototype.startMusic = function () {
    // Desert-radio bass line, looped. Quiet on purpose.
    var bass = [110, 0, 131, 0, 98, 0, 147, 123, 110, 0, 131, 165, 98, 0, 123, 147];
    var i = 0, s = this;
    this.musicTimer = setInterval(function () {
      if (s.muted || !s.ctx || !RM.state.radio) return;
      var f = bass[i % bass.length]; i++;
      if (f) s.blip(f, 0.32, 'triangle', 0.08);
      if (i % 4 === 0) s.blip(220, 0.1, 'sine', 0.025);
    }, 235);
  };
  RM.AudioEngine = AudioEngine;
})();
