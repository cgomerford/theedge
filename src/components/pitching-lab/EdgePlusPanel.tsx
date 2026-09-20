'use client'

// src/components/pitching-lab/EdgePlusPanel.tsx
//
// The "Edge+" tab — this app's own composite pitch grade (src/lib/
// edge-plus.ts, disclosed weights, real league percentiles underneath —
// not a claim of the industry Stuff+, confirmed unavailable anywhere this
// app can reach), built out in full here: a side-by-side comparison across
// every pitch this pitcher throws (why one grades elite and another
// doesn't, at a glance), then the full per-pitch breakdown (same
// EdgePlusCard used in Arsenal's pitch detail) for each one.
//
// The plain "per-pitch stuff" numbers table and the velo-band-by-start
// chart that used to live at the bottom of this tab have moved: the velo
// band is now on the Arsenal tab (below the pitch-mix donut, where usage
// context already lives — see VeloBandChart.tsx), and the numbers table
// is archived (collapsed by default below) since spin/extension are now
// real SCORED Edge+ components (shown in the cards below, not just a raw
// table) and release height/arm angle already live inside each
// EdgePlusCard's own "release point" section.
//
// Movement itself (HB/IVB) already lives on the Arsenal tab
// (PitchMovementChart, reused there per instruction) — not duplicated
// here to avoid two panels answering the same question.

import { useEffect, useMemo, useState } from 'react'
import { pitchColor } from '@/lib/mlb'
import { computeEdgePlus, edgePlusTier } from '@/lib/edge-plus'
import EdgePlusCard from '@/components/pitching-lab/EdgePlusCard'
import EdgePlusRadarChart from '@/components/pitching-lab/EdgePlusRadarChart'
import EdgePlusConstellation from '@/components/pitching-lab/EdgePlusConstellation'
import EdgePlusGameCard from '@/components/pitching-lab/EdgePlusGameCard'
import type { PitcherPitchLog } from '@/lib/pitcher-pitch-log'
import type { PitchGradeStat } from '@/lib/pitch-type-percentiles'
import type { EdgePlusComponent } from '@/lib/edge-plus'

const SEASON = new Date().getFullYear()

function avg(vals: (number | null)[]): number | null {
  const real = vals.filter((v): v is number => v != null)
  return real.length > 0 ? real.reduce((s, v) => s + v, 0) / real.length : null
}

