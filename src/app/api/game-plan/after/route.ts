// src/app/api/game-plan/after/route.ts
//
// Game Plan Card → "After the game": what the starter actually threw to each hitter, read from the stored pitches of that one game (game_pk and pitcher, small and indexed).
// Free sign-up. Returns the plate appearances in order with each pitch; an empty list means the game's pitches are not stored yet (they load the morning after). Read-only.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { isSignedIn } from '@/lib/require-signup'

export const dynamic = 'force-dynamic'

export type AfterPitch = { n: number; t: string | null; z: number | null; desc: string | null; balls: number | null; strikes: number | null; speed: number | null; xwoba: number | null }
export type AfterPa = { ab: number; batterId: number; stand: 'L' | 'R' | null; event: string | null; pitches: AfterPitch[] }

export async function GET(req: Request) {
  if (!(await isSignedIn())) return NextResponse.json({ error: 'signin' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const gamePk = Number(q.get('gamePk')), pitcherId = Number(q.get('pitcherId'))
  if (!Number.isInteger(gamePk) || gamePk <= 0 || !Number.isInteger(pitcherId) || pitcherId <= 0) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  const { data, error } = await createAdminClient().from('pitch_events')
    .select('at_bat_number, pitch_number, batter_id, pitch_type, zone, description, events, balls, strikes, release_speed, stand, estimated_woba')
    .eq('game_pk', gamePk).eq('pitcher_id', pitcherId).order('at_bat_number').order('pitch_number').limit(1000)
  if (error) { console.error('[game-plan after] Supabase error:', error.message); return NextResponse.json({ error: 'unavailable' }, { status: 503 }) }
  const num = (v: unknown) => (v == null ? null : Number(v))
  const pas = new Map<number, AfterPa>()
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const ab = Number(r.at_bat_number)
    const pa = pas.get(ab) ?? { ab, batterId: Number(r.batter_id), stand: r.stand === 'L' || r.stand === 'R' ? r.stand : null, event: null, pitches: [] }
    pa.pitches.push({ n: Number(r.pitch_number), t: (r.pitch_type as string | null) ?? null, z: num(r.zone), desc: (r.description as string | null) ?? null, balls: num(r.balls), strikes: num(r.strikes), speed: num(r.release_speed), xwoba: num(r.estimated_woba) })
    if (r.events) pa.event = String(r.events)
    pas.set(ab, pa)
  }
  return NextResponse.json({ pas: [...pas.values()] }, { headers: { 'Cache-Control': 'private, max-age=60' } })
}
