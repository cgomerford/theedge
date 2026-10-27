'use client'

// src/components/batting-lab/BatterArsenal.tsx
//
// Batting Lab → vs pitch type. The pitches this hitter has seen, one selector down the left (with a ball that spins the way that pitch spins),
// and for each: the pitch as he sees it (flight and release points, batter's view), where it was thrown to him, what he did with it (whiffs,
// chase, xwOBA, BA, SLG, hard-hit, exit speed), and how that changes with the pitch's speed, the count and the pitcher's hand.
// "All pitches" shows the mix he faces, its movement and how the mix changed through the season.
// Built from his per-pitch log (src/lib/batter-pitch-log.ts, shaped by src/lib/lab-log.ts). Rates carry their counts; nothing is estimated.
// Flights average release points, which differ by hand, so they use the pitchers from the hand he faces most.

import { useEffect, useMemo, useState } from 'react'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import { C, SANS } from '@/components/team/ui'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { fetchLabLog, onlyHand } from '@/lib/lab-log'
import type { PitcherPitchLog, RawPitch } from '@/lib/pitcher-pitch-log'
import { aggregate, metric } from '@/lib/zone-stats'
import { SmoothHeatmap, MovementProfile, UsageTrend } from '@/components/pitching-lab/ArsenalExtras'
import { FlightSection, PitchCards, buildPaths } from '@/components/pitching-lab/PitchFlight'
import { Pills, kick, note, star, tile } from '@/components/pitching-lab/LocationExplorer'

