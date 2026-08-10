/**
 * src/lib/fantasy-minors.ts
 *
 * Minor-league data lib. MLB Stats API exposes MiLB the same way as
 * MLB — just different sportIds:
 *   1  = MLB
 *   11 = AAA
 *   12 = AA
 *   13 = High-A
 *   14 = Low-A
 *   16 = Rookie
 *
 * The /teams endpoint takes a sportId, and any team's roster is at
 * /teams/{id}/roster.
 *
 * ⚠ STATS FIX (v2): the first pass of this file pulled stats from
 * /teams/{id}/stats?stats=season — that endpoint returns TEAM-level
 * aggregate totals (one row), not a per-player breakdown, which is why
 * the roster table rendered with every stat column empty. Per-player
 * stats only come back reliably from /people/{id}/stats, the same
 * endpoint fantasy-player.ts already uses successfully for the MLB
 * deep-dive page. This version fetches per player (batched with a
 * concurrency cap) instead of trying to get everything in one call.
 */

const MLB_STATS_BASE = 'https://statsapi.mlb.com/api/v1'

export const MILB_SPORT_IDS = [11, 12, 13, 14, 16] as const

export const SPORT_LEVEL_LABEL: Record<number, string> = {
  1: 'MLB',
  11: 'AAA',
  12: 'AA',
  13: 'High-A',
  14: 'Low-A',
  16: 'Rookie',
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type MinorLeagueTeamMeta = {
  teamId: number
  name: string                    // "Lehigh Valley IronPigs"
  shortName: string | null        // "IronPigs"
  abbreviation: string | null
  sportId: number
  level: string                   // "AAA" / "AA" etc.
  league: string | null           // "International League"
  parentOrgId: number | null
  parentOrgName: string | null
  venue: string | null
  locationName: string | null
}

export type MinorLeaguerMeta = {
  playerId: number
  fullName: string
  primaryPosition: string | null
  primaryPositionType: string | null   // "Pitcher", "Infielder", etc.
  jerseyNumber: string | null
  status: string | null                // "Active" / "Injured List" etc.
  bats: string | null
  throws: string | null
  age: number | null
  height: string | null
  weight: number | null
  birthCountry: string | null
}

export type MinorLeaguerSeasonLine = {
  playerId: number
  // Hitters
  ops: number | null
  avg: number | null
  hr: number | null
  rbi: number | null
  sb: number | null
  atBats: number | null
  // Pitchers
  era: number | null
  whip: number | null
  strikeOuts: number | null
  inningsPitched: string | null
}

// ─── Concurrency helper ─────────────────────────────────────────────────────
// Per-player fetching means one call per roster spot. Unbounded
// Promise.all across a 35-40 man roster risks tripping rate limits, so
// cap how many run at once.

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx]).catch(() => {})
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
}

