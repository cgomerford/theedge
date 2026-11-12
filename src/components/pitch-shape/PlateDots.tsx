'use client'

// src/components/pitch-shape/PlateDots.tsx
//
// One pitcher's pitches where they crossed the plate, as dots coloured by what happened: swing and miss, called strike, ball, foul, hit, and ball in play that was an out. The legend counts each kind and
// switches it on or off; a batter-side switch separates left- and right-handed hitters so "inside" and "away" mean something. Coordinates are Statcast's own plate_x / plate_z (feet, catcher's view); the
// dashed box is a standard zone (plate width, 1.5 to 3.5 ft) because the real zone moves with each batter's height. Describes pitches already thrown; it does not say where he should throw.
//   PlateDots   the picture (plain data in)
//   PlateView   loads one pitcher's dots through the pitcherDots server action and offers the league heat map for his shape as the other view
// Never fetches directly: the action reads the per-pitch log on demand, never during page render.

import { useEffect, useMemo, useState } from 'react'
import { C } from '@/components/team/ui'
import { pitcherDots, type DotsResult, type PitchOutcome, type PlateDot } from '@/app/mlb/lab/pitch-shape/actions'
import LocationPanel from './LocationPanel'
import { log } from '@/lib/log'

const KINDS: { o: PitchOutcome; label: string; color: string; fill: boolean; r: number }[] = [
  { o: 'ball', label: 'Ball', color: '#8A97A6', fill: false, r: 3 },
  { o: 'called', label: 'Called strike', color: '#7B3FB8', fill: true, r: 3.3 },
  { o: 'foul', label: 'Foul', color: '#C9A100', fill: true, r: 3.3 },
  { o: 'inplay', label: 'In play, out', color: '#2F6DB5', fill: true, r: 3.4 },
  { o: 'hit', label: 'Hit', color: '#1D9E75', fill: true, r: 3.8 },
  { o: 'whiff', label: 'Swing and miss', color: '#E8431A', fill: true, r: 3.8 },
]
const SWING = new Set<PitchOutcome>(['whiff', 'foul', 'inplay', 'hit'])
const W = 360, H = 400, FX0 = -2, FX1 = 2, FZ0 = 0, FZ1 = 4.6
const PX = (x: number) => ((x - FX0) / (FX1 - FX0)) * W
const PY = (z: number) => H - ((z - FZ0) / (FZ1 - FZ0)) * H
const ZX = 17 / 24, ZB = 1.5, ZT = 3.5   // half the plate width in feet; standard zone bottom and top

type Side = 'all' | 'R' | 'L'

