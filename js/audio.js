// ============================================================
//  audio.js  --  the three things v1 never wired in, plus v3's wander
// ============================================================
//  Named SFX, not Audio -- `Audio` is the built-in window.Audio
//  (HTMLAudioElement) constructor, and shadowing it globally is exactly
//  the kind of silent trap this project's own CLAUDE.md keeps calling
//  out (this.name un-registering a component's tick()). No new
//  dependency: THREE.AudioListener / THREE.Audio / THREE.PositionalAudio
//  are already part of the three.js build A-Frame loads.
//
//  Three things, three call sites elsewhere:
//    - background music, looped, non-positional, started here with no
//      button anywhere to turn it on -- keyboard.js never touches it.
//    - the winner one-shot, non-positional -- keyboard.js:accept() calls
//      SFX.playWinner() the moment the green control's pinch goes through.
//    - three of the 26 butterflies each carry a looping, POSITIONAL
//      sound -- keyboard.js:buildKeys() calls SFX.attachButterflyLoop()
//      once per chosen key, right after that key's THREE.Group exists.
//      A positional node parented to that group tracks the butterfly for
//      free: keyboard.js already does k.group.position.copy(k.pos) every
//      frame, and three.js's normal scene-graph traversal is what feeds
//      the panner -- nothing new to tick.
//
//  READY, not immediate. buildKeys()/accept() can fire before the camera
//  exists or the clips have finished loading (script order and A-Frame's
//  own element-upgrade timing don't guarantee otherwise), so every call
//  in queues until SFX is actually ready, then flushes once.
//
//  v3 adds a fourth thing, entirely inside this file: WANDER. Each of the
//  three spatial loops independently drifts its own playback rate and its
//  own volume on a smoothed random walk (see CFG.audioBfly* in config.js
//  and README.md in this folder for the numbers and the reasoning). SFX
//  itself is a plain module, not an A-Frame component, so it has nothing
//  that runs every frame -- `sfx-tick` below is a one-line component whose
//  only job is to call into this closure once per tick so the wander has
//  somewhere to live. It is registered on <a-scene> from init(), not added
//  to index.html, so this stays "one new file" the way v2's own header
//  promised.
//
//  v3 also adds two one-shots: `pickup` (keyboard.js:capture(), a
//  butterfly actually caught) and `swoosh` (interact.js:tick(), a
//  pinch/click that hit nothing at all). Both re-roll their pitch AND
//  volume from CFG.audio{Pickup,Swoosh}{Vol,Rate}{Min,Max} on every single
//  play -- see playOneShot() -- so the same clip doesn't sound identical
//  twice in a row.
//
//  Verified (desktop, Chromium): listener attaches to the live camera,
//  all five clips decode, the 3 chosen butterflies each carry a playing
//  PositionalAudio with panningModel HRTF, the background loop plays at
//  CFG.audioBgVolume, accept() flips the winner one-shot to playing, and
//  each spatial loop's rate/volume visibly wanders (read back via
//  `SFX._debugLoops()` in the console) without the three ever moving in
//  lockstep.
// ============================================================
var SFX = (function () {
  var listener = null;
  var buffers = {};           // name -> AudioBuffer
  var bg = null, winner = null;
  var ready = false;
  var pending = { butterflies: [], winner: false, pickup: 0, swoosh: 0 };
  var gestureBound = false;
  var loops = [];              // v3: the 3 spatial loops, each carrying its own wander state

  var CLIPS = {
    bg:         'sounds/background-music.wav',
    winner:     'sounds/winner.wav',
    butterfly0: 'sounds/butterfly1.wav',
    butterfly1: 'sounds/butterfly2.wav',
    butterfly2: 'sounds/butterfly3.mp3',
    pickup:     'sounds/pickup.mp3',
    swoosh:     'sounds/swoosh.ogg'
  };

  function loadAll(cb) {
    var loader = new THREE.AudioLoader();
    var names = Object.keys(CLIPS);
    var left = names.length;
    names.forEach(function (name) {
      loader.load(CLIPS[name], function (buf) {
        buffers[name] = buf;
        if (--left === 0) { cb(); }
      }, undefined, function (err) {
        // a missing/failed clip should not stop the other four from working
        console.warn('[audio] failed to load ' + CLIPS[name], err);
        if (--left === 0) { cb(); }
      });
    });
  }

  //  The camera is found through camera-set-active rather than read off
  //  sceneEl.camera directly -- that property races A-Frame's own camera
  //  setup, and camera-set-active is what fires once it is actually there.
  function attachListener(sceneEl, done) {
    listener = new THREE.AudioListener();
    function onCamera(camObj) {
      camObj.add(listener);
      done();
    }
    if (sceneEl.camera) { onCamera(sceneEl.camera); return; }
    sceneEl.addEventListener('camera-set-active', function (e) {
      onCamera(e.detail.cameraEl.getObject3D('camera'));
    }, { once: true });
  }

  //  Autoplay policy needs a user gesture before the shared AudioContext
  //  will actually make sound. Entering the AR/VR session is one (the
  //  headset's own enter button click); pointerdown/keydown/touchstart
  //  cover desktop testing. Whichever fires first resumes the context --
  //  play() is already scheduled on it, so resuming is all that is left.
  function bindGestureResume(sceneEl) {
    if (gestureBound) { return; }
    gestureBound = true;
    function resume() {
      if (listener.context.state !== 'running') { listener.context.resume(); }
    }
    sceneEl.addEventListener('enter-vr', resume);
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    window.addEventListener('touchstart', resume);
  }

  function makeNonPositional(name, volume, loop) {
    var a = new THREE.Audio(listener);
    a.setBuffer(buffers[name]);
    a.setLoop(loop);
    a.setVolume(volume);
    return a;
  }

  function flush() {
    var i;
    for (i = 0; i < pending.butterflies.length; i++) {
      doAttachButterflyLoop(pending.butterflies[i].group, pending.butterflies[i].idx);
    }
    pending.butterflies.length = 0;
    if (pending.winner) { doPlayWinner(); pending.winner = false; }
    while (pending.pickup > 0) { doPlayPickup(); pending.pickup--; }
    while (pending.swoosh > 0) { doPlaySwoosh(); pending.swoosh--; }
  }

  //  v3: a smoothed random walk. Picks a fresh target in [lo, hi] every
  //  [periodMin, periodMax] seconds and eases the current value toward it
  //  with time constant tau -- the same exponential-smoothing idiom
  //  interact.js uses for aim smoothing (CFG.aimSmoothTau), just reused
  //  here for tempo/volume. A raw sine LFO would put all three loops in a
  //  visibly periodic lockstep-able pattern; redrawing the target keeps it
  //  from ever repeating on a fixed cycle, and starting `next` at a random
  //  fraction of the first period (rather than 0) keeps three loops
  //  started back-to-back from wandering in phase with each other.
  function makeWander(lo, hi, periodMin, periodMax, tau, seed) {
    var w = { lo: lo, hi: hi, periodMin: periodMin, periodMax: periodMax, tau: tau };
    w.value = lo + (hi - lo) * seed;
    w.target = w.value;
    w.next = (periodMin + (periodMax - periodMin) * Math.random()) * seed;
    return w;
  }

  function tickWander(w, dt) {
    w.next -= dt;
    if (w.next <= 0) {
      w.target = w.lo + (w.hi - w.lo) * Math.random();
      w.next = w.periodMin + (w.periodMax - w.periodMin) * Math.random();
    }
    // exponential ease toward the target -- frame-rate independent
    var k = 1 - Math.exp(-dt / w.tau);
    w.value += (w.target - w.value) * k;
    return w.value;
  }

  function doAttachButterflyLoop(group, idx) {
    var name = 'butterfly' + (idx % 3);
    if (!buffers[name]) { return; }
    var a = new THREE.PositionalAudio(listener);
    a.setBuffer(buffers[name]);
    a.setLoop(true);
    a.setVolume(CFG.audioBflyVolume);
    a.setRefDistance(CFG.audioRefDistance);
    a.setMaxDistance(CFG.audioMaxDistance);
    a.setRolloffFactor(CFG.audioRolloff);
    a.setDistanceModel('linear');
    a.panner.panningModel = 'HRTF';    // binaural -- this is a headset piece
    group.add(a);
    a.play();

    // v3: each loop gets its OWN rate wander and volume wander, seeded to
    // different starting phases (loops.length, not idx -- idx is a key
    // index 0-25, loops.length is 0/1/2 in attach order) so three loops
    // attached in the same frame don't start in lockstep.
    var seed = loops.length;
    loops.push({
      audio: a,
      rate: makeWander(CFG.audioBflyRateMin, CFG.audioBflyRateMax,
                        CFG.audioBflyModPeriodMin, CFG.audioBflyModPeriodMax,
                        CFG.audioBflyModTau, (seed + 0.5) / 3),
      vol:  makeWander(CFG.audioBflyVolModMin, CFG.audioBflyVolModMax,
                        CFG.audioBflyModPeriodMin, CFG.audioBflyModPeriodMax,
                        CFG.audioBflyModTau, (seed + 2) / 3)   // offset from rate's
                                                                 // seed so the two
                                                                 // don't peak together
    });
  }

  //  Runs every tick once SFX is ready (see the `sfx-tick` component below).
  //  setPlaybackRate on a THREE.Audio drives the underlying buffer source's
  //  .playbackRate directly -- Web Audio has no independent tempo control on
  //  a raw AudioBufferSourceNode, so this is pitch-and-speed together, same
  //  as physically speeding up a recording. setVolume multiplies the node's
  //  own gain stage, which sits BEFORE the panner's distance/HRTF gain in
  //  the graph -- so this wander and the "closer = louder" falloff from
  //  audioRefDistance/audioMaxDistance/audioRolloff compose automatically
  //  rather than fighting each other.
  function updateLoops(dt) {
    for (var i = 0; i < loops.length; i++) {
      var L = loops[i];
      L.audio.setPlaybackRate(tickWander(L.rate, dt));
      L.audio.setVolume(CFG.audioBflyVolume * tickWander(L.vol, dt));
    }
  }

  function doPlayWinner() {
    if (!winner) { return; }
    if (winner.isPlaying) { winner.stop(); }
    winner.play();
  }

  //  v3: pickup / swoosh. A fresh THREE.Audio PER CALL, not one reused node
  //  like `winner` above -- two letters caught in the same frame (one per
  //  hand) need two audible hits, not the second cutting the first off, and
  //  a reused node would also force the same random pitch on both. Cheap
  //  for a short one-shot: nothing is added to the scene graph (these are
  //  non-positional, same as winner), and the node has no external
  //  reference to hold onto once THREE.Audio's own onEnded fires, so it is
  //  free to be garbage-collected.
  function playOneShot(name, volMin, volMax, rateMin, rateMax) {
    if (!buffers[name]) { return; }
    var a = new THREE.Audio(listener);
    a.setBuffer(buffers[name]);
    a.setVolume(volMin + (volMax - volMin) * Math.random());
    a.setPlaybackRate(rateMin + (rateMax - rateMin) * Math.random());
    a.play();
  }

  function doPlayPickup() {
    playOneShot('pickup', CFG.audioPickupVolMin, CFG.audioPickupVolMax,
                CFG.audioPickupRateMin, CFG.audioPickupRateMax);
  }

  function doPlaySwoosh() {
    playOneShot('swoosh', CFG.audioSwooshVolMin, CFG.audioSwooshVolMax,
                CFG.audioSwooshRateMin, CFG.audioSwooshRateMax);
  }

  return {
    // called once, from index.html after the scene exists
    init: function (sceneEl) {
      attachListener(sceneEl, function () {
        bindGestureResume(sceneEl);
        loadAll(function () {
          bg = makeNonPositional('bg', CFG.audioBgVolume, true);
          winner = makeNonPositional('winner', CFG.audioWinnerVolume, false);
          bg.play();                    // scheduled now; audible once the
          ready = true;                  // context resumes on a gesture above
          flush();
          sceneEl.setAttribute('sfx-tick', '');   // v3: start the wander
        });
      });
    },

    attachButterflyLoop: function (group, idx) {
      if (!ready) { pending.butterflies.push({ group: group, idx: idx }); return; }
      doAttachButterflyLoop(group, idx);
    },

    playWinner: function () {
      if (!ready) { pending.winner = true; return; }
      doPlayWinner();
    },

    // keyboard.js:capture() -- a butterfly was actually caught
    playPickup: function () {
      if (!ready) { pending.pickup++; return; }
      doPlayPickup();
    },

    // interact.js:tick() -- a pinch/click fired and picked nothing at all
    playSwoosh: function () {
      if (!ready) { pending.swoosh++; return; }
      doPlaySwoosh();
    },

    // called by the `sfx-tick` component below, once per frame
    _tick: function (dt) { updateLoops(dt); },

    // console/debug only -- not used by the piece itself. Read back each
    // spatial loop's live rate/volume to confirm the wander is moving and
    // that the three loops are out of phase with each other.
    _debugLoops: function () {
      return loops.map(function (L) {
        return { rate: L.audio.playbackRate, volume: L.audio.getVolume() };
      });
    }
  };
})();

//  SFX is a plain module with nothing that runs every frame on its own --
//  this is the one-line bridge into A-Frame's tick loop that the v3 wander
//  needs. Registered on <a-scene> from init() below rather than declared
//  in index.html, so the markup doesn't change and audio.js stays the only
//  file this feature touches.
AFRAME.registerComponent('sfx-tick', {
  tick: function (t, dt) { SFX._tick(dt / 1000); }
});

window.addEventListener('DOMContentLoaded', function () {
  var sceneEl = document.querySelector('a-scene');
  if (!sceneEl) { return; }
  if (sceneEl.hasLoaded) { SFX.init(sceneEl); }
  else { sceneEl.addEventListener('loaded', function () { SFX.init(sceneEl); }); }
});
