'use client'

// src/components/lab/ChartBuilder.tsx
//
// Lab experiment: a Power BI-style dashboard over the club-level pitching
// numbers. Slicers across the top (league, division, starters/bullpen
// override), a canvas of visuals (KPI / scatter / bars / table) and a fields
// pane on the right. Clicking a club in any visual cross-highlights it in all
// of them. The layout is saved in this browser only (localStorage, wrapped in
// try/catch); Reset restores the starter dashboard.

import { useEffect, useMemo, useState } from 'react'
import { C, SANS } from '@/components/team/ui'
import { LoadBar, useTeamMakeups } from '@/components/lab/useTeamMakeups'
import PlayersPanel from '@/components/lab/PlayersPanel'
import ChartTile, { type Ctx } from '@/components/lab/dash/ChartTile'
import FieldsPane from '@/components/lab/dash/FieldsPane'
import { STORAGE_KEY, blankTile, defaultTiles, newId, type Channel, type Kind, type Tile } from '@/components/lab/dash/types'
import { MLB_TEAMS } from '@/lib/teams'
import { METRIC_BY_KEY, ROLE_LABEL, summarize, type TeamSummary } from '@/lib/lab/team-summary'
import type { Role, TeamRunsByRole } from '@/lib/lab/team-pitch-makeup.server-fetch-allowed'

const ROLES: Role[] = ['all', 'sp', 'rp']
const chip = (on: boolean): React.CSSProperties => ({
  fontFamily: SANS, fontWeight: 700, fontSize: 12, padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
  border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : '#5b5347',
})

function validTiles(raw: unknown): Tile[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const ok = raw.every(t => t && typeof t.id === 'string' && ['kpi', 'scatter', 'bars', 'table', 'hist', 'radar', 'mix', 'dumbbell', 'movement', 'heat', 'flight', 'armclock'].includes(t.kind) && METRIC_BY_KEY.has(t.x?.metric) && METRIC_BY_KEY.has(t.y?.metric)
    && Array.isArray(t.cols) && t.cols.every((c: Channel) => METRIC_BY_KEY.has(c.metric)))
  return ok ? (raw as Tile[]) : null
}

