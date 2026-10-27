'use client'

// src/components/scout/lab/StarterViews.tsx
//
// The Starters tab's season views, one per sub header: count-state pitch mix and zone rate; platoon pitch mix and wOBA; inning by inning;
// times through the order with the xwOBA and the velocity fade; and hot zones with location habits. Tables and a zone map from one StarterProfile
// (lib/scout/starter-profile.ts, computed on the server from his season of pitches). Rates carry the pitches or plate appearances behind them.

import { useState } from 'react'
import { C, SANS } from '@/components/team/ui'
import { pitchColor } from '@/lib/mlb'
import { MIN_SAMPLE } from '@/lib/min-sample'
import type { Habit, Row, StarterProfile } from '@/lib/scout/starter-profile'
import { IX, IZ, NEUTRAL, BLUE, RED, SC, VH, VW, cellRect, kick, labelAt, mix, note, px, pz, star, tile, Pills } from '@/components/pitching-lab/LocationExplorer'

export type StarterView = 'overview' | 'count' | 'platoon' | 'innings' | 'tto' | 'zones'
export const STARTER_VIEWS: [StarterView, string][] = [
  ['overview', 'Arsenal'], ['count', 'Count state'], ['platoon', 'Platoon'], ['innings', 'Inning by inning'], ['tto', 'Times through the order'], ['zones', 'Hot zones & habits'],
]

const pc = (v: number | null, d = 0) => (v == null ? '—' : `${(v * 100).toFixed(d)}%`)
const f3 = (v: number | null) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.'))
const shade = (v: number) => `rgba(255,87,34,${(0.08 + Math.min(1, v) * 0.7).toFixed(2)})`
const CSS = `.sv-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.sv-tbl th{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a89e8c;text-align:center;padding:6px 8px;border-bottom:1px solid #e7e2d8}.sv-tbl th:first-child,.sv-tbl td:first-child{text-align:left}.sv-tbl td{text-align:center;padding:7px 8px;border-top:1px solid #fff}`

function MixHead({ p }: { p: StarterProfile }) { return <>{p.types.slice(0, 6).map(t => <th key={t.t}>{t.name}</th>)}</> }
function MixCells({ p, r }: { p: StarterProfile; r: Row }) {
  return <>{p.types.slice(0, 6).map(t => { const v = r.mix[t.t] ?? 0; return <td key={t.t} title={`${Math.round(v * r.n)} of ${r.n}`} style={{ background: r.n ? shade(v) : undefined }}>{r.n ? pc(v) : '—'}</td> })}</>
}
const nStar = (n: number) => (n < MIN_SAMPLE.arsenalPitchesPerType && n > 0 ? star : null)
const paStar = (pa: number) => (pa < 10 && pa > 0 ? star : null)

function Table({ title, rows, p, cols, foot }: { title: string; rows: Row[]; p: StarterProfile; cols: { h: string; f: (r: Row) => React.ReactNode }[]; foot?: string }) {
  return (
    <div style={{ ...tile, gridColumn: '1 / -1', overflowX: 'auto' }}>
      <div style={kick}>{title}</div>
      <table className="sv-tbl" style={{ marginTop: 6, minWidth: 640 }}>
        <thead><tr><th></th><th>Pitches</th>{cols.map(c => <th key={c.h}>{c.h}</th>)}<MixHead p={p} /></tr></thead>
        <tbody>
          {rows.map(r => <tr key={r.label}><td style={{ fontWeight: 800 }}>{r.label}</td><td>{r.n}{nStar(r.n)}</td>{cols.map(c => <td key={c.h}>{c.f(r)}</td>)}<MixCells p={p} r={r} /></tr>)}
        </tbody>
      </table>
      <p style={note}>The coloured cells are the share of his pitches of each type in that row; darker is a larger share. {star} marks a small sample.{foot ? ` ${foot}` : ''}</p>
    </div>
  )
}

