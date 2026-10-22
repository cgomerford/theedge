"""
retarget.py — put a real recorded baseball pitch (CMU Mocap, subject 124 "Baseball Pitch", trials 01 + 02) onto the
MPFB rig made by make_body.py, and save work/rigged.blend.

Run:  blender -b work/body.blend -P retarget.py

What it does (all numbers are logged with the prefix RETARGET:):
  1. ASF/AMC → BVH (amc2bvh.py) if the BVH files are missing, import them with Blender's built-in BVH importer.
  2. Pick the throwing hand (peak hand speed); mirror the action if the subject is left-handed.
  3. Candidate pitches: trial 01 has one, trial 02 has two → each is scored for foot slide and arm-path cleanliness.
  4. Retarget with a REST-POSE-OFFSET retarget (the maths behind Copy Rotation + T-pose alignment, done directly so the foot lock,
     filtering and baking can all run on the numbers): per bone  R_target(f) = [R_src(f) · R_src_rest⁻¹] · A · R_target_rest,
     where A is the world rotation that lines the target's rest bone up with the source's rest bone (both rigs "in the same T-pose").
     Root location = scaled source root displacement ("Copy Location" on the hips).
  5. Foot lock: contact intervals (foot speed ≈ 0) are pinned with two-bone leg IK so planted feet do not slide.
  6. Light Gaussian smoothing of the rotation curves (not the throwing arm within ±3 frames of release).
  7. Find the release frame automatically, trim set → follow-through, resample to 30 fps, bake into actions
     "delivery", "set" and "idle_ready", and write { releaseFrame, fps, stretchFrame } as custom properties for the glTF extras.
"""
import bpy, math, os, sys, json
import mathutils
from mathutils import Matrix, Vector, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
sys.path.insert(0, HERE)
WORK = os.path.join(HERE, 'work')
DL = os.path.join(HERE, 'downloads')
OUT = os.path.join(WORK, 'rigged.blend')
FPS_OUT = 30
SRC_FPS = 120
TARGET_HEIGHT_M = 6 * 0.3048 + 2 * 0.0254
MIRROR = os.environ.get('PITCHER_FORCE_MIRROR') == '1'   # smoke-test switch for the left-hander path
ONLY_TRIAL = os.environ.get('PITCHER_TRIAL')              # e.g. "124_01" to skip scoring

# CMU bone → Mixamo bone (the brief's map). Mixamo 'Hips' takes the CMU root; CMU lowerneck → Neck, head → Head.
CMU_TO_MIXAMO = {
    'root': 'Hips', 'lowerback': 'Spine', 'upperback': 'Spine1', 'thorax': 'Spine2', 'lowerneck': 'Neck', 'head': 'Head',
    'rclavicle': 'RightShoulder', 'rhumerus': 'RightArm', 'rradius': 'RightForeArm', 'rhand': 'RightHand',
    'lclavicle': 'LeftShoulder', 'lhumerus': 'LeftArm', 'lradius': 'LeftForeArm', 'lhand': 'LeftHand',
    'rfemur': 'RightUpLeg', 'rtibia': 'RightLeg', 'rfoot': 'RightFoot', 'rtoes': 'RightToeBase',
    'lfemur': 'LeftUpLeg', 'ltibia': 'LeftLeg', 'lfoot': 'LeftFoot', 'ltoes': 'LeftToeBase',
}
PREFIX = 'mixamorig:'
PARENT = {'Hips': None, 'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', 'Neck': 'Spine2', 'Head': 'Neck',
          'RightShoulder': 'Spine2', 'RightArm': 'RightShoulder', 'RightForeArm': 'RightArm', 'RightHand': 'RightForeArm',
          'LeftShoulder': 'Spine2', 'LeftArm': 'LeftShoulder', 'LeftForeArm': 'LeftArm', 'LeftHand': 'LeftForeArm',
          'RightUpLeg': 'Hips', 'RightLeg': 'RightUpLeg', 'RightFoot': 'RightLeg', 'RightToeBase': 'RightFoot',
          'LeftUpLeg': 'Hips', 'LeftLeg': 'LeftUpLeg', 'LeftFoot': 'LeftLeg', 'LeftToeBase': 'LeftFoot'}
