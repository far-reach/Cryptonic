/**
 * Tiny WebAudio blips. No audio files ship with the extension — every sound is
 * a short synthesised envelope, which keeps the package small and avoids any
 * autoplay-policy surprises (the context is created on the first user gesture).
 */

let ctx = null;
let enabled = true;

export function setSoundEnabled(value) {
  enabled = Boolean(value);
}

function context() {
  if (!enabled) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone({ freq, duration = 0.08, type = 'sine', gain = 0.05, slide = 0 }) {
  const audio = context();
  if (!audio) return;

  const osc = audio.createOscillator();
  const amp = audio.createGain();
  const now = audio.currentTime;

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), now + duration);

  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(amp).connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export const sfx = {
  step: () => tone({ freq: 220, duration: 0.045, type: 'triangle', gain: 0.025 }),
  push: () => tone({ freq: 140, duration: 0.09, type: 'square', gain: 0.03, slide: -40 }),
  place: () => tone({ freq: 660, duration: 0.12, type: 'sine', gain: 0.05, slide: 220 }),
  undo: () => tone({ freq: 300, duration: 0.07, type: 'sine', gain: 0.03, slide: -120 }),
  deny: () => tone({ freq: 110, duration: 0.1, type: 'sawtooth', gain: 0.025 }),
  card: () => tone({ freq: 520, duration: 0.05, type: 'triangle', gain: 0.03, slide: -160 }),
  win: () => {
    [523, 659, 784, 1047].forEach((freq, i) =>
      setTimeout(() => tone({ freq, duration: 0.16, type: 'sine', gain: 0.05 }), i * 95),
    );
  },
  lose: () => {
    [392, 330, 262].forEach((freq, i) =>
      setTimeout(() => tone({ freq, duration: 0.18, type: 'triangle', gain: 0.04 }), i * 110),
    );
  },
  coin: () => {
    [880, 1320].forEach((freq, i) =>
      setTimeout(() => tone({ freq, duration: 0.09, type: 'square', gain: 0.028 }), i * 70),
    );
  },
};
