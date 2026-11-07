// src/app/api/mlb/pitch-shape/diagnosis/route.ts
//
// "Where is it leaking?" for one pitcher: which pitch, which situation and which process measure (first-pitch strikes, zone, chase, repeats) account for the gap between his results and
// his shape. Pro only, refused server-side (the whole arsenal and every situation split are Pro data).
//   ?id=<pitcher id>&season=2026
import { NextRequest, NextResponse } from 'next/server'
import { requirePro } from '@/lib/require-pro'
import { getDiagnosis } from '@/lib/pitch-shape/diagnosis'

export async function GET(req: NextRequest) {
  const denied = await requirePro()
  if (denied) return denied
  const sp = new URL(req.url).searchParams
  const id = Number(sp.get('id')), season = Number(sp.get('season') ?? new Date().getFullYear())
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(season) || season < 2024 || season > new Date().getFullYear() + 1) return NextResponse.json({ error: 'Bad id or season' }, { status: 400 })
  return NextResponse.json({ diagnosis: await getDiagnosis(id, season) })
}
