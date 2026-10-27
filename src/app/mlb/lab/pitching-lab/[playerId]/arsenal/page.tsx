'use client'

// src/app/mlb/lab/pitching-lab/[playerId]/arsenal/page.tsx
//
// 2026-09-14 rebuild — comprehensive per-pitch breakdown, laid out after
// the Pitch Profiler reference card (identity header + movement/frequency
// panels + a dense per-pitch table). Two real sources merged by pitch
// type:
//   - data.movementRows (Pitching Lab context, from pitch_arsenals via
//     getPitchMovementFromDB) — velo, H-break, V-break.
//   - /api/pitcher-arsenal (live Savant CSV pull, same route
//     PitcherArsenalCard already uses) — whiff%/put-away%/K%/BA/SLG/wOBA/
//     xwOBA/hard-hit%/run value.
//
// Release point, spin rate, and extension ARE real (see ReleaseChart.tsx
// and the Edge+ tab) — an earlier version of this comment wrongly claimed
// they weren't in this app's data pipeline anywhere; they're on the same
// raw per-pitch log (src/lib/pitcher-pitch-log.ts) everything else here
// already uses. Still not shown here: VAA/HAA (no real column for those
// anywhere this app reads).
//
// 2026-09-14 (later): added a pitch selector. Pick a specific pitch and
// this tab drops into a per-pitch detail view — its own hot zone (reusing
// the exact same real 13-zone data + component Location Lab uses, just
// scoped to data.arsenal[split].arsenal[pitchType]), the full stat
// readout for that pitch, and a "how does this pitch grade" layered radar
// (src/lib/pitch-type-percentiles.ts — real percentile vs every other
// pitcher's same pitch type league-wide).

import { useEffect, useMemo, useState } from 'react'
import PitchUsageDonut from '@/components/PitchUsageDonut'
import PitchArsenalSummary from '@/components/PitchArsenalSummary'
import ZoneGrid, { METRICS, ZoneColorLegend } from '@/components/pitching-lab/ZoneGrid'
import PitchGradeRadar from '@/components/pitching-lab/PitchGradeRadar'
import Link from 'next/link'
import { ordinal } from '@/lib/ordinal'
import { MIN_SAMPLE } from '@/lib/min-sample'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import { FlightSection, PitchCards, buildPaths, type PitchPath } from '@/components/pitching-lab/PitchFlight'
import { MovementProfile, PitchSeasonLine, SmoothHeatmap, UsageTrend } from '@/components/pitching-lab/ArsenalExtras'
import type { PitcherPitchLog } from '@/lib/pitcher-pitch-log'
import ReleaseChart from '@/components/pitching-lab/ReleaseChart'
import EdgePlusCard from '@/components/pitching-lab/EdgePlusCard'
import VeloBandChart from '@/components/pitching-lab/VeloBandChart'
import { usePitchingLabData } from '@/lib/pitching-lab-context'
import type { ArsenalRow } from '@/app/api/pitcher-arsenal/route'
import type { PitcherZoneMetric } from '@/lib/hot-zones'
import type { PitchGradeStat } from '@/lib/pitch-type-percentiles'
import type { PitchMovementRow } from '@/lib/pitcher-full-stats'

const SEASON = new Date().getFullYear()

type MergedArsenalRow = ArsenalRow & { movement: PitchMovementRow | null }

function fmtPct(v: number | null): string { return v != null ? `${v.toFixed(1)}%` : '—' }
function fmtRate(v: number | null): string { return v != null ? v.toFixed(3).replace(/^0\./, '.') : '—' }
function fmtRv(v: number | null): string { return v != null ? (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) : '—' }
function fmtIn(v: number | null): string { return v != null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}"` : '—' }

type Split = 'all' | 'vs_lhb' | 'vs_rhb'
const SPLIT_LABELS: Record<Split, string> = { all: 'All', vs_lhb: 'vs LHB', vs_rhb: 'vs RHB' }

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-widest text-stone-400">{label}</div>
      <div className="text-[15px] font-bold text-stone-900">{value}</div>
    </div>
  )
}

const tile: React.CSSProperties = { background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: 14, minWidth: 0 }
const tileKick: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.14em', color: '#FF5722', textTransform: 'uppercase' }

