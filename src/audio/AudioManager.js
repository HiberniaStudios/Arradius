/**
 * AudioManager — the two-bus soundscape of Arradius.
 *
 * Everything is synthesized with the Web Audio API; there are no audio files.
 *
 *   master ─┬─ musicGain     (continuous spice-opera score — never interrupted)
 *           ├─ ambienceGain  (per-room atmosphere — crossfades when you move)
 *           └─ reverb        (shared convolution hall, fed by both buses)
 *
 * The MUSIC bus is the grand-hall bed: a low sacred drone chord, a warm choral
 * pad and a near-subsonic rumble, all ringing through a synthesized stone-hall
 * reverb. It is presence, not a song. It evolves between two states — the
 * contained Residency and the open desert — by transposing down a fourth and
 * lifting the sub the moment you ride out.
 *
 * The AMBIENCE bus is *place*: each room owns a recipe of air, murmur, hum,
 * wind, bells or gongs that crossfades in over ~1s when you enter and out as
 * you leave. The harmony comes from the music; the room only colours the air.
 *
 * Browsers block audio until a user gesture, so call start() from a pointer or
 * key handler. setEnabled() fades the master without tearing down the graph.
 */

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

// Music states. `transpose` is in semitones from the bed's written pitch.
// The lowpass cutoffs are deliberately low: the bed should be felt in the
// chest, not heard as a mid-range chord. Open them up if you want it brighter.
const MUSIC = {
  residency: { transpose: 0, sub: 0.12, droneCut: 320, padCut: 600 },
  expedition: { transpose: -5, sub: 0.22, droneCut: 260, padCut: 480 },
};

