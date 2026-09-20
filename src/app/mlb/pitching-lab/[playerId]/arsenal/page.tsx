'use client'

// src/app/mlb/pitching-lab/[playerId]/arsenal/page.tsx
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
import PitchMovementChart from '@/components/PitchMovementChart'
import PitchUsageDonut from '@/components/PitchUsageDonut'
import PitchArsenalSummary from '@/components/PitchArsenalSummary'
import ZoneGrid, { METRICS, ZoneColorLegend } from '@/components/pitching-lab/ZoneGrid'
import PitchGradeRadar from '@/components/pitching-lab/PitchGradeRadar'
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
      <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">{label}</div>
      <div className="text-[15px] font-mono font-bold text-stone-900">{value}</div>
    </div>
  )
}

function PitchDetail({ row, pitcherId, teamColor }: { row: MergedArsenalRow; pitcherId: number; teamColor: string }) {
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

  return (
    <div className="space-y-5">
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-4">{row.pitchName} — full stat line</p>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-4">
          <StatBlock label="Pitches" value={String(row.pitches)} />
          <StatBlock label="Usage%" value={`${row.usage.toFixed(1)}%`} />
          <StatBlock label="Velo" value={row.movement?.avgVelocity != null ? `${row.movement.avgVelocity.toFixed(1)} mph` : '—'} />
          <StatBlock label="HB" value={fmtIn(row.movement?.avgHBreak ?? null)} />
          <StatBlock label="IVB" value={fmtIn(row.movement?.avgVBreak ?? null)} />
          <StatBlock label="Whiff%" value={fmtPct(row.whiffPct)} />
          <StatBlock label="Put-Away%" value={fmtPct(row.putAway)} />
          <StatBlock label="K%" value={fmtPct(row.kPct)} />
          <StatBlock label="BA" value={fmtRate(row.ba)} />
          <StatBlock label="SLG" value={fmtRate(row.slg)} />
          <StatBlock label="wOBA" value={fmtRate(row.woba)} />
          <StatBlock label="xwOBA" value={fmtRate(row.estWoba)} />
          <StatBlock label="Hard-Hit%" value={fmtPct(row.hardHitPct)} />
          <StatBlock label="RV/100" value={fmtRv(row.runValuePer100)} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold">{row.pitchName} — hot zone</p>
            {availableSplits.length > 1 && (
              <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
                {availableSplits.map(s => (
                  <button key={s} onClick={() => setSplit(s)} className={`font-mono uppercase tracking-wider rounded-md px-2 py-1 text-[9px] transition ${split === s ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>
                    {SPLIT_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-4 justify-center">
            {METRICS.map(m => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`font-mono uppercase tracking-wider rounded border px-2 py-1 text-[9px] transition ${
                  metric === m.key ? 'border-[#FF5722] text-[#FF5722] bg-orange-50' : 'border-stone-200 text-stone-400 hover:border-stone-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {zones ? (
            <>
              <ZoneGrid zones={zones} metric={metric} view="catcher" />
              <div className="mt-3"><ZoneColorLegend metric={metric} /></div>
            </>
          ) : (
            <p className="text-center text-[12px] font-serif italic text-stone-400 py-10">No zone data for this pitch yet.</p>
          )}
        </div>

        {grade ? (
          <PitchGradeRadar stats={grade.stats} color={teamColor} poolSize={grade.poolSize} />
        ) : (
          <div className="bg-white border border-stone-200 rounded-xl p-5 flex items-center justify-center h-64 text-[12px] text-stone-400">Grading this pitch…</div>
        )}
      </div>

      <EdgePlusCard pitcherId={pitcherId} pitchType={row.pitchType} pitchName={row.pitchName} stats={grade?.stats ?? []} />
    </div>
  )
}

export default function ArsenalPage() {
  const { data, failed } = usePitchingLabData()
  const [liveRows, setLiveRows] = useState<ArsenalRow[] | null>(null)
  const [selectedPitch, setSelectedPitch] = useState<string>('ALL')

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

  const movementByType = useMemo(() => new Map((data?.movementRows ?? []).map(r => [r.pitchType, r])), [data])
  const merged: MergedArsenalRow[] = useMemo(
    () => (liveRows ?? []).map(r => ({ ...r, movement: movementByType.get(r.pitchType) ?? null })),
    [liveRows, movementByType],
  )

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this pitcher&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  const selectedRow = selectedPitch !== 'ALL' ? merged.find(r => r.pitchType === selectedPitch) ?? null : null

  return (
    <div className="space-y-6">
      {merged.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedPitch('ALL')}
            className={`font-mono uppercase tracking-wider rounded-full border px-3 py-1.5 text-[10px] transition ${
              selectedPitch === 'ALL' ? 'border-[#FF5722] text-[#FF5722] bg-orange-50' : 'border-stone-200 text-stone-500 hover:border-stone-300'
            }`}
          >
            All pitches
          </button>
          {merged.map(r => (
            <button
              key={r.pitchType}
              onClick={() => setSelectedPitch(r.pitchType)}
              className={`font-mono uppercase tracking-wider rounded-full border px-3 py-1.5 text-[10px] transition ${
                selectedPitch === r.pitchType ? 'border-[#FF5722] text-[#FF5722] bg-orange-50' : 'border-stone-200 text-stone-500 hover:border-stone-300'
              }`}
            >
              {r.pitchName} · {r.usage.toFixed(0)}%
            </button>
          ))}
        </div>
      )}

      {selectedRow ? (
        // Keyed by pitch type so switching pitches remounts fresh state
        // (grade fetch) instead of needing an imperative reset in an effect.
        <PitchDetail key={selectedRow.pitchType} row={selectedRow} pitcherId={data.id} teamColor={data.color} />
      ) : (
        <>
          {liveRows && liveRows.length > 0 && <PitchArsenalSummary rows={liveRows} pitcherName={data.name} />}

          <div className="grid md:grid-cols-2 gap-5">
            {data.movementRows.length > 0 ? (
              <PitchMovementChart rows={data.movementRows} />
            ) : (
              <div className="bg-white border border-stone-200 rounded-xl p-5 text-center text-[12px] text-stone-400 flex items-center justify-center">No movement data on record yet.</div>
            )}
            <div className="space-y-5">
              {liveRows && liveRows.length > 0 ? (
                <PitchUsageDonut rows={liveRows} />
              ) : (
                <div className="bg-white border border-stone-200 rounded-xl p-5 text-center text-[12px] text-stone-400 flex items-center justify-center">
                  {liveRows === null ? 'Loading pitch mix…' : 'No arsenal data on record yet.'}
                </div>
              )}
              <VeloBandChart pitcherId={data.id} />
            </div>
          </div>

          <ReleaseChart pitcherId={data.id} />

          {merged.length > 0 && (
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold px-5 pt-5">Full arsenal breakdown</p>
              <p className="text-[10px] font-mono text-stone-400 px-5 mt-1">Click a pitch above (or a row below) for its hot zone, full stat line, and grade.</p>
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-[11px] font-mono min-w-[900px]">
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
              <p className="text-[9px] font-mono text-stone-400 px-4 py-3">
                HB/IVB = horizontal/induced-vertical break (arm-side +, glove-side −). Velo/HB/IVB from pitch_arsenals; everything else from a live Baseball Savant pitch-arsenal pull.
                Run value sign convention: negative = good for the pitcher. Release point, spin rate/axis, extension, and approach angle aren&apos;t in this app&apos;s data pipeline — omitted rather than estimated.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
