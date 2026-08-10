// src/components/postgame/WinProbabilityChart.tsx
//
// Plain inline SVG, matching PitchChart.tsx's no-dependency convention.
// Plots home team win probability across the game's atBatIndex sequence.
// Renders a message, not a fabricated flat line, if winProbability is
// empty — see mlb-win-probability.ts's degrade-on-failure comment.

import type { WinProbabilityPoint, TeamSummary } from '@/types/postgame'

const ORANGE = '#FF5722'
const INK = '#1A1A1A'

export function WinProbabilityChart({
  points,
  away,
  home,
}: {
  points: WinProbabilityPoint[]
  away: TeamSummary
  home: TeamSummary
}) {
  if (points.length === 0) {
    return (
      <div className="font-mono text-[11px] text-stone-400 py-8 text-center">
        Win probability not available for this game.
      </div>
    )
  }

  const W = 900, H = 220, PAD_L = 34, PAD_R = 10, PAD_T = 12, PAD_B = 24
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const n = points.length

  const xScale = (i: number) => PAD_L + (n <= 1 ? 0 : (i / (n - 1)) * innerW)
  const yScale = (pct: number) => PAD_T + innerH - (pct / 100) * innerH

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(p.homeWinPct)}`)
    .join(' ')

  const areaPath =
    `M ${xScale(0)} ${yScale(50)} ` +
    points.map((p, i) => `L ${xScale(i)} ${yScale(p.homeWinPct)}`).join(' ') +
    ` L ${xScale(n - 1)} ${yScale(50)} Z`

  // inning tick marks — first point of each top-half seen
  const inningTicks: { i: number; label: string }[] = []
  let lastKey = ''
  points.forEach((p, i) => {
    const key = `${p.inning}-${p.halfInning}`
    if (p.halfInning === 'top' && key !== lastKey) inningTicks.push({ i, label: String(p.inning) })
    lastKey = key
  })

  const finalHome = points[points.length - 1].homeWinPct
  const homeWon = finalHome >= 50

  return (
    <div>
      <div className="flex items-center gap-5 mb-2 font-mono text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: INK }} />
          {away.abbreviation}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: ORANGE }} />
          {home.abbreviation}
        </span>
        <span className="ml-auto text-stone-500">
          Final: {homeWon ? home.abbreviation : away.abbreviation} {Math.round(homeWon ? finalHome : 100 - finalHome)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Win probability chart">
        <rect x={0} y={0} width={W} height={H} fill="#FAF8F3" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#E4DFD4" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke={INK} strokeWidth={1.5} />
        <line x1={PAD_L} y1={yScale(50)} x2={W - PAD_R} y2={yScale(50)} stroke="#E4DFD4" strokeDasharray="3,3" />
        <text x={PAD_L - 6} y={PAD_T + 4} textAnchor="end" fontSize={9} fill="#8A8578" fontFamily="JetBrains Mono, monospace">100</text>
        <text x={PAD_L - 6} y={yScale(50) + 3} textAnchor="end" fontSize={9} fill="#8A8578" fontFamily="JetBrains Mono, monospace">50</text>
        <text x={PAD_L - 6} y={H - PAD_B + 3} textAnchor="end" fontSize={9} fill="#8A8578" fontFamily="JetBrains Mono, monospace">0</text>
        {inningTicks.map(t => (
          <text key={t.i} x={xScale(t.i)} y={H - 6} textAnchor="middle" fontSize={9} fill="#8A8578" fontFamily="JetBrains Mono, monospace">
            {t.label}
          </text>
        ))}
        <path d={areaPath} fill={ORANGE} fillOpacity={0.1} />
        <path d={linePath} fill="none" stroke={ORANGE} strokeWidth={2} />
      </svg>
      <div className="font-mono text-[9.5px] text-stone-400 mt-2 leading-relaxed">
        Home team ({home.abbreviation}) win probability, tracked after every plate appearance. Above 50% favors {home.abbreviation}, below favors {away.abbreviation}.
      </div>
    </div>
  )
}