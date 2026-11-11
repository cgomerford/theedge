'use client'

// src/components/pitch-shape/ShapeChanges.tsx
//
// "What changed" in the Pitch Shape Lab. Shape is physics: it settles within a few outings, it does not care who was batting, and it explains why a pitch works, so a pitcher's shape
// moving is an early reason to look, before the results show it. Two surfaces, both read from /api/mlb/pitch-shape/shape-changes (precomputed tables, rules in changes.ts):
//   * ShapeChanges           — league-wide, four lists: moved during the season, pitches added or dropped, the fastball gap opening or closing, and pitches that exist at one level and not another.
//   * PitcherSeasonChanges   — one pitcher, one pitch: what moved from his first full month to his latest, whether the pitch was added or dropped, and its gap to his fastball.
// Description only: it says what changed and when, never why and never what comes next.

import { useEffect, useState } from 'react'
import { C } from '@/components/team/ui'
import { LEVEL_LABEL, type Level } from '@/lib/milb-shape/levels'
import { PITCH_NAMES } from '@/lib/pitch-shape/model'
import { AXIS_LABEL, AXIS_UNIT, THRESH, type Axis, type PitchChange, type Separation, type UsageChange } from '@/lib/pitch-shape/changes'
import { log } from '@/lib/log'

const ORANGE_TEXT = '#B83A0E'
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const mon = (m: number | null) => (m == null ? '' : MON[m - 1] ?? String(m))
const name = (t: string) => PITCH_NAMES[t] ?? t
const sg = (v: number, d = 1) => { const r = Number(v.toFixed(d)); return r === 0 ? (0).toFixed(d) : `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(d)}` }
const DIGITS: Record<Axis, number> = { velo: 1, spin: 0, ivb: 1, hb: 1, relZ: 2, relX: 2, ext: 2 }

type Ref = { id: number; name: string; team: string }
type Overall = {
  season: number
  changes: (PitchChange & { pitcher: Ref })[]
  usage: (UsageChange & { pitcher: Ref })[]
  separation: (Separation & { pitcher: Ref })[]
  levels: { pitcher: Ref; pitchType: string; kind: 'not-in-mlb' | 'new-in-mlb'; level: Level; nLevel: number; nMlb: number }[]
  pro: boolean
}
type One = { season: number; changes: PitchChange[]; usage: UsageChange[]; separation: Separation[]; lockedTypes: number }

const cache = new Map<string, unknown>()
function useJson<T>(url: string | null): T | null | undefined {
  const [got, setGot] = useState<{ url: string; v: T | null } | null>(null)
  useEffect(() => {
    if (url == null || cache.has(url)) return
    let live = true
    fetch(url)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: T) => { cache.set(url, j); if (live) setGot({ url, v: j }) })
      .catch(e => { log.error('ShapeChanges', 'fetch failed', e instanceof Error ? e.message : e); cache.set(url, null); if (live) setGot({ url, v: null }) })
    return () => { live = false }
  }, [url])
  if (url == null) return undefined
  if (cache.has(url)) return cache.get(url) as T | null
  return got?.url === url ? got.v : undefined
}

