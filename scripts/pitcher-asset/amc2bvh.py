#!/usr/bin/env python3
"""
amc2bvh.py — convert a CMU ASF skeleton + AMC motion into a BVH file.

WHY THIS EXISTS: Blender has no ASF/AMC importer, and no maintained open-source converter could be found
(the well-known cgspeed BVH conversion page is gone; sxaxmz/amc2bvh was last touched in 2021 and has no
licence; the PyPI "bvh-converter" goes BVH -> CSV). So this is a small converter written for this project
from the public ASF/AMC format description. Pure Python, no dependencies.

Conventions (checked against the CMU ASF/AMC spec as used by e.g. CalciferZh/AMCParser):
  - ASF `direction` / `axis` are expressed in the global frame at the rest pose.
  - A bone's rotation rotates the bone itself about its BASE; the bone's tip is the child's base.
  - global rotation of bone b:  M_b = M_parent · C_b⁻¹ · R_b(dof) · C_b,   C_b = Rotation(axis)
    so the rotation LOCAL to the parent is  L_b = C_b⁻¹ · R_b · C_b.
  - ASF length unit: `:units length 0.45` → 1 unit = 1/0.45 inch → ×0.056444 gives metres.
BVH: joint b sits at the bone's base; OFFSET = parent bone's length·direction; rotation order Z X Y.
Usage: python3 amc2bvh.py 124.asf 124_01.amc out.bvh
"""
import math, sys, re

def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]

def mat_T(a):
    return [[a[j][i] for j in range(3)] for i in range(3)]

def rot_x(t):
    c, s = math.cos(t), math.sin(t); return [[1, 0, 0], [0, c, -s], [0, s, c]]
def rot_y(t):
    c, s = math.cos(t), math.sin(t); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]
def rot_z(t):
    c, s = math.cos(t), math.sin(t); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]
ROT = {'X': rot_x, 'Y': rot_y, 'Z': rot_z}

def euler_matrix(angles_rad, order):
    """Static-axis ('sxyz'-style) composition used by ASF: for order 'XYZ' the matrix is Rz·Ry·Rx."""
    m = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    for ax, ang in zip(order, angles_rad):
        m = mat_mul(ROT[ax](ang), m)
    return m

def parse_asf(path):
    text = open(path).read().splitlines()
    bones = {'root': {'name': 'root', 'dir': (0, 0, 0), 'length': 0.0, 'axis': (0, 0, 0), 'order': 'XYZ', 'dof': ['tx', 'ty', 'tz', 'rx', 'ry', 'rz'], 'parent': None}}
    scale = 1.0
    i, section = 0, None
    cur = None
    hierarchy = []
    while i < len(text):
        line = text[i].strip()
        if line.startswith(':'):
            section = line.split()[0]
            if section == ':units':
                pass
            i += 1; continue
        if section == ':units' and line.startswith('length'):
            scale = 1.0 / float(line.split()[1])   # units per inch -> inches per unit
        if section == ':bonedata':
            if line == 'begin': cur = {'dof': [], 'order': 'XYZ', 'axis': (0, 0, 0), 'dir': (0, 0, 0), 'length': 0.0}
            elif line == 'end':
                bones[cur['name']] = cur; cur = None
            elif cur is not None:
                k, *v = line.split()
                if k == 'name': cur['name'] = v[0]
                elif k == 'direction': cur['dir'] = tuple(float(x) for x in v)
                elif k == 'length': cur['length'] = float(v[0])
                elif k == 'axis':
                    cur['axis'] = tuple(float(x) for x in v[:3]); cur['order'] = v[3]
                elif k == 'dof':
                    cur['dof'] = v
                    if cur['dof'] == []: pass
                    # dof can continue on the same line only
        if section == ':hierarchy':
            if line in ('begin', 'end') or not line: pass
            else: hierarchy.append(line.split())
        i += 1
    for row in hierarchy:
        p, kids = row[0], row[1:]
        for k in kids: bones[k]['parent'] = p
    for b in bones.values():
        b.setdefault('parent', None)
    # length unit: ASF length is in 'inches per 0.45 units' convention -> metres
    metres_per_unit = 0.0254 * scale / 1.0 * 1.0
    return bones, metres_per_unit

