#!/usr/bin/env python3
"""verify_glb.py — structural checks on public/models/pitcher.glb (no dependencies): bone names, actions, extras,
Draco, no textures/images, no text/logo-like names. Prints PASS/FAIL per item; exit code 1 if any fail."""
import json, struct, sys, os, re
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'models', 'pitcher.glb')
data = open(path, 'rb').read()
magic, ver, length = struct.unpack('<4sII', data[:12])
assert magic == b'glTF', 'not a GLB'
off, gltf = 12, None
while off < len(data):
    clen, ctype = struct.unpack('<II', data[off:off + 8])
    if ctype == 0x4E4F534A:
        gltf = json.loads(data[off + 8:off + 8 + clen])
    off += 8 + clen + (0)
results = []
def check(name, ok, detail=''):
    results.append(ok); print(('PASS ' if ok else 'FAIL ') + name + (' — ' + detail if detail else ''))

nodes = gltf['nodes']
names = [n.get('name', '') for n in nodes]
skins = gltf.get('skins', [])
joints = sorted({names[j] for s in skins for j in s['joints']})
MIX = ['Hips','Spine','Spine1','Spine2','Neck','Head','RightShoulder','RightArm','RightForeArm','RightHand','LeftShoulder','LeftArm','LeftForeArm','LeftHand','RightUpLeg','RightLeg','RightFoot','RightToeBase','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase']
missing = [m for m in MIX if 'mixamorig:' + m not in joints and 'mixamorig_' + m not in joints and 'mixamorig' + m not in joints]
check('skinned (a skin with joints exists)', len(skins) >= 1, '%d skin(s), %d joints' % (len(skins), len(joints)))
check('bone names match the Mixamo map', not missing, 'missing: %s' % missing if missing else 'all %d mapped bones present; sample %s' % (len(MIX), [j for j in joints if 'Hips' in j or 'RightHand' == j.split(':')[-1]][:3]))
anims = [a.get('name') for a in gltf.get('animations', [])]
check('actions delivery / idle_ready / set exist', all(x in anims for x in ('delivery', 'idle_ready', 'set')), str(anims))
ext = {}
for n in nodes:
    ex = n.get('extras') or {}
    if 'releaseFrame' in ex: ext = ex
check('extras: releaseFrame, fps, stretchFrame', all(k in ext for k in ('releaseFrame', 'fps', 'stretchFrame')), json.dumps(ext))
check('Draco compression used', 'KHR_draco_mesh_compression' in (gltf.get('extensionsUsed') or []), str(gltf.get('extensionsUsed')))
check('no textures or images (flat colours only)', not gltf.get('images') and not gltf.get('textures'), 'images=%d textures=%d' % (len(gltf.get('images', [])), len(gltf.get('textures', []))))
mats = [(m.get('name'), m.get('pbrMetallicRoughness', {}).get('baseColorFactor'), m.get('pbrMetallicRoughness', {}).get('roughnessFactor')) for m in gltf.get('materials', [])]
print('     materials:', mats)
text_like = [n for n in names + [m[0] or '' for m in mats] + anims if re.search(r'logo|text|number|jersey_?#|\d{2,}$', n or '', re.I) and 'mixamorig' not in n]
check('no logo / text / number names', not text_like, str(text_like))
size = os.path.getsize(path)
check('size under 2.5 MB', size < 2.5e6, '%.2f MB' % (size / 1e6))
dur = {a.get('name'): None for a in gltf['animations']}
print('     meshes:', [m.get('name') for m in gltf.get('meshes', [])], 'nodes:', len(nodes))
sys.exit(0 if all(results) else 1)
