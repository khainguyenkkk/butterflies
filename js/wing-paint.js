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
//    3  margin bands    chevrons parallel to the outer edge
//    4  veins           ridged-noise-perturbed, radiating from the root
//    5  eyespots        concentric rings, the fastest "butterfly" signal
//    6  shimmer         scale-sized grain, ~2% lightness
//
//  Veins and eyespots are drawn AFTER the quantiser on purpose. Running
//  them through it would stair-step their edges into the band boundaries
//  and they would stop reading as structure sitting on top of the wing.
//
//  COST. One paint is CFG.bornTexSize^2 * 2 pixels through a two-level
//  warped fBm -- the single heaviest computation in the piece. It runs
//  ONCE per accepted name, never per frame, and born.js times it to land
//  inside the burst animation's opening frames where the butterfly is
//  still scaling up from nothing. If it ever measures badly on a Quest,
//  CFG.bornTexSize is the one lever: halving it is 4x cheaper.
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
  function paletteFor(h0, r) {
    var analogue = (h0 + 26 + r() * 34) % 360;
    var accent   = (h0 + 150 + r() * 70) % 360;
    var deep     = (h0 + 200 + r() * 40) % 360;
    var S = CFG.bornSat / 100;
    var lo = CFG.bornLitLo / 100, hi = CFG.bornLitHi / 100;
    return {
      h0: h0, analogue: analogue, accent: accent, deep: deep,
      //  the ramp the base field is read through. Five stops rather than
      //  two: a two-stop ramp is a gradient, and a gradient is the one
      //  thing this piece has spent six versions not being.
      stops: [
        { t: 0.00, h: deep,     s: S * 0.85, l: lo * 0.55 },
        { t: 0.30, h: h0,       s: S,        l: lo },
        { t: 0.55, h: h0,       s: S,        l: (lo + hi) / 2 },
        { t: 0.78, h: analogue, s: S,        l: hi },
        { t: 1.00, h: accent,   s: S,        l: hi * 1.06 }
      ]
    };
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
  function anatomy(u, v) {
    var outward = u;                            // darker at the root
    var seam = 1 - Math.abs(v - 0.5) * 2;       // the fore/hind divide
    return outward * 0.62 + (1 - seam) * 0.20;
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
  function fieldAt(N, M, seed) {
    var div = Math.max(1, CFG.bornFieldDiv);
    var FN = Math.max(2, Math.ceil(N / div)), FM = Math.max(2, Math.ceil(M / div));
    var f = new Float32Array(FN * FM);
    var freq = CFG.bornFreq;
    var oct = CFG.bornOctaves;
    var w1 = CFG.bornWarp1, w2 = CFG.bornWarp2;
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

  function paintBase(data, N, M, pal, seed, bands) {
    var fld = fieldAt(N, M, seed);
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
        var t = sampleField(fld, u, v) * 0.72 + anatomy(u, v) * 0.46;
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
  function paintMargin(data, N, M, pal, seed) {
    var n = CFG.bornMarginBands;
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
  function paintVeins(data, N, M, pal, seed, r) {
    var count = CFG.bornVeinCount;
    if (count <= 0) { return; }
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
    var wid = CFG.bornVeinWidth;
    var dark = CFG.bornVeinDark;

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
  function paintEyespots(data, N, M, pal, seed, r) {
    var lo = CFG.bornEyespotMin, hi = CFG.bornEyespotMax;
    var n = lo + Math.floor(r() * (hi - lo + 1));
    if (n <= 0) { return; }
    var S = CFG.bornSat / 100;
    var spots = [];
    for (var k = 0; k < n; k++) {
      spots.push({
        u: 0.46 + r() * 0.40,
        v: 0.16 + r() * 0.68,
        rad: 0.055 + r() * 0.075,
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
  function paintShimmer(data, N, M, seed) {
    var amp = CFG.bornShimmer;
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

    var canvas = document.createElement('canvas');
    canvas.width = N; canvas.height = M;
    var cx = canvas.getContext('2d');
    var img = cx.createImageData(N, M);
    var data = img.data;

    //  ImageData, not fillRect per pixel. A per-pixel fillRect is about
    //  thirty times slower and this loop runs N*M times.
    paintBase(data, N, M, pal, seed, CFG.bornBands);
    paintMargin(data, N, M, pal, seed);
    paintVeins(data, N, M, pal, seed, r);
    paintEyespots(data, N, M, pal, seed, r);
    paintShimmer(data, N, M, seed);
    cx.putImageData(img, 0, 0);

    var tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    srgb(tex);

    return { texture: tex, canvas: canvas, palette: pal };
  }

  return { paint: paint, paletteFor: paletteFor };
})();
