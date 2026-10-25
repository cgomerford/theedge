// src/components/pitch-shape/parts.tsx
//
// Small presentational pieces shared by the Shape tab and the Shape Sandbox: outcome bars, the
// arm-slot strip, locked card, status badge and the map legend. No hooks, no data fetching — every
// number comes in through props from src/lib/pitch-shape/model.ts. One font (Red Hat via SANS).

import Link from 'next/link'
import { C, SANS, Foot } from '@/components/team/ui'
import { ProBadge } from '@/components/profile/ProPanel'
import {
  GATE, SLOT_BANDS, fmtN, pct, woba,
  type LeagueAverages, type Reach, type ShapeLookup, type SlotRead,
} from '@/lib/pitch-shape/model'

export const RAMP = ['#FFF3EA', '#FFD9C2', '#FFB48A', '#FF8A55', '#FF5722', '#D63A0E', '#9B2A09']
export const rampColor = (x: number, lo: number, hi: number) =>
  RAMP[Math.round(Math.max(0, Math.min(1, (x - lo) / (hi - lo))) * (RAMP.length - 1))]
export const MAP_LO = 0.10
export const MAP_HI = 0.50

/** Plain-CSS responsive layout (Tailwind responsive classes are unreliable under Turbopack). */
export const SHAPE_CSS = `
.ps-grid2{display:grid;grid-template-columns:1.15fr 1fr;gap:16px}
.ps-grid2e{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.ps-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.ps-shift{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.ps-gates{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:10px 0}
.ps-sbx{display:grid;grid-template-columns:330px 1fr;gap:16px}
.ps-orow{display:grid;grid-template-columns:130px 1fr 112px;gap:10px;align-items:center;padding:9px 0;border-top:1px solid ${C.soft}}
.ps-orow:first-child{border-top:0}
.ps-tbl{width:100%;border-collapse:collapse;font-size:13px}
.ps-tbl th{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${C.mute};text-align:left;padding:6px 8px;font-weight:700;border-bottom:1px solid ${C.line}}
.ps-tbl td{padding:9px 8px;border-bottom:1px solid ${C.soft}}
.ps-tbl .r{text-align:right}
.ps-chip{border:1px solid ${C.line};background:#fff;border-radius:999px;padding:6px 13px;font-weight:600;font-size:13px;cursor:pointer;color:${C.ink}}
.ps-chip.on{background:${C.ink};color:#fff;border-color:${C.ink}}
.ps-chip:focus-visible,.ps-range:focus-visible,.ps-select:focus-visible{outline:2px solid ${C.orange};outline-offset:2px}
.ps-range{width:100%;accent-color:${C.orange}}
.ps-select{width:100%;padding:8px;border:1px solid ${C.line};border-radius:8px;background:#fff;font-size:13px;font-weight:600}
@media(max-width:900px){
  .ps-grid2,.ps-grid2e,.ps-sbx,.ps-gates{grid-template-columns:1fr}
  .ps-tiles,.ps-shift{grid-template-columns:1fr 1fr}
  .ps-orow{grid-template-columns:1fr;gap:4px}
}
`

export function StatusBadge({ reach }: { reach: Reach }) {
  const s = reach === 1 ? { bg: '#e3f3ec', fg: '#0f6e52', t: '±1 bin' }
    : reach === 2 ? { bg: '#fbf1d2', fg: '#7a5a05', t: 'widened to ±2' }
    : { bg: C.soft, fg: C.mute, t: 'Too thin' }
  return <span style={{ display: 'inline-block', background: s.bg, color: s.fg, fontSize: 10, fontWeight: 800, letterSpacing: '.08em', borderRadius: 6, padding: '3px 7px', textTransform: 'uppercase' }}>{s.t}</span>
}

export function EmptyBox({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 12, padding: 16, textAlign: 'center', color: C.mute, fontSize: 13, background: 'repeating-linear-gradient(135deg,transparent 0 7px,rgba(0,0,0,.025) 7px 8px)' }}>
      <b style={{ display: 'block', color: C.ink, fontSize: 14, marginBottom: 2 }}>{title}</b>
      {children}
    </div>
  )
}

/** Locked state: what is inside, an upgrade link, and NO numbers (CLAUDE.md: empty state over fabricated data). */
export function LockedCard({ title, features, note }: { title: string; features: string[]; note?: string }) {
  return (
    <div style={{ border: `1.5px dashed ${C.ink}`, borderRadius: 14, padding: 20, background: '#fff' }}>
      <ProBadge />
      <h4 style={{ margin: '8px 0 4px', fontSize: 17, fontWeight: 800 }}>{title}</h4>
      {note && <p style={{ color: '#5b5347', fontSize: 13, margin: '4px 0 8px' }}>{note}</p>}
      <ul style={{ margin: '6px 0 12px', paddingLeft: 18, color: '#5b5347', fontSize: 13 }}>
        {features.map(f => <li key={f}>{f}</li>)}
      </ul>
      <Link href="/pricing" style={{ display: 'inline-block', background: C.orange, color: '#fff', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Unlock with Pro</Link>
    </div>
  )
}

export function MapLegend({ withPitcher }: { withPitcher: boolean }) {
  const k: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5 }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.mute, marginTop: 6, flexWrap: 'wrap' }}>
      <span>Whiff per swing</span><span>{pct(MAP_LO, 0)}</span>
      <span style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden' }}>
        {RAMP.map(c => <span key={c} style={{ width: 22, height: 10, background: c }} />)}
      </span>
      <span>{pct(MAP_HI, 0)}</span>
      <span style={k}><span style={{ width: 14, height: 10, border: `1px solid ${C.line}`, background: `repeating-linear-gradient(135deg,#fff 0 3px,${C.line} 3px 4px)` }} />under {GATE.swings} swings</span>
      {withPitcher && <>
        <span style={k}><span style={{ width: 9, height: 9, borderRadius: '50%', background: C.ink, border: '1.5px solid #fff', boxShadow: `0 0 0 1px ${C.ink}` }} />his pitches</span>
        <span style={k}><span style={{ width: 14, height: 9, border: `1.5px solid ${C.ink}`, borderRadius: '50%' }} />±1 SD</span>
      </>}
    </div>
  )
}

