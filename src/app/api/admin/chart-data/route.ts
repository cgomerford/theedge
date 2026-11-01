// Data for the article writer's chart picker that has no public route: Savant percentile ranks (player_percentiles), per-pitch movement (pitch_arsenals),
// the league pitching table (starters and bullpen for all 30 clubs, MLB Stats API) and a club's pitcher arm angles (team makeup).
// Admin only (src/lib/admin-auth.ts). Read-only; the percentile minimum sample is applied by getPercentileBlocks, never bypassed.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { getPercentileBlocks } from '@/lib/follows/percentiles'
import { getPitchMovementFromDB } from '@/lib/pitcher-full-stats'
import { getLeagueTables } from '@/lib/team-profile/league'
import { getTeamMakeup, type Role } from '@/lib/lab/team-pitch-makeup.server-fetch-allowed'

export const dynamic = 'force-dynamic'

/** Plate appearances (hitters) or batters faced (pitchers) this season, from the MLB Stats API; null when it can't be read. */
async function sampleOf(playerId: number, season: number, isPitcher: boolean): Promise<number | null> {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=${isPitcher ? 'pitching' : 'hitting'}&season=${season}`, { cache: 'no-store' })
    if (!res.ok) return null
    const d = await res.json()
    const stat = d?.stats?.[0]?.splits?.[0]?.stat
    const n = Number(isPitcher ? stat?.battersFaced : stat?.plateAppearances)
    return Number.isFinite(n) ? n : null
  } catch (e) {
    console.error('[chart-data sampleOf]', e instanceof Error ? e.message : e)
    return null
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const q = req.nextUrl.searchParams
  const kind = q.get('kind')
  const playerId = Number(q.get('playerId'))
  const season = Number(q.get('season') ?? new Date().getFullYear())

  if (kind === 'league-pitching') {
    const t = await getLeagueTables(season)
    if (!t) return NextResponse.json({ rows: [], error: 'The MLB Stats API did not answer' })
    return NextResponse.json({ rows: t.rows.map(r => ({ id: r.id, abbr: r.abbr, name: r.name, all: r.pit, sp: r.sp, rp: r.rp })) })
  }
  if (kind === 'team-arm') {
    const role = (['all', 'sp', 'rp'].includes(q.get('role') ?? '') ? q.get('role') : 'all') as Role
    const m = await getTeamMakeup(Number(q.get('teamId')), season)
    const r = m?.roles[role]
    return NextResponse.json({ arms: r?.pitcherArms ?? [], low: r?.armAngleLow ?? null, high: r?.armAngleHigh ?? null, pitches: r?.pitches ?? 0 })
  }
  if (!playerId || !season) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

  if (kind === 'movement') return NextResponse.json({ rows: await getPitchMovementFromDB(playerId, season) })

  if (kind === 'percentiles') {
    const isPitcher = q.get('role') === 'pitcher'
    const n = await sampleOf(playerId, season, isPitcher)
    if (n == null) return NextResponse.json({ block: null, error: 'Could not read his sample from the MLB Stats API' })
    const block = (await getPercentileBlocks([{ id: playerId, isPitcher, n }], season, true)).get(playerId) ?? null
    return NextResponse.json({ block })
  }
  return NextResponse.json({ error: 'unknown kind' }, { status: 400 })
}
