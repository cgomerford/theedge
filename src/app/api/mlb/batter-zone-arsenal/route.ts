// src/app/api/mlb/batter-zone-arsenal/route.ts
//
// Public wrapper for the Batting Lab's "Vs Pitch Types" tab — same real
// getBatterZoneArsenal() data the admin scout-report tool already uses
// (see api/admin/batter-zone-arsenal/route.ts), just under the public
// /api/mlb/ namespace so the standalone Batting Lab doesn't depend on an
// admin-named route.

import { NextResponse } from 'next/server'
import { getBatterZoneArsenal } from '@/lib/batter-zone-arsenal'
import { requirePro } from '@/lib/require-pro'

export const revalidate = 1800

export async function GET(request: Request) {
  // Pro-only data (Batting / Pitching Lab). Enforced server-side — the UI lock is not the gate.
  const denied = await requirePro()
  if (denied) return denied
  const { searchParams } = new URL(request.url)
  const playerId = Number(searchParams.get('playerId'))
  if (!playerId) return NextResponse.json({ error: 'playerId query param required' }, { status: 400 })

  const arsenal = await getBatterZoneArsenal(playerId)
  return NextResponse.json({ arsenal })
}
