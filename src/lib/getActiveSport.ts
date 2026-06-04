// ──────────────────────────────────────────────────────────────────────
// src/lib/active-sport.ts
//
// Returns which sport should lead the UI right now.
// Used by: homepage redirect, the "Today" tab, the daily email,
// and anywhere that needs to pick one sport to show first.
//
// The logic is date-based, not dynamic. It answers:
// "If a user opens The Edge today, what sport do they care about?"
//
// MLB season: ~late March – early October
// NFL season: ~early September – early February
// Overlap (Sept–Oct): NFL leads (acquisition spike), MLB secondary
// Off-season (Feb–Mar): MLB leads (spring training ramp)
// ──────────────────────────────────────────────────────────────────────

export type Sport = 'mlb' | 'nfl'

export function getActiveSport(): Sport {
  const month = new Date().getMonth() + 1 // 1–12

  // NFL is primary Sept–Feb (the acquisition spike + season + playoffs)
  if (month >= 9 || month <= 2) return 'nfl'

  // MLB is primary Mar–Aug (spring training through regular season)
  return 'mlb'
}

/**
 * Returns true if the given sport has live or upcoming games right now.
 * Useful for deciding whether to show a sport tab as "active" vs "coming soon."
 *
 * MLB: roughly April 1 – October 31 (regular + postseason)
 * NFL: roughly August 6 – February 14 (preseason through Super Bowl)
 */
export function isInSeason(sport: Sport): boolean {
  const month = new Date().getMonth() + 1

  if (sport === 'mlb') {
    return month >= 3 && month <= 10 // March (spring training) – October (postseason)
  }

  if (sport === 'nfl') {
    return month >= 8 || month <= 2 // August (preseason) – February (Super Bowl)
  }

  return false
}
