'use client'

// src/components/BatterStreakBoard.tsx
//
// Standalone Scout Report component — batter hot/cold streaks with a
// click-to-expand drill-down (hot zone grid + full rolling trend line).
// Deliberately not sharing chart code with the existing SprayChart / hot-zone
// components used on the Batting tab and Tale of the Tape — see
// PitchLocationCard.tsx header note for the same rationale.
//
// 2026-08-09: fetch_player_form.py now produces up to 3 rows per team —
// one each for OPS, AVG, SLG — instead of always OPS. The label under each
// player's name now reads off `metric` instead of being hardcoded "OPS".
// Rows also carry `signal_quality` ('validated' = a real backtested-method
// peak/trough; 'trending' = a lower-confidence fallback only used when a
// team had no validated pick for that metric) and AVG/RBI/runs/walks
// context for the same trailing window — shown as a secondary line so a
// row isn't just a single number anymore.
//
// Zone data (streak.zones) is expected to already be attached per player
// by the caller (page.tsx fetches getBatterHotZones only for the handful
// of streaking batters, not the whole lineup — keeps this cheap).

import { useState } from 'react'
import type { BatterHotZones, ZoneCell } from '@/lib/hot-zones'
import { colorForBatterMetric, formatMetric, ZONE_LABELS } from '@/lib/hot-zones'
import { playerHeadshotUrl } from '@/lib/mlb'

export type StreakMetric = 'ops' | 'avg' | 'slg' | 'era'
export type StreakQuality = 'validated' | 'trending'

export type StreakWithZones = {
  player_id: number
  player_name: string
  team_abbr: string
  player_type: 'batter' | 'pitcher'
  signal: 'heating' | 'cooling'
  signal_quality?: StreakQuality
  metric?: StreakMetric
  current_value: number
  extreme_value: number
  magnitude: number
  recentGameLog?: number[]
  zones?: Record<string, BatterHotZones>
  avg?: number
  rbi?: number
  runs?: number
  walks?: number
  games?: number
}

const METRIC_LABEL: Record<StreakMetric, string> = {
  ops: 'OPS', avg: 'AVG', slg: 'SLG', era: 'ERA',
}

