// src/lib/team-desk-game.ts
//
// The team page's "Club Desk" reuses the Scout Report's per-club data
// libs (src/lib/scout/*), which are all keyed on (teamId, gameDate, gamePk,
// probable starter, opponent). This resolves that context for a club's NEXT
// game in a single MLB Stats API schedule call.
//
// Returns null when the club has no unplayed game in the next 14 days
// (season over / eliminated / off day stretch). Callers must show an empty
// state for opponent-dependent views in that case — nothing is invented.
//
// Field names below (dayNight, venue.id, teams.*.probablePitcher, status
// .abstractGameState) match the same schedule payload
// getScheduleForDate / getTeamUpcomingSchedule already parse in this repo.

import { teamSlug } from '@/lib/mlb'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type DeskGame = {
  gamePk: number
  gameDate: string            // YYYY-MM-DD, the game's local date
  /** Same slug format as slugifyGame() in lib/mlb.ts — /mlb/[slug] and /mlb/[slug]/scout-report */
  slug: string
  gameTime: string            // ISO start time
  isHome: boolean
  dayNight: 'day' | 'night' | null
  venueId: number | null
  venueName: string
  live: boolean
  team: { id: number; name: string; abbr: string; probableId: number | null; probableName: string | null }
  opp: { id: number; name: string; abbr: string; probableId: number | null; probableName: string | null }
}

type RawSide = {
  team?: { id?: number; name?: string; abbreviation?: string }
  probablePitcher?: { id?: number; fullName?: string }
}

function toSide(s: RawSide | undefined) {
  return {
    id: s?.team?.id ?? 0,
    name: s?.team?.name ?? '',
    abbr: s?.team?.abbreviation ?? (s?.team?.name ?? '').slice(0, 3).toUpperCase(),
    probableId: s?.probablePitcher?.id ?? null,
    probableName: s?.probablePitcher?.fullName ?? null,
  }
}

export async function getTeamDeskGame(teamId: number): Promise<DeskGame | null> {
  try {
    // ET calendar date, not UTC — a UTC date flips to "tomorrow" mid-evening
    // and would skip tonight's game.
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const end = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const url = `${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${today}&endDate=${end}&hydrate=team,probablePitcher,venue`
    const res = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) {
      console.error('[getTeamDeskGame] MLB schedule error:', res.status)
      return null
    }
    const json = await res.json()
    const games: any[] = (json.dates ?? []).flatMap((d: any) => d.games ?? [])
    const next = games.find(g => g.status?.abstractGameState !== 'Final')
    if (!next) return null

    const isHome = next.teams?.home?.team?.id === teamId
    const mine = toSide(isHome ? next.teams.home : next.teams.away)
    const theirs = toSide(isHome ? next.teams.away : next.teams.home)
    const gameDate: string = next.officialDate ?? String(next.gameDate).slice(0, 10)
    // Mirrors slugifyGame(): doubleheader game 2+ gets a -gameN suffix.
    const base = `${teamSlug(next.teams.away.team.name)}-vs-${teamSlug(next.teams.home.team.name)}-${gameDate}`
    const isDoubleheader = next.doubleHeader && next.doubleHeader !== 'N'
    const slug = isDoubleheader && (next.gameNumber ?? 1) > 1 ? `${base}-game${next.gameNumber}` : base
    return {
      gamePk: next.gamePk,
      gameDate,
      slug,
      gameTime: next.gameDate,
      isHome,
      dayNight: next.dayNight === 'day' || next.dayNight === 'night' ? next.dayNight : null,
      venueId: next.venue?.id ?? null,
      venueName: next.venue?.name ?? '',
      live: next.status?.abstractGameState === 'Live',
      team: mine,
      opp: theirs,
    }
  } catch (err) {
    console.error('[getTeamDeskGame]', err instanceof Error ? err.message : err)
    return null
  }
}
