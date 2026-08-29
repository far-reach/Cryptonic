# "VEIL" — music production spec

Higgsfield's audio tools generate **speech only** — there is no standalone music model in that
toolset. So the track itself comes from a dedicated music generator (Suno, Udio, or similar), using
the prompts below with the lyrics from [`lyrics.md`](lyrics.md). Once the MP3/WAV exists, it gets
uploaded via `media_upload` and everything downstream (edit, sync, cutdowns) is automated — see
[`README.md`](README.md).

## Style prompt (paste into Suno/Udio "style" field)

> Dark euphoric synth-pop / electro-pop anthem, 120 BPM, F minor. Female alto lead — breathy,
> intimate, close-mic verses; belted, wide-open anthemic choruses. Side-chained analog bass,
> pulsing eighth-note synth, gated 80s-style drums; verse 2 switches to sparse trap hi-hats over
> the same pulse. Big stadium gang-vocal chant on the post-hook ("oh-oh-oh-ohhh — gone!").
> Stripped piano-and-voice half-time bridge. Instrumental dance-break drop at 2:00 built on a
> stuttered chopped-vocal hook ("v-v-veil on — gone"). Final double chorus modulates up a whole
> step to G minor with a choir behind the lead. Cinematic reverb tails, modern radio-pop mix,
> LOUD chorus / whisper-quiet intro contrast. Clean 3:00 runtime, hard-defined section grid.

## Non-negotiables (re-generate until they hold)

1. **The pause.** In every chorus, "One hand over my face and I'm —" is followed by ~1 full beat
   of near-silence before "**gone**" lands with the downbeat. This silence is the sync point for
   the video's signature move and the loop point for short-form edits. If the generator sings
   through it, regenerate.
2. **Cold open is a whisper**, not a sung intro — voice + heartbeat-style sub-bass only, so the
   first 2 seconds work as a hook even at phone-speaker volume.
3. **120 BPM exactly**, sections on the 8-second grid in `lyrics.md` (every video clip is 4 bars).
   Small drift is fixable in the edit; a different tempo is not.
4. **The chant post-hook must be crowd-singable** — simple "oh" vowels, no melisma.

## Section → energy map (for checking a generated take)

| Time | Section | Energy 1–10 |
|---|---|---|
| 0:00–0:08 | Whisper cold open | 2 |
| 0:08–0:24 | Verse 1 | 3 |
| 0:24–0:32 | Pre-chorus (riser) | 5 |
| 0:32–0:48 | Chorus 1 | 8 |
| 0:48–0:56 | Chant post-hook | 8 |
| 0:56–1:12 | Verse 2 (trap switch) | 4 |
| 1:12–1:20 | Pre-chorus 2 (spoken, defiant) | 6 |
| 1:20–1:36 | Chorus 2 | 9 |
| 1:36–1:44 | Chant post-hook 2 | 9 |
| 1:44–2:00 | Bridge (piano, half-time) | 2 |
| 2:00–2:16 | Drop / dance break | 10 |
| 2:16–2:48 | Final double chorus (key up) | 10 |
| 2:48–3:00 | Whisper outro | 2 |
