// src/lib/team-rotation.ts
//
// HONESTY FLAG: still an inference, not confirmed MLB data, for any game
// beyond the next real confirmed start. MLB's probablePitcher field is
// only populated once a start is actually announced (usually 3–5 days
// out) — for games further out, this projects the rotation forward.
//
// FIXED: previously returned a single predicted name applied to every
// future unconfirmed game (visibly wrong — showed the same pitcher for
// two different dates). Now returns a full projected SEQUENCE: pulls the
// last 5 actual starters in chronological order, then cycles through that
// same 5-man order for however many upcoming games need a prediction —
// game N+1 gets the pitcher who started 5 games ago, N+2 gets the one who
// started 4 games ago, etc. Breaks on rotation skips, injuries,
// doubleheaders, or a staff not running exactly 5 starters — must always
// be labeled a prediction in the UI.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type RotationPrediction = { personId: number; name: string }

export async function getRecentStarters(mlbTeamId: number, lookbackDays = 20) {
  try {
    const end = new Date().toISOString().split('T')[0]
    const start = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const url = `${MLB_API}/schedule?sportId=1&teamId=${mlbTeamId}&startDate=${start}&endDate=${end}&hydrate=probablePitcher&gameType=R`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const json = await res.json()
    const games = (json.dates ?? []).flatMap((d: any) => d.games ?? [])

    const starters: { date: string; personId: number; name: string }[] = []
    for (const g of games) {
      const isHome = g.teams?.home?.team?.id === mlbTeamId
      const mySide = isHome ? g.teams.home : g.teams.away
      const pp = mySide?.probablePitcher
      if (pp?.id && pp?.fullName) {
        starters.push({ date: g.officialDate ?? g.gameDate?.split('T')[0] ?? '', personId: pp.id, name: pp.fullName })
      }
    }
    starters.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    return starters
  } catch (e) {
    console.error('getRecentStarters error:', e)
    return []
  }
}

// Cycles through the last 5 real starters (oldest first) as the projected
// order for the next `count` unconfirmed games. Oldest-of-last-5 is "due"
// first, since a clean 5-man rotation returns to the same slot every 5th
// game.
export function projectRotation(
  recentStarters: { date: string; personId: number; name: string }[], count: number
): RotationPrediction[] {
  if (recentStarters.length < 5) return []
  const last5 = recentStarters.slice(-5) // oldest → newest of the last 5
  const sequence: RotationPrediction[] = []
  for (let i = 0; i < count; i++) {
    const starter = last5[i % 5]
    sequence.push({ personId: starter.personId, name: starter.name })
  }
  return sequence
}