function isPitcherRole(p: MinorLeaguerMeta): boolean {
  const t = (p.primaryPositionType ?? '').toLowerCase()
  const pos = (p.primaryPosition ?? '').toUpperCase()
  return t.includes('pitcher') || ['P', 'SP', 'RP'].includes(pos)
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function daysAgoIso(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().split('T')[0]
}
function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Team meta ────────────────────────────────────────────────────────────────

export async function getMinorLeagueTeam(teamId: number): Promise<MinorLeagueTeamMeta | null> {
  const url = `${MLB_STATS_BASE}/teams/${teamId}?hydrate=league,venue,parentOrg`
  const res = await fetch(url, { next: { revalidate: 86400 } })
  if (!res.ok) return null
  const data = await res.json()
  const t = data?.teams?.[0]
  if (!t) return null

  return {
    teamId,
    name: t.name ?? 'Unknown',
    shortName: t.shortName ?? t.teamName ?? null,
    abbreviation: t.abbreviation ?? null,
    sportId: t.sport?.id ?? 0,
    level: SPORT_LEVEL_LABEL[t.sport?.id] ?? t.sport?.name ?? 'MiLB',
    league: t.league?.name ?? null,
    parentOrgId: t.parentOrgId ?? null,
    parentOrgName: t.parentOrgName ?? null,
    venue: t.venue?.name ?? null,
    locationName: t.locationName ?? null,
  }
}

// ─── Roster ───────────────────────────────────────────────────────────────────

export async function getMinorLeagueRoster(
  teamId: number,
  season: number = new Date().getUTCFullYear(),
): Promise<MinorLeaguerMeta[]> {
  const url = `${MLB_STATS_BASE}/teams/${teamId}/roster/fullRoster?season=${season}&hydrate=person`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) return []
  const data = await res.json()
  const roster: unknown[] = data?.roster ?? []

  return roster.map((r) => {
    const row = r as Record<string, any>
    const p = row.person ?? {}
    return {
      playerId: p.id,
      fullName: p.fullName ?? 'Unknown',
      primaryPosition: row.position?.abbreviation ?? p.primaryPosition?.abbreviation ?? null,
      primaryPositionType: row.position?.type ?? p.primaryPosition?.type ?? null,
      jerseyNumber: row.jerseyNumber ?? null,
      status: row.status?.description ?? null,
      bats: p.batSide?.code ?? null,
      throws: p.pitchHand?.code ?? null,
      age: p.currentAge ?? null,
      height: p.height ?? null,
      weight: p.weight ?? null,
      birthCountry: p.birthCountry ?? null,
    }
  }).filter((m: MinorLeaguerMeta) => Number.isFinite(m.playerId))
}

// ─── Per-player season stats ────────────────────────────────────────────────
// Same endpoint shape as fantasy-player.ts's fetchSeasonStats, just
// parameterized on sportId (MiLB level) instead of hardcoded to 1 (MLB),
// and covering both hitting and pitching groups.

function emptyLine(playerId: number): MinorLeaguerSeasonLine {
  return {
    playerId,
    ops: null, avg: null, hr: null, rbi: null, sb: null, atBats: null,
    era: null, whip: null, strikeOuts: null, inningsPitched: null,
  }
}

async function fetchPlayerSeasonLine(
  playerId: number,
  sportId: number,
  season: number,
  group: 'hitting' | 'pitching',
): Promise<MinorLeaguerSeasonLine> {
  const url = `${MLB_STATS_BASE}/people/${playerId}/stats?stats=season&group=${group}&season=${season}&sportId=${sportId}`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return emptyLine(playerId)
    const data = await res.json()
    const stat = data?.stats?.[0]?.splits?.[0]?.stat
    if (!stat) return emptyLine(playerId)
    const num = (v: unknown) => (v == null || v === '' || v === '.---' ? null : Number(v))
    return {
      playerId,
      ops: group === 'hitting' ? num(stat.ops) : null,
      avg: group === 'hitting' ? num(stat.avg) : null,
      hr: group === 'hitting' ? num(stat.homeRuns) : null,
      rbi: group === 'hitting' ? num(stat.rbi) : null,
      sb: group === 'hitting' ? num(stat.stolenBases) : null,
      atBats: group === 'hitting' ? num(stat.atBats) : null,
      era: group === 'pitching' ? num(stat.era) : null,
      whip: group === 'pitching' ? num(stat.whip) : null,
      strikeOuts: group === 'pitching' ? num(stat.strikeOuts) : null,
      inningsPitched: group === 'pitching' ? (stat.inningsPitched ?? null) : null,
    }
  } catch {
    return emptyLine(playerId)
  }
}

/**
 * Fetches season stats for every player on a roster, one call per
 * player (hitting for position players, pitching for pitchers),
 * capped at 8 concurrent requests. Requires the roster array (not
 * just a team ID) so we know which group to request per player —
 * this also means the app never fetches stats for someone twice.
 */
