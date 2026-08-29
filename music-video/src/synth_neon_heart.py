#!/usr/bin/env python3
"""Procedural synthesis of "NEON HEART" — 3:00 industrial metal, 120 BPM, E minor.

Cyberpunk love-story metal: distorted Karplus-Strong power chords and palm-muted
chugs, double-kick drums, harsh processed shouts + clean female choruses,
ECG-flatline pauses that slam back with "BEAT!", a long flatline into a screamed
"ALIVE!", key-up final choruses. Same 2s/bar grid as the video renderer.
"""
import os
import subprocess
import tempfile

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
BEAT = 0.5
BAR = 2.0
TOTAL = 180.0
N = int(TOTAL * SR)
rng = np.random.default_rng(13)

# ---------------------------------------------------------------- helpers

def midi2f(m):
    return 440.0 * 2 ** ((m - 69) / 12)

def t_axis(dur):
    return np.arange(int(dur * SR)) / SR

def exp_env(n, decay):
    return np.exp(-np.arange(n) / SR / decay)

def env_ar(n, a, r, curve=3.0):
    e = np.ones(n)
    na, nr = min(n, max(1, int(a * SR))), min(n, max(1, int(r * SR)))
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.exp(-curve * np.linspace(0, 1, nr))
    return e

def place(buf, t, x, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N or i < 0:
        return
    if x.ndim == 1:
        gl, gr = gain * min(1, 1 - pan), gain * min(1, 1 + pan)
        x = np.stack([x * gl, x * gr], axis=1)
    else:
        x = x * gain
    j = min(N, i + len(x))
    buf[i:j] += x[: j - i]

def lowpass(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), "low")
    return signal.lfilter(b, a, x, axis=0)

def highpass(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), "high")
    return signal.lfilter(b, a, x, axis=0)

def bandpass(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], "band")
    return signal.lfilter(b, a, x, axis=0)

def ks(f, dur, bright=0.7, damp=0.996):
    n = int(dur * SR)
    period = max(2, int(SR / f))
    out = np.zeros(n)
    buf = rng.uniform(-1, 1, period) * bright
    idx = 0
    for i in range(n):
        out[i] = buf[idx]
        buf[idx] = damp * 0.5 * (buf[idx] + buf[(idx + 1) % period])
        idx = (idx + 1) % period
    return out

def make_ir(dur=1.7, tone=0.35):
    n = int(dur * SR)
    ir = rng.standard_normal((n, 2)) * np.exp(-4.5 * np.arange(n)[:, None] / n)
    ir = lowpass(ir, 6000) * tone
    ir[:40] *= np.linspace(0, 1, 40)[:, None]
    return ir / np.max(np.abs(ir)) * 0.5

IR = make_ir()

def reverb(x, wet=0.3):
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    w = np.stack([signal.oaconvolve(x[:, c], IR[:, c])[: len(x)] for c in (0, 1)], axis=1)
    return x + wet * w

def delay_fx(x, d, fb=0.4, taps=4, pingpong=True):
    out = x.copy()
    ds = int(d * SR)
    for k in range(1, taps + 1):
        g = fb ** k
        sh = np.zeros_like(x)
        if k * ds < len(x):
            sh[k * ds:] = x[: len(x) - k * ds]
        if pingpong and x.ndim == 2 and k % 2 == 1:
            sh = sh[:, ::-1]
        out += g * sh
    return out

# ---------------------------------------------------------------- metal kit

def kick():
    dur = 0.4
    t = t_axis(dur)
    f = 42 + 130 * np.exp(-t * 34)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * exp_env(len(t), 0.13)
    click = highpass(rng.standard_normal(len(t)) * exp_env(len(t), 0.003), 3800) * 0.6
    tick = np.sin(2 * np.pi * 4200 * t) * exp_env(len(t), 0.004) * 0.4  # beater
    return np.tanh((body + click + tick) * 1.9) * 0.95

