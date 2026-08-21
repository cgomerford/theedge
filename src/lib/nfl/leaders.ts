// src/lib/nfl/leaders.ts
//
// Preseason "leaders" wiring. IMPORTANT SCOPE NOTE: ESPN's scoreboard
// endpoint exposes per-GAME leaders (the standout performer's box-score
// line for that single game), not cumulative season totals — confirmed
// via curl 2026-08-16 against:
//   https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=1
// Each competition.leaders[] has exactly 3 categories available:
// passingYards, rushingYards, receivingYards. No passingTouchdowns,
// quarterbackRating, receptions, sacks, or interceptions data exists
// at this endpoint — those would require fetching + summing full box
// scores (summary?event=<id>) per game, which hasn't been built yet.
//
// Because this is per-game (not cumulative), what's being built here is
// a ranked list of the best single-game performances across every
// preseason game played so far — NOT a true season leaderboard. Labeled
// accordingly in the UI ("Best Performances," not "Leaders") to avoid
// implying stats this data doesn't actually contain.

import { getNFLWeekSchedule } from '../nfl-schedule'

export type NFLLeaderEntry = {
  athleteId: string
  playerName: string
  displayValue: string
  value: number
  teamId: string
  headshotUrl: string | null   // NEW — direct from ESPN's athlete.headshot field, no extra lookup needed
}

export type NFLStatCategory = {
  leaders: NFLLeaderEntry[]
}

// Only categories confirmed present in the scoreboard leaders payload.
const AVAILABLE_CATEGORIES = ['passingYards', 'rushingYards', 'receivingYards'] as const

async function fetchWeekLeaders(season: number, week: number): Promise<any[]> {
  // Reuses getNFLWeekSchedule's fetch rather than duplicating it, but that
  // function returns parsed NFLGame objects without the raw leaders data —
  // so this hits the same endpoint directly to get at competition.leaders,
  // which getNFLWeekSchedule currently discards.
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=1&week=${week}&dates=${season}`,
      { next: { revalidate: 1800 } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.events ?? []
  } catch (e) {
    console.error(`fetchWeekLeaders(week ${week}) error:`, e)
    return []
  }
}

// Preseason currently runs 3 weeks (Hall of Fame Game + weeks 1-3) —
// scanning a fixed range rather than trying to detect "how many weeks
// have happened" dynamically, since an empty week just returns no
// events and costs one harmless extra fetch.
const PRESEASON_WEEKS_TO_SCAN = [1, 2, 3]

export async function fetchNFLHomepageLeaders(season: number): Promise<Record<string, NFLStatCategory>> {
  const weekResults = await Promise.all(
    PRESEASON_WEEKS_TO_SCAN.map(w => fetchWeekLeaders(season, w))
  )
  const allEvents = weekResults.flat()

  const byCategory: Record<string, NFLLeaderEntry[]> = {}
  for (const cat of AVAILABLE_CATEGORIES) byCategory[cat] = []

  for (const event of allEvents) {
    const comp = event.competitions?.[0]
    const leaders: any[] = comp?.leaders ?? []
    for (const catBlock of leaders) {
      const catName = catBlock.name
      if (!AVAILABLE_CATEGORIES.includes(catName)) continue
      for (const l of catBlock.leaders ?? []) {
        if (!l.athlete) continue
       byCategory[catName].push({
  athleteId: String(l.athlete.id ?? ''),
  playerName: l.athlete.displayName ?? l.athlete.fullName ?? 'Unknown',
  displayValue: l.displayValue ?? '',
  value: Number(l.value ?? 0),
  teamId: String(l.team?.id ?? l.athlete.team?.id ?? ''),
  headshotUrl: l.athlete.headshot ?? null,   // NEW
})
      }
    }
  }

  // Dedup by athlete (a player could appear as a game-leader more than
  // once across weeks) — keep their single best value.
  const result: Record<string, NFLStatCategory> = {}
  for (const cat of AVAILABLE_CATEGORIES) {
    const best = new Map<string, NFLLeaderEntry>()
    for (const entry of byCategory[cat]) {
      const existing = best.get(entry.athleteId)
      if (!existing || entry.value > existing.value) {
        best.set(entry.athleteId, entry)
      }
    }
    result[cat] = {
      leaders: Array.from(best.values()).sort((a, b) => b.value - a.value),
    }
  }

  return result
}