// src/components/AbsRadarSection.tsx
//
// "All-round ABS rankings" — a radar of up to 6 axes blending volume, accuracy,
// precision (how close the pitch was to the zone edge — a near-miss earns partial credit),
// estimated run impact, clutch (late-inning) performance, and reliability
// (spread across games) into one composite score, computed separately for
// batters and pitchers/catchers since the two sides challenge in
// structurally different situations (a batter challenges their own call;
// a catcher/pitcher challenges the opponent's).
//
// Every axis is a PERCENTILE rank against the qualified cohort of the same
// side — not a raw value — so a 5-axis shape is comparable across players
// regardless of each stat's own scale. "Est. run impact" is a deliberate
// estimate, not a play-by-play run-expectancy model: abs_challenge_log
// doesn't capture the count or base/out state at the moment of the
// challenge (only inning, side, and outcome), so a play-by-play run value
// isn't derivable from what's backfilled. Instead this applies one
// season-wide average run swing per overturned call (see
// RUN_VALUE_PER_OVERTURN below) — directionally honest, not precise to
// the individual pitch, and labeled "Est." everywhere it's shown.

'use client'

import { useMemo, useState } from 'react'
import { MIN_PLAYER_SAMPLE, type PlayerChallengeRow } from '@/lib/abs-challenge-log'
import { headshotUrl as playerHeadshotUrl } from '@/lib/mlb-assets'
import { InfoButton } from '@/components/InfoButton'
import { HelpLink } from '@/components/HelpLink'
import SavantPercentileBar from '@/components/charts/SavantPercentileBar'

const BLUE = '#2a78d6'
const ORANGE = '#FF5722'
const AXIS_LINE = 'rgba(26,26,26,0.12)'

// Academic umpire-error studies (e.g. Mills, "Social Pressure at the
// Plate") put the average run-expectancy swing of a single ball/strike
// miscall in roughly the 0.10-0.18 range depending on count and base/out
// state. 0.14 is the midpoint of that range, applied uniformly since this
// table doesn't record count/base-out state per challenge.
const RUN_VALUE_PER_OVERTURN = 0.14

type RadarAxis = { key: string; label: string; pct: number; raw: string }

function percentileRank(value: number, all: number[]): number {
  if (all.length <= 1) return 100
  let below = 0, equal = 0
  for (const v of all) { if (v < value) below++; else if (v === value) equal++ }
  return Math.round(((below + equal / 2) / all.length) * 100)
}

function estRunImpact(p: PlayerChallengeRow): number {
  return Math.round(p.overturns * RUN_VALUE_PER_OVERTURN * 10) / 10
}

function clutchRate(p: PlayerChallengeRow): number {
  return p.lateChallenges > 0 ? p.lateOverturns / p.lateChallenges : 0
}

function buildAxes(p: PlayerChallengeRow, cohort: PlayerChallengeRow[]): RadarAxis[] {
  const impactLabel = p.side === 'fielding' ? 'Runs saved' : 'Runs added'
  const impact = estRunImpact(p)
  const clutch = clutchRate(p)
  // Precision only exists where the pitch location was tracked; a player without it simply has one fewer axis (never a guessed value).
  const precisionCohort = cohort.map(c => c.precision).filter((v): v is number => v != null)
  const precisionAxis: RadarAxis[] = p.precision != null
    ? [{ key: 'precision', label: 'Precision', pct: percentileRank(p.precision, precisionCohort), raw: `${Math.round(p.precision * 100)}%` }]
    : []

  return [
    // rawValue strings are deliberately short (no unit/descriptor repeating
    // what the row's own label already says) — SavantPercentileBar's
    // raw-value column is a fixed 42px, sized for the site's existing
    // convention ("91.4 mph", ".443", "20.1%"), not a sentence.
    { key: 'volume', label: 'Volume', pct: percentileRank(p.challenges, cohort.map(c => c.challenges)), raw: `${p.challenges}` },
    { key: 'accuracy', label: 'Accuracy', pct: percentileRank(p.successRate, cohort.map(c => c.successRate)), raw: `${Math.round(p.successRate * 100)}%` },
    ...precisionAxis,
    { key: 'impact', label: impactLabel, pct: percentileRank(impact, cohort.map(c => estRunImpact(c))), raw: `${impact >= 0 ? '+' : ''}${impact}` },
    { key: 'clutch', label: 'Clutch (inn 7+)', pct: percentileRank(clutch, cohort.map(c => clutchRate(c))), raw: p.lateChallenges > 0 ? `${Math.round(clutch * 100)}%` : '—' },
    { key: 'reliability', label: 'Reliability', pct: percentileRank(p.distinctDates, cohort.map(c => c.distinctDates)), raw: `${p.distinctDates}` },
  ]
}

