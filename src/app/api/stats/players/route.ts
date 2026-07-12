// src/app/api/stats/players/route.ts
//
// GET /api/stats/players?subject=pitcher&season=2026&teamId=147&role=SP
// GET /api/stats/players?subject=batter&season=2026&teamId=147
// GET /api/stats/players?subject=batter&search=judge
//
// Public route (no admin gate — unlike /api/admin/data-room, this is meant
// to be hit from the signed-in /stats page). Pitchers: one Supabase query,
// any filter combination works. Batters: MUST have teamId or search — see
// stats-data.ts header note for why "all batters, no filter" isn't offered.

import { NextRequest, NextResponse } from 'next/server'
import { getPitcherStatsTable, getAllBattersSeasonTable, getBatterStatsForPlayer } from '@/lib/stats-data'
import { searchPeople } from '@/lib/lab'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const subject = searchParams.get('subject')
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  const teamIdParam = searchParams.get('teamId')
  const teamId = teamIdParam ? Number(teamIdParam) : undefined
  const search = searchParams.get('search')?.trim()
  const role = searchParams.get('role') as 'SP' | 'RP' | null

  if (subject !== 'batter' && subject !== 'pitcher') {
    return NextResponse.json({ error: 'subject must be "batter" or "pitcher"' }, { status: 400 })
  }

  if (subject === 'pitcher') {
    const rows = await getPitcherStatsTable({ season, teamId, role: role ?? undefined })
    return NextResponse.json({ rows })
  }

  // ── BATTER: name search — quick single/few-player lookup, any team ──
  if (search) {
    const people = await searchPeople(search)
    const hitters = people.filter((p: any) => p.primaryPosition !== 'P').slice(0, 5)
    if (hitters.length === 0) return NextResponse.json({ rows: [] })
    const rows = await Promise.all(
      hitters.map((p: any) => getBatterStatsForPlayer(p.id, '—', 0, p.fullName, p.primaryPosition))
    )
    return NextResponse.json({ rows: rows.filter(Boolean) })
  }

  // ── BATTER: default — whole league, one bulk call. Team is now a filter,
  // not a precondition. ────────────────────────────────────────────────
  const all = await getAllBattersSeasonTable(season)
  const rows = teamId ? all.filter(r => r.teamId === teamId) : all
  return NextResponse.json({ rows })
}