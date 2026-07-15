// src/lib/player-page.ts
//
// Central data fetcher for /mlb/players/[id].
// Pulls bio, draft, education, transactions, awards, current team, and
// yearByYear stats from MLB Stats API in a single call using hydrate.
//
// Nothing here calls Savant — Statcast data lives in player-statcast-full.ts
// and gets fetched per-tab, since Savant CSVs are slow (~500-800ms each).

import { MLB_TEAMS } from './teams'
import { getDraftPickDetail } from './player-draft'
const MLB_API = 'https://statsapi.mlb.com/api/v1'

// ─── Types ────────────────────────────────────────────────────────────────

export interface PlayerIdentity {
  id: number
  fullName: string
  nickName: string | null
  primaryNumber: string | null
  primaryPosition: { code: string; name: string; abbreviation: string }
  batSide: 'L' | 'R' | 'S' | null
  pitchHand: 'L' | 'R' | 'S' | null
  height: string
  weight: number | null
  birthDate: string
  birthCity: string | null
  birthStateProvince: string | null
  birthCountry: string | null
  mlbDebutDate: string | null
  active: boolean
  currentAge: number
  isPitcher: boolean
  // Enriched
  currentTeam: {
    id: number
    name: string
    abbr: string
    primaryColor: string
  } | null
}

export interface PlayerDraft {
  year: number
  round: string
  pickNumber: number | null
  team: string | null
}

export interface PlayerSchool {
  type: 'highschool' | 'college'
  name: string
  city: string | null
  state: string | null
}

export interface PlayerAward {
  id: string
  name: string
  date: string
  season: string | null
}

export interface PlayerTransaction {
  id: number
  date: string
  typeCode: string
  typeDesc: string
  description: string
  fromTeam: string | null
  toTeam: string | null
}

export interface YearByYearRow {
  season: string
  team: string | null
  stat: Record<string, string | number>
}

export interface PlayerPageData {
  identity: PlayerIdentity
  draft: PlayerDraft | null
  schools: PlayerSchool[]
  awards: PlayerAward[]
  transactions: PlayerTransaction[]
  yearByYearHitting: YearByYearRow[]
  yearByYearPitching: YearByYearRow[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function computeAge(birthDate: string): number {
  const b = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age
}

function teamMeta(team: { id?: number; name?: string } | undefined | null) {
  if (!team?.name) return null
  const t = MLB_TEAMS.find(x => x.name === team.name || x.abbrev === team.name)
  if (!t) return null
  return { id: team.id ?? 0, name: t.name, abbr: t.abbrev, primaryColor: t.primary_color }
}

// ─── Main fetcher ─────────────────────────────────────────────────────────

export async function getPlayerPageData(playerId: number): Promise<PlayerPageData | null> {
  const hydrate = [
    'currentTeam',
    'draft',
    'education',
    'awards',
    'transactions',
    'stats(group=[hitting,pitching],type=[yearByYear])',
  ].join(',')
  const url = `${MLB_API}/people/${playerId}?hydrate=${encodeURIComponent(hydrate)}`

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const json = await res.json()
    const p = json?.people?.[0]
    if (!p) return null

    const positionCode = p.primaryPosition?.code ?? ''
    const isPitcher = positionCode === '1' || p.primaryPosition?.abbreviation === 'P'

    const identity: PlayerIdentity = {
      id: p.id,
      fullName: p.fullName,
      nickName: p.nickName ?? null,
      primaryNumber: p.primaryNumber ?? null,
      primaryPosition: {
        code: p.primaryPosition?.code ?? '',
        name: p.primaryPosition?.name ?? '',
        abbreviation: p.primaryPosition?.abbreviation ?? '',
      },
      batSide: p.batSide?.code ?? null,
      pitchHand: p.pitchHand?.code ?? null,
      height: p.height ?? '',
      weight: p.weight ?? null,
      birthDate: p.birthDate ?? '',
      birthCity: p.birthCity ?? null,
      birthStateProvince: p.birthStateProvince ?? null,
      birthCountry: p.birthCountry ?? null,
      mlbDebutDate: p.mlbDebutDate ?? null,
      active: !!p.active,
      currentAge: p.birthDate ? computeAge(p.birthDate) : (p.currentAge ?? 0),
      isPitcher,
    currentTeam: teamMeta(p.currentTeam),

    }

    // Draft


// ...inside getPlayerPageData, after identity is built:
const draftYear = p.draftYear ?? null
const draftDetail = draftYear ? await getDraftPickDetail(p.id, draftYear) : null

const draft: PlayerDraft | null = draftDetail ? {
  year: draftDetail.year,
  round: draftDetail.round,
  pickNumber: draftDetail.overallPick,
  team: draftDetail.team,
} : (draftYear ? { year: draftYear, round: '—', pickNumber: null, team: null } : null)

    // Schools
    const schools: PlayerSchool[] = []
    const highschools = p.education?.highschools ?? []
    for (const hs of highschools) {
      schools.push({
        type: 'highschool',
        name: hs.name ?? '',
        city: hs.city ?? null,
        state: hs.state ?? null,
      })
    }
    const colleges = p.education?.colleges ?? []
    for (const c of colleges) {
      schools.push({
        type: 'college',
        name: c.name ?? '',
        city: c.city ?? null,
        state: c.state ?? null,
      })
    }

    // Awards
    const awards: PlayerAward[] = (p.awards ?? []).map((a: any) => ({
      id: String(a.id ?? ''),
      name: a.name ?? '',
      date: a.date ?? '',
      season: a.season ?? null,
    }))

    // Transactions
    const transactions: PlayerTransaction[] = (p.transactions ?? []).map((t: any) => ({
      id: t.id,
      date: t.date ?? '',
      typeCode: t.typeCode ?? '',
      typeDesc: t.typeDesc ?? '',
      description: t.description ?? '',
      fromTeam: t.fromTeam?.name ?? null,
      toTeam: t.toTeam?.name ?? null,
    }))

    // Year-by-year splits
    const yearByYearHitting: YearByYearRow[] = []
    const yearByYearPitching: YearByYearRow[] = []
    for (const block of p.stats ?? []) {
      const group = block.group?.displayName
      const type = block.type?.displayName
      if (type !== 'yearByYear') continue
      for (const s of block.splits ?? []) {
        const row: YearByYearRow = {
          season: s.season,
          team: s.team?.name ?? null,
          stat: s.stat ?? {},
        }
        if (group === 'hitting') yearByYearHitting.push(row)
        if (group === 'pitching') yearByYearPitching.push(row)
      }
    }

    return {
      identity,
      draft,
      schools,
      awards,
      transactions,
      yearByYearHitting,
      yearByYearPitching,
    }
  } catch (err) {
    console.error('[getPlayerPageData]', err)
    return null
  }
}