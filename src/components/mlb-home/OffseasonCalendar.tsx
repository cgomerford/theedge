// src/components/mlb-home/OffseasonCalendar.tsx
//
// A mini calendar of the key dates between the end of the season and Opening Day (src/lib/mlb-offseason.ts). Past dates are dimmed, the next one is marked, and a date with a
// possibility attached carries a yellow asterisk and a plain footnote. Server component: no data of its own, no scripts.

import { C, SANS } from '@/components/team/ui'
import { LABOR_DEAL_EXPIRES, type CalItem } from '@/lib/mlb-offseason'

const day = (d: string) => new Date(`${d}T12:00:00Z`)
const diff = (a: string, b: string) => Math.round((day(a).getTime() - day(b).getTime()) / 86400000)

export default function OffseasonCalendar({ items, today }: { items: CalItem[]; today: string }) {
  if (items.length === 0) return null
  const nextIdx = items.findIndex(i => i.date >= today)
  const hasStar = items.some(i => i.star)
  return (
    <section aria-label="Key dates" style={{ marginTop: 18, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, fontFamily: SANS }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.14em', color: C.orange, textTransform: 'uppercase' }}>Key dates · the offseason</div>
      <ol style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 6 }}>
        {items.map((it, i) => {
          const past = it.date < today
          const n = diff(it.date, today)
          const when = n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 1 ? `in ${n} days` : `${-n} day${-n === 1 ? '' : 's'} ago`
          return (
            <li key={`${it.date}-${it.label}`} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: i === nextIdx ? '#fff1ea' : it.star ? '#FEF9C3' : '#faf8f3', opacity: past ? 0.55 : 1 }}>
              <div style={{ textAlign: 'center', lineHeight: 1.1 }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.mute, textTransform: 'uppercase' }}>{day(it.date).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</div>
                <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{day(it.date).getUTCDate()}</div>
                <div style={{ fontSize: 10, color: C.faint, fontWeight: 700 }}>{day(it.date).getUTCFullYear()}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{it.label}{it.star && <span aria-label="see note" style={{ color: '#D4533B', marginLeft: 4 }}>*</span>}</div>
                {it.note && <div style={{ fontSize: 12.5, color: '#5b5347' }}>{it.note}</div>}
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: i === nextIdx ? C.orange : C.mute, whiteSpace: 'nowrap' }}>{when}</div>
            </li>
          )
        })}
      </ol>
      {hasStar && (
        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#3a352c', lineHeight: 1.55 }}>
          <span style={{ color: '#D4533B', fontWeight: 800 }}>*</span> The labor agreement between the league and the players&apos; union ends on {day(LABOR_DEAL_EXPIRES).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}. If there is no new one by then, a lockout (the owners stopping work) is possible, and it would pause signings and trades. The dates after it are the league's schedule and assume play goes on as planned.
        </p>
      )}
    </section>
  )
}
