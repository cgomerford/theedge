"""
preview.py — render checking PNGs headlessly (Workbench engine: no GPU needed).

  blender -b work/rigged.blend -P preview.py -- --out preview --frames set=0 leg_lift=40 ... --cam broadcast --facing -Y
  blender -b work/body.blend   -P preview.py -- --out work --still body_front body_side

Cameras:
  broadcast : behind the pitcher, long lens (13° vertical FOV), ~8.8 ft up — the site's default view
  front/side/threeq : close checks of the body
"""
import bpy, sys, os, math, argparse
import mathutils

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--out', default='preview')
ap.add_argument('--frames', nargs='*', default=[])      # name=frame
ap.add_argument('--still', nargs='*', default=[])       # body_front body_side body_threeq
ap.add_argument('--cam', default='broadcast')
ap.add_argument('--res', type=int, nargs=2, default=[900, 1100])
ap.add_argument('--dist', type=float, default=26.0, help='camera distance behind the pitcher (m); the site uses ~30 m with a 13° lens')
ap.add_argument('--azim', type=float, default=0.0, help='degrees to swing the camera around the pitcher: 0 = behind, 90 = his right, 180 = in front')
ap.add_argument('--fov', type=float, default=13.0)
ap.add_argument('--toward', default='-Y', help='throwing direction in Blender world coordinates: -Y/+Y/+X/-X or "x,y"')
args = ap.parse_args(argv)

HERE = os.path.dirname(os.path.abspath(__file__))
out_dir = args.out if os.path.isabs(args.out) else os.path.join(HERE, args.out)
os.makedirs(out_dir, exist_ok=True)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.render.resolution_x, sc.render.resolution_y = args.res
sc.render.image_settings.file_format = 'PNG'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'MATERIAL'
sc.display.shading.show_cavity = True
sc.display.shading.cavity_type = 'BOTH'
sc.display.shading.show_object_outline = False
sc.display.shading.background_type = 'VIEWPORT'
sc.display.shading.background_color = (0.98, 0.972, 0.953)
sc.view_settings.view_transform = 'Standard'
try:
    sc.world.color = (0.98, 0.972, 0.953)
except Exception:
    pass

for o in list(bpy.data.objects):
    if o.type in ('CAMERA', 'LIGHT') or o.name in ('Cube',):
        bpy.data.objects.remove(o)

rig = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
bodies = [o for o in bpy.data.objects if o.type == 'MESH']
_named = {'-Y': (0, -1), '+Y': (0, 1), '+X': (1, 0), '-X': (-1, 0)}
_t = _named.get(args.toward) or tuple(float(x) for x in args.toward.split(','))
toward = mathutils.Vector((_t[0], _t[1], 0)).normalized()


def make_cam(name, loc, target, fov_deg):
    cam = bpy.data.cameras.new(name)
    cam.sensor_fit = 'VERTICAL'
    cam.angle_y = math.radians(fov_deg)
    cam.clip_end = 2000
    ob = bpy.data.objects.new(name, cam)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    d = (mathutils.Vector(target) - mathutils.Vector(loc))
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.camera = ob
    return ob


def snap(name):
    path = os.path.join(out_dir, name + '.png')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('PREVIEW:', path, flush=True)


def head_pos():
    if rig:
        b = rig.pose.bones.get('mixamorig:Hips')
        return (rig.matrix_world @ b.head) if b else mathutils.Vector((0, 0, 1))
    return mathutils.Vector((0, 0, 1))


if args.still:
    for st in args.still:
        c = mathutils.Vector((0, 0, 0.95))
        if st.startswith('head'):
            hp = mathutils.Vector((0, 0, 1.72))
            make_cam('c', (0.0, -1.6, 1.74) if st.endswith('front') else (1.6, 0.0, 1.74), hp, 20)
            snap(st); continue
        if st.endswith('front'):
            make_cam('c', (0, -5.2, 1.0), c, 22)
        elif st.endswith('side'):
            make_cam('c', (5.2, 0, 1.0), c, 22)
        else:
            make_cam('c', (3.6, -3.6, 1.2), c, 22)
        snap(st)
else:
    for spec in args.frames:
        name, fr = spec.split('=')
        sc.frame_set(int(fr))
        # follow the pitcher in the horizontal plane; camera behind him looking along the throwing direction
        hp = head_pos()
        ang = math.radians(args.azim)
        back = mathutils.Vector((-toward.x * math.cos(ang) - toward.y * math.sin(ang), -toward.y * math.cos(ang) + toward.x * math.sin(ang), 0.0))
        tgt = mathutils.Vector((hp.x, hp.y, 1.10)) + toward * 0.8
        loc = mathutils.Vector((hp.x, hp.y, 2.7)) + back * args.dist          # behind (or around) the pitcher, ~8.8 ft up
        loc.z = 2.7
        make_cam('c', loc, tgt, args.fov)
        snap(name)
