// src/components/sequencing-lab/ui.tsx
//
// Small shared pieces for the Second Look and Game Plan Card pages, in the same look as the other lab pages: white rounded cards with a 1px line, orange small-caps kickers,
// rounded pills for choices. (The tile, kick and note styles are the Pitching Lab's own; PillGroup is the same pill with room for a pitch dot inside.)

import type { ReactNode } from 'react'
import { C, SANS } from '@/components/team/ui'
export { tile, kick, note, star } from '@/components/pitching-lab/LocationExplorer'

export const SOFT = '#f1eee6'

export function PillGroup<T extends string>({ label, items, value, onChange }: { label?: string; items: [T, ReactNode][]; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ minWidth: 0 }}>
      {label && <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.14em', color: C.faint, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>}
      <div role="group" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map(([k, l]) => {
          const on = value === k
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => onChange(k)} style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, borderRadius: 999, padding: '7px 14px', minHeight: 36, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${on ? C.orange : C.line}`, background: on ? '#fff1ea' : '#fff', color: on ? C.orange : C.ink }}>{l}</button>
          )
        })}
      </div>
    </div>
  )
}

export function PageHead({ kicker, title, intro }: { kicker: string; title: string; intro: ReactNode }) {
  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange }}>{kicker}</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</h1>
      <p style={{ margin: '0 0 18px', fontSize: 15, color: '#5b5347', maxWidth: 760, lineHeight: 1.55 }}>{intro}</p>
    </>
  )
}
