// ============================================================
//  wave.js  --  sweep a hand and a gust goes through the flock
// ============================================================
//  The piece already had a hand force: keyboard.js's `repulsors` push
//  butterflies AWAY from a fast-moving hand, radially. That is a
//  collision -- "something moved past me" -- and it is not what waving
//  is. A wave has a DIRECTION, and the things caught in it travel along
//  that direction rather than fleeing the hand.
//
//  So this is a second, separate force with three properties the brief
//  asks for explicitly:
//
//  DIRECTIONAL. The push is along the hand's own velocity, not along the
//  line from hand to butterfly.
//
//  SPATIALLY LOCALIZED. It falls off to exactly zero by CFG.waveRadius.
//  A wave disturbs the part of the flock it passes through and leaves
//  everything else flying precisely as it was. Pushing the whole swarm at
//  once would read as the room tilting rather than as a gust, and would
//  be a motion-sickness risk on top -- the same concern that produced
//  updateSlowField in v6.1.
//
//  FLUID, NOT RIGID. A pure directional shove translates a group of
//  butterflies as one block, which looks like a slide. Curl-style noise
//  sampled at each butterfly's own position rotates the push per
//  butterfly and adds a perpendicular vortex term, so the group shears
//  and swirls through the gust instead of moving as a slab. Neighbours
//  get subtly different directions, which is what makes it read as air.
//
//  COMING BACK TO NORMAL IS FREE. This module only ever ADDS velocity.
//  Both the swarm and the born butterflies already damp their offset and
//  spring back toward their flight path, so when the waving stops the
//  force decays and the flock settles on its own, with no release code
//  anywhere.
// ============================================================
var Wave = (function () {
  'use strict';

  //  Live gusts, rebuilt every frame from whatever hands are moving.
  //  Shared empty array for the overwhelmingly common case of nobody
  //  waving, so the per-frame path allocates nothing.
  var gusts = [];
  var EMPTY = [];
  var clock = 0;

  var _v = new THREE.Vector3();
  var _perp = new THREE.Vector3();
  var UP_AXIS = new THREE.Vector3(0, 1, 0);

  //  A cheap 3D value hash -- the same integer bit-mixing idea as
  //  noise.js:hash2, extended to three axes. Deliberately NOT the
  //  sin-fract trick: this runs per butterfly per gust per frame, and
  //  wing-paint.js's header records what Math.sin cost when it was used
  //  at that kind of volume.
  function hash3(x, y, z) {
    var n = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 2147483647;
    n = (n ^ (n >>> 13)) >>> 0;
    n = Math.imul(n, 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function smooth3(x, y, z) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var xf = x - xi, yf = y - yi, zf = z - zi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
    var c000 = hash3(xi, yi, zi),         c100 = hash3(xi + 1, yi, zi);
    var c010 = hash3(xi, yi + 1, zi),     c110 = hash3(xi + 1, yi + 1, zi);
    var c001 = hash3(xi, yi, zi + 1),     c101 = hash3(xi + 1, yi, zi + 1);
    var c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
    var x00 = c000 + (c100 - c000) * xf, x10 = c010 + (c110 - c010) * xf;
    var x01 = c001 + (c101 - c001) * xf, x11 = c011 + (c111 - c011) * xf;
    var y0 = x00 + (x10 - x00) * yf, y1 = x01 + (x11 - x01) * yf;
    return y0 + (y1 - y0) * zf;
  }

  return {
    //  Called once per frame by keyboard.js, which is the only thing that
    //  reads the tracked hands. `sources` is its own repulsor list, which
    //  already carries a position and a per-frame speed -- this just needs
    //  the velocity VECTOR as well, which readSources now records.
    update: function (sources, dt) {
      clock += dt;
      gusts.length = 0;
      for (var i = 0; i < sources.length; i++) {
        var s = sources[i];
        //  The head is in the repulsor list too and must never wave: a
        //  visitor turning to look at something would otherwise blow the
        //  flock across the room.
        if (s.isCamera || !s.vel) { continue; }
        if (s.speed < CFG.waveMinSpeed) { continue; }
        //  normalised strength between the two thresholds, so a slow
        //  drift does nothing and a fast sweep saturates rather than
        //  growing without bound
        var amt = (s.speed - CFG.waveMinSpeed) /
                  Math.max(1e-3, CFG.waveMaxSpeed - CFG.waveMinSpeed);
        if (amt > 1) { amt = 1; }
        gusts.push({ pos: s.pos, dir: s.vel, amt: amt });
      }
      return gusts.length;
    },

    active: function () { return gusts.length > 0; },

    //  Accumulate the gust force acting on one point into `out`.
    //  Returns true if anything was added, so callers can skip the rest
    //  of their own work when nothing is waving.
    forceAt: function (pos, out) {
      if (!gusts.length) { return false; }
      var any = false;
      for (var i = 0; i < gusts.length; i++) {
        var g = gusts[i];
        var dx = pos.x - g.pos.x, dy = pos.y - g.pos.y, dz = pos.z - g.pos.z;
        var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        //  HARD CUTOFF, not an asymptote. Past the radius a butterfly
        //  feels exactly nothing, which is what "don't move the entire
        //  flock" requires.
        if (d >= CFG.waveRadius) { continue; }
        //  smooth falloff to zero at the rim -- squared, so the gust has
        //  a soft edge rather than a shell
        var f = 1 - d / CFG.waveRadius;
        f = f * f;

        //  ---- the fluid part ----
        //  Sample the churning noise field at this butterfly's own
        //  position. Two independent samples give a rotation about the
        //  vertical and a vortex direction, so nearby butterflies are
        //  pushed along visibly different paths and the group deforms.
        var sc = 1 / Math.max(0.05, CFG.waveCurlScale);
        var t = clock * CFG.waveCurlDrift;
        var n1 = smooth3(pos.x * sc + t, pos.y * sc, pos.z * sc) - 0.5;
        var n2 = smooth3(pos.x * sc, pos.y * sc + t, pos.z * sc + 11.7) - 0.5;

        //  the push starts as the hand's own direction, then bends
        _v.copy(g.dir);
        if (_v.lengthSq() < 1e-8) { continue; }
        _v.normalize();
        _v.applyAxisAngle(UP_AXIS, n1 * 2 * CFG.waveCurl);

        //  ...plus a perpendicular term, which is what actually makes it
        //  swirl rather than merely wander. Crossed with the vertical so
        //  the vortex axis is upright -- a swirl about a tilted axis reads
        //  as the flock being flipped rather than stirred.
        _perp.crossVectors(_v, UP_AXIS);
        if (_perp.lengthSq() > 1e-8) {
          _perp.normalize();
          _v.addScaledVector(_perp, n2 * 2 * CFG.waveSwirl * 0.25);
          _v.normalize();
        }

        out.addScaledVector(_v, CFG.waveForce * g.amt * f);
        any = true;
      }
      return any;
    },

    //  console/debug only
    _gusts: function () { return gusts.length ? gusts : EMPTY; }
  };
})();
