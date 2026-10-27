'use client'

// src/components/pitching-lab/LocationExplorer.tsx
//
// Pitching Lab → Location Lab. Where each pitch is thrown and what happens there, zone by zone, from the season's per-pitch log
// (src/lib/pitcher-pitch-log.ts): pitches, share, xwOBA, BA, SLG, whiffs, takes, called strikes and hard-hit, for any pitch, either
// batter side, and any count. The zone map is shaded against this pitcher's own overall number for the same pitches (blue is better
// for him, red is better for the hitter), so there is no league table in it. Click a zone for every number behind it.
// Zone maths lives in src/lib/zone-stats.ts. Zone numbers are Savant's own; the box is the average strike zone (1.5 to 3.5 ft).

import { useEffect, useMemo, useState } from 'react'
import { C, SANS } from '@/components/team/ui'
import { pitchColor } from '@/lib/mlb'
import { MIN_SAMPLE } from '@/lib/min-sample'
import type { PitcherPitchLog, RawPitch } from '@/lib/pitcher-pitch-log'
import { ALL_ZONES, IN_ZONE, METRIC_DEFS, OUT_ZONE, aggregate, merge, metric, smallFor, type Agg, type MetricKey } from '@/lib/zone-stats'
import { SmoothHeatmap } from './ArsenalExtras'

const tile: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, minWidth: 0, fontFamily: SANS }
const kick: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.14em', color: C.orange, textTransform: 'uppercase' }
const note: React.CSSProperties = { margin: '8px 0 0', fontSize: 12, color: C.mute, lineHeight: 1.5 }

type Hand = 'all' | 'L' | 'R'
type CountKey = 'all' | 'first' | 'ahead' | 'behind' | 'two'
const COUNTS: [CountKey, string, (p: RawPitch) => boolean][] = [
  ['all', 'Any count', () => true],
  ['first', 'First pitch', p => p.balls === 0 && p.strikes === 0],
  ['ahead', 'Ahead', p => p.balls != null && p.strikes != null && p.strikes > p.balls],
  ['behind', 'Behind', p => p.balls != null && p.strikes != null && p.balls > p.strikes],
  ['two', 'Two strikes', p => p.strikes === 2],
]
const HANDS: [Hand, string][] = [['all', 'All hitters'], ['L', 'vs left-handed'], ['R', 'vs right-handed']]

// Geometry in feet, batter's view. The nine inner cells are the strike zone; the outer box holds the four corners (11 to 14).
const IX = [-0.83, -0.277, 0.277, 0.83], IZ = [3.5, 2.833, 2.167, 1.5]
const OX0 = -1.5, OX1 = 1.5, OZ0 = 0.7, OZ1 = 4.3
const VW = 420, SC = VW / (OX1 - OX0), VH = SC * (OZ1 - OZ0)
const px = (x: number) => (x - OX0) * SC, pz = (z: number) => (OZ1 - z) * SC

