/**
 * src/lib/key-player-rating.ts
 *
 * Postgame report card for a Key Players pick — pure functions, safe to run
 * on server or client. Turns the recorded game line into a 1–5 outcome
 * rating and a verdict on whether the pregame read (lean) held up.
 *
 * The pregame `lean` is the call: 'edge' says "should have a good game",
 * 'tough' says "should struggle". The verdict compares that call to the
 * rating, and a 'neutral' pick never claims a win or a miss.
 */

import type { BatterGameResult } from '@/lib/series-matchup'
import type { PitcherGameResult } from '@/lib/pitcher-series-edge'

export type OutcomeVerdict = 'called_it' | 'missed' | 'push'

export type OutcomeRating = {
  stars: 1 | 2 | 3 | 4 | 5
  label: string
  line: string
  verdict: OutcomeVerdict
}

// Bill James Game Score minus the unearned-run and home-run terms the MLB
// game log doesn't give us — always labelled "est." where shown.
export function estimateGameScore(ip: string, h: number, er: number, k: number, bb: number): number {
  const [whole, frac] = ip.split('.')
  const outs = (parseInt(whole || '0', 10) || 0) * 3 + (parseInt(frac || '0', 10) || 0)
  return 50 + outs + 2 * Math.max(0, Math.floor(outs / 3) - 4) + k - 2 * h - 4 * er - bb
}

function verdictFor(lean: 'edge' | 'neutral' | 'tough', stars: number): OutcomeVerdict {
  if (lean === 'edge') return stars >= 3 ? 'called_it' : 'missed'
  if (lean === 'tough') return stars <= 2 ? 'called_it' : stars >= 4 ? 'missed' : 'push'
  return 'push'
}

export function rateBatter(r: NonNullable<BatterGameResult>, lean: 'edge' | 'neutral' | 'tough'): OutcomeRating | null {
  if (r.ab === 0 && r.walks === 0) return null   // didn't really play
  // Production points: hits and homers carry it, RBI/walks add, Ks subtract.
  const pts = r.hits + 2 * r.home_runs + 0.5 * (r.rbi + r.walks) - 0.4 * r.strikeouts
  const stars = (pts >= 4.5 ? 5 : pts >= 3 ? 4 : pts >= 1.5 ? 3 : pts >= 0.5 ? 2 : 1) as OutcomeRating['stars']
  const label = ['', 'Rough day', 'Quiet day', 'Solid day', 'Strong day', 'Big day'][stars]
  const extras = [
    r.home_runs > 0 ? (r.home_runs > 1 ? `${r.home_runs} HR` : 'HR') : null,
    r.rbi > 0 ? `${r.rbi} RBI` : null,
    r.walks > 0 ? `${r.walks} BB` : null,
    r.strikeouts > 0 ? `${r.strikeouts} K` : null,
  ].filter(Boolean)
  return { stars, label, line: [`${r.hits}-for-${r.ab}`, ...extras].join(' · '), verdict: verdictFor(lean, stars) }
}

export function ratePitcher(r: NonNullable<PitcherGameResult>, lean: 'edge' | 'neutral' | 'tough'): OutcomeRating | null {
  if (!r.ip || r.ip === '0.0') return null
  const gs = estimateGameScore(r.ip, r.h, r.er, r.k, r.bb)
  const stars = (gs >= 70 ? 5 : gs >= 60 ? 4 : gs >= 50 ? 3 : gs >= 40 ? 2 : 1) as OutcomeRating['stars']
  const label = ['', 'Rough outing', 'Shaky outing', 'Decent outing', 'Strong outing', 'Dominant outing'][stars]
  return { stars, label, line: `${r.ip} IP · ${r.er} ER · ${r.k} K · ${r.bb} BB`, verdict: verdictFor(lean, stars) }
}
