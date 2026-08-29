#!/usr/bin/env python3
"""Procedural synthesis of "VEIL" — 3:00, 120 BPM, F minor (final choruses +2st).

Renders the full arrangement from music-video/music-spec.md to veil.wav:
drums, side-chained bass, supersaw pads, Karplus-Strong arps, lead hook,
formant "oh" choir, risers/impacts, espeak-ng vocals (whisper + spoken + stabs),
THE PAUSE before every "gone", and the whole thing on an exact 2s/bar grid so
video cuts land on downbeats by construction.
"""
import os
import subprocess
import tempfile

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
BPM = 120.0
BEAT = 60.0 / BPM          # 0.5 s
BAR = 4 * BEAT             # 2.0 s
TOTAL = 180.0
N = int(TOTAL * SR)

rng = np.random.default_rng(7)

# ---------------------------------------------------------------- helpers

def midi2f(m):
    return 440.0 * 2 ** ((m - 69) / 12)

def t_axis(dur):
    return np.arange(int(dur * SR)) / SR

def env_ar(n, a, r, curve=3.0):
    """attack/release envelope over n samples; a, r in seconds."""
    e = np.ones(n)
    na, nr = min(n, max(1, int(a * SR))), min(n, max(1, int(r * SR)))
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.exp(-curve * np.linspace(0, 1, nr))
    return e

def exp_env(n, decay):
    return np.exp(-np.arange(n) / SR / decay)

def place(buf, t, x, gain=1.0, pan=0.0):
    """Add stereo/mono x into stereo buf at time t. pan in [-1, 1]."""
    i = int(t * SR)
    if i >= N:
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

def saw(f, dur, phase=0.0):
    t = t_axis(dur)
    return 2 * ((f * t + phase) % 1) - 1

def supersaw(f, dur, voices=6, detune=0.012, stereo=True):
    nL = np.zeros(int(dur * SR)); nR = np.zeros(int(dur * SR))
    for v in range(voices):
        d = 1 + detune * (v - (voices - 1) / 2) / max(1, voices - 1) * 2
        w = saw(f * d, dur, phase=rng.random())
        (nL, nR)[v % 2][:] += w
    if stereo:
        return np.stack([nL, nR], axis=1) / (voices / 2)
    return (nL + nR) / voices

def ks_pluck(f, dur, bright=0.6):
    """Karplus-Strong plucked string."""
    n = int(dur * SR)
    period = max(2, int(SR / f))
    out = np.zeros(n)
    buf = rng.uniform(-1, 1, period) * bright
    idx = 0
    for i in range(n):
        out[i] = buf[idx]
        buf[idx] = 0.996 * 0.5 * (buf[idx] + buf[(idx + 1) % period])
        idx = (idx + 1) % period
    return out

def delay_fx(x, d, fb=0.4, taps=5, pingpong=True):
    out = x.copy()
    ds = int(d * SR)
    for k in range(1, taps + 1):
        g = fb ** k
        shifted = np.zeros_like(x)
        if k * ds < len(x):
            shifted[k * ds:] = x[: len(x) - k * ds]
        if pingpong and x.ndim == 2 and k % 2 == 1:
            shifted = shifted[:, ::-1]
        out += g * shifted
    return out

def make_ir(dur=1.9, tone=0.35):
    n = int(dur * SR)
    ir = rng.standard_normal((n, 2)) * np.exp(-4.0 * np.arange(n)[:, None] / n)
    ir = lowpass(ir, 6500) * tone
    ir[:40] *= np.linspace(0, 1, 40)[:, None]
    return ir / np.max(np.abs(ir)) * 0.5

IR = make_ir()

def reverb(x, wet=0.3):
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    w = np.stack([signal.oaconvolve(x[:, c], IR[:, c])[: len(x)] for c in (0, 1)], axis=1)
    return x + wet * w

# ---------------------------------------------------------------- drums

