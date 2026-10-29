// src/app/api/second-look/pairs/route.ts
//
// Second Look → "Show more": the next page of matching pairs (newest first) for the choices on the page. Free sign-up for the league view; the pitcher and hitter views are Pro
// (checked here, so nothing for them is sent to anyone else). Reads league_pa_pairs, indexed by hand, side, result and last pitch; read-only.

import { NextResponse } from 'next/server'
import { isSignedIn } from '@/lib/require-signup'
import { getViewerTier } from '@/lib/require-pro'
import { getMorePairs, RESULT_CLASSES, type ResultClass, type Scope } from '@/lib/second-look/data'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await isSignedIn())) return NextResponse.json({ error: 'signin' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const scope: Scope = q.get('scope') === 'pitcher' || q.get('scope') === 'batter' ? (q.get('scope') as Scope) : 'league'
  if (scope !== 'league' && (await getViewerTier()) !== 'pro') return NextResponse.json({ error: 'pro' }, { status: 403 })
  const id = Number(q.get('id')), offset = Number(q.get('offset'))
  const ended = q.get('ended')
  const pitch = q.get('pitch'), opened = q.get('opened')
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  const res = await getMorePairs({
    hand: q.get('hand') === 'L' ? 'L' : 'R', stand: q.get('stand') === 'R' ? 'R' : 'L',
    result: RESULT_CLASSES.includes(ended as ResultClass) ? (ended as ResultClass) : 'ALL',
    pitch: /^[A-Z]{2}$/.test(pitch ?? '') ? pitch : null, opened: scope === 'league' && /^[A-Z]{2}$/.test(opened ?? '') ? opened : null,
    scope, id: Number.isInteger(id) && id > 0 ? id : null,
  }, offset)
  if (!res) return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  return NextResponse.json(res)
}
