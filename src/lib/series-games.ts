// src/lib/series-games.ts
const MLB_API = 'https://statsapi.mlb.com/api/v1'
import { createAdminClient } from '@/lib/supabase'

export type SeriesGameResult = {
  gamePk: number
  gameNumber: number
  officialDate: string
  awayAbbr: string
  homeAbbr: string
  awayScore: number | null
  homeScore: number | null
  isFinal: boolean
  isTonight: boolean
}

export async function getSeriesGames(
  homeTeamId: number,
  awayTeamId: number,
  todayDate: string,
  tonightGamePk: number,
): Promise<SeriesGameResult[]> {
  try {
    const from = offsetDate(todayDate, -8)
    const to   = offsetDate(todayDate, 8)

    // Fetch for BOTH teams separately — API only returns games for the queried team
    const [homeData, awayData] = await Promise.all([
      fetch(`${MLB_API}/schedule?sportId=1&startDate=${from}&endDate=${to}&hydrate=team,linescore,seriesStatus&teamId=${homeTeamId}`, { next: { revalidate: 60 } }).then(r => r.json()),
      fetch(`${MLB_API}/schedule?sportId=1&startDate=${from}&endDate=${to}&hydrate=team,linescore,seriesStatus&teamId=${awayTeamId}`, { next: { revalidate: 60 } }).then(r => r.json()),
    ])

    // Collect all games from both responses, dedupe by gamePk
    const seen = new Set<number>()
    const allGames: any[] = []

    for (const data of [homeData, awayData]) {
      for (const dateBlock of data.dates ?? []) {
        for (const g of dateBlock.games ?? []) {
          if (seen.has(g.gamePk)) continue
          const ht: number = g.teams?.home?.team?.id
          const at: number = g.teams?.away?.team?.id
          // Only games between these two specific teams
          if (
            (ht === homeTeamId && at === awayTeamId) ||
            (ht === awayTeamId && at === homeTeamId)
          ) {
            seen.add(g.gamePk)
            allGames.push(g)
          }
        }
      }
    }

    console.log('[series-games] found', allGames.length, 'games between teams', homeTeamId, awayTeamId)
    console.log('[series-games] gamePks:', allGames.map(g => g.gamePk))

    if (allGames.length === 0) return []

    // Sort ascending
    allGames.sort((a, b) => {
      const da = a.officialDate ?? ''
      const db = b.officialDate ?? ''
      if (da !== db) return da.localeCompare(db)
      return (a.gamePk ?? 0) - (b.gamePk ?? 0)
    })

    // Find tonight's game
    const tonightIdx = allGames.findIndex(g => g.gamePk === tonightGamePk)
    console.log('[series-games] tonightIdx:', tonightIdx, 'for gamePk:', tonightGamePk)

    if (tonightIdx === -1) {
      // tonightGamePk not found — just return all games sorted, mark none as tonight
      // This handles the case where tonight's game isn't in the series window yet
      return allGames.map((g, i) => buildResult(g, i + 1, tonightGamePk, awayTeamId))
    }
const tonightRaw = allGames[tonightIdx]
    // Was `?? 3` — a dangerous fallback since 3 is ALSO a real, common series
    // length, so a missing seriesStatus.totalGames field silently truncated
    // every 4+ game series to 3 with no error, no wrong-looking output.
    // Confirmed 2026-07-13: this is why a real 5-game series only ever
    // showed 3 games, everywhere from SeriesTrajectory's "Best of 3" label
    // to the pitch-hover date window being 3 days short.
    //
    // Real fix: when the API doesn't say the series length, don't guess a
    // number — use a CONSECUTIVE run of games between these two teams
    // around tonight's game instead. A break of 2+ days between games
    // against this opponent means a new series (accounts for a team
    // playing someone else in between, or an off-day boundary).
    const seriesTotal: number | null = tonightRaw.seriesStatus?.totalGames ?? null
    const tonightGameNum: number | null = tonightRaw.seriesStatus?.gameNumber ?? null

    console.log('[series-games] seriesTotal (from API):', seriesTotal, 'tonightGameNum:', tonightGameNum)

    let seriesSlice: any[]
    if (seriesTotal !== null && tonightGameNum !== null) {
      const seriesStart = Math.max(0, tonightIdx - (tonightGameNum - 1))
      seriesSlice = allGames.slice(seriesStart, seriesStart + seriesTotal)
    } else {
      // Walk outward from tonight's game while consecutive dates keep
      // matching this same pair of teams — no guessed length involved.
      let start = tonightIdx
      while (start > 0 && daysBetween(allGames[start - 1].officialDate, allGames[start].officialDate) <= 2) start--
      let end = tonightIdx
      while (end < allGames.length - 1 && daysBetween(allGames[end].officialDate, allGames[end + 1].officialDate) <= 2) end++
  seriesSlice = allGames.slice(start, end + 1)
      console.log('[series-games] no seriesStatus — inferred', seriesSlice.length, 'games via consecutive-date walk')
    }

    return seriesSlice.map((g, i) => buildResult(g, i + 1, tonightGamePk, awayTeamId))
  } catch (err) {
    console.error('[getSeriesGames]', err)
    return []
  }
}

function buildResult(g: any, gameNumber: number, tonightGamePk: number, awayTeamId: number): SeriesGameResult {
  const isFinal = g.status?.abstractGameState === 'Final'
  const rawAwayId: number = g.teams?.away?.team?.id
  const rawAwayAbbr: string = g.teams?.away?.team?.abbreviation ?? 'AWY'
  const rawHomeAbbr: string = g.teams?.home?.team?.abbreviation ?? 'HME'
  const rawAwayScore: number | null = isFinal ? (g.teams?.away?.score ?? null) : null
  const rawHomeScore: number | null = isFinal ? (g.teams?.home?.score ?? null) : null

  // Normalise so tonight's awayTeamId is always the top row
  const needsFlip = rawAwayId !== awayTeamId

  return {
    gamePk: g.gamePk,
    gameNumber,
    officialDate: g.officialDate ?? '',
    awayAbbr: needsFlip ? rawHomeAbbr : rawAwayAbbr,
    homeAbbr: needsFlip ? rawAwayAbbr : rawHomeAbbr,
    awayScore: needsFlip ? rawHomeScore : rawAwayScore,
    homeScore: needsFlip ? rawAwayScore : rawHomeScore,
    isFinal,
    isTonight: g.gamePk === tonightGamePk,
  }
}

function offsetDate(base: string, days: number): string {
  const d = new Date(base + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T12:00:00Z').getTime()
  const db = new Date(b + 'T12:00:00Z').getTime()
  return Math.abs(db - da) / (1000 * 60 * 60 * 24)
}


export async function getSeriesGamesFromDB(tonightGamePk: number): Promise<SeriesGameResult[]> {
  const supa = createAdminClient()
  const { data } = await supa
    .from('series_games_cache')
    .select('series_games')
    .eq('tonight_game_pk', tonightGamePk)
    .single()

  return (data?.series_games as SeriesGameResult[]) ?? []
}