"""
make_body.py — build the faceless pitcher body with MPFB (MakeHuman's Blender add-on) and save work/body.blend.

Run:  blender -b -P make_body.py            (MPFB must be installed + enabled: see README.md / build.sh)

Every MPFB call below was read from the installed extension's own source
(~/Library/Application Support/Blender/<ver>/extensions/user_default/mpfb/services/*.py), not guessed:
  HumanService.create_human(...)            services/humanservice.py
  HumanObjectProperties.set_value(...)      entities/objectproperties
  TargetService.reapply_macro_details(...)  services/targetservice.py   (macro sliders → shape keys)
  TargetService.bake_targets(...)           services/targetservice.py   (shape keys → plain mesh)
  HumanService.add_builtin_rig(..., "mixamo")   built-in rig whose bone names already are mixamorig:* with matching weights
"""
import bpy, bmesh, math, os, sys, json
import mathutils

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
WORK = os.path.join(HERE, 'work')
os.makedirs(WORK, exist_ok=True)
OUT = os.path.join(WORK, 'body.blend')

TARGET_HEIGHT_M = 6 * 0.3048 + 2 * 0.0254          # 6'2" = 1.8796 m
TARGET_HEADS = 7.5                                   # "about 7.5 heads tall"
TARGET_TRIS = 11500                                  # body triangles after decimation (total with cap must land in 8–15k)
RIG_NAME = 'mixamo'                                  # MPFB built-in rig: bones are already mixamorig:Hips, Spine, ...

# game_engine → Mixamo bone names. The 'mixamo' rig needs no renaming; this table is used only if the game_engine
# rig is requested (RIG_NAME = 'game_engine'), which the brief describes as the starting skeleton.
BONE_MAP = {
    'pelvis': 'mixamorig:Hips', 'spine_01': 'mixamorig:Spine', 'spine_02': 'mixamorig:Spine1', 'spine_03': 'mixamorig:Spine2',
    'neck_01': 'mixamorig:Neck', 'head': 'mixamorig:Head',
    'clavicle_r': 'mixamorig:RightShoulder', 'upperarm_r': 'mixamorig:RightArm', 'lowerarm_r': 'mixamorig:RightForeArm', 'hand_r': 'mixamorig:RightHand',
    'clavicle_l': 'mixamorig:LeftShoulder', 'upperarm_l': 'mixamorig:LeftArm', 'lowerarm_l': 'mixamorig:LeftForeArm', 'hand_l': 'mixamorig:LeftHand',
    'thigh_r': 'mixamorig:RightUpLeg', 'calf_r': 'mixamorig:RightLeg', 'foot_r': 'mixamorig:RightFoot', 'ball_r': 'mixamorig:RightToeBase',
    'thigh_l': 'mixamorig:LeftUpLeg', 'calf_l': 'mixamorig:LeftLeg', 'foot_l': 'mixamorig:LeftFoot', 'ball_l': 'mixamorig:LeftToeBase',
}

from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.entities.objectproperties import HumanObjectProperties


def log(*a):
    print('MAKE_BODY:', *a, flush=True)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def make_material(name, hex_color, roughness):
    h = hex_color.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = 0.0
    m.diffuse_color = (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)
    return m


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.cameras, bpy.data.lights):
        for d in list(coll):
            coll.remove(d)


def group_indices(obj, name, min_weight=0.5):
    if name not in obj.vertex_groups:
        return set()
    gi = obj.vertex_groups[name].index
    return {v.index for v in obj.data.vertices if any(g.group == gi and g.weight >= min_weight for g in v.groups)}


