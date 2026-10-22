// Fully procedural audio: no sample files, everything is synthesised.
// A spacious synth score + punchy weapon/motor SFX.

import { clamp } from './util.js';

const BPM = 72;
const EIGHTH = 60 / BPM / 2;
const PENTA = [0, 3, 5, 7, 10, 12, 15, 19];
const CHORDS = [
  { root: 0, third: 3, fifth: 7 }, // Am
  { root: -4, third: 0, fifth: 7 }, // F
  { root: 3, third: 7, fifth: 10 }, // C
  { root: -2, third: 2, fifth: 7 }, // G
  { root: 0, third: 3, fifth: 7 }, // Am
  { root: -4, third: 0, fifth: 7 }, // F
  { root: 5, third: 8, fifth: 12 }, // Dm
  { root: 7, third: 10, fifth: 14 }, // E
];

const hz = (semitones, base = 110) => base * Math.pow(2, semitones / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.volume = 0.7;
    this.intensity = 0;
    this.musicTimer = 0;
    this.step = 0;
    this.nextStepTime = 0;
    this.lastPan = 0;
    this.noiseBuffer = null;
  }

  init() {
    if (this.ready) {
      this.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (err) {
      console.warn('[audio] unavailable', err);
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.gainForVolume();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.24;
    this.master.connect(this.comp).connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 2200;
    this.musicFilter.Q.value = 0.4;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.55;
    this.musicFilter.connect(this.musicGain).connect(this.master);

    this.delay = ctx.createDelay(1.2);
    this.delay.delayTime.value = EIGHTH * 1.5;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.34;
    this.delayWet = ctx.createGain();
    this.delayWet.gain.value = 0.35;
    this.delay.connect(this.delayFeedback).connect(this.delay);
    this.delay.connect(this.delayWet).connect(this.musicFilter);

    this.noiseBuffer = this.makeNoise(2.0);
    this.ready = true;
    this.startMusic();
    this.resume();
  }

  makeNoise(seconds) {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  gainForVolume() {
    return this.muted ? 0 : Math.pow(clamp(this.volume, 0, 1), 1.5) * 0.9;
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.master) {
      this.master.gain.setTargetAtTime(this.gainForVolume(), this.ctx.currentTime, 0.08);
    }
  }

  setMuted(muted) {
    this.muted = muted;
    this.setVolume(this.volume);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  duck(on) {
    if (!this.ready) return;
    this.musicGain.gain.setTargetAtTime(on ? 0.12 : 0.55, this.ctx.currentTime, 0.12);
    this.sfxBus.gain.setTargetAtTime(on ? 0.3 : 0.9, this.ctx.currentTime, 0.12);
  }

  setIntensity(v) {
    this.intensity = clamp(v, 0, 1);
    if (!this.ready) return;
    const f = 1800 + this.intensity * 3400;
    this.musicFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.5);
  }

  // ---------------------------------------------------------------- music
  startMusic() {
    if (!this.ready) return;
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.12;
    clearInterval(this.musicTimer);
    this.musicTimer = setInterval(() => this.schedule(), 70);
  }

  schedule() {
    if (!this.ready || this.ctx.state === 'suspended') return;
    const horizon = this.ctx.currentTime + 0.3;
    let guard = 0;
    while (this.nextStepTime < horizon && guard++ < 24) {
      this.playStep(this.step, this.nextStepTime);
      this.step = (this.step + 1) % 64;
      this.nextStepTime += EIGHTH;
    }
  }

  playStep(step, t) {
    const chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
    const bar = Math.floor(step / 8);
    const beatInBar = step % 8;
    const boss = this.intensity;

    // pad at the top of every second bar
    if (step % 16 === 0) {
      this.pad(hz(chord.root, 110), t, EIGHTH * 15, 0.055);
      this.pad(hz(chord.fifth, 110), t, EIGHTH * 15, 0.04);
      this.pad(hz(chord.third + 12, 110), t + 0.2, EIGHTH * 14, 0.028);
      this.pad(hz(chord.root, 55), t, EIGHTH * 15, 0.05);
    }

    // heartbeat bass
    if (beatInBar === 0 || beatInBar === 4) {
      this.bass(hz(chord.root, 55), t, 0.7, beatInBar === 0 ? 0.17 : 0.1);
    }

    // arpeggio
    if (step % 2 === 1 || (boss > 0.4 && step % 2 === 0)) {
      const note = PENTA[(step * 3 + bar * 2) % PENTA.length];
      this.pluck(hz(chord.root + note + 12, 110), t, 0.18 + 0.1 * Math.sin(step));
    }

    // percussion
    if (step % 16 === 0) this.kick(t);
    if (step % 8 === 6 && !boss) this.hat(t, 0.014);
    if (boss > 0.45 && step % 2 === 0) this.hat(t, 0.008 + 0.008 * boss);

    // boss pulse
    if (boss > 0.2 && step % 4 === 2) {
      this.tone({
        type: 'sawtooth',
        freq: hz(chord.root, 55) * 2,
        endFreq: hz(chord.root, 55),
        dur: 0.3,
        gain: 0.035 * boss,
        attack: 0.01,
        filter: 700,
        at: t,
      });
    }
  }

  pad(freq, t, dur, gain) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc2.type = 'sine';
    osc.frequency.value = freq;
    osc2.frequency.value = freq * 1.005;
    osc.detune.value = -6;
    filter.type = 'lowpass';
    filter.frequency.value = 900 + this.intensity * 1000;
    filter.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 1.1);
    g.gain.linearRampToValueAtTime(gain * 0.8, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g).connect(this.musicFilter);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + dur + 0.1);
    osc2.stop(t + dur + 0.1);
  }

  bass(freq, t, dur, gain) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'triangle';
    sub.type = 'sine';
    osc.frequency.value = freq;
    sub.frequency.value = freq / 2;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(g).connect(this.musicFilter);
    osc.start(t);
    sub.start(t);
    osc.stop(t + dur + 0.05);
    sub.stop(t + dur + 0.05);
  }

  pluck(freq, t, dur) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc2.type = 'sine';
    osc.frequency.value = freq;
    osc2.frequency.value = freq * 2;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600 + this.intensity * 2400, t);
    filter.frequency.exponentialRampToValueAtTime(700, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) {
      pan.pan.value = Math.sin(t * 0.7) * 0.35;
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(g).connect(pan);
      pan.connect(this.musicFilter);
      pan.connect(this.delay);
    } else {
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(g).connect(this.musicFilter);
      g.connect(this.delay);
    }
    osc.start(t);
    osc2.start(t);
    osc.stop(t + dur + 0.05);
    osc2.stop(t + dur + 0.05);
  }

  kick(t) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(g).connect(this.musicFilter);
    osc.start(t);
    osc.stop(t + 0.33);
  }

  hat(t, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    src.connect(hp).connect(g).connect(this.musicFilter);
    src.start(t, Math.random() * 1.2, 0.08);
  }

  // ---------------------------------------------------------------- helpers
  tone({ type = 'sine', freq, endFreq, dur = 0.2, gain = 0.1, attack = 0.005, filter, q, pan, at, bus = 'sfx' }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(8, freq), t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(8, endFreq), t + dur);
    let node = osc;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      f.Q.value = q ?? 0.8;
      node.connect(f);
      node = f;
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g);
    let out = g;
    if (pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      out = p;
    }
    out.connect(bus === 'music' ? this.musicFilter : this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise({ dur = 0.3, gain = 0.2, type = 'lowpass', freq = 1200, endFreq, q = 0.7, pan, at, attack = 0.004 }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    let out = g;
    if (pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      out = p;
    }
    out.connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- sfx
  shoot(level = 1, pan = 0) {
    if (!this.ready) return;
    this.tone({ type: 'sawtooth', freq: 1250 + level * 140, endFreq: 220, dur: 0.09, gain: 0.032, filter: 2800, pan });
    this.noise({ dur: 0.045, gain: 0.018, type: 'highpass', freq: 3600, pan });
  }

  enemyShoot(pan = 0) {
    this.tone({ type: 'square', freq: 380, endFreq: 110, dur: 0.2, gain: 0.035, filter: 1000, pan });
    this.noise({ dur: 0.12, gain: 0.02, type: 'bandpass', freq: 900, endFreq: 300 });
  }

  teleportCharge(pan = 0) {
    this.tone({ type: 'sine', freq: 300, endFreq: 1400, dur: 0.9, gain: 0.035, pan });
  }

  explosion(size = 1) {
    if (!this.ready) return;
    this.noise({ dur: 0.5 + size * 0.35, gain: 0.3 * size, type: 'lowpass', freq: 2200, endFreq: 90, q: 0.9, pan: (Math.random() - 0.5) * 0.6 });
    this.tone({ type: 'sine', freq: 140, endFreq: 28, dur: 0.5 + size * 0.3, gain: 0.18 * size, filter: 220 });
    if (size > 1.3) {
      this.noise({ dur: 1.2, gain: 0.18, type: 'bandpass', freq: 500, endFreq: 120, q: 0.5 });
    }
  }

  hit(pan = 0) {
    this.noise({ dur: 0.24, gain: 0.16, type: 'lowpass', freq: 1600, endFreq: 200, pan });
    this.tone({ type: 'square', freq: 180, endFreq: 55, dur: 0.22, gain: 0.12, filter: 500, pan });
    this.tone({ type: 'triangle', freq: 700, endFreq: 320, dur: 0.3, gain: 0.05, pan });
  }

  hurt() {
    this.noise({ dur: 0.5, gain: 0.28, type: 'lowpass', freq: 900, endFreq: 110 });
    this.tone({ type: 'sawtooth', freq: 90, endFreq: 35, dur: 0.6, gain: 0.18, filter: 320 });
    this.noise({ dur: 0.3, gain: 0.1, type: 'highpass', freq: 2600 });
  }

  shieldBreak() {
    this.tone({ type: 'sine', freq: 1600, endFreq: 300, dur: 0.5, gain: 0.14 });
    this.tone({ type: 'triangle', freq: 2400, endFreq: 600, dur: 0.35, gain: 0.08 });
    this.noise({ dur: 0.4, gain: 0.12, type: 'highpass', freq: 2000 });
  }

  nearMiss(pan = 0) {
    this.noise({ dur: 0.26, gain: 0.09, type: 'bandpass', freq: 2400, endFreq: 500, q: 1.4, pan });
  }

  pickup(type = 'arc') {
    if (!this.ready) return;
    const base = type === 'repair' ? 660 : type === 'shield' ? 520 : type === 'quantum' ? 440 : 740;
    this.tone({ type: 'sine', freq: base, dur: 0.16, gain: 0.07 });
    this.tone({ type: 'triangle', freq: base * 1.5, dur: 0.24, gain: 0.05, at: this.ctx.currentTime + 0.06 });
    if (type !== 'boost') this.tone({ type: 'sine', freq: base * 2, dur: 0.3, gain: 0.03, at: this.ctx.currentTime + 0.12 });
  }

  boost() {
    this.noise({ dur: 0.6, gain: 0.12, type: 'bandpass', freq: 600, endFreq: 3200, q: 1.1 });
    this.tone({ type: 'sawtooth', freq: 120, endFreq: 420, dur: 0.5, gain: 0.07, filter: 1400 });
  }

  boostEnd() {
    this.noise({ dur: 0.4, gain: 0.07, type: 'bandpass', freq: 2000, endFreq: 300, q: 1.0 });
  }

  gate() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [0, 3, 7, 12, 15].forEach((n, i) => {
      this.tone({ type: 'sine', freq: hz(n, 220), dur: 1.6, gain: 0.05, at: t + i * 0.08, bus: 'sfx' });
      this.tone({ type: 'triangle', freq: hz(n, 440), dur: 1.2, gain: 0.025, at: t + i * 0.08 });
    });
    this.noise({ dur: 1.4, gain: 0.12, type: 'bandpass', freq: 400, endFreq: 3000, q: 0.8 });
  }

  alarm() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this.tone({ type: 'square', freq: 520, dur: 0.28, gain: 0.05, at: t + i * 0.5, filter: 1200 });
      this.tone({ type: 'square', freq: 390, dur: 0.28, gain: 0.05, at: t + i * 0.5 + 0.26, filter: 1200 });
    }
  }

  gameOver() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [12, 8, 3, 0, -5].forEach((n, i) =>
      this.tone({ type: 'triangle', freq: hz(n, 220), dur: 1.2, gain: 0.055, at: t + i * 0.16 })
    );
    this.noise({ dur: 2.2, gain: 0.13, type: 'lowpass', freq: 1200, endFreq: 90 });
  }

  /** Magnetic boot slap on the tube wall. Alternating pan sells the stride. */
  footstep(index = 0, boosted = false) {
    if (!this.ready) return;
    const pan = index % 2 === 0 ? -0.28 : 0.28;
    const gain = boosted ? 0.045 : 0.03;
    this.noise({ dur: 0.075, gain, type: 'bandpass', freq: boosted ? 2100 : 1550, endFreq: 420, q: 1.2, pan });
    this.tone({ type: 'square', freq: 118 + (index % 2) * 22, endFreq: 52, dur: 0.085, gain: gain * 0.55, filter: 420, pan });
  }

  /** Boots release the wall. */
  leap() {
    if (!this.ready) return;
    this.tone({ type: 'sine', freq: 260, endFreq: 980, dur: 0.22, gain: 0.05, filter: 2400 });
    this.noise({ dur: 0.18, gain: 0.05, type: 'bandpass', freq: 900, endFreq: 3200, q: 1.3 });
  }

  /** Boots clamp back onto the wall. */
  land() {
    if (!this.ready) return;
    this.tone({ type: 'sine', freq: 620, endFreq: 90, dur: 0.18, gain: 0.07, filter: 900 });
    this.noise({ dur: 0.14, gain: 0.06, type: 'lowpass', freq: 1800, endFreq: 260 });
  }

  levelUp() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [0, 5, 7, 12].forEach((n, i) => this.tone({ type: 'triangle', freq: hz(n, 330), dur: 0.5, gain: 0.06, at: t + i * 0.07 }));
  }

  uiClick() {
    this.tone({ type: 'square', freq: 880, endFreq: 1200, dur: 0.05, gain: 0.02, filter: 3000 });
  }

  gameStart() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone({ type: 'sine', freq: 60, endFreq: 240, dur: 1.4, gain: 0.12 });
    this.noise({ dur: 1.2, gain: 0.1, type: 'bandpass', freq: 300, endFreq: 2400, q: 0.9 });
    [0, 7, 12].forEach((n, i) => this.tone({ type: 'sine', freq: hz(n, 220), dur: 1.2, gain: 0.05, at: t + 0.2 + i * 0.1 }));
  }
}
