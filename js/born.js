// ============================================================
//  born.js  --  the name becomes a butterfly
// ============================================================
//  This is the generation stage every version so far has left open.
//  v3's app.js says it plainly:
//
//      v3 stops at the input stage on purpose. The keyboard collects a
//      name and fires one event; generating a butterfly from that name
//      and releasing it into the kaleidoscope is the next version's
//      work.
//
//  And CLAUDE.md names the one hard part -- "how an n-letter name maps
//  onto the generator's four values, stably and well spread". That is
//  nameToDials() below.
//
//  WHAT HAPPENS. Pressing the green control births one butterfly out of
//  the assembled name. It bursts from exactly where the name hangs --
//  the letters you caught turning into the creature, which is the whole
//  idea of the piece in one movement -- flies outward past the swarm,
//  and settles into a wide orbit carrying the name as a label. It is
//  the only textured thing in the room (see wing-paint.js) and it
//  carries one of the three butterfly sounds, spatialised the same way
//  the swarm's three are.
//
//  FOUR STATES, deliberately mirroring keyboard.js's own state machine
//  so the two read as the same kind of object:
//
//    burst    scaling up from nothing at the name, launching outward
//    out      easing outward to its orbit radius
//    orbit    wide circling flight
//    leaving  fading out and disposing, when pushed past the cap
//
//  WHY A SEPARATE COMPONENT rather than more keys in keyboard.js: these
//  are not keys. They are never pickable, never captured, never part of
//  targets(), and they must survive keyboard.js:reset() -- which wipes
//  the name and everything about the current visitor 3.2 s after they
//  accept. A born butterfly outliving that reset is the entire point.
//
//  DEPENDS ON keyboard.js's module-scope globals -- makeFbm, smoothstep,
//  rand, UP -- so its <script> tag must come after keyboard.js's. That
//  is the same implicit sharing the project already relies on for
//  dialsForLetter, BODY_ALPHA and CFG.
// ============================================================

//  The singleton app.js talks to. Set by the component's init().
var Born = {
  _c: null,
  spawn: function (name) {
    if (!this._c) {
      console.warn('[born] no born-butterflies entity in the scene');
      return;
    }
    return this._c.spawn(name);
  }
};

