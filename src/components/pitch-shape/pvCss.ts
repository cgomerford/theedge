// src/components/pitch-shape/pvCss.ts
//
// Shared styles for the Pitching Lab / Pitch Shape Lab screens (PitchView, PitchCompare, PitchFinder). Kept apart from
// PitchView so a screen that only needs the buttons and tables does not load the 3D scene code.
// Plain CSS (not Tailwind): responsive layout via @media, per DESIGN_SYSTEM.md. One font only (Outfit via var).
// Lab look: hairline rules, 8px controls, readout rows, tabular numbers, sample size on everything.
export const PV_CSS = `
.pv-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start}
@media(max-width:900px){.pv-grid{grid-template-columns:1fr}}
.pv-side{display:flex;flex-direction:column;gap:12px}
@media(min-width:901px){.pv-side{position:sticky;top:96px;max-height:calc(100vh - 112px);overflow-y:auto;scrollbar-width:thin}}
.pv-stage{position:relative;aspect-ratio:16/10;max-height:400px;width:100%;border-radius:14px;overflow:hidden;border:1px solid #e7e2d8;
 background:linear-gradient(#e7e2d8 1px,transparent 1px) 0 0/40px 40px,linear-gradient(90deg,#e7e2d8 1px,transparent 1px) 0 0/40px 40px,#FAF8F3}
@media(max-width:640px){.pv-stage{aspect-ratio:1/1;max-height:none}}
.pv-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:10px 0}
.pv-k{font-size:10px;letter-spacing:.14em;font-weight:800;color:#FF5722;text-transform:uppercase;margin-right:4px}
.pv-pill{font:600 12px var(--font-outfit),system-ui,sans-serif;border:1px solid #e7e2d8;background:#fff;border-radius:8px;padding:6px 12px;cursor:pointer;color:#1A1A1A}
.pv-pill.gold{background:#FFF4CC;border-color:#EBC24A;color:#7A5800}
.pv-pill.on.gold{background:#1A1A1A;border-color:#F5B800;color:#F5B800}
.pv-pill.on{background:#1A1A1A;color:#FAF8F3;border-color:#1A1A1A}
.pv-panel{background:#fff;border:1px solid #e7e2d8;border-radius:14px;padding:14px}
.pv-read{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}
.pv-read td{padding:6px 0;border-bottom:1px solid #f1eee6}
.pv-read tr:last-child td{border-bottom:0}
.pv-read td:first-child{color:#8a8275;font-size:10px;letter-spacing:.12em;font-weight:800;text-transform:uppercase}
.pv-read td.v{text-align:right;font-weight:800;font-size:15px;font-variant-numeric:tabular-nums}
.pv-read td.v small{font-size:11px;font-weight:600;color:#8a8275;margin-left:3px}
.pv-read td.d{text-align:right;width:70px;font-size:11px;font-weight:700;color:#8a8275;font-variant-numeric:tabular-nums}
.pv-read td.s{text-align:right;width:58px}
.pv-read tr.hl td{background:#fff3ee}
.pv-foot{font-size:10.5px;line-height:1.5;color:#a89e8c;margin-top:8px}
.pv-notes summary{cursor:pointer;list-style:none}
.pv-notes summary::-webkit-details-marker{display:none}
.pv-note{font-size:12px;line-height:1.5;color:#5b5347;margin:8px 0 0}
.pv-note b{color:#1A1A1A}
.pv-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#5b5347;margin-top:8px}
.pv-leg b{display:inline-block;width:22px;height:0;border-top:3px solid #FF5722;vertical-align:middle;margin-right:6px}
.pv-leg b.d{border-top:2px dashed #6b6558}
.pv-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums;background:#fff;border:1px solid #e7e2d8}
.pv-tbl th{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#8a8275;font-weight:800;text-align:right;padding:8px 10px;border-bottom:1px solid #1A1A1A;white-space:nowrap}
.pv-tbl td{padding:8px 10px;text-align:right;border-bottom:1px solid #f1eee6;white-space:nowrap}
.pv-tbl th:first-child,.pv-tbl td:first-child{text-align:left;font-weight:800}
.pv-tbl tr.sel td{background:#fff3ee}.pv-tbl tr.small td{color:#a89e8c}.pv-tbl td.hl{background:#fff3ee}
.pv-tbl td.gold{background:#FFF4CC;color:#7A5800;font-weight:800}
.pv-flag{display:inline-block;font-size:9px;letter-spacing:.1em;font-weight:800;border-radius:5px;padding:2px 6px;margin-left:6px;vertical-align:1px;text-transform:uppercase;color:#fff}
.pv-flag.g{background:#1D9E75}.pv-flag.gd{background:#F5B800;color:#1A1A1A}.pv-flag.r{background:#D4533B}
`
