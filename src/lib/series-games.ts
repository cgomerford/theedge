// src/lib/series-games.ts
const MLB_API = 'https://statsapi.mlb.com/api/v1'

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
    const seriesTotal: number = tonightRaw.seriesStatus?.totalGames ?? 3
    const tonightGameNum: number = tonightRaw.seriesStatus?.gameNumber ?? 1

    console.log('[series-games] seriesTotal:', seriesTotal, 'tonightGameNum:', tonightGameNum)

    // Slice just this series
    const seriesStart = Math.max(0, tonightIdx - (tonightGameNum - 1))
    const seriesSlice = allGames.slice(seriesStart, seriesStart + seriesTotal)

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
