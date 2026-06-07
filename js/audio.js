// Procedural BGM + sound effects using the Web Audio API (no asset files).
// Must be started from a user gesture (browser autoplay policy) — see main.js.
//
// BGM design:
//   Tempo ~96 BPM, 16th-note step grid (4 steps per beat, 16 steps per bar).
//   4-bar minor chord progression (Am - F - C - G  ->  i - VI - III - VII in A minor),
//   layered parts: kick + hihat drums, a sustained pad/chord, a driving bassline,
//   and an arpeggio/lead. Music sits low in the mix so SFX cut through.
const Sound = {
  ctx: null,
  master: null,
  musicGain: null,
  sfxGain: null,
  muted: false,
  timer: null,
  step: 0, // running 16th-note counter

  // --- Master volumes ---
  MASTER_VOL: 0.9,
  MUSIC_VOL: 0.16, // BGM kept deliberately quiet
  SFX_VOL: 0.55,

  // --- Tempo / sequencer grid ---
  BPM: 96,
  STEPS_PER_BAR: 16, // sixteenth notes
  BARS: 4,

  // 4-bar minor progression in A minor. Each entry = one bar's chord (root + notes).
  // Notes are absolute Hz. (Am, F, C, G)
  progression: [
    { root: 110.0, notes: [220.0, 261.63, 329.63] }, // Am : A C E
    { root: 87.31, notes: [174.61, 220.0, 261.63] }, // F  : F A C
    { root: 130.81, notes: [196.0, 261.63, 329.63] }, // C  : C E G  (root C2-ish)
    { root: 98.0, notes: [196.0, 246.94, 293.66] }, // G  : G B D
  ],

  // Arpeggio offsets (which chord tone to play) per 16th step within a bar.
  // null = rest. Index into the current bar's `notes` array.
  arpPattern: [0, 2, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1, 0, 1, 2, null],

  // Bass rhythm within a bar (16 steps). 1 = play chord root, 0 = rest.
  bassPattern: [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0],

  // Drum patterns (16 steps per bar).
  kickPattern: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
  hatPattern: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],

  ensure() {
    if (this.ctx) return;
    const AC =
      typeof window !== "undefined" &&
      (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (e) {
      this.ctx = null;
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.MASTER_VOL;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.MUSIC_VOL;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.SFX_VOL;
    this.sfxGain.connect(this.master);
  },

  start() {
    this.ensure();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      try {
        this.ctx.resume();
      } catch (e) {
        /* ignore */
      }
    }
    if (this.timer) return;
    const stepMs = 60000 / this.BPM / 4; // sixteenth-note duration
    this.timer = setInterval(() => this._tick(), stepMs);
  },

  _tick() {
    if (!this.ctx) return;
    const barLen = this.STEPS_PER_BAR;
    const totalSteps = barLen * this.BARS;
    const pos = this.step % totalSteps; // position in the whole loop
    const bar = Math.floor(pos / barLen);
    const inBar = pos % barLen; // 0..15
    const chord = this.progression[bar];

    // --- Pad / chord: retrigger softly at the start of each bar ---
    if (inBar === 0) {
      const padDur = (60 / this.BPM) * 4 * 0.98; // ~one bar long
      for (let i = 0; i < chord.notes.length; i++) {
        this._pad(chord.notes[i], padDur, 0.12);
      }
    }

    // --- Bassline ---
    if (this.bassPattern[inBar]) {
      this._note(chord.root, "triangle", 0.22, this.musicGain, 0.9);
    }

    // --- Arpeggio / lead (an octave up from chord tones) ---
    const arpIdx = this.arpPattern[inBar];
    if (arpIdx !== null && arpIdx !== undefined) {
      const f = chord.notes[arpIdx] * 2;
      this._note(f, "sawtooth", 0.13, this.musicGain, 0.32);
    }

    // --- Drums ---
    if (this.kickPattern[inBar]) this._kick();
    if (this.hatPattern[inBar]) this._hat();

    this.step++;
  },

  // Generic short tone with a percussive AD envelope.
  _note(freq, type, dur, dest, vol = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 * vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  // Sustained pad voice: two slightly detuned oscillators through a gentle lowpass,
  // with a slow attack and release for a chord-bed feel.
  _pad(freq, dur, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    g.connect(lp);
    lp.connect(this.musicGain);

    const a = this.ctx.createOscillator();
    const b = this.ctx.createOscillator();
    a.type = "sawtooth";
    b.type = "sawtooth";
    a.frequency.value = freq;
    b.frequency.value = freq * 1.005; // slight detune
    a.connect(g);
    b.connect(g);

    const peak = Math.max(0.0001, vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.25); // slow attack
    g.gain.setValueAtTime(peak, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur); // release

    a.start(t);
    b.start(t);
    a.stop(t + dur + 0.05);
    b.stop(t + dur + 0.05);
  },

  // Kick: pitch-swept sine with a fast decay.
  _kick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.2);
  },

  // Hi-hat: short burst of highpassed noise.
  _hat() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.04;
    const buf = this._noiseBuffer(dur);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.musicGain);
    src.start(t);
  },

  // Helper: create a mono white-noise buffer of the given duration (seconds).
  _noiseBuffer(dur, shape) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      let v = Math.random() * 2 - 1;
      if (shape === "decay") v *= Math.pow(1 - i / len, 2);
      data[i] = v;
    }
    return buf;
  },

  // --- Sound effects ---

  // shoot: a quick, light "pan" — pitch-dropping square blip, very short so
  // rapid fire doesn't become harsh.
  shoot() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.08);
  },

  // explosion: filtered noise burst with a slow lowpass sweep + a low body thump
  // and a subtle pitch "shake" for impact.
  explosion() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const dur = 0.6;

    // Noise body.
    const buf = this._noiseBuffer(dur, "decay");
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + dur); // sweep down
    // Slight wobble on the cutoff for a "shaking" feel.
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 18;
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    lfo.start(t);
    lfo.stop(t + dur);

    // Low-frequency body thump.
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(og);
    og.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.32);
  },

  // hit: a short, dull low-frequency thud for taking damage.
  hit() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 800;
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.14);
  },

  // --- Optional extra SFX (added; existing methods preserved) ---

  // reload: a two-tick mechanical "kacha" using short noise clicks.
  reload() {
    if (!this.ctx || this.muted) return;
    const click = (offset, vol) => {
      const t = this.ctx.currentTime + offset;
      const buf = this._noiseBuffer(0.03, "decay");
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2500;
      bp.Q.value = 1.5;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.sfxGain);
      src.start(t);
    };
    click(0, 0.5); // cha
    click(0.09, 0.4); // ka
  },

  // victory: a short rising major-ish jingle.
  victory() {
    if (!this.ctx || this.muted) return;
    const seq = [523.25, 659.25, 783.99, 1046.5]; // C E G C
    for (let i = 0; i < seq.length; i++) {
      const t = this.ctx.currentTime + i * 0.13;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = seq[i];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  },

  // defeat: a descending minor "wah-wah" downer.
  defeat() {
    if (!this.ctx || this.muted) return;
    const seq = [392.0, 349.23, 311.13, 233.08]; // G F Eb Bb -> falling
    for (let i = 0; i < seq.length; i++) {
      const t = this.ctx.currentTime + i * 0.18;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(seq[i], t);
      osc.frequency.exponentialRampToValueAtTime(seq[i] * 0.94, t + 0.34);
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1200;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
      osc.connect(lp);
      lp.connect(g);
      g.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.38);
    }
  },

  toggleMute() {
    this.ensure();
    this.muted = !this.muted;
    if (this.master) {
      this.master.gain.value = this.muted ? 0 : this.MASTER_VOL;
    }
    return this.muted;
  },
};
