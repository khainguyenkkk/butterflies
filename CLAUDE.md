# Butterfly Keyboard — v6.1

Catching butterflies is typing. Twenty-six butterflies circle the visitor, one per letter;
reach toward one, pinch, and its letter joins the name floating in front of you. A green
shape confirms, a red one takes a letter back, and the piece resets for the next person.

v4's typographic collage with everything explanatory taken out of it, and the two controls
given real weight. Still no dev panel, no DNA store and no generation stage — confirming a
name fires one event and stops.

**v6.1 is v6 (tested and working on the Quest) with selection made easier**, driven by
exhibition feedback: reaching out and pinching a specific butterfly was harder than it
should be, and the swarm's motion risked motion sickness. Nothing about the composition,
typography, or capture flow changed — see "Selection, made easier (v6.1)" below for what
did.

**Nothing is in the scene but butterflies and the two controls.** The scatter — the words on
their side, the rules, the giant letters, the alphabet ring — is deleted, not disabled.

**Nothing in the scene is a word or a rectangle.** No instructions, no captions, no keyline.
The only written thing left is the alphabet, set on its side. If reaching at a butterfly and
watching it light up does not carry the interaction, a sentence hanging in the air was never
going to.

## Layout

```
index.html          scene + script tags
js/
  rolltable.js      GENERATED — 180 baked uniforms  ]
  wing-gen.js       the generator                   ]  v2, unchanged.
  textures.js       body alpha, base64              ]  Parity with TouchDesigner
  wing-tex.js       dials -> a THREE texture        ]  is held in web/ — do not
  hands.js          usable data out of hand-tracking-controls
  config.js         every number the piece is built from
  style.js          the typographic decisions, made once per letter
  bfly-model.js     the mesh: one body plane, two wing planes on pivots
  ui.js             letter sprites, numerals, the name, the flower clusters,
                    the keyline and the type block
  keyboard.js       the swarm, the letters, capture, the name
  interact.js       reach / point / pinch -> highlight and activate
  audio.js          background music, the winner one-shot, the spatial loops
  noise.js          2D noise fields: fbm, ridged, domain warp, colour ramp
  wing-paint.js     a name -> a painted wing (the born butterfly's texture)
  born.js           the butterfly a name becomes: burst, flight, label, sound,
                    and (v8) gathering to the finger you point with
  app.js            what happens after the name is accepted (the seam)
tools/
  serve.py          static server
  serve-https.py    TLS server, for testing on a Quest
```

The parity harness lives in `web/tools/` and is not archived into a release — a snapshot
carries what it needs to RUN, not to be tested. `wing-gen.js` here is a copy; if it is ever
edited, edit it in `web/` and re-run the harness there first.

## Passthrough

`XRMode: xr` offers both buttons. **AR** keeps the room; **VR** is the black void. Three
things make AR work and all three are in `index.html`:

- `hide-on-enter-ar` on the `<a-sky>`, or the black sphere covers the camera feed;
- `ar-hit-test="enabled: false"` — A-Frame adds a floor placement reticle by default and
  this piece has no use for one;
- `webxr="optionalFeatures: hand-tracking, ..."` rather than leaving it to the browser to
  infer from the hand entities.

The sky is **white**, not black, so the desktop view and a lit passthrough room look like
the same piece. Nothing in the UI has a background to hide behind, so everything carries its
own contrast as flat ink: grey letters, a darker caption, and two saturated shapes.

## The interaction

Two ways to pick, in order:

| | |
|---|---|
| **touch** | the index fingertip is inside a butterfly's sphere — wins outright |
| **point** | otherwise, a ray from the index knuckle through the fingertip |

Most of the swarm is further away than an arm, so pointing is the normal case and touching
is the bonus. The ray tolerance is a **cone**, not a fixed radius (`CFG.pickBase` close in,
`CFG.pickAngle` opening with distance): a fixed radius makes a butterfly four metres away
almost unhittable, and one wide enough for those turns a near one into a blob.

**The controls win.** The two shapes are the only fixed things in the room and they sit
inside the swarm's orbit, so a butterfly drifting across the green one must not steal the
pick — the visitor would be unable to finish until it moved on.

Activation is the pinch **edge** with two thresholds (`pinchOn` / `pinchOff`). A single
distance chatters across the boundary and fires repeatedly.

