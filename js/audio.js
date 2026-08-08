function noteFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function makeTrack({ bpm, melody, melodyType = 'square', melodyGain = 0.16, bass, bassType = 'triangle', bassGain = 0.2, percussion = false }) {
  const step = 60 / bpm / 2;
  const stepsPerLoop = melody.length;
  const loopDuration = step * stepsPerLoop;
  const bassStepSpan = stepsPerLoop / bass.length;
  return { step, stepsPerLoop, loopDuration, melody, melodyType, melodyGain, bass, bassType, bassGain, bassStepSpan, percussion };
}

export const MENU_TRACK = makeTrack({
  bpm: 108,
  melody: [67, null, 71, 74, 76, 74, 71, 67],
  melodyType: 'triangle',
  melodyGain: 0.14,
  bass: [48, 55],
  bassType: 'sine',
  bassGain: 0.16,
  percussion: false,
});

export const GAME_TRACK = makeTrack({
  bpm: 150,
  melody: [72, null, 76, 79, 81, 79, 76, 72, 74, null, 77, 81, 84, 81, 77, 74],
  melodyType: 'square',
  melodyGain: 0.16,
  bass: [48, 48, 43, 43, 45, 45, 41, 41],
  bassType: 'triangle',
  bassGain: 0.2,
  percussion: true,
});

const BASE_GAIN = 0.22;

class ChipAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.muted = false;
    this.volume = 1;
    this.started = false;
    this.currentTrack = null;
    this.nextLoopTime = 0;
    this.timerId = null;
  }

  ensureContext() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume * BASE_GAIN;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoiseBuffer(0.05);
  }

  makeNoiseBuffer(duration) {
    const len = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  applyGain() {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * BASE_GAIN;
  }

  toggleMute() {
    this.muted = !this.muted;
    this.applyGain();
    return this.muted;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyGain();
    return this.volume;
  }

  start(track) {
    this.ensureContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.started && this.currentTrack === track) return;
    this.currentTrack = track;
    if (this.timerId) clearTimeout(this.timerId);
    this.started = true;
    this.nextLoopTime = this.ctx.currentTime + 0.08;
    this.tick();
  }

  switchTrack(track) {
    this.start(track);
  }

  playNote(freq, startTime, duration, type, gainVal) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, startTime);
    g.gain.exponentialRampToValueAtTime(gainVal, startTime + 0.015);
    g.gain.setValueAtTime(gainVal, startTime + duration * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  playKick(startTime) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, startTime);
    osc.frequency.exponentialRampToValueAtTime(45, startTime + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, startTime);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.14);
    osc.connect(g);
    g.connect(this.master);
    osc.start(startTime);
    osc.stop(startTime + 0.15);
  }

  playHat(startTime, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, startTime);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.04);
    src.connect(g);
    g.connect(this.master);
    src.start(startTime);
    src.stop(startTime + 0.05);
  }

  scheduleLoopAt(t) {
    const trk = this.currentTrack;
    for (let i = 0; i < trk.melody.length; i++) {
      const midi = trk.melody[i];
      if (midi != null) this.playNote(noteFreq(midi), t + i * trk.step, trk.step * 0.9, trk.melodyType, trk.melodyGain);
    }
    const bassDur = trk.step * trk.bassStepSpan;
    for (let i = 0; i < trk.bass.length; i++) {
      const midi = trk.bass[i];
      if (midi != null) this.playNote(noteFreq(midi), t + i * bassDur, bassDur * 0.9, trk.bassType, trk.bassGain);
    }
    if (trk.percussion) {
      for (let i = 0; i < trk.stepsPerLoop; i++) {
        if (i % 4 === 0) this.playKick(t + i * trk.step);
        this.playHat(t + i * trk.step, i % 4 === 2 ? 0.06 : 0.03);
      }
    }
  }

  tick() {
    this.scheduleLoopAt(this.nextLoopTime);
    this.nextLoopTime += this.currentTrack.loopDuration;
    const delay = Math.max(50, (this.nextLoopTime - this.ctx.currentTime - 0.25) * 1000);
    this.timerId = setTimeout(() => this.tick(), delay);
  }

  playDeathSfx() {
    this.ensureContext();
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.35);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.42);

    const buf = this.makeNoiseBuffer(0.3);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] *= 1 - i / d.length;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.25, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(ng);
    ng.connect(this.master);
    src.start(t);
  }

  playJumpSfx() {
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(560, t + 0.09);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  playJabSfx() {
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.07);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  playClearSfx() {
    this.ensureContext();
    const t = this.ctx.currentTime;
    const notes = [72, 76, 79, 84];
    notes.forEach((midi, i) => {
      this.playNote(noteFreq(midi), t + i * 0.09, 0.18, 'square', 0.18);
    });
  }

  playSplashSfx() {
    this.ensureContext();
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.22);

    const buf = this.makeNoiseBuffer(0.15);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] *= 1 - i / d.length;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.12, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    src.connect(ng);
    ng.connect(this.master);
    src.start(t);
  }

  playClickSfx() {
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 520;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.06);
  }
}

export const music = new ChipAudio();
