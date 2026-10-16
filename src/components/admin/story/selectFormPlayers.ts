// src/components/admin/story/selectFormPlayers.ts
//
// Pure picker for the FORM segment. Thresholds mirror
// scripts/fetch_player_form.py L133-135 (validated prominence per metric);
// rank score = magnitude / threshold so OPS, AVG and SLG compare fairly.

import { FORM_COOLING, FORM_HEATING, fmt3 } from './copy'
import type { FormMetric, FormRow } from './types'

export const FORM_THRESHOLD: Record<FormMetric, number> = { ops: 0.05, avg: 0.035, slg: 0.065 }

export const isFormMetric = (m: unknown): m is FormMetric => m === 'ops' || m === 'avg' || m === 'slg'

function score(r: FormRow): number {
  const th = isFormMetric(r.metric) ? FORM_THRESHOLD[r.metric] : NaN
  return Number.isFinite(th) ? r.magnitude / th : -Infinity
}

/** Validated rows outrank trending; within a tier, bigger scaled magnitude wins. */
function rank(a: FormRow, b: FormRow): number {
  const qa = a.signal_quality === 'trending' ? 0 : 1
  const qb = b.signal_quality === 'trending' ? 0 : 1
  return qb - qa || score(b) - score(a)
}

export type FormSelection = { heating: FormRow | null; cooling: FormRow | null; title: string | null }

/** One team's rows → its best heating and best cooling pick. */
export function selectFormPlayers(rows: FormRow[]): FormSelection {
  const usable = (rows ?? []).filter(r => isFormMetric(r.metric) && Number.isFinite(r.magnitude))
  const pick = (sig: 'heating' | 'cooling') => usable.filter(r => r.signal === sig).sort(rank)[0] ?? null
  const heating = pick('heating'), cooling = pick('cooling')
  return { heating, cooling, title: formTitle([heating, cooling].filter((x): x is FormRow => !!x)) }
}

export function formTitle(picks: { signal: 'heating' | 'cooling' }[]): string | null {
  if (picks.length === 0) return null
  const hot = picks.some(p => p.signal === 'heating'), cold = picks.some(p => p.signal === 'cooling')
  return hot && cold ? `${FORM_HEATING} / ${FORM_COOLING}` : hot ? FORM_HEATING : FORM_COOLING
}

/** The "from" sentence in words, 3-decimal with the leading zero stripped. */
export function fromSentence(p: Pick<FormRow, 'signal' | 'signal_quality' | 'metric' | 'current_value' | 'extreme_value'>): string {
  const m = String(p.metric ?? '').toUpperCase()
  if (p.signal_quality === 'trending') return `vs ${fmt3(p.extreme_value)} typical 15-game ${m} → ${fmt3(p.current_value)} now`
  return p.signal === 'cooling'
    ? `15-game peak ${fmt3(p.extreme_value)} → ${fmt3(p.current_value)} now`
    : `15-game low ${fmt3(p.extreme_value)} → ${fmt3(p.current_value)} now`
}
