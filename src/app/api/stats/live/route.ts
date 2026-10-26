// src/app/api/stats/live/route.ts
//
// GET /api/stats/live — which games in progress right now are in the situation the person has set up?
// Open to everyone (filters are Pro only): signed out gets each game's 3 newest pitch lines, a free account the full pitch-by-pitch. The filters come in the same shape as /api/stats/query (a `split` chip code and/or a `deep`
// JSON object) and are validated the same way before use.

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { isProViewer } from '@/lib/require-pro'
import { checkLive } from '@/lib/stats-live'
import { deepSupports, deepToParams, type DeepFilters, type Group } from '@/lib/stats-query-catalog'

export const maxDuration = 30

const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : undefined)

export async function GET(req: NextRequest) {
  const signedIn = !!(await getCurrentSubscriber())
  const sp = new URL(req.url).searchParams
  // The base live feed is open (signed out is trimmed below). Filters (the finder) are Pro only: refused here, not just hidden in the UI.
  if ((sp.get('split') || sp.get('deep')) && !(await isProViewer())) return NextResponse.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
  const gp = sp.get('group')
  const group: Group = gp === 'pitching' ? 'pitching' : 'hitting'

  const stack: string[] = []
  const split = sp.get('split') ?? ''
  if (split && deepSupports(split, group)) stack.push(split)
  let deep: DeepFilters = { stack }
  const raw = sp.get('deep')
  if (raw) {
    try {
      const d = JSON.parse(raw) as Record<string, unknown>
      deep = {
        stack: (Array.isArray(d.stack) ? d.stack : []).filter((c): c is string => typeof c === 'string' && deepSupports(c, group)).slice(0, 12),
        pitchesMin: num(d.pitchesMin, 1, 30), pitchesMax: num(d.pitchesMax, 1, 30),
        inningFrom: num(d.inningFrom, 1, 20), inningTo: num(d.inningTo, 1, 20),
        scoreMin: num(d.scoreMin, -30, 30), scoreMax: num(d.scoreMax, -30, 30),
        // a result (single, home_run, ...) can't be judged on a play still in progress, so the live check ignores it
      }
    } catch {
      return NextResponse.json({ error: 'Could not read the filters.' }, { status: 400 })
    }
  }
  try {
    const live = await checkLive(deepToParams(deep, group))
    // Signed out: the live cards and only the 3 newest summary lines per game.
    const out = signedIn ? live : { ...live, games: live.games.map(g => ({ ...g, sequence: g.sequence.slice(-3) })) }
    return NextResponse.json(out, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('[stats/live] failed:', (e as Error).message)
    return NextResponse.json({ error: 'MLB Stats API did not respond. Try again in a moment.' }, { status: 502 })
  }
}
