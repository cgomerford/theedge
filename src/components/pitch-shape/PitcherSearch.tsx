'use client'

// src/components/pitch-shape/PitcherSearch.tsx
//
// Search a pitcher by name and open his shape on the map. Typing asks the server (findPitchers, debounced) for matching pitchers at the chosen level; choosing one reloads the page with ?pitcher=<id>,
// and the page then shows his pitches on the map and scrolls to him. Arrow keys and Enter work; Escape closes. Only pitch types the viewer may see are used (Pro types need Pro).
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { C } from '@/components/team/ui'
import { PITCH_NAMES } from '@/lib/pitch-shape/model'
import { findPitchers, type PitcherHitLite } from '@/app/mlb/lab/pitch-shape/actions'
import { log } from '@/lib/log'

export default function PitcherSearch({ level, levelName, current }: { level: string; levelName: string; current: string | null }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<PitcherHitLite[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [i, setI] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); setBusy(false); return }
    let live = true
    setBusy(true)
    const t = setTimeout(() => {
      findPitchers({ q, level })
        .then(r => { if (live) { setHits(r.ok ? r.hits : []); setI(0); setBusy(false); setOpen(true) } })
        .catch(e => { log.error('PitcherSearch', 'findPitchers failed', e instanceof Error ? e.message : String(e)); if (live) setBusy(false) })
    }, 200)
    return () => { live = false; clearTimeout(t) }
  }, [q, level])

  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  const choose = (h: PitcherHitLite) => {
    const p = new URLSearchParams()
    p.set('pitcher', String(h.id))
    if (level !== 'mlb') p.set('level', level)
    if (new URLSearchParams(window.location.search).get('ui') === 'v2') p.set('ui', 'v2')   // keep the page design the viewer is comparing
    setOpen(false); setQ(h.name)
    router.push(`/mlb/lab/pitch-shape?${p.toString()}`, { scroll: false })
  }

  return (
    <div ref={box} style={{ position: 'relative', maxWidth: 420, marginBottom: 14 }}>
      <label><span style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.mute, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Find a pitcher</span>
        <input value={q} onChange={e => setQ(e.target.value)} onFocus={() => hits.length > 0 && setOpen(true)} placeholder={`Search any ${levelName} pitcher…`} autoComplete="off" role="combobox" aria-expanded={open} aria-controls="pitcher-hits"
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(hits.length - 1, x + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(0, x - 1)) }
            else if (e.key === 'Enter' && open && hits[i]) { e.preventDefault(); choose(hits[i]) }
            else if (e.key === 'Escape') setOpen(false)
          }}
          style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 8, background: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', color: C.ink }} /></label>
      {current && <div style={{ fontSize: 12.5, color: '#5b5347', marginTop: 4 }}>Showing {current}. <a href="/mlb/lab/pitch-shape" style={{ color: C.orange, fontWeight: 800, textDecoration: 'none' }}>Clear pitcher</a></div>}
      {open && (
        <ul id="pitcher-hits" role="listbox" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 2, padding: 0, listStyle: 'none', background: '#fff', border: `1px solid ${C.ink}`, borderRadius: 8, maxHeight: 320, overflowY: 'auto', boxShadow: '0 6px 20px rgba(0,0,0,.12)' }}>
          {busy ? <li style={{ padding: 10, fontSize: 12.5, color: C.mute }}>Searching…</li>
            : hits.length === 0 ? <li style={{ padding: 10, fontSize: 12.5, color: C.mute }}>No pitcher with pitch shape data at {levelName} matches “{q.trim()}”.</li>
            : hits.map((h, k) => (
              <li key={h.id} role="option" aria-selected={k === i} onMouseEnter={() => setI(k)} onMouseDown={e => { e.preventDefault(); choose(h) }}
                style={{ padding: '9px 12px', cursor: 'pointer', background: k === i ? '#F4F1EA' : '#fff', borderBottom: `1px solid ${C.soft}` }}>
                <b style={{ fontSize: 14 }}>{h.name}</b> <span style={{ color: C.mute, fontSize: 12.5 }}>{h.team} · {h.hand === 'R' ? 'right' : 'left'}-handed</span>
                <div style={{ fontSize: 11.5, color: C.mute }}>{h.types.slice(0, 5).map(t => `${PITCH_NAMES[t.code] ?? t.code} (${t.n.toLocaleString('en-US')})`).join(' · ')}</div>
              </li>))}
        </ul>
      )}
    </div>
  )
}
