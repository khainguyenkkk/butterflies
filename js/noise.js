// ============================================================
//  noise.js  --  2D noise fields, for the born butterfly's wings
// ============================================================
//  The piece already has noise: keyboard.js:makeNoise/makeFbm. But it
//  is 1D OVER TIME -- one value per butterfly per frame, driving orbit
//  wobble. Painting a wing needs a value per PIXEL, which is a
//  different thing entirely, so this is a new field library rather than
//  an extension of that one.
//
//  Everything here is SEEDED and deterministic. The same name must
//  produce the same wing on every machine and in every session -- an
//  exhibition piece cannot re-roll a visitor's butterfly in front of
//  them -- so there is no Math.random() anywhere in this file.
//
//  Value noise, not Perlin or simplex. Perlin's gradients buy smoother
//  derivatives, which matters for lighting a surface; nothing here is
//  lit (every material in this piece is MeshBasicMaterial), and the
//  output is quantised into hard bands and overdrawn with veins and
//  eyespots, so gradient continuity is invisible by the time it reaches
//  the eye. Value noise is a third of the arithmetic for the same look
//  here, and this runs 131k times per butterfly.
//
//  THE IMPORTANT ONE IS warp2. Plain fBm reads as cloud -- obviously
//  procedural, obviously a computer. Sampling the field through another
//  noise field bends it into filaments and whorls, and doing that twice
//  is where it stops looking generated and starts looking grown. It is
//  the single biggest difference between this and a fog texture.
// ============================================================
var Noise = (function () {
  'use strict';

  //  Hash for a lattice point.
  //
  //  INTEGER BIT-MIXING, not the sin-fract trick the rest of the project
  //  uses (keyboard.js:makeNoise, dialsForLetter). That trick is fine
  //  where it lives -- a handful of calls per frame for flight wobble --
  //  but it is catastrophic here. One wing is 131k pixels, and a
  //  two-level warp costs ~80 hashes each: about ten million per
  //  butterfly. Measured with Math.sin, one wing took 684 ms. That is
  //  not a hitch, it is a freeze with a visitor watching.
  //
  //  Math.imul mixing is the same idea (scramble the bits, keep the low
  //  ones) at roughly a tenth the cost, and the OUTPUT IS JUST AS
  //  RANDOM -- nothing downstream can tell which hash produced it, and
  //  it is still perfectly deterministic, which is what actually
  //  matters here.
  //
  //  Lattice coordinates arrive as floats but are always integral by the
  //  time they get here (value2 floors them first), so |0 is a truncation
  //  that never loses anything.
  function hash2(x, y, seed) {
    var h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^
            Math.imul(seed | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function smooth(t) { return t * t * (3 - 2 * t); }

  // --- one octave of 2D value noise, in [0,1] -------------------
  function value2(x, y, seed) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy;
    var ux = smooth(fx), uy = smooth(fy);
    var a = hash2(ix,     iy,     seed);
    var b = hash2(ix + 1, iy,     seed);
    var c = hash2(ix,     iy + 1, seed);
    var d = hash2(ix + 1, iy + 1, seed);
    var top = a + (b - a) * ux;
    var bot = c + (d - c) * ux;
    return top + (bot - top) * uy;
  }

  // --- fBm: octaves at doubling frequency, halving amplitude ----
  //  The 2.03 / 1.97 lacunarity rather than a clean 2.0 is deliberate:
  //  exact doubling lines every octave's lattice up on the same points
  //  and leaves a faint grid visible in the result.
  function fbm(x, y, seed, octaves, gain) {
    var sum = 0, amp = 1, norm = 0, fx = x, fy = y;
    gain = gain === undefined ? 0.5 : gain;
    for (var i = 0; i < octaves; i++) {
      sum += value2(fx, fy, seed + i * 197) * amp;
      norm += amp;
      amp *= gain;
      fx *= 2.03; fy *= 1.97;
    }
    return sum / norm;
  }

  // --- ridged: the fold that makes filaments instead of cloud ---
  //  1 - |2v - 1| creases the field at every zero crossing. Squaring
  //  sharpens the crease. This is what veins and streaks are made of;
  //  plain fbm has no edges in it at all.
  function ridged(x, y, seed, octaves) {
    var v = fbm(x, y, seed, octaves);
    var r = 1 - Math.abs(v * 2 - 1);
    return r * r;
  }

  // --- turbulence: absolute-valued octaves, billowy ------------
  function turb(x, y, seed, octaves) {
    var sum = 0, amp = 1, norm = 0, fx = x, fy = y;
    for (var i = 0; i < octaves; i++) {
      sum += Math.abs(value2(fx, fy, seed + i * 313) * 2 - 1) * amp;
      norm += amp;
      amp *= 0.5;
      fx *= 2.03; fy *= 1.97;
    }
    return sum / norm;
  }

  // --- one level of domain warp --------------------------------
  //  Offset the sample point by the field itself. `amt` is in the same
  //  units as x/y, so it scales with frequency the way you expect.
  //
  //  WARP_OCT is the octave count for the two OFFSET fields, and it is
  //  deliberately low and separate from `octaves`. The offsets only say
  //  "bend the lookup roughly this way" -- their fine detail is thrown
  //  away by the sample they displace, so paying for it is pure waste.
  //  Running them at the full octave count made one wing ~1.9x more
  //  expensive for a difference nothing downstream could see.
  var WARP_OCT = 2;

  function warp1(x, y, seed, octaves, amt) {
    var wx = fbm(x + 5.2, y + 1.3, seed + 1011, WARP_OCT) * 2 - 1;
    var wy = fbm(x + 9.7, y + 7.1, seed + 2117, WARP_OCT) * 2 - 1;
    return fbm(x + wx * amt, y + wy * amt, seed, octaves);
  }

  // --- two levels: warp the warp -------------------------------
  //  The one that matters. See the header. Second level is deliberately
  //  weaker (amt2 applied on an already-displaced point compounds), and
  //  runs at a low octave count because its detail is thrown away by
  //  the outer sample anyway.
  function warp2(x, y, seed, octaves, amt1, amt2) {
    var ax = warp1(x + 3.1, y + 8.4, seed + 3139, WARP_OCT, amt2) * 2 - 1;
    var ay = warp1(x + 6.6, y + 2.9, seed + 4193, WARP_OCT, amt2) * 2 - 1;
    return warp1(x + ax * amt1, y + ay * amt1, seed, octaves, amt1);
  }

  // --- multi-stop colour ramp, interpolated in HSL --------------
  //  HSL, not RGB. Lerping two saturated hues in RGB passes through
  //  grey at the midpoint -- a red-to-cyan ramp goes red, MUD, cyan,
  //  which is exactly the desaturated middle this piece spends so much
  //  effort avoiding. Interpolating hue as an angle keeps full chroma
  //  the whole way across.
  //
  //  stops: [{ t, h, s, l }, ...] sorted by t. Returns {h, s, l}.
  function ramp(t, stops) {
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    if (t <= stops[0].t) { return { h: stops[0].h, s: stops[0].s, l: stops[0].l }; }
    var last = stops[stops.length - 1];
    if (t >= last.t) { return { h: last.h, s: last.s, l: last.l }; }
    for (var i = 0; i < stops.length - 1; i++) {
      var a = stops[i], b = stops[i + 1];
      if (t < a.t || t > b.t) { continue; }
      var u = (b.t - a.t) < 1e-9 ? 0 : (t - a.t) / (b.t - a.t);
      u = smooth(u);
      //  shortest way round the wheel -- going the long way would sweep
      //  through hues that belong to neither stop
      var dh = ((b.h - a.h + 540) % 360) - 180;
      return {
        h: (a.h + dh * u + 360) % 360,
        s: a.s + (b.s - a.s) * u,
        l: a.l + (b.l - a.l) * u
      };
    }
    return { h: last.h, s: last.s, l: last.l };
  }

  // --- HSL -> RGB bytes, so the painter can write ImageData -----
  //  Canvas fillStyle would do this for us, but a per-pixel fillRect is
  //  ~30x slower than writing the byte array directly, and this runs
  //  131k times per butterfly.
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    s = s < 0 ? 0 : (s > 1 ? 1 : s);
    l = l < 0 ? 0 : (l > 1 ? 1 : l);
    if (s === 0) { var g = Math.round(l * 255); return [g, g, g]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    function hue(t) {
      if (t < 0) { t += 1; }
      if (t > 1) { t -= 1; }
      if (t < 1 / 6) { return p + (q - p) * 6 * t; }
      if (t < 1 / 2) { return q; }
      if (t < 2 / 3) { return p + (q - p) * (2 / 3 - t) * 6; }
      return p;
    }
    return [Math.round(hue(h + 1 / 3) * 255),
            Math.round(hue(h) * 255),
            Math.round(hue(h - 1 / 3) * 255)];
  }

  //  A small deterministic PRNG for the painter's discrete choices --
  //  how many eyespots, where they sit. Mulberry32: one line, good
  //  enough distribution, and seedable from an integer so a name maps
  //  onto it directly.
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return {
    hash2: hash2, smooth: smooth, value2: value2,
    fbm: fbm, ridged: ridged, turb: turb,
    warp1: warp1, warp2: warp2,
    ramp: ramp, hsl2rgb: hsl2rgb, rng: rng
  };
})();