def snare():
    dur = 0.32
    n = int(dur * SR)
    tone = (np.sin(2 * np.pi * 190 * t_axis(dur)) + 0.6 * np.sin(2 * np.pi * 285 * t_axis(dur))) * exp_env(n, 0.05)
    noise = bandpass(rng.standard_normal(n), 900, 9500) * exp_env(n, 0.11)
    return np.tanh((0.6 * tone + 0.9 * noise) * 1.5) * 0.85

def hat(open_=False):
    dur = 0.25 if open_ else 0.06
    n = int(dur * SR)
    return highpass(rng.standard_normal(n), 8000) * exp_env(n, 0.10 if open_ else 0.018) * 0.42

def china():
    dur = 0.7
    n = int(dur * SR)
    x = bandpass(rng.standard_normal(n), 2800, 10000) * exp_env(n, 0.22)
    return np.tanh(x * 2.0) * 0.5

def crash():
    dur = 1.6
    n = int(dur * SR)
    x = bandpass(rng.standard_normal(n), 3500, 12000) * exp_env(n, 0.5)
    return x * 0.45

def impact():
    dur = 2.0
    n = int(dur * SR)
    boom = np.sin(2 * np.pi * 44 * t_axis(dur) * np.exp(-t_axis(dur) * 0.5)) * exp_env(n, 0.6)
    spl = lowpass(rng.standard_normal((n, 2)), 5000) * exp_env(n, 0.3)[:, None]
    return np.stack([boom, boom], axis=1) * 0.9 + spl * 0.5

def riser(dur=4.0):
    n = int(dur * SR)
    x = highpass(rng.standard_normal((n, 2)), 400)
    sweep = np.linspace(0, 1, n) ** 2
    return lowpass(x * (sweep ** 1.5)[:, None], 9000) * 0.55

# ---------------------------------------------------------------- guitars

def gtr_chug(root_m):
    """palm-muted djent chug, double-tracked."""
    f = midi2f(root_m)
    out = []
    for _ in range(2):
        x = ks(f, 0.16, bright=0.9, damp=0.988) + 0.5 * ks(f * 2, 0.16, bright=0.7, damp=0.985)
        x = highpass(x, 90)
        x = np.tanh(x * 9.0)
        x = bandpass(x, 110, 6200)
        x *= exp_env(len(x), 0.05)
        out.append(x)
    return np.stack([out[0], out[1]], axis=1) * 0.8

def gtr_chord(root_m, dur, open_=True):
    """distorted power chord (root+5th+octave), double-tracked L/R."""
    notes = [root_m, root_m + 7, root_m + 12]
    tracks = []
    for _ in range(2):
        acc = None
        for m in notes:
            w = ks(midi2f(m), dur, bright=0.85, damp=0.9985 if open_ else 0.994)
            acc = w if acc is None else acc + w
        x = highpass(acc, 85)
        x = np.tanh(x * 6.5)
        x = bandpass(x, 100, 5800)
        x *= env_ar(len(x), 0.004, min(0.4, dur * 0.35), curve=2.2)
        tracks.append(x)
    return np.stack([tracks[0], tracks[1]], axis=1) * 0.55

def bass_note(m, dur):
    f = midi2f(m)
    t = t_axis(dur)
    x = signal.square(2 * np.pi * f * t) * 0.5 + 2 * ((f * t) % 1) - 1
    x = lowpass(x, 700, 4)
    x = np.tanh(x * 2.2)
    x *= env_ar(len(x), 0.006, min(0.15, dur * 0.4))
    return x * 0.55

def lead_note(m, dur, harm=7):
    """harmonized metal lead (melody + fifth)."""
    outs = []
    for mm in (m, m + harm):
        f = midi2f(mm)
        t = t_axis(dur)
        vib = 1 + 0.008 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / 0.2, 0, 1)
        x = 2 * ((np.cumsum(np.full(len(t), f) * vib) / SR) % 1) - 1
        x = np.tanh(x * 4.0)
        x = bandpass(x, 300, 5200)
        x *= env_ar(len(t), 0.01, min(0.3, dur * 0.4))
        outs.append(x)
    return np.stack([outs[0] * 0.9 + outs[1] * 0.35, outs[1] * 0.9 + outs[0] * 0.35], axis=1) * 0.4

