// src/lib/scout/roster-profile.ts
//
// Scout §1 (Club status desk) — who these players ARE, beside whether they are available:
//   ★ Drafted by the club  — the pick that signed him (the draft matching his draftYear;
//                            a player picked and left unsigned by another club earlier
//                            doesn't count) was made by THIS club
//   Flag                   — birth country
//   Age                    — bucketed, plus the average for hitters and for pitchers
//   Handedness             — hitters' bat side (L / switch / R), pitchers' throwing hand
//   Hitter type            — power / balanced / small ball, from his season line (rule below)
//   Contract expiring      — only when the player_contracts table has him: MLB does not
//                            publish contract terms, so this is never guessed. Until the table
//                            is filled, `contractsLoaded` is false and the UI says so.
//
// Hitter-type rule (documented in the UI too; constants exported):
//   needs MIN_TYPE_PA plate appearances, otherwise "too few PA"
//   power      — isolated power (SLG − AVG) of POWER_ISO or better
//   small ball — isolated power under SMALL_ISO AND (SMALL_SB+ steals OR a strikeout rate of
//                SMALL_K% or lower)
//   balanced   — everyone else
// One batched MLB Stats API call per club; cached six hours.

import { createAdminClient } from '@/lib/supabase'

const MLB = 'https://statsapi.mlb.com/api/v1'
export const MIN_TYPE_PA = 100
export const POWER_ISO = 0.19
export const SMALL_ISO = 0.14
export const SMALL_SB = 8
export const SMALL_K = 20

export type Archetype = 'power' | 'balanced' | 'smallball' | 'few'

export type PlayerProfile = {
  id: number
  age: number | null
  country: string | null
  bats: 'L' | 'R' | 'S' | null
  throws: 'L' | 'R' | null
  draftedByClub: boolean
  draftYear: number | null
  draftRound: string | null
  draftPick: number | null
  hit: { pa: number; iso: number | null; hr: number; sb: number; kPct: number | null } | null
  archetype: Archetype | null
  /** Last season of his contract, when the player_contracts table has him. */
  contractThrough: number | null
}

export type RosterProfiles = {
  byId: Map<number, PlayerProfile>
  /** false until player_contracts exists and has rows — the UI must not imply "no expiring deals". */
  contractsLoaded: boolean
}

type Person = {
  id: number; currentAge?: number; birthCountry?: string; draftYear?: number
  batSide?: { code?: string }; pitchHand?: { code?: string }
  drafts?: { year?: string; pickRound?: string; pickNumber?: number; team?: { id?: number } }[]
  stats?: { group?: { displayName?: string }; splits?: { stat?: Record<string, string | number | undefined> }[] }[]
}

const num = (v: unknown): number | null => { const x = Number(v); return v == null || v === '' || !Number.isFinite(x) ? null : x }

function archetypeOf(h: PlayerProfile['hit']): Archetype | null {
  if (!h) return null
  if (h.pa < MIN_TYPE_PA || h.iso == null) return 'few'
  if (h.iso >= POWER_ISO) return 'power'
  if (h.iso < SMALL_ISO && (h.sb >= SMALL_SB || (h.kPct != null && h.kPct <= SMALL_K))) return 'smallball'
  return 'balanced'
}

async function getContracts(ids: number[]): Promise<Map<number, number> | null> {
  const { data, error } = await createAdminClient().from('player_contracts').select('player_id, expires_after_season').in('player_id', ids)
  if (error) {
    if (error.code !== 'PGRST205') console.error('[getContracts] Supabase error:', error.message)
    return null
  }
  const rows = (data ?? []) as { player_id: number | string; expires_after_season: number | string | null }[]
  if (rows.length === 0) return null
  return new Map(rows.filter((r) => r.expires_after_season != null).map((r) => [Number(r.player_id), Number(r.expires_after_season)]))
}

