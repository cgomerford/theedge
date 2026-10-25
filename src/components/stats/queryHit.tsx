'use client'

// src/components/stats/queryHit.tsx
//
// Searching by the batted ball itself — exit velocity, launch angle, distance and kind of contact.
//
//   HitMatchPanel – "How alike should it be?" Starts from a real hit and asks for the level of detail:
//                   Generic (same kind of result) · Similar · Near-identical · My own settings.
//   HitFields     – the same limits typed in by hand (used inside the stacked-filters panel).
//
// Everything is optional; a limit only matches balls that were actually measured.

import { useEffect, useMemo, useState } from 'react'
import { C, SANS, MONO } from '@/components/team/ui'
import { Chip, Field, Hint, SegBar, selectStyle } from '@/components/stats/queryUi'
import {
  BB_TYPES, EVENT_PRESETS, MATCH_LEVELS, deepGroupLabel, describeDeep, hitFromRef,
  type DeepFilters, type HitFilter, type HitRef, type MatchDims, type MatchLevel,
} from '@/lib/stats-query-catalog'

export type HitSearch = { hit: HitFilter; events?: string[] }

const bbLabel = (t?: string | null) => BB_TYPES.find(b => b.key === t)?.label ?? t ?? ''
const num = (v: string): number | undefined => (v === '' ? undefined : Number(v))

/** One-line description of a reference hit, e.g. "104.4 mph · 28° · 402 ft · Fly ball · Home run". */
export function refText(r: HitRef): string {
  return [`${r.ev.toFixed(1)} mph`, r.la != null ? `${Math.round(r.la)}°` : null, r.dist ? `${Math.round(r.dist)} ft` : null, r.bbType ? bbLabel(r.bbType) : null, r.event ? deepGroupLabel('events', r.event) : null]
    .filter(Boolean).join(' · ')
}

export function HitMatchPanel({ hitRef, who, onRun, onClose, busy }: {
  hitRef: HitRef
  /** who this reference is about, if known (shown in the heading) */
  who?: string
  onRun: (s: HitSearch) => void
  onClose: () => void
  busy?: boolean
}) {
  const [level, setLevel] = useState<MatchLevel>('similar')
  const [dims, setDims] = useState<MatchDims>(MATCH_LEVELS[1].dims)
  const [tol, setTol] = useState(MATCH_LEVELS[1].tol)
  const [result, setResult] = useState<string>('same')       // 'same' | a preset key | 'any'
  const [rank, setRank] = useState<'closest' | 'recent'>('closest')

  // picking a level sets its dimensions and tolerances; "My own settings" leaves them as they are
  useEffect(() => {
    const l = MATCH_LEVELS.find(x => x.key === level)!
    if (level !== 'custom') { setDims(l.dims); setTol(l.tol) }
  }, [level])

  const search: HitSearch = useMemo(() => {
    const base = hitFromRef(hitRef, tol, { ...dims, result: false })
    const preset = EVENT_PRESETS.find(p => p.key === result)
    const events = result === 'same' ? (dims.result && hitRef.event ? [hitRef.event] : undefined) : preset?.events
    return { hit: { ...base.hit, rank }, events }
  }, [hitRef, tol, dims, result, rank])

  const preview = describeDeep({ stack: [], hit: search.hit, events: search.events }).join(' · ') || 'any batted ball'
  const toggle = (k: keyof MatchDims) => { setLevel('custom'); setDims(d => ({ ...d, [k]: !d[k] })) }
  const missing = (k: 'la' | 'dist' | 'type') => (k === 'la' ? hitRef.la == null : k === 'dist' ? !hitRef.dist : !hitRef.bbType)

  return (
    <div style={{ background: '#fff', border: `2px solid ${C.orange}`, borderRadius: 8, padding: 16, display: 'grid', gap: 14 }} data-noexport="1">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange }}>Find hits like this one</div>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 19, letterSpacing: '-0.01em' }}>How alike should it be?</div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.mute, marginTop: 2 }}>{who ? `${who}: ` : ''}{refText(hitRef)}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" style={{ all: 'unset', cursor: 'pointer', color: C.mute, fontSize: 16 }}>Close</button>
      </div>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        {MATCH_LEVELS.map(l => (
          <button key={l.key} type="button" onClick={() => setLevel(l.key)} aria-pressed={level === l.key}
            style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 6, cursor: 'pointer', fontFamily: SANS, color: C.ink,
              border: `1.5px solid ${level === l.key ? C.ink : C.line}`, background: level === l.key ? '#fff1ec' : '#fff' }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{l.label}</div>
            <div style={{ fontSize: 12, color: C.mute, marginTop: 2, lineHeight: 1.4 }}>{l.blurb}</div>
          </button>
        ))}
      </div>

      <div>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange, marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
          What to match <Hint text="Tick the parts of the hit that matter. Exit velocity is how hard it was hit, launch angle how steeply it left the bat (negative = into the ground), distance how far it travelled." />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <Chip on={dims.result} onClick={() => toggle('result')}>The result</Chip>
          <Chip on={dims.ev} onClick={() => toggle('ev')}>Exit velocity</Chip>
          <Chip on={dims.la && !missing('la')} onClick={() => !missing('la') && toggle('la')}>Launch angle</Chip>
          <Chip on={dims.dist && !missing('dist')} onClick={() => !missing('dist') && toggle('dist')}>Distance</Chip>
          <Chip on={dims.type && !missing('type')} onClick={() => !missing('type') && toggle('type')}>Kind of contact</Chip>
        </div>
        {level === 'custom' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(90px, 140px))', gap: 10, marginTop: 10 }}>
            <Field label="± mph"><input type="number" min={0} max={30} style={selectStyle} value={tol.ev} onChange={e => setTol(t => ({ ...t, ev: Math.max(0, Number(e.target.value) || 0) }))} /></Field>
            <Field label="± degrees"><input type="number" min={0} max={60} style={selectStyle} value={tol.la} onChange={e => setTol(t => ({ ...t, la: Math.max(0, Number(e.target.value) || 0) }))} /></Field>
            <Field label="± feet"><input type="number" min={0} max={300} style={selectStyle} value={tol.dist} onChange={e => setTol(t => ({ ...t, dist: Math.max(0, Number(e.target.value) || 0) }))} /></Field>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <Field label="Result" hint="“The same as this hit” keeps the exact result. Or widen it: any hit, any extra-base hit, or the true three outcomes (home run, walk, strikeout).">
          <select style={selectStyle} value={result} onChange={e => setResult(e.target.value)}>
            <option value="same">{hitRef.event ? `The same: ${deepGroupLabel('events', hitRef.event)}` : 'The same as this hit'}</option>
            <option value="any">Any result</option>
            {EVENT_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Order the results by" hint="Closest match puts the nearest-looking hits first. Newest first puts the most recent matching hit on top.">
          <SegBar<'closest' | 'recent'> dense value={rank} onChange={setRank} options={[{ key: 'closest', label: 'Closest match' }, { key: 'recent', label: 'Newest first' }]} />
        </Field>
      </div>

      <div style={{ fontFamily: MONO, fontSize: 11, color: C.mute, lineHeight: 1.5, padding: '8px 10px', background: C.soft, borderRadius: 5 }}>
        Looking for: <b style={{ color: C.ink }}>{preview}</b>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={() => onRun(search)}
          style={{ fontFamily: SANS, fontWeight: 800, fontSize: 14, padding: '10px 20px', borderRadius: 5, border: 'none', background: busy ? C.line : C.orange, color: '#fff', cursor: busy ? 'default' : 'pointer' }}>
          {busy ? 'Searching…' : 'Find hits like this'}
        </button>
        <span style={{ fontFamily: SANS, fontSize: 12, color: C.faint }}>Uses the years, game type, club and player you have chosen.</span>
      </div>
    </div>
  )
}