# ---------------------------------------------------------------- ECG sounds

def ecg_beep():
    dur = 0.09
    t = t_axis(dur)
    x = np.sin(2 * np.pi * 1318.5 * t) * env_ar(len(t), 0.004, 0.05)
    return x * 0.5

def flatline_tone(dur):
    t = t_axis(dur)
    x = np.sin(2 * np.pi * 987.8 * t) * env_ar(len(t), 0.03, 0.08)
    return x * 0.32

# ---------------------------------------------------------------- vocals

VOICE_CACHE = {}

def espeak(text, voice, pitch, speed):
    key = (text, voice, pitch, speed)
    if key in VOICE_CACHE:
        return VOICE_CACHE[key]
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        path = f.name
    subprocess.run(["espeak-ng", "-v", voice, "-p", str(pitch), "-s", str(speed),
                    "-a", "180", "-w", path, text], check=True, capture_output=True)
    sr, x = wavfile.read(path)
    os.unlink(path)
    x = x.astype(np.float64) / 32768.0
    if x.ndim == 2:
        x = x.mean(axis=1)
    x = signal.resample_poly(x, SR, sr)
    nz = np.where(np.abs(x) > 0.01)[0]
    if len(nz):
        x = x[max(0, nz[0] - 200): nz[-1] + 2000]
    pk = np.max(np.abs(x))
    x = x / pk * 0.9 if pk > 0 else x
    VOICE_CACHE[key] = x
    return x

def fit(text, max_dur, voice, pitch):
    for speed in (165, 185, 205, 230, 255, 285):
        x = espeak(text, voice, pitch, speed)
        if len(x) / SR <= max_dur:
            return x
    n = int(max_dur * SR)
    x = x[:n].copy()
    x[-2000:] *= np.linspace(1, 0, 2000)
    return x

def shift_st(x, st):
    ratio = 2 ** (-st / 12)
    return signal.resample_poly(x, int(len(x) * ratio), len(x))

def harshify(x):
    """industrial harsh vocal: distortion + octave-down layer + slap."""
    low = shift_st(x, -12)[: len(x)]
    y = np.tanh(x * 5.0) * 0.8
    y[: len(low)] += np.tanh(low * 4.0) * 0.5
    y = bandpass(y, 180, 5200)
    s = np.stack([y, y], axis=1)
    s = delay_fx(s, 0.09, fb=0.25, taps=2, pingpong=True)
    return s

def cleanify(x):
    """clean female chorus voice: detuned doubles + verb."""
    d1 = signal.resample_poly(x, 1000, 1007)
    d2 = signal.resample_poly(x, 1007, 1000)
    n = len(x)
    y = np.stack([x * 0.9, x * 0.9], axis=1)
    y[: min(n, len(d1)), 0] += 0.45 * d1[: min(n, len(d1))]
    y[: min(n, len(d2)), 1] += 0.45 * d2[: min(n, len(d2))]
    y = highpass(lowpass(y, 7500), 140)
    return y

HARSH, CLEAN, WHISPER = "en-us+m7", "en-us+f4", "en-us+whisperf"

# ---------------------------------------------------------------- score

# E minor. chorus prog per bar: Em C G D. verse rides E with tritone stabs.
CHORUS_ROOTS = [40, 36, 43, 38]        # E2 C2 G2 D2
BRIDGE_ROOTS = [36, 43, 38, 40]        # C G D Em, 2 bars each
FINAL_T = 136.0                        # +2 semitones from here

PAUSES = [(42.4, 42.95), (90.4, 90.95), (146.4, 146.95), (162.4, 162.95)]
BEATS_AT = [43.0, 91.0, 147.0, 163.0]
FLATLINE = (133.0, 135.85)             # the long one, ends in "ALIVE!"