function cellRect(z: string): { x0: number; x1: number; z0: number; z1: number } {
  const n = Number(z)
  if (n >= 1 && n <= 9) { const r = Math.floor((n - 1) / 3), c = (n - 1) % 3; return { x0: IX[c], x1: IX[c + 1], z0: IZ[r + 1], z1: IZ[r] } }
  const left = n === 11 || n === 13, top = n === 11 || n === 12
  return { x0: left ? OX0 : 0, x1: left ? 0 : OX1, z0: top ? 2.5 : OZ0, z1: top ? OZ1 : 2.5 }
}
function labelAt(z: string): { x: number; y: number } {
  const n = Number(z)
  if (n >= 1 && n <= 9) { const r = cellRect(z); return { x: px((r.x0 + r.x1) / 2), y: pz((r.z0 + r.z1) / 2) } }
  return { x: px(n === 11 || n === 13 ? -1.17 : 1.17), y: pz(n === 11 || n === 12 ? 3.9 : 1.1) }
}

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const k = Math.max(0, Math.min(1, t))
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`
}
const NEUTRAL: [number, number, number] = [244, 241, 234], BLUE: [number, number, number] = [108, 171, 221], RED: [number, number, number] = [212, 83, 59], ORANGE: [number, number, number] = [255, 138, 92]

function fill(key: MetricKey, v: number | null, overall: number | null, max: number): string {
  if (v == null) return '#faf8f3'
  const def = METRIC_DEFS.find(m => m.key === key)!
  if (def.dir === 'volume') return mix([253, 246, 236], ORANGE, max > 0 ? v / max : 0)
  if (overall == null) return mix(NEUTRAL, NEUTRAL, 0)
  const d = Math.max(-1, Math.min(1, (v - overall) / def.spread))
  const hitterGood = def.dir === 'hitter' ? d : -d      // positive = better for the hitter
  return hitterGood >= 0 ? mix(NEUTRAL, RED, hitterGood) : mix(NEUTRAL, BLUE, -hitterGood)
}

const star = <span style={{ color: '#D4533B', fontWeight: 800 }}>*</span>
const zoneName = (z: string) => (z === 'all' ? 'All zones' : Number(z) <= 9 ? `Zone ${z}${z === '5' ? ' (middle)' : ''}` : `Corner ${z}`)

function Pills<T extends string>({ items, value, onChange }: { items: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '3px 10px', cursor: 'pointer', border: `1px solid ${value === k ? C.orange : C.line}`, background: value === k ? '#fff1ea' : '#fff', color: value === k ? C.orange : C.ink }}>{l}</button>
      ))}
    </div>
  )
}

export default function LocationExplorer({ pitcherId }: { pitcherId: number }) {
  const [log, setLog] = useState<PitcherPitchLog | null | 'error'>(null)
  const [pitch, setPitch] = useState('ALL')
  const [hand, setHand] = useState<Hand>('all')
  const [count, setCount] = useState<CountKey>('all')
  const [key, setKey] = useState<MetricKey>('xwoba')
  const [zone, setZone] = useState('all')
  const season = new Date().getFullYear()
  const cellMin = MIN_SAMPLE.zoneCellPitches

  useEffect(() => {
    let off = false
    fetch(`/api/mlb/pitch-log?playerId=${pitcherId}&season=${season}`)
      .then(r => r.json()).then(j => { if (!off) setLog(j.error ? 'error' : j) }).catch(() => { if (!off) setLog('error') })
    return () => { off = true }
  }, [pitcherId, season])

  const types = useMemo(() => {
    if (!log || log === 'error') return []
    const by = new Map<string, number>()
    for (const p of log.pitches) by.set(p.pitchType, (by.get(p.pitchType) ?? 0) + 1)
    return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ t, n, name: log.pitchNames[t] ?? t }))
  }, [log])

  const countFn = COUNTS.find(c => c[0] === count)![2]
  const pitches = useMemo(() => {
    if (!log || log === 'error') return []
    return log.pitches.filter(p => (pitch === 'ALL' || p.pitchType === pitch) && (hand === 'all' || p.stand === hand) && countFn(p))
  }, [log, pitch, hand, countFn])
  const agg = useMemo(() => aggregate(pitches), [pitches])

  if (log === 'error') return <p style={{ fontFamily: SANS, fontSize: 14, color: C.mute, padding: '24px 0' }}>Couldn&apos;t load this pitcher&apos;s pitches right now.</p>
  if (log === null) return <p style={{ fontFamily: SANS, fontSize: 14, color: C.mute, padding: '24px 0' }}>Loading every pitch…</p>

  const total = agg.all.n
  const def = METRIC_DEFS.find(m => m.key === key)!
  const overall = metric(agg.all, key, total).v
  const zoneVals = ALL_ZONES.map(z => metric(agg.byZone[z], key, total).v)
  const max = Math.max(0, ...zoneVals.filter((v): v is number => v != null))
  const sel = zone === 'all' ? agg.all : agg.byZone[zone]
  const name = pitch === 'ALL' ? 'All pitches' : log.pitchNames[pitch] ?? pitch
  const mixed = (zs: readonly string[]) => merge(zs.map(z => agg.byZone[z]))
  const groups: [string, Agg][] = [['Strike zone (1–9)', mixed(IN_ZONE)], ['Middle (5)', agg.byZone['5']], ['Corners (11–14)', mixed(OUT_ZONE)]]
  const zonedTotal = groups[0][1].n + groups[2][1].n

  // The same pitch against each side, ignoring the hitter-side pick, so the two can sit next to each other.
  const sideAgg = (h: Hand) => aggregate(log.pitches.filter(p => (pitch === 'ALL' || p.pitchType === pitch) && (h === 'all' || p.stand === h) && countFn(p)))

  const cell = (a: Agg, k: MetricKey) => { const m = metric(a, k, total); return { ...m, small: smallFor(k, m.chances, cellMin) } }
  const detail: [string, string, string?][] = (() => {
    const m = (k: MetricKey) => cell(sel, k)
    return [
      ['Pitches', String(sel.n), total > 0 ? `${((sel.n / total) * 100).toFixed(1)}% of these pitches` : undefined],
      ['xwOBA', m('xwoba').text, `${sel.den} plate appearances ended here`],
      ['BA', m('ba').text, `${sel.hits} for ${sel.ab} at-bats`],
      ['SLG', m('slg').text, `${sel.bases} total bases`],
      ['Hard-hit', m('hard').text, `${sel.hard} of ${sel.bbe} balls in play`],
      ['Whiff', m('whiff').text, `${sel.whiffs} misses on ${sel.swings} swings`],
      ['Swing', m('swing').text, `${sel.swings} of ${sel.n} pitches`],
      ['Take', m('take').text, `${sel.takes} of ${sel.n} pitches`],
      ['Called strike', m('called').text, `${sel.called} of ${sel.n} pitches`],
    ]
  })()

  return (
    <div className="loc-grid">
      <style>{`.loc-grid{display:grid;grid-template-columns:210px minmax(0,1fr);gap:24px;align-items:start}.loc-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.loc-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:8px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:14px;color:#1A1A1A;font-family:inherit}.loc-btn small{display:block;font-weight:600;font-size:12px;color:#8a8275}.loc-btn.on{border-color:#FF5722;background:#fff1ea}.loc-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.loc-span2{grid-column:span 2}.loc-span3{grid-column:1 / -1}.loc-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.loc-tbl th{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a89e8c;text-align:right;padding:6px 8px;border-bottom:1px solid #e7e2d8}.loc-tbl th:first-child,.loc-tbl td:first-child{text-align:left}.loc-tbl td{text-align:right;padding:7px 8px;border-top:1px solid #f1eee6}.loc-tbl tr.sel td{background:#fff1ea}.loc-tbl tr.clk{cursor:pointer}@media (max-width:1180px){.loc-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.loc-span3{grid-column:1 / -1}}@media (max-width:860px){.loc-grid{grid-template-columns:minmax(0,1fr)}.loc-side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.loc-btn{width:auto;white-space:nowrap}.loc-tiles{grid-template-columns:minmax(0,1fr)}.loc-span2{grid-column:auto}}`}</style>

      <nav className="loc-side" aria-label="Pitch types">
        <button type="button" className={`loc-btn${pitch === 'ALL' ? ' on' : ''}`} onClick={() => setPitch('ALL')}>
          <span style={{ width: 14, height: 14, borderRadius: 999, background: '#1A1A1A', flexShrink: 0 }} />
          <span>All pitches<small>{log.pitches.length} pitches</small></span>
        </button>
        {types.map(t => (
          <button key={t.t} type="button" className={`loc-btn${pitch === t.t ? ' on' : ''}`} onClick={() => setPitch(t.t)}>
            <span style={{ width: 14, height: 14, borderRadius: 999, background: pitchColor(t.t), flexShrink: 0 }} />
            <span>{t.name}<small>{((t.n / log.pitches.length) * 100).toFixed(0)}% · {t.n} pitches</small></span>
          </button>
        ))}
      </nav>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em', fontFamily: SANS }}>{name}</h2>
          <span style={{ fontSize: 15, color: '#5b5347', fontFamily: SANS }}>{total} pitches{pitch !== 'ALL' || hand !== 'all' || count !== 'all' ? ' in this view' : ' this season'}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
          <Pills items={HANDS} value={hand} onChange={setHand} />
          <Pills items={COUNTS.map(c => [c[0], c[1]] as [CountKey, string])} value={count} onChange={setCount} />
        </div>

        {total === 0 ? <p style={{ fontFamily: SANS, fontSize: 14, color: C.mute }}>No pitches match this view.</p> : (
          <div className="loc-tiles">
            <div className="loc-span2" style={tile}>
              <div style={kick}>{name} · what happens in each zone · batter&apos;s view</div>
              <div style={{ margin: '8px 0' }}><Pills items={METRIC_DEFS.map(m => [m.key, m.label] as [MetricKey, string])} value={key} onChange={setKey} /></div>
              <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`${def.label} by zone`} style={{ width: '100%', maxWidth: 520, height: 'auto', display: 'block', margin: '0 auto' }}>
                {[...OUT_ZONE, ...IN_ZONE].map(z => {
                  const r = cellRect(z), a = agg.byZone[z], m = cell(a, key), L = labelAt(z), on = zone === z
                  const inner = Number(z) <= 9
                  return (
                    <g key={z} onClick={() => setZone(on ? 'all' : z)} style={{ cursor: 'pointer' }} role="button" aria-label={`${zoneName(z)}: ${def.label} ${m.text}, ${a.n} pitches`}>
                      <rect x={px(r.x0)} y={pz(r.z1)} width={(r.x1 - r.x0) * SC} height={(r.z1 - r.z0) * SC} fill={fill(key, m.v, overall, max)} stroke={on ? '#1A1A1A' : '#fff'} strokeWidth={on ? 3 : 2} opacity={a.n === 0 ? 0.5 : m.small ? 0.7 : 1} />
                      <text x={L.x} y={L.y - (inner ? 2 : 0)} textAnchor="middle" fontSize={inner ? 20 : 17} fontWeight="800" fill={C.ink} fontFamily={SANS}>{m.text}{m.small && a.n > 0 ? '*' : ''}</text>
                      <text x={L.x} y={L.y + (inner ? 15 : 14)} textAnchor="middle" fontSize="11" fill="#5b5347" fontFamily={SANS}>n = {a.n}</text>
                    </g>
                  )
                })}
                <rect x={px(IX[0])} y={pz(IZ[0])} width={(IX[3] - IX[0]) * SC} height={(IZ[0] - IZ[3]) * SC} fill="none" stroke="#1A1A1A" strokeWidth="2" pointerEvents="none" />
              </svg>
              <p style={note}>
                {def.hint}. Shading compares each zone with this pitcher&apos;s own {def.label} for these pitches{def.dir === 'volume' ? ' (darker means more)' : def.dir === 'hitter' ? ': blue is better for him, red is better for the hitter' : ': blue is better for him'}.
                {star} marks a zone with a small sample (under {cellMin} pitches, or under 10 at-bats, plate appearances or swings for rates). Click a zone for every number.
              </p>
            </div>

            <div style={tile}>
              <div style={kick}>{zoneName(zone)}</div>
              <dl style={{ margin: '10px 0 0', display: 'grid', gap: 9 }}>
                {detail.map(([k, v, sub]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, borderBottom: `1px solid ${C.soft}`, paddingBottom: 6 }}>
                    <dt style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', color: C.mute, textTransform: 'uppercase' }}>{k}</dt>
                    <dd style={{ margin: 0, textAlign: 'right' }}><b style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{v}</b>{sub && <span style={{ display: 'block', fontSize: 11, color: C.faint }}>{sub}</span>}</dd>
                  </div>
                ))}
              </dl>
              {zone !== 'all' && <button type="button" onClick={() => setZone('all')} style={{ marginTop: 10, fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.orange, background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>Back to all zones</button>}
            </div>

            <div style={tile}>
              <div style={kick}>Inside and around the zone</div>
              <table className="loc-tbl" style={{ marginTop: 6 }}>
                <thead><tr><th></th><th>Share</th><th>Swing</th><th>Whiff</th><th>xwOBA</th></tr></thead>
                <tbody>
                  {groups.map(([label, a]) => {
                    const c = (k: MetricKey) => cell(a, k)
                    return (
                      <tr key={label}>
                        <td style={{ fontWeight: 800 }}>{label}</td>
                        <td title={`${a.n} pitches`}>{zonedTotal > 0 ? `${((a.n / zonedTotal) * 100).toFixed(0)}%` : '—'}</td>
                        <td>{c('swing').text}{c('swing').small && a.n > 0 && star}</td>
                        <td>{c('whiff').text}{c('whiff').small && a.swings > 0 && star}</td>
                        <td>{c('xwoba').text}{c('xwoba').small && a.den > 0 && star}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p style={note}>Swing rate on the corners is how often hitters chase. Pitches without a zone number are left out.</p>
            </div>

            <div style={tile}>
              <div style={kick}>Against each side</div>
              <table className="loc-tbl" style={{ marginTop: 6 }}>
                <thead><tr><th></th><th>Pitches</th><th>In zone</th><th>Whiff</th><th>xwOBA</th></tr></thead>
                <tbody>
                  {([['L', 'Left-handed'], ['R', 'Right-handed']] as [Hand, string][]).map(([h, label]) => {
                    const s = sideAgg(h)
                    const zin = merge(IN_ZONE.map(z => s.byZone[z])), zout = merge(OUT_ZONE.map(z => s.byZone[z]))
                    const zt = zin.n + zout.n
                    return (
                      <tr key={h} className="clk" onClick={() => setHand(hand === h ? 'all' : h)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontWeight: 800 }}>{label}</td>
                        <td>{s.all.n}</td>
                        <td>{zt > 0 ? `${((zin.n / zt) * 100).toFixed(0)}%` : '—'}</td>
                        <td>{metric(s.all, 'whiff', 0).text}{smallFor('whiff', metric(s.all, 'whiff', 0).chances, cellMin) && s.all.swings > 0 && star}</td>
                        <td>{metric(s.all, 'xwoba', 0).text}{smallFor('xwoba', metric(s.all, 'xwoba', 0).chances, cellMin) && s.all.den > 0 && star}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p style={note}>Same pitch and count, split by the hitter&apos;s side. Click a row to filter the page to that side.</p>
            </div>

            <SmoothHeatmap pitches={pitches} title={name} counts={false} />

            <div className="loc-span3" style={{ ...tile, overflowX: 'auto' }}>
              <div style={kick}>Every zone · {name}</div>
              <table className="loc-tbl" style={{ marginTop: 6, minWidth: 720 }}>
                <thead>
                  <tr><th>Zone</th><th>Pitches</th><th>Share</th><th>xwOBA</th><th>BA</th><th>SLG</th><th>Hard-hit</th><th>Whiff</th><th>Swing</th><th>Take</th><th>Called strike</th></tr>
                </thead>
                <tbody>
                  {[...ALL_ZONES.map(z => [z, agg.byZone[z]] as [string, Agg]), ['all', agg.all] as [string, Agg]].map(([z, a]) => (
                    <tr key={z} className={`clk${zone === z ? ' sel' : ''}`} onClick={() => setZone(z)} style={z === 'all' ? { fontWeight: 800 } : undefined}>
                      <td style={{ fontWeight: 800 }}>{z === 'all' ? 'All pitches' : Number(z) <= 9 ? `Zone ${z}` : `Corner ${z}`}</td>
                      {(['pitches', 'usage', 'xwoba', 'ba', 'slg', 'hard', 'whiff', 'swing', 'take', 'called'] as MetricKey[]).map(k => {
                        const m = cell(a, k)
                        return <td key={k} title={`${m.chances} ${k === 'xwoba' ? 'plate appearances' : k === 'ba' || k === 'slg' ? 'at-bats' : k === 'whiff' ? 'swings' : k === 'hard' ? 'balls in play' : 'pitches'}`}>{m.text}{m.small && a.n > 0 && k !== 'pitches' && k !== 'usage' ? star : null}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={note}>Hover a number for how many chances stand behind it. xwOBA is Savant&apos;s expected wOBA on balls in play, and the actual wOBA for walks and strikeouts. Hard-hit is 95 mph or more.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
