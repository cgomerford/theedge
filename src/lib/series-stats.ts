// Aggregates batting lines across a series' completed games for one team.
// Reuses the confirmed-working boxscore endpoint from lineups.ts
// (${MLB_API}/game/${gamePk}/boxscore) — new aggregation, not a new
// unverified API surface.
//
// UNVERIFIED FIELD SHAPE — player.stats.batting.{atBats,hits,homeRuns,rbi,
// baseOnBalls,strikeOuts} are documented MLB fields, not yet confirmed
// against a live response for this project. console.log below until
// verified, same convention as the rest of this build.
const MLB_API = 'https://statsapi.mlb.com/api/v1'
import { createAdminClient } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawBoxscorePlayer = any

export type SeriesBatterLine = {
  playerId: number
  name: string
  gamesPlayed: number
  ab: number
  hits: number
  home_runs: number
  rbi: number
  walks: number
  strikeouts: number
  avg: string
}

export async function getSeriesBattingStats(gamePks: number[], teamId: number): Promise<SeriesBatterLine[]> {
  const totals = new Map<number, SeriesBatterLine>()
  let logged = false

  for (const gamePk of gamePks) {
    try {
      const res = await fetch(`${MLB_API}/game/${gamePk}/boxscore`, { next: { revalidate: 3600 } })
      if (!res.ok) continue
      const data = await res.json()

      const homeId = data.teams?.home?.team?.id
      const awayId = data.teams?.away?.team?.id
      const teamData = homeId === teamId ? data.teams.home : awayId === teamId ? data.teams.away : null
      if (!teamData) continue

      const players = Object.values(teamData.players ?? {}) as RawBoxscorePlayer[]
      if (!logged && players[0]) {
        console.log('[series-stats] raw player.stats.batting shape:', JSON.stringify(players[0]?.stats?.batting))
        logged = true
      }

      for (const player of players) {
        const batting = player.stats?.batting
        if (!batting || (batting.atBats ?? 0) === 0) continue
        const id = player.person?.id
        if (!id) continue

        const existing = totals.get(id) ?? {
          playerId: id, name: player.person?.fullName ?? '—', gamesPlayed: 0,
          ab: 0, hits: 0, home_runs: 0, rbi: 0, walks: 0, strikeouts: 0, avg: '—',
        }
        existing.gamesPlayed += 1
        existing.ab += batting.atBats ?? 0
        existing.hits += batting.hits ?? 0
        existing.home_runs += batting.homeRuns ?? 0
        existing.rbi += batting.rbi ?? 0
        existing.walks += batting.baseOnBalls ?? 0
        existing.strikeouts += batting.strikeOuts ?? 0
        totals.set(id, existing)
      }
    } catch (err) {
      console.error('[series-stats] boxscore fetch failed:', gamePk, err)
    }
  }

  const rows = Array.from(totals.values())
  for (const r of rows) r.avg = r.ab > 0 ? (r.hits / r.ab).toFixed(3).replace(/^0/, '') : '—'
  return rows.sort((a, b) => b.hits - a.hits)
}


// Pitcher equivalent of getSeriesBattingStats — same per-game boxscore
// loop, just reading player.stats.pitching instead. No DB-precomputed
// version exists for this one (getSeriesBattingStatsFromDB's table only
// covers batting), so this is a live fetch every time it's called.
export type SeriesPitcherLine = {
  playerId: number
  name: string
  gamesPitched: number
  outs: number
  earnedRuns: number
  strikeouts: number
  walks: number
  hits: number
  ip: string
}

