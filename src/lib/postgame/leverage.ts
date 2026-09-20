// src/lib/postgame/leverage.ts
//
// Pro §19 Leverage timeline — MLB's own leverage index for every plate appearance (winProbability
// feed, `leverageIndex`, 1.0 = an average situation), plotted across the game, with a result strip and
// the highest-leverage plate appearances listed. High leverage = 2.0+ (MLB's usual "high" cut). Each
// club's results in those spots come from the plate appearances' own outcomes (hits / at-bats, K, BB).

import type { PostData } from './data'
import type { Side } from './recap'

export const HIGH_LI = 2.0
export type Cat = 'hr' | 'hit' | 'walk' | 'k' | 'out' | 'other'
const HIT = new Set(['single', 'double', 'triple']), WALK = new Set(['walk', 'intent_walk', 'hit_by_pitch'])
const K = new Set(['strikeout', 'strikeout_double_play'])
const NOT_AB = new Set(['walk', 'intent_walk', 'hit_by_pitch', 'sac_fly', 'sac_bunt', 'catcher_interf'])
export const catOf = (et: string): Cat => (et === 'home_run' ? 'hr' : HIT.has(et) ? 'hit' : WALK.has(et) ? 'walk' : K.has(et) ? 'k' : et ? 'out' : 'other')

export type LevPa = { i: number; eventType: string; inning: number; top: boolean; li: number; cat: Cat; event: string; batter: string; pitcher: string; wpa: number; text: string }
export type LevSide = { side: Side; pa: number; ab: number; h: number; k: number; bb: number; hr: number; wpa: number }
export type Leverage = { pas: LevPa[]; high: number; total: number; top: LevPa[]; sides: LevSide[]; peak: number }

export function buildLeverage(d: PostData): Leverage | null {
  const pas: LevPa[] = d.wp.filter((e) => e.leverageIndex != null && Number.isFinite(Number(e.leverageIndex))).map((e, i) => {
    const et = e.result.eventType ?? ''
    const top = e.about.isTopInning ?? e.about.halfInning === 'top'
    const homeGain = Number(e.homeTeamWinProbabilityAdded ?? 0)
    return {
      i, eventType: et, inning: e.about.inning, top, li: Number(e.leverageIndex), cat: catOf(et), event: e.result.event ?? et,
      batter: e.matchup?.batter?.fullName ?? '', pitcher: e.matchup?.pitcher?.fullName ?? '',
      wpa: top ? -homeGain : homeGain, text: e.result.description ?? '',
    }
  })
  if (pas.length < 10) return null
  const high = pas.filter((p) => p.li >= HIGH_LI)
  const sides = (['away', 'home'] as Side[]).map((side): LevSide => {
    const mine = high.filter((p) => p.top === (side === 'away'))
    return {
      side, pa: mine.length,
      ab: mine.filter((p) => !NOT_AB.has(p.eventType)).length,
      h: mine.filter((p) => p.cat === 'hit' || p.cat === 'hr').length,
      k: mine.filter((p) => p.cat === 'k').length, bb: mine.filter((p) => p.cat === 'walk').length, hr: mine.filter((p) => p.cat === 'hr').length,
      wpa: mine.reduce((a, p) => a + p.wpa, 0),
    }
  })
  return { pas, high: high.length, total: pas.length, top: [...pas].sort((a, b) => b.li - a.li).slice(0, 6).sort((a, b) => a.i - b.i), sides, peak: Math.max(...pas.map((p) => p.li)) }
}
