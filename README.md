# v9.2 — the wave, three cards, the showcase dims the room

A third pass. Everything in the v9.1 and v9 notes below still stands.

---

## 1. A new gesture: wave, and a gust goes through the flock

New file [js/wave.js](js/wave.js). Sweep a hand quickly and the butterflies near it are
pushed **along the direction of the sweep**.

This is a second, separate force from the scatter the piece already had. They are different
gestures and read differently: the old scatter pushes butterflies *away from* a fast hand
("something moved past me"), the wave pushes them *along* it ("a gust came through").

| requirement | how |
|---|---|
| directional | the push follows the hand's velocity vector, not the hand→butterfly line. `readSources` now records the vector, not just the speed |
| **spatially localized** | hard cutoff at `waveRadius` (1.25 m) with a squared falloff. Measured: 4.92 → 2.27 → 0.64 → 0.07 → **exactly 0** at the rim, and nothing at all beyond it |
| doesn't move the whole flock | measured over a 0.6 s sweep, the 7 butterflies inside the radius took a mean offset of **0.245 m** against **0.069 m** for the 19 outside — and that 0.069 is their ordinary flight, not the wave |
| fluid, not rigid | curl-style noise sampled at each butterfly's own position rotates the push per-butterfly and adds a perpendicular vortex term. Neighbours 20 cm apart come out **2–17° apart** in direction, so the group shears and swirls instead of sliding as a slab |
| returns to normal | the module only ever *adds* velocity; the existing damping and spring-back to the flight path do the rest. Measured: max offset settles to **0.032 m** after the waving stops |

Two things it deliberately refuses:

- **A slow hand does nothing.** Below `waveMinSpeed` there is no gust at all, so reaching for
  a butterfly still works — the same reason the old scatter has a speed threshold.
- **The head never waves.** The camera is in the repulsor list too, and without the
  `isCamera` guard a visitor simply turning to look at something would blow the flock across
  the room. Verified: a head at 3 m/s produces zero gusts.

Born butterflies get their own `waveOff`/`waveVel` pair, because their position comes
straight out of `orbitAt()` every frame and they had nowhere to put a displacement. A
butterfly mid-**showcase** is exempt — those two seconds are the one moment it must hold
perfectly still.

`hash3`/`smooth3` are integer bit-mixing rather than the sin-fract trick, for the reason
`wing-paint.js` records: this runs per butterfly per gust per frame.

---

## 2. Three cards now, stacked, once per visitor

- **Point** waits **5 s** after the green press (was 3), which clears the birth completely.
- **Wave** — "Waving to see their harmony." — is new, and docks **under** the point card.
- **Pinch** is unchanged and still has no delay: it chains straight off the greeting.

**Chained, not timed.** The wave card fires when the point card finishes docking, rather than
on its own delay. Two cards on independent timers would eventually overlap in the middle of
the view; chaining makes that structurally impossible however the timings are retuned.
Measured: point arrives at 5 s → docks to slot 0 at ~7 s → wave arrives → docks to slot 1.

**One mesh per card.** v9.1 reused a single mesh, which was fine while only one card could be
on screen. Two docked at once needs two, so each card owns its mesh, canvas and texture, and
docked cards take stacking slots down the right-hand side in arrival order. Measured NDC:
point at **(0.70, 0.66)**, wave at **(0.70, 0.44)** — same column, wave below.

**Once per visitor.** `shownOnce` blocks repeats — the green control can be pressed several
times in one visit — and `resetVisitor()` clears it when welcome.js detects a new wearer,
which also un-docks the previous person's cards from the camera. Verified: a second green
press in the same visit does nothing; a new wearer clears `shownOnce`, empties the slots, and
hides both meshes.

---

## 3. The showcase dims the room and enlarges the name

While a newborn presents itself, everything else stands down and its name is struck large.
The point is contrast: for those two seconds the butterfly and the word it was made from are
the only things that matter.

**"Keep the same value of light for name and butterfly"** — so neither is touched. What
changes is the world around them. Measured during a showcase:

| | before | during |
|---|---|---|
| swarm wing opacity | 1.000 | **0.304** |
| born butterfly wing opacity | 1.000 | **1.000** (untouched) |
| name label opacity | 0.920 | **0.920** (untouched) |
| name label size | — | **2.35×** |

`Born.dim` is published on the singleton and *read* by keyboard.js rather than pushed into
it, so keyboard.js still knows nothing about butterflies being born — the separation born.js
exists to keep. It eases in both directions; a room dropping to 30% in one frame reads as a
fault rather than as attention moving.