export async function getMinorLeagueTeamStats(
  roster: MinorLeaguerMeta[],
  sportId: number,
  season: number = new Date().getUTCFullYear(),
): Promise<Map<number, MinorLeaguerSeasonLine>> {
  const out = new Map<number, MinorLeaguerSeasonLine>()
  await mapWithConcurrency(roster, 8, async (p) => {
    const line = await fetchPlayerSeasonLine(
      p.playerId, sportId, season, isPitcherRole(p) ? 'pitching' : 'hitting',
    )
    out.set(p.playerId, line)
  })
  return out
}

// ─── Recent-form (L14) — heat/cold indicator ─────────────────────────────────
// Hitters only — this feeds the hot/cold arrows in the roster table.

async function fetchPlayerRecentOps(
  playerId: number, sportId: number, days: number,
): Promise<number | null> {
  const url = `${MLB_STATS_BASE}/people/${playerId}/stats?stats=byDateRange&startDate=${daysAgoIso(days)}&endDate=${todayIso()}&group=hitting&sportId=${sportId}`
  try {
    const res = await fetch(url, { next: { revalidate: 1800 } })
    if (!res.ok) return null
    const data = await res.json()
    const stat = data?.stats?.[0]?.splits?.[0]?.stat
    const ops = stat?.ops
    if (ops == null || ops === '.---') return null
    const n = Number(ops)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export async function getMinorLeagueRecentOps(
  roster: MinorLeaguerMeta[], sportId: number,
): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  const hitters = roster.filter(p => !isPitcherRole(p))
  await mapWithConcurrency(hitters, 8, async (p) => {
    const ops = await fetchPlayerRecentOps(p.playerId, sportId, 14)
    if (ops != null) out.set(p.playerId, ops)
  })
  return out
}

// ─── Team-name → team-id lookup ─────────────────────────────────────────────
// Prospects come out of the model with a `team_name` string (e.g. "IronPigs")
// but no `team_id`. To link the "Full farm system" button correctly, we
// need to resolve names to IDs. One shot: fetch the full MiLB team list
// once, cache for 24h, look up by fuzzy match.

let _teamCache: { at: number; teams: { id: number; sportId: number; names: string[] }[] } | null = null

async function getAllMinorLeagueTeams(): Promise<{ id: number; sportId: number; names: string[] }[]> {
  const now = Date.now()
  if (_teamCache && now - _teamCache.at < 24 * 60 * 60 * 1000) return _teamCache.teams

  const season = new Date().getUTCFullYear()
  const sportIdParam = MILB_SPORT_IDS.join(',')
  const url = `${MLB_STATS_BASE}/teams?sportIds=${sportIdParam}&season=${season}`
  const res = await fetch(url, { next: { revalidate: 86400 } })
  if (!res.ok) return []
  const data = await res.json()
  const teams: unknown[] = data?.teams ?? []

  const parsed = teams.map((r) => {
    const t = r as Record<string, any>
    const names = [t.name, t.shortName, t.teamName, t.franchiseName, t.abbreviation]
      .filter((s: unknown): s is string => typeof s === 'string' && s.length > 0)
    return { id: t.id, sportId: t.sport?.id ?? 0, names }
  }).filter(t => Number.isFinite(t.id))

  _teamCache = { at: now, teams: parsed }
  return parsed
}

export async function getTeamIdByName(name: string): Promise<{ teamId: number; sportId: number } | null> {
  const target = name.toLowerCase().trim()
  const teams = await getAllMinorLeagueTeams()
  for (const t of teams) {
    if (t.names.some(n => n.toLowerCase() === target)) {
      return { teamId: t.id, sportId: t.sportId }
    }
  }
  for (const t of teams) {
    if (t.names.some(n => {
      const nl = n.toLowerCase()
      return nl.includes(target) || target.includes(nl)
    })) {
      return { teamId: t.id, sportId: t.sportId }
    }
  }
  return null
}

export async function resolveTeamNameMap(names: string[]): Promise<Map<string, number>> {
  const uniq = Array.from(new Set(names))
  const map = new Map<string, number>()
  await Promise.all(uniq.map(async n => {
    const hit = await getTeamIdByName(n)
    if (hit) map.set(n, hit.teamId)
  }))
  return map
}
