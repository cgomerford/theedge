/**
 * src/lib/fantasy-two-start.ts
 *
 * Finds pitchers scheduled to start twice in the upcoming 7-day window.
 * Critical for weekly H2H fantasy leagues — two starts ≈ double the points
 * potential, so identifying these is a key roster-management edge.
 */

import { createAdminClient } from '@/lib/supabase'

const MLB_SCHEDULE = 'https://statsapi.mlb.com/api/v1/schedule'

export type StartInfo = {
  date: string           // 'YYYY-MM-DD'
  displayDate: string    // 'Mon 2 Jun'
  gameTime: string       // '19:10 UK'
  opponent: string       // short name e.g. 'Royals'
  opponentFull: string   // full name e.g. 'Kansas City Royals'
  isHome: boolean
  oppWrcPlus: number | null
  oppRpgL30: number | null
  matchupScore: number   // 0-100 — higher = better matchup
}

export type TwoStartPitcher = {
  playerId: number
  playerName: string
  teamName: string         // short e.g. 'Mariners'
  era: number | null
  fip: number | null
  k9: number | null
  whip: number | null
  qualityScore: number     // 0-100, higher = better pitcher quality
  starts: StartInfo[]
  combinedScore: number    // weighted overall: quality × matchup difficulty
  tier: 'strong' | 'viable' | 'mixed' | 'avoid'
}

const LEAGUE_AVG_FIP = 4.20
const LEAGUE_AVG_K9 = 8.8

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clamp(v: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)) }
function shortName(team: string): string {
  const parts = (team ?? '').split(' ')
  return parts[parts.length - 1] || team
}

function formatUkTime(iso: string): string {
  try {
    const dt = new Date(iso)
    return dt.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
    })
  } catch { return '' }
}

function pitcherQualityScore(era: number | null, fip: number | null, k9: number | null): number {
  const anchor = fip ?? era ?? LEAGUE_AVG_FIP
  const eraScore = clamp(50 + ((LEAGUE_AVG_FIP - anchor) / LEAGUE_AVG_FIP) * 120)
  const k9Score = k9 != null
    ? clamp(50 + ((k9 - LEAGUE_AVG_K9) / LEAGUE_AVG_K9) * 80)
    : 50
  return Math.round(eraScore * 0.65 + k9Score * 0.35)
}

