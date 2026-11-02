// Player tables for the admin scatter builder. Admin only (src/lib/admin-auth.ts). Read-only, public Savant leaderboards, cached an hour.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { getScatterDataset } from '@/lib/scatter-data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('dataset') ?? ''
  const season = Number(req.nextUrl.searchParams.get('season') ?? new Date().getFullYear())
  const ds = await getScatterDataset(id, season)
  if (!ds) return NextResponse.json({ error: 'No data for that table and season. Baseball Savant may not have it yet.' }, { status: 404 })
  return NextResponse.json(ds)
}
