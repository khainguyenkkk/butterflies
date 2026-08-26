// ============================================================
//  keyboard.js  --  the swarm IS the keyboard
// ============================================================
//  Twenty-six butterflies circling the visitor, exactly the flight v2
//  flies -- the same noise-driven orbit, flap-glide cycle, scatter from
//  moving hands and banking on turns. The only thing added is that each
//  one carries a letter and can be caught.
//
//  Why the flight is ported here rather than reused as-is: v2's
//  butterfly.js is one A-Frame component per butterfly, reading the DNA
//  collection and the dev panel's Settings. Neither exists in v3, and
//  twenty-six entities that A-Frame initialises a frame late brought
//  their own traps (see v2's notes on `bc.initialized`). These are plain
//  objects ticked by this component, which is simpler and has no
//  half-built window.
//
//  A key has four states:
//
//    fly       circling, pickable
//    captured  flying to the hand that pinched it, shrinking
//    gone      off, briefly
//    return    flying back in from outside the swarm, fading up,
//              pickable again the moment it is visible
//
//  Keys REPLENISH. The outline leaves that open, but a keyboard where
//  the letter you just used has gone cannot spell ANNA.
//
//  THE HIT TARGET IS THE LIVE POSITION. These move, so the pick list is
//  rebuilt every frame from where each butterfly actually is; there are
//  no slots to aim at.
// ============================================================

