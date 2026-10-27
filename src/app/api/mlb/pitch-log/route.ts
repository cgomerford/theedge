import { NextRequest, NextResponse } from 'next/server'
import { getPitcherPitchLog } from '@/lib/pitcher-pitch-log'
import { requireDeepLook } from '@/lib/deep-look'
import { aggToArr, aggregate } from '@/lib/zone-stats'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Pro-only data (Batting / Pitching Lab). Enforced server-side — the UI lock is not the gate.
  const denied = await requireDeepLook('pitching_lab', new URL(req.url).searchParams.get('playerId'))
  if (denied) return denied
  const { searchParams } = new URL(req.url)
  const playerId = Number(searchParams.get('playerId'))
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  const pitchType = searchParams.get('pitchType')
  const range = searchParams.get('range') === 'career' ? 'career' : 'season'
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

  const log = await getPitcherPitchLog(playerId, season, range)
  if (!log) return NextResponse.json({ error: 'no data' }, { status: 404 })
  // summary=faced: every hitter this pitcher has faced in the range, with pitches and plate appearances, and no pitch rows (small).
  if (searchParams.get('summary') === 'faced') {
    const by = new Map<number, { pitches: number; pa: number }>()
    for (const p of log.pitches) {
      if (p.batterId == null) continue
      const e = by.get(p.batterId) ?? { pitches: 0, pa: 0 }
      e.pitches++
      if (p.wobaDen != null && p.wobaDen > 0) e.pa++
      by.set(p.batterId, e)
    }
    return NextResponse.json({ pitcherId: log.pitcherId, throws: log.throws, faced: [...by.entries()].map(([id, e]) => ({ id, name: log.batterNames[id] ?? `#${id}`, ...e })).sort((a, b) => b.pa - a.pa) })
  }
  // summary=matchups: one compact row per game, side of the inning and hitter (counts only, no pitches), for team and ballpark summaries.
  if (searchParams.get('summary') === 'matchups') {
    const by = new Map<string, { g: number; d: string; tb: 'T' | 'B' | null; b: number; ps: typeof log.pitches }>()
    for (const p of log.pitches) {
      if (p.batterId == null || p.gamePk == null) continue
      const k = `${p.gamePk}|${p.topBot}|${p.batterId}`
      if (!by.has(k)) by.set(k, { g: p.gamePk, d: p.date, tb: p.topBot, b: p.batterId, ps: [] })
      by.get(k)!.ps.push(p)
    }
    const rows = [...by.values()].map(r => {
      let k = 0, bb = 0, hr = 0
      for (const p of r.ps) {
        if (p.wobaDen == null || p.wobaDen <= 0) continue
        const ev = p.result ?? ''
        if (ev.startsWith('strikeout')) k++
        else if (ev === 'walk' || ev === 'intent_walk') bb++
        else if (ev === 'home_run') hr++
      }
      return { g: r.g, d: r.d, tb: r.tb, b: r.b, a: aggToArr(aggregate(r.ps).all), k, bb, hr }
    })
    const names: Record<number, string> = {}
    for (const r of rows) names[r.b] = log.batterNames[r.b] ?? `#${r.b}`
    return NextResponse.json({ throws: log.throws, rows, names })
  }
  // batterId=: only the pitches to that hitter.
  const batterId = Number(searchParams.get('batterId'))
  if (batterId) {
    return NextResponse.json({ ...log, pitches: log.pitches.filter(p => p.batterId === batterId), batterNames: { [batterId]: log.batterNames[batterId] ?? `#${batterId}` } })
  }
  if (pitchType && pitchType !== 'ALL') {
    return NextResponse.json({ ...log, pitches: log.pitches.filter(p => p.pitchType === pitchType) })
  }
  return NextResponse.json(log)
}
