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
//  FIVE STATES, deliberately mirroring keyboard.js's own state machine
//  so the two read as the same kind of object:
//
//    burst     scaling up from nothing at the name, launching outward
//    showcase  (v9) stopped in front of the visitor, wings beating slowly
//    out       easing outward to its orbit radius
//    orbit     wide circling flight
//    leaving   fading out and disposing, when pushed past the cap
//
//  WHY SHOWCASE EXISTS. Through v8 the sequence was burst -> out, and the
//  butterfly was past the visitor and out at 3.2-4.5 m within about a
//  second of being born. Which meant the wing it had just spent 100 ms
//  painting -- the single textured object in a room of flat ink
//  silhouettes, and the entire reason anybody stood there spelling their
//  name -- was never actually looked at. It was a coloured speck in the
//  distance, in motion, at an angle.
//
//  So it now stops. It climbs to a point about a metre in front of the
//  face, holds completely still for two seconds, and beats its wings
//  slowly enough that the markings are readable, before flying off exactly
//  as it always did.
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

// ---------------- v9.1: the glow ----------------
//  ONE radial-falloff texture, built once and shared by every born
//  butterfly. It is white; each sprite tints it through material.color,
//  so a butterfly glows in its own palette without a texture each.
//
//  Why a sprite and not a real bloom: a post-processing bloom needs an
//  EffectComposer, a second render target and a multi-tap blur every
//  frame. A-Frame has no composer wired in here, and on a Quest that is a
//  serious per-frame cost to light ONE object. Two additive billboards
//  carrying a radial falloff are what a bloom looks like from the front,
//  for the price of two quads and no render passes at all.
//
//  NOT ADDITIVE, AND THIS IS THE WHOLE TRAP. Additive blending is the
//  obvious choice for a glow and it is exactly wrong here: this piece's
//  sky is WHITE (see CLAUDE.md -- deliberately, so the desktop view and a
//  lit passthrough room read the same). Additive can only ever brighten
//  what is behind it, and nothing brightens white. The first version used
//  AdditiveBlending and the glow was perfectly, invisibly correct against
//  every background except the one the piece actually has.
//
//  So it is normal blending with the butterfly's own hue: a soft coloured
//  aura that darkens white slightly at its core and fades to nothing at
//  the rim. That reads as glow against a white sky AND against a dark
//  passthrough room, which additive would not. depthWrite off, so it never
//  occludes the butterfly it belongs to.
var GLOW_TEX = null;
function glowTexture() {
  if (GLOW_TEX) { return GLOW_TEX; }
  var S = 128;
  var c = document.createElement('canvas');
  c.width = c.height = S;
  var x = c.getContext('2d');
  var g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  //  A GAUSSIAN-ISH FALLOFF, not a linear one. A linear ramp has a hard
  //  visible edge where it reaches zero -- it reads as a disc with a
  //  gradient in it rather than as light. These stops are eyeballed to
  //  fall off fast in the middle and crawl to zero at the rim.
  g.addColorStop(0.00, 'rgba(255,255,255,1.00)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.38, 'rgba(255,255,255,0.32)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.10)');
  g.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  GLOW_TEX = new THREE.CanvasTexture(c);
  GLOW_TEX.generateMipmaps = false;
  GLOW_TEX.minFilter = THREE.LinearFilter;
  GLOW_TEX.magFilter = THREE.LinearFilter;
  return GLOW_TEX;
}

//  A sprite, deliberately -- this is the one thing here that SHOULD
//  billboard. A glow is not a surface with an orientation; it is light
//  seen from wherever you are standing, and a plane would show its edge
//  as the butterfly turned.
function makeGlow(colorHex, opacity) {
  var mat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: new THREE.Color(colorHex),
    transparent: true,
    opacity: opacity,
    depthWrite: false
  });
  var s = new THREE.Sprite(mat);
  return s;
}

