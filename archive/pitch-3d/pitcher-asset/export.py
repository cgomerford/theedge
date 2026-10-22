"""
export.py — write public/models/pitcher.glb from work/rigged.blend.

Run:  blender -b work/rigged.blend -P export.py

glTF binary, skinned, Draco-compressed, three actions ("delivery", "idle_ready", "set") and the extras
{ releaseFrame, fps, stretchFrame, ... } on the armature node. No textures are exported (flat colours only).
"""
import bpy, os, json, sys

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(REPO, 'public', 'models', 'pitcher.glb')
WORK = os.path.join(HERE, 'work')
os.makedirs(os.path.dirname(OUT), exist_ok=True)


def log(*a):
    print('EXPORT:', *a, flush=True)


rig = bpy.data.objects['PitcherRig']
report = json.load(open(os.path.join(WORK, 'retarget_report.json')))
rig['releaseFrame'] = int(report['release_frame_30fps'])
rig['fps'] = int(report['fps'])
rig['stretchFrame'] = int(report['stretch_frame'])
if report.get('foot_strike_frame') is not None:
    rig['footStrikeFrame'] = int(report['foot_strike_frame'])
rig['forwardXY'] = report['forward_xy']                # the direction he throws, in the source scene (informational)
log('extras:', {k: rig[k] for k in ('releaseFrame', 'fps', 'stretchFrame')})

for a in ('delivery', 'set', 'idle_ready'):
    assert a in bpy.data.actions, 'missing action ' + a
    bpy.data.actions[a].use_fake_user = True

bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects:
    if o.type in ('ARMATURE', 'MESH'):
        o.select_set(True)
bpy.context.view_layer.objects.active = rig

kw = dict(
    filepath=OUT, export_format='GLB', use_selection=True,
    export_apply=False, export_skins=True, export_animations=True,
    export_animation_mode='ACTIONS', export_force_sampling=True, export_extras=True,
    export_yup=True, export_materials='EXPORT', export_image_format='NONE',
    export_cameras=False, export_lights=False, export_morph=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
    export_draco_position_quantization=14, export_draco_normal_quantization=10,
)
try:
    bpy.ops.export_scene.gltf(**kw)
except TypeError as e:                                     # an option name changed between Blender versions: drop unknown ones and say so
    bad = str(e)
    log('exporter rejected an option:', bad)
    props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    kw = {k: v for k, v in kw.items() if k in props}
    log('retrying with', sorted(kw))
    bpy.ops.export_scene.gltf(**kw)
log('wrote', OUT, '%.2f MB' % (os.path.getsize(OUT) / 1e6))