function HabitTable({ title, rows }: { title: string; rows: Habit[] }) {
  return (
    <div style={{ ...tile, overflowX: 'auto' }}>
      <div style={kick}>{title}</div>
      <table className="sv-tbl" style={{ marginTop: 6, minWidth: 360 }}>
        <thead><tr><th></th><th>Pitches</th><th>Up</th><th>Down</th><th>Arm side</th><th>Glove side</th><th>In zone</th></tr></thead>
        <tbody>{rows.map(h => <tr key={h.label}><td style={{ fontWeight: 800 }}>{h.label}</td><td>{h.n}</td><td>{pc(h.up)}</td><td>{pc(h.down)}</td><td>{pc(h.armSide)}</td><td>{pc(h.gloveSide)}</td><td>{pc(h.inZone)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

export default function StarterViews({ p, view, name }: { p: StarterProfile; view: Exclude<StarterView, 'overview'>; name: string }) {
  const [zm, setZm] = useState<'share' | 'xwoba' | 'whiff'>('share')
  const style = <style>{CSS}</style>
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14, fontFamily: SANS }

  if (view === 'count') return (
    <div style={grid}>{style}
      <Table title="Count-state pitch mix and zone rate" rows={p.countState} p={p} foot="Zone is the share of his pitches in the strike zone; chase is swings on pitches outside it."
        cols={[{ h: 'Zone', f: r => pc(r.zonePct) }, { h: 'Swing', f: r => pc(r.swingPct) }, { h: 'Whiff', f: r => pc(r.whiffPct) }, { h: 'Chase', f: r => pc(r.chasePct) }]} />
    </div>
  )

  if (view === 'platoon') return (
    <div style={grid}>{style}
      <Table title="Platoon pitch mix and wOBA" rows={p.platoon} p={p} foot="wOBA and xwOBA are against the plate appearances he finished against that side."
        cols={[{ h: 'PA', f: r => <>{r.pa}{paStar(r.pa)}</> }, { h: 'wOBA', f: r => f3(r.woba) }, { h: 'xwOBA', f: r => f3(r.xwoba) }, { h: 'K', f: r => pc(r.kPct) }, { h: 'BB', f: r => pc(r.bbPct) }, { h: 'Hard-hit', f: r => pc(r.hardPct) }]} />
      <div style={{ ...tile, gridColumn: '1 / -1', overflowX: 'auto' }}>
        <div style={kick}>Each pitch against each side</div>
        <table className="sv-tbl" style={{ marginTop: 6, minWidth: 520 }}>
          <thead><tr><th>Pitch</th><th colSpan={3}>Left-handed hitters</th><th colSpan={3}>Right-handed hitters</th></tr><tr><th></th>{['Thrown', 'Whiff', 'xwOBA', 'Thrown', 'Whiff', 'xwOBA'].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>
            {p.types.map(t => { const l = p.platoonByPitch.find(x => x.type === t.t && x.side === 'L'), r = p.platoonByPitch.find(x => x.type === t.t && x.side === 'R'); return (
              <tr key={t.t}><td style={{ fontWeight: 800 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 999, background: pitchColor(t.t) }} />{t.name}</span></td>
                <td>{l?.n ?? 0}{nStar(l?.n ?? 0)}</td><td>{pc(l?.whiffPct ?? null)}</td><td>{f3(l?.xwoba ?? null)}</td>
                <td>{r?.n ?? 0}{nStar(r?.n ?? 0)}</td><td>{pc(r?.whiffPct ?? null)}</td><td>{f3(r?.xwoba ?? null)}</td></tr>
            ) })}
          </tbody>
        </table>
      </div>
    </div>
  )

  if (view === 'innings') {
    const first = p.innings.find(r => r.fbVelo != null)?.fbVelo ?? null
    return (
      <div style={grid}>{style}
        <Table title="Inning by inning" rows={p.innings} p={p} foot={`Speed is his ${p.types.find(t => t.t === p.fastball)?.name ?? 'fastball'}; the number beside it is the change from his first inning with a reading.`}
          cols={[{ h: 'PA', f: r => <>{r.pa}{paStar(r.pa)}</> }, { h: 'Zone', f: r => pc(r.zonePct) }, { h: 'Whiff', f: r => pc(r.whiffPct) }, { h: 'xwOBA', f: r => f3(r.xwoba) }, { h: 'K', f: r => pc(r.kPct) }, { h: 'BB', f: r => pc(r.bbPct) },
            { h: 'Speed', f: r => r.fbVelo == null ? '—' : <>{r.fbVelo.toFixed(1)}{first != null && Math.abs(r.fbVelo - first) >= 0.1 && <span style={{ color: r.fbVelo - first < 0 ? '#D4533B' : '#1D9E75', marginLeft: 4, fontSize: 11 }}>{r.fbVelo - first > 0 ? '+' : ''}{(r.fbVelo - first).toFixed(1)}</span>}</> }]} />
      </div>
    )
  }

  if (view === 'tto') {
    const first = p.tto[0]?.fbVelo ?? null
    return (
      <div style={grid}>{style}
        <Table title="Times-through-order xwOBA and velo drop-off" rows={p.tto} p={p} foot={`Times through is how many plate appearances that hitter has had against him in the game. Speed is his ${p.types.find(t => t.t === p.fastball)?.name ?? 'fastball'}; the number beside it is the change from the first time through.`}
          cols={[{ h: 'PA', f: r => <>{r.pa}{paStar(r.pa)}</> }, { h: 'xwOBA', f: r => f3(r.xwoba) }, { h: 'wOBA', f: r => f3(r.woba) }, { h: 'K', f: r => pc(r.kPct) }, { h: 'BB', f: r => pc(r.bbPct) }, { h: 'Hard-hit', f: r => pc(r.hardPct) },
            { h: 'Speed', f: r => r.fbVelo == null ? '—' : <>{r.fbVelo.toFixed(1)}{first != null && r !== p.tto[0] && <span style={{ color: r.fbVelo - first < 0 ? '#D4533B' : '#1D9E75', marginLeft: 4, fontSize: 11 }}>{r.fbVelo - first > 0 ? '+' : ''}{(r.fbVelo - first).toFixed(1)}</span>}</> }]} />
      </div>
    )
  }

  // zones
  const all = p.zones
  const overall = (() => { const w = all.filter(z => z.xwoba != null && z.n > 0); const t = w.reduce((s, z) => s + z.n, 0); return t ? w.reduce((s, z) => s + (z.xwoba as number) * z.n, 0) / t : null })()
  const maxShare = Math.max(0.0001, ...all.map(z => z.share))
  const fill = (z: (typeof all)[number]) => {
    if (z.n === 0) return '#faf8f3'
    if (zm === 'share') return mix([253, 246, 236], [255, 138, 92], z.share / maxShare)
    if (zm === 'xwoba') { if (z.xwoba == null || overall == null || z.n < MIN_SAMPLE.zoneCellPitches) return '#faf8f3'; const d = Math.max(-1, Math.min(1, (z.xwoba - overall) / 0.15)); return d >= 0 ? mix(NEUTRAL, RED, d) : mix(NEUTRAL, BLUE, -d) }
    if (z.whiffPct == null || z.n < MIN_SAMPLE.zoneCellPitches) return '#faf8f3'
    return mix(NEUTRAL, BLUE, Math.min(1, z.whiffPct / 0.4))
  }
  return (
    <div style={grid}>{style}
      <div style={{ ...tile, minWidth: 0 }}>
        <div style={kick}>Pitcher hot zones · batter&apos;s view</div>
        <div style={{ margin: '8px 0' }}><Pills items={[['share', 'Where he throws'], ['xwoba', 'xwOBA against'], ['whiff', 'Whiffs']] as ['share' | 'xwoba' | 'whiff', string][]} value={zm} onChange={setZm} /></div>
        <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`${name} by zone`} style={{ width: '100%', maxWidth: 440, height: 'auto', display: 'block', margin: '0 auto' }}>
          {all.filter(z => Number(z.zone) >= 11).concat(all.filter(z => Number(z.zone) <= 9)).map(z => {
            const r = cellRect(z.zone), L = labelAt(z.zone), inner = Number(z.zone) <= 9
            const text = zm === 'share' ? pc(z.share) : zm === 'xwoba' ? f3(z.xwoba) : pc(z.whiffPct)
            return (
              <g key={z.zone}>
                <rect x={px(r.x0)} y={pz(r.z1)} width={(r.x1 - r.x0) * SC} height={(r.z1 - r.z0) * SC} fill={fill(z)} stroke="#fff" strokeWidth={2} />
                <text x={L.x} y={L.y - 2} textAnchor="middle" fontSize={inner ? 19 : 16} fontWeight="800" fill={C.ink} fontFamily={SANS}>{text}{zm !== 'share' && z.n < MIN_SAMPLE.zoneCellPitches && z.n > 0 ? '*' : ''}</text>
                <text x={L.x} y={L.y + 14} textAnchor="middle" fontSize="11" fill="#5b5347" fontFamily={SANS}>n = {z.n}</text>
              </g>
            )
          })}
          <rect x={px(IX[0])} y={pz(IZ[0])} width={(IX[3] - IX[0]) * SC} height={(IZ[0] - IZ[3]) * SC} fill="none" stroke="#1A1A1A" strokeWidth="2" pointerEvents="none" />
        </svg>
        <p style={note}>{zm === 'share' ? 'Share of his pitches in each zone.' : zm === 'xwoba' ? 'xwOBA on the plate appearances that ended in each zone; blue is better for him than his own average, red better for the hitter.' : 'Swings and misses per swing; darker blue is more.'} {star} marks under {MIN_SAMPLE.zoneCellPitches} pitches.</p>
      </div>
      <HabitTable title="Location habits by count" rows={p.habits.byCount} />
      <HabitTable title="Location habits by hitter side" rows={p.habits.bySide} />
      <p style={{ ...note, gridColumn: '1 / -1' }}>Up is above 3.0 feet and down is below 2.0; arm side and glove side are outside the width of the plate on his arm side or glove side. These describe where the pitches have gone, not where the next one will.</p>
    </div>
  )
}