def parse_amc(path, bones):
    frames, cur = [], None
    for line in open(path):
        line = line.strip()
        if not line or line[0] in '#:': continue
        parts = line.split()
        if len(parts) == 1 and parts[0].isdigit():
            cur = {}; frames.append(cur); continue
        cur[parts[0]] = [float(x) for x in parts[1:]]
    return frames

def children_of(bones):
    ch = {n: [] for n in bones}
    for n, b in bones.items():
        if b['parent']: ch[b['parent']].append(n)
    return ch

def zxy_from_matrix(m):
    """M = Rz(z)·Rx(x)·Ry(y) → (z, x, y) in degrees (BVH 'Zrotation Xrotation Yrotation')."""
    sx = m[2][1]
    x = math.asin(max(-1.0, min(1.0, sx)))
    if abs(sx) < 0.999999:
        z = math.atan2(-m[0][1], m[1][1])
        y = math.atan2(-m[2][0], m[2][2])
    else:
        z = math.atan2(m[1][0], m[0][0]); y = 0.0
    return math.degrees(z), math.degrees(x), math.degrees(y)

def convert(asf, amc, out):
    bones, mpu = parse_asf(asf)
    # ASF lengths are in inches-scaled units: metres = length * 0.0254 / 0.45 (the usual 0.056444 factor)
    mpu = 0.0254 / 0.45
    frames = parse_amc(amc, bones)
    ch = children_of(bones)
    # joint order = depth first from root
    def write_joint(name, depth, lines):
        b = bones[name]; ind = '  ' * depth
        if name == 'root':
            lines.append('ROOT root'); lines.append('{')
            lines.append(f'{ind}  OFFSET 0.000000 0.000000 0.000000')
            lines.append(f'{ind}  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation')
        else:
            p = bones[b['parent']]; off = [p['dir'][k] * p['length'] * mpu for k in range(3)]
            lines.append(f'{ind}JOINT {name}'); lines.append(f'{ind}{{')
            lines.append(f'{ind}  OFFSET {off[0]:.6f} {off[1]:.6f} {off[2]:.6f}')
            lines.append(f'{ind}  CHANNELS 3 Zrotation Xrotation Yrotation')
        for c in ch[name]: write_joint(c, depth + 1, lines)
        if not ch[name]:
            tip = [b['dir'][k] * b['length'] * mpu for k in range(3)]
            lines.append(f'{ind}  End Site'); lines.append(f'{ind}  {{')
            lines.append(f'{ind}    OFFSET {tip[0]:.6f} {tip[1]:.6f} {tip[2]:.6f}'); lines.append(f'{ind}  }}')
        lines.append(f'{ind}}}')
    lines = ['HIERARCHY']; write_joint('root', 0, lines)
    order = []
    def walk(n): order.append(n); [walk(c) for c in ch[n]]
    walk('root')
    lines += ['MOTION', f'Frames: {len(frames)}', 'Frame Time: 0.008333']
    deg = math.radians
    for fr in frames:
        vals = []
        for name in order:
            b = bones[name]
            axis = [deg(a) for a in b['axis']]
            C = euler_matrix(axis, b['order'])
            Cinv = mat_T(C)
            if name == 'root':
                v = fr['root']
                tx, ty, tz = [x * mpu for x in v[:3]]
                R = euler_matrix([deg(a) for a in v[3:6]], b['order'])
                L = mat_mul(Cinv, mat_mul(R, C))
                z, x, y = zxy_from_matrix(L)
                vals += [tx, ty, tz, z, x, y]
            else:
                rot = [0.0, 0.0, 0.0]
                data = fr.get(name, [])
                for k, d in enumerate(b['dof']):
                    rot['xyz'.index(d[1])] = deg(data[k]) if k < len(data) else 0.0
                R = euler_matrix(rot, b['order'])
                L = mat_mul(Cinv, mat_mul(R, C))
                z, x, y = zxy_from_matrix(L)
                vals += [z, x, y]
        lines.append(' '.join(f'{v:.5f}' for v in vals))
    open(out, 'w').write('\n'.join(lines) + '\n')
    return len(frames), len(order)

if __name__ == '__main__':
    n, j = convert(sys.argv[1], sys.argv[2], sys.argv[3])
    print(f'wrote {sys.argv[3]}: {n} frames, {j} joints')
