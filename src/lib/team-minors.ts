// src/lib/team-minors.ts
//
// Real minor-league affiliate data — NOT prospect rankings. FV grades and
// org rank (the RosterResource screenshot columns) are FanGraphs/Baseball
// America/MLB Pipeline editorial products with no free API. What's shown
// here instead: top-5 statistical leaders per affiliate across OPS/HR/ERA/K,
// plus a "young performers" cut (age ≤23, ranked by real results) — both
// verifiable facts, not a scouting opinion dressed up as one.
//
// Minor-league team logo URL follows the same mlbstatic.com/team-logos/{id}
// pattern used for MLB clubs elsewhere in this codebase — UNVERIFIED for
// affiliate IDs specifically. The <img> using it has an onError fallback
// that hides a broken image rather than showing a blank-box icon.

import { ageFromBirthDate } from './team-composition'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

const AFFILIATE_LEVELS = [{ sportId: 11, label: 'AAA' }, { sportId: 12, label: 'AA' }]

export type MinorLeader = { name: string; personId: number; value: string; age?: number }

export type AffiliateStandout = {
  affiliateName: string
  affiliateId: number
  level: string
  logoUrl: string
  topOPS: MinorLeader[]
  topHR: MinorLeader[]
  topERA: MinorLeader[]
  topK: MinorLeader[]
  youngPerformers: MinorLeader[]
}

function teamLogoUrl(teamId: number): string {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`
}

async function findAffiliate(mlbTeamId: number, sportId: number, season: number): Promise<{ id: number; name: string } | null> {
  try {
    const res = await fetch(`${MLB_API}/teams?sportId=${sportId}&season=${season}`, { next: { revalidate: 86400 } })
    if (!res.ok) return null
    const json = await res.json()
    const team = (json.teams ?? []).find((t: any) => t.parentOrgId === mlbTeamId)
    return team ? { id: team.id, name: team.name } : null
  } catch {
    return null
  }
}

async function fetchAffiliateRosterWithStats(affiliateId: number, season: number, sportId: number): Promise<any[]> {
  const rosterRes = await fetch(`${MLB_API}/teams/${affiliateId}/roster?rosterType=active`, { next: { revalidate: 3600 } })
  if (!rosterRes.ok) return []
  const rosterJson = await rosterRes.json()
  const ids = Array.from(new Set((rosterJson.roster ?? []).map((r: any) => r.person?.id).filter(Boolean)))
  if (ids.length === 0) return []

  const peopleRes = await fetch(
    `${MLB_API}/people?personIds=${ids.join(',')}&hydrate=stats(group=[hitting,pitching],type=season,season=${season},sportId=${sportId})`,
    { next: { revalidate: 3600 } }
  )
  if (!peopleRes.ok) return []
  const peopleJson = await peopleRes.json()
  return peopleJson.people ?? []
}

function topN(
  people: any[], group: 'hitting' | 'pitching', key: string, n: number, lowerIsBetter: boolean,
  minSample: { key: string; min: number }
): MinorLeader[] {
  const rows: (MinorLeader & { sortVal: number })[] = []
  for (const p of people) {
    const statBlock = (p.stats ?? []).find((s: any) => s.group?.displayName?.toLowerCase() === group)
    const stat = statBlock?.splits?.[0]?.stat
    if (!stat) continue
    if (Number(stat[minSample.key] ?? 0) < minSample.min) continue
    const v = Number(stat[key])
    if (Number.isNaN(v)) continue
    rows.push({
      name: p.fullName, personId: p.id, value: String(stat[key]),
      age: p.birthDate ? ageFromBirthDate(p.birthDate) : undefined, sortVal: v,
    })
  }
  rows.sort((a, b) => (lowerIsBetter ? a.sortVal - b.sortVal : b.sortVal - a.sortVal))
  return rows.slice(0, n).map(({ name, personId, value, age }) => ({ name, personId, value, age }))
}

export async function getAffiliateStandouts(mlbTeamId: number, season: number): Promise<AffiliateStandout[]> {
  const results = await Promise.all(
    AFFILIATE_LEVELS.map(async ({ sportId, label }) => {
      const affiliate = await findAffiliate(mlbTeamId, sportId, season)
      if (!affiliate) return null

      const people = await fetchAffiliateRosterWithStats(affiliate.id, season, sportId)

      const topOPS = topN(people, 'hitting', 'ops', 5, false, { key: 'plateAppearances', min: 20 })
      const topHR = topN(people, 'hitting', 'homeRuns', 5, false, { key: 'plateAppearances', min: 20 })
      const topERA = topN(people, 'pitching', 'era', 5, true, { key: 'inningsPitched', min: 10 })
      const topK = topN(people, 'pitching', 'strikeOuts', 5, false, { key: 'inningsPitched', min: 10 })

      const under24 = people.filter((p: any) => p.birthDate && ageFromBirthDate(p.birthDate) <= 23)
      const youngHitters = topN(under24, 'hitting', 'ops', 3, false, { key: 'plateAppearances', min: 20 })
      const youngPitchers = topN(under24, 'pitching', 'era', 2, true, { key: 'inningsPitched', min: 10 })

      return {
        affiliateName: affiliate.name,
        affiliateId: affiliate.id,
        level: label,
        logoUrl: teamLogoUrl(affiliate.id),
        topOPS, topHR, topERA, topK,
        youngPerformers: [...youngHitters, ...youngPitchers],
      }
    })
  )
  return results.filter((r): r is AffiliateStandout => r !== null)
}