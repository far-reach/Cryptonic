# "VEIL" — the music video

A 3:00 music video built on the one universal feeling VEIL's product sits on: **everybody's
watching, and you just want one thing that's yours.** It works as a standalone dark-euphoric
synth-pop anthem about privacy in the surveillance age; the VEIL tie-in is subtext, not an ad —
which is exactly why it can travel outside the crypto niche.

| File | What |
|---|---|
| [`lyrics.md`](lyrics.md) | Full 3:00 lyrics on a 120 BPM / 8-second section grid |
| [`music-spec.md`](music-spec.md) | Paste-ready music-generator prompt + acceptance checks |
| [`storyboard.md`](storyboard.md) | 23 shots with consistency blocks and generation prompts |

## The viral mechanics (what's engineered, honestly stated)

Nobody can promise a billion views — anyone who does is selling something. What *can* be
engineered is everything repeatable about videos that did get there:

1. **A hook inside 2 seconds** — the whisper "everybody's watching…" over an eye full of cameras
   works muted, at phone volume, and as a thumbnail.
2. **A signature gesture** — THE MOVE (palm sweep → face dissolves → *beat of silence* → "gone").
   Gestures are what people imitate; imitation is what algorithms reward. The silence before
   "gone" is a built-in loop/edit point for short-form remixes.
3. **A four-word chantable hook** ("veil on, fade out") + a crowd chant designed to be singable
   the first time you hear it.
4. **Quotable lines** that carry the video into captions and comments ("ask why they built the
   walls out of glass instead").
5. **A 3:00 master for YouTube + native 9:16 cutdowns** of shots 5, 7, 17–19 for TikTok/Reels/
   Shorts — long-form is where the view count lives, short-form is where it's lit.

## How this cut was produced (fully self-contained, no external AI services)

The generative-media connector was unavailable, so this version is produced end-to-end in
`src/` with local tools — procedural audio, generative canvas visuals, frame-exact sync:

1. **`src/synth_veil.py`** — synthesizes the whole 3:00 track with numpy/scipy: drums,
   side-chained bass, supersaw pads, Karplus-Strong arps, lead hook, formant "oh" choir,
   risers/impacts, and espeak-ng vocals (whispered intro/bridge, spoken-word verses, chanted
   "veil on / gone" stabs — a deliberate robotic aesthetic that fits the surveillance theme).
   Every section sits on the 120 BPM / 2s-bar grid; THE PAUSE is a hard master mute before
   each "gone". Output: `veil.wav`.
2. **`src/veil_video.html`** — a deterministic canvas renderer: every scene is a pure function
   of time, mirroring `storyboard.md` in a neon-minimal style (the Glass City, floating money
   tickers, THE MOVE face-dissolve, the light-moth murmuration palm, the amber room, the
   aurora transform, the title wipe) plus the full kinetic-typography lyric track.
   Open it in a browser to watch it play in real time.
3. **`src/capture.mjs`** — drives headless Chromium frame-by-frame at 24fps, pipes 4,320
   JPEG frames into ffmpeg, muxes `veil.wav` → `veil_master.mp4` (1080p, H.264 CRF 19, AAC).

Audio and video share one clock, so every cut lands on a downbeat and the blackout/"GONE."
slam is sample-accurate by construction.

### Upgrade path (when a media connector is available)

`storyboard.md` doubles as a ready-to-run generation plan: character-sheet → 23 shots via
`generate_video_batch` (seedance/kling), a sung vocal track from a music generator per
`music-spec.md`, then the same beat-grid assembly. The 9:16 cutdown targets are shots 5, 7,
17–19 (32–40s, 48–56s, and 120–136s of this master).
