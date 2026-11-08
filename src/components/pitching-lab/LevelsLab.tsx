'use client'

// src/components/pitching-lab/LevelsLab.tsx
//
// Pitching Lab → Levels: one pitcher at MLB, Triple-A and the Florida State League side by side, from his per-pitch log at each level (the same log the Location Lab and Sequencing read).
// Five views of the same pitches: shape, what he throws, where he throws it, how he sequences, and what hitters did. Every number carries its sample and a figure under its minimum
// is "pending", never filled in. Shape, usage, location and sequencing are physical or behavioural and compare directly; results are measured against each level's own hitters, parks and
// strike zone, so they are shown side by side and not put on one scale. It describes what happened and is not a forecast.

import { useEffect, useMemo, useState } from 'react'
import { C, SANS } from '@/components/team/ui'
import { fetchLabLog } from '@/lib/lab-log'
import type { PitcherPitchLog } from '@/lib/pitcher-pitch-log'
import { LEVEL_LABEL, LEVEL_SHORT, type Level } from '@/lib/milb-shape/levels'
import { COUNT_LABEL, COUNT_STATES, GRID, MIN, nextShares, profileOf, type LevelProfile, type PitchProfile } from '@/lib/milb-shape/level-profile'
import { useLevelUse } from './LabLevelBar'
import { LEVEL_COLOUR } from '@/components/pitch-shape/LevelsCompared'
import { PITCH_NAMES } from '@/lib/pitch-shape/model'

