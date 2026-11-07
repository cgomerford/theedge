// GET /api/admin/pitch-shape-graphic
//   ?q=<name>                                   search pitchers (every pitch type: this route is admin only)
//   ?id=<pitcher id>&type=<FF|SI|...>           everything one pitch graphic needs (his line vs the league, why, the map)
//   &velo=&ivb=&hb=&slot=                       optional changes (in mph / inches / degrees) for the "what if" graphic
// Admin only (src/lib/admin-auth.ts). Read-only; every number is read from the same tables as the Pitch Shape Lab.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { getShapeGraphicData } from '@/lib/pitch-shape/graphic-data'
import { searchPitchers } from '@/lib/pitch-shape/data'
import { PITCH_NAMES, type Shape } from '@/lib/pitch-shape/model'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const q = req.nextUrl.searchParams
  const term = q.get('q')
  if (term != null) return NextResponse.json({ pitchers: term.trim().length >= 2 ? await searchPitchers(term.trim(), true) : [] })
  const id = Number(q.get('id'))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const type = q.get('type')
  if (type && !(type in PITCH_NAMES)) return NextResponse.json({ error: 'bad type' }, { status: 400 })
  const num = (k: string) => { const v = q.get(k); const n = v == null || v === '' ? null : Number(v); return n != null && Number.isFinite(n) && Math.abs(n) <= 40 ? n : null }
  const deltas: Partial<Shape> = {}
  for (const k of ['velo', 'ivb', 'hb', 'slot'] as const) { const n = num(k); if (n != null) deltas[k] = n }
  const data = await getShapeGraphicData(id, type, Object.keys(deltas).length ? deltas : null)
  return NextResponse.json({ data })
}
