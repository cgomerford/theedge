'use client'

// src/components/contact-lab/HitterPicker.tsx
//
// The Contact Lab's hitter chooser: a search box over every hitter with 100+ batted balls. Choosing one navigates to
// /mlb/lab/contact?hitter=<id>, so the server re-reads every section for him (no client-side data fetching). Plain data props.

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { C } from '@/components/team/ui'

export type PickerRow = { id: number; name: string; team: string | null; n: number }

export default function HitterPicker({ rows, selectedId, selectedName, target = 'contact' }: { rows: PickerRow[]; selectedId: number; selectedName: string | null; target?: 'contact' | 'platoon' }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return rows.filter(r => r.name.toLowerCase().includes(needle) || (r.team ?? '').toLowerCase() === needle).slice(0, 8)
  }, [rows, q])
  const go = (id: number) => { setOpen(false); setQ(''); router.push(target === 'platoon' ? `/mlb/lab/batting-lab/${id}/platoon` : `/mlb/lab/contact?hitter=${id}`, { scroll: false }) }
  return (
    <div ref={box} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, color: C.mute }}>Hitter</span>
      <b style={{ fontSize: 15, background: C.ink, color: '#fff', borderRadius: 999, padding: '5px 14px' }}>{selectedName ?? `#${selectedId}`}</b>
      <div style={{ position: 'relative' }}>
        <input
          type="search" value={q} placeholder="Search a hitter or team (PHI)" aria-label="Search for a hitter" role="combobox" aria-expanded={open && hits.length > 0} aria-controls="cl-hits"
          onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={e => { if (e.key === 'Enter' && hits[0]) go(hits[0].id); if (e.key === 'Escape') setOpen(false) }}
          style={{ border: `1px solid ${C.line}`, borderRadius: 999, padding: '7px 14px', fontSize: 13, minWidth: 250, background: '#fff', color: C.ink, fontFamily: 'inherit' }}
        />
        {open && hits.length > 0 && (
          <ul id="cl-hits" role="listbox" style={{ position: 'absolute', top: '110%', left: 0, right: 0, margin: 0, padding: 4, listStyle: 'none', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.08)', zIndex: 30 }}>
            {hits.map(r => (
              <li key={r.id} role="option" aria-selected={r.id === selectedId}>
                <button type="button" onMouseDown={() => go(r.id)} style={{ all: 'unset', display: 'flex', justifyContent: 'space-between', gap: 10, width: 'calc(100% - 20px)', padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                  <b>{r.name}</b><span style={{ color: C.mute }}>{r.team ?? ''} · {r.n} batted balls</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