const th: React.CSSProperties = { textAlign: 'right', fontSize: 10, letterSpacing: '.08em', fontWeight: 800, color: C.mute, textTransform: 'uppercase', padding: '6px 8px', borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '7px 8px', borderBottom: `1px solid ${C.soft}`, fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' }
const pill = (on: boolean): React.CSSProperties => ({ minHeight: 38, padding: '0 12px', borderRadius: 4, border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? C.cream : C.ink, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' })
const chip = (bg: string, fg: string): React.CSSProperties => ({ background: bg, color: fg, fontWeight: 800, fontSize: 11.5, borderRadius: 3, padding: '2px 8px', whiteSpace: 'nowrap' })

/** The seven axes of one pitch's change as a row of cells: the flagged ones highlighted. */
function DeltaCells({ c }: { c: PitchChange }) {
  return (
    <>
      {(Object.keys(THRESH) as Axis[]).map(a => {
        const d = c.delta[a], on = c.flagged.includes(a)
        return <td key={a} style={{ ...td, background: on ? '#FFF1EA' : undefined, fontWeight: on ? 800 : 400, color: on ? ORANGE_TEXT : d == null ? C.faint : '#5b5347' }}>{d == null ? '—' : `${sg(d, DIGITS[a])}`}</td>
      })}
    </>
  )
}
const AXES = Object.keys(THRESH) as Axis[]
const AXIS_HEAD: Record<Axis, string> = { velo: 'Speed mph', spin: 'Spin rpm', ivb: 'Ride in', hb: 'Run in', relZ: 'Rel. height ft', relX: 'Rel. side ft', ext: 'Extension ft' }

export default function ShapeChanges({ season, onOpen }: { season: number; onOpen: (id: number, name: string) => void }) {
  const d = useJson<Overall>(`/api/mlb/pitch-shape/shape-changes?season=${season}`)
  const [tab, setTab] = useState<'moved' | 'usage' | 'gap' | 'levels'>('moved')
  const [type, setType] = useState<string>('all')
  if (d === undefined) return <div style={{ padding: 24, color: C.mute, fontSize: 13 }}>Reading every pitcher’s months…</div>
  if (d === null) return <div style={{ padding: 24, color: '#5b5347', fontSize: 14 }}>The monthly shape table could not be read right now.</div>
  const types = [...new Set([...d.changes, ...d.usage, ...d.separation, ...d.levels].map(x => x.pitchType))].sort()
  const keep = (t: string) => type === 'all' || t === type
  const moved = d.changes.filter(x => keep(x.pitchType)), usage = d.usage.filter(x => keep(x.pitchType)), gap = d.separation.filter(x => keep(x.pitchType)), lv = d.levels.filter(x => keep(x.pitchType))
  const tabs: [typeof tab, string, number][] = [['moved', 'Moved during the season', moved.length], ['usage', 'Added or dropped', usage.length], ['gap', 'Gap to the fastball', gap.length], ['levels', 'Across levels', lv.length]]
  const row = (p: Ref, children: React.ReactNode) => (
    <tr key={`${p.id}`}>
      <td style={{ ...td, textAlign: 'left' }}><button type="button" onClick={() => onOpen(p.id, p.name)} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 800, color: ORANGE_TEXT, cursor: 'pointer', textAlign: 'left' }}>{p.name}</button><span style={{ color: C.mute, fontSize: 12 }}> {p.team}</span></td>
      {children}
    </tr>
  )
  return (
    <div>
      <p style={{ fontSize: 14, color: '#3a352c', lineHeight: 1.6, margin: '0 0 6px', maxWidth: 920 }}>
        <b>Shape moves before results do.</b> Results are noisy and slow to settle; shape is physics, settles within a few outings and explains why a pitch works. These are the pitchers whose shape changed in {d.season}: a pitch that gained or lost speed, spin, ride or run, a release point that moved, a pitch added or dropped, or a changeup or sweeper that moved closer to or further from the fastball. Each reading is a full month (50+ pitches) against his latest, at least two months apart. It says what changed, not why.
      </p>
      <div role="group" aria-label="Which change" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 8px' }}>
        {tabs.map(([id, label, n]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} style={pill(tab === id)}>{label} ({n})</button>)}
      </div>
      {types.length > 1 && (
        <div role="group" aria-label="Pitch" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 10px' }}>
          <span style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.mute, textTransform: 'uppercase' }}>Pitch</span>
          <button type="button" aria-pressed={type === 'all'} onClick={() => setType('all')} style={pill(type === 'all')}>All</button>
          {types.map(t => <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} style={pill(type === t)}>{name(t)}</button>)}
        </div>
      )}
      {!d.pro && <p style={{ fontSize: 12.5, color: '#5b5347', margin: '0 0 8px' }}>Four-seams and sweepers are open to everyone; every other pitch type is Pro.</p>}

      <div style={{ overflowX: 'auto' }}>
        {tab === 'moved' && (moved.length === 0 ? <p style={{ fontSize: 13.5, color: '#5b5347' }}>No pitch has moved by more than the flag size yet.</p> : (
          <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}>Pitcher</th><th style={{ ...th, textAlign: 'left' }}>Pitch</th><th style={{ ...th, textAlign: 'left' }}>First → latest month</th>{AXES.map(a => <th key={a} style={th}>{AXIS_HEAD[a]}</th>)}</tr></thead>
            <tbody>
              {moved.map(c => row(c.pitcher, <>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{name(c.pitchType)}</td>
                <td style={{ ...td, textAlign: 'left', color: '#5b5347' }}>{mon(c.first.month)} ({c.first.n}) → {mon(c.last.month)} ({c.last.n})</td>
                <DeltaCells c={c} />
              </>))}
            </tbody>
          </table>
        ))}
        {tab === 'usage' && (usage.length === 0 ? <p style={{ fontSize: 13.5, color: '#5b5347' }}>No pitch has been added or dropped inside the season yet.</p> : (
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}>Pitcher</th><th style={{ ...th, textAlign: 'left' }}>Pitch</th><th style={{ ...th, textAlign: 'left' }}>What happened</th><th style={th}>Share early</th><th style={th}>Share now</th><th style={th}>Pitches</th></tr></thead>
            <tbody>
              {usage.map(u => row(u.pitcher, <>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{name(u.pitchType)}</td>
                <td style={{ ...td, textAlign: 'left' }}><span style={u.kind === 'added' ? chip('#E3F3EC', '#13694F') : chip('#FBE6E1', '#A8391F')}>{u.kind === 'added' ? `Added, from ${mon(u.month)}` : `Dropped, last seen ${mon(u.month)}`}</span></td>
                <td style={td}>{(u.early * 100).toFixed(0)}%</td><td style={td}>{(u.late * 100).toFixed(0)}%</td><td style={{ ...td, color: C.mute }}>{u.n}</td>
              </>))}
            </tbody>
          </table>
        ))}
        {tab === 'gap' && (gap.length === 0 ? <p style={{ fontSize: 13.5, color: '#5b5347' }}>No pitch has moved much closer to or further from its fastball yet.</p> : (
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}>Pitcher</th><th style={{ ...th, textAlign: 'left' }}>Pitch against his fastball</th><th style={th}>Gap first (in)</th><th style={th}>Gap now (in)</th><th style={th}>Change</th><th style={th}>Speed gap (mph)</th><th style={{ ...th, textAlign: 'left' }}>Read</th></tr></thead>
            <tbody>
              {gap.map(s => row(s.pitcher, <>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{name(s.pitchType)} <span style={{ color: C.mute, fontWeight: 400 }}>vs {name(s.fastball)}</span></td>
                <td style={td}>{s.first.gap.toFixed(1)} <span style={{ color: C.mute }}>({mon(s.first.month)})</span></td><td style={td}>{s.last.gap.toFixed(1)} <span style={{ color: C.mute }}>({mon(s.last.month)})</span></td>
                <td style={{ ...td, fontWeight: 800, color: s.change < 0 ? '#A8391F' : '#13694F' }}>{sg(s.change)}</td>
                <td style={td}>{s.veloFirst.toFixed(1)} → {s.veloLast.toFixed(1)}</td>
                <td style={{ ...td, textAlign: 'left', color: '#5b5347', whiteSpace: 'normal' }}>{s.change < 0 ? `Now moves more like his ${name(s.fastball).toLowerCase()}` : `Now moves further from his ${name(s.fastball).toLowerCase()}`}</td>
              </>))}
            </tbody>
          </table>
        ))}
        {tab === 'levels' && (lv.length === 0 ? <p style={{ fontSize: 13.5, color: '#5b5347' }}>No pitch is thrown at one level and missing at another for pitchers seen at both.</p> : (
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}>Pitcher</th><th style={{ ...th, textAlign: 'left' }}>Pitch</th><th style={{ ...th, textAlign: 'left' }}>What differs</th><th style={th}>Pitches at that level</th><th style={th}>Pitches in MLB</th></tr></thead>
            <tbody>
              {lv.map((x, i) => (
                <tr key={`${x.pitcher.id}${x.pitchType}${x.level}${i}`}>
                  <td style={{ ...td, textAlign: 'left' }}><button type="button" onClick={() => onOpen(x.pitcher.id, x.pitcher.name)} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 800, color: ORANGE_TEXT, cursor: 'pointer' }}>{x.pitcher.name}</button><span style={{ color: C.mute, fontSize: 12 }}> {x.pitcher.team}</span></td>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{name(x.pitchType)}</td>
                  <td style={{ ...td, textAlign: 'left' }}><span style={x.kind === 'new-in-mlb' ? chip('#E3F3EC', '#13694F') : chip('#FBE6E1', '#A8391F')}>{x.kind === 'new-in-mlb' ? `New in MLB: not thrown at ${LEVEL_LABEL[x.level]}` : `Thrown at ${LEVEL_LABEL[x.level]}, not in MLB`}</span></td>
                  <td style={td}>{x.nLevel.toLocaleString()}</td><td style={td}>{x.nMlb.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: C.faint, margin: '8px 0 0', lineHeight: 1.5 }}>
        Flag sizes: speed {THRESH.velo} mph, spin {THRESH.spin} rpm, ride and run {THRESH.ivb} in, release height, release side and extension {THRESH.relZ} ft. Run and release side are compared by size, so a left-hander and a right-hander read the same way. “Added” is a pitch at 2% of his pitches or less early and 8% or more now; “dropped” is the reverse. “Across levels” counts a pitch as thrown from 100 pitches, and needs 300 pitches at each level. Source: pitch_shape_monthly, pitch_shape_pitcher and the minor-league tables.
      </p>
    </div>
  )
}

