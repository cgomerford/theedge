'use client'
// src/components/me/dashboard/Dashboard.tsx
//
// The My x9Lab dashboard: slicers across the top (they filter every widget at once, like Power BI), then a 12-column grid of widgets the person arranges. "Edit"
// turns on the controls: move, resize, configure, remove, add. The layout is saved to the person's account (PUT /api/me/dashboard); the server checks it against
// their plan, so a free account stays within its stats and six widgets. In local dev, where there is no real account row, the layout is kept in this browser instead.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { FREE_WIDGET_LIMIT, PRO_WIDGET_LIMIT, SLICER_LIMIT, SPAN, newId, starterLayout, type Layout, type Size, type Slicer, type Widget } from '@/lib/dashboard/layout'
import { sliced, type LeagueRow } from '@/lib/dashboard/compute'
import { allowedStats, statDef, statsFor, type Role } from '@/lib/dashboard/stats'
import { MLB_TEAMS } from '@/lib/teams'
import { log } from '@/lib/log'
import { CARD, C, EYEBROW, GREY, NUMS, SANS } from '../ui'
import DualRange from './DualRange'
import { useLeagueData } from './useLeagueData'
import { KpiBody, LeadersBody, MyPlayersBody, MyTeamsBody, ScatterBody, StarredBody, widgetTitle, type PlayerSummary, type TeamSummary } from './widgets'