ORDER = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
         'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
         'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase']
SWAP = lambda n: ('l' + n[1:]) if n.startswith('r') and n != 'root' and n[1:] in ('clavicle','humerus','radius','hand','femur','tibia','foot','toes') else (('r' + n[1:]) if n.startswith('l') and n[1:] in ('clavicle','humerus','radius','hand','femur','tibia','foot','toes') else n)


def log(*a):
    print('RETARGET:', *a, flush=True)


# ----------------------------------------------------------------------------- source (CMU) import
def ensure_bvh(trial):
    path = os.path.join(WORK, '%s.bvh' % trial)
    if not os.path.isfile(path):
        import amc2bvh
        amc2bvh.convert(os.path.join(DL, '124.asf'), os.path.join(DL, trial + '.amc'), path)
    return path


def import_source(trial):
    before = set(bpy.data.objects)
    bpy.ops.import_anim.bvh(filepath=ensure_bvh(trial), axis_forward='-Z', axis_up='Y', global_scale=1.0,
                            rotate_mode='QUATERNION', update_scene_fps=False, update_scene_duration=False)
    arm = [o for o in bpy.data.objects if o not in before and o.type == 'ARMATURE'][0]
    return arm


def sample_source(arm, mirror=False):
    """per-frame armature-space world rotation (3x3) and head position of every CMU bone, plus rest data."""
    sc = bpy.context.scene
    act = arm.animation_data.action
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    names = [b.name for b in arm.data.bones]
    rest_rot = {n: arm.data.bones[n].matrix_local.to_3x3().copy() for n in names}
    rest_head = {n: arm.data.bones[n].head_local.copy() for n in names}
    rest_tail = {n: arm.data.bones[n].tail_local.copy() for n in names}
    rot = {n: [] for n in names}
    pos = {n: [] for n in names}
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        for n in names:
            pb = arm.pose.bones[n]
            rot[n].append(pb.matrix.to_3x3().copy())
            pos[n].append(pb.head.copy())
    return {'frames': f1 - f0 + 1, 'rot': rot, 'pos': pos, 'rest_rot': rest_rot, 'rest_head': rest_head, 'rest_tail': rest_tail}


def mirror_source(src):
    """reflect the whole motion across the body's left-right plane and swap l/r bones (left-hander → right-hander)."""
    lat = (src['rest_head']['lfemur'] - src['rest_head']['rfemur'])
    lat.normalize()
    M = Matrix.Identity(3) - 2.0 * Matrix(((lat.x * lat.x, lat.x * lat.y, lat.x * lat.z), (lat.y * lat.x, lat.y * lat.y, lat.y * lat.z), (lat.z * lat.x, lat.z * lat.y, lat.z * lat.z)))
    out = {'frames': src['frames'], 'rot': {}, 'pos': {}, 'rest_rot': {}, 'rest_head': {}, 'rest_tail': {}}
    for n in src['rot']:
        s = SWAP(n)
        out['rot'][n] = [M @ r @ M for r in src['rot'][s]]
        out['pos'][n] = [M @ p for p in src['pos'][s]]
        out['rest_rot'][n] = M @ src['rest_rot'][s] @ M
        out['rest_head'][n] = M @ src['rest_head'][s]
        out['rest_tail'][n] = M @ src['rest_tail'][s]
    return out


# ----------------------------------------------------------------------------- kinematics helpers
def gauss_kernel(sigma):
    r = max(1, int(3 * sigma))
    k = [math.exp(-0.5 * (i / sigma) ** 2) for i in range(-r, r + 1)]
    s = sum(k)
    return [x / s for x in k], r