function matchupScore(wrcPlus: number | null, rpg: number | null): number {
  // Higher = easier matchup for pitcher
  if (wrcPlus != null) {
    return Math.round(clamp(50 + ((100 - wrcPlus) / 100) * 80))
  }
  if (rpg != null) {
    return Math.round(clamp(50 + ((4.5 - rpg) / 4.5) * 60))
  }
  return 50
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export async function getTwoStartPitchers(): Promise<TwoStartPitcher[]> {
  const supa = createAdminClient()

  // 1. Fetch 7-day schedule with probable pitchers
  const today = new Date()
  const endDate = new Date(today)
  endDate.setDate(endDate.getDate() + 6)

  const startStr = today.toISOString().split('T')[0]
  const endStr = endDate.toISOString().split('T')[0]

  let games: any[] = []
  try {
    const url = `${MLB_SCHEDULE}?sportId=1&startDate=${startStr}&endDate=${endStr}&hydrate=probablePitcher`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (res.ok) {
      const data = await res.json()
      for (const d of data.dates ?? []) {
        for (const g of d.games ?? []) {
          if (['S', 'P'].includes(g.status?.codedGameState)) {
            games.push(g)
          }
        }
      }
    }
  } catch (e) {
    console.error('two-start: schedule fetch failed', e)
    return []
  }

  // 2. Group starts by pitcher_id
  type RawStart = { game: any; isHome: boolean; pitcherId: number; pitcherName: string; pitcherTeam: string; oppTeam: string }
  const pitcherStarts = new Map<number, RawStart[]>()

  for (const game of games) {
    const homeP = game.teams?.home?.probablePitcher
    const awayP = game.teams?.away?.probablePitcher
    const homeName = game.teams?.home?.team?.name ?? ''
    const awayName = game.teams?.away?.team?.name ?? ''

    if (homeP?.id && homeP?.fullName) {
      const list = pitcherStarts.get(homeP.id) ?? []
      list.push({ game, isHome: true, pitcherId: homeP.id, pitcherName: homeP.fullName, pitcherTeam: homeName, oppTeam: awayName })
      pitcherStarts.set(homeP.id, list)
    }
    if (awayP?.id && awayP?.fullName) {
      const list = pitcherStarts.get(awayP.id) ?? []
      list.push({ game, isHome: false, pitcherId: awayP.id, pitcherName: awayP.fullName, pitcherTeam: awayName, oppTeam: homeName })
      pitcherStarts.set(awayP.id, list)
    }
  }

  // 3. Filter to pitchers with 2+ starts
  const twoStartIds: number[] = []
  for (const [pid, starts] of pitcherStarts.entries()) {
    if (starts.length >= 2) twoStartIds.push(pid)
  }
  if (twoStartIds.length === 0) return []

  // 4. Pull pitcher stats in bulk
  const { data: pitcherStatsRows } = await supa
    .from('pitcher_stats')
    .select('player_id, era, fip, k_per_9, whip')
    .in('player_id', twoStartIds)
  const pitcherStatsMap = new Map<number, any>()
  for (const row of pitcherStatsRows ?? []) {
    pitcherStatsMap.set(row.player_id, row)
  }

  // 5. Pull team stats for all opponents seen
  const oppTeamNames = new Set<string>()
  for (const pid of twoStartIds) {
    for (const s of pitcherStarts.get(pid)!) {
      oppTeamNames.add(s.oppTeam)
    }
  }
  const { data: teamStatsRows } = await supa
    .from('team_stats')
    .select('team_name, wrc_plus, runs_per_game_l30')
    .in('team_name', Array.from(oppTeamNames))
  const teamStatsMap = new Map<string, any>()
  for (const row of teamStatsRows ?? []) {
    teamStatsMap.set(row.team_name, row)
  }

  // 6. Build the output
  const result: TwoStartPitcher[] = []

  for (const pid of twoStartIds) {
    const rawStarts = pitcherStarts.get(pid)!
    rawStarts.sort((a, b) => new Date(a.game.gameDate).getTime() - new Date(b.game.gameDate).getTime())

    const pStats = pitcherStatsMap.get(pid) ?? {}
    const era = pStats.era != null ? Number(pStats.era) : null
    const fip = pStats.fip != null ? Number(pStats.fip) : null
    const k9  = pStats.k_per_9 != null ? Number(pStats.k_per_9) : null
    const whip = pStats.whip != null ? Number(pStats.whip) : null
    const qualityScore = pitcherQualityScore(era, fip, k9)

    const starts: StartInfo[] = rawStarts.map(s => {
      const oppStats = teamStatsMap.get(s.oppTeam) ?? {}
      const wrc = oppStats.wrc_plus != null ? Number(oppStats.wrc_plus) : null
      const rpg = oppStats.runs_per_game_l30 != null ? Number(oppStats.runs_per_game_l30) : null
      const dt = new Date(s.game.gameDate)
      return {
        date: dt.toISOString().split('T')[0],
        displayDate: dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
        gameTime: formatUkTime(s.game.gameDate),
        opponent: shortName(s.oppTeam),
        opponentFull: s.oppTeam,
        isHome: s.isHome,
        oppWrcPlus: wrc,
        oppRpgL30: rpg,
        matchupScore: matchupScore(wrc, rpg),
      }
    })

    // Combined score: 60% pitcher quality, 40% avg matchup
    const avgMatchup = starts.reduce((sum, s) => sum + s.matchupScore, 0) / starts.length
    const combinedScore = Math.round(qualityScore * 0.60 + avgMatchup * 0.40)

    // Tier logic:
    //  strong  → quality ≥ 65 AND both starts have matchup ≥ 55
    //  viable  → combined ≥ 60
    //  mixed   → quality ≥ 60 but one start is brutal (matchup < 40)
    //  avoid   → combined < 50
    const allMatchupsDecent = starts.every(s => s.matchupScore >= 55)
    const anyBrutalMatchup = starts.some(s => s.matchupScore < 40)

    let tier: TwoStartPitcher['tier']
    if (qualityScore >= 65 && allMatchupsDecent) tier = 'strong'
    else if (qualityScore >= 60 && anyBrutalMatchup) tier = 'mixed'
    else if (combinedScore >= 60) tier = 'viable'
    else tier = 'avoid'

    result.push({
      playerId: pid,
      playerName: rawStarts[0].pitcherName,
      teamName: shortName(rawStarts[0].pitcherTeam),
      era, fip, k9, whip,
      qualityScore,
      starts,
      combinedScore,
      tier,
    })
  }

  // Sort: strong → viable → mixed → avoid, then by combined score
  const tierRank: Record<string, number> = { strong: 0, viable: 1, mixed: 2, avoid: 3 }
  result.sort((a, b) => {
    if (tierRank[a.tier] !== tierRank[b.tier]) return tierRank[a.tier] - tierRank[b.tier]
    return b.combinedScore - a.combinedScore
  })

  return result
}