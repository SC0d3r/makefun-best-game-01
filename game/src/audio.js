// LUMENWING's sound, synthesised entirely with WebAudio.
//
// There are no audio files. The context is created lazily by start() so that
// browsers never complain about an AudioContext before the first key press.
// Every public sound method is a no-op while muted.

const MASTER_LEVEL = 0.55;
const PAD_LEVEL = 0.014; // deliberately below 0.02: the pad is barely there

// Note tables for the two end-of-garden cues.
const CLEAR_NOTES = [523.25, 659.25, 783.99, 1046.5]; // C major, rising
const VICTORY_NOTES = [392.0, 523.25, 659.25, 783.99, 1046.5, 1318.51];
const LOSE_NOTES = [392.0, 349.23, 311.13, 261.63]; // G minor, falling

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.padGain = null;
    this.noiseBuffer = null;
    this.muted = false;
    this.ready = false;
  }

  /** Create (on first use) or resume the audio context. Call from a gesture. */
  start() {
    if (this.muted) return;

    if (!this.ctx) {
      const Ctor =
        typeof window !== 'undefined'
          ? window.AudioContext || window.webkitAudioContext
          : null;
      if (!Ctor) return;

      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }

      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_LEVEL;
      this.master.connect(this.ctx.destination);

      this.buildNoise();
      this.buildPad();
      this.ready = true;
    }

    if (this.ctx.state === 'suspended') {
      const resumed = this.ctx.resume();
      if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
    }
  }

  /** Mute/unmute everything, fading the ambient pad instead of cutting it. */
  setMuted(muted) {
    const next = !!muted;
    if (next === this.muted) return;
    this.muted = next;

    // Nothing has been started yet: there is no node graph to fade.
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    if (this.padGain) {
      this.padGain.gain.cancelScheduledValues(now);
      this.padGain.gain.setTargetAtTime(next ? 0 : PAD_LEVEL, now, 0.22);
    }
    if (this.master) {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(next ? 0 : MASTER_LEVEL, now, 0.16);
    }
    if (!next && this.ctx.state === 'suspended') {
      const resumed = this.ctx.resume();
      if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
    }
  }

  // ------------------------------------------------------------- synthesis ---

  buildNoise() {
    const ctx = this.ctx;
    const length = Math.floor(ctx.sampleRate * 0.8);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
  }

  /** A quiet two-oscillator drone through a slowly breathing lowpass. */
  buildPad() {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const padGain = ctx.createGain();
    padGain.gain.setValueAtTime(0.0001, now);
    padGain.gain.setTargetAtTime(PAD_LEVEL, now, 3.2);
    padGain.connect(this.master);
    this.padGain = padGain;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.6;
    filter.connect(padGain);

    // Very slow filter drift keeps the pad from sounding like a held note.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.045;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 150;
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);
    lfo.start();

    const a = ctx.createOscillator();
    a.type = 'sine';
    a.frequency.value = 110;
    const b = ctx.createOscillator();
    b.type = 'triangle';
    b.frequency.value = 110.6;
    b.detune.value = 4;

    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    a.connect(mix);
    b.connect(mix);
    mix.connect(filter);

    a.start();
    b.start();
  }

  /** One enveloped oscillator note. */
  tone(type, freq, delay, duration, level, endFreq = null, cutoff = null) {
    if (!this.ready || this.muted || !this.ctx) return;
    const ctx = this.ctx;
    const start = ctx.currentTime + Math.max(0, delay);
    const end = start + Math.max(0.04, duration);

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), start);
    if (endFreq !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), end);
    }

    let node = osc;
    if (cutoff !== null) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.max(40, cutoff), start);
      filter.Q.value = 0.8;
      osc.connect(filter);
      node = filter;
    }

    const gain = ctx.createGain();
    const peak = Math.max(0.0005, level);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.02, duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    node.connect(gain);
    gain.connect(this.master);

    osc.start(start);
    osc.stop(end + 0.03);
  }

  /** One filtered noise burst, used for air and grit. */
  noise(delay, duration, level, type, freqFrom, freqTo, q = 1) {
    if (!this.ready || this.muted || !this.ctx || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const start = ctx.currentTime + Math.max(0, delay);
    const end = start + Math.max(0.04, duration);

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(40, freqFrom), start);
    if (freqTo !== freqFrom) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), end);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0005, level),
      start + Math.min(0.03, duration * 0.25),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(start);
    source.stop(end + 0.03);
  }

  // ---------------------------------------------------------------- voices ---

  /** Soft high blip, collected ambient light. */
  mote() {
    if (this.muted || !this.ready) return;
    this.tone('sine', 1480, 0, 0.1, 0.035, 1760);
  }

  /** Bright rising two-tone, a sunseed. */
  seed() {
    if (this.muted || !this.ready) return;
    this.tone('triangle', 659.25, 0, 0.16, 0.045, 659.25);
    this.tone('triangle', 987.77, 0.085, 0.24, 0.05, 1046.5);
    this.tone('sine', 1318.51, 0.17, 0.2, 0.025, 1318.51);
  }

  /** Low wet plop, a drop of lantern oil. */
  oil() {
    if (this.muted || !this.ready) return;
    this.tone('sine', 300, 0, 0.2, 0.1, 78, 700);
    this.tone('triangle', 150, 0.015, 0.14, 0.035, 70, 500);
    this.noise(0, 0.09, 0.025, 'lowpass', 900, 260, 0.7);
  }

  /** Filtered noise sweep with a low sine swell, the lantern pulse. */
  pulse() {
    if (this.muted || !this.ready) return;
    this.noise(0, 0.55, 0.11, 'bandpass', 260, 3800, 1.4);
    this.tone('sine', 92, 0.02, 0.65, 0.085, 46, 500);
  }

  /** Short harsh detuned growl, a bat's hit. */
  hurt() {
    if (this.muted || !this.ready) return;
    this.tone('sawtooth', 142, 0, 0.26, 0.055, 86, 720);
    this.tone('sawtooth', 149, 0.012, 0.24, 0.045, 91, 640);
    this.noise(0, 0.12, 0.03, 'bandpass', 700, 220, 0.8);
  }

  /** Four-note rising chord for a woken moonflower. */
  clear() {
    if (this.muted || !this.ready) return;
    for (let i = 0; i < CLEAR_NOTES.length; i++) {
      this.tone('triangle', CLEAR_NOTES[i], i * 0.1, 0.5, 0.05);
      this.tone('sine', CLEAR_NOTES[i] * 2, i * 0.1 + 0.02, 0.34, 0.018);
    }
  }

  /** Longer six-note fanfare for all three gardens. */
  victory() {
    if (this.muted || !this.ready) return;
    for (let i = 0; i < VICTORY_NOTES.length; i++) {
      const last = i === VICTORY_NOTES.length - 1;
      this.tone('triangle', VICTORY_NOTES[i], i * 0.13, last ? 1.1 : 0.62, 0.05);
      this.tone('sine', VICTORY_NOTES[i] * 0.5, i * 0.13, last ? 1.2 : 0.5, 0.022);
    }
  }

  /** Descending minor figure for a dark lantern. */
  lose() {
    if (this.muted || !this.ready) return;
    for (let i = 0; i < LOSE_NOTES.length; i++) {
      this.tone('sine', LOSE_NOTES[i], i * 0.2, 0.7, 0.06, LOSE_NOTES[i] * 0.97, 1000);
    }
    this.tone('triangle', 98, 0, 1.1, 0.03, 73, 320);
  }
}
