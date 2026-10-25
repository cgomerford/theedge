'use client'

// The card every Pitching Desk tool sits in: title + subtitle, source chips, a Method drawer, Pin and PNG.
// `id` is the card's stable key (DOM id, pin id, filename part). `isPro` is required and never defaulted:
// it decides the export footer (free: the site domain footer; Pro: none) and whether Pin stores anything.
// Pro-locked cards are not rendered through here at all: the page swaps in <UpgradeCard> on the server.
// `empty` renders a shell card whose body names the data that has not been computed yet.

import { useState } from 'react'
import { C, MONO, SANS } from '@/components/team/ui'
import { cardFilename, exportCard } from './exportCard'
import { useNotebook } from './notebook'
import {  } from '@/lib/site'

const tool: React.CSSProperties = { fontFamily: MONO, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', border: `1px solid ${C.line}`, background: '#fff', color: C.ink, borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }

export default function ChartCard({ id, title, subtitle, sources = [], method, isPro, pro = false, empty, children }: {
  id: string; title: string; subtitle?: string; sources?: string[]; method?: React.ReactNode; isPro: boolean
  pro?: boolean; empty?: string; children?: React.ReactNode
}) {
  const { team, pitcher, pins, pin } = useNotebook()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const pinned = pins.some(p => p.id === id)

  async function png() {
    const node = document.getElementById(id)
    if (!node) return
    setBusy(true); setFailed(false)
    setFailed(!(await exportCard(node, cardFilename(team, pitcher, id), !isPro)))
    setBusy(false)
  }

  return (
    <article id={id} className="pd-anchor" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange }}>
            {title}{pro && <span style={{ marginLeft: 8, background: C.yellow, color: C.ink, borderRadius: 4, padding: '1px 5px', fontSize: 9 }}>PRO</span>}
          </div>
          {subtitle && <div style={{ fontFamily: SANS, fontSize: 13, color: '#5b5347', marginTop: 4, lineHeight: 1.4, maxWidth: 560 }}>{subtitle}</div>}
        </div>
        <div data-no-export="" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', alignSelf: 'flex-start' }}>
          {sources.map(s => <span key={s} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', color: C.faint, border: `1px dashed ${C.line}`, borderRadius: 4, padding: '2px 5px' }}>{s}</span>)}
          {method && <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={tool}>Method</button>}
          <button onClick={() => pin({ id, title }, isPro)} aria-pressed={pinned} style={{ ...tool, background: pinned ? C.ink : '#fff', color: pinned ? C.cream : C.ink }}>{pinned ? 'Pinned' : 'Pin'}</button>
          <button onClick={png} disabled={busy || !!empty} style={{ ...tool, opacity: empty ? .4 : 1 }}>{busy ? '…' : failed ? 'Retry' : 'PNG'}</button>
        </div>
      </div>
      {method && open && <div style={{ fontFamily: SANS, fontSize: 12.5, color: '#5b5347', lineHeight: 1.5, background: C.soft, borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>{method}</div>}
      {empty
        ? <p style={{ fontSize: 12, color: C.faint, fontStyle: 'italic', padding: '28px 0', textAlign: 'center', margin: 0, border: `1px dashed ${C.line}`, borderRadius: 10 }}>{empty}</p>
        : children}
    </article>
  )
}