def evaluated_coords(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    co = [v.co.copy() for v in me.vertices]
    ev.to_mesh_clear()
    return co


def measure(obj, body_idx, neck_idx):
    """height of the body-only mesh, and heads-tall (crown to chin) — all on the EVALUATED mesh (shape keys applied)."""
    co = evaluated_coords(obj)
    neck_z = sum(co[i].z for i in neck_idx) / max(1, len(neck_idx))
    zs = [co[i].z for i in body_idx]
    zmin, zmax = min(zs), max(zs)
    # chin: lowest vertex in front of the neck, near the midline, above the neck joint
    ys = [co[i].y for i in body_idx if abs(co[i].z - neck_z) < 0.02 and abs(co[i].x) < 0.03]
    neck_y = sum(ys) / len(ys) if ys else 0.0
    cand = [co[i] for i in body_idx if co[i].z > neck_z and abs(co[i].x) < 0.02 and co[i].y < neck_y - 0.045 and co[i].z < zmax - 0.10]
    chin_z = min((v.z for v in cand), default=zmax - 0.23)
    head_h = zmax - chin_z
    return zmax - zmin, (zmax - zmin) / head_h, head_h, zmin, chin_z


def set_macros(obj, **kw):
    for k, v in kw.items():
        HumanObjectProperties.set_value(k, v, entity_reference=obj)
    TargetService.reapply_macro_details(obj)


def main():
    clear_scene()
    macros = TargetService.get_default_macro_info_dict()
    macros.update({'gender': 1.0, 'age': 0.5, 'muscle': 0.70, 'weight': 0.42, 'proportions': 0.80, 'height': 0.50})
    macros['race'] = {'asian': 0.0, 'caucasian': 1.0, 'african': 0.0}
    body = HumanService.create_human(mask_helpers=False, detailed_helpers=True, extra_vertex_groups=True,
                                     feet_on_ground=False, scale=0.1, macro_detail_dict=macros)
    body.name = 'Pitcher'
    body_idx = group_indices(body, 'body')
    joint_neck = group_indices(body, 'joint-neck', 0.1)
    log('created human: verts', len(body.data.vertices), 'body verts', len(body_idx))

    # --- tune macros: first proportions (heads tall), solving 'height' each time so the figure is 6'2" ---
    def solve_height(prop, target):
        lo, hi = 0.0, 1.0
        for _ in range(9):                      # bisection on the height macro (monotonic)
            mid = (lo + hi) / 2
            set_macros(body, proportions=prop, height=mid)
            h = measure(body, body_idx, joint_neck)[0]
            lo, hi = (mid, hi) if h < target else (lo, mid)
        set_macros(body, proportions=prop, height=(lo + hi) / 2)
        return measure(body, body_idx, joint_neck)
    # NOTE: on this MPFB build the 'proportions' macro did not change the result at any value 0.5–1.0 (verified: identical
    # height and heads-tall), so it is fixed at 0.8 and the head is scaled directly below to reach ~7.5 heads.
    PROP = 0.80
    h, heads, head_h, zmin, chin_z = solve_height(PROP, TARGET_HEIGHT_M)
    HEAD_K = heads / TARGET_HEADS                                  # head scale that makes the figure TARGET_HEADS tall
    extra = (HEAD_K - 1.0) * (head_h + 0.03)                       # height the bigger head adds → pre-compensate in the macro solve
    h, heads, head_h, zmin, chin_z = solve_height(PROP, TARGET_HEIGHT_M - extra)
    log('macro solve: height %.4f m, %.2f heads tall → head scale ×%.3f (adds %.1f cm, pre-compensated)' % (h, heads, HEAD_K, extra * 100))
    best = (PROP, heads)

    # --- bake the macro shape keys into a plain mesh, drop the feet to z=0, then fit the Mixamo-named rig ---
    TargetService.bake_targets(body)
    body.location = (0, 0, -zmin)
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    h, heads, head_h, zmin, chin_z = measure(body, body_idx, joint_neck)
    log('baked: height %.4f m, %.2f heads tall, head %.3f m, chin z %.3f' % (h, heads, head_h, chin_z))
    rig = HumanService.add_builtin_rig(body, RIG_NAME)
    rig.name = 'PitcherRig'
    if RIG_NAME == 'game_engine':
        for b in rig.data.bones:
            if b.name in BONE_MAP:
                vg = body.vertex_groups.get(b.name)
                if vg:
                    vg.name = BONE_MAP[b.name]
                b.name = BONE_MAP[b.name]
    log('rig:', rig.name, len(rig.data.bones), 'bones')

    # --- remove MPFB helper geometry (joint cubes, eye/teeth/tongue/lash helpers) ---
    helper = set()
    for g in ('HelperGeometry', 'JointCubes'):
        helper |= group_indices(body, g, 0.0)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in helper], context='VERTS')
    bm.to_mesh(body.data)
    bm.free()
    for g in list(body.vertex_groups):
        if not g.name.startswith('mixamorig:'):
            body.vertex_groups.remove(g)
    log('after helper removal: verts', len(body.data.vertices), 'polys', len(body.data.polygons))

    # --- faceless smooth head: Taubin (λ|μ) smoothing so features melt away without shrinking the skull ---
    me = body.data
    zs = [v.co.z for v in me.vertices]
    zmax = max(zs)
    head_vs = [v.index for v in me.vertices if v.co.z > chin_z - 0.015]
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    weights = {}
    for i in head_vs:
        t = max(0.0, min(1.0, (bm.verts[i].co.z - (chin_z - 0.015)) / 0.04))
        weights[i] = t * t * (3 - 2 * t)         # fade in so the neck seam stays untouched
    for it in range(90):
        for lam in (0.5, -0.53):
            new = {}
            for i, w in weights.items():
                v = bm.verts[i]
                nb = [e.other_vert(v).co for e in v.link_edges]
                avg = sum(nb, mathutils.Vector()) / len(nb)
                new[i] = v.co + (avg - v.co) * lam * w
            for i, c in new.items():
                bm.verts[i].co = c
    # fit an ellipsoid to the skull (percentiles ignore ears/nose) and blend the head vertices onto it → an egg-smooth mannequin head
    hv = [bm.verts[i].co.copy() for i in head_vs if bm.verts[i].co.z > chin_z + 0.03]
    xs_ = sorted(v.x for v in hv); ys2 = sorted(v.y for v in hv); zs_ = sorted(v.z for v in hv)
    q = lambda a, f: a[int(f * (len(a) - 1))]
    cx0, cy0 = 0.0, (q(ys2, 0.08) + q(ys2, 0.92)) / 2
    rx, ry = (q(xs_, 0.97) - q(xs_, 0.03)) / 2, (q(ys2, 0.97) - q(ys2, 0.03)) / 2
    ztop, zbot = max(zs_), chin_z - 0.005
    cz0, rz = (ztop + zbot) / 2, (ztop - zbot) / 2
    for i, w in weights.items():
        v = bm.verts[i]
        d = mathutils.Vector(((v.co.x - cx0) / rx, (v.co.y - cy0) / ry, (v.co.z - cz0) / rz))
        n = d.length or 1.0
        proj = mathutils.Vector((cx0 + d.x / n * rx, cy0 + d.y / n * ry, cz0 + d.z / n * rz))
        v.co = v.co.lerp(proj, 1.0 * w * (1.0 if v.co.z > chin_z + 0.01 else 0.4))
    for it in range(12):
        new = {}
        for i, w in weights.items():
            v = bm.verts[i]
            nb = [e.other_vert(v).co for e in v.link_edges]
            new[i] = v.co + ((sum(nb, mathutils.Vector()) / len(nb)) - v.co) * 0.4 * w
        for i, c in new.items():
            bm.verts[i].co = c
    pivot = mathutils.Vector((0.0, sum(bm.verts[i].co.y for i in head_vs if abs(bm.verts[i].co.z - (chin_z - 0.03)) < 0.02) / max(1, len([1 for i in head_vs if abs(bm.verts[i].co.z - (chin_z - 0.03)) < 0.02])), chin_z - 0.03))
    for i, w in weights.items():
        v = bm.verts[i]
        v.co = pivot + (v.co - pivot) * (1.0 + (HEAD_K - 1.0) * w)
    # clean up what the projection leaves behind: faces now pointing INTO the head (eye sockets, mouth interior) are deleted,
    # coincident vertices merged, holes filled, normals recomputed → a featureless surface instead of creased eye/lip outlines
    head_set = set(head_vs)
    bm.normal_update()
    center = mathutils.Vector((cx0, cy0, cz0))
    bad = []
    for f in bm.faces:
        if all(v.index in head_set for v in f.verts):
            c = f.calc_center_median()
            if c.z > chin_z + 0.005 and (f.normal.dot((c - center).normalized()) < 0.35 or f.calc_area() < 2e-7):
                bad.append(f)
    bmesh.ops.delete(bm, geom=bad, context='FACES')
    live = [v for v in bm.verts if v.index in head_set and v.is_valid]
    bmesh.ops.remove_doubles(bm, verts=live, dist=0.002)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    for sides in (12, 40, 120):                                   # fill every open boundary loop in the head/neck zone (small ones first)
        edges = [e for e in bm.edges if e.is_boundary and e.verts[0].co.z > chin_z - 0.16 and e.verts[1].co.z > chin_z - 0.16]
        if edges:
            bmesh.ops.holes_fill(bm, edges=edges, sides=sides)
            bm.edges.ensure_lookup_table()
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.verts.index_update(); bm.verts.ensure_lookup_table()
    for it in range(14):                                          # final Taubin pass over the cleaned head so no crease survives
        for lam in (0.5, -0.53):
            new = {}
            for v in bm.verts:
                if v.co.z > chin_z + 0.01 and v.link_edges:
                    t = min(1.0, (v.co.z - (chin_z + 0.01)) / 0.03)
                    nb = [e.other_vert(v).co for e in v.link_edges]
                    new[v.index] = v.co + ((sum(nb, mathutils.Vector()) / len(nb)) - v.co) * lam * t
            for i, c in new.items():
                bm.verts[i].co = c
    log('head clean-up: deleted', len(bad), 'inward/degenerate faces')
    bm.to_mesh(me); bm.free()
    log('smoothed + scaled head region:', len(head_vs), 'verts, ×%.3f' % HEAD_K)

    # --- materials: four slots by dominant bone weight (no clothing assets ship with MPFB) ---
    mats = [make_material('Skin', '#1A1A1A', 0.55), make_material('Shirt', '#1A1A1A', 0.55),
            make_material('Pants', '#FAF8F3', 0.80), make_material('SleeveR', '#FF5722', 0.55)]
    for m in mats:
        me.materials.append(m)
    bn = rig.data.bones
    hips_z = bn['mixamorig:Hips'].head_local.z
    waist_z = hips_z + 0.06                                       # shirt/pants line: just above the hip joint
    ankle_z = bn['mixamorig:RightFoot'].head_local.z + 0.04       # skin below this
    wrist_z = {n: bn['mixamorig:%sHand' % n].head_local for n in ('Left', 'Right')}
    shR, elR = bn['mixamorig:RightArm'].head_local, bn['mixamorig:RightForeArm'].head_local
    axis = (elR - shR); alen = axis.length; axis.normalize()
    def classify(c):
        # right sleeve (orange): upper arm from just past the shoulder joint to ~85% of the way to the elbow
        t = (c - shR).dot(axis)
        d = ((c - shR) - axis * t).length
        if 0.03 < t < alen * 0.85 and d < 0.085 and c.x * shR.x > 0:
            return 3
        for side, w in wrist_z.items():                           # hands: skin (tested first — they hang below the waist)
            if (c - w).length < 0.15 and (c.x * w.x > 0):
                return 0
        if c.z < ankle_z:
            return 0
        if c.z < waist_z:
            return 2
        if c.z > chin_z - 0.01:
            return 0
        return 1
    for poly in me.polygons:
        c = sum((me.vertices[v].co for v in poly.vertices), mathutils.Vector()) / len(poly.vertices)
        poly.material_index = classify(c)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))

    # --- decimate to the triangle budget (before adding the cap), keeping weights ---
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    ratio = min(1.0, TARGET_TRIS / tris)
    mod = body.modifiers.new('Decimate', 'DECIMATE')
    mod.ratio = ratio
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_move_to_index(modifier='Decimate', index=0)
    bpy.ops.object.modifier_apply(modifier='Decimate')
    tris_after = sum(len(p.vertices) - 2 for p in body.data.polygons)
    log('decimated: %d → %d triangles (ratio %.3f)' % (tris, tris_after, ratio))

    # --- plain cap: half UV sphere + flattened brim, skinned 100% to the Head bone ---
    co = [v.co for v in body.data.vertices if v.co.z > zmax - head_h * 0.55]
    xs = [c.x for c in co]; ys_ = [c.y for c in co]
    r = (max(xs) - min(xs)) / 2 * 1.10
    cy = (max(ys_) + min(ys_)) / 2
    cz = zmax - r * 0.92
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=r)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -r * 0.05], context='VERTS')
    bmesh.ops.translate(bm, vec=(0, cy, cz), verts=bm.verts)
    dome_faces = list(bm.faces)
    # brim: a half-disc (front half), thickened, tilted slightly down and set at the front lower edge of the dome
    arc = [bm.verts.new((r * 1.02 * math.cos(math.pi + k * math.pi / 12), r * 1.02 * math.sin(math.pi + k * math.pi / 12), 0.0)) for k in range(13)]
    brim_face = bm.faces.new(arc)
    ext = bmesh.ops.extrude_face_region(bm, geom=[brim_face])
    ext_verts = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]
    for v in ext_verts:
        v.co.z -= 0.008
    brim_verts = set(arc) | set(ext_verts)
    brim_faces = {f for v in brim_verts for f in v.link_faces}
    rot = mathutils.Matrix.Rotation(math.radians(-12), 4, 'X')
    for v in brim_verts:
        v.co = rot @ v.co
        v.co.y += cy - r * 0.15
        v.co.z += cz + r * 0.05
    bm.faces.ensure_lookup_table()
    for f in bm.faces:                                           # materials/smoothing set on the bmesh faces themselves (polygon order is not preserved by to_mesh)
        is_brim = f in brim_faces
        f.material_index = 1 if is_brim else 0
        f.smooth = not is_brim
    cap_me = bpy.data.meshes.new('CapMesh')
    bm.to_mesh(cap_me); bm.free()
    cap_me.materials.append(mats[0]); cap_me.materials.append(make_material('CapBrim', '#FF5722', 0.55))
    cap = bpy.data.objects.new('Cap', cap_me)
    bpy.context.collection.objects.link(cap)
    vg = cap.vertex_groups.new(name='mixamorig:Head')
    vg.add(list(range(len(cap_me.vertices))), 1.0, 'REPLACE')
    cap.parent = rig
    am = cap.modifiers.new('Armature', 'ARMATURE'); am.object = rig
    log('cap radius %.3f m, tris %d' % (r, sum(len(p.vertices) - 2 for p in cap_me.polygons)))

    # --- exact final height: scale mesh, cap and bones uniformly about the origin (feet at z=0) ---
    co = [v.co for v in body.data.vertices]
    cur = max(c.z for c in co) - min(c.z for c in co)
    k = TARGET_HEIGHT_M / cur
    for ob in (body, cap):
        for v in ob.data.vertices:
            v.co *= k
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for eb in rig.data.edit_bones:
        eb.head *= k
        eb.tail *= k
    bpy.ops.object.mode_set(mode='OBJECT')
    log('final scale ×%.4f' % k)

    # --- final stats + save ---
    co = [v.co for v in body.data.vertices]
    height = max(c.z for c in co) - min(c.z for c in co)
    neck_z_final = rig.data.bones['mixamorig:Neck'].head_local.z
    top = max(c.z for c in co)
    chin = min([c.z for c in co if c.z > neck_z_final and abs(c.x) < 0.02 and c.y < min(cc.y for cc in co if abs(cc.z - neck_z_final) < 0.02 and abs(cc.x) < 0.03) - 0.0 and c.z < top - 0.10] or [top - 0.24])
    heads = height / (top - chin)
    total_tris = sum(len(p.vertices) - 2 for p in body.data.polygons) + sum(len(p.vertices) - 2 for p in cap.data.polygons)
    report = {'height_m': round(height, 4), 'height_ft_in': '%d\'%.1f"' % (int(height / 0.3048), (height / 0.3048 - int(height / 0.3048)) * 12),
              'heads_tall_approx': round(heads, 2), 'head_scale': round(HEAD_K, 3), 'proportions_macro': best[0], 'triangles_total': total_tris,
              'bones': len(rig.data.bones), 'materials': [m.name for m in body.data.materials], 'rig': RIG_NAME}
    json.dump(report, open(os.path.join(WORK, 'body_report.json'), 'w'), indent=1)
    log(json.dumps(report))
    bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
    log('saved', OUT)


main()
