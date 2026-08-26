// ============================================================
//  hands.js  --  usable data out of hand-tracking-controls
// ============================================================
//  A-Frame's hand-tracking-controls does two things that make it
//  awkward to build on, both visible in its tick():
//
//    this.el.object3D.position.set(0,0,0)
//    this.el.object3D.rotation.set(0,0,0)
//
//  The ENTITY IS PINNED TO THE ORIGIN every frame. Anything that reads
//  the entity's world position -- a repulsor, a landing anchor, a
//  raycaster -- gets (0,0,0) and silently does nothing. The real data
//  is in `jointPoses`, a Float32Array of one 4x4 matrix per joint, and
//  in `wristObject3D`, which the component parents to the scene.
//
//  (There is no `wristPosition` property, despite the obvious guess.)
//
//  So this component reads the joint matrices directly and publishes
//  what the rest of the scene actually needs:
//
//      rig.tracked      is the hand being seen right now
//      rig.point        an Object3D at the wrist, parented to the scene
//      rig.wrist        world position of the wrist
//      rig.indexTip     world position of the index fingertip
//      rig.openness     0 = fist, 1 = splayed palm
//      rig.pinch        thumb-to-index distance, metres
//      rig.ray(origin, direction)   a pointing ray from the index finger
//
//  It also hides the hand model. The rendered hand is not needed --
//  nothing in this piece looks at your hands -- and the mesh both
//  occludes the butterflies and flickers as tracking drops in and out.
//  Hiding the parent object3D is enough; the component keeps setting
//  its own child visibility every tick, so fighting it per-child would
//  be a losing battle.
// ============================================================

// WebXR hand joints are a fixed order; these are the ones we use.
// Confirmed against A-Frame's own detectPinch, which reads byte offset
// 64 for the thumb tip (joint 4) and 144 for the index tip (joint 9).
var HAND_JOINT = {
  wrist: 0, thumbTip: 4, indexTip: 9, middleTip: 14, ringTip: 19, pinkyTip: 24,
  indexKnuckle: 6
};

