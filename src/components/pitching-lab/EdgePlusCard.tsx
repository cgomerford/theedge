'use client'

// src/components/pitching-lab/EdgePlusCard.tsx
//
// "Why is this pitch elite and that one isn't?" — Edge+ (this app's own
// composite grade, see src/lib/edge-plus.ts for the disclosed formula —
// spin rate and release extension are real scored components now, not
// just supporting numbers) plus a component-by-component breakdown so
// the score isn't a black box, plus the real release point (height/arm
// angle) that still isn't blended into the score — no league pool to
// rank a release slot as better or worse.

import { useEffect, useMemo, useState } from 'react'
import { computeEdgePlus, edgePlusTier, STUFF_MODEL_R2, STUFF_MODEL_N } from '@/lib/edge-plus'
import type { PitchGradeStat } from '@/lib/pitch-type-percentiles'
import type { PitcherPitchLog, RawPitch } from '@/lib/pitcher-pitch-log'

const SEASON = new Date().getFullYear()
const AB_EVENTS = new Set([
  'single', 'double', 'triple', 'home_run', 'strikeout', 'strikeout_double_play',
  'field_out', 'force_out', 'grounded_into_double_play', 'double_play', 'triple_play',
  'fielders_choice', 'fielders_choice_out', 'other_out',
])
const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])

function avg(vals: (number | null)[]): number | null {
  const real = vals.filter((v): v is number => v != null)
  return real.length > 0 ? real.reduce((s, v) => s + v, 0) / real.length : null
}

function fmtRate(v: number | null): string {
  return v == null ? '—' : v.toFixed(3).replace(/^0\./, '.')
}

function situationLine(pitches: RawPitch[]) {
  let swings = 0, whiffs = 0, ab = 0, h = 0
  for (const p of pitches) {
    const d = p.description
    const isWhiff = d === 'swinging_strike' || d === 'swinging_strike_blocked' || d === 'missed_bunt'
    const isSwing = isWhiff || d === 'foul' || d === 'foul_tip' || d === 'foul_bunt' || d === 'hit_into_play'
    if (isSwing) swings++
    if (isWhiff) whiffs++
    const r = p.result ?? ''
    if (AB_EVENTS.has(r)) { ab++; if (HIT_EVENTS.has(r)) h++ }
  }
  return { n: pitches.length, whiffPct: swings > 0 ? (whiffs / swings) * 100 : null, avg: ab > 0 ? h / ab : null, ab }
}

export default function EdgePlusCard({ pitcherId, pitchType, pitchName, stats }: { pitcherId: number; pitchType: string; pitchName: string; stats: PitchGradeStat[] }) {
  const [log, setLog] = useState<PitcherPitchLog | null | 'error'>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/pitch-log?playerId=${pitcherId}&season=${SEASON}&pitchType=${pitchType}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setLog(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setLog('error') })
    return () => { cancelled = true }
  }, [pitcherId, pitchType])

  const { score, components } = computeEdgePlus(stats)
  const tier = edgePlusTier(score)

  const physical = log && log !== 'error' ? {
    spin: avg(log.pitches.map(p => p.spinRate)),
    extension: avg(log.pitches.map(p => p.extension)),
    releaseHeight: avg(log.pitches.map(p => p.releasePosZ)),
    armAngle: avg(log.pitches.map(p => p.armAngle)),
  } : null

  // Real RISP split (runner on 2nd and/or 3rd) — this pitcher's own
  // numbers on this pitch, not a league-percentiled Edge+ component (no
  // real same-pitch-type league pool split by base state to rank against
  // honestly), so shown as supporting context, same spirit as release
  // point above.
  const risp = useMemo(() => {
    if (!log || log === 'error') return null
    const inRisp = log.pitches.filter(p => p.onBase.second || p.onBase.third)
    const empty = log.pitches.filter(p => !p.onBase.second && !p.onBase.third)
    return { risp: situationLine(inRisp), other: situationLine(empty) }
  }, [log])

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Edge+ — {pitchName}</p>
      <p className="text-[10px] font-mono text-stone-400 mb-4">This app&apos;s own composite grade — not the industry Stuff+ (confirmed unavailable from any source this app can reach). Real percentiles below; the 4 physical-trait weights (spin/extension/velo/movement) come from a real regression (N={STUFF_MODEL_N.toLocaleString()}, R²={(STUFF_MODEL_R2 * 100).toFixed(1)}%) — honestly modest explanatory power, disclosed rather than hidden behind a clean-looking number.</p>

      <div className="flex items-center gap-4 mb-5">
        <div className="w-20 h-20 rounded-full flex items-center justify-center shrink-0 border-4" style={{ borderColor: tier.color }}>
          <span className="text-[28px] font-mono font-bold text-stone-900">{score ?? '—'}</span>
        </div>
        <div>
          <div className="font-mono text-[13px] font-bold" style={{ color: tier.color }}>{tier.label}</div>
          <div className="text-[10px] font-mono text-stone-400">0-100, weighted from the {components.length} components below</div>
        </div>
      </div>

      <div className="space-y-2.5 mb-5">
        {components.map(c => (
          <div key={c.key} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-[10px] font-mono text-stone-500 truncate">{c.label}</span>
            <div className="flex-1 h-2.5 bg-stone-50 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-[#FF5722]" style={{ width: `${c.percentile ?? 0}%`, opacity: 0.75 }} />
            </div>
            <span className="w-20 shrink-0 text-right text-[10px] font-mono text-stone-600">{c.percentile != null ? `${c.percentile}th` : '—'} <span className="text-stone-400">×{Math.round(c.weight * 100)}%</span></span>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-stone-100">
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2">Release point — real, not scored (no league pool to rank a slot as better or worse)</p>
        {physical === null ? (
          <p className="text-[11px] font-serif italic text-stone-400">Loading physical numbers…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-[9px] font-mono text-stone-400">Release height</div><div className="text-[13px] font-mono font-bold text-stone-900">{physical.releaseHeight != null ? `${physical.releaseHeight.toFixed(2)} ft` : '—'}</div></div>
            <div><div className="text-[9px] font-mono text-stone-400">Arm angle</div><div className="text-[13px] font-mono font-bold text-stone-900">{physical.armAngle != null ? `${physical.armAngle.toFixed(1)}°` : '—'}</div></div>
          </div>
        )}
      </div>

      <div className="pt-4 mt-4 border-t border-stone-100">
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2">RISP split — real, not scored (this pitcher&apos;s own numbers, no league base-state pool to rank against)</p>
        {risp === null ? (
          <p className="text-[11px] font-serif italic text-stone-400">Loading situational numbers…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[9px] font-mono text-stone-400">Runners in scoring position (n={risp.risp.n})</div>
              <div className="text-[13px] font-mono font-bold text-stone-900">
                Whiff {risp.risp.whiffPct != null ? `${risp.risp.whiffPct.toFixed(1)}%` : '—'} <span className="text-stone-400 font-normal">· AVG {fmtRate(risp.risp.avg)}</span>
              </div>
            </div>
            <div>
              <div className="text-[9px] font-mono text-stone-400">Bases empty (n={risp.other.n})</div>
              <div className="text-[13px] font-mono font-bold text-stone-900">
                Whiff {risp.other.whiffPct != null ? `${risp.other.whiffPct.toFixed(1)}%` : '—'} <span className="text-stone-400 font-normal">· AVG {fmtRate(risp.other.avg)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
