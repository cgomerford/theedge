// src/lib/game-boxscore.ts
// Fetches full box score for a completed MLB game from the free MLB Stats API.
// Endpoint: https://statsapi.mlb.com/api/v1/game/{gamePk}/boxscore

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type BoxScoreBatter = {
  name: string
  position: string
  battingOrder: number    // 100, 200 ... 900 (MLB API format)
  ab: number
  r: number
  h: number
  rbi: number
  hr: number
  bb: number
  k: number
  avg: string | null
  obp: string | null
  ops: string | null
  note?: string           // pinch hit, etc
}

export type BoxScorePitcher = {
  name: string
  ip: string
  h: number
  r: number
  er: number
  bb: number
  k: number
  hr: number
  era: string | null
  isWinner: boolean
  isLoser: boolean
  isSave: boolean
}

export type BoxScoreTeam = {
  teamName: string
  abbr: string
  score: number
  hits: number
  errors: number
  batters: BoxScoreBatter[]
  pitchers: BoxScorePitcher[]
}

export type GameBoxScore = {
  gamePk: number
  isFinal: boolean
  away: BoxScoreTeam
  home: BoxScoreTeam
  decisions?: {
    winner?: string
    loser?: string
    save?: string
  }
}

export async function getGameBoxScore(gamePk: number): Promise<GameBoxScore | null> {
  try {
    const url = `${MLB_API}/game/${gamePk}/boxscore`
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) return null
    const data = await res.json()

    const away = parseTeam(data.teams?.away)
    const home = parseTeam(data.teams?.home)
    if (!away || !home) return null

    // Win/loss/save decisions
    const decisions = data.info
      ? undefined
      : undefined // decisions come from the feed endpoint — skip for now

    return {
      gamePk,
      isFinal: true,
      away,
      home,
    }
  } catch (err) {
    console.error('[getGameBoxScore]', gamePk, err)
    return null
  }
}

function parseTeam(raw: any): BoxScoreTeam | null {
  if (!raw) return null

  const teamName: string = raw.team?.name ?? ''
  const abbr: string = raw.team?.abbreviation ?? ''
  const score: number = raw.teamStats?.batting?.runs ?? 0
  const hits: number = raw.teamStats?.batting?.hits ?? 0
  const errors: number = raw.teamStats?.fielding?.errors ?? 0

  // Batters — filter out non-batters (pitchers in NL lineups etc)
  const battersRaw: any[] = Object.values(raw.players ?? {})
  const batters: BoxScoreBatter[] = battersRaw
    .filter(p => p.battingOrder && parseInt(p.battingOrder) > 0)
    .sort((a, b) => parseInt(a.battingOrder) - parseInt(b.battingOrder))
    .map(p => {
      const s = p.stats?.batting ?? {}
      const season = p.seasonStats?.batting ?? {}
      return {
        name: formatName(p.person?.fullName ?? ''),
        position: p.position?.abbreviation ?? '—',
        battingOrder: parseInt(p.battingOrder),
        ab:  s.atBats           ?? 0,
        r:   s.runs             ?? 0,
        h:   s.hits             ?? 0,
        rbi: s.rbi              ?? 0,
        hr:  s.homeRuns         ?? 0,
        bb:  s.baseOnBalls      ?? 0,
        k:   s.strikeOuts       ?? 0,
        avg: season.avg         ?? null,
        obp: season.obp         ?? null,
        ops: season.ops         ?? null,
        note: p.gameStatus?.isSubstitute ? 'PH' : undefined,
      }
    })

  // Pitchers — in pitching order
  const pitchersRaw: any[] = raw.pitchers ?? []
  const pitchers: BoxScorePitcher[] = pitchersRaw
    .map((id: number) => {
      const p = raw.players?.[`ID${id}`]
      if (!p) return null
      const s = p.stats?.pitching ?? {}
      const season = p.seasonStats?.pitching ?? {}
      return {
        name: formatName(p.person?.fullName ?? ''),
        ip:   s.inningsPitched  ?? '0.0',
        h:    s.hits            ?? 0,
        r:    s.runs            ?? 0,
        er:   s.earnedRuns      ?? 0,
        bb:   s.baseOnBalls     ?? 0,
        k:    s.strikeOuts      ?? 0,
        hr:   s.homeRuns        ?? 0,
        era:  season.era        ?? null,
        isWinner: false,
        isLoser: false,
        isSave: false,
      } satisfies BoxScorePitcher
    })
    .filter(Boolean) as BoxScorePitcher[]

  return { teamName, abbr, score, hits, errors, batters, pitchers }
}

// "José Rodríguez" → "J. Rodríguez"
function formatName(full: string): string {
  const parts = full.trim().split(' ')
  if (parts.length < 2) return full
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`
}
