// src/lib/venue-schedule.ts
//
// Real venue (ballpark) per real MLB gamePk — bulk MLB schedule lookup
// (hydrate=venue), chunked to stay well under any URL-length limit.
// Shared by batter-venue-record.ts and pitcher-venue-record.ts so both
// labs' "record by ballpark" features join against the same real source
// instead of guessing a team's home park (which breaks on trades and
// neutral-site games — this doesn't).

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type VenueRef = { id: number; name: string }

// Real MLB debut year — the floor for a "career" ballpark-record pull
// (batter-venue-record.ts / pitcher-venue-record.ts), so a career query
// only fetches real seasons the player actually has games in instead of
// guessing a fixed lookback window.
export async function getDebutYear(playerId: number): Promise<number> {
  const currentYear = new Date().getFullYear()
  try {
    const res = await fetch(`${MLB_API}/people/${playerId}`, { next: { revalidate: 86400 } })
    if (!res.ok) return currentYear
    const json = await res.json()
    const debut = json.people?.[0]?.mlbDebutDate
    return debut ? Number(String(debut).slice(0, 4)) : currentYear
  } catch {
    return currentYear
  }
}

export async function getVenuesForGames(gamePks: number[]): Promise<Record<number, VenueRef>> {
  if (gamePks.length === 0) return {}
  const out: Record<number, VenueRef> = {}
  const chunks: number[][] = []
  for (let i = 0; i < gamePks.length; i += 40) chunks.push(gamePks.slice(i, i + 40))

  await Promise.all(chunks.map(async chunk => {
    try {
      const res = await fetch(`${MLB_API}/schedule?sportId=1&gamePks=${chunk.join(',')}&hydrate=venue`, { next: { revalidate: 86400 } })
      if (!res.ok) return
      const json = await res.json()
      for (const date of json.dates ?? []) {
        for (const g of date.games ?? []) {
          if (g.gamePk != null && g.venue?.id != null) out[g.gamePk] = { id: g.venue.id, name: g.venue.name ?? `Venue #${g.venue.id}` }
        }
      }
    } catch {
      // Leave this chunk's games unresolved — they fall into "unknown
      // venue" in the caller rather than failing the whole feature.
    }
  }))
  return out
}
