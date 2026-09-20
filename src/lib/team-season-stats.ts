// src/lib/team-season-stats.ts
//
// Standard team-level season stats (AVG/OBP/SLG/OPS/RBI/ERA/WHIP) and a
// team's real record at a specific venue — both straight from MLB's own
// `/teams/{id}/stats` and `/schedule` endpoints. Deliberately NOT the
// `team_stats` Supabase table (lib/edge.ts's fetchTeam / TEAM_CONTEXT_GROUPS
// in player-stats.ts) — that table is Statcast/advanced-metrics only
// (OPS is L30-rolling, no team ERA or RBI column at all, confirmed by
// reading its full field list in player-stats.ts before adding this).
// These are the classic box-score numbers instead.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type TeamSeasonStats = {
  // Free tier — shown to everyone.
  avg: string
  ops: string
  rbi: number
  homeRuns: number
  era: string
  whip: string
  // Pro tier — same call, just more fields off the same MLB response.
  // Card gates these behind isPro rather than this module doing it —
  // it's presentation, not data access.
  obp: string
  slg: string
  runs: number
  stolenBases: number
  strikeOuts: number
  walks: number
  pitcherStrikeOuts: number
  pitcherWalks: number
  wins: number
  losses: number
  saves: number
}

export async function getTeamSeasonStats(teamId: number, season: number): Promise<TeamSeasonStats | null> {
  try {
    const [hittingRes, pitchingRes] = await Promise.all([
      fetch(`${MLB_API}/teams/${teamId}/stats?stats=season&group=hitting&season=${season}&sportId=1`, { next: { revalidate: 3600 } }),
      fetch(`${MLB_API}/teams/${teamId}/stats?stats=season&group=pitching&season=${season}&sportId=1`, { next: { revalidate: 3600 } }),
    ])
    if (!hittingRes.ok || !pitchingRes.ok) return null
    const [hittingJson, pitchingJson] = await Promise.all([hittingRes.json(), pitchingRes.json()])
    const h = hittingJson.stats?.[0]?.splits?.[0]?.stat
    const p = pitchingJson.stats?.[0]?.splits?.[0]?.stat
    if (!h && !p) return null

    return {
      avg: h?.avg ?? '—',
      ops: h?.ops ?? '—',
      rbi: Number(h?.rbi ?? 0),
      homeRuns: Number(h?.homeRuns ?? 0),
      era: p?.era ?? '—',
      whip: p?.whip ?? '—',
      obp: h?.obp ?? '—',
      slg: h?.slg ?? '—',
      runs: Number(h?.runs ?? 0),
      stolenBases: Number(h?.stolenBases ?? 0),
      strikeOuts: Number(h?.strikeOuts ?? 0),
      walks: Number(h?.baseOnBalls ?? 0),
      pitcherStrikeOuts: Number(p?.strikeOuts ?? 0),
      pitcherWalks: Number(p?.baseOnBalls ?? 0),
      wins: Number(p?.wins ?? 0),
      losses: Number(p?.losses ?? 0),
      saves: Number(p?.saves ?? 0),
    }
  } catch (err) {
    console.error('getTeamSeasonStats failed:', err)
    return null
  }
}

export type TeamVenueRecord = { wins: number; losses: number; games: number }

// One team-schedule pull for the season (~150-ish games, small JSON — not
// a per-game fetch), filtered to games actually played at this venue.
// `isWinner` is already computed by MLB per side, so no score math needed.
export async function getTeamVenueRecord(teamId: number, season: number, venueName: string): Promise<TeamVenueRecord | null> {
  if (!venueName) return null
  try {
    const res = await fetch(`${MLB_API}/schedule?sportId=1&teamId=${teamId}&season=${season}&gameType=R`, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const json = await res.json()
    const needle = venueName.trim().toLowerCase()

    let wins = 0, losses = 0, games = 0
    for (const date of json.dates ?? []) {
      for (const g of date.games ?? []) {
        if (g.status?.abstractGameState !== 'Final') continue
        if ((g.venue?.name ?? '').trim().toLowerCase() !== needle) continue
        const side = g.teams?.home?.team?.id === teamId ? g.teams.home : g.teams?.away?.team?.id === teamId ? g.teams.away : null
        if (!side) continue
        games++
        if (side.isWinner) wins++; else losses++
      }
    }
    return games > 0 ? { wins, losses, games } : null
  } catch (err) {
    console.error('getTeamVenueRecord failed:', err)
    return null
  }
}