/** The same limits typed by hand: speed, angle, distance, kind of contact and a result group. */
export function HitFields({ deep, onChange }: { deep: DeepFilters; onChange: (d: DeepFilters) => void }) {
  const h = deep.hit ?? {}
  const set = (p: Partial<HitFilter>) => {
    const next = { ...h, ...p }
    const empty = Object.entries(next).every(([k, v]) => k === 'rank' || v === undefined || (Array.isArray(v) && !v.length))
    onChange({ ...deep, hit: empty ? undefined : next })
  }
  const types = h.bbTypes ?? []
  const preset = EVENT_PRESETS.find(p => deep.events && p.events.length === deep.events.length && p.events.every(e => deep.events!.includes(e)))
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        <Field label="Exit velo ≥ (mph)"><input type="number" min={0} max={130} placeholder="any" style={selectStyle} value={h.evMin ?? ''} onChange={e => set({ evMin: num(e.target.value) })} /></Field>
        <Field label="Exit velo ≤ (mph)"><input type="number" min={0} max={130} placeholder="any" style={selectStyle} value={h.evMax ?? ''} onChange={e => set({ evMax: num(e.target.value) })} /></Field>
        <Field label="Launch angle ≥ (°)"><input type="number" min={-90} max={90} placeholder="any" style={selectStyle} value={h.laMin ?? ''} onChange={e => set({ laMin: num(e.target.value) })} /></Field>
        <Field label="Launch angle ≤ (°)"><input type="number" min={-90} max={90} placeholder="any" style={selectStyle} value={h.laMax ?? ''} onChange={e => set({ laMax: num(e.target.value) })} /></Field>
        <Field label="Distance ≥ (ft)"><input type="number" min={0} max={600} placeholder="any" style={selectStyle} value={h.distMin ?? ''} onChange={e => set({ distMin: num(e.target.value) })} /></Field>
        <Field label="Distance ≤ (ft)"><input type="number" min={0} max={600} placeholder="any" style={selectStyle} value={h.distMax ?? ''} onChange={e => set({ distMax: num(e.target.value) })} /></Field>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span style={{ fontFamily: SANS, fontSize: 12, color: C.mute }}>Kind of contact</span>
        {BB_TYPES.map(t => <Chip key={t.key} on={types.includes(t.key)} onClick={() => set({ bbTypes: types.includes(t.key) ? types.filter(x => x !== t.key) : [...types, t.key] })}>{t.label}</Chip>)}
      </div>
      <Field label="Result" hint="Limit to a kind of result. “True three outcomes” = home run, walk or strikeout.">
        <select style={selectStyle} value={preset?.key ?? ''} onChange={e => onChange({ ...deep, events: EVENT_PRESETS.find(p => p.key === e.target.value)?.events })}>
          <option value="">Any result</option>
          {EVENT_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </Field>
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.faint }}>Speed, angle and distance only match balls that were put in play and measured — walks and strikeouts have none.</div>
    </div>
  )
}