export default function ChartBuilder({ season, runs }: { season: number; runs: Record<number, TeamRunsByRole> }) {
  const { loaded, failed, done, total } = useTeamMakeups(season)
  const [tiles, setTiles] = useState<Tile[]>(() => defaultTiles())
  const [active, setActive] = useState<string | null>(null)
  const [league, setLeague] = useState<'all' | 'AL' | 'NL'>('all')
  const [division, setDivision] = useState<'all' | 'East' | 'Central' | 'West'>('all')
  const [forceRole, setForceRole] = useState<Role | null>(null)
  const [sel, setSel] = useState<number[]>([])
  const [restored, setRestored] = useState(false)
  const [onlySel, setOnlySel] = useState(false)
  const [teamsOpen, setTeamsOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  // Restore the saved layout once, after mount (avoids a server/client mismatch).
  useEffect(() => {
    try {
      const saved = validTiles(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
      if (saved) setTiles(saved)
    } catch { /* private window / blocked storage: fall back to defaults */ }
    setRestored(true)
  }, [])
  useEffect(() => {
    if (!restored) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tiles)) } catch { /* ignore */ }
  }, [tiles, restored])

  const byRole = useMemo(() => {
    const out: Record<Role, Map<number, TeamSummary>> = { all: new Map(), sp: new Map(), rp: new Map() }
    for (const t of MLB_TEAMS) {
      const m = loaded[t.id]
      if (!m) continue
      for (const r of ROLES) out[r].set(t.id, summarize(t, m, r, runs[t.id]))
    }
    return out
  }, [loaded, runs])

  const ctx: Ctx = useMemo(() => ({
    clubs: MLB_TEAMS.filter(t => loaded[t.id] && (league === 'all' || t.league === league) && (division === 'all' || t.division === division) && (!onlySel || sel.length === 0 || sel.includes(t.id))),
    val: (c, id) => {
      const t = byRole[forceRole ?? c.role].get(id)
      return t ? METRIC_BY_KEY.get(c.metric)?.get(t) ?? null : null
    },
    force: forceRole,
    summaryOf: (role, id) => byRole[role].get(id),
    sel, season, loading: done < total,
    toggle: id => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id])),
  }), [loaded, league, division, byRole, forceRole, sel, onlySel, season, done, total])

  const activeTile = tiles.find(t => t.id === active) ?? null
  const add = (k: Kind) => { const t = blankTile(k); setTiles(ts => [...ts, t]); setActive(t.id) }
  const patch = (p: Partial<Tile>) => setTiles(ts => ts.map(t => (t.id === active ? { ...t, ...p } : t)))
  const move = (from: string, to: string) => setTiles(ts => {
    const a = ts.findIndex(t => t.id === from), b = ts.findIndex(t => t.id === to)
    if (a < 0 || b < 0 || a === b) return ts
    const next = [...ts]
    const [t] = next.splice(a, 1)
    next.splice(b, 0, t)        // lands where the target was: before it when dragging up, after it when dragging down
    return next
  })
  const nameOf = (id: number) => MLB_TEAMS.find(t => t.id === id)?.short ?? ''

  return (
    <>
      <LoadBar done={done} total={total} failed={failed.length} season={season} />

      <div className="x9-desk-sticky" style={{ position: 'sticky', top: 0, zIndex: 5, background: C.cream, padding: '12px 0', marginTop: 8, borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <Slicer label="League">
            {(['all', 'AL', 'NL'] as const).map(l => <button key={l} style={chip(league === l)} onClick={() => setLeague(l)}>{l === 'all' ? 'Both' : l}</button>)}
          </Slicer>
          <Slicer label="Division">
            {(['all', 'East', 'Central', 'West'] as const).map(d => <button key={d} style={chip(division === d)} onClick={() => setDivision(d)}>{d === 'all' ? 'All' : d}</button>)}
          </Slicer>
          <Slicer label="Pitchers">
            <button style={chip(forceRole === null)} onClick={() => setForceRole(null)}>Per visual</button>
            {ROLES.map(r => <button key={r} style={chip(forceRole === r)} onClick={() => setForceRole(r)}>{ROLE_LABEL[r]}</button>)}
          </Slicer>
          <Slicer label="Teams">
            <div style={{ position: 'relative' }}>
              <button style={chip(sel.length > 0 || teamsOpen)} onClick={() => setTeamsOpen(o => !o)}>
                {sel.length === 0 ? 'Choose teams' : `${sel.length} selected`} ▾
              </button>
              {teamsOpen && (
                <>
                  <div onClick={() => setTeamsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 10, width: 520, maxWidth: '86vw', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,.12)', padding: 14 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                      <button style={chip(false)} onClick={() => setSel(MLB_TEAMS.filter(t => loaded[t.id]).map(t => t.id))}>All</button>
                      <button style={chip(false)} onClick={() => setSel([])}>None</button>
                      {(['AL', 'NL'] as const).map(l => <button key={l} style={chip(false)} onClick={() => setSel(MLB_TEAMS.filter(t => t.league === l && loaded[t.id]).map(t => t.id))}>{l}</button>)}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '2px 12px', maxHeight: 340, overflowY: 'auto' }}>
                      {[...MLB_TEAMS].sort((a, b) => a.name.localeCompare(b.name)).map(t => (
                        <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontSize: 13, padding: '3px 0', cursor: loaded[t.id] ? 'pointer' : 'default', opacity: loaded[t.id] ? 1 : 0.4, minWidth: 0 }}>
                          <input type="checkbox" disabled={!loaded[t.id]} checked={sel.includes(t.id)} onChange={() => ctx.toggle(t.id)} />
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.primary_color, flexShrink: 0 }} />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.short}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            {sel.length > 0 && sel.length <= 4 && sel.map(id => <button key={id} style={{ ...chip(true), background: C.orange, borderColor: C.orange }} onClick={() => ctx.toggle(id)}>{nameOf(id)}</button>)}
            {sel.length > 4 && <button style={{ ...chip(true), background: C.orange, borderColor: C.orange }} onClick={() => setSel([])}>Clear {sel.length}</button>}
            {sel.length > 0 && (
              <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontFamily: SANS, fontSize: 12, fontWeight: 600, color: '#5b5347', cursor: 'pointer' }}>
                <input type="checkbox" checked={onlySel} onChange={e => setOnlySel(e.target.checked)} /> Show only these
              </label>
            )}
            {sel.length === 0 && <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.faint }}>or click a club in any visual</span>}
          </Slicer>
          <button style={{ ...chip(false), marginLeft: 'auto' }} onClick={() => { setTiles(defaultTiles()); setActive(null); setSel([]) }}>Reset dashboard</button>
        </div>
      </div>

      <div className="dash-layout" style={{ marginTop: 16 }}>
        <div className="dash-canvas">
          {tiles.map(t => (
            <ChartTile key={t.id} tile={t} ctx={ctx} active={t.id === active} onActivate={() => setActive(t.id)}
              drag={{
                dragging: dragId === t.id, over: overId === t.id && dragId !== t.id,
                onDragStart: () => setDragId(t.id), onDragEnd: () => { setDragId(null); setOverId(null) },
                onDragOver: () => { if (dragId && overId !== t.id) setOverId(t.id) },
                onDrop: () => { if (dragId) move(dragId, t.id); setDragId(null); setOverId(null) },
                onResize: span => setTiles(ts => ts.map(x => (x.id === t.id && x.span !== span ? { ...x, span } : x))),
              }}
              onDuplicate={() => setTiles(ts => { const i = ts.findIndex(x => x.id === t.id); const c = { ...t, id: newId() }; return [...ts.slice(0, i + 1), c, ...ts.slice(i + 1)] })}
              onRemove={() => { setTiles(ts => ts.filter(x => x.id !== t.id)); if (active === t.id) setActive(null) }} />
          ))}
          {tiles.length === 0 && <p style={{ gridColumn: '1 / -1', fontFamily: SANS, color: C.faint, textAlign: 'center', padding: 40 }}>Empty canvas. Create a visual from the pane on the right.</p>}
        </div>
        <FieldsPane tile={activeTile} onAdd={add} onChange={patch} />
      </div>
      <PlayersPanel teamIds={sel} season={season} />
      <p style={{ fontFamily: SANS, fontSize: 9.5, color: C.faint, lineHeight: 1.6, marginTop: 16 }}>
        Starters = the pitcher who threw a club&apos;s first pitch of the game; bullpen = everyone after.
        Correlations (r) describe how two numbers lined up across the clubs shown, not whether one drives the other. xwOBA against stands in for xERA, which Savant doesn&apos;t publish per team.
        Drag a visual by its ⠿ handle to move it, or drag its right edge to resize. Your layout is saved in this browser only.
      </p>
    </>
  )
}

function Slicer({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: SANS, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: C.mute }}>{label}</span>
      {children}
    </div>
  )
}
