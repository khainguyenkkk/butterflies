// ============================================================
//  wing-gen.js  --  port of wingtexgen_script.py
// ============================================================
//  Catmull-Rom butterfly wing generator, driven by 4 roll dials.
//
//  This is a faithful port. Every constant, range, clamp and
//  control point below is lifted verbatim from the TouchDesigner
//  Script TOP -- the shapes are meant to be the same shapes, not
//  a family resemblance. Two things differ, both deliberate:
//
//  1. RANDOMNESS. The Python called np.random.default_rng(). On the
//     DNA path its seed is always the fixed SEED = 0 and dial_draw
//     only reaches 12 chain steps, so the entire reachable random
//     space is 180 floats -- baked into rolltable.js. Reading them
//     back reproduces the Python exactly, with no PCG64 port.
//     (A non-zero seed falls through to WingPRNG and is explicitly
//     off-parity; see prng.js.)
//
//  2. ORIENTATION. The texture is drawn the way the Python draws it:
//     body axis VERTICAL along the LEFT edge, wing reaching right,
//     forewing above the seam and hindwing below.
//
//         col = x * fit                 root at the left, outward right
//         row = seamRow + y * fit       fore (y<0) up, hind down
//         seamRow = H * (1 - anchorV)
//
//     This is legible on its own -- you can see where the body
//     attaches -- and it means an exported wing lines up with a
//     TouchDesigner bake with no rotation anywhere.
//
//     The VR wing plane wants the opposite: PlaneGeometry ->
//     translate(0,-h/2,0) -> rotateX(-PI/2) leaves local X running
//     along the body and local Z running outward. That 90 degree
//     difference is absorbed by the plane's UVs in butterfly.js, NOT
//     by rotating pixels here. Drawing legibly and rotating the four
//     UVs costs nothing; rotating every texture would cost a blit per
//     wing and leave the saved files wrong.
//  SLICE ASPECT. The wing reaches far further along the body than it
//  does outward, so a square slice wastes most of its pixels. Sweeping
//  all 331776 reachable dial combinations (24 steps ^ 4 dials):
//
//      max outward extent   1.0151
//      max fore / hind      1.0539 / 1.0467   (budget +-1.111, ~95% used)
//
//  So the along-body axis is designed to fill the frame and the outward
//  axis needs only half of it. Slices are therefore 1:2 -- 128 wide
//  (outward) by 256 tall (along the body). Outward budget on that slice
//  is 128/(256*0.9/2) = 1.1111 against the 1.0151 worst case, 9.5%
//  headroom.
//
//  expand() is nonetheless always called with aspect = 1.0. The aspect
//  only feeds fit_limits' 'rt', which caps foreSpan/hindSpan; sweeping
//  confirms that cap never binds either way (max delta 0 over 20k
//  samples at aspect 0.5), but pinning it to 1.0 keeps parity true by
//  construction rather than by measurement.
//
//  THE 4 DIALS ARE ROLL SEEDS, NOT SHAPE RAMPS. Each walks a cyclic
//  chain of 12 random rolls, smoothly interpolating between them, so
//  scrubbing morphs through shape families. 0.0 and 1.0 are the same
//  roll, which is what lets captured values wrap instead of piling
//  up at the ends.
// ============================================================
var WingGen = (function () {
  'use strict';

  // SUPERSAMPLING: 1, not the Python's 2 -- measured, not assumed.
  //
  //  The Python needs SS=2 because fill_poly is a hard binary
  //  point-in-polygon test: supersampling is its ONLY source of
  //  antialiasing. Canvas2D already computes analytic per-pixel
  //  coverage, so supersampling on top of it averages coverage-of-
  //  coverage and systematically erodes the shape. Diffed against 12
  //  wings rendered by the real Python rasteriser, total white area:
  //
  //      ss 1   -0.073 %      <- closest
  //      ss 2   -0.855 %
  //      ss 4   -0.988 %
  //
  //  It also gets monotonically worse with a manual box filter instead
  //  of drawImage, which rules out the downsample kernel as the cause.
  //  Raise it only if you have re-measured and it helps.
  var SS = 1;
  var SEED = 0;          // the seed the baked roll table covers
  var GROUP_N = [5, 5, 3, 2];

  // 1:2 slices -- see the SLICE ASPECT note above. Width is the OUTWARD
  // axis, height is ALONG THE BODY. The VR wing plane is the other way
  // round and its UVs compensate; the pixel aspect works out identical
  // either way, so nothing is stretched.
  var SLICE_W = 128;   // outward from the body
  var SLICE_H = 256;   // along the body, fore at the top
  var PARITY_ASPECT = 1.0;   // do not change; see the note above

  var DEFAULTS = {
    anchorV: 0.5,        // seam position; 0.5 = fore and hind split mid-slice
    fitScale: 0.9,       // fixed wing scale, same in every variation
    bodyWid: 0.055,      // root inset  -- never randomized
    wingGap: 0.02        // wing gap    -- never randomized
  };

  function mod1(v) { return ((v % 1) + 1) % 1; }   // Python's % on floats
  function lerp(u, lo, hi) { return lo + (hi - lo) * u; }

  // --- one deterministic roll: n uniforms for group gid at step ---
  function roll(gid, step, seed, n) {
    var s = ((step % WING_NSTEPS) + WING_NSTEPS) % WING_NSTEPS;
    if (seed === SEED) { return WING_ROLL_TABLE[gid][s]; }   // exact TD parity
    return WingPRNG.roll(gid, s, seed, n, WING_NSTEPS);      // off-parity explorer
  }

  // --- dial position -> n uniforms, smoothly morphed between rolls ---
  function dialDraw(v, gid, seed, n) {
    var k = mod1(v) * WING_NSTEPS;
    var i = Math.floor(k), f = k - i;
    f = f * f * (3.0 - 2.0 * f);                  // smoothstep the morph
    var a = roll(gid, i, seed, n);
    var b = roll(gid, i + 1, seed, n);
    var out = new Array(n);
    for (var j = 0; j < n; j++) { out[j] = a[j] + (b[j] - a[j]) * f; }
    return out;
  }

  // --- room the anchored seam leaves either side of it, and the room
  // --- the frame leaves outward
  function fitLimits(anchorV, fitScale, scallopDepth, aspect) {
    var fs = Math.max(fitScale, 1e-6);
    var up = 2.0 * (1.0 - anchorV) / fs;
    var dn = 2.0 * anchorV / fs;
    var rt = 2.0 * aspect / fs;
    // the budget has to cover more than the control points: Catmull-Rom
    // overshoots the hull (~6%) and scallops push outward on top of that
    up = up * 0.94 - scallopDepth;
    dn = dn * 0.94 - scallopDepth;
    rt = rt * 0.94 - scallopDepth;
    return [Math.max(up, 0.05), Math.max(dn, 0.05), Math.max(rt, 0.05)];
  }

  // --- 4 dials -> the full sub-param dict the generators expect ---
  function expand(dials, seed, anchorV, fitScale, bodyWid, wingGap, aspect) {
    if (aspect === undefined) { aspect = 1.0; }
    var fore = dialDraw(dials[0], 0, seed, 5);
    var hind = dialDraw(dials[1], 1, seed, 5);
    var bal  = dialDraw(dials[2], 2, seed, 3);
    var edge = dialDraw(dials[3], 3, seed, 2);

    // ranges are deliberately wider than the original sliders so the
    // two wings can land far apart in depth
    var foreSpan  = lerp(fore[0], 0.38, 0.85);
    var foreRise  = lerp(fore[1], 0.35, 1.05);
    var foreApex  = lerp(fore[2], 0.00, 1.00);
    var foreSweep = lerp(fore[3], 0.00, 1.00);
    // foreDrop floor: below ~0.25 the trailing edge tucks so far up the
    // forewing detaches from the hindwing into a C
    var foreDrop  = lerp(fore[4], 0.25, 1.00);

    var hindSpan  = lerp(hind[0], 0.28, 0.78);
    var hindDrop  = lerp(hind[1], 0.30, 1.00);
    var hindRound = lerp(hind[2], 0.00, 1.00);
    var hindRise  = lerp(hind[3], 0.00, 0.75);    // >0.75 self-intersects
    var tailLen   = lerp(hind[4], 0.00, 0.90);

    // BALANCE: opposite-signed push on fore vs hind. b = +1 -> deep
    // forewing over a shallow hindwing, b = -1 -> the reverse.
    var b = bal[0] * 2.0 - 1.0;
    var s = bal[1] * 2.0 - 1.0;
    foreRise *= 1.0 + 0.45 * b;
    hindDrop *= 1.0 - 0.45 * b;
    foreSpan *= 1.0 + 0.22 * s;
    hindSpan *= 1.0 - 0.22 * s;

    var scallopDepth = lerp(edge[0], 0.0, 0.05);

    // keep the wing inside the frame given the anchored seam
    var lim = fitLimits(anchorV, fitScale, scallopDepth, aspect);
    var up = lim[0], dn = lim[1], rt = lim[2];
    var foreTop = foreRise * (0.86 + 0.14 * foreApex);
    if (foreTop > up) { foreRise *= up / foreTop; }
    var foreBot = foreRise * (0.16 + 0.34 * foreSweep) * 2.0 * foreDrop;
    if (foreBot > dn) { foreDrop *= dn / foreBot; }
    var hindBot = hindDrop * Math.max(0.92, 0.90 + 0.55 * tailLen);
    if (hindBot > dn) { hindDrop *= dn / hindBot; }
    foreSpan = Math.min(foreSpan, rt / 0.98);      // widest ctrl pt = sx*0.98
    hindSpan = Math.min(hindSpan, rt / 0.98);

    // OUTER SEAM SPLAY: how far the two wings pull apart at the OUTER
    // end of the edge they share. Negative = the forewing's trailing
    // edge laps down over the hindwing; positive = a splayed wedge.
    // Applied only to the outer control points and split evenly either
    // side of the seam, so the root notch never moves.
    var outerUpY = hindDrop * (0.20 - 0.55 * hindRise);
    var foreHead = Math.max(Math.min(foreBot, dn) + foreRise * 0.10, 0.0);
    var hindHead = Math.max(hindDrop * 0.45 - outerUpY, 0.0);
    // splay as a FRACTION of that headroom, so the roll spreads evenly
    // over the whole lapped -> splayed range instead of piling up on a
    // clamp. Negative = the forewing laps further over the hindwing.
    var g = lerp(bal[2], -0.20, 1.00);

    return {
      bodyWid: bodyWid, wingGap: wingGap,
      foreSpan: foreSpan, foreRise: foreRise, foreApex: foreApex,
      foreSweep: foreSweep, foreDrop: foreDrop,
      hindSpan: hindSpan, hindDrop: hindDrop, hindRound: hindRound,
      hindRise: hindRise, tailLen: tailLen,
      foreOuterShift: -g * foreHead * 0.85,
      hindOuterShift: g * hindHead * 0.85,
      scallopDepth: scallopDepth,
      scallopN: Math.round(lerp(edge[1], 0.0, 14.0))
    };
  }

  // --- Catmull-Rom through a CLOSED control list -> smooth outline ---
  function catmullClosed(ctrl, outer, sps, scN, scD) {
    var n = ctrl.length, out = [], phase = 0.0;
    for (var i = 0; i < n; i++) {
      var p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i];
      var p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
      var segOuter = outer[i] && outer[(i + 1) % n];
      for (var s = 0; s < sps; s++) {
        var t = s / sps, t2 = t * t, t3 = t2 * t;
        var x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t +
                       (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
                       (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
        var y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t +
                       (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
                       (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
        var px = x, py = y;
        if (segOuter && scD > 0 && scN > 0) {
          var tt = t + 0.001, u2 = tt * tt, u3 = u2 * tt;
          var nx = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * tt +
                          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 +
                          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3);
          var ny = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * tt +
                          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 +
                          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3);
          var tx = nx - x, ty = ny - y;
          var tl = Math.hypot(tx, ty) || 1.0; tx /= tl; ty /= tl;
          var onx = ty, ony = -tx;
          var scal = Math.sin(phase * scN * Math.PI * 2) * scD;
          px += onx * scal; py += ony * scal;
        }
        out.push([px, py]);
        phase += 1.0 / (sps * n);
      }
    }
    return out;
  }

  function forewing(P) {
    var sx = P.foreSpan, ry = P.foreRise, rootX = P.bodyWid * 0.7;
    var fd = 2.0 * P.foreDrop;                    // 0.5 -> 1.0 = legacy trailing edge
    var rootTopY = -ry * 0.16 - P.wingGap, rootBotY = ry * 0.10;
    var apexX = sx * (0.82 + 0.18 * P.foreApex), apexY = -ry * (0.86 + 0.14 * P.foreApex);
    var trailX = sx * (0.72 - 0.22 * P.foreSweep);
    var trailY = ry * (0.16 + 0.34 * P.foreSweep) * fd;
    // outer seam splay -- the two trailing points nearest the outer end
    // of the shared edge; the inner point and both root points stay put,
    // so the gap tapers to nothing at the body and the notch is anchored
    var os = P.foreOuterShift || 0.0;
    var ctrl = [[rootX, rootTopY], [sx * 0.42, -ry * 0.72], [apexX, apexY], [sx * 0.98, -ry * 0.34],
                [sx * 0.90, ry * 0.02 * fd + os], [trailX, trailY + os],
                [sx * 0.30, ry * 0.16 * fd + os * 0.35], [rootX, rootBotY]];
    var outer = [false, false, true, true, true, true, false, false];
    return catmullClosed(ctrl, outer, 22, P.scallopN, P.scallopDepth);
  }

  function hindwing(P) {
    var sx = P.hindSpan, dy = P.hindDrop, rnd = P.hindRound, rootX = P.bodyWid * 0.7;
    var rootTopY = dy * 0.02 + P.wingGap, rootBotY = dy * 0.30, tail = P.tailLen;
    var outerUpX = sx * (0.86 + 0.12 * rnd), outerMidX = sx * (0.80 + 0.14 * rnd);
    var bottomX = sx * (0.40 + 0.10 * rnd), bottomY = dy * 0.92;
    // hind rise lifts the OUTER top edge only -- the root stays put so
    // the body-attach notch never moves
    var outerUpY = dy * (0.20 - 0.55 * P.hindRise) + (P.hindOuterShift || 0.0);
    var ctrl = [[rootX, rootTopY], [outerUpX, outerUpY], [outerMidX, dy * 0.52],
                [bottomX, bottomY], [sx * 0.24, dy * 0.90], [rootX, rootBotY]];
    var outer = [false, true, true, true, true, false];
    if (tail > 0) {
      var shInX = outerMidX * 0.94, shInY = dy * 0.62;
      var shOutX = outerMidX * 0.50, shOutY = dy * 0.80;
      var tipX = outerMidX * 0.70 + tail * 0.02, tipY = dy * (0.90 + 0.55 * tail);
      ctrl = [ctrl[0], ctrl[1], ctrl[2], [shInX, shInY], [tipX, tipY],
              [shOutX, shOutY], ctrl[3], ctrl[4], ctrl[5]];
      outer = [false, true, true, true, true, true, true, true, false];
    }
    return catmullClosed(ctrl, outer, 22, P.scallopN, P.scallopDepth);
  }

  // --- draw one wing, white on black, into a square canvas ---------
  //  opts: {anchorV, fitScale, bodyWid, wingGap, seed, supersample}
  function drawWing(canvas, dials, opts) {
    opts = opts || {};
    var anchorV  = opts.anchorV  !== undefined ? opts.anchorV  : DEFAULTS.anchorV;
    var fitScale = opts.fitScale !== undefined ? opts.fitScale : DEFAULTS.fitScale;
    var bodyWid  = opts.bodyWid  !== undefined ? opts.bodyWid  : DEFAULTS.bodyWid;
    var wingGap  = opts.wingGap  !== undefined ? opts.wingGap  : DEFAULTS.wingGap;
    var seed     = opts.seed     !== undefined ? opts.seed     : SEED;
    var ss       = opts.supersample !== undefined ? opts.supersample : SS;

    var W = canvas.width, H = canvas.height;
    // aspect is PINNED, not derived from the canvas -- see the header.
    var P = expand(dials, seed, anchorV, fitScale, bodyWid, wingGap, PARITY_ASPECT);

    // Optional supersample buffer. At the default ss=1 this is a
    // straight draw -- see the SS note above for why that is the
    // closest match to the Python, not a shortcut.
    var Wr = W * ss, Hr = H * ss;
    var buf = drawWing._buf || (drawWing._buf = document.createElement('canvas'));
    if (buf.width !== Wr || buf.height !== Hr) { buf.width = Wr; buf.height = Hr; }
    var bx = buf.getContext('2d');
    bx.fillStyle = '#000';
    bx.fillRect(0, 0, Wr, Hr);

    // Same mapping the Python uses (see the header note): the body axis
    // is vertical on the left, the wing reaches right.
    var fit = (Hr * fitScale) / 2.0;
    var seamRow = Hr * (1.0 - anchorV);
    function path(poly) {
      var p = new Path2D();
      for (var i = 0; i < poly.length; i++) {
        var col = poly[i][0] * fit;             // model x -> across (root at left)
        var row = seamRow + poly[i][1] * fit;   // model y -> down   (fore up, hind down)
        if (i === 0) { p.moveTo(col, row); } else { p.lineTo(col, row); }
      }
      p.closePath();
      return p;
    }

    // TWO SEPARATE even-odd fills, unioned -- NOT one combined path.
    // The Python ran fill_poly once per wing into a shared mask; a single
    // even-odd path over both would punch a hole where they overlap.
    bx.fillStyle = '#fff';
    bx.fill(path(hindwing(P)), 'evenodd');
    bx.fill(path(forewing(P)), 'evenodd');

    var cx = canvas.getContext('2d');
    cx.fillStyle = '#000';
    cx.fillRect(0, 0, W, H);
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(buf, 0, 0, Wr, Hr, 0, 0, W, H);
    return P;
  }

  return {
    SS: SS, SEED: SEED, DEFAULTS: DEFAULTS, GROUP_N: GROUP_N,
    SLICE_W: SLICE_W, SLICE_H: SLICE_H, PARITY_ASPECT: PARITY_ASPECT,
    mod1: mod1, lerp: lerp, roll: roll, dialDraw: dialDraw,
    fitLimits: fitLimits, expand: expand, catmullClosed: catmullClosed,
    forewing: forewing, hindwing: hindwing, drawWing: drawWing
  };
})();