export async function getRosterProfiles(teamId: number, playerIds: number[], gameDate: string): Promise<RosterProfiles | null> {
  if (playerIds.length === 0) return null
  const season = Number(gameDate.slice(0, 4))
  try {
    const [res, contracts] = await Promise.all([
      fetch(`${MLB}/people?personIds=${playerIds.join(',')}&hydrate=draft,stats(group=%5Bhitting%5D,type=%5Bseason%5D,season=${season})`, { next: { revalidate: 21600 }, signal: AbortSignal.timeout(10000) }),
      getContracts(playerIds),
    ])
    if (!res.ok) { console.error('[getRosterProfiles] MLB HTTP', res.status); return null }
    const people = ((await res.json()).people ?? []) as Person[]
    const byId = new Map<number, PlayerProfile>()
    for (const p of people) {
      const st = p.stats?.find((s) => s.group?.displayName === 'hitting')?.splits?.[0]?.stat
      const pa = num(st?.plateAppearances) ?? 0
      const avg = num(st?.avg), slg = num(st?.slg), so = num(st?.strikeOuts)
      const hit: PlayerProfile['hit'] = st && pa > 0 ? {
        pa, iso: avg != null && slg != null ? slg - avg : null, hr: num(st.homeRuns) ?? 0, sb: num(st.stolenBases) ?? 0, kPct: so != null ? (so / pa) * 100 : null,
      } : null
      const signed = p.draftYear ? p.drafts?.find((d) => Number(d.year) === p.draftYear) : undefined
      const bats = p.batSide?.code, throws = p.pitchHand?.code
      byId.set(p.id, {
        id: p.id, age: p.currentAge ?? null, country: p.birthCountry ?? null,
        bats: bats === 'L' || bats === 'R' || bats === 'S' ? bats : null, throws: throws === 'L' || throws === 'R' ? throws : null,
        draftedByClub: !!signed && signed.team?.id === teamId, draftYear: p.draftYear ?? null,
        draftRound: signed?.pickRound ?? null, draftPick: signed?.pickNumber ?? null,
        hit, archetype: archetypeOf(hit), contractThrough: contracts?.get(p.id) ?? null,
      })
    }
    return { byId, contractsLoaded: contracts != null }
  } catch (err) {
    console.error('[getRosterProfiles] failed:', err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Flags ───────────────────────────────────────────────────────────────

// MLB's birthCountry is a country name (verified against the live API: "USA", "Dominican Republic", …).
const ISO: Record<string, string> = {
  'USA': 'US', 'Dominican Republic': 'DO', 'Venezuela': 'VE', 'Cuba': 'CU', 'Mexico': 'MX', 'Puerto Rico': 'PR', 'Canada': 'CA', 'Japan': 'JP',
  'South Korea': 'KR', 'Colombia': 'CO', 'Panama': 'PA', 'Nicaragua': 'NI', 'Curacao': 'CW', 'Curaçao': 'CW', 'Aruba': 'AW', 'Australia': 'AU',
  'Taiwan': 'TW', 'Netherlands': 'NL', 'Germany': 'DE', 'Bahamas': 'BS', 'Brazil': 'BR', 'Honduras': 'HN', 'Jamaica': 'JM', 'Lithuania': 'LT',
  'Italy': 'IT', 'Great Britain': 'GB', 'United Kingdom': 'GB', 'Ireland': 'IE', 'South Africa': 'ZA', 'Czech Republic': 'CZ', 'Czechia': 'CZ',
  'Spain': 'ES', 'France': 'FR', 'Russia': 'RU', 'China': 'CN', 'Philippines': 'PH', 'Guam': 'GU', 'US Virgin Islands': 'VI', 'Virgin Islands': 'VI',
  'Peru': 'PE', 'Ecuador': 'EC', 'Guatemala': 'GT', 'Costa Rica': 'CR', 'El Salvador': 'SV', 'Sweden': 'SE', 'Belgium': 'BE', 'Israel': 'IL',
  'New Zealand': 'NZ', 'Norway': 'NO', 'Poland': 'PL', 'Austria': 'AT', 'Ukraine': 'UA', 'Saudi Arabia': 'SA', 'Trinidad and Tobago': 'TT',
}

/** Emoji flag for a birth country, or null when the country isn't in the map (the UI then shows nothing rather than guess). */
export function flagFor(country: string | null): string | null {
  const code = country ? ISO[country] : undefined
  return code ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : null
}

// ─── Roster makeup (breakdowns over a set of players) ────────────────────

export const AGE_BUCKETS = [
  { label: '≤24', min: 0, max: 24 }, { label: '25–27', min: 25, max: 27 }, { label: '28–30', min: 28, max: 30 },
  { label: '31–33', min: 31, max: 33 }, { label: '34+', min: 34, max: 99 },
] as const

export type Makeup = {
  hitters: number; pitchers: number
  bats: { L: number; S: number; R: number }
  throws: { L: number; R: number }
  types: Record<Archetype, { n: number; names: string[] }>
  ages: { label: string; n: number }[]
  avgAge: { hitters: number | null; pitchers: number | null }
  drafted: number
  foreign: number
  expiring: { id: number; name: string }[]
}

export function makeup(players: { id: number; name: string; group: 'hitter' | 'pitcher' }[], byId: Map<number, PlayerProfile>, season: number): Makeup {
  const m: Makeup = {
    hitters: 0, pitchers: 0, bats: { L: 0, S: 0, R: 0 }, throws: { L: 0, R: 0 },
    types: { power: { n: 0, names: [] }, balanced: { n: 0, names: [] }, smallball: { n: 0, names: [] }, few: { n: 0, names: [] } },
    ages: AGE_BUCKETS.map((b) => ({ label: b.label, n: 0 })), avgAge: { hitters: null, pitchers: null }, drafted: 0, foreign: 0, expiring: [],
  }
  const ageSum = { hitter: 0, pitcher: 0 }, ageN = { hitter: 0, pitcher: 0 }
  for (const pl of players) {
    const p = byId.get(pl.id)
    if (!p) continue
    if (pl.group === 'hitter') { m.hitters++; if (p.bats) m.bats[p.bats]++; if (p.archetype) { m.types[p.archetype].n++; m.types[p.archetype].names.push(pl.name) } }
    else { m.pitchers++; if (p.throws) m.throws[p.throws]++ }
    if (p.age != null) {
      const i = AGE_BUCKETS.findIndex((b) => p.age! >= b.min && p.age! <= b.max)
      if (i >= 0) m.ages[i].n++
      ageSum[pl.group] += p.age; ageN[pl.group]++
    }
    if (p.draftedByClub) m.drafted++
    if (p.country && p.country !== 'USA') m.foreign++
    if (p.contractThrough === season) m.expiring.push({ id: pl.id, name: pl.name })
  }
  m.avgAge = { hitters: ageN.hitter ? ageSum.hitter / ageN.hitter : null, pitchers: ageN.pitcher ? ageSum.pitcher / ageN.pitcher : null }
  return m
}