export default class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.ambienceGain = null;
    this.revSend = null;
    this.reverb = null;
    this.noiseBuffer = null;

    this.enabled = true;
    this.isPlaying = false;
    // Master loudness. Kept low on purpose: the soundscape is meant to be felt
    // at the edge of attention — atmosphere, not a score sitting on top of the
    // game. Raise toward ~0.32 if you want it more forward.
    this.level = 0.2;

    this.musicVoices = []; // { osc, base } — retuned on state change
    this.droneFilter = null;
    this.padFilter = null;
    this.subGain = null;
    this.musicState = null;

    this.ambienceKey = null;
    this.ambienceInstance = null;
    this.crossfade = 1.0; // seconds, room → room
  }

  // --- Context & lifecycle --------------------------------------------------

  ensureContext() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0; // ramped up in start()
    this.master.connect(ctx.destination);

    // Shared grand-hall reverb — convolution with a decaying-noise impulse.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(4.2, 3.0);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.9;
    this.reverb.connect(revOut).connect(this.master);
    this.revSend = ctx.createGain();
    this.revSend.gain.value = 0.6;
    this.revSend.connect(this.reverb);

    // The harmonic bed is the "presence" of the world. Held well back so it
    // reads as a distant drone you stop noticing, not a chord pressing on you.
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master);

    // Per-room air sits a touch under unity so atmosphere colours the silence
    // rather than filling it.
    this.ambienceGain = ctx.createGain();
    this.ambienceGain.gain.value = 0.8;
    this.ambienceGain.connect(this.master);

    // ~2s white-noise buffer — the seed for all air, wind, murmur and static.
    const len = Math.floor(ctx.sampleRate * 2);
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
  }

  /** A decaying-noise impulse response → a large stone-hall reverb. */
  makeImpulse(dur, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i += 1) {
        d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
      }
    }
    return buf;
  }

  /**
   * Pre-build the audio graph so the first gesture starts sound instantly.
   *
   * Generating the convolution impulse and the noise buffer is a burst of
   * synchronous DSP. If it runs inside start() — on the user's first click —
   * sound is audibly late. A browser lets us create the context (suspended)
   * and fill these buffers without a gesture; only resuming needs one. So we
   * do the heavy work at load time and leave start() to merely resume + ramp.
   * Idempotent and safe to call before any user interaction.
   */
  prepare() {
    this.ensureContext();
  }

  /** Begin the score. Idempotent. Defaults to the Residency state + hall. */
  start() {
    this.ensureContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.buildMusic();
      this.setMusicState(this.musicState || 'residency', 0);
      if (!this.ambienceKey) this.setAmbience('hall');
      else this.setAmbience(this.ambienceKey, true);
    }
    this.applyLevel(this.enabled ? this.level : 0, 1.6);
  }

  applyLevel(v, t) {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(v, now + t);
  }

  // --- Music bus ------------------------------------------------------------

  buildMusic() {
    const now = this.ctx.currentTime;
    const ctx = this.ctx;

    // Wet send shared by the harmonic music buses. Run it hot — most of the
    // bed should reach you as reverb tail (the space), not direct sound.
    const musicRev = ctx.createGain();
    musicRev.gain.value = 0.6;
    musicRev.connect(this.revSend);

    // Sacred drone chord through a soft lowpass — F1 C2 F2 C3 (open fifths).
    const droneBus = ctx.createBiquadFilter();
    droneBus.type = 'lowpass';
    droneBus.frequency.value = 700;
    droneBus.connect(this.musicGain);
    droneBus.connect(musicRev);
    this.droneFilter = droneBus;

    // F1 C2 F2 — open fifths only. The old top C3 added mid presence that read
    // as a "chord"; dropping it leaves a darker, sparser bed.
    const dNotes = [29, 36, 41];
    const dGains = [0.5, 0.34, 0.3];
    dNotes.forEach((n, i) => {
      const osc = ctx.createOscillator();
      osc.type = i < 2 ? 'sine' : 'triangle';
      osc.frequency.value = freq(n);
      osc.detune.value = (Math.random() - 0.5) * 6;
      const g = ctx.createGain();
      g.gain.value = dGains[i] * 0.42;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.03 + Math.random() * 0.05;
      const lg = ctx.createGain();
      lg.gain.value = dGains[i] * 0.25;
      lfo.connect(lg).connect(g.gain);
      osc.connect(g).connect(droneBus);
      osc.start(now);
      lfo.start(now);
      this.musicVoices.push({ osc, base: freq(n) });
    });

    // Warm choral-ish pad a register up — F3 C4 F4 (the spice-opera colour).
    const padBus = ctx.createBiquadFilter();
    padBus.type = 'lowpass';
    padBus.frequency.value = 1300;
    padBus.Q.value = 0.6;
    padBus.connect(this.musicGain);
    padBus.connect(musicRev);
    this.padFilter = padBus;

    // F3 C4 — the choral colour, thinned (top F4 dropped) and held quieter so
    // it tints the drone rather than singing over it.
    [53, 60].forEach((n, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq(n);
      osc.detune.value = (i - 1) * 5 + (Math.random() - 0.5) * 4;
      const g = ctx.createGain();
      g.gain.value = 0;
      const base = ctx.createConstantSource();
      base.offset.value = 0.028;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.016 + i * 0.005;
      const lg = ctx.createGain();
      lg.gain.value = 0.028;
      base.connect(g.gain);
      lfo.connect(lg).connect(g.gain);
      osc.connect(g).connect(padBus);
      osc.start(now);
      lfo.start(now);
      base.start(now);
      this.musicVoices.push({ osc, base: freq(n) });
    });

    // Near-subsonic rumble — the weight of the world (dry, no reverb).
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 30;
    const subG = ctx.createGain();
    subG.gain.value = 0.12;
    const subLfo = ctx.createOscillator();
    subLfo.frequency.value = 0.025;
    const subLg = ctx.createGain();
    subLg.gain.value = 0.05;
    subLfo.connect(subLg).connect(subG.gain);
    sub.connect(subG).connect(this.musicGain);
    sub.start(now);
    subLfo.start(now);
    this.subGain = subG;
    this.subBase = 0.12;

    // Breath: the whole harmonic bed slowly swells in and recedes toward
    // near-silence on a ~36s tide, so the score reads as presence coming and
    // going rather than a constant drone. The bus gain is driven entirely by
    // these two sources — its intrinsic value is held at 0 and they sum on top,
    // swinging it between ~0.02 (almost gone) and ~0.38 (full). setMusicState
    // and the master fade are untouched by this; they live on other nodes.
    this.musicGain.gain.value = 0;
    const breath = ctx.createConstantSource();
    breath.offset.value = 0.2; // midpoint of the swell
    const breathLfo = ctx.createOscillator();
    breathLfo.type = 'sine';
    breathLfo.frequency.value = 1 / 36; // ~36s in-and-out cycle
    const breathDepth = ctx.createGain();
    breathDepth.gain.value = 0.18; // swing depth around the midpoint
    breath.connect(this.musicGain.gain);
    breathLfo.connect(breathDepth).connect(this.musicGain.gain);
    breath.start(now);
    breathLfo.start(now);
  }

  /** Ramp the score between its Residency and Expedition states. */
  setMusicState(key, ramp = 6) {
    this.musicState = key;
    if (!this.ctx || !this.musicVoices.length) return;
    const s = MUSIC[key];
    const ratio = 2 ** (s.transpose / 12);
    const t = this.ctx.currentTime;
    this.musicVoices.forEach(({ osc, base }) => {
      osc.frequency.cancelScheduledValues(t);
      osc.frequency.setValueAtTime(osc.frequency.value, t);
      osc.frequency.linearRampToValueAtTime(base * ratio, t + ramp);
    });
    this.ramp(this.droneFilter.frequency, s.droneCut, ramp);
    this.ramp(this.padFilter.frequency, s.padCut, ramp);
    this.ramp(this.subGain.gain, this.subBase * (s.sub / 0.12), ramp);
  }

  ramp(param, value, t) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + t);
  }

  // --- Ambience bus ---------------------------------------------------------

  /** Crossfade to a room's atmosphere. No-op if already there. */
  setAmbience(key, force = false) {
    if (!RECIPES[key]) return;
    if (this.ambienceKey === key && this.ambienceInstance && !force) return;
    // Before the score is running the context may already exist (pre-warmed),
    // but the bed is built by start(); just record the room it should open in.
    if (!this.ctx || !this.isPlaying) {
      this.ambienceKey = key; // honoured by start()
      return;
    }
    this.ambienceKey = key;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Fade out and retire whatever is playing.
    const old = this.ambienceInstance;
    if (old) {
      old.alive = false;
      old.bus.gain.cancelScheduledValues(now);
      old.bus.gain.setValueAtTime(old.bus.gain.value, now);
      old.bus.gain.linearRampToValueAtTime(0, now + this.crossfade);
      old.timers.forEach(clearTimeout);
      setTimeout(() => this.retire(old), (this.crossfade + 0.3) * 1000);
    }

    // New bed: dry sum → ambienceGain, plus a per-room wet send → reverb.
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.ambienceGain);
    const revGain = ctx.createGain();
    revGain.gain.value = 0;
    bus.connect(revGain).connect(this.revSend);

    const inst = { bus, revGain, nodes: [], timers: [], alive: true };
    inst.stopped = () => !inst.alive;
    this.ambienceInstance = inst;

    RECIPES[key](this, inst);

    bus.gain.linearRampToValueAtTime(1, now + this.crossfade);
  }

  retire(inst) {
    inst.nodes.forEach((n) => {
      try {
        n.stop();
      } catch (e) {
        /* already stopped */
      }
    });
    try {
      inst.bus.disconnect();
    } catch (e) {
      /* already gone */
    }
  }

  /** Set how wet (reverberant) a room's ambience is. */
  reverbAmount(inst, amount) {
    inst.revGain.gain.value = amount;
  }

  // --- Ambience voice helpers (all connect to inst.bus) ---------------------

  chord(inst, { notes, gains, type = 'sine', cutoff = 900, Q = 0.5 }) {
    const now = this.ctx.currentTime;
    const bus = this.ctx.createBiquadFilter();
    bus.type = 'lowpass';
    bus.frequency.value = cutoff;
    bus.Q.value = Q;
    bus.connect(inst.bus);
    notes.forEach((n, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = Array.isArray(type) ? type[i] || 'sine' : type;
      osc.frequency.value = freq(n);
      osc.detune.value = (Math.random() - 0.5) * 8;
      const g = this.ctx.createGain();
      g.gain.value = gains[i];
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.03 + Math.random() * 0.06;
      const lg = this.ctx.createGain();
      lg.gain.value = gains[i] * 0.35;
      lfo.connect(lg).connect(g.gain);
      osc.connect(g).connect(bus);
      osc.start(now);
      lfo.start(now);
      inst.nodes.push(osc, lfo);
    });
  }

  wind(inst, { band = 550, Q = 0.7, level = 0.06, sweep = 300, sweepRate = 0.07, swellRate = 0.05 }) {
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = band;
    filt.Q.value = Q;
    const g = this.ctx.createGain();
    g.gain.value = level;
    const sw = this.ctx.createOscillator();
    sw.frequency.value = sweepRate;
    const swG = this.ctx.createGain();
    swG.gain.value = sweep;
    sw.connect(swG).connect(filt.frequency);
    const sl = this.ctx.createOscillator();
    sl.frequency.value = swellRate;
    const slG = this.ctx.createGain();
    slG.gain.value = level * 0.6;
    sl.connect(slG).connect(g.gain);
    src.connect(filt).connect(g).connect(inst.bus);
    src.start(now);
    sw.start(now);
    sl.start(now);
    inst.nodes.push(src, sw, sl);
  }

  /**
   * Steady low air — the felt pressure of a large enclosed space, no wind.
   * Lowpassed noise with only a very slow swell, so it sits as room tone the
   * ear stops noticing rather than weather moving through.
   */
  roomTone(inst, { cut = 200, level = 0.04, swellRate = 0.025 }) {
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = cut;
    filt.Q.value = 0.3;
    const g = this.ctx.createGain();
    g.gain.value = level;
    const sl = this.ctx.createOscillator();
    sl.frequency.value = swellRate;
    const slG = this.ctx.createGain();
    slG.gain.value = level * 0.5;
    sl.connect(slG).connect(g.gain);
    src.connect(filt).connect(g).connect(inst.bus);
    src.start(now);
    sl.start(now);
    inst.nodes.push(src, sl);
  }

  /** Filtered noise shaped to the speech band — a room full of low voices. */
  murmur(inst, { center = 420, Q = 1.4, level = 0.05, gustRate = 0.18 }) {
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = center;
    filt.Q.value = Q;
    const g = this.ctx.createGain();
    g.gain.value = level;
    const gust = this.ctx.createOscillator();
    gust.type = 'triangle';
    gust.frequency.value = gustRate;
    const gustG = this.ctx.createGain();
    gustG.gain.value = level * 0.7;
    gust.connect(gustG).connect(g.gain);
    src.connect(filt).connect(g).connect(inst.bus);
    src.start(now);
    gust.start(now);
    inst.nodes.push(src, gust);
  }

  subRumble(inst, { f = 34, level = 0.16, lfoRate = 0.03 }) {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = lfoRate;
    const lg = this.ctx.createGain();
    lg.gain.value = level;
    lfo.connect(lg).connect(g.gain);
    osc.connect(g).connect(inst.bus);
    osc.start(now);
    lfo.start(now);
    inst.nodes.push(osc, lfo);
  }

  /** A sterile, faintly wavering high hum — clean surfaces, machinery. */
  hum(inst, { f = 1900, level = 0.018, wobble = 4, wobbleRate = 0.5 }) {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.value = level;
    const wob = this.ctx.createOscillator();
    wob.frequency.value = wobbleRate;
    const wobG = this.ctx.createGain();
    wobG.gain.value = wobble;
    wob.connect(wobG).connect(osc.frequency);
    osc.connect(g).connect(inst.bus);
    osc.start(now);
    wob.start(now);
    inst.nodes.push(osc, wob);
  }

  /** Recurring scheduler that respects the instance's lifetime. */
  every(inst, minMs, maxMs, fn) {
    const tick = () => {
      if (inst.stopped()) return;
      fn();
      const t = setTimeout(tick, minMs + Math.random() * (maxMs - minMs));
      inst.timers.push(t);
    };
    const t0 = setTimeout(tick, minMs + Math.random() * (maxMs - minMs));
    inst.timers.push(t0);
  }

  /** One ringing tone — a bell, a struck blade, a chime. */
  ping(inst, { notes, type = 'triangle', level = 0.12, decay = 4.5, pan = 0 }) {
    if (!this.ctx || inst.stopped()) return;
    const now = this.ctx.currentTime;
    const note = notes[Math.floor(Math.random() * notes.length)];
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq(note);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(level, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    let tail = g;
    if (this.ctx.createStereoPanner && pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      tail = p;
    }
    osc.connect(g);
    tail.connect(inst.bus);
    osc.start(now);
    osc.stop(now + decay + 0.2);
  }

  /** A deep struck gong with inharmonic partials — rings into the hall. */
  gong(inst, { roots = [33, 36, 40], level = 0.16, decay = 7 }) {
    if (!this.ctx || inst.stopped()) return;
    const now = this.ctx.currentTime;
    const root = roots[Math.floor(Math.random() * roots.length)];
    const partials = [1, 2.01, 2.78, 4.12];
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(level, now + 0.02);
    out.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    out.connect(inst.bus);
    partials.forEach((p, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq(root) * p;
      const g = this.ctx.createGain();
      g.gain.value = 1 / (i + 1.5);
      osc.connect(g).connect(out);
      osc.start(now);
      osc.stop(now + decay + 0.2);
    });
  }

  /** A slow low pulse — a relay handshake, a far drum. */
  pulse(inst, { f = 70, level = 0.12, decay = 0.5 }) {
    if (!this.ctx || inst.stopped()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(level, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    osc.connect(g).connect(inst.bus);
    osc.start(now);
    osc.stop(now + decay + 0.1);
  }

  // --- Master controls ------------------------------------------------------

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.applyLevel(on ? this.level : 0, 0.4);
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  suspendForHidden() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resumeIfVisible() {
    if (this.ctx && this.ctx.state === 'suspended' && this.isPlaying) {
      this.ctx.resume();
    }
  }
}

// --- Per-room recipes -------------------------------------------------------
// The music bed carries the harmony; recipes only colour the air of a place.
// Levels are deliberately low — the bus and master gains set final loudness.
const RECIPES = {
  // Great Hall — the low pressure of a vast stone space, mostly silence, with
  // a rare deep gong ringing out long into the hall. No wind; just air.
  hall(am, inst) {
    am.reverbAmount(inst, 0.7);
    am.roomTone(inst, { cut: 200, level: 0.04, swellRate: 0.025 });
    am.every(inst, 18000, 40000, () => am.gong(inst, { level: 0.1, decay: 8 }));
  },

  // The Court — formal hush over a low murmur of courtiers.
  court(am, inst) {
    am.reverbAmount(inst, 0.35);
    am.murmur(inst, { center: 440, level: 0.05, gustRate: 0.2 });
    am.murmur(inst, { center: 280, Q: 1.0, level: 0.03, gustRate: 0.13 });
  },

  // The Communications Room — relay hum, transmission pulses, faint static.
  comms(am, inst) {
    am.reverbAmount(inst, 0.2);
    am.hum(inst, { f: 120, level: 0.04, wobble: 2, wobbleRate: 0.2 });
    am.wind(inst, { band: 1600, Q: 2.0, level: 0.012, sweep: 200, sweepRate: 0.4 }); // thin static
    am.every(inst, 2200, 4200, () => am.pulse(inst, { f: 64, level: 0.09, decay: 0.45 }));
    am.every(inst, 5000, 12000, () =>
      am.ping(inst, { notes: [84, 86, 88], type: 'sine', level: 0.03, decay: 0.35, pan: (Math.random() - 0.5) * 1.6 })
    );
  },

  // The Veil's Sanctum — supernatural shimmer, candle air, close bells.
  veil(am, inst) {
    am.reverbAmount(inst, 0.55);
    am.wind(inst, { band: 2400, Q: 3, level: 0.01, sweep: 400, sweepRate: 0.6 }); // airy shimmer
    am.chord(inst, { notes: [64, 69], gains: [0.03, 0.025], type: 'triangle', cutoff: 2600 });
    am.every(inst, 3500, 8000, () =>
      am.ping(inst, { notes: [81, 84, 86, 88, 91], type: 'sine', level: 0.05, decay: 3.5, pan: (Math.random() - 0.5) * 1.6 })
    );
  },

  // The Infirmary — clean on the surface, wrong underneath. Orlin's room.
  infirmary(am, inst) {
    am.reverbAmount(inst, 0.15);
    am.hum(inst, { f: 2000, level: 0.02, wobble: 6, wobbleRate: 0.4 }); // sterile hum
    // A root and its tritone, detuned so they beat — an unease you can't name.
    am.chord(inst, { notes: [57, 63], gains: [0.05, 0.04], cutoff: 800, Q: 0.8 });
    am.subRumble(inst, { f: 41.5, level: 0.1, lfoRate: 0.07 });
  },

  // The Bladewarden's Yard — open air, wind, the occasional ring of steel.
  yard(am, inst) {
    am.reverbAmount(inst, 0.1);
    am.wind(inst, { band: 650, level: 0.07, sweep: 360, sweepRate: 0.09 });
    am.every(inst, 6000, 14000, () =>
      am.ping(inst, { notes: [88, 91, 93], type: 'square', level: 0.025, decay: 1.6, pan: (Math.random() - 0.5) * 1.2 })
    );
  },

  // Eren's Quarters — the quietest place. Night wind and faint Aurun shimmer.
  quarters(am, inst) {
    am.reverbAmount(inst, 0.25);
    am.wind(inst, { band: 380, level: 0.025, sweep: 200, sweepRate: 0.04 });
    am.every(inst, 11000, 22000, () =>
      am.ping(inst, { notes: [88, 91, 96], type: 'sine', level: 0.035, decay: 5, pan: (Math.random() - 0.5) * 1.4 })
    );
  },

  // The Corsair Deck — strong wind off the dunes, Sleepers stirring below.
  deck(am, inst) {
    am.reverbAmount(inst, 0.1);
    am.wind(inst, { band: 700, level: 0.1, sweep: 420, sweepRate: 0.1 });
    am.subRumble(inst, { f: 34, level: 0.15, lfoRate: 0.03 });
  },

  // The War Map — the strategic overview shares the comms-room atmosphere.
  map(am, inst) {
    RECIPES.comms(am, inst);
  },

  // Expedition — open desert: dry wind, Sleeper rumble, distant bells.
  expedition(am, inst) {
    am.reverbAmount(inst, 0.08);
    am.wind(inst, { band: 550, level: 0.07, sweep: 300, sweepRate: 0.07 });
    am.subRumble(inst, { f: 34, level: 0.16, lfoRate: 0.03 });
    am.every(inst, 7000, 19000, () =>
      am.ping(inst, { notes: [69, 72, 76, 79, 81], level: 0.1, decay: 4.5, pan: (Math.random() - 0.5) * 1.4 })
    );
  },
};
