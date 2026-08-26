// ============================================================
//  app.js  --  what happens after the name is accepted
// ============================================================
//  v3 stops at the input stage on purpose. The keyboard collects a
//  name and fires one event; generating a butterfly from that name and
//  releasing it into the kaleidoscope is the next version's work.
//
//  This file is that seam, and it is deliberately the only place that
//  knows a name means anything. When the generator arrives it replaces
//  the body of the listener and nothing else in v3 changes:
//
//      window.addEventListener('keyboard:accepted', function (e) {
//        var values = nameToValues(e.detail.name);   // the open question
//        DNA.captureAll(values);                     // -> a butterfly
//      });
//
//  Names are kept for the session only. There is no storage in v3 --
//  adding one before the thing being stored exists would just be a
//  schema to throw away.
// ============================================================
var Accepted = [];

window.addEventListener('keyboard:accepted', function (e) {
  var name = e.detail.name;
  Accepted.push({ name: name, at: new Date().toISOString() });
  console.log('[butterfly-keyboard] accepted "' + name + '"  (' + Accepted.length + ' this session)');
});
