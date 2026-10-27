'use client'

// src/components/scout/lab/StarterDesk.tsx
//
// Scout Report → Starters (was §9 Pitcher attack deep). Both starters in the lab layout: pick the starter and then a pitch down the left (the ball
// spins the way that pitch spins), and the tiles show his movement, the pitches as the hitter sees them (flight and release points), how he
// goes about each count (a count by pitch table; click a count and the location tile follows it) and how the mix and locations differ against
// left- and right-handed hitters. Built from his season of pitches (the open version of the log, so nothing here needs the Pro deep look);
// sequencing, the overlay and H2H are one click away in the Pitching Lab. Descriptions of what he has done, not what he will do.

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Headshot, TeamMark } from '@/components/home/Logo'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import { C, SANS } from '@/components/team/ui'
import { pitchColor } from '@/lib/mlb'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { fetchLabLog } from '@/lib/lab-log'
import type { PitcherPitchLog, RawPitch } from '@/lib/pitcher-pitch-log'
import { FlightSection, buildPaths } from '@/components/pitching-lab/PitchFlight'
import { MovementProfile, SmoothHeatmap } from '@/components/pitching-lab/ArsenalExtras'
import { Pills, kick, note, star, tile } from '@/components/pitching-lab/LocationExplorer'
import type { StarterProfile } from '@/lib/scout/starter-profile'
import StarterViews, { STARTER_VIEWS, type StarterView } from './StarterViews'

export type Starter = { id: number | null; name: string; clubId: number; abbr: string; side: 'Away' | 'Home' }

const COUNT_GROUPS: [string, string, (p: RawPitch) => boolean][] = [
  ['all', 'Any count', () => true],
  ['first', 'First pitch (0-0)', p => p.balls === 0 && p.strikes === 0],
  ['ahead', 'Ahead of the hitter', p => p.balls != null && p.strikes != null && p.strikes > p.balls],
  ['even', 'Even', p => p.balls != null && p.strikes != null && p.balls === p.strikes],
  ['behind', 'Behind the hitter', p => p.balls != null && p.strikes != null && p.balls > p.strikes],
  ['two', 'Two strikes', p => p.strikes === 2],
]
const pc = (v: number) => `${(v * 100).toFixed(0)}%`
const shade = (v: number) => `rgba(255,87,34,${(0.08 + Math.min(1, v) * 0.7).toFixed(2)})`

