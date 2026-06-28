// src/app/api/lab/search/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { searchPeople } from '@/lib/lab'

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ people: [] })
  const people = await searchPeople(q)
  return NextResponse.json({ people })
}
