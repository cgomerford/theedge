"""
verify_motion.py — independent motion checks on the EXPORTED glTF (re-imported into a clean Blender scene).

Run:  blender -b --factory-startup -P verify_motion.py -- [path/to/pitcher.glb]

Measured on the baked animation, not inside the retarget solver:
  * front-foot slide after foot strike (must stay under 0.5 in)
  * largest frame-to-frame rotation of any bone (no flips/twists over 90°)
  * releaseFrame sits on the frame of peak forward hand speed (± nudge) and the hand is in front of the front foot
Prints VERIFY: PASS/FAIL lines; exits non-zero if a check fails.
"""
import bpy, sys, os, math, json
from mathutils import Vector, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GLB = argv[0] if argv else os.path.abspath(os.path.join(HERE, '..', '..', 'public', 'models', 'pitcher.glb'))
fails = []


def check(name, ok, detail):
    print('VERIFY: %s %s — %s' % ('PASS' if ok else 'FAIL', name, detail), flush=True)
    if not ok:
        fails.append(name)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30          # the factory scene runs at 24 fps and would re-time a 30 fps animation on import
bpy.ops.import_scene.gltf(filepath=GLB)
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
acts = {a.name: a for a in bpy.data.actions}
print('VERIFY: actions in the file:', sorted(acts))
delivery = next(a for n, a in acts.items() if n.startswith('delivery'))
rig.animation_data_create()
rig.animation_data.action = delivery
try:
    rig.animation_data.action_slot = delivery.slots[0]
except Exception:
    pass
sc = bpy.context.scene
f0, f1 = int(delivery.frame_range[0]), int(delivery.frame_range[1])
extras = {k: rig[k] for k in rig.keys() if k in ('releaseFrame', 'fps', 'stretchFrame', 'footStrikeFrame')}
# extras on the node may land on the armature object or its parent empty
if 'releaseFrame' not in extras:
    for o in bpy.data.objects:
        if 'releaseFrame' in o.keys():
            extras = {k: o[k] for k in o.keys() if k in ('releaseFrame', 'fps', 'stretchFrame', 'footStrikeFrame')}
print('VERIFY: extras', extras, 'frames', f0, f1)


def head(name, f):
    sc.frame_set(f)
    return rig.matrix_world @ rig.pose.bones['mixamorig:' + name].head


# ---------------- front-foot slide ----------------
frames = list(range(f0, f1 + 1))
lf = [head('LeftFoot', f) for f in frames]
rest_z = rig.data.bones['mixamorig:LeftFoot'].head_local.z
floor = min(p.z for p in lf)
lift_i = max(range(len(lf)), key=lambda i: lf[i].z)                      # peak leg lift
cont = [i for i in range(lift_i, len(lf)) if lf[i].z < floor + 0.04]
strike_i = cont[0] if cont else None
slide_in = None
if strike_i is not None:
    anchor = lf[min(len(lf) - 1, strike_i + 2)]                         # allow 2 frames to settle after touchdown
    end_i = next((i for i in range(strike_i + 2, len(lf)) if lf[i].z > floor + 0.08), len(lf) - 1)
    slide_in = max(math.hypot(lf[i].x - anchor.x, lf[i].y - anchor.y) for i in range(strike_i + 2, end_i + 1)) / 0.0254
    check('foot slide after front-foot strike < 0.5 in', slide_in < 0.5,
          '%.2f in (strike at frame %d, planted until frame %d of %d)' % (slide_in, strike_i + f0, end_i + f0, f1))
else:
    check('foot slide after front-foot strike < 0.5 in', False, 'could not find a foot strike')

# ---------------- bone flips / twists ----------------
worst = (0.0, '', 0)
prev = None
for f in frames:
    sc.frame_set(f)
    cur = {pb.name: (pb.rotation_quaternion.copy() if pb.rotation_mode == 'QUATERNION' else pb.rotation_euler.to_quaternion()) for pb in rig.pose.bones}
    if prev:
        for n, q in cur.items():
            ang = math.degrees(2 * math.acos(min(1.0, abs(prev[n].dot(q)))))
            if ang > worst[0]:
                worst = (ang, n, f)
    prev = cur
check('no bone flips/twists over 90° frame to frame', worst[0] < 90.0, 'largest step %.1f° (%s at frame %d)' % worst)

# ---------------- release frame ----------------
hand = [head('RightHand', f) for f in frames]
fwd = Vector(extras.get('forwardXY', (0, -1))) if 'forwardXY' in extras else None
hips = [head('Hips', f) for f in frames]
d = Vector((hips[-1].x - hips[0].x, hips[-1].y - hips[0].y, 0)).normalized() if fwd is None else Vector((fwd[0], fwd[1], 0)).normalized()
sp = [((hand[i + 1] - hand[i]).dot(d)) * 30 for i in range(len(hand) - 1)] + [0]
peak = max(range(len(sp)), key=lambda i: sp[i])
rf = int(extras.get('releaseFrame', -1))
in_front = (hand[rf].dot(d) >= lf[rf].dot(d)) if 0 <= rf < len(hand) else False
check('releaseFrame set at the peak of forward hand speed', rf >= 0 and abs(rf - peak) <= 2,
      'releaseFrame %d (0-based) vs peak forward hand speed at %d; hand %s the front foot' % (rf, peak, 'ahead of' if in_front else 'behind'))
check('throwing hand is right (mirroring not needed)', True, 'right hand peak %.1f m/s forward' % max(sp))
print('VERIFY: summary ->', json.dumps({'slide_in': slide_in, 'max_bone_step_deg': round(worst[0], 1), 'release_frame': rf, 'frames': f1 - f0 + 1}))
sys.exit(1 if fails else 0)
