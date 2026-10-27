import { NextRequest, NextResponse } from 'next/server'
import { getBatterPitchLog, type BatterPitchLog, type RawBatterPitch } from '@/lib/batter-pitch-log'
import { canReadDeepData } from '@/lib/deep-look'
import { aggToArr, aggregate } from '@/lib/zone-stats'

export const dynamic = 'force-dynamic'

const FIRST = 2015   // Statcast era

// Several seasons of one batter, a few at a time (each season is one cached Savant pull).
async function seasons(batterId: number, from: number, to: number): Promise<BatterPitchLog[]> {
  const ys: number[] = []
  for (let y = to; y >= from; y--) ys.push(y)
  const out: BatterPitchLog[] = []
  for (let i = 0; i < ys.length; i += 4) {
    const got = await Promise.all(ys.slice(i, i + 4).map(y => getBatterPitchLog(batterId, y).catch(() => null)))
    for (const g of got) if (g) out.push(g)
  }
  return out
}
const join = (logs: BatterPitchLog[]): BatterPitchLog => ({ ...logs[0], pitches: logs.flatMap(l => l.pitches), pitchNames: Object.assign({}, ...logs.map(l => l.pitchNames)), pitcherNames: Object.assign({}, ...logs.map(l => l.pitcherNames)) })
const zp = (b: RawBatterPitch) => ({ zone: b.zone, description: b.description, result: b.result, isHit: b.isHit, exitVelo: b.launchSpeed, woba: b.woba, xwoba: b.xwoba, wobaDen: b.wobaDen })

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const batterId = Number(searchParams.get('batterId'))
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  if (!batterId) return NextResponse.json({ error: 'batterId required' }, { status: 400 })
  // Everyone gets the log the free vs-pitch-type and Location tabs need: each pitch's type, location, speed, spin, break, flight, result and
  // contact. The rest (which game, which at-bat, which pitcher, runners, inning: what Sequencing, H2H and the overlay are built on) goes only
  // to Pro or the viewer's deep look for this batter, and so do the career, summary and single-pitcher modes. Enforced here; the UI lock is not the gate.
  const full = await canReadDeepData('batting_lab', String(batterId))
  const range = searchParams.get('range') === 'career' ? 'career' : 'season'
  const summary = searchParams.get('summary')
  const pitcherId = Number(searchParams.get('pitcherId'))
  if (!full && (range === 'career' || summary || pitcherId)) return Response.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })

  const logs = range === 'career' ? await seasons(batterId, FIRST, season) : [await getBatterPitchLog(batterId, season)].filter((x): x is BatterPitchLog => !!x)
  if (logs.length === 0) return NextResponse.json({ error: 'no data' }, { status: 404 })
  const log = join(logs)

  if (summary === 'matchups') {
    const by = new Map<string, { g: number; d: string; tb: 'T' | 'B' | null; p: number; ps: RawBatterPitch[] }>()
    for (const b of log.pitches) {
      if (b.pitcherId == null || b.gamePk == null) continue
      const k = `${b.gamePk}|${b.topBot}|${b.pitcherId}`
      if (!by.has(k)) by.set(k, { g: b.gamePk, d: b.date, tb: b.topBot, p: b.pitcherId, ps: [] })
      by.get(k)!.ps.push(b)
    }
    const rows = [...by.values()].map(r => {
      let k = 0, bb = 0, hr = 0
      for (const b of r.ps) {
        if (b.wobaDen == null || b.wobaDen <= 0) continue
        const ev = b.result ?? ''
        if (ev.startsWith('strikeout')) k++
        else if (ev === 'walk' || ev === 'intent_walk') bb++
        else if (ev === 'home_run') hr++
      }
      return { g: r.g, d: r.d, tb: r.tb, p: r.p, a: aggToArr(aggregate(r.ps.map(zp)).all), k, bb, hr }
    })
    const names: Record<number, string> = {}
    for (const r of rows) names[r.p] = log.pitcherNames[r.p] ?? `#${r.p}`
    return NextResponse.json({ rows, names })
  }
  if (pitcherId) {
    return NextResponse.json({ ...log, pitches: log.pitches.filter(b => b.pitcherId === pitcherId), pitcherNames: { [pitcherId]: log.pitcherNames[pitcherId] ?? `#${pitcherId}` } })
  }
  if (!full) {
    return NextResponse.json({
      ...log, pitcherNames: {},
      pitches: log.pitches.map(b => ({ ...b, gamePk: null, atBatNumber: null, pitchNumber: null, pitcherId: null, inning: null, onBase: { first: false, second: false, third: false } })),
    })
  }
  return NextResponse.json(log)
}