/** The nine tiles for one pitch, in a 3 x 3 grid so everything about it is on one screen. */
function PitchTiles({ row, path, log, pitcherId, teamColor, slow, setSlow }: { row: MergedArsenalRow; path: PitchPath | undefined; log: PitcherPitchLog | null; pitcherId: number; teamColor: string; slow: number; setSlow: (n: number) => void }) {
  const { data } = usePitchingLabData()
  const [split, setSplit] = useState<Split>('all')
  const [metric, setMetric] = useState<PitcherZoneMetric>('usage_pct')
  const [grade, setGrade] = useState<{ stats: PitchGradeStat[]; poolSize: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/pitch-grade?playerId=${pitcherId}&pitchType=${row.pitchType}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setGrade(json) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [pitcherId, row.pitchType])

  const availableSplits = (['all', 'vs_lhb', 'vs_rhb'] as Split[]).filter(s => data?.arsenal[s]?.arsenal[row.pitchType])
  const zones = data?.arsenal[split]?.arsenal[row.pitchType]?.zones ?? null
  const hb = path ? path.hb : row.movement?.avgHBreak ?? null
  const ivb = path ? path.ivb : row.movement?.avgVBreak ?? null
  const nums: [string, string][] = [
    ['Pitches', String(row.pitches)], ['Usage', `${row.usage.toFixed(1)}%`], ['Velo', row.movement?.avgVelocity != null ? `${row.movement.avgVelocity.toFixed(1)} mph` : '—'],
    ['Arm-side', fmtIn(hb)], ['Rise', fmtIn(ivb)], ['Spin', path?.spin != null ? `${Math.round(path.spin)} rpm` : '—'],
    ['Whiff', fmtPct(row.whiffPct)], ['Put-away', fmtPct(row.putAway)], ['K', fmtPct(row.kPct)],
    ['BA', fmtRate(row.ba)], ['SLG', fmtRate(row.slg)], ['wOBA', fmtRate(row.woba)],
    ['xwOBA', fmtRate(row.estWoba)], ['Hard-hit', fmtPct(row.hardHitPct)], ['Runs/100', fmtRv(row.runValuePer100)],
  ]

  const ranked = (grade?.stats ?? []).filter(x => x.percentile != null).sort((x, y) => (y.percentile as number) - (x.percentile as number))
  const best = ranked[0], worst = ranked.length > 1 ? ranked[ranked.length - 1] : null
  const pitchWord = row.pitchName.toLowerCase()
  const overall = ranked.length ? Math.round(ranked.reduce((t, x) => t + (x.percentile as number), 0) / ranked.length) : 0

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <SpinBall code={row.pitchType} size={52} spin={{ rpm: path?.spin ?? null, ivb, hb }} />
        <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>{row.pitchName}</h2>
        <span style={{ fontSize: 15, color: '#5b5347', lineHeight: 1.4 }}>
          {grade === null ? 'Ranking against the league…' : !best ? 'Not enough league data to rank this pitch.' : (
            <>
              <b title={`The average of the ${ranked.length} measures on the grade radar, each ranked against every ${pitchWord} in the league`} style={{ color: '#1A1A1A' }}>{ordinal(overall)} percentile</b> overall among {grade.poolSize} {pitchWord}s in the league
              {row.pitches < MIN_SAMPLE.arsenalPitchesPerType && <span title={`n = ${row.pitches}`} style={{ color: '#D4533B', fontWeight: 800 }}> *</span>}
              <span style={{ color: '#8a8275' }}> · best {best.label} {ordinal(Math.round(best.percentile as number))}{worst ? `, lowest ${worst.label} ${ordinal(Math.round(worst.percentile as number))}` : ''}</span>
            </>
          )}
        </span>
      </div>
      <div className="ars-g3">
        {log ? <FlightSection log={log} paths={path ? [path] : []} slow={slow} setSlow={setSlow} title={row.pitchName} /> : <div style={tile}>Loading each pitch…</div>}
        {log ? <SmoothHeatmap pitches={log.pitches.filter(p => p.pitchType === row.pitchType)} title={row.pitchName} /> : <div style={tile} />}

        <div style={tile}>
          <div style={tileKick}>{row.pitchName} · the numbers</div>
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px 8px', margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
            {nums.map(([k, v]) => <div key={k}><dt style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: '#a89e8c', textTransform: 'uppercase' }}>{k}</dt><dd style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{v}</dd></div>)}
          </dl>
          <p style={{ margin: '12px 0 0', fontSize: 11, color: '#a89e8c', lineHeight: 1.5 }}>Runs per 100 pitches: a negative number is good for the pitcher. Break is in inches, arm-side positive.</p>
        </div>

        <div style={tile}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={tileKick}>{row.pitchName} · hot zone</div>
            {availableSplits.length > 1 && (
              <div className="flex gap-1">
                {availableSplits.map(s => (
                  <button key={s} onClick={() => setSplit(s)} style={{ fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '2px 9px', cursor: 'pointer', border: `1px solid ${split === s ? '#FF5722' : '#e7e2d8'}`, background: split === s ? '#fff1ea' : '#fff', color: split === s ? '#FF5722' : '#1A1A1A' }}>{SPLIT_LABELS[s]}</button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 my-3 justify-center">
            {METRICS.map(m => (
              <button key={m.key} onClick={() => setMetric(m.key)} style={{ fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '2px 9px', cursor: 'pointer', border: `1px solid ${metric === m.key ? '#FF5722' : '#e7e2d8'}`, background: metric === m.key ? '#fff1ea' : '#fff', color: metric === m.key ? '#FF5722' : '#1A1A1A' }}>{m.label}</button>
            ))}
          </div>
          {zones ? (
            <>
              <ZoneGrid zones={zones} metric={metric} view="catcher" />
              <div className="mt-3"><ZoneColorLegend metric={metric} /></div>
            </>
          ) : <p className="text-center text-[12px] text-stone-400 py-10">No zone data for this pitch yet.</p>}
        </div>

        {grade ? <PitchGradeRadar stats={grade.stats} color={teamColor} poolSize={grade.poolSize} /> : <div style={{ ...tile, display: 'grid', placeItems: 'center', color: '#a89e8c', fontSize: 12 }}>Grading this pitch…</div>}

        {log && path ? <MovementProfile log={log} paths={buildPaths(log)} focus={row.pitchType} compact /> : <div style={tile} />}
        {log ? <PitchSeasonLine log={log} type={row.pitchType} name={row.pitchName} /> : <div style={tile} />}

        <div style={{ ...tile, background: '#fcfbf8' }}>
          <div style={tileKick}>See the shape</div>
          <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.5, color: '#3a352c' }}>
            The Shape tab draws {row.pitchName} in 3D: where it is released and how that has moved month by month, and how far it breaks compared with a pitch thrown with no spin, with the pitch count behind each month.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 13, color: '#8a8275', lineHeight: 1.5 }}>For a deeper look at where it is thrown, open Location Lab.</p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
            <Link href={`/mlb/lab/pitching-lab/${pitcherId}/shape`} style={{ fontWeight: 800, fontSize: 14, color: '#FF5722', textDecoration: 'none' }}>Open Shape →</Link>
            <Link href={`/mlb/lab/pitching-lab/${pitcherId}/location`} style={{ fontWeight: 800, fontSize: 14, color: '#FF5722', textDecoration: 'none' }}>Location Lab →</Link>
          </div>
        </div>
      </div>

      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: 14, color: '#FF5722', padding: '4px 0' }}>Stuff grade for {row.pitchName}</summary>
        <div style={{ marginTop: 10 }}><EdgePlusCard pitcherId={pitcherId} pitchType={row.pitchType} pitchName={row.pitchName} stats={grade?.stats ?? []} /></div>
      </details>
    </>
  )
}

