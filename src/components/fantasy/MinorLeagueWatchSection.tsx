/**
 * src/components/fantasy/MinorLeagueWatchSection.tsx
 *
 * Standalone section for AAA hitters heating up — the 'prospect' pick type.
 * Deliberately a CARD GRID, not the column-list style Market Movement uses,
 * so this reads as its own distinct feature rather than a buried sub-panel
 * (it was originally a third column inside Market Movement; that made it
 * functionally invisible, so it moved out into its own section).
 *
 * Lives inside FantasyDashboard.tsx's own <section><SectionLabel>...
 * </SectionLabel><ReadLine>...</ReadLine> wrapper, same pattern as every
 * other section on the page — this component only renders the grid.
 *
 *   <MinorLeagueWatchSection prospects={picks.prospect} />
 *
 * Renders nothing if there's nothing to show (no 'use client' needed — pure
 * presentation over props, safe as a server component).
 */

import type { FantasyPick } from '@/lib/fantasy'

type Props = {
  prospects: FantasyPick[]
}

function Sparkline({ trend, color }: { trend: number[]; color: string }) {
  if (!Array.isArray(trend) || trend.length < 2) return null
  const min = Math.min(...trend)
  const max = Math.max(...trend)
  const range = max - min || 1
  const pts = trend.map((v, i) => {
    const x = (i / (trend.length - 1)) * 100
    const y = 30 - ((v - min) / range) * 26
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const [lastX, lastY] = pts[pts.length - 1].split(',')

  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{ width: 64, height: 26, minWidth: 64, maxWidth: 64 }}
      aria-hidden="true"
    >
      <svg width="100%" height="100%" viewBox="0 0 100 36" preserveAspectRatio="none">
        <polyline
          points={pts.join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={lastX} cy={lastY} r={4} fill={color} />
      </svg>
    </div>
  )
}

function ProspectCard({ pick }: { pick: FantasyPick }) {
  const details = pick.details ?? {}
  const trend: number[] | undefined = details.trend
  const current: number | undefined = details.current_value
  const color = '#059669' // heating-only by design — always the rebound colour, never the fade one

  return (
    <div className="bg-white border border-stone-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-serif font-bold text-stone-900 truncate">{pick.player_name}</span>
          <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 shrink-0">
            AAA
          </span>
        </div>
        {pick.team_name && (
          <div className="font-mono text-[10px] text-stone-400 mt-0.5 truncate">{pick.team_name}</div>
        )}
        <div className="text-[10px] font-mono font-bold mt-1" style={{ color }}>
          {typeof current === 'number' ? current.toFixed(3) : ''} rolling OPS
        </div>
      </div>
      {trend && <Sparkline trend={trend} color={color} />}
    </div>
  )
}

export default function MinorLeagueWatchSection({ prospects }: Props) {
  if (prospects.length === 0) return null

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {prospects.map((p) => (
          <ProspectCard key={p.id} pick={p} />
        ))}
      </div>
      <p className="text-[9px] font-mono text-stone-400 mt-3">
        Good recent form in Triple-A — not a scouting grade or a prospect ranking.
      </p>
    </div>
  )
}