The dim multiplies what is **drawn**, never `k.alpha` itself — folding it into the eased state
would make the swarm fade back in from wherever the dim left it, and the capture animations
read `alpha` to decide what they are doing.

**The flowers needed a different mechanism, and two wrong ones were tried first.** They are
opaque geometry sharing one material that `setColor()` rewrites on every state change, so
writing a dimmed colour straight onto the material is overwritten by the next
`refreshPanel()`, and reading the material back to dim it again compounds the dim every
frame. `ui.js:blob` now *remembers* its state colour and `setDim()` re-derives from it —
walking saturation down and lightness up toward the sky, so the petals recede instead of
going dark. Darkening them would have made them **more** contrasty against a light room, not
less.

The sky dims too, at `bornDimSky` (0.55) of the swarm's amount — a white room going to
near-black is a stage blackout, and this should read as attention narrowing. In an AR session
the sky is hidden and the real room shows through; a passthrough feed cannot be dimmed, so
the swarm/name fade is what carries the effect in the headset.

---

## 4. Type: letters rise, and every outline is gone

- **Each letter now animates its Y position** as well as its opacity, riding the same eased
  ramp — it lifts `welcomeLetterRise` (26 px) into its line as it fades up, then stops dead on
  the layout the fixed frame was built from. The *position* is animated, never the layout, so
  nothing reflows.
- **The white outline is removed** from the welcome paragraph and from all three tutorial
  cards. It was there to keep dark ink legible against an unknown passthrough wall, but
  against the white sky it read as a halo stuck around every glyph and fought Kavoon. Plain
  ink now, matching the flat rule the rest of the piece follows.

---

## Files changed in v9.2

| file | change |
|---|---|
| `js/wave.js` | **new** — the gust field, its falloff and its curl noise |
| `js/tutorial.js` | rewritten around per-card meshes; stacking slots, `shownOnce`, `resetVisitor()`, chaining, no outline |
| `js/keyboard.js` | velocity vectors in `readSources`, the wave force in `tickKey`, `dimFactor()` applied to swarm/letters/name/flowers/sky |
| `js/born.js` | `Born.dim`, `waveOff`/`waveVel`, the enlarged showcase label |
| `js/welcome.js` | per-letter Y rise, outline removed, `resetVisitor()` on a new wearer |
| `js/ui.js` | `blob` remembers its state colour and gains `setDim()` |
| `js/config.js` | the `wave*` block, `bornDim*`, `bornShowcaseLabel`, `welcomeLetterRise`, `tutorialStackGap`, point delay 3 → 5 |
| `index.html` | `wave.js` script tag |

---
---

# v9.1 — Kavoon, letter-by-letter, tutorial cards, glow, ten voices

A second pass over `v9`. Everything in the v9 notes below still stands; this is what
changed on top of it.

---

## 0. A second silent bug, found on the way in

`interact.js:keyboard()` will only cache the keyboard component once `c.initialized` is
truthy, and `pointer-input.tick()` returns on its first line until it has. **Nothing in `v8`
ever assigned `initialized`** — not in `keyboard.js`, not anywhere in `js/`.

So the entire `pointer-input` component was inert: no hover highlight, no pinch or click
activation, and no aim foci published for `born.js`. The only thing that still worked was
`keyboard.js`'s own `keydown` handler, which is why typing on a physical keyboard behaved
normally and hid it.

It is set now (in the `Type.ready` callback, §2). Verified by aiming the real mouse ray at a
live butterfly and clicking through `pointer-input.tick()`: `typed` went `"" → "A"` with
`hover` resolving to `key0`.

---

## 1. The type is Kavoon, and it arrives letter by letter

### The typeface

The whole piece is now set in **Kavoon**, pulled from Google Fonts, replacing the Helvetica
Neue / Roboto stack. That reverses a rule CLAUDE.md had held since v4 — *"nothing is fetched,
no font asset, no network on the critical path"* — so the reason it was a rule is now a live
problem, and [js/type.js](js/type.js) exists to deal with it.

**The trap.** Canvas draws with whatever font is resolved at the instant `fillText` runs. If
the webfont has not landed the browser does not wait, does not warn, and does not redraw
later: it substitutes the fallback, bakes those glyphs into the bitmap, uploads it as a
texture, and that is what the visitor sees for the rest of the session. It is worse here than
in ordinary DOM work because *every* piece of type in this scene is a canvas drawn once and
cached — the 26 letters, the caught name, the greeting, the tutorial cards.

`Type.ready(cb)` resolves only when the face is genuinely available, and everything that
draws a glyph goes through it — including `keyboard.js:buildKeys()`, which is why
`initialized` moved into that callback and incidentally fixed §0.