def smooth_series(vals, sigma):
    k, r = gauss_kernel(sigma)
    n = len(vals)
    out = []
    for i in range(n):
        acc = vals[i] * 0
        for j, w in enumerate(k):
            idx = min(n - 1, max(0, i + j - r))
            acc = acc + vals[idx] * w
        out.append(acc)
    return out


def smooth_quats(qs, sigma):
    """Gaussian smoothing of a quaternion series (sign-continuous, renormalised)."""
    fixed = [qs[0].copy()]
    for q in qs[1:]:
        q = q.copy()
        if fixed[-1].dot(q) < 0:
            q.negate()
        fixed.append(q)
    k, r = gauss_kernel(sigma)
    n = len(fixed)
    out = []
    for i in range(n):
        w = x = y = z = 0.0
        for j, wt in enumerate(k):
            q = fixed[min(n - 1, max(0, i + j - r))]
            w += q.w * wt; x += q.x * wt; y += q.y * wt; z += q.z * wt
        out.append(Quaternion((w, x, y, z)).normalized())
    return out


def speeds(seq, fps):
    return [(seq[i + 1] - seq[i]).length * fps for i in range(len(seq) - 1)] + [0.0]


# ----------------------------------------------------------------------------- target (MPFB) data
def target_data(rig):
    bones = rig.data.bones
    d = {}
    for n in ORDER:
        b = bones[PREFIX + n]
        d[n] = {'rest': b.matrix_local.copy(), 'rest_rot': b.matrix_local.to_3x3().copy(), 'head': b.head_local.copy(),
                'tail': b.tail_local.copy(), 'length': b.length}
    return d


def retarget_rotations(src, tgt, f0, f1):
    """world rotation (3x3) of every Mixamo bone for source frames f0..f1 (inclusive)."""
    # alignment A per bone: shortest-arc rotation taking the target's rest bone direction onto the source's rest bone direction
    A = {}
    for cmu, mx in CMU_TO_MIXAMO.items():
        if cmu == 'root':
            # hips: align the up axis (hips→spine) and the left-right axis (L hip → R hip)
            su = (src['rest_tail']['lowerback'] - src['rest_head']['root']).normalized()   # lowerback STARTS at the root, so use its end point
            sl = (src['rest_head']['lfemur'] - src['rest_head']['rfemur']).normalized()
            tu = (tgt['Spine']['tail'] - tgt['Hips']['head']).normalized()
            tl = (tgt['LeftUpLeg']['head'] - tgt['RightUpLeg']['head']).normalized()
            def basis(u, l):
                x = l.cross(u).normalized(); l2 = u.cross(x).normalized()
                return Matrix((x, l2, u)).transposed()
            A[mx] = basis(su, sl) @ basis(tu, tl).inverted()
            continue
        ds = (src['rest_tail'][cmu] - src['rest_head'][cmu]).normalized()
        dt = (tgt[mx]['tail'] - tgt[mx]['head']).normalized()
        A[mx] = dt.rotation_difference(ds).to_matrix()
    # target rest world rotation after alignment (= the pose "T" both rigs are put in)
    R_al = {mx: A[mx] @ tgt[mx]['rest_rot'] for mx in A}
    out = {mx: [] for mx in A}
    for f in range(f0, f1 + 1):
        for cmu, mx in CMU_TO_MIXAMO.items():
            D = src['rot'][cmu][f] @ src['rest_rot'][cmu].inverted()
            out[mx].append(D @ R_al[mx])
    return out, A


def hips_path(src, tgt, f0, f1, scale):
    h0 = src['rest_head']['root']
    return [tgt['Hips']['head'] + (src['pos']['root'][f] - h0) * scale for f in range(f0, f1 + 1)]