const LOCAL_KEY = 'x9_dashboard_dev'
const TEAMS = MLB_TEAMS.map(t => t.abbrev).sort()
const btn: React.CSSProperties = { minHeight: 36, padding: '0 12px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: SANS, color: C.ink }
const sel: React.CSSProperties = { minHeight: 34, border: `1px solid ${C.line}`, borderRadius: 6, background: '#fff', padding: '0 6px', fontFamily: SANS, fontSize: 13, color: C.ink }

type SaveState = 'idle' | 'saving' | 'saved' | 'local' | 'error'

export default function Dashboard({ isPro, players, teams }: { isPro: boolean; players: PlayerSummary[]; teams: TeamSummary[] }) {
  const [layout, setLayout] = useState<Layout | null>(null)
  const [canSave, setCanSave] = useState(true)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<string | null>(null)   // the widget whose settings are open
  const [save, setSave] = useState<SaveState>('idle')
  const first = useRef(true)

  // load the saved layout (or the starter layout) once
  useEffect(() => {
    let live = true
    fetch('/api/me/dashboard', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { layout: Layout; saved: boolean; canSave: boolean }) => {
        if (!live) return
        setCanSave(j.canSave)
        let l = j.layout
        if (!j.canSave) { try { const raw = localStorage.getItem(LOCAL_KEY); if (raw) l = JSON.parse(raw) as Layout } catch { /* private window: use the starter layout */ } }
        setLayout(l)
      })
      .catch(e => { log.error('Dashboard', 'layout load failed', e instanceof Error ? e.message : e); if (live) setLayout(starterLayout(isPro)) })
    return () => { live = false }
  }, [isPro])

  // save a moment after the last change
  useEffect(() => {
    if (!layout) return
    if (first.current) { first.current = false; return }
    setSave('saving')
    const t = setTimeout(() => {
      if (!canSave) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(layout)); setSave('local') } catch { setSave('error') } return }
      fetch('/api/me/dashboard', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout }) })
        .then(r => setSave(r.ok ? 'saved' : 'error'))
        .catch(() => setSave('error'))
    }, 700)
    return () => clearTimeout(t)
  }, [layout, canSave])

  const roles = useMemo(() => {
    const s = new Set<Role>()
    for (const w of layout?.widgets ?? []) { if ('role' in w) s.add(w.role); if (w.kind === 'starred') s.add('pitcher') }
    for (const sl of layout?.slicers ?? []) if (sl.kind === 'range') s.add(sl.role)
    return Array.from(s)
  }, [layout])
  const data = useLeagueData(roles)
  const slicedBy = useMemo(() => ({ batter: sliced(data.batter.rows, 'batter', layout?.slicers ?? []), pitcher: sliced(data.pitcher.rows, 'pitcher', layout?.slicers ?? []) }), [data, layout])
  const mineIds = useMemo(() => new Set(players.map(p => p.id)), [players])

  const patch = useCallback((fn: (l: Layout) => Layout) => setLayout(l => (l ? fn(l) : l)), [])
  const limit = isPro ? PRO_WIDGET_LIMIT : FREE_WIDGET_LIMIT
  const setWidget = (id: string, next: Partial<Widget>) => patch(l => ({ ...l, widgets: l.widgets.map(w => (w.id === id ? ({ ...w, ...next } as Widget) : w)) }))
  const move = (id: string, d: -1 | 1) => patch(l => { const i = l.widgets.findIndex(w => w.id === id), j = i + d; if (i < 0 || j < 0 || j >= l.widgets.length) return l; const a = l.widgets.slice(); [a[i], a[j]] = [a[j], a[i]]; return { ...l, widgets: a } })
  const remove = (id: string) => patch(l => ({ ...l, widgets: l.widgets.filter(w => w.id !== id) }))
  const addWidget = (w: Widget) => { patch(l => ({ ...l, widgets: [...l.widgets, w] })); setAdding(false); setOpen(w.id) }

  if (!layout) return <div style={{ ...CARD, padding: 18, color: GREY, fontSize: 14 }}>Loading your dashboard…</div>

  const bounds = (role: Role, stat: string) => {
    const v = data[role].rows.map(r => r.s[stat]).filter((x): x is number => typeof x === 'number')
    return v.length ? { min: Math.floor(Math.min(...v)), max: Math.ceil(Math.max(...v)) } : null
  }
  const saveNote = save === 'saving' ? 'Saving…' : save === 'saved' ? 'Saved to your account' : save === 'local' ? 'Saved in this browser (dev)' : save === 'error' ? 'Could not save. Your changes are on screen only.' : ''

  return (
    <section aria-label="Your dashboard" style={{ marginBottom: 26 }}>
      <style>{`.db-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px;align-items:start}.db-w[data-size=S]{grid-column:span 3}.db-w[data-size=M]{grid-column:span 6}.db-w[data-size=L]{grid-column:span 9}.db-w[data-size=XL]{grid-column:span 12}@media(max-width:1100px){.db-w[data-size=S]{grid-column:span 6}.db-w[data-size=L]{grid-column:span 12}}@media(max-width:700px){.db-w[data-size]{grid-column:span 12}}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 10px' }}>
        <div style={EYEBROW}>Your dashboard</div>
        <span style={{ fontSize: 12.5, color: GREY }} aria-live="polite">{saveNote}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {editing && <button type="button" style={btn} onClick={() => { if (window.confirm('Reset your dashboard to the default layout?')) { setLayout(starterLayout(isPro)); setOpen(null) } }}>Reset to default</button>}
          <button type="button" aria-pressed={editing} style={{ ...btn, background: editing ? C.ink : '#fff', color: editing ? C.cream : C.ink }} onClick={() => { setEditing(e => !e); setAdding(false); setOpen(null) }}>{editing ? 'Done' : 'Edit dashboard'}</button>
        </div>
      </div>

      {/* slicers */}
      <div style={{ ...CARD, padding: '12px 14px', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: '12px 18px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {layout.slicers.length === 0 && <div style={{ fontSize: 13.5, color: GREY, alignSelf: 'center' }}>No slicers. {editing ? 'Use New slicer to filter every widget at once.' : ''}</div>}
          {layout.slicers.map(sl => (
            <div key={sl.id} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 10px', minWidth: 190, background: '#FAF8F3' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: GREY, letterSpacing: '.04em' }}>{sl.kind === 'team' ? 'Team' : `${statDef(sl.role, sl.stat)?.label ?? sl.stat} (${sl.role === 'batter' ? 'hitters' : 'pitchers'})`}</div>
                {editing && <button type="button" aria-label="Remove this slicer" onClick={() => patch(l => ({ ...l, slicers: l.slicers.filter(x => x.id !== sl.id) }))} style={{ ...btn, minHeight: 24, padding: '0 7px' }}>×</button>}
              </div>
              {sl.kind === 'team' ? (
                <select aria-label="Team slicer" value={sl.team} onChange={e => patch(l => ({ ...l, slicers: l.slicers.map(x => (x.id === sl.id ? { ...sl, team: e.target.value } : x)) }))} style={{ ...sel, width: '100%', marginTop: 6 }}>
                  <option value="">All teams</option>{TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (() => {
                const b = bounds(sl.role, sl.stat), def = statDef(sl.role, sl.stat)
                return b ? <DualRange min={b.min} max={b.max} lo={sl.lo} hi={sl.hi} step={def && def.decimals === 0 ? 1 : 1} label={def?.label ?? sl.stat} onChange={(lo, hi) => patch(l => ({ ...l, slicers: l.slicers.map(x => (x.id === sl.id ? { ...sl, lo, hi } : x)) }))} />
                  : <div style={{ fontSize: 12.5, color: GREY, marginTop: 6 }}>{data[sl.role].status === 'loading' ? 'Loading…' : 'No data yet'}</div>
              })()}
            </div>
          ))}
          {editing && layout.slicers.length < SLICER_LIMIT && (
            <SlicerAdder isPro={isPro} onAdd={(s: Slicer) => patch(l => ({ ...l, slicers: [...l.slicers, s] }))} />
          )}
        </div>
      </div>

      {/* widgets */}
      <div className="db-grid">
        {layout.widgets.map((w, i) => (
          <div key={w.id} className="db-w" data-size={w.size} style={{ ...CARD, padding: '12px 14px', outline: open === w.id ? `2px solid ${C.orange}` : undefined }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: GREY, flex: '1 1 140px' }}>{widgetTitle(w)}</div>
              {editing && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => move(w.id, -1)} style={{ ...btn, minHeight: 28, padding: '0 8px' }}>←</button>
                  <button type="button" aria-label="Move later" disabled={i === layout.widgets.length - 1} onClick={() => move(w.id, 1)} style={{ ...btn, minHeight: 28, padding: '0 8px' }}>→</button>
                  <select aria-label="Width" value={w.size} onChange={e => setWidget(w.id, { size: e.target.value as Size })} style={{ ...sel, minHeight: 28 }}>{(Object.keys(SPAN) as Size[]).map(s => <option key={s} value={s}>{s === 'S' ? 'Small' : s === 'M' ? 'Medium' : s === 'L' ? 'Large' : 'Full width'}</option>)}</select>
                  {'role' in w && <button type="button" aria-expanded={open === w.id} onClick={() => setOpen(o => (o === w.id ? null : w.id))} style={{ ...btn, minHeight: 28, padding: '0 8px' }}>Settings</button>}
                  <button type="button" aria-label="Remove this widget" onClick={() => remove(w.id)} style={{ ...btn, minHeight: 28, padding: '0 8px' }}>×</button>
                </div>
              )}
            </div>
            {editing && open === w.id && 'role' in w && <WidgetSettings w={w} isPro={isPro} onChange={next => setWidget(w.id, next)} />}
            {w.kind === 'kpi' && <KpiBody w={w} rows={slicedBy[w.role]} data={data[w.role]} />}
            {w.kind === 'leaders' && <LeadersBody w={w} rows={slicedBy[w.role]} data={data[w.role]} mineIds={mineIds} />}
            {w.kind === 'scatter' && <ScatterBody w={w} rows={slicedBy[w.role]} data={data[w.role]} mineIds={mineIds} />}
            {w.kind === 'myPlayers' && <MyPlayersBody players={players} />}
            {w.kind === 'myTeams' && <MyTeamsBody teams={teams} />}
            {w.kind === 'starred' && <StarredBody pitchers={slicedBy.pitcher} data={data.pitcher} />}
          </div>
        ))}
      </div>

      {editing && (
        <div style={{ ...CARD, padding: 14, marginTop: 14 }}>
          {layout.widgets.length >= limit ? (
            <div style={{ fontSize: 14, color: '#5b5347' }}>You have {layout.widgets.length} of {limit} widgets. {isPro ? 'Remove one to make room.' : <>Remove one to make room, or <Link href="/pricing" style={{ color: C.orange, fontWeight: 800 }}>see Pro</Link> for up to {PRO_WIDGET_LIMIT} widgets and every stat.</>}</div>
          ) : adding ? (
            <NewWidgetPicker isPro={isPro} onPick={addWidget} onCancel={() => setAdding(false)} />
          ) : (
            <button type="button" style={{ ...btn, background: C.orange, color: '#fff', borderColor: C.orange }} onClick={() => setAdding(true)}>New widget ({layout.widgets.length} of {limit})</button>
          )}
        </div>
      )}
      {!isPro && !editing && <div style={{ fontSize: 12.5, color: GREY, marginTop: 8 }}>Free accounts hold {FREE_WIDGET_LIMIT} widgets and the core stats. <Link href="/pricing" style={{ color: C.orange, fontWeight: 800 }}>See Pro</Link> for up to {PRO_WIDGET_LIMIT} widgets and every Statcast stat.</div>}
      <div style={{ fontSize: 11.5, color: GREY, marginTop: 6 }}>League stats: Baseball Savant, season to date{data.batter.season ?? data.pitcher.season ? ` (${data.batter.season ?? data.pitcher.season})` : ''}, refreshed daily. Slicers filter every widget that uses league stats.</div>
    </section>
  )
}

function StatSelect({ role, value, onChange, isPro, label }: { role: Role; value: string; onChange: (v: string) => void; isPro: boolean; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={e => onChange(e.target.value)} style={sel}>
      {statsFor(role).map(s => { const locked = !isPro && !s.free; return <option key={s.key} value={s.key} disabled={locked}>{s.label}{locked ? ' (Pro)' : ''}</option> })}
    </select>
  )
}

function WidgetSettings({ w, isPro, onChange }: { w: Extract<Widget, { role: Role }>; isPro: boolean; onChange: (next: Partial<Widget>) => void }) {
  const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 800, color: GREY, letterSpacing: '.05em' }
  return (
    <div style={{ display: 'flex', gap: '8px 12px', flexWrap: 'wrap', background: '#F1EEE6', borderRadius: 8, padding: 10, marginBottom: 10 }}>
      <label style={field}>PLAYERS<select value={w.role} onChange={e => { const role = e.target.value as Role; const first = allowedStats(role, isPro)[0]?.key ?? ''; onChange(w.kind === 'scatter' ? { role, x: first, y: allowedStats(role, isPro)[1]?.key ?? first } : { role, stat: first } as Partial<Widget>) }} style={sel}><option value="batter">Hitters</option><option value="pitcher">Pitchers</option></select></label>
      {w.kind !== 'scatter' && <label style={field}>STAT<StatSelect role={w.role} value={w.stat} isPro={isPro} label="Stat" onChange={v => onChange({ stat: v } as Partial<Widget>)} /></label>}
      {w.kind === 'scatter' && <>
        <label style={field}>ACROSS (X)<StatSelect role={w.role} value={w.x} isPro={isPro} label="X axis stat" onChange={v => onChange({ x: v } as Partial<Widget>)} /></label>
        <label style={field}>UP (Y)<StatSelect role={w.role} value={w.y} isPro={isPro} label="Y axis stat" onChange={v => onChange({ y: v } as Partial<Widget>)} /></label>
      </>}
      {w.kind === 'kpi' && <label style={field}>SHOW<select value={w.agg} onChange={e => onChange({ agg: e.target.value } as Partial<Widget>)} style={sel}><option value="leader">League leader</option><option value="average">Average</option><option value="median">Median</option><option value="total">Total</option></select></label>}
      {w.kind === 'leaders' && <>
        <label style={field}>ORDER<select value={w.dir} onChange={e => onChange({ dir: e.target.value } as Partial<Widget>)} style={sel}><option value="best">Best first</option><option value="worst">Worst first</option></select></label>
        <label style={field}>HOW MANY<select value={w.n} onChange={e => onChange({ n: Number(e.target.value) } as Partial<Widget>)} style={sel}>{[3, 5, 7, 10].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      </>}
    </div>
  )
}

function NewWidgetPicker({ isPro, onPick, onCancel }: { isPro: boolean; onPick: (w: Widget) => void; onCancel: () => void }) {
  const hr = allowedStats('batter', isPro)[0]?.key ?? 'home_run'
  const items: { label: string; hint: string; make: () => Widget }[] = [
    { label: 'Stat tile', hint: 'One big number: a league leader, average or total.', make: () => ({ id: newId('k'), kind: 'kpi', size: 'S', role: 'batter', stat: hr, agg: 'leader' }) },
    { label: 'Leaderboard', hint: 'A ranked bar list of the top players for a stat.', make: () => ({ id: newId('l'), kind: 'leaders', size: 'M', role: 'batter', stat: hr, n: 5, dir: 'best' }) },
    { label: 'Scatter chart', hint: 'Every player as a dot, any two stats.', make: () => ({ id: newId('s'), kind: 'scatter', size: 'M', role: 'batter', x: 'on_base_percent', y: 'slg_percent' }) },
    { label: 'My players', hint: 'The players you follow, with their season line.', make: () => ({ id: newId('p'), kind: 'myPlayers', size: 'M' }) },
    { label: 'My teams', hint: 'The teams you follow: record, last and next game.', make: () => ({ id: newId('t'), kind: 'myTeams', size: 'M' }) },
    { label: 'Starred pitchers', hint: 'Pitchers you starred in the Pitch Shape Lab.', make: () => ({ id: newId('r'), kind: 'starred', size: 'M' }) },
  ]
  return (
    <div>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Choose a widget</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        {items.map(it => <button key={it.label} type="button" onClick={() => onPick(it.make())} style={{ ...btn, textAlign: 'left', padding: '10px 12px', minHeight: 0 }}><b style={{ display: 'block', fontSize: 14 }}>{it.label}</b><span style={{ fontSize: 12, color: GREY, fontWeight: 500 }}>{it.hint}</span></button>)}
      </div>
      <button type="button" style={{ ...btn, marginTop: 10 }} onClick={onCancel}>Cancel</button>
    </div>
  )
}

function SlicerAdder({ isPro, onAdd }: { isPro: boolean; onAdd: (s: Slicer) => void }) {
  const [role, setRole] = useState<Role>('batter')
  const [stat, setStat] = useState('home_run')
  const stats = allowedStats(role, isPro)
  return (
    <div style={{ border: `1px dashed ${C.line}`, borderRadius: 10, padding: '8px 10px', display: 'grid', gap: 6, minWidth: 220 }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: GREY }}>NEW SLICER</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <select aria-label="Slicer players" value={role} onChange={e => { const r = e.target.value as Role; setRole(r); setStat(allowedStats(r, isPro)[0]?.key ?? '') }} style={sel}><option value="batter">Hitters</option><option value="pitcher">Pitchers</option></select>
        <select aria-label="Slicer stat" value={stat} onChange={e => setStat(e.target.value)} style={sel}>{stats.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" style={btn} onClick={() => onAdd({ id: newId('sl'), kind: 'range', role, stat, lo: null, hi: null })}>Range slicer</button>
        <button type="button" style={btn} onClick={() => onAdd({ id: newId('sl'), kind: 'team', team: '' })}>Team slicer</button>
      </div>
    </div>
  )
}

export type { LeagueRow }
export { NUMS }
