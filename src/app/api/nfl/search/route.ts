// src/app/api/nfl/search/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { searchPlayersAndTeams } from '@/lib/nfl/queries'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  try {
    const results = await searchPlayersAndTeams(q)
    return NextResponse.json({ results })
  } catch (e) {
    console.error('nfl search error:', e)
    return NextResponse.json({ results: [] }, { status: 500 })
  }
}