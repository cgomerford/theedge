// GET /api/me/dashboard/data?role=batter|pitcher  ->  { season, updated, rows: [{ id, name, team, pos, s }] } or { empty: true }
// Every player of one role from league_player_stats. A free account receives only the free stats (the rest are never sent); Pro receives all. Signed-in only.

import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { isProViewer } from '@/lib/require-pro'
import { getLeagueRows } from '@/lib/dashboard/data'
import { allowedStats, type Role } from '@/lib/dashboard/stats'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(req: NextRequest) {
  if (!(await getCurrentSubscriber())) return NextResponse.json({ error: 'sign_in' }, { status: 401, headers: NO_STORE })
  const role = new URL(req.url).searchParams.get('role')
  if (role !== 'batter' && role !== 'pitcher') return NextResponse.json({ error: 'bad_role' }, { status: 400, headers: NO_STORE })
  const isPro = await isProViewer()
  const got = await getLeagueRows(role as Role)
  if (!got) return NextResponse.json({ empty: true }, { headers: NO_STORE })
  // the stats this plan may see, plus the ones the slicers and tiles lean on every time: nothing outside the plan is sent
  const keys = new Set(allowedStats(role as Role, isPro).map(s => s.key))
  const rows = got.rows.map(r => { const s: Record<string, number> = {}; for (const k of keys) if (r.s[k] != null) s[k] = r.s[k]; return { id: r.id, name: r.name, team: r.team, pos: r.pos, s } })
  return NextResponse.json({ season: got.season, updated: got.updated, rows }, { headers: NO_STORE })
}