type BarRow = { n: string; sub: string; value: number | null; reach: Reach; avg: number | null; scale: number; f: (x: number | null) => string; cnt: string; need: string; have: number }

export function OutcomeBars({ look, league }: { look: ShapeLookup; league: LeagueAverages }) {
  const rows: BarRow[] = [
    { n: 'Whiff%', sub: 'per swing', value: look.whiff.value, reach: look.whiff.reach, avg: league.whiff, scale: 0.6, f: pct, cnt: `n = ${fmtN(look.swings)} swings`, need: `needs ${GATE.swings} swings`, have: look.swings },
    { n: 'CSW%', sub: 'called + swinging strikes, per pitch', value: look.csw.value, reach: look.csw.reach, avg: league.csw, scale: 0.6, f: pct, cnt: `n = ${fmtN(look.pitches)} pitches`, need: `needs ${GATE.pitches} pitches`, have: look.pitches },
    { n: 'GB%', sub: 'per batted ball', value: look.gb.value, reach: look.gb.reach, avg: league.gb, scale: 0.8, f: pct, cnt: `n = ${fmtN(look.bbe)} BBE`, need: `needs ${GATE.bbe} batted balls`, have: look.bbe },
    { n: 'xwOBA on contact', sub: 'per batted ball', value: look.xwobaCon.value, reach: look.xwobaCon.reach, avg: league.xwobaCon, scale: 0.6, f: woba, cnt: `n = ${fmtN(look.bbe)} BBE`, need: `needs ${GATE.bbe} batted balls`, have: look.bbe },
  ]
  return (
    <div>
      {rows.map(r => (
        <div className="ps-orow" key={r.n}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{r.n}<small style={{ display: 'block', fontWeight: 500, fontSize: 11, color: C.mute }}>{r.sub}</small></div>
          {r.value == null ? (
            <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, color: C.mute, textAlign: 'center' }}>Not enough sample — {r.need} (has {fmtN(r.have)})</div>
          ) : (
            <div style={{ position: 'relative', height: 16, background: C.soft, borderRadius: 4 }} title={r.avg != null ? `league average ${r.f(r.avg)}` : undefined}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, (r.value / r.scale) * 100)}%`, background: C.orange, borderRadius: '0 4px 4px 0' }} />
              {r.avg != null && <div style={{ position: 'absolute', top: -4, bottom: -4, width: 2, background: C.ink, left: `${Math.min(100, (r.avg / r.scale) * 100)}%` }} />}
            </div>
          )}
          <div style={{ textAlign: 'right', fontWeight: 800, fontSize: 15, fontFamily: SANS }}>
            {r.value == null ? '—' : <>{r.f(r.value)} {r.reach === 2 && <StatusBadge reach={2} />}<small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 11 }}>{r.cnt} · league {r.f(r.avg)}</small></>}
          </div>
        </div>
      ))}
    </div>
  )
}

export function SlotStrip({ reads }: { reads: SlotRead[] }) {
  const col = (r: SlotRead) => {
    const gated = r.whiff == null
    return (
      <div key={r.slot} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%', textAlign: 'center', fontSize: 11, color: C.mute }}>
        {!gated && <b style={{ color: C.ink, fontSize: 12, fontWeight: 800, marginBottom: 2 }}>{pct(r.whiff, 0)}{r.widened ? '*' : ''}</b>}
        <div style={{
          width: '100%', borderRadius: '4px 4px 0 0', minHeight: 2,
          height: gated ? 26 : ((r.whiff as number) / 0.6) * 110,
          background: gated ? `repeating-linear-gradient(135deg,#fff 0 3px,${C.line} 3px 4px)` : C.orange,
          border: gated ? `1px dashed ${C.line}` : undefined,
          boxShadow: r.current ? `0 0 0 2px ${C.ink}` : undefined,
        }} />
        <span>n={fmtN(r.swings)}</span>
      </div>
    )
  }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${SLOT_BANDS.length},1fr)`, gap: 6, alignItems: 'end', height: 150 }}>{reads.map(col)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${SLOT_BANDS.length},1fr)`, gap: 6, textAlign: 'center', fontSize: 11, fontWeight: 700, marginTop: 4 }}>
        {reads.map(r => <span key={r.slot} style={{ color: r.current ? C.orange : undefined }}>{r.slot}°</span>)}
      </div>
      <Foot>Arm angle band · whiff% per swing for this exact velocity / IVB / HB. * widened to ±2 bins. Hatched = under {GATE.swings} swings, no rate shown. Outlined = the band he throws from.</Foot>
    </div>
  )
}