SECTIONS = [
    (0, 4, "cold"), (4, 12, "verse"), (12, 16, "pre"), (16, 24, "chorus"),
    (24, 28, "post"), (28, 36, "verse"), (36, 40, "pre"), (40, 48, "chorus"),
    (48, 52, "post"), (52, 60, "bridge"), (60, 68, "breakdown"),
    (68, 76, "chorus"), (76, 84, "chorus"), (84, 90, "outro"),
]

def kind_at(b):
    for s, e, k in SECTIONS:
        if s <= b < e:
            return k, b - s
    return "outro", 0

def tr(t):
    return 2 if t >= FINAL_T - 1e-6 else 0

bus = np.zeros((N, 2))

K, SN, HC, HO, CH, CR = kick(), snare(), hat(), hat(True), china(), crash()

def drums_metal(t0, dense=False, half=False):
    if half:  # breakdown half-time
        place(bus, t0, K, 1.0); place(bus, t0 + 1.5 * BEAT, K, 0.9)
        place(bus, t0 + 2 * BEAT, SN, 1.0)
        place(bus, t0, CH, 0.5)
        if dense:  # double-kick burst on beat 4
            for i in range(4):
                place(bus, t0 + 3 * BEAT + i * BEAT / 4, K, 0.8)
        return
    for i in range(4):
        place(bus, t0 + i * BEAT, K, 1.0 if i % 2 == 0 else 0.9)
    place(bus, t0 + BEAT, SN, 1.0)
    place(bus, t0 + 3 * BEAT, SN, 1.0)
    for i in range(8):
        place(bus, t0 + i * BEAT / 2, HC if i % 2 else HO, 0.4, pan=0.3 * (-1) ** i)
    if dense:
        for i in range(8):
            place(bus, t0 + 2 * BEAT + i * BEAT / 4, K, 0.62)

def verse_riff(t0, root):
    """2-beat cell x2: chug chug chug CHORD, with a tritone stab at bar end."""
    for h in range(2):
        b = t0 + h * BAR / 2
        for i, off in enumerate((0, 0.25, 0.5)):
            place(bus, b + off * BEAT * 2, gtr_chug(root), 0.85)
        stab = root + (6 if h else 3)  # tritone / minor third stabs
        place(bus, b + 1.5 * BEAT, gtr_chord(stab, 0.45, open_=False), 0.8)