export default function ArsenalPage() {
  const { data, failed } = usePitchingLabData()
  const [liveRows, setLiveRows] = useState<ArsenalRow[] | null>(null)
  const [selectedPitch, setSelectedPitch] = useState<string>('ALL')
  const [log, setLog] = useState<PitcherPitchLog | null | 'error'>(null)
  const [slow, setSlow] = useState(6)

  const playerId = data?.id ?? null

  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    fetch(`/api/pitcher-arsenal?pitcherId=${playerId}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setLiveRows(json.rows ?? []) })
      .catch(() => { if (!cancelled) setLiveRows([]) })
    return () => { cancelled = true }
  }, [playerId])

  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    fetch(`/api/mlb/pitch-log?playerId=${playerId}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setLog(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setLog('error') })
    return () => { cancelled = true }
  }, [playerId])

  const paths = useMemo(() => (log && log !== 'error' ? buildPaths(log) : []), [log])
  // Break comes from Savant's own per-pitch numbers when the log has them (the saved arsenal table has held a wrong curveball rise), else the saved row.
  const movementByType = useMemo(() => new Map((data?.movementRows ?? []).map(r => {
    const p = paths.find(x => x.type === r.pitchType)
    return [r.pitchType, p ? { ...r, avgHBreak: p.hb, avgVBreak: p.ivb } : r] as const
  })), [data, paths])
  const merged: MergedArsenalRow[] = useMemo(
    () => (liveRows ?? []).map(r => ({ ...r, movement: movementByType.get(r.pitchType) ?? null })),
    [liveRows, movementByType],
  )

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this pitcher&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  const selectedRow = selectedPitch !== 'ALL' ? merged.find(r => r.pitchType === selectedPitch) ?? null : null

  const goodLog = log && log !== 'error' ? log : null
  const selPath = selectedRow ? paths.filter(p => p.type === selectedRow.pitchType) : []
  const logWait = log === null ? 'Loading each pitch…' : 'No pitch flight data for this pitcher yet.'

  return (
    <div className="ars-grid">
      <style>{`.ars-grid{display:grid;grid-template-columns:210px minmax(0,1fr);gap:24px;align-items:start}.ars-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.ars-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:8px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:14px;color:#1A1A1A}.ars-btn small{display:block;font-weight:600;font-size:12px;color:#8a8275}.ars-btn.on{border-color:#FF5722;background:#fff1ea}.ars-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.ars-span2{grid-column:span 2}@media (max-width:1180px){.ars-g3{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:760px){.ars-g3{grid-template-columns:minmax(0,1fr)}.ars-span2{grid-column:auto}}@media (max-width:860px){.ars-grid{grid-template-columns:minmax(0,1fr)}.ars-side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.ars-btn{width:auto;white-space:nowrap}}`}</style>
      <SpinBallStyles />
      <nav className="ars-side" aria-label="Pitch types">
        <button type="button" className={`ars-btn${selectedPitch === 'ALL' ? ' on' : ''}`} onClick={() => setSelectedPitch('ALL')}>
          <span style={{ width: 30, height: 30, borderRadius: 999, background: '#1A1A1A', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, flexShrink: 0 }}>All</span>
          <span>All pitches<small>{merged.length} types</small></span>
        </button>
        {merged.map(r => (
          <button key={r.pitchType} type="button" className={`ars-btn${selectedPitch === r.pitchType ? ' on' : ''}`} onClick={() => setSelectedPitch(r.pitchType)}>
            <SpinBall code={r.pitchType} size={30} spin={{ rpm: paths.find(x => x.type === r.pitchType)?.spin ?? null, ivb: paths.find(x => x.type === r.pitchType)?.ivb ?? null, hb: paths.find(x => x.type === r.pitchType)?.hb ?? null }} />
            <span>{r.pitchName}<small>{r.usage.toFixed(0)}% · {r.movement?.avgVelocity != null ? `${r.movement.avgVelocity.toFixed(1)} mph` : '—'}</small></span>
          </button>
        ))}
      </nav>

      <div className="space-y-6" style={{ minWidth: 0 }}>
        {selectedRow ? (
          <>
            <PitchTiles key={selectedRow.pitchType} row={selectedRow} path={selPath[0]} log={goodLog} pitcherId={data.id} teamColor={data.color} slow={slow} setSlow={setSlow} />
          </>
        ) : (
          <>
            {liveRows && liveRows.length > 0 && <PitchArsenalSummary rows={liveRows} pitcherName={data.name} />}
            {goodLog && paths.length > 0 ? (
              <>
                <div className="ars-g3">
                  <MovementProfile log={goodLog} paths={paths} />
                  <div className="ars-span2" style={{ minWidth: 0 }}><UsageTrend log={goodLog} paths={paths} /></div>
                  <FlightSection log={goodLog} paths={paths} slow={slow} setSlow={setSlow} title="All pitches together" />
                  <SmoothHeatmap pitches={goodLog.pitches} title="All pitches" />
                </div>
                <PitchCards paths={paths} movement={data.movementRows} slow={slow} onPick={setSelectedPitch} />
              </>
            ) : <p className="text-[14px] text-stone-400">{logWait}</p>}
            <VeloBandChart pitcherId={data.id} />
            <ReleaseChart pitcherId={data.id} hideScatter />
          {merged.length > 0 && (
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <p className="text-[9px] uppercase tracking-widest text-orange-600 font-bold px-5 pt-5">Full arsenal breakdown</p>
              <p className="text-[10px] text-stone-400 px-5 mt-1">Click a pitch on the left (or a row below) for its hot zone, full stat line, and grade.</p>
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-[11px] min-w-[900px]">
                  <thead>
                    <tr className="text-stone-400 uppercase text-[9px] tracking-wider">
                      <th className="text-left px-4 py-2">Pitch</th>
                      <th className="text-right px-2 py-2">#</th>
                      <th className="text-right px-2 py-2">Usage%</th>
                      <th className="text-right px-2 py-2">Velo</th>
                      <th className="text-right px-2 py-2">HB</th>
                      <th className="text-right px-2 py-2">IVB</th>
                      <th className="text-right px-2 py-2">Whiff%</th>
                      <th className="text-right px-2 py-2">PutAway%</th>
                      <th className="text-right px-2 py-2">K%</th>
                      <th className="text-right px-2 py-2">BA</th>
                      <th className="text-right px-2 py-2">wOBA</th>
                      <th className="text-right px-2 py-2">xwOBA</th>
                      <th className="text-right px-2 py-2">HardHit%</th>
                      <th className="text-right px-4 py-2">RV/100</th>
                    </tr>
                  </thead>
                  <tbody>
                    {merged.map(r => (
                      <tr key={r.pitchType} onClick={() => setSelectedPitch(r.pitchType)} className="border-t border-stone-50 cursor-pointer hover:bg-orange-50/50">
                        <td className="px-4 py-2 text-stone-800 font-semibold whitespace-nowrap">{r.pitchName}</td>
                        <td className="px-2 py-2 text-right text-stone-600">{r.pitches}</td>
                        <td className="px-2 py-2 text-right text-stone-600">{r.usage.toFixed(1)}%</td>
                        <td className="px-2 py-2 text-right text-stone-600">{r.movement?.avgVelocity?.toFixed(1) ?? '—'}</td>
                        <td className="px-2 py-2 text-right text-stone-600">{fmtIn(r.movement?.avgHBreak ?? null)}</td>
                        <td className="px-2 py-2 text-right text-stone-600">{fmtIn(r.movement?.avgVBreak ?? null)}</td>
                        <td className="px-2 py-2 text-right text-stone-600">{fmtPct(r.whiffPct)}</td>
                        <td className="px-2 py-2 text-right text-stone-600">{fmtPct(r.putAway)}</td>
                        <td className="px-2 py-2 text-right text-stone-600">{fmtPct(r.kPct)}</td>
                        <td className="px-2 py-2 text-right text-stone-600">{fmtRate(r.ba)}</td>
                        <td className="px-2 py-2 text-right text-stone-600">{fmtRate(r.woba)}</td>
                        <td className="px-2 py-2 text-right text-stone-600">{fmtRate(r.estWoba)}</td>
                        <td className="px-2 py-2 text-right text-stone-600">{fmtPct(r.hardHitPct)}</td>
                        <td className={`px-4 py-2 text-right font-bold ${r.runValuePer100 != null && r.runValuePer100 < 0 ? 'text-blue-600' : r.runValuePer100 != null && r.runValuePer100 > 0 ? 'text-red-600' : 'text-stone-400'}`}>
                          {fmtRv(r.runValuePer100)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[9px] text-stone-400 px-4 py-3">
                HB/IVB = horizontal/induced-vertical break (arm-side +, glove-side −). Velo/HB/IVB from pitch_arsenals; everything else from a live pitch-arsenal pull.
                Runs saved: a negative number = good for the pitcher. Release point, spin and extension are on the pitch cards above.
              </p>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  )
}