//  The singleton app.js talks to. Set by the component's init().
var Born = {
  _c: null,
  //  v9.2: 0..1, how much the REST of the scene should stand down while a
  //  newborn is being presented. Published here rather than pushed into
  //  keyboard.js so the dependency runs one way only -- keyboard.js reads
  //  a number and still knows nothing about butterflies being born, which
  //  is the separation born.js was created to keep (see its header).
  dim: 0,
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
    this._camFwd = new THREE.Vector3(0, 0, -1);   // v9: flattened, for showcase
    this._camQ = new THREE.Quaternion();
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._upQ = new THREE.Quaternion();      // v9.1: the showcase's upright spin
    this._wv = new THREE.Vector3();          // v9.2: the wave force
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

    //  v9.1: two additive halos, parented into the flying group so they
    //  track the butterfly for free. Tinted with the body hue rather than
    //  white -- a white glow round a magenta butterfly reads as a
    //  rendering artefact, one in its own colour reads as the creature
    //  being lit. The core is brighter and tighter; the outer is wide and
    //  faint, and it is the pair that gives the falloff a bloom's shape
    //  rather than a single sprite's.
    var glowIn = null, glowOut = null;
    if (CFG.bornGlow) {
      var glowCol = 'hsl(' + Math.round(hue) + ', 100%, 62%)';
      glowOut = makeGlow(glowCol, CFG.bornGlowOuterOpacity);
      glowIn  = makeGlow(glowCol, CFG.bornGlowOpacity);
      //  drawn before the butterfly so the wing sits crisply on top of its
      //  own light rather than being washed out by it
      glowOut.renderOrder = -2;
      glowIn.renderOrder = -1;
      g.add(glowOut);
      g.add(glowIn);
    }

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
      glowIn: glowIn, glowOut: glowOut,      // v9.1
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
      //  v9: the centre is now a SPRING, not a lerp -- it needs a velocity
      //  to be able to overshoot at all. See updateAttraction().
      cvel: new THREE.Vector3(),
      pull: 0,
      //  v9.3: 0..1, how much this butterfly has settled on a held hand.
      //  Eased rather than a flag, so switching between a held hand and a
      //  pointed aim point is a glide rather than a jump.
      heldAmt: 0,
      gatherPh: rand(0, Math.PI * 2),

      //  v9 showcase: where it stops, frozen on entry to the state
      showAt: new THREE.Vector3(),
      showFrom: new THREE.Vector3(),
      showYaw: 0,

      //  v9.2: the wave pushes a born butterfly off its orbit and it
      //  springs back. The swarm gets this for free from the
      //  offset/offsetVel pair it already had; a born butterfly's
      //  position comes straight out of orbitAt() every frame, so it has
      //  nowhere to put a displacement and needs its own.
      waveOff: new THREE.Vector3(),
      waveVel: new THREE.Vector3(),

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

    //  v9: log WHAT was drawn, not just how long it took. With every
    //  butterfly now a different structural draw, "the wings vary" is a
    //  claim that needs evidence, and this line is it.
    var sp = paint.species;
    console.log('[born] "' + b.name + '"  wing painted in ' + b.paintMs.toFixed(1) +
                ' ms  (' + this.born.length + ' aloft)' +
                (sp ? '  [' + paint.palette.scheme + ' | bands ' + sp.bands +
                      ' | veins ' + sp.veinCount + ' | margin ' + sp.marginBands +
                      ' | eyes ' + sp.eyespots + ' | freq ' + sp.freq.toFixed(1) +
                      ' | ' + sp.layers.join('+') + ']' : ''));
  },

  // ---------------- per frame ----------------
  tick: function (time, dtMs) {
    if (!dtMs || !this.born.length) { return; }
    var dt = Math.min(dtMs / 1000, 0.05);
    var t = time / 1000;
    this._clock = t;

    var cam = this.el.sceneEl.camera;
    if (cam) {
      cam.getWorldPosition(this._camPos);
      //  v9: the camera's forward, FLATTENED to horizontal -- the showcase
      //  anchor is derived from it, and unflattened, a visitor who happened
      //  to be looking at the floor when they accepted would have their
      //  butterfly presented to them somewhere near their feet.
      cam.getWorldQuaternion(this._camQ);
      this._camFwd.set(0, 0, -1).applyQuaternion(this._camQ);
      this._camFwd.y = 0;
      if (this._camFwd.lengthSq() < 1e-6) { this._camFwd.set(0, 0, -1); }
      this._camFwd.normalize();
    }

    this.updateAttraction(dt);

    //  v9.2: is anybody presenting? Eased rather than switched, in both
    //  directions -- the room dropping to 30% in one frame would read as
    //  a fault rather than as attention moving.
    var anyShowing = false;
    for (var s = 0; s < this.born.length; s++) {
      if (this.born[s].state === 'showcase') { anyShowing = true; break; }
    }
    Born.dim += ((anyShowing ? 1 : 0) - Born.dim) * Math.min(1, dt / CFG.bornDimEase);
    if (!anyShowing && Born.dim < 0.002) { Born.dim = 0; }   // snap the tail

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
      //  v9: into the showcase rather than straight out. The anchor is
      //  computed ONCE, here, and then frozen -- "not moving in position"
      //  is the brief, and a target that tracks the head is a target that
      //  never holds still.
      if (u >= 1) {
        b.state = 'showcase'; b.t = 0;
        b.showFrom.copy(b.pos);
        b.showAt.copy(this._camPos).addScaledVector(this._camFwd, CFG.bornShowcaseDist);
        b.showAt.y = this._camPos.y + CFG.bornShowcaseRise;
        //  the yaw that puts the body across the view rather than pointing
        //  at the reader, held for the whole state
        b.showYaw = Math.atan2(this._camFwd.z, -this._camFwd.x) + Math.PI / 2;
      }

    } else if (b.state === 'showcase') {
      //  CLIMB, then STOP. The climb is a smoothstep from wherever the
      //  burst threw it up to the frozen anchor; after that the position is
      //  written every frame from the same constant, which is what makes it
      //  properly still rather than nearly still.
      b.t += dt;
      var us = Math.min(1, b.t / CFG.bornShowcaseRiseTime);
      var es = smoothstep(us);
      b.pos.lerpVectors(b.showFrom, b.showAt, es);
      //  a touch bigger while presenting, eased in with the same curve
      b.scale = 1 + (CFG.bornShowcaseScale - 1) * es;
      b.alpha = 1;
      if (b.t >= CFG.bornShowcaseRiseTime + CFG.bornShowcaseTime) {
        b.state = 'out'; b.t = 0;
      }

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
      //  v9: ease the showcase's extra size back off rather than dropping
      //  it in one frame -- the state change should not be a visible pop.
      b.scale = CFG.bornShowcaseScale + (1 - CFG.bornShowcaseScale) * Math.min(1, u2 * 3);
      b.alpha = 1;
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
    var showing = b.state === 'showcase';
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
    if (showing) {
      //  v9: A SLOW, DELIBERATE BEAT, bypassing the glide envelope
      //  entirely. At the cruising 15-22 rad/s the wing is a blur and the
      //  markings are unreadable -- which would waste the whole point of
      //  stopping. But it must still MOVE: a motionless butterfly is a
      //  specimen pinned in a case, and this one is supposed to be alive
      //  and showing itself off.
      b.bm.flap(Math.sin(b.t * CFG.bornShowcaseFlapSpeed) * CFG.bornShowcaseFlapAmp - 0.35);
    } else {
      b.bm.flap(env * flapAngle + (1 - env) * glideAngle);
    }

    //  ---- v9.2: the wave ----
    //  Applied AFTER the state machine has decided where this butterfly
    //  wants to be, as a displacement on top. Deliberately skipped during
    //  the showcase: those two seconds are the one moment the brief says
    //  it must hold perfectly still, and a gust nudging it then would
    //  undo the whole point of stopping.
    if (!showing && b.state !== 'burst') {
      this._wv.set(0, 0, 0);
      if (Wave.forceAt(b.pos, this._wv)) {
        b.waveVel.addScaledVector(this._wv, dt);
      }
      //  spring back to the orbit, and damp -- the same shape as the
      //  swarm's regroup, which is what makes the gust fade out on its
      //  own once the waving stops
      b.waveVel.addScaledVector(b.waveOff, -1.2 * dt);
      b.waveVel.multiplyScalar(Math.max(0, 1 - 1.6 * dt));
      b.waveOff.addScaledVector(b.waveVel, dt);
      if (b.waveOff.length() > 3) { b.waveOff.setLength(3); }
      b.pos.add(b.waveOff);
    } else if (b.waveOff.lengthSq() > 0) {
      b.waveOff.set(0, 0, 0);
      b.waveVel.set(0, 0, 0);
    }

    // ---- dress ----
    b.group.position.copy(b.pos);
    b.bm.model.scale.setScalar(b.size * b.scale);
    b.bm.setOpacity(b.alpha);

    //  ---- v9.1: the glow ----
    //  Full strength while presenting, CFG.bornGlowFlight of it once the
    //  butterfly is out flying -- it is still the only lit thing in the
    //  room and should read that way at orbit distance, just not at
    //  presentation intensity. Breathes on a slow sine so it reads as
    //  alive rather than as a decal.
    if (b.glowIn) {
      var lit = showing ? 1 : CFG.bornGlowFlight;
      var pulse = 1 + CFG.bornGlowPulse * Math.sin(ft * CFG.bornGlowPulseRate + b.flapPh);
      var gs = b.size * b.scale * pulse;
      b.glowIn.scale.setScalar(gs * CFG.bornGlowScale);
      b.glowOut.scale.setScalar(gs * CFG.bornGlowOuter);
      //  multiplied by alpha too, so it fades with the butterfly on the
      //  way in and on the way out rather than hanging in the air after it
      b.glowIn.material.opacity  = CFG.bornGlowOpacity * lit * b.alpha;
      b.glowOut.material.opacity = CFG.bornGlowOuterOpacity * lit * b.alpha;
    }
    b.group.visible = b.alpha > 0.01;
    b.anchor.visible = b.group.visible;
    b.anchor.position.copy(b.pos);      // position only: never the yaw

    this.placeLabel(b);

    // ---- heading and banking ----
    if (b.first) { b.prev.copy(b.pos); b.first = false; return true; }
    var dx = b.pos.x - b.prev.x, dy = b.pos.y - b.prev.y, dz = b.pos.z - b.prev.z;
    var hSpeed = Math.sqrt(dx * dx + dz * dz);

    //  v9 SHOWCASE NEEDS ITS OWN ORIENTATION BRANCH, and this is not
    //  optional tidiness -- it is the bug the state would otherwise have.
    //  Everything below is gated on hSpeed > 0, because heading is derived
    //  from movement. A butterfly holding perfectly still has no movement,
    //  so it would fall straight through and keep whatever orientation the
    //  burst happened to leave it in -- quite possibly edge-on, showing the
    //  reader the one view of a wing that contains no information at all.
    if (showing) {
      //  yaw held at the value frozen on entry, so the body lies across the
      //  view rather than pointing at the reader
      var cy = b.group.rotation.y;
      var dy2 = Math.atan2(Math.sin(b.showYaw - cy), Math.cos(b.showYaw - cy));
      b.group.rotation.y = cy + dy2 * Math.min(1, dt * 4.0);
      //  ...and roll the model to put the wing plane broadside. presentRoll
      //  solves for CFG.readRoll's three-quarter aspect, which is right for
      //  flight and wrong for presentation, so it is handed the showcase's
      //  own much flatter angle instead.
      //  v9.1: STAND IT UPRIGHT ON SCREEN. presentRoll turns the wing
      //  broadside, but the body still lay across the view -- presented
      //  sideways, like a specimen pinned on its side.
      //
      //  This has to be a rotation about the VIEW AXIS applied AFTER the
      //  roll solve, and that distinction is the whole difficulty. The
      //  first attempt passed it as the Z component of the same euler:
      //  with order 'XZY' that composes as Rx(roll)·Rz(upright), so the
      //  quarter turn happens FIRST and the roll solve -- which assumed no
      //  such turn -- then rolls about an axis that has already moved. The
      //  butterfly came out diagonal rather than upright.
      //
      //  Post-multiplying a quaternion about the butterfly-to-camera axis
      //  keeps the broadside solve intact and spins only the image, which
      //  is what "vertical to the screen" actually asks for. The axis is
      //  converted into the flying group's local space because that group
      //  carries its own yaw.
      var meanS = -0.35;
      b.bm.model.rotation.set(this.presentRoll(b, meanS, CFG.bornShowcaseRoll), 0, 0, 'XZY');
      this._tmp2.copy(this._camPos).sub(b.pos).normalize();
      this._tmp2.applyAxisAngle(UP, -b.group.rotation.y);   // world -> group local
      b.bm.model.quaternion.premultiply(
        this._upQ.setFromAxisAngle(this._tmp2, CFG.bornShowcaseUpright));
      b.prev.copy(b.pos);
      return true;
    }

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
    //  v9: THE S-CURVE IS WHERE THE SOFT BLEND ACTUALLY COMES FROM.
    //
    //  `pull` itself is an exponential ease, which starts at its steepest
    //  and decays -- so the moment a point begins, the swarm's response is
    //  moving as fast as it ever will. That first instant is what read as
    //  "crazy fast when I start pointing and stop pointing". Reading it
    //  through smoothstep gives a curve with ZERO GRADIENT AT BOTH ENDS,
    //  so the transition eases in and eases out of both states instead of
    //  cornering into them. Costs one multiply and delivers most of what
    //  the brief asked for.
    var p = smoothstep(Math.min(1, Math.max(0, b.pull)));
    //  v9.3: a HELD hand and a POINTED one use the same machinery with
    //  very different constants -- `held` is 1 while this butterfly has
    //  settled on a hand. Circling a hand is slow and tight; gathering to
    //  an aim point across the room is loose and slower still.
    var held = b.heldAmt || 0;
    var orbitRate = CFG.pointOrbitRate + (CFG.holdOrbitRate - CFG.pointOrbitRate) * held;
    var gather = CFG.pointGatherRadius + (CFG.holdRadius - CFG.pointGatherRadius) * held;
    var rate = b.speed + (p * orbitRate * (b.speed < 0 ? -1 : 1));
    var theta = b.phase + rate * t + b.wobAmp * wa * b.nWob(t * b.wobFreq);
    var r = Math.max(1.2, b.radius + b.radAmp * wa * b.nRad(t * b.radFreq));
    var y = Math.max(0.5, b.height + b.hgtAmp * wa * b.nHgt(t * b.hgtFreq));
    //  gathered, they close toward the aim point; the height band collapses
    //  toward the centre's own height too, or they would ring it as a wide
    //  flat disc rather than cluster on it. v9's pointGatherRadius is twice
    //  v8's, so this is a loose surround rather than a ball.
    //
    //  The floor of 1.2 above is the ORBIT's own minimum and has to be
    //  bypassed for a hold: a butterfly circling your hand at 30 cm can
    //  never get there if its radius cannot go below 1.2 m. Lerping the
    //  final radius rather than clamping it keeps the flight identical
    //  everywhere else.
    r = r + (gather - r) * p;
    var yy = y + ((b.centre.y + (y - b.height) * 0.35) - y) * p;
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
    var holds = (pc && pc.holds) || EMPTY_FOCI;

    for (var i = 0; i < this.born.length; i++) {
      var b = this.born[i];
      //  a butterfly on its way out is not up for grabs -- being yanked
      //  toward a finger while fading would read as a glitch. v9 adds
      //  `showcase` to that list: dragging a butterfly out of the two
      //  seconds where it is presenting itself would break the one moment
      //  the whole birth exists for.
      if (b.state === 'leaving' || b.state === 'burst' || b.state === 'showcase') {
        b.pull += (0 - b.pull) * Math.min(1, dt / CFG.pointReleaseTau);
        b.heldAmt += (0 - b.heldAmt) * Math.min(1, dt / CFG.holdReleaseTau);
        continue;
      }

      //  ---- v9.3: A HELD HAND WINS ----
      //  Nearest held hand, if any. A hold beats a point outright rather
      //  than blending with it: they would otherwise fight over the same
      //  butterfly and pull it to two places at once, and a hand you are
      //  deliberately holding out is the more specific request of the
      //  two. `heldAmt` eases so switching between them is a glide rather
      //  than a jump.
      var hold = null, holdD = Infinity;
      for (var h = 0; h < holds.length; h++) {
        var hd = b.pos.distanceTo(holds[h].pos);
        if (hd < holdD) { holdD = hd; hold = holds[h]; }
      }
      if (hold && holdD > CFG.holdReachRadius) { hold = null; }
      b.heldAmt += ((hold ? 1 : 0) - b.heldAmt) *
                   Math.min(1, dt / (hold ? 0.8 : CFG.holdReleaseTau));
      if (b.heldAmt < 0.002 && !hold) { b.heldAmt = 0; }

      // nearest aim point, and how fast the hand behind it is moving
      var best = null, bestD = Infinity;
      for (var j = 0; j < foci.length; j++) {
        var d = b.pos.distanceTo(foci[j].pos);
        if (d < bestD) { bestD = d; best = foci[j]; }
      }

      //  A held hand replaces the aim point entirely, with its own much
      //  slower, much tighter constants. Everything downstream -- the
      //  pull, the centre spring, the orbit -- is shared, which is what
      //  keeps this one motion model rather than two.
      if (hold) {
        var wantH = CFG.holdMaxPull;
        b.pull += (wantH - b.pull) * Math.min(1, dt * CFG.holdEase);
        this._tmp.copy(hold.pos);
        var kH = CFG.holdSpringK;
        this._tmp2.copy(this._tmp).sub(b.centre).multiplyScalar(kH);
        b.cvel.addScaledVector(this._tmp2, dt);
        //  Under-damped on purpose and more so than pointing's: a
        //  butterfly arriving at a hand should sail slightly past and
        //  curve back, the way something alive does when it lands. The
        //  damping floor is the same guard pointing needs -- 2*zeta*sqrt(k)
        //  goes to zero with k, and a centre with no force left on it
        //  would coast away forever.
        var dampH = 2 * CFG.holdSpringDamp * Math.sqrt(Math.max(kH, 0.25));
        b.cvel.multiplyScalar(Math.exp(-dampH * dt));
        var vmaxH = CFG.holdCentreMaxSpeed;
        if (b.cvel.lengthSq() > vmaxH * vmaxH) { b.cvel.setLength(vmaxH); }
        b.centre.addScaledVector(b.cvel, dt);
        continue;
      }

      //  DISTANCE SETS BOTH THE TARGET AND THE RATE.
      //
      //  v8 made it set only the rate, and its own comment records why it
      //  was nervous about doing more: an even earlier cut had gated the
      //  target on distance with a falloff of 4.2 m, shorter than the 4-6 m
      //  a butterfly typically sits from the aim point, so every pull stuck
      //  at 0 and the gesture did nothing at all. The fix for that was the
      //  falloff (now 8.0), not the gating -- and gating is exactly what
      //  "far butterflies should have zero influence" requires.
      //
      //  v9: `want` IS THE DISTANCE FADE. v8 set it to 1 for every
      //  butterfly and let proximity scale only the RATE, which meant a
      //  butterfly across the room still ended up fully gathered -- just
      //  later. With a pointNearFloor of 0.30 under it, "far butterflies
      //  are unaffected" was simply not true, and that was the complaint.
      //
      //  smoothstep reaches a true 0 at its top end rather than
      //  approaching one, so at or past pointFalloff the target pull is
      //  exactly zero and that butterfly is left completely alone.
      //
      //  ...and capped, so even the nearest one only ever leans toward the
      //  finger. A full gather is a swarm obeying; a partial one is a
      //  swarm noticing, which is what was asked for.
      var near = best ? (1 - smoothstep(bestD / CFG.pointFalloff)) : 0;
      var want = best ? near * CFG.pointMaxPull : 0;

      //  HOW FAST IT RESPONDS also scales with the hand's speed, and is
      //  CLAMPED AT BOTH ENDS. The clamp is the whole reason this does
      //  not become a mess: without it a quick hand drags the entire
      //  swarm across the room in a frame. A still hand still gathers,
      //  just gently.
      var ease = CFG.pointEaseMin + (best ? best.speed * CFG.pointSpeedGain : 0);
      if (ease > CFG.pointEaseMax) { ease = CFG.pointEaseMax; }
      //  ...and then by proximity. v9 sets pointNearFloor to 0, so this
      //  now genuinely reaches zero at the falloff radius rather than
      //  bottoming out at 30% of the near rate.
      var rate = ease * (CFG.pointNearFloor + (1 - CFG.pointNearFloor) * near);

      //  Letting go is its own, slower constant, and in v9 a much slower
      //  one (2.2 s against 1.3). Releasing was the more abrupt of the two
      //  transitions and the brief called out both.
      b.pull += (want - b.pull) * (want > b.pull ? Math.min(1, dt * rate)
                                                 : Math.min(1, dt / CFG.pointReleaseTau));

      //  SNAP THE TAIL TO ZERO. An exponential decay asymptotes and
      //  never arrives -- measured, `pull` settled at 0.0057 and the
      //  orbit centre 18 mm off the origin, indefinitely. The visual
      //  difference is nil, but "a far butterfly is completely
      //  uninfluenced" is either true or it is not.
      //
      //  v9 WIDENS THIS FROM "nobody is pointing" TO "this butterfly's own
      //  target is zero". That covers the new and much more common case: a
      //  hand IS pointing, but this particular butterfly is beyond
      //  pointFalloff, so its want is 0 and it must decay to a real zero
      //  rather than sit forever at 0.004 being faintly dragged.
      //
      //  THE CENTRE MATTERS AS MUCH AS THE PULL HERE, and it is easy to
      //  miss why: orbitAt() adds b.centre to the position unconditionally,
      //  NOT scaled by pull. So a butterfly whose pull has reached a clean
      //  zero but whose centre is still 12 cm off the origin is still
      //  flying a displaced orbit -- measured exactly that, sitting at
      //  0.116 m thirty seconds after the hand dropped, because the release
      //  spring is deliberately soft and a soft spring crawls the last
      //  few centimetres. Hence a real snap threshold rather than the
      //  hairline 1e-3 this started with.
      if (want < CFG.pointPullEpsilon && b.pull < CFG.pointPullEpsilon) {
        b.pull = 0;
        if (b.centre.lengthSq() < CFG.pointCentreSnap * CFG.pointCentreSnap) {
          b.centre.set(0, 0, 0);
          b.cvel.set(0, 0, 0);
        }
      }

      //  ---- the orbit centre, as a SPRING ----
      //
      //  v8 lerped it toward the aim point. A lerp only ever approaches
      //  from one side, so it can never overshoot however it is tuned --
      //  the same observation CFG.ctlSpring makes about the control
      //  bounce, and the same fix: a spring with damping under 1 passes
      //  the target, comes back, and rings down. The brief asked for "a
      //  small overshoot", and this is the piece's own idiom for it.
      //
      //  Target is the aim point while something is pulling, and the world
      //  origin (v7's centre) once nothing is.
      this._tmp.set(0, 0, 0);
      if (best && want > 0) { this._tmp.copy(best.pos); }

      //  Stiffness scales with the same distance fade, so a far butterfly's
      //  centre is not merely pulled weakly -- it is not pulled at all.
      //  Letting go uses its own, much softer stiffness, so the drift back
      //  out to the wide orbit is a decision rather than a snap.
      var kk = (best && want > 0) ? CFG.pointSpringK * near
                                  : 1 / CFG.pointReleaseTau;
      this._tmp2.copy(this._tmp).sub(b.centre).multiplyScalar(kk);
      b.cvel.addScaledVector(this._tmp2, dt);

      //  DAMPING, with a floor under it, and the floor is not cosmetic.
      //  The damping rate for a spring is 2*zeta*sqrt(k) -- which goes to
      //  ZERO as the stiffness does. A butterfly out past pointFalloff has
      //  a stiffness of exactly 0, so without the floor any velocity it
      //  happened to be carrying would never decay and its orbit centre
      //  would coast away across the room forever, with no force left to
      //  bring it back. Clamping k to at least 1 inside the damping term
      //  guarantees everything comes to rest. zeta < 1 is what leaves the
      //  energy to overshoot with in the first place.
      //  The floor is 0.25 rather than 1.0: at 1.0 a soft release (kk is
      //  1/pointReleaseTau, about 0.45) came out heavily over-damped and
      //  the centre took the better part of a minute to crawl home, which
      //  is the opposite of the "back to exactly the un-pointed flight"
      //  guarantee. 0.25 still bounds the k=0 case -- the only one that
      //  could otherwise coast forever -- without stiffening the release.
      var damp = 2 * CFG.pointSpringDamp * Math.sqrt(Math.max(kk, 0.25));
      b.cvel.multiplyScalar(Math.exp(-damp * dt));

      //  AND A HARD CEILING ON HOW FAST THE CENTRE ITSELF TRAVELS.
      //
      //  Still here, and now doing more work than it was: a spring can
      //  build speed a lerp never could. v8 measured butterflies peaking
      //  at 7.1 m/s without a cap -- coherent, but far quicker than
      //  anything else in the piece moves. v9 halves the cap again, which
      //  is what keeps the overshoot a lean rather than a lunge.
      var vmax = CFG.pointCentreMaxSpeed;
      if (b.cvel.lengthSq() > vmax * vmax) { b.cvel.setLength(vmax); }
      b.centre.addScaledVector(b.cvel, dt);
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
    //  v9.2: the name is struck large while the butterfly is presenting.
    //  It is half of what is being shown -- the creature and the word it
    //  was made from -- and at flight size it is a caption rather than a
    //  title. Scaled by the same eased dim that stands the rest of the
    //  room down, so the two move together.
    if (b.state === 'showcase') {
      h *= 1 + (CFG.bornShowcaseLabel - 1) * Born.dim;
    }
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
  //  v9: `rollOverride` lets the showcase state ask for a much flatter
  //  presentation than CFG.readRoll's flying three-quarter aspect. Omitted
  //  everywhere else, so flight is unchanged.
  presentRoll: function (b, flapMean, rollOverride) {
    var roll = rollOverride !== undefined ? rollOverride : CFG.readRoll;
    if (!roll && rollOverride === undefined) { return 0; }
    this._tmp.copy(this._camPos).sub(b.pos);
    this._tmp.applyAxisAngle(UP, -b.group.rotation.y);
    var beta = Math.atan2(this._tmp.z, this._tmp.y);
    var want = Math.PI / 2 - roll;
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
    //  v9.1: the two halos own a material each (they share the one static
    //  texture, which is module-level and deliberately never disposed).
    //  bm.dispose() knows nothing about them, so without this every name
    //  ever typed leaks two SpriteMaterials.
    if (b.glowIn) { b.glowIn.material.dispose(); }
    if (b.glowOut) { b.glowOut.material.dispose(); }
  },

  remove: function () {
    for (var i = 0; i < this.born.length; i++) { this.disposeOne(this.born[i]); }
    this.born.length = 0;
    Born._c = null;
  }
});
