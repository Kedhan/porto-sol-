'use strict';
/* Red Mesa Heat — sound, written fresh for round 3.
   All synthesis is done in code: a two-oscillator engine hum, a
   two-tone police siren, a looping desert-radio bass line and small
   one-shot effects. Everything is guarded so the game still runs
   with no audio device at all. */
(function () {
  var RM = window.RM;

  function RM_AudioEngine() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenHigh = false;
    this.sirenTimer = 0;
    this.radioTimer = 0;
    this.radioStep = 0;
    this.ready = false;
  }

  RM_AudioEngine.prototype.init = function () {
    if (this.ready || this.ctx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = RM.state.muted ? 0 : 0.5;
      this.master.connect(ctx.destination);

      /* engine: detuned saw + square an octave down, through a lowpass */
      this.engineFilter = ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc = ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 58;
      this.engineOsc2 = ctx.createOscillator();
      this.engineOsc2.type = 'square';
      this.engineOsc2.frequency.value = 29;
      var g2 = ctx.createGain();
      g2.gain.value = 0.5;
      this.engineOsc.connect(this.engineFilter);
      this.engineOsc2.connect(g2);
      g2.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      this.engineOsc2.start();

      /* siren: a triangle wave that hops between two pitches */
      this.sirenOsc = ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 660;
      this.sirenGain = ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();

      this.ready = true;
      if (ctx.resume) ctx.resume();
    } catch (e) {
      this.ctx = null;
      this.ready = false;
    }
  };

  RM_AudioEngine.prototype.setMuted = function (m) {
    RM.state.muted = !!m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  };

  RM_AudioEngine.prototype.toggleRadio = function () {
    RM.state.radio = !RM.state.radio;
    return RM.state.radio;
  };

  RM_AudioEngine.prototype._tone = function (freq, dur, type, vol, delay, slideTo) {
    if (!this.ctx || !this.ready) return;
    try {
      var t0 = this.ctx.currentTime + (delay || 0);
      var o = this.ctx.createOscillator();
      var g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    } catch (e) { /* silent */ }
  };

  RM_AudioEngine.prototype._noise = function (dur, vol, cutoff) {
    if (!this.ctx || !this.ready) return;
    try {
      var len = Math.floor(this.ctx.sampleRate * dur);
      var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = this.ctx.createBufferSource();
      src.buffer = buf;
      var f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff || 900;
      var g = this.ctx.createGain();
      g.gain.value = vol || 0.3;
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start();
    } catch (e) { /* silent */ }
  };

  RM_AudioEngine.prototype.sfx = function (name) {
    if (!this.ready) return;
    if (name === 'gunshot') {
      this._noise(0.14, 0.5, 2600);
      this._tone(190, 0.09, 'square', 0.16, 0, 60);
    } else if (name === 'pickup') {
      this._tone(523, 0.09, 'sine', 0.22, 0);
      this._tone(784, 0.14, 'sine', 0.22, 0.08);
    } else if (name === 'crash') {
      this._noise(0.35, 0.5, 500);
      this._tone(90, 0.25, 'sawtooth', 0.2, 0, 40);
    } else if (name === 'mission') {
      this._tone(392, 0.12, 'triangle', 0.22, 0);
      this._tone(523, 0.12, 'triangle', 0.22, 0.11);
      this._tone(659, 0.2, 'triangle', 0.24, 0.22);
    } else if (name === 'busted') {
      this._tone(330, 0.22, 'sawtooth', 0.2, 0, 220);
      this._tone(220, 0.35, 'sawtooth', 0.2, 0.2, 110);
    } else if (name === 'click') {
      this._tone(880, 0.05, 'sine', 0.12, 0);
    }
  };

  /* Desert radio: a slow minor-key bass walk, one note per beat. */
  var RADIO_LINE = [55, 0, 55, 65.41, 0, 49, 0, 58.27, 55, 0, 55, 73.42, 65.41, 0, 49, 0];
  RM_AudioEngine.prototype.update = function (dt) {
    if (!this.ctx || !this.ready) return;
    var st = RM.state;
    var speed01 = RM.clamp01(Math.abs(st.speed) / 180);

    /* engine follows speed, only audible while driving and started */
    var engTarget = (st.started && st.mode === 'car' && !st.over) ? 0.05 + speed01 * 0.11 : 0;
    this.engineGain.gain.setTargetAtTime(engTarget, this.ctx.currentTime, 0.12);
    var base = 52 + speed01 * 130;
    this.engineOsc.frequency.setTargetAtTime(base, this.ctx.currentTime, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(base * 0.5, this.ctx.currentTime, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + speed01 * 900, this.ctx.currentTime, 0.15);

    /* siren wails while wanted, alternating pitch twice a second */
    if (st.wanted > 0 && st.started && !st.over) {
      this.sirenGain.gain.setTargetAtTime(0.045, this.ctx.currentTime, 0.2);
      this.sirenTimer -= dt;
      if (this.sirenTimer <= 0) {
        this.sirenHigh = !this.sirenHigh;
        this.sirenTimer = 0.42;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 720 : 540, this.ctx.currentTime, 0.05);
      }
    } else {
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    }

    /* radio bass line */
    if (st.radio && st.started && !st.over && !st.muted) {
      this.radioTimer -= dt;
      if (this.radioTimer <= 0) {
        this.radioTimer = 0.46;
        var note = RADIO_LINE[this.radioStep % RADIO_LINE.length];
        this.radioStep++;
        if (note > 0) this._tone(note, 0.42, 'triangle', 0.16, 0);
      }
    }
  };

  RM.AudioEngine = RM_AudioEngine;
})();