Desktop: hover and click drive the same code path, and letter keys / Backspace / Enter work
as a testing convenience. The piece itself never needs a keyboard.

## Selection, made easier (v6.1)

The cone above is a fixed geometric budget, already tuned right up against a hard
ceiling — neighbours sit about 0.6 m apart, and slack much past a quarter of that turns
several of them into one unhittable blob, a regression already found and fixed once (see
`CFG.pickBase`/`pickAngle` further down). So v6.1 does not touch it. Instead it fixes the
three things that were actually making real hand tracking hard to select with, none of
them geometric:

- **The ray's own origin was the noise source.** v6 cast from the index knuckle through
  the fingertip — a ~3cm baseline, so a few millimetres of finger curl *while closing a
  pinch* swung the aim by tens of degrees: the single most common miss was being visibly
  on a butterfly right up until the frame the pinch committed. This is exactly what
  Meta's own hand-pointing model (the ray Quest's system UI casts) avoids, by anchoring
  the ray near the **shoulder** instead of the hand. There is no tracked shoulder joint,
  so `interact.js:shoulderOf()` estimates one each tick from the camera pose —
  `CFG.shoulderDown` below the headset, `CFG.shoulderOut` to the side along the camera's
  flattened (yaw-only) right axis, mirrored per hand — and the ray runs from there
  through the fingertip. A ~60-80cm baseline means the same finger curl swings the aim
  by a couple of degrees, often less than the pick cone's own slack. Measured directly:
  a realistic ~2.7cm pinch-close curl that puts the OLD knuckle-anchored math 0.70 m off
  axis against a 0.27 m tolerance (a clean miss) leaves the new shoulder-anchored ray
  still on target. The line drawn for the user still visually starts at the fingertip —
  only the invisible point used for picking moved.