def fk_positions(tgt, Rw, hips_pos, i):
    """joint head positions at frame index i from world rotations (pose delta P = R_world · R_rest⁻¹ applied to rest offsets)."""
    P = {}
    for n in ORDER:
        P[n] = Rw[n][i] @ tgt[n]['rest_rot'].inverted()
    heads = {'Hips': hips_pos[i]}
    for n in ORDER[1:]:
        p = PARENT[n]
        heads[n] = heads[p] + P[p] @ (tgt[n]['head'] - tgt[p]['head'])
    return heads, P


def solve_leg(heads, P, tgt, side, target_ankle, lerp=1.0):
    """two-bone IK for one leg: returns new world rotations for UpLeg and Leg, keeping the knee plane."""
    up, leg, foot = side + 'UpLeg', side + 'Leg', side + 'Foot'
    hip = heads[up]
    knee = heads[leg]
    ankle = heads[foot]
    l1 = (tgt[leg]['head'] - tgt[up]['head']).length
    l2 = (tgt[foot]['head'] - tgt[leg]['head']).length
    tvec = (target_ankle - hip)
    dist = min(max(tvec.length, abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4)
    axis = tvec.normalized()
    pole = knee - hip
    pole = (pole - axis * pole.dot(axis))
    pole = pole.normalized() if pole.length > 1e-6 else Vector((0, -1, 0))
    a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, l1 * l1 - a * a))
    knee_new = hip + axis * a + pole * h
    ankle_new = hip + axis * dist
    return knee_new, ankle_new


