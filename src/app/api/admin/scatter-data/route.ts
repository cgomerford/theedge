// Player tables for the admin scatter builder. Admin only (src/lib/admin-auth.ts). Read-only, public Savant leaderboards, cached an hour.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { getScatterDataset } from '@/lib/scatter-data'
import { cleanSit, SIT_DEFAULT } from '@/lib/graphics/situations'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('dataset') ?? ''
  const season = Number(req.nextUrl.searchParams.get('season') ?? new Date().getFullYear())
  // the situation for the team tables: only listed options survive cleanSit
  let sit = SIT_DEFAULT
  try { const raw = req.nextUrl.searchParams.get('sit'); if (raw) sit = cleanSit(JSON.parse(raw)) } catch { /* bad JSON means no filter */ }
  const ds = await getScatterDataset(id, season, req.nextUrl.searchParams.get('lite') === '1', sit)
  if (!ds) return NextResponse.json({ error: 'No data for that table and season. Baseball Savant may not have it yet.' }, { status: 404 })
  return NextResponse.json(ds)
}
