// src/app/api/stats/vs-team/route.ts
//
// GET /api/stats/vs-team?playerId=665742&team=NYY&group=hitting|pitching — one player's career record against one club (MLB Stats API
// "vsTeam": a total row plus one row per season). Used by the ask lab for "Juan Soto vs Yankees". Counts as one lookup for Free and
// signed-out viewers (same allowance as /api/stats/query); Pro is never counted.
import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { MLB_TEAMS } from '@/lib/teams'
import { resolveViewer, checkLookup, chargeLookup, anonCookie, ASK_LOOKUPS_PER_DAY } from '@/lib/ask-lookups'

type Stat = Record<string, string | number | undefined>
type Split = { season?: string; stat: Stat }
type StatBlock = { type?: { displayName?: string }; splits?: Split[] }

const BASE = 'https://statsapi.mlb.com/api/v1'

async function pull(playerId: number, teamId: number, group: 'hitting' | 'pitching'): Promise<{ total: Stat | null; seasons: { season: string; stat: Stat }[] }> {
  const r = await fetch(`${BASE}/people/${playerId}/stats?stats=vsTeam&group=${group}&opposingTeamId=${teamId}&sportId=1`, { signal: AbortSignal.timeout(12000), next: { revalidate: 3600 } })
  if (!r.ok) throw new Error(`MLB vsTeam ${r.status}`)
  const j = (await r.json()) as { stats?: StatBlock[] }
  const total = j.stats?.find(s => s.type?.displayName === 'vsTeamTotal')?.splits?.[0]?.stat ?? null
  const per = j.stats?.find(s => s.type?.displayName === 'vsTeam')?.splits ?? []
  // The feed returns one row per season per opponent split; keep one row per season (a later duplicate is the same season's total).
  const bySeason = new Map<string, Stat>()
  for (const s of per) if (s.season) bySeason.set(s.season, s.stat)
  return { total, seasons: [...bySeason.entries()].map(([season, stat]) => ({ season, stat })).sort((a, b) => Number(b.season) - Number(a.season)) }
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const playerId = Number(sp.get('playerId'))
  const team = MLB_TEAMS.find(t => t.abbrev === sp.get('team'))
  const want = sp.get('group') === 'pitching' ? 'pitching' : 'hitting'
  if (!Number.isInteger(playerId) || playerId <= 0 || playerId > 1e9 || !team) return NextResponse.json({ error: 'Choose a player and a club.' }, { status: 400 })

  const viewer = await resolveViewer(req)
  const key = createHash('sha256').update(`vsteam:${playerId}:${team.id}:${want}`).digest('hex')
  const noStore = { 'Cache-Control': 'private, no-store' }
  const limited = () => NextResponse.json({ error: "You've used today's lookups.", limit: true, left: 0, perDay: ASK_LOOKUPS_PER_DAY }, { status: 429, headers: noStore })
  const check = viewer.kind === 'pro' ? null : await checkLookup(viewer, key)
  if (check && !check.allowed) return limited()

  try {
    const [person, first] = await Promise.all([
      fetch(`${BASE}/people/${playerId}`, { signal: AbortSignal.timeout(12000), next: { revalidate: 86400 } }).then(r => r.json()) as Promise<{ people?: { fullName?: string; primaryPosition?: { abbreviation?: string } }[] }>,
      pull(playerId, team.id, want),
    ])
    let group: 'hitting' | 'pitching' = want
    let data = first
    // A pitcher asked about as a batter (or the reverse) with nothing found: try the other side once.
    if (!data.total) { const other = want === 'hitting' ? 'pitching' : 'hitting'; const o = await pull(playerId, team.id, other); if (o.total) { data = o; group = other } }
    const p = person.people?.[0]
    const body = { player: { id: playerId, name: p?.fullName ?? '', pos: p?.primaryPosition?.abbreviation ?? '' }, team: { id: team.id, name: team.name, abbrev: team.abbrev }, group, total: data.total, seasons: data.seasons }
    let left = check?.left ?? null
    if (data.total && viewer.kind !== 'pro') {
      const ch = await chargeLookup(viewer, key)
      if (!ch.ok) return limited()
      left = ch.left
    }
    const res = NextResponse.json({ ...body, lookupsLeft: viewer.kind === 'pro' ? null : left, perDay: viewer.kind === 'pro' || left == null ? null : ASK_LOOKUPS_PER_DAY }, { headers: viewer.kind === 'pro' ? { 'Cache-Control': 'private, max-age=300' } : noStore })
    const c = data.total ? anonCookie(viewer) : null
    if (c) res.cookies.set(c.name, c.value, c.options)
    return res
  } catch (e) {
    console.error('[stats/vs-team] failed:', (e as Error).message)
    return NextResponse.json({ error: 'MLB Stats API did not respond. Try again in a moment.' }, { status: 502 })
  }
}
