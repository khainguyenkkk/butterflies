# v3 — what changed from v2's audio

`v2` ([CLAUDE.md](CLAUDE.md)) added three fixed things: background music, a winner one-shot,
and three of the 26 butterflies each carrying a static positional loop. This folder is a
copy of `v2` with the three spatial loops made louder, more clearly spatial, and alive, plus
two new one-shots (`pickup` on a catch, `swoosh` on a miss) — requested changes only.
Background music and the winner sound are untouched.

Everything below lives in [js/config.js](js/config.js) and [js/audio.js](js/audio.js), with
one call each added to [js/keyboard.js](js/keyboard.js) (`capture()`) and
[js/interact.js](js/interact.js) (`tick()`) to trigger `pickup`/`swoosh` — see §1b.

## 1. Base volume

`CFG.audioBflyVolume`: **0.55 → 0.5 → 1.0** (two passes: first set to 0.5 as the anchor the
new volume wander swings around, then doubled again on request).

This is the level the volume wander (#3) swings around, not a flat level — the loops spend
part of their time above it and part below. At `1.0` the wander's peak
(`audioBflyVolModMax` = 1.5) reaches **1.5**, past unity gain. Web Audio does not clamp a
`GainNode` at 1.0 the way a physical amp would — it will pass the signal through amplified,
which **can clip/distort** on source material that already peaks close to full scale,
audible as harshness right at the loudest wander moments rather than a clean "louder". If
that shows up, the fix is either pulling `audioBflyVolume` back down a bit or capping
`audioBflyVolModMax` nearer `1.0` — both are one-line changes here, and I didn't make that
call unilaterally since "louder" was the explicit ask.

## 1b. Two new one-shots: pickup and swoosh

Two clips dropped into `sounds/` (`pickup.mp3`, `swoosh.ogg`) are now wired up as
non-positional one-shots — feedback on the visitor's own action, not something happening at
a point in the room, same reasoning as the winner sound:

- **`pickup`** — `keyboard.js:capture()` calls `SFX.playPickup()` the instant a butterfly is
  actually caught. `capture()` is the single place both a real pinch/click *and* the
  letter-key desktop testing convenience (`catchLetter()`) funnel through, so both trigger
  it identically.
- **`swoosh`** — `interact.js:tick()` calls `SFX.playSwoosh()` when a pinch/click's rising
  edge fires and *nothing at all* was picked (not even rescued by the grace window) — a
  press into empty air, distinct from a near-miss that still lands on a butterfly.

Neither loops and neither wanders over time the way the spatial butterflies do — there's
nothing to wander, each is a single hit-and-done clip. Instead, **every individual play**
draws a fresh random pitch (`setPlaybackRate`, speed+pitch together, same reasoning as the
spatial loops) and volume from a range, via `audio.js:playOneShot()`:

```
audioPickupVolMin / Max:  0.5  – 0.9
audioPickupRateMin / Max: 0.85 – 1.25
audioSwooshVolMin / Max:  0.35 – 0.7    // quieter band -- a miss reads as secondary
audioSwooshRateMin / Max: 0.85 – 1.25
```

So catching five letters in a row doesn't sound like the same sample five times. Each play
also gets its **own** `THREE.Audio` node (unlike `winner`, which reuses one node and
stops/restarts it) — two letters caught in the same frame, one per hand, need two audible
hits, not the second cutting the first off, and a shared node would also force both onto the
same random pitch.

## 2. Spatial falloff — louder near the centre, quieter far away

The swarm's three sound-carrying butterflies orbit at `CFG.radMin`..`radMax` = 1.0–2.4 m
(so roughly 1.0–2.6 m from the listener including height). v2's falloff numbers technically
implemented "closer = louder" but barely — worked out by hand, they only swung the gain
from about **0.97** at the near edge of the orbit to **0.53** at the far edge. That's a
17-percentage-point range at the quiet end and barely any at the loud end, which is why it
didn't read as a real difference.

| | `audioRefDistance` | `audioMaxDistance` | `audioRolloff` | gain @ 1.0 m | gain @ 2.6 m |
|---|---|---|---|---|---|
| v2 | 0.9 | 6.0 | 1.4 | 0.97 | 0.53 |
| v3 | 0.7 | 5.0 | 1.8 | 0.87 | 0.21 |

(Linear distance model: `gain = 1 - rolloff * (distance - refDistance) / (maxDistance - refDistance)`,
clamped to `[0, 1]`.)

v3 pulls `refDistance` in and steepens `rolloff` so the same orbit now swings gain from
~0.87 down to ~0.21 — a butterfly at the near edge of its own orbit is roughly **4× louder**
than one at the far edge, instead of ~1.8×. This is the browser's own Web Audio panner doing
the falloff (`setDistanceModel('linear')` + the three numbers above) — nothing new was added
to compute it; v3 only re-tuned the three inputs.

This composes with the *volume wander* below rather than fighting it: distance falloff is
applied by the native `PannerNode`, wander is applied via `.setVolume()` on a separate gain
stage earlier in the chain — see the comment above `updateLoops()` in `audio.js`.

## 3. Tempo wander and volume wander

Each of the 3 spatial loops now independently drifts its own **playback rate** (speed +
pitch together — Web Audio has no separate tempo control on a raw buffer source, so
speeding one up is the same as physically speeding up a recording) and its own **volume
multiplier**, both as a smoothed random walk rather than a fixed cycle:

- Every `CFG.audioBflyModPeriodMin`–`Max` seconds (1.2–3.2 s), each parameter draws a fresh
  random target inside its range.
- It eases toward that target with time constant `CFG.audioBflyModTau` (0.6 s) — the same
  exponential-smoothing idiom `interact.js` already uses for aim smoothing
  (`CFG.aimSmoothTau`), reused here.
- The three loops are seeded to different starting phases so they don't move in lockstep,
  and each loop's *own* rate wander and volume wander are offset from each other too, so a
  single butterfly doesn't speed up and get louder on the same beat every time.

Ranges (all in `config.js`, all one place to retune):

```
audioBflyRateMin / Max:      0.72 – 1.35   // playback rate (speed + pitch)
audioBflyVolModMin / Max:    0.55 – 1.5    // multiplies audioBflyVolume
audioBflyModPeriodMin / Max: 1.2 – 3.2 s   // how often a new target is drawn
audioBflyModTau:             0.6 s         // how briskly it eases toward it
```

A fixed sine LFO was considered and rejected: on three sources it becomes audibly
periodic — the ear catches the repeat within a few cycles, especially once two loops
happen to land in phase. Redrawing the target on an irregular timer means the motion never
repeats on a fixed period.

**Where this lives:** `SFX` in `audio.js` is a plain module, not an A-Frame component, so it
had nothing that ran every frame. v3 adds a one-line component, `sfx-tick`, registered onto
`<a-scene>` from `SFX.init()` itself (`sceneEl.setAttribute('sfx-tick', '')`) rather than
declared in `index.html` — so the markup is unchanged and `audio.js` stays the only file this
feature touches, matching v2's own "one new file" framing.

**Debugging:** open the browser console and call `SFX._debugLoops()` — returns each spatial
loop's live `rate` and `volume`, useful for confirming the wander is actually moving and that
the three loops are out of phase.

## 4. Spatial panning — already implemented, one real-world caveat

`panningModel: 'HRTF'` was already set correctly in v2 (three.js's own `PositionalAudio`
constructor defaults to it, and v2's code set it again explicitly) — a butterfly to your
left plays louder/earlier in the left ear and vice versa, computed by the browser, not by
this codebase. Nothing here was broken; **this is a listening-setup issue, not a code
issue**:

- **HRTF binaural cues are built for headphones.** Over a laptop's built-in speakers, the
  left/right difference is real but much subtler — the ears pick up both speakers'
  crosstalk, which is exactly what HRTF processing is trying to simulate in the first place.
  Test with headphones on to hear the intended effect.
- The 3 sound-carrying butterflies are chosen at random from the 26 each session
  (`keyboard.js:buildKeys()` shuffles the key indices), so which physical letters carry
  sound — and where they happen to be flying — changes every reload. If a loop happens to be
  parked near dead centre, it won't have much to pan.
- The louder base volume (#1) and the steeper distance falloff (#2) both make the panning
  easier to notice in practice, since the loop itself is more prominent against the
  background music.

No code change was needed here beyond what #1/#2/#3 already do to make the loops more
prominent; if it's still hard to hear, the fastest check is `SFX._debugLoops()` in the
console to confirm the loops are attached and playing, combined with headphones.

## Everything else

Background music and the winner sound are byte-for-byte what v2 shipped —
`audioBgVolume` (0.35) and `audioWinnerVolume` (0.9) are untouched.

**Debugging pickup/swoosh:** there's no `_debugLoops()`-style helper for these since they're
one-shots, not persistent state — trigger them directly from the console to test in
isolation without playing the piece: `SFX.playPickup()` / `SFX.playSwoosh()`.
