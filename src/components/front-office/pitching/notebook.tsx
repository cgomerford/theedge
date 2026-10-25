'use client'

// Notebook: pins live in React state for the session only (no localStorage in v1).
//   <NotebookProvider team pitcher>  wraps the desk; ChartCard's Pin button calls pin().
//   <NotebookTray isPro>             pinned to the bottom; Pro can export every pinned card as PNG.
// Free viewers can press Pin, but nothing is stored: the tray shows the upgrade prompt instead.

import Link from 'next/link'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { C, MONO, SANS } from '@/components/team/ui'
import { cardFilename, exportCard } from './exportCard'

export type Pin = { id: string; title: string }
type Ctx = { team: string; pitcher: string; pins: Pin[]; upsell: boolean; pin: (p: Pin, isPro: boolean) => void; unpin: (id: string) => void; clear: () => void }
const NotebookCtx = createContext<Ctx | null>(null)

export function useNotebook(): Ctx {
  const c = useContext(NotebookCtx)
  if (!c) throw new Error('[useNotebook] used outside <NotebookProvider>')
  return c
}

export function NotebookProvider({ team, pitcher, children }: { team: string; pitcher: string; children: React.ReactNode }) {
  const [pins, setPins] = useState<Pin[]>([])
  const [upsell, setUpsell] = useState(false)
  const pin = useCallback((p: Pin, isPro: boolean) => {
    if (!isPro) { setUpsell(true); return }
    setPins(cur => (cur.some(x => x.id === p.id) ? cur.filter(x => x.id !== p.id) : [...cur, p]))   // pressing Pin again un-pins
  }, [])
  const unpin = useCallback((id: string) => setPins(cur => cur.filter(x => x.id !== id)), [])
  const clear = useCallback(() => { setPins([]); setUpsell(false) }, [])
  const value = useMemo(() => ({ team, pitcher, pins, upsell, pin, unpin, clear }), [team, pitcher, pins, upsell, pin, unpin, clear])
  return <NotebookCtx.Provider value={value}>{children}</NotebookCtx.Provider>
}

const btn: React.CSSProperties = { fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', border: `1px solid ${C.line}`, background: '#fff', color: C.ink, borderRadius: 8, padding: '7px 11px', cursor: 'pointer' }

export function NotebookTray({ isPro }: { isPro: boolean }) {
  const { team, pitcher, pins, upsell, clear } = useNotebook()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function exportAll() {
    setBusy(true); setFailed(false)
    let ok = true
    for (const p of pins) {
      const node = document.getElementById(p.id)
      if (!node) { ok = false; continue }
      ok = (await exportCard(node, cardFilename(team, pitcher, p.id), false)) && ok   // Pro: no footer
      await new Promise(r => setTimeout(r, 250))                                       // let the browser start each download
    }
    setFailed(!ok); setBusy(false)
  }

  return (
    <div role="status" aria-live="polite" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40, background: C.ink, color: C.cream, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: `2px solid ${C.orange}` }}>
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.yellow }}>Notebook · {pins.length} pinned</span>
      <span style={{ fontFamily: SANS, fontSize: 12.5, flex: 1, minWidth: 180, opacity: .85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {pins.length ? pins.map(p => p.title).join(' · ') : 'Pin any chart to build your own read.'}
      </span>
      {isPro && <>
        <button onClick={clear} disabled={!pins.length} style={{ ...btn, background: 'transparent', color: C.cream, borderColor: '#555', opacity: pins.length ? 1 : .4 }}>Clear</button>
        <button onClick={exportAll} disabled={!pins.length || busy} style={{ ...btn, background: C.orange, color: '#fff', borderColor: C.orange, opacity: pins.length ? 1 : .4 }}>
          {busy ? 'Rendering…' : failed ? 'Some failed — retry' : 'Export pinned as PNG'}
        </button>
      </>}
    </div>
  )
}