const ORANGE_TEXT = '#B83A0E'
const SEASON = new Date().getFullYear()
const th: React.CSSProperties = { textAlign: 'left', fontSize: 10, letterSpacing: '.1em', fontWeight: 800, color: C.mute, textTransform: 'uppercase', padding: '6px 8px', borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: `1px solid ${C.soft}`, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', verticalAlign: 'top' }
const pc = (x: number | null | undefined, d = 0) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`)
const f1 = (x: number | null | undefined, d = 1) => (x == null ? '—' : x.toFixed(d))
const w3 = (x: number | null | undefined) => (x == null ? '—' : x.toFixed(3).replace(/^0/, ''))
const sg = (x: number, d = 1) => { const r = Number(x.toFixed(d)); return r === 0 ? (0).toFixed(d) : `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(d)}` }
const nameOf = (t: string, names: Record<string, string>) => names[t] ?? PITCH_NAMES[t] ?? t

type Loaded = { level: Level; log: PitcherPitchLog; profile: LevelProfile }

function Section({ n, title, note, children }: { n: number; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, marginTop: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: ORANGE_TEXT, textTransform: 'uppercase' }}>{n} · {title}</div>
      {note && <p style={{ margin: '4px 0 12px', fontSize: 13.5, color: '#5b5347', lineHeight: 1.5, maxWidth: 900 }}>{note}</p>}
      {children}
    </section>
  )
}

const Dot = ({ level }: { level: Level }) => <span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: LEVEL_COLOUR[level], marginRight: 7 }} />

function Chips({ options, value, onChange, label }: { options: { id: string; text: string }[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 10px' }}>
      {options.map(o => (
        <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}
          style={{ minHeight: 38, padding: '0 12px', borderRadius: 4, border: `1px solid ${o.id === value ? C.ink : C.line}`, background: o.id === value ? C.ink : '#fff', color: o.id === value ? C.cream : C.ink, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{o.text}</button>
      ))}
    </div>
  )
}

// ---- 1 · shape --------------------------------------------------------------------------------------------------------------------------------------

function ShapePlot({ loaded, type }: { loaded: Loaded[]; type: string }) {
  const W = 520, H = 420, pad = 38
  // per-level samples of movement (inches, arm side positive) for the chosen type, and every type's average per level
  const pts = (l: Loaded) => l.log.pitches.filter(p => p.pfx && (type === 'ALL' || p.pitchType === type)).map(p => [(l.log.throws === 'L' ? p.pfx![0] : -p.pfx![0]) * 12, p.pfx![1] * 12] as const)
  const all = loaded.flatMap(l => l.profile.types.filter(t => t.run != null && t.ride != null && (type === 'ALL' || t.type === type)).map(t => [t.run as number, t.ride as number] as const))
  const dots = type === 'ALL' ? [] : loaded.flatMap(l => pts(l))
  const xs = [...all.map(a => a[0]), ...dots.map(d => d[0])], ys = [...all.map(a => a[1]), ...dots.map(d => d[1])]
  if (xs.length === 0) return <p style={{ fontSize: 13, color: C.mute }}>No movement data for this pitch.</p>
  const lo = (v: number[]) => Math.floor(Math.min(...v) - 2), hi = (v: number[]) => Math.ceil(Math.max(...v) + 2)
  const x0 = lo(xs), x1 = hi(xs), y0 = lo(ys), y1 = hi(ys)
  const X = (v: number) => pad + ((v - x0) / (x1 - x0)) * (W - pad - 10), Y = (v: number) => H - pad - ((v - y0) / (y1 - y0)) * (H - pad - 10)
  const types = [...new Set(loaded.flatMap(l => l.profile.types.map(t => t.type)))].filter(t => type === 'ALL' || t === type)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Movement of his pitches at each level: ride up, run toward his arm side" style={{ width: '100%', maxWidth: 620, height: 'auto', background: '#EDE8DC', borderRadius: 8 }}>
      {[x0, x1].map((v, i) => <text key={i} x={X(v)} y={H - 12} fontSize="11" fill={C.mute} textAnchor={i ? 'end' : 'start'}>{v} in</text>)}
      <text x={W / 2} y={H - 12} fontSize="11" fill={C.mute} textAnchor="middle">RUN (ARM-SIDE BREAK) →</text>
      <text x={8} y={20} fontSize="11" fill={C.mute}>↑ RIDE</text>
      {x0 < 0 && x1 > 0 && <line x1={X(0)} x2={X(0)} y1={10} y2={H - pad} stroke="#d6d0c2" />}
      {y0 < 0 && y1 > 0 && <line x1={pad} x2={W - 10} y1={Y(0)} y2={Y(0)} stroke="#d6d0c2" />}
      {loaded.map(l => dots.length ? pts(l).slice(0, 220).map((d, i) => <circle key={`${l.level}${i}`} cx={X(d[0])} cy={Y(d[1])} r={2.6} fill={LEVEL_COLOUR[l.level]} fillOpacity={0.42} />) : null)}
      {types.map(t => {
        const ring = loaded.map(l => { const pt = l.profile.types.find(x => x.type === t); return pt && pt.run != null && pt.ride != null && pt.n >= MIN.pitches ? { l, x: X(pt.run), y: Y(pt.ride) } : null }).filter((x): x is { l: Loaded; x: number; y: number } => x != null)
        return (
          <g key={t}>
            {ring.length > 1 && <polyline points={ring.map(r => `${r.x},${r.y}`).join(' ')} fill="none" stroke="#8a8275" strokeWidth={1.2} strokeDasharray="4 3" />}
            {ring.map(r => (
              <g key={r.l.level}>
                <circle cx={r.x} cy={r.y} r={9} fill={LEVEL_COLOUR[r.l.level]} fillOpacity={0.2} stroke={LEVEL_COLOUR[r.l.level]} strokeWidth={2.2} />
                <text x={r.x} y={r.y + 3.5} textAnchor="middle" fontSize="9.5" fontWeight={800} fill={C.ink}>{t}</text>
              </g>
            ))}
          </g>
        )
      })}
    </svg>
  )
}

function ShapeSection({ loaded, names }: { loaded: Loaded[]; names: Record<string, string> }) {
  const types = useMemo(() => [...new Map(loaded.flatMap(l => l.profile.types.map(t => [t.type, t.n] as const))).keys()], [loaded])
  const [type, setType] = useState('ALL')
  const sel = type === 'ALL' ? types : [type]
  const higher = loaded[0], lower = loaded[loaded.length - 1]
  return (
    <Section n={1} title="His shape at each level" note="Each ring is the average of one pitch type at that level, joined by a dashed line when he threw it at more than one. Choose a pitch to see every one of its movement dots.">
      <Chips label="Pitch" value={type} onChange={setType} options={[{ id: 'ALL', text: 'Every pitch' }, ...types.map(t => ({ id: t, text: nameOf(t, names) }))]} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '0 0 8px', fontSize: 13 }}>{loaded.map(l => <span key={l.level}><Dot level={l.level} />{LEVEL_LABEL[l.level]}</span>)}</div>
      <div className="ll-two" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
        <ShapePlot loaded={loaded} type={type} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 420 }}>
            <thead><tr><th style={th}>Pitch</th><th style={th}>Level</th><th style={th}>Pitches</th><th style={th}>Velocity</th><th style={th}>Ride</th><th style={th}>Run</th><th style={th}>Arm</th></tr></thead>
            <tbody>
              {sel.flatMap(t => loaded.map((l, i) => {
                const x = l.profile.types.find(y => y.type === t)
                if (!x) return null
                const other = loaded.find(o => o.level !== l.level && o.profile.types.some(y => y.type === t && y.n >= MIN.pitches))?.profile.types.find(y => y.type === t)
                const d = (a: number | null, b: number | null | undefined, k = 1) => (a != null && b != null && other && l === higher ? <div style={{ fontSize: 11.5, fontWeight: 700, color: '#3a352c' }}>{sg(a - b, k)}</div> : null)
                return (
                  <tr key={`${t}${l.level}`}>
                    <td style={{ ...td, fontWeight: 700 }}>{i === 0 ? nameOf(t, names) : ''}</td>
                    <td style={td}><Dot level={l.level} />{LEVEL_SHORT[l.level]}</td><td style={td}>{x.n.toLocaleString()}</td>
                    <td style={td}>{f1(x.velo)}{d(x.velo, other?.velo)}</td><td style={td}>{f1(x.ride)}{d(x.ride, other?.ride)}</td><td style={td}>{f1(x.run)}{d(x.run, other?.run)}</td><td style={td}>{x.slot == null ? '—' : `${Math.round(x.slot)}°`}{d(x.slot, other?.slot, 0)}</td>
                  </tr>
                )
              }))}
            </tbody>
          </table>
          {loaded.length > 1 && <div style={{ fontSize: 12, color: C.mute, marginTop: 6, lineHeight: 1.5 }}>The figure under a {LEVEL_SHORT[higher.level]} row is how far it sits from his {LEVEL_SHORT[lower.level]} pitch of the same type.</div>}
        </div>
      </div>
      <style>{'@media(max-width:900px){.ll-two{grid-template-columns:1fr !important}}'}</style>
    </Section>
  )
}

// ---- 2 · usage ----------------------------------------------------------------------------------------------------------------------------------------

function UsageSection({ loaded, names }: { loaded: Loaded[]; names: Record<string, string> }) {
  const types = [...new Set(loaded.flatMap(l => l.profile.types.filter(t => t.usage >= 0.02).map(t => t.type)))]
  const rowFor = (label: string, get: (l: Loaded) => { n: number; share: Record<string, number> }) => (
    <tr key={label}>
      <td style={{ ...td, fontWeight: 700 }}>{label}</td>
      {loaded.map(l => { const g = get(l); return <td key={l.level} style={td}>{g.n >= MIN.pitches ? types.filter(t => (g.share[t] ?? 0) >= 0.02).sort((a, b) => (g.share[b] ?? 0) - (g.share[a] ?? 0)).map(t => `${t} ${pc(g.share[t])}`).join(' · ') : <span style={{ color: C.mute }}>pending ({g.n})</span>}<div style={{ fontSize: 11, color: C.mute }}>{g.n.toLocaleString()} pitches</div></td> })}
    </tr>
  )
  return (
    <Section n={2} title="What he throws" note="The mix of his pitches at each level: overall, to each side of the plate and in each count.">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
          <thead><tr><th style={th}>Mix</th>{loaded.map(l => <th key={l.level} style={th}><Dot level={l.level} />{LEVEL_LABEL[l.level]}</th>)}</tr></thead>
          <tbody>
            {rowFor('All pitches', l => ({ n: l.profile.pitches, share: Object.fromEntries(l.profile.types.map(t => [t.type, t.usage])) }))}
            {rowFor('To left-handed batters', l => l.profile.byStand.L)}
            {rowFor('To right-handed batters', l => l.profile.byStand.R)}
            {COUNT_STATES.map(s => rowFor(COUNT_LABEL[s], l => l.profile.byCount[s]))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: C.mute, marginTop: 6 }}>Pitches under 2% of a mix are left out of a row. Codes: {types.map(t => `${t} ${nameOf(t, names)}`).join(', ')}.</div>
    </Section>
  )
}

// ---- 3 · location ---------------------------------------------------------------------------------------------------------------------------------------

function Heat({ counts, max, level, n }: { counts: number[]; max: number; level: Level; n: number }) {
  const cw = 18, W = GRID.cols * cw, H = GRID.rows * cw
  const sx = (x: number) => ((x - GRID.x0) / (GRID.x1 - GRID.x0)) * W, sz = (z: number) => H - ((z - GRID.z0) / (GRID.z1 - GRID.z0)) * H
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}><Dot level={level} />{LEVEL_LABEL[level]} <span style={{ fontWeight: 500, color: C.mute }}>{n.toLocaleString()} pitches</span></div>
      {n < MIN.grid ? <div style={{ width: W, maxWidth: '100%', padding: 14, fontSize: 12.5, color: C.mute, border: `1px dashed ${C.line}`, borderRadius: 6 }}>Pending: under {MIN.grid} located pitches.</div> : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Where he threw it at ${LEVEL_LABEL[level]}, catcher's view`} style={{ width: W, maxWidth: '100%', height: 'auto', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 4 }}>
          {counts.map((c, i) => c > 0 ? <rect key={i} x={(i % GRID.cols) * cw} y={Math.floor(i / GRID.cols) * cw} width={cw} height={cw} fill={LEVEL_COLOUR[level]} fillOpacity={Math.min(1, (c / max) * 0.95)} /> : null)}
          <rect x={sx(-0.83)} y={sz(3.5)} width={sx(0.83) - sx(-0.83)} height={sz(1.5) - sz(3.5)} fill="none" stroke={C.ink} strokeWidth={1.4} />
        </svg>
      )}
    </div>
  )
}