def pin_feet(tgt, Rw, hips_pos, n_frames, fps, ankle_rest_z):
    """find foot contacts (low speed) and pin the ankles there with two-bone IK; returns (new Rw, report)."""
    report = {}
    # pass 1: FK ankle positions
    ankle = {s: [] for s in ('Left', 'Right')}
    for i in range(n_frames):
        heads, _ = fk_positions(tgt, Rw, hips_pos, i)
        for s in ankle:
            ankle[s].append(heads[s + 'Foot'].copy())
    # ground: stance ankles (slow, low) define where the floor is
    lows = sorted(a.z for s in ankle for a in ankle[s])
    floor = lows[int(0.03 * len(lows))]
    shift = ankle_rest_z - floor
    for i in range(n_frames):
        hips_pos[i] = hips_pos[i] + Vector((0, 0, shift))
    for s in ankle:
        ankle[s] = [a + Vector((0, 0, shift)) for a in ankle[s]]
    report['ground_shift_m'] = round(shift, 4)
    locks = {}
    for s in ankle:
        # on the ground = ankle within ~5 cm of its standing height (speed is deliberately NOT part of the test: a real front foot
        # keeps sliding for ~0.3 s after landing, and that slide is exactly what must be removed)
        low, on = [], False                                               # hysteresis: touch down < 5 cm, stay planted until > 9 cm
        for i in range(n_frames):
            z = ankle[s][i].z - ankle_rest_z
            on = (z < 0.09) if on else (z < 0.05)
            low.append(on)
        intervals, i = [], 0
        while i < n_frames:
            if low[i]:
                j = i
                while j + 1 < n_frames and low[j + 1]:
                    j += 1
                if j - i >= int(0.12 * fps):            # contact must last > ~0.12 s
                    intervals.append((i, j))
                i = j + 1
            else:
                i += 1
        locks[s] = intervals
    report['contacts'] = {s: locks[s] for s in locks}
    new_ank = {s: list(ankle[s]) for s in ankle}
    for s, ivs in locks.items():
        for (a, b) in ivs:
            k0 = min(b, a + 4)                                         # anchor = the position once the foot has settled
            anchor = sum((ankle[s][k] for k in range(k0, min(b, k0 + 3) + 1)), Vector()) / (min(b, k0 + 3) - k0 + 1)
            anchor = Vector((anchor.x, anchor.y, ankle_rest_z))
            for k in range(a, b + 1):
                new_ank[s][k] = anchor
    # blend in/out of locks over ~4 frames so the IK does not pop
    blends = {}
    for s in new_ank:
        blend = [0.0] * n_frames
        for (a, b) in locks[s]:
            for k in range(max(0, a - 4), min(n_frames, b + 5)):
                dist = min(abs(k - a), abs(k - b)) if (k < a or k > b) else 0
                blend[k] = max(blend[k], 1.0 - dist / 5.0 if (k < a or k > b) else 1.0)
        blends[s] = blend
        for k in range(n_frames):
            if blend[k] > 0:
                new_ank[s][k] = ankle[s][k].lerp(new_ank[s][k], blend[k]) if blend[k] < 1 else new_ank[s][k]
    # keep every pinned ankle within the leg's reach by nudging the pelvis toward it (the root path is free; feet are not)
    l1 = (tgt['LeftLeg']['head'] - tgt['LeftUpLeg']['head']).length
    l2 = (tgt['LeftFoot']['head'] - tgt['LeftLeg']['head']).length
    nudged = 0.0
    for i in range(n_frames):
        for _ in range(4):
            heads, _P = fk_positions(tgt, Rw, hips_pos, i)
            moved = False
            for s in new_ank:
                w = blends[s][i]
                if w <= 0:
                    continue
                tvec = new_ank[s][i] - heads[s + 'UpLeg']
                reach = l1 + l2 - 0.004
                if tvec.length > reach:
                    hips_pos[i] = hips_pos[i] + tvec.normalized() * (tvec.length - reach) * min(1.0, w)
                    nudged = max(nudged, (tvec.length - reach))
                    moved = True
            if not moved:
                break
    report['max_pelvis_nudge_m'] = round(nudged, 4)
    # apply IK to the world rotations of UpLeg / Leg
    for i in range(n_frames):
        heads, P = fk_positions(tgt, Rw, hips_pos, i)
        for s in ('Left', 'Right'):
            if (new_ank[s][i] - heads[s + 'Foot']).length < 1e-5:
                continue
            up, leg, foot = s + 'UpLeg', s + 'Leg', s + 'Foot'
            knee_new, ankle_new = solve_leg(heads, P, tgt, s, new_ank[s][i])
            hip = heads[up]
            cur_thigh = (heads[leg] - hip).normalized()
            new_thigh = (knee_new - hip).normalized()
            d1 = cur_thigh.rotation_difference(new_thigh).to_matrix()
            Rw[up][i] = d1 @ Rw[up][i]
            cur_shin = (heads[foot] - heads[leg]).normalized()
            new_shin = (ankle_new - knee_new).normalized()
            d2 = cur_shin.rotation_difference(new_shin).to_matrix()
            Rw[leg][i] = d2 @ Rw[leg][i]
            # foot keeps its world orientation (so the planted foot stays flat); basis is recomputed from world rotations later
    return report


# ----------------------------------------------------------------------------- analysis: release frame & scoring
def find_release(src, f0, f1, fps, throwing):
    """peak forward speed of the throwing hand, nudged to the first frame the hand is in front of the front foot."""
    hand = src['pos'][throwing][f0:f1 + 1]
    front = 'lfoot' if throwing == 'rhand' else 'rfoot'
    foot = src['pos'][front][f0:f1 + 1]
    hips = src['pos']['root'][f0:f1 + 1]
    # forward direction: horizontal displacement of the hips from the start of the motion to the point of peak hand speed
    sp = speeds(smooth_series(hand, 2.0), fps)
    pk = sp.index(max(sp))
    d = Vector((hips[pk].x - hips[0].x, hips[pk].y - hips[0].y, 0))
    if d.length < 0.05:
        d = Vector((hand[pk].x - hand[0].x, hand[pk].y - hand[0].y, 0))
    F = d.normalized()
    fwd_speed = [(smooth_series(hand, 2.0)[i + 1] - smooth_series(hand, 2.0)[i]).dot(F) * fps for i in range(len(hand) - 1)] + [0.0]
    peak = fwd_speed.index(max(fwd_speed))
    fwd_hand = [h.dot(F) for h in hand]
    fwd_foot = [p.dot(F) for p in foot]
    rel = peak
    if fwd_hand[rel] < fwd_foot[rel]:
        while rel < len(hand) - 1 and fwd_hand[rel] < fwd_foot[rel]:
            rel += 1
    return f0 + rel, f0 + peak, F, max(fwd_speed)


