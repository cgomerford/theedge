// src/lib/postgame/tomorrow.ts
//
// Pro §22 Into tomorrow — Scout teaser. For each club, two things about its next game:
//   · Arms: which relievers the night leaves with a heavy recent load — pitched on consecutive days, or
//     30+ pitches over the last three days including tonight (workload FACTS from bullpen.ts, not a
//     forecast of who is available), out of the relievers used tonight.
//   · Starter: the club's probable starter (from next.ts) with his season pitch mix and the same
//     count × pitch teaser §13 shows; the full read is that game's Scout Report.
// Read-only; reuses the cached bullpen, next-game and arsenal readers so it adds one arsenal query.

import type { PostData } from './data'
import { getBullpenNight, type Reliever } from './bullpen'
import { getNextUp, type NextGame } from './next'
import { getUsualArsenals } from './starters'
import type { Side } from './recap'

export const HEAVY = 30
export type TomorrowSide = {
  side: Side
  next: NextGame | null
  arms: (Reliever & { why: string })[]
  used: number                         // relievers who pitched tonight
  mix: { code: string; name: string; pct: number; velo: number | null }[]
}

export async function getTomorrow(d: PostData, gameDate: string, startIso: string): Promise<TomorrowSide[]> {
  const [pens, next] = await Promise.all([getBullpenNight(d, gameDate), getNextUp(d, gameDate, startIso)])
  const starters = next.flatMap((g) => (g.starter ? [g.starter.id] : []))
  const usual = await getUsualArsenals(starters, Number(gameDate.slice(0, 4)))
  return (['away', 'home'] as Side[]).map((side) => {
    const pen = pens.find((p) => p.side === side)
    const nx = next.find((g) => g.side === side) ?? null
    const arms = (pen?.relievers ?? []).filter((r) => r.streak || r.threeDay >= HEAVY)
      .map((r) => ({ ...r, why: r.streak === 'three straight' ? 'three days in a row' : r.streak === 'back-to-back' ? 'back-to-back' : `${r.threeDay} pitches in 3 days` }))
      .sort((a, b) => b.threeDay - a.threeDay)
    const ua = nx?.starter ? usual.get(nx.starter.id)?.arsenal : undefined
    const mix = Object.entries(ua ?? {}).map(([code, p]) => ({ code, name: p.pitch_name ?? code, pct: Number(p.usage_pct ?? 0), velo: p.avg_velo != null ? Number(p.avg_velo) : null }))
      .filter((m) => m.pct >= 5).sort((a, b) => b.pct - a.pct).slice(0, 5)
    return { side, next: nx, arms, used: pen?.relievers.length ?? 0, mix }
  })
}