// ---------------- 1D value noise, from v2 ----------------
function makeNoise(seed) {
  function h(n) {
    var x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
  return function (t) {
    var i = Math.floor(t), f = t - i;
    var u = f * f * (3 - 2 * f);
    return (h(i) * (1 - u) + h(i + 1) * u) * 2 - 1;
  };
}
function makeFbm(seed) {
  var n1 = makeNoise(seed), n2 = makeNoise(seed + 57.3), n3 = makeNoise(seed + 113.9);
  return function (t) {
    return n1(t) * 0.62 + n2(t * 2.17 + 7.3) * 0.27 + n3(t * 4.31 + 19.1) * 0.11;
  };
}
function smoothstep(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
function rand(a, b) { return a + Math.random() * (b - a); }
var UP = new THREE.Vector3(0, 1, 0);

AFRAME.registerComponent('butterfly-keyboard', {
  init: function () {
    var self = this;
    this.root = new THREE.Group();
    this.el.setObject3D('mesh', this.root);

    //  `typed`, not `name`. A-Frame keys its behaviour registry off
    //  component.name, so a component that assigns this.name unregisters
    //  its own tick() -- silently. Everything still looks built and
    //  nothing ever animates again.
    this.typed = '';
    this.done = false;                 // true between accepting and the reset
    this.keys = [];
    this.buttons = [];
    this.nameSprites = [];
    this.nameScale = CFG.nameSize;
    this._camPos = new THREE.Vector3();
    this._tmp = new THREE.Vector3();

    //  One sprite, re-textured as the highlight moves: the chosen
    //  letter struck two metres tall behind its own butterfly.
    this.big = UI.bigLetter();
    this.root.add(this.big);
    this.bigAmt = 0;
    this.bigKey = null;

    this.buildKeys();
    this.buildPanel();

    // repulsor sources: the tracked hands and the visitor's own head
    this.sources = [];
    this.repulsors = [];
    this.el.sceneEl.addEventListener('loaded', function () {
      var sel = ['#handL', '#handR', '[camera]'];
      for (var j = 0; j < sel.length; j++) {
        var n = document.querySelector(sel[j]);
        if (!n) { continue; }
        self.sources.push({
          el: n, isCamera: sel[j] === '[camera]', isHand: sel[j].indexOf('hand') === 1,
          pos: new THREE.Vector3(), prev: new THREE.Vector3(), speed: 0, started: false
        });
      }
    });

    // The whole integration surface for whatever comes next: v4 listens
    // for this and hands the name to the generator.
    this.onAccept = function (nm) {
      window.dispatchEvent(new CustomEvent('keyboard:accepted', { detail: { name: nm } }));
    };

    window.addEventListener('keydown', function (e) {
      // desktop convenience only; the piece itself never needs a keyboard
      if (self.done) { return; }
      if (/^[a-zA-Z]$/.test(e.key)) { self.catchLetter(e.key.toUpperCase()); }
      else if (e.key === 'Backspace') { self.backspace(); }
      else if (e.key === 'Enter') { self.accept(); }
    });
  },

  // ---------------- the twenty-six ----------------
  buildKeys: function () {
    for (var i = 0; i < CFG.letters.length; i++) {
      var ch = CFG.letters[i];
      var hue = Math.round((i * (360 / 26) + 18) % 360);
      var color = 'hsl(' + hue + ', ' + CFG.bflySat + '%, ' + CFG.bflyLit + '%)';
      //  The letter is the same hue at full chroma, a few stops darker.
      //  Same colour, but the wing is read as a silhouette against white
      //  while the letter is read as type -- and a yellow at the wing's
      //  own lightness is barely there on a white ground.
      var letterColor = 'hsl(' + hue + ', 100%, ' + CFG.letterLit + '%)';
      var st = Style.forLetter(i);
      //  the ghost prints in an ink of its own, nothing to do with the
      //  letter it is trailing
      var ghostColor = 'hsl(' + st.echoHue + ', 100%, ' + CFG.ghostLit + '%)';

      //  THE LETTER IS CUT OUT OF THE WING. Not printed on it -- punched
      //  through the alpha, so the butterfly is holed in the shape of the
      //  letter it carries, once each way round because the far wing is
      //  the same texture mirrored.
      //  The cut-out letter gets a colour of its own -- deliberately not
      //  the wing's, and never white. It is thrown far enough round the
      //  wheel from the wing that the two never sit next to each other,
      //  and the step is odd so twenty-six of them do not repeat.
      var wingHue = (hue + 140 + (i * 57) % 220) % 360;
      var cutColor = 'hsl(' + wingHue + ', 100%, ' + CFG.cutLit + '%)';

      var rec = Wings.forDials(dialsForLetter(i));
      var bm = BflyModel.build(UI.punchLetter(rec.canvas, ch, st), color,
                               UI.letterMask(rec.canvas.width, rec.canvas.height, ch, st),
                               cutColor);

      var g = new THREE.Group();
      g.add(bm.model);
      this.root.add(g);

      //  THE TYPE HANGS OFF ITS OWN ANCHOR, not off the flying group.
      //  The flying group yaws to face the butterfly's heading, so a
      //  letter thrown sideways inside it would swing a full circle round
      //  the body every time it turned. The anchor tracks the position
      //  and ignores the rotation, so the composition holds still
      //  relative to the butterfly however it flies.
      var anchor = new THREE.Group();
      this.root.add(anchor);

      var lt = UI.letter(ch, letterColor, st, ghostColor);
      anchor.add(lt.group);

      //  A hairline back to the body, for the letters thrown furthest.
      //  Two jobs: it is the mark the reference work is full of, and it
      //  keeps a letter legible as BELONGING to a butterfly once it is
      //  no longer sitting politely underneath one.
      var lead = null;
      if (st.leader) {
        var lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        lead = new THREE.Line(lg, new THREE.LineBasicMaterial({
          color: new THREE.Color(letterColor), transparent: true, opacity: 0.55
        }));
        lead.frustumCulled = false;
        anchor.add(lead);
      }

      //  A satellite: a hollow letter that is NOT this butterfly's,
      //  hanging off it at a size unrelated to anything else. It sets a
      //  second scale so nothing reads as "the type size".
      var num = null;
      if (st.satellite) {
        num = UI.hollow(st.satChar, CFG.satColor, CFG.satSize, 5);
        anchor.add(num);
      }

      var k = {
        id: 'key' + i, index: i, ch: ch, color: color, letterColor: letterColor,
        st: st, group: g, anchor: anchor, bm: bm, letter: lt, lead: lead, num: num,
        state: 'fly', t: 0, hot: false, wasHot: false, scale: 1, alpha: 1,
        // --- the flight, straight off v2's spawn() ---
        sizeT: Math.random(), radT: Math.random(), hgtT: Math.random(),
        speed: (Math.random() < 0.5 ? -1 : 1) * rand(0.18, 0.5),
        phase: rand(0, Math.PI * 2),
        //  Deliberately very calm; these were cut twice in v2. The
        //  FREQUENCIES matter as much as the amplitudes -- the same
        //  excursion taken twice as slowly stops reading as wobble.
        wobAmp: rand(0.035, 0.10), wobFreq: rand(0.018, 0.045),
        radAmp: rand(0.05, 0.16),  radFreq: rand(0.015, 0.040),
        hgtAmp: rand(0.04, 0.12),  hgtFreq: rand(0.012, 0.032),
        flapSpeed: rand(18, 27), flapAmp: rand(0.9, 1.3), flapPh: rand(0, 6.28),
        nWob: null, nRad: null, nHgt: null,
        offset: new THREE.Vector3(), offsetVel: new THREE.Vector3(),
        pathPos: new THREE.Vector3(), pos: new THREE.Vector3(),
        prev: new THREE.Vector3(), from: new THREE.Vector3(), target: new THREE.Vector3(),
        first: true, smoothRoll: 0,
        flapEnv: 1, gliding: false, cycleT: 1 + Math.random() * 2,
        //  v6.1: this key's own clock, separate from the global one. It
        //  accumulates dt*timeScale rather than tracking the scene clock
        //  directly, so a slowed butterfly's whole flight -- orbit, wobble
        //  noise, wingbeat, burst cycle -- eases together rather than the
        //  body slowing while the wings keep beating full speed. Starts
        //  at 0 like the scene clock, so at timeScale 1 (the default) it
        //  stays in lockstep with `t` and nothing changes from v6.
        timeScale: 1, flightT: 0
      };
      var sd = rand(0, 1000);
      k.nWob = makeFbm(sd + 1.1); k.nRad = makeFbm(sd + 2.2); k.nHgt = makeFbm(sd + 3.3);
      k.size = CFG.sizeFor(k.sizeT);
      k.radius = CFG.radiusFor(k.radT);
      k.height = CFG.heightFor(k.hgtT);
      bm.model.scale.setScalar(k.size);

      this.keys.push(k);
    }

    //  v2: three of the twenty-six carry a looping, positional sound --
    //  picked here, once, rather than by letter, so which three it is
    //  varies from session to session. A Fisher-Yates shuffle of the
    //  index list rather than sampling-with-rejection, so it can never
    //  pick the same key twice.
    var order = [];
    for (var n = 0; n < this.keys.length; n++) { order.push(n); }
    for (n = order.length - 1; n > 0; n--) {
      var m = Math.floor(Math.random() * (n + 1));
      var swap = order[n]; order[n] = order[m]; order[m] = swap;
    }
    for (n = 0; n < CFG.audioBflyCount; n++) {
      SFX.attachButterflyLoop(this.keys[order[n]].group, n);
    }
  },

  // ---------------- the floating UI ----------------
  //  Two things and nothing else: the caught name, and the two shapes
  //  that finish or undo it.
  //
  //  NO TEXT AND NO FRAME. Earlier builds hung a keyline in the air and
  //  set a block of type against it explaining what to do. Both are
  //  gone: a rectangle is the one mark in the whole piece that is not a
  //  letter or a living thing, and an instruction is a confession that
  //  the interaction did not carry itself. Reach, and a butterfly
  //  lights up. That has to be the whole tutorial.
  buildPanel: function () {
    this.nameGroup = new THREE.Group();
    this.nameGroup.position.copy(CFG.panelPos(CFG.nameX, CFG.nameY));
    this.nameGroup.rotation.z = CFG.nameTilt;      // the whole line is hung on a slope
    this.root.add(this.nameGroup);
    this.nameSprites = [];

    var specs = [
      //  hue, and a seed that keeps the two clusters from ever matching.
      //
      //  Saturation is always 100 and the lightness band is NARROW. An
      //  earlier build lifted 'off' to a pale tint to say "nothing to
      //  accept yet" and it just made both look washed out most of the
      //  time -- the keyboard starts empty, so 'off' is what a visitor
      //  sees first and longest. State is worth a couple of stops, not a
      //  pastel. Green sits darker than red at full chroma or it glows.
      //
      //  BIG, and each hung at its own angle: not level with each other,
      //  not the same size, and neither of them square to the visitor.
      //  Two matching shapes side by side at the same angle is a button
      //  bar, and the piece has spent five versions not being one.
      //  The cant is deliberately modest. Turned much past a quarter of
      //  a radian the lobes foreshorten into each other and the cluster
      //  stops reading as a flower at all -- the angle has to be enough
      //  to say "not square to you" and no more.
      { id: 'accept', hue: 142, seed: 0.9, x:  CFG.ctlGap * 0.56, dy:  0.050, k: 1.26,
        tilt: -0.33, cant:  0.24, lit: { off: 41, idle: 38, hot: 31 } },
      { id: 'delete', hue: 356, seed: 2.7, x: -CFG.ctlGap * 0.44, dy: -0.075, k: 1.02,
        tilt:  0.50, cant: -0.20, lit: { off: 53, idle: 49, hot: 41 } }
    ];
    for (var i = 0; i < specs.length; i++) {
      var sp = specs[i];
      var b = UI.blob(sp.seed, CFG.blobW * sp.k, CFG.blobH * sp.k);
      var anchor = CFG.panelPos(sp.x, CFG.blobY + sp.dy);
      b.mesh.position.copy(anchor);
      //  cant on Y as well as tilt on Z, so each sits in space at an
      //  angle rather than lying flat against an invisible pane
      b.mesh.rotation.set(0, sp.cant, sp.tilt);
      this.root.add(b.mesh);
      this.buttons.push({
        id: sp.id, ui: b, hue: sp.hue, lit: sp.lit,
        hot: false, wasHot: false, phase: i * 2.1,
        tilt: sp.tilt, cant: sp.cant,
        anchor: anchor,
        scale: 1, vel: 0,
        //  The pick sphere follows the cluster as it drifts, not the
        //  point it was hung from, so a shape that has floated a couple
        //  of centimetres is still where you are pointing.
        pos: anchor.clone(), radius: CFG.blobW * sp.k * 1.15
      });
    }

    this.refreshPanel();
  },

  refreshPanel: function () {
    for (var i = 0; i < this.buttons.length; i++) {
      var b = this.buttons[i];
      var off = this.done || !this.typed.length;   // nothing to accept or delete yet
      var want = b.hot && !off ? 'hot' : (off ? 'off' : 'idle');
      if (want !== b.drawn) { b.drawn = want; b.ui.setColor(b.hue, b.lit[want]); }
    }
  },

  //  A press kicks the shape's scale spring. The spring pulls back to
  //  where it was, overshoots because it is under-damped, and rings down
  //  over about a second -- so pressing one is a thing that visibly
  //  happens to it rather than a state that quietly changes.
  bump: function (id) {
    for (var i = 0; i < this.buttons.length; i++) {
      if (this.buttons[i].id === id) { this.buttons[i].vel += CFG.ctlKick; return; }
    }
  },

  //  The name is a row of sprites, one per letter, rebuilt only when the
  //  name actually changes. Each slot has its own angle, size and rise,
  //  so the caught name is a composition rather than a text field.
  syncName: function () {
    var i;
    while (this.nameSprites.length > this.typed.length) {
      var old = this.nameSprites.pop();
      this.nameGroup.remove(old);
      old.dispose();
    }
    for (i = 0; i < this.typed.length; i++) {
      if (this.nameSprites[i] && this.nameSprites[i].ch === this.typed[i]) { continue; }
      if (this.nameSprites[i]) {
        this.nameGroup.remove(this.nameSprites[i]);
        this.nameSprites[i].dispose();
      }
      //  A caught letter keeps the colour of the butterfly it came from,
      //  so the name in front of you is made of the ones you picked.
      var src = this.keys[this.typed.charCodeAt(i) - 65];
      var sp = UI.nameLetter(this.typed[i], src ? src.letterColor : '#12121a',
                             Style.forNameSlot(i, this.typed[i]));
      sp.bobPhase = i * 1.37;
      //  Fly in from wherever it was caught. Converted into the name's
      //  own space at capture time, because the name group is tilted and
      //  a world-space lerp would arrive at the wrong slot.
      if (this._caughtAt) {
        sp.flyFrom = this.nameGroup.worldToLocal(this._caughtAt.clone());
        sp.fly = 0;
      }
      this.nameSprites[i] = sp;
      this.nameGroup.add(sp);
    }
    this.layoutName();
  },

  //  Set TIGHT -- letters nearly touching, and the wider ones taking
  //  more room than the narrow ones, so the word has a shape instead of
  //  a rhythm. Long names shrink to fit rather than overflow.
  layoutName: function () {
    var n = this.nameSprites.length;
    if (!n) { return; }
    var i, adv = [], total = 0;
    for (i = 0; i < n; i++) {
      adv.push(CFG.nameSpacing * this.nameSprites[i].st.scale * CFG.nameTrack);
      total += adv[i];
    }
    var k = Math.min(1, CFG.nameMaxW / total);
    this.nameScale = CFG.nameSize * k;
    var x = -(total * k) / 2;
    for (i = 0; i < n; i++) {
      var sp = this.nameSprites[i];
      sp.slotX = x + (adv[i] * k) / 2;
      sp.baseY = sp.st.rise * this.nameScale;
      x += adv[i] * k;
    }
  },

  // ---------------- what the pointer code asks for ----------------
  //  A flat list of spheres at LIVE positions. Everything selectable in
  //  the piece is in here; nothing else is pickable.
  targets: function () {
    var out = [];
    // between accepting and the reset nothing is pickable -- otherwise a
    // second pinch lands on a keyboard that is on its way out
    if (this.done) { return out; }
    for (var i = 0; i < this.keys.length; i++) {
      var k = this.keys[i];
      if (k.state !== 'fly' && k.state !== 'return') { continue; }
      // the sphere grows with the butterfly, so a big one is not harder
      // to hit than a small one for the same reason it looks closer
      out.push({ id: k.id, pos: k.pos, radius: 0.20 * k.size, panel: false });
    }
    for (var j = 0; j < this.buttons.length; j++) {
      var b = this.buttons[j];
      if (!this.typed.length) { continue; }
      out.push({ id: b.id, pos: b.pos, radius: b.radius, panel: true });
    }
    return out;
  },

  setHot: function (idSet) {
    var i, dirty = false;
    for (i = 0; i < this.keys.length; i++) { this.keys[i].hot = !!idSet[this.keys[i].id]; }
    for (i = 0; i < this.buttons.length; i++) {
      var b = this.buttons[i];
      b.hot = !!idSet[b.id];
      if (b.hot !== b.wasHot) { b.wasHot = b.hot; dirty = true; }
    }
    if (dirty) { this.refreshPanel(); }
  },

  //  A pointer pinched on `id`. `handPos` is where it pinched, so the
  //  butterfly has somewhere to fly to.
  activate: function (id, handPos) {
    if (this.done) { return; }
    if (id === 'accept') { this.bump('accept'); this.accept(); return; }
    if (id === 'delete') { this.bump('delete'); this.backspace(); return; }
    for (var i = 0; i < this.keys.length; i++) {
      var k = this.keys[i];
      if (k.id !== id || (k.state !== 'fly' && k.state !== 'return')) { continue; }
      this.capture(k, handPos);
      return;
    }
  },

  capture: function (k, handPos) {
    if (this.typed.length >= CFG.maxName) {
      return;
    }
    k.state = 'captured';
    k.t = 0;
    k.from.copy(k.pos);
    k.target.copy(handPos || k.pos);
    //  where the letter is caught, so its impression can fly from there
    //  into the name rather than appearing out of nowhere
    this._caughtAt = k.pos.clone();
    this.typed += k.ch;
    this.syncName();
    this.refreshPanel();
    SFX.playPickup();    // v3: fires here so catchLetter() (the desktop
                          // testing convenience) gets the same sound as a
                          // real pinch/click -- both funnel through capture()
  },

  // desktop convenience: catch the nearest available butterfly for a letter
  catchLetter: function (ch) {
    for (var i = 0; i < this.keys.length; i++) {
      var k = this.keys[i];
      if (k.ch === ch && (k.state === 'fly' || k.state === 'return')) {
        this.capture(k, k.pos);
        return;
      }
    }
  },

  // ---------------- the name ----------------
  backspace: function () {
    if (this.done || !this.typed.length) { return; }
    this.typed = this.typed.slice(0, -1);
    this.syncName();
    this.refreshPanel();
  },

  accept: function () {
    if (this.done || !this.typed.length) { return; }
    this.done = true;
    SFX.playWinner();         // v2: the green control's own sound
    this.refreshPanel();
    this.onAccept(this.typed);

    var self = this;
    // the piece resets and waits for the next visitor
    setTimeout(function () { self.reset(); }, 3200);
  },

  reset: function () {
    this.typed = '';
    this.done = false;
    this.syncName();
    this.refreshPanel();
  },

  // ---------------- per frame ----------------
  tick: function (time, dtMs) {
    if (!dtMs) { return; }
    var dt = Math.min(dtMs / 1000, 0.05);
    var t = time / 1000;
    var i;

    this.tickUI(t, dt);
    this.tickBig(t, dt);
    this.readSources(dt);

    this._clock = t;                        // the ghosts and the lattice run off this
    var cam = this.el.sceneEl.camera;
    if (cam) { cam.getWorldPosition(this._camPos); }

    this.updateSlowField(dt);
    for (i = 0; i < this.keys.length; i++) { this.tickKey(this.keys[i], t, dt); }
    this.separate(dt);
  },

  //  v6.1 -- reaching for a butterfly, or drifting near one that's
  //  reached for, eases its flight into a calmer speed, and eases back
  //  out once nothing is pointed there. Motivated by exhibition feedback
  //  that the swarm's motion risked motion sickness; it also makes
  //  selection itself easier, since a target barely moving while hot is
  //  far more forgiving of ray jitter and the pinch's own commit-frame
  //  perturbation (see interact.js). Deliberately NOT a change to the
  //  swarm's baseline cruising speed, which is already tuned and tested
  //  on-headset -- with nothing hot, every key's target stays 1 and
  //  nothing here has any visible effect.
  updateSlowField: function (dt) {
    var i, j;
    var hotPos = [];
    for (i = 0; i < this.keys.length; i++) {
      if (this.keys[i].hot) { hotPos.push(this.keys[i].pos); }
    }
    for (i = 0; i < this.keys.length; i++) {
      var k = this.keys[i];
      var target = 1;
      if (hotPos.length) {
        if (k.hot) {
          target = CFG.slowHot;
        } else {
          var nearest = Infinity;
          for (j = 0; j < hotPos.length; j++) {
            var d = k.pos.distanceTo(hotPos[j]);
            if (d < nearest) { nearest = d; }
          }
          target = CFG.slowHot + (1 - CFG.slowHot) * smoothstep(nearest / CFG.slowRadius);
        }
      }
      // EASED, not snapped -- an abrupt speed change is its own small
      // motion-sickness risk, so both slowing down and releasing again
      // have to be gradual.
      k.timeScale += (target - k.timeScale) * Math.min(1, dt / CFG.slowEase);
    }
  },

  //  THE BLOWN-UP LETTER. Parked on the far side of its own butterfly,
  //  on the line from the visitor through the body, so it reads as
  //  behind that butterfly and nothing else. It fades rather than
  //  snapping, and it keeps fading out on the letter it had while a new
  //  one comes up, so a hand sweeping across the swarm does not strobe.
  tickBig: function (t, dt) {
    var hot = null;
    for (var i = 0; i < this.keys.length; i++) {
      if (this.keys[i].hot && this.keys[i].state === 'fly') { hot = this.keys[i]; break; }
    }
    if (hot && hot !== this.bigKey && this.bigAmt < 0.05) {
      this.bigKey = hot;
      this.big.show(hot.ch, hot.letterColor);
    }
    var want = (hot && hot === this.bigKey) ? 1 : 0;
    this.bigAmt += (want - this.bigAmt) * Math.min(1, dt / 0.18);
    if (this.bigAmt < 0.004) {
      this.big.hide();
      if (!hot) { this.bigKey = null; }
      return;
    }
    if (!this.bigKey) { return; }

    // out along the sight line, past the butterfly
    this._tmp.copy(this.bigKey.pos).sub(this._camPos);
    var d = this._tmp.length();
    this._tmp.normalize();
    this.big.position.copy(this._camPos).addScaledVector(this._tmp, d + CFG.bigBehind);
    var h = CFG.bigSize * (0.86 + 0.14 * this.bigAmt);
    this.big.scale.set(h, h, 1);
    this.big.fade(CFG.bigOpacity * this.bigAmt, Math.sin(t * 0.21) * 0.09);
  },

  //  The life in the UI is here, not in the canvases: each letter drifts
  //  on its own slow phase and swells in when it is caught, and the two
  //  shapes breathe. Redrawing the canvases per frame would upload half a
  //  megabyte a frame to say the same thing.
  tickUI: function (t, dt) {
    var i;
    for (i = 0; i < this.nameSprites.length; i++) {
      var sp = this.nameSprites[i];
      sp.born = Math.min(1, sp.born + dt / 0.30);
      var e = smoothstep(sp.born);
      var bob = CFG.nameBob * Math.sin(t * CFG.nameBobRate * 6.283 + sp.bobPhase);
      var slotX = sp.slotX === undefined ? sp.position.x : sp.slotX;
      var slotY = (sp.baseY || 0) + bob;

      if (sp.flyFrom) {
        //  Carried from the butterfly to its place in the name. This is
        //  the whole idea of the piece in one movement, so it is the one
        //  animation allowed to be fast and obvious.
        sp.fly = Math.min(1, sp.fly + dt / CFG.nameFlyTime);
        var f = smoothstep(sp.fly);
        sp.position.set(sp.flyFrom.x + (slotX - sp.flyFrom.x) * f,
                        sp.flyFrom.y + (slotY - sp.flyFrom.y) * f,
                        sp.flyFrom.z * (1 - f));
        // large and faint at the far end, settling as it lands
        sp.set(this.nameScale * (1 + 1.6 * (1 - f)), (0.25 + 0.7 * f) * e);
        if (sp.fly >= 1) { sp.flyFrom = null; }
      } else {
        sp.position.set(slotX, slotY, 0);
        // arrives a little large and settles, like something landing
        sp.set(this.nameScale * (1 + 0.5 * (1 - e)), e * 0.95);
      }
    }
    for (i = 0; i < this.buttons.length; i++) {
      var b = this.buttons[i];
      var live = !this.done && this.typed.length;

      // the outline itself, rebuilt from the harmonics every frame
      b.ui.shape(t + b.phase * 3.1);

      // and the whole shape drifts, on two periods that do not divide
      // into each other so the path never closes
      var m = b.ui.mesh;
      m.position.set(
        b.anchor.x + CFG.blobDrift * Math.sin(t * 0.29 + b.phase),
        b.anchor.y + CFG.blobDrift * 0.8 * Math.sin(t * 0.41 + b.phase * 1.7),
        b.anchor.z
      );
      b.pos.copy(m.position);          // the pick sphere goes with it
      //  its own tilt and its own cant, plus a slow sway on top
      m.rotation.set(0, b.cant, b.tilt + 0.14 * Math.sin(t * 0.13 + b.phase));

      //  SCALE IS A SPRING, not an eased value. It is pulled toward its
      //  resting size, and bump() kicks its VELOCITY on a press -- so the
      //  shape shoots past, comes back past, and rings down over about a
      //  second. An eased lerp can only ever approach from one side and
      //  can never overshoot, which is the whole point of a bounce.
      var breathe = 1 + (live ? CFG.blobPulse : CFG.blobPulse * 0.5) *
                        Math.sin(t * 0.9 + b.phase);
      var target = (b.hot && live ? 1.22 : 1) * breathe;
      b.vel += (target - b.scale) * CFG.ctlSpring * dt;
      b.vel *= Math.pow(CFG.ctlDamp, dt * 60);
      b.scale += b.vel * dt;
      if (b.scale < 0.25) { b.scale = 0.25; b.vel = 0; }   // never through itself
      m.scale.setScalar(b.scale);
    }
  },

  //  Where the hands and the head are, and how fast. A hand that is
  //  moving fast scatters the swarm; one reaching slowly does not, which
  //  is what makes reaching for a butterfly possible at all.
  readSources: function (dt) {
    this.repulsors.length = 0;
    for (var i = 0; i < this.sources.length; i++) {
      var s = this.sources[i];
      var obj;
      if (s.isHand) {
        // hand-tracking-controls pins its own entity to the origin every
        // frame; hand-rig publishes the real wrist transform instead
        var rig = s.el.components && s.el.components['hand-rig'];
        obj = rig && rig.tracked ? rig.point : null;
      } else {
        obj = s.el.object3D;
      }
      if (!obj) { s.started = false; continue; }
      obj.getWorldPosition(s.pos);
      if (!s.started) {
        if (s.pos.lengthSq() > 1e-6) { s.started = true; s.prev.copy(s.pos); }
        continue;
      }
      s.speed = s.pos.distanceTo(s.prev) / dt;
      s.prev.copy(s.pos);
      this.repulsors.push({ pos: s.pos, speed: s.isCamera ? s.speed * 0.7 : s.speed });
    }
  },

  pathAt: function (k, t, out) {
    var wa = CFG.wander;
    // A full circle advances; a partial arc sweeps back and forth across
    // its own slice of the front. See CFG.arcSpan.
    var theta = (CFG.arcSpan >= Math.PI * 2)
      ? k.phase + k.speed * t
      : k.centre + k.swing * Math.sin(CFG.arcRate * 6.283 * t + k.phase);
    theta += k.wobAmp * wa * k.nWob(t * k.wobFreq);
    var r = Math.max(0.8, k.radius + k.radAmp * wa * k.nRad(t * k.radFreq));
    var y = Math.max(0.35, k.height + k.hgtAmp * wa * k.nHgt(t * k.hgtFreq));
    out.set(r * Math.cos(theta), y, r * Math.sin(theta));
    return out;
  },

  tickKey: function (k, t, dt) {
    var i;

    // ---- the capture states sit ON TOP of the flight ----
    if (k.state === 'captured') {
      k.t += dt;
      var u = Math.min(1, k.t / CFG.captureTime);
      var e = smoothstep(u);
      k.pos.lerpVectors(k.from, k.target, e);
      k.group.position.copy(k.pos);
      this.dress(k, (1 - 0.9 * e), 1 - e);
      // wings beat harder the closer it gets, then still
      k.bm.flap(Math.sin(t * k.flapSpeed * (1 + e) + k.flapPh) * k.flapAmp * (1 - e) - 0.5 * e);
      if (u >= 1) { k.state = 'gone'; k.t = 0; }
      return;
    }
    if (k.state === 'gone') {
      k.t += dt;
      this.dress(k, 0, 0);
      if (k.t >= CFG.goneTime) {
        // rejoin from outside the swarm; the scatter spring reels it in
        k.state = 'return'; k.t = 0;
        k.phase = rand(0, Math.PI * 2);
        var a = Math.random() * Math.PI * 2;
        k.offset.set(Math.cos(a) * 5, 1.8, Math.sin(a) * 5);
        k.offsetVel.set(0, 0, 0);
        k.first = true;
      }
      return;
    }
    if (k.state === 'return') {
      k.t += dt;
      if (k.t >= CFG.returnTime) { k.state = 'fly'; }
    }

    // ---- v2's flight, driven by this key's OWN clock (v6.1) ----
    //  sdt/ft replace dt/t for everything that is this butterfly's own
    //  motion -- orbit, wobble noise, wingbeat, burst cycle -- so a
    //  slowed key's whole flight calms down together. At timeScale 1
    //  (the default, everywhere nothing is hot) ft tracks t exactly and
    //  this is byte-for-byte v6's flight.
    var sdt = dt * k.timeScale;
    k.flightT += sdt;
    var ft = k.flightT;
    this.pathAt(k, ft, k.pathPos);

    k.cycleT -= sdt;
    if (k.cycleT <= 0) {
      k.gliding = !k.gliding;
      k.cycleT = k.gliding ? (0.5 + Math.random() * 0.9)    // glide length
                           : (1.2 + Math.random() * 2.2);   // flap burst length
    }
    k.flapEnv += ((k.gliding ? 0 : 1) - k.flapEnv) * Math.min(1, sdt / 0.22);

    var fp = ft * k.flapSpeed + k.flapPh;
    var flapAngle = Math.sin(fp) * k.flapAmp - 0.5;              // beating, biased upward
    var glideAngle = -1.0 + 0.08 * Math.sin(ft * 3 + k.flapPh);  // held up, tiny tremble
    var flap = k.flapEnv * flapAngle + (1 - k.flapEnv) * glideAngle;

    // scatter from fast-moving hands and the head
    for (i = 0; i < this.repulsors.length; i++) {
      var rp = this.repulsors[i];
      if (rp.speed < 1.2) { continue; }
      this._tmp.copy(k.pos).sub(rp.pos);
      var dist = this._tmp.length();
      if (dist > 1.4 || dist < 1e-4) { continue; }
      var push = Math.min(rp.speed, 6) * 9 / (1 + 6 * dist * dist);
      k.offsetVel.addScaledVector(this._tmp.normalize(), push * dt);
    }
    // spring back to the path (regroup)
    k.offsetVel.addScaledVector(k.offset, -1.2 * dt);
    k.offsetVel.multiplyScalar(Math.max(0, 1 - 1.6 * dt));
    k.offsetVel.y += (k.flapEnv - 0.5) * 0.08 * dt;            // glide sinks, flapping climbs
    k.offset.addScaledVector(k.offsetVel, dt);
    if (k.offset.length() > 6) { k.offset.setLength(6); }

    k.pos.copy(k.pathPos).add(k.offset);

    k.bm.flap(flap);
    // body bob, once per wingbeat. This runs at 3-4 Hz, the fastest
    // movement on the butterfly, so it is deliberately tiny.
    k.pos.y += 0.01 * k.size * Math.sin(fp - 0.9) * k.flapEnv;
    k.group.position.copy(k.pos);

    var grow = k.state === 'return' ? smoothstep(k.t / CFG.returnTime) : 1;
    this.dress(k, grow * (k.hot ? CFG.hiScale : 1), grow);

    if (k.first) { k.prev.copy(k.pos); k.first = false; return; }

    // ---- heading and banking ----
    var dx = k.pos.x - k.prev.x, dy = k.pos.y - k.prev.y, dz = k.pos.z - k.prev.z;
    var hSpeed = Math.sqrt(dx * dx + dz * dz);
    if (hSpeed > 1e-6) {
      var yaw = Math.atan2(dz, -dx);
      var cur = k.group.rotation.y;
      var diff = Math.atan2(Math.sin(yaw - cur), Math.cos(yaw - cur));
      k.group.rotation.y = cur + diff * Math.min(1, dt * 1000 / 160);
      var pitch = -Math.atan2(dy, hSpeed) * 0.25;
      var targetRoll = THREE.MathUtils.clamp(diff * 8, -0.09, 0.09);
      k.smoothRoll += (targetRoll - k.smoothRoll) * Math.min(1, dt * 1000 / 420);
      var mean = k.flapEnv * -0.5 + (1 - k.flapEnv) * -1.0;   // where the wings sit on average
      k.bm.model.rotation.set(this.presentRoll(k, mean) + k.smoothRoll, 0, pitch, 'XZY');
    }
    k.prev.copy(k.pos);
  },

  //  PRESENTATION ROLL -- the one thing about the flight that is not v2.
  //
  //  The body is a side-on silhouette plane and the wings are a plane
  //  perpendicular to it, so the two can never both face you. A butterfly
  //  orbiting at your eye height is seen exactly edge-on: v2's ambient
  //  swarm has whole stretches where a butterfly is a twig, which is fine
  //  for ambience and useless for a keyboard you have to read.
  //
  //  Roll the model by rho about its own body axis and the wing plane's
  //  visibility works out to |cos(rho + beta)|, where beta is the angle of
  //  the camera in the plane perpendicular to the body. So there is always
  //  a rho that presents the same three-quarter aspect, wherever the
  //  butterfly is and whichever way round it is flying. This solves for it
  //  every frame, then picks the branch closest to upright -- the aspect
  //  repeats every PI, and the near-zero branch is the one that is not
  //  upside down.
  //
  //  `flapMean` is folded in because the wing pivots turn about the same
  //  axis: the flap is biased upward by half a radian, and without
  //  compensating the whole swarm would sit half a radian off target.
  //
  //  Set CFG.readRoll to 0 for v2's exact look.
  presentRoll: function (k, flapMean) {
    if (!CFG.readRoll) { return 0; }
    this._tmp.copy(this._camPos).sub(k.pos);
    this._tmp.applyAxisAngle(UP, -k.group.rotation.y);      // into the body's frame
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

  //  Scale, colour, opacity and the letter -- everything that says
  //  "this one is highlighted" or "this one is leaving".
  dress: function (k, scaleMul, alpha) {
    k.scale += (scaleMul - k.scale) * 0.18;
    k.alpha += (alpha - k.alpha) * 0.30;
    k.bm.model.scale.setScalar(k.size * k.scale);
    k.bm.setOpacity(k.alpha);
    k.group.visible = k.alpha > 0.01;
    k.anchor.visible = k.group.visible;
    k.anchor.position.copy(k.pos);          // position only: never the yaw

    if (k.hot !== k.wasHot) {
      // The highlight is the LETTER inverting, plus the scale bump above.
      // The butterfly keeps its own colour -- see letterTex() in ui.js.
      k.wasHot = k.hot;
      k.letter.setHot(k.hot);
    }
    // the letter is a sprite: it billboards itself, but its size, angle
    // and where it is thrown are all worked out against the camera
    var lp = k.letter.place(this._camPos, k.pos, k.size * k.scale, k.alpha, this._clock);

    if (k.lead) {
      //  From the body to the letter, in the anchor's own space. Stops
      //  short at both ends so it touches neither -- a rule that runs
      //  into the type is a mistake, one that stops short is a decision.
      var a = k.lead.geometry.attributes.position.array;
      var f = 0.22, tt = 0.80;
      a[0] = lp.x * f;  a[1] = lp.y * f;  a[2] = 0;
      a[3] = lp.x * tt; a[4] = lp.y * tt; a[5] = 0;
      k.lead.geometry.attributes.position.needsUpdate = true;
      k.lead.material.opacity = 0.55 * k.alpha;
    }

    if (k.num) {
      //  Thrown the other way from the letter and scaled off distance,
      //  so it never lines up with anything.
      var d = this._camPos.distanceTo(k.pos);
      var h = Math.max(CFG.satMin, Math.min(CFG.satMax, d * CFG.satAngular));
      k.num.scale.set(h, h, 1);
      k.num.position.set(-lp.x * 2.2, -lp.y * 2.2 + 0.05, 0);
      k.num.material.opacity = 0.55 * k.alpha;
    }
  },

  //  Gentle separation, so butterflies steer apart instead of stacking
  //  up -- which also stops two of them sharing one pick target.
  separate: function (dt) {
    var flies = this.keys;
    for (var a = 0; a < flies.length; a++) {
      var A = flies[a];
      if (A.state !== 'fly') { continue; }
      for (var b = a + 1; b < flies.length; b++) {
        var B = flies[b];
        if (B.state !== 'fly') { continue; }
        var dx = A.pos.x - B.pos.x, dy = A.pos.y - B.pos.y, dz = A.pos.z - B.pos.z;
        var d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 0.36 || d2 < 1e-6) { continue; }
        var d = Math.sqrt(d2);
        var push = (0.6 - d) * 2.0 * dt / d;
        A.offsetVel.x += dx * push; A.offsetVel.y += dy * push; A.offsetVel.z += dz * push;
        B.offsetVel.x -= dx * push; B.offsetVel.y -= dy * push; B.offsetVel.z -= dz * push;
      }
    }
  },

  remove: function () {
    for (var i = 0; i < this.keys.length; i++) {
      var k = this.keys[i];
      k.bm.dispose();
      k.letter.dispose();
      if (k.lead) { k.lead.geometry.dispose(); k.lead.material.dispose(); }
      if (k.num) { k.num.dispose(); }
    }
    this.big.dispose();
    for (var n = 0; n < this.nameSprites.length; n++) { this.nameSprites[n].dispose(); }
    for (var j = 0; j < this.buttons.length; j++) { this.buttons[j].ui.dispose(); }
  }
});

//  Four dials for a letter. v3 does NOT derive wings from the visitor's
//  name -- that is the next version's job. This exists only so the 26
//  butterflies look like 26 different butterflies rather than one
//  repeated, and it is deterministic so a letter is always the same wing.
function dialsForLetter(i) {
  var out = [];
  for (var k = 0; k < 4; k++) {
    var x = Math.sin((i + 1) * (k + 1) * 12.9898 + (k + 1) * 78.233) * 43758.5453;
    out.push(x - Math.floor(x));
  }
  return out;
}