def kick(sub=False):
    dur = 0.5
    t = t_axis(dur)
    f = 45 + 110 * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * exp_env(len(t), 0.16)
    click = highpass(rng.standard_normal(len(t)) * exp_env(len(t), 0.004), 3000)
    x = body * (0.9 if not sub else 1.0) + (0 if sub else 0.35) * click
    return np.tanh(x * 1.6) * 0.9

def clap():
    dur = 0.35
    n = int(dur * SR)
    x = np.zeros(n)
    for off in (0, 0.012, 0.025):
        i = int(off * SR)
        burst = rng.standard_normal(n - i) * exp_env(n - i, 0.06)
        x[i:] += burst
    return bandpass(x, 500, 6500) * 0.7

def snare():
    dur = 0.3
    n = int(dur * SR)
    tone = np.sin(2 * np.pi * 185 * t_axis(dur)) * exp_env(n, 0.05)
    noise = bandpass(rng.standard_normal(n), 1200, 9000) * exp_env(n, 0.09)
    return (0.5 * tone + 0.7 * noise) * 0.8

def hat(open_=False):
    dur = 0.3 if open_ else 0.07
    n = int(dur * SR)
    x = highpass(rng.standard_normal(n), 7500) * exp_env(n, 0.12 if open_ else 0.02)
    return x * 0.5

def riser(dur=4.0):
    n = int(dur * SR)
    x = rng.standard_normal((n, 2))
    # rising bandpass sweep + volume swell
    sweep = np.linspace(0, 1, n) ** 2
    x = highpass(x, 300)
    x *= sweep[:, None] ** 1.5
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * (2 + 10 * sweep) * np.arange(n) / SR)
    return lowpass(x * lfo[:, None], 9000) * 0.6

def impact():
    dur = 2.2
    n = int(dur * SR)
    boom = np.sin(2 * np.pi * 48 * t_axis(dur) * np.exp(-t_axis(dur) * 0.6)) * exp_env(n, 0.7)
    splash = lowpass(rng.standard_normal((n, 2)), 4000) * exp_env(n, 0.35)[:, None]
    return np.stack([boom, boom], axis=1) * 0.9 + splash * 0.4

# ---------------------------------------------------------------- pitched

def bass_note(m, dur, style="held"):
    f = midi2f(m)
    n = int(dur * SR)
    x = saw(f, dur) + 0.5 * saw(f * 0.5, dur) + 0.3 * np.sin(2 * np.pi * f * t_axis(dur))
    fc = 420 if style == "held" else 800
    x = lowpass(x, fc, 4)
    x *= env_ar(n, 0.008, min(0.2, dur * 0.4))
    return np.tanh(x * 1.4) * 0.8

def pad_chord(midis, dur, bright=2400):
    acc = None
    for m in midis:
        w = supersaw(midi2f(m), dur, voices=6, detune=0.014)
        acc = w if acc is None else acc + w
    acc = lowpass(acc, bright)
    acc *= env_ar(len(acc), 0.4, min(1.2, dur * 0.5), curve=2.0)[:, None]
    return acc / len(midis)

def ep_chord(midis, dur):
    """Rhodes-ish EP for the bridge."""
    acc = None
    for m in midis:
        f = midi2f(m)
        t = t_axis(dur)
        w = (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(4 * np.pi * f * t)
             + 0.12 * np.sin(6 * np.pi * f * t))
        trem = 1 + 0.12 * np.sin(2 * np.pi * 4.5 * t)
        w = w * trem * exp_env(len(t), dur * 0.55)
        acc = w if acc is None else acc + w
    x = acc / len(midis)
    return np.stack([x, x * 0.95], axis=1)

