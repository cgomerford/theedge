// Data for the article writer's chart picker that has no public route: Savant percentile ranks (player_percentiles), per-pitch movement (pitch_arsenals),
// the league pitching table (starters and bullpen for all 30 clubs, MLB Stats API) and a club's pitcher arm angles (team makeup).
// Admin only (src/lib/admin-auth.ts). Read-only; the percentile minimum sample is applied by getPercentileBlocks, never bypassed.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { getPercentileBlocks } from '@/lib/follows/percentiles'
import { getPitchMovementFromDB } from '@/lib/pitcher-full-stats'
import { buildArsenal } from '@/components/admin/story-v5/arsenal'
import { parseCsv } from '@/components/admin/story-v5/csv'
import { getLeagueTables } from '@/lib/team-profile/league'
import { getDefenseProfile } from '@/lib/defense-chart'
import { getTeamBatting } from '@/lib/team-batting'
import { findTeamByName } from '@/lib/teams'
import { getTeamMakeup, type Role } from '@/lib/lab/team-pitch-makeup.server-fetch-allowed'
import { log } from '@/lib/log'

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
    log.error('chart-data sampleOf', 'failed', e instanceof Error ? e.message : e)
    return null
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const q = req.nextUrl.searchParams
  const kind = q.get('kind')
  const playerId = Number(q.get('playerId'))
  const season = Number(q.get('season') ?? new Date().getFullYear())

  if (kind === 'pitch-paths') {
    if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })
    // The Story v5 recipe: one pitcher's Savant pitches (regular season and postseason) averaged into one 3D path per pitch type. Admin only, on demand, never on a public page.
    try {
      const res = await fetch(`https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&player_type=pitcher&pitchers_lookup%5B%5D=${playerId}&hfSea=${season}%7C&hfGT=R%7CPO%7C`, { cache: 'no-store', signal: AbortSignal.timeout(90000) })
      if (!res.ok) return NextResponse.json({ pitches: [], error: `Baseball Savant answered ${res.status}` })
      return NextResponse.json({ pitches: buildArsenal(parseCsv(await res.text()), 4) })
    } catch (e) {
      log.error('chart-data pitch-paths', 'failed', e instanceof Error ? e.message : e)
      return NextResponse.json({ pitches: [], error: 'Baseball Savant did not answer' })
    }
  }
  if (kind === 'game-log') {
    // A player's games this season (regular season and postseason), newest first, for the picker's game chooser.
    if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })
    const group = q.get('group') === 'hitting' ? 'hitting' : 'pitching'
    try {
      const parts = await Promise.all(['R', 'P'].map(async gt => {
        const res = await fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=gameLog&group=${group}&season=${season}&gameType=${gt}`, { cache: 'no-store' })
        if (!res.ok) return []
        const d = await res.json()
        return (d?.stats?.[0]?.splits ?? []) as { date: string; isHome: boolean; gameType: string; opponent?: { name: string }; game?: { gamePk: number }; stat?: { summary?: string } }[]
      }))
      const games = parts.flat().filter(g => g.game?.gamePk).sort((a, b) => b.date.localeCompare(a.date)).map(g => ({
        gamePk: g.game!.gamePk, date: g.date, postseason: g.gameType !== 'R',
        opp: findTeamByName(g.opponent?.name ?? '')?.short ?? g.opponent?.name ?? '', home: g.isHome, summary: g.stat?.summary ?? '',
      }))
      return NextResponse.json({ games })
    } catch (e) {
      log.error('chart-data game-log', 'failed', e instanceof Error ? e.message : e)
      return NextResponse.json({ games: [], error: 'The MLB Stats API did not answer' })
    }
  }
  if (kind === 'game-pitches') {
    // One game of one player's Savant pitches (admin, on demand, never a public page). Pitchers: per pitch type numbers and average paths. Hitters: balls in play.
    const date = q.get('date') ?? ''
    const gamePk = Number(q.get('gamePk'))
    if (!playerId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'playerId and date required' }, { status: 400 })
    const batter = q.get('role') === 'batter'
    try {
      const res = await fetch(`https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&player_type=${batter ? 'batter' : 'pitcher'}&${batter ? 'batters_lookup' : 'pitchers_lookup'}%5B%5D=${playerId}&hfSea=${season}%7C&hfGT=R%7CPO%7C&game_date_gt=${date}&game_date_lt=${date}`, { cache: 'no-store', signal: AbortSignal.timeout(60000) })
      if (!res.ok) return NextResponse.json({ pitches: [], balls: [], error: `Baseball Savant answered ${res.status}` })
      let rows = parseCsv(await res.text())
      if (gamePk) rows = rows.filter(r => !r.game_pk || Number(r.game_pk) === gamePk)
      if (batter) {
        const balls = rows.filter(r => r.type === 'X' && Number(r.hc_x) > 0 && Number.isFinite(Number(r.hc_y))).map(r => ({ x: Number(r.hc_x), y: Number(r.hc_y), events: r.events ?? '', bb_type: r.bb_type ?? '' }))
        return NextResponse.json({ balls, pitchesSeen: rows.length })
      }
      return NextResponse.json({ pitches: buildArsenal(rows, 8, 5), total: rows.filter(r => r.pitch_type).length })
    } catch (e) {
      log.error('chart-data game-pitches', 'failed', e instanceof Error ? e.message : e)
      return NextResponse.json({ pitches: [], balls: [], error: 'Baseball Savant did not answer' })
    }
  }
  if (kind === 'defense') {
    if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })
    return NextResponse.json(await getDefenseProfile(playerId, season))
  }
  if (kind === 'team-batting') {
    const b = await getTeamBatting(Number(q.get('teamId')), season)
    if (!b) return NextResponse.json({ regular: null, post: null, rounds: [], error: 'The MLB Stats API did not answer' })
    return NextResponse.json(b)
  }
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
