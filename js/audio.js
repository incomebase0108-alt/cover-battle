// Procedural BGM + sound effects using the Web Audio API (no asset files).
// Must be started from a user gesture (browser autoplay policy) — see main.js.
const Sound = {
  ctx: null,
  master: null,
  musicGain: null,
  sfxGain: null,
  muted: false,
  timer: null,
  step: 0,

  // A calm minor loop: bassline + arpeggio (frequencies in Hz, null = rest).
  bass: [110.0, null, 146.83, null, 130.81, null, 98.0, null],
  lead: [440, 523.25, 659.25, 523.25, 587.33, 523.25, 440, 392],

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.18;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.master);
  },

  start() {
    this.ensure();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    if (this.timer) return;
    const beatMs = 60000 / 104 / 2; // eighth notes at 104 BPM
    this.timer = setInterval(() => this._tick(), beatMs);
  },

  _tick() {
    if (!this.ctx) return;
    const b = this.bass[this.step % this.bass.length];
    const l = this.lead[this.step % this.lead.length];
    if (b) this._note(b, "triangle", 0.45, this.musicGain);
    if (l) this._note(l, "sine", 0.30, this.musicGain, 0.6);
    this.step++;
  },

  _note(freq, type, dur, dest, vol = 1) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 * vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  // --- Sound effects ---
  shoot() {
    if (!this.ctx || this.muted) return;
    this._note(720, "square", 0.07, this.sfxGain, 0.5);
  },

  explosion() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const dur = 0.5;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.7;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    src.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
  },

  hit() {
    if (!this.ctx || this.muted) return;
    this._note(180, "sawtooth", 0.09, this.sfxGain, 0.4);
  },

  toggleMute() {
    this.ensure();
    this.muted = !this.muted;
    if (this.master) {
      this.master.gain.value = this.muted ? 0 : 0.9;
    }
    return this.muted;
  },
};