def lead_note(m, dur, glide_from=None):
    f = midi2f(m)
    t = t_axis(dur)
    if glide_from:
        f0 = midi2f(glide_from)
        ff = f0 + (f - f0) * np.clip(t / 0.06, 0, 1)
    else:
        ff = np.full(len(t), f)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / 0.25, 0, 1)
    ph = np.cumsum(ff * vib) / SR
    x = 0.6 * (2 * (ph % 1) - 1) + 0.4 * np.sign(np.sin(2 * np.pi * ph))
    x = lowpass(x, 3800)
    x *= env_ar(len(t), 0.01, min(0.25, dur * 0.5))
    return x * 0.5

def choir_note(m, dur):
    """'oh' vowel: saw stack through two formant bands."""
    base = supersaw(midi2f(m), dur, voices=5, detune=0.02, stereo=False)
    v = bandpass(base, 380, 620) * 1.6 + bandpass(base, 750, 1150) * 0.9
    v *= env_ar(len(v), 0.06, min(0.4, dur * 0.5))
    return np.stack([v, v * 0.92], axis=1) * 1.2

# ---------------------------------------------------------------- espeak vocals

VOICE_CACHE = {}

def espeak(text, voice="en-us+f3", pitch=50, speed=175):
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
    # trim silence
    nz = np.where(np.abs(x) > 0.01)[0]
    if len(nz):
        x = x[max(0, nz[0] - 200): nz[-1] + 2000]
    peak = np.max(np.abs(x))
    x = x / peak * 0.9 if peak > 0 else x
    VOICE_CACHE[key] = x
    return x

def fit_line(text, max_dur, voice="en-us+f3", pitch=50):
    for speed in (170, 190, 210, 230, 255, 280):
        x = espeak(text, voice, pitch, speed)
        if len(x) / SR <= max_dur:
            return x
    n = int(max_dur * SR)
    x = x[:n]
    x[-2000:] *= np.linspace(1, 0, 2000)
    return x

def shift_semitones(x, st):
    """crude pitch shift by resampling (changes duration too — fine for stabs)."""
    ratio = 2 ** (-st / 12)
    return signal.resample_poly(x, int(len(x) * ratio), len(x))

def vox_fx(x, lp=6000, hp=120, wet=0.35, echo=0.0):
    x = highpass(lowpass(x, lp), hp)
    s = np.stack([x, x], axis=1)
    if echo:
        s = delay_fx(s, 3 * BEAT / 2, fb=echo, taps=4)
    return reverb(s, wet)

# ---------------------------------------------------------------- score

# chord voicings (F minor); transpose +2 from FINAL_T
PADS = {"Fm": [53, 56, 60, 65], "Db": [49, 56, 61, 65],
        "Ab": [56, 60, 63, 68], "Eb": [51, 58, 63, 67]}
ROOTS = {"Fm": 29, "Db": 25, "Ab": 32, "Eb": 27}
PROG = ["Fm", "Db", "Ab", "Eb"]
BRIDGE_PROG = ["Db", "Ab", "Eb", "Fm"]  # 2 bars each

FINAL_T = 136.0  # transpose boundary (+2 semitones)

def bar_t(b):
    return b * BAR

def tr(t):
    return 2 if t >= FINAL_T - 1e-6 else 0

SECTIONS = [  # (start_bar, end_bar, kind)
    (0, 4, "cold"), (4, 12, "v1"), (12, 16, "pre"), (16, 24, "chorus"),
    (24, 28, "post"), (28, 36, "v2"), (36, 40, "pre2"), (40, 48, "chorus"),
    (48, 52, "post"), (52, 60, "bridge"), (60, 68, "drop"),
    (68, 76, "chorus"), (76, 84, "chorus"), (84, 90, "outro"),
]

def kind_at(b):
    for s, e, k in SECTIONS:
        if s <= b < e:
            return k, b - s
    return "outro", 0

# master mute windows (THE PAUSE) and the GONE moments
PAUSES = [(42.4, 42.95), (90.4, 90.95), (146.4, 146.95), (162.4, 162.95)]
GONES = [43.0, 91.0, 147.0, 163.0]