def window_for(src, throwing, fps):
    hand = src['pos'][throwing]
    sp = speeds(smooth_series(hand, 2.0), fps)
    return sp


# ----------------------------------------------------------------------------- main
def main():
    sc = bpy.context.scene
    rig = bpy.data.objects['PitcherRig']
    tgt = target_data(rig)
    ankle_rest_z = tgt['LeftFoot']['head'].z
    results = []
    cands = {}
    trials = [ONLY_TRIAL] if ONLY_TRIAL else ['124_01', '124_02']
    for trial in trials:
        arm = import_source(trial)
        src = sample_source(arm)
        bpy.data.objects.remove(arm, do_unlink=True)
        rh = max(speeds(src['pos']['rhand'], SRC_FPS)); lh = max(speeds(src['pos']['lhand'], SRC_FPS))
        throwing = 'rhand' if rh >= lh else 'lhand'
        left = throwing == 'lhand'
        log('%s: %d frames, right hand peak %.2f m/s, left hand peak %.2f m/s → %s-handed' % (trial, src['frames'], rh, lh, 'left' if left else 'right'))
        if left or MIRROR:
            log('%s: mirroring the action so the pitcher is right-handed' % trial)
            src = mirror_source(src)
            throwing = 'rhand'
        # find pitches: speed peaks of the throwing hand separated by > 2 s
        hand_sp = speeds(smooth_series(src['pos']['rhand'], 2.0), SRC_FPS)
        peaks, last = [], -10 ** 9
        for i in sorted(range(len(hand_sp)), key=lambda k: -hand_sp[k]):
            if hand_sp[i] < 0.6 * max(hand_sp):
                break
            if all(abs(i - p) > 2 * SRC_FPS for p in peaks):
                peaks.append(i)
        peaks.sort()
        for pi, pk in enumerate(peaks):
            cands['%s#%d' % (trial, pi + 1)] = (trial, src, pk)
        log('%s: %d pitch(es) found at frames %s' % (trial, len(peaks), peaks))
    # --- build, score, choose ---
    best, scores = None, {}
    for key, (trial, src, pk) in cands.items():
        built = build_candidate(src, tgt, pk, ankle_rest_z)
        scores[key] = {k: v for k, v in built['score'].items()}
        log('%s: foot slide after strike %.2f in, largest bone step %.1f°/frame (%s), duration %.2f s, release at +%.2f s' % (
            key, built['score']['foot_slide_in'], built['score']['arm_jerk_deg'], built['score']['worst_bone'], built['score']['duration_s'], built['score']['release_s']))
        built['key'] = key
        # lower is better: slide dominates, then arm jerk
        cost = built['score']['foot_slide_in'] * 10 + built['score']['arm_jerk_deg']
        built['cost'] = cost
        if best is None or cost < best['cost']:
            best = built
    log('CHOSEN:', best['key'], json.dumps(scores))
    bake(rig, tgt, best)
    json.dump({'chosen': best['key'], 'scores': scores, 'release_frame_30fps': best['rel30'], 'frames_30fps': best['n30'],
               'fps': FPS_OUT, 'stretch_frame': best['stretch30'], 'forward_xy': [round(best['F'].x, 5), round(best['F'].y, 5)], 'foot_strike_frame': best['strike30'], 'contacts': best['report']['contacts']},
              open(os.path.join(WORK, 'retarget_report.json'), 'w'), indent=1)
    bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
    log('saved', OUT)


