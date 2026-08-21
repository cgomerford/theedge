// src/lib/nfl/game-id-resolver.ts
//
// Resolves a real ESPN numeric event ID for ANY game (past or current),
// given the game's date and the two teams involved. Replaces the
// KNOWN_EVENT_IDS hardcoded map in scout-report.ts, which only worked
// for one manually-added game.
//
// Curl-verified 2026-08-16 against a real date:
//   https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20260814
// Returned all 3 real games played that day with correct event IDs —
// confirms this endpoint accepts an explicit date and isn't restricted
// to "current week" the way the undated /scoreboard call is.

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'

// NFLGame.date is ISO (e.g. "2026-08-15T00:00:00Z"); this endpoint wants
// YYYYMMDD with no separators.
function toEspnDateParam(isoDate: string): string {
  const d = new Date(isoDate)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export async function resolveEventId(
  isoDate: string,
  homeTeamAbbr: string,
  awayTeamAbbr: string
): Promise<string | null> {
  const dateParam = toEspnDateParam(isoDate)
  try {
    const res = await fetch(`${ESPN}/scoreboard?dates=${dateParam}`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const data = await res.json()
    const events: any[] = data.events ?? []

    for (const event of events) {
      const competitors: any[] = event.competitions?.[0]?.competitors ?? []
      const abbrs = competitors.map(c => c.team?.abbreviation)
      if (abbrs.includes(homeTeamAbbr) && abbrs.includes(awayTeamAbbr)) {
        return event.id ?? null
      }
    }
    return null
  } catch (e) {
    console.error('resolveEventId error:', e)
    return null
  }
}