function Sparkline({ data, color, w = 140, h = 32 }: { data: number[]; color: string; w?: number; h?: number }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data)
  const range = (max - min) || 1
  const pad = 3
  const step = (w - pad * 2) / (data.length - 1)
  const path = data.map((v, i) => {
    const x = pad + i * step
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ZoneGrid({ zones }: { zones: Record<string, ZoneCell> }) {
  return (
    <div className="grid grid-cols-3 gap-1 w-full max-w-[200px] mx-auto">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(z => {
        const cell = zones[z]
        const value = cell?.xwoba ?? null
        const sample = cell?.ab ?? 0
        return (
          <div
            key={z}
            className={`aspect-square rounded-md flex flex-col items-center justify-center ${colorForBatterMetric(value, 'xwoba')} border border-white/40`}
            title={ZONE_LABELS[z]}
          >
            <span className="text-[10px] font-mono font-bold text-stone-900/80">{formatMetric(value, 'xwoba')}</span>
            <span className="text-[7px] font-mono text-stone-900/50">n={sample}</span>
          </div>
        )
      })}
    </div>
  )
}

function StreakRow({ streak, color }: { streak: StreakWithZones; color: string }) {
  const [open, setOpen] = useState(false)
  const heating = streak.signal === 'heating'
  const zoneData = streak.zones?.['all']
  const hasDrilldown = !!zoneData || (streak.recentGameLog && streak.recentGameLog.length >= 3)

  const metric = streak.metric ?? 'ops'
  const metricLabel = METRIC_LABEL[metric] ?? 'OPS'
  const isTrending = streak.signal_quality === 'trending'

  const hasContextLine =
    streak.avg != null || streak.rbi != null || streak.runs != null || streak.walks != null

  return (
    <div className="border-b border-stone-100 last:border-0" style={{ background: heating ? '#f0fdf4' : '#fef2f2' }}>
      <div
        className={`px-4 py-3 ${hasDrilldown ? 'cursor-pointer hover:bg-white/60' : ''}`}
        onClick={hasDrilldown ? () => setOpen(o => !o) : undefined}
      >
        <div className="flex items-center gap-3">
          <img
            src={playerHeadshotUrl(streak.player_id, 60)}
            alt={streak.player_name}
            className="w-9 h-9 rounded-full object-cover border border-stone-200 bg-stone-50 flex-shrink-0"
          />
          <p className="flex-1 min-w-0 text-[13px] font-semibold text-stone-800 leading-snug">{streak.player_name}</p>
          <span
            className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded flex-shrink-0"
            style={{ background: heating ? '#dcfce7' : '#fee2e2', color: heating ? '#15803d' : '#b91c1c' }}
          >
            {heating ? '▲ HOT' : '▼ COLD'}
          </span>
          {hasDrilldown && (
            <svg className={`w-3.5 h-3.5 text-stone-300 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>

        <p className="font-mono text-[10px] text-stone-400 mt-1.5">
          {heating ? 'Heating' : 'Cooling'} · rolling {metricLabel} {streak.current_value.toFixed(3)} (from {streak.extreme_value.toFixed(3)})
          {isTrending && (
            <span className="ml-1.5 px-1 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-stone-100 text-stone-400" title="Lower-confidence fallback — no validated peak/trough found for this stat, shown vs season median instead">
              trending
            </span>
          )}
        </p>

        {hasContextLine && (
          <p className="font-mono text-[9px] text-stone-400 mt-1 flex flex-wrap gap-x-2.5">
            {streak.avg != null && <span><span className="text-stone-600 font-bold">{streak.avg.toFixed(3)}</span> AVG</span>}
            {streak.runs != null && <span><span className="text-stone-600 font-bold">{streak.runs}</span> R</span>}
            {streak.rbi != null && <span><span className="text-stone-600 font-bold">{streak.rbi}</span> RBI</span>}
            {streak.walks != null && <span><span className="text-stone-600 font-bold">{streak.walks}</span> BB</span>}
            {streak.games != null && <span className="text-stone-300">L{streak.games}</span>}
          </p>
        )}

        {streak.recentGameLog && streak.recentGameLog.length >= 2 && (
          <div className="mt-1.5">
            <Sparkline data={streak.recentGameLog} color={heating ? '#16a34a' : '#dc2626'} />
          </div>
        )}
      </div>

      {open && (
        <div className="px-4 pb-4 pt-1 bg-white/70 border-t border-stone-100 grid sm:grid-cols-2 gap-4">
          {zoneData ? (
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-2 text-center">Hot zones · xwOBA</p>
              <ZoneGrid zones={zoneData.zones} />
              {zoneData.hot_zone_label && (
                <p className="text-[10px] font-mono text-center text-stone-500 mt-2">
                  Best: <span className="font-bold text-stone-800">{zoneData.hot_zone_label}</span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs font-serif italic text-stone-400 text-center py-4">Zone data not yet available.</p>
          )}
          {streak.recentGameLog && streak.recentGameLog.length >= 3 && (
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-2 text-center">Rolling {metricLabel} trend</p>
              <div className="flex justify-center">
                <Sparkline data={streak.recentGameLog} color={heating ? '#16a34a' : '#dc2626'} w={200} h={60} />
              </div>
              <p className="text-[9px] font-mono text-center text-stone-400 mt-1">Last {streak.recentGameLog.length} games · rolling window</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function BatterStreakBoard({ teamAbbr, teamName, color, streaks }: {
  teamAbbr: string; teamName: string; color: string; streaks: StreakWithZones[]
}) {
  const batters = streaks.filter(s => s.player_type === 'batter')
  if (batters.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-6 text-center" style={{ borderTop: `3px solid ${color}` }}>
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400">{teamAbbr}</p>
        <p className="text-sm font-serif italic text-stone-400 mt-1">No notable streaks today.</p>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
      <div
        className="px-4 py-2.5 border-b border-stone-100"
        style={{ background: `linear-gradient(135deg, ${color}14, transparent 70%)` }}
      >
        <p className="font-mono text-[9px] uppercase tracking-widest text-stone-500">{teamName} · Streaks</p>
      </div>
      {batters.map(s => <StreakRow key={`${s.player_id}-${s.metric ?? 'ops'}`} streak={s} color={color} />)}
    </div>
  )
}