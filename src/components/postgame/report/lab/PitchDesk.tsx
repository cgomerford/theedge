'use client'

// src/components/postgame/report/lab/PitchDesk.tsx
//
// Postgame → Pitchers. Every pitcher who threw in this game, then any one of his pitches down the left (the ball spins the way that pitch spins on
// his season), and for the night: the mix against his season, the speed against his season, where the pitches went (by count), how each turned
// out, how he went about each count and each hitter hand, and every plate appearance pitch by pitch. Built from the game's live feed
// (lib/postgame/pitchlog.ts); the season numbers come from his season log. Descriptions of what happened, not advice.

import { useEffect, useMemo, useState } from 'react'
import { Headshot } from '@/components/home/Logo'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import { C, SANS } from '@/components/team/ui'
import { pitchColor } from '@/lib/mlb'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { fetchLabLog } from '@/lib/lab-log'
import type { PitcherPitchLog } from '@/lib/pitcher-pitch-log'
import type { PitchRec } from '@/lib/postgame/pitchlog'
import { FlightSection, buildPaths } from '@/components/pitching-lab/PitchFlight'
import { SmoothHeatmap } from '@/components/pitching-lab/ArsenalExtras'
import { kick, note, star, tile } from '@/components/pitching-lab/LocationExplorer'
import { COUNT_GROUPS, OUT_COLOR, OUT_LABEL, PAList, countGroup, isOutside, mean, outOf, pc, plateAppearances, shade, type Out } from './shared'

type Club = { id: number; abbr: string }

