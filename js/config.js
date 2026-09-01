// ============================================================
//  config.js  --  the numbers the piece is built from
// ============================================================
//  v3 has no dev panel on purpose. Everything that would have been a
//  slider in v2 is a constant here instead, so there is one place to
//  change the piece and nothing to open in a headset.
//
//  The twenty-six keys ARE v2's swarm: the same circling flight, the
//  same flap-glide, the same scatter. They are not parked on a panel.
//  A letter rides under each one and faces the camera, so the keyboard
//  is something you read off a room full of moving butterflies rather
//  than off a grid.
//
//  Only the name field and the two buttons are fixed in place, in
//  front of the visitor where they can always be found.
// ============================================================
var CFG = {
  eyeY: 1.60,               // the scene's camera height

  // ---- the swarm ----
  //  Same shape of distribution as v2, pulled in: these have to be
  //  catchable, so the far end of the radius band is closer and the
  //  small end of the size band is bigger than the ambient swarm's.
  //  Close. The visitor should be able to reach a butterfly by leaning,
  //  not by walking -- an exhibition floor is not big and a headset
  //  guardian is smaller still. radMin is the near edge of the orbit and
  //  sits just outside the floating UI, so nothing flies through it.
  //  Sizes come down with the radius: a butterfly at 1 m at v2's size
  //  band fills the view.
  sizeMin:   0.45, sizeRange: 0.60, sizeExp: 1.4,
  radMin:    1.00, radMax:    2.40,
  hgtMin:    1.00, hgtMax:    2.30,

  //  How far the noise pushes a butterfly off its nominal orbit. v2 cut
  //  these hard after "they wobble too much"; 1.0 is that calm baseline
  //  and it scales all three noise amplitudes at once.
  wander:    1.0,

  //  HOW FAR AROUND THE VISITOR THE KEYBOARD GOES, in radians.
  //
  //  2*PI is v2's swarm: every butterfly orbits the full circle, which is
  //  what this is asked to look like. Worth knowing before an exhibition:
  //  a full circle means only about a quarter of the alphabet is in front
  //  of you at any moment, so spelling a name involves turning around to
  //  hunt for a letter.
  //
  //  Set this to something under 2*PI -- 3.4 (about 195 degrees) is a good
  //  first try -- and the butterflies sweep back and forth across an arc
  //  in front of the visitor instead of circling. Same flight, same noise,
  //  same everything else; all 26 letters stay findable without turning.
  arcSpan:   Math.PI * 2,
  arcRate:   0.11,          // sweeps per second, when the arc is not full

  //  How much of the wing to present, in radians: 0 = body face-on and
  //  wings edge-on, PI/2 = the reverse. See presentRoll() in keyboard.js
  //  -- this is the only departure from v2's flight, and 0 restores it.
  readRoll:  0.84,

  // ---- the letter under each butterfly ----
  //  Angular, like v2's id labels: scaled by distance from the camera
  //  so a letter across the room stays as readable as one in your face,
  //  clamped at both ends so a near one is not enormous.
  letterAngular: 0.075,     // world height per metre of distance
  letterMin:     0.075,
  letterMax:     0.42,

  // ---- selection ----
  //  A pointing ray is the main way in -- most of the swarm is further
  //  than an arm. The tolerance is a CONE, not a fixed radius: a fixed
  //  radius makes a butterfly four metres away almost unhittable, and a
  //  wide fixed radius makes a near one grab everything around it.
  //  Tightened when the swarm came closer: separation holds neighbours
  //  about 0.6 m apart, so slack much past a quarter of that stops
  //  feeling like aiming.
  pickBase:    0.16,        // metres of slack, close in
  pickAngle:   0.055,       // radians the cone opens by, further out
  touchRadius: 0.16,        // fingertip this close beats any ray pick
  rayMax:      8.0,
  pinchOn:     0.028,       // metres, thumb tip to index tip: pinch closes
  pinchOff:    0.045,       // and opens again (hysteresis, not one value)

  //  v6.1: the cone above is already tuned right up against a hard ceiling
  //  (neighbours sit ~0.6 m apart; slack past a quarter of that turns them
  //  into one blob -- see the note further down). So easier selection comes
  //  from calming the SIGNAL feeding the cone, not widening the cone:
  //
  //  shoulderDown/shoulderOut place the ray's ORIGIN, not its aim. v6 cast
  //  from the index knuckle through the fingertip -- a ~3cm baseline, so a
  //  few millimetres of finger curl during a pinch swung the aim by tens
  //  of degrees. This mirrors Meta's own hand-pointing model (the ray
  //  Quest's system UI casts): anchor the ray near the SHOULDER instead,
  //  aimed through the hand. There is no tracked shoulder joint, so
  //  interact.js:shoulderOf() estimates one each tick from the camera
  //  pose -- down by shoulderDown, out by shoulderOut along the camera's
  //  flattened (yaw-only) right axis, mirrored per hand. A ~60-80cm
  //  baseline means the same finger curl swings the aim by a couple of
  //  degrees, often less than the cone's own slack.
  //
  //  aimSmoothTau damps residual raw joint jitter out of the fingertip the
  //  ray is aimed through, so a hover does not flicker on and off a target
  //  it is plainly sitting on.
  //
  //  pickGraceMs covers what the shoulder anchor does not fully remove:
  //  a pinch's rising edge with nothing picked that exact frame still
  //  activates whatever this hand had hot within this many milliseconds --
  //  butterflies only, never the two controls, which are fixed in place,
  //  easier to hit anyway, and where a wrong guess (an accidental
  //  accept/delete) costs more than a missed letter.
  shoulderDown: 0.20,       // metres, estimated shoulder below the headset
  shoulderOut:  0.18,       // metres, estimated shoulder out from centre
  aimSmoothTau: 0.07,       // seconds, EMA time constant on the hand ray
  pickGraceMs:  180,        // ms, how long a hover is "rescued" after loss

  // ---- feedback ----
  hiScale:     1.45,        // a highlighted butterfly grows to this
  captureTime: 0.55,        // seconds to fly into the hand
  goneTime:    0.40,        // seconds off, before it rejoins the swarm
  returnTime:  0.60,        // seconds to fade back in, flying in from outside
  flashTime:   0.15,        // v6.1: seconds, the ray line's catch-flash decay

  //  v6.1: exhibition feedback flagged the swarm's motion as a motion-
  //  sickness risk. Rather than slow everyone all the time -- v6's cruising
  //  flight is already tuned and tested on-headset -- only a butterfly
  //  being reached for (and its near neighbours, tapering with distance)
  //  eases into a calmer flight, and back out once nothing is pointed
  //  there. This also makes 1-2 above work better: a target that is barely
  //  moving while hot is far easier for a damped ray to stay locked onto,
  //  and far more forgiving of the pinch-commit perturbation.
  slowHot:     0.30,        // time-scale for the butterfly directly hot
  slowRadius:  0.90,        // metres, falloff for neighbours of a hot one
  slowEase:    0.35,        // seconds, how gradually speed eases in/out

  // ---- the UI, fixed in front of the visitor ----
  //  No panel, no box. The name is loose letters hanging in the air and
  //  the two controls are shapes, not labelled rectangles -- the piece is
  //  a room full of butterflies and a chrome dialog in the middle of it
  //  reads as a different application.
  panelR:      0.80,        // metres in front

  //  Nothing here is centred on anything else, and there is no frame to
  //  centre it in: the keyline and the block of type both went, so the
  //  name and the two shapes are all that is fixed in the room.
  panelR:      0.80,        // metres in front

  nameX:       0.045,       // off-centre, on purpose
  nameY:       -0.235,
  nameTilt:    -0.055,      // the whole line hung on a slope
  nameSize:    0.105,
  nameSpacing: 0.072,
  nameTrack:   0.80,        // under 1 = the letters nearly touch
  nameMaxW:    1.02,
  nameBob:     0.006,
  nameBobRate: 0.28,
  nameFlyTime: 0.65,        // seconds for a caught letter to reach the name

  //  THE TWO SHAPES. Much bigger than v4's, and each hung at its own
  //  tilt and its own cant so neither sits square to the visitor.
  blobY:       -0.435,
  blobW:       0.200,       // one lobe's radius; a cluster is ~2.9x this across
  blobH:       0.176,
  ctlGap:      0.82,        // between the two, centre to centre
  blobPulse:   0.045,       // depth of the breathing
  blobDrift:   0.022,       // how far a shape floats from where it hangs

  //  The press bounce. Under-damped on purpose: the kick is a velocity,
  //  so the shape shoots past its resting size, comes back past it, and
  //  rings down over about a second.
  ctlSpring:   150,         // stiffness
  ctlDamp:     0.86,        // per frame at 60fps; under 1 = it rings
  ctlKick:     7.5,         // the impulse a press adds to the velocity

  maxName:     16,          // longest name the field will take

  // ---- palette ----
  //  Fully saturated, always. The scene is white, so the butterflies carry
  //  all the colour and carry it at full strength -- v2's 72%/63% was
  //  tuned against a black void and washes out completely against white.
  bflySat:     100,         // per cent
  bflyLit:     47,
  //  Letters take their butterfly's hue at full chroma but darker: a wing
  //  is a silhouette and a letter is type, and type at the wing's own
  //  lightness is unreadable on white for a good third of the wheel.
  letterLit:   36,
  //  the letter cut out of the wing, filled rather than left open
  cutLit:      46,
  //  the ghost trailing each letter, in its own ink
  ghostLit:    52,
  bg:          '#ffffff',

  // ---- audio (v2, tuned further in v3 -- see README.md in this folder) ----
  //  Three things: a loop that is always on, a one-shot on accept, and a
  //  spatial loop carried by three random butterflies. Volumes and the
  //  positional falloff live here rather than in audio.js for the same
  //  reason as everything else in this file -- no dev panel, one place
  //  to change the piece.
  audioBgVolume:      0.35,   // background music, always on, non-positional
  audioWinnerVolume:  0.9,    // one-shot on the green accept control
  audioBflyVolume:    1.0,    // each of the 3 spatial butterfly loops -- base level the
                               // volume wander (below) swings around. Doubled again on
                               // request from 0.5 -- peaks now reach base * audioBflyVolModMax
                               // = 1.0 * 1.5 = 1.5, past unity gain, which CAN clip on source
                               // material that already peaks near full scale. See README.md
                               // if it sounds harsh at the loudest wander peaks.
  //  v9.1: TEN, from the same three clips. doAttachButterflyLoop() maps
  //  the index through `% 3`, so raising this simply spreads the three
  //  variants around more of the swarm -- ten sound sources at ten
  //  different points in the room rather than three. Each still carries
  //  its own independent rate/volume wander, so ten copies of three clips
  //  never phase into an audible round.
  audioBflyCount:    10,      // how many of the 26 keys carry a sound
  //  distance falloff tuned against the swarm's own orbit (radMin..radMax,
  //  1.0-2.4 m). v3 pulls refDistance/maxDistance in and steepens rolloff
  //  versus v2's 0.9/6.0/1.4 -- that combination only swung gain from
  //  about 0.97 (closest) to 0.53 (farthest edge), which is why "louder
  //  near, quieter far" was barely audible. This band swings roughly
  //  0.9 -> 0.1 across the same orbit. See README.md for the numbers.
  audioRefDistance:   0.7,
  audioMaxDistance:   5.0,
  audioRolloff:       1.8,

  // ---- audio wander (v3) ----
  //  The 3 spatial loops each independently drift their playback rate
  //  (tempo/pitch together -- Web Audio has no separate tempo knob on a
  //  raw buffer source) and their volume, so the "same" loop never sounds
  //  quite the same twice. Both are a smoothed random walk, not a fixed
  //  LFO: audio.js:pickTarget() draws a new target every
  //  audioBflyModPeriodMin..Max seconds and eases toward it with time
  //  constant audioBflyModTau, so the motion is organic and the three
  //  butterflies are never in sync with each other (each keeps its own
  //  clock and its own random target).
  audioBflyRateMin:      0.72,   // playback rate wander -- slowest
  audioBflyRateMax:      1.35,   // ...and fastest
  audioBflyVolModMin:    0.55,   // volume wander is MULTIPLICATIVE on
  audioBflyVolModMax:    1.5,    // audioBflyVolume -- 1.0 = base, unmodified
  audioBflyModPeriodMin: 1.2,    // seconds between picking a new target
  audioBflyModPeriodMax: 3.2,
  audioBflyModTau:       0.6,    // seconds -- how briskly it eases toward
                                  // that target (same EMA idea interact.js
                                  // uses for aim smoothing, CFG.aimSmoothTau)

  // ---- pickup / swoosh (v3) ----
  //  Two one-shots, non-positional (they are feedback ON the visitor's own
  //  action, not something happening at a point in the room -- same
  //  reasoning as the winner sound). Unlike the spatial loops above these
  //  don't WANDER over time -- there is nothing to wander, each is a single
  //  hit-and-done clip -- instead every individual PLAY draws a fresh
  //  random pitch and volume from these ranges, so catching five letters
  //  in a row doesn't sound like the same sample five times.
  //
  //    pickup   keyboard.js:capture() -- fires the moment a butterfly is
  //             actually caught (pinch/click connecting, or the letter-key
  //             testing convenience -- both go through capture()).
  //    swoosh   interact.js:tick() -- fires when a pinch/click's edge fires
  //             with nothing picked at all: a press into empty air, not
  //             just short of a butterfly.
  audioPickupVolMin:  0.5,
  audioPickupVolMax:  0.9,
  audioPickupRateMin: 0.85,   // playback rate -- pitch and speed together,
  audioPickupRateMax: 1.25,   // same reasoning as the spatial loops' wander
  audioSwooshVolMin:  0.35,   // quieter band than pickup -- a miss should
  audioSwooshVolMax:  0.7,    // read as a lighter, secondary cue
  audioSwooshRateMin: 0.85,
  audioSwooshRateMax: 1.25,

  // ---- the red control, and the welcome voice (v9) ----
  //    redbutton  keyboard.js:activate() -- the red flower's own sound, the
  //               counterpart to the green one's winner. It fires on the
  //               PRESS rather than inside backspace(), which in practice is
  //               the same thing: targets() only offers the two controls
  //               once something has been typed, so the red flower cannot be
  //               pressed with nothing to delete.
  //    voice      welcome.js -- the greeting, played once per new wearer.
  //  The red button's random band is deliberately NARROW compared to
  //  pickup/swoosh. Those are creatures and a wide pitch scatter suits them;
  //  this is a control surface, and a UI click that changes pitch noticeably
  //  every press reads as broken rather than alive.
  audioRedVolMin:  0.55,
  audioRedVolMax:  0.75,
  audioRedRateMin: 0.96,
  audioRedRateMax: 1.05,
  //  The voice carries the only spoken words in the piece, over the top of
  //  the background music -- it has to win that contest without the music
  //  being ducked (there is no ducking here, and adding one for a 16 s clip
  //  would be its own machinery to maintain).
  audioVoiceVolume: 1.0,

  // ============================================================
  //  the welcome (v9)
  // ============================================================
  //  THE INSTALLATION IS A QUEUE. Person after person takes the headset
  //  off and hands it to the next one, so "a visitor" is not the session
  //  -- it is a stretch of one session between two headset removals. Each
  //  new wearer is greeted by name-less voice and a line of type that
  //  builds word by word, and the keyboard is reset under them so they do
  //  not inherit half of a stranger's name.
  //
  //  Butterflies already born are deliberately NOT cleared. They are the
  //  accumulating artwork of the whole exhibition, and every visitor
  //  arriving into a room already full of other people's butterflies is
  //  the piece working, not a bug.
  //
  //  DETECTION, in layers, because no single signal is enough:
  //    enter-vr                 a session started at all
  //    XRSession visibilitychange   the real one. Lifting a Quest off the
  //                             face drives visibilityState to hidden /
  //                             visible-blurred; putting it back on returns
  //                             it to visible.
  //  welcomeAwaySec is what separates "the next person" from "the system
  //  menu blinked". Without it the Quest's own menu -- which blurs the
  //  session for about a second -- re-triggers the greeting mid-visit,
  //  which is worse than never greeting at all.
  welcomeAwaySec:      6.0,   // seconds away before a return counts as NEW
  welcomeCooldownSec: 20.0,   // hard floor between two greetings
  //  34 words across the measured 16.5 s of Voice.mp3 -- so the last word
  //  lands as the voice finishes rather than the type racing ahead of it or
  //  trailing behind. If the voice clip is ever re-recorded this is the one
  //  number to re-measure.
  welcomeSpeechSec:   16.5,
  welcomeHoldSec:      2.5,   // the finished line holds, then goes
  welcomeFadeSec:      0.8,
  //  SOFT-FOLLOW, not head-lock. Parked in front and easing toward wherever
  //  the visitor is looking: findable if they turn away, never glued to the
  //  face. A hard head-lock for 16 s is a reliable way to make someone
  //  motion-sick, and this piece has already had one motion-sickness note
  //  from the exhibition floor (see updateSlowField).
  welcomeDist:         1.6,   // metres in front of the camera
  welcomeHeight:      -0.10,  // relative to eye height -- just below centre
  welcomeWidth:        1.9,   // metres wide, at that distance
  welcomeFollowTau:    0.55,  // seconds; bigger = lazier follow
  welcomeTexW:      1024,     // the type canvas. 2:1, redrawn per frame
  welcomeTexH:       512,     // while letters are still arriving.
  //  v9.1: LETTER BY LETTER, not word by word, each one fading up on its
  //  own easeInOut ramp. welcomeLetterSec is the stagger between one
  //  letter starting and the next; welcomeLetterFade is how long each
  //  individual letter takes to reach full opacity. The fade is
  //  deliberately several times the stagger, so a soft wave travels along
  //  the line rather than characters snapping on one at a time.
  welcomeLetterFade: 0.42,   // seconds, per letter, faded with easeInOut
  //  ...and the type is laid out ONCE, from the complete string, before
  //  anything is revealed. Laying it out from only the visible characters
  //  is what made the block re-wrap and re-centre on every new line, so
  //  the whole paragraph jumped as it typed. Nothing moves now: the frame
  //  is fixed and only per-letter alpha changes.
  welcomeFontSize:   50,     // px on the canvas
  welcomeLineGap:    1.34,   // line height, x font size
  //  v9.2: how far below its final line a letter starts, in canvas px.
  //  It rides the same eased ramp as the fade, so each glyph lifts into
  //  place as it appears. Kept small -- a big drop turns a paragraph into
  //  a slot machine, and the layout itself never moves, only the glyph on
  //  its way to it.
  welcomeLetterRise: 26,

  // ============================================================
  //  born butterflies (v7)
  // ============================================================
  //  Accepting a name now BIRTHS a butterfly out of it: it bursts from
  //  where the name hangs, flies outward past the swarm, and joins a
  //  wide orbit carrying the name as a label. See js/born.js.
  //
  //  Everything here rather than in born.js/wing-paint.js for the same
  //  reason as every other number in this file -- there is no dev panel,
  //  so there is nothing to open in a headset and one file to change.

  // ---- how many, and where they end up ----
  //  CAPPED, and the cap matters twice over. Scene weight is the obvious
  //  one (VERSION.md puts v3 at 268 objects against a 180 budget; each
  //  born butterfly is ~4 more). The subtle one is that Wings.forDials
  //  is an LRU of 64 that REDRAWS INTO an evicted record's canvas -- so
  //  a live material can silently change wing shape if the cache ever
  //  turns over. 26 letters + 12 born = 38 keeps it dormant.
  bornMax:      12,
  //  Outside the swarm's own 1.0-2.4 m orbit by a clear margin, so a
  //  born butterfly is never mistaken for a letter and never flies
  //  through the keyboard the visitor is still using.
  bornRadMin:   3.2,
  bornRadMax:   4.5,
  bornHgtMin:   1.15,
  bornHgtMax:   2.60,
  //  Bigger than the largest letter butterfly (sizeMin+sizeRange = 1.05).
  //  It is further away and it is the point of the whole interaction, so
  //  it earns the extra angular size.
  bornSize:     1.30,

  // ---- the birth ----
  bornBurstTime: 1.10,      // seconds scaling up and launching outward
  bornOutTime:   2.40,      // seconds easing out to the orbit radius
  bornFadeTime:  1.60,      // seconds fading out when pushed past the cap
  bornBurstSpin: 2.20,      // radians/sec of roll during the burst

  // ---- the showcase (v9): the birth is SEEN before it leaves ----
  //  Through v8 a born butterfly went burst -> out -> orbit, which meant
  //  the wing it had just painted -- the one textured object in the piece,
  //  and the entire payoff of standing there spelling your name -- was
  //  only ever read at 3.2-4.5 m, in flight, at an angle. The visitor
  //  never actually SAW the thing they made.
  //
  //  So a state now sits between burst and out: it climbs to a point in
  //  front of the visitor's face, stops dead, and beats its wings slowly
  //  for two seconds with nothing else moving. Then it leaves exactly as
  //  before.
  //
  //  THE ANCHOR IS FROZEN ON ENTRY, not tracked per frame. "Not moving in
  //  position" is the brief, and a point that chases the head is a point
  //  that never holds still. The cost is that someone who turns right
  //  round during those two seconds loses sight of it; the alternative --
  //  a butterfly welded to the face -- is worse, and the soft-follow
  //  compromise the welcome text uses is wrong here because the stillness
  //  IS the effect.
  bornShowcaseTime:      2.00,  // seconds held dead still. The brief.
  bornShowcaseRiseTime:  0.55,  // seconds climbing from the burst to it
  bornShowcaseDist:      0.72,  // metres in front of the camera -- inside
                                 // the swarm's radMin (1.0) is deliberate:
                                 // nothing else is allowed this close, so
                                 // for two seconds it owns the view
  bornShowcaseRise:      0.05,  // metres above eye height. Slightly up, so
                                 // it reads as presented rather than dropped
  bornShowcaseScale:     1.15,  // a touch bigger than its flying size
  //  A SLOW beat, against the 15-22 rad/s the same butterfly cruises at.
  //  The wings have to move -- a motionless butterfly is a specimen pinned
  //  in a case, which is the opposite of what this piece is about -- but
  //  at cruising rate the wing is a blur and the texture is unreadable,
  //  which would defeat the entire point of stopping.
  bornShowcaseFlapSpeed: 2.20,  // radians/sec
  bornShowcaseFlapAmp:   0.62,  // radians; gentler than flight's 1.0-1.35
  //  Substituted for CFG.readRoll while showcasing. readRoll (0.84) solves
  //  for a three-quarter aspect, which is right for a butterfly in flight
  //  and wrong for one presenting itself.
  //
  //  MIND THE DIRECTION -- it is the opposite of what it looks like, and
  //  getting it backwards is how this was first written. presentRoll()
  //  solves for `want = PI/2 - roll`, and the wing plane's visibility goes
  //  as |cos(want)|. So a roll near ZERO gives want near PI/2, whose
  //  cosine is ~0: the wing turns EDGE-ON and a flat plane seen edge-on
  //  renders as literally nothing. The butterfly vanished mid-showcase.
  //  Maximum wing area is roll near PI/2, where want ~ 0 and the cosine is
  //  ~1. Hence 1.50 rather than the 0.12 this started as.
  bornShowcaseRoll:      1.50,
  //  v9.1: UPRIGHT ON SCREEN. The showcase presents the wing broadside,
  //  but the body still lay across the view -- the butterfly was
  //  sideways. This is a screen-space roll applied on top, turning the
  //  body axis vertical so it stands up facing the reader the way a
  //  specimen is mounted. PI/2 is a quarter turn.
  bornShowcaseUpright:   1.5708,

  // ---- v9.1: the glow on the born butterfly ----
  //  CLAUDE.md is emphatic -- "no blur, no bloom, no gradients, no soft
  //  glow anywhere" -- and that rule still governs the 26. But the born
  //  butterfly is already documented as the ONE place the flat rule is
  //  deliberately suspended (see "The painted wing"), so a glow belongs
  //  to it and to nothing else in the room.
  //
  //  NOT a post-processing bloom pass. A real bloom needs an
  //  EffectComposer, a second render target and a multi-tap blur every
  //  frame -- on a Quest that is a serious cost for one object, and
  //  A-Frame has no composer wired in here. This is instead two additive
  //  billboarded sprites behind the butterfly carrying a radial falloff,
  //  which is what a bloom LOOKS like from the front and costs two quads.
  //  Additive blending is what makes it read as light rather than as a
  //  grey disc: it can only ever brighten what is behind it.
  bornGlow:          true,
  //  MULTIPLES OF bornSize * scale, which is the model's scale MULTIPLIER
  //  and not its extent -- the mesh measures about half of it across. So
  //  these read smaller than they look: 0.62 puts the core a little wider
  //  than the wings and 1.00 puts the halo at about twice them. The first
  //  pass used 2.6 / 4.4 on the assumption that the multiplier WAS the
  //  size, which produced sprites 4.4 and 7.5 metres across on a butterfly
  //  0.72 across, seventy centimetres from the visitor's face -- the glow
  //  filled the entire view with flat colour and the piece looked broken.
  bornGlowScale:     0.62,   // the inner core
  bornGlowOuter:     1.00,   // ...and the wide soft halo
  bornGlowOpacity:   0.30,   // the core, at full showcase
  bornGlowOuterOpacity: 0.15,
  bornGlowPulse:     0.16,   // how much it breathes, as a fraction
  bornGlowPulseRate: 1.7,    // radians/sec
  //  Away from the showcase the glow stays, quieter -- the born butterfly
  //  is the only lit thing in the room and it should read that way at
  //  orbit distance too, just not at presentation strength.
  bornGlowFlight:    0.45,   // multiplier once it is out flying

  // ---- v9.2: the showcase dims the room and enlarges the name ----
  //  While the newborn is being presented, everything ELSE fades back and
  //  its name grows. The point is contrast: the butterfly and its label
  //  are the only two things that matter for those two seconds, and the
  //  26 flat silhouettes still wheeling around behind them are noise.
  //
  //  "Keep the same value of light for name and butterfly" -- so the dim
  //  is applied to everything EXCEPT those two. Neither the butterfly's
  //  own opacity nor the label's is touched; what changes is the world
  //  around them.
  bornDimAmount:     0.72,   // how far the rest of the scene fades, 0..1
  bornDimEase:       0.45,   // seconds to fade down, and back up again
  bornShowcaseLabel: 2.4,    // x the label's normal size while presenting
  //  How far the SKY darkens, as a fraction of the swarm's own dim. Less
  //  than 1: a white room going to near-black behind a butterfly is a
  //  stage blackout, and this wants to read as attention narrowing rather
  //  than as the lights being cut. In an AR session the sky is hidden and
  //  the real room shows through, so this does nothing there -- a
  //  passthrough feed cannot be dimmed, and the swarm/name fade is what
  //  carries the effect in the headset.
  bornDimSky:        0.55,

  // ============================================================
  //  the wave (v9.2)
  // ============================================================
  //  Sweep a hand quickly and the butterflies near it are pushed ALONG
  //  the direction of the sweep -- not away from the hand, which is what
  //  the existing scatter already does. The two are different gestures
  //  and read differently: scatter is "something moved past me", wave is
  //  "a gust came through".
  //
  //  SPATIALLY LOCALIZED, deliberately and per the brief. The force falls
  //  off to nothing by waveRadius, so a wave disturbs the part of the
  //  flock it passes through and leaves the rest flying exactly as it
  //  was. Moving the whole swarm at once would read as the room tilting,
  //  which is both wrong and a motion-sickness risk.
  waveMinSpeed:   0.85,   // m/s before a hand counts as waving at all
  waveMaxSpeed:   3.20,   // ...and where its force stops growing
  waveRadius:     1.25,   // metres; past this a butterfly feels nothing
  waveForce:      7.00,   // the push along the sweep direction
  //  THE FLUID PART. A pure directional shove moves a group of
  //  butterflies as one rigid block, which looks like a slide rather than
  //  like air. Curl noise sampled at each butterfly's own position
  //  rotates the push per-butterfly, so the group shears and swirls
  //  through the gust the way things in a real draught do -- neighbours
  //  get subtly different directions and the flock deforms instead of
  //  translating.
  waveCurl:       0.85,   // how far the noise can bend the push, radians
  waveCurlScale:  0.55,   // spatial scale of the swirl, metres
  waveCurlDrift:  0.35,   // how fast the field itself churns
  waveSwirl:      2.60,   // strength of the perpendicular (vortex) term
  //  How long a gust keeps acting after the hand stops. The butterflies'
  //  own damping and their spring back to the flight path do the rest --
  //  which is what makes "the force comes back to normal" free rather
  //  than something that needs its own release code.
  waveDecayTau:   0.30,

  // ============================================================
  //  the tutorial cards (v9.1)
  // ============================================================
  //  Two prompts, each an icon beside a line of type:
  //
  //    pinch     after the welcome finishes -- how to catch a letter
  //    point     after the green control is pressed -- how to see what
  //              you made
  //
  //  Each one ARRIVES BIG AND CENTRED, holds for tutorialHoldSec so it
  //  cannot be missed, then shrinks and docks to the top right, where it
  //  stays as a reminder.
  //
  //  DOCKED MEANS HEAD-LOCKED, and this is the one place in the piece
  //  where that is the right answer rather than the wrong one. The brief
  //  is explicit -- "when the users move around, it will follow and stay
  //  exactly on the same spot" -- so the docked card is parented to the
  //  camera and sits at fixed screen coordinates. It is small, static and
  //  peripheral, which is precisely the case where head-locking does not
  //  cause the discomfort that head-locking a big moving thing does.
  tutorialHoldSec:    2.0,   // seconds big and centred, per the brief
  //  The point card waits before it appears. Pressing the green control
  //  is the loudest moment in the piece -- the winner sound fires, the
  //  flower bounces, and a butterfly bursts out of the name -- and a
  //  prompt landing on top of all that is one thing too many to look at.
  //
  //  Five seconds clears the birth completely: burst (1.10) + rise (0.55)
  //  + showcase hold (2.00) = 3.65 s, plus the flight out. The prompt to
  //  go looking for the butterfly arrives once it has actually gone
  //  somewhere to look for it, rather than while it is still being
  //  presented.
  tutorialPointDelaySec: 5.0,
  //  The pinch card has NO delay -- it is chained straight off the
  //  greeting's fade-out, and it is the prompt a visitor needs before they
  //  can do anything at all.
  //
  //  The waving card is not on a timer either: it is chained to the point
  //  card reaching its docked position (see tutorial.js `next`). Two
  //  cards racing each other on independent delays would eventually
  //  overlap in the middle of the view; chaining makes that structurally
  //  impossible however the timings are retuned.
  //  Docked cards STACK, top-right downward, in the order they arrive.
  tutorialStackGap:   0.62,  // x card height, between docked cards
  tutorialFadeSec:    0.55,  // opacity easeInOut, in and out
  tutorialMoveSec:    0.85,  // the shrink-and-dock, also eased
  tutorialBigDist:    1.35,  // metres out, while centred
  tutorialBigWidth:   1.30,  // metres wide, while centred
  tutorialBigY:      -0.02,  // relative to eye height
  //  WHERE IT LANDS, as a FRACTION OF THE VIEWPORT rather than as metres.
  //
  //  Fixed metre offsets were the first attempt and they do not survive
  //  leaving the desktop: how far 0.42 m to the right actually is on
  //  screen depends entirely on the camera's field of view and aspect, so
  //  a card tuned to sit in the corner of a browser window lands near the
  //  middle of a Quest's much wider view. tutorial.js works these back
  //  through the live projection instead, so "top right corner" means the
  //  same thing on every display it is ever shown on.
  //  1.0 would be exactly the edge; these leave a margin.
  tutorialDockDist:   1.00,
  tutorialDockFracX:  0.70,  // of the half-width, toward the right edge
  tutorialDockFracY:  0.66,  // of the half-height, toward the top
  tutorialDockWidth:  0.46,  // metres wide once docked, at dockDist
  tutorialTexW:      1024,
  tutorialTexH:       256,   // 4:1 -- an icon and one line beside it
  tutorialIconFrac:   0.20,  // the icon's share of the canvas width

  // ---- the name, carried ----
  //  Angular like the letters (CFG.letterAngular): a label at 4.5 m at a
  //  fixed world size would be unreadable, so it scales with distance
  //  and clamps at both ends.
  bornLabelAngular: 0.085,   // world height per metre of distance
  bornLabelMin:     0.10,
  bornLabelMax:     0.30,
  bornLabelOpacity: 0.92,
  bornLabelDrop:    0.30,    // how far under the body it hangs, x size

  // ---- the wing texture (js/wing-paint.js) ----
  //  ONE key per layer, so the whole look dials from wild to restrained
  //  without touching the painter. This is the one place in the piece
  //  where gradients and soft edges are allowed -- see wing-paint.js's
  //  header for why that is deliberate and why it is only ever one
  //  object in the room.
  bornTexSize:   256,      // outward axis; the canvas is this x2 tall.
                            // THE performance lever: halving it is 4x
                            // cheaper. 256 -> 256x512 -> 131k pixels.
  //  ============================================================
  //  v9: EVERY STRUCTURAL KNOB BELOW IS NOW A RANGE, NOT A NUMBER
  //  ============================================================
  //  The complaint was exact and the cause was structural: through v8
  //  every wing ran the same six layers with the same constants -- 7
  //  bands, 7 veins, 3 margin chevrons, one frequency, one warp pair.
  //  The ONLY things that varied per name were the hue, the noise seed,
  //  and the eyespot count. So every butterfly really was one pattern in
  //  a different colour, exactly as reported.
  //
  //  Now each of these is sampled per name from a Min/Max pair, using the
  //  deterministic PRNG wing-paint.js already seeds off the name
  //  (Noise.rng(seedInt)). That keeps the guarantee that matters -- the
  //  same name always gives the same butterfly, on any machine, in any
  //  session, because the name is the save file -- while making two
  //  different names structurally different creatures rather than two
  //  colourways of one.
  //
  //  v8's old fixed value sits inside each range, so the wing everyone
  //  has been looking at is still one of the possible draws.
  bornBandsMin:  4,        // posterisation steps. Low = flat poster,
  bornBandsMax:  12,       // high = continuous. Under ~4 loses the
                            // markings, over ~14 stops reading as bands.
  bornOctavesMin: 4,       // fBm octaves in the base field
  bornOctavesMax: 6,
  //  The base noise field IS the cost of a wing -- measured at ~107 ms
  //  of a ~110 ms paint, with every other layer inside the noise floor.
  //  So it is evaluated at 1/this resolution and interpolated back up,
  //  which is a quarter of the work at div 2. The posterisation still
  //  runs at FULL resolution afterwards, so every band edge stays razor
  //  sharp -- see the long note in wing-paint.js:paintBase. 1 = off.
  //  NOT a range: it is the performance budget, not a look.
  bornFieldDiv:  2,
  bornFreqMin:   2.0,      // base field frequency across the slice. Low is
  bornFreqMax:   6.5,      // a few big continents, high is fine mottling --
                            // on its own this is a large part of "a
                            // different species" rather than "a re-tint".
  bornWarp1Min:  0.30,     // first domain warp -- the big shapes
  bornWarp1Max:  0.85,
  bornWarp2Min:  0.12,     // second warp, applied to the first. THIS is
  bornWarp2Max:  0.55,     // what makes it look grown; 0 reads as fog.
  bornVeinCountMin: 0,     // veins radiating from the wing root. 0 is a
  bornVeinCountMax: 11,    // deliberate draw -- plenty of real species read
                            // as flat colour fields with no visible venation
                            // at all, and it is a strong point of contrast.
  bornVeinWidthMin: 0.045, // angular half-width at the root
  bornVeinWidthMax: 0.140,
  bornVeinDarkMin:  0.45,  // how hard a vein bites into the field
  bornVeinDarkMax:  0.90,
  bornMarginBandsMin: 0,   // chevrons parallel to the outer edge; 0 = off
  bornMarginBandsMax: 6,
  bornEyespotMin: 0,       // ocelli, per wing. The fastest-reading
  bornEyespotMax: 4,       // "this is a butterfly" signal there is -- but
                            // 0 is now reachable, because a wing that has
                            // them every single time stops being a signal.
  bornEyespotRadMin: 0.040,
  bornEyespotRadMax: 0.115,
  bornShimmerMin: 0.010,   // scale-sized grain, as a fraction of lightness
  bornShimmerMax: 0.045,
  bornSat:       92,       // per cent. High, like everything else here.
  bornLitLo:     34,       // the lightness band the ramp spans -- chosen
  bornLitHi:     62,       // to hold up against the white sky

  // ---- v9: the optional pattern layers ----
  //  The ranges above vary the DEGREE of one pattern. These add different
  //  patterns outright, which is what actually answers "I want more".
  //  Each name draws bornLayerMin..Max of them from the menu in
  //  wing-paint.js:pickLayers(), so the look is combinatorial rather than
  //  a single axis: stripes over a marbled base with a checkered fringe is
  //  a different creature from a spotted one with an apical patch.
  bornLayerMin:  2,
  bornLayerMax:  4,
  //  Per-layer strength bands, all sampled per name.
  bornStripeCountMin:  3,   // transverse stripes, running root->tip
  bornStripeCountMax:  11,
  bornStripeDark:      0.55,
  bornApicalSize:      0.34, // apical patch: fraction of the wing tip
  bornFringeCountMin:  6,    // checkered fringe blocks along the margin
  bornFringeCountMax:  16,
  bornSpotCountMin:    12,   // small scattered dots (not eyespots)
  bornSpotCountMax:    46,
  bornStreakCountMin:  3,    // wide bright rays from the root
  bornStreakCountMax:  8,
  bornReticFreq:       9.0,  // marbled cell-boundary web
  bornBlotchFreq:      2.2,  // large irregular patches

  // ---- the born butterfly's sound ----
  //  Its own falloff band, and this is REQUIRED rather than a nicety.
  //  The swarm's numbers (ref 0.7 / max 5.0 / rolloff 1.8) are tuned for
  //  a 1.0-2.6 m orbit; a born butterfly at 3.2-4.5 m would land at
  //  essentially zero gain under them and simply never be heard.
  //  Linear model: gain = 1 - rolloff * (d - ref) / (max - ref).
  //  These give roughly 0.75 at the near edge down to 0.45 at the far.
  audioBornVolume:      0.85,
  audioBornRefDistance: 2.2,
  audioBornMaxDistance: 12.0,
  audioBornRolloff:     0.62,

  // ============================================================
  //  the mark on each control, and pointing (v8)
  // ============================================================

  // ---- the icons ----
  //  Drawn in CFG.bg white so each reads as a hole punched through the
  //  petals, the same language the wings use for their letters. As a
  //  fraction of the flower's own lobe radius, so both marks scale with
  //  the shapes they sit on rather than needing a size each.
  ctlIconScale: 0.95,

  // ---- the point gesture ----
  //  Index extended while the other three curl. The measure is the GAP
  //  between the index's wrist distance and the mean of the other three
  //  -- see hands.js. On an adult hand a flat palm sits near 0 (every
  //  finger out the same), a fist near 0, and a real point runs about
  //  0.05-0.09 m. THE TWO MOST LIKELY NUMBERS TO NEED TUNING ON A
  //  HEADSET: too low and a relaxed hand triggers it, too high and a
  //  deliberate point is ignored. Two values, not one, so it cannot
  //  chatter across the boundary.
  pointOn:     0.045,       // metres of spread to START pointing
  pointOff:    0.032,       // ...and to fall back out of it

  //  How far down the ray the aim point sits. Put inside the born
  //  butterflies' own orbit band (bornRadMin..bornRadMax, 3.2-4.5 m) so
  //  a natural point lands among them rather than in front of or behind
  //  the whole swarm.
  pointReach:  3.6,

  // ---- what the aim point does to the born swarm ----
  //  v9 REWRITES THE FEEL OF ALL OF THIS. v8's version worked but read as
  //  frantic: it snapped on, it whipped when the hand moved, and -- the
  //  specific complaint -- butterflies right across the room were still
  //  being dragged around. What follows is the same machinery, tuned to
  //  be a suggestion rather than a command.
  //
  //  INFLUENCE FALLS OFF WITH DISTANCE, TO EXACTLY ZERO.
  //
  //  v8 scaled the RATE by proximity but left the TARGET (`want`) at 1 for
  //  every butterfly regardless of distance, with a pointNearFloor of 0.30
  //  underneath it. Between them, a butterfly on the far side of the room
  //  still ended up fully gathered, just later -- which is precisely what
  //  "far ones should have zero influence" is not.
  //
  //  So in v9 `want` itself is distance-faded and the floor is gone. Past
  //  pointFalloff a butterfly's target pull is a true 0 (smoothstep
  //  reaches zero, it does not merely approach it), and born.js snaps the
  //  eased tail to exact zero so its flight is bit-for-bit the un-pointed
  //  flight rather than carrying a permanent 0.005 residue.
  //
  //  Spans the real geometry: the born swarm orbits the origin at
  //  3.2-4.5 m and the aim point sits 3.6 m out from it, so distances
  //  from a butterfly to the aim point run about 0 to 8 m. THE ONE NUMBER
  //  TO WATCH: v8's notes record an earlier distance-gated `want` that
  //  left every pull at 0 because the falloff (4.2) was shorter than the
  //  typical distance. At 8.0 a butterfly at 5 m lands near want 0.23 --
  //  weak on purpose. If the gesture ever reads as dead, raise THIS, and
  //  never reintroduce a floor.
  pointFalloff:      8.0,   // metres; at or past this, influence is zero
  //  Was 0.30 -- "the furthest still answers at 30%". That is the line
  //  that made distant butterflies follow, and it is now 0. Kept as a
  //  named number rather than deleted so the intent is legible and it can
  //  be lifted again for one build if anyone wants to compare.
  pointNearFloor:    0.0,
  //  How tight the gathered cluster closes. 0.85 was a ball; at 1.7 they
  //  loosely surround the aim point instead of piling onto it, which is
  //  what "don't make them fly wildly around my pointing" wants.
  pointGatherRadius: 1.70,  // metres, the orbit they close to once gathered
  //  AND A CEILING ON THE PULL ITSELF. Even the nearest butterfly never
  //  reaches a pull of 1, so the gather is always partial -- the swarm
  //  leans toward your finger, it never commits to it. This is the single
  //  knob that most directly delivers "just move a bit toward the pointing
  //  point, don't follow strictly".
  pointMaxPull:      0.55,

  //  HOW FAST THEY RESPOND scales with how fast the hand is moving, and
  //  is CLAMPED AT BOTH ENDS. The clamp is the entire point: an
  //  unclamped follow with a quick hand flings the swarm across the room
  //  every frame, which is exactly the mess this is meant not to be.
  //  A still hand still gathers, just gently (pointEaseMin).
  //  Measured in v8, gathering five butterflies from a 3-5 m spread to the
  //  aim point, mean distance remaining:
  //
  //      easeMin   1s     2s     3s     5s
  //        0.35   3.54   4.58   2.50   2.27   far too slow to feel aimed
  //        0.90   2.36   1.35   1.47   0.96
  //        1.30   1.72   1.21   1.02   0.87   <- v8 shipped this
  //        1.80   1.83   1.04   0.88   0.85
  //
  //  v9 deliberately steps BELOW that table, to 0.50. The table was
  //  measuring how fast the swarm arrives, and v8 optimised for arriving;
  //  the brief here is the opposite -- reduce the force and the speed, and
  //  blend softly at both ends. Arriving late is now the desired result,
  //  and the smoothstep on pull (born.js) softens the start and stop
  //  further still.
  pointEaseMin:   0.50,     // per second, with the hand still  (was 1.30)
  pointEaseMax:   1.10,     // per second, however fast the hand (was 3.00)
  pointSpeedGain: 0.20,     // ease gained per m/s of hand speed (was 0.55)
  pointSpeedTau:  0.12,     // seconds, EMA on hand speed -- readSources()
                             // leaves its own speed raw, which is fine for a
                             // thresholded scatter impulse and far too noisy
                             // to drive a continuous follow
  pointSpeedMax:  2.5,      // m/s, hand speed is clamped before it is used
  //  A hard ceiling on how fast a butterfly's orbit CENTRE travels. The
  //  rates above are rates, and a rate applied to a big gap is still a
  //  big jump -- a centre 4 m from a flicked aim point would cross at
  //  12 m/s. Whipping the aim around measured peaks of 7.1 m/s without
  //  this. Nothing else in the piece moves near that quickly.
  //  v9 halves it again: with the spring below able to overshoot, the cap
  //  is now what guarantees the overshoot stays a lean and not a lunge.
  pointCentreMaxSpeed: 0.90, // m/s  (was 2.2)

  //  A SMALL OVERSHOOT. v8 lerped the orbit centre toward the aim point,
  //  and a lerp approaches from one side only -- it can never overshoot,
  //  however it is tuned. That is the same observation CFG.ctlSpring makes
  //  about the controls' press bounce, and the same fix applies: a spring
  //  with damping under 1 passes the target, comes back, and rings down.
  //  Kept deliberately gentle -- this is a drift past the point, not a
  //  bounce off it. pointCentreMaxSpeed still clamps the result.
  pointSpringK:    9.0,     // stiffness
  pointSpringDamp: 0.72,    // <1 overshoots; ~0.7 gives one soft pass

  //  ORBIT RATE while gathered, also capped -- the cluster should circle
  //  the aim point steadily, not spin up into a blur. v9 more than halves
  //  it: at 0.55 the gathered cluster visibly raced around the finger,
  //  which is the "flying wildly around my pointing interaction" the brief
  //  calls out.
  pointOrbitRate:  0.25,    // radians/sec at full gather  (was 0.55)
  pointReleaseTau: 2.20,    // seconds, how gradually they let go and drift
                             // back out to their own wide orbits. Nearly
                             // doubled in v9 (was 1.30): letting go was the
                             // more abrupt of the two transitions.
  //  Below this, pull and the orbit centre are snapped to EXACT zero.
  //  An exponential decay asymptotes and never arrives -- v8 measured pull
  //  settling at 0.0057 with the centre 18 mm off the origin, forever.
  //  Invisible, but "a far butterfly is completely uninfluenced" is either
  //  true or it is not.
  pointPullEpsilon: 0.01,
  //  ...and the same idea for the orbit centre, which needs a far more
  //  generous threshold than the pull does. orbitAt() adds the centre to
  //  the position WITHOUT scaling it by pull, so a centre still sitting a
  //  few centimetres off the origin is still a displaced orbit even once
  //  the pull is a clean zero. Measured at 0.116 m thirty seconds after
  //  release with a hairline threshold. 6 cm is well under what anyone can
  //  see on a butterfly 4 m away, and it actually arrives.
  pointCentreSnap:  0.06    // metres
};

CFG.letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// --- normalized roll -> live value, exactly v2's mapping -------------
CFG.sizeFor   = function (t) { return CFG.sizeMin + CFG.sizeRange * Math.pow(t, CFG.sizeExp); };
CFG.radiusFor = function (t) { return CFG.radMin + (CFG.radMax - CFG.radMin) * t; };
CFG.heightFor = function (t) { return CFG.hgtMin + (CFG.hgtMax - CFG.hgtMin) * t; };

// Anything mounted flat on the panel, at (x, y) in front of the visitor.
CFG.panelPos = function (x, y) {
  return new THREE.Vector3(x, CFG.eyeY + y, -CFG.panelR);
};
