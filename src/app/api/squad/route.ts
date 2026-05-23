import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import type { SquadLineup } from '@/lib/ultimate-team-types'

// ============================================================
// GET /api/squad — load the current user's squad
// ============================================================
export async function GET() {
  const subscriber = await getCurrentSubscriber()
  if (!subscriber) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Pro or admin gate
  if (!subscriber.is_pro && subscriber.role !== 'admin') {
    return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 })
  }

  const supa = createAdminClient()

  // Load squad
  const { data: squad } = await supa
    .from('ultimate_team_squads')
    .select('lineup, squad_grade, total_percentile')
    .eq('subscriber_id', subscriber.id)
    .single()

  if (!squad) {
    // No squad yet — return empty
    return NextResponse.json({ lineup: {}, players: {}, squad_grade: null, total_percentile: null })
  }

  // Resolve player IDs to full player data
  const lineup = squad.lineup as SquadLineup
  const playerIds = Object.values(lineup).filter((id): id is number => id != null)

  let players: Record<number, any> = {}
  if (playerIds.length > 0) {
    const { data: playerRows } = await supa
      .from('ultimate_team_players')
      .select('*')
      .in('player_id', playerIds)

    for (const p of playerRows ?? []) {
      players[p.player_id] = p
    }
  }

  return NextResponse.json({
    lineup,
    players,
    squad_grade: squad.squad_grade,
    total_percentile: squad.total_percentile,
  })
}

// ============================================================
// POST /api/squad — save/update the current user's squad
// ============================================================
export async function POST(req: NextRequest) {
  const subscriber = await getCurrentSubscriber()
  if (!subscriber) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Pro or admin gate
  if (!subscriber.is_pro && subscriber.role !== 'admin') {
    return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 })
  }

  const body = await req.json()
  const lineup = body.lineup as SquadLineup

  if (!lineup || typeof lineup !== 'object') {
    return NextResponse.json({ error: 'Invalid lineup' }, { status: 400 })
  }

  const supa = createAdminClient()

  // Resolve player IDs for grade computation
  const playerIds = Object.values(lineup).filter((id): id is number => id != null)
  let squadGrade: string | null = null
  let totalPercentile: number | null = null

  if (playerIds.length > 0) {
    const { data: playerRows } = await supa
      .from('ultimate_team_players')
      .select('position_percentile, grade')
      .in('player_id', playerIds)

    if (playerRows && playerRows.length > 0) {
      // Average percentile across all filled slots
      const percentiles = playerRows
        .map(p => p.position_percentile)
        .filter((p): p is number => p != null)

      if (percentiles.length > 0) {
        totalPercentile = Math.round(
          (percentiles.reduce((a, b) => a + b, 0) / percentiles.length) * 100
        ) / 100

        // Convert average percentile to letter grade
        if (totalPercentile >= 95) squadGrade = 'A+'
        else if (totalPercentile >= 85) squadGrade = 'A'
        else if (totalPercentile >= 65) squadGrade = 'B'
        else if (totalPercentile >= 35) squadGrade = 'C'
        else if (totalPercentile >= 15) squadGrade = 'D'
        else squadGrade = 'F'
      }
    }
  }

  // Upsert — creates if new, updates if exists
  const { error } = await supa
    .from('ultimate_team_squads')
    .upsert({
      subscriber_id: subscriber.id,
      lineup,
      squad_grade: squadGrade,
      total_percentile: totalPercentile,
    }, { onConflict: 'subscriber_id' })

  if (error) {
    console.error('Squad save failed:', error)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, squad_grade: squadGrade, total_percentile: totalPercentile })
}