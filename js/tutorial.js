// ============================================================
//  tutorial.js  --  three prompts, each arriving big and then docking
// ============================================================
//  CLAUDE.md has an unusually firm line about instructions: "an
//  instruction is a confession that the interaction did not carry
//  itself", and the scatter of explanatory text was deleted rather than
//  disabled because of it. That principle still holds for the swarm --
//  you reach at a butterfly, it lights up, and no sentence would improve
//  that.
//
//  These are the same exception the flower marks already are. None of the
//  piece's three gestures is discoverable by looking:
//
//    PINCH    nothing about a butterfly says "close your thumb on it".
//    POINT    nothing says an extended index finger gathers the
//             butterflies you have made -- a visitor could finish a whole
//             session without ever learning the gesture exists.
//    WAVE     likewise for sweeping a hand through the flock.
//
//  ---- THE SHAPE OF THE ANIMATION ----
//
//    arrive   fades up, big and centred in front of the visitor
//    hold     CFG.tutorialHoldSec, so it cannot be missed
//    dock     shrinks and travels to the top right, eased
//    stay     sits there as a reminder for the rest of the visit
//
//  ---- ONE CARD PER MESH, WHICH v9.1 DID NOT DO ----
//
//  v9.1 reused a single mesh for whichever card was current, which was
//  fine while only one could ever be on screen. The waving card has to
//  sit UNDER the pointing card, both docked at once, so each card now
//  owns its own mesh, canvas and texture, and docked cards take stacking
//  slots down the right-hand side in the order they arrive.
//
//  ---- ONCE PER VISITOR ----
//
//  A prompt is only useful the first time. `shownOnce` blocks a repeat,
//  and welcome.js clears it through resetVisitor() when it detects a new
//  wearer -- so the next person in the queue gets the full set again from
//  scratch, and the previous person's docked cards are cleared out from
//  in front of them.
//
//  ---- WHY THE DOCKED CARD IS HEAD-LOCKED ----
//
//  Everything else that follows the visitor soft-follows: welcome.js
//  eases toward the gaze rather than gluing to it, because hard-locking a
//  large object to the face for many seconds is a reliable way to cause
//  motion sickness, and this piece already carries one such note from the
//  exhibition floor.
//
//  The docked cards are the deliberate exception, because the brief for
//  them is exact: "it will follow and stay exactly on the same spot".
//  That is a HUD, and a HUD that eases is one that visibly lags and swims
//  -- far worse than one simply nailed down. They are also small, static
//  and peripheral, which is the case where head-locking is comfortable.
//  So a docked card is parented INTO the camera and needs no tick code at
//  all to follow. The big centred phase is NOT parented to the camera --
//  it is placed in the world and left there, because a large object
//  welded to the face is exactly what is being avoided.
// ============================================================

var Tutorial = {
  _c: null,
  //  `delaySec` is optional -- see CFG.tutorialPointDelaySec.
  show: function (which, delaySec) {
    if (this._c) { this._c.show(which, delaySec); }
  },
  //  Drop anything queued but not yet shown.
  cancel: function () {
    if (this._c) { this._c.cancel(); }
  },
  //  A new wearer: forget what has been shown and clear the docked cards.
  resetVisitor: function () {
    if (this._c) { this._c.resetVisitor(); }
  }
};

