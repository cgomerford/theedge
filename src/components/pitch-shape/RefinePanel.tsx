'use client'

// src/components/pitch-shape/RefinePanel.tsx
//
// "Refine the pitchers" for a Triple-A or Florida State League view: find the pitchers who have not made the jump, were sent down, were traded or struggled in MLB, whose shape works at this
// level but has not worked in MLB, and so on. Every choice is a plain fact from the pitcher's record or the level's results (see src/lib/milb-shape/status-math.ts); choices combine with AND,
// the map, the pitcher list and the sample counts all follow them, and nothing here scores or predicts. The panel only holds the controls: the parent works out who matches.

import { useEffect, useState } from 'react'
import { C } from '@/components/team/ui'
import { MLB_TEAMS } from '@/lib/teams'
import { LEVEL_LABEL, type Level } from '@/lib/milb-shape/levels'
import { NO_REFINE, isRefined, type PitcherStatus, type Refine } from '@/lib/milb-shape/status-math'
import type { TranslationStatus } from '@/lib/milb-shape/translate'
import { log } from '@/lib/log'
import InfoTip from './InfoTip'

const ORANGE_TEXT = '#B83A0E'
export type ShapeRefine = { carry: 'any' | TranslationStatus; verdict: 'any' | 'ahead' | 'behind' | 'level'; rankMin: number }
export const NO_SHAPE_REFINE: ShapeRefine = { carry: 'any', verdict: 'any', rankMin: 0 }
export const shapeRefined = (s: ShapeRefine) => s.carry !== 'any' || s.verdict !== 'any' || s.rankMin > 0

export type Statuses = { statuses: Map<number, PitcherStatus>; leagueRuns100: number | null; asOf: string; season: number }
const cache = new Map<string, Statuses | null>()

