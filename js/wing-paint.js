// ============================================================
//  wing-paint.js  --  the born butterfly's wing, painted
// ============================================================
//  Every other wing in this piece is ONE FLAT COLOUR. The generator
//  draws a white-on-black silhouette, bfly-model.js hands it to a
//  MeshBasicMaterial as an alphaMap, and the colour is a single hsl()
//  string on material.color. That is the whole look, and CLAUDE.md is
//  emphatic about keeping it: no gradients, no soft anything.
//
//  This file breaks that rule, once, deliberately, on exactly one
//  object per visitor. The 26 alphabet butterflies are untouched and
//  they are the control group -- a single veined, eyespotted, deeply
//  coloured creature in a room of flat ink silhouettes reads instantly
//  as MADE rather than as one more letter. Half-measures would land in
//  the uncanny middle: not flat enough to belong, not rich enough to
//  astonish. So this goes all the way.
//
//  WHAT IT PRODUCES is a COLOUR map (material.map), not an alpha map.
//  The silhouette still comes from WingGen via Wings.forDials -- shape
//  and colour are separate channels and this file only owns the second.
//  Both live in the same UV space, so they line up by construction.
//
//  LAYER ORDER matters and is not arbitrary:
//
//    1  base field      warped fBm + anatomical gradient
//    2  posterise       hard bands -- the flat-ink family, preserved
//    3  optional layers (v9) one of several patterns, chosen per name
//    4  margin bands    chevrons parallel to the outer edge
//    5  veins           ridged-noise-perturbed, radiating from the root
//    6  eyespots        concentric rings, the fastest "butterfly" signal
//    7  shimmer         scale-sized grain, ~2% lightness
//
//  Veins and eyespots are drawn AFTER the quantiser on purpose. Running
//  them through it would stair-step their edges into the band boundaries
//  and they would stop reading as structure sitting on top of the wing.
//
//  ============================================================
//  v9 -- WHY EVERY BUTTERFLY USED TO LOOK THE SAME
//  ============================================================
//  The report was "I just see 1 pattern and different hue", and that was
//  exactly, literally correct. Through v8 this file drew the same six
//  layers with the same CFG CONSTANTS for every butterfly ever painted:
//  seven posterisation bands, seven veins, three margin chevrons, one base
//  frequency, one warp pair. The only things that changed from name to
//  name were the hue, the noise seed, and how many eyespots landed. Change
//  the seed on a fixed structure and you get the same creature with its
//  blotches in different places -- which is precisely what it looked like.
//
//  So v9 varies the STRUCTURE, in three ways, all drawn from `r` -- the
//  deterministic PRNG this file already seeds off the name:
//
//    (a) every structural constant became a CFG Min/Max range, sampled
//        per name. Band count, frequency, warp depth, vein count (now
//        including ZERO), vein width, margin count, eyespot count and
//        size, shimmer.
//    (b) paletteFor() gained five SCHEMES -- analogous, complementary,
//        triadic, split-complementary, high-contrast -- instead of always
//        building the same +26/+150/+200 relationship, and a varying
//        number of ramp stops.
//    (c) pickLayers() chooses 2-4 OPTIONAL PATTERN LAYERS per name from a
//        menu of seven: stripes, apical patch, checkered fringe, spot
//        field, radial streaks, reticulation, blotches.
//
//  (c) is what actually does the work. (a) varies the degree of one
//  pattern; (c) changes which patterns are present at all, and because
//  they combine, the space is multiplicative rather than a single axis.
//
//  WHAT IS PRESERVED: determinism. Everything is drawn from the name's own
//  hash, so a given name still paints a pixel-identical wing on any
//  machine in any session. That is not a nicety -- CLAUDE.md's whole
//  "the name is the save file" claim rests on it, and an exhibition piece
//  cannot re-roll a returning visitor's butterfly in front of them.
//
//  COST. One paint is CFG.bornTexSize^2 * 2 pixels through a two-level
//  warped fBm -- the single heaviest computation in the piece. It runs
//  ONCE per accepted name, never per frame, and born.js times it to land
//  inside the burst animation's opening frames where the butterfly is
//  still scaling up from nothing. If it ever measures badly on a Quest,
//  CFG.bornTexSize is the one lever: halving it is 4x cheaper.
//
//  THE v9 BUDGET RULE. The base field was measured at ~107 ms of a ~110 ms
//  paint, with every other layer inside the noise floor -- so cheap
//  analytic layers (stripes, patches, fringe, spots, streaks) are
//  effectively free and can be added freely. The two layers that need
//  noise PER PIXEL -- reticulation and blotches -- would each cost about
//  what the base field costs, which would double or triple a paint. They
//  therefore reuse the same half-resolution field-and-interpolate trick
//  paintBase uses, which is a quarter of the work for a difference the eye
//  cannot find once the result is quantised.
// ============================================================
var WingPaint = (function () {
  'use strict';

  //  Canvas textures MUST be tagged sRGB. three.js assumes no colour
  //  space on a CanvasTexture, so with A-Frame's colour management on it
  //  reads the bytes as linear and encodes them again on the way out --
  //  every fill comes back a stop lighter and visibly desaturated, and a
  //  solid red draws as pink. ui.js has this same helper but does not
  //  export it, hence the copy. Only COLOUR canvases get this; alpha
  //  maps are read off a channel and must stay unconverted.
  function srgb(tex) {
    if (THREE.SRGBColorSpace !== undefined) { tex.colorSpace = THREE.SRGBColorSpace; }
    return tex;
  }

  // ---------- the palette, drawn out of the name ----------
  //  Four hues that are guaranteed not to sit next to each other: a
  //  dominant, an analogue a short step round the wheel, an accent
  //  thrown most of the way across, and a deep ink for veins and pupils.
  //  Saturation stays high -- this piece has never once used a pastel --
  //  and the lightness band is chosen to hold up against the white sky
  //  the whole scene sits on.
  //  v9: FIVE SCHEMES, not one recipe. v8 always built the same
  //  +26 / +150 / +200 relationship, which meant every wing in the room
  //  had the same internal colour LOGIC even when the base hue differed --
  //  a big part of why they read as one species. A triadic wing and a
  //  near-monochrome one are different creatures, not different tints.
  var SCHEMES = ['analogous', 'complementary', 'triadic', 'split', 'contrast'];

  function paletteFor(h0, r) {
    var scheme = SCHEMES[Math.floor(r() * SCHEMES.length) % SCHEMES.length];
    var analogue, accent, deep;
    if (scheme === 'analogous') {
      //  v8's own relationship, kept as one of the five so the wing
      //  everyone has been looking at is still reachable
      analogue = h0 + 26 + r() * 34;
      accent   = h0 + 150 + r() * 70;
      deep     = h0 + 200 + r() * 40;
    } else if (scheme === 'complementary') {
      analogue = h0 + 12 + r() * 20;
      accent   = h0 + 180 + (r() - 0.5) * 24;   // straight across the wheel
      deep     = h0 + 205 + r() * 30;
    } else if (scheme === 'triadic') {
      analogue = h0 + 120 + (r() - 0.5) * 18;
      accent   = h0 + 240 + (r() - 0.5) * 18;
      deep     = h0 + 300 + r() * 30;
    } else if (scheme === 'split') {
      analogue = h0 + 150 + (r() - 0.5) * 16;
      accent   = h0 + 210 + (r() - 0.5) * 16;
      deep     = h0 + 180 + r() * 24;
    } else {
      //  contrast: hues stay close, the LIGHTNESS does the separating.
      //  This is how a lot of the most striking real wings work -- a
      //  monarch is essentially two values of one hue plus black.
      analogue = h0 + 8 + r() * 14;
      accent   = h0 + 340 + r() * 30;
      deep     = h0 + 190 + r() * 24;
    }
    analogue %= 360; accent %= 360; deep %= 360;

    var S = CFG.bornSat / 100;
    var lo = CFG.bornLitLo / 100, hi = CFG.bornLitHi / 100;
    //  the contrast scheme widens the lightness band it is named for
    if (scheme === 'contrast') { lo *= 0.62; hi = Math.min(0.92, hi * 1.30); }

    //  ...and the ramp gets a varying number of stops. Fewer stops is a
    //  bolder, more graphic wing; more is a subtler, more layered one.
    //  Never two -- a two-stop ramp is a gradient, and a gradient is the
    //  one thing this piece has spent six versions not being.
    var stops;
    var pick = r();
    if (pick < 0.30) {
      stops = [
        { t: 0.00, h: deep,     s: S * 0.85, l: lo * 0.50 },
        { t: 0.45, h: h0,       s: S,        l: lo },
        { t: 1.00, h: accent,   s: S,        l: hi }
      ];
    } else if (pick < 0.72) {
      stops = [
        { t: 0.00, h: deep,     s: S * 0.85, l: lo * 0.55 },
        { t: 0.30, h: h0,       s: S,        l: lo },
        { t: 0.55, h: h0,       s: S,        l: (lo + hi) / 2 },
        { t: 0.78, h: analogue, s: S,        l: hi },
        { t: 1.00, h: accent,   s: S,        l: hi * 1.06 }
      ];
    } else {
      stops = [
        { t: 0.00, h: deep,     s: S * 0.9,  l: lo * 0.45 },
        { t: 0.20, h: deep,     s: S * 0.8,  l: lo * 0.8 },
        { t: 0.40, h: h0,       s: S,        l: lo },
        { t: 0.58, h: analogue, s: S,        l: (lo + hi) / 2 },
        { t: 0.76, h: h0,       s: S,        l: hi * 0.92 },
        { t: 0.90, h: analogue, s: S,        l: hi },
        { t: 1.00, h: accent,   s: S,        l: Math.min(0.95, hi * 1.10) }
      ];
    }

    return {
      h0: h0, analogue: analogue, accent: accent, deep: deep,
      scheme: scheme, stops: stops, lo: lo, hi: hi
    };
  }

  // ---------- v9: the per-name species draw ----------
  //  Everything that used to be a fixed CFG constant, sampled once per
  //  name from its Min/Max pair. Collected in ONE place so it is obvious
  //  at a glance what varies -- and so the console can print it, which is
  //  how the variety is actually verified rather than eyeballed.
  function speciesFor(r) {
    function ri(lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }
    function rf(lo, hi) { return lo + r() * (hi - lo); }
    var sp = {
      bands:       ri(CFG.bornBandsMin, CFG.bornBandsMax),
      octaves:     ri(CFG.bornOctavesMin, CFG.bornOctavesMax),
      freq:        rf(CFG.bornFreqMin, CFG.bornFreqMax),
      warp1:       rf(CFG.bornWarp1Min, CFG.bornWarp1Max),
      warp2:       rf(CFG.bornWarp2Min, CFG.bornWarp2Max),
      veinCount:   ri(CFG.bornVeinCountMin, CFG.bornVeinCountMax),
      veinWidth:   rf(CFG.bornVeinWidthMin, CFG.bornVeinWidthMax),
      veinDark:    rf(CFG.bornVeinDarkMin, CFG.bornVeinDarkMax),
      marginBands: ri(CFG.bornMarginBandsMin, CFG.bornMarginBandsMax),
      eyespots:    ri(CFG.bornEyespotMin, CFG.bornEyespotMax),
      eyeRad:      rf(CFG.bornEyespotRadMin, CFG.bornEyespotRadMax),
      shimmer:     rf(CFG.bornShimmerMin, CFG.bornShimmerMax),
      //  the anatomical bias itself varies -- how strongly the pattern
      //  organises along root->tip versus along the fore/hind seam
      anatOut:     rf(0.35, 0.85),
      anatSeam:    rf(0.05, 0.34)
    };
    sp.layers = pickLayers(r);
    return sp;
  }

  //  Draw 2-4 distinct layers from the menu. Sampling WITHOUT replacement
  //  (splice) rather than rolling each independently: independent rolls
  //  give a binomial pile-up in the middle and, worse, occasionally give
  //  none at all, which would silently reproduce the v8 problem for that
  //  one visitor.
  var LAYER_MENU = ['stripes', 'apical', 'fringe', 'spots', 'streaks',
                    'retic', 'blotch'];

  function pickLayers(r) {
    var pool = LAYER_MENU.slice();
    var n = CFG.bornLayerMin +
            Math.floor(r() * (CFG.bornLayerMax - CFG.bornLayerMin + 1));
    if (n > pool.length) { n = pool.length; }
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    }
    return out;
  }

  // ---------- the anatomical bias ----------
  //  Without this the field is isotropic -- blobs floating over a wing
  //  shape rather than markings belonging to it. Real wings are
  //  organised along two axes: root to tip, and leading edge to trailing
  //  edge. Biasing the field by both makes the pattern follow the wing's
  //  own structure.
  //
  //  In this UV space u runs OUTWARD from the body (0 = root, 1 = tip)
  //  and v runs ALONG the body (0 = hind, 1 = fore) -- see the UV note
  //  in bfly-model.js.
  //  v9: the two weights are per-name (sp.anatOut / sp.anatSeam) rather
  //  than the fixed 0.62 / 0.20. A wing organised hard along root->tip
  //  and one organised along the fore/hind seam are visibly different
  //  animals even before any of the pattern layers land on them.
  function anatomy(u, v, sp) {
    var outward = u;                            // darker at the root
    var seam = 1 - Math.abs(v - 0.5) * 2;       // the fore/hind divide
    return outward * sp.anatOut + (1 - seam) * sp.anatSeam;
  }

  // ---------- 1-2: the base field, posterised ----------
  //  TWO PASSES, AT TWO RESOLUTIONS, and the split is the single most
  //  important performance decision in this file.
  //
  //  Measured: with every other layer switched off, the warped fBm below
  //  WAS the entire cost of a wing -- ~107 ms of a ~110 ms paint. Veins,
  //  margins, eyespots and shimmer together are inside the noise floor.
  //  So this is the only thing worth optimising, and the only thing that
  //  ever will be.
  //
  //  The trick: the field is QUANTISED into hard bands before it is ever
  //  seen, so the eye never observes it at full resolution -- what the
  //  eye sees is where the band BOUNDARIES fall. Sampling the field at
  //  half resolution and interpolating costs a quarter as much, and as
  //  long as the quantiser runs AFTER the interpolation, every band edge
  //  is still computed per full-resolution pixel and stays razor sharp.
  //  Quantising first and upscaling after would stair-step every edge --
  //  that is the version that looks broken, and it is the reason these
  //  are two passes rather than one.
  //
  //  CFG.bornFieldDiv is the divisor. 1 disables the trick entirely.
  function fieldAt(N, M, seed, sp) {
    var div = Math.max(1, CFG.bornFieldDiv);
    var FN = Math.max(2, Math.ceil(N / div)), FM = Math.max(2, Math.ceil(M / div));
    var f = new Float32Array(FN * FM);
    var freq = sp.freq;                  // v9: per name, was CFG.bornFreq
    var oct = sp.octaves;
    var w1 = sp.warp1, w2 = sp.warp2;
    var i = 0;
    for (var y = 0; y < FM; y++) {
      var v = y / (FM - 1);
      for (var x = 0; x < FN; x++) {
        var u = x / (FN - 1);
        //  the two-level warp -- see noise.js's header for why this one
        //  call is what separates "grown" from "fog"
        f[i++] = Noise.warp2(u * freq, v * freq, seed, oct, w1, w2);
      }
    }
    return { f: f, w: FN, h: FM };
  }

  function sampleField(fld, u, v) {
    var fx = u * (fld.w - 1), fy = v * (fld.h - 1);
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    var x1 = x0 + 1 < fld.w ? x0 + 1 : x0;
    var y1 = y0 + 1 < fld.h ? y0 + 1 : y0;
    var tx = fx - x0, ty = fy - y0;
    var a = fld.f[y0 * fld.w + x0], b = fld.f[y0 * fld.w + x1];
    var c = fld.f[y1 * fld.w + x0], d = fld.f[y1 * fld.w + x1];
    var top = a + (b - a) * tx, bot = c + (d - c) * tx;
    return top + (bot - top) * ty;
  }

  function paintBase(data, N, M, pal, seed, bands, sp) {
    var fld = fieldAt(N, M, seed, sp);
    //  the ramp is only ever read at `bands` distinct values, so build
    //  the colour table once instead of calling ramp() + hsl2rgb() for
    //  every one of 131k pixels
    var lut = [];
    for (var k = 0; k < bands; k++) {
      var c = Noise.ramp((k + 0.5) / bands, pal.stops);
      lut.push(Noise.hsl2rgb(c.h, c.s, c.l));
    }
    var i = 0;
    for (var y = 0; y < M; y++) {
      var v = y / (M - 1);
      for (var x = 0; x < N; x++) {
        var u = x / (N - 1);
        var t = sampleField(fld, u, v) * 0.72 + anatomy(u, v, sp) * 0.46;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        //  POSTERISE, at FULL resolution. Band centres rather than band
        //  floors: flooring alone never reaches the top stop, so the
        //  brightest colour in the palette would simply never appear.
        var q = Math.floor(t * bands);
        if (q >= bands) { q = bands - 1; }
        var rgb = lut[q];
        data[i++] = rgb[0]; data[i++] = rgb[1]; data[i++] = rgb[2]; data[i++] = 255;
      }
    }
  }

  // ---------- 3: bands parallel to the outer margin ----------
  //  Nearly every real species carries banding that follows the wing's
  //  outer edge rather than cutting across it. Distance from the tip
  //  (u = 1) is a good enough stand-in for distance from the margin in
  //  this UV space, wobbled by noise so the bands are not perfect arcs.
  function paintMargin(data, N, M, pal, seed, sp) {
    var n = sp.marginBands;          // v9: per name, 0-6. 0 is a real draw.
    if (n <= 0) { return; }
    var i = 0;
    for (var y = 0; y < M; y++) {
      var v = y / (M - 1);
      for (var x = 0; x < N; x++) {
        var u = x / (N - 1);
        var d = 1 - u;                                   // 0 at the tip
        d += (Noise.fbm(u * 5.5, v * 5.5, seed + 777, 3) - 0.5) * 0.10;
        var band = Math.sin(d * n * Math.PI * 2);
        //  only the crests, and only near the margin -- a band across
        //  the whole wing is a stripe, not a margin
        var edge = Math.max(0, 1 - d * 3.4);
        var amt = Math.max(0, band) * edge * 0.42;
        if (amt > 0.002) {
          var k = 1 - amt;
          data[i]     = data[i] * k;
          data[i + 1] = data[i + 1] * k;
          data[i + 2] = data[i + 2] * k;
        }
        i += 4;
      }
    }
  }

  // ---------- 4: venation ----------
  //  Veins radiate from the wing ROOT and fan outward, which is the
  //  actual anatomy -- they carry haemolymph out from the body. Drawn as
  //  a distance field rather than as strokes: for each pixel, find the
  //  angular distance to the nearest vein's path and darken by how close
  //  it is. That gives soft-shouldered veins with hard cores for free,
  //  and costs one loop over a handful of veins instead of a Path2D per
  //  vein plus a second pass to read it back.
  function paintVeins(data, N, M, pal, seed, r, sp) {
    var count = sp.veinCount;        // v9: per name, and 0 is a real draw --
    if (count <= 0) { return; }      // plenty of species show no venation
    //  each vein: a starting angle out of the root, and its own noise
    //  seed so it wanders independently of its neighbours
    var veins = [];
    for (var k = 0; k < count; k++) {
      veins.push({
        a: -0.62 + (k / (count - 1 || 1)) * 1.24 + (r() - 0.5) * 0.12,
        seed: seed + 900 + k * 53,
        wob: 0.055 + r() * 0.075
      });
    }
    var ink = Noise.hsl2rgb(pal.deep, CFG.bornSat / 100 * 0.6, CFG.bornLitLo / 100 * 0.32);
    var wid = sp.veinWidth;          // v9: per name
    var dark = sp.veinDark;

    //  PRECOMPUTED PER COLUMN, not per pixel. A vein's bend depends only
    //  on u (distance along its length) -- it is constant down a column.
    //  Computing it inside the pixel loop meant N*M*veins ridged-noise
    //  evaluations, about eleven million hash calls for a single wing and
    //  by far the most expensive thing in this file. Hoisting it costs
    //  N*veins instead: four orders of magnitude fewer, pixel-identical
    //  output.
    var bendCol = [];
    for (var x0 = 0; x0 < N; x0++) {
      var u0 = x0 / (N - 1);
      var row = new Float32Array(veins.length);
      for (var j0 = 0; j0 < veins.length; j0++) {
        var v0 = veins[j0];
        //  ridged noise along the vein's length bends it, so it reads
        //  as grown rather than ruled
        row[j0] = v0.a + (Noise.ridged(u0 * 4.2, v0.seed * 0.01, v0.seed, 3) - 0.5) * v0.wob;
      }
      bendCol.push(row);
    }

    var i = 0;
    for (var y = 0; y < M; y++) {
      var v = y / (M - 1);
      for (var x = 0; x < N; x++) {
        var u = x / (N - 1);
        //  angle and radius from the root, which sits mid-height at u=0
        var dy = v - 0.5;
        var ang = Math.atan2(dy, u + 0.04);
        var best = 1e9;
        var col = bendCol[x];
        for (var j = 0; j < col.length; j++) {
          var d = Math.abs(ang - col[j]);
          if (d < best) { best = d; }
        }
        //  veins converge at the root, so scale tolerance by radius --
        //  a constant angular width would make them fan into wedges
        var t = best * (0.30 + u * 1.5) / wid;
        if (t < 1) {
          var amt = (1 - t) * (1 - t) * dark;
          data[i]     = data[i]     + (ink[0] - data[i])     * amt;
          data[i + 1] = data[i + 1] + (ink[1] - data[i + 1]) * amt;
          data[i + 2] = data[i + 2] + (ink[2] - data[i + 2]) * amt;
        }
        i += 4;
      }
    }
  }

  // ---------- 5: eyespots ----------
  //  Concentric rings: dark pupil, bright iris, dark annulus, pale halo,
  //  plus a small off-centre highlight on the pupil. Nothing else in the
  //  visual vocabulary of this piece says "butterfly" as fast, and a
  //  wing without them reads as a coloured leaf however good the noise
  //  underneath it is.
  //
  //  Placed toward the OUTER field (u biased high) because that is where
  //  they sit on real wings -- an eyespot at the root would be hidden by
  //  the body anyway.
  function paintEyespots(data, N, M, pal, seed, r, sp) {
    var n = sp.eyespots;             // v9: per name, and 0 is now reachable
    if (n <= 0) { return; }          // -- a signal shown every time is not one
    var S = CFG.bornSat / 100;
    var spots = [];
    for (var k = 0; k < n; k++) {
      spots.push({
        u: 0.46 + r() * 0.40,
        v: 0.16 + r() * 0.68,
        //  v9: size band is per name too, so one wing's ocelli are a
        //  matched set rather than every wing drawing from one range
        rad: sp.eyeRad * (0.75 + r() * 0.5),
        //  the iris takes the accent hue, thrown far from the dominant,
        //  so an eyespot never blends into the field it sits on
        iris: Noise.hsl2rgb(pal.accent, S, 0.60),
        halo: Noise.hsl2rgb(pal.analogue, S * 0.7, 0.80),
        wob: r() * 6.283
      });
    }
    var pupil = Noise.hsl2rgb(pal.deep, S * 0.5, 0.10);
    var ring  = Noise.hsl2rgb(pal.deep, S * 0.8, 0.22);
    var i = 0;
    for (var y = 0; y < M; y++) {
      var v = y / (M - 1);
      for (var x = 0; x < N; x++) {
        var u = x / (N - 1);
        for (var j = 0; j < spots.length; j++) {
          var sp = spots[j];
          var du = (u - sp.u), dv = (v - sp.v) * 0.55;   // wings are wider than tall here
          var d = Math.sqrt(du * du + dv * dv);
          //  a perfectly circular eyespot reads as a printed dot; real
          //  ones are lumpy, so the radius breathes with angle
          var th = Math.atan2(dv, du);
          var rad = sp.rad * (1 + 0.13 * Math.sin(th * 3 + sp.wob));
          if (d > rad * 1.55) { continue; }
          var q = d / rad;
          var col = null, amt = 1;
          if (q < 0.34)      { col = pupil; }
          else if (q < 0.44) { col = spots[j].iris; amt = 0.9; }   // catchlight edge
          else if (q < 0.74) { col = sp.iris; }
          else if (q < 0.96) { col = ring; }
          else               { col = sp.halo; amt = 0.72 * (1 - (q - 0.96) / 0.59); }
          if (!col || amt <= 0) { continue; }
          data[i]     = data[i]     + (col[0] - data[i])     * amt;
          data[i + 1] = data[i + 1] + (col[1] - data[i + 1]) * amt;
          data[i + 2] = data[i + 2] + (col[2] - data[i + 2]) * amt;
        }
        i += 4;
      }
    }
  }

  // ---------- 6: scale shimmer ----------
  //  Real wings are covered in overlapping scales a fraction of a
  //  millimetre across. At orbit distance this is subliminal; up close
  //  it is the difference between a surface and a fill. Deliberately
  //  tiny -- a couple of per cent of lightness. Anything more and it
  //  reads as noise laid over the top rather than as the wing's own
  //  texture.
  function paintShimmer(data, N, M, seed, sp) {
    var amp = sp.shimmer;            // v9: per name
    if (amp <= 0) { return; }
    var i = 0;
    for (var y = 0; y < M; y++) {
      for (var x = 0; x < N; x++) {
        //  raw integer pixel coords: hash2 truncates, so scaling them by
        //  a fraction here would quantise the grain into 2px blocks
        //  instead of the per-pixel speckle a wing scale actually is
        var g = (Noise.hash2(x, y, seed + 55) - 0.5) * 2 * amp * 255;
        data[i]     = Math.max(0, Math.min(255, data[i] + g));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + g));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + g));
        i += 4;
      }
    }
  }

  // ============================================================
  //  v9 -- THE OPTIONAL PATTERN LAYERS
  // ============================================================
  //  Two to four of these land on any given wing (see pickLayers). They
  //  are what turns "one pattern in many hues" into many patterns: the
  //  ranges above vary the DEGREE of the base pattern, these change which
  //  patterns are present at all, and because they stack the space is
  //  multiplicative.
  //
  //  All of them write through the same small helpers so they compose
  //  predictably: mixPix blends toward a colour, scalePix multiplies
  //  (darken/lighten without shifting hue).
  function mixPix(data, i, col, amt) {
    if (amt <= 0) { return; }
    if (amt > 1) { amt = 1; }
    data[i]     = data[i]     + (col[0] - data[i])     * amt;
    data[i + 1] = data[i + 1] + (col[1] - data[i + 1]) * amt;
    data[i + 2] = data[i + 2] + (col[2] - data[i + 2]) * amt;
  }

  function scalePix(data, i, k) {
    data[i]     = Math.max(0, Math.min(255, data[i] * k));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * k));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * k));
  }

  //  ---- stripes: transverse bars, ACROSS the wing ----
  //  The margin bands follow the outer edge; these cut the other way,
  //  along the body axis. Tiger swallowtails, zebra longwings, and a good
  //  half of what anyone pictures when they picture a patterned butterfly.
  //  Analytic: one sine and one cheap fBm per pixel for the wobble.
  function paintStripes(data, N, M, pal, seed, r, sp) {
    var n = CFG.bornStripeCountMin +
            Math.floor(r() * (CFG.bornStripeCountMax - CFG.bornStripeCountMin + 1));
    var ink = Noise.hsl2rgb(pal.deep, CFG.bornSat / 100 * 0.7, pal.lo * 0.42);
    var skew = (r() - 0.5) * 1.4;      // stripes rarely run exactly square
    var sharp = 0.5 + r() * 3.0;       // soft bands vs hard bars
    var i = 0;
    for (var y = 0; y < M; y++) {
      var v = y / (M - 1);
      for (var x = 0; x < N; x++) {
        var u = x / (N - 1);
        var s = v * n + u * skew;
        s += (Noise.fbm(u * 3.0, v * 3.0, seed + 1231, 2) - 0.5) * 0.55;
        var band = Math.sin(s * Math.PI * 2);
        //  raising |sin| to a power turns a soft wave into a hard bar
        var amt = Math.pow(Math.max(0, band), sharp) * CFG.bornStripeDark;
        if (amt > 0.004) { mixPix(data, i, ink, amt); }
        i += 4;
      }
    }
  }

  //  ---- apical patch: a hard block at the wing tip ----
  //  Extremely common and instantly legible -- orange tips, the white
  //  corners on a red admiral. A wedge near u=1, cut on a diagonal so it
  //  reads as a corner rather than a stripe.
  function paintApical(data, N, M, pal, seed, r, sp) {
    var col = Noise.hsl2rgb(r() < 0.5 ? pal.accent : pal.analogue,
                            CFG.bornSat / 100,
                            r() < 0.35 ? pal.lo * 0.5 : Math.min(0.92, pal.hi * 1.25));
    var size = CFG.bornApicalSize * (0.7 + r() * 0.8);
    var tilt = 0.4 + r() * 1.5;
    var side = r() < 0.5 ? 1 : -1;     // which end of the body axis
    var i = 0;
    for (var y = 0; y < M; y++) {
      var v = y / (M - 1);
      for (var x = 0; x < N; x++) {
        var u = x / (N - 1);
        //  distance into the corner, wobbled so the edge is not a ruled line
        var d = (1 - u) + (side > 0 ? (1 - v) : v) * tilt;
        d += (Noise.fbm(u * 4.5, v * 4.5, seed + 2311, 2) - 0.5) * 0.16;
        if (d < size) {
          //  a hard edge with just a couple of pixels of roll-off, so it
          //  belongs to the posterised family rather than fading in
          mixPix(data, i, col, Math.min(1, (size - d) * 14));
        }
        i += 4;
      }
    }
  }

  //  ---- checkered fringe: alternating blocks along the very margin ----
  //  The chequered edge on a checkerspot or a marbled white. Reads as
  //  craftsmanship at close range and as a fine dark border further off,
  //  which suits an object seen at both 1 m and 4.5 m.
  function paintFringe(data, N, M, pal, seed, r, sp) {
    var n = CFG.bornFringeCountMin +
            Math.floor(r() * (CFG.bornFringeCountMax - CFG.bornFringeCountMin + 1));
    var depth = 0.035 + r() * 0.055;
    var dark = Noise.hsl2rgb(pal.deep, CFG.bornSat / 100 * 0.8, pal.lo * 0.30);
    var pale = Noise.hsl2rgb(pal.analogue, CFG.bornSat / 100 * 0.4,
                             Math.min(0.94, pal.hi * 1.35));
    var i = 0;
    for (var y = 0; y < M; y++) {
      var v = y / (M - 1);
      var blk = Math.floor(v * n) % 2;
      for (var x = 0; x < N; x++) {
        var u = x / (N - 1);
        var d = 1 - u;                             // 0 at the tip/margin
        if (d < depth) {
          var e = Math.min(1, (depth - d) / (depth * 0.55));
          mixPix(data, i, blk ? dark : pale, e * 0.92);
        }
        i += 4;
      }
    }
  }

  //  ---- spot field: scattered small dots ----
  //  Distinct from eyespots -- no rings, no pupil, just many small marks,
  //  the way a fritillary or a checkerspot is dotted all over. Placed from
  //  the PRNG and tested per pixel against a short list, which is cheap
  //  because the list is short and each test is a squared distance.
  function paintSpots(data, N, M, pal, seed, r, sp) {
    var n = CFG.bornSpotCountMin +
            Math.floor(r() * (CFG.bornSpotCountMax - CFG.bornSpotCountMin + 1));
    var dark = r() < 0.6;
    var col = dark ? Noise.hsl2rgb(pal.deep, CFG.bornSat / 100 * 0.75, pal.lo * 0.34)
                   : Noise.hsl2rgb(pal.accent, CFG.bornSat / 100,
                                   Math.min(0.93, pal.hi * 1.22));
    var pts = [];
    for (var k = 0; k < n; k++) {
      pts.push({ u: r(), v: r(), rad: 0.012 + r() * 0.030 });
    }
    var i = 0;
    for (var y = 0; y < M; y++) {
      var v2 = y / (M - 1);
      for (var x = 0; x < N; x++) {
        var u2 = x / (N - 1);
        for (var j = 0; j < pts.length; j++) {
          var p = pts[j];
          var du = u2 - p.u, dv = (v2 - p.v) * 0.5;   // the slice is 1:2
          var dd = du * du + dv * dv;
          if (dd < p.rad * p.rad) {
            mixPix(data, i, col, Math.min(1, (1 - Math.sqrt(dd) / p.rad) * 6));
            break;
          }
        }
        i += 4;
      }
    }
  }

  //  ---- radial streaks: wide bright rays from the root ----
  //  The same geometry as the veins and deliberately the opposite reading:
  //  few, wide, and LIGHTER rather than many, narrow and darker. On a wing
  //  that also has veins the two make a ribbed structure; on one without,
  //  they are the only radial organisation there is.
  function paintStreaks(data, N, M, pal, seed, r, sp) {
    var n = CFG.bornStreakCountMin +
            Math.floor(r() * (CFG.bornStreakCountMax - CFG.bornStreakCountMin + 1));
    var col = Noise.hsl2rgb(pal.analogue, CFG.bornSat / 100 * 0.85,
                            Math.min(0.95, pal.hi * 1.28));
    var wid = 0.10 + r() * 0.16;
    var strength = 0.28 + r() * 0.34;
    var angs = [];
    for (var k = 0; k < n; k++) {
      angs.push(-0.7 + (k / (n - 1 || 1)) * 1.4 + (r() - 0.5) * 0.10);
    }
    var i = 0;
    for (var y = 0; y < M; y++) {
      var v = y / (M - 1);
      for (var x = 0; x < N; x++) {
        var u = x / (N - 1);
        var ang = Math.atan2(v - 0.5, u + 0.04);
        var best = 1e9;
        for (var j = 0; j < angs.length; j++) {
          var d = Math.abs(ang - angs[j]);
          if (d < best) { best = d; }
        }
        var t = best * (0.30 + u * 1.5) / wid;
        if (t < 1) {
          //  fades out toward the root so they read as growing outward
          mixPix(data, i, col, (1 - t) * (1 - t) * strength * Math.min(1, u * 2.2));
        }
        i += 4;
      }
    }
  }

  //  ---- reticulation: a marbled web of cell boundaries ----
  //  Ridged noise creases at every zero crossing, which is what makes a
  //  net of thin bright lines rather than clouds -- see noise.js:ridged.
  //
  //  THIS IS ONE OF THE TWO EXPENSIVE LAYERS, and it uses the same
  //  half-resolution trick paintBase does for exactly the same reason: a
  //  ridged fBm per full-resolution pixel would cost about what the base
  //  field costs and roughly double the paint. Sampled at CFG.bornFieldDiv
  //  and interpolated back up, the result is indistinguishable once it is
  //  thresholded.
  function paintRetic(data, N, M, pal, seed, r, sp) {
    var div = Math.max(1, CFG.bornFieldDiv);
    var FN = Math.max(2, Math.ceil(N / div)), FM = Math.max(2, Math.ceil(M / div));
    var f = new Float32Array(FN * FM);
    var freq = CFG.bornReticFreq * (0.6 + r() * 0.9);
    var i2 = 0;
    for (var fy = 0; fy < FM; fy++) {
      var fv = fy / (FM - 1);
      for (var fx = 0; fx < FN; fx++) {
        f[i2++] = Noise.ridged(fx / (FN - 1) * freq, fv * freq, seed + 4801, 3);
      }
    }
    var fld = { f: f, w: FN, h: FM };
    var col = Noise.hsl2rgb(pal.deep, CFG.bornSat / 100 * 0.6, pal.lo * 0.36);
    var thresh = 0.42 + r() * 0.22;
    var strength = 0.45 + r() * 0.35;
    var i = 0;
    for (var y = 0; y < M; y++) {
      var v = y / (M - 1);
      for (var x = 0; x < N; x++) {
        var g = sampleField(fld, x / (N - 1), v);
        if (g > thresh) {
          mixPix(data, i, col, Math.min(1, (g - thresh) / (1 - thresh)) * strength);
        }
        i += 4;
      }
    }
  }

  //  ---- blotches: large irregular patches ----
  //  Low-frequency fBm thresholded into a couple of big shapes. Where
  //  reticulation is fine structure, this is the opposite scale entirely
  //  -- continents of a second colour, the way a red admiral has broad
  //  bands of unrelated colour laid over the base.
  //
  //  The second expensive layer, and half-resolution for the same reason.
  function paintBlotch(data, N, M, pal, seed, r, sp) {
    var div = Math.max(1, CFG.bornFieldDiv);
    var FN = Math.max(2, Math.ceil(N / div)), FM = Math.max(2, Math.ceil(M / div));
    var f = new Float32Array(FN * FM);
    var freq = CFG.bornBlotchFreq * (0.7 + r() * 0.8);
    var i2 = 0;
    for (var fy = 0; fy < FM; fy++) {
      var fv = fy / (FM - 1);
      for (var fx = 0; fx < FN; fx++) {
        f[i2++] = Noise.fbm(fx / (FN - 1) * freq, fv * freq, seed + 6203, 3);
      }
    }
    var fld = { f: f, w: FN, h: FM };
    var col = Noise.hsl2rgb(r() < 0.5 ? pal.accent : pal.h0,
                            CFG.bornSat / 100,
                            r() < 0.4 ? pal.lo * 0.55 : Math.min(0.92, pal.hi * 1.18));
    var thresh = 0.48 + (r() - 0.5) * 0.22;
    var i = 0;
    for (var y = 0; y < M; y++) {
      var v = y / (M - 1);
      for (var x = 0; x < N; x++) {
        var g = sampleField(fld, x / (N - 1), v);
        if (g > thresh) {
          //  a hard-ish edge, in keeping with the posterised base
          mixPix(data, i, col, Math.min(1, (g - thresh) * 22));
        }
        i += 4;
      }
    }
  }

  var LAYER_FN = {
    stripes: paintStripes, apical: paintApical, fringe: paintFringe,
    spots:   paintSpots,   streaks: paintStreaks,
    retic:   paintRetic,   blotch:  paintBlotch
  };

  // ---------- the one call born.js makes ----------
  //  seedInt  an integer derived from the name (see born.js:nameToSeed)
  //  hue0     the dominant hue, also name-derived
  //  -> { texture, canvas, palette }
  function paint(seedInt, hue0) {
    var N = CFG.bornTexSize;             // outward axis
    var M = N * 2;                       // along the body -- the slice is 1:2
    //  INTEGER. Noise.hash2 truncates its seed, so a fractional seed
    //  would collapse distinct names onto the same field.
    var seed = seedInt % 100000;
    var r = Noise.rng(seedInt);
    var pal = paletteFor(hue0, r);
    //  v9: the per-name species draw. MUST come after paletteFor, because
    //  both pull from the same PRNG stream in sequence -- reordering them
    //  would change every existing name's butterfly, which is exactly the
    //  guarantee this file is not allowed to break.
    var sp = speciesFor(r);

    var canvas = document.createElement('canvas');
    canvas.width = N; canvas.height = M;
    var cx = canvas.getContext('2d');
    var img = cx.createImageData(N, M);
    var data = img.data;

    //  ImageData, not fillRect per pixel. A per-pixel fillRect is about
    //  thirty times slower and this loop runs N*M times.
    paintBase(data, N, M, pal, seed, sp.bands, sp);
    //  v9: the chosen pattern layers, BEFORE the margin/vein/eyespot set.
    //  Order matters: these are field-scale markings and belong under the
    //  anatomical structure, the same way the base does. Veins drawn over
    //  stripes read as a wing; stripes drawn over veins read as a wing
    //  with a sticker on it.
    for (var li = 0; li < sp.layers.length; li++) {
      var fn = LAYER_FN[sp.layers[li]];
      if (fn) { fn(data, N, M, pal, seed, r, sp); }
    }
    paintMargin(data, N, M, pal, seed, sp);
    paintVeins(data, N, M, pal, seed, r, sp);
    paintEyespots(data, N, M, pal, seed, r, sp);
    paintShimmer(data, N, M, seed, sp);
    cx.putImageData(img, 0, 0);

    var tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    srgb(tex);

    //  `species` is returned so born.js can log WHAT it drew, not just how
    //  long it took. That log is the instrument the variety is actually
    //  verified with -- "they look different" is not measurable, "bands 5,
    //  veins 0, layers stripes+fringe" is.
    return { texture: tex, canvas: canvas, palette: pal, species: sp };
  }

  return { paint: paint, paletteFor: paletteFor, speciesFor: speciesFor };
})();
