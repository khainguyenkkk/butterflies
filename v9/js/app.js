// ============================================================
//  app.js  --  what happens after the name is accepted
// ============================================================
//  For six versions this file was a stub. v3's copy said so:
//
//      v3 stops at the input stage on purpose. The keyboard collects a
//      name and fires one event; generating a butterfly from that name
//      and releasing it into the kaleidoscope is the next version's
//      work.
//
//  ...and predicted exactly what would replace it:
//
//      window.addEventListener('keyboard:accepted', function (e) {
//        var values = nameToValues(e.detail.name);   // the open question
//        DNA.captureAll(values);                     // -> a butterfly
//      });
//
//  v7 is that. The open question -- how an n-letter name maps onto the
//  generator's four values, stably and well spread -- is answered in
//  born.js:nameToDials(); the butterfly it produces is born.js's job.
//
//  This file stays what it always was: the ONE place that knows a name
//  means anything. Everything downstream of that fact lives in born.js,
//  so the keyboard still has no idea it is feeding a generator, and
//  nothing above this line changed to make v7 happen.
//
//  Names are still kept for the session only. There is still no
//  storage -- a butterfly is reproducible from its name alone (the hash
//  is stable across machines and sessions, see born.js), so the name IS
//  the save file, and a schema on top of that would store nothing the
//  four characters do not already carry.
// ============================================================
var Accepted = [];

window.addEventListener('keyboard:accepted', function (e) {
  var name = e.detail.name;
  Accepted.push({ name: name, at: new Date().toISOString() });
  console.log('[butterfly-keyboard] accepted "' + name + '"  (' + Accepted.length + ' this session)');

  //  -> a butterfly. It bursts from where the name hangs, flies out past
  //  the swarm, and joins a wide orbit carrying the name.
  Born.spawn(name);
});
