// ============================================================
//  interact.js  --  reach, highlight, pinch
// ============================================================
//  Three pointers feed one selection model:
//
//    left hand, right hand   from hand-rig (see hands.js)
//    the mouse               so the piece can be driven on a desktop
//
//  A pointer picks in two ways, in this order:
//
//    TOUCH   the index fingertip is inside a target's sphere. Reaching
//            out and putting your finger on a butterfly always wins.
//    POINT   otherwise, a ray from an estimated SHOULDER point through
//            the fingertip (v6.1 -- see below; was knuckle-through-tip
//            in v6). The keyboard is 1.15 m away -- far enough that it
//            reads as butterflies hanging in the room rather than a
//            panel stuck to your face, and further than most people can
//            comfortably reach -- so pointing is the normal case and
//            touching is the bonus.
//
//  "Reach toward a butterfly, it highlights" is satisfied by either.
//
//  ACTIVATION is the pinch EDGE, not the pinch state: the frame the
//  thumb and index close. Two thresholds, not one -- a single distance
//  chatters on and off across it and fires repeatedly.
//
//  Nothing here knows what a target is. It asks the keyboard for
//  spheres and hands back ids.
//
//  v6.1 -- three things made real hand tracking harder to select with
//  than it needed to be, and all three are fixed here rather than by
//  widening the pick cone (see config.js: the cone is already tuned
//  right up against the point where neighbours start blobbing together):
//
//    THE RAY'S OWN ORIGIN WAS THE NOISE SOURCE. v6 cast from the index
//              knuckle through the fingertip -- a ~3cm baseline, so a
//              few millimetres of finger curl during a pinch swung the
//              aim by tens of degrees. This is exactly what Meta's own
//              hand-pointing model (the ray Quest's system UI casts)
//              avoids: it anchors the ray near the SHOULDER instead,
//              aimed through the hand. A ~60-80cm baseline means the
//              same finger curl swings the aim by a couple of degrees,
//              often less than the pick cone's own slack. `shoulderOf()`
//              below estimates that point each tick from the camera
//              pose (there is no tracked shoulder joint to read).
//    JITTER    hands.js deliberately publishes raw, unfiltered joints, so
//              a hover could still flicker on residual noise even with a
//              stable ray origin. `smAim` is an exponential moving
//              average of the fingertip the ray is aimed through, per
//              hand, used for the POINT pick only -- touch stays on the
//              raw fingertip, and the mouse pointer has no jitter to
//              smooth.
//    THE PINCH ITSELF CAN STILL PERTURB THE PICK, just far less than
//              before. `lastHotId`/`lastHotAt` remember what a hand had
//              hot; a pinch's rising edge with nothing picked that exact
//              frame still activates the remembered target if it was hot
//              within `CFG.pickGraceMs` -- butterflies only, never the
//              two controls (see the grace-window check in tick()).
//
//  The ray line still visually emanates from the fingertip -- only the
//  invisible shoulder anchor moved, not what you see -- and now bends to
//  touch whatever is actually picked instead of just gesturing toward
//  it, and flashes briefly on a catch. All free reads of the same pick
//  data, no new raycasts.
// ============================================================
AFRAME.registerComponent('pointer-input', {
  init: function () {
    this.kb = null;
    this.pointers = [
      { kind: 'hand', side: 'left',  closed: false, hover: null, at: new THREE.Vector3(),
        smAim: new THREE.Vector3(), smInit: false,
        lastHotId: null, lastHotAt: -Infinity, flashT: 0,
        focus: new THREE.Vector3(), pointing: false, speed: 0,
        prevTip: new THREE.Vector3(), tipInit: false },
      { kind: 'hand', side: 'right', closed: false, hover: null, at: new THREE.Vector3(),
        smAim: new THREE.Vector3(), smInit: false,
        lastHotId: null, lastHotAt: -Infinity, flashT: 0,
        focus: new THREE.Vector3(), pointing: false, speed: 0,
        prevTip: new THREE.Vector3(), tipInit: false },
      { kind: 'mouse',               click: false,  hover: null, at: new THREE.Vector3(),
        focus: new THREE.Vector3(), pointing: false, speed: 0,
        prevTip: new THREE.Vector3(), tipInit: false }
    ];

    //  v8: WHERE THE VISITOR IS AIMING, published for born.js.
    //
    //  This is the first genuine "point in space I am aiming at" in the
    //  piece. Until now the ray was only ever a scoring axis: pickRay()
    //  works out how far along the ray a target sits and then throws
    //  that number away, because all it needs is which sphere won.
    //
    //  Read by born.js:updateAttraction(). Same one-owner/many-readers
    //  arrangement as handRig() -- the pointer code owns the ray, and
    //  anything that wants to know where it aims asks here. Rebuilt each
    //  tick rather than held, so a hand that stops pointing (or stops
    //  being tracked at all) simply drops out of the list.
    this.foci = [];

    this._o = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._ndc = new THREE.Vector2(0, 0);
    this._ray = new THREE.Raycaster();
    this._mouseIn = false;

    // shoulder-ray scratch: a per-tick camera read, shared by both hands
    this._camPos = new THREE.Vector3();
    this._camX = new THREE.Vector3();
    this._camY = new THREE.Vector3();
    this._camZ = new THREE.Vector3();

    this.buildRayLines();
    this.bindMouse();
  },

  //  A short line out of each fingertip. Without it there is no way to
  //  tell where you are pointing until something highlights, and on a
  //  headset that is the difference between the keyboard feeling aimed
  //  and feeling random.
  buildRayLines: function () {
    this.lines = [];
    for (var i = 0; i < 2; i++) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      var mat = new THREE.LineBasicMaterial({
        color: 0x12121a, transparent: true, opacity: 0.5, depthWrite: false
      });
      var line = new THREE.Line(geo, mat);
      line.visible = false;
      line.frustumCulled = false;
      this.el.sceneEl.object3D.add(line);
      this.lines.push(line);
    }
  },

  bindMouse: function () {
    var self = this;
    // The cursor is read on the PRESS as well as on the move. A press
    // that arrives without a preceding move -- a tap, a synthetic click,
    // a stylus -- would otherwise be tested against wherever the cursor
    // was last seen, which on a fresh page is dead centre.
    function readCursor(e) {
      var r = (self.el.sceneEl.canvas || document.body).getBoundingClientRect();
      self._ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      self._ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      self._mouseIn = true;
    }
    window.addEventListener('mousemove', readCursor);
    //  A click is LATCHED, not sampled. A real click closes and opens
    //  inside a single frame more often than not, so a tick that reads
    //  the button's level sees nothing happen -- the same trap the v2
    //  dev panel hit from the other direction. The latch is consumed by
    //  the next tick, which is also the tick that knows what is under
    //  the cursor.
    window.addEventListener('mousedown', function (e) {
      readCursor(e);
      self.pointers[2].click = true;
    });
    //  v8: the desktop stand-in for a point gesture. Read as a LEVEL,
    //  not latched like the click above -- pointing is a state you hold,
    //  where a click is an instant that can open and close inside one
    //  frame.
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Shift') { self._shift = true; }
    });
    window.addEventListener('keyup', function (e) {
      if (e.key === 'Shift') { self._shift = false; }
    });
    //  a tab-away eats the keyup and would leave Shift latched on
    window.addEventListener('blur', function () { self._shift = false; });
  },

  keyboard: function () {
    if (!this.kb) {
      var el = document.querySelector('[butterfly-keyboard]');
      var c = el && el.components && el.components['butterfly-keyboard'];
      if (c && c.initialized) { this.kb = c; }
    }
    return this.kb;
  },

  //  Nearest target to a fingertip, or null.
  pickTouch: function (targets, tip) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < targets.length; i++) {
      var d = tip.distanceTo(targets[i].pos);
      if (d < CFG.touchRadius && d < bestD) { bestD = d; best = targets[i]; }
    }
    return best;
  },

  //  Ray against the target spheres.
  //
  //  The tolerance is a CONE, not a fixed radius. The swarm ranges from
  //  about 1.6 m to 4 m out, and a fixed world radius makes the far half
  //  nearly unhittable while a radius generous enough for those turns
  //  the near ones into one big blob. `pickBase` is the slack close in,
  //  `pickAngle` is how fast it opens with distance.
  //
  //  Scored by how far off the axis the centre is RELATIVE to that
  //  tolerance, so a big slow butterfly does not out-compete a small one
  //  sitting right under the ray.
  pickRay: function (targets, origin, dir, panelOnly) {
    var best = null, bestScore = Infinity;
    for (var i = 0; i < targets.length; i++) {
      var tg = targets[i];
      if (panelOnly && !tg.panel) { continue; }
      if (!panelOnly && tg.panel) { continue; }
      this._w.copy(tg.pos).sub(origin);
      var along = this._w.dot(dir);
      if (along < 0.05 || along > CFG.rayMax) { continue; }
      var perp2 = this._w.lengthSq() - along * along;
      if (perp2 < 0) { perp2 = 0; }
      var tol = tg.radius + Math.max(CFG.pickBase, along * CFG.pickAngle);
      var score = Math.sqrt(perp2) / tol;
      if (score < 1 && score < bestScore) { bestScore = score; best = tg; }
    }
    return best;
  },

  //  THE CONTROLS WIN. The two shapes are the only fixed things in the
  //  room and they sit inside the swarm's orbit, so a butterfly drifting
  //  across the green one must not steal the pick -- the visitor would be
  //  unable to finish until it moved on.
  pick: function (targets, origin, dir) {
    return this.pickRay(targets, origin, dir, true) ||
           this.pickRay(targets, origin, dir, false);
  },

  //  v6.1 -- an estimated shoulder point for `side`, derived from the
  //  camera pose each tick (there is no tracked shoulder joint). Down by
  //  `CFG.shoulderDown` from the headset, and out by `CFG.shoulderOut`
  //  along the camera's HORIZONTAL right axis -- flattened to the XZ
  //  plane so a shoulder does not swing up or tilt when you look up or
  //  down, the way your actual shoulders do not. Requires `updateCamera()`
  //  to have been called this tick.
  shoulderOf: function (side, out) {
    out.copy(this._camPos);
    out.y -= CFG.shoulderDown;
    out.addScaledVector(this._camX, CFG.shoulderOut * (side === 'left' ? -1 : 1));
    return out;
  },

  //  Camera position and a FLATTENED right axis, read once per tick and
  //  shared by both hands (shoulderOf() just adds a per-side sign).
  //  Flattening (zeroing Y, renormalising) keeps the estimated shoulders
  //  level even if the headset pitches or rolls.
  updateCamera: function () {
    var cam = this.el.sceneEl.camera;
    if (!cam) { return false; }
    cam.updateMatrixWorld();
    cam.getWorldPosition(this._camPos);
    cam.matrixWorld.extractBasis(this._camX, this._camY, this._camZ);
    this._camX.y = 0;
    if (this._camX.lengthSq() < 1e-6) { this._camX.set(1, 0, 0); }  // looking straight up/down
    this._camX.normalize();
    return true;
  },

  //  v8: how fast this pointer is moving, in m/s, smoothed.
  //
  //  EMA rather than a fixed-N window, for the same reason the aim
  //  smoothing uses one: frame-rate independent and no history buffer.
  //  `tipInit` guards the first frame, where prevTip is still the origin
  //  and the difference would read as an enormous speed -- the same trap
  //  readSources() guards with `started`.
  //  v8: publish an aim point, but ONLY if it is a real one.
  //
  //  This guard is not defensive padding. The mouse ray comes off
  //  camera.projectionMatrixInverse, which three.js only fills in during
  //  updateProjectionMatrix() -- so on the first frames of a session,
  //  before anything has rendered, setFromCamera() can hand back a
  //  direction of NaN. One NaN focus is unrecoverable: born.js lerps
  //  each butterfly's orbit centre toward it, NaN propagates into the
  //  centre, and every butterfly is gone for the rest of the session
  //  with no error thrown anywhere. Found exactly that way.
  pushFocus: function (p) {
    if (!isFinite(p.focus.x) || !isFinite(p.focus.y) || !isFinite(p.focus.z)) {
      p.pointing = false;
      return;
    }
    this.foci.push({ pos: p.focus, speed: p.speed });
  },

  measureSpeed: function (p, tip, dt) {
    if (!p.tipInit) { p.prevTip.copy(tip); p.tipInit = true; p.speed = 0; return; }
    var raw = p.prevTip.distanceTo(tip) / Math.max(dt, 1e-4);
    p.prevTip.copy(tip);
    if (raw > CFG.pointSpeedMax) { raw = CFG.pointSpeedMax; }
    p.speed += (raw - p.speed) * Math.min(1, dt / CFG.pointSpeedTau);
  },

  tick: function (time, delta) {
    var kb = this.keyboard();
    if (!kb) { return; }
    var targets = kb.targets();
    var hot = {};
    var dt = Math.min(0.1, (delta || 16.7) / 1000);
    var haveCam = this.updateCamera();

    // v8: rebuilt from scratch each tick -- a hand that stops pointing,
    // or stops being tracked, drops out by simply not being re-added
    this.foci.length = 0;

    // built once per tick so the grace-window rescue below can look a
    // remembered id back up against LIVE targets, not a stale snapshot
    var targetsById = {};
    for (var t = 0; t < targets.length; t++) { targetsById[targets[t].id] = targets[t]; }

    for (var i = 0; i < this.pointers.length; i++) {
      var p = this.pointers[i];
      var picked = null;
      var closed = false;

      if (p.kind === 'hand') {
        var rig = handRig(p.side);
        var line = this.lines[i];
        if (!rig || !rig.tracked) {
          if (line) { line.visible = false; }
          p.hover = null; p.closed = false; p.smInit = false;
          p.lastHotId = null; p.flashT = 0;
          p.pointing = false; p.tipInit = false; p.speed = 0;
          continue;
        }
        p.at.copy(rig.indexTip);              // capture point stays raw/exact

        //  Smoothing lives here, on the pointer's own state, not in
        //  hands.js -- the raw joint reader stays raw for anything else
        //  that ever reads it. EMA rather than a fixed-N average so it
        //  is frame-rate independent and needs no history buffer. Only
        //  the fingertip needs smoothing now -- the ray's ORIGIN is the
        //  shoulder estimate below, not a second noisy joint.
        if (!p.smInit) {
          p.smAim.copy(rig.indexTip);
          p.smInit = true;
        } else {
          var a = 1 - Math.exp(-dt / CFG.aimSmoothTau);
          p.smAim.lerp(rig.indexTip, a);
        }

        //  THE RAY. Shoulder to (smoothed) fingertip -- a long baseline,
        //  so the finger curl that happens as a pinch closes barely
        //  moves the aim (see the header comment). Falls back to the old
        //  knuckle-anchored origin on the very first tick or two before
        //  the camera pose is available, rather than skipping the pick.
        if (haveCam) { this.shoulderOf(p.side, this._o); }
        else { this._o.copy(rig.indexKnuckle); }
        this._d.copy(p.smAim).sub(this._o).normalize();

        // touch stays on the RAW fingertip; only the ray's aim is smoothed
        picked = this.pickTouch(targets, rig.indexTip) ||
                 this.pick(targets, this._o, this._d);

        // hysteresis: closes at pinchOn, opens again only past pinchOff
        closed = p.closed ? (rig.pinch < CFG.pinchOff) : (rig.pinch < CFG.pinchOn);

        if (picked) { p.lastHotId = picked.id; p.lastHotAt = time; }

        //  v8: HAND SPEED, smoothed. readSources() in keyboard.js does
        //  the same finite difference but leaves it raw, which is right
        //  there -- it feeds a scatter impulse gated at 1.2 m/s, so
        //  noise below that threshold never reaches anything. Here it
        //  drives a continuous follow rate, and raw per-frame speed
        //  jitters enough to make the swarm surge and stall.
        this.measureSpeed(p, rig.indexTip, dt);

        //  v8: THE AIM POINT. Deliberately built on the SAME shoulder-
        //  anchored, EMA-smoothed ray the picker uses, not a fresh one
        //  off the raw fingertip: that ray exists precisely because a
        //  few millimetres of finger curl swung a knuckle-anchored aim
        //  by tens of degrees, and a swarm of butterflies following a
        //  twitching aim point would be unusable.
        p.pointing = rig.pointing > 0.5;
        if (p.pointing) {
          p.focus.copy(this._o).addScaledVector(this._d, CFG.pointReach);
          this.pushFocus(p);
        }

        if (line) {
          p.flashT = Math.max(0, p.flashT - dt / CFG.flashTime);
          var baseOp = picked ? 0.85 : 0.35;
          //  THE LINE STILL VISUALLY COMES FROM THE HAND -- only the
          //  invisible ray origin used for picking moved to the shoulder
          //  estimate, not what is drawn. THE LINE CONNECTS: when
          //  something is picked the endpoint is its actual live
          //  position, exactly, not a projection that merely passes near
          //  it -- so what you see is exactly what would activate.
          var end;
          if (picked) {
            end = picked.pos;
          } else {
            end = this._w.copy(this._d).multiplyScalar(0.35).add(rig.indexTip);
          }
          var arr = line.geometry.attributes.position.array;
          arr[0] = rig.indexTip.x; arr[1] = rig.indexTip.y; arr[2] = rig.indexTip.z;
          arr[3] = end.x;          arr[4] = end.y;          arr[5] = end.z;
          line.geometry.attributes.position.needsUpdate = true;
          // a brief opacity pulse on a catch, decaying over flashT -- no
          // new geometry, no glow, just brighter ink for a moment
          line.material.opacity = baseOp + (1 - baseOp) * p.flashT;
          line.visible = true;
        }
      } else {
        // desktop: a ray from the camera through the cursor -- no jitter
        // to smooth, no pinch to be perturbed by, so none of the above
        // applies here
        if (!this._mouseIn || this.el.sceneEl.is('vr-mode')) { p.hover = null; continue; }
        var cam = this.el.sceneEl.camera;
        if (!cam) { continue; }
        this._ray.setFromCamera(this._ndc, cam);
        this._o.copy(this._ray.ray.origin);
        this._d.copy(this._ray.ray.direction);
        picked = this.pick(targets, this._o, this._d);
        if (picked) { p.at.copy(picked.pos); }

        //  v8: THE DESKTOP STAND-IN FOR POINTING. Hand tracking cannot
        //  be reproduced on a desktop (see hands.js:debug()), so without
        //  this the whole attraction could only ever be tested on the
        //  headset. Hold SHIFT and the cursor aims the swarm exactly as
        //  a pointed finger would. Shift because every letter key is
        //  already spoken for by catchLetter().
        p.pointing = !!this._shift;
        if (p.pointing) {
          p.focus.copy(this._o).addScaledVector(this._d, CFG.pointReach);
          this.measureSpeed(p, p.focus, dt);
          this.pushFocus(p);
        } else {
          p.tipInit = false; p.speed = 0;
        }
      }

      if (picked) { hot[picked.id] = true; }

      // hands fire on the pinch EDGE; the mouse fires on its latch
      var fire;
      if (p.kind === 'hand') {
        fire = closed && p.closed !== true;
        p.closed = closed;
      } else {
        fire = !!p.click;
        p.click = false;
      }

      //  GRACE WINDOW. Only for hands, only rescuing a butterfly (never a
      //  control -- a wrong accept/delete costs more than a missed
      //  letter), and only if the remembered target is still live this
      //  frame. keyboard.js:activate() re-checks the key's own state
      //  before capturing, so a stale rescue just silently no-ops rather
      //  than double-firing.
      var activated = picked;
      if (fire && !picked && p.kind === 'hand' && p.lastHotId &&
          (time - p.lastHotAt) <= CFG.pickGraceMs) {
        var rescued = targetsById[p.lastHotId];
        if (rescued && !rescued.panel) { activated = rescued; }
      }

      if (fire && activated) {
        kb.activate(activated.id, p.at);
        if (p.kind === 'hand') { p.flashT = 1; }
      } else if (fire) {
        // v3: the pinch/click edge fired but nothing was picked and the
        // grace window (above) had nothing to rescue either -- a clean
        // press into empty air, not just a near miss on a butterfly.
        SFX.playSwoosh();
      }
      p.hover = picked ? picked.id : null;
    }

    kb.setHot(hot);
  }
});
