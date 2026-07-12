// src/lib/team-composition.ts
//
// Real roster composition data — age distribution and nationality mix.
//
// BUG FIX #2: the previous person-ID dedupe didn't fix the ">40 on the
// 40-man" bug, which means the extra entries are genuinely distinct
// players, not duplicates. Root cause: MLB's rosterType=40Man endpoint
// includes players on the 60-day injured list even though a 60-day IL
// placement is specifically what OPENS UP a 40-man spot in real life —
// those players don't actually occupy one anymore. Filtering out any
// roster entry whose status code indicates 60-day IL fixes the count.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type CompositionSlice = { label: string; count: number; color: string }

export type TeamComposition = {
  ageGroups: CompositionSlice[]
  nationality: CompositionSlice[]
  rosterSize: number
}

const AGE_COLORS = ['#7F77DD', '#378ADD', '#5DCAA5', '#EF9F27']
const NATION_COLORS = ['#378ADD', '#F0997B', '#5DCAA5', '#D4537E', '#7F77DD', '#EF9F27']

// MLB status codes for 60-day IL — filtering these out is what actually
// gets the count back to ≤40, since dedupe-by-ID alone didn't.
const SIXTY_DAY_IL_CODES = new Set(['D60', 'DL60'])

export function ageFromBirthDate(birthDate: string): number {
  const birth = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}

function bucketAge(age: number): string {
  if (age < 25) return 'Under 25'
  if (age < 29) return '25–28'
  if (age < 33) return '29–32'
  return '33+'
}

export async function getTeamComposition(mlbTeamId: number): Promise<TeamComposition | null> {
  try {
    const rosterRes = await fetch(`${MLB_API}/teams/${mlbTeamId}/roster?rosterType=40Man`, { next: { revalidate: 3600 } })
    if (!rosterRes.ok) return null
    const rosterJson = await rosterRes.json()

    const rosterEntries: any[] = rosterJson.roster ?? []

    // Exclude 60-day IL — those spots are open, the player isn't really
    // "on the 40-man" for display purposes even though this endpoint
    // still lists them.
    const eligible = rosterEntries.filter(r => !SIXTY_DAY_IL_CODES.has(r.status?.code ?? ''))

    const rawIds: number[] = eligible.map((r: any) => r.person?.id).filter(Boolean)
    const personIds = Array.from(new Set(rawIds)) // still dedupe, belt and suspenders
    if (personIds.length === 0) return null

    const peopleRes = await fetch(`${MLB_API}/people?personIds=${personIds.join(',')}`, { next: { revalidate: 3600 } })
    if (!peopleRes.ok) return null
    const peopleJson = await peopleRes.json()

    const seen = new Set<number>()
    const people: any[] = (peopleJson.people ?? []).filter((p: any) => {
      if (!p.id || seen.has(p.id)) return false
      seen.add(p.id)
      return true
    })

    const ageCounts: Record<string, number> = { 'Under 25': 0, '25–28': 0, '29–32': 0, '33+': 0 }
    const nationCounts: Record<string, number> = {}

    for (const p of people) {
      if (p.birthDate) {
        const bucket = bucketAge(ageFromBirthDate(p.birthDate))
        ageCounts[bucket] = (ageCounts[bucket] ?? 0) + 1
      }
      const country = p.birthCountry ?? 'Unknown'
      nationCounts[country] = (nationCounts[country] ?? 0) + 1
    }

    const ageGroups: CompositionSlice[] = Object.entries(ageCounts)
      .filter(([, count]) => count > 0)
      .map(([label, count], i) => ({ label, count, color: AGE_COLORS[i % AGE_COLORS.length] }))

    const sortedNations = Object.entries(nationCounts).sort((a, b) => b[1] - a[1])
    const top = sortedNations.slice(0, 4)
    const otherCount = sortedNations.slice(4).reduce((sum, [, c]) => sum + c, 0)
    const nationality: CompositionSlice[] = top.map(([label, count], i) => ({
      label, count, color: NATION_COLORS[i % NATION_COLORS.length],
    }))
    if (otherCount > 0) nationality.push({ label: 'Other', count: otherCount, color: NATION_COLORS[4] })

    return { ageGroups, nationality, rosterSize: people.length }
  } catch (e) {
    console.error('getTeamComposition error:', e)
    return null
  }
}