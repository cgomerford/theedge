'use client'

// src/components/pitch-shape/ShapeControls.tsx
//
// The Pitch Shape Lab's top controls. League mode: a visible three-way view switch (one pitch, every pitch, compare levels) and the filters as dropdowns: level, pitch type, which pitchers (right, left or both).
// Pitcher mode (a pitcher is chosen): the page is about him, so level and hand are shown as plain text rather than filters (changing them would leave his story), his pitches are buttons, and one link goes back to the league.
// Choosing anything reloads the page with the new address (?level=&type=&hand=&view=&pitcher=), so a view can be shared and the server decides what the viewer may see. A Pro-only type is marked PRO.
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { C } from '@/components/team/ui'

type Opt = { value: string; label: string }
export type PitchOpt = { code: string; name: string; locked: boolean }
export type HisPitch = { code: string; name: string; n: number; href: string }

export default function ShapeControls({ level, type, hand, view, pitcher = null, levels, types, repertoire = [], lockedTypes = 0, levelName, handName, variant = 'card' }: {
  /** 'card' lays the filters out as rows of buttons; 'column' stacks them as dropdowns, for the narrow column beside the league banner */
  variant?: 'card' | 'column'
  level: string; type: string | null; hand: string; view: 'one' | 'all' | 'compare'
  /** the pitcher being shown, if any */
  pitcher?: number | null; levels: Opt[]; types: PitchOpt[]
  /** his pitches (pitcher mode only), with a link for each, and how many more are Pro */
  repertoire?: HisPitch[]; lockedTypes?: number; levelName: string; handName: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const go = (o: Partial<{ level: string; type: string; hand: string; view: string }>) => {
    const v = { level, type: type ?? '', hand, view, ...o }
    const q = new URLSearchParams()
    if (v.level && v.level !== 'mlb') q.set('level', v.level)
    if (v.type) q.set('type', v.type)
    if (v.hand && v.hand !== 'R') q.set('hand', v.hand)
    if (v.view !== 'one') q.set('view', v.view)
    if (new URLSearchParams(window.location.search).get('ui') === 'v2') q.set('ui', 'v2')   // keep the page design the viewer is comparing
    const s = q.toString()
    start(() => router.push(`/mlb/lab/pitch-shape${s ? `?${s}` : ''}`, { scroll: false }))
  }
  const k: React.CSSProperties = { fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: '#6b6355', textTransform: 'uppercase', display: 'block', marginBottom: 4 }
  const seg = (on: boolean): React.CSSProperties => ({ minHeight: 44, padding: '0 16px', border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? C.cream : C.ink, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: pending ? 0.6 : 1 })

  if (pitcher) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, color: '#5b5347' }}><span style={k}>Showing</span><b style={{ color: C.ink }}>{levelName}</b> · <b style={{ color: C.ink }}>{handName}</b></div>
        <div>
          <span style={k}>His pitches (choose one)</span>
          <div role="group" aria-label="His pitches" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {repertoire.map(r => (
              <button key={r.code} type="button" aria-pressed={r.code === type} onClick={() => start(() => router.push(r.href, { scroll: false }))} style={{ ...seg(r.code === type), borderRadius: 6, minHeight: 40, padding: '0 14px' }}>
                {r.name} <span style={{ opacity: 0.7, fontWeight: 600 }}>· {r.n.toLocaleString('en-US')}</span>
              </button>
            ))}
            {lockedTypes > 0 && <span style={{ alignSelf: 'center', fontSize: 12.5, color: '#6b6355' }}>+ {lockedTypes} more pitch type{lockedTypes === 1 ? '' : 's'} in Pro</span>}
          </div>
        </div>
        <button type="button" onClick={() => go({})} style={{ border: 0, background: 'none', color: C.orange, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, minHeight: 40, marginLeft: 'auto' }}>← Back to the league view</button>
      </div>
    )
  }

  const sel: React.CSSProperties = { width: '100%', padding: '9px 11px', border: `1px solid ${C.line}`, borderRadius: 6, background: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', color: C.ink, minHeight: 42, opacity: pending ? 0.6 : 1 }
  if (variant === 'column') {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <label><span style={k}>View</span>
          <select style={sel} value={view} onChange={e => go({ view: e.target.value })}>
            <option value="one">One pitch, up close</option><option value="all">Every pitch type</option><option value="compare">Compare levels</option>
          </select></label>
        <label><span style={k}>Level</span>
          <select style={sel} value={level} disabled={view === 'compare'} onChange={e => go({ level: e.target.value })}>
            {view === 'compare' ? <option value={level}>All levels, side by side</option> : levels.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select></label>
        <label><span style={k}>Thrown by</span>
          <select style={sel} value={hand} onChange={e => go({ hand: e.target.value })}>
            <option value="R">Right-handed pitchers</option><option value="L">Left-handed pitchers</option><option value="B">Both (left- and right-handed)</option>
          </select></label>
        <label><span style={k}>Pitch type</span>
          <select style={sel} value={type ?? ''} disabled={view === 'all' || types.length === 0} onChange={e => go({ type: e.target.value })}>
            {view === 'all' ? <option value="">All pitch types</option> : null}
            {types.map(t => <option key={t.code} value={t.code}>{t.name}{t.locked ? '  (Pro)' : ''}</option>)}
          </select></label>
      </div>
    )
  }
  // League mode: one card holding every filter, each as a row of buttons so nothing is hidden in a dropdown: the view, the level, which pitchers throw it, and the pitch
  const grp = (label: string, children: React.ReactNode, hint?: string) => (
    <div style={{ minWidth: 0 }}>
      <span style={k}>{label}{hint ? <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600, marginLeft: 8, color: C.mute }}>{hint}</span> : null}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>
    </div>
  )
  const btn = (on: boolean, disabled = false): React.CSSProperties => ({ ...seg(on), borderRadius: 6, minHeight: 40, padding: '0 14px', fontSize: 13.5, opacity: disabled ? 0.45 : pending ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer' })
  return (
    <section aria-label="Filters" style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '14px 16px', marginBottom: 18, display: 'grid', gap: 14 }}>
      {grp('View', <>
        <button type="button" aria-pressed={view === 'one'} onClick={() => go({ view: 'one' })} style={btn(view === 'one')}>One pitch, up close</button>
        <button type="button" aria-pressed={view === 'all'} onClick={() => go({ view: 'all' })} style={btn(view === 'all')}>Every pitch type</button>
        <button type="button" aria-pressed={view === 'compare'} onClick={() => go({ view: 'compare' })} style={btn(view === 'compare')}>Compare levels</button>
      </>)}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, max-content))', gap: '14px 36px' }}>
        {grp('Level', levels.map(l => <button key={l.value} type="button" aria-pressed={view !== 'compare' && l.value === level} disabled={view === 'compare'} onClick={() => go({ level: l.value })} style={btn(view !== 'compare' && l.value === level, view === 'compare')}>{l.label}</button>), view === 'compare' ? 'every level is shown side by side' : undefined)}
        {grp('Thrown by', ([['R', 'Right-handed'], ['L', 'Left-handed'], ['B', 'Both']] as [string, string][]).map(([v, l]) => <button key={v} type="button" aria-pressed={hand === v} onClick={() => go({ hand: v })} style={btn(hand === v)}>{l}</button>))}
      </div>
      {view !== 'all' && types.length > 0 && grp('Pitch type', types.map(t => <button key={t.code} type="button" aria-pressed={t.code === type} onClick={() => go({ type: t.code })} style={btn(t.code === type)}>{t.name}{t.locked ? <span style={{ opacity: 0.7, fontWeight: 600 }}> · Pro</span> : null}</button>))}
    </section>
  )
}
