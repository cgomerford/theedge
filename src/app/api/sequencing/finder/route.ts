// src/app/api/sequencing/finder/route.ts
//
// Sequencing Lab → League pitch finder. Sign-up members only. Calls the read-only SQL function league_pitch_finder (supabase/migrations/20261030120000_league_pitch_finder.sql)
// on the stored pitch_events rows and returns one row per result with the number of pitches and their average plate crossing, release point, speed and break.
// Read-only; nothing is written. If the function is not installed yet the answer says so, with no stand-in numbers.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { isSignedIn } from '@/lib/require-signup'

export const dynamic = 'force-dynamic'

const TYPES = new Set(['FF', 'SI', 'FC', 'SL', 'ST', 'SV', 'CU', 'KC', 'CS', 'CH', 'FS', 'FO', 'EP', 'KN', 'SC'])
const num = (v: string | null, lo: number, hi: number): number | null => {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) && x >= lo && x <= hi ? x : null
}

export type FinderRow = { result: string; n: number; plateX: number | null; plateZ: number | null; relX: number | null; relZ: number | null; ext: number | null; speed: number | null; spin: number | null; hb: number | null; ivb: number | null }

export async function GET(req: Request) {
  if (!(await isSignedIn())) return NextResponse.json({ error: 'signin' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const type = (q.get('type') ?? '').toUpperCase()
  const hand = q.get('hand')
  if (!TYPES.has(type) || (hand !== 'R' && hand !== 'L')) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  const stand = q.get('stand')
  const season = num(q.get('season'), 2015, 2100) ?? new Date().getFullYear()
  const { data, error } = await createAdminClient().rpc('league_pitch_finder', {
    p_type: type, p_hand: hand, p_season: season,
    p_speed_lo: num(q.get('slo'), 40, 110), p_speed_hi: num(q.get('shi'), 40, 110),
    p_hb_lo: num(q.get('hlo'), -40, 40), p_hb_hi: num(q.get('hhi'), -40, 40),
    p_ivb_lo: num(q.get('vlo'), -40, 40), p_ivb_hi: num(q.get('vhi'), -40, 40),
    p_zone: num(q.get('zone'), 1, 14), p_stand: stand === 'R' || stand === 'L' ? stand : null,
    p_balls: num(q.get('balls'), 0, 3), p_strikes: num(q.get('strikes'), 0, 2),
  })
  if (error) {
    console.error('[sequencing finder] Supabase error:', error.message)
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }
  const n = (v: unknown) => (v == null ? null : Number(v))
  const rows: FinderRow[] = ((data ?? []) as Record<string, unknown>[]).map(r => ({
    result: String(r.result), n: Number(r.n), plateX: n(r.avg_plate_x), plateZ: n(r.avg_plate_z), relX: n(r.avg_rel_x), relZ: n(r.avg_rel_z),
    ext: n(r.avg_ext), speed: n(r.avg_speed), spin: n(r.avg_spin), hb: n(r.avg_hb), ivb: n(r.avg_ivb),
  }))
  return NextResponse.json({ rows }, { headers: { 'Cache-Control': 'private, max-age=300' } })
}
