// src/lib/active-sport.ts
//
// Single source of truth for "what sport is in season right now?"
// Used by the homepage, the Today tab redirect, and the daily email
// so the product always leads with whatever's actually being played.

export type Sport = 'mlb' | 'nfl' // add 'nba' | 'nhl' here when they ship

export type ActiveSport = {
  primary: Sport       // the one sport to LEAD with
  inSeason: Sport[]    // everything live right now, primary first
}

// --- Season windows -------------------------------------------------
// Each sport's "in season" window as [month, day] ranges (month is 1-12).
// Windows may wrap the new year (NFL runs Sep -> early Feb).
// Deliberately generous (include playoffs). Tune these freely.
type Window = { from: [number, number]; to: [number, number] }

const SEASON_WINDOWS: Record<Sport, Window> = {
  // Late March (Opening Day) through end of October (World Series)
  mlb: { from: [3, 20], to: [10, 31] },
  // Early September (Week 1) through mid-February (Super Bowl).
  // Move `from` to [8, 1] if you want the front door to flip for
  // NFL draft season in August instead of at the season opener.
  nfl: { from: [9, 1], to: [2, 15] },
}

// When two+ sports overlap (Sep–Oct = MLB playoffs + NFL), this order
// decides who LEADS. Earlier = higher priority. This is the knob you'll
// most likely flip seasonally. Set to ['mlb', 'nfl'] to keep MLB on top.
const LEAD_PRIORITY: Sport[] = ['nfl', 'mlb']

// --- Helpers --------------------------------------------------------
function isWithin(date: Date, w: Window): boolean {
  const md = (date.getMonth() + 1) * 100 + date.getDate() // e.g. 415 = Apr 15
  const from = w.from[0] * 100 + w.from[1]
  const to = w.to[0] * 100 + w.to[1]
  if (from <= to) return md >= from && md <= to        // normal window
  return md >= from || md <= to                        // wraps the year
}

/**
 * What's in season for a given date (defaults to now).
 * Returns the lead sport + every sport currently live, primary first.
 */
export function getActiveSport(date: Date = new Date()): ActiveSport {
  const live = (Object.keys(SEASON_WINDOWS) as Sport[]).filter((s) =>
    isWithin(date, SEASON_WINDOWS[s]),
  )

  // Dead window (e.g. late Feb): fall back to MLB — spring training next.
  if (live.length === 0) return { primary: 'mlb', inSeason: ['mlb'] }

  const ordered = LEAD_PRIORITY.filter((s) => live.includes(s))
  for (const s of live) if (!ordered.includes(s)) ordered.push(s) // safety net

  return { primary: ordered[0], inSeason: ordered }
}

// --- Email-specific lead -------------------------------------------
// The email can only lead with a sport that has a generation + send
// pipeline built. Today that's MLB only. When the NFL email pipeline
// ships, add 'nfl' here and the email switches automatically.
const SPORTS_WITH_EMAIL_PIPELINE: Sport[] = ['mlb']

export function getEmailLeadSport(date: Date = new Date()): Sport {
  const { inSeason } = getActiveSport(date)
  return inSeason.find((s) => SPORTS_WITH_EMAIL_PIPELINE.includes(s)) ?? 'mlb'
}

// --- Display helpers (handy for copy) ------------------------------
export const SPORT_LABELS: Record<Sport, string> = { mlb: 'MLB', nfl: 'NFL' }
export const SPORT_HUB_PATH: Record<Sport, string> = { mlb: '/mlb', nfl: '/nfl' }