function formatIpFromOuts(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`
}

export async function getSeriesPitchingStats(gamePks: number[], teamId: number): Promise<SeriesPitcherLine[]> {
  const totals = new Map<number, SeriesPitcherLine>()

  for (const gamePk of gamePks) {
    try {
      const res = await fetch(`${MLB_API}/game/${gamePk}/boxscore`, { next: { revalidate: 3600 } })
      if (!res.ok) continue
      const data = await res.json()

      const homeId = data.teams?.home?.team?.id
      const awayId = data.teams?.away?.team?.id
      const teamData = homeId === teamId ? data.teams.home : awayId === teamId ? data.teams.away : null
      if (!teamData) continue

      const players = Object.values(teamData.players ?? {}) as RawBoxscorePlayer[]
      for (const player of players) {
        const pitching = player.stats?.pitching
        if (!pitching || (pitching.outs ?? 0) === 0) continue
        const id = player.person?.id
        if (!id) continue

        const existing = totals.get(id) ?? {
          playerId: id, name: player.person?.fullName ?? '—', gamesPitched: 0,
          outs: 0, earnedRuns: 0, strikeouts: 0, walks: 0, hits: 0, ip: '0.0',
        }
        existing.gamesPitched += 1
        existing.outs += pitching.outs ?? 0
        existing.earnedRuns += pitching.earnedRuns ?? 0
        existing.strikeouts += pitching.strikeOuts ?? 0
        existing.walks += pitching.baseOnBalls ?? 0
        existing.hits += pitching.hits ?? 0
        totals.set(id, existing)
      }
    } catch (err) {
      console.error('[series-stats] pitching boxscore fetch failed:', gamePk, err)
    }
  }

  const rows = Array.from(totals.values())
  for (const r of rows) r.ip = formatIpFromOuts(r.outs)
  return rows.sort((a, b) => b.outs - a.outs)
}

export async function getSeriesBattingStatsFromDB(tonightGamePk: number, teamId: number): Promise<SeriesBatterLine[]> {
  const supa = createAdminClient()
  const { data } = await supa
    .from('series_batting_stats')
    .select('batting_lines')
    .eq('tonight_game_pk', tonightGamePk)
    .eq('team_id', teamId)
    .single()

  return (data?.batting_lines as SeriesBatterLine[]) ?? []
}

// Team-level LOB, stolen bases, fielding, and role-split (starter vs
// bullpen) pitching totals for the series — all from the same boxscore
// endpoint, one pass per game. LOB/stolenBases come straight off
// teams.{side}.teamStats.batting; errors/assists/putOuts/chances off
// teams.{side}.teamStats.fielding (confirmed live, real non-zero values
// on both). Pitching is NOT read from teams.{side}.teamStats.pitching —
// that team-level rollup is unreliable for inheritedRunners/
// inheritedRunnersScored (checked a real game: it read 0/0 at the team
// level while individual pitchers on that same boxscore — e.g. a reliever
// entering mid-inning — had real non-zero values on their own
// player.stats.pitching). Summed from every pitcher's own line instead,
// split into starter vs bullpen using player.stats.pitching.gamesStarted
// (1 = that game's starter, 0 = reliever — confirmed live). Inherited
// runners are bullpen-only by definition (a starter begins an inning
// fresh, never mid at-bat), so that pair only appears on the bullpen split.
export type SeriesPitchingSplit = {
  outs: number
  ip: string
  era: string
  earnedRuns: number
  strikeouts: number
  walks: number
  hits: number
}

export type SeriesFieldingStats = {
  errors: number
  assists: number
  putOuts: number
  chances: number
  fieldingPct: string
}

export type SeriesTeamBoxscoreStats = {
  leftOnBase: number
  stolenBases: number
  gamesCounted: number
  fielding: SeriesFieldingStats
  startingPitching: SeriesPitchingSplit
  bullpen: SeriesPitchingSplit & { inheritedRunners: number; inheritedRunnersScored: number }
}

function emptyPitchingSplit(): SeriesPitchingSplit {
  return { outs: 0, ip: '0.0', era: '0.00', earnedRuns: 0, strikeouts: 0, walks: 0, hits: 0 }
}

function finalizePitchingSplit(s: SeriesPitchingSplit): void {
  s.ip = formatIpFromOuts(s.outs)
  s.era = s.outs > 0 ? ((s.earnedRuns * 27) / s.outs).toFixed(2) : '0.00'
}

export async function getSeriesTeamBoxscoreStats(gamePks: number[], teamId: number): Promise<SeriesTeamBoxscoreStats> {
  const totals: SeriesTeamBoxscoreStats = {
    leftOnBase: 0, stolenBases: 0, gamesCounted: 0,
    fielding: { errors: 0, assists: 0, putOuts: 0, chances: 0, fieldingPct: '1.000' },
    startingPitching: emptyPitchingSplit(),
    bullpen: { ...emptyPitchingSplit(), inheritedRunners: 0, inheritedRunnersScored: 0 },
  }

  await Promise.all(gamePks.map(async (gamePk) => {
    try {
      const res = await fetch(`${MLB_API}/game/${gamePk}/boxscore`, { next: { revalidate: 3600 } })
      if (!res.ok) return
      const data = await res.json()

      const homeId = data.teams?.home?.team?.id
      const awayId = data.teams?.away?.team?.id
      const teamData = homeId === teamId ? data.teams.home : awayId === teamId ? data.teams.away : null
      if (!teamData) return

      totals.leftOnBase += teamData.teamStats?.batting?.leftOnBase ?? 0
      totals.stolenBases += teamData.teamStats?.batting?.stolenBases ?? 0

      const f = teamData.teamStats?.fielding
      if (f) {
        totals.fielding.errors += f.errors ?? 0
        totals.fielding.assists += f.assists ?? 0
        totals.fielding.putOuts += f.putOuts ?? 0
        totals.fielding.chances += f.chances ?? 0
      }

      const players = Object.values(teamData.players ?? {}) as RawBoxscorePlayer[]
      for (const player of players) {
        const pit = player.stats?.pitching
        if (!pit || (pit.outs ?? 0) === 0) continue
        const split = pit.gamesStarted === 1 ? totals.startingPitching : totals.bullpen
        split.outs += pit.outs ?? 0
        split.earnedRuns += pit.earnedRuns ?? 0
        split.strikeouts += pit.strikeOuts ?? 0
        split.walks += pit.baseOnBalls ?? 0
        split.hits += pit.hits ?? 0
        if (pit.gamesStarted !== 1) {
          totals.bullpen.inheritedRunners += pit.inheritedRunners ?? 0
          totals.bullpen.inheritedRunnersScored += pit.inheritedRunnersScored ?? 0
        }
      }

      totals.gamesCounted += 1
    } catch (err) {
      console.error('[series-stats] boxscore team-stats fetch failed:', gamePk, err)
    }
  }))

  finalizePitchingSplit(totals.startingPitching)
  finalizePitchingSplit(totals.bullpen)
  const { assists, putOuts, chances } = totals.fielding
  totals.fielding.fieldingPct = chances > 0 ? ((assists + putOuts) / chances).toFixed(3).replace(/^0/, '') : '1.000'

  return totals
}

// Team batting average with runners in scoring position, for the series —
// derived from play-by-play, not a boxscore total (MLB doesn't expose team
// RISP as a single field). Each play in /winProbability carries
// matchup.splits.menOnBase, the same "RISP"/"Loaded"/"Men_On"/"Empty" tag
// MLB's own sitCodes splits are built from. That tag describes the bases
// AFTER the play (a single with a runner on 1st who moves to 2nd is tagged
// "RISP"), so the state a batter actually faced is the PREVIOUS play's tag
// within the same half-inning (empty at the start of a half). A play counts
// toward RISP AB/H when that starting tag is RISP or Loaded (bases loaded
// always has a runner on 2nd and 3rd too) and result.type is 'atBat'.
// Standard AB exclusions (walk, HBP, sac bunt/fly, catcher interference)
// are filtered out the same way a real batting average would.
export type SeriesRispStats = { ab: number; hits: number; avg: string }

const AB_EXCLUDED_EVENTS = new Set(['walk', 'intent_walk', 'hit_by_pitch', 'sac_fly', 'sac_bunt', 'sac_fly_double_play', 'catcher_interf', 'fan_interference'])
const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])
const RISP_STATES = new Set(['RISP', 'Loaded'])

type RawWinProbPlay = {
  about?: { inning?: number; isTopInning?: boolean }
  result?: { type?: string; eventType?: string }
  matchup?: { splits?: { menOnBase?: string } }
}

export async function getSeriesRispStats(
  gamePks: number[]
): Promise<{ away: SeriesRispStats; home: SeriesRispStats }> {
  let awayAb = 0, awayHits = 0, homeAb = 0, homeHits = 0

  await Promise.all(gamePks.map(async (gamePk) => {
    try {
      const res = await fetch(`${MLB_API}/game/${gamePk}/winProbability`, { next: { revalidate: 3600 } })
      if (!res.ok) return
      const plays: RawWinProbPlay[] = await res.json()

      let halfKey = ''
      let startState: string | undefined
      for (const p of plays) {
        const key = `${p.about?.inning}-${p.about?.isTopInning}`
        if (key !== halfKey) { halfKey = key; startState = undefined }
        const faced = startState
        startState = p.matchup?.splits?.menOnBase
        if (!faced || !RISP_STATES.has(faced)) continue
        if (p.result?.type !== 'atBat') continue
        const eventType = p.result?.eventType
        if (!eventType || AB_EXCLUDED_EVENTS.has(eventType)) continue

        const isHit = HIT_EVENTS.has(eventType)
        if (p.about?.isTopInning) { awayAb += 1; if (isHit) awayHits += 1 }
        else { homeAb += 1; if (isHit) homeHits += 1 }
      }
    } catch (err) {
      console.error('[series-stats] RISP winProbability fetch failed:', gamePk, err)
    }
  }))

  const fmt = (hits: number, ab: number): SeriesRispStats => ({ ab, hits, avg: ab > 0 ? (hits / ab).toFixed(3).replace(/^0/, '') : '—' })
  return { away: fmt(awayHits, awayAb), home: fmt(homeHits, homeAb) }
}