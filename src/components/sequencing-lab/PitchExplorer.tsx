'use client'

// src/components/sequencing-lab/PitchExplorer.tsx
//
// One pitcher's pitches, filtered the way you would ask the question. Choose a pitch (the balls on the left turn the way each pitch turns), click a zone, choose a result
// and a count, and read what he threw next and what he threw before in exactly those situations, plus where that pitch goes, what happened on it and how it moves.
// Data: his stored pitches in thrown order (zone = Statcast's 13 zones; the count is rebuilt from the calls), and his measured movement and spin (pitch-shape tables).
// A selection with fewer than MIN pitches shows "Small sample (n = X)" instead of shares. Exact plate location and foul types are not stored, so they are not offered.

import { useMemo, useState } from 'react'
import SpinBall, { type SpinInfo } from '@/components/home/SpinBall'
import SmallSample from '@/components/data/SmallSample'
import PendingBlock from '@/components/data/PendingBlock'
import { C, SANS } from '@/components/team/ui'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { pitchColor, pitchLabel } from '@/lib/lab/pitch-meta'
import { RESULTS, type ResultCode, type SeqPitch } from '@/lib/sequencing-lab/sequence'
import type { PitcherShape, SpinAvg } from '@/lib/sequencing-lab/data'
import { NEUTRAL, ORANGE, Pills, VH, VW, cellRect, kick, labelAt, mix, note, px, pz, star, tile } from '@/components/pitching-lab/LocationExplorer'

const MIN = MIN_SAMPLE.zoneCellPitches
const ZONES = ['11', '12', '13', '14', '1', '2', '3', '4', '5', '6', '7', '8', '9']
const ZONE_NAME = (z: string) => (Number(z) <= 9 ? `zone ${z}` : ({ '11': 'up and in', '12': 'up and away', '13': 'down and in', '14': 'down and away' } as Record<string, string>)[z] ?? `zone ${z}`)
const RES_COLOR: Record<ResultCode, string> = { B: '#9DB4D6', C: '#0072B2', W: '#D55E00', F: '#E69F00', XH: '#c0392b', XO: '#8a8275' }
type CountKey = 'any' | 'first' | 'ahead' | 'even' | 'behind' | 'two'
const COUNT_PILLS: [CountKey, string][] = [['any', 'Any count'], ['first', '0-0'], ['ahead', 'Pitcher ahead'], ['even', 'Even'], ['behind', 'Hitter ahead'], ['two', 'Two strikes']]
const inCount = (p: SeqPitch, k: CountKey) => k === 'any' || (k === 'first' ? p.b === 0 && p.s === 0 : k === 'two' ? p.s === 2 : k === 'ahead' ? p.s > p.b : k === 'behind' ? p.b > p.s : p.s === p.b)
const pctOf = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0)
const dt: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }

