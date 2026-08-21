'use client'

/**
 * src/components/Top3ForTheSeries.tsx
 *
 * Public-facing "Top 3 For The Series" card. Shows, per batter:
 *   - Overall lean (zone score + pitch-type fit score, blended)
 *   - Zone matchup breakdown — all 9 zones, batter edge vs pitcher edge,
 *     not just a single summary label
 *   - Pitch-type fit — velocity-matched to this specific pitcher (his avg
 *     velo on that pitch, ±1mph), with the season-wide number shown
 *     alongside for comparison
 *   - Full career H2H line — informational only, never part of any score
 *   - Actual recorded stats + pitch-by-pitch backtest, once a game in the
 *     series goes final
 *
 * BRAND RULES ENFORCED HERE:
 * - series_score / zone_score / pitch_type_fit_score / tilt are INTERNAL
 *   ranking numbers. Never rendered raw. Translated into plain-English
 *   leans and factor-style counts instead.
 * - No betting-adjacent language — "reads," never picks/locks.
 * - Empty state over thin data.
 */

import { useState, useEffect } from 'react'
import { playerHeadshotUrl, teamLogoUrl, shortName } from '@/lib/mlb'
import type {
  SeriesTop3Result,
  Top3Batter,
  Top3BatterPitcherLine,
  ZoneFitCell,
  BatterGameResult,
  PlateAppearanceResult,
} from '@/lib/series-matchup'

// ─── Helpers ────────────────────────────────────────────────────────────────

function combinedScore(line: Top3BatterPitcherLine): number {
  return line.zone_score + line.pitch_type_fit_score
}

function lean(score: number): { label: string; color: string; bg: string; border: string; dot: string } {
  if (score > 0.15)
    return {
      label: 'Strong advantage',
      color: 'text-emerald-700',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200/80',
      dot: 'bg-emerald-500',
    }
  if (score > 0.03)
    return {
      label: 'Slight edge',
      color: 'text-emerald-700',
      bg: 'bg-emerald-50/70',
      border: 'border-emerald-100',
      dot: 'bg-emerald-400',
    }
  if (score > -0.03)
    return {
      label: 'Neutral matchup',
      color: 'text-stone-600',
      bg: 'bg-stone-50',
      border: 'border-stone-200/70',
      dot: 'bg-stone-400',
    }
  if (score > -0.15)
    return {
      label: 'Slight pitcher edge',
      color: 'text-amber-700',
      bg: 'bg-amber-50/80',
      border: 'border-amber-200/70',
      dot: 'bg-amber-500',
    }
  return {
    label: 'Tough matchup',
    color: 'text-rose-700',
    bg: 'bg-rose-50/80',
    border: 'border-rose-200/70',
    dot: 'bg-rose-500',
  }
}

function opsColor(ops: number): string {
  if (ops >= 0.900) return 'text-emerald-600'
  if (ops >= 0.800) return 'text-emerald-700'
  if (ops >= 0.700) return 'text-stone-700'
  if (ops >= 0.600) return 'text-amber-600'
  return 'text-rose-600'
}

function baColor(ba: number): string {
  if (ba >= 0.300) return 'text-emerald-600'
  if (ba >= 0.260) return 'text-stone-700'
  if (ba >= 0.220) return 'text-amber-600'
  return 'text-rose-600'
}

function fmtBa(ba: number): string {
  return ba.toFixed(3).replace(/^0/, '')
}

function edgeGamesCount(batter: Top3Batter): number {
  return batter.per_pitcher.filter((p) => combinedScore(p) > 0.03).length
}

function SectionLabel({ title }: { title: string }) {
  return (
    <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-orange-600 font-semibold">
      § {title}
    </p>
  )
}

