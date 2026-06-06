/**
 * Ambient soundscape for Arradius — a grand-hall spice-opera bed.
 *
 * Synthesizes the hush of a vast palace hall with the Web Audio API, in the
 * spirit of Cryo's Dune "Spice Opera": a low, sacred drone chord; a warm
 * choral-ish pad; a near-subsonic rumble; the faint air of a great stone room;
 * and occasional deep struck gongs — all fed through a convolution reverb so it
 * rings as if in a cavernous hall. No audio files.
 *
 * Browsers block audio until a user gesture, so call start() from a pointer or
 * key handler. setEnabled() fades the master in/out without tearing down the graph.
 */

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

export default class Ambient {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.revSend = null;
    this.reverb = null;
    this.noiseBuffer = null;
    this.enabled = true;
    this.isPlaying = false;
    this.voices = [];
    this.timers = [];
    this.level = 0.38;
  }

  ensureContext() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0; // ramped up in start()
    this.master.connect(ctx.destination);

    // Grand-hall reverb — convolution with a synthesized decaying-noise impulse.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(4.2, 3.0);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.9;
    this.reverb.connect(revOut).connect(this.master);
    this.revSend = ctx.createGain(); // shared send bus into the reverb
    this.revSend.gain.value = 0.6;
    this.revSend.connect(this.reverb);

    // ~2s white-noise buffer (hall air).
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

  /** Route a source to the dry master and the reverb send. */
  send(node, dryGain) {
    const dry = this.ctx.createGain();
    dry.gain.value = dryGain;
    node.connect(dry).connect(this.master);
    node.connect(this.revSend);
  }

  start() {
    this.ensureContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.isPlaying) {
      this.isPlaying = true;
      const now = this.ctx.currentTime;
      this.buildDrone(now);
      this.buildPad(now);
      this.buildSub(now);
      this.buildAir(now);
      this.scheduleGong();
    }
    // Assert the level for the current enabled state (fade in).
    this.applyLevel(this.enabled ? this.level : 0, 1.6);
  }

  applyLevel(v, t) {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(v, now + t);
  }

  /** Low, open drone chord through a soft lowpass — the sacred core tone. */
  buildDrone(now) {
    const bus = this.ctx.createBiquadFilter();
    bus.type = 'lowpass';
    bus.frequency.value = 700;
    this.send(bus, 0.5);
    const notes = [29, 36, 41, 48]; // F1, C2, F2, C3 — open fifths & octaves
    const gains = [0.5, 0.34, 0.3, 0.18];
    notes.forEach((n, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i < 2 ? 'sine' : 'triangle';
      osc.frequency.value = freq(n);
      osc.detune.value = (Math.random() - 0.5) * 6; // gentle chorus
      const g = this.ctx.createGain();
      g.gain.value = gains[i] * 0.42;
      const lfo = this.ctx.createOscillator(); // slow breathing swell
      lfo.frequency.value = 0.03 + Math.random() * 0.05;
      const lg = this.ctx.createGain();
      lg.gain.value = gains[i] * 0.25;
      lfo.connect(lg).connect(g.gain);
      osc.connect(g).connect(bus);
      osc.start(now);
      lfo.start(now);
      this.voices.push(osc, lfo);
    });
  }

  /** A warm choral-ish pad a register up — the spice-opera vocal colour. */
  buildPad(now) {
    const bus = this.ctx.createBiquadFilter();
    bus.type = 'lowpass';
    bus.frequency.value = 1300;
    bus.Q.value = 0.6;
    this.send(bus, 0.26);
    [53, 60, 65].forEach((n, i) => {
      // F3, C4, F4 — an open, airy shimmer
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq(n);
      osc.detune.value = (i - 1) * 5 + (Math.random() - 0.5) * 4;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const base = this.ctx.createConstantSource(); // soft always-on floor
      base.offset.value = 0.045;
      const lfo = this.ctx.createOscillator(); // very slow in/out swell
      lfo.frequency.value = 0.016 + i * 0.005;
      const lg = this.ctx.createGain();
      lg.gain.value = 0.045;
      base.connect(g.gain);
      lfo.connect(lg).connect(g.gain);
      osc.connect(g).connect(bus);
      osc.start(now);
      lfo.start(now);
      base.start(now);
      this.voices.push(osc, lfo, base);
    });
  }

  /** Near-subsonic rumble — the weight of the palace (dry, no reverb). */
  buildSub(now) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 30;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.025;
    const lg = this.ctx.createGain();
    lg.gain.value = 0.12;
    lfo.connect(lg).connect(g.gain);
    osc.connect(g).connect(this.master);
    osc.start(now);
    lfo.start(now);
    this.voices.push(osc, lfo);
  }

  /** Faint filtered air — the hush of a vast stone hall (not desert wind). */
  buildAir(now) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.5;
    const g = this.ctx.createGain();
    g.gain.value = 0.025;
    const swell = this.ctx.createOscillator();
    swell.frequency.value = 0.04;
    const sg = this.ctx.createGain();
    sg.gain.value = 0.015;
    swell.connect(sg).connect(g.gain);
    src.connect(band).connect(g);
    this.send(g, 0.5);
    src.start(now);
    swell.start(now);
    this.voices.push(src, swell);
  }

  /** Occasional deep struck gong, ringing out into the hall reverb. */
  scheduleGong() {
    if (!this.isPlaying) return;
    const delay = 12000 + Math.random() * 16000;
    const t = setTimeout(() => {
      this.playGong();
      this.scheduleGong();
    }, delay);
    this.timers.push(t);
  }

  playGong() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const root = [33, 36, 40][Math.floor(Math.random() * 3)]; // A1 / C2 / E2
    const partials = [1, 2.01, 2.78, 4.12]; // inharmonic — metallic
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(0.16, now + 0.02);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 7);
    this.send(out, 0.45);
    partials.forEach((p, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq(root) * p;
      const g = this.ctx.createGain();
      g.gain.value = 1 / (i + 1.5);
      osc.connect(g).connect(out);
      osc.start(now);
      osc.stop(now + 7.2);
    });
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.applyLevel(on ? this.level : 0, 0.4);
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  stop() {
    this.isPlaying = false;
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    this.voices.forEach((v) => {
      try {
        v.stop();
      } catch (e) {
        /* already stopped */
      }
    });
    this.voices = [];
  }
}
