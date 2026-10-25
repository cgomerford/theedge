'use client'

// src/components/admin/SlateDatePicker.tsx
//
// Picks which day's slate the dashboard builds from. The dashboard page is a
// server component that already reads ?date=YYYY-MM-DD, so this only changes
// the URL — every section (teaser video, Scout Report PNG, Game Preview PNG)
// re-renders for that day. `today` comes from the server (US Eastern) so the
// "Today" button agrees with the slate's own frame, not the browser's timezone.
// Dev-flag params (storyStill etc.) are deliberately dropped on navigation.

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

// Shift a YYYY-MM-DD by whole days using UTC math, so DST/timezone can't skew it.
function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

const btn: React.CSSProperties = {
  fontFamily: 'var(--font-redhat), sans-serif',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 1,
  padding: '7px 12px',
  border: '1px solid #1A1A1A',
  background: '#fff',
  color: '#1A1A1A',
  cursor: 'pointer',
}

export default function SlateDatePicker({ value, today }: { value: string; today: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const go = (iso: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso === value) return
    start(() => router.push(iso === today ? '/admin/dashboard' : `/admin/dashboard?date=${iso}`))
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', opacity: pending ? 0.6 : 1 }}>
      <button type="button" style={btn} onClick={() => go(shiftDay(value, -1))} disabled={pending} aria-label="Previous day">←</button>
      <input
        type="date"
        value={value}
        onChange={e => go(e.target.value)}
        disabled={pending}
        aria-label="Slate date"
        style={{ ...btn, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}
      />
      <button type="button" style={btn} onClick={() => go(shiftDay(value, 1))} disabled={pending} aria-label="Next day">→</button>
      <button
        type="button"
        style={{ ...btn, background: value === today ? '#1A1A1A' : '#fff', color: value === today ? '#FAF8F3' : '#1A1A1A' }}
        onClick={() => go(today)}
        disabled={pending}
      >
        Today
      </button>
      {pending && <span style={{ fontSize: 11, color: '#6b6b66' }}>Loading slate…</span>}
    </div>
  )
}