const f3 = (v: number | null) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.'))
const pc = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`)
const SWING = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'foul_bunt', 'missed_bunt', 'hit_into_play'])
const isIn = (z: string | null) => z != null && Number(z) >= 1 && Number(z) <= 9

function chase(ps: RawPitch[]): { v: number | null; n: number } {
  let out = 0, sw = 0
  for (const p of ps) if (p.zone && !isIn(p.zone)) { out++; if (SWING.has(p.description ?? '')) sw++ }
  return { v: out ? sw / out : null, n: out }
}
function avgEV(ps: RawPitch[]): number | null {
  const e = ps.filter(p => p.description === 'hit_into_play' && p.exitVelo != null).map(p => p.exitVelo as number)
  return e.length ? e.reduce((a, b) => a + b, 0) / e.length : null
}
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null)

function Line({ ps }: { ps: RawPitch[] }) {
  const a = aggregate(ps).all
  const c = chase(ps)
  return <>
    <td>{ps.length}{ps.length < MIN_SAMPLE.arsenalPitchesPerType && star}</td>
    <td>{pc(metric(a, 'whiff', 0).v)}{a.swings > 0 && a.swings < 10 && star}</td>
    <td title={`${c.n} pitches outside the zone`}>{pc(c.v)}</td>
    <td>{f3(metric(a, 'xwoba', 0).v)}{a.den > 0 && a.den < 10 && star}</td>
    <td>{f3(metric(a, 'ba', 0).v)}</td><td>{f3(metric(a, 'slg', 0).v)}</td>
    <td>{pc(metric(a, 'hard', 0).v)}{a.bbe > 0 && a.bbe < 8 && star}</td>
  </>
}
const LINE_HEAD = <><th>Faced</th><th>Whiff</th><th>Chase</th><th>xwOBA</th><th>BA</th><th>SLG</th><th>Hard-hit</th></>

export default function BatterArsenal({ batterId }: { batterId: number }) {
  const season = new Date().getFullYear()
  const [years, setYears] = useState(1)
  const [logs, setLogs] = useState<Record<number, PitcherPitchLog | null>>({})
  const [pitch, setPitch] = useState('ALL')
  const [slow, setSlow] = useState(6)

  useEffect(() => {
    let off = false
    for (let y = season; y > season - years; y--) {
      if (logs[y] !== undefined) continue
      fetchLabLog('batter', batterId, y).then(l => { if (!off) setLogs(x => ({ ...x, [y]: l })) })
    }
    return () => { off = true }
  }, [batterId, season, years]) // eslint-disable-line react-hooks/exhaustive-deps

  const got = Array.from({ length: years }, (_, i) => logs[season - i]).filter((x): x is PitcherPitchLog => !!x)
  const loading = Array.from({ length: years }, (_, i) => logs[season - i]).some(x => x === undefined) && got.length === 0
  const log = useMemo<PitcherPitchLog | null>(() => (got.length ? { ...got[0], pitches: got.flatMap(g => g.pitches), pitchNames: Object.assign({}, ...got.map(g => g.pitchNames)) } : null), [logs, years]) // eslint-disable-line react-hooks/exhaustive-deps
  const handLog = useMemo(() => (log ? onlyHand(log, log.throws) : null), [log])
  const paths = useMemo(() => (handLog ? buildPaths(handLog) : []), [handLog])
  const types = useMemo(() => {
    if (!log) return []
    const by = new Map<string, number>()
    for (const p of log.pitches) by.set(p.pitchType, (by.get(p.pitchType) ?? 0) + 1)
    return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ t, n, name: log.pitchNames[t] ?? t }))
  }, [log])

  if (loading) return <p style={{ fontFamily: SANS, fontSize: 14, color: C.mute, padding: '24px 0' }}>Loading every pitch he has seen…</p>
  if (!log || log.pitches.length === 0) return <p style={{ fontFamily: SANS, fontSize: 14, color: C.mute, padding: '24px 0' }}>No pitch data for this hitter yet.</p>

  const total = log.pitches.length
  const sel = pitch === 'ALL' ? null : types.find(t => t.t === pitch) ?? null
  const mine = sel ? log.pitches.filter(p => p.pitchType === sel.t) : log.pitches
  const selPath = sel ? paths.filter(p => p.type === sel.t) : paths
  const spinOf = (t: string) => { const f = paths.find(x => x.type === t); return { rpm: f?.spin ?? null, ivb: f?.ivb ?? null, hb: f?.hb ?? null } }
  const rows = types.map(t => ({ t, ps: log.pitches.filter(p => p.pitchType === t.t) }))

  // For one pitch: its speed in thirds, the count, and the pitcher's hand.
  const velos = mine.flatMap(p => (p.velo != null ? [p.velo] : [])).sort((a, b) => a - b)
  const cut = (q: number) => velos[Math.min(velos.length - 1, Math.floor(velos.length * q))]
  const c1 = velos.length >= 9 ? cut(1 / 3) : null, c2 = velos.length >= 9 ? cut(2 / 3) : null
  const bands: [string, RawPitch[]][] = c1 != null && c2 != null ? [
    [`Slower than ${c1.toFixed(1)} mph`, mine.filter(p => p.velo != null && p.velo < c1)],
    [`${c1.toFixed(1)} to ${c2.toFixed(1)} mph`, mine.filter(p => p.velo != null && p.velo >= c1 && p.velo < c2)],
    [`${c2.toFixed(1)} mph or faster`, mine.filter(p => p.velo != null && p.velo >= c2)],
  ] : []
  const counts: [string, (p: RawPitch) => boolean][] = [
    ['First pitch', p => p.balls === 0 && p.strikes === 0], ['Hitter ahead', p => p.balls != null && p.strikes != null && p.balls > p.strikes],
    ['Even', p => p.balls != null && p.strikes != null && p.balls === p.strikes], ['Hitter behind', p => p.balls != null && p.strikes != null && p.strikes > p.balls], ['Two strikes', p => p.strikes === 2],
  ]
  const a = aggregate(mine).all
  const ch = chase(mine)
  const spinAvg = mean(mine.flatMap(p => (p.spinRate != null ? [p.spinRate] : [])))
  const veloAvg = mean(velos)
  const nums: [string, string][] = [
    ['Faced', String(mine.length)], ['Share', pc(mine.length / total)], ['Speed', veloAvg != null ? `${veloAvg.toFixed(1)} mph` : '—'],
    ['Spin', spinAvg != null ? `${Math.round(spinAvg)} rpm` : '—'], ['Whiff', pc(metric(a, 'whiff', 0).v)], ['Chase', pc(ch.v)],
    ['xwOBA', f3(metric(a, 'xwoba', 0).v)], ['BA', f3(metric(a, 'ba', 0).v)], ['SLG', f3(metric(a, 'slg', 0).v)],
    ['Hard-hit', pc(metric(a, 'hard', 0).v)], ['Exit speed', avgEV(mine) != null ? `${avgEV(mine)!.toFixed(1)} mph` : '—'], ['Swing', pc(metric(a, 'swing', 0).v)],
  ]

  return (
    <div className="ba-grid">
      <style>{`.ba-grid{display:grid;grid-template-columns:210px minmax(0,1fr);gap:24px;align-items:start}.ba-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.ba-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:8px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:14px;color:#1A1A1A;font-family:inherit}.ba-btn small{display:block;font-weight:600;font-size:12px;color:#8a8275}.ba-btn.on{border-color:#FF5722;background:#fff1ea}.ba-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.ba-span2{grid-column:span 2}.ba-span3{grid-column:1 / -1}.ba-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.ba-tbl th{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a89e8c;text-align:right;padding:6px 8px;border-bottom:1px solid #e7e2d8}.ba-tbl th:first-child,.ba-tbl td:first-child{text-align:left}.ba-tbl td{text-align:right;padding:7px 8px;border-top:1px solid #f1eee6}@media (max-width:1180px){.ba-g3{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:860px){.ba-grid{grid-template-columns:minmax(0,1fr)}.ba-side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.ba-btn{width:auto;white-space:nowrap}.ba-g3{grid-template-columns:minmax(0,1fr)}.ba-span2{grid-column:auto}}`}</style>
      <SpinBallStyles />

      <nav className="ba-side" aria-label="Pitch types faced">
        <button type="button" className={`ba-btn${pitch === 'ALL' ? ' on' : ''}`} onClick={() => setPitch('ALL')}>
          <span style={{ width: 30, height: 30, borderRadius: 999, background: '#1A1A1A', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, flexShrink: 0 }}>All</span>
          <span>All pitches<small>{types.length} types · {total}</small></span>
        </button>
        {types.map(t => (
          <button key={t.t} type="button" className={`ba-btn${pitch === t.t ? ' on' : ''}`} onClick={() => setPitch(t.t)}>
            <SpinBall code={t.t} size={30} spin={spinOf(t.t)} />
            <span>{t.name}<small>{((t.n / total) * 100).toFixed(0)}% · {t.n} faced</small></span>
          </button>
        ))}
      </nav>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>
        <Pills items={[['1', 'This season'], ['2', 'Last 2 seasons'], ['3', 'Last 3']] as [string, string][]} value={String(years)} onChange={v => { setYears(Number(v)); setPitch('ALL') }} />

        {sel ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <SpinBall code={sel.t} size={52} spin={spinOf(sel.t)} />
              <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>{sel.name}</h2>
              <span style={{ fontSize: 15, color: '#5b5347' }}>
                Faced <b style={{ color: '#1A1A1A' }}>{mine.length}</b> ({pc(mine.length / total)} of pitches) · xwOBA <b style={{ color: '#1A1A1A' }}>{f3(metric(a, 'xwoba', 0).v)}</b> · whiff <b style={{ color: '#1A1A1A' }}>{pc(metric(a, 'whiff', 0).v)}</b>
                {mine.length < MIN_SAMPLE.arsenalPitchesPerType && <span title={`n = ${mine.length}`} style={{ color: '#D4533B', fontWeight: 800 }}> *</span>}
              </span>
            </div>
            <div className="ba-g3">
              {handLog && <FlightSection log={handLog} paths={selPath} slow={slow} setSlow={setSlow} title={`${sel.name} as he sees it`} />}
              <SmoothHeatmap pitches={mine} title={`${sel.name} · thrown to him`} counts={false} />

              <div style={tile}>
                <div style={kick}>{sel.name} · his numbers</div>
                <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px 8px', margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                  {nums.map(([k, v]) => <div key={k}><dt style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }}>{k}</dt><dd style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{v}</dd></div>)}
                </dl>
                <p style={note}>Chase is swings per pitch outside the zone ({ch.n} faced). Speed and spin are the pitch as thrown, not what he does with it.</p>
              </div>
              <SmoothHeatmap pitches={mine.filter(p => p.description === 'swinging_strike' || p.description === 'swinging_strike_blocked')} title="Where he swings and misses" counts={false} />
              <SmoothHeatmap pitches={mine.filter(p => p.description === 'hit_into_play' && (p.exitVelo ?? 0) >= 95)} title="Where he hits it hard" counts={false} />

              <div style={{ ...tile, overflowX: 'auto' }}>
                <div style={kick}>By speed of the pitch</div>
                {bands.length === 0 ? <p style={note}>Not enough pitches to split by speed.</p> : (
                  <table className="ba-tbl" style={{ marginTop: 6, minWidth: 360 }}>
                    <thead><tr><th>Speed</th>{LINE_HEAD}</tr></thead>
                    <tbody>{bands.map(([l, ps]) => <tr key={l}><td style={{ fontWeight: 800 }}>{l}</td><Line ps={ps} /></tr>)}</tbody>
                  </table>
                )}
                <p style={note}>The pitches he has faced of this type, in thirds by speed.</p>
              </div>
              <div style={{ ...tile, overflowX: 'auto' }}>
                <div style={kick}>By count</div>
                <table className="ba-tbl" style={{ marginTop: 6, minWidth: 360 }}>
                  <thead><tr><th>Count</th>{LINE_HEAD}</tr></thead>
                  <tbody>{counts.map(([l, fn]) => <tr key={l}><td style={{ fontWeight: 800 }}>{l}</td><Line ps={mine.filter(fn)} /></tr>)}</tbody>
                </table>
              </div>
              <div style={{ ...tile, overflowX: 'auto' }}>
                <div style={kick}>By pitcher hand</div>
                <table className="ba-tbl" style={{ marginTop: 6, minWidth: 360 }}>
                  <thead><tr><th>Pitcher</th>{LINE_HEAD}</tr></thead>
                  <tbody>{([['L', 'Left-handed'], ['R', 'Right-handed']] as ['L' | 'R', string][]).map(([h, l]) => <tr key={h}><td style={{ fontWeight: 800 }}>{l}</td><Line ps={mine.filter(p => p.stand === h)} /></tr>)}</tbody>
                </table>
                <p style={note}>{star} marks a small sample. Whiff and xwOBA need at least 10 swings or plate appearances.</p>
              </div>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>Pitches he faces</h2>
            <div className="ba-g3">
              {handLog && paths.length > 0 && <MovementProfile log={handLog} paths={paths} />}
              {handLog && paths.length > 0 && <div className="ba-span2" style={{ minWidth: 0 }}><UsageTrend log={log} initial="month" paths={paths.slice(0, 6).map(p => ({ ...p, share: log.pitches.filter(x => x.pitchType === p.type).length / total }))} /></div>}
              {handLog && paths.length > 0 && <FlightSection log={handLog} paths={paths} slow={slow} setSlow={setSlow} title="All pitches as he sees them" />}
              <SmoothHeatmap pitches={log.pitches} title="All pitches · thrown to him" counts={false} />
            </div>
            {handLog && paths.length > 0 && <PitchCards paths={paths} movement={[]} slow={slow} onPick={setPitch} />}
            <div style={{ ...tile, overflowX: 'auto' }}>
              <div style={kick}>How he handles each pitch</div>
              <table className="ba-tbl" style={{ marginTop: 6, minWidth: 640 }}>
                <thead><tr><th>Pitch</th><th>Share</th><th>Speed</th>{LINE_HEAD}<th>Exit speed</th></tr></thead>
                <tbody>
                  {rows.map(({ t, ps }) => (
                    <tr key={t.t} style={{ cursor: 'pointer' }} onClick={() => setPitch(t.t)}>
                      <td style={{ fontWeight: 800 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><SpinBall code={t.t} size={22} spin={spinOf(t.t)} />{t.name}</span></td>
                      <td>{pc(ps.length / total)}</td><td>{mean(ps.flatMap(p => (p.velo != null ? [p.velo] : []))) != null ? `${mean(ps.flatMap(p => (p.velo != null ? [p.velo] : [])))!.toFixed(1)}` : '—'}</td>
                      <Line ps={ps} /><td>{avgEV(ps) != null ? avgEV(ps)!.toFixed(1) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={note}>Click a pitch for the full view. Chase is swings per pitch outside the zone. {star} marks a small sample.</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