function StatBox({
  label,
  value,
  color,
}: {
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div className="bg-white/80 border border-stone-150 rounded-xl px-2.5 py-2.5 text-center shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className={`text-[15px] font-mono font-bold leading-none tracking-tight ${color ?? 'text-stone-900'}`}>
        {value}
      </div>
      <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-1.5">{label}</div>
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-stone-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.25}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

async function fetchGameResult(playerId: number, gamePk: number, gameDate: string): Promise<BatterGameResult> {
  try {
    const res = await fetch(`/api/batter-game-result?playerId=${playerId}&gamePk=${gamePk}&gameDate=${gameDate}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function fetchPitchByPitch(
  batterId: number,
  pitcherId: number,
  gamePk: number,
  pitchTypeFit: Top3BatterPitcherLine['pitch_type_fit'],
): Promise<PlateAppearanceResult[] | null> {
  try {
    const qs = new URLSearchParams({
      batterId: String(batterId),
      pitcherId: String(pitcherId),
      gamePk: String(gamePk),
      pitchTypeFit: JSON.stringify(pitchTypeFit),
    })
    const res = await fetch(`/api/batter-pitch-by-pitch?${qs.toString()}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

const FLAG_LABEL: Record<string, { label: string; color: string; bg: string; border: string }> = {
  put_away_pitch: {
    label: 'His put-away pitch',
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
  },
  strong_pitch: {
    label: 'Flagged strong',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  weak_pitch: {
    label: 'Flagged weak',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
}

const RANK_STYLES = [
  {
    badge: 'bg-orange-500 text-white shadow-sm shadow-orange-200',
    ring: 'ring-1 ring-orange-200/80',
    avatarRing: 'ring-2 ring-orange-400/60 ring-offset-2 ring-offset-white',
  },
  {
    badge: 'bg-stone-700 text-white',
    ring: 'ring-1 ring-stone-200/80',
    avatarRing: 'ring-2 ring-stone-300/70 ring-offset-2 ring-offset-white',
  },
  {
    badge: 'bg-stone-400 text-white',
    ring: 'ring-1 ring-stone-200/60',
    avatarRing: 'ring-2 ring-stone-200/80 ring-offset-2 ring-offset-white',
  },
]

// Zone layout — matches the standard catcher's-eye-view 3x3 grid used
// elsewhere in the app (HotZone-style components).
const ZONE_GRID = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
]

// ─── Zone matchup breakdown ─────────────────────────────────────────────────

function ZoneFitGrid({ cells }: { cells: ZoneFitCell[] }) {
  if (cells.length === 0) return null
  const byZone = new Map(cells.map((c) => [c.zone, c]))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-stone-400 font-medium">
          Zone-by-zone matchup
        </p>
        <p className="text-[9px] font-mono text-stone-300">Catcher’s view</p>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {ZONE_GRID.flat().map((zone) => {
          const cell = byZone.get(zone)
          if (!cell) {
            return (
              <div
                key={zone}
                className="relative bg-stone-50/80 border border-stone-100 rounded-xl p-2.5 min-h-[72px]"
              />
            )
          }
          const cellLean = lean(cell.tilt)
          return (
            <div
              key={zone}
              className={`relative rounded-xl border p-2.5 min-h-[72px] transition-colors ${cellLean.bg} ${cellLean.border}`}
            >
              <span className="absolute top-1.5 left-2 text-[9px] font-mono text-stone-300/90 font-medium">
                {zone}
              </span>
              <div className="mt-3.5">
                <p className={`text-[11px] font-mono font-semibold leading-tight ${cellLean.color}`}>
                  {cellLean.label}
                </p>
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-[9px] font-mono text-stone-500">
                    Batter xwOBA {cell.batter_xwoba != null ? fmtBa(cell.batter_xwoba) : '—'}
                  </p>
                  <p className="text-[9px] font-mono text-stone-500">
                    Pitcher BA {cell.pitcher_ba_against != null ? fmtBa(cell.pitcher_ba_against) : '—'}
                    {cell.pitcher_whiff_pct != null && (
                      <span className="text-stone-400"> · {cell.pitcher_whiff_pct.toFixed(0)}% whiff</span>
                    )}
                  </p>
                  <p className="text-[9px] font-mono text-stone-400 pt-0.5">
                    {cell.pitcher_usage_pct ?? 0}% of pitches
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[10px] font-mono text-stone-400/90 italic leading-relaxed">
        Blended across the pitcher’s full arsenal — not yet broken out per pitch type + velocity within each zone.
      </p>
    </div>
  )
}

// ─── Pitch-type fit breakdown ─────────────────────────────────────────────────

function PitchTypeFitTable({ line }: { line: Top3BatterPitcherLine }) {
  if (line.pitch_type_fit.length === 0) return null

  const sorted = [...line.pitch_type_fit].sort(
    (a, b) => (b.pitcher_usage_pct ?? 0) - (a.pitcher_usage_pct ?? 0),
  )

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-stone-400 font-medium">
        Pre-game pitch-type fit
      </p>

      <div className="space-y-2">
        {sorted.map((p) => {
          const usage = p.pitcher_usage_pct ?? 0
          return (
            <div
              key={p.pitch_type}
              className="bg-white border border-stone-150 rounded-xl px-3.5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-serif font-bold text-stone-800 tracking-tight">
                      {p.pitch_name}
                    </span>
                    {p.is_put_away_pitch && (
                      <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200/80">
                        Put-away
                      </span>
                    )}
                  </div>

                  {/* Usage bar */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-orange-400/80 rounded-full transition-all"
                        style={{ width: `${Math.min(100, usage)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-stone-500 tabular-nums w-8 text-right">
                      {usage.toFixed(0)}%
                    </span>
                  </div>

                  {p.pitcher_avg_velo != null && p.velocity_band_min != null && p.velocity_band_max != null && (
                    <p className="text-[10px] font-mono text-stone-400 mt-1.5">
                      Thrown at {p.pitcher_avg_velo.toFixed(1)} mph · matched {p.velocity_band_min.toFixed(1)}–
                      {p.velocity_band_max.toFixed(1)} mph
                    </p>
                  )}
                </div>

                <div className="text-right shrink-0 pt-0.5">
                  {p.velocity_matched_low_sample || p.velocity_matched_ba == null ? (
                    <span className="text-[11px] font-mono text-stone-400 italic">Sample too thin</span>
                  ) : (
                    <>
                      <div className={`text-[15px] font-mono font-bold leading-none ${baColor(p.velocity_matched_ba)}`}>
                        {fmtBa(p.velocity_matched_ba)}
                      </div>
                      <div className="text-[9px] font-mono text-stone-400 mt-1">
                        {p.velocity_matched_ab} AB at velo
                      </div>
                    </>
                  )}
                </div>
              </div>

              {p.season_ba != null && (
                <p className="text-[10px] font-mono text-stone-400 mt-2.5 pt-2 border-t border-stone-100">
                  Context: {fmtBa(p.season_ba)} vs this pitch type any velocity this season ({p.season_ab} AB)
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Pitch-by-pitch backtest ───────────────────────────────────────────────

function PitchByPitchTable({ pas }: { pas: PlateAppearanceResult[] }) {
  if (pas.length === 0) {
    return (
      <p className="text-[12px] font-serif text-stone-400 italic">
        No plate appearances found between them in this game.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-stone-400 font-medium">
        What he actually saw, pitch by pitch
      </p>

      <div className="space-y-1.5">
        {pas.map((pa, i) => {
          const flag = pa.matched_flag ? FLAG_LABEL[pa.matched_flag] : null
          return (
            <div
              key={i}
              className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 border transition-colors ${
                flag ? `${flag.bg} ${flag.border}` : 'bg-white border-stone-150'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-serif font-bold text-stone-800">
                    {pa.pitch_name ?? pa.pitch_type ?? 'Unknown pitch'}
                  </span>
                  {pa.velo != null && (
                    <span className="text-[11px] font-mono text-stone-500 tabular-nums">
                      {pa.velo.toFixed(1)} mph
                    </span>
                  )}
                  {pa.zone != null && (
                    <span className="text-[11px] font-mono text-stone-400">z{pa.zone}</span>
                  )}
                  {flag && (
                    <span
                      className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${flag.bg} ${flag.color} ${flag.border}`}
                    >
                      {flag.label}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <span
                  className={`text-[13px] font-mono font-semibold ${
                    pa.is_hit ? 'text-emerald-600' : 'text-stone-500'
                  }`}
                >
                  {pa.event ?? '—'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Batter card ──────────────────────────────────────────────────────────────

function BatterCard({
  batter,
  rank,
  confirmedGamesTotal,
}: {
  batter: Top3Batter
  rank: number
  confirmedGamesTotal: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [results, setResults] = useState<Record<number, BatterGameResult>>({})
  const [pitchByPitch, setPitchByPitch] = useState<Record<number, PlateAppearanceResult[] | null>>({})
  const overallLean = lean(batter.series_score)
  const edgeGames = edgeGamesCount(batter)
  const style = RANK_STYLES[rank] ?? RANK_STYLES[2]

  useEffect(() => {
    if (!expanded) return
    let cancelled = false
    Promise.all(
      batter.per_pitcher.map(async (p) => {
        const r = await fetchGameResult(batter.player_id, p.gamePk, p.game_date)
        return [p.gamePk, r] as const
      }),
    ).then((pairs) => {
      if (cancelled) return
      setResults(Object.fromEntries(pairs))
      const finalGames = pairs.filter(([, r]) => r !== null)
      Promise.all(
        finalGames.map(async ([gamePk]) => {
          const line = batter.per_pitcher.find((p) => p.gamePk === gamePk)
          if (!line) return [gamePk, null] as const
          const pas = await fetchPitchByPitch(batter.player_id, line.pitcher_id, gamePk, line.pitch_type_fit)
          return [gamePk, pas] as const
        }),
      ).then((pbpPairs) => {
        if (cancelled) return
        setPitchByPitch(Object.fromEntries(pbpPairs))
      })
    })
    return () => {
      cancelled = true
    }
  }, [expanded, batter.player_id, batter.per_pitcher])

  return (
    <div
      className={`bg-white rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${style.ring} transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3.5 p-3.5 sm:p-4 text-left hover:bg-stone-50/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40 focus-visible:ring-inset"
        aria-expanded={expanded}
      >
        <span
          className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-mono font-bold shrink-0 ${style.badge}`}
        >
          {rank + 1}
        </span>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={playerHeadshotUrl(batter.player_id)}
          alt={batter.player_name}
          className={`w-11 h-11 rounded-full object-cover bg-stone-100 shrink-0 ${style.avatarRing}`}
        />

        <div className="min-w-0 flex-1">
          <div className="font-serif font-bold text-stone-900 text-[15px] leading-tight truncate tracking-tight">
            {batter.player_name}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center gap-1.5 text-[12px] font-mono font-semibold ${overallLean.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${overallLean.dot}`} />
              {overallLean.label}
            </span>
          </div>
        </div>

        <Chevron open={expanded} />
      </button>

      <div className="px-3.5 sm:px-4 pb-3.5 -mt-1">
        <div
          className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-lg border ${overallLean.bg} ${overallLean.border} ${overallLean.color}`}
        >
          Edge in {edgeGames} of {batter.games_used} confirmed starter
          {batter.games_used === 1 ? '' : 's'}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-stone-100/80 p-3.5 sm:p-4 space-y-4 bg-[#FAF8F3]">
          {batter.per_pitcher.map((p, i) => {
            const zoneLean = lean(p.zone_score)
            const pitchLean = lean(p.pitch_type_fit_score)
            return (
              <div
                key={i}
                className="bg-white border border-stone-150 rounded-2xl p-3.5 sm:p-4 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-serif font-bold text-stone-800 tracking-tight">
                    vs {p.pitcher_name}
                  </span>
                </div>

                {/* Lean summary pills */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className={`rounded-xl border px-3 py-2.5 ${zoneLean.bg} ${zoneLean.border}`}>
                    <p className="text-[9px] font-mono uppercase tracking-[0.1em] text-stone-400 mb-1">
                      Zone matchup
                    </p>
                    <p className={`text-[13px] font-mono font-semibold ${zoneLean.color}`}>{zoneLean.label}</p>
                  </div>
                  <div className={`rounded-xl border px-3 py-2.5 ${pitchLean.bg} ${pitchLean.border}`}>
                    <p className="text-[9px] font-mono uppercase tracking-[0.1em] text-stone-400 mb-1">
                      Pitch-type fit
                    </p>
                    <p className={`text-[13px] font-mono font-semibold ${pitchLean.color}`}>{pitchLean.label}</p>
                  </div>
                </div>

                <ZoneFitGrid cells={p.zone_fit} />

                <PitchTypeFitTable line={p} />

                {/* Career H2H */}
                <div className="pt-3 border-t border-stone-100">
                  <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-stone-400 font-medium mb-2">
                    Career vs this pitcher{' '}
                    <span className="normal-case italic text-stone-300 font-normal">
                      (history only — not part of the read)
                    </span>
                  </p>
                  {p.h2h ? (
                    <div className="grid grid-cols-4 gap-2">
                      <StatBox label="AVG" value={p.h2h.avg} color={baColor(parseFloat(p.h2h.avg) || 0)} />
                      <StatBox label="OPS" value={p.h2h.ops} color={opsColor(parseFloat(p.h2h.ops) || 0)} />
                      <StatBox label="AB" value={p.h2h.ab} />
                      <StatBox label="HR" value={p.h2h.home_runs} />
                    </div>
                  ) : (
                    <p className="text-[12px] font-serif text-stone-400 italic">
                      Never faced this pitcher before.
                    </p>
                  )}
                </div>

                {/* Actual results */}
                {results[p.gamePk] && (
                  <div className="pt-3 border-t border-stone-100">
                    <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-stone-400 font-medium mb-2">
                      What actually happened
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      <StatBox label="AB" value={results[p.gamePk]!.ab} />
                      <StatBox label="H" value={results[p.gamePk]!.hits} />
                      <StatBox label="HR" value={results[p.gamePk]!.home_runs} />
                      <StatBox label="K" value={results[p.gamePk]!.strikeouts} />
                    </div>
                  </div>
                )}

                {/* Pitch-by-pitch */}
                {results[p.gamePk] && (
                  <div className="pt-3 border-t border-stone-100">
                    {pitchByPitch[p.gamePk] === undefined ? (
                      <p className="text-[11px] font-mono text-stone-400 italic">Loading pitch-by-pitch…</p>
                    ) : pitchByPitch[p.gamePk] === null ? (
                      <p className="text-[11px] font-mono text-stone-400 italic">
                        Pitch-by-pitch data unavailable for this game.
                      </p>
                    ) : (
                      <PitchByPitchTable pas={pitchByPitch[p.gamePk]!} />
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {confirmedGamesTotal > batter.games_used && (
            <p className="text-[11px] font-mono text-stone-400 italic leading-relaxed px-0.5">
              {confirmedGamesTotal - batter.games_used} game
              {confirmedGamesTotal - batter.games_used === 1 ? '' : 's'} in this series still{' '}
              {confirmedGamesTotal - batter.games_used === 1 ? 'has' : 'have'} no announced starter — left out of
              this read until confirmed.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main export ────────────────────────────────────────────────────────────

type Props = {
  result: SeriesTop3Result
  teamName: string
  teamId: number
}

export default function Top3ForTheSeries({ result, teamName, teamId }: Props) {
  const { batters, confirmed_games_count, series_games } = result
  const totalGames = series_games.length

  return (
    <div className="border border-stone-200/80 bg-white rounded-2xl p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={teamLogoUrl(teamId)}
            alt={teamName}
            className="w-6 h-6 object-contain shrink-0"
          />
          <SectionLabel title={`Top 3 For The Series · ${shortName(teamName)}`} />
        </div>
      </div>

      <div className="text-[11px] font-mono text-stone-400 mb-5 tracking-wide">
        {confirmed_games_count} of {totalGames} series starter{totalGames === 1 ? '' : 's'} confirmed
      </div>

      {batters.length === 0 ? (
        <div className="py-10 px-4 text-center">
          <p className="text-[15px] font-serif text-stone-400 italic leading-relaxed">
            Waiting on confirmed starters for this series — check back closer to first pitch.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {batters.map((b, i) => (
            <BatterCard key={b.player_id} batter={b} rank={i} confirmedGamesTotal={confirmed_games_count} />
          ))}
        </div>
      )}
    </div>
  )
}