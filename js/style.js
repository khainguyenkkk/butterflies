// ============================================================
//  style.js  --  the typographic decisions, made once per letter
// ============================================================
//  v4 is the experimental build. Every letter is set differently:
//  its own angle, its own size, its own place around its butterfly,
//  some mirrored, some hollow, some with a hairline leading back to
//  the body it belongs to. Numerals drift about at a size that has
//  nothing to do with the letters.
//
//  All of it is DETERMINISTIC, seeded off the letter's index. That
//  matters for an exhibition: the composition is wild but it is the
//  same wild composition every session, so it can be judged, adjusted
//  and signed off rather than re-rolled in front of an audience.
//
//  It also matters for the interaction. However far a letter is thrown
//  from its butterfly, the pick target is still the BODY -- the type is
//  decoration on top of a target that never moves relative to the
//  thing you are aiming at.
// ============================================================
var Style = (function () {
  'use strict';

  // a small deterministic generator: same index, same composition
  function rng(seed) {
    var s = seed * 9301 + 49297;
    return function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  //  Angles are quantised rather than free. A composition where every
  //  angle is different by a degree or two reads as sloppy; one built
  //  from a short list of angles reads as deliberate, which is what the
  //  reference work does. Mostly shallow tilts, with the occasional
  //  hard 90 and one upside-down.
  var ANGLES = [0, 0, 0.12, -0.14, 0.26, -0.28, 0.45, -0.42,
                1.5708, -1.5708, 0.85, -0.9, 3.1416];

  function forLetter(i) {
    var r = rng(i + 1);
    var a = r(), b = r(), c = r(), d = r(), e = r(), f = r(), g = r();

    //  Where the letter sits relative to the body, as an angle on a
    //  circle around it. Weighted downward -- a letter under its
    //  butterfly is the readable default -- but not exclusively, or
    //  every one lines up and the whole thing looks like a caption.
    var around = -Math.PI / 2 + (b - 0.5) * 2.6;

    return {
      rot:     ANGLES[Math.floor(a * ANGLES.length)],
      scale:   0.72 + c * 0.55,            // deliberately a narrow band
      around:  around,
      dist:    0.55 + d * 0.95,            // multiples of the letter's own size
      mirror:  e < 0.14,
      hollow:  f < 0.28,                   // outlined rather than filled
      leader:  g < 0.45,                   // a hairline back to the body
      //  A SATELLITE: a hollow letter, not this one, hanging off the
      //  butterfly at a size that has nothing to do with its own letter.
      //  It sets a second scale the way a numeral would, but the piece is
      //  about letters, so it is a letter.
      satellite: ((i * 7) % 4) === 0,
      satChar: String.fromCharCode(65 + ((i * 11 + 5) % 26)),

      //  ECHOES. The letter ghosted behind itself, stepping away at
      //  falling size and opacity. Only some letters get them: on all 26
      //  it stops being an accent and becomes a texture.
      //
      //  Every part of it is drawn separately -- the direction wanders as
      //  it steps, the spacing is uneven, and the whole trail breathes on
      //  its own period. A ghost that is a straight evenly-spaced line is
      //  a drop shadow; one that wanders is a ghost.
      echo:     r() < 0.55 ? 2 + Math.floor(r() * 3) : 0,
      echoDir:  r() * Math.PI * 2,
      echoStep: 0.45 + r() * 0.75,         // multiples of the letter's size
      echoBend: (r() - 0.5) * 1.1,         // how far the trail curves as it goes
      echoRate: 0.10 + r() * 0.28,         // and how slowly it breathes
      echoHue:  Math.floor(r() * 360),     // its own colour, not the letter's

      //  A 3D LATTICE of the same letter, scattered through the space
      //  around the butterfly at different depths and different sizes.
      //  Sprites, so every copy faces you, but their POSITIONS are fully
      //  three-dimensional -- the cluster parallaxes as the butterfly
      //  circles, which a flat arrangement cannot.
      //  THE LETTER IN THE WING. A glyph painted into a texture cannot
      //  actually be rotated out of the wing's plane, but rotation plus
      //  an uneven squash plus a shear is what a rotated plane LOOKS
      //  like, and that is the whole job. Every butterfly wears its
      //  letter at a different angle and a different foreshortening.
      wingRot:   (r() - 0.5) * 2.0,       // radians, in the wing's plane
      wingSX:    0.70 + r() * 0.55,       // and squashed unevenly, which is
      wingSY:    0.55 + r() * 0.62,       // what a tilt out of plane reads as
      wingShear: (r() - 0.5) * 0.75,
      wingSize:  0.62 + r() * 0.34,       // multiples of the slice width
      wingOffX:  (r() - 0.5) * 0.22,
      wingOffY:  (r() - 0.5) * 0.26,

      grid:     r() < 0.45 ? 4 + Math.floor(r() * 5) : 0,
      gridSeed: r() * 100,
      gridSpread: 1.1 + r() * 1.5          // multiples of the letter's size
    };
  }

  //  The caught name. Same idea, but the band is tighter: this has to
  //  be read at a glance by someone who is spelling with it.
  function forNameSlot(i, ch) {
    var r = rng(i * 31 + ch.charCodeAt(0));
    var a = r(), b = r(), c = r();
    return {
      rot:    [0, 0.10, -0.12, 0.20, -0.18, 0.06][Math.floor(a * 6)],
      scale:  0.82 + b * 0.42,
      rise:   (c - 0.5) * 0.55,            // multiples of the letter size
      //  Mis-registration: a second impression of the same letter, a
      //  fraction off and in another colour, the way a two-colour job
      //  goes wrong on press. Its offset is fixed per slot so the name
      //  keeps the same misprint every time it is spelled.
      overX:  (r() - 0.5) * 0.30,
      overY:  (r() - 0.5) * 0.26,
      //  and its own ink. A fixed second colour under every letter reads
      //  as a drop shadow the designer chose; a different one each time
      //  reads as a press that keeps missing.
      overHue: Math.floor(r() * 360)
    };
  }

  return { forLetter: forLetter, forNameSlot: forNameSlot, ANGLES: ANGLES };
})();
