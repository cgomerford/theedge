'use client'

// src/components/pitch-shape/PitcherStory.tsx
//
// The tabbed story for a chosen pitcher in the Pitch Shape Lab, laid out the way Baseball Savant lays out its tools: one tab per question, a one-line "the question" under the tabs, then the answer.
//   1 His shape        where his average lands, how consistent it is, and a dial to see what other shapes have produced
//   2 Who else         the pitchers who throw the same shape, and how they are doing
//   3 What changed     his shape and results season by season (2022 to now), month by month, and at each level
//   4 Why the results  what pitches shaped like his have produced against what his own have, and the rest of his full read
// This file is the shell (PitcherStory), the season table (PitcherYears) and the shape-versus-results panel (WhereHeLands). The panels' contents are passed in by the map component, which owns the state.
// Descriptions of what already happened; nothing here looks forward.

import { Suspense, useEffect, useState } from 'react'
import Tabs from '@/components/ui/Tabs'
import { C } from '@/components/team/ui'
import { pitcherYears, shapeReadout, type Readout, type YearRow, type YearsResult } from '@/app/mlb/lab/pitch-shape/actions'
import { ResultsReadout } from './ShapeResultsKit'
import type { Board } from '@/lib/pitch-shape/results'
import type { Level } from '@/lib/milb-shape/levels'
import { log } from '@/lib/log'

export type StoryTab = { id: string; label: string; question: string; node: React.ReactNode }