function LocationSection({ loaded, names }: { loaded: Loaded[]; names: Record<string, string> }) {
  const types = [...new Map(loaded.flatMap(l => l.profile.types.map(t => [t.type, t.n] as const))).keys()]
  const [type, setType] = useState('ALL')
  const countsOf = (l: Loaded) => (type === 'ALL' ? l.profile.grid.all : l.profile.grid.byType[type] ?? new Array(GRID.cols * GRID.rows).fill(0))
  const totals = loaded.map(l => countsOf(l).reduce((a, b) => a + b, 0))
  const shared = Math.max(0.0001, ...loaded.map((l, i) => Math.max(...countsOf(l).map(c => (totals[i] ? c / totals[i] : 0)))))
  const row = (l: Loaded): PitchProfile | null => {
    if (type !== 'ALL') return l.profile.types.find(t => t.type === type) ?? null
    const ts = l.profile.types
    const n = ts.reduce((a, t) => a + t.n, 0)
    const w = (f: (t: PitchProfile) => number | null) => { const v = ts.filter(t => f(t) != null); const d = v.reduce((a, t) => a + t.n, 0); return d >= MIN.pitches ? v.reduce((a, t) => a + (f(t) as number) * t.n, 0) / d : null }
    return { type: 'ALL', n, usage: 1, velo: null, ride: null, run: null, slot: null, spin: null, ext: null, relX: null, relZ: null, swings: ts.reduce((a, t) => a + t.swings, 0), whiffs: ts.reduce((a, t) => a + t.whiffs, 0), whiffPct: null, cswPct: w(t => t.cswPct), zonePct: w(t => t.zonePct), heartPct: w(t => t.heartPct), chasePct: w(t => t.chasePct), zoneContactPct: w(t => t.zoneContactPct), bbe: 0, xwobaCon: null }
  }
  return (
    <Section n={3} title="Where he throws it" note="Catcher's view. The darker the cell, the larger the share of his pitches there at that level; every level uses one colour scale so the maps compare. The box is the strike zone.">
      <Chips label="Pitch" value={type} onChange={setType} options={[{ id: 'ALL', text: 'Every pitch' }, ...types.map(t => ({ id: t, text: nameOf(t, names) }))]} />
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {loaded.map((l, i) => <Heat key={l.level} counts={countsOf(l).map(c => (totals[i] ? c / totals[i] : 0))} max={shared} level={l.level} n={totals[i]} />)}
      </div>
      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
          <thead><tr><th style={th}>Level</th><th style={th}>Pitches</th><th style={th}>In the zone</th><th style={th}>Down the middle</th><th style={th}>Chase rate</th><th style={th}>Contact in the zone</th></tr></thead>
          <tbody>
            {loaded.map(l => { const r = row(l); return (
              <tr key={l.level}><td style={{ ...td, fontWeight: 800 }}><Dot level={l.level} />{LEVEL_LABEL[l.level]}</td><td style={td}>{r ? r.n.toLocaleString() : '—'}</td><td style={td}>{pc(r?.zonePct, 1)}</td><td style={td}>{pc(r?.heartPct, 1)}</td><td style={td}>{pc(r?.chasePct, 1)}</td><td style={td}>{pc(r?.zoneContactPct, 1)}</td></tr>
            ) })}
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: C.mute, marginTop: 6 }}>Zone, middle and chase rates use the zone each pitch was recorded in; each needs {MIN.pitches} pitches ({MIN.swings} swings for chase and contact) or it shows a dash.</div>
      </div>
    </Section>
  )
}

