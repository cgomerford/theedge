// src/components/admin/game-preview/preview-utils.ts
//
// Pure helpers for the Game Preview Graphic (two starters head to head).
// Everything here describes numbers already on the card — no predictions, no
// probabilities, nothing derived from the internal Edge Score.

import type { PitcherCardStats } from '@/components/admin/scout-graphic/ScoutGraphicCard'
import type { RichArsenalPitch } from '@/components/PitchLocationCard'

export type StatKey = 'era' | 'fip' | 'whip' | 'k_per_9' | 'bb_per_9' | 'l3_era'

export const STAT_ROWS: { key: StatKey; label: string; lowerIsBetter: boolean; digits: number }[] = [
  { key: 'era', label: 'ERA', lowerIsBetter: true, digits: 2 },
  { key: 'fip', label: 'FIP', lowerIsBetter: true, digits: 2 },
  { key: 'whip', label: 'WHIP', lowerIsBetter: true, digits: 2 },
  { key: 'k_per_9', label: 'K/9', lowerIsBetter: false, digits: 1 },
  { key: 'bb_per_9', label: 'BB/9', lowerIsBetter: true, digits: 1 },
  { key: 'l3_era', label: 'L3 ERA', lowerIsBetter: true, digits: 2 },
]

export function statValue(stats: PitcherCardStats | null, key: StatKey): number | null {
  const v = stats?.[key]
  return v == null ? null : v
}

/** Which side has the better number on a stat, comparing the values AS DISPLAYED (so a 3.651 vs 3.649 tie isn't split). */
export function betterSide(a: number | null, h: number | null, lowerIsBetter: boolean, digits: number): 'away' | 'home' | null {
  if (a == null || h == null) return null
  const ra = Number(a.toFixed(digits))
  const rh = Number(h.toFixed(digits))
  if (ra === rh) return null
  return (ra < rh) === lowerIsBetter ? 'away' : 'home'
}

const last = (n: string) => n.trim().split(' ').slice(-1)[0]

function topPitch(arsenal: RichArsenalPitch[]): { name: string; pct: number } | null {
  const t = [...arsenal].filter(p => (p.percentage ?? 0) > 0).sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))[0]
  return t ? { name: t.pitch_name ?? t.pitch_type, pct: t.percentage ?? 0 } : null
}

type Side = { name: string; stats: PitcherCardStats | null; arsenal: RichArsenalPitch[] }

/**
 * Drafted read: who has the better number on ERA / K-9 / BB-9, and what each
 * leans on. Uses **bold** markers the card renders. Empty when there's nothing
 * comparable, so the card shows no read rather than an invented one.
 */
export function draftPreviewRead(away: Side, home: Side): string {
  const parts: string[] = []
  const cmp = (key: StatKey, phrase: (w: string, wv: string, lv: string) => string) => {
    const row = STAT_ROWS.find(r => r.key === key)!
    const av = statValue(away.stats, key)
    const hv = statValue(home.stats, key)
    const side = betterSide(av, hv, row.lowerIsBetter, row.digits)
    if (!side) return
    const w = side === 'away' ? away : home
    const wv = (side === 'away' ? av : hv)!.toFixed(row.digits)
    const lv = (side === 'away' ? hv : av)!.toFixed(row.digits)
    parts.push(phrase(`**${last(w.name)}**`, wv, lv))
  }
  cmp('era', (w, wv, lv) => `${w} has the lower ERA (${wv} to ${lv}).`)
  cmp('k_per_9', (w, wv, lv) => `${w} misses more bats — ${wv} K/9 to ${lv}.`)
  cmp('bb_per_9', (w, wv, lv) => `${w} is the tighter one on walks (${wv} BB/9 to ${lv}).`)

  const at = topPitch(away.arsenal)
  const ht = topPitch(home.arsenal)
  if (at && ht) {
    parts.push(at.name === ht.name
      ? `Both lean on the ${at.name} — ${last(away.name)} ${Math.round(at.pct)}% of the time, ${last(home.name)} ${Math.round(ht.pct)}%.`
      : `${last(away.name)} leans on the ${at.name} (${Math.round(at.pct)}%); ${last(home.name)} on the ${ht.name} (${Math.round(ht.pct)}%).`)
  }
  return parts.join(' ')
}