export default function StarterDesk({ starters, profiles = {} }: { starters: Starter[]; profiles?: Record<number, StarterProfile | null> }) {
  const [view, setView] = useState<StarterView>('overview')
  const season = new Date().getFullYear()
  const [who, setWho] = useState(() => Math.max(0, starters.findIndex(s => s.id != null)))
  const [pitch, setPitch] = useState('ALL')
  const [count, setCount] = useState('all')
  const [slow, setSlow] = useState(6)
  const [hm, setHm] = useState<'L' | 'R'>('R')
  const [logs, setLogs] = useState<Record<number, PitcherPitchLog | null>>({})
  const cur = starters[who]
  const log = cur?.id != null ? logs[cur.id] : undefined

  useEffect(() => {
    if (cur?.id == null || logs[cur.id] !== undefined) return
    let off = false
    const id = cur.id
    fetchLabLog('pitcher', id, season).then(l => { if (!off) setLogs(x => ({ ...x, [id]: l })) })
    return () => { off = true }
  }, [cur?.id, season]) // eslint-disable-line react-hooks/exhaustive-deps

  const paths = useMemo(() => (log ? buildPaths(log) : []), [log])
  const types = useMemo(() => {
    if (!log) return []
    const by = new Map<string, number>()
    for (const p of log.pitches) by.set(p.pitchType, (by.get(p.pitchType) ?? 0) + 1)
    return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ t, n, name: log.pitchNames[t] ?? t }))
  }, [log])
  const countFn = COUNT_GROUPS.find(c => c[0] === count)![2]
  const cols = types.slice(0, 6)

  const spinOf = (t: string) => { const f = paths.find(x => x.type === t); return { rpm: f?.spin ?? null, ivb: f?.ivb ?? null, hb: f?.hb ?? null } }
  const rowFor = (fn: (p: RawPitch) => boolean) => {
    const ps = (log?.pitches ?? []).filter(fn)
    const m = new Map<string, number>()
    for (const p of ps) m.set(p.pitchType, (m.get(p.pitchType) ?? 0) + 1)
    return { n: ps.length, m }
  }
  const focusPitches = (log?.pitches ?? []).filter(p => (pitch === 'ALL' || p.pitchType === pitch) && countFn(p))
  const selPaths = pitch === 'ALL' ? paths : paths.filter(p => p.type === pitch)
  const sideMix = (h: 'L' | 'R') => rowFor(p => p.stand === h)
  const labName = (t: string) => log?.pitchNames[t] ?? t

  return (
    <div className="sd-grid">
      <style>{`.sd-grid{display:grid;grid-template-columns:210px minmax(0,1fr);gap:24px;align-items:start}.sd-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.sd-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:8px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:14px;color:#1A1A1A;font-family:inherit}.sd-btn small{display:block;font-weight:600;font-size:12px;color:#8a8275}.sd-btn.on{border-color:#FF5722;background:#fff1ea}.sd-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.sd-span2{grid-column:span 2}.sd-span3{grid-column:1 / -1}.sd-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.sd-tbl th{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a89e8c;text-align:center;padding:6px 8px;border-bottom:1px solid #e7e2d8}.sd-tbl th:first-child,.sd-tbl td:first-child{text-align:left}.sd-tbl td{text-align:center;padding:7px 8px;border-top:1px solid #fff}@media (max-width:1180px){.sd-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:860px){.sd-grid{grid-template-columns:minmax(0,1fr)}.sd-side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.sd-btn{width:auto;white-space:nowrap}.sd-tiles{grid-template-columns:minmax(0,1fr)}.sd-span2{grid-column:auto}}`}</style>
      <SpinBallStyles />

      <nav className="sd-side" aria-label="Starters and pitches">
        <div style={{ ...kick, margin: '0 2px 2px' }}>Starter</div>
        {starters.map((s, i) => (
          <button key={s.side} type="button" className={`sd-btn${who === i ? ' on' : ''}`} onClick={() => { setWho(i); setPitch('ALL'); setCount('all') }}>
            {s.id != null ? <Headshot id={s.id} name={s.name} size={34} /> : <span style={{ width: 34, height: 34 }} />}
            <span>{s.name}<small><TeamMark id={s.clubId} abbr={s.abbr} size={14} /> {s.side}</small></span>
          </button>
        ))}
        {types.length > 0 && <div style={{ ...kick, margin: '8px 2px 2px' }}>Pitch</div>}
        {types.length > 0 && (
          <button type="button" className={`sd-btn${pitch === 'ALL' ? ' on' : ''}`} onClick={() => setPitch('ALL')}>
            <span style={{ width: 30, height: 30, borderRadius: 999, background: '#1A1A1A', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, flexShrink: 0 }}>All</span>
            <span>All pitches<small>{log?.pitches.length ?? 0}</small></span>
          </button>
        )}
        {types.map(t => (
          <button key={t.t} type="button" className={`sd-btn${pitch === t.t ? ' on' : ''}`} onClick={() => setPitch(t.t)}>
            <SpinBall code={t.t} size={30} spin={spinOf(t.t)} />
            <span>{t.name}<small>{((t.n / (log?.pitches.length || 1)) * 100).toFixed(0)}% · {t.n}</small></span>
          </button>
        ))}
      </nav>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>
        {!cur || cur.id == null ? <p style={{ fontSize: 14, color: C.mute }}>The {cur?.side.toLowerCase() ?? ''} starter has not been announced yet.</p> : log === undefined ? <p style={{ fontSize: 14, color: C.mute }}>Loading every pitch he has thrown…</p> : log === null || log.pitches.length === 0 ? <p style={{ fontSize: 14, color: C.mute }}>No pitches on record for {cur.name} this season.</p> : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>{cur.name}</h2>
              <span style={{ fontSize: 15, color: '#5b5347' }}>{log.throws ? `${log.throws === 'L' ? 'Left' : 'Right'}-handed · ` : ''}{log.pitches.length} pitches in {season}{pitch !== 'ALL' ? ` · ${labName(pitch)}` : ''}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontSize: 13, fontWeight: 800 }}>
                <Link href={`/mlb/lab/pitching-lab/${cur.id}/arsenal`} style={{ color: C.orange, textDecoration: 'none' }}>Arsenal →</Link>
                <Link href={`/mlb/lab/pitching-lab/${cur.id}/location`} style={{ color: C.orange, textDecoration: 'none' }}>Location Lab →</Link>
                <Link href={`/mlb/lab/pitching-lab/${cur.id}/sequencing`} style={{ color: C.orange, textDecoration: 'none' }}>Sequencing →</Link>
              </span>
            </div>

            <Pills items={STARTER_VIEWS} value={view} onChange={setView} />
            {view !== 'overview' ? (
              profiles[cur.id] ? <StarterViews p={profiles[cur.id] as StarterProfile} view={view} name={cur.name} /> : <p style={{ fontSize: 14, color: C.mute }}>No season breakdown is available for {cur.name} yet.</p>
            ) : (
            <div className="sd-tiles">
              {paths.length > 0 && <MovementProfile log={log} paths={paths} focus={pitch === 'ALL' ? undefined : pitch} />}
              <div className="sd-span2" style={{ ...tile, overflowX: 'auto' }}>
                <div style={kick}>How he goes about each count</div>
                <table className="sd-tbl" style={{ marginTop: 6, minWidth: 520 }}>
                  <thead><tr><th>Count</th><th>Pitches</th>{cols.map(t => <th key={t.t}>{t.name}</th>)}</tr></thead>
                  <tbody>
                    {COUNT_GROUPS.map(([k, l, fn]) => {
                      const r = rowFor(fn)
                      return (
                        <tr key={k} style={{ cursor: 'pointer', outline: count === k ? `2px solid ${C.orange}` : undefined }} onClick={() => setCount(k)}>
                          <td style={{ fontWeight: 800 }}>{l}</td>
                          <td>{r.n}{r.n < MIN_SAMPLE.arsenalPitchesPerType && r.n > 0 && star}</td>
                          {cols.map(t => { const v = r.n ? (r.m.get(t.t) ?? 0) / r.n : 0; return <td key={t.t} title={`${r.m.get(t.t) ?? 0} of ${r.n}`} style={{ background: r.n ? shade(v) : undefined }}>{r.n ? pc(v) : '—'}</td> })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p style={note}>The share of his pitches of each type in that count. Click a count and the location tile below follows it. {star} marks a small sample.</p>
              </div>

              <FlightSection log={log} paths={selPaths} slow={slow} setSlow={setSlow} title={pitch === 'ALL' ? 'All pitches together' : labName(pitch)} />
              <SmoothHeatmap pitches={focusPitches} title={`${pitch === 'ALL' ? 'All pitches' : labName(pitch)} · ${COUNT_GROUPS.find(c => c[0] === count)![1]}`} counts={false} />

              {(['L', 'R'] as const).map(h => {
                const r = sideMix(h)
                return (
                  <div key={h} style={tile}>
                    <div style={kick}>Against {h === 'L' ? 'left' : 'right'}-handed hitters</div>
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {types.slice(0, 6).map(t => { const v = r.n ? (r.m.get(t.t) ?? 0) / r.n : 0; return (
                        <div key={t.t} style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr) 44px', alignItems: 'center', gap: 8, fontSize: 13 }}>
                          <span style={{ fontWeight: 800 }}>{t.name}</span>
                          <span style={{ height: 12, background: C.soft, borderRadius: 6, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${v * 100}%`, background: pitchColor(t.t) }} /></span>
                          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pc(v)}</span>
                        </div>
                      ) })}
                    </div>
                    <p style={note}>{r.n} pitches{r.n < MIN_SAMPLE.arsenalPitchesPerType ? <> {star} small sample</> : ''}.</p>
                  </div>
                )
              })}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                <Pills items={[['L', 'To left-handed hitters'], ['R', 'To right-handed hitters']] as ['L' | 'R', string][]} value={hm} onChange={setHm} />
                <SmoothHeatmap pitches={log.pitches.filter(p => (pitch === 'ALL' || p.pitchType === pitch) && p.stand === hm)} title={hm === 'L' ? 'Against lefties' : 'Against righties'} counts={false} />
              </div>
            </div>
            )}
            <p style={note}>Built from {cur.name}&apos;s Statcast pitches this season, all counts unless one is chosen. These describe what he has done, not what he will do. Sequencing, the hot zone overlay and head to head are in his Pitching Lab.</p>
          </>
        )}
      </div>
    </div>
  )
}