function compositeScore(axes: RadarAxis[]): number {
  return Math.round(axes.reduce((s, a) => s + a.pct, 0) / axes.length)
}

const AXIS_INFO: Record<string, string> = {
  volume: 'How many ABS challenges this player has called for this season, ranked against every other qualified player on the same side of the ball. Raw volume, not accuracy — a high score here just means they use their challenges a lot.',
  accuracy: 'Success rate on those challenges (overturned ÷ total). The core "were they right" number, independent of how many they’ve called.',
  precision: 'Success rate with credit for close calls. An overturned challenge counts as 1; a failed one earns partial credit that shrinks the farther the pitch was from the zone edge (a challenge on a pitch a fraction of an inch off earns close to 0.5, one 3+ inches off earns 0). Distances are estimated from the pitch location in MLB’s feed, so they are reliable for telling a near-miss from a wild challenge but not an exact inch count, especially near the top and bottom of the zone.',
  impact: 'Estimated run value of the overturned calls — overturns × a season-wide average run swing per correct challenge (see the composite score note above for why this is an estimate, not a play-by-play figure). Turns raw accuracy into "how much did it actually matter."',
  clutch: 'Success rate specifically on challenges called in the 7th inning or later, when a blown or won call is more likely to decide the game. Separate from overall accuracy since some players save their sharpest reads for the biggest moments.',
  reliability: 'Number of different games this player has called a challenge in. Distinguishes a player who shows up all season from one who had one huge night — 10 challenges in 10 games reads very differently than 10 in one.',
}

function AxisInfoButton({ axisKey }: { axisKey: string }) {
  const body = AXIS_INFO[axisKey]
  if (!body) return null
  return <InfoButton title={axisKey === 'impact' ? 'Runs saved / added' : axisKey.charAt(0).toUpperCase() + axisKey.slice(1)} align="left">{body}</InfoButton>
}


// ── Radar chart (generic 5-axis polygon, plain SVG) ──────────────────────

function RadarChart({ axes, color, size = 220 }: { axes: RadarAxis[]; color: string; size?: number }) {
  const cx = size / 2, cy = size / 2, R = size * 0.32
  const n = axes.length
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const polar = (rFrac: number, i: number): [number, number] => [cx + rFrac * R * Math.cos(angle(i)), cy + rFrac * R * Math.sin(angle(i))]
  const poly = (vals: number[]) => vals.map((pct, i) => polar(pct / 100, i).join(',')).join(' ')

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="overflow-visible">
      {[25, 50, 75, 100].map(level => (
        <polygon key={level} points={poly(axes.map(() => level))} fill="none" stroke={AXIS_LINE} strokeWidth="1" />
      ))}
      {axes.map((a, i) => {
        const [x, y] = polar(1, i)
        return <line key={a.key} x1={cx} y1={cy} x2={x} y2={y} stroke={AXIS_LINE} strokeWidth="1" />
      })}
      <polygon points={poly(axes.map(a => a.pct))} fill={color} fillOpacity="0.22" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {axes.map((a, i) => {
        const [x, y] = polar(a.pct / 100, i)
        return <circle key={a.key} cx={x} cy={y} r={3} fill={color} />
      })}
      {axes.map((a, i) => {
        const [lx, ly] = polar(1.34, i)
        const cos = Math.cos(angle(i)), sin = Math.sin(angle(i))
        return (
          <text
            key={a.key} x={lx} y={ly} fontSize="9" fontWeight="700" fill="#57534E"
            textAnchor={Math.abs(cos) < 0.25 ? 'middle' : cos > 0 ? 'start' : 'end'}
            dominantBaseline={Math.abs(sin) < 0.25 ? 'middle' : sin > 0 ? 'hanging' : 'alphabetic'}
          >
            {a.label}
          </text>
        )
      })}
    </svg>
  )
}

