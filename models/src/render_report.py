"""
models/src/render_report.py

Render the Stuff Grade results as ONE self-contained HTML page you can open in a browser:
  models/data/external/stuff_grade_report.html   (gitignored: it contains FanGraphs numbers; private, do not publish)

Inputs (written by validate_stuff.py and compare_fangraphs.py):
  models/reports/stuff_v1.0.md
  models/data/external/stuff_v1.0_vs_fangraphs.md
  models/reports/stuff_v1.0_2026_pitchers.csv  (+ the pasted FanGraphs table, for the scatter)
The markdown is converted by a tiny converter (headings, tables, bullets, bold, code); the scatter is inline SVG.
No external fonts, scripts or images, so the file works offline.

  models/venv/bin/python models/src/render_report.py            # render
  models/venv/bin/python models/src/render_report.py --selftest # render a tiny sample to check the converter
"""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / 'data' / 'external'
OUT = EXT / 'stuff_grade_report.html'

CSS = """
:root{--cream:#FAF8F3;--ink:#1A1A1A;--orange:#FF5722;--yellow:#FDE047;--line:#e7e2d8;--mute:#8a8275;--soft:#f1eee6}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:15px/1.55 "Outfit",system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:32px 24px 80px}
.banner{background:var(--ink);color:var(--cream);border-radius:12px;padding:12px 16px;font:12px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.04em;margin-bottom:24px}
.banner b{color:var(--yellow)}
h1{font-size:clamp(30px,4.4vw,46px);letter-spacing:-.02em;line-height:1.05;margin:0 0 6px;font-weight:800}
h2{font-size:26px;letter-spacing:-.01em;margin:44px 0 12px;font-weight:800;padding-top:18px;border-top:1px solid var(--line)}
h2:before{content:"§ ";color:var(--orange);font:12px ui-monospace,Menlo,monospace;letter-spacing:.16em}
h3{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--orange);margin:26px 0 8px;font-weight:700}
p,li{max-width:900px}ul{padding-left:20px}code{font:12.5px ui-monospace,Menlo,monospace;background:var(--soft);padding:1px 5px;border-radius:4px}
.tbl{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:14px;padding:6px 10px;margin:8px 0 16px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;font-size:13.5px}
th{font:10px ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);text-align:left;font-weight:400;padding:8px 10px;white-space:nowrap}
td{padding:6px 10px;border-top:1px solid var(--line);white-space:nowrap}tbody tr:hover{background:#FFF8F0}
td:first-child,th:first-child{position:sticky;left:0}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;margin:12px 0}
.mute{color:var(--mute);font-size:13px}nav a{color:var(--ink);text-decoration:none;border:1px solid var(--line);background:#fff;border-radius:999px;padding:5px 11px;font:11px ui-monospace,Menlo,monospace;letter-spacing:.06em;text-transform:uppercase;margin-right:6px;display:inline-block;margin-bottom:6px}
nav a:hover{background:var(--ink);color:var(--cream)}
svg text{font-family:ui-monospace,Menlo,monospace}
"""


def inline(s: str) -> str:
    s = html.escape(s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    return re.sub(r'`(.+?)`', r'<code>\1</code>', s)


def md_to_html(md: str, skip_h1: bool = False) -> str:
    out: list[str] = []
    lines = md.splitlines()
    i = 0
    in_list = False
    while i < len(lines):
        ln = lines[i]
        if in_list and not ln.startswith('- '):
            out.append('</ul>'); in_list = False
        if ln.startswith('|') and i + 1 < len(lines) and re.match(r'^\|[\s\-:|]+\|$', lines[i + 1]):
            head = [c.strip() for c in ln.strip('|').split('|')]
            i += 2
            body = []
            while i < len(lines) and lines[i].startswith('|'):
                body.append([c.strip() for c in lines[i].strip('|').split('|')])
                i += 1
            out.append('<div class="tbl"><table><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in head) + '</tr></thead><tbody>'
                       + ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in body) + '</tbody></table></div>')
            continue
        if ln.startswith('# '):
            if not skip_h1:
                out.append(f'<h1>{inline(ln[2:])}</h1>')
        elif ln.startswith('## '):
            out.append(f'<h2 id="{re.sub(r"[^a-z0-9]+", "-", ln[3:].lower()).strip("-")}">{inline(ln[3:])}</h2>')
        elif ln.startswith('### '):
            out.append(f'<h3>{inline(ln[4:])}</h3>')
        elif ln.startswith('- '):
            if not in_list:
                out.append('<ul>'); in_list = True
            out.append(f'<li>{inline(ln[2:])}</li>')
        elif ln.strip():
            out.append(f'<p>{inline(ln)}</p>')
        i += 1
    if in_list:
        out.append('</ul>')
    return '\n'.join(out)


