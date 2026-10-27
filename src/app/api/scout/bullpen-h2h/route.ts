// src/app/api/scout/bullpen-h2h/route.ts
//
// Career head-to-head, every listed reliever against every listed hitter, from the MLB Stats API (stats=vsPlayerTotal): public numbers, cached six hours.
// The Scout Report's Bullpen tab calls it only when its "against the lineup" views are opened, never while the page renders.
// At most 12 arms and 12 hitters per call, fetched 8 at a time.
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const MLB = 'https://statsapi.mlb.com/api/v1'
export type H2HCell = { arm: number; hitter: number; pa: number; ab: number; h: number; hr: number; bb: number; k: number; avg: number | null; ops: number | null }

const ids = (v: string | null) => (v ?? '').split(',').map(Number).filter(n => Number.isFinite(n) && n > 0).slice(0, 12)
const num = (v: unknown): number | null => { const n = Number(v); return v == null || v === '' || v === '.---' || !Number.isFinite(n) ? null : n }

async function one(arm: number, hitter: number): Promise<H2HCell> {
  const blank: H2HCell = { arm, hitter, pa: 0, ab: 0, h: 0, hr: 0, bb: 0, k: 0, avg: null, ops: null }
  try {
    const r = await fetch(`${MLB}/people/${hitter}/stats?stats=vsPlayerTotal&group=hitting&opposingPlayerId=${arm}`, { next: { revalidate: 21600 }, signal: AbortSignal.timeout(8000) })
    if (!r.ok) return blank
    const st = (await r.json())?.stats?.[0]?.splits?.[0]?.stat
    if (!st) return blank
    return { arm, hitter, pa: num(st.plateAppearances) ?? ((num(st.atBats) ?? 0) + (num(st.baseOnBalls) ?? 0) + (num(st.hitByPitch) ?? 0)), ab: num(st.atBats) ?? 0, h: num(st.hits) ?? 0, hr: num(st.homeRuns) ?? 0, bb: num(st.baseOnBalls) ?? 0, k: num(st.strikeOuts) ?? 0, avg: num(st.avg), ops: num(st.ops) }
  } catch (e) { console.error('[bullpen-h2h] failed:', arm, hitter, (e as Error).message); return blank }
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const arms = ids(sp.get('arms')), hitters = ids(sp.get('hitters'))
  if (arms.length === 0 || hitters.length === 0) return NextResponse.json({ error: 'arms and hitters required' }, { status: 400 })
  const pairs = arms.flatMap(a => hitters.map(h => [a, h] as const))
  const cells: H2HCell[] = []
  for (let i = 0; i < pairs.length; i += 8) cells.push(...await Promise.all(pairs.slice(i, i + 8).map(([a, h]) => one(a, h))))
  return NextResponse.json({ cells })
}
