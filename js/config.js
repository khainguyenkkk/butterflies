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
  audioBflyCount:     3,      // how many of the 26 keys carry a sound
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
  audioSwooshRateMax: 1.25
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