AFRAME.registerComponent('tutorial-cards', {
  init: function () {
    Tutorial._c = this;

    //  `next` chains one card to the one before it, fired when that card
    //  finishes docking. Two cards on independent timers would eventually
    //  overlap in the middle of the view; chaining makes that
    //  structurally impossible however the timings are retuned later.
    this.CARDS = {
      pinch: { text: 'Pinch finger to catch', icon: 'icons/pinching.png' },
      point: { text: 'Pointing index finger to see generated butterflies.',
               icon: 'icons/pointing.png', next: 'wave' },
      wave:  { text: 'Waving to see their harmony.', icon: 'icons/waving.png' }
    };

    this.cards = {};         // which -> the live card object
    this.icons = {};
    this.shownOnce = {};     // which -> true, cleared per visitor
    this.slots = [];         // docked cards, in arrival order

    this._camPos = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._q = new THREE.Quaternion();

    this.preloadIcons();
  },

  //  The PNGs are fetched once, up front. Loading them at show() time
  //  would render the first card with a blank space where its icon goes
  //  -- the same class of bug as the font, with the same fix.
  preloadIcons: function () {
    var self = this;
    Object.keys(this.CARDS).forEach(function (k) {
      var img = new Image();
      img.onload = function () {
        self.icons[k] = img;
        var c = self.cards[k];
        if (c) { self.draw(k); }        // redraw if it is already up
      };
      img.onerror = function () {
        console.warn('[tutorial] missing icon ' + self.CARDS[k].icon);
      };
      img.src = self.CARDS[k].icon;
    });
  },

  // ---------------- one card, one mesh ----------------
  makeCard: function (which) {
    var W = CFG.tutorialTexW, H = CFG.tutorialTexH;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (THREE.SRGBColorSpace !== undefined) { tex.colorSpace = THREE.SRGBColorSpace; }

    var mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0,
      //  depthTest off so a card is never occluded by a butterfly
      //  drifting in front of it -- these are the only things in the
      //  piece allowed to sit on top of everything.
      depthWrite: false, depthTest: false
    });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, H / W), mat);
    mesh.renderOrder = 998;
    mesh.visible = false;
    mesh.frustumCulled = false;
    this.el.sceneEl.object3D.add(mesh);

    var card = {
      which: which, canvas: canvas, cx: canvas.getContext('2d'),
      tex: tex, mesh: mesh,
      state: 'idle', t: 0, alpha: 0, slot: -1
    };
    this.cards[which] = card;
    return card;
  },

  //  Drawn once per card, not per frame -- the opacity animation lives on
  //  the material and the move on the transform, so the texture never has
  //  to change once it is up.
  draw: function (which) {
    var card = this.cards[which];
    var def = this.CARDS[which];
    if (!card || !def) { return; }
    var W = CFG.tutorialTexW, H = CFG.tutorialTexH;
    var cx = card.cx;
    cx.clearRect(0, 0, W, H);

    var pad = 26;
    var iconW = W * CFG.tutorialIconFrac;
    var img = this.icons[which];

    //  ICON LEFT, TEXT RIGHT, both vertically centred. The icon goes into
    //  a square box of the canvas height so a non-square PNG keeps its
    //  aspect rather than being stretched.
    if (img) {
      var box = Math.min(iconW, H - pad * 2);
      var s = Math.min(box / img.width, box / img.height);
      var iw = img.width * s, ih = img.height * s;
      cx.drawImage(img, pad + (iconW - iw) / 2, (H - ih) / 2, iw, ih);
    }

    var tx = pad + iconW + pad * 0.6;
    var avail = W - tx - pad;

    //  One line if it fits, two if it does not. The point card's sentence
    //  needs two at a readable size, and shrinking it to force one line
    //  would make the card that matters most the hardest to read.
    var size = 58;
    cx.font = Type.font(size);
    var lines = [def.text];
    if (cx.measureText(def.text).width > avail) {
      var words = def.text.split(' '), a = '', b = '';
      for (var i = 0; i < words.length; i++) {
        var trial = a ? a + ' ' + words[i] : words[i];
        if (cx.measureText(trial).width <= avail || !a) { a = trial; }
        else { b = b ? b + ' ' + words[i] : words[i]; }
      }
      lines = b ? [a, b] : [a];
    }

    cx.textAlign = 'left';
    cx.textBaseline = 'middle';
    var lh = size * 1.24;
    var y0 = H / 2 - (lines.length - 1) * lh / 2;
    for (var j = 0; j < lines.length; j++) {
      //  v9.2: no white outline. It was there to keep dark ink legible
      //  against an unknown passthrough wall, but against the white sky it
      //  read as a halo stuck around every glyph and fought the typeface.
      //  Plain ink, matching the flat rule the rest of the piece follows.
      cx.fillStyle = '#12121a';
      cx.fillText(lines[j], tx, y0 + j * lh);
    }
    card.tex.needsUpdate = true;
  },

  // ---------------- the one call anything else makes ----------------
  show: function (which, delaySec) {
    if (!this.CARDS[which]) { return; }
    //  ONCE PER VISITOR. A prompt is only useful the first time, and the
    //  green control can be pressed repeatedly in one visit.
    if (this.shownOnce[which]) { return; }
    var self = this;

    if (delaySec > 0) {
      this.cancel();
      this._pending = setTimeout(function () {
        self._pending = null;
        self.show(which);
      }, delaySec * 1000);
      return;
    }
    this.cancel();

    //  Type.ready for the same reason keyboard.js waits: this canvas is
    //  drawn once and cached, so drawing before Kavoon has landed bakes
    //  the fallback face in permanently.
    Type.ready(function () {
      if (self.shownOnce[which]) { return; }
      self.shownOnce[which] = true;
      var card = self.cards[which] || self.makeCard(which);
      card.state = 'arrive';
      card.t = 0;
      card.alpha = 0;
      card.mesh.visible = true;
      if (card.mesh.parent !== self.el.sceneEl.object3D) {
        self.el.sceneEl.object3D.add(card.mesh);
      }
      self.placeBig(card);
      self.draw(which);
      console.log('[tutorial] showing "' + which + '"');
    });
  },

  cancel: function () {
    if (this._pending) { clearTimeout(this._pending); this._pending = null; }
  },

  //  A new wearer. Forget the set and clear whatever is docked, so the
  //  next person starts from nothing rather than inheriting a stranger's
  //  reminders parked in the corner of their view.
  resetVisitor: function () {
    this.cancel();
    this.shownOnce = {};
    this.slots.length = 0;
    var self = this;
    Object.keys(this.cards).forEach(function (k) {
      var c = self.cards[k];
      c.state = 'idle'; c.alpha = 0; c.slot = -1;
      c.mesh.visible = false;
      c.mesh.material.opacity = 0;
      //  back out of the camera, or it would still be riding the view
      if (c.mesh.parent !== self.el.sceneEl.object3D) {
        self.el.sceneEl.object3D.add(c.mesh);
      }
    });
  },

  //  The big centred pose, solved in world space and then LEFT THERE --
  //  not head-locked, see the header. Solved once on arrival, so turning
  //  your head during the hold does not drag it around.
  placeBig: function (card) {
    var cam = this.el.sceneEl.camera;
    if (!cam) { return; }
    cam.updateMatrixWorld();
    cam.getWorldPosition(this._camPos);
    cam.getWorldQuaternion(this._q);
    this._fwd.set(0, 0, -1).applyQuaternion(this._q);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() < 1e-6) { this._fwd.set(0, 0, -1); }
    this._fwd.normalize();

    card.mesh.position.copy(this._camPos)
        .addScaledVector(this._fwd, CFG.tutorialBigDist);
    card.mesh.position.y = this._camPos.y + CFG.tutorialBigY;
    card.mesh.scale.setScalar(CFG.tutorialBigWidth);
    card.mesh.lookAt(this._camPos.x, card.mesh.position.y, this._camPos.z);
  },

  //  THE DOCK POSITION, IN CAMERA SPACE, DERIVED FROM THE PROJECTION.
  //
  //  Working back from the field of view is what makes "the top right
  //  corner" mean the same thing on a desktop window and inside a Quest.
  //  A hard-coded metre offset does not: it is a fixed distance sideways,
  //  and how far across the screen that lands depends entirely on the
  //  camera's fov and aspect. Tuned in a browser, it sat near the middle
  //  of a headset's much wider view.
  //
  //  `slot` stacks cards downward from the corner, which is what puts the
  //  waving card under the pointing one.
  dockOffset: function (cam, out, slot) {
    var dist = CFG.tutorialDockDist;
    var halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5) * dist;
    var halfW = halfH * (cam.aspect || 1);
    //  the card's own height at docked scale, in metres at dockDist
    var cardH = CFG.tutorialDockWidth * (CFG.tutorialTexH / CFG.tutorialTexW);
    var step = cardH * (1 + CFG.tutorialStackGap);
    return out.set(halfW * CFG.tutorialDockFracX,
                   halfH * CFG.tutorialDockFracY - slot * step,
                   -dist);
  },

  tick: function (time, dtMs) {
    if (!dtMs) { return; }
    var dt = Math.min(dtMs / 1000, 0.05);
    var cam = this.el.sceneEl.camera;
    var self = this;
    Object.keys(this.cards).forEach(function (k) {
      self.tickCard(self.cards[k], dt, cam);
    });
  },

  tickCard: function (card, dt, cam) {
    if (card.state === 'idle') { return; }
    card.t += dt;

    if (card.state === 'arrive') {
      //  EASE IN on opacity, the same smoothstep as everywhere else
      card.alpha = smoothstep(Math.min(1, card.t / CFG.tutorialFadeSec));
      if (card.t >= CFG.tutorialFadeSec) {
        card.state = 'hold'; card.t = 0; card.alpha = 1;
      }

    } else if (card.state === 'hold') {
      card.alpha = 1;
      if (card.t >= CFG.tutorialHoldSec) {
        card.state = 'dock'; card.t = 0;
        card.fromPos = card.mesh.position.clone();
        card.fromQuat = card.mesh.quaternion.clone();
        card.fromScale = card.mesh.scale.x;
        //  claim the next free stacking slot at the moment it starts
        //  travelling, so the destination is known for the whole move
        card.slot = this.slots.length;
        this.slots.push(card.which);
        card.toPos = new THREE.Vector3();
        card.toQuat = new THREE.Quaternion();
      }

    } else if (card.state === 'dock') {
      //  EASE IN / EASE OUT on the travel and the shrink together
      var e = smoothstep(Math.min(1, card.t / CFG.tutorialMoveSec));
      card.alpha = 1;
      //  Recomputed every frame from the LIVE camera: during the move the
      //  visitor may well be turning to look at a butterfly, and a target
      //  frozen at the start would land the card in the wrong part of the
      //  view.
      if (cam) {
        cam.updateMatrixWorld();
        this.dockOffset(cam, card.toPos, card.slot).applyMatrix4(cam.matrixWorld);
        cam.getWorldQuaternion(card.toQuat);
      }
      card.mesh.position.lerpVectors(card.fromPos, card.toPos, e);
      card.mesh.quaternion.copy(card.fromQuat).slerp(card.toQuat, e);
      card.mesh.scale.setScalar(card.fromScale +
        (CFG.tutorialDockWidth - card.fromScale) * e);
      if (card.t >= CFG.tutorialMoveSec) {
        //  the hand-off: from here the scene graph holds it in place
        if (cam) {
          cam.add(card.mesh);
          this.dockOffset(cam, card.mesh.position, card.slot);
          card.mesh.quaternion.identity();
          card.mesh.scale.setScalar(CFG.tutorialDockWidth);
        }
        card.state = 'stay'; card.t = 0;
        //  ...and only now does the next card in the chain start, so two
        //  can never be big and centred at the same time
        var nx = this.CARDS[card.which].next;
        if (nx) { this.show(nx); }
      }
    }

    card.mesh.material.opacity = card.alpha;
  },

  remove: function () {
    this.cancel();
    var self = this;
    Object.keys(this.cards).forEach(function (k) {
      var c = self.cards[k];
      if (c.mesh.parent) { c.mesh.parent.remove(c.mesh); }
      c.mesh.geometry.dispose();
      c.mesh.material.dispose();
      c.tex.dispose();
    });
    this.cards = {};
    Tutorial._c = null;
  }
});