export default function PitcherStory({ name, headline, tabs, tab, onTab }: { name: string; headline?: React.ReactNode; tabs: StoryTab[]; tab: string; onTab: (id: string) => void }) {
  const cur = tabs.find(t => t.id === tab) ?? tabs[0]
  const idx = tabs.findIndex(t => t.id === cur.id)
  const next = tabs[idx + 1] ?? null
  return (
    <section aria-label={`${name}'s pitch shape story`} style={{ marginTop: 6 }}>
      {headline}
      <Suspense fallback={null}>
        <Tabs label="The story" tabs={tabs.map(t => ({ id: t.id, label: t.label }))} value={cur.id} onChange={onTab} urlSync={false} sticky={false} />
      </Suspense>
      <div id="story-panel" role="tabpanel" style={{ padding: '14px 2px 4px' }}>
        <div style={{ fontSize: 10.5, letterSpacing: '.14em', fontWeight: 800, color: C.orange, textTransform: 'uppercase' }}>The question</div>
        <p style={{ margin: '2px 0 14px', fontSize: 17, fontWeight: 700, color: C.ink, lineHeight: 1.35 }}>{cur.question}</p>
        {cur.node}
        {next && <div style={{ marginTop: 18, paddingTop: 12, borderTop: `1px solid ${C.line}`, textAlign: 'right' }}><button type="button" onClick={() => { onTab(next.id); document.getElementById('story-panel')?.scrollIntoView({ block: 'start' }) }} style={{ minHeight: 44, padding: '0 18px', borderRadius: 6, border: `1.5px solid ${C.ink}`, background: C.ink, color: C.cream, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Next: {next.label} →</button></div>}
      </div>
    </section>
  )
}

// ---------- 3 · What changed: season by season ----------

const sg = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`
const MIN_SW = 50
const FIRST_LOADED = 2024

export function PitcherYears({ id, type, level, lc, name }: { id: number; type: string; level: string; lc: string; name: string }) {
  const [res, setRes] = useState<YearsResult | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    setRes(undefined)
    pitcherYears({ id, type, level }).then(r => { if (live) setRes(r) }).catch(e => { log.error('PitcherYears', 'pitcherYears failed', e instanceof Error ? e.message : String(e)); if (live) setRes(null) })
    return () => { live = false }
  }, [id, type, level])
  if (res === undefined) return <div style={{ fontSize: 13, color: C.mute }}>Reading his seasons…</div>
  if (!res || !res.ok) return <div style={{ fontSize: 13, color: '#5b5347' }}>{res && res.error === 'pro' ? 'The season-by-season read for this pitch type is part of Pro.' : 'His seasons could not be loaded.'}</div>
  const have = new Map(res.rows.map(r => [r.season, r]))
  const years = Array.from({ length: res.to - FIRST_LOADED + 1 }, (_, i) => FIRST_LOADED + i)   // the shape tables begin with 2024; earlier seasons are not shown as empty rows
  const first = res.rows[0], last = res.rows[res.rows.length - 1]
  const th: React.CSSProperties = { fontSize: 10, letterSpacing: '.1em', fontWeight: 800, color: C.mute, textTransform: 'uppercase', textAlign: 'right', padding: '6px 8px', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '8px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  let prev: YearRow | null = null
  const body = years.map(y => {
    const r = have.get(y)
    if (!r) return <tr key={y} style={{ borderTop: `1px solid ${C.soft}`, color: C.mute }}><td style={{ ...td, textAlign: 'left', fontWeight: 800 }}>{y}</td><td colSpan={6} style={{ ...td, textAlign: 'left' }}>no {lc} tracked for him this season</td></tr>
    const w = r.nSwings >= MIN_SW ? r.nWhiffs / r.nSwings : null
    const pw = prev && prev.nSwings >= MIN_SW ? prev.nWhiffs / prev.nSwings : null
    const dl = (cur: number, was: number | undefined, d = 1, unit = '') => (was == null ? null : <span style={{ display: 'block', fontSize: 11, color: Math.abs(cur - was) < (d === 1 ? 0.15 : 0.6) ? C.faint : '#2F6DB5', fontWeight: 700 }}>{sg(cur - was, d)}{unit}</span>)
    const row = (
      <tr key={y} style={{ borderTop: `1px solid ${C.soft}` }}>
        <td style={{ ...td, textAlign: 'left', fontWeight: 800 }}>{y}</td>
        <td style={td}>{r.nPitches.toLocaleString('en-US')}</td>
        <td style={td}><b>{r.velo.toFixed(1)}</b>{dl(r.velo, prev?.velo, 1, ' mph')}</td>
        <td style={td}><b>{r.ivb.toFixed(1)}</b>{dl(r.ivb, prev?.ivb, 1, ' in')}</td>
        <td style={td}><b>{r.hb.toFixed(1)}</b>{dl(r.hb, prev?.hb, 1, ' in')}</td>
        <td style={td}><b>{Math.round(r.slot)}°</b>{dl(r.slot, prev?.slot, 0, '°')}</td>
        <td style={td}><b>{w == null ? '—' : `${(w * 100).toFixed(1)}%`}</b>{w != null && pw != null ? <span style={{ display: 'block', fontSize: 11, color: Math.abs(w - pw) < 0.01 ? C.faint : '#2F6DB5', fontWeight: 700 }}>{sg((w - pw) * 100)} pts</span> : null}</td>
      </tr>
    )
    prev = r
    return row
  })
  const dv = first && last && first !== last ? { velo: last.velo - first.velo, ivb: last.ivb - first.ivb, hb: last.hb - first.hb } : null
  return (
    <div>
      {dv && <p style={{ margin: '0 0 12px', fontSize: 14.5, lineHeight: 1.55, color: '#3d382f' }}>From {first.season} to {last.season}, {name}’s {lc} went from <b>{first.velo.toFixed(1)}</b> to <b>{last.velo.toFixed(1)} mph</b> ({sg(dv.velo)}), from <b>{first.ivb.toFixed(1)}</b> to <b>{last.ivb.toFixed(1)} in</b> of ride ({sg(dv.ivb)}) and from <b>{first.hb.toFixed(1)}</b> to <b>{last.hb.toFixed(1)} in</b> of run ({sg(dv.hb)}).</p>}
      <div style={{ overflowX: 'auto', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr><th style={{ ...th, textAlign: 'left' }}>Season</th><th style={th}>Pitches</th><th style={th}>Speed</th><th style={th}>Ride</th><th style={th}>Run (arm side +)</th><th style={th}>Arm angle</th><th style={th}>Whiffs per swing</th></tr></thead>
          <tbody>{body}</tbody>
        </table>
      </div>
      <p style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5, margin: '6px 0 0' }}>One row per season at {level === 'mlb' ? 'MLB' : 'this level'}: his average {lc} over every pitch tracked that season, with the change from the season before in blue. Whiffs per swing needs {MIN_SW}+ swings. A season is blank when there are no tracked pitches of this type for him; nothing is filled in. Seasons before 2024 are not loaded yet.</p>
    </div>
  )
}

// ---------- 4 · Why the results: where his average shape lands ----------

export function WhereHeLands({ avg, board, id, type, hand, level, lvl, lc, name, seasonsLabel, ownSeason }: {
  avg: { hb: number; ivb: number }; board: Board | null | undefined; id: number; type: string; hand: 'R' | 'L'; level: string; lvl: Level; lc: string; name: string; seasonsLabel: string; ownSeason: number
}) {
  const [ro, setRo] = useState<Readout | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    setRo(undefined)
    shapeReadout({ type, hand, level, hb: avg.hb, ivb: avg.ivb, radius: 1 }).then(r => { if (live) setRo(r.ok ? r.readout : null) }).catch(e => { log.error('WhereHeLands', 'shapeReadout failed', e instanceof Error ? e.message : String(e)); if (live) setRo(null) })
    return () => { live = false }
  }, [avg.hb, avg.ivb, type, hand, level])
  const row = board?.rows.find(r => r.pitcherId === id) ?? null
  const shapeW = ro?.here.whiff ?? null, ownW = row ? row.own.whiff ?? row.ownRaw.whiff ?? null : null
  const gap = shapeW != null && ownW != null ? (ownW - shapeW) * 100 : null
  return (
    <div>
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16, marginBottom: 12 }}>
        {ro ? <ResultsReadout flush level={lvl} here={ro.here} league={ro.league} saved={ro.saved} score={ro.score} lc={lc} radius={1} spanLabel={seasonsLabel} />
          : <div style={{ fontSize: 13, color: '#5b5347' }}>{ro === undefined ? 'Reading what pitches shaped like his have produced…' : 'What pitches shaped like his have produced isn’t built for this pitch yet. Nothing is estimated in its place.'}</div>}
      </div>
      {gap != null && shapeW != null && ownW != null && (
        <p style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.6, color: '#3d382f' }}>
          His average {lc} averages <b>{avg.ivb.toFixed(1)} inches</b> of ride and <b>{Math.abs(avg.hb).toFixed(1)} inches</b> of run toward his {avg.hb >= 0 ? 'arm' : 'glove'} side. Across the league ({seasonsLabel}), {lc}s with that shape get <b>{(shapeW * 100).toFixed(1)}%</b> whiffs per swing; {name}’s own ({ownSeason}) get <b>{(ownW * 100).toFixed(1)}%</b>, which is <b style={{ color: Math.abs(gap) < 1 ? C.ink : gap > 0 ? '#13694F' : '#A8391F' }}>{Math.abs(gap).toFixed(1)} points {Math.abs(gap) < 1 ? 'in line with' : gap > 0 ? 'above' : 'below'}</b> the shape.
          {Math.abs(gap) < 1 ? ' So most of what the pitch gets is explained by how it moves.' : gap > 0 ? ' The shape accounts for part of that; the rest comes from things the map cannot see, such as where he locates it, how he sequences it around his other pitches and how it looks coming out of his hand.' : ' The shape would normally get more; the difference can come from location, sequencing or the batters he faces, none of which the map can see.'}
        </p>
      )}
    </div>
  )
}