def scatter_svg() -> str:
    """Our pitcher grade (y) against FanGraphs Stuff+ on our scale (x), one dot per qualified starter; dashed line = agreement."""
    pit_csv = ROOT / 'reports' / 'stuff_v1.0_2026_pitchers.csv'
    raw = EXT / 'fangraphs_stuff_2026_raw.txt'
    if not (pit_csv.exists() and raw.exists()):
        return ''
    import compare_fangraphs as c
    fg = c.parse_fg(raw)
    pit = pd.read_csv(pit_csv)
    pit['key'] = pit['player_name'].map(c.norm)
    m = fg.merge(pit[['key', 'stuff_grade']], on='key').dropna(subset=['stuff_grade'])
    if len(m) < 5:
        return ''
    m['x'] = 50 + (m['fg_stuff'] - 100)
    m['rank_gap'] = m['stuff_grade'].rank(ascending=False) - m['fg_stuff'].rank(ascending=False)
    lo = float(min(m['x'].min(), m['stuff_grade'].min())) - 3
    hi = float(max(m['x'].max(), m['stuff_grade'].max())) + 3
    W, H, L, B, T, R = 760, 520, 52, 44, 16, 16
    sx = lambda v: L + (v - lo) / (hi - lo) * (W - L - R)
    sy = lambda v: H - B - (v - lo) / (hi - lo) * (H - B - T)
    g = [f'<svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="Our Stuff Grade against FanGraphs Stuff+ for 46 starters" style="max-width:{W}px">']
    step = 5
    for v in range(int(lo // step * step), int(hi) + 1, step):
        if lo <= v <= hi:
            g.append(f'<line x1="{L}" x2="{W - R}" y1="{sy(v):.1f}" y2="{sy(v):.1f}" stroke="#efebe1"/><text x="{L - 8}" y="{sy(v) + 4:.1f}" font-size="11" fill="#8a8275" text-anchor="end">{v}</text>')
            g.append(f'<text x="{sx(v):.1f}" y="{H - B + 18}" font-size="11" fill="#8a8275" text-anchor="middle">{v}</text>')
    g.append(f'<line x1="{sx(lo):.1f}" y1="{sy(lo):.1f}" x2="{sx(hi):.1f}" y2="{sy(hi):.1f}" stroke="#1A1A1A" stroke-dasharray="4 4" opacity=".5"/>')
    label = set(m.reindex(m['rank_gap'].abs().sort_values(ascending=False).index).head(8)['name'])
    for r in m.itertuples():
        on = r.name in label
        g.append(f'<circle cx="{sx(r.x):.1f}" cy="{sy(r.stuff_grade):.1f}" r="{6 if on else 4.5}" fill="{"#FF5722" if on else "#1A1A1A"}" fill-opacity="{0.9 if on else 0.55}"><title>{html.escape(r.name)}: FanGraphs Stuff+ {r.fg_stuff:.0f} (= {r.x:.0f} on our scale), our grade {r.stuff_grade:.1f}</title></circle>')
        if on:
            g.append(f'<text x="{sx(r.x) + 8:.1f}" y="{sy(r.stuff_grade) - 7:.1f}" font-size="11" fill="#1A1A1A">{html.escape(r.name.split()[-1])}</text>')
    g.append(f'<text x="{(L + W - R) / 2:.0f}" y="{H - 6}" font-size="11" fill="#8a8275" text-anchor="middle">FanGraphs Stuff+ on our scale (50 + Stuff+ − 100)</text>')
    g.append(f'<text transform="translate(14 {(T + H - B) / 2:.0f}) rotate(-90)" font-size="11" fill="#8a8275" text-anchor="middle">The Edge Stuff Grade</text></svg>')
    return ('<div class="card"><h3 style="margin-top:0">Our grade vs FanGraphs Stuff+, one dot per qualified starter</h3>' + ''.join(g)
            + '<p class="mute">Dashed line = perfect agreement. Orange dots are the eight biggest rank disagreements; hover any dot for the numbers. The two models are scaled differently, so look at the order and the clustering more than the distance from the line.</p></div>')


def page(parts: list[tuple[str, str]], title: str) -> str:
    nav = ''.join(f'<a href="#{i}">{html.escape(t)}</a>' for i, (t, _) in [(re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-"), (t, b)) for t, b in parts])
    body = ''.join(f'<section id="{re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")}"><h1 style="font-size:20px;margin:40px 0 0;color:var(--orange);letter-spacing:.02em">{html.escape(t)}</h1>{b}</section>' for t, b in parts)
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title><style>{CSS}</style></head>'
            f'<body><div class="wrap"><div class="banner"><b>PRIVATE.</b> Contains FanGraphs numbers pasted for a one-off validation. Do not publish, commit or share this file. The Edge grades alone are in <code>models/reports/</code>.</div>'
            f'<h1>Stuff Grade · stuff_v1.0</h1><p class="mute">The Edge&apos;s own pitch model, checked against its spec tests and against FanGraphs Stuff+ (2026).</p><nav>{nav}</nav>{body}</div></body></html>')


def main() -> int:
    if '--selftest' in sys.argv:
        sample = '# T\n\n## Sec\n\nSome **bold** and `code`.\n\n- a\n- b\n\n| A | B |\n|---|---|\n| 1 | <x> |\n'
        h = md_to_html(sample)
        ok = all(k in h for k in ('<h2', '<b>bold</b>', '<code>code</code>', '<li>a</li>', '<table>', '&lt;x&gt;'))
        print('selftest', 'ok' if ok else 'FAIL'); print(h) if not ok else None
        return 0 if ok else 1
    parts: list[tuple[str, str]] = []
    val, cmp = ROOT / 'reports' / 'stuff_v1.0.md', EXT / 'stuff_v1.0_vs_fangraphs.md'
    if val.exists():
        parts.append(('Validation', md_to_html(val.read_text(encoding='utf-8'), skip_h1=True)))
    if cmp.exists():
        parts.append(('Versus FanGraphs', scatter_svg() + md_to_html(cmp.read_text(encoding='utf-8'), skip_h1=True)))
    if not parts:
        print('[render_report] no reports found yet; run the validation first')
        return 1
    EXT.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page(parts, 'Stuff Grade report'), encoding='utf-8')
    print(f'written {OUT}  ({OUT.stat().st_size // 1024} KB)  open with:  open "{OUT}"')
    return 0


if __name__ == '__main__':
    sys.exit(main())