/** One pitcher, one pitch: what moved through the season, whether it was added or dropped, and its gap to his fastball. */
export function PitcherSeasonChanges({ pitcherId, season, pitchType, pitchName }: { pitcherId: number; season: number; pitchType: string; pitchName: string }) {
  const d = useJson<One>(`/api/mlb/pitch-shape/shape-changes?season=${season}&pitcher=${pitcherId}`)
  const lc = pitchName.toLowerCase()
  if (d === undefined) return <div style={{ fontSize: 13, color: C.mute }}>Reading his months…</div>
  if (d === null) return <div style={{ fontSize: 13, color: '#5b5347' }}>His monthly shape could not be read right now.</div>
  const c = d.changes.find(x => x.pitchType === pitchType)
  const u = d.usage.find(x => x.pitchType === pitchType)
  const s = d.separation.find(x => x.pitchType === pitchType)
  const others = d.usage.filter(x => x.pitchType !== pitchType)
  if (!c && !u && !s && others.length === 0) return <div style={{ fontSize: 13, color: '#5b5347' }}>His {lc} has no two full months (50+ pitches) at least two months apart this season, so there is no change to read yet.</div>
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {c ? (
        <div>
          <div style={{ fontSize: 13.5, color: '#3a352c', marginBottom: 4 }}>From <b>{mon(c.first.month)}</b> ({c.first.n} pitches) to <b>{mon(c.last.month)}</b> ({c.last.n} pitches), his {lc}:</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6 }}>
            {AXES.map(a => {
              const v = c.delta[a], on = c.flagged.includes(a)
              return <div key={a} style={{ background: on ? '#FFF1EA' : C.soft, borderRadius: 6, padding: '6px 10px' }}><div style={{ fontSize: 9.5, letterSpacing: '.12em', fontWeight: 800, color: on ? ORANGE_TEXT : C.mute, textTransform: 'uppercase' }}>{AXIS_LABEL[a]}</div><b style={{ fontSize: 17, fontVariantNumeric: 'tabular-nums', color: on ? ORANGE_TEXT : v == null ? C.faint : '#3a352c' }}>{v == null ? '—' : `${sg(v, DIGITS[a])}${AXIS_UNIT[a]}`}</b></div>
            })}
          </div>
          <div style={{ fontSize: 12, color: C.mute, marginTop: 4 }}>{c.flagged.length ? `Flagged: ${c.flagged.map(a => AXIS_LABEL[a].toLowerCase()).join(', ')}.` : 'Nothing moved by more than the flag size: his shape held through the season.'}</div>
        </div>
      ) : <div style={{ fontSize: 13, color: '#5b5347' }}>His {lc} has no two full months at least two months apart, so its shape has no change to read yet.</div>}
      {u && <div style={{ fontSize: 13.5, color: '#3a352c' }}><span style={u.kind === 'added' ? chip('#E3F3EC', '#13694F') : chip('#FBE6E1', '#A8391F')}>{u.kind === 'added' ? `Added, from ${mon(u.month)}` : `Dropped, last seen ${mon(u.month)}`}</span> His {lc} was {(u.early * 100).toFixed(0)}% of his pitches early in the season and is {(u.late * 100).toFixed(0)}% now.</div>}
      {s && <div style={{ fontSize: 13.5, color: '#3a352c' }}>Against his {name(s.fastball).toLowerCase()}, the gap in movement went from <b>{s.first.gap.toFixed(1)} in</b> ({mon(s.first.month)}) to <b>{s.last.gap.toFixed(1)} in</b> ({mon(s.last.month)}), <b style={{ color: s.change < 0 ? '#A8391F' : '#13694F' }}>{sg(s.change)} in</b>; the speed gap went from {s.veloFirst.toFixed(1)} to {s.veloLast.toFixed(1)} mph. {Math.abs(s.change) >= 1.5 ? (s.change < 0 ? `It now moves more like his ${name(s.fastball).toLowerCase()}.` : `It now moves further from his ${name(s.fastball).toLowerCase()}.`) : ''}</div>}
      {others.length > 0 && <div style={{ fontSize: 13.5, color: '#3a352c' }}>Other pitches this season: {others.map(x => `${name(x.pitchType)} ${x.kind === 'added' ? `added from ${mon(x.month)}` : `dropped after ${mon(x.month)}`}`).join('; ')}.</div>}
      {d.lockedTypes > 0 && <div style={{ fontSize: 12, color: C.mute }}>{d.lockedTypes} more pitch type{d.lockedTypes === 1 ? '' : 's'} with changes are Pro.</div>}
    </div>
  )
}