def build_candidate(src, tgt, peak_center, ankle_rest_z):
    n_src = src['frames']
    # trim window around the pitch: start ~2.4 s before the peak hand speed, end ~1.6 s after (clipped to the take)
    f0 = max(0, peak_center - int(2.4 * SRC_FPS))
    f1 = min(n_src - 1, peak_center + int(1.6 * SRC_FPS))
    rel, pk, F, vmax = find_release(src, f0, f1, SRC_FPS, 'rhand')
    # scale: target hip height over the ankles vs the source's
    src_leg = (src['rest_head']['root'] - src['rest_head']['rfoot']).length
    tgt_leg = (tgt['Hips']['head'] - tgt['RightFoot']['head']).length
    scale = tgt_leg / src_leg
    # trim start: first frame the body starts to move (pelvis or hands), minus a short lead-in
    Rw, A = retarget_rotations(src, tgt, f0, f1)
    hips = hips_path(src, tgt, f0, f1, scale)
    n = f1 - f0 + 1
    # light smoothing of rotations (not the throwing arm within ±3 output frames of release), σ≈2 source frames
    arm = {'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'}
    rel_i = rel - f0
    guard = 3 * (SRC_FPS // FPS_OUT)
    for mx in ORDER:
        qs = [Rw[mx][i].to_quaternion() for i in range(n)]
        sm = smooth_quats(qs, 2.0)
        for i in range(n):
            if mx in arm and abs(i - rel_i) <= guard:
                continue
            Rw[mx][i] = sm[i].to_matrix()
    hips = smooth_series(hips, 2.0)
    report = pin_feet(tgt, Rw, hips, n, SRC_FPS, ankle_rest_z)
    # trim: start at the first moment of real movement; end when the arm has come to rest after release
    hand_pos = [fk_positions(tgt, Rw, hips, i)[0]['RightHand'] for i in range(n)]
    hsp = speeds(smooth_series(hand_pos, 3.0), SRC_FPS)
    start = 0
    for i in range(n):
        if hsp[i] > 0.6:
            start = max(0, i - int(0.35 * SRC_FPS))
            break
    start = start - ((rel_i - start) % (SRC_FPS // FPS_OUT))            # keep release exactly on a 30 fps frame
    start = max(0, start)
    end = n - 1
    for i in range(rel_i + int(0.5 * SRC_FPS), n):
        if hsp[i] < 1.2 and (i - rel_i) % (SRC_FPS // FPS_OUT) == 0:
            end = i
            break
    step = SRC_FPS // FPS_OUT
    idx = list(range(start, end + 1, step))
    # local basis (quaternion) per bone, per output frame
    rest = {mx: tgt[mx]['rest_rot'] for mx in ORDER}
    basis, loc = {mx: [] for mx in ORDER}, []
    for i in idx:
        for mx in ORDER:
            p = PARENT[mx]
            if p is None:
                b = rest[mx].inverted() @ Rw[mx][i]
            else:
                # world_b = world_p · (rest_pᵀ · rest_b) · basis_b with world_* = pose-delta · rest  → basis_b = rest_b⁻¹ · pose_delta_p⁻¹ · world_b ... (rotation parts)
                Pp = Rw[p][i] @ rest[p].inverted()
                b = rest[mx].inverted() @ Pp.inverted() @ Rw[mx][i]
            basis[mx].append(b.to_quaternion())
        loc.append(rest['Hips'].inverted() @ (hips[i] - tgt['Hips']['head']))
    # sign continuity so the action has no 360° flips
    for mx in ORDER:
        for k in range(1, len(basis[mx])):
            if basis[mx][k - 1].dot(basis[mx][k]) < 0:
                basis[mx][k].negate()
    # ---- scores ----
    # foot slide: the SAME algorithm as verify_motion.py, on the final forward kinematics at the output frames
    # (front foot = left for a right-hander; from touchdown + 2 frames until the foot rises > 8 cm above the floor)
    lf = [fk_positions(tgt, Rw, hips, i)[0]['LeftFoot'] for i in idx]
    floor = min(p.z for p in lf)
    lift_i = max(range(len(lf)), key=lambda i: lf[i].z)
    cont = [i for i in range(lift_i, len(lf)) if lf[i].z < floor + 0.04]
    slide = 0.0
    post = [(a, b) for (a, b) in report['contacts']['Left'] if b > rel_i - int(0.4 * SRC_FPS)]
    if cont:
        s0 = cont[0]
        anchor = lf[min(len(lf) - 1, s0 + 2)]
        e0 = next((i for i in range(s0 + 2, len(lf)) if lf[i].z > floor + 0.08), len(lf) - 1)
        slide = max(math.hypot(lf[i].x - anchor.x, lf[i].y - anchor.y) for i in range(s0 + 2, e0 + 1)) / 0.0254
    jerk, worst_bone = 0.0, ''                                   # largest frame-to-frame rotation of ANY bone (the acceptance rule: < 90°)
    for k in range(1, len(idx)):
        for mx in ORDER:
            a, b = basis[mx][k - 1], basis[mx][k]
            ang = math.degrees(2 * math.acos(min(1.0, abs(a.dot(b)))))
            if ang > jerk:
                jerk, worst_bone = ang, mx
    rel30 = (rel_i - start) // step
    strike_src = post[0][0] if post else None
    strike30 = None if strike_src is None else max(0, (strike_src - start) // step)
    # stretch frame: the frame the stride foot is highest (peak leg lift) — the brief's "stretchFrame"
    lift = [fk_positions(tgt, Rw, hips, i)[0]['LeftFoot'].z for i in idx]
    stretch30 = lift.index(max(lift[:rel30 + 1])) if rel30 > 0 else 0
    return {'idx': idx, 'basis': basis, 'loc': loc, 'rel30': rel30, 'n30': len(idx), 'stretch30': stretch30, 'report': report,
            'F': F, 'strike30': strike30, 'score': {'foot_slide_in': slide, 'arm_jerk_deg': jerk, 'worst_bone': worst_bone, 'duration_s': (len(idx) - 1) / FPS_OUT, 'release_s': rel30 / FPS_OUT}}


def bake(rig, tgt, b):
    """write actions delivery / set / idle_ready on the PitcherRig."""
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    rig.animation_data_create()
    sc = bpy.context.scene
    sc.render.fps = FPS_OUT
    n = b['n30']

    def pose_frame(k, frame, which):
        for mx in ORDER:
            pb = rig.pose.bones[PREFIX + mx]
            pb.rotation_quaternion = b['basis'][mx][k]
            pb.keyframe_insert('rotation_quaternion', frame=frame)
        hp = rig.pose.bones[PREFIX + 'Hips']
        hp.location = b['loc'][k]
        hp.keyframe_insert('location', frame=frame)

    def new_action(name):
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        rig.animation_data.action = act
        return act

    act = new_action('delivery')
    for k in range(n):
        pose_frame(k, k + 1, 'delivery')
    act_set = new_action('set')
    pose_frame(0, 1, 'set')
    act_idle = new_action('idle_ready')
    hold = FPS_OUT
    for f in range(hold):
        pose_frame(n - 1, f + 1, 'idle_ready')
    rig.animation_data.action = act
    sc.frame_start, sc.frame_end = 1, n
    # glTF extras (custom properties on the armature object are exported as node extras)
    rig['releaseFrame'] = int(b['rel30'])
    rig['fps'] = FPS_OUT
    rig['stretchFrame'] = int(b['stretch30'])
    rig['source'] = 'CMU Graphics Lab Motion Capture Database, subject 124 (Baseball Pitch), %s' % b['key']
    log('baked: delivery %d frames (%.2f s), releaseFrame %d (0-based), stretchFrame %d' % (n, n / FPS_OUT, b['rel30'], b['stretch30']))


main()