export default function EdgePlusPanel({
  pitcherId, pitcherName, teamAbbr, teamColor,
}: {
  pitcherId: number
  pitcherName: string
  teamAbbr: string
  teamColor: string
}) {
  const [log, setLog] = useState<PitcherPitchLog | null | 'error'>(null)
  const [gradesByType, setGradesByType] = useState<Record<string, PitchGradeStat[]>>({})
  const [view, setView] = useState<'season' | 'game'>('season')
  const [archiveOpen, setArchiveOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/pitch-log?playerId=${pitcherId}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setLog(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setLog('error') })
    return () => { cancelled = true }
  }, [pitcherId])

  const perPitchStuff = useMemo(() => {
    if (!log || log === 'error') return []
    const byType = new Map<string, { spin: (number | null)[]; ext: (number | null)[]; relH: (number | null)[]; arm: (number | null)[]; velo: (number | null)[]; count: number }>()
    for (const p of log.pitches) {
      if (!byType.has(p.pitchType)) byType.set(p.pitchType, { spin: [], ext: [], relH: [], arm: [], velo: [], count: 0 })
      const b = byType.get(p.pitchType)!
      b.spin.push(p.spinRate); b.ext.push(p.extension); b.relH.push(p.releasePosZ); b.arm.push(p.armAngle); b.velo.push(p.velo)
      b.count++
    }
    return [...byType.entries()]
      .map(([pt, b]) => ({
        pitchType: pt, name: log.pitchNames[pt] ?? pt, count: b.count,
        avgSpin: avg(b.spin), avgExt: avg(b.ext), avgRelH: avg(b.relH), avgArm: avg(b.arm), avgVelo: avg(b.velo),
      }))
      .sort((a, b) => b.count - a.count)
  }, [log])

  // Real league percentiles per pitch type (same source Arsenal's pitch
  // detail uses) — fetched once per pitch type as soon as the pitch list
  // is known, so the Edge+ score can be computed for every pitch at once.
  useEffect(() => {
    if (perPitchStuff.length === 0) return
    let cancelled = false
    Promise.all(perPitchStuff.map(p =>
      fetch(`/api/mlb/pitch-grade?playerId=${pitcherId}&pitchType=${p.pitchType}&season=${SEASON}`)
        .then(r => r.json())
        .then(json => [p.pitchType, (json.stats ?? []) as PitchGradeStat[]] as const)
        .catch(() => [p.pitchType, [] as PitchGradeStat[]] as const)
    )).then(entries => { if (!cancelled) setGradesByType(Object.fromEntries(entries)) })
    return () => { cancelled = true }
  }, [perPitchStuff, pitcherId])

  const edgeScores = useMemo(() => {
    return perPitchStuff
      .map(p => {
        const stats = gradesByType[p.pitchType]
        if (!stats) return null
        const { score, components } = computeEdgePlus(stats)
        return { pitchType: p.pitchType, name: p.name, score, tier: edgePlusTier(score), components }
      })
      .filter((x): x is { pitchType: string; name: string; score: number | null; tier: { label: string; color: string }; components: EdgePlusComponent[] } => x !== null)
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  }, [perPitchStuff, gradesByType])

  if (log === 'error') {
    return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Couldn&apos;t load stuff data right now.</div>
  }
  if (log === null) {
    return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Pulling spin, release, and velo data…</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-1">Edge+</p>
          <p className="text-[13px] text-[#57534E] max-w-3xl">This app&apos;s own composite pitch grade, and why it lands where it does — 8 real league percentiles (whiff%, hard-hit%, xwOBA, put-away%, movement, velo, spin rate, release extension); the 4 physical-trait weights come from a real regression, not a hand pick (see the cards below). Below that, real release height and arm angle per pitch, plus a velo band over the last 8 starts. Movement itself (HB/IVB) is on the Arsenal tab.</p>
        </div>
        <div className="flex gap-1 shrink-0">
          {(['season', 'game'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`font-mono rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-wide transition ${view === v ? 'border-[#FF5722] text-[#FF5722] bg-orange-50 font-bold' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
            >
              {v === 'season' ? 'Season' : 'Particular game'}
            </button>
          ))}
        </div>
      </div>

      {view === 'season' ? (
        <>
          <EdgePlusRadarChart pitches={edgeScores.map(e => ({ pitchType: e.pitchType, name: e.name, components: e.components }))} />

          <EdgePlusConstellation pitcherId={pitcherId} pitches={edgeScores.map(e => ({ pitchType: e.pitchType, name: e.name, score: e.score, tierColor: e.tier.color, components: e.components }))} />

          {perPitchStuff.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-3">Full breakdown, per pitch</p>
              <div className="grid lg:grid-cols-2 gap-5">
                {perPitchStuff.map(p => (
                  <EdgePlusCard key={p.pitchType} pitcherId={pitcherId} pitchType={p.pitchType} pitchName={p.name} stats={gradesByType[p.pitchType] ?? []} />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <EdgePlusGameCard
          pitcherId={pitcherId}
          pitcherName={pitcherName}
          teamAbbr={teamAbbr}
          teamColor={teamColor}
          edgeScores={edgeScores.map(e => ({ pitchType: e.pitchType, name: e.name, score: e.score, tier: e.tier }))}
        />
      )}

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <button onClick={() => setArchiveOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-4 text-left">
          <span>
            <span className="block text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold">Archive — per-pitch stuff, real physical numbers</span>
            <span className="block text-[9px] font-mono text-stone-400 mt-0.5">Superseded by the scored cards above (spin/extension) and each card&apos;s release-point section (height/arm angle) — kept here as a plain reference table.</span>
          </span>
          <span className="text-[10px] font-mono text-stone-400 shrink-0 ml-3">{archiveOpen ? '▲ hide' : '▼ show'}</span>
        </button>
        {archiveOpen && (
          <>
            <div className="overflow-x-auto border-t border-stone-100">
              <table className="w-full text-[11px] font-mono min-w-[700px]">
                <thead>
                  <tr className="text-stone-400 uppercase text-[9px] tracking-wider">
                    <th className="text-left px-4 py-2">Pitch</th>
                    <th className="text-right px-2 py-2">#</th>
                    <th className="text-right px-2 py-2">Velo</th>
                    <th className="text-right px-2 py-2">Spin (rpm)</th>
                    <th className="text-right px-2 py-2">Release height (ft)</th>
                    <th className="text-right px-2 py-2">Extension (ft)</th>
                    <th className="text-right px-4 py-2">Arm angle</th>
                  </tr>
                </thead>
                <tbody>
                  {perPitchStuff.map(p => (
                    <tr key={p.pitchType} className="border-t border-stone-50">
                      <td className="px-4 py-2 text-stone-800 font-semibold whitespace-nowrap flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: pitchColor(p.pitchType) }} />
                        {p.name}
                      </td>
                      <td className="px-2 py-2 text-right text-stone-600">{p.count}</td>
                      <td className="px-2 py-2 text-right text-stone-600">{p.avgVelo != null ? `${p.avgVelo.toFixed(1)}` : '—'}</td>
                      <td className="px-2 py-2 text-right text-stone-600">{p.avgSpin != null ? Math.round(p.avgSpin) : '—'}</td>
                      <td className="px-2 py-2 text-right text-stone-600">{p.avgRelH != null ? p.avgRelH.toFixed(2) : '—'}</td>
                      <td className="px-2 py-2 text-right text-stone-600">{p.avgExt != null ? p.avgExt.toFixed(2) : '—'}</td>
                      <td className="px-4 py-2 text-right text-stone-600">{p.avgArm != null ? `${p.avgArm.toFixed(1)}°` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[9px] font-mono text-stone-400 px-4 py-3">All real per-pitch Statcast fields, season-wide. Spin and extension here are this pitcher&apos;s own raw averages; the Edge+ score above uses their real league percentile instead. Release height/arm angle still aren&apos;t blended into the score — no league pool to rank a release slot as better or worse.</p>
          </>
        )}
      </div>
    </div>
  )
}
