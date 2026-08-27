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
  audioSwooshRateMax: 1.25,

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
  bornBands:     7,        // posterisation steps. Low = flat poster,
                            // high = continuous. Under ~4 loses the
                            // markings, over ~14 stops reading as bands.
  bornOctaves:   5,        // fBm octaves in the base field
  //  The base noise field IS the cost of a wing -- measured at ~107 ms
  //  of a ~110 ms paint, with every other layer inside the noise floor.
  //  So it is evaluated at 1/this resolution and interpolated back up,
  //  which is a quarter of the work at div 2. The posterisation still
  //  runs at FULL resolution afterwards, so every band edge stays razor
  //  sharp -- see the long note in wing-paint.js:paintBase. 1 = off.
  bornFieldDiv:  2,
  bornFreq:      3.4,      // base field frequency across the slice
  bornWarp1:     0.55,     // first domain warp -- the big shapes
  bornWarp2:     0.32,     // second warp, applied to the first. THIS is
                            // what makes it look grown; 0 reads as fog.
  bornVeinCount: 7,        // veins radiating from the wing root
  bornVeinWidth: 0.085,    // angular half-width at the root
  bornVeinDark:  0.72,     // how hard a vein bites into the field
  bornMarginBands: 3,      // chevrons parallel to the outer edge; 0 = off
  bornEyespotMin: 1,       // ocelli, per wing. The fastest-reading
  bornEyespotMax: 3,       // "this is a butterfly" signal there is.
  bornShimmer:   0.022,    // scale-sized grain, as a fraction of lightness
  bornSat:       92,       // per cent. High, like everything else here.
  bornLitLo:     34,       // the lightness band the ramp spans -- chosen
  bornLitHi:     62,       // to hold up against the white sky

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
  //  INFLUENCE FALLS OFF WITH DISTANCE. A butterfly already near where
  //  you are aiming is taken firmly; one across the room barely notices.
  //  Past pointFalloff it is left alone entirely.
  //  Spans the real geometry: the born swarm orbits the origin at
  //  3.2-4.5 m and the aim point sits 3.6 m out from it, so distances
  //  from a butterfly to the aim point run about 0 to 8 m. A falloff
  //  much under that leaves most of the swarm permanently out of range
  //  -- measured at 4.2, every pull sat at exactly 0 and the gesture did
  //  nothing at all.
  pointFalloff:      8.0,   // metres, over which the response tapers
  //  ...and how briskly the FURTHEST butterfly still answers, as a
  //  fraction of the nearest one's rate. Never 0: a butterfly across the
  //  room should arrive late, not refuse to come.
  pointNearFloor:    0.30,
  pointGatherRadius: 0.85,  // metres, the orbit they close to once gathered

  //  HOW FAST THEY RESPOND scales with how fast the hand is moving, and
  //  is CLAMPED AT BOTH ENDS. The clamp is the entire point: an
  //  unclamped follow with a quick hand flings the swarm across the room
  //  every frame, which is exactly the mess this is meant not to be.
  //  A still hand still gathers, just gently (pointEaseMin).
  //  Measured, gathering five butterflies from a 3-5 m spread to the
  //  aim point, mean distance remaining:
  //
  //      easeMin   1s     2s     3s     5s
  //        0.35   3.54   4.58   2.50   2.27   far too slow to feel aimed
  //        0.90   2.36   1.35   1.47   0.96
  //        1.30   1.72   1.21   1.02   0.87   <- visibly moving at once,
  //        1.80   1.83   1.04   0.88   0.85      settled by ~3s
  //
  //  1.30 is the one that starts answering inside a second and is done
  //  in about three, without the swarm snapping to the finger.
  pointEaseMin:   1.30,     // per second, with the hand still
  pointEaseMax:   3.00,     // per second, however fast the hand moves
  pointSpeedGain: 0.55,     // ease gained per m/s of hand speed
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
  pointCentreMaxSpeed: 2.2, // m/s

  //  ORBIT RATE while gathered, also capped -- the cluster should circle
  //  the aim point steadily, not spin up into a blur.
  pointOrbitRate:  0.55,    // radians/sec at full gather
  pointReleaseTau: 1.30     // seconds, how gradually they let go and drift
                             // back out to their own wide orbits
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
