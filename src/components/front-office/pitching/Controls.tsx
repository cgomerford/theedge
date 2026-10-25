'use client'

// Sticky analyst controls. State lives in the URL (?p=&w=&side=&cmp=) so a view is shareable and the
// server reads it; this component only rewrites the query string. Changing the pitcher drops `pt`.
// Option lists are plain data from the server (never functions).

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { C, MONO, SANS } from '@/components/team/ui'
import { Headshot } from './Avatar'

type Opt = { value: string; label: string }

const label: React.CSSProperties = { fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.mute }
const select: React.CSSProperties = { fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, minWidth: 0, maxWidth: '100%' }

export default function Controls({ pitchers, windows, sides, p, w, side, cmp }: {
  pitchers: Opt[]; windows: Opt[]; sides: Opt[]; p: string; w: string; side: string; cmp: string
}) {
  const router = useRouter()
  const path = usePathname()
  const sp = useSearchParams()
  const [pending, start] = useTransition()

  function set(key: string, value: string) {
    const q = new URLSearchParams(sp.toString())
    q.set(key, value)
    if (key === 'p') q.delete('pt')
    start(() => router.replace(`${path}?${q.toString()}`, { scroll: false }))
  }

  const seg = (key: string, opts: Opt[], cur: string) => (
    <div role="group" style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      {opts.map(o => (
        <button key={o.value} onClick={() => set(key, o.value)} aria-pressed={cur === o.value}
          style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, padding: '7px 11px', border: 0, cursor: 'pointer', background: cur === o.value ? C.ink : '#fff', color: cur === o.value ? C.cream : C.ink, whiteSpace: 'nowrap' }}>{o.label}</button>
      ))}
    </div>
  )

  return (
    <div role="toolbar" aria-label="Analyst controls" aria-busy={pending} className="pd-controls x9-desk-sticky" style={{ position: 'sticky', top: 56, zIndex: 15, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', background: 'rgba(250,248,243,.96)', backdropFilter: 'blur(4px)', border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 14px', opacity: pending ? .75 : 1 }}>
      <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
        <label htmlFor="fo-p" style={label}>Pitcher</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Headshot id={Number(p)} size={34} ring={C.orange} />
          <select id="fo-p" value={p} onChange={e => set('p', e.target.value)} style={select}>
            {pitchers.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 4 }}><span style={label}>Window</span>{seg('w', windows, w)}</div>
      <div style={{ display: 'grid', gap: 4 }}><span style={label}>Batter side</span>{seg('side', sides, side)}</div>
      <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
        <label htmlFor="fo-cmp" style={label}>Compare with</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {Number(cmp) > 0 && <Headshot id={Number(cmp)} size={34} />}
          <select id="fo-cmp" value={cmp} onChange={e => set('cmp', e.target.value)} style={select}>
            <option value="lg">League average</option>
            {pitchers.filter(o => o.value !== p).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}
