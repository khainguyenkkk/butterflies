// ============================================================
//  type.js  --  one typeface, and the one trap that comes with it
// ============================================================
//  v9.1 moves the whole piece onto Kavoon, loaded from Google Fonts.
//  That reverses a rule CLAUDE.md's typography section had held since
//  v4 -- "nothing is fetched, no font asset, no network on the critical
//  path" -- so the reason it was a rule is now a live problem, and this
//  file is where it is dealt with.
//
//  THE TRAP. Canvas draws with whatever font is resolved at the instant
//  fillText() runs. If the webfont has not finished loading, the browser
//  does not wait, does not warn, and does not redraw later: it silently
//  substitutes the fallback, bakes those glyphs into the bitmap, uploads
//  it as a texture, and that texture is what the visitor sees for the
//  rest of the session. Nothing errors. The only symptom is that the
//  type is in the wrong face, which is easy to miss on a headset and
//  impossible to fix after the fact.
//
//  It is worse here than in ordinary DOM work because every piece of type
//  in this scene is a canvas -- the letters under the butterflies, the
//  caught name, the welcome paragraph, the tutorial cards. All of it is
//  drawn once and cached.
//
//  So: Type.ready(cb) resolves only when the face is genuinely available
//  to canvas, and every canvas that sets type goes through it.
//
//  document.fonts.load() is the specific call that matters. Waiting on
//  document.fonts.ready alone is not enough -- a face nothing has asked
//  for yet may simply not be in the set, and `ready` resolves happily
//  without it. Asking for the face by name is what triggers the fetch.
// ============================================================
var Type = (function () {
  'use strict';

  //  Kavoon has a single weight (400). The serif fallback matters: on a
  //  Quest, or offline, this is what the piece is set in, and a grotesque
  //  fallback under a display face reads as a bug rather than a fallback.
  var FAMILY = '"Kavoon", Georgia, "Times New Roman", serif';
  var WEIGHT = '400';

  var loaded = false;
  var waiting = [];

  function fire() {
    loaded = true;
    for (var i = 0; i < waiting.length; i++) { waiting[i](); }
    waiting.length = 0;
  }

  function begin() {
    if (!document.fonts || !document.fonts.load) {
      //  no CSS Font Loading API -- draw immediately rather than never.
      //  The face may be wrong for the first frames; there is nothing
      //  better available and hanging forever would be worse.
      fire();
      return;
    }
    //  Ask at a couple of sizes: some engines cache per-size, and the
    //  scene draws type at wildly different pixel sizes.
    Promise.all([
      document.fonts.load(WEIGHT + ' 64px "Kavoon"'),
      document.fonts.load(WEIGHT + ' 200px "Kavoon"')
    ]).then(function () {
      return document.fonts.ready;
    }).then(fire).catch(function (e) {
      console.warn('[type] Kavoon failed to load, falling back', e);
      fire();
    });
    //  ...and a hard backstop. An exhibition machine on a captive-portal
    //  wifi can leave a font fetch pending indefinitely, and a piece that
    //  never draws its type is far worse than one drawing it in Georgia.
    setTimeout(function () { if (!loaded) { console.warn('[type] font wait timed out'); fire(); } }, 4000);
  }

  begin();

  return {
    //  `weight` is accepted and ignored for Kavoon, which has one -- kept
    //  in the signature because ui.js's call sites pass 400/500/600 and
    //  rewriting them all to drop it would be a bigger diff than this
    //  comment.
    font: function (px, weight) {
      return (weight || WEIGHT) + ' ' + px + 'px ' + FAMILY;
    },
    family: FAMILY,
    ready: function (cb) {
      if (loaded) { cb(); } else { waiting.push(cb); }
    },
    isReady: function () { return loaded; }
  };
})();
