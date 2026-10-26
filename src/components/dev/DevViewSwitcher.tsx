'use client'

// Dev only (rendered from layout.tsx behind a NODE_ENV check): switch between the signed out, signed in and Pro views.
import { useEffect, useState } from 'react'

const VIEWS = [
  { id: 'out', label: 'Signed out' },
  { id: 'member', label: 'Signed in' },
  { id: 'pro', label: 'Pro' },
] as const

export default function DevViewSwitcher() {
  const [view, setView] = useState<string>('')
  useEffect(() => {
    setView(document.cookie.match(/(?:^|; )edge_dev_view=([^;]*)/)?.[1] ?? '')
  }, [])

  function pick(id: string) {
    document.cookie = `edge_dev_view=${id}; path=/; max-age=86400; samesite=lax`
    window.location.reload()
  }
  function reset() {
    document.cookie = 'edge_dev_view=; path=/; max-age=0'
    window.location.reload()
  }

  return (
    <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 99999, display: 'flex', gap: 4, alignItems: 'center', padding: 6, background: '#1A1A1A', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
      <span style={{ opacity: 0.6, padding: '0 4px' }}>View as</span>
      {VIEWS.map(v => (
        <button key={v.id} type="button" onClick={() => pick(v.id)} aria-pressed={view === v.id}
          style={{ cursor: 'pointer', border: 0, borderRadius: 4, padding: '4px 8px', font: 'inherit', background: view === v.id ? '#FF5722' : 'transparent', color: '#fff' }}>
          {v.label}
        </button>
      ))}
      {view ? <button type="button" onClick={reset} style={{ cursor: 'pointer', border: 0, background: 'transparent', color: '#fff', opacity: 0.6, font: 'inherit', padding: '4px 6px' }}>Reset</button> : null}
    </div>
  )
}
