// src/app/api/mlb/pitch-shape/pitchers/route.ts
//
// Pitcher search for the Shape Sandbox. Free viewers only receive four-seam and sweeper shapes; the
// other pitch types are Pro and are filtered out here, server-side — the UI is not the gate.

import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { searchPitchers } from '@/lib/pitch-shape/data'

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') ?? ''
  const pitchers = await searchPitchers(q, await isProViewer())
  return NextResponse.json({ pitchers })
}
