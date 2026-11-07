// src/app/api/mlb/pitch-shape/why/route.ts
//
// "Why aren't the results there?" for one pitcher's one pitch: platoon, location and sequencing effects, and speed and extension, against league pitches of the same shape.
// Pro only, refused server-side.
//   ?id=<pitcher id>&season=2026&type=FF&halfHb=1&halfIvb=1   (half-widths of the movement box, inches)
import { NextRequest, NextResponse } from 'next/server'
import { requirePro } from '@/lib/require-pro'
import { getWhy } from '@/lib/pitch-shape/diagnosis'

export async function GET(req: NextRequest) {
  const denied = await requirePro()
  if (denied) return denied
  const sp = new URL(req.url).searchParams
  const id = Number(sp.get('id')), season = Number(sp.get('season') ?? new Date().getFullYear()), type = sp.get('type') ?? ''
  const halfHb = Number(sp.get('halfHb') ?? 1), halfIvb = Number(sp.get('halfIvb') ?? 1)
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(season) || season < 2024 || season > new Date().getFullYear() + 1 || !(halfHb >= 0.5 && halfHb <= 8) || !(halfIvb >= 0.5 && halfIvb <= 8)) {
    return NextResponse.json({ error: 'Bad id, season or window' }, { status: 400 })
  }
  return NextResponse.json({ why: await getWhy(id, season, type, halfHb, halfIvb) })
}