- **Residual jitter.** `hands.js` deliberately publishes raw, unfiltered joint
  positions — that's correct, filtering belongs one layer up. `interact.js` keeps a
  per-hand exponential moving average of the fingertip the ray is aimed through
  (`CFG.aimSmoothTau`, in `tick()`), used for the ray pick only — touch stays on the raw
  fingertip (it's a deliberate close-range action, not the noisy long-range case), and
  the desktop mouse pointer has no jitter to smooth.
- **What the shoulder ray doesn't fully remove.** Activation only ever fired if a
  target was picked on the exact frame the pinch crossed its threshold.
  `interact.js` remembers each hand's last hot id and when (`lastHotId`/`lastHotAt`); a
  pinch's rising edge with nothing picked that exact frame still activates the
  remembered target if it was hot within `CFG.pickGraceMs`. **Butterflies only** — the
  two controls keep the exact old behaviour with no rescue, since a wrong accept/delete
  costs more than a missed letter, and they're fixed in place and easier to hit anyway.
  `keyboard.js:activate()` already re-validates a key's state before capturing, so a
  stale rescue (already captured by the other hand, mid-flight out) just silently
  no-ops.

**The line now literally connects.** It used to be a fixed-length segment gesturing along
the pointing direction; now, whenever something is picked, its endpoint is that target's
exact live position (not a projection along the ray — the shoulder anchor above means the
ray's own origin is no longer where the line is drawn from, so the endpoint is set
directly rather than derived from the ray math), so what you see is exactly what would
activate. It still visually starts at the fingertip, same dark, subtle ink (`0x12121a`),
same opacity behaviour — only the invisible picking origin moved. A successful catch also
gives the line a brief opacity flash (`CFG.flashTime`) that eases back down — pure
opacity on existing geometry, no new meshes, no glow, matching "Flat" below.

**A hot butterfly, and its neighbours, fly calmer.** Exhibition feedback flagged the
swarm's motion as a motion-sickness risk. Rather than slow the whole swarm at all times —
v6's cruising flight is already tuned and tested on-headset, and stays untouched —
`keyboard.js:updateSlowField()` eases a hot key's `timeScale` down to `CFG.slowHot`, and
eases nearby keys down too on a falloff (`CFG.slowRadius`), releasing back to 1 once
nothing is pointed there (`CFG.slowEase` controls how gradual both directions are — a
snap would be its own small motion-sickness risk). Each key carries its own accumulated
clock, `k.flightT`, incremented by `dt * k.timeScale` instead of tracking the scene clock
directly — this is what lets a slowed key's orbit, wobble noise, wingbeat, and glide/flap
burst cycle all calm down together, in `tickKey()`, rather than the body slowing while the
wings keep beating at full rate. At `timeScale` 1 (everywhere nothing is hot) `flightT`
tracks the scene clock exactly, so this is byte-for-byte v6's flight until something is
reached for. Hand-repulsion/scatter and the neighbour-separation spring are deliberately
**not** rescaled — both are `dt`-based physical reactions, and a slowed butterfly still
has to be able to react instantly if a hand brushes it, or it would read as stuck. This
also has a selection side-effect worth knowing: a target barely moving while hot is far
more forgiving of both the ray-jitter smoothing and the pinch's commit-frame perturbation
above, so the three fixes reinforce each other.

## Flat, and how to keep it flat

No blur, no bloom, no gradients, no soft glow anywhere. Every surface is one solid colour:
`MeshBasicMaterial` with an `alphaMap` and `alphaTest`, and canvases painted with flat
fills. If something needs to stand out it changes **colour or size**, never blurriness.

Two things this depends on:

- **Canvas textures must be tagged `SRGBColorSpace`.** three.js assumes no colour space on a
  `CanvasTexture`, so with A-Frame's colour management on it reads the bytes as linear and
  encodes them again on the way out. Every flat fill comes back a stop lighter and visibly
  desaturated — a solid red draws as pink, which is exactly what happened. `ui.js:srgb()`
  tags them. Only the **colour** canvases: the wing and body maps are alpha, read straight
  off a channel, and must stay unconverted.
- **The butterfly palette is tuned for white.** v2's `72% / 63%` was chosen against a black
  void and washes out completely against white; `CFG.bflySat` / `CFG.bflyLit` are `88 / 48`.

## The highlight is on the letter, not the butterfly

Recolouring the highlighted butterfly is the obvious move and is wrong twice over. Against
white the only colour with enough contrast to mean anything is black, which reads as
switched off rather than chosen; and in a dark passthrough room it disappears outright.

So a highlighted letter is **knocked out of a solid disc in its butterfly's own colour** and
grows by a third, and the butterfly grows by `CFG.hiScale` and keeps its colour — which is
the point of having twenty-six different ones.

Every letter carries its butterfly's colour: under the butterfly, in the highlight disc, and
in the name once it is caught, so the name in front of you is visibly made of the ones you
picked. The hue is the wing's, at full chroma but `CFG.letterLit` darker — a wing is a
silhouette and a letter is type, and type at the wing's own lightness is unreadable on white
for a good third of the wheel.

The type is Helvetica Neue with the usual grotesque fallbacks (Roboto on a Quest), at weight
500 and never heavier. Nothing is fetched — no font asset, no network on the critical path.
Letters sit close under the body, far enough to clear the hindwing and near enough that a
butterfly and its letter read as one object.

## The three traps this build hit

- **`this.name` on an A-Frame component unregisters its own `tick()`.** A-Frame keys its
  behaviour registry off `component.name`. Assigning to it drops the component out of the
  tick loop silently: everything builds, nothing animates, no error. The name being spelled
  is therefore `this.typed`.

- **A click is latched, not sampled.** A real mousedown/mouseup pair often lands inside one
  frame, so a tick that reads the button's *level* sees nothing. The press sets a flag the
  next tick consumes. The cursor is also read **on the press**, not only on the move, or a
  press with no preceding move is tested against screen centre.

- **`hand-tracking-controls` pins its entity to the origin** every frame — `js/hands.js`
  reads the joint matrices directly instead. This is v2's file unchanged; its own header
  has the details.

## The presentation roll — the one departure from v2's flight

The body is a side-on silhouette plane and the wings are a plane **perpendicular** to it, so
the two can never both face you: whenever the wings spread across your view the body is
edge-on. A butterfly orbiting at eye height is therefore seen exactly edge-on and reads as a
twig. Fine for v2's ambient swarm; useless for a keyboard you have to read.

Roll the model by `rho` about its own body axis and the wing plane's visibility works out to
`|cos(rho + beta)|`, where `beta` is the angle of the camera in the plane perpendicular to
the body. So there is always a roll that presents the same three-quarter aspect, wherever
the butterfly is and whichever way round it is flying. `presentRoll()` solves for it every
frame and takes the branch closest to upright.

The flap is folded into that solve, because the wing pivots turn about the same axis: the
flap is biased half a radian upward, and without compensating, the whole swarm sits half a
radian off target.

`CFG.readRoll = 0` restores v2's look exactly.

## Everything else in one place

The UI is two things: the caught name, hung off-centre on a slope, and the two clusters
below it. They are deliberately unequal in size, not level with each other, and each carries
its own tilt in the plane **and** its own cant in space — two matching shapes side by side at
the same angle is a button bar, and the piece has spent six versions not being one.

**Scale is a spring, not an eased value** (`CFG.ctlSpring` / `ctlDamp` / `ctlKick`). A press
calls `bump()`, which kicks the *velocity*; the spring pulls back, overshoots because it is
under-damped, and rings down over about a second. An eased lerp approaches from one side only
and can never overshoot, so it cannot bounce however it is tuned.

`config.js` holds every number — the swarm bands, the noise, the pick tolerances, the
capture timings, and every position in that composition. There is no dev panel, so there is
nothing to open in a headset and one file to change.

## The typography

`style.js` gives every letter its own angle, size, place on a circle around its butterfly,
and a few flags — mirrored, hollow, carrying a hairline leader, carrying a numeral. All of
it is **deterministic**, seeded off the letter's index, which matters for an exhibition: the
composition is wild but it is the *same* wild composition every session, so it can be
judged and signed off rather than re-rolled in front of an audience.

Angles are **quantised** rather than free. A composition where every angle differs by a
degree or two reads as sloppy; one built from a short list of angles reads as deliberate,
which is what the reference work does.

Two things this depends on:

- **The type hangs off its own anchor, not off the flying group.** The flying group yaws to
  face the butterfly's heading, so a letter thrown sideways inside it swings a full circle
  round the body every time the butterfly turns. Each key has a second, unrotated group that
  tracks position only.
- **`SpriteMaterial.rotation`** turns the sprite in screen space, so a letter can be thrown
  to any angle and still face the camera. Nothing is billboarded by hand, nothing is ever
  edge-on.

**The pick target is still the body.** However far a letter is thrown, the type is
decoration on top of a target that never moves relative to what you are aiming at — checked
by aiming dead-on at all 26 after ten seconds of flight.

**Everything is a letter.** An earlier pass used numerals for the far scenery and the
satellites, and they were the one thing in the build about something other than the
alphabet, which is the only subject the piece has. Where a numeral set a second scale, a
hollow magenta **letter** now does — and never the letter of the butterfly it hangs off.

**The letter is cut out of the wing** (`ui.js:punchLetter`) and then FILLED. The hole is
punched through the first pair of wings, and a second pair sits inside it carrying only the
glyph (`ui.js:letterMask`) in a colour of its own — deliberately never the wing's and never
white, thrown far enough round the wheel that the two never sit next to each other, with an
odd step so twenty-six of them do not repeat. Same geometry and same pivots, so it flaps
with the wing it belongs to, nudged a hair along the plane normal so two coplanar meshes
cannot argue about depth.

Punched, not printed: the butterfly is holed in the shape of the letter it carries, twice,
because the far wing is the same texture mirrored. The generated slice is an opaque canvas
read as an alphaMap off the green channel, so **filling the glyph with black is the whole
operation** — no compositing modes, no premultiplied-alpha surprises. The slice is drawn
with the body axis vertical and the plane's UVs turn it ninety degrees, so the glyph goes in
sideways to come out upright on the butterfly.

**Echoes.** About two in five letters repeat behind themselves at falling size and opacity.
Not all of them — on twenty-six it stops being an accent and becomes a texture. They fan
further out while a letter is chosen, so the highlight moves the type as well as colouring
it.

**The chosen letter, struck huge.** One sprite, re-textured as the highlight moves, parked
on the sight line *past* its own butterfly so it reads as behind that one and nothing else.
It has its own 512px canvas: a 128px glyph blown up to two metres is a smear. It fades
rather than snapping, and it finishes fading out on the old letter before taking a new one,
or a hand sweeping across the swarm strobes.

## The scatter — `js/scatter.js`

Words set on their side, long rules across the room at angles, four enormous hollow numerals
parked far enough back to be scenery. It gives the composition more than one depth and more
than one scale: twenty-six letters all sized against the camera read as a single plane of
type however they are angled, and a three-metre numeral at nine metres does not.

**None of it is pickable.** It is never in the target list, so it can be as loud and as much
in the way as it likes without ever costing someone a letter. Everything drifts on periods
of half a minute or more — noticeable over a minute, never fast enough to pull the eye off a
butterfly.

## The controls are flowers, and they never hold still

`ui.js:blob()` builds **six overlapping lobes** around a centre, each its own triangle fan
whose rim is recomputed from harmonics every frame. Overlapping opaque circles in one flat
colour read as a union without anyone computing one — there is no boolean here, just lobes
drawn on top of each other, sharing a material so a state change is one colour write.

They have to sit far enough out to read as separate lobes: pulled in tight they merge into
one lump and the flower turns back into a blob, which is what the first pass did.

On top of that `tickUI()` floats each cluster a couple of centimetres on two periods that do
not divide into each other, turns it, and breathes its scale.

Geometry rather than a canvas for two reasons. Deforming a *drawn* shape means redrawing and
re-uploading a 256×256 texture every frame — a quarter of a megabyte per shape per frame to
say what a hundred vertices say for nothing. And geometry is exactly flat: one solid unlit
colour with no texture anywhere in the path, so there is nothing to soften it and no colour
space to get wrong.

**Saturation is pinned at 100 and the lightness band is narrow.** State is carried by
lightness alone, a couple of stops at a time. The first pass lifted `off` to a pale tint to
say "nothing to accept yet" and it just made both shapes look washed out for most of a
visit — the keyboard starts empty, so `off` is what people see first and longest. Green sits
darker than red at full chroma or it glows next to it.

The pick sphere **follows the shape as it drifts**, not the point it was hung from, so a
shape that has floated 2 cm is still where you are pointing. Verified both ways: aiming at
the live position and at the original anchor both land.

The life in the rest of the UI is in `tickUI()` too — each letter drifts on its own slow
phase and swells in as it arrives.

The swarm orbits at `radMin`..`radMax` = **1.0 m to 2.4 m** horizontally, which puts every
butterfly 1.0–2.6 m from the eye: a lean and a reach, not a walk. `radMin` is deliberately
outside the UI at `panelR` 0.8 m so nothing flies through the name.

Three worth knowing:

- **`CFG.arcSpan`** is `2*PI`, v2's full orbit. That means only about a quarter of the
  alphabet is in front of you at any moment and spelling a name involves turning around.
  Setting it under `2*PI` — 3.4 rad is a good first try — makes the butterflies sweep back
  and forth across an arc in front of the visitor instead. Same flight, same noise; all 26
  stay findable. Measured over 20 s at 3.4: the worst butterfly reaches 94° off centre and
  none goes behind.
- **`CFG.pickBase` / `CFG.pickAngle`** are the cone. Separation holds neighbours about
  0.6 m apart, so slack much past a quarter of that stops feeling like aiming. Checked by
  aiming dead-on at all 26 across 30 s of flight: 26/26 pick themselves, with the closest
  pair 0.17 m apart.
- **`CFG.captureTime + CFG.goneTime`** is how long a letter is unusable, currently ~0.95 s.
  A key is pickable again the moment it starts flying back in, because a keyboard where the
  letter you just used has gone cannot spell ANNA.

## The seam, and what finally came through it (v7)

```js
window.addEventListener('keyboard:accepted', function (e) { Born.spawn(e.detail.name); });
```

`js/app.js` is still the only file that knows a name means anything, and it is still one
listener — but the listener is no longer a stub. **Accepting a name now births a butterfly
out of it**: it bursts from exactly where the name hangs, flies outward past the swarm, and
joins a wide orbit carrying the name as a label. `js/born.js` owns all of it; the keyboard
still has no idea it is feeding a generator.

**The open question is answered.** "How an n-letter name maps onto the generator's four
values, stably and well spread" is `born.js:nameToDials()` — four FNV-1a hashes over the
characters, with four different offset bases. Three properties, all load-bearing:

- **Stable.** It hashes characters, not floats, so a name gives the same butterfly on every
  machine and in every session. A visitor can come back tomorrow and theirs is still theirs.
  There is still no storage, and now there need not be: **the name is the save file.**
- **Well spread.** FNV avalanches, so ANNA and ANNE land far apart rather than adjacent.
  Different bases rather than salts appended to the string, so the four dials decorrelate
  from the first character instead of sharing a prefix's worth of state.
- **No pile-up at the ends.** The dials are cyclic phases into `WING_ROLL_TABLE` — 0.0 and
  1.0 are the same roll — so a uniform hash maps straight on. This is exactly why
  `wing-gen.js` built them as roll seeds rather than shape ramps; see its header.

Wing **shape** comes from `Wings.forDials()`, the existing TouchDesigner-parity generator,
untouched and unaware. Only the colour is new.

### The painted wing — the one place the flat rule is suspended

Everything else in this piece is one solid colour with an alpha-mapped silhouette, and
"Flat, and how to keep it flat" above still governs all of it. The born butterfly is the
single exception, deliberately: against a room of twenty-six flat ink silhouettes, one
veined, eyespotted, deeply-coloured creature reads instantly as **made** rather than as one
more letter. A restrained version would land in the uncanny middle — neither flat enough to
belong nor rich enough to astonish — so `js/wing-paint.js` goes all the way. Layers, back to
front: a two-level domain-warped fBm base, posterised into hard bands; chevrons parallel to
the outer margin; venation radiating from the wing root; one to three eyespots with
concentric pupil/iris/annulus/halo rings; and a scale-sized shimmer.

Veins and eyespots are drawn **after** the quantiser on purpose — running them through it
would stair-step their edges into the band boundaries and they would stop reading as
structure sitting on top of the wing.

`bfly-model.js:build()` gained one trailing `opts` argument for this. When `opts.wingMap` is
set the material takes a colour map and its own colour is forced to **white** — three.js
multiplies map by colour, so leaving the hue in place would stain the whole texture and
throw the palette away.

### Three things that cost real time to get right

- **The hash had to stop being `Math.sin`.** `keyboard.js:makeNoise` and `dialsForLetter`
  use the sin-fract trick, fine at a handful of calls per frame. A wing is 131k pixels at
  ~80 hashes each. Measured with `Math.sin`: **684 ms for one wing** — not a hitch, a freeze
  with a visitor watching. `noise.js:hash2` is integer bit-mixing instead, and nothing
  downstream can tell the difference.
- **The base field is sampled at half resolution** (`CFG.bornFieldDiv`) and interpolated
  back up, because it is quantised into hard bands before anyone sees it — what the eye
  reads is where the band *boundaries* fall, and those are still computed per
  full-resolution pixel. Quantising first and upscaling after stair-steps every edge; that
  is the version that looks broken, and it is why `paintBase` is two passes.
- **The paint happens one frame after accept**, via `requestAnimationFrame`. `accept()` is
  the frame that plays the winner sound, bounces the green control and launches the name's
  flight; spending 40–100 ms on it would stall the exact moment the visitor is being
  congratulated. The butterfly spends its first frames at scale ~0 climbing out of the name,
  so it is a speck while unpainted and textured long before it is big enough to read.

Measured on desktop, one wing: **~99 ms** at `bornTexSize` 256, **76 ms** at 192, **23 ms**
at 128. A Quest is slower. `bornTexSize` is the lever and it is one number.

### Two traps this build hit

- **`Wings.forDials` is an LRU that redraws into an evicted record's canvas.** Past
  `MAX_UNIQUE` (64) a live material silently changes wing shape. 26 letters + `CFG.bornMax`
  (12) = 38 keeps it dormant — a second, quieter reason the cap exists.
- **`SFX.attachButterflyLoop` had no way to stop.** Correct when the only three loops were
  attached once at startup and lived forever; a real leak once butterflies are born and
  recycled all session. `SFX.detachLoop()` is new, and born loops also need their **own**
  falloff band — the swarm's is tuned for a 1.0–2.6 m orbit and would leave one inaudible
  out at 3.2–4.5 m.

## Audio (originally added in `v2`, extended here in `v3` — see README.md)

This section describes what `v2` shipped; `README.md` in this folder documents what `v3`
changes on top of it (louder + wandering spatial loops, a steeper distance falloff) and why.

v6.1 (above) shipped with no sound at all — the folder it lived in was literally named
`to_implement_audio`. `v2` added exactly three things, in one new file,
`js/audio.js`, exposing a small object called **`SFX`** (not `Audio` — that name is already
taken by the browser's own `window.Audio`, and shadowing it globally is precisely the kind
of silent trap the rest of this document keeps warning about).

- **Background music.** Non-positional, looping, started once from `SFX.init()` and never
  touched again by anything else — there is no button for it because there is nothing to
  open in a headset, same reasoning as everywhere else in this piece. Autoplay policy still
  applies: playback is *scheduled* immediately, but stays silent until the shared
  `AudioContext` is resumed, which happens on whichever comes first — entering the AR/VR
  session (the headset's own enter button is a real user gesture) or, for desktop testing,
  the first pointerdown/keydown/touchstart.
- **The winner sound.** Also non-positional. `keyboard.js:accept()` calls
  `SFX.playWinner()` in the same breath as `this.done = true`, so it fires exactly when the
  green control's pinch actually goes through — not on a press that no-ops because nothing
  was typed yet.
- **Three spatial butterfly loops.** `keyboard.js:buildKeys()` shuffles the 26 key indices
  and calls `SFX.attachButterflyLoop()` on three of them, once each, right after that key's
  `THREE.Group` exists. The sound is a `THREE.PositionalAudio` **parented to that same
  group** — `keyboard.js` already copies `k.pos` onto `k.group.position` every frame
  (`tickKey()`), so the panner tracks the butterfly for free through three.js's ordinary
  scene-graph traversal; nothing new was added to `tick()`. `panningModel` is set to
  `'HRTF'` (binaural), which is what makes a butterfly crossing left of centre sound
  louder in the left ear on a headset rather than just quieter overall.

Every volume and every distance number above lives in `config.js`
(`audioBgVolume`/`audioWinnerVolume`/`audioBflyVolume`/`audioRefDistance`/
`audioMaxDistance`/`audioRolloff`), not in `audio.js` — the same rule as every other
number in this piece.

`SFX` is deliberately defensive about ordering: `attachButterflyLoop()` and `playWinner()`
both queue their call if the camera/listener isn't attached yet or the five clips haven't
finished decoding, and flush once `SFX.init()` finishes — nothing about *when*
`buildKeys()`/`accept()` happen relative to the scene's own `loaded` event is guaranteed,
so the module doesn't assume an order.

## The marks on the controls, and pointing (v8)

### Why the flowers finally say something

"An instruction is a confession that the interaction did not carry itself", and that still
holds for the swarm — you reach at a butterfly and it lights up, and no sentence hanging in
the air would improve it. But the two flowers are not that. One commits your name and one
takes a letter back, they are not distinguishable by shape, and getting them the wrong way
round costs a visitor the thing they just spent a minute making. Colour alone was carrying
that, and colour alone is also what a red-green colourblind visitor cannot read.

So each carries a mark: **↵** on the green, **⌫** on the red. Both are the glyphs from the
keys everyone already knows, and neither is a word.

**Knocked out, not printed on.** Drawn in `CFG.bg` white, so the mark reads as a hole punched
through the petals rather than as a second solid mark laid over a solid one. That is exactly
what the wings already do — every letter in the swarm is cut out of its wing, never marked on
it — so this is the piece's own language rather than an exception to it.

**Drawn, not typed.** There is no arrow, chevron, cross or tick anywhere else in the piece to
reuse; every glyph is a font character. Fonts do carry arrow glyphs, but which one you get is
a lottery across platforms and a Quest falls back to Roboto — so these are Path2D strokes,
identical everywhere. Heavy and round-capped: a hairline reads as a scratch at four metres
through a headset lens.

**A mesh, not a sprite, and this is the whole reason `UI.iconPlate()` exists** rather than
being one more call to `hollow()`. Every other 2D thing in the piece is a sprite, because
sprites billboard and are never edge-on. That is precisely wrong here: the flowers carry
their own tilt, their own cant and a slow sway, and a sprite ignores all three — it would sit
flat to the camera while the shape behind it turned, and visibly float free of the thing it
belongs to. A textured plane inherits the full transform.

Parented **into** the flower's own group, which is the trick that makes it free: `tickUI()`
applies every per-frame transform to that group, so the mark inherits the drift, the sway,
the cant and the press spring with **no tick code at all**. Verified: through a press bounce
the mark's world scale matched the petals' at every sample, 0.96 → 1.36 → 1.02.

Two things that bite. `blob.dispose()` only knows about its six lobes and their shared
material, so the mark must be disposed in `keyboard.js:remove()` or it leaks. And the lobes
share **one** material that `setColor()` rewrites, so the mark needs its own or it recolours
with the flower on every state change.

### Point, and the born butterflies come

Extend an index finger and the butterflies born from accepted names gather to the point you
are aiming at and orbit it; let go and they disperse back to their own wide orbits.

**It is a real gesture, not just a tracked hand.** `hands.js:rig.pointing` — index extended
while the other three curl. Nothing could ask this before: the ray is cast for any tracked
hand regardless of pose, and `openness` (computed every tick since v2, read by nothing) puts
a pointing hand in the middle of its range, indistinguishable from a half-open one. The
measure is the **gap** between the index's wrist distance and the mean of the other three,
not the index's own length — an absolute length reads a splayed palm as a point. Two
thresholds, like the pinch, or it chatters. Costs nothing: those three fingertips were
already being measured a line earlier for `openness`.

Keeping it deliberate is the point. The same ray catches letters, and a swarm that follows
every reach would be dragged around the room while someone spells their name.

**The aim point is the first "where am I pointing" in the piece.** Until now the ray was only
ever a scoring axis — `pickRay()` works out how far along it a target sits and discards that
number, because all it needs is which sphere won. The focus is
`shoulderOf(side) + smoothedDir * CFG.pointReach`, deliberately built on v6.1's
shoulder-anchored, EMA-smoothed ray rather than a fresh one off the raw fingertip. That ray
exists precisely because a few millimetres of finger curl swung a knuckle-anchored aim by
tens of degrees; a swarm of butterflies chasing a twitching aim point would be unusable.

**Expressed as a moving orbit CENTRE, not as a force on the position.** `orbitAt()` now
circles `b.centre` instead of the world origin, and that centre eases toward the focus. This
is why "orbits the point you are aiming at" falls straight out of the flight that already
existed — the noise, the wobble, the banking and the wingbeat all keep working untouched, and
there is no second motion model fighting the first.

**Distance sets how briskly each one answers, not whether it comes at all.** The obvious
version — gate the pull on proximity — was written first and could never have worked. Born
butterflies orbit the origin at 3.2–4.5 m while the aim point sits 3.6 m out from it, so a
butterfly is typically 4–6 m from where you are pointing; gating on that distance meant pull
only rose for butterflies already close, and nothing ever got close because nothing was being
pulled. Measured: every pull stuck at exactly 0 and the gesture did nothing. So the whole
group answers, and proximity scales the rate — the near ones sweep in at once, the far ones
arrive late, and the swarm gathers as a shape rather than as a chosen few while the rest
ignore you.

**Everything is capped, and the caps are the feature.** Hand speed is clamped before use, the
ease rate is clamped at both ends, and the orbit centre has its own hard speed ceiling on
top. That last one is not belt-and-braces: the rates above are rates, and a rate applied to a
big gap is still a big jump — a centre 4 m from a flicked aim point crosses at 12 m/s.
Whipping the aim around measured butterflies peaking at 7.1 m/s before the ceiling and 3.0
after, with cluster spread tightening from 1.37 m to 1.14 m.

With nobody pointing, all of it is inert — `pull` and `centre` are **exactly** zero, not
merely small, and the flight is v7's. Same discipline `updateSlowField()` already follows.

### The trap worth not rediscovering

**A single non-finite aim point is unrecoverable.** `camera.projectionMatrixInverse` is only
filled in during `updateProjectionMatrix()`, so on the first frames of a session — before
anything has rendered — `setFromCamera()` can hand back a direction of NaN. One NaN focus
propagates into every butterfly's orbit centre, and the entire born swarm is gone for the
rest of the session, silently, with no error thrown anywhere. Found exactly that way.
`interact.js:pushFocus()` is the guard, and it is not defensive padding.