// ---------------- name -> the generator's four values ----------------
//  THE OPEN QUESTION FROM CLAUDE.md, answered.
//
//  FNV-1a over the characters, four times with four different offset
//  bases. Three properties matter and this has all of them:
//
//  STABLE. The hash runs over character codes, not floats, so the same
//  name gives the same butterfly on every machine and in every session.
//  An exhibition piece cannot re-roll a visitor's butterfly in front of
//  them, and "come back tomorrow and yours is still yours" only works
//  if this is exact. (Same reasoning, and the same FNV, as
//  wing-tex.js:hashValues.)
//
//  WELL SPREAD. FNV avalanches -- one different character changes about
//  half the output bits -- so ANNA and ANNE land far apart rather than
//  adjacent. Four different offset bases rather than four salts appended
//  to the string, so the four dials decorrelate from the first character
//  rather than sharing a prefix's worth of state.
//
//  NO CLUSTERING AT THE ENDS. The dials are cyclic phases into
//  WING_ROLL_TABLE -- 0.0 and 1.0 are the same roll -- so a uniform
//  hash maps onto them with no pile-up at either end. This is exactly
//  why wing-gen.js built them as roll seeds instead of shape ramps; see
//  its header.
function fnv1a(str, basis) {
  var h = basis >>> 0;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

var BORN_BASES = [2166136261, 2166136789, 1099511628, 3141592653];

function nameToDials(name) {
  var out = [];
  for (var i = 0; i < 4; i++) {
    out.push(fnv1a(name, BORN_BASES[i]) / 4294967296);
  }
  return out;
}

function nameToSeed(name) { return fnv1a(name, 2166136261); }

//  Shared empty list, so the common case -- nobody pointing -- allocates
//  nothing on a per-frame path.
var EMPTY_FOCI = [];

//  The dominant hue, drawn from a DIFFERENT basis than any dial, so a
//  name's colour is independent of its wing shape -- two names with
//  similar shapes should not also share a palette.
function nameToHue(name) {
  return (fnv1a(name, 4026531841) / 4294967296) * 360;
}

AFRAME.registerComponent('born-butterflies', {
  init: function () {
    Born._c = this;
    this.root = new THREE.Group();
    this.el.setObject3D('mesh', this.root);
    this.born = [];
    this._camPos = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._clock = 0;
  },

  // ---------------- the birth ----------------
  spawn: function (name) {
    if (!name || !name.length) { return null; }

    var dials = nameToDials(name);
    var seed = nameToSeed(name);
    var hue = nameToHue(name);

    //  Wing SHAPE from the existing TouchDesigner-parity generator,
    //  unchanged and unaware any of this is happening -- the born
    //  butterfly is built out of the same silhouette machinery as the
    //  26, and only its colour is new.
    var rec = Wings.forDials(dials);

    //  Body takes the dominant hue as a flat fill, tying it to the
    //  wings without competing with them. Deliberately darker than the
    //  swarm's bflyLit: the body is a silhouette next to a texture, and
    //  at the swarm's own lightness it disappears against it.
    var bodyColor = 'hsl(' + Math.round(hue) + ', ' + CFG.bornSat + '%, ' +
                    Math.round(CFG.bornLitLo * 0.8) + '%)';

    //  No letter cut out of the wing -- unlike the 26, this one carries
    //  the whole NAME, as a label. Punching a single letter through a
    //  painted wing would also destroy the markings it just grew.
    //
    //  Built WITHOUT the painted map, which arrives a frame later --
    //  see paintInto() below.
    var opts = {};
    var bm = BflyModel.build(rec.tex, bodyColor, null, null, opts);

    var g = new THREE.Group();
    g.add(bm.model);
    this.root.add(g);

    //  THE LABEL HANGS OFF ITS OWN ANCHOR, never the flying group. The
    //  flying group yaws to face the heading, so a label parented inside
    //  it would swing a full circle round the body every time the
    //  butterfly turned -- the same trap keyboard.js documents and
    //  solves with k.anchor, and the same solution.
    var anchor = new THREE.Group();
    this.root.add(anchor);
    //  UI.wordmark has existed since v4, exported and never once called.
    //  It is exactly the right object: a sprite, so it always faces the
    //  camera and is never edge-on, and it condenses a long string to
    //  fit its canvas rather than letting it run off.
    var label = UI.wordmark(name, bodyColor, CFG.bornLabelMin, 0);
    anchor.add(label);

    //  Where the name hangs. The butterfly is born out of the letters
    //  the visitor caught, so it comes from exactly where they have
    //  been watching them land.
    var from = CFG.panelPos(CFG.nameX, CFG.nameY);

    //  Outward heading: away from the visitor, thrown to one side so
    //  successive births do not all take the same path out.
    var away = Math.atan2(from.z, from.x) + rand(-0.55, 0.55);

    var b = {
      name: name, seed: seed, hue: hue,
      group: g, anchor: anchor, bm: bm, label: label, opts: opts,
      paintMs: 0, painted: false,
      state: 'burst', t: 0,
      alpha: 0, scale: 0,
      size: CFG.bornSize,
      pos: from.clone(), prev: from.clone(), from: from.clone(),
      first: true, smoothRoll: 0,

      //  its orbit, once it gets there
      radius: rand(CFG.bornRadMin, CFG.bornRadMax),
      height: rand(CFG.bornHgtMin, CFG.bornHgtMax),
      phase: away,
      speed: (Math.random() < 0.5 ? -1 : 1) * rand(0.10, 0.26),
      away: away,

      //  v8: what it orbits AROUND, and how much it has been taken.
      //  `centre` is the world origin by default -- which is what every
      //  born butterfly circled in v7 -- and eases toward wherever the
      //  visitor is pointing. `pull` is 0..1 and gates everything else,
      //  so with nobody pointing all of this is inert and the flight is
      //  byte-for-byte v7's.
      centre: new THREE.Vector3(),
      pull: 0,
      gatherPh: rand(0, Math.PI * 2),

      //  the same calm noise band the swarm flies on, so a born
      //  butterfly moves like the others even though it never joins them
      wobAmp: rand(0.030, 0.085), wobFreq: rand(0.016, 0.040),
      radAmp: rand(0.06, 0.18),   radFreq: rand(0.013, 0.036),
      hgtAmp: rand(0.05, 0.14),   hgtFreq: rand(0.011, 0.030),
      nWob: null, nRad: null, nHgt: null,

      flapSpeed: rand(15, 22), flapAmp: rand(1.0, 1.35), flapPh: rand(0, 6.28),
      flapEnv: 1, gliding: false, cycleT: 1 + Math.random() * 2,
      flightT: 0,
      loop: null
    };
    var sd = rand(0, 1000);
    b.nWob = makeFbm(sd + 1.1); b.nRad = makeFbm(sd + 2.2); b.nHgt = makeFbm(sd + 3.3);
    bm.model.scale.setScalar(0.001);
    bm.setOpacity(0);

    //  One of the three butterfly clips at random, spatialised exactly
    //  the way the swarm's three are -- a PositionalAudio parented to
    //  the flying group, so three.js's ordinary scene-graph traversal
    //  pans it as the butterfly moves and there is nothing to tick.
    //  Its own falloff band though: the swarm's is tuned for a 1.0-2.6 m
    //  orbit and would leave this one inaudible out at 3.2-4.5 m.
    b.loop = SFX.attachButterflyLoop(g, Math.floor(Math.random() * 3), {
      volume:      CFG.audioBornVolume,
      refDistance: CFG.audioBornRefDistance,
      maxDistance: CFG.audioBornMaxDistance,
      rolloff:     CFG.audioBornRolloff
    });

    this.born.push(b);

    //  PAINT ON THE NEXT FRAME, not this one.
    //
    //  Painting a wing is the one genuinely expensive thing in the piece
    //  -- measured at ~40-100 ms on a desktop, and a Quest is slower.
    //  accept() is the worst possible frame to spend that on: it is the
    //  frame that plays the winner sound, bounces the green control and
    //  starts the name's flight, and blocking it would stall the exact
    //  moment the visitor is being congratulated.
    //
    //  So this frame renders the acknowledgement, and the paint lands on
    //  the next one. Nothing is visibly missing in between: the butterfly
    //  spends its first frames at scale ~0 climbing out of the name (see
    //  the burst state), so it is a speck when the wings are still
    //  unpainted, and by the time it is big enough to read it has been
    //  textured for many frames.
    var self = this;
    requestAnimationFrame(function () { self.paintInto(b); });

    //  CAPPED. Scene weight is the obvious reason (VERSION.md puts v3 at
    //  268 objects against a 180 budget), but the quiet one is that
    //  Wings.forDials is an LRU of 64 that REDRAWS INTO an evicted
    //  record's canvas -- let the cache turn over and a live butterfly
    //  silently changes wing shape. The oldest is retired rather than
    //  refused, so a visitor is never told the room is full.
    var live = this.born.filter(function (x) { return x.state !== 'leaving'; });
    if (live.length > CFG.bornMax) {
      live[0].state = 'leaving';
      live[0].t = 0;
    }
    return b;
  },

  //  The deferred paint. Guarded on `painted` and on the butterfly still
  //  being aloft -- a spawn that is immediately evicted (someone accepts
  //  thirteen names faster than the fade) must not paint a wing for a
  //  mesh that has already been disposed.
  paintInto: function (b) {
    if (b.painted || this.born.indexOf(b) < 0) { return; }
    var t0 = performance.now();
    var paint = WingPaint.paint(b.seed, b.hue);
    b.paintMs = performance.now() - t0;
    b.painted = true;

    //  three.js MULTIPLIES map by color, so the flat hue the material
    //  was built with has to go white or it would stain the whole
    //  painted texture and throw away its palette.
    b.opts.wingMap = paint.texture;          // so bm.dispose() frees it
    b.bm.wingMat.map = paint.texture;
    b.bm.wingMat.color.set('#ffffff');
    b.bm.wingMat.needsUpdate = true;         // the shader gains a map: recompile

    console.log('[born] "' + b.name + '"  wing painted in ' + b.paintMs.toFixed(1) +
                ' ms  (' + this.born.length + ' aloft)');
  },

  // ---------------- per frame ----------------
  tick: function (time, dtMs) {
    if (!dtMs || !this.born.length) { return; }
    var dt = Math.min(dtMs / 1000, 0.05);
    var t = time / 1000;
    this._clock = t;

    var cam = this.el.sceneEl.camera;
    if (cam) { cam.getWorldPosition(this._camPos); }

    this.updateAttraction(dt);

    for (var i = this.born.length - 1; i >= 0; i--) {
      if (this.tickOne(this.born[i], t, dt) === false) {
        this.disposeOne(this.born[i]);
        this.born.splice(i, 1);
      }
    }
  },

  //  Returns false when this one is finished and should be reaped.
  tickOne: function (b, t, dt) {
    b.flightT += dt;
    var ft = b.flightT;

    // ---- where it should be ----
    if (b.state === 'burst') {
      b.t += dt;
      var u = Math.min(1, b.t / CFG.bornBurstTime);
      var e = smoothstep(u);
      //  out along its chosen heading, accelerating -- e*e rather than a
      //  linear ramp, so it LEAVES rather than drifts. A birth that eases
      //  out at constant speed reads as a spawn; one that accelerates
      //  reads as something taking off.
      var d = e * e * 1.5;
      b.pos.set(b.from.x + Math.cos(b.away) * d,
                b.from.y + e * 0.55,
                b.from.z + Math.sin(b.away) * d);
      //  scale and fade up together
      b.scale = e;
      b.alpha = Math.min(1, u * 2);
      if (u >= 1) { b.state = 'out'; b.t = 0; }

    } else if (b.state === 'out') {
      b.t += dt;
      var u2 = Math.min(1, b.t / CFG.bornOutTime);
      var e2 = smoothstep(u2);
      //  ease from wherever the burst left it onto its orbit. Lerping to
      //  the LIVE orbit position rather than to a fixed point means the
      //  orbit has already been moving when it arrives, so there is no
      //  visible hand-off frame.
      this.orbitAt(b, ft, this._tmp);
      b.pos.lerp(this._tmp, e2 * 0.06 + 0.012);
      b.scale = 1; b.alpha = 1;
      if (u2 >= 1) { b.state = 'orbit'; b.t = 0; }

    } else if (b.state === 'orbit') {
      this.orbitAt(b, ft, b.pos);
      b.scale = 1; b.alpha = 1;

    } else if (b.state === 'leaving') {
      b.t += dt;
      //  keeps flying while it goes -- a butterfly that stops to fade
      //  reads as a bug, one that fades on its way out reads as distance
      this.orbitAt(b, ft, b.pos);
      var uf = Math.min(1, b.t / CFG.bornFadeTime);
      b.alpha = 1 - smoothstep(uf);
      b.scale = 1 - 0.25 * smoothstep(uf);
      if (uf >= 1) { return false; }
    }

    // ---- the wingbeat, straight off the swarm's ----
    b.cycleT -= dt;
    if (b.cycleT <= 0) {
      b.gliding = !b.gliding;
      b.cycleT = b.gliding ? (0.6 + Math.random() * 1.0) : (1.4 + Math.random() * 2.4);
    }
    b.flapEnv += ((b.gliding ? 0 : 1) - b.flapEnv) * Math.min(1, dt / 0.22);
    var fp = ft * b.flapSpeed + b.flapPh;
    //  during the burst the wings beat hard and never glide -- it is
    //  climbing out, not cruising
    var burst = b.state === 'burst' ? 1 : 0;
    var env = burst ? 1 : b.flapEnv;
    var flapAngle = Math.sin(fp * (1 + burst * 0.5)) * b.flapAmp * (1 + burst * 0.25) - 0.5;
    var glideAngle = -1.0 + 0.08 * Math.sin(ft * 3 + b.flapPh);
    b.bm.flap(env * flapAngle + (1 - env) * glideAngle);

    // ---- dress ----
    b.group.position.copy(b.pos);
    b.bm.model.scale.setScalar(b.size * b.scale);
    b.bm.setOpacity(b.alpha);
    b.group.visible = b.alpha > 0.01;
    b.anchor.visible = b.group.visible;
    b.anchor.position.copy(b.pos);      // position only: never the yaw

    this.placeLabel(b);

    // ---- heading and banking ----
    if (b.first) { b.prev.copy(b.pos); b.first = false; return true; }
    var dx = b.pos.x - b.prev.x, dy = b.pos.y - b.prev.y, dz = b.pos.z - b.prev.z;
    var hSpeed = Math.sqrt(dx * dx + dz * dz);
    if (hSpeed > 1e-6) {
      var yaw = Math.atan2(dz, -dx);
      var cur = b.group.rotation.y;
      var diff = Math.atan2(Math.sin(yaw - cur), Math.cos(yaw - cur));
      b.group.rotation.y = cur + diff * Math.min(1, dt * 1000 / 160);
      var pitch = -Math.atan2(dy, hSpeed) * 0.25;
      var targetRoll = THREE.MathUtils.clamp(diff * 8, -0.09, 0.09);
      b.smoothRoll += (targetRoll - b.smoothRoll) * Math.min(1, dt * 1000 / 420);
      //  the burst adds a roll of its own, easing out as it settles --
      //  a newborn tumbling slightly as it climbs
      var spin = burst ? Math.sin(b.t * CFG.bornBurstSpin) * (1 - b.t / CFG.bornBurstTime) * 0.5 : 0;
      var mean = b.flapEnv * -0.5 + (1 - b.flapEnv) * -1.0;
      b.bm.model.rotation.set(this.presentRoll(b, mean) + b.smoothRoll + spin, 0, pitch, 'XZY');
    }
    b.prev.copy(b.pos);
    return true;
  },

  //  Its wide orbit, on the same noise band the swarm flies.
  //
  //  v8: the orbit is now around `b.centre` rather than around the world
  //  origin, and both its radius and its height ease inward as `b.pull`
  //  rises. Expressing the attraction as a MOVING CENTRE rather than as
  //  a force on the position is what makes "orbits the point you are
  //  aiming at" fall straight out of the flight that already existed --
  //  the noise, the wobble and the banking all keep working untouched,
  //  and there is no second motion model to fight the first.
  //
  //  At pull 0 (nobody pointing) centre is the origin and the eased
  //  terms collapse to their v7 values exactly.
  orbitAt: function (b, t, out) {
    var wa = CFG.wander;
    var rate = b.speed + (b.pull * CFG.pointOrbitRate * (b.speed < 0 ? -1 : 1));
    var theta = b.phase + rate * t + b.wobAmp * wa * b.nWob(t * b.wobFreq);
    var r = Math.max(1.2, b.radius + b.radAmp * wa * b.nRad(t * b.radFreq));
    var y = Math.max(0.5, b.height + b.hgtAmp * wa * b.nHgt(t * b.hgtFreq));
    //  gathered, they close to a tight ball around the aim point; the
    //  height band collapses toward the centre's own height too, or they
    //  would ring it as a wide flat disc rather than cluster on it
    r = r + (CFG.pointGatherRadius - r) * b.pull;
    var yy = y + ((b.centre.y + (y - b.height) * 0.35) - y) * b.pull;
    out.set(b.centre.x + r * Math.cos(theta),
            yy,
            b.centre.z + r * Math.sin(theta));
    return out;
  },

  //  v8 -- WHERE THE VISITOR IS POINTING, and what it does to the swarm.
  //
  //  Reads the aim points published by interact.js (see its `foci`).
  //  Each butterfly answers to the NEAREST one, so two hands -- or two
  //  people -- split the swarm between them with no arbitration.
  //
  //  Deliberately inert when nobody is pointing: `foci` is empty, every
  //  pull decays to 0, every centre eases back to the origin, and the
  //  flight is v7's. Same discipline as keyboard.js:updateSlowField(),
  //  which likewise costs nothing when nothing is hot.
  updateAttraction: function (dt) {
    var pi = document.querySelector('[pointer-input]');
    var pc = pi && pi.components && pi.components['pointer-input'];
    var foci = (pc && pc.foci) || EMPTY_FOCI;

    for (var i = 0; i < this.born.length; i++) {
      var b = this.born[i];
      //  a butterfly on its way out is not up for grabs -- being yanked
      //  toward a finger while fading would read as a glitch
      if (b.state === 'leaving' || b.state === 'burst') {
        b.pull += (0 - b.pull) * Math.min(1, dt / CFG.pointReleaseTau);
        continue;
      }

      // nearest aim point, and how fast the hand behind it is moving
      var best = null, bestD = Infinity;
      for (var j = 0; j < foci.length; j++) {
        var d = b.pos.distanceTo(foci[j].pos);
        if (d < bestD) { bestD = d; best = foci[j]; }
      }

      //  DISTANCE SETS THE RATE, NOT WHETHER IT COMES AT ALL.
      //
      //  The first cut made proximity a gate on the target pull, and it
      //  could never work: born butterflies orbit the origin at 3.2-4.5 m
      //  while the aim point sits 3.6 m out from it, so a butterfly is
      //  typically 4-6 m from where you are pointing. Gating on that
      //  distance meant pull only rose for butterflies that were already
      //  close -- and nothing ever got close, because nothing was being
      //  pulled. Measured: every pull stuck at 0.
      //
      //  So the whole group answers a point (`want` is 1 for all of
      //  them), and proximity scales HOW BRISKLY each one answers. That
      //  is what "strong and weak based on distance" actually wants: the
      //  near ones sweep in at once, the far ones take their time and
      //  arrive late, and the swarm gathers as a shape rather than as a
      //  handful of chosen ones while the rest ignore you.
      var want = best ? 1 : 0;
      var near = best ? (1 - smoothstep(bestD / CFG.pointFalloff)) : 0;

      //  HOW FAST IT RESPONDS also scales with the hand's speed, and is
      //  CLAMPED AT BOTH ENDS. The clamp is the whole reason this does
      //  not become a mess: without it a quick hand drags the entire
      //  swarm across the room in a frame. A still hand still gathers,
      //  just gently.
      var ease = CFG.pointEaseMin + (best ? best.speed * CFG.pointSpeedGain : 0);
      if (ease > CFG.pointEaseMax) { ease = CFG.pointEaseMax; }
      //  ...and then by proximity, never all the way to zero -- a
      //  butterfly on the far side of the room still hears you, faintly.
      var rate = ease * (CFG.pointNearFloor + (1 - CFG.pointNearFloor) * near);

      //  Letting go is its own, slower constant. A gather should feel
      //  responsive; a release should read as the swarm deciding to
      //  disperse, not as a switch being thrown.
      b.pull += (want - b.pull) * (want > b.pull ? Math.min(1, dt * rate)
                                                 : Math.min(1, dt / CFG.pointReleaseTau));

      //  SNAP THE TAIL TO ZERO. An exponential decay asymptotes and
      //  never arrives -- measured, `pull` settled at 0.0057 and the
      //  orbit centre 18 mm off the origin, indefinitely. The visual
      //  difference is nil, but "with nobody pointing this is exactly
      //  v7's flight" is either true or it is not, and a residue that
      //  small is not worth carrying on every butterfly forever.
      if (!best && b.pull < 0.01) {
        b.pull = 0;
        if (b.centre.lengthSq() < 1e-3) { b.centre.set(0, 0, 0); }
      }

      //  The centre chases the aim point at that same rate, so the
      //  cluster trails the finger rather than snapping onto it.
      this._tmp.set(0, 0, 0);
      if (best) { this._tmp.copy(best.pos); }
      var step = this._tmp.distanceTo(b.centre) *
                 Math.min(1, dt * (best ? rate : 1 / CFG.pointReleaseTau));

      //  AND A HARD CEILING ON HOW FAST THE CENTRE ITSELF TRAVELS.
      //
      //  Everything above is a rate, and a rate applied to a large gap
      //  is still a large jump: a centre 4 m from a freshly-flicked aim
      //  point moves 0.2 m in a frame, which is 12 m/s. Whipping the aim
      //  around measured butterflies peaking at 7.1 m/s -- coherent, but
      //  far quicker than anything else in the piece moves, and the
      //  brief was explicitly that this must not turn into a mess.
      //  Clamping the centre's own speed bounds it directly rather than
      //  hoping the rates work out.
      var cap = CFG.pointCentreMaxSpeed * dt;
      if (step > cap) { step = cap; }
      if (step > 1e-5) {
        b.centre.lerp(this._tmp, step / Math.max(this._tmp.distanceTo(b.centre), 1e-5));
      }
    }
  },

  //  ANGULAR, like the letters under the swarm (CFG.letterAngular). A
  //  label at a fixed world size would be unreadable out at 4.5 m, which
  //  is exactly where these live -- so it scales with distance and
  //  clamps at both ends so a close one is not enormous.
  placeLabel: function (b) {
    var d = this._tmp.copy(b.pos).sub(this._camPos).length();
    var h = THREE.MathUtils.clamp(d * CFG.bornLabelAngular,
                                  CFG.bornLabelMin, CFG.bornLabelMax);
    b.label.scale.set(h * 8, h, 1);     // 8:1, matching wordTex's canvas
    b.label.position.set(0, -CFG.bornLabelDrop * b.size * b.scale -
                            h * 0.5, 0);
    b.label.material.opacity = CFG.bornLabelOpacity * b.alpha;
  },

  //  Same solve as keyboard.js:presentRoll -- the body is a side-on
  //  plane and the wings are perpendicular to it, so without this a
  //  butterfly at eye height is seen exactly edge-on and reads as a
  //  twig. Worth more here than on the swarm: this one has a painted
  //  wing, and an edge-on painted wing shows none of it.
  presentRoll: function (b, flapMean) {
    if (!CFG.readRoll) { return 0; }
    this._tmp.copy(this._camPos).sub(b.pos);
    this._tmp.applyAxisAngle(UP, -b.group.rotation.y);
    var beta = Math.atan2(this._tmp.z, this._tmp.y);
    var want = Math.PI / 2 - CFG.readRoll;
    var best = 0, bestAbs = Infinity;
    for (var i = 0; i < 6; i++) {
      var c = (i % 2 ? -want : want) - beta + (Math.floor(i / 2) - 1) * Math.PI - flapMean;
      var a = Math.abs(c);
      if (a < bestAbs) { bestAbs = a; best = c; }
    }
    return best;
  },

  disposeOne: function (b) {
    SFX.detachLoop(b.loop);            // or every name ever typed keeps buzzing
    this.root.remove(b.group);
    this.root.remove(b.anchor);
    b.bm.dispose();                    // disposes the painted map too
    b.label.dispose();
  },

  remove: function () {
    for (var i = 0; i < this.born.length; i++) { this.disposeOne(this.born[i]); }
    this.born.length = 0;
    Born._c = null;
  }
});
