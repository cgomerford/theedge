// src/components/game-preview/SeriesTeamStats.tsx
//
// "Team stats" for the series, broken into the four groups George asked
// for — Offense / Defense / Starting Pitching / Bullpen — each with the
// stats that actually belong to that group, not one flat list. Offense
// totals (AB, H, HR, RBI, BB, K, team AVG) come from the same per-batter
// series lines SeriesPlayerStats already renders
// (getSeriesBattingStatsFromDB), not a new fetch. RISP AVG is derived
// play-by-play via getSeriesRispStats (matchup.splits.menOnBase) — not a
// boxscore field. Defense (errors, fielding %) and the Starting
// Pitching/Bullpen splits (IP, ERA, ER, K, BB, plus bullpen-only inherited
// runners) all come from getSeriesTeamBoxscoreStats, which does the
// starter-vs-reliever split off each pitcher's own gamesStarted flag —
// see that function's header comment for why the team-level pitching
// rollup can't be trusted for inherited runners.

import type { SeriesBatterLine, SeriesTeamBoxscoreStats, SeriesRispStats, SeriesPitchingSplit } from '@/lib/series-stats'

type Totals = { ab: number; hits: number; hr: number; rbi: number; bb: number; k: number }

function sumTeam(rows: SeriesBatterLine[]): Totals {
  return rows.reduce(
    (acc, r) => ({
      ab: acc.ab + r.ab, hits: acc.hits + r.hits, hr: acc.hr + r.home_runs,
      rbi: acc.rbi + r.rbi, bb: acc.bb + r.walks, k: acc.k + r.strikeouts,
    }),
    { ab: 0, hits: 0, hr: 0, rbi: 0, bb: 0, k: 0 },
  )
}

function fmtAvg(hits: number, ab: number): string {
  return ab > 0 ? (hits / ab).toFixed(3).replace(/^0/, '') : '—'
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-stone-50 last:border-0">
      <span className="text-[10.5px] text-stone-500 whitespace-nowrap">{label}</span>
      <span className="text-[11.5px] font-mono font-bold text-stone-900 whitespace-nowrap">{value}</span>
    </div>
  )
}

function StatGroup({ title, rows }: { title: string; rows: [string, string][] }) {
  if (rows.length === 0) return null
  return (
    <div className="mt-2.5 pt-2.5 border-t border-stone-100 first:mt-0 first:pt-0 first:border-0">
      <p className="text-[8px] font-mono uppercase tracking-widest text-orange-600/80 font-bold mb-1">{title}</p>
      <div className="grid grid-cols-2 gap-x-3">
        {rows.map(([label, value]) => <StatRow key={label} label={label} value={value} />)}
      </div>
    </div>
  )
}

function pitchingRows(split: SeriesPitchingSplit, extra: [string, string][] = []): [string, string][] {
  return [
    ['IP', split.ip],
    ['ERA', split.era],
    ['ER', String(split.earnedRuns)],
    ['K', String(split.strikeouts)],
    ['BB', String(split.walks)],
    ...extra,
  ]
}

function TeamCol({
  abbr, totals, boxStats, rispStats,
}: {
  abbr: string
  totals: Totals
  boxStats: SeriesTeamBoxscoreStats | null
  rispStats: SeriesRispStats | null
}) {
  const offenseRows: [string, string][] = [
    ['AVG', fmtAvg(totals.hits, totals.ab)],
    ['AB', String(totals.ab)],
    ['H', String(totals.hits)],
    ['HR', String(totals.hr)],
    ['RBI', String(totals.rbi)],
    ['BB', String(totals.bb)],
    ['K', String(totals.k)],
  ]
  if (rispStats && rispStats.ab > 0) {
    offenseRows.push(['RISP AVG', `${rispStats.avg} (${rispStats.hits}/${rispStats.ab})`])
  }
  if (boxStats && boxStats.gamesCounted > 0) {
    offenseRows.push(['Stranded', String(boxStats.leftOnBase)])
    offenseRows.push(['SB', String(boxStats.stolenBases)])
  }

  const hasBoxStats = !!boxStats && boxStats.gamesCounted > 0
  const defenseRows: [string, string][] = hasBoxStats
    ? [['Errors', String(boxStats.fielding.errors)], ['Fielding %', boxStats.fielding.fieldingPct]]
    : []
  const startingRows: [string, string][] = hasBoxStats && boxStats.startingPitching.outs > 0
    ? pitchingRows(boxStats.startingPitching)
    : []
  const bullpenRows: [string, string][] = hasBoxStats && boxStats.bullpen.outs > 0
    ? pitchingRows(boxStats.bullpen, [['IR scored', `${boxStats.bullpen.inheritedRunnersScored}/${boxStats.bullpen.inheritedRunners}`]])
    : []

  return (
    <div>
      <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2">{abbr}</p>
      <StatGroup title="Offense" rows={offenseRows} />
      <StatGroup title="Defense" rows={defenseRows} />
      <StatGroup title="Starting pitching" rows={startingRows} />
      <StatGroup title="Bullpen" rows={bullpenRows} />
    </div>
  )
}

export default function SeriesTeamStats({
  awayAbbr, homeAbbr, awayRows, homeRows, awayBoxStats, homeBoxStats, awayRispStats, homeRispStats,
}: {
  awayAbbr: string
  homeAbbr: string
  awayRows: SeriesBatterLine[]
  homeRows: SeriesBatterLine[]
  awayBoxStats: SeriesTeamBoxscoreStats | null
  homeBoxStats: SeriesTeamBoxscoreStats | null
  awayRispStats: SeriesRispStats | null
  homeRispStats: SeriesRispStats | null
}) {
  const awayTotals = sumTeam(awayRows)
  const homeTotals = sumTeam(homeRows)

  if (awayRows.length === 0 && homeRows.length === 0) {
    return <p className="text-xs font-sans italic text-stone-400 py-2">No batting data for this series yet.</p>
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-4">
        <TeamCol abbr={awayAbbr} totals={awayTotals} boxStats={awayBoxStats} rispStats={awayRispStats} />
        <TeamCol abbr={homeAbbr} totals={homeTotals} boxStats={homeBoxStats} rispStats={homeRispStats} />
      </div>
      <p className="text-[9.5px] text-stone-400 font-sans italic mt-3">
        Team totals across this series&apos; completed games.
      </p>
    </div>
  )
}
