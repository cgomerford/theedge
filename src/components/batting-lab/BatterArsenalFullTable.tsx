'use client'

// src/components/batting-lab/BatterArsenalFullTable.tsx
//
// Full real stat line vs each pitch type — the batter-side mirror of the
// Pitching Lab's per-pitch detail line: Pitches, Usage%, Velo, HB, IVB,
// Whiff%, Put-Away%, K%, BA, SLG, wOBA, xwOBA, Hard-Hit%, RV/100, plus
// this app's own disclosed "Edge" score (a real percentile of his real
// run-value-per-100 against every other qualified batter who faced that
// same pitch type this season — see batter-arsenal-stats.ts).
//
// Put-Away% isn't on the aggregated endpoint the rest of this line comes
// from, so it's computed separately here from the raw per-pitch log:
// real 2-strike pitches of this type that ended in a real strikeout,
// over all real 2-strike pitches of this type.

import { useEffect, useMemo, useState } from 'react'
import { pitchColor } from '@/lib/mlb'
import { edgePlusTier } from '@/lib/edge-plus'
import type { BatterArsenalStatLine } from '@/lib/batter-arsenal-stats'
import type { BatterPitchLog } from '@/lib/batter-pitch-log'

const SEASON = new Date().getFullYear()

function fmtRate(v: number | null): string {
  return v == null ? '—' : v.toFixed(3).replace(/^0\./, '.')
}
function fmtPct(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)}%`
}
function fmtSigned(v: number | null): string {
  return v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`
}

export default function BatterArsenalFullTable({ batterId, pitchTypes, pitchNames }: { batterId: number; pitchTypes: string[]; pitchNames: Record<string, string> }) {
  const [stats, setStats] = useState<BatterArsenalStatLine[] | null | 'error'>(null)
  const [log, setLog] = useState<BatterPitchLog | null | 'error'>(null)

  useEffect(() => {
    if (pitchTypes.length === 0) return
    let cancelled = false
    fetch(`/api/mlb/batter-arsenal-stats?batterId=${batterId}&pitchTypes=${pitchTypes.join(',')}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setStats(json.stats ?? 'error') })
      .catch(() => { if (!cancelled) setStats('error') })
    return () => { cancelled = true }
  }, [batterId, pitchTypes])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/batter-pitch-log?batterId=${batterId}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setLog(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setLog('error') })
    return () => { cancelled = true }
  }, [batterId])

  const putAwayByType = useMemo(() => {
    if (!log || log === 'error') return new Map<string, number | null>()
    const byType = new Map<string, { twoStrike: number; k: number }>()
    for (const p of log.pitches) {
      if (p.strikes !== 2) continue
      if (!byType.has(p.pitchType)) byType.set(p.pitchType, { twoStrike: 0, k: 0 })
      const b = byType.get(p.pitchType)!
      b.twoStrike++
      if (p.result === 'strikeout' || p.result === 'strikeout_double_play') b.k++
    }
    const out = new Map<string, number | null>()
    for (const [pt, b] of byType) out.set(pt, b.twoStrike > 0 ? (b.k / b.twoStrike) * 100 : null)
    return out
  }, [log])

  if (stats === 'error') return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Couldn&apos;t load full arsenal stats right now.</div>
  if (stats === null) return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Pulling the real per-pitch-type stat line…</div>
  if (stats.length === 0) return null

  const totalPitches = stats.reduce((s, r) => s + r.pitches, 0)

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold px-5 pt-5">Full stat line vs each pitch type</p>
      <p className="text-[10px] font-mono text-stone-400 px-5 mt-1 mb-3">Real Statcast numbers, this season. Edge score is this app&apos;s own — a real percentile of his real run value per 100 against every other qualified batter who&apos;s faced this same pitch type.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono min-w-[1100px]">
          <thead>
            <tr className="text-stone-400 uppercase text-[9px] tracking-wider">
              <th className="text-left px-5 py-2">Pitch</th>
              <th className="text-right px-2 py-2">Pitches</th>
              <th className="text-right px-2 py-2">Usage%</th>
              <th className="text-right px-2 py-2">Velo</th>
              <th className="text-right px-2 py-2">HB</th>
              <th className="text-right px-2 py-2">IVB</th>
              <th className="text-right px-2 py-2">Whiff%</th>
              <th className="text-right px-2 py-2">Put-Away%</th>
              <th className="text-right px-2 py-2">K%</th>
              <th className="text-right px-2 py-2">BA</th>
              <th className="text-right px-2 py-2">SLG</th>
              <th className="text-right px-2 py-2">wOBA</th>
              <th className="text-right px-2 py-2">xwOBA</th>
              <th className="text-right px-2 py-2">Hard-Hit%</th>
              <th className="text-right px-2 py-2">RV/100</th>
              <th className="text-right px-5 py-2">Edge</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(r => {
              const tier = edgePlusTier(r.edgeScore)
              return (
                <tr key={r.pitchType} className="border-t border-stone-50">
                  <td className="px-5 py-2 text-stone-800 font-semibold whitespace-nowrap flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: pitchColor(r.pitchType) }} />
                    {pitchNames[r.pitchType] ?? r.pitchType}
                  </td>
                  <td className="px-2 py-2 text-right text-stone-600">{r.pitches}</td>
                  <td className="px-2 py-2 text-right text-stone-600">{totalPitches > 0 ? `${((r.pitches / totalPitches) * 100).toFixed(1)}%` : '—'}</td>
                  <td className="px-2 py-2 text-right text-stone-600">{r.velo != null ? `${r.velo.toFixed(1)}` : '—'}</td>
                  <td className="px-2 py-2 text-right text-stone-600">{r.hb != null ? `${r.hb.toFixed(1)}"` : '—'}</td>
                  <td className="px-2 py-2 text-right text-stone-600">{r.ivb != null ? `${r.ivb > 0 ? '+' : ''}${r.ivb.toFixed(1)}"` : '—'}</td>
                  <td className="px-2 py-2 text-right text-stone-600">{fmtPct(r.whiffPct)}</td>
                  <td className="px-2 py-2 text-right text-stone-600">{fmtPct(putAwayByType.get(r.pitchType) ?? null)}</td>
                  <td className="px-2 py-2 text-right text-stone-600">{fmtPct(r.kPct)}</td>
                  <td className="px-2 py-2 text-right text-stone-600">{fmtRate(r.ba)}</td>
                  <td className="px-2 py-2 text-right text-stone-600">{fmtRate(r.slg)}</td>
                  <td className="px-2 py-2 text-right text-stone-600">{fmtRate(r.woba)}</td>
                  <td className="px-2 py-2 text-right font-bold text-stone-900">{fmtRate(r.xwoba)}</td>
                  <td className="px-2 py-2 text-right text-stone-600">{fmtPct(r.hardHitPct)}</td>
                  <td className="px-2 py-2 text-right text-stone-600">{fmtSigned(r.rv100)}</td>
                  <td className="px-5 py-2 text-right font-bold" style={{ color: tier.color }}>{r.edgeScore ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="h-4" />
    </div>
  )
}