function PlayerRadarCard({ player, cohort, color }: { player: PlayerChallengeRow; cohort: PlayerChallengeRow[]; color: string }) {
  const axes = useMemo(() => buildAxes(player, cohort), [player, cohort])
  const score = compositeScore(axes)

  return (
    <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 flex flex-col items-center">
      <div className="flex items-center gap-2.5 mb-2 self-stretch">
        <img src={playerHeadshotUrl(player.playerId, 80)} alt="" className="w-11 h-11 rounded-full object-cover border-2 shrink-0" style={{ borderColor: color }} />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold text-[#1A1A1A] truncate">{player.playerName}</div>
          <div className="text-[10px] text-[#8A8577]">{player.side === 'batting' ? 'Batter' : 'Pitcher/catcher'}{player.teamAbbr ? ` · ${player.teamAbbr}` : ''}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-center justify-end gap-1">
            <div className="text-[20px] font-black leading-none" style={{ color }}>{score}</div>
            <InfoButton title="All-round score" align="right">
              The average of the percentiles below — volume, accuracy, precision, run impact, clutch, and reliability —
              each ranked against every other qualified player on the same side of the ball. 100 would mean 100th
              percentile on every axis; 50 is dead average across the board.
            </InfoButton>
          </div>
          <div className="text-[7.5px] uppercase tracking-wide text-[#8A8577] mt-0.5">All-round score</div>
        </div>
      </div>
      <RadarChart axes={axes} color={color} size={216} />

      {/* Savant-style percentile bars — same shared component the player pages
          use, so a percentile looks and means the same thing here as
          everywhere else on the site, not a bespoke "(68th pct)" of its own. */}
      <div className="w-full mt-3">
        <SavantPercentileBar
          rows={axes.map(a => ({ label: a.label, percentile: a.pct, rawValue: a.raw, higherIsBetter: true }))}
          compact
          rounded
        />
      </div>
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap justify-center mt-2">
        {axes.map(a => (
          <span key={a.key} className="text-[8.5px] text-[#8A8577] flex items-center gap-1">{a.label}<AxisInfoButton axisKey={a.key} /></span>
        ))}
      </div>
    </div>
  )
}

// ── Player picker (compare any qualified player) ─────────────────────────

function PlayerPicker({ players, value, onChange }: { players: PlayerChallengeRow[]; value: number | null; onChange: (id: number | null) => void }) {
  const byName = [...players].sort((a, b) => a.playerName.localeCompare(b.playerName))
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
      className="text-[11px] border border-[#DEDACE] rounded-md px-2 py-1.5 text-[#1A1A1A] bg-white max-w-[220px]"
    >
      <option value="">Compare a player…</option>
      <optgroup label="Batters">
        {byName.filter(p => p.side === 'batting').map(p => (
          <option key={p.playerId} value={p.playerId}>{p.playerName}{p.teamAbbr ? ` (${p.teamAbbr})` : ''}</option>
        ))}
      </optgroup>
      <optgroup label="Pitchers/catchers">
        {byName.filter(p => p.side === 'fielding').map(p => (
          <option key={p.playerId} value={p.playerId}>{p.playerName}{p.teamAbbr ? ` (${p.teamAbbr})` : ''}</option>
        ))}
      </optgroup>
    </select>
  )
}

// ── Full sortable leaderboard ─────────────────────────────────────────────

