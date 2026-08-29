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

## Render pipeline (blocked on one thing: Higgsfield re-auth)

The Higgsfield connector session is expired; every step below is ready to run the moment it's
re-authorized (remove and re-add the connector if reconnecting alone doesn't trigger login).

1. **Song** — Higgsfield has no standalone music model (speech only), so generate the track from
   `music-spec.md` + `lyrics.md` in Suno/Udio (or supply any 3:00 track), then `media_upload` it.
2. **Character lock** — run the character-sheet workflow → one reference image of the VEIL dancer.
3. **Footage** — `generate_video_batch` the 23 storyboard shots (two batches of ≤12,
   `seedance_2_5` with the character reference; `kling3_0` for the marked crowd/multi-shot scenes),
   16:9, 8s each; `jobs_wait` → one `show_generation_by_ids`.
4. **Edit** — video-editing (higgsedit) workflow in `sandbox_exec`: assemble on the 120 BPM beat
   grid per `storyboard.md`'s sync rules, marry the track, render the 3:00 MP4.
5. **Finish** — `upscale_video` the master to 4K; `reframe` shots 5, 7, 17–19 to 9:16 cutdowns.
6. **Optional** — `virality_predictor` on the master and each cutdown before anything ships.