/** The career-path facts for the pitchers of one level, pitch type and hand. undefined while loading, null when they could not be read. */
export function usePitcherStatuses(level: Level, type: string, hand: string, skip: boolean): Statuses | null | undefined {
  const key = `${level}|${type}|${hand}`
  const [got, setGot] = useState<{ key: string; v: Statuses | null } | null>(null)
  useEffect(() => {
    if (skip || cache.has(key)) return
    let live = true
    fetch(`/api/mlb/pitch-shape/pitcher-status?level=${level}&type=${type}&hand=${hand}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { statuses: PitcherStatus[]; leagueRuns100: number | null; asOf: string; season: number }) => {
        const v = { statuses: new Map(j.statuses.map(s => [s.id, s])), leagueRuns100: j.leagueRuns100, asOf: j.asOf, season: new Date(j.asOf).getFullYear() }
        cache.set(key, v); if (live) setGot({ key, v })
      })
      .catch(e => { log.error('RefinePanel', 'statuses fetch failed', e instanceof Error ? e.message : e); cache.set(key, null); if (live) setGot({ key, v: null }) })
    return () => { live = false }
  }, [key, level, type, hand, skip])
  if (skip) return null
  if (cache.has(key)) return cache.get(key)
  return got?.key === key ? got.v : undefined
}

const sel: React.CSSProperties = { minHeight: 40, width: '100%', minWidth: 0, textOverflow: 'ellipsis', border: `1px solid ${C.line}`, borderRadius: 4, background: '#fff', padding: '0 10px', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: C.ink, cursor: 'pointer' }
const lab: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }

const PRESETS: { id: string; text: string; why: string; refine: Refine; shape: ShapeRefine }[] = [
  { id: 'never', text: 'Have not made the jump', why: 'Never pitched in MLB, and a shape rank of 70 or more at this level', refine: { ...NO_REFINE, mlb: 'never' }, shape: { ...NO_SHAPE_REFINE, rankMin: 70 } },
  { id: 'down', text: 'Sent down after struggling', why: 'Pitched in MLB this season, struggled there, and was sent back down', refine: { ...NO_REFINE, mlb: 'sent-down', results: 'struggled' }, shape: NO_SHAPE_REFINE },
  { id: 'traded', text: 'Traded, shape works here', why: 'Traded in the last 12 months, and above average at this level', refine: { ...NO_REFINE, moves: 'traded-12' }, shape: { ...NO_SHAPE_REFINE, rankMin: 60 } },
  { id: 'carry', text: 'Works here, not in MLB', why: 'A shape that works at this level but has not worked in MLB', refine: NO_REFINE, shape: { ...NO_SHAPE_REFINE, carry: 'minors-only' } },
]

export default function RefinePanel({ level, refine, setRefine, shape, setShape, statuses, matched, total, lc }: {
  level: Level; refine: Refine; setRefine: (r: Refine) => void; shape: ShapeRefine; setShape: (s: ShapeRefine) => void
  statuses: Statuses | null | undefined; matched: number; total: number; lc: string
}) {
  const active = isRefined(refine) || shapeRefined(shape)
  const [open, setOpen] = useState(active)
  const label = LEVEL_LABEL[level]
  const set = (p: Partial<Refine>) => setRefine({ ...refine, ...p })
  const num = (v: string): number | null => { const n = Number(v); return v === '' || !Number.isFinite(n) ? null : Math.max(15, Math.min(60, Math.round(n))) }
  return (
    <details open={open} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)} style={{ background: '#fff', border: `1px solid ${active ? C.orange : C.line}`, borderRadius: 6, padding: '0 12px', margin: '0 0 8px' }}>
      <summary className="pv-k" style={{ cursor: 'pointer', minHeight: 34, display: 'flex', alignItems: 'center', gap: 10, color: ORANGE_TEXT }}>
        Refine the {label} pitchers: made the jump, sent down, traded, struggled in MLB
        {active && <span style={{ color: C.ink, fontWeight: 700, letterSpacing: 0, textTransform: 'none' }}>· showing {matched.toLocaleString()} of {total.toLocaleString()}</span>}
      </summary>
      <div style={{ padding: '2px 0 8px' }}>
        <div role="group" aria-label="Starting points" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 8px' }}>
          {PRESETS.map(p => (
            <button key={p.id} type="button" title={p.why} onClick={() => { setRefine(p.refine); setShape(level === 'afl' ? { ...p.shape, rankMin: 0, verdict: 'any' } : p.shape) }}   // the Arizona Fall League has no run value, so no shape rank or verdict to filter on
              style={{ minHeight: 34, padding: '0 12px', borderRadius: 4, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{p.text}</button>
          ))}
          <button type="button" onClick={() => { setRefine(NO_REFINE); setShape(NO_SHAPE_REFINE) }} disabled={!active}
            style={{ minHeight: 34, padding: '0 12px', borderRadius: 4, border: `1px solid ${C.line}`, background: active ? '#fff7f3' : '#fff', color: active ? ORANGE_TEXT : C.faint, fontWeight: 800, fontSize: 13, cursor: active ? 'pointer' : 'default', fontFamily: 'inherit' }}>Reset all</button>
        </div>
        {statuses === undefined && <p style={{ fontSize: 13, color: C.mute, margin: '0 0 8px' }}>Loading each pitcher’s record (age, MLB time, trades)…</p>}
        {statuses === null && <p role="alert" style={{ fontSize: 13, color: '#A8391F', margin: '0 0 8px' }}>The career records could not be loaded right now, so the record-based choices are off. The shape choices still work.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px 12px', alignItems: 'end' }}>
          <label style={lab}><span className="pv-k">MLB career<InfoTip k="mlbCareer" /></span>
            <select value={refine.mlb} onChange={e => set({ mlb: e.target.value as Refine['mlb'] })} style={sel} disabled={!statuses}>
              <option value="any">Any</option><option value="never">Has never pitched in MLB</option><option value="before">Pitched in MLB before this season only</option>
              <option value="this-season">Pitched in MLB this season</option><option value="sent-down">Pitched in MLB this season, then sent down</option>
            </select></label>
          <label style={lab}><span className="pv-k">His MLB results this season<InfoTip k="mlbResults" /></span>
            <select value={refine.results} onChange={e => set({ results: e.target.value as Refine['results'] })} style={sel} disabled={!statuses}>
              <option value="any">Any</option><option value="struggled">Struggled (0.3+ runs per 100 worse than the MLB average)</option><option value="good">Pitched well (0.3+ better)</option><option value="thin">Too few MLB pitches to judge (under 150)</option>
            </select></label>
          <label style={lab}><span className="pv-k">Moves</span>
            <select value={refine.moves} onChange={e => set({ moves: e.target.value as Refine['moves'] })} style={sel} disabled={!statuses}>
              <option value="any">Any</option><option value="traded-12">Traded in the last 12 months</option><option value="traded-season">Traded this season</option><option value="not-traded">Not traded in the last 12 months</option>
            </select></label>
          <label style={lab}><span className="pv-k">Organisation</span>
            <select value={refine.org ?? ''} onChange={e => set({ org: e.target.value ? Number(e.target.value) : null })} style={sel} disabled={!statuses}>
              <option value="">Any club</option>{[...MLB_TEAMS].sort((a, b) => a.name.localeCompare(b.name)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></label>
          <div style={lab}><span className="pv-k" id="rf-age">Age</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }} role="group" aria-labelledby="rf-age">
              <input type="number" inputMode="numeric" min={15} max={60} placeholder="from" value={refine.ageMin ?? ''} onChange={e => set({ ageMin: num(e.target.value) })} aria-label="Youngest age" style={{ ...sel, minWidth: 0, width: 'calc(50% - 14px)' }} disabled={!statuses} />
              <span aria-hidden>to</span>
              <input type="number" inputMode="numeric" min={15} max={60} placeholder="to" value={refine.ageMax ?? ''} onChange={e => set({ ageMax: num(e.target.value) })} aria-label="Oldest age" style={{ ...sel, minWidth: 0, width: 'calc(50% - 14px)' }} disabled={!statuses} />
            </span></div>
          <label style={lab}><span className="pv-k">Does the shape carry to MLB?<InfoTip k="carry" /></span>
            <select value={shape.carry} onChange={e => setShape({ ...shape, carry: e.target.value as ShapeRefine['carry'] })} style={sel}>
              <option value="any">Any</option><option value="minors-only">Works here, not in MLB</option><option value="holds">Works here and in MLB</option><option value="mlb-better">Works better in MLB</option><option value="neither">Works at neither</option>
            </select></label>
          <label style={lab}><span className="pv-k">His results against his shape<InfoTip k="gap" /></span>
            <select value={shape.verdict} onChange={e => setShape({ ...shape, verdict: e.target.value as ShapeRefine['verdict'] })} style={sel}>
              <option value="any">Any</option><option value="ahead">Outperforming his shape</option><option value="behind">Underperforming his shape</option><option value="level">In line with it</option>
            </select></label>
          <label style={lab}><span className="pv-k">Shape rank at {label}, at least <b style={{ color: C.ink }}>{shape.rankMin || 'any'}</b><InfoTip k="shapeRank" /></span>
            <input type="range" min={0} max={95} step={5} value={shape.rankMin} onChange={e => setShape({ ...shape, rankMin: Number(e.target.value) })} aria-label="Shape rank at least" style={{ width: '100%', minHeight: 40 }} /></label>
        </div>
        <p style={{ fontSize: 12, color: '#5b5347', lineHeight: 1.4, margin: '8px 0 0', maxWidth: 900 }}>
          {matched.toLocaleString()} of {total.toLocaleString()} {label} {lc} throwers match{active ? '' : ' (no choice made)'}. Choices combine, and the map, the list and the counts follow them. A pitcher whose record could not be read never counts as “has not pitched in MLB”. MLB results are runs allowed per 100 pitches against the MLB average, with a 150-pitch minimum.
        </p>
      </div>
    </details>
  )
}
