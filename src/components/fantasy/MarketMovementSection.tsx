/**
 * src/components/fantasy/MarketMovementSection.tsx
 *
 * Renders the 'cooler' and 'riser' picks as two sections (Batters, Pitchers),
 * each with a heating-up / cooling-down column and a sparkline per player.
 *
 * AAA prospects live in their own component now (MinorLeagueWatchSection.tsx)
 * — folding them in here made them invisible as a distinct feature. Separate
 * section, separate file.
 *
 * Lives inside FantasyDashboard.tsx's own <section><SectionLabel>Market
 * Movement</SectionLabel><ReadLine>...</ReadLine> wrapper — this component
 * only renders the card grid, not its own title/description, so it doesn't
 * duplicate framing the page already provides.
 *
 *   <MarketMovementSection coolers={picks.cooler} risers={picks.riser} />
 *
 * `picks` is the FantasyPicksByType object the page already gets from
 * getFantasyPicks() — no new data fetching needed.
 *
 * Renders nothing if there's nothing to show (no 'use client' needed — this
 * is pure presentation over props, no hooks, safe as a server component).
 */

import type { FantasyPick } from '@/lib/fantasy'

type Props = {
  coolers: FantasyPick[]
  risers: FantasyPick[]
}

type Direction = 'cooling' | 'heating'

const DIRECTION_COLOR: Record<Direction, string> = {
  cooling: '#DC2626',
  heating: '#059669',
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
      style={{ width: 56, height: 24, minWidth: 56, maxWidth: 56 }}
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

function formatMetric(value: number, playerType: string): string {
  return playerType === 'pitcher' ? value.toFixed(2) : value.toFixed(3)
}

function FormRow({ pick, direction }: { pick: FantasyPick; direction: Direction }) {
  const details = pick.details ?? {}
  const playerType: string = details.player_type ?? 'batter'
  const trend: number[] | undefined = details.trend
  const current: number | undefined = details.current_value
  const color = DIRECTION_COLOR[direction]
  const metricLabel = playerType === 'pitcher' ? 'rolling ERA' : 'rolling OPS'

  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-stone-100 last:border-b-0 min-h-[2.75rem]">
      <div className="min-w-0">
        <div className="text-sm font-serif font-bold text-stone-900 truncate">
          {pick.player_name}
          {pick.team_name && (
            <span className="text-[10px] font-mono text-stone-400 font-normal"> · {pick.team_name}</span>
          )}
        </div>
        <div className="text-[10px] font-mono font-bold mt-0.5" style={{ color }}>
          {typeof current === 'number' ? formatMetric(current, playerType) : ''} {metricLabel}
        </div>
      </div>
      {trend && <Sparkline trend={trend} color={color} />}
    </div>
  )
}

function FormColumn({ title, picks, direction }: { title: string; picks: FantasyPick[]; direction: Direction }) {
  const dotColor = direction === 'cooling' ? 'bg-red-600' : 'bg-emerald-600'
  const textColor = direction === 'cooling' ? 'text-red-700' : 'text-emerald-700'

  return (
    <div>
      <div className={`flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest font-bold mb-2 ${textColor}`}>
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
        {title}
      </div>
      {picks.length === 0 ? (
        <p className="text-xs text-stone-400 font-serif italic">Nothing flagged today.</p>
      ) : (
        picks.map((p) => <FormRow key={p.id} pick={p} direction={direction} />)
      )}
    </div>
  )
}

function PlayerTypeSection({
  title,
  coolers,
  risers,
}: {
  title: string
  coolers: FantasyPick[]
  risers: FantasyPick[]
}) {
  if (coolers.length === 0 && risers.length === 0) return null

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5">
      <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">
        § {title}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <FormColumn title="Heating up" picks={risers} direction="heating" />
        <FormColumn title="Cooling down" picks={coolers} direction="cooling" />
      </div>
    </div>
  )
}

export default function MarketMovementSection({ coolers, risers }: Props) {
  const byType = (picks: FantasyPick[], type: string) =>
    picks.filter((p) => p.details?.player_type === type)

  const battersCooling = byType(coolers, 'batter')
  const battersHeating = byType(risers, 'batter')
  const pitchersCooling = byType(coolers, 'pitcher')
  const pitchersHeating = byType(risers, 'pitcher')

  const nothingToShow =
    battersCooling.length === 0 &&
    battersHeating.length === 0 &&
    pitchersCooling.length === 0 &&
    pitchersHeating.length === 0

  if (nothingToShow) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <PlayerTypeSection title="Batters" coolers={battersCooling} risers={battersHeating} />
      <PlayerTypeSection title="Pitchers" coolers={pitchersCooling} risers={pitchersHeating} />
    </div>
  )
}