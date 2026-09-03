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
  var bg = null, winner = null, voice = null;
  var ready = false;
  var pending = { butterflies: [], winner: false, pickup: 0, swoosh: 0,
                  redbutton: 0, voice: false };
  var gestureBound = false;
  var loops = [];              // v3: the 3 spatial loops, each carrying its own wander state

  //  Everything that arrives as WAV is re-encoded to MP3 before it ships
  //  (see README.md "Load lag") -- same audio, a fraction of the download.
  //
  //  v9 NOTE, worth not rediscovering: v8 shipped with `bg` and `winner`
  //  pointing at .mp3 files that were not in sounds/ -- the folder held a
  //  freshly-dropped "background music.wav" (with a space) and winner.wav
  //  instead. loadAll()'s per-clip error handler meant this failed
  //  SILENTLY: one console warning each, everything else kept working, and
  //  the piece simply ran with no music and no winner sound. Both were
  //  re-encoded to the names below. If a clip is ever swapped again, the
  //  filename here is the contract.
  var CLIPS = {
    bg:         'sounds/background-music.mp3',
    winner:     'sounds/winner.mp3',
    butterfly0: 'sounds/butterfly1.mp3',
    butterfly1: 'sounds/butterfly2.mp3',
    butterfly2: 'sounds/butterfly3.mp3',
    pickup:     'sounds/pickup.mp3',
    swoosh:     'sounds/swoosh.ogg',
    redbutton:  'sounds/redbutton.mp3',   // v9: the red control's own sound
    voice:      'sounds/Voice.mp3'        // v9: the welcome, see welcome.js
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
      doAttachButterflyLoop(pending.butterflies[i].group, pending.butterflies[i].idx,
                            pending.butterflies[i].opts, pending.butterflies[i].handle);
    }
    pending.butterflies.length = 0;
    if (pending.winner) { doPlayWinner(); pending.winner = false; }
    if (pending.voice) { doPlayVoice(); pending.voice = false; }
    while (pending.pickup > 0) { doPlayPickup(); pending.pickup--; }
    while (pending.swoosh > 0) { doPlaySwoosh(); pending.swoosh--; }
    while (pending.redbutton > 0) { doPlayRedButton(); pending.redbutton--; }
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

  //  v7: `opts` overrides the falloff band and base volume for one loop.
  //  This is REQUIRED, not a nicety. The defaults below are tuned for the
  //  swarm's own 1.0-2.6 m orbit; a born butterfly circling at 3.2-4.5 m
  //  would land at essentially zero gain under them and simply never be
  //  heard. Omitting opts reproduces v3 exactly, so keyboard.js's three
  //  calls are untouched.
  //  `handle` is created by the caller BEFORE the clips have necessarily
  //  loaded, and filled in here. That indirection is what lets a born
  //  butterfly be spawned, and disposed again, during the window where
  //  audio is still decoding -- without it a butterfly evicted in that
  //  window would leave a loop that starts playing after its owner is
  //  already gone, with nothing left holding a reference to stop it.
  function doAttachButterflyLoop(group, idx, opts, handle) {
    if (handle && handle.cancelled) { return null; }
    var name = 'butterfly' + (idx % 3);
    if (!buffers[name]) { return null; }
    opts = opts || {};
    var a = new THREE.PositionalAudio(listener);
    a.setBuffer(buffers[name]);
    a.setLoop(true);
    a.setVolume(opts.volume !== undefined ? opts.volume : CFG.audioBflyVolume);
    a.setRefDistance(opts.refDistance !== undefined ? opts.refDistance : CFG.audioRefDistance);
    a.setMaxDistance(opts.maxDistance !== undefined ? opts.maxDistance : CFG.audioMaxDistance);
    a.setRolloffFactor(opts.rolloff !== undefined ? opts.rolloff : CFG.audioRolloff);
    a.setDistanceModel('linear');
    a.panner.panningModel = 'HRTF';    // binaural -- this is a headset piece
    group.add(a);
    a.play();

    // v3: each loop gets its OWN rate wander and volume wander, seeded to
    // different starting phases (loops.length, not idx -- idx is a key
    // index 0-25, loops.length is 0/1/2 in attach order) so three loops
    // attached in the same frame don't start in lockstep.
    var seed = loops.length;
    var rec = handle || {};
    rec.audio = a;
    //  v7: base volume is remembered per loop so updateLoops()'s wander
    //  multiplies the RIGHT anchor. Before this it always multiplied
    //  CFG.audioBflyVolume, which would have quietly dragged a born
    //  butterfly back down to the swarm's level on the very next frame.
    rec.base = opts.volume !== undefined ? opts.volume : CFG.audioBflyVolume;
    rec.rate = makeWander(CFG.audioBflyRateMin, CFG.audioBflyRateMax,
                          CFG.audioBflyModPeriodMin, CFG.audioBflyModPeriodMax,
                          CFG.audioBflyModTau, (seed % 3 + 0.5) / 3);
    rec.vol  = makeWander(CFG.audioBflyVolModMin, CFG.audioBflyVolModMax,
                          CFG.audioBflyModPeriodMin, CFG.audioBflyModPeriodMax,
                          CFG.audioBflyModTau, ((seed + 2) % 3) / 3);
                                                     // offset from rate's seed so the
                                                     // two don't peak together -- %3
                                                     // keeps the fraction inside
                                                     // [0, 1); a bare /3 let seed=2
                                                     // overflow to 1.33, seeding that
                                                     // loop's volume ABOVE
                                                     // audioBflyVolModMax.
                                                     // v7 adds the same %3 guard to
                                                     // `rate` above: loops.length is
                                                     // no longer bounded at 3 now that
                                                     // butterflies are born, so seed
                                                     // 3+ would have overflowed there
                                                     // too and seeded a born loop's
                                                     // playback rate past
                                                     // audioBflyRateMax.
    loops.push(rec);
    return rec;               // v7: the handle detachLoop() takes back
  }

  //  v7: stop a loop and let it go. v3 had no way to do this -- fine when
  //  the only three loops were attached once at startup and lived for the
  //  whole session, a genuine leak now that butterflies are born and
  //  recycled all session long. Without it both `loops` and the scene
  //  graph would grow without bound, and the audio would pile up into
  //  mush as every name a visitor ever typed kept buzzing.
  function detachLoop(rec) {
    if (!rec) { return; }
    var i = loops.indexOf(rec);
    if (i >= 0) { loops.splice(i, 1); }
    if (rec.audio) {
      if (rec.audio.isPlaying) { rec.audio.stop(); }
      if (rec.audio.parent) { rec.audio.parent.remove(rec.audio); }
      if (rec.audio.disconnect) { rec.audio.disconnect(); }
    }
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
      L.audio.setVolume(L.base * tickWander(L.vol, dt));
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

  //  v9: the red control. Same one-shot path as pickup/swoosh, but a much
  //  narrower random band -- see the note in config.js. A control surface
  //  whose pitch visibly wanders press to press reads as broken; a
  //  creature's does not.
  function doPlayRedButton() {
    playOneShot('redbutton', CFG.audioRedVolMin, CFG.audioRedVolMax,
                CFG.audioRedRateMin, CFG.audioRedRateMax);
  }

  //  v9: the welcome voice. A single reused node like `winner` rather than
  //  a fresh one per call like the one-shots -- there must only ever be ONE
  //  voice in the room. Two visitors swapping the headset quickly would
  //  otherwise talk over each other, which is exactly the failure the
  //  welcome debounce exists to prevent; stop-then-play makes it
  //  structurally impossible rather than merely unlikely.
  function doPlayVoice() {
    if (!voice) { return; }
    if (voice.isPlaying) { voice.stop(); }
    voice.play();
  }

  return {
    // called once, from index.html after the scene exists
    init: function (sceneEl) {
      attachListener(sceneEl, function () {
        bindGestureResume(sceneEl);
        loadAll(function () {
          bg = makeNonPositional('bg', CFG.audioBgVolume, true);
          winner = makeNonPositional('winner', CFG.audioWinnerVolume, false);
          voice = makeNonPositional('voice', CFG.audioVoiceVolume, false);
          bg.play();                    // scheduled now; audible once the
          ready = true;                  // context resumes on a gesture above
          flush();
          sceneEl.setAttribute('sfx-tick', '');   // v3: start the wander
        });
      });
    },

    //  Returns a HANDLE. Pass it to detachLoop() to stop the sound and let
    //  it go -- keyboard.js's three fixed swarm loops never do (they live
    //  for the whole session), but every born butterfly must, or a long
    //  exhibition ends up with every name anyone ever typed still buzzing.
    //  `opts` overrides {volume, refDistance, maxDistance, rolloff}; omit
    //  it and the falloff is v3's, unchanged.
    attachButterflyLoop: function (group, idx, opts) {
      var handle = { audio: null, base: 0, rate: null, vol: null, cancelled: false };
      if (!ready) {
        pending.butterflies.push({ group: group, idx: idx, opts: opts, handle: handle });
        return handle;
      }
      doAttachButterflyLoop(group, idx, opts, handle);
      return handle;
    },

    //  Safe to call on a handle whose clip never finished loading, and
    //  safe to call twice.
    detachLoop: function (handle) {
      if (!handle) { return; }
      handle.cancelled = true;      // in case it is still sitting in `pending`
      detachLoop(handle);
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

    // keyboard.js:activate() -- the red control was pressed
    playRedButton: function () {
      if (!ready) { pending.redbutton++; return; }
      doPlayRedButton();
    },

    //  welcome.js -- a new wearer. Queued as a BOOLEAN, not a counter, for
    //  the same reason it reuses one node: the greeting is not a thing that
    //  can happen twice over.
    playVoice: function () {
      if (!ready) { pending.voice = true; return; }
      doPlayVoice();
    },

    //  welcome.js needs to know when the voice actually ends -- on a slow
    //  connection the clip can still be decoding when the greeting fires,
    //  in which case the type would finish its 16.5 s crawl in silence.
    isVoicePlaying: function () { return !!(voice && voice.isPlaying); },

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
