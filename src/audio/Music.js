/**
 * A tiny chiptune sequencer built on the Web Audio API.
 *
 * Rather than ship a binary .mid file (which browsers can't play without a
 * soundfont library), this synthesizes a looping retro track in code from
 * oscillators — square-wave melody, triangle bass, and simple noise drums —
 * sequenced with the standard Web Audio lookahead scheduler.
 *
 * Browsers block audio until a user gesture, so call start() from a pointer or
 * key handler. setEnabled() mutes/unmutes without stopping the sequencer.
 */

// MIDI note -> frequency in Hz.
const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

// One 32-step (2 bar) loop over an Am–F–C–G progression.
// Melody as MIDI notes (null = rest); roots drive the bassline per 8-step block.
const MELODY = [
  69, null, 64, null, 60, null, 64, null, // Am
  65, null, 72, null, 69, null, 72, null, // F
  76, null, 67, null, 64, null, 67, null, // C
  74, null, 71, null, 67, null, 71, null, // G
];
const BASS_ROOTS = [45, 41, 48, 43]; // A2, F2, C3, G2

export default class Music {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.enabled = true;
    this.isPlaying = false;
    this.tempo = 126; // BPM
    this.step = 0;
    this.nextNoteTime = 0;
    this.lookahead = 0.12; // seconds scheduled ahead
    this.timer = null;
  }

  ensureContext() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.22 : 0;
    this.master.connect(this.ctx.destination);

    // Pre-render a short white-noise buffer for the hi-hat.
    const len = Math.floor(this.ctx.sampleRate * 0.2);
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  }

  /** Begin playback. Safe to call repeatedly; resumes a suspended context. */
  start() {
    this.ensureContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.scheduler(), 25);
  }

  stop() {
    this.isPlaying = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.linearRampToValueAtTime(on ? 0.22 : 0, t + 0.08);
    }
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  scheduler() {
    const secondsPer16th = 60 / this.tempo / 4;
    while (this.nextNoteTime < this.ctx.currentTime + this.lookahead) {
      this.scheduleStep(this.step, this.nextNoteTime, secondsPer16th);
      this.nextNoteTime += secondsPer16th;
      this.step = (this.step + 1) % 32;
    }
  }

  scheduleStep(step, time, dt) {
    const block = Math.floor(step / 8) % 4;
    const within = step % 8;

    // Melody — square wave.
    const note = MELODY[step];
    if (note != null) {
      this.tone(freq(note), time, dt * 1.8, {
        type: 'square',
        gain: 0.16,
      });
    }

    // Bass — triangle, one note per beat (every 4th step).
    if (within % 4 === 0) {
      this.tone(freq(BASS_ROOTS[block]), time, dt * 3.4, {
        type: 'triangle',
        gain: 0.26,
      });
    }

    // Drums — kick on the beats, hat on the off-16ths.
    if (within === 0 || within === 4) this.kick(time);
    if (step % 2 === 1) this.hat(time);
  }

  tone(f, time, dur, { type = 'square', gain = 0.15 } = {}) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = f;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g).connect(this.master);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  kick(time) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(50, time + 0.12);
    g.gain.setValueAtTime(0.5, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    osc.connect(g).connect(this.master);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  hat(time) {
    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    src.buffer = this.noiseBuffer;
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    g.gain.setValueAtTime(0.09, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    src.connect(filter).connect(g).connect(this.master);
    src.start(time);
    src.stop(time + 0.05);
  }
}
