// src/app/api/lab/season-trend/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getBatterSeasonProgression, getCurrentTeamId } from '@/lib/lab'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const season = searchParams.get('season')

  if (!id || Number.isNaN(Number(id))) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }
  const playerId = Number(id)

  try {
    const [points, teamId] = await Promise.all([
      getBatterSeasonProgression(playerId, season ? Number(season) : new Date().getFullYear()),
      getCurrentTeamId(playerId),
    ])
    return NextResponse.json({ points, teamId })
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to load season trend', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    )
  }
}