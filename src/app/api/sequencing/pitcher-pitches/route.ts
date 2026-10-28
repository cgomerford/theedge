// src/app/api/sequencing/pitcher-pitches/route.ts
//
// Sequencing Lab → "start from a pitcher's pitch". Sign-up members only. Returns one pitcher's pitch types with their average speed and measured break (the stored
// pitch_shape_pitcher rows, the same numbers the Pitching Lab shows) and his throwing hand (read from one of his stored pitches), so the finder's sliders can start where his pitch is.

import { NextResponse } from 'next/server'
import { isSignedIn } from '@/lib/require-signup'
import { getPitcherShape } from '@/lib/sequencing-lab/data'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await isSignedIn())) return NextResponse.json({ error: 'signin' }, { status: 401 })
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  const season = new Date().getFullYear()
  const shape = await getPitcherShape(id, season)
  const { data, error } = await createAdminClient().from('pitch_events').select('p_throws').eq('pitcher_id', id).not('p_throws', 'is', null).limit(1)
  if (error) console.error('[pitcher-pitches] hand lookup:', error.message)
  const hand = (data as { p_throws: string | null }[] | null)?.[0]?.p_throws
  const pitches = Object.entries(shape).filter(([, v]) => v.velo != null && v.hb != null && v.ivb != null).map(([t, v]) => ({ t, n: v.n, velo: v.velo as number, hb: v.hb as number, ivb: v.ivb as number })).sort((a, b) => b.n - a.n)
  return NextResponse.json({ hand: hand === 'L' || hand === 'R' ? hand : null, pitches })
}