AFRAME.registerComponent('hand-rig', {
  schema: { hideModel: { default: true } },

  init: function () {
    this.tracked = false;
    this.poses = new Float32Array(25 * 16);   // our own copy of the joint matrices
    this.via = 'none';                        // which path supplied them
    this.wrist = new THREE.Vector3();
    this.indexTip = new THREE.Vector3();
    this.indexKnuckle = new THREE.Vector3();
    this.thumbTip = new THREE.Vector3();
    this.openness = 0;
    this.pinch = 0;
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._dir = new THREE.Vector3();

    // Something the rest of the scene can treat as "where the hand is".
    // Parented to the scene, not the entity, because the entity is pinned.
    this.point = new THREE.Object3D();
    this.el.sceneEl.object3D.add(this.point);
  },

  remove: function () {
    if (this.point.parent) { this.point.parent.remove(this.point); }
  },

  //  READ THE JOINTS OURSELVES.
  //
  //  Two reasons not to rely on hand-tracking-controls for this:
  //
  //  1. Its data only lands if ITS tracked-controls matched the input
  //     source. When that does not happen the component still looks
  //     healthy from outside while publishing nothing.
  //
  //  2. THE REFERENCE SPACE. The component calls requestReferenceSpace()
  //     itself and fills poses in THAT space. three.js renders the camera
  //     in renderer.xr.getReferenceSpace(), which is not necessarily the
  //     same one -- and any difference between them shows up as hands
  //     sitting at an offset from where you actually see your hands.
  //     Filling poses in the renderer's own space makes them agree by
  //     construction.
  readDirect: function () {
    var sceneEl = this.el.sceneEl;
    var frame = sceneEl.frame;
    var r = sceneEl.renderer;
    if (!frame || !frame.fillPoses || !r || !r.xr) { return false; }
    var session = r.xr.getSession && r.xr.getSession();
    var space = r.xr.getReferenceSpace && r.xr.getReferenceSpace();
    if (!session || !space || !session.inputSources) { return false; }

    var want = this.side();
    for (var i = 0; i < session.inputSources.length; i++) {
      var src = session.inputSources[i];
      if (!src.hand || src.handedness !== want) { continue; }
      try {
        if (frame.fillPoses(src.hand.values(), space, this.poses)) {
          this.via = 'direct';
          return true;
        }
      } catch (e) { /* fall through to the component */ }
    }
    return false;
  },

  //  Fallback: whatever hand-tracking-controls managed to collect.
  readFromComponent: function (c) {
    if (!c || !c.hasPoses || !c.jointPoses) { return false; }
    this.poses.set(c.jointPoses);
    this.via = 'component';
    return true;
  },

  side: function () {
    var c = this.el.components['hand-tracking-controls'];
    if (c && c.data && c.data.hand) { return c.data.hand; }
    return this.el.id === 'handL' ? 'left' : 'right';
  },

  jointPos: function (poses, index, out) {
    this._m.fromArray(poses, index * 16);
    return out.setFromMatrixPosition(this._m);
  },

  tick: function () {
    var c = this.el.components['hand-tracking-controls'];

    if (this.data.hideModel && c) {
      this.el.object3D.visible = false;
      // and each joint entity, in case the parent hide is ever defeated
      if (c.jointEls) {
        for (var k = 0; k < c.jointEls.length; k++) {
          if (c.jointEls[k].object3D) { c.jointEls[k].object3D.visible = false; }
        }
      }
      if (c.mesh) { c.mesh.visible = false; }
    }

    if (!this.readDirect() && !this.readFromComponent(c)) {
      this.tracked = false;
      this.via = 'none';
      this.point.visible = false;
      return;
    }
    var p = this.poses;
    this.tracked = true;
    this.point.visible = true;

    this.jointPos(p, HAND_JOINT.wrist, this.wrist);
    this.jointPos(p, HAND_JOINT.indexTip, this.indexTip);
    this.jointPos(p, HAND_JOINT.indexKnuckle, this.indexKnuckle);
    this.jointPos(p, HAND_JOINT.thumbTip, this.thumbTip);

    this.point.position.copy(this.wrist);
    this._m.fromArray(p, 0);
    this.point.quaternion.setFromRotationMatrix(this._m);

    this.pinch = this.thumbTip.distanceTo(this.indexTip);

    // openness: mean wrist-to-fingertip distance over the four fingers.
    // A closed fist sits near 0.075 m and a splayed palm near 0.16 m on
    // an adult hand; those are the ends of the mapping.
    var tips = [HAND_JOINT.indexTip, HAND_JOINT.middleTip,
                HAND_JOINT.ringTip, HAND_JOINT.pinkyTip];
    var sum = 0;
    for (var i = 0; i < tips.length; i++) {
      sum += this.jointPos(p, tips[i], this._v).distanceTo(this.wrist);
    }
    var mean = sum / tips.length;
    this.openness = Math.max(0, Math.min(1, (mean - 0.075) / (0.16 - 0.075)));
  },

  //  Raw state, for the on-headset readout. Hand tracking cannot be
  //  reproduced on a desktop, so the only way to see why it is not
  //  working is to put the actual chain of preconditions on screen:
  //
  //    comp     hand-tracking-controls attached
  //    tc       tracked-controls has matched an input source
  //    hand     that input source is an XRHand (not a controller)
  //    ref      the reference space resolved (set on enter-vr)
  //    poses    fillPoses succeeded this frame
  //
  //  Whichever is the first `no` is the thing that is broken.
  debug: function () {
    var c = this.el.components['hand-tracking-controls'];
    var tc = this.el.components['tracked-controls'];
    var ctrl = tc && tc.controller;
    var r = this.el.sceneEl.renderer;
    var xrSpace = r && r.xr && r.xr.getReferenceSpace && r.xr.getReferenceSpace();
    return {
      comp: !!c,
      tc: !!ctrl,
      hand: !!(ctrl && ctrl.hand),
      ref: !!xrSpace,                 // the RENDERER's space, the one that matters
      poses: this.via !== 'none',
      tracked: this.tracked,
      via: this.via,
      y: this.tracked ? this.wrist.y : null
    };
  },

  // a ray along the index finger, for pointing at things
  ray: function (origin, direction) {
    if (!this.tracked) { return false; }
    origin.copy(this.indexTip);
    direction.copy(this.indexTip).sub(this.indexKnuckle).normalize();
    return true;
  }
});

// convenience: the rig for a side, or null
function handRig(side) {
  var el = document.querySelector(side === 'left' ? '#handL' : '#handR');
  return el && el.components ? el.components['hand-rig'] || null : null;
}
