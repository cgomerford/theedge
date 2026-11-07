import 'server-only'
// src/lib/pitch-shape/profile.ts
//
// How established a pitcher is, for the Pitch Shape Lab's "Find me a pitcher": All-Star, Cy Young, MVP and All-MLB selections and his MLB debut year, from the free MLB Stats API
// (people?hydrate=awards, fields checked against a live response: awards[].id such as NLAS, ALAS, NLCY, ALCY, MLBAFIRST; mlbDebutDate). Batched 50 ids a call and cached 24 hours.
// null on any failure (logged), and the finder then screens on workload alone and says the award history was not available.

import { log } from '@/lib/log'

export type Profile = { allStars: number; /** a Cy Young, MVP or All-MLB selection */ major: boolean; debutYear: number | null }
const ALL_STAR = new Set(['NLAS', 'ALAS', 'MLBASG'])
const MAJOR = new Set(['NLCY', 'ALCY', 'NLMVP', 'ALMVP', 'MLBAFIRST', 'MLBSECOND'])
const TTL_MS = 24 * 60 * 60 * 1000
const cache = new Map<number, { at: number; p: Profile }>()

type Person = { id: number; mlbDebutDate?: string; awards?: { id?: string }[] }

export async function getProfiles(ids: number[]): Promise<Map<number, Profile> | null> {
  const out = new Map<number, Profile>()
  const need: number[] = []
  for (const id of ids) {
    const hit = cache.get(id)
    if (hit && Date.now() - hit.at <= TTL_MS) out.set(id, hit.p); else need.push(id)
  }
  try {
    for (let i = 0; i < need.length; i += 50) {
      const batch = need.slice(i, i + 50)
      const res = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${batch.join(',')}&hydrate=awards`, { next: { revalidate: 86400 } })
      if (!res.ok) { log.error('getProfiles', 'MLB Stats API HTTP', res.status); return null }
      for (const p of ((await res.json()) as { people?: Person[] }).people ?? []) {
        const aw = p.awards ?? []
        const profile: Profile = {
          allStars: aw.filter(a => a.id && ALL_STAR.has(a.id)).length,
          major: aw.some(a => a.id && MAJOR.has(a.id)),
          debutYear: p.mlbDebutDate ? Number(p.mlbDebutDate.slice(0, 4)) : null,
        }
        cache.set(p.id, { at: Date.now(), p: profile }); out.set(p.id, profile)
      }
    }
  } catch (e) {
    log.error('getProfiles', 'failed', e instanceof Error ? e.message : e)
    return null
  }
  return out
}