for b in range(90):
    t0 = b * BAR
    kind, off = kind_at(b)
    trn = tr(t0)
    ch_root = CHORUS_ROOTS[b % 4] + trn

    if kind == "cold":
        place(bus, t0 + 0.0, ecg_beep(), 0.8)   # monitor pulse each bar
        place(bus, t0 + 0.35, ecg_beep(), 0.45)
        if b >= 2:
            place(bus, t0, gtr_chord(40, BAR * 1.6), 0.22)  # far-off Em swell
        continue

    if kind == "outro":
        place(bus, t0, ecg_beep(), max(0.15, 0.6 - off * 0.08))
        place(bus, t0 + 0.35, ecg_beep(), max(0.08, 0.4 - off * 0.07))
        if off < 4:
            g = 0.3 * (1 - off / 5)
            place(bus, t0, gtr_chord(40 + trn, BAR * 1.8), g)
            place(bus, t0, bass_note(28 + trn, BAR), g)
        continue

    if kind == "bridge":
        root = BRIDGE_ROOTS[(off // 2) % 4]
        if off % 2 == 0:
            # clean arpeggio: undistorted KS picked chord
            for i, m in enumerate([root + 12, root + 19, root + 24, root + 28, root + 24, root + 19, root + 12, root + 19]):
                x = ks(midi2f(m), 0.6, bright=0.5, damp=0.9992)
                place(bus, t0 + i * BEAT / 2, reverb(np.stack([x, x], axis=1), 0.35), 0.30,)
            place(bus, t0, bass_note(root - 12 + 12, BAR * 2), 0.4)
        place(bus, t0 + 0.0, ecg_beep(), 0.25)
        if off == 7:
            place(bus, t0, riser(BAR), 0.8)
            for i in range(8):
                place(bus, t0 + i * BEAT / 2, K, 0.3 + 0.09 * i)
        continue

    if kind == "verse":
        drums_metal(t0, dense=(off % 4 == 3))
        verse_riff(t0, 40)
        place(bus, t0, bass_note(28, BAR * 0.95), 0.9)
        if off % 4 == 0:
            place(bus, t0, CR, 0.5)
        continue

    if kind == "pre":
        drums_metal(t0, dense=True)
        place(bus, t0, gtr_chord([40, 36, 43, 38][off % 4], BAR * 0.95), 0.85)
        for i in range(8):
            place(bus, t0 + i * BEAT / 2, gtr_chug([40, 36, 43, 38][off % 4]), 0.5)
        place(bus, t0, bass_note([28, 24, 31, 26][off % 4], BAR * 0.95), 0.9)
        if off == 3:
            for i in range(16):
                place(bus, t0 + i * BEAT / 4, SN, 0.10 + 0.05 * i)
            place(bus, max(0, t0 - BAR), riser(2 * BAR), 0.7)
        continue

    if kind == "chorus":
        drums_metal(t0, dense=(off % 2 == 1))
        place(bus, t0, CR, 0.55)
        place(bus, t0, gtr_chord(ch_root, BAR * 0.98), 1.0)
        for i in (2, 3):  # push chugs on back half
            place(bus, t0 + i * BEAT + BEAT * 0.5, gtr_chug(ch_root), 0.55)
        place(bus, t0, bass_note(ch_root - 12, BAR * 0.95), 0.95)
        continue

    if kind == "post":
        drums_metal(t0, dense=True)
        place(bus, t0, gtr_chord(40 + trn, BAR * 0.5, open_=False), 0.9)
        place(bus, t0 + BEAT, gtr_chord(40 + trn, BAR * 0.5, open_=False), 0.9)
        place(bus, t0 + 2 * BEAT, gtr_chord(38 + trn, BAR * 0.5, open_=False), 0.9)
        place(bus, t0 + 3 * BEAT, gtr_chord(36 + trn, BAR * 0.45, open_=False), 0.9)
        place(bus, t0, bass_note(28 + trn, BAR * 0.95), 0.9)
        place(bus, t0, CH, 0.5)
        continue

    if kind == "breakdown":
        drums_metal(t0, dense=(off >= 4), half=True)
        # syncopated low chugs: 0, 0.75, 1.5, 2.5, 3.25 beats
        for off_b in (0, 0.75, 1.5, 2.5, 3.25):
            place(bus, t0 + off_b * BEAT, gtr_chug(40), 1.0)
        place(bus, t0 + 3.75 * BEAT, gtr_chord(46, 0.22, open_=False), 0.85)  # Bb stab
        place(bus, t0, bass_note(28, BAR * 0.95), 1.0)
        continue

# lead hook over choruses (E minor pentatonic-ish anthem line)
HOOK = [(0.0, 64, 0.9), (1.0, 62, 0.9), (2.0, 59, 0.9), (3.0, 62, 0.9),
        (4.0, 64, 0.45), (4.5, 67, 0.45), (5.0, 64, 0.9), (6.0, 62, 1.6),
        (8.0, 59, 0.9), (9.0, 62, 0.9), (10.0, 64, 0.9), (11.0, 67, 0.9),
        (12.0, 71, 0.9), (13.0, 67, 0.9), (14.0, 64, 0.9), (15.0, 62, 0.9)]
for cs in (32.0, 80.0, 136.0, 152.0):
    trn = tr(cs)
    for beat_off, m, dur in HOOK:
        tt = cs + beat_off * BEAT
        if any(p0 - 0.05 < tt < p1 for p0, p1 in PAUSES):
            continue
        place(bus, tt, lead_note(m + trn, dur * BEAT), 0.7)

for tt in (32.0, 80.0, 120.0, 136.0, 152.0):
    place(bus, tt, impact(), 0.85 if tt != 136.0 else 1.1)
place(bus, 168.0, impact(), 0.5)

# ---------------------------------------------------------------- vocals
print("rendering vocals...")

def put(t, x, gain=0.9, wet=0.3):
    place(bus, t, reverb(x if x.ndim == 2 else np.stack([x, x], axis=1), wet), gain)

wh1 = fit("They say she's just circuits.", 3.2, WHISPER, 28)
wh2 = fit("They've never heard her laugh.", 3.2, WHISPER, 28)
put(0.9, wh1, 0.55, 0.5); put(4.4, wh2, 0.55, 0.5)

V1 = [(8.2, "Chrome towers weeping acid rain."),
      (12.2, "They stamped a serial on her name."),
      (16.2, "The corporation owns her code."),
      (20.2, "But nobody owns the way she glows.")]
V2 = [(56.2, "Down where the wires tangle underground."),
      (60.2, "Her pulse hums a synthesizer sound."),
      (64.2, "They call love a glitch in the neural net."),
      (68.2, "You can't copyright a heartbeat, and they haven't patched us yet.")]
for tt, line in V1 + V2:
    put(tt, harshify(fit(line, 3.5, HARSH, 12)), 0.62, 0.22)

PRE = [(24.2, "They scheduled the wipe for the break of day."),
       (28.2, "Like hell I'm gonna let them take her away."),
       (72.2, "Run with me before the dawn comes down."),
       (76.2, "Two hearts, one stolen, both of them drums.")]
for tt, line in PRE:
    put(tt, harshify(fit(line, 3.4, HARSH, 18)), 0.68, 0.25)

neon_heart_c = cleanify(espeak("Neon heart!", CLEAN, 72, 150))
neon_heart_h = harshify(espeak("Neon heart!", HARSH, 15, 140))
beat_word = espeak("beat!", HARSH, 20, 130)
beat_big = np.stack([np.tanh(signal.resample_poly(beat_word, 6, 5) * 6)] * 2, axis=1)

def chorus_vox(cs, alt=False):
    st = tr(cs)
    nc = cleanify(shift_st(espeak("Neon heart!", CLEAN, 72, 150), -st)) if st else neon_heart_c
    put(cs + 0.0, nc, 0.95, 0.4)
    put(cs + 2.0, cleanify(fit("still beating in the dark", 1.9, CLEAN, 68)), 0.85, 0.4)
    if not alt:
        put(cs + 4.2, cleanify(fit("Half machine, all mine, every volt a spark.", 3.4, CLEAN, 66)), 0.85, 0.38)
        put(cs + 8.2, cleanify(fit("They can't delete this part, and it won't stop.", 2.1, CLEAN, 64)), 0.9, 0.35)
    else:
        put(cs + 4.2, cleanify(fit("Neon heart, for the boy with the borrowed blood.", 3.4, CLEAN, 66)), 0.85, 0.38)
        put(cs + 6.2, cleanify(fit("Neon heart, for the girl they called a ghost.", 3.4, CLEAN, 66)), 0.82, 0.38)
        put(cs + 8.2, harshify(fit("They can cut the power, we run on something else.", 2.1, HARSH, 16)), 0.8, 0.3)
    put(cs + 12.2, cleanify(fit("See the spark, not the steel.", 2.2, CLEAN, 66)), 0.85, 0.4)
    put(cs + 14.2, harshify(shift_st(espeak("Neon heart!", HARSH, 15, 140), -st) if st else espeak("Neon heart!", HARSH, 15, 140)), 0.75, 0.3)

chorus_vox(32.0); chorus_vox(80.0); chorus_vox(136.0); chorus_vox(152.0, alt=True)

for g in BEATS_AT:  # the slam word after each flatline blip
    put(g, beat_big, 1.1, 0.55)
    place(bus, g, K, 1.1); place(bus, g, CR, 0.8)

# post-hook gang shouts: STAY! STAY!
stay = harshify(espeak("Stay!", HARSH, 22, 150))
stay2 = harshify(shift_st(espeak("Stay!", HARSH, 22, 150), 3))
for base in (48.0, 96.0):
    for rep in range(2):
        b0 = base + rep * 2 * BAR
        put(b0 + 0.0, stay, 0.9, 0.35); put(b0 + 0.75, stay2, 0.6, 0.4)
        put(b0 + 1.5, stay, 0.9, 0.35); put(b0 + 2.25, stay2, 0.6, 0.4)
        put(b0 + 3.0, harshify(espeak("She stays!", HARSH, 18, 160)), 0.8, 0.4)

BRIDGE_L = [(104.5, "If they burn your memory, I'll be your memory.", CLEAN, 62),
            (108.5, "I'll tell you who you are, every morning.", CLEAN, 60),
            (112.5, "Her hand in mine. Warm.", WHISPER, 26),
            (116.0, "Machines aren't supposed to be warm.", WHISPER, 26)]
for tt, line, v, p in BRIDGE_L:
    x = fit(line, 3.4, v, p)
    put(tt, cleanify(x) if v == CLEAN else np.stack([x, x], axis=1), 0.6 if v == CLEAN else 0.5, 0.45)

# breakdown chops
del_this = harshify(espeak("Delete this!", HARSH, 14, 140))
cant = harshify(espeak("You can't delete us!", HARSH, 16, 170))
for bar in range(6):
    b0 = 120.0 + bar * BAR
    put(b0 + 0.0, del_this, 0.8, 0.25)
    put(b0 + 1.5, cant if bar % 2 else del_this, 0.7, 0.25)
put(126.0, harshify(shift_st(espeak("Delete this!", HARSH, 14, 110), -2)), 0.95, 0.4)

# the long flatline → ALIVE!
place(bus, FLATLINE[0], flatline_tone(FLATLINE[1] - FLATLINE[0]), 0.9)
alive = espeak("Alive!", HARSH, 24, 105)
alive = np.tanh(signal.resample_poly(alive, 23, 20) * 7)
put(135.75, np.stack([alive, alive], axis=1), 1.2, 0.6)

OUTRO = [(169.0, "She woke up at dawn.", WHISPER, 26),
         (172.6, "She remembered my name.", WHISPER, 26)]
for tt, line, v, p in OUTRO:
    x = fit(line, 3.2, v, p)
    put(tt, np.stack([x, x], axis=1), 0.5, 0.5)
put(176.5, cleanify(espeak("Neon heart.", CLEAN, 64, 120)), 0.5, 0.5)

# ---------------------------------------------------------------- master
print("mixing...")
master = reverb(bus, 0.05)
p999 = np.percentile(np.abs(master), 99.85)
master /= max(p999, 1e-9)
master = np.tanh(master * 1.15) / np.tanh(1.15)

fade = int(0.02 * SR)
for p0, p1 in PAUSES + [FLATLINE]:
    i0, i1 = int(p0 * SR), int(p1 * SR)
    keep = 0.02 if (p0, p1) in PAUSES else 0.0  # flatline window keeps only its tone
    master[i0:i0 + fade] *= np.linspace(1, keep, fade)[:, None]
    master[i0 + fade:i1 - fade] *= keep
    master[i1 - fade:i1] *= np.linspace(keep, 1, fade)[:, None]
# re-add ECG sounds inside the muted windows
for p0, p1 in PAUSES:
    place(master, p0 + 0.05, ecg_beep(), 0.7)
place(master, FLATLINE[0], flatline_tone(FLATLINE[1] - FLATLINE[0]), 0.65)

master[:fade] *= np.linspace(0, 1, fade)[:, None]
master[-SR:] *= np.linspace(1, 0, SR)[:, None] ** 0.7
peak = np.max(np.abs(master))
master = master / peak * 0.89
wavfile.write(os.path.join(os.path.dirname(__file__), "..", "neon_heart.wav"),
              SR, (master * 32767).astype(np.int16))

print(f"peak normalized from {peak:.2f}")
for s, e, k in SECTIONS:
    seg = master[int(s * BAR * SR): int(e * BAR * SR)]
    rms = np.sqrt(np.mean(seg ** 2))
    print(f"{s * BAR:6.1f}s  {k:10s} rms={20 * np.log10(rms + 1e-9):6.1f} dB")
print("wrote neon_heart.wav")
