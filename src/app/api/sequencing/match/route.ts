// src/app/api/sequencing/match/route.ts
//
// Sequencing Lab → stack the at-bat. Sign-up members only. Takes a stack of up to 6 pitches (?spec=<json>) and returns the real at-bats that match it: how many, how they ended,
// what came next, and the most recent few with the names. Matching runs in memory on the at-bat index (see ab-load.ts); nothing is written.

import { NextResponse } from 'next/server'
import { isSignedIn } from '@/lib/require-signup'
import { loadAbIndex, loadClusterMap } from '@/lib/sequencing-lab/ab-load'
import { matchSequence, MAX_STACK, type MatchSpec, type PitchSpec, type ResultCode } from '@/lib/sequencing-lab/ab-index'
import { throttledMlbFetch } from '@/lib/mlb-fetch-limiter'

export const dynamic = 'force-dynamic'

const RES = new Set(['B', 'C', 'W', 'F', 'XH', 'XO'])
const n = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null)

function clean(raw: unknown): MatchSpec | null {
  const o = raw as Partial<MatchSpec> | null
  if (!o || (o.hand !== 'R' && o.hand !== 'L') || !Array.isArray(o.pitches) || o.pitches.length === 0 || o.pitches.length > MAX_STACK) return null
  const pitches: PitchSpec[] = []
  for (const p of o.pitches as Partial<PitchSpec>[]) {
    const speed = n(p.speed, 40, 110), hb = n(p.hb, -40, 40), ivb = n(p.ivb, -40, 40)
    if (typeof p.t !== 'string' || !/^[A-Z]{2}$/.test(p.t) || speed == null || hb == null || ivb == null) return null
    pitches.push({ t: p.t, speed, hb, ivb, zone: n(p.zone, 1, 14), res: p.res && RES.has(p.res) ? (p.res as ResultCode) : null })
  }
  const id = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null)
  const c = o.count && n(o.count.balls, 0, 3) != null && n(o.count.strikes, 0, 2) != null ? { balls: o.count.balls, strikes: o.count.strikes } : null
  return { hand: o.hand, stand: o.stand === 'R' || o.stand === 'L' ? o.stand : null, mode: o.mode === 'any' ? 'any' : 'start', pitches, pitcherId: id(o.pitcherId), batterId: id(o.batterId), clusterId: typeof o.clusterId === 'number' && Number.isInteger(o.clusterId) && o.clusterId >= 0 ? o.clusterId : null, count: c }
}

export async function GET(req: Request) {
  if (!(await isSignedIn())) return NextResponse.json({ error: 'signin' }, { status: 401 })
  let spec: MatchSpec | null = null
  try { spec = clean(JSON.parse(new URL(req.url).searchParams.get('spec') ?? 'null')) } catch { spec = null }
  if (!spec) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  const ix = await loadAbIndex(new Date().getFullYear())
  if (!ix) return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  const clusters = spec.clusterId != null ? await loadClusterMap(new Date().getFullYear(), spec.hand) : undefined
  const result = matchSequence(ix, spec, 8, { clusters })
  // Names for the few at-bats shown: one batched call to the MLB people API (free, cached a day). If it fails the at-bats still show, without names.
  const names: Record<number, string> = {}
  const ids = [...new Set(result.samples.flatMap(s => [s.pitcherId, s.batterId]))]
  if (ids.length) {
    try {
      const res = await throttledMlbFetch(`https://statsapi.mlb.com/api/v1/people?personIds=${ids.join(',')}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) })
      if (res.ok) for (const p of ((await res.json()).people ?? []) as { id: number; fullName: string }[]) names[p.id] = p.fullName
      else console.error('[sequencing match] names HTTP', res.status)
    } catch (err) { console.error('[sequencing match] names failed:', err instanceof Error ? err.message : err) }
  }
  return NextResponse.json({ ...result, names })
}
