#!/usr/bin/env python3
"""render_previews.py — render the four checking PNGs (set, leg lift, foot strike, release) from the broadcast camera angle
into scripts/pitcher-asset/preview/. Reads work/retarget_report.json for the frame numbers and throwing direction.
Usage: python3 render_previews.py [path/to/blender]"""
import json, os, subprocess, sys, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
blender = sys.argv[1] if len(sys.argv) > 1 else (os.environ.get('BLENDER') or shutil.which('blender') or '/Applications/Blender.app/Contents/MacOS/Blender')
r = json.load(open(os.path.join(HERE, 'work', 'retarget_report.json')))
frames = ['1_set=1', '2_leg_lift=%d' % (r['stretch_frame'] + 1), '3_foot_strike=%d' % (r['foot_strike_frame'] + 1), '4_release=%d' % (r['release_frame_30fps'] + 1)]
cmd = [blender, '-b', os.path.join(HERE, 'work', 'rigged.blend'), '-P', os.path.join(HERE, 'preview.py'), '--', '--out', os.path.join(HERE, 'preview'),
       '--toward=%s,%s' % tuple(r['forward_xy']), '--dist', '14', '--fov', '13', '--res', '800', '1000', '--frames'] + frames
out = subprocess.run(cmd, capture_output=True, text=True)
for line in out.stdout.splitlines():
    if line.startswith('PREVIEW:') or 'Error' in line or 'Traceback' in line:
        print(line)
sys.exit(out.returncode)
