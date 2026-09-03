// ============================================================
//  welcome.js  --  greeting the next person in the queue
// ============================================================
//  THE INSTALLATION IS A QUEUE, and that is the whole design premise of
//  this file. A visitor is not a session: it is a stretch of one long
//  session between two headset removals. Somebody wears the Quest, makes
//  a butterfly, lifts it off, and hands it to the next person in line.
//  Nothing in v8 noticed any of that happening.
//
//  So: when a new wearer is detected, the piece says hello. A recorded
//  voice plays, a line of type builds itself word by word in front of
//  them, and the keyboard is reset underneath so they do not inherit half
//  of a stranger's half-spelled name.
//
//  WHAT IS DELIBERATELY *NOT* RESET: the butterflies other people have
//  already made. They keep flying. A new visitor arriving into a room
//  already full of strangers' butterflies is the exhibition working, not
//  a leak -- it is the only place the piece accumulates anything, since
//  there is no storage anywhere in it.
//
//  ---- DETECTING A NEW WEARER ----
//
//  There is no "headset taken off" event. There are three signals, none
//  of them sufficient alone, and this file layers them:
//
//    enter-vr                     a session began at all. Fires once per
//                                 session, so it catches the first person
//                                 and nobody after them.
//    XRSession visibilitychange   the real one. Lifting a Quest off the
//                                 face drives visibilityState away from
//                                 'visible' (to 'hidden', or
//                                 'visible-blurred' if the system menu is
//                                 what took focus); seating it back on the
//                                 face returns it to 'visible'.
//    a keypress                   desktop testing, where neither of the
//                                 above will ever fire.
//
//  THE DEBOUNCE IS THE ENTIRE DIFFICULTY. visibilitychange fires for
//  things that are not a new person: the Quest's own system menu blurs the
//  session for about a second every time someone brushes the wrong button.
//  Re-greeting somebody mid-visit -- resetting the name they were halfway
//  through spelling -- is a far worse failure than never greeting anyone,
//  so a return to 'visible' only counts as a NEW PERSON if the session was
//  away for at least CFG.welcomeAwaySec. A cooldown sits on top of that.
//
//  ---- WHY THE TYPE IS IN THE SCENE AND NOT IN THE DOM ----
//
//  A <div> over the canvas is invisible inside an immersive XR session --
//  which is the exact and only moment this text needs to be readable. So
//  it is a canvas-textured plane in the world, like everything else here.
//
//  A PLANE, NOT A SPRITE, which is the opposite of the choice ui.js makes
//  for every other piece of type in the piece. Sprites billboard, which is
//  right for a letter thrown to a random angle under a butterfly. Here the
//  orientation is the point: this thing has to sit squarely in front of a
//  reader and be square to them, and it soft-follows rather than being
//  rigidly locked, so it needs an orientation it controls. (iconPlate()
//  reached the same conclusion for the marks on the flowers, for the same
//  underlying reason.)
//
//  SOFT-FOLLOW, NOT HEAD-LOCK. It eases toward a point in front of
//  wherever the visitor is looking. Hard-locking type to the face for 16
//  seconds is a reliable way to make somebody motion-sick, and this piece
//  already carries one motion-sickness note from the exhibition floor (see
//  keyboard.js:updateSlowField). Easing means they can look around, and it
//  follows them there.
// ============================================================

//  The greeting, as spoken by sounds/Voice.mp3. Text.txt in this folder is
//  the editable source of truth; this is the copy the piece runs on.
//
//  INLINED rather than fetched. CLAUDE.md's typography section is explicit
//  that nothing is fetched and there is no network on the critical path --
//  a piece that greets people has no business failing to greet them
//  because a text file 404'd.
var WELCOME_TEXT =
  'Welcome to Kalei Identity! Let’s discover what you would look like as a ' +
  'butterfly. To begin, catch the butterflies carrying the letters of your name ' +
  'and use them to craft your unique butterfly identity.';

var Welcome = {
  _c: null,
  //  v9.3: TRUE WHILE THE GREETING IS SPEAKING, and every butterfly
  //  interaction in the piece is switched off for exactly that long --
  //  interact.js returns early, keyboard.js ignores its letter keys, and
  //  the wave field never builds a gust.
  //
  //  A clock, not "has the audio finished". The voice is scheduled the
  //  moment SFX is ready but stays SILENT until the AudioContext is
  //  resumed by a user gesture (see audio.js's autoplay note), so the
  //  clip can end far later than the text does -- or never, on a machine
  //  where that gesture never arrives. A timer always ends, and the piece
  //  can never be left permanently uninteractive by an audio quirk.
  _lockUntil: 0,
  locked: function () {
    return performance.now() / 1000 < this._lockUntil;
  },
  //  The one call anything else in the piece would make. Nothing does yet:
  //  the triggers are all inside this file. Exposed anyway because "greet
  //  the next person" is an obvious thing for an operator's console to
  //  want, and there is no dev panel to put a button on.
  play: function () {
    if (this._c) { this._c.trigger('api'); }
  }
};

