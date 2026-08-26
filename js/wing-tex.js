// ============================================================
//  wing-tex.js  --  dials -> a three.js texture, and who gets one
// ============================================================
//  The seam between the generator and the scene. Everything that
//  wants a wing goes through here, so the storage strategy can
//  change without touching butterfly.js or swarm.js.
//
//  One CanvasTexture per unique wing, 256x128 (~128KB each).
//  MAX_UNIQUE caps the bill; past it the least recently used record is
//  redrawn in place, so a long exhibition cannot grow the GPU
//  footprint without bound. Identical captures share one texture.
//
//  The documented upgrade, once a real population needs more than
//  ~64 distinct wings on screen at once, is to pack slices into one
//  atlas and give each material a cloned texture with offset/repeat
//  set. Materials are already per-butterfly, so that change lands
//  entirely inside this file.
//
//  COLOUR lives here too. The TouchDesigner system's 4 values drive
//  wing shape only, and the original scene picked a random hue per
//  butterfly. Deriving hue from the DNA instead means a visitor's
//  butterfly is consistently *theirs* across sessions -- an addition
//  beyond the TD system, switchable via Wings.setColorFromDNA(false).
// ============================================================
var Wings = (function () {
  'use strict';

  var MAX_UNIQUE = 64;      // distinct wing textures held at once

  var W = WingGen.SLICE_W, H = WingGen.SLICE_H;

  var dnaCache = [];        // [{key, tex, canvas, dials}] newest last
  var colorFromDNA = true;
  var opts = {};            // generator overrides (anchorV, fitScale, seed...)

  function makeCanvas() {
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    return c;
  }

  function texFromCanvas(canvas) {
    var t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    return t;
  }

  function keyFor(dials) {
    return dials.map(function (d) { return d.toFixed(6); }).join(',') +
           '|' + (opts.seed || 0) + '|' + (opts.fitScale || WingGen.DEFAULTS.fitScale) +
           '|' + (opts.anchorV === undefined ? WingGen.DEFAULTS.anchorV : opts.anchorV);
  }

  // --- the one call the scene makes -----------------------------
  function forDials(dials) {
    var key = keyFor(dials);
    for (var i = 0; i < dnaCache.length; i++) {
      if (dnaCache[i].key === key) {
        var hit = dnaCache.splice(i, 1)[0];       // touch: keep it fresh
        dnaCache.push(hit);
        return hit;
      }
    }
    var rec;
    if (dnaCache.length >= MAX_UNIQUE) {
      // reuse the least recently touched record's canvas and texture
      rec = dnaCache.shift();
      rec.key = key; rec.dials = dials.slice();
      WingGen.drawWing(rec.canvas, dials, opts);
      rec.tex.needsUpdate = true;
      dnaCache.push(rec);
    } else {
      var canvas = makeCanvas();
      WingGen.drawWing(canvas, dials, opts);
      rec = { key: key, canvas: canvas, tex: texFromCanvas(canvas), dials: dials.slice() };
      dnaCache.push(rec);
    }
    return rec;
  }

  // --- colour ----------------------------------------------------
  function hashValues(values) {
    // FNV-1a over the printed values: stable across sessions and
    // machines, which a float-bit hash would not be.
    var s = values.map(function (v) { return Number(v).toFixed(6); }).join(',');
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
  }

  function colorFor(entry) {
    // Same saturation/lightness ranges the original scene used, so only
    // the *choice* of hue changes, not the palette's character.
    if (!colorFromDNA || !entry || !entry.values) {
      return 'hsl(' + Math.floor(Math.random() * 360) + ', ' +
             Math.floor(70 + Math.random() * 25) + '%, ' +
             Math.floor(50 + Math.random() * 16) + '%)';
    }
    var h = hashValues(entry.values);
    var h2 = hashValues(entry.values.slice().reverse());
    return 'hsl(' + Math.floor(h * 360) + ', ' +
           Math.floor(70 + h2 * 25) + '%, ' +
           Math.floor(50 + ((h * 7) % 1) * 16) + '%)';
  }

  // --- housekeeping ----------------------------------------------
  function disposeList(list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].tex) { list[i].tex.dispose(); }
    }
  }

  function setOptions(o) {
    // Changing generator options invalidates every cached wing, since
    // the cache key encodes them.
    opts = o || {};
    disposeList(dnaCache); dnaCache = [];
  }

  function stats() {
    return {
      unique: dnaCache.length, max: MAX_UNIQUE,
      approxMB: +((dnaCache.length * W * H * 4) / 1048576).toFixed(2)
    };
  }

  return {
    W: W, H: H, MAX_UNIQUE: MAX_UNIQUE,
    forDials: forDials,
    colorFor: colorFor, hashValues: hashValues,
    setColorFromDNA: function (v) { colorFromDNA = !!v; },
    getColorFromDNA: function () { return colorFromDNA; },
    setOptions: setOptions, getOptions: function () { return opts; },
    stats: stats, makeCanvas: makeCanvas
  };
})();