export default function PitchDesk({ pitches, away, home, season }: { pitches: PitchRec[]; away: Club; home: Club; season: number }) {
  const pitchers = useMemo(() => {
    const m = new Map<number, { id: number; name: string; side: 'away' | 'home'; n: number }>()
    for (const p of pitches) { const e = m.get(p.pitcherId) ?? { id: p.pitcherId, name: p.pitcher, side: p.fielding, n: 0 }; e.n++; m.set(p.pitcherId, e) }
    return [...m.values()]
  }, [pitches])
  const [pid, setPid] = useState(pitchers[0]?.id ?? 0)
  const [pt, setPt] = useState('ALL')
  const [slow, setSlow] = useState(6)
  const [seasonLog, setSeasonLog] = useState<Record<number, PitcherPitchLog | null>>({})
  const cur = pitchers.find(p => p.id === pid)

  useEffect(() => {
    if (!pid || seasonLog[pid] !== undefined) return
    let off = false
    fetchLabLog('pitcher', pid, season).then(l => { if (!off) setSeasonLog(x => ({ ...x, [pid]: l })) })
    return () => { off = true }
  }, [pid, season]) // eslint-disable-line react-hooks/exhaustive-deps

  const sLog = seasonLog[pid] ?? null
  const paths = useMemo(() => (sLog ? buildPaths(sLog) : []), [sLog])
  const mine = useMemo(() => pitches.filter(p => p.pitcherId === pid), [pitches, pid])
  const types = useMemo(() => {
    const m = new Map<string, { t: string; name: string; n: number }>()
    for (const p of mine) { const e = m.get(p.type) ?? { t: p.type, name: p.typeName, n: 0 }; e.n++; m.set(p.type, e) }
    return [...m.values()].sort((a, b) => b.n - a.n)
  }, [mine])
  const focus = mine.filter(p => pt === 'ALL' || p.type === pt)
  const spinOf = (t: string) => { const f = paths.find(x => x.type === t); return { rpm: f?.spin ?? null, ivb: f?.ivb ?? null, hb: f?.hb ?? null } }
  const seasonShare = (t: string) => (sLog && sLog.pitches.length ? sLog.pitches.filter(p => p.pitchType === t).length / sLog.pitches.length : null)
  const seasonVelo = (t: string) => mean((sLog?.pitches ?? []).filter(p => p.pitchType === t && p.velo != null).map(p => p.velo as number))
  const outs = new Map<Out, number>()
  for (const p of focus) { const o = outOf(p.call); if (o) outs.set(o, (outs.get(o) ?? 0) + 1) }
  const swings = focus.filter(p => p.swing).length, whiffs = focus.filter(p => p.whiff).length
  const outside = focus.filter(p => isOutside(p.zone)), chase = outside.filter(p => p.swing).length
  const cols = types.slice(0, 6)
  const selPaths = pt === 'ALL' ? paths.filter(x => types.some(t => t.t === x.type)) : paths.filter(x => x.type === pt)
  const pas = plateAppearances(mine.filter(p => pt === 'ALL' || p.type === pt))
  const rowFor = (fn: (p: PitchRec) => boolean) => { const ps = mine.filter(fn); const m = new Map<string, number>(); for (const p of ps) m.set(p.type, (m.get(p.type) ?? 0) + 1); return { n: ps.length, m } }
  const heat = focus.filter(p => p.x != null && p.z != null).map(p => ({ plateX: p.x as number, plateZ: p.z as number, balls: p.balls, strikes: p.strikes }))

  if (pitchers.length === 0) return <p style={{ fontFamily: SANS, fontSize: 14, color: C.mute }}>No pitch data is available for this game.</p>

  return (
    <div className="pd-grid">
      <style>{`.pd-grid{display:grid;grid-template-columns:210px minmax(0,1fr);gap:24px;align-items:start}.pd-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.pd-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:8px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:14px;color:#1A1A1A;font-family:inherit}.pd-btn small{display:block;font-weight:600;font-size:12px;color:#8a8275}.pd-btn.on{border-color:#FF5722;background:#fff1ea}.pd-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.pd-span2{grid-column:span 2}.pd-span3{grid-column:1 / -1}.pd-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.pd-tbl th{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a89e8c;text-align:center;padding:6px 8px;border-bottom:1px solid #e7e2d8}.pd-tbl th:first-child,.pd-tbl td:first-child{text-align:left}.pd-tbl td{text-align:center;padding:7px 8px;border-top:1px solid #f1eee6}@media (max-width:1180px){.pd-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:860px){.pd-grid{grid-template-columns:minmax(0,1fr)}.pd-side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.pd-btn{width:auto;white-space:nowrap}.pd-tiles{grid-template-columns:minmax(0,1fr)}.pd-span2{grid-column:auto}}`}</style>
      <SpinBallStyles />

      <nav className="pd-side" aria-label="Pitchers and pitches">
        <div style={{ ...kick, margin: '0 2px 2px' }}>Pitcher</div>
        {pitchers.map(p => (
          <button key={p.id} type="button" className={`pd-btn${pid === p.id ? ' on' : ''}`} onClick={() => { setPid(p.id); setPt('ALL') }}>
            <Headshot id={p.id} name={p.name} size={34} />
            <span>{p.name}<small>{(p.side === 'away' ? away : home).abbr} · {p.n} pitches</small></span>
          </button>
        ))}
        <div style={{ ...kick, margin: '8px 2px 2px' }}>Pitch</div>
        <button type="button" className={`pd-btn${pt === 'ALL' ? ' on' : ''}`} onClick={() => setPt('ALL')}>
          <span style={{ width: 30, height: 30, borderRadius: 999, background: '#1A1A1A', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, flexShrink: 0 }}>All</span>
          <span>All pitches<small>{mine.length}</small></span>
        </button>
        {types.map(t => (
          <button key={t.t} type="button" className={`pd-btn${pt === t.t ? ' on' : ''}`} onClick={() => setPt(t.t)}>
            <SpinBall code={t.t} size={30} spin={spinOf(t.t)} />
            <span>{t.name}<small>{((t.n / mine.length) * 100).toFixed(0)}% · {t.n}</small></span>
          </button>
        ))}
      </nav>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>{cur?.name}</h2>
          <span style={{ fontSize: 15, color: '#5b5347' }}>{mine.length} pitches tonight{pt !== 'ALL' ? ` · ${types.find(t => t.t === pt)?.name}` : ''} · {swings ? `${pc(whiffs / swings)} whiff` : 'no swings'}</span>
        </div>

        <div className="pd-tiles">
          <div style={tile}>
            <div style={kick}>Mix tonight vs his season</div>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {types.map(t => { const v = t.n / mine.length, s = seasonShare(t.t); return (
                <div key={t.t} style={{ display: 'grid', gridTemplateColumns: '112px minmax(0,1fr) 78px', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ fontWeight: 800 }}>{t.name}</span>
                  <span style={{ position: 'relative', height: 14, background: C.soft, borderRadius: 7 }}>
                    <span style={{ display: 'block', height: '100%', width: `${v * 100}%`, background: pitchColor(t.t), borderRadius: 7 }} />
                    {s != null && <span title={`Season ${pc(s)}`} style={{ position: 'absolute', top: -2, bottom: -2, left: `${s * 100}%`, width: 2, background: '#1A1A1A' }} />}
                  </span>
                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}><b>{pc(v)}</b> <span style={{ color: C.faint }}>{s != null ? `/ ${pc(s)}` : ''}</span></span>
                </div>
              ) })}
            </div>
            <p style={note}>The bar is tonight; the black tick and the second number are his season.</p>
          </div>

          <div style={{ ...tile, overflowX: 'auto' }}>
            <div style={kick}>Speed tonight vs his season</div>
            <table className="pd-tbl" style={{ marginTop: 6, minWidth: 300 }}>
              <thead><tr><th>Pitch</th><th>#</th><th>Avg</th><th>Top</th><th>Season</th></tr></thead>
              <tbody>
                {types.map(t => {
                  const v = mine.filter(p => p.type === t.t && p.velo != null).map(p => p.velo as number), a = mean(v), sv = seasonVelo(t.t)
                  const d = a != null && sv != null ? a - sv : null
                  return <tr key={t.t}><td style={{ fontWeight: 800 }}>{t.name}</td><td>{t.n}{t.n < MIN_SAMPLE.arsenalPitchesPerType && star}</td><td>{a != null ? a.toFixed(1) : '—'}</td><td>{v.length ? Math.max(...v).toFixed(1) : '—'}</td><td>{sv != null ? sv.toFixed(1) : '—'}{d != null && <span style={{ color: Math.abs(d) >= 1 ? C.orange : C.faint, marginLeft: 4 }}>{d > 0 ? '+' : ''}{d.toFixed(1)}</span>}</td></tr>
                })}
              </tbody>
            </table>
            <p style={note}>Miles per hour. The last column is his season average and how far tonight was from it.</p>
          </div>

          <SmoothHeatmap pitches={heat} title={`${pt === 'ALL' ? 'All pitches' : types.find(t => t.t === pt)?.name} · tonight`} />

          <div style={tile}>
            <div style={kick}>How each pitch turned out</div>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(Object.keys(OUT_LABEL) as Out[]).filter(o => (outs.get(o) ?? 0) > 0).map(o => (
                <div key={o} style={{ display: 'grid', gridTemplateColumns: '112px minmax(0,1fr) 60px', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ fontWeight: 800 }}>{OUT_LABEL[o]}</span>
                  <span style={{ height: 12, background: C.soft, borderRadius: 6, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${((outs.get(o) ?? 0) / focus.length) * 100}%`, background: OUT_COLOR[o] }} /></span>
                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pc((outs.get(o) ?? 0) / focus.length)} <span style={{ color: C.faint }}>({outs.get(o)})</span></span>
                </div>
              ))}
            </div>
            <dl style={{ margin: '12px 0 0', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>
              {[['Whiff', swings ? pc(whiffs / swings) : '—', `${whiffs} of ${swings} swings`], ['Chase', outside.length ? pc(chase / outside.length) : '—', `${chase} of ${outside.length} out of the zone`], ['Hardest hit', (() => { const e = focus.filter(p => p.ev != null).map(p => p.ev as number); return e.length ? `${Math.max(...e).toFixed(0)} mph` : '—' })(), 'exit speed']].map(([k, v, s]) => <div key={k}><dt style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }}>{k}</dt><dd style={{ margin: 0 }}><b style={{ fontSize: 17 }}>{v}</b><span style={{ display: 'block', fontSize: 11, color: C.faint }}>{s}</span></dd></div>)}
            </dl>
          </div>

          <div className="pd-span2" style={{ ...tile, overflowX: 'auto' }}>
            <div style={kick}>How he went about each count</div>
            <table className="pd-tbl" style={{ marginTop: 6, minWidth: 480 }}>
              <thead><tr><th>Count</th><th>Pitches</th>{cols.map(t => <th key={t.t}>{t.name}</th>)}</tr></thead>
              <tbody>
                {COUNT_GROUPS.map(g => { const r = rowFor(p => countGroup(p.balls, p.strikes) === g); return (
                  <tr key={g}><td style={{ fontWeight: 800 }}>{g}</td><td>{r.n}</td>{cols.map(t => { const v = r.n ? (r.m.get(t.t) ?? 0) / r.n : 0; return <td key={t.t} title={`${r.m.get(t.t) ?? 0} of ${r.n}`} style={{ background: r.n ? shade(v) : undefined }}>{r.n ? pc(v) : '—'}</td> })}</tr>
                ) })}
                {(['L', 'R'] as const).map(h => { const r = rowFor(p => p.batSide === h); return (
                  <tr key={h}><td style={{ fontWeight: 800 }}>vs {h === 'L' ? 'left' : 'right'}-handed</td><td>{r.n}</td>{cols.map(t => { const v = r.n ? (r.m.get(t.t) ?? 0) / r.n : 0; return <td key={t.t} title={`${r.m.get(t.t) ?? 0} of ${r.n}`} style={{ background: r.n ? shade(v) : undefined }}>{r.n ? pc(v) : '—'}</td> })}</tr>
                ) })}
              </tbody>
            </table>
            <p style={note}>The share of his pitches of each type, by the count when thrown and by the side the hitter batted from. Darker is a larger share.</p>
          </div>

          {sLog && selPaths.length > 0 && <FlightSection log={sLog} paths={selPaths} slow={slow} setSlow={setSlow} title={`${pt === 'ALL' ? 'His pitches' : types.find(t => t.t === pt)?.name} · season shape`} />}

          <div className="pd-span3" style={tile}>
            <div style={kick}>Every plate appearance · {pas.length}</div>
            <PAList pas={pas} who="pitcher" />
            <p style={note}>Each dot is a pitch, coloured by type and marked B ball, CS called strike, SS swinging strike, F foul, IP in play. Hover a dot for the speed, count and result.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
