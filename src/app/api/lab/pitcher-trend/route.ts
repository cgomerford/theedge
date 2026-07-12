import { NextRequest, NextResponse } from 'next/server'
import { getPitcherSeasonProgression } from '@/lib/lab'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const season = searchParams.get('season')
  if (!id || Number.isNaN(Number(id))) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }
  const playerId = Number(id)
  const seasonNum = season ? Number(season) : new Date().getFullYear()

  try {
    const supa = createAdminClient()
    const [points, teamRes] = await Promise.all([
      getPitcherSeasonProgression(playerId, seasonNum),
      supa.from('pitcher_stats').select('team_id').eq('player_id', playerId).eq('season', seasonNum).maybeSingle(),
    ])
    const teamId = teamRes.error ? null : (teamRes.data as any)?.team_id ?? null
    return NextResponse.json({ points, teamId })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to load pitcher trend', detail: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}