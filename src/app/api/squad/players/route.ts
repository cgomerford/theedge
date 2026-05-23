import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

// ============================================================
// GET /api/squad/players?position=SS&search=turner
// Returns filtered player pool for the picker modal
// ============================================================
export async function GET(req: NextRequest) {
  const subscriber = await getCurrentSubscriber()
  if (!subscriber) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (!subscriber.is_pro && subscriber.role !== 'admin') {
    return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const position = searchParams.get('position')  // e.g. 'SS', 'SP', 'RP'
  const search = searchParams.get('search') ?? ''

  const supa = createAdminClient()

  let query = supa
    .from('ultimate_team_players')
    .select('*')
    .order('position_percentile', { ascending: false })
    .limit(50)

  if (position) {
    query = query.eq('primary_position', position)
  }

  if (search.trim()) {
    query = query.ilike('full_name', `%${search.trim()}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('Player pool fetch failed:', error)
    return NextResponse.json({ error: 'Fetch failed' }, { status: 500 })
  }

  return NextResponse.json({ players: data ?? [] })
}