// ---- 4 · sequencing ---------------------------------------------------------------------------------------------------------------------------------------

function SequencingSection({ loaded, names }: { loaded: Loaded[]; names: Record<string, string> }) {
  const locked = loaded.every(l => l.profile.sequencing == null)
  const types = [...new Set(loaded.flatMap(l => l.profile.types.filter(t => t.usage >= 0.05).map(t => t.type)))]
  const [prev, setPrev] = useState(types[0] ?? 'FF')
  if (locked) return (
    <Section n={4} title="How he sequences"><p style={{ fontSize: 13.5, color: '#5b5347', margin: 0 }}>Sequencing needs each pitch in the order it was thrown, which is part of the full pitch log. Sign in (a free account opens one full look a day per pitcher) or upgrade to Pro to see it at each level.</p></Section>
  )
  const first = (l: Loaded) => l.profile.byCount.first
  const two = (l: Loaded) => l.profile.byCount.two
  const mix = (g: { n: number; share: Record<string, number> }) => (g.n >= MIN.pitches ? Object.entries(g.share).filter(([, s]) => s >= 0.03).sort((a, b) => b[1] - a[1]).map(([t, s]) => `${t} ${pc(s)}`).join(' · ') : 'pending')
  return (
    <Section n={4} title="How he sequences" note="What he throws first, with two strikes, after each pitch and in front or behind in the count, at each level.">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
          <thead><tr><th style={th}>Measure</th>{loaded.map(l => <th key={l.level} style={th}><Dot level={l.level} />{LEVEL_LABEL[l.level]}</th>)}</tr></thead>
          <tbody>
            <tr><td style={{ ...td, fontWeight: 700 }}>First pitch</td>{loaded.map(l => <td key={l.level} style={td}>{mix(first(l))}<div style={{ fontSize: 11, color: C.mute }}>{first(l).n.toLocaleString()} pitches</div></td>)}</tr>
            <tr><td style={{ ...td, fontWeight: 700 }}>With two strikes</td>{loaded.map(l => <td key={l.level} style={td}>{mix(two(l))}<div style={{ fontSize: 11, color: C.mute }}>{two(l).n.toLocaleString()} pitches</div></td>)}</tr>
            <tr><td style={{ ...td, fontWeight: 700 }}>Fastball when ahead</td>{loaded.map(l => <td key={l.level} style={td}>{pc(l.profile.fastballWhenAhead)}</td>)}</tr>
            <tr><td style={{ ...td, fontWeight: 700 }}>Fastball when behind</td>{loaded.map(l => <td key={l.level} style={td}>{pc(l.profile.fastballWhenBehind)}</td>)}</tr>
            <tr><td style={{ ...td, fontWeight: 700 }}>Same pitch twice in a row</td>{loaded.map(l => <td key={l.level} style={td}>{pc(l.profile.sequencing?.repeatPct, 1)}<div style={{ fontSize: 11, color: C.mute }}>{(l.profile.sequencing?.later ?? 0).toLocaleString()} pitches after another</div></td>)}</tr>
          </tbody>
        </table>
      </div>
      <div style={{ margin: '14px 0 6px', fontSize: 13, fontWeight: 800 }}>After this pitch, what comes next</div>
      <Chips label="Previous pitch" value={prev} onChange={setPrev} options={types.map(t => ({ id: t, text: nameOf(t, names) }))} />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
          <thead><tr><th style={th}>Next pitch</th>{loaded.map(l => <th key={l.level} style={th}><Dot level={l.level} />{LEVEL_LABEL[l.level]}</th>)}</tr></thead>
          <tbody>
            {[...new Set(loaded.flatMap(l => Object.keys(nextShares(l.profile.sequencing, prev)?.share ?? {})))].sort((a, b) => Math.max(...loaded.map(l => nextShares(l.profile.sequencing, prev)?.share[b] ?? 0)) - Math.max(...loaded.map(l => nextShares(l.profile.sequencing, prev)?.share[a] ?? 0))).slice(0, 6).map(t => (
              <tr key={t}><td style={{ ...td, fontWeight: 700 }}>{nameOf(t, names)}</td>{loaded.map(l => { const s = nextShares(l.profile.sequencing, prev); return <td key={l.level} style={td}>{s ? pc(s.share[t] ?? 0, 1) : <span style={{ color: C.mute }}>pending</span>}</td> })}</tr>
            ))}
            <tr><td style={{ ...td, color: C.mute }}>Pitches after it</td>{loaded.map(l => <td key={l.level} style={{ ...td, color: C.mute }}>{(nextShares(l.profile.sequencing, prev)?.n ?? 0).toLocaleString()}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </Section>
  )
}

// ---- 5 · results ------------------------------------------------------------------------------------------------------------------------------------------

function ResultsSection({ loaded, names }: { loaded: Loaded[]; names: Record<string, string> }) {
  const types = [...new Set(loaded.flatMap(l => l.profile.types.filter(t => t.n >= MIN.pitches).map(t => t.type)))]
  return (
    <Section n={5} title="What hitters did" note="Whiffs per swing, called plus swinging strikes per pitch and xwOBA on contact, by pitch at each level. Each is measured against that level's own hitters, parks and strike zone, so read a level against its own average, not as one scale.">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
          <thead><tr><th style={th}>Pitch</th><th style={th}>Level</th><th style={th}>Pitches</th><th style={th}>Whiffs / swing</th><th style={th}>Called + swinging strikes</th><th style={th}>xwOBA on contact</th></tr></thead>
          <tbody>
            {types.flatMap(t => loaded.map((l, i) => { const x = l.profile.types.find(y => y.type === t); if (!x) return null
              return <tr key={`${t}${l.level}`}><td style={{ ...td, fontWeight: 700 }}>{i === 0 ? nameOf(t, names) : ''}</td><td style={td}><Dot level={l.level} />{LEVEL_SHORT[l.level]}</td><td style={td}>{x.n.toLocaleString()}</td>
                <td style={td}>{pc(x.whiffPct, 1)}<span style={{ fontSize: 11, color: C.mute }}> {x.whiffs} of {x.swings}</span></td><td style={td}>{pc(x.cswPct, 1)}</td><td style={td}>{w3(x.xwobaCon)}<span style={{ fontSize: 11, color: C.mute }}> {x.bbe} in play</span></td></tr> }))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

export default function LevelsLab({ id }: { id: number }) {
  const use = useLevelUse(id)
  const [loaded, setLoaded] = useState<{ id: number; v: Loaded[] | 'error' } | null>(null)
  useEffect(() => {
    if (!use || use.length === 0) return
    let off = false
    Promise.all(use.map(async u => {
      const log = await fetchLabLog('pitcher', id, SEASON, u.level === 'mlb' ? '' : `&level=${u.level}`)
      return log && log.pitches.length ? ({ level: u.level, log, profile: profileOf(u.level, log.pitches, log.throws) } as Loaded) : null
    })).then(r => { if (!off) setLoaded({ id, v: r.filter((x): x is Loaded => x != null) }) }).catch(() => { if (!off) setLoaded({ id, v: 'error' }) })
    return () => { off = true }
  }, [use, id])
  const data = loaded?.id === id ? loaded.v : null
  if (use === undefined || (use && use.length > 0 && data === null)) return <p style={{ fontFamily: SANS, fontSize: 14, color: C.mute, padding: '24px 0' }}>Loading his pitches at each level…</p>
  if (use === null || data === 'error') return <p style={{ fontFamily: SANS, fontSize: 14, color: C.mute, padding: '24px 0' }}>Couldn’t load his levels right now.</p>
  if (!data || data.length < 2) return <p style={{ fontFamily: SANS, fontSize: 14, color: '#5b5347', padding: '24px 0', maxWidth: 700 }}>He threw at {data && data.length === 1 ? LEVEL_LABEL[data[0].level] : 'no tracked level'} only this season, so there is nothing to set side by side. The Location Lab and Sequencing tabs show that level on its own.</p>
  const names = Object.assign({}, ...data.map(d => d.log.pitchNames)) as Record<string, string>
  return (
    <div style={{ fontFamily: SANS, color: C.ink }}>
      <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: ORANGE_TEXT, textTransform: 'uppercase' }}>One pitcher, {data.length} levels</div>
      <h2 style={{ margin: '4px 0 6px', fontSize: 'clamp(24px, 3.4vw, 34px)', fontWeight: 800, letterSpacing: '-.02em' }}>How his pitching changes from one level to the next</h2>
      <p style={{ margin: '0 0 6px', fontSize: 14, color: '#5b5347', maxWidth: 900, lineHeight: 1.5 }}>{data.map(d => `${d.profile.pitches.toLocaleString()} pitches at ${LEVEL_LABEL[d.level]}`).join(' · ')}, {SEASON}. Shape, mix, location and sequencing compare directly; hitters’ results are each level’s own.</p>
      <ShapeSection loaded={data} names={names} />
      <UsageSection loaded={data} names={names} />
      <LocationSection loaded={data} names={names} />
      <SequencingSection loaded={data} names={names} />
      <ResultsSection loaded={data} names={names} />
    </div>
  )
}
