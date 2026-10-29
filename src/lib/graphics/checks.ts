// src/lib/graphics/checks.ts
//
// Pre-export checks for a graphic. Never blocks (George's own presets legitimately carry words the list flags); it reports so a person decides.
//   words    tips, betting and prediction wording anywhere on the card or in the post caption
//   edited   values changed by hand after an auto-fill, so the card no longer matches the stored data
//   empty    rows with no number
//   long     a headline long enough to shrink or wrap badly on a phone

import { lintProse } from '@/lib/banned-words'
import type { GraphicSpec } from './types'

export interface GraphicCheck { id: string; level: 'ok' | 'warn'; text: string; detail?: string }

/** Every piece of text a reader sees on the card, one string per field. */
export function specTexts(spec: GraphicSpec): string[] {
  const out: string[] = [spec.kicker, spec.title, spec.subtitle ?? '', ...spec.chips.map(c => c.text)]
  for (const s of spec.stats) out.push(s.label, s.value ?? '', s.sub ?? '', s.rank ?? '', ...(s.cells ?? []), s.vs?.label ?? '')
  for (const v of Object.values(spec.panels ?? {})) out.push(v)
  for (const v of Object.values(spec.notes ?? {})) out.push(v)
  if (spec.otd) out.push(spec.otd.date, JSON.stringify(spec.otd.body))
  return out.filter(Boolean)
}

/** Snapshot of the filled values, keyed by group and label, taken right after an auto-fill. */
export function fillSnapshot(spec: GraphicSpec): Record<string, string> {
  return Object.fromEntries(spec.stats.map(s => [`${s.group ?? ''}|${s.label}`, s.value ?? '']))
}

export function checkGraphic(spec: GraphicSpec, caption: string, snapshot: Record<string, string> | null): GraphicCheck[] {
  const out: GraphicCheck[] = []
  const seen = new Set<string>()
  for (const t of [...specTexts(spec), caption]) for (const h of lintProse(t)) {
    const k = h.word.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ id: `word-${k}`, level: 'warn', text: `Flagged word: "${h.word}"`, detail: `…${h.context}…` })
  }
  if (!seen.size) out.push({ id: 'words', level: 'ok', text: 'No betting, prediction or fantasy-advice wording' })

  if (snapshot) {
    const edited = spec.stats.filter(s => { const k = `${s.group ?? ''}|${s.label}`; return k in snapshot && snapshot[k] !== (s.value ?? '') }).length
    if (edited) out.push({ id: 'edited', level: 'warn', text: `${edited} number${edited === 1 ? '' : 's'} changed by hand since the auto-fill`, detail: 'Those no longer match the stored data.' })
    else out.push({ id: 'edited', level: 'ok', text: 'Every filled number still matches the data' })
  }
  if (spec.template !== 'otd' && spec.template !== 'sotd' && spec.template !== 'textlist') {
    const empty = spec.stats.filter(s => !(s.value ?? '').trim() && !(s.cells ?? []).length).length
    if (empty) out.push({ id: 'empty', level: 'warn', text: `${empty} row${empty === 1 ? ' has' : 's have'} no number` })
  }
  if (spec.title.length > 48) out.push({ id: 'long', level: 'warn', text: `Headline is ${spec.title.length} characters`, detail: 'Long headlines shrink on a phone. Under 48 reads cleanly.' })
  if (caption.length > 280) out.push({ id: 'cap', level: 'warn', text: `Caption is ${caption.length} characters`, detail: 'X shows 280 on a standard post.' })
  return out
}