export function PlateDots({ dots, pitcherName, lc, season, shape = null }: {
  dots: PlateDot[]; pitcherName: string; lc: string; season: number
  /** a shape on the movement map (ride, run, window in inches): when given, the dots can be narrowed to the pitches he threw with that shape */
  shape?: { hb: number; ivb: number; r: number } | null
}) {
  const [onlyShape, setOnlyShape] = useState(!!shape)
  const [r, setR] = useState(shape ? shape.r : 1)
  const [on, setOn] = useState<Set<PitchOutcome>>(new Set(KINDS.map(k => k.o)))
  const [side, setSide] = useState<Side>('all')
  const inShape = (d: PlateDot) => !!shape && d.hb != null && d.ivb != null && Math.abs(d.hb - shape.hb) <= r && Math.abs(d.ivb - shape.ivb) <= r
  const sided = useMemo(() => (side === 'all' ? dots : dots.filter(d => d.s === side)), [dots, side])
  const nShape = useMemo(() => sided.filter(inShape).length, [sided, shape, r])   // eslint-disable-line react-hooks/exhaustive-deps
  const narrowed = !!shape && onlyShape
  const bySide = useMemo(() => (narrowed ? sided.filter(inShape) : sided), [sided, narrowed, shape, r])   // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => { const m = new Map<PitchOutcome, number>(); for (const d of bySide) m.set(d.o, (m.get(d.o) ?? 0) + 1); return m }, [bySide])
  const n = bySide.length
  const inZone = (d: PlateDot) => Math.abs(d.x) <= ZX && d.z >= ZB && d.z <= ZT
  const zoneN = bySide.filter(inZone).length
  const outside = bySide.filter(d => !inZone(d))
  const chase = outside.length ? outside.filter(d => SWING.has(d.o)).length / outside.length : null
  const swings = bySide.filter(d => SWING.has(d.o)).length
  const whiffs = counts.get('whiff') ?? 0
  const shown = bySide.filter(d => on.has(d.o))
  const toggle = (o: PitchOutcome) => setOn(prev => { const nx = new Set(prev); if (nx.has(o)) nx.delete(o); else nx.add(o); return nx })
  const pill = (v: boolean): React.CSSProperties => ({ minHeight: 36, padding: '0 12px', borderRadius: 6, border: `1.5px solid ${v ? C.ink : C.line}`, background: v ? C.ink : '#fff', color: v ? C.cream : C.ink, fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' })
  const order: PitchOutcome[] = ['ball', 'called', 'foul', 'inplay', 'hit', 'whiff']
  const sideLeft = side === 'R' ? 'Inside' : side === 'L' ? 'Away' : 'Third-base side', sideRight = side === 'R' ? 'Away' : side === 'L' ? 'Inside' : 'First-base side'
  return (
    <div>
      {shape && (
        <div style={{ marginBottom: 10 }}>
          <div role="group" aria-label="Which pitches" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" aria-pressed={onlyShape} onClick={() => setOnlyShape(true)} style={pill(onlyShape)}>Only this shape ({nShape.toLocaleString('en-US')})</button>
            <button type="button" aria-pressed={!onlyShape} onClick={() => setOnlyShape(false)} style={pill(!onlyShape)}>All his {lc}s ({sided.length.toLocaleString('en-US')})</button>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#6b6355', marginLeft: 6 }}>Shape window:</span>
            {[0.5, 1, 2].map(v => <button key={v} type="button" aria-pressed={r === v} onClick={() => setR(v)} style={pill(r === v)}>±{v} in</button>)}
          </div>
          <div style={{ fontSize: 12, color: '#5b5347', marginTop: 4, lineHeight: 1.5 }}>
            This shape is <b style={{ color: C.ink }}>{shape.ivb.toFixed(1)} in of ride</b> and <b style={{ color: C.ink }}>{Math.abs(shape.hb).toFixed(1)} in of run</b> toward the {shape.hb >= 0 ? 'arm' : 'glove'} side, within {r} in. {onlyShape ? 'Coloured dots are the pitches he threw with it; the faint grey dots are his other ' + lc + 's, so you can see where this shape went and where it did not.' : 'All of his pitches are coloured.'}{nShape === 0 ? ` He threw none with this shape in ${season}.` : ''}
          </div>
        </div>
      )}
      <div role="group" aria-label="Batter side" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {([['all', 'All batters'], ['R', 'vs right-handed'], ['L', 'vs left-handed']] as [Side, string][]).map(([k, l]) => <button key={k} type="button" aria-pressed={side === k} onClick={() => setSide(k)} style={pill(side === k)}>{l}</button>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 26}`} role="img" aria-label={`${pitcherName}'s ${lc}s where they crossed the plate in ${season}, coloured by what happened. Catcher's view.`} style={{ width: '100%', maxWidth: 520, height: 'auto', display: 'block', background: '#F1EEE6', borderRadius: 6, border: `1px solid ${C.line}` }}>
        <rect x={PX(-ZX)} y={PY(ZT)} width={PX(ZX) - PX(-ZX)} height={PY(ZB) - PY(ZT)} fill="rgba(255,255,255,.35)" stroke={C.ink} strokeWidth={1.5} strokeDasharray="5 3" />
        <path d={`M${PX(-ZX)},${H - 2}H${PX(ZX)}V${H + 8}L${PX(0)},${H + 18}L${PX(-ZX)},${H + 8}Z`} fill="#fff" stroke={C.mute} strokeWidth={1} />
        {narrowed && sided.filter(d => !inShape(d)).map((d, i) => <circle key={`bg${i}`} cx={PX(d.x)} cy={PY(d.z)} r={2.1} fill="#B9B2A2" fillOpacity={0.35} />)}
        {order.map(o => {
          const k = KINDS.find(x => x.o === o)!
          if (!on.has(o)) return null
          return <g key={o}>{shown.filter(d => d.o === o).map((d, i) => (
            <circle key={i} cx={PX(d.x)} cy={PY(d.z)} r={k.r} fill={k.fill ? k.color : 'none'} fillOpacity={0.72} stroke={k.color} strokeWidth={k.fill ? 0.6 : 1.2} strokeOpacity={0.9}>
              <title>{`${k.label}${d.v != null ? `, ${d.v.toFixed(1)} mph` : ''}${d.c ? `, count ${d.c}` : ''}, ${d.d}`}</title>
            </circle>
          ))}</g>
        })}
        <text x={8} y={16} fontSize="11" fontWeight={800} fill={C.mute}>← {sideLeft}</text>
        <text x={W - 8} y={16} fontSize="11" fontWeight={800} fill={C.mute} textAnchor="end">{sideRight} →</text>
      </svg>
      <div role="group" aria-label="Pitch results to show" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px', marginTop: 8 }}>
        {KINDS.slice().reverse().map(k => {
          const c = counts.get(k.o) ?? 0, v = on.has(k.o)
          return (
            <button key={k.o} type="button" aria-pressed={v} onClick={() => toggle(k.o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 10px', borderRadius: 6, border: `1.5px solid ${v ? k.color : C.line}`, background: '#fff', opacity: v ? 1 : 0.5, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: C.ink }}>
              <span aria-hidden style={{ width: 11, height: 11, borderRadius: 6, background: k.fill ? k.color : 'transparent', border: `2px solid ${k.color}` }} />{k.label} <b style={{ fontVariantNumeric: 'tabular-nums' }}>{c.toLocaleString('en-US')}</b>
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: 12.5, color: '#3d382f', marginTop: 8, lineHeight: 1.55 }}>
        <b>{n.toLocaleString('en-US')}</b> {narrowed ? `${lc}s with this shape` : `${lc}s`} in {season}: <b>{n ? Math.round((100 * zoneN) / n) : 0}%</b> in the standard zone{chase != null ? <>, hitters swung at <b>{Math.round(chase * 100)}%</b> of those outside it</> : null}{swings > 0 ? <>, and missed on <b>{Math.round((100 * whiffs) / swings)}%</b> of {swings.toLocaleString('en-US')} swings</> : null}.
      </div>
      <div style={{ fontSize: 11.5, color: '#6b6355', lineHeight: 1.5, marginTop: 4 }}>
        Catcher’s view: you are looking from behind the plate. {side === 'all' ? 'Switch to one batter side and the sides read as inside and away.' : side === 'R' ? 'Right-handed batters stand on the left, so inside is on the left.' : 'Left-handed batters stand on the right, so inside is on the right.'} The dashed box is a standard zone (plate width, 1.5 to 3.5 ft); the real zone moves with each batter’s height. Click a result in the key to hide or show it. Each dot is one pitch; hover for speed, count and date.
      </div>
    </div>
  )
}

const cache = new Map<string, DotsResult>()

/** Loads one pitcher's dots and offers the league heat map for his shape as the other view. */
export default function PlateView({ id, name, type, level, season, hand, probe, radius, pitchName, defaultMode = 'dots' }: {
  id: number; name: string; type: string; level: string; season: number; hand: 'R' | 'L'; probe: { hb: number; ivb: number }; radius: number; pitchName: string; defaultMode?: 'dots' | 'heat'
}) {
  const [mode, setMode] = useState<'dots' | 'heat'>(defaultMode)
  const key = `${id}|${type}|${level}|${season}`
  const [res, setRes] = useState<DotsResult | null | undefined>(cache.get(key))
  useEffect(() => {
    if (mode !== 'dots' || cache.has(key)) { if (cache.has(key)) setRes(cache.get(key)); return }
    let live = true
    setRes(undefined)
    pitcherDots({ id, type, level, season })
      .then(r => { cache.set(key, r); if (live) setRes(r) })
      .catch(e => { log.error('PlateView', 'pitcherDots failed', e instanceof Error ? e.message : String(e)); if (live) setRes(null) })
    return () => { live = false }
  }, [key, mode, id, type, level, season])
  const lc = pitchName.toLowerCase()
  const pill = (v: boolean): React.CSSProperties => ({ minHeight: 38, padding: '0 14px', border: `1px solid ${v ? C.ink : C.line}`, background: v ? C.ink : '#fff', color: v ? C.cream : C.ink, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' })
  return (
    <div>
      <div role="group" aria-label="Plate view" style={{ display: 'inline-flex', marginBottom: 8 }}>
        <button type="button" aria-pressed={mode === 'dots'} onClick={() => setMode('dots')} style={{ ...pill(mode === 'dots'), borderRadius: '6px 0 0 6px' }}>His pitches (dots)</button>
        <button type="button" aria-pressed={mode === 'heat'} onClick={() => setMode('heat')} style={{ ...pill(mode === 'heat'), borderLeft: 0, borderRadius: '0 6px 6px 0' }}>League heat map for his shape</button>
      </div>
      {mode === 'heat' ? <LocationPanel pitchType={type} hand={hand} probe={probe} radius={radius} span="all" scope="league" pitchName={pitchName} explainHeight />
        : res === undefined ? <div style={{ fontSize: 13, color: C.mute }}>Reading his {lc}s from the pitch log…</div>
        : res && res.ok ? <PlateDots dots={res.dots} pitcherName={name} lc={lc} season={res.season} shape={{ hb: probe.hb, ivb: probe.ivb, r: radius }} />
        : <div style={{ fontSize: 13, color: '#5b5347', background: C.soft, borderRadius: 6, padding: '10px 12px', lineHeight: 1.5 }}>{res && !res.ok && res.error === 'pro' ? 'His pitches for this pitch type are part of Pro.' : `There is no pitch-by-pitch log for his ${lc}s at this level and season, so there are no dots to draw. Nothing is estimated in its place.`} The league heat map for his shape is still available above.</div>}
    </div>
  )
}