`document.fonts.load()` is the call that matters; waiting on `document.fonts.ready` alone is
not enough, since a face nothing has asked for may simply not be in the set and `ready`
resolves happily without it. There is also a 4 s backstop — an exhibition machine behind a
captive-portal wifi can leave a font fetch pending forever, and a piece that never draws its
type is worse than one drawing it in Georgia.

**Verified**: `document.fonts.check('400 60px "Kavoon"')` true, and canvas measures the same
string at 267.5 px in Kavoon against 225.1 px in the fallback — genuinely the real face.

### Letter by letter, with easing

Was: one word at a time, hard on/off. Now: every character fades up on its own **easeInOut**
ramp (`smoothstep`, the piece's own easing), staggered by reading position, with each letter's
fade several times longer than the stagger — so what travels along the line is a soft wave
rather than characters snapping on one at a time.

**The frame is fixed.** v9.0 wrapped only the words revealed *so far* and re-centred the
block on every redraw, so the paragraph re-wrapped and jumped up the frame every time a new
line began. `layout()` now solves every glyph's position **once, from the complete string**,
before anything is revealed; the reveal afterwards only changes per-letter alpha. Nothing
moves, reflows, or changes size. (This is also why layout must wait for the font: `measureText`
against a fallback lays out to the wrong widths, and since it runs once the wrap would be
wrong for the whole session.)

169 revealable glyphs across the 16.5 s voice. Measured mid-reveal: a clean gradient of
`1.0 → 0.344 → 0` running through the text.

---

## 2. Tutorial cards — pinch, then point

Two prompts, each an icon beside one line, from the new `icons/` folder.

|  | shown when | text |
|---|---|---|
| **pinch** | the greeting finishes fading out | "Pinch finger to catch" |
| **point** | **3 s after** the green control is pressed | "Pointing index finger to see generated butterflies." |

**The point card waits three seconds.** Pressing the green control is the loudest moment in
the piece — the winner sound fires, the flower bounces, and a butterfly bursts out of the
name — and a prompt landing on top of all that is one thing too many to read. The pause also
lands the card almost exactly where the birth finishes: burst (1.10) + rise (0.55) + showcase
hold (2.00) = 3.65 s, and the card takes `tutorialFadeSec` to come up, so it reaches full
opacity as the butterfly leaves for its orbit. The prompt to go looking for it arrives the
moment there is something to look for.

The delay lives in `Tutorial.show(which, delaySec)` rather than in a bare `setTimeout` at the
call site, so the queued card can be **cancelled** — and it has to be. Three seconds is easily
long enough in a queue for someone to accept their name and hand the headset straight on, and
their prompt would otherwise surface over the next person's greeting. `welcome.js` calls
`Tutorial.cancel()` on every new visitor. Verified: queued on accept, dropped when a greeting
fires 1 s into the delay, and nothing appears after the full 3 s.

CLAUDE.md's line that *"an instruction is a confession that the interaction did not carry
itself"* still governs the swarm. These are the same exception the flower marks already are:
neither of the piece's two real gestures is discoverable by looking, and a visitor could
finish a whole session without ever learning that pointing gathers what they made.

**The animation**: fade up big and centred (easeInOut) → hold **2 s** → shrink and travel to
the top right, eased → stay. Measured: arrive 0→0.55 s, hold 0.55→2.55 s at scale 1.3, dock
2.55→3.4 s easing 1.3→0.46, then `stay`.

**Docked means head-locked, and here that is right.** Everything else that follows the visitor
soft-follows, because hard-locking a large object to the face is a reliable way to cause
motion sickness. The docked card is the deliberate exception — the brief is exact, *"it will
follow and stay exactly on the same spot"* — and it is small, static and peripheral, which is
the case where head-locking is comfortable. It is achieved by **reparenting the mesh into the
camera**, so the scene graph holds it with no tick code at all.

Measured: docked at NDC **(0.70, 0.66)** — top right — and after turning the head 0.7 rad it
moved **exactly 0.00000** on screen.

**The dock position is derived from the projection, not from metres.** Fixed metre offsets
were the first attempt and do not survive leaving the desktop: how far 0.42 m to the right
lands on screen depends entirely on fov and aspect, so a card tuned for a browser window sat
near the middle of a Quest's much wider view. `dockOffset()` works back through the live
`fov`/`aspect` so "top right corner" means the same thing on every display.

The greeting **chains** into the pinch card as it fades, rather than firing on a timer started
at trigger time — so changing `welcomeSpeechSec` cannot desync them.

---

## 3. The showcase: closer, upright, and glowing

- **Closer**: `bornShowcaseDist` 1.05 → **0.72 m**.
- **Upright**: the body now stands vertical with the wings spread left and right, instead of
  lying across the view like a specimen pinned on its side.
- **Glow**: two soft haloes, tinted with the butterfly's own hue.

### Two bugs worth not rediscovering

**The upright turn has to come after the roll solve.** The first attempt passed it as the Z
component of the existing euler. With order `'XZY'` that composes as `Rx(roll)·Rz(upright)`,
so the quarter turn happens *first* and `presentRoll` — which assumed no such turn — then
rolls about an axis that has already moved. The butterfly came out diagonal. It is now a
quaternion **post-multiplied** about the butterfly-to-camera axis, which keeps the broadside
solve intact and spins only the image.

**Additive blending cannot glow on a white sky.** The obvious choice for a glow is
`AdditiveBlending`, and it is exactly wrong here: this piece's sky is deliberately **white**,
and nothing brightens white. The first version was perfectly, invisibly correct against every
background except the one the piece actually has. It is normal blending with the butterfly's
hue instead — a soft coloured aura that reads against a white sky *and* a dark passthrough
room.

**And the sprites were sized against the wrong number.** `bornGlowScale` multiplies
`bornSize * scale`, which is the model's scale *multiplier*, not its extent — the mesh
measures about half of it. Scales of 2.6 / 4.4 produced sprites **4.4 and 7.5 metres across**
on a butterfly 0.72 across, 70 cm from the visitor's face: the glow filled the entire view
with flat colour. They are 0.62 / 1.00, giving 0.83 m and 1.34 m against a 0.72 m butterfly.

Not a post-processing bloom: that needs an EffectComposer, a second render target and a
multi-tap blur every frame, which A-Frame has not got wired in here and which is a serious
per-frame cost on a Quest to light one object. Two billboarded sprites with a radial falloff
are what a bloom looks like from the front, for two quads and no render passes.

The glow stays out in flight at `bornGlowFlight` (0.45) — the born butterfly is the only lit
thing in the room and should read that way at orbit distance too, just not at presentation
strength.

---

## 4. Ten butterfly voices from three clips

`audioBflyCount` 3 → **10**. `doAttachButterflyLoop()` already maps the index through `% 3`,
so this simply spreads the same three variants around more of the swarm — ten sound sources
at ten points in the room rather than three. Each still carries its own independent
rate/volume wander, so ten copies of three clips never phase into an audible round.

Verified: `SFX._debugLoops()` reports 10 (11 with a born butterfly aloft).

---

## Files changed in v9.1

| file | change |
|---|---|
| `js/type.js` | **new** — the shared typeface and its load gate |
| `js/tutorial.js` | **new** — the two prompt cards, big → docked |
| `js/welcome.js` | fixed-frame layout, per-letter easeInOut reveal, chains into the pinch card |
| `js/born.js` | closer/upright showcase, the glow sprites and their disposal |
| `js/keyboard.js` | builds behind `Type.ready` (and sets `initialized`); fires the point card on accept |
| `js/ui.js` | `FONT` → `Type.family` |
| `js/config.js` | letter-fade and layout numbers, tutorial block, glow block, showcase distance/upright, `audioBflyCount` |
| `index.html` | Google Fonts links, `.kavoon-regular`, `type.js` + `tutorial.js`, `<a-entity tutorial-cards>` |

---
---

# v9 — the welcome, the showcase, softer pointing, wilder wings

A copy of `v8` with five changes. Nothing else was touched, and `v8/` is left alone.

Everything below is verified live in a browser rather than asserted — the numbers quoted are
measured, and where a measurement contradicted the plan it is written down as such.

---

## 0. A bug found while copying: the music and the winner sound were silent

`v8`'s `audio.js` pointed at `sounds/background-music.mp3` and `sounds/winner.mp3`. Neither
existed. The folder held a freshly-dropped **`background music.wav`** (with a space, 4.9 MB)
and **`winner.wav`** instead, so both clips 404'd.

This failed **silently**, which is why it survived: `loadAll()` catches a per-clip load error,
warns once, and lets the other clips through. The piece simply ran with no music and no
winner sound, and nothing said so.

Both were re-encoded to the filenames the code already expected, along with `redbutton.wav`:

| file | was | now |
|---|---|---|
| `background music.wav` → `background-music.mp3` | 4.9 MB PCM | 442 KB |
| `winner.wav` → `winner.mp3` | 1.2 MB 24-bit | 85 KB |
| `redbutton.wav` → `redbutton.mp3` | 40 KB | 4.5 KB |

**Total sounds payload: 6.6 MB → 1.23 MB.** The `.wav` originals were removed from `v9`.

---

## 1. The red control has a sound

`redbutton.mp3` fires from `keyboard.js:activate()`'s `delete` branch, beside the existing
`bump('delete')` — the counterpart to the green control's `winner`.

Fired on the **press** rather than inside `backspace()`. In practice the two are identical:
`targets()` only offers the two controls once something has been typed, so the red flower
cannot be pressed with nothing to take.

It reuses the `playOneShot()` path that `pickup`/`swoosh` use, but with a deliberately
**narrow** random band (`audioRedVolMin/Max` 0.55–0.75, rate 0.96–1.05). Wide pitch scatter
suits a creature; a control surface whose pitch visibly wanders press-to-press reads as
broken.

**Verified** by spying on every `THREE.Audio.play()` and identifying the buffer by duration:

```
typing two letters  ->  pickup, pickup
red control         ->  redbutton          (and the letter is removed)
green control       ->  winner (flat) + a spatial butterfly loop for the newborn
```

---

## 2. The welcome — a new wearer is greeted

**The premise.** The installation is a queue: a visitor is not a session, it is a stretch of
one long session between two headset removals. Nothing in `v8` noticed that happening.

All of it lives in one new file, [js/welcome.js](js/welcome.js).

### Detecting a new wearer

There is no "headset taken off" event. Three signals are layered:

| signal | catches |
|---|---|
| `enter-vr` | the first person of a session, and re-attaches the listener below |
| `XRSession` `visibilitychange` | **the real one** — lifting a Quest off the face drives `visibilityState` away from `visible`; seating it back returns it |
| a `W` keypress, plus one greeting on load outside XR | desktop testing, where neither of the above ever fires |

**The debounce is the whole difficulty.** `visibilitychange` also fires for things that are
not a new person — the Quest's own system menu blurs the session for about a second. Greeting
somebody mid-visit, and resetting the name they were halfway through spelling, is a far worse
failure than never greeting at all. So a return to `visible` only counts as a new person if
the session was away for at least `CFG.welcomeAwaySec` (6 s), with a 20 s cooldown on top.

**Verified** by driving the visibility transitions directly:

```
1 s blink        -> does NOT greet     ✓
10 s absence     -> greets             ✓
inside cooldown  -> does NOT greet     ✓
```

### What happens

`Voice.mp3` plays (one reused node, so two fast swaps can never talk over each other), the
type builds itself word by word, and **the keyboard is reset** — verified: `typed` went
`"LEFTOVER"` → `""`.

**Butterflies other people made keep flying.** They are the only thing the piece accumulates,
and a new visitor arriving into a room already full of strangers' butterflies is the
exhibition working.

### The type

**In the scene, not the DOM** — a `<div>` over the canvas is invisible inside an immersive XR
session, which is the exact moment this needs to be readable. So: a canvas-textured plane.

**A plane, not a sprite**, which inverts `ui.js`'s choice for every other piece of type here.
Sprites billboard, which is right for a letter thrown under a butterfly and wrong when the
orientation *is* the point. (`iconPlate()` reached the same conclusion for the flower marks.)

**Soft-follow, not head-lock.** It eases toward a point in front of wherever the visitor is
looking (`welcomeFollowTau`). Hard-locking type to the face for 16 s is a reliable way to
make someone motion-sick, and this piece already carries one motion-sickness note from the
exhibition floor.

**Word pacing**: 34 words across `welcomeSpeechSec` 16.5 — the measured length of `Voice.mp3`
— so the last word lands as the voice ends. The canvas is redrawn once per word (~34 times),
never per frame. Verified: all 34 words shown at t=16.0 s, fully faded out and hidden by
t≈20 s.

> If the voice is ever re-recorded, `welcomeSpeechSec` is the one number to re-measure.

---

## 3. The born butterfly stops and shows itself — a new `showcase` state

**The problem.** Through `v8` the sequence was `burst → out`, and a newborn was past the
visitor and out at 3.2–4.5 m within about a second. The wing it had just spent ~100 ms
painting — the single textured object in a room of flat ink silhouettes, and the entire
reason anyone stood there spelling their name — was never actually looked at.

So the state machine is now `burst → **showcase** → out → orbit → leaving`. It climbs to a
point ~1.05 m in front of the face, **stops dead for 2 s**, and beats its wings slowly.

- **The anchor is frozen on entry**, not tracked. "Not moving in position" is the brief, and
  a point that chases the head never holds still.
- **A slow beat** (`bornShowcaseFlapSpeed` 2.2 rad/s against the 15–22 it cruises at). The
  wings must still move — a motionless butterfly is a specimen pinned in a case — but at
  cruising rate the wing is a blur and the markings are unreadable, defeating the point.
- **Not grabbable**: `updateAttraction()` now skips `showcase` as well as `burst`/`leaving`.
- Scale eases to `bornShowcaseScale` 1.15 and back down through `out`, so no pop.

**Verified**: `burst` 0→1.10 s, `showcase` 1.10→3.65 s, then `out`. During the hold, **119
consecutive frames with a maximum drift of exactly 0** — properly still, not nearly still.
Position `(0, 1.65, −1.05)` against a camera at `(0, 1.6, 0)`: exactly `bornShowcaseDist`.
Pointing at it with a fast hand throughout produced `pull = 0`.

### The bug this state hit, worth not rediscovering

**The showcase needs its own orientation branch, and the roll convention is inverted.**

Two separate traps, both of which made the butterfly invisible:

1. All the heading/banking code is gated on `hSpeed > 1e-6`, because heading is derived from
   movement. A butterfly holding perfectly still has none, so it fell straight through and
   kept whatever orientation the burst left it in.
2. `presentRoll()` solves for `want = PI/2 - roll`, and wing visibility goes as `|cos(want)|`.
   So a roll near **zero** gives `want` near `PI/2`, whose cosine is ~0 — the wing turns
   **edge-on**, and a flat plane seen edge-on renders as literally nothing. The first version
   set `bornShowcaseRoll` to `0.12` reasoning "flat = broadside", and the butterfly vanished
   mid-showcase. It is `1.50` (near `PI/2`), where `want ≈ 0` and the wing is fully presented.

---

## 4. Pointing: soft, weak, and genuinely zero at distance

`v8`'s gather worked but read as frantic: it snapped on, whipped when the hand moved, and
dragged butterflies right across the room.

| brief | change |
|---|---|
| far butterflies get **zero** influence | `pointNearFloor` 0.30 → **0**, and `want` is now distance-faded instead of hard-coded `1` |
| "move a bit toward", not strict follow | new `pointMaxPull` 0.55 caps the gather — the swarm leans, it never commits |
| don't fly wildly around the point | `pointGatherRadius` 0.85 → 1.70 m; `pointOrbitRate` 0.55 → 0.25 |
| reduce force and speed | `pointEaseMin` 1.30 → 0.50, `pointEaseMax` 3.00 → 1.10, `pointSpeedGain` 0.55 → 0.20, `pointCentreMaxSpeed` 2.2 → 0.90 |
| soft blend both ways | `pointReleaseTau` 1.30 → 2.20, **and** pull is read through `smoothstep()` at the point of use |
| a small overshoot | the orbit centre is now a **spring**, not a lerp |

**Why the S-curve is what actually fixed the feel.** `pull` is an exponential ease, which
starts at its steepest and decays — so the instant a point begins, the response is moving as
fast as it ever will. That first instant is what read as "crazy fast when I start pointing and
stop pointing". `smoothstep` has zero gradient at *both* ends, so the transition eases into
and out of both states instead of cornering into them.

**Why a spring.** A lerp only ever approaches from one side and can never overshoot, however
it is tuned — the same observation `CFG.ctlSpring` makes about the control bounce, and the
same fix.

### Exactly zero, measured

Butterflies pinned at known distances from a fixed aim point, driven for 4 s:

| distance | pull | centre offset |
|---|---|---|
| 0.5 m | 0.485 | 3.59 m |
| 2.0 m | 0.394 | 3.59 m |
| 4.0 m | 0.186 | 3.57 m |
| 6.0 m | 0.025 | 3.46 m |
| **9.0 m** (past `pointFalloff` 8.0) | **0** | **0** |

Centre speed peaked at exactly 0.900 m/s — the cap, clamping correctly. Overshoot confirmed
present. On release, pull reaches **exact** zero at 8.7 s and the centre at 9.7 s.

### Two bugs found while verifying this

- **The damping term vanished with the stiffness.** Spring damping is `2ζ√k`, which goes to
  zero as `k` does — and a butterfly past `pointFalloff` has `k` of exactly 0. Any velocity it
  was carrying would never decay and its orbit centre would coast away across the room
  forever, with no force left to bring it back. There is now a floor inside the damping term.
  It is `0.25`, not `1.0`: at `1.0` a soft release came out heavily over-damped and crawled.
- **The centre needed a far more generous snap threshold than the pull.** `orbitAt()` adds
  `b.centre` to the position **without** scaling it by pull, so a butterfly whose pull has
  reached a clean zero but whose centre is still off-origin is *still flying a displaced
  orbit*. Measured sitting at **0.116 m thirty seconds after release** with the hairline
  threshold this started with. `pointCentreSnap` is 6 cm — invisible on a butterfly 4 m away,
  and it actually arrives.

---

## 5. Wing texture: real variety, not one pattern re-tinted

**The diagnosis was exact.** Through `v8` this file drew the same six layers with the same
`CFG` **constants** for every butterfly ever painted: 7 bands, 7 veins, 3 margin chevrons, one
frequency, one warp pair. The only things that changed from name to name were the hue, the
noise seed, and the eyespot count. Change the seed on a fixed structure and you get the same
creature with its blotches moved — which is precisely what it looked like.

Three changes, all drawn from the PRNG this file **already** seeds off the name:

**(a) Every structural constant became a range.** Bands 4–12, frequency 2.0–6.5, octaves 4–6,
warp depths, vein count **0–11** (zero is a real draw — plenty of species show no venation),
vein width/darkness, margin bands 0–6, eyespots **0–4** with a size band, shimmer. The old
fixed values sit inside each range, so `v8`'s wing is still one of the possible draws.

**(b) Five palette schemes** — analogous (v8's), complementary, triadic, split-complementary,
and a high-contrast dark/pale — plus a varying number of ramp stops. Previously every wing had
the same internal colour *logic* even when the hue differed.

**(c) Seven optional pattern layers**, 2–4 chosen per name: transverse **stripes**, an
**apical patch**, a checkered **fringe**, a **spot field**, radial **streaks**,
**reticulation**, and **blotches**. This is what does the real work — (a) varies the degree of
one pattern, (c) changes which patterns are present, and they combine multiplicatively.

Layers are drawn **before** margin/veins/eyespots: these are field-scale markings and belong
under the anatomical structure. Veins over stripes read as a wing; stripes over veins read as
a wing with a sticker on it.

**Determinism is preserved**, and it is load-bearing — CLAUDE.md's "the name is the save file"
rests on it. Verified: `ANNA` painted twice is **pixel-identical**; `ANNA` vs `ANNE` differ in
75% of sampled pixels.

> One ordering constraint: `speciesFor(r)` must stay **after** `paletteFor(h0, r)`. Both pull
> from the same PRNG stream in sequence, so swapping them would silently change every existing
> name's butterfly.

### Cost

The budget was to stay near `v8`'s ~99 ms. Measured across 12 names: **37.8 ms average, 55.7
ms worst** — *below* `v8`, because frequency and octaves now vary downward as often as up. The
two layers that need noise per pixel (reticulation, blotches) reuse the same half-resolution
`fieldAt`/`sampleField` trick `paintBase` uses; without it each would have cost roughly what
the base field costs and doubled a paint.

`born.js` now logs what it drew, not just how long it took — the instrument this is verified
with:

```
[born] "GRACE" wing painted in 41.2 ms (1 aloft)
       [complementary | bands 11 | veins 10 | margin 5 | eyes 2 | freq 2.7 | stripes+fringe+apical]
```

Twelve names, all structurally distinct:

```
ANNA     triadic       bands=6  veins=0  eyes=4  [spots+apical+retic+fringe]
ANNE     split         bands=4  veins=1  eyes=0  [blotch+apical]
BOB      complementary bands=11 veins=0  eyes=2  [retic+streaks+blotch]
CHARLIE  triadic       bands=7  veins=8  eyes=2  [streaks+blotch+fringe]
DIYA     contrast      bands=4  veins=10 eyes=0  [retic+spots+streaks]
EMMA     contrast      bands=7  veins=5  eyes=3  [apical+blotch+fringe+spots]
FRANK    split         bands=9  veins=10 eyes=3  [apical+streaks+blotch+spots]
GRACE    complementary bands=11 veins=10 eyes=2  [stripes+fringe+apical]
HIRO     triadic       bands=7  veins=0  eyes=2  [retic+streaks+fringe+stripes]
IVAN     split         bands=9  veins=6  eyes=0  [fringe+spots+streaks]
JULIA    split         bands=12 veins=2  eyes=1  [retic+stripes]
KAI      split         bands=10 veins=11 eyes=0  [stripes+apical+blotch]
```

---

## Files changed

| file | change |
|---|---|
| `js/config.js` | `audioRed*`, `audioVoice*`, the `welcome*` block, `bornShowcase*`, rewritten `point*`, and every `bornX` constant turned into a `Min`/`Max` range + the new layer knobs |
| `js/audio.js` | `redbutton` + `voice` clips, `playRedButton()`, `playVoice()`, `isVoicePlaying()`, pending/flush entries |
| `js/keyboard.js` | one line in `activate()`'s delete branch |
| `js/welcome.js` | **new** |
| `js/born.js` | the `showcase` state and its orientation branch; the rewritten pointing math and centre spring; a richer paint log |
| `js/wing-paint.js` | per-name species draw, palette schemes, seven new pattern layers |
| `index.html` | `welcome.js` script tag + `<a-entity welcome-text>` |
| `sounds/` | bg/winner/redbutton re-encoded to MP3; `.wav` originals removed |

---
---

# v3 — what changed from v2's audio  *(history)*

`v2` ([CLAUDE.md](CLAUDE.md)) added three fixed things: background music, a winner one-shot,
and three of the 26 butterflies each carrying a static positional loop. This folder is a
copy of `v2` with the three spatial loops made louder, more clearly spatial, and alive, plus
two new one-shots (`pickup` on a catch, `swoosh` on a miss), plus a ~68% cut to the total
audio payload (see §5) after the page was reported laggy on GitHub Pages — requested changes
only. Background music and the winner sound are otherwise untouched.

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

## 5. Load lag — the WAV files, not the piece

Reported: the page feels laggy when it's just been opened on GitHub Pages. It isn't the
scene rendering or the interaction — nothing in the visual piece fetches anything (see
`CLAUDE.md`, "no font asset, no network on the critical path"). It's the **audio payload**:
`v2`/`v3` originally shipped four of its seven clips as raw, uncompressed WAV, and two of
those four were far heavier than they needed to be for what they are:

| file | was | now | cut |
|---|---|---|---|
| `background-music.wav` → `.mp3` | 2ch/8bit/16kHz, 1832 KB | 96 kbps mp3, 705 KB | −62% |
| `winner.wav` → `.mp3` | 2ch/24bit/48kHz, 1209 KB | 160 kbps mp3, 85 KB | −93% |
| `butterfly1.wav` → `.mp3` | 1ch/16bit/44.1kHz, 249 KB | 128 kbps mp3, 46 KB | −81% |
| `butterfly2.wav` → `.mp3` | 1ch/16bit/44.1kHz, 83 KB | 128 kbps mp3, 16 KB | −80% |

`butterfly3.mp3`, `pickup.mp3`, and `swoosh.ogg` were already compressed formats and are
untouched. **Total audio payload: ~3.77 MB → ~1.19 MB (−68%)**, all in `sounds/`, referenced
only from the `CLIPS` map at the top of `audio.js` — nothing else changed to make this work.

`winner.wav` was the most oversized by far: 24-bit/48kHz stereo for a 4.3-second chime is
about 20× the bitrate a clean-sounding MP3 needs for the same clip — most of that original
1.2 MB was buying nothing audible.

The four old `.wav` files are still sitting in `sounds/` but nothing in the code references
them anymore (`CLIPS` in `audio.js` points at the `.mp3` versions) — a browser visiting the
page never fetches them, so they don't cost you anything at runtime. They're only there as a
same-folder backup of the originals; delete them before your next GitHub upload if you'd
rather not carry the extra ~3.3 MB in the repo.

**If it's still slow after this:** the other real lever is `audio.js:loadAll()` — it waits
for **all seven** clips to finish before anything (including background music) is allowed to
start, so on a slow connection even a quick `pickup`/`swoosh` test right after opening the
page can go silent for a moment while the heaviest clip (now background music, 705 KB)
finishes. That's a deliberate simplicity trade-off carried over from `v2`, not something this
pass changed — decoupling each sound's readiness from the others is a straightforward
follow-up if it's ever worth the added complexity, just not done here since the file-size cut
above is what was actually reported as slow.

## Everything else

Background music and the winner sound are byte-for-byte what v2 shipped (same volumes,
`audioBgVolume` 0.35 / `audioWinnerVolume` 0.9) other than the WAV→MP3 re-encode in §5, which
doesn't change how they sound at normal listening levels, only the download size.

**Debugging pickup/swoosh:** there's no `_debugLoops()`-style helper for these since they're
one-shots, not persistent state — trigger them directly from the console to test in
isolation without playing the piece: `SFX.playPickup()` / `SFX.playSwoosh()`.

**A wander seed bug, found and fixed while verifying all this:** the volume wander's
phase-offset formula for the third spatial loop (`(seed + 2) / 3` with `seed = 2`) evaluated
to `1.33`, outside its own `[0, 1)` range, which seeded that one loop's starting volume at
`1.82` — past even `audioBflyVolModMax` (1.5). Fixed to `((seed + 2) % 3) / 3` in
`audio.js:doAttachButterflyLoop()`. Caught by reading `SFX._debugLoops()` a second or two
after load and noticing one loop's volume was outside the configured range.