AFRAME.registerComponent('welcome-text', {
  init: function () {
    Welcome._c = this;

    this.words = WELCOME_TEXT.split(/\s+/);
    this.shown = -1;            // how many words are currently drawn
    this.t = 0;                 // seconds since the greeting began
    this.active = false;
    this.alpha = 0;

    this.lastAwayAt = 0;        // when the session last stopped being visible
    this.lastGreetAt = -1e9;    // when we last greeted somebody
    this.wasVisible = true;

    this._camPos = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._want = new THREE.Vector3();
    this._tmp = new THREE.Vector3();

    this.buildPlane();
    this.bindTriggers();
  },

  // ---------------- the type plane ----------------
  buildPlane: function () {
    var W = CFG.welcomeTexW, H = CFG.welcomeTexH;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.cx = this.canvas.getContext('2d');

    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    //  Canvas colour textures must be tagged sRGB or A-Frame's colour
    //  management reads the bytes as linear and encodes them again --
    //  every fill comes back a stop lighter and desaturated. Same note
    //  ui.js:srgb() and wing-paint.js:srgb() both carry.
    if (THREE.SRGBColorSpace !== undefined) { this.tex.colorSpace = THREE.SRGBColorSpace; }

    var mat = new THREE.MeshBasicMaterial({
      map: this.tex, transparent: true, opacity: 0, depthWrite: false,
      //  depthTest off so the greeting is never occluded by a butterfly
      //  drifting between it and the reader. It is the one thing in the
      //  piece that is allowed to sit on top of everything.
      depthTest: false
    });
    var h = CFG.welcomeWidth * (H / W);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(CFG.welcomeWidth, h), mat);
    this.mesh.renderOrder = 999;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.el.sceneEl.object3D.add(this.mesh);
  },

  //  ---- THE FRAME IS FIXED: LAID OUT ONCE, FROM THE WHOLE STRING ----
  //
  //  v9.0 wrapped only the words revealed so far and re-centred the block
  //  on every redraw, so the paragraph re-wrapped and jumped up the frame
  //  every time a new line started. Every glyph's position is now solved
  //  here, up front, from the COMPLETE text; the reveal afterwards only
  //  ever changes per-letter alpha. Nothing moves, nothing reflows,
  //  nothing changes size.
  //
  //  Must run AFTER the typeface is available. measureText against a
  //  fallback face lays out to the wrong widths, and since this runs once
  //  the wrap would then be wrong for the rest of the session. See
  //  js/type.js.
  layout: function () {
    var W = CFG.welcomeTexW, H = CFG.welcomeTexH;
    var cx = this.cx;
    var size = CFG.welcomeFontSize;
    var lh = size * CFG.welcomeLineGap;
    var pad = 48;
    cx.font = Type.font(size);

    // wrap the FULL text, not the revealed part of it
    var lines = [], cur = '';
    for (var i = 0; i < this.words.length; i++) {
      var trial = cur ? cur + ' ' + this.words[i] : this.words[i];
      if (cx.measureText(trial).width > W - pad * 2 && cur) {
        lines.push(cur); cur = this.words[i];
      } else {
        cur = trial;
      }
    }
    if (cur) { lines.push(cur); }

    //  ...then place every character, each line centred, recording a
    //  reading-order index so the reveal can address them in sequence.
    this.glyphs = [];
    var y0 = H / 2 - (lines.length - 1) * lh / 2;
    for (var j = 0; j < lines.length; j++) {
      var line = lines[j];
      var lw = cx.measureText(line).width;
      var x = W / 2 - lw / 2;
      var y = y0 + j * lh;
      for (var k = 0; k < line.length; k++) {
        var ch = line[k];
        //  Spaces are placed but never revealed. A space that "fades in"
        //  is a pause in the middle of a line for no visible reason.
        this.glyphs.push({ ch: ch, x: x, y: y, blank: ch === ' ' });
        x += cx.measureText(ch).width;
      }
    }
    this.revealable = 0;
    for (var g = 0; g < this.glyphs.length; g++) {
      if (!this.glyphs[g].blank) { this.glyphs[g].order = this.revealable++; }
    }
    this.size = size;
    this.laidOut = true;
  },

  //  Redrawn every frame while letters are still arriving, which is the
  //  price of per-letter opacity and a small one: flat fills into a
  //  1024x512 canvas for about sixteen seconds, then it stops entirely.
  //  (v9.0 redrew once per word; per-glyph alpha cannot work that way.)
  draw: function () {
    if (!this.laidOut) { return; }
    var W = CFG.welcomeTexW, H = CFG.welcomeTexH;
    var cx = this.cx;
    cx.clearRect(0, 0, W, H);
    cx.font = Type.font(this.size);
    cx.textAlign = 'left';
    cx.textBaseline = 'middle';
    cx.lineJoin = 'round';

    var per = CFG.welcomeSpeechSec / Math.max(1, this.revealable);
    for (var i = 0; i < this.glyphs.length; i++) {
      var g = this.glyphs[i];
      if (g.blank) { continue; }
      //  EASE IN / EASE OUT per letter, staggered by reading position.
      //  smoothstep is the piece's own easing (keyboard.js exports it):
      //  zero gradient at both ends, so a letter neither snaps on nor
      //  hangs at 99%. The fade is several times longer than the stagger,
      //  so what travels along the line is a soft wave rather than a row
      //  of characters switching on one at a time.
      var a = (this.t - g.order * per) / CFG.welcomeLetterFade;
      if (a <= 0) { continue; }
      var e = a >= 1 ? 1 : smoothstep(a);
      cx.globalAlpha = e;
      //  v9.2: EACH LETTER RISES INTO PLACE as it fades up. The same
      //  eased ramp drives both, so a glyph lifts the last few pixels to
      //  its line as it reaches full opacity and then stops dead on the
      //  layout the frame was built from -- the position is animated,
      //  never the layout, so nothing reflows and the block does not
      //  move.
      var dy = (1 - e) * CFG.welcomeLetterRise;
      cx.fillStyle = '#12121a';        // the same dark ink as the ray line
      cx.fillText(g.ch, g.x, g.y + dy);
    }
    cx.globalAlpha = 1;
    this.tex.needsUpdate = true;
  },

  // ---------------- the triggers ----------------
  bindTriggers: function () {
    var self = this;
    var sceneEl = this.el.sceneEl;

    //  A session started. This is the first person of a session and always
    //  a greeting -- but it is ALSO where the visibilitychange listener
    //  gets attached, because sceneEl.xrSession is a different object every
    //  session and a listener on the old one is dead.
    sceneEl.addEventListener('enter-vr', function () {
      self.watchSession(sceneEl.xrSession);
      self.trigger('enter-vr');
    });

    //  Desktop testing. Neither enter-vr nor an XRSession exists in a
    //  browser tab, and every bit of verification for this file happens
    //  there, so without this there is no way to see it work at all.
    window.addEventListener('keydown', function (e) {
      if (e.key === 'w' || e.key === 'W') { self.trigger('key'); }
    });

    //  ...and greet once on load when there is no headset in the picture,
    //  so opening the page on a desktop shows the flow rather than a blank
    //  room. Deliberately NOT done in XR: there, enter-vr covers it, and
    //  greeting before the session exists would talk to an empty room.
    setTimeout(function () {
      if (!sceneEl.is('vr-mode') && !sceneEl.is('ar-mode')) { self.trigger('load'); }
    }, 900);
  },

  //  visibilityState on the live XRSession is the closest thing WebXR has
  //  to "is the headset on a face right now".
  watchSession: function (session) {
    if (!session || session === this._session) { return; }
    this._session = session;
    var self = this;
    session.addEventListener('visibilitychange', function () {
      self.onVisibility(session.visibilityState === 'visible');
    });
    session.addEventListener('end', function () {
      if (self._session === session) { self._session = null; }
    });
    this.wasVisible = session.visibilityState === 'visible';
  },

  onVisibility: function (vis) {
    var now = performance.now() / 1000;
    if (!vis) {
      //  went away -- remember WHEN, so the return can be judged
      if (this.wasVisible) { this.lastAwayAt = now; }
      this.wasVisible = false;
      return;
    }
    if (this.wasVisible) { return; }        // already visible, nothing to do
    this.wasVisible = true;
    //  THE DEBOUNCE. A blink of the system menu is not the next person.
    var away = now - this.lastAwayAt;
    if (away < CFG.welcomeAwaySec) {
      console.log('[welcome] back after ' + away.toFixed(1) + 's -- same person, not greeting');
      return;
    }
    this.trigger('headset-on after ' + away.toFixed(1) + 's away');
  },

  //  One way in, so the cooldown cannot be bypassed by adding a trigger.
  trigger: function (why) {
    var now = performance.now() / 1000;
    if (now - this.lastGreetAt < CFG.welcomeCooldownSec) {
      console.log('[welcome] suppressed (' + why + ') -- inside cooldown');
      return;
    }
    this.lastGreetAt = now;
    //  ...and the room stops listening for as long as the greeting talks.
    Welcome._lockUntil = now + CFG.welcomeLockSec;

    this.active = true;
    this.t = 0;
    this.placed = false;        // snap to position on the first frame
    this.mesh.visible = true;
    if (!this.laidOut) { this.layout(); }

    SFX.playVoice();

    //  RESET THE PIECE FOR THEM. The new wearer must not inherit the last
    //  person's half-typed name. Born butterflies are untouched on purpose
    //  -- see the header.
    var kbEl = document.querySelector('[butterfly-keyboard]');
    var kb = kbEl && kbEl.components && kbEl.components['butterfly-keyboard'];
    if (kb && kb.initialized) { kb.reset(); }

    //  A NEW WEARER GETS THE WHOLE TUTORIAL AGAIN, and the last one's
    //  reminders cleared out of their view. resetVisitor() forgets which
    //  cards have been shown, drops anything still queued -- the point
    //  card is scheduled five seconds after a green press, easily long
    //  enough for someone to accept their name and hand the headset
    //  straight on -- and un-docks the cards riding the camera.
    if (typeof Tutorial !== 'undefined') { Tutorial.resetVisitor(); }

    console.log('[welcome] greeting a new visitor (' + why + ')');
  },

  // ---------------- per frame ----------------
  tick: function (time, dtMs) {
    if (!this.active || !dtMs) { return; }
    var dt = Math.min(dtMs / 1000, 0.05);
    this.t += dt;

    // ---- the letters arrive ----
    //  Redrawn every frame until the last letter has finished its own
    //  fade, then left alone -- there is nothing to animate after that
    //  and the plane just holds its final texture.
    var lastDone = CFG.welcomeSpeechSec + CFG.welcomeLetterFade;
    if (this.t <= lastDone) { this.draw(); }

    // ---- fade in, hold, fade out ----
    var done = lastDone + CFG.welcomeHoldSec;
    if (this.t < CFG.welcomeFadeSec) {
      this.alpha = this.t / CFG.welcomeFadeSec;
    } else if (this.t > done) {
      this.alpha = 1 - (this.t - done) / CFG.welcomeFadeSec;
      if (this.alpha <= 0) {
        this.alpha = 0; this.active = false; this.mesh.visible = false;
        //  v9.1: the greeting hands straight over to the first tutorial
        //  card. Chained here rather than on a timer started at trigger()
        //  so it cannot drift out of sync with the greeting's own length
        //  -- change welcomeSpeechSec and this still lands right after it.
        if (typeof Tutorial !== 'undefined') { Tutorial.show('pinch'); }
      }
    } else {
      this.alpha = 1;
    }
    this.mesh.material.opacity = this.alpha;

    // ---- where it sits ----
    var cam = this.el.sceneEl.camera;
    if (!cam) { return; }
    cam.updateMatrixWorld();
    cam.getWorldPosition(this._camPos);

    //  The camera's forward, FLATTENED to horizontal. Unflattened, looking
    //  at the floor would push the greeting into the floor with it. Same
    //  reasoning interact.js:updateCamera() gives for flattening the axis
    //  it derives shoulders from.
    this._fwd.set(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    this._fwd.y = 0;
    if (this._fwd.lengthSq() < 1e-6) { this._fwd.set(0, 0, -1); }
    this._fwd.normalize();

    this._want.copy(this._camPos).addScaledVector(this._fwd, CFG.welcomeDist);
    this._want.y = this._camPos.y + CFG.welcomeHeight;

    if (!this.placed) {
      //  First frame: snap. Easing in from wherever the mesh happened to be
      //  left last time would fly the greeting across the room to reach the
      //  reader, which reads as a bug rather than as an entrance.
      this.mesh.position.copy(this._want);
      this.placed = true;
    } else {
      //  ...and ease from then on. Frame-rate independent, the same
      //  exponential form as CFG.aimSmoothTau.
      var k = 1 - Math.exp(-dt / CFG.welcomeFollowTau);
      this.mesh.position.lerp(this._want, k);
    }
    //  Square to the reader. lookAt on the camera position rather than
    //  copying the camera's quaternion, so the plane stays upright when the
    //  visitor tilts their head.
    this._tmp.copy(this._camPos);
    this._tmp.y = this.mesh.position.y;
    this.mesh.lookAt(this._tmp);
  },

  remove: function () {
    if (this.mesh) {
      this.el.sceneEl.object3D.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.tex.dispose();
    }
    Welcome._c = null;
  }
});
