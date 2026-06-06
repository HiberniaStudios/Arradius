/**
 * Ambient soundbed for Aridun — the anti-chiptune.
 *
 * Synthesizes a sparse, sacred desert atmosphere with the Web Audio API:
 * a low drone chord, slow-breathing wind, a sub-bass rumble for the Sleepers
 * stirring below, and occasional distant bell tones. No audio files.
 *
 * Browsers block audio until a user gesture, so call start() from a pointer or
 * key handler. setEnabled() mutes/unmutes without tearing down the graph.
 */

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

export default class Ambient {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.enabled = true;
    this.isPlaying = false;
    this.voices = [];
    this.bellTimer = null;
  }

  ensureContext() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.32 : 0;
    this.master.connect(this.ctx.destination);

    // ~2s of white noise, looped, for wind.
    const len = Math.floor(this.ctx.sampleRate * 2);
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  }

  start() {
    this.ensureContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.isPlaying) return;
    this.isPlaying = true;

    const now = this.ctx.currentTime;
    this.buildDrone(now);
    this.buildWind(now);
    this.buildSubRumble(now);
    this.scheduleBell();
  }

  /** A low, slowly-breathing drone chord through a soft lowpass. */
  buildDrone(now) {
    const bus = this.ctx.createBiquadFilter();
    bus.type = 'lowpass';
    bus.frequency.value = 900;
    bus.connect(this.master);

    // Root, fifth, octave, and a faint high shimmer — an open, sacred chord.
    const notes = [33, 40, 45, 57]; // A1, E2, A2, A3
    const gains = [0.5, 0.32, 0.28, 0.12];
    notes.forEach((n, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i === 3 ? 'triangle' : 'sine';
      osc.frequency.value = freq(n);
      osc.detune.value = (Math.random() - 0.5) * 8; // gentle chorus

      const g = this.ctx.createGain();
      g.gain.value = gains[i] * 0.5;

      // Slow LFO breathing on the level.
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.04 + Math.random() * 0.06;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = gains[i] * 0.3;
      lfo.connect(lfoGain).connect(g.gain);

      osc.connect(g).connect(bus);
      osc.start(now);
      lfo.start(now);
      this.voices.push(osc, lfo);
    });
  }

  /** Filtered noise with slow gusting — the wind over the dunes. */
  buildWind(now) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 550;
    band.Q.value = 0.7;

    const g = this.ctx.createGain();
    g.gain.value = 0.06;

    // Gust LFOs: one sweeps the filter, one swells the level.
    const sweep = this.ctx.createOscillator();
    sweep.frequency.value = 0.07;
    const sweepGain = this.ctx.createGain();
    sweepGain.gain.value = 300;
    sweep.connect(sweepGain).connect(band.frequency);

    const swell = this.ctx.createOscillator();
    swell.frequency.value = 0.05;
    const swellGain = this.ctx.createGain();
    swellGain.gain.value = 0.04;
    swell.connect(swellGain).connect(g.gain);

    src.connect(band).connect(g).connect(this.master);
    src.start(now);
    sweep.start(now);
    swell.start(now);
    this.voices.push(src, sweep, swell);
  }

  /** A near-subsonic pulse — a Sleeper turning far below. */
  buildSubRumble(now) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 34;

    const g = this.ctx.createGain();
    g.gain.value = 0.0;

    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.03;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.16;
    lfo.connect(lfoGain).connect(g.gain);

    osc.connect(g).connect(this.master);
    osc.start(now);
    lfo.start(now);
    this.voices.push(osc, lfo);
  }

  /** Occasional distant bell — sparse, reverberant, sacred. */
  scheduleBell() {
    if (!this.isPlaying) return;
    const delay = 7000 + Math.random() * 12000;
    this.bellTimer = setTimeout(() => {
      this.playBell();
      this.scheduleBell();
    }, delay);
  }

  playBell() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // A pentatonic high note for an airy, unresolved feel.
    const choices = [69, 72, 76, 79, 81];
    const note = choices[Math.floor(Math.random() * choices.length)];

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq(note);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.12, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);

    const pan = this.ctx.createStereoPanner
      ? this.ctx.createStereoPanner()
      : null;
    if (pan) pan.pan.value = (Math.random() - 0.5) * 1.4;

    osc.connect(g);
    (pan ? g.connect(pan).connect(this.master) : g.connect(this.master));
    osc.start(now);
    osc.stop(now + 4.7);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.linearRampToValueAtTime(on ? 0.32 : 0, t + 0.3);
    }
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  stop() {
    this.isPlaying = false;
    if (this.bellTimer) clearTimeout(this.bellTimer);
    this.bellTimer = null;
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