type SortKey = 'score' | 'challenges' | 'successRate' | 'precision' | 'avgMissIn' | 'impact' | 'clutch' | 'distinctDates'
const SORT_LABEL: Record<SortKey, string> = {
  score: 'Score', challenges: 'Challenges', successRate: 'Success%', precision: 'Precision', avgMissIn: 'Miss by', impact: 'Impact', clutch: 'Clutch%', distinctDates: 'Games',
}

function FullLeaderboard({ players }: { players: PlayerChallengeRow[] }) {
  const [side, setSide] = useState<'all' | 'batting' | 'fielding'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [showAll, setShowAll] = useState(false)

  const batters = players.filter(p => p.side === 'batting')
  const fielders = players.filter(p => p.side === 'fielding')

  const rows = useMemo(() => {
    const withScore = players.map(p => {
      const cohort = p.side === 'batting' ? batters : fielders
      const axes = buildAxes(p, cohort)
      return { p, score: compositeScore(axes), impact: estRunImpact(p), clutch: clutchRate(p) }
    })
    const filtered = side === 'all' ? withScore : withScore.filter(r => r.p.side === side)
    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'score': return b.score - a.score
        case 'challenges': return b.p.challenges - a.p.challenges
        case 'successRate': return b.p.successRate - a.p.successRate
        case 'precision': return (b.p.precision ?? -1) - (a.p.precision ?? -1)
        case 'avgMissIn': return (a.p.avgMissIn ?? Infinity) - (b.p.avgMissIn ?? Infinity) // closest calls first; no data last
        case 'impact': return b.impact - a.impact
        case 'clutch': return b.clutch - a.clutch
        case 'distinctDates': return b.p.distinctDates - a.p.distinctDates
      }
    })
    return sorted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, side, sortKey])

  const shown = showAll ? rows : rows.slice(0, 25)

  return (
    <div className="rounded-xl border border-[#E8E4DC] bg-white p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <div className="text-[13.5px] font-bold text-[#1A1A1A]">Comprehensive leaderboard</div>
            <HelpLink stat="percentile-rank" />
          </div>
          <div className="text-[10px] text-[#8A8577]">Every qualified challenger (min {MIN_PLAYER_SAMPLE}), ranked by all-round score</div>
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'batting', 'fielding'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border transition ${side === s ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'text-[#8A8577] border-[#DEDACE] hover:border-[#1A1A1A]'}`}
            >
              {s === 'all' ? 'All' : s === 'batting' ? 'Batters' : 'Pitchers/catchers'}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="text-left text-[9px] uppercase tracking-wide text-[#8A8577] border-b border-[#E8E4DC]">
              <th className="py-1.5 pr-2 font-bold">#</th>
              <th className="py-1.5 pr-2 font-bold">Player</th>
              {(['score', 'challenges', 'successRate', 'precision', 'avgMissIn', 'impact', 'clutch', 'distinctDates'] as SortKey[]).map(k => (
                <th key={k} className="py-1.5 pr-2 font-bold text-right cursor-pointer select-none hover:text-[#1A1A1A]" onClick={() => setSortKey(k)} title={k === 'avgMissIn' ? 'Average estimated inches the pitch was from the zone edge on his failed challenges — lower means closer calls' : k === 'precision' ? 'Success rate with partial credit for close misses' : undefined}>
                  {SORT_LABEL[k]}{sortKey === k ? ' ▾' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const color = r.p.side === 'batting' ? ORANGE : BLUE
              return (
                <tr key={r.p.playerId} className="border-b border-[#F0EFEC] hover:bg-[#FAF8F3]">
                  <td className="py-1.5 pr-2 text-[#8A8577] tabular-nums">{i + 1}</td>
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-1.5 min-w-[140px]">
                      <img src={playerHeadshotUrl(r.p.playerId, 40)} alt="" className="w-5 h-5 rounded-full object-cover border shrink-0" style={{ borderColor: color }} />
                      <span className="truncate text-[#1A1A1A] font-medium">{r.p.playerName}</span>
                      {r.p.teamAbbr && <span className="text-[#8A8577] shrink-0">{r.p.teamAbbr}</span>}
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 text-right font-bold tabular-nums" style={{ color }}>{r.score}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{r.p.challenges}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{Math.round(r.p.successRate * 100)}%</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{r.p.precision != null ? `${Math.round(r.p.precision * 100)}%` : '—'}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{r.p.avgMissIn != null ? `${r.p.avgMissIn.toFixed(1)} in` : '—'}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{r.impact >= 0 ? '+' : ''}{r.impact}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{r.p.lateChallenges > 0 ? `${Math.round(r.clutch * 100)}%` : '—'}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{r.p.distinctDates}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!showAll && rows.length > 25 && (
        <button onClick={() => setShowAll(true)} className="mt-3 text-[10px] font-bold text-[#FF5722] uppercase tracking-wide hover:underline">
          Show all {rows.length} players ↓
        </button>
      )}
    </div>
  )
}

// ── Top-level section ──────────────────────────────────────────────────────

export default function AbsRadarSection({ players }: { players: PlayerChallengeRow[] }) {
  const [compareId, setCompareId] = useState<number | null>(null)

  const qualified = useMemo(() => players.filter(p => p.challenges >= MIN_PLAYER_SAMPLE), [players])
  const batters = useMemo(() => qualified.filter(p => p.side === 'batting'), [qualified])
  const fielders = useMemo(() => qualified.filter(p => p.side === 'fielding'), [qualified])

  const topOf = (cohort: PlayerChallengeRow[]) =>
    cohort.length === 0 ? null : [...cohort].sort((a, b) => compositeScore(buildAxes(b, cohort)) - compositeScore(buildAxes(a, cohort)))[0]

  const topBatter = useMemo(() => topOf(batters), [batters])
  const topFielder = useMemo(() => topOf(fielders), [fielders])

  const comparePlayer = compareId ? qualified.find(p => p.playerId === compareId) ?? null : null
  const compareCohort = comparePlayer ? (comparePlayer.side === 'batting' ? batters : fielders) : []

  if (qualified.length === 0) {
    return (
      <div className="rounded-xl border border-[#E8E4DC] bg-white p-6 text-center text-[12px] text-[#8A8577]">
        Backfilling per-pitch data — the all-round radar needs at least {MIN_PLAYER_SAMPLE} challenges per player to rank fairly, and lands once the season log finishes indexing.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-1.5">
          <div className="text-[17px] font-bold text-[#1A1A1A]">All-round ABS rankings</div>
          <HelpLink stat="abs-success-rate" />
        </div>
        <div className="text-[12px] text-[#8A8577] mt-1 max-w-[720px]">
          A score blending challenge volume, accuracy, precision (a challenge on a pitch a fraction of an inch off the zone
          edge counts for more than one that was inches away), estimated run impact of overturned calls, performance in
          high-leverage innings (7th or later), and how consistently a player shows up across games — each axis ranked as a
          percentile against every other qualified player (min {MIN_PLAYER_SAMPLE} challenges) on the same side of the ball.
          Miss distances are estimated from the pitch location in MLB&apos;s feed.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topBatter && <PlayerRadarCard player={topBatter} cohort={batters} color={ORANGE} />}
        {topFielder && <PlayerRadarCard player={topFielder} cohort={fielders} color={BLUE} />}
      </div>

      <div className="rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <div className="text-[13px] font-bold text-[#1A1A1A]">Compare any player</div>
            <div className="text-[10px] text-[#8A8577]">Pick a qualified challenger to see their full radar</div>
          </div>
          <PlayerPicker players={qualified} value={compareId} onChange={setCompareId} />
        </div>
        {comparePlayer ? (
          <div className="max-w-[360px]">
            <PlayerRadarCard player={comparePlayer} cohort={compareCohort} color={comparePlayer.side === 'batting' ? ORANGE : BLUE} />
          </div>
        ) : (
          <div className="text-[11px] text-[#8A8577] py-6 text-center">Select a player above to see their radar.</div>
        )}
      </div>

      <FullLeaderboard players={qualified} />
    </div>
  )
}
