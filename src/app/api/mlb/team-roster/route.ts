// src/app/api/mlb/team-roster/route.ts
//
// A club's 40-man roster, hitters only (pitchers left out), from the MLB Stats API. Public data, cached an hour. Used by the Pitching Lab
// H2H tab to list who a pitcher could be set against once a team is chosen.
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const teamId = Number(sp.get('teamId'))
  const pitchers = sp.get('pos') === 'pitchers'
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=40Man`, { next: { revalidate: 3600 } })
    if (!res.ok) { console.error('[team-roster] HTTP', res.status, teamId); return NextResponse.json({ error: 'roster unavailable' }, { status: 502 }) }
    const json = await res.json()
    const players = (json.roster ?? [])
      .filter((r: any) => (pitchers ? r.position?.type === 'Pitcher' : r.position?.type !== 'Pitcher') && r.person?.id)
      .map((r: any) => ({ id: r.person.id as number, name: (r.person.fullName ?? '') as string, pos: (r.position?.abbreviation ?? '') as string }))
    return NextResponse.json({ players })
  } catch (e) {
    console.error('[team-roster] failed:', (e as Error).message)
    return NextResponse.json({ error: 'roster unavailable' }, { status: 502 })
  }
}
