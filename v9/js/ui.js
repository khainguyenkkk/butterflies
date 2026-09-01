// ============================================================
//  ui.js  --  everything that is not a butterfly
// ============================================================
//  Two kinds of thing, built two different ways for two different
//  reasons:
//
//    letters   SPRITES. They ride under butterflies that circle the
//              visitor, so a mounted plane would be edge-on half the
//              time and mirrored the other half. A sprite faces the
//              camera for free, with no per-frame billboarding to run
//              over twenty-six of them.
//
//    shapes    GEOMETRY. They deform every frame, and deforming a drawn
//              shape means re-uploading a texture every frame to say
//              what a hundred vertices say for nothing.
//
//  Everything is FLAT: no glow, no gradient, no soft edge anywhere. If
//  something needs to stand out it changes colour or size.
//
//  No font asset is fetched -- the type is whatever the browser already
//  has, drawn into a canvas. Helvetica Neue on a Mac, Roboto on a Quest.
//  For A-Z and a short name that is fine, and it keeps the network off
//  the critical path.
// ============================================================
var UI = (function () {
  'use strict';

  //  Helvetica Neue where it exists, then the usual grotesque fallbacks.
  //  Nothing is fetched -- these are whatever the browser already has,
  //  which on a Quest is Roboto and on a Mac is Helvetica Neue itself.
  //  No bold anywhere: 500 is as heavy as it gets.
  //  v9.1: the whole piece is set in Kavoon now. See js/type.js for why
  //  that is a shared module rather than a string -- a webfont that has
  //  not finished loading is silently substituted by canvas, and every
  //  glyph in this scene is drawn to a canvas exactly once and cached.
  var FONT = Type.family;

  //  The second colour of a two-colour job. It prints the misregistered
  //  impression under every caught letter.
  var OVERPRINT = 'hsl(310, 100%, 56%)';

  //  A canvas holds sRGB. three.js assumes NO colour space on a
  //  CanvasTexture, so with A-Frame's colour management on it treats
  //  these bytes as linear and encodes them again on the way out --
  //  every flat fill comes back a stop lighter and visibly desaturated.
  //  A solid red draws as pink. Say what the canvas actually is.
  //
  //  Only the COLOUR canvases need this. The wing and body maps are
  //  alpha, read straight off a channel, and must stay unconverted.
  function srgb(tex) {
    if (THREE.SRGBColorSpace) { tex.colorSpace = THREE.SRGBColorSpace; }
    return tex;
  }

  // ---- one letter, riding under one butterfly ----
  //  A SPRITE, not a plane. The butterflies circle the visitor, so a
  //  letter mounted flat would be edge-on half the time and mirrored
  //  the other half; a sprite always faces the camera for free, with no
  //  per-frame billboarding to run over twenty-six of them.
  //
  //  Textures are cached per (character, state), so the whole keyboard
  //  is 52 small canvases however long it runs.
  //
  //  FLAT. No glow, no halo, no soft edge -- a highlighted letter is
  //  simply blacker and heavier than an idle one. The scene is white and
  //  a passthrough room is usually light, so ink reads on both.
  var letterCache = {};

  //  Three flavours, all flat, all in THE BUTTERFLY'S OWN COLOUR:
  //
  //    idle   the glyph, under a butterfly waiting to be caught
  //    hot    the glyph knocked out of a solid disc -- the highlight
  //    name   the glyph, for a letter already caught
  //
  //  Cached on character and flavour alone: a letter has exactly one
  //  butterfly, so the colour is a function of the character.
  //
  //  The HIGHLIGHT is on the letter, not on the butterfly. Recolouring
  //  the butterfly was the obvious move and is wrong twice over: against
  //  white the only colour with enough contrast to mean anything is
  //  black, which reads as switched off rather than chosen, and in a dark
  //  passthrough room it disappears outright. Filling the letter's disc
  //  is unmistakable on any background and leaves all 26 butterflies
  //  their own colour, which is the point of them.
  function letterTex(ch, mode, color, v) {
    v = v || {};
    var key = ch + mode + color + (v.hollow ? 'o' : '') + (v.mirror ? 'm' : '');
    if (letterCache[key]) { return letterCache[key]; }
    var S = 128;
    var c = document.createElement('canvas');
    c.width = S; c.height = S;
    var x = c.getContext('2d');
    x.clearRect(0, 0, S, S);

    if (v.mirror) { x.translate(S, 0); x.scale(-1, 1); }

    if (mode === 'hot') {
      // the highlight is a filled disc in the butterfly's own colour,
      // whatever the letter was doing before
      x.fillStyle = color;
      x.beginPath();
      x.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2);
      x.fill();
    }
    x.font = '500 ' + (mode === 'hot' ? 82 : 96) + 'px ' + FONT;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    if (mode !== 'hot' && v.hollow) {
      // hollow: the letter as an outline. Cut through a dense corner of
      // the composition without adding another solid mass to it.
      x.strokeStyle = color;
      x.lineWidth = 3.5;
      x.strokeText(ch, S / 2, S / 2 + 4);
    } else {
      x.fillStyle = mode === 'hot' ? '#ffffff' : color;
      x.fillText(ch, S / 2, S / 2 + 4);
    }

    var t = new THREE.CanvasTexture(c);
    t.generateMipmaps = false;           // small text mushes in the low levels
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    srgb(t);
    letterCache[key] = t;
    return t;
  }

  //  A hollow letter, at whatever size is asked for. Used for the
  //  satellites that hang off a butterfly at a size unrelated to its own
  //  letter, for the alphabet ringing the room, and for the giant ones
  //  parked out in the far distance.
  //
  //  Its own 512 canvas, not the 128 the small letters use: a 128 glyph
  //  blown up to two metres is a smear.
  var bigCache = {};
  function bigTex(ch, color, weight) {
    var key = ch + color + (weight || 400);
    if (bigCache[key]) { return bigCache[key]; }
    var S = 512;
    var c = document.createElement('canvas');
    c.width = S; c.height = S;
    var x = c.getContext('2d');
    x.font = '400 400px ' + FONT;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.strokeStyle = color;
    x.lineWidth = weight || 7;
    x.strokeText(ch, S / 2, S / 2 + 16);
    var t = new THREE.CanvasTexture(c);
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    srgb(t);
    bigCache[key] = t;
    return t;
  }

  function hollow(ch, color, size, weight) {
    var mat = new THREE.SpriteMaterial({
      map: bigTex(ch, color, weight), transparent: true, opacity: 0.8, depthWrite: false
    });
    var sp = new THREE.Sprite(mat);
    sp.scale.set(size, size, 1);
    sp.dispose = function () { mat.dispose(); };
    return sp;
  }

  //  THE LETTER CUT OUT OF THE WING.
  //  The generated wing is an opaque canvas -- white shape on black --
  //  read as an alphaMap off the green channel, so filling the glyph
  //  with black punches a letter-shaped hole straight through the wing.
  //  No compositing modes, no premultiplied-alpha surprises.
  //
  //  The slice is drawn with the BODY AXIS VERTICAL down the left edge
  //  and the plane's UVs turn it ninety degrees, so the glyph has to be
  //  laid in sideways here to come out upright on the butterfly. And
  //  because the right wing is the same texture mirrored, every
  //  butterfly carries its letter once each way round.
  //  The same glyph, in the same place, on its own: white on black, to
  //  be read as the alphaMap of a second wing sitting inside the hole
  //  the first one has been punched through. That is how the cut-out
  //  letter gets a colour instead of showing the room behind it.
  function wingGlyph(x, w, h, ch, st) {
    //  The slice is drawn with the BODY AXIS VERTICAL down the left edge
    //  and the plane's UVs turn it ninety degrees, so the glyph is laid
    //  in sideways to come out upright on the butterfly. On top of that
    //  sits this butterfly's own angle, squash and shear -- the hole and
    //  the fill both come through here, so they cannot drift apart.
    x.save();
    x.translate(w * (0.52 + st.wingOffX), h * (0.46 + st.wingOffY));
    x.rotate(-Math.PI / 2 + st.wingRot);
    x.scale(st.wingSX, st.wingSY);
    x.transform(1, st.wingShear, 0, 1, 0, 0);
    x.font = '600 ' + Math.round(w * st.wingSize) + 'px ' + FONT;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(ch, 0, 0);
    x.restore();
  }

  //  The same glyph, in the same place, on its own: white on black, to
  //  be read as the alphaMap of a second wing sitting inside the hole
  //  the first one has been punched through. That is how the cut-out
  //  letter gets a colour instead of showing the room behind it.
  function letterMask(w, h, ch, st) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    x.fillStyle = '#000000';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffffff';
    wingGlyph(x, w, h, ch, st);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    return t;
  }

  //  THE LETTER CUT OUT OF THE WING.
  //  The generated wing is an OPAQUE canvas -- white shape on black --
  //  read as an alphaMap off the green channel, so filling the glyph
  //  with black punches a letter-shaped hole straight through it. No
  //  compositing modes, no premultiplied-alpha surprises.
  function punchLetter(src, ch, st) {
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    var x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.fillStyle = '#000000';
    wingGlyph(x, c.width, c.height, ch, st);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    return t;
  }

  function letter(ch, color, st, ghostColor) {
    //  A letter is a GROUP: the impression itself, its ghosts, and for
    //  some butterflies a three-dimensional lattice of the same letter
    //  scattered through the space around the body. They share two
    //  textures -- the letter in its own ink, and the letter in the
    //  ghost's -- because every copy is the same letter, not another one.
    var group = new THREE.Group();
    var map = letterTex(ch, 'idle', color, st);
    var ghostMap = letterTex(ch, 'idle', ghostColor, st);
    var hotMap = letterTex(ch, 'hot', color, st);

    function impression(m, op) {
      var mat = new THREE.SpriteMaterial({
        map: m, transparent: true, opacity: op, depthWrite: false
      });
      //  SpriteMaterial.rotation turns the sprite in SCREEN space, so a
      //  letter can be thrown to any angle and still face the camera.
      //  Nothing here is billboarded by hand and nothing is ever edge-on.
      mat.rotation = st.rot;
      var sp = new THREE.Sprite(mat);
      group.add(sp);
      return sp;
    }

    var main = impression(map, 0.95);
    var i, echoes = [];
    for (i = 0; i < st.echo; i++) { echoes.push(impression(ghostMap, 0)); }

    //  The lattice. Positions come off a small deterministic generator
    //  seeded per butterfly, so a given letter always wears the same
    //  arrangement -- wild, but the same wild every session.
    var cells = [], grid = [];
    var g = st.gridSeed;
    function gr() { g = (g * 9301 + 49297) % 233280; return g / 233280; }
    for (i = 0; i < st.grid; i++) {
      cells.push({
        x: (gr() - 0.5) * 2, y: (gr() - 0.5) * 2, z: (gr() - 0.5) * 2,
        k: 0.35 + gr() * 0.85,            // each copy its own size
        rot: (gr() - 0.5) * 1.6,
        ph: gr() * 6.283
      });
      grid.push(impression(gr() < 0.4 ? map : ghostMap, 0));
    }

    var o = {
      group: group, hot: false,
      setHot: function (on) {
        if (on === o.hot) { return; }
        o.hot = on;
        main.material.map = on ? hotMap : map;
        main.material.rotation = on ? st.rot * 0.35 : st.rot;   // straightens when chosen
        main.material.needsUpdate = true;
      },
      //  Angular scale: multiplied by distance from the camera so the
      //  letter stays about the same size on screen wherever its
      //  butterfly is, clamped at both ends.
      place: function (camPos, worldPos, size, alpha, t) {
        var dist = camPos.distanceTo(worldPos);
        var h = Math.max(CFG.letterMin, Math.min(CFG.letterMax, dist * CFG.letterAngular));
        h *= st.scale;
        if (o.hot) { h *= 1.35; }
        main.scale.set(h, h, 1);
        var d = h * st.dist;
        var px = Math.cos(st.around) * d;
        var py = Math.sin(st.around) * d - 0.10 * size;
        main.position.set(px, py, 0);
        main.material.opacity = (o.hot ? 1.0 : 0.95) * alpha;

        //  THE GHOST WALKS. Each step turns a little further off the last
        //  (echoBend), the spacing swells and shrinks on its own slow
        //  period (echoRate), and the whole trail fans out while the
        //  letter is chosen. A straight evenly-spaced trail is a drop
        //  shadow; this is meant to read as something moving.
        var j, ang, step, x = px, y = py;
        var breathe = 1 + 0.35 * Math.sin(t * st.echoRate * 6.283);
        var open = o.hot ? 2.1 : 1;
        for (j = 0; j < echoes.length; j++) {
          ang = st.echoDir + st.echoBend * j + 0.25 * Math.sin(t * st.echoRate * 3.1 + j);
          step = h * st.echoStep * breathe * open * (1 - j * 0.12);
          x += Math.cos(ang) * step;
          y += Math.sin(ang) * step;
          var kk = 1 - (j + 1) * 0.15;
          echoes[j].position.set(x, y, -0.0004 * (j + 1));
          echoes[j].scale.set(h * kk, h * kk, 1);
          echoes[j].material.opacity = (0.38 / (j + 1)) * alpha;
          echoes[j].material.rotation = st.rot + 0.12 * j;
        }

        //  The lattice drifts, each cell on its own phase, so the cluster
        //  is never quite the shape it was a moment ago.
        var sp2 = h * st.gridSpread;
        for (j = 0; j < grid.length; j++) {
          var c = cells[j];
          var w = 0.12 * Math.sin(t * 0.31 + c.ph);
          grid[j].position.set(px + (c.x + w) * sp2,
                               py + (c.y + w * 0.7) * sp2,
                               c.z * sp2);
          var s2 = h * c.k * (1 + 0.10 * Math.sin(t * 0.23 + c.ph * 1.7));
          grid[j].scale.set(s2, s2, 1);
          grid[j].material.opacity = (o.hot ? 0.75 : 0.42) * alpha;
          grid[j].material.rotation = c.rot + 0.05 * Math.sin(t * 0.17 + c.ph);
        }
        return main.position;
      },
      dispose: function () {
        group.children.forEach(function (sp) { sp.material.dispose(); });
      }
    };
    return o;
  }

  // ---- the chosen letter, blown up behind everything ----
  //  One sprite, re-textured as the highlight moves. When you pick a
  //  butterfly out of the swarm its letter is also struck two metres tall
  //  a few metres behind it, hollow and faint. The highlight stops being
  //  a small thing happening to a small thing: the whole room briefly
  //  becomes the letter you are about to take.
  function bigLetter() {
    var mat = new THREE.SpriteMaterial({
      map: bigTex('A', '#000000'), transparent: true, opacity: 0, depthWrite: false
    });
    var sp = new THREE.Sprite(mat);
    sp.visible = false;
    sp.show = function (ch, color) {
      mat.map = bigTex(ch, color);
      mat.needsUpdate = true;
      sp.visible = true;
    };
    sp.hide = function () { sp.visible = false; };
    sp.fade = function (a, rot) { mat.opacity = a; mat.rotation = rot; };
    sp.dispose = function () { mat.dispose(); };
    return sp;
  }

  // ---- a word, set on its side ----
  //  The strings the reference runs up the edge of everything: small,
  //  black, turned ninety degrees or thereabouts, saying something
  //  factual. They belong to nothing in the scene. That is the point --
  //  they are the printed matter the butterflies are flying through.
  var wordCache = {};
  function wordTex(text, color) {
    var key = text + color;
    if (wordCache[key]) { return wordCache[key]; }
    var W = 1024, H = 128;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');
    x.clearRect(0, 0, W, H);
    x.font = '500 72px ' + FONT;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = color;
    // condense a long string rather than let it run off the canvas
    var k = Math.min(1, (W - 24) / x.measureText(text).width);
    x.translate(W / 2, H / 2 + 4);
    x.scale(k, 1);
    x.fillText(text, 0, 0);
    var t = new THREE.CanvasTexture(c);
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    srgb(t);
    wordCache[key] = t;
    return t;
  }

  function wordmark(text, color, height, rot) {
    var mat = new THREE.SpriteMaterial({
      map: wordTex(text, color), transparent: true, opacity: 0.85, depthWrite: false
    });
    mat.rotation = rot;
    var sp = new THREE.Sprite(mat);
    sp.scale.set(height * 8, height, 1);
    sp.dispose = function () { mat.dispose(); };
    return sp;
  }

  // ---- a rule ----
  //  A long thin bar. Quads, not lines: line width is ignored on nearly
  //  every platform, so a "1px" rule in a headset is whatever the driver
  //  feels like, while a quad is a thickness you chose.
  function rule(len, thick, color) {
    var mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), transparent: true, opacity: 0.9,
      side: THREE.DoubleSide, depthWrite: false
    });
    var m = new THREE.Mesh(new THREE.PlaneGeometry(len, thick), mat);
    m.dispose = function () { m.geometry.dispose(); mat.dispose(); };
    return m;
  }

  // ---- the mark on a control (v8) ----
  //  The two flowers never said what they did. The piece has no
  //  instructional text on purpose -- "an instruction is a confession
  //  that the interaction did not carry itself" -- but a shape that
  //  finishes your name and a shape that takes a letter back are not
  //  self-evident from colour alone, and getting them the wrong way
  //  round costs a visitor their whole name.
  //
  //  KNOCKED OUT, NOT PRINTED ON. Drawn in the sky's own white so it
  //  reads as a hole punched through the petals, which is exactly the
  //  language the wings already use -- every letter in the swarm is cut
  //  out of its wing rather than marked on it. A dark glyph on top would
  //  be a second solid mark laid over a solid mark, which is the one
  //  thing the flat-ink rule keeps avoiding.
  //
  //  A MESH, NOT A SPRITE, and this is the whole reason it is here
  //  rather than being one more call to hollow(). Everything else 2D in
  //  this piece is a sprite because sprites billboard and are never
  //  edge-on. That is precisely wrong for this: the flowers carry their
  //  own tilt, their own cant and a slow sway, and a sprite ignores all
  //  three -- it would sit flat to the camera while the shape behind it
  //  turned, and visibly float free of the thing it belongs to. A
  //  textured plane inherits the full transform.
  //
  //  Drawn, not typed. Every other glyph in the piece is a font
  //  character; there is no arrow or chevron anywhere to reuse, and a
  //  font's own arrow glyphs are a lottery across platforms (a Quest
  //  falls back to Roboto). These are strokes on a canvas, so they are
  //  the same mark everywhere.
  function iconTex(kind, color) {
    var S = 256;
    var c = document.createElement('canvas');
    c.width = S; c.height = S;
    var x = c.getContext('2d');
    x.clearRect(0, 0, S, S);
    x.strokeStyle = color;
    x.fillStyle = color;
    //  Heavy, round-capped strokes. A hairline reads as a scratch at
    //  four metres through a headset lens; the mark has to survive being
    //  small, moving and slightly out of focus.
    x.lineWidth = S * 0.085;
    x.lineCap = 'round';
    x.lineJoin = 'round';

    if (kind === 'accept') {
      //  ENTER. The return arrow: in from the right along the top, a
      //  square elbow down and back to the left, with a head on the
      //  tail. Deliberately the keyboard glyph rather than a tick -- a
      //  tick says "correct", and this button does not judge the name,
      //  it commits it.
      var rx = S * 0.76, ty = S * 0.30, by = S * 0.64, lx = S * 0.32;
      x.beginPath();
      x.moveTo(rx, ty);
      x.lineTo(rx, by);
      x.lineTo(lx, by);
      x.stroke();
      // the arrowhead, on the end that is travelling left
      var hd = S * 0.15;
      x.beginPath();
      x.moveTo(lx + hd, by - hd);
      x.lineTo(lx, by);
      x.lineTo(lx + hd, by + hd);
      x.stroke();
    } else {
      //  DELETE. The backspace tag: a left-pointing arrowhead with a
      //  body behind it, and an X struck through the body. Same glyph
      //  the key on every keyboard carries, so it needs no learning.
      var ax = S * 0.22, mid = S / 2, hh = S * 0.20, bx = S * 0.80;
      x.beginPath();
      x.moveTo(ax, mid);
      x.lineTo(ax + hh, mid - hh);
      x.lineTo(bx, mid - hh);
      x.lineTo(bx, mid + hh);
      x.lineTo(ax + hh, mid + hh);
      x.closePath();
      x.stroke();
      // the X inside it, lighter so the tag still reads as one shape
      x.lineWidth = S * 0.06;
      var x0 = ax + hh * 1.75, x1 = bx - hh * 0.55, iy = hh * 0.52;
      x.beginPath();
      x.moveTo(x0, mid - iy); x.lineTo(x1, mid + iy);
      x.moveTo(x1, mid - iy); x.lineTo(x0, mid + iy);
      x.stroke();
    }

    var t = new THREE.CanvasTexture(c);
    t.generateMipmaps = false;      // a small mark mushes in the low levels
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    srgb(t);                        // or the white comes back grey -- see CLAUDE.md
    return t;
  }

  //  kind: 'accept' | 'delete'. Returns a plane carrying the mark, to be
  //  parented INTO a control's own group -- it then inherits the drift,
  //  the sway, the cant and the press bounce for nothing.
  function iconPlate(kind, w, h, color) {
    var tex = iconTex(kind, color);
    var mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.95,
      side: THREE.DoubleSide, depthWrite: false
    });
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.frustumCulled = false;
    m.dispose = function () { m.geometry.dispose(); mat.dispose(); tex.dispose(); };
    return m;
  }

  // ---- one letter of the name, hanging in the air ----
  //  The name is not drawn into a text field. It is loose letters in
  //  front of the visitor, each on its own sprite, each drifting on its
  //  own slow phase -- the same kind of object as the letters under the
  //  butterflies, so the name reads as something caught rather than
  //  something typed.
  function nameLetter(ch, color, st) {
    //  Two impressions, deliberately OUT OF REGISTER: the letter in its
    //  butterfly's colour, and behind it the same letter a fraction off
    //  in magenta -- the way a two-colour job goes wrong on press. The
    //  offset is fixed per slot, so a name always misprints the same way.
    var group = new THREE.Group();

    var overMat = new THREE.SpriteMaterial({
      map: letterTex(ch, 'name', 'hsl(' + st.overHue + ', 100%, 52%)', st), transparent: true,
      opacity: 0, depthWrite: false
    });
    overMat.rotation = st.rot + 0.05;
    var over = new THREE.Sprite(overMat);
    over.position.z = -0.001;
    group.add(over);

    var mat = new THREE.SpriteMaterial({
      map: letterTex(ch, 'name', color, st), transparent: true,
      opacity: 0, depthWrite: false
    });
    mat.rotation = st.rot;
    var sp = new THREE.Sprite(mat);
    group.add(sp);

    group.ch = ch;
    group.st = st;
    group.born = 0;                    // seconds of life, for the arrival
    group.set = function (size, alpha) {
      var h = size * st.scale;
      sp.scale.set(h, h, 1);
      over.scale.set(h, h, 1);
      over.position.x = st.overX * h;
      over.position.y = st.overY * h;
      mat.opacity = alpha;
      overMat.opacity = alpha * 0.7;
    };
    group.dispose = function () { mat.dispose(); overMat.dispose(); };
    return group;
  }

  // ---- a control: a cluster of lobes, not one blob ----
  //  v3's control was a single deforming outline. v4's is a FLOWER: five
  //  or six near-circular lobes overlapping around a centre, which is the
  //  shape the reference builds its whole poster out of.
  //
  //  Overlapping opaque circles in one flat colour read as a union
  //  without any of the work of computing one -- there is no boolean
  //  here, just lobes drawn on top of each other. Each lobe is its own
  //  triangle fan whose rim is rebuilt every frame from three harmonics,
  //  so the silhouette of the cluster is always moving.
  //
  //  Geometry rather than a canvas: deforming a drawn shape means
  //  re-uploading a texture every frame to say what a few hundred
  //  vertices say for nothing, and geometry is exactly flat -- one solid
  //  unlit colour, nothing to soften it, no colour space to get wrong.
  var LOBE_RIM = 40;

  function lobe(mat, z) {
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array((LOBE_RIM + 1) * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var idx = [];
    for (var i = 0; i < LOBE_RIM; i++) { idx.push(0, 1 + i, 1 + (i + 1) % LOBE_RIM); }
    geo.setIndex(idx);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.position.z = z;                 // a hair apart, or they z-fight
    return { mesh: mesh, geo: geo, pos: pos };
  }

  function blob(seed, w, h) {
    //  one material for the whole cluster, so a state change is one
    //  colour write however many lobes there are
    var mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    var group = new THREE.Group();
    var N = 6;
    var lobes = [];

    //  v9.2: the flower's own colour state, kept so setDim() can
    //  re-derive it. `_dim` is 1 normally and drops toward
    //  CFG.bornDimAmount while a newborn presents itself.
    var _hue = 0, _lit = 50, _dim = 1;
    //  DIM_LIT is where a fully dimmed petal ends up -- close to the
    //  dimmed sky, so the shape recedes into the background instead of
    //  going dark, which against a light room would make it MORE
    //  contrasty rather than less.
    var DIM_LIT = 76;
    function applyColor() {
      var sat = Math.round(100 * _dim);
      var lit = Math.round(_lit + (DIM_LIT - _lit) * (1 - _dim));
      mat.color.setStyle('hsl(' + _hue + ', ' + sat + '%, ' + lit + '%)');
    }
    for (var i = 0; i < N; i++) {
      var L = lobe(mat, i * 0.0006);
      //  Petals ring a centre, with one lobe sitting in the middle to
      //  fill the well. They have to sit FAR ENOUGH OUT to read as
      //  separate lobes -- pulled in tight they merge into one lump and
      //  the flower turns back into a blob, which is what the first pass
      //  did.
      var a = (i / (N - 1)) * Math.PI * 2 + seed;
      L.cx = i === N - 1 ? 0 : Math.cos(a) * w * 0.46;
      L.cy = i === N - 1 ? 0 : Math.sin(a) * h * 0.46;
      L.r  = (i === N - 1 ? 0.42 : 0.36);
      L.ph = seed * 1.7 + i * 1.9;
      lobes.push(L);
      group.add(L.mesh);
    }

    return {
      mesh: group,
      _applyColor: applyColor,
      shape: function (t) {
        for (var i = 0; i < lobes.length; i++) {
          var L = lobes[i], p = L.pos;
          p[0] = L.cx; p[1] = L.cy; p[2] = 0;
          for (var j = 0; j < LOBE_RIM; j++) {
            var a = (j / LOBE_RIM) * Math.PI * 2;
            var r = L.r * (1
              + 0.10 * Math.sin(3 * a + L.ph + t * 0.34)
              + 0.06 * Math.sin(5 * a - L.ph + t * 0.21));
            p[(j + 1) * 3]     = L.cx + Math.cos(a) * r * w;
            p[(j + 1) * 3 + 1] = L.cy + Math.sin(a) * r * h;
            p[(j + 1) * 3 + 2] = 0;
          }
          L.geo.attributes.position.needsUpdate = true;
        }
      },
      //  v9.2: the state colour is REMEMBERED rather than only written,
      //  so the dim below can re-derive it. Writing a dimmed colour
      //  straight onto the material would be overwritten by the next
      //  refreshPanel(), and reading the material back to dim it again
      //  would compound the dim every frame -- both versions were tried.
      setColor: function (hue, lit) {
        _hue = hue; _lit = lit; applyColor();
      },
      //  Stand the flower down while a newborn is being presented. The
      //  petals are OPAQUE geometry sharing one material (see CLAUDE.md
      //  on why they are lobes rather than a canvas), so there is no
      //  alpha to turn down without making them see-through and showing
      //  the swarm through the petals. Instead the colour is walked
      //  toward the background: saturation falls and lightness rises to
      //  meet the sky, so the shape stays solid and simply recedes.
      setDim: function (d) {
        if (d === _dim) { return; }
        _dim = d; applyColor();
      },
      dispose: function () {
        for (var i = 0; i < lobes.length; i++) { lobes[i].geo.dispose(); }
        mat.dispose();
      }
    };
  }

  return {
    letter: letter, nameLetter: nameLetter, hollow: hollow, bigLetter: bigLetter,
    punchLetter: punchLetter, letterMask: letterMask,
    wordmark: wordmark, rule: rule,
    blob: blob, iconPlate: iconPlate
  };
})();
