'use client'

// src/components/pitch-shape/TranslationBanner.tsx
//
// The flag for a minor-league pitch: does a shape that works at his level carry to MLB, from what has already happened (see src/lib/milb-shape/translate.ts). A red-edged banner when the
// shape works at his level but pitches with the same movement have not worked in MLB; green when it works at both; blue when it does better in MLB; plain when it works at neither.
// Says nothing when either side is too thin (the empty state is "too few ... to say", never a guess).

import { C } from '@/components/team/ui'
import type { Translation, TranslationStatus } from '@/lib/milb-shape/translate'

export const TONE: Record<TranslationStatus, { bg: string; edge: string; fg: string; chip: string | null }> = {
  'minors-only': { bg: '#FBE6E1', edge: '#A8391F', fg: '#A8391F', chip: 'Not carrying to MLB' },
  holds: { bg: '#E3F3EC', edge: '#13694F', fg: '#13694F', chip: 'Works in MLB too' },
  'mlb-better': { bg: '#E3EAF2', edge: '#3F5F86', fg: '#3F5F86', chip: 'Works better in MLB' },
  neither: { bg: C.soft, edge: C.line, fg: '#5b5347', chip: null },
  unclear: { bg: C.soft, edge: C.line, fg: '#5b5347', chip: null },
}

export function TranslationChip({ t }: { t: Translation | null | undefined }) {
  const tone = t ? TONE[t.status] : null
  if (!t || !tone?.chip) return null
  return <span title={t.headline} style={{ background: tone.bg, color: tone.fg, fontWeight: 800, fontSize: 11.5, borderRadius: 3, padding: '2px 8px', whiteSpace: 'nowrap' }}>{tone.chip}</span>
}

export default function TranslationBanner({ t, levelLabel }: { t: Translation | null | undefined; levelLabel: string }) {
  if (!t) return null
  const tone = TONE[t.status]
  return (
    <details role="note" style={{ border: `1.5px solid ${tone.edge}`, background: tone.bg, borderRadius: 6, padding: '6px 12px', margin: '8px 0' }}>
      <summary style={{ cursor: 'pointer', display: 'flex', gap: '2px 12px', alignItems: 'baseline', flexWrap: 'wrap', minHeight: 30 }}>
        <span style={{ fontSize: 10, letterSpacing: '.12em', fontWeight: 800, color: tone.fg, textTransform: 'uppercase' }}>Carry from {levelLabel} to MLB?</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, lineHeight: 1.4 }}>{t.headline}</span>
        <span style={{ fontSize: 11.5, color: '#5b5347' }}>(the numbers)</span>
      </summary>
      {t.reasons.length > 0 && <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 13, lineHeight: 1.5, color: '#3a352c' }}>{t.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
      <div style={{ fontSize: 11.5, color: '#5b5347', marginTop: 6, lineHeight: 1.45 }}>This compares what has already happened: pitches shaped like his at {levelLabel} against MLB pitches with the same movement. It is not a forecast of how he would pitch in MLB: command, deception and sequencing stay his own.</div>
    </details>
  )
}