master = np.zeros((N, 2))
duck_src = np.zeros(N)          # kick impulse map for sidechain
bus_pump = np.zeros((N, 2))     # side-chained bus: bass/pads/arp
bus_dry = np.zeros((N, 2))      # non-pumped: drums, lead, vocals, fx

K, SN, CL, HC, HO = kick(), snare(), clap(), hat(), hat(True)
KSUB = kick(sub=True)

def add_kick(t, g=1.0, soft=False):
    place(bus_dry, t, KSUB if soft else K, gain=g)
    i = int(t * SR)
    if i < N:
        duck_src[i] = max(duck_src[i], 1.0 if not soft else 0.4)

# ---- build per bar
for b in range(90):
    t0 = bar_t(b)
    kind, off = kind_at(b)
    ch = PROG[b % 4]
    trn = tr(t0)
    pads_m = [m + trn for m in PADS[ch]]
    root = ROOTS[ch] + trn

    if kind == "cold":
        # heartbeat: lub-dub each bar
        add_kick(t0 + 0.00, 0.7, soft=True)
        add_kick(t0 + 0.32, 0.45, soft=True)
        if b >= 2:
            place(bus_pump, t0, pad_chord([m - 12 for m in pads_m], BAR, 900), gain=0.25)
        continue

    if kind == "outro":
        add_kick(t0, max(0.1, 0.6 - 0.1 * off), soft=True)
        add_kick(t0 + 0.32, max(0.05, 0.4 - 0.08 * off), soft=True)
        if off < 4:
            place(bus_pump, t0, ep_chord(pads_m, BAR * 1.5), gain=0.30 * (1 - off / 5))
        continue

    if kind == "bridge":
        chb = BRIDGE_PROG[(off // 2) % 4]
        if off % 2 == 0:
            place(bus_pump, t0, ep_chord([m + trn for m in PADS[chb]], BAR * 2.2), gain=0.5)
            place(bus_pump, t0, np.stack([bass_note(ROOTS[chb] + trn + 12, BAR * 2)] * 2, axis=1), gain=0.25)
        if off == 7:  # riser + snare roll into the drop
            place(bus_dry, t0, riser(BAR), gain=0.8)
            for i in range(8):
                place(bus_dry, t0 + i * BEAT / 2, SN, gain=0.12 + 0.06 * i)
        continue

    is_big = kind in ("chorus", "post", "drop")
    is_pre = kind in ("pre", "pre2")

    # ---- drums
    if kind in ("v1", "v2"):
        add_kick(t0, 0.85); add_kick(t0 + 2 * BEAT, 0.8)
        place(bus_dry, t0 + BEAT, SN, gain=0.25)
        place(bus_dry, t0 + 3 * BEAT, SN, gain=0.3)
        nhat = 16 if kind == "v2" else 8
        for i in range(nhat):
            g = 0.16 if i % 2 == 0 else 0.10
            place(bus_dry, t0 + i * BAR / nhat, HC, gain=g, pan=0.25 * (1 if i % 4 == 2 else -1))
        if kind == "v2" and off in (2, 5) :
            for i in range(4):  # 32nd roll pickup
                place(bus_dry, t0 + 3.5 * BEAT + i * BEAT / 8, HC, gain=0.12 + 0.04 * i)
    elif is_pre:
        for i in range(4):
            add_kick(t0 + i * BEAT, 0.55 + 0.08 * off)
        if off == 3:  # build roll
            for i in range(16):
                place(bus_dry, t0 + i * BEAT / 4, SN, gain=0.08 + 0.055 * i)
            place(bus_dry, t0 - BAR, riser(2 * BAR), gain=0.75)
    elif is_big:
        for i in range(4):
            add_kick(t0 + i * BEAT, 1.0)
            place(bus_dry, t0 + (i + 0.5) * BEAT, HO, gain=0.28, pan=0.3 * (-1) ** i)
        place(bus_dry, t0 + BEAT, CL, gain=0.75)
        place(bus_dry, t0 + 3 * BEAT, CL, gain=0.75)
        if kind == "drop":
            for i in range(16):
                if i % 4 != 0:
                    place(bus_dry, t0 + i * BEAT / 4, HC, gain=0.14, pan=0.35 * (-1) ** i)

    # ---- bass
    if kind in ("v1", "v2"):
        place(bus_pump, t0, np.stack([bass_note(root, BAR)] * 2, axis=1), gain=0.55)
    elif is_pre:
        for i in range(4):
            place(bus_pump, t0 + i * BEAT, np.stack([bass_note(root, BEAT * 0.9, "pump")] * 2, axis=1), gain=0.5)
    elif is_big:
        for i in range(8):
            m = root if (kind != "drop" or i % 4 != 2) else root + 12
            place(bus_pump, t0 + i * BEAT / 2, np.stack([bass_note(m, BEAT / 2 * 0.95, "pump")] * 2, axis=1), gain=0.62)

    # ---- pads
    if kind in ("v1", "v2"):
        place(bus_pump, t0, pad_chord([m - 12 for m in pads_m], BAR, 1100), gain=0.30)
    elif is_pre:
        place(bus_pump, t0, pad_chord(pads_m, BAR, 1800 + 400 * off), gain=0.4)
    elif is_big:
        place(bus_pump, t0, pad_chord(pads_m + [pads_m[0] + 12], BAR, 3200), gain=0.5)

    # ---- arp (pre + chorus + drop)
    if is_pre or is_big:
        seq = pads_m + [m + 12 for m in pads_m]
        for i in range(16):
            m = seq[[0, 2, 4, 6, 1, 3, 5, 7, 0, 4, 2, 6, 1, 5, 3, 7][i]]
            g = 0.30 if is_big else 0.2
            place(bus_pump, t0 + i * BEAT / 4, ks_pluck(midi2f(m), 0.24), gain=g, pan=0.5 * (-1) ** i)

# ---- lead hook melody in each chorus (relative beats from chorus start)
HOOK = [(0.0, 72, 0.9), (1.0, 68, 0.9), (2.0, 70, 0.9), (3.0, 67, 0.9),
        (4.0, 65, 0.45), (4.5, 67, 0.45), (5.0, 68, 0.45), (5.5, 70, 0.45),
        (6.0, 72, 1.4), (7.5, 70, 0.5),
        (8.0, 65, 0.7), (9.0, 67, 0.7), (10.0, 68, 0.7), (11.0, 70, 0.7),
        (12.0, 72, 0.9),  # lands with GONE
        (13.0, 75, 0.9), (14.0, 72, 0.9), (15.0, 68, 0.8), (15.8, 65, 0.9)]
for cs in (32.0, 80.0, 136.0, 152.0):
    trn = tr(cs)
    prev = None
    for beat_off, m, dur in HOOK:
        tt = cs + beat_off * BEAT
        if any(p0 - 0.05 < tt < p1 for p0, p1 in PAUSES):
            continue
        x = lead_note(m + trn, dur * BEAT, glide_from=prev)
        place(bus_dry, tt, delay_fx(np.stack([x, x], axis=1), 3 * BEAT / 4, 0.3, 3), gain=0.42)
        prev = m + trn

# ---- choir chant in post-hooks: "oh oh oh ohhh"
for ps in (48.0, 96.0):
    for rep in range(2):
        base = ps + rep * 2 * BAR
        for i, (m, dur) in enumerate([(72, 0.9), (70, 0.9), (68, 0.9), (65, 1.8)]):
            place(bus_dry, base + i * BEAT, reverb(choir_note(m, dur * BEAT), 0.4), gain=0.5)

# ---- impacts & risers at big boundaries
for tt in (32.0, 80.0, 120.0, 136.0, 152.0):
    place(bus_dry, tt, impact(), gain=0.8 if tt != 136.0 else 1.0)
place(bus_dry, 168.0, impact(), gain=0.5)

# ---------------------------------------------------------------- vocals
print("rendering vocals...")
W, F3 = "en-us+whisperf", "en-us+f3"

def put_vox(t, x, gain=0.9, wet=0.35, lp=6000, echo=0.0):
    place(bus_dry, t, vox_fx(x, lp=lp, wet=wet, echo=echo), gain=gain)

# cold open + outro whisper
wh = fit_line("Everybody's watching. So give them something they can't see.", 6.5, W, 30)
put_vox(0.8, wh, 0.5, wet=0.5, lp=5000, echo=0.35)
put_vox(169.0, wh, 0.42, wet=0.55, lp=4500, echo=0.4)

VERSE_LINES = [
    (8.2,  "Glass house. Glass streets. Glass everything."),
    (12.2, "Every move I make has a thousand eyes following."),
    (16.2, "They know what I paid, what I made, where I've been."),
    (20.2, "My whole life's a window, and the world keeps looking in."),
    (56.2, "They archive my heartbeats. They auction my nights."),
    (60.2, "They sell my Tuesday to a stranger, for a fraction of a dime."),
    (64.2, "I'm not hiding nothing. I just want one thing, mine."),
    (68.2, "A room with no windows, in a city made of light."),
]
for tt, line in VERSE_LINES:
    put_vox(tt, fit_line(line, 3.6, F3, 42), 0.6, wet=0.25, echo=0.15)

PRE_LINES = [
    (24.2, "But I found a door, in a wall of light."),
    (28.2, "Where the numbers close their eyes, and the loud goes quiet."),
    (72.2, "What have you got to hide? That's the wrong question, friend."),
    (76.2, "Ask why they built the walls out of glass, instead."),
]
for tt, line in PRE_LINES:
    put_vox(tt, fit_line(line, 3.6, F3, 55), 0.9, wet=0.3, echo=0.2)

# chorus stabs
veil_on = espeak("vail on!", F3, 60, 150)
fade_out = espeak("fade out!", F3, 55, 150)
gone = espeak("gone.", F3, 38, 115)
gone_big = signal.resample_poly(gone, 6, 5)  # slower + lower

def chorus_vox(cs, alt=False):
    st = tr(cs)
    vo = shift_semitones(veil_on, -st) if st else veil_on
    fo = shift_semitones(fade_out, -st) if st else fade_out
    put_vox(cs + 0.0, vo, 1.0, wet=0.3, echo=0.3)
    put_vox(cs + 1.0, shift_semitones(vo, 3), 0.6, wet=0.4, echo=0.3)
    put_vox(cs + 2.0, fo, 0.95, wet=0.3, echo=0.3)
    put_vox(cs + 3.0, shift_semitones(fo, 3), 0.55, wet=0.4, echo=0.3)
    if not alt:
        put_vox(cs + 4.2, fit_line("Still right here, but you can't trace me now.", 3.4, F3, 58), 0.9)
        put_vox(cs + 8.2, fit_line("One hand over my face, and I'm", 2.1, F3, 52), 0.95)
    else:
        put_vox(cs + 4.2, fit_line("Veil on, for the girl in the glass house.", 3.4, F3, 58), 0.9)
        put_vox(cs + 6.2, fit_line("Veil on, for the man with the passwords.", 3.4, F3, 58), 0.85)
        put_vox(cs + 8.2, fit_line("One hand over your face, and you're", 2.1, F3, 52), 0.95)
    put_vox(cs + 12.2, fit_line("See the shine, not the source.", 2.4, F3, 55), 0.9)
    put_vox(cs + 14.2, vo, 0.95, wet=0.35, echo=0.35)

chorus_vox(32.0); chorus_vox(80.0); chorus_vox(136.0); chorus_vox(152.0, alt=True)

# the GONEs — land right after each pause, huge reverb
for g in GONES:
    put_vox(g, gone_big, 1.15, wet=0.65, lp=5200, echo=0.45)

# post-hook "gone!" answers
for tt in (51.6, 55.6, 99.6, 103.6):
    put_vox(tt, gone, 0.8, wet=0.45, echo=0.3)

# bridge whispers
BRIDGE_LINES = [
    (104.5, "Curtains on the windows. Envelopes for letters."),
    (108.5, "Doors that you could close. We had it. We forgot it."),
    (112.5, "Privacy was normal."),
    (116.0, "When did normal get so rare?"),
]
for tt, line in BRIDGE_LINES:
    put_vox(tt, fit_line(line, 3.4, W, 25), 0.55, wet=0.5, lp=5000, echo=0.3)

# drop: stuttered chops of "veil on"
chop = veil_on[: int(0.11 * SR)]
for bar in range(8):
    base = 120.0 + bar * BAR
    pattern = [(0, chop, 0), (0.25, chop, 2), (0.5, chop, 0), (1.0, veil_on, 0),
               (2.0, chop, 5), (2.25, chop, 3), (2.5, veil_on, -2)]
    for beat_off, sample, st in pattern:
        x = shift_semitones(sample, st) if st else sample
        put_vox(base + beat_off * BEAT, x, 0.75, wet=0.3, echo=0.25)
for tt in (123.0, 131.0):
    put_vox(tt, gone, 0.9, wet=0.5, echo=0.35)

put_vox(176.5, espeak("vail on.", W, 30, 130), 0.8, wet=0.6, lp=4500, echo=0.4)

# ---------------------------------------------------------------- mix
print("mixing...")
# sidechain envelope from kick impulses
duck = np.ones(N)
kick_idx = np.where(duck_src > 0)[0]
dip_len = int(0.42 * SR)
dip = 1 - 0.75 * np.exp(-np.linspace(0, 6, dip_len))
dip[:int(0.015 * SR)] = np.linspace(0.25, dip[int(0.015 * SR)], int(0.015 * SR))
for i in kick_idx:
    j = min(N, i + dip_len)
    seg = dip[: j - i] * duck_src[i] + (1 - duck_src[i])
    duck[i:j] = np.minimum(duck[i:j], seg)

master = bus_dry + bus_pump * duck[:, None]

# gentle master reverb glue, then normalize headroom BEFORE the soft clipper so
# section dynamics survive (only transients above ~1.0 get shaved)
master = reverb(master, 0.06)
p999 = np.percentile(np.abs(master), 99.85)
master /= max(p999, 1e-9)
master = np.tanh(master * 1.1) / np.tanh(1.1)

# THE PAUSE: hard master dips
fade = int(0.02 * SR)
for p0, p1 in PAUSES:
    i0, i1 = int(p0 * SR), int(p1 * SR)
    master[i0:i0 + fade] *= np.linspace(1, 0.02, fade)[:, None]
    master[i0 + fade:i1 - fade] *= 0.02
    master[i1 - fade:i1] *= np.linspace(0.02, 1, fade)[:, None]

# ends
master[:fade] *= np.linspace(0, 1, fade)[:, None]
master[-SR:] *= np.linspace(1, 0, SR)[:, None] ** 0.7

peak = np.max(np.abs(master))
master = master / peak * 0.89
wavfile.write(os.path.join(os.path.dirname(__file__), "..", "veil.wav"),
              SR, (master * 32767).astype(np.int16))

# QC: per-section RMS map
print(f"peak normalized from {peak:.2f}")
for s, e, k in SECTIONS:
    seg = master[int(bar_t(s) * SR): int(bar_t(e) * SR)]
    rms = np.sqrt(np.mean(seg ** 2))
    print(f"{bar_t(s):6.1f}s  {k:8s} rms={20*np.log10(rms+1e-9):6.1f} dB")
print("wrote veil.wav")
