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

// Melodic pools over the F drone (residency state), in the Spice Opera's desert
// colour: F natural Phrygian — degrees 0,1,3,5,7,8,10. Keeps the signature b2
// (Gb) but a minor 3rd (Ab), so the lonely flute reads dark and yearning rather
// than the brighter, more theatrical Hijaz (major-3rd) it was.
const FLUTE_POOL = [65, 66, 68, 70, 72, 73, 75]; // F4 Gb4 Ab4 Bb4 C5 Db5 Eb5
const BELL_POOL = [70, 72, 77, 81]; // sparse, warm chimes (Bb4 C5 F5 A5)

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
    // Master loudness. Kept deliberately low: the soundscape is meant to be felt
    // at the edge of attention — atmosphere, not a score sitting on top of the
    // game. Standing preference is conservative (err quiet); raise cautiously.
    this.level = 0.161;

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
    // Kept MONO and ~2.4s on purpose: convolution is by far the heaviest node
    // in the graph and runs continuously in every room, so a long *stereo* IR
    // was starving the audio thread → crackle. A mono 2.4s IR is ~70% cheaper
    // and still a roomy stone hall. (Offline rendering shows the synthesised
    // signal itself is clean — no clipping/clicks — so the fix is CPU, not DSP.)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.4, 2.6);
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

    // ~2s white-noise buffer — the seed for wind, murmur and static.
    const len = Math.floor(ctx.sampleRate * 2);
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;

    // ~6s PINK (1/f) noise — calmer and warmer than white (energy falls with
    // frequency, matching the ear), so air/room-tone/breath don't hiss. Longer
    // than the white buffer so its loop point is harder to hear. Paul Kellet's
    // refined filter (firstpr.com.au/dsp/pink-noise).
    const plen = Math.floor(ctx.sampleRate * 6);
    this.pinkBuffer = ctx.createBuffer(1, plen, ctx.sampleRate);
    const pd = this.pinkBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < plen; i += 1) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      pd[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }

  /** A mono decaying-noise impulse response → a stone-hall reverb (CPU-light). */
  makeImpulse(dur, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
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
    // Build the full audio graph while the context is still suspended so the
    // first gesture only needs to call ctx.resume() — no synchronous DSP burst.
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.buildMusic();
      this.setMusicState(this.musicState || 'residency', 0);
      this.setAmbience(this.ambienceKey || 'hall', true);
    }
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
    // Long, gentle fade-in so the bed *emerges* as you enter rather than
    // landing as a heavy drone you then wait to mellow.
    this.applyLevel(this.enabled ? this.level : 0, 2.5);
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
      g.gain.value = dGains[i] * 0.34; // lighter — was pressing too heavy
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
    subG.gain.value = 0.085; // lighter sub — less of the "heavy" weight on entry
    const subLfo = ctx.createOscillator();
    subLfo.frequency.value = 0.025;
    const subLg = ctx.createGain();
    subLg.gain.value = 0.05;
    subLfo.connect(subLg).connect(subG.gain);
    sub.connect(subG).connect(this.musicGain);
    sub.start(now);
    subLfo.start(now);
    this.subGain = subG;
    this.subBase = 0.085;

    // Breath: the whole harmonic bed swells and recedes — but driven by THREE
    // slow LFOs at CO-PRIME periods (19 / 29 / 41 s) summed over a low floor,
    // not one tidy 36s sine. A single LFO *is* a loop the ear locks onto; three
    // incommensurate ones never realign (their cycle is their LCM ≈ 6.3 hours),
    // so the loudness never settles into an audible "whoosh-whoosh". The floor
    // sits below the swing depth, so the troughs cross through zero — real
    // stretches of near-silence, the space the atmosphere lives in. (A briefly
    // negative bus gain is an inaudible polarity flip at near-zero magnitude.)
    // The bus param is held at 0; these sources sum on top. setMusicState and
    // the master fade live on other nodes and are untouched.
    // Periods are long (≈1–2.5 min) so the swells build and fade like part of
    // the fabric, not as sudden crescendos — slow enough to feel, not hear.
    this.musicGain.gain.value = 0;
    const floor = ctx.createConstantSource();
    floor.offset.value = 0.14; // low resting level
    floor.connect(this.musicGain.gain);
    floor.start(now);
    [[0.12, 67], [0.09, 97], [0.06, 139]].forEach(([depth, period]) => {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 1 / period;
      const dg = ctx.createGain();
      dg.gain.value = depth;
      lfo.connect(dg).connect(this.musicGain.gain);
      lfo.start(now);
    });
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
    src.buffer = this.pinkBuffer; // pink, not white — warmer air, less hiss
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
    src.buffer = this.pinkBuffer; // pink, not white — warm air, no hiss
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
    src.buffer = this.pinkBuffer; // pink, not white — murmur is warmer/less hissy
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

  // --- Spice Opera voices (HERAD-style expressive FM) -----------------------

  /**
   * The "crying flute" — the Spice Opera's signature foreground voice. A
   * 2-operator FM tone (modulator → index gain → carrier.frequency) blended
   * with a low breath layer of bandpass pink noise. The HERAD lesson: the note
   * must *move* — the modulation index is brightest on the attack and mellows
   * as it sustains, vibrato fades in, and the pitch glides (portamento) from
   * the previous note for the vocal "cry". Routed dry (quiet) + wet (mostly)
   * straight to master/reverb so it floats distant in the hall, unaffected by
   * the bed's breathing. One-shot; stops itself.
   */
  cryingFlute({ note, prev = null, level = 0.055, dur = 3.0, pan = 0 }) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const f = freq(note);

    // Carrier (the tone). Glide in from the previous note if there was one.
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    if (prev) {
      carrier.frequency.setValueAtTime(freq(prev), now);
      carrier.frequency.exponentialRampToValueAtTime(f, now + 0.3);
    } else {
      carrier.frequency.setValueAtTime(f, now);
    }

    // 2-op FM: modulator at a 2:1 ratio → reedy, harmonic. Index = depth in Hz.
    // Kept gentle (the bright attack was too sudden/loud) and mellowing slowly.
    const modulator = ctx.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.value = f * 2;
    const index = ctx.createGain();
    index.gain.setValueAtTime(f * 0.55, now);
    index.gain.linearRampToValueAtTime(f * 0.7, now + dur * 0.4); // brighten *in*
    index.gain.linearRampToValueAtTime(f * 0.22, now + dur); // then mellow
    modulator.connect(index).connect(carrier.frequency);

    // Vibrato (~5 Hz), faded in late so the note blooms long before it wavers.
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vibG = ctx.createGain();
    vibG.gain.setValueAtTime(0, now);
    vibG.gain.linearRampToValueAtTime(f * 0.005, now + dur * 0.5);
    vib.connect(vibG).connect(carrier.frequency);

    // Breath layer — bandpass pink noise, swelling in softly (not a sudden puff).
    // Stays DRY: broadband noise into the long reverb is the main crackle risk.
    const breath = ctx.createBufferSource();
    breath.buffer = this.pinkBuffer;
    breath.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 3;
    bp.Q.value = 1.2;
    const breathG = ctx.createGain();
    breathG.gain.setValueAtTime(0, now);
    breathG.gain.linearRampToValueAtTime(level * 0.22, now + 0.6); // slow breath-in
    breathG.gain.linearRampToValueAtTime(0.0001, now + dur * 0.85);
    breath.connect(bp).connect(breathG);

    // Amplitude envelope — a slow, intentional swell-in, a hold, then a long
    // fade to true silence (reaching 0 before the nodes stop → no click).
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(level, now + 0.9); // slow swell-in
    amp.gain.setValueAtTime(level, now + dur * 0.55); // hold
    amp.gain.linearRampToValueAtTime(0, now + dur + 1.0); // long fade out
    carrier.connect(amp);

    // Tone: panned, dry (quiet) + a little reverb so it floats distant.
    let tone = amp;
    if (ctx.createStereoPanner && pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      amp.connect(p);
      tone = p;
    }
    tone.connect(this.master);
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    tone.connect(wet).connect(this.revSend);
    breathG.connect(this.master); // breath dry only

    const stop = now + dur + 1.1;
    [carrier, modulator, vib, breath].forEach((n) => {
      n.start(now);
      n.stop(stop);
    });
  }

  /** Schedule a short, sparse, unhurried flute phrase (1–3 notes, portamento). */
  flutePhrase(inst, { pool = FLUTE_POOL, level = 0.055, pan = 0 } = {}) {
    if (!this.ctx || inst.stopped()) return;
    const n = 1 + Math.floor(Math.random() * 3);
    let prev = null;
    let t = 0;
    for (let k = 0; k < n; k += 1) {
      const note = pool[Math.floor(Math.random() * pool.length)];
      const p = prev;
      const at = t;
      const timer = setTimeout(() => {
        if (!inst.stopped()) {
          this.cryingFlute({ note, prev: p, level, pan, dur: 2.8 + Math.random() * 1.6 });
        }
      }, at * 1000);
      inst.timers.push(timer);
      prev = note;
      t += 2.4 + Math.random() * 1.8; // unhurried gap before the next note
    }
  }

  /**
   * A small inharmonic FM chime — the Spice Opera's "chiming fragments". A
   * non-integer carrier:modulator ratio makes it metallic/bell-like; the index
   * rings bright on the attack then decays to a pure sine tail.
   */
  fmBell(inst, { note, level = 0.025, decay = 3.2, ratio = 3.5, pan = 0 }) {
    if (!this.ctx || inst.stopped()) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const f = freq(note);
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = f;
    const modulator = ctx.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.value = f * ratio; // inharmonic → metallic
    const index = ctx.createGain();
    index.gain.setValueAtTime(f * 1.3, now); // a softer clang (was too bright/loud)
    index.gain.exponentialRampToValueAtTime(f * 0.06, now + decay); // → pure tail
    modulator.connect(index).connect(carrier.frequency);
    // A short soft attack rather than an instant strike → less of a "ping".
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(level, now + 0.04);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    carrier.connect(amp);
    let tail = amp;
    if (ctx.createStereoPanner && pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      amp.connect(p);
      tail = p;
    }
    tail.connect(inst.bus);
    const stop = now + decay + 0.2;
    carrier.start(now);
    modulator.start(now);
    carrier.stop(stop);
    modulator.stop(stop);
  }

  /**
   * A slow rotating "radar" — a low hum that throbs once per turn and sweeps
   * across the stereo field on a fixed rotation period, with a soft blip as the
   * beam comes round. Gives a room a rhythmic, mechanical pulse (the Comms
   * Room's sweeping dish) rather than a static drone.
   */
  radarSweep(inst, { period = 6.5, f = 120, level = 0.03, blip = 78 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const rate = 1 / period;

    // The throbbing hum: a steady floor plus a once-per-rotation swell.
    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0; // driven entirely by the sources below
    const floor = ctx.createConstantSource();
    floor.offset.value = level * 0.45;
    const throb = ctx.createOscillator();
    throb.type = 'sine';
    throb.frequency.value = rate;
    const throbG = ctx.createGain();
    throbG.gain.value = level * 0.55;
    floor.connect(g.gain);
    throb.connect(throbG).connect(g.gain);
    tone.connect(g);

    // Sweep it across the stereo field, in time with the throb → rotation.
    let out = g;
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      const plfo = ctx.createOscillator();
      plfo.type = 'sine';
      plfo.frequency.value = rate;
      const pg = ctx.createGain();
      pg.gain.value = 0.9;
      plfo.connect(pg).connect(pan.pan);
      g.connect(pan);
      out = pan;
      plfo.start(now);
      inst.nodes.push(plfo);
    }
    out.connect(inst.bus);
    tone.start(now);
    throb.start(now);
    floor.start(now);
    inst.nodes.push(tone, throb, floor);

    // A soft blip once per rotation, leading the field as the beam sweeps past.
    this.every(inst, period * 1000, period * 1000, () =>
      this.ping(inst, { notes: [blip], type: 'sine', level: level * 0.7, decay: 0.5, pan: 0.7 })
    );
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
  // Great Hall — the low pressure of a vast stone space, mostly silence, over
  // which a lonely "crying flute" sings the occasional desert phrase (the Spice
  // Opera's signature) and a rare deep gong rings out long into the hall.
  hall(am, inst) {
    am.reverbAmount(inst, 0.7);
    am.roomTone(inst, { cut: 200, level: 0.04, swellRate: 0.025 });
    am.every(inst, 16000, 34000, () =>
      am.flutePhrase(inst, { level: 0.05, pan: (Math.random() - 0.5) * 1.0 })
    );
    am.every(inst, 26000, 52000, () => am.gong(inst, { level: 0.08, decay: 9 }));
  },

  // The Court — deep stone air, formal murmur of courtiers, rare ceremony gong,
  // and the lonely flute drifting in from the hall beyond.
  court(am, inst) {
    am.reverbAmount(inst, 0.5);
    am.roomTone(inst, { cut: 160, level: 0.03, swellRate: 0.018 });
    am.murmur(inst, { center: 380, level: 0.04, gustRate: 0.16 });
    am.murmur(inst, { center: 250, Q: 1.0, level: 0.025, gustRate: 0.11 });
    am.every(inst, 32000, 65000, () => am.gong(inst, { level: 0.06, decay: 10 }));
    am.every(inst, 50000, 100000, () =>
      am.flutePhrase(inst, { level: 0.035, pan: (Math.random() - 0.5) * 0.8 })
    );
  },

  // The Communications Room — a faint relay hum under a slow rotating radar that
  // throbs and sweeps the stereo field (the dish coming round), thin static, and
  // the Spice Opera's sparse inharmonic FM "chiming fragments". A tech hush with
  // a rhythmic mechanical pulse, not a busy switchboard.
  comms(am, inst) {
    am.reverbAmount(inst, 0.25);
    am.hum(inst, { f: 120, level: 0.014, wobble: 2, wobbleRate: 0.2 }); // faint floor
    am.radarSweep(inst, { period: 6.5, f: 120, level: 0.028, blip: 78 });
    am.wind(inst, { band: 1600, Q: 2.0, level: 0.006, sweep: 200, sweepRate: 0.4 }); // thin static
    am.every(inst, 9000, 18000, () =>
      am.fmBell(inst, {
        note: BELL_POOL[Math.floor(Math.random() * BELL_POOL.length)],
        level: 0.018,
        decay: 3.2,
        ratio: Math.random() < 0.5 ? 3.5 : 1.41,
        pan: (Math.random() - 0.5) * 1.6,
      })
    );
  },

  // The Veil's Sanctum — still close air, high shimmer, inharmonic FM chimes
  // (the Veil's language of signs), and a rare watching flute phrase.
  veil(am, inst) {
    am.reverbAmount(inst, 0.7);
    am.roomTone(inst, { cut: 180, level: 0.025, swellRate: 0.012 });
    am.wind(inst, { band: 2400, Q: 3, level: 0.008, sweep: 300, sweepRate: 0.5 });
    am.every(inst, 4000, 9000, () =>
      am.fmBell(inst, {
        note: [81, 84, 86, 88][Math.floor(Math.random() * 4)],
        level: 0.018,
        decay: 4.5,
        ratio: Math.random() < 0.4 ? 3.5 : 2.01,
        pan: (Math.random() - 0.5) * 1.8,
      })
    );
    am.every(inst, 28000, 56000, () =>
      am.flutePhrase(inst, { level: 0.04, pan: (Math.random() - 0.5) * 0.6 })
    );
  },

  // The Infirmary — sterile hum, a buried tritone that beats slightly (unease you
  // can't name), sub-rumble, and a rare cold ping — almost clinical, almost wrong.
  infirmary(am, inst) {
    am.reverbAmount(inst, 0.15);
    am.roomTone(inst, { cut: 240, level: 0.03, swellRate: 0.02 });
    am.hum(inst, { f: 2000, level: 0.018, wobble: 6, wobbleRate: 0.4 });
    am.chord(inst, { notes: [57, 63], gains: [0.05, 0.04], cutoff: 800, Q: 0.8 });
    am.subRumble(inst, { f: 41.5, level: 0.1, lfoRate: 0.07 });
    am.every(inst, 20000, 45000, () =>
      am.ping(inst, { notes: [63, 69], type: 'sine', level: 0.022, decay: 2.5, pan: (Math.random() - 0.5) * 0.8 })
    );
  },

  // The Bladewarden's Yard — open air, desert wind, the ring of steel, a faint
  // Sleeper presence below, and a rare flute phrase blown in off the dunes.
  yard(am, inst) {
    am.reverbAmount(inst, 0.1);
    am.wind(inst, { band: 650, level: 0.07, sweep: 360, sweepRate: 0.09 });
    am.subRumble(inst, { f: 34, level: 0.06, lfoRate: 0.025 });
    am.every(inst, 5000, 12000, () =>
      am.ping(inst, { notes: [88, 91, 93], type: 'square', level: 0.022, decay: 1.6, pan: (Math.random() - 0.5) * 1.2 })
    );
    am.every(inst, 38000, 75000, () =>
      am.flutePhrase(inst, { level: 0.03, pan: (Math.random() - 0.5) * 1.2 })
    );
  },

  // Eren's Quarters — the quietest place. Still night air, soft Aurun shimmer,
  // and the lonely Phrygian flute heard only once before silence returns.
  quarters(am, inst) {
    am.reverbAmount(inst, 0.35);
    am.roomTone(inst, { cut: 180, level: 0.02, swellRate: 0.015 });
    am.wind(inst, { band: 380, level: 0.022, sweep: 180, sweepRate: 0.04 });
    am.every(inst, 12000, 26000, () =>
      am.ping(inst, { notes: [88, 91, 96], type: 'sine', level: 0.028, decay: 5.5, pan: (Math.random() - 0.5) * 1.4 })
    );
    am.every(inst, 32000, 70000, () =>
      am.flutePhrase(inst, { level: 0.04, pan: (Math.random() - 0.5) * 1.0 })
    );
  },

  // The Corsair Deck — strong dune wind, Sleeper rumble underfoot, a deep gong
  // as they stir, and the desert flute calling from outside.
  deck(am, inst) {
    am.reverbAmount(inst, 0.12);
    am.wind(inst, { band: 700, level: 0.09, sweep: 420, sweepRate: 0.1 });
    am.subRumble(inst, { f: 34, level: 0.14, lfoRate: 0.03 });
    am.every(inst, 22000, 50000, () => am.gong(inst, { roots: [29, 33], level: 0.07, decay: 8 }));
    am.every(inst, 35000, 70000, () =>
      am.flutePhrase(inst, { level: 0.038, pan: (Math.random() - 0.5) * 1.4 })
    );
  },

  // The War Map — shares the comms-room atmosphere.
  map(am, inst) {
    RECIPES.comms(am, inst);
  },

  // Expedition — open desert. Wind, Sleeper sub, sparse FM bells (chiming
  // fragments carrying far across the dunes), and the lonely flute, rarely.
  expedition(am, inst) {
    am.reverbAmount(inst, 0.08);
    am.wind(inst, { band: 550, level: 0.07, sweep: 300, sweepRate: 0.07 });
    am.subRumble(inst, { f: 34, level: 0.16, lfoRate: 0.03 });
    am.every(inst, 8000, 22000, () =>
      am.fmBell(inst, {
        note: BELL_POOL[Math.floor(Math.random() * BELL_POOL.length)],
        level: 0.04,
        decay: 5.5,
        ratio: 3.5,
        pan: (Math.random() - 0.5) * 1.8,
      })
    );
    am.every(inst, 28000, 58000, () =>
      am.flutePhrase(inst, { level: 0.04, pan: (Math.random() - 0.5) * 1.4 })
    );
  },
};
