// Allowed render-path fetch (see scripts/checks/guard.sh check 5): one small cached lookup per player id, only to title the lab pages and 404 unknown ids.
// Name lookup for page titles and 404s on player routes (labs). One small MLB Stats API call, cached for a day.
// Returns null when the id is not a real player, so callers can notFound().

export type MlbPerson = { id: number; fullName: string; isPitcher: boolean }

export async function getMlbPerson(id: number): Promise<MlbPerson | null> {
  if (!Number.isInteger(id) || id <= 0) return null
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/people/${id}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) })
    if (res.status === 404) return null
    if (!res.ok) {
      console.error('[getMlbPerson] MLB API status', res.status, 'for', id)
      return null
    }
    const json = (await res.json()) as { people?: { id: number; fullName: string; primaryPosition?: { code?: string } }[] }
    const p = json.people?.[0]
    if (!p) return null
    return { id: p.id, fullName: p.fullName, isPitcher: p.primaryPosition?.code === '1' }
  } catch (e) {
    console.error('[getMlbPerson] fetch failed:', e instanceof Error ? e.message : e)
    return null
  }
}
