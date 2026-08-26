# v2 folder — audio, 26 August 2026

Everything below is v6.1, unchanged. This folder adds one new file, `js/audio.js`
(`SFX`), and three call sites — no other behaviour changed:

- Background music loops from scene start, non-positional, no button anywhere to
  activate it (subject to the browser's own autoplay gesture requirement — see
  `CLAUDE.md`'s "Audio" section).
- The green **accept** control's pinch fires a one-shot winner sound
  (`keyboard.js:accept()` → `SFX.playWinner()`).
- Three of the 26 butterflies, picked at random each session in `buildKeys()`, each carry
  one of the three butterfly clips as a **positional**, looping sound — parented to the
  same `THREE.Group` `tickKey()` already moves every frame, so it pans left/right as that
  butterfly crosses in front of the visitor, with no new per-frame code.

Assets live in `sounds/` inside this folder (`serve.py` only serves the folder holding
`index.html`, so they can't stay in the project-level `sound/` folder they were copied
from).

Serve this folder and it runs. `tools/` is the two servers only.

```bash
python3 tools/serve.py 8123        # then http://localhost:8123/
python3 tools/serve-https.py 8443  # for a Quest, over the local network
```

## What changed from v6

v6 is confirmed tested and working on the Quest. v6.1 is v6 with selection made easier,
off exhibition feedback: reaching out and pinching a specific butterfly was harder than
it should be, and the swarm's motion risked motion sickness. Full detail in
`CLAUDE.md`'s "Selection, made easier (v6.1)"; in short, all inside `interact.js` and
`keyboard.js`, no new files:

- The ray's origin moved from the index knuckle to an estimated **shoulder** point
  (`CFG.shoulderDown`/`shoulderOut`, derived from the camera pose each tick) — the same
  model Meta's own hand-pointing UI uses. The knuckle-to-fingertip baseline was ~3cm, so
  the finger curl of closing a pinch alone could swing the aim by tens of degrees; a
  ~60-80cm shoulder-to-fingertip baseline swings by a couple of degrees for the same
  curl. Measured: a realistic pinch-close curl that puts the old math 0.70m off axis
  against a 0.27m tolerance (a clean miss) leaves the new ray still on target.
- The pointing ray's aim point is also smoothed (`CFG.aimSmoothTau`) so a hover doesn't
  flicker on residual raw hand-tracking jitter.
- A pinch's rising edge still rescues the last butterfly a hand had hot within
  `CFG.pickGraceMs`, covering what the shoulder ray doesn't fully remove. Never rescues
  the two controls — a wrong accept/delete costs more than a missed letter.
- The ray line still visually starts at the fingertip, but now bends to touch whatever
  is actually picked (its exact live position) instead of gesturing a fixed distance
  toward it, and flashes briefly on a catch.
- A hot butterfly, and its neighbours on a falloff, ease into a calmer flight while
  reached for, and ease back out once released (`CFG.slowHot`/`slowRadius`/`slowEase`).
  The swarm's baseline cruising speed is untouched.

Nothing about the composition, typography, capture flow, or controls changed. This is
the one build in the series that most needs its own on-headset pass — see "Verified"
below.

## What this is

v4 stripped back, and the controls given weight. **The interaction is unchanged** —
twenty-six butterflies circle you, reach highlights, pinch catches, green accepts and red
deletes.

Reference points: heavy experimental type on flat white, names set at every angle and
scale, hollow and mirrored letters, hairline rules, numerals from a contact sheet at a size
that has nothing to do with the type, and hard saturated colour laid down flat.

## What changed from v4

**Only butterflies and controls.** The scatter is gone entirely — the words on their side,
the rules, the giant letters, the alphabet ring. Deleted, not switched off.

**The cut-out letter is filled, and it is turned.** It used to be a hole showing the room
behind it, so it read as white whatever the butterfly was. Now a second pair of wings sits
inside the hole carrying only the glyph, in a colour of its own — never the wing's, never
white, all twenty-six distinct. Each is also laid into the wing at its own angle, squash and
shear: a glyph painted into a texture cannot really be rotated out of the wing's plane, but
rotation plus an uneven squash plus a shear is what a rotated plane *looks* like, and that
is the whole job. The hole and the fill go through the same transform (`ui.js:wingGlyph`) so
they cannot drift apart.

**The ghost wanders and breathes.** Each step of the trail turns further off the last, the
spacing swells and shrinks on its own slow period, and it fans out while the letter is
chosen. It prints in an ink of its own — 24 distinct hues across the 26 — rather than in the
letter's. A straight, evenly-spaced, same-coloured trail is a drop shadow; this is meant to
read as something moving.

**Some butterflies wear a 3D lattice of their own letter** — eleven of the twenty-six, five
to eight copies each, scattered through the space around the body at different depths and
sizes (0.35× to 1.2×), drifting on their own phases. Sprites, so every copy faces you, but
the positions are genuinely three-dimensional, so the cluster parallaxes as the butterfly
circles.

**The name's second impression has its own ink per letter** too, instead of one fixed
magenta under all of them.

**No instructional text.** The block of type explaining what to do, the second block turned
up the right-hand edge, and every caption in the scatter are gone. What is left of the
written word is the alphabet itself, set on its side twice. Reaching at a butterfly makes it
light up; if that does not carry the interaction, a sentence hanging in the air was never
going to.

**No rectangles.** The blue keyline and its misregistered magenta twin went with them. A
rectangle was the one mark in the whole piece that was neither a letter nor a living thing.

**The two controls are much bigger** — about half again across — and each is hung at its own
angle: its own tilt in the plane and its own cant in space, so neither sits square to the
visitor and they do not match each other. The cant is deliberately modest; turned much past
a quarter of a radian the lobes foreshorten into each other and the cluster stops reading as
a flower at all.

**Pressing one bounces it.** Scale is a spring now rather than an eased value, and a press
kicks its *velocity*: the shape shoots past its resting size to about 1.4×, comes back past
it to 0.95, and rings down over about a second. An eased lerp can only approach from one
side and can never overshoot, which is the entire point of a bounce.

## What v4 changed from v3

**Every letter is set differently.** Its own angle, its own size, its own place on a circle
around its butterfly, some mirrored, some hollow, some with a hairline running back to the
body it belongs to. `js/style.js` decides all of it.

**It is all deterministic**, seeded off the letter's index. That matters for an exhibition:
the composition is wild but it is the *same* wild composition every session, so it can be
judged, adjusted and signed off rather than re-rolled in front of an audience.

**It is all letters.** An earlier pass used numerals for the far scenery and the satellites —
the figures off a contact sheet — and they were the one thing in here about something other
than the alphabet, which is the only subject the piece has. They are gone. Where a numeral
set a second scale, a **letter** now does: hollow, magenta, oversized, and never the letter
of the butterfly it hangs off.

**The letter is cut out of the wing.** Not printed on it — punched through the alpha, so the
butterfly is holed in the shape of the letter it carries, and carries it twice because the
far wing is the same texture mirrored. The generated slice is an opaque canvas read as an
alphaMap off the green channel, so filling the glyph with black is the whole operation: no
compositing modes, no premultiplied-alpha surprises. The slice is drawn with the body axis
vertical and the plane's UVs turn it ninety degrees, so the glyph goes in sideways to come
out upright.

**The alphabet rings the room overhead** — twenty-six hollow letters on a five-metre circle,
turning about six minutes to the revolution. The keyboard's own set, said once, at a size
and a distance that has nothing to do with catching them.

**The keyline is printed twice and out of register**: the blue one, and a magenta one a
couple of centimetres off it and slightly canted. A keyline that has visibly missed its
register could not be a dialog box.

**A second block of type** runs up the right-hand edge, turned a hard ninety. It says nothing
the first one does not — one block reads as a caption, two at right angles read as a page.

**The UI is a poster, not a panel.** A blue keyline hung in the air with the caught name
set loose inside it on a slope, two flower-clusters for the controls at different sizes and
different heights, and one block of type ranged off the left edge overlapping the keyline.
Nothing is centred on anything else.

**The controls are flowers.** Six overlapping lobes rather than one blob, each its own
deforming triangle fan. Opaque circles in one flat colour read as a union without anyone
computing one.

**The caught name is a composition.** Tight tracking, letters nearly touching, each with its
own angle, size and rise off the baseline — still in the colour of the butterfly it came
from, and each struck **twice, out of register**: a magenta impression a fraction off behind
the coloured one, the way a two-colour job goes wrong on press. The offset is fixed per
slot, so a name always misprints the same way.

**A caught letter flies into the name.** It is carried from the butterfly you took it off,
arriving large and faint and settling into its slot. This is the whole idea of the piece in
one movement, so it is the one animation allowed to be fast and obvious.

**Letters echo.** About two in five repeat behind themselves, stepping away in one direction
at falling size and opacity — the smear you get dragging type across a surface. On all
twenty-six it stops being an accent and becomes a texture, so most letters do not get them.
**The echoes fan further out while a letter is chosen**: the highlight is not just a colour
change, the type moves.

**The chosen letter is struck two metres tall behind its own butterfly**, hollow and faint,
on the sight line from the visitor through the body so it reads as behind that butterfly and
nothing else. Highlighting stops being a small thing happening to a small thing — the room
briefly becomes the letter you are about to take.

**The room is full of printed matter** (`js/scatter.js`): words set on their side, long
rules ruled across the space at angles, five enormous hollow letters parked far enough back
to be scenery, and the alphabet ring. It exists to give the composition more than one depth and more than one
scale — twenty-six letters all sized against the camera read as a single plane of type
however they are angled; a letter three metres tall at nine metres does not. **None of it
is pickable**, so it can be as loud and as much in the way as it likes without ever costing
someone a letter.

## Two things worth not rediscovering

- **The type hangs off its own anchor, not off the flying group.** The flying group yaws to
  face the butterfly's heading, so a letter thrown sideways inside it swings a full circle
  round the body every time the butterfly turns. The anchor tracks the position and ignores
  the rotation.

- **`SpriteMaterial.rotation` is what makes any of this possible.** It turns the sprite in
  screen space, so a letter can be thrown to any angle and still face the camera. Nothing is
  billboarded by hand and nothing is ever edge-on.

**The pick target is still the body.** However far a letter is thrown, the type is
decoration on top of a target that never moves relative to the thing you are aiming at.

## Verified

| | |
|---|---|
| aim dead-on at all 26 after 10 s of flight | 26/26 pick themselves — the thrown type changes nothing |
| reach + pinch | letter inverts and straightens, butterfly keeps its colour, pinch types |
| both flower clusters | pickable while drifting; delete removes, accept fires `keyboard:accepted` |
| name composition | per-slot angle, size and rise applied; colours from the source butterflies |
| reset | name cleared, sprites disposed, clusters back to `off` |
| the press bounce | 0.95 → 1.33 peak in five frames, dips back to 0.95, settled inside ~1.1 s |
| the scatter, the rules, the giants, the ring, the blown-up letter | never in the target list — 26 targets, all butterflies |
| the wing knockout | the letter is a hole in the alpha, not a mark on it — 5,195 lit pixels against 27,573 dark |
| the letter's flight | leaves the butterfly on capture, lands in its slot |
| the blown-up letter | shows the right character on highlight, fades out when tracking drops |

**v6's flow was run on a physical Quest and confirmed working.** v6.1's specific changes
— the ray smoothing, the grace window, the line, and the slow field — have not yet had
their own on-headset pass, and this build is the one where that matters most (see the
plan's on-headset checklist: flick between distant butterflies for added lag, pinch at
natural speed on the motivating scenario, watch the line and the flash, reach across the
controls, two-handed use, reach into a dense cluster).

**Scene weight: 268 objects** — 144 meshes, 110 sprites, 14 lines, and `alphaTest` materials
do not batch, so that is roughly the draw call count. (v4 was 225. Deleting the scatter
saved 33 sprites; filling the cut-out letters cost 52 meshes back.) v2 sized its budget at 180 for a room
of sixty butterflies, so this is over it. If it will not hold 72 Hz, the levers in order of
how much they cost the design:

1. the **lattices** — about 70 sprites (`Style.forLetter`, the `grid` line; drop the 0.45)
2. the **ghosts** — about 35 sprites (same file, the `echo` line)
3. the **satellites** — 9 sprites

Nothing on that list is load-bearing for the interaction.

## Known gaps

Everything v3 left open. `js/app.js` is still the only seam: accepting fires
`keyboard:accepted` and stops, and generating a butterfly from the name is the next
version's work.

One judgement call worth making in the headset: `CFG.arcSpan` is still a full circle, so
about a quarter of the alphabet is in front of you at a time. The scattered composition
makes hunting more interesting to look at and no easier to do.