export default function PitchExplorer({ events, shape, leagueSpin }: { events: SeqPitch[]; shape: PitcherShape; leagueSpin: Record<string, SpinAvg> }) {
  const [pitch, setPitch] = useState<string | null>(null)
  const [zone, setZone] = useState<string | null>(null)
  const [res, setRes] = useState<ResultCode | null>(null)
  const [count, setCount] = useState<CountKey>('any')

  const types = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of events) m.set(e.t, (m.get(e.t) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [events])
  const spinOf = (code: string): SpinInfo | null => { const s = shape[code] ?? leagueSpin[code]; return s ? { rpm: s.rpm, ivb: s.ivb, hb: s.hb } : null }
  const total = events.length

  const base = events.filter(e => (!pitch || e.t === pitch) && inCount(e, count))
  const forZone = base.filter(e => !res || e.r === res)                       // everything but the zone filter
  const forResult = base.filter(e => !zone || String(e.z) === zone)           // everything but the result filter
  const sel = base.filter(e => (!zone || String(e.z) === zone) && (!res || e.r === res))

  const zoneN = new Map<string, number>(); for (const e of forZone) if (e.z) zoneN.set(String(e.z), (zoneN.get(String(e.z)) ?? 0) + 1)
  const zoneMax = Math.max(1, ...zoneN.values())
  const resN = new Map<ResultCode, number>(); for (const e of forResult) resN.set(e.r, (resN.get(e.r) ?? 0) + 1)
  const nextN = new Map<string, { n: number; r: Map<ResultCode, number> }>(); let ended = 0
  const prevN = new Map<string, number>(); let first = 0
  for (const e of sel) {
    if (!e.n) ended += 1; else { const x = nextN.get(e.n) ?? { n: 0, r: new Map() }; x.n += 1; if (e.nr) x.r.set(e.nr as ResultCode, (x.r.get(e.nr as ResultCode) ?? 0) + 1); nextN.set(e.n, x) }
    if (!e.p) first += 1; else prevN.set(e.p, (prevN.get(e.p) ?? 0) + 1)
  }
  const nextRows = [...nextN.entries()].sort((a, b) => b[1].n - a[1].n)
  const prevRows = [...prevN.entries()].sort((a, b) => b[1] - a[1])
  const small = sel.length < MIN
  const summary = [pitch ? pitchLabel(pitch) : 'All pitches', zone ? `${ZONE_NAME(zone)}` : 'any zone', res ? RESULTS.find(r => r.code === res)?.label : 'any result', COUNT_PILLS.find(c => c[0] === count)?.[1]].join(' · ')
  const mv = pitch ? (shape[pitch] ? [[pitch, shape[pitch]] as const] : []) : Object.entries(shape).filter(([, v]) => v.points.length)

  if (total === 0) return <div style={{ ...tile, gridColumn: '1 / -1' }}><div style={kick}>Pitch explorer</div><p style={note}>No stored pitches for this pitcher this season yet.</p></div>

  return (
    <div className="sx-grid" style={{ gridColumn: '1 / -1' }}>
      <style>{`.sx-grid{display:grid;grid-template-columns:230px minmax(0,1fr);gap:20px;align-items:start}.sx-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.sx-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:7px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:13px;color:#1A1A1A;font-family:inherit}.sx-btn small{display:block;font-weight:600;font-size:11.5px;color:#8a8275}.sx-btn.on{border-color:#FF5722;background:#fff1ea}.sx-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.sx-span2{grid-column:span 2}.sx-span3{grid-column:1 / -1}@media (max-width:1100px){.sx-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:860px){.sx-grid{grid-template-columns:minmax(0,1fr)}.sx-side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.sx-btn{width:auto;white-space:nowrap}.sx-tiles{grid-template-columns:minmax(0,1fr)}.sx-span2{grid-column:auto}}`}</style>

      <nav className="sx-side" aria-label="Pitches">
        <div style={{ ...dt, margin: '2px 2px 0' }}>Choose a pitch</div>
        <button type="button" className={`sx-btn${pitch === null ? ' on' : ''}`} onClick={() => setPitch(null)}><span style={{ width: 28, textAlign: 'center' }}>All</span><span>All pitches<small>{total.toLocaleString('en-US')} pitches</small></span></button>
        {types.map(([code, n]) => (
          <button key={code} type="button" className={`sx-btn${pitch === code ? ' on' : ''}`} onClick={() => setPitch(pitch === code ? null : code)}>
            <SpinBall code={code} spin={spinOf(code)} size={28} />
            <span style={{ minWidth: 0 }}>{pitchLabel(code)}<small>{pctOf(n, total).toFixed(0)}% · {n.toLocaleString('en-US')}{shape[code]?.velo != null ? ` · ${shape[code].velo!.toFixed(1)} mph` : ''}</small></span>
          </button>
        ))}
      </nav>

      <div className="sx-tiles" style={{ fontFamily: SANS }}>
        <div className="sx-span3" style={{ ...tile, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <div style={kick}>Pitch explorer</div>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{summary}</span>
            <span style={{ fontSize: 13, color: C.mute }}>{sel.length.toLocaleString('en-US')} pitch{sel.length === 1 ? '' : 'es'}{small && sel.length > 0 && star}</span>
            {(zone || res || count !== 'any' || pitch) && <button type="button" onClick={() => { setZone(null); setRes(null); setCount('any'); setPitch(null) }} style={{ marginLeft: 'auto', background: 'none', border: 0, color: C.orange, fontWeight: 800, cursor: 'pointer', font: 'inherit', fontSize: 13 }}>Clear all</button>}
          </div>
          <Pills items={[['', 'Any result'], ...RESULTS.map(r => [r.code, r.label] as [string, string])] as [string, string][]} value={res ?? ''} onChange={v => setRes((v || null) as ResultCode | null)} />
          <Pills items={COUNT_PILLS} value={count} onChange={setCount} />
          <p style={{ ...note, margin: 0 }}>Choose a pitch on the left, click a zone on the map, then a result and a count. Everything below follows your selection.</p>
        </div>

        <div style={tile}>
          <div style={kick}>Where it goes · click a zone</div>
          <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', maxWidth: 330, display: 'block', margin: '8px auto 0' }} role="img" aria-label="Zone map: how often the selected pitch goes to each zone">
            <rect width={VW} height={VH} fill="#faf8f3" />
            {ZONES.map(z => {
              const r = cellRect(z), n = zoneN.get(z) ?? 0, lab = labelAt(z), on = zone === z
              return (
                <g key={z} onClick={() => setZone(on ? null : z)} style={{ cursor: 'pointer' }}>
                  <title>{`${ZONE_NAME(z)}: ${n} pitches (${pctOf(n, forZone.length).toFixed(0)}%)`}</title>
                  <rect x={px(r.x0)} y={pz(r.z1)} width={px(r.x1) - px(r.x0)} height={pz(r.z0) - pz(r.z1)} fill={n ? mix(NEUTRAL, ORANGE, n / zoneMax) : '#fff'} stroke={on ? '#1A1A1A' : '#cfc9ba'} strokeWidth={on ? 3 : 1} />
                  <text x={lab.x} y={lab.y + 5} textAnchor="middle" fontSize={Number(z) <= 9 ? 13 : 15} fontWeight={800} fill="#1A1A1A" style={{ pointerEvents: 'none' }}>{n ? `${pctOf(n, forZone.length).toFixed(0)}%` : ''}</text>
                </g>
              )
            })}
          </svg>
          <p style={note}>Share of the matching pitches in each of Statcast&apos;s 13 zones (catcher&apos;s view; the four outer boxes are chase corners). {zone ? `Showing ${ZONE_NAME(zone)}; click it again to clear.` : 'Darker = more.'}</p>
        </div>

        <div style={tile}>
          <div style={kick}>What happened{zone ? ` · ${ZONE_NAME(zone)}` : ''}</div>
          {forResult.length === 0 ? <p style={note}>No pitches match.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {RESULTS.map(r => { const n = resN.get(r.code) ?? 0; return (
                <button key={r.code} type="button" onClick={() => setRes(res === r.code ? null : r.code)} style={{ textAlign: 'left', background: res === r.code ? '#fff1ea' : 'none', border: 0, borderRadius: 8, padding: '3px 4px', cursor: 'pointer', font: 'inherit', color: C.ink }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800 }}><span><span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: RES_COLOR[r.code], marginRight: 6 }} />{r.label}</span><span style={{ fontWeight: 600, color: C.mute }}>{pctOf(n, forResult.length).toFixed(0)}% · {n}</span></div>
                  <div style={{ height: 8, background: C.soft, borderRadius: 4, marginTop: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pctOf(n, forResult.length)}%`, background: RES_COLOR[r.code] }} /></div>
                </button>
              ) })}
              <p style={{ ...note, margin: 0 }}>{forResult.length.toLocaleString('en-US')} pitches{forResult.length < MIN && <> {star} small sample</>}. Click a result to filter by it.</p>
            </div>
          )}
        </div>

        <div style={tile}>
          <div style={kick}>Movement{pitch ? ` · ${pitchLabel(pitch)}` : ''}</div>
          {mv.length === 0 ? <PendingBlock label="Movement for this pitch (no measured break stored for him yet)" /> : (
            <>
              <svg viewBox="-30 -30 60 60" style={{ width: '100%', maxWidth: 330, display: 'block', margin: '8px auto 0' }} role="img" aria-label="Horizontal against vertical break of his pitches">
                <rect x={-30} y={-30} width={60} height={60} fill="#faf8f3" />
                <g stroke="#cfc9ba" strokeWidth={0.2}>{[-20, -10, 10, 20].map(v => <g key={v}><line x1={v} y1={-30} x2={v} y2={30} /><line x1={-30} y1={v} x2={30} y2={v} /></g>)}</g>
                <g stroke="#8a8275" strokeWidth={0.35}><line x1={0} y1={-30} x2={0} y2={30} /><line x1={-30} y1={0} x2={30} y2={0} /></g>
                {mv.map(([code, v]) => <g key={code}>{v.points.map((p, i) => <circle key={i} cx={Math.max(-29, Math.min(29, p.hb))} cy={-Math.max(-29, Math.min(29, p.ivb))} r={0.7} fill={pitchColor(code)} fillOpacity={0.35} />)}{v.hb != null && v.ivb != null && <circle cx={v.hb} cy={-v.ivb} r={2.2} fill={pitchColor(code)} stroke="#fff" strokeWidth={0.5}><title>{`${pitchLabel(code)}: ${v.hb.toFixed(1)} in arm side, ${v.ivb.toFixed(1)} in induced rise`}</title></circle>}</g>)}
                <text x={-29} y={-27} fontSize={2.6} fill="#a89e8c">induced rise ↑</text><text x={29} y={28.5} fontSize={2.6} fill="#a89e8c" textAnchor="end">arm side →</text>
              </svg>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 6, fontSize: 12 }}>{mv.map(([code, v]) => <span key={code} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><SpinBall code={code} spin={spinOf(code)} size={16} /><b>{pitchLabel(code)}</b> {v.hb != null ? `${v.hb.toFixed(1)}"` : ''} / {v.ivb != null ? `${v.ivb.toFixed(1)}"` : ''}</span>)}</div>
              <p style={note}>Each faint dot is one of his pitches, the big dot is the average: inches toward the arm side (right) and induced rise (up). Movement is about the pitch type, so it does not follow the zone or result you chose.</p>
            </>
          )}
        </div>

        <div className="sx-span2" style={tile}>
          <div style={kick}>What he threw next · after this selection</div>
          {sel.length === 0 ? <p style={note}>No pitches match this selection.</p> : small ? <div style={{ marginTop: 8 }}><SmallSample n={sel.length} /></div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
              {nextRows.map(([code, x]) => (
                <div key={code} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) 120px', alignItems: 'center', gap: 10 }}>
                  <SpinBall code={code} spin={spinOf(code)} size={26} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800 }}><span>{pitchLabel(code)}</span><span style={{ fontWeight: 600, color: C.mute }}>{pctOf(x.n, sel.length).toFixed(0)}% · {x.n}</span></div>
                    <div style={{ height: 10, background: C.soft, borderRadius: 5, marginTop: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pctOf(x.n, sel.length)}%`, background: pitchColor(code) }} /></div>
                  </div>
                  <div title={RESULTS.map(r => `${r.label} ${(x.r.get(r.code) ?? 0)}`).join(' · ')} style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden', gap: 1 }} aria-label="What happened on that next pitch">{RESULTS.map(r => <span key={r.code} style={{ width: `${pctOf(x.r.get(r.code) ?? 0, x.n)}%`, background: RES_COLOR[r.code] }} />)}</div>
                </div>
              ))}
              {ended > 0 && <div style={{ fontSize: 13, color: '#5b5347' }}>The at-bat ended on it: <b>{pctOf(ended, sel.length).toFixed(0)}%</b> ({ended})</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: 11.5, color: C.mute }}>The small bar on the right is what happened on that next pitch: {RESULTS.map(r => <span key={r.code}><span aria-hidden style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: RES_COLOR[r.code], marginRight: 4 }} />{r.label}</span>)}</div>
            </div>
          )}
        </div>

        <div style={tile}>
          <div style={kick}>What he threw before</div>
          {sel.length === 0 ? <p style={note}>No pitches match this selection.</p> : small ? <div style={{ marginTop: 8 }}><SmallSample n={sel.length} /></div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {prevRows.map(([code, n]) => (
                <div key={code} style={{ display: 'grid', gridTemplateColumns: '24px minmax(0,1fr)', gap: 8, alignItems: 'center' }}>
                  <SpinBall code={code} spin={spinOf(code)} size={22} />
                  <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800 }}><span>{pitchLabel(code)}</span><span style={{ fontWeight: 600, color: C.mute }}>{pctOf(n, sel.length).toFixed(0)}% · {n}</span></div><div style={{ height: 8, background: C.soft, borderRadius: 4, marginTop: 2, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pctOf(n, sel.length)}%`, background: pitchColor(code) }} /></div></div>
                </div>
              ))}
              {first > 0 && <div style={{ fontSize: 13, color: '#5b5347' }}>First pitch of the at-bat: <b>{pctOf(first, sel.length).toFixed(0)}%</b> ({first})</div>}
            </div>
          )}
        </div>

        <div className="sx-span2" style={tile}><div style={kick}>Foul types · pop foul, line foul</div><PendingBlock label="Foul types after each pitch (needs launch angle on fouls, which is not stored yet)" /></div>
        <div style={tile}><div style={kick}>Exact location</div><PendingBlock label="Exact plate location of each pitch (only Statcast's 13 zones are stored today)" /></div>
      </div>
    </div>
  )
}
