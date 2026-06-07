// Procedural BGM + sound effects using the Web Audio API (no asset files).
// Must be started from a user gesture (browser autoplay policy) — see main.js.
//
// BGM design:
//   Tempo ~96 BPM, 16th-note step grid (4 steps per beat, 16 steps per bar).
//   Instead of a single 4-bar loop, the music plays a multi-section arrangement
//   (intro -> verse A -> verse B -> chorus -> bridge/break) that runs ~40 bars
//   before repeating, so the loop is far less obvious. Each section carries its
//   own chord progression plus its own arp / bass / drum / melody patterns and
//   mix levels, so density and tension rise and fall across the song.
//   Layered parts: kick + hihat (+ occasional snare/fill) drums, a sustained
//   pad/chord, a driving bassline, an arpeggio, and a moving lead melody.
//   Music sits low in the mix so SFX cut through.
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
  BARS: 4, // bars per chord-progression cycle (legacy / fallback)

  // 4-bar minor progression in A minor. Each entry = one bar's chord (root + notes).
  // Notes are absolute Hz. (Am, F, C, G) — kept as the default fallback chords.
  progression: [
    { root: 110.0, notes: [220.0, 261.63, 329.63] }, // Am : A C E
    { root: 87.31, notes: [174.61, 220.0, 261.63] }, // F  : F A C
    { root: 130.81, notes: [196.0, 261.63, 329.63] }, // C  : C E G  (root C2-ish)
    { root: 98.0, notes: [196.0, 246.94, 293.66] }, // G  : G B D
  ],

  // Reusable named chords (A minor diatonic-ish pool) so sections can pick freely.
  // Each: root (bass Hz) + three upper chord-tone notes (Hz).
  chords: {
    Am: { root: 110.0, notes: [220.0, 261.63, 329.63] }, // A  C  E
    F: { root: 87.31, notes: [174.61, 220.0, 261.63] }, // F  A  C
    C: { root: 130.81, notes: [196.0, 261.63, 329.63] }, // C  E  G
    G: { root: 98.0, notes: [196.0, 246.94, 293.66] }, // G  B  D
    Dm: { root: 73.42, notes: [146.83, 220.0, 293.66] }, // D  A  D (Dm-ish, open)
    E: { root: 82.41, notes: [164.81, 207.65, 246.94] }, // E  G# B (dominant E)
    Em: { root: 82.41, notes: [164.81, 196.0, 246.94] }, // E  G  B
  },

  // Arpeggio offsets (which chord tone to play) per 16th step within a bar.
  // null = rest. Index into the current bar's `notes` array. (Default fallback.)
  arpPattern: [0, 2, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1, 0, 1, 2, null],

  // Bass rhythm within a bar (16 steps). 1 = play chord root, 0 = rest. (Default.)
  bassPattern: [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0],

  // Drum patterns (16 steps per bar). (Default fallback patterns.)
  kickPattern: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
  hatPattern: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],

  // === Song arrangement ===========================================
  // Pattern legend (each array is 16 steps = one bar):
  //   arp  : index 0..2 into chord.notes, or null = rest (played up an octave).
  //   bass : 1 = root, 2 = root up an octave, 0 = rest.
  //   kick / hat / snare : 1 = hit, 0 = rest.
  //   melody: scale-degree number relative to A (semitone offsets handled in
  //           _tick via melScale), or null = rest. Adds a moving top line.
  // Each section also has: chords[] (one chord name per bar), bars (length),
  // and mix levels (arpVol, bassVol, melVol, padVol, drumVol).
  patterns: {
    // sparse, "calm" arp/bass for intros & verses
    arpCalm: [0, null, 2, null, 1, null, 2, null, 0, null, 1, null, 2, null, 1, null],
    arpFlow: [0, 2, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1, 0, 2, 1, 2],
    arpBusy: [0, 1, 2, 1, 0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1],
    bassHalf: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    bassRock: [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    bassDrive: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2, 0],
    kickSoft: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    kickRock: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    kickDrive: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    hatSoft: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    hatRoll: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    hatGroove: [0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 1],
    snareBack: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    snareNone: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },

  // Melody lines are written as semitone offsets above A2 (110 Hz) per step,
  // null = rest. They are rendered up two octaves in _tick for a singing lead.
  melodies: {
    none: new Array(16).fill(null),
    // gentle question phrase  (A . C . B . A .  E . G . A . . .)
    verseA: [0, null, 3, null, 2, null, 0, null, 7, null, 10, null, 12, null, null, null],
    // answering phrase, a touch higher
    verseB: [12, null, 10, null, 7, null, 8, null, 5, null, 3, null, 5, null, 7, null],
    // soaring chorus hook
    chorus: [12, 14, 15, 14, 12, null, 10, 12, 14, null, 15, 17, 15, 14, 12, null],
    // tense bridge motif
    bridge: [7, null, 8, null, 7, 5, 3, null, 5, null, 7, null, 8, 7, 5, null],
  },

  // The arrangement: an ordered list of sections. Total = 40 bars before repeat.
  sections: [
    {
      name: "intro",
      bars: 4,
      chords: ["Am", "Am", "F", "G"],
      arp: "arpCalm",
      bass: "bassHalf",
      kick: "kickSoft",
      hat: "hatSoft",
      snare: "snareNone",
      melody: "none",
      arpVol: 0.22,
      bassVol: 0.7,
      melVol: 0.0,
      padVol: 0.1,
      drumVol: 0.6,
    },
    {
      name: "verseA",
      bars: 8,
      chords: ["Am", "F", "C", "G", "Am", "Dm", "E", "E"],
      arp: "arpFlow",
      bass: "bassRock",
      kick: "kickRock",
      hat: "hatSoft",
      snare: "snareBack",
      melody: "verseA",
      arpVol: 0.3,
      bassVol: 0.85,
      melVol: 0.26,
      padVol: 0.12,
      drumVol: 0.85,
    },
    {
      name: "verseB",
      bars: 8,
      chords: ["Am", "F", "C", "G", "F", "C", "Dm", "E"],
      arp: "arpFlow",
      bass: "bassRock",
      kick: "kickRock",
      hat: "hatGroove",
      snare: "snareBack",
      melody: "verseB",
      arpVol: 0.32,
      bassVol: 0.9,
      melVol: 0.28,
      padVol: 0.13,
      drumVol: 0.9,
    },
    {
      name: "chorus",
      bars: 8,
      chords: ["C", "G", "Am", "F", "C", "G", "Dm", "E"],
      arp: "arpBusy",
      bass: "bassDrive",
      kick: "kickDrive",
      hat: "hatGroove",
      snare: "snareBack",
      melody: "chorus",
      arpVol: 0.34,
      bassVol: 1.0,
      melVol: 0.34,
      padVol: 0.15,
      drumVol: 1.0,
    },
    {
      name: "bridge",
      bars: 8,
      chords: ["Dm", "Dm", "Am", "Am", "F", "F", "E", "E"],
      arp: "arpCalm",
      bass: "bassHalf",
      kick: "kickRock",
      hat: "hatRoll",
      snare: "snareNone",
      melody: "bridge",
      arpVol: 0.26,
      bassVol: 0.8,
      melVol: 0.3,
      padVol: 0.16,
      drumVol: 0.7,
    },
    {
      name: "lift",
      bars: 4,
      chords: ["F", "G", "Am", "E"],
      arp: "arpBusy",
      bass: "bassDrive",
      kick: "kickDrive",
      hat: "hatRoll",
      snare: "snareBack",
      melody: "chorus",
      arpVol: 0.34,
      bassVol: 1.0,
      melVol: 0.34,
      padVol: 0.14,
      drumVol: 1.0,
    },
  ],

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

  // Total bars across all sections (the full song length before repeating).
  _songBars() {
    let n = 0;
    for (let i = 0; i < this.sections.length; i++) n += this.sections[i].bars;
    return n;
  },

  // Resolve an absolute bar index into { section, barInSection }.
  _locate(absBar) {
    const total = this._songBars();
    let b = ((absBar % total) + total) % total;
    for (let i = 0; i < this.sections.length; i++) {
      const s = this.sections[i];
      if (b < s.bars) return { section: s, barInSection: b };
      b -= s.bars;
    }
    // Fallback (shouldn't hit): return first section.
    return { section: this.sections[0], barInSection: 0 };
  },

  _tick() {
    if (!this.ctx) return;
    const barLen = this.STEPS_PER_BAR;
    const absBar = Math.floor(this.step / barLen);
    const inBar = this.step % barLen; // 0..15

    const loc = this._locate(absBar);
    const sec = loc.section;
    const lastBar = loc.barInSection === sec.bars - 1; // for fills

    // Resolve this bar's chord (by name) with safe fallbacks.
    const chordName = sec.chords[loc.barInSection % sec.chords.length];
    const chord =
      (this.chords && this.chords[chordName]) ||
      this.progression[absBar % this.progression.length];

    // Resolve patterns for this section (fall back to legacy defaults).
    const arpPat = this.patterns[sec.arp] || this.arpPattern;
    const bassPat = this.patterns[sec.bass] || this.bassPattern;
    const kickPat = this.patterns[sec.kick] || this.kickPattern;
    const hatPat = this.patterns[sec.hat] || this.hatPattern;
    const snarePat = this.patterns[sec.snare] || this.patterns.snareNone;
    const melPat = this.melodies[sec.melody] || this.melodies.none;

    // --- Pad / chord: retrigger softly at the start of each bar ---
    if (inBar === 0) {
      const padDur = (60 / this.BPM) * 4 * 0.98; // ~one bar long
      for (let i = 0; i < chord.notes.length; i++) {
        this._pad(chord.notes[i], padDur, sec.padVol != null ? sec.padVol : 0.12);
      }
    }

    // --- Bassline (1 = root, 2 = root octave up) ---
    const bassHit = bassPat[inBar];
    if (bassHit) {
      const bf = bassHit === 2 ? chord.root * 2 : chord.root;
      this._note(bf, "triangle", 0.22, this.musicGain, sec.bassVol != null ? sec.bassVol : 0.9);
    }

    // --- Arpeggio (an octave up from chord tones) ---
    const arpIdx = arpPat[inBar];
    if (arpIdx !== null && arpIdx !== undefined) {
      const f = chord.notes[arpIdx % chord.notes.length] * 2;
      this._note(f, "sawtooth", 0.13, this.musicGain, sec.arpVol != null ? sec.arpVol : 0.32);
    }

    // --- Lead melody (semitone offsets above A2, rendered two octaves up) ---
    const melDeg = melPat[inBar];
    if (melDeg !== null && melDeg !== undefined && (sec.melVol || 0) > 0) {
      const f = 110.0 * Math.pow(2, melDeg / 12) * 4; // A2 -> +offset -> +2 oct
      this._lead(f, sec.melVol);
    }

    // --- Drums ---
    if (kickPat[inBar]) this._kick(sec.drumVol);
    if (hatPat[inBar]) this._hat(sec.drumVol);
    if (snarePat[inBar]) this._snare(sec.drumVol);

    // --- Fills: a quick 16th hat roll + snare on the last bar of a section ---
    if (lastBar && inBar >= 12) {
      this._hat(sec.drumVol); // extra 16th hats for a build-up
      if (inBar === 14 || inBar === 15) this._snare(sec.drumVol);
    }

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

  // Kick: pitch-swept sine with a fast decay. `vol` scales the section mix.
  _kick(vol = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.9 * vol), t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.2);
  },

  // Hi-hat: short burst of highpassed noise. `vol` scales the section mix.
  _hat(vol = 1) {
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
    g.gain.setValueAtTime(Math.max(0.0001, 0.25 * vol), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.musicGain);
    src.start(t);
  },

  // Snare: a band of mid noise plus a short tonal "crack". `vol` scales the mix.
  _snare(vol = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.13;
    const buf = this._noiseBuffer(dur, "decay");
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.0001, 0.35 * vol), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.musicGain);
    src.start(t);
  },

  // Lead melody voice: a square-ish tone through a lowpass, slightly longer than
  // the arp so the top line sings over the chords. `vol` scales the section mix.
  _lead(freq, vol = 0.3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.2;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    osc.type = "square";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.4 * vol), t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
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
