'use client'

// src/components/pitch-shape/PitcherShapeLevels.tsx
//
// What one pitcher's shape looks like at each level he has thrown at: movement (ride up, run toward his arm side), every pitch type's average as a ring per level joined by a dashed
// line, and for the chosen pitch the sampled movement dots of each level. Same pitcher, so a difference is a change in his pitch, not a different arm. Dots are a 60-pitch sample per
// level, so counts are approximate; the rings are the averages over every pitch counted in the table.

import { useEffect, useMemo, useState } from 'react'
import { C } from '@/components/team/ui'
import { LEVEL_LABEL, LEVEL_SHORT, isExhibition, type Level } from '@/lib/milb-shape/levels'
import { PITCH_NAMES } from '@/lib/pitch-shape/model'
import { LEVEL_COLOUR } from './LevelsCompared'
import ShapeMap from './ShapeMap'
import { usePitcherLog } from './usePitcherLog'
import { movementPoints } from '@/lib/pitch-shape/pitch-line'

const PROGRESSION: Level[] = ['fsl', 'afl', 'aaa', 'st', 'mlb']   // lowest to highest, so the line joining the rings reads as a progression
import { log } from '@/lib/log'

type T = { pitchType: string; n: number; velo: number; ivb: number; hb: number; slot: number; sdHb: number | null; sdIvb: number | null; points: [number, number][] }
type L = { level: Level; season: number; name: string; hand: string; types: T[] }
const cache = new Map<number, L[] | null>()
const sg = (x: number, d = 1) => { const r = Number(x.toFixed(d)); return r === 0 ? (0).toFixed(d) : `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(d)}` }

export default function PitcherShapeLevels({ pitcherId, initialType, levelAvg }: { pitcherId: number; initialType: string; levelAvg?: Partial<Record<Level, { hb: number; ivb: number }>> }) {
  const [got, setGot] = useState<{ id: number; v: L[] | null } | null>(null)
  const [type, setType] = useState(initialType)
  useEffect(() => {
    if (cache.has(pitcherId)) return
    let live = true
    fetch(`/api/mlb/pitch-shape/pitcher-shape-levels?id=${pitcherId}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { levels: L[] }) => { cache.set(pitcherId, j.levels); if (live) setGot({ id: pitcherId, v: j.levels }) })
      .catch(e => { log.error('PitcherShapeLevels', 'fetch failed', e instanceof Error ? e.message : e); cache.set(pitcherId, null); if (live) setGot({ id: pitcherId, v: null }) })
    return () => { live = false }
  }, [pitcherId])
  const levels = cache.has(pitcherId) ? cache.get(pitcherId) : got?.id === pitcherId ? got.v : undefined
  const types = useMemo(() => [...new Set((levels ?? []).flatMap(l => l.types.map(t => t.pitchType)))], [levels])
  const sel = types.includes(type) ? type : types[0]
  // every pitch he threw at each level that keeps a pitch log (MLB, Triple-A, Florida State League); the exhibition levels fall back to the stored sample
  const seasonOf = (lv: Level) => levels?.find(l => l.level === lv)?.season ?? null
  const logs: Partial<Record<Level, ReturnType<typeof usePitcherLog>>> = { mlb: usePitcherLog(pitcherId, seasonOf('mlb'), 'mlb'), aaa: usePitcherLog(pitcherId, seasonOf('aaa'), 'aaa'), fsl: usePitcherLog(pitcherId, seasonOf('fsl'), 'fsl') }
  if (levels === undefined) return <div style={{ fontSize: 13, color: C.mute }}>Loading his shape at each level…</div>
  if (!levels || levels.length < 2) return <div style={{ fontSize: 13, color: C.mute }}>He has no second level with tracked pitches in the data, so there is nothing to set against.</div>

  // zoomed to the chosen pitch only: his sampled pitches per level as dots, his average at each level as a ring, joined from the lowest level up, and each level's own average as a dashed ring
  const ordered = [...levels].sort((x, y) => PROGRESSION.indexOf(x.level) - PROGRESSION.indexOf(y.level))
  const here = ordered.flatMap(l => { const t = l.types.find(y => y.pitchType === sel); return t ? [{ l, t }] : [] })
  const dots = here.flatMap(({ l, t }) => { const lg = logs[l.level]; const all = lg ? movementPoints(lg.pitches, sel, lg.throws) : []; return (all.length ? all : t.points).map(pt => ({ hb: pt[0], ivb: pt[1], color: LEVEL_COLOUR[l.level], opacity: 0.4 })) })
  const rings = here.map(({ l, t }) => ({ hb: t.hb, ivb: t.ivb, color: LEVEL_COLOUR[l.level], label: LEVEL_SHORT[l.level], strong: true }))
  const avgRings = sel === initialType ? here.flatMap(({ l }) => { const a = levelAvg?.[l.level]; return a ? [{ hb: a.hb, ivb: a.ivb, color: LEVEL_COLOUR[l.level], label: `${LEVEL_SHORT[l.level]} avg`, dashed: true }] : [] }) : []
  const lo = here[0]
  return (
    <div>
      <div role="group" aria-label="Pitch" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 10px' }}>
        {types.map(t => <button key={t} type="button" aria-pressed={t === sel} onClick={() => setType(t)} style={{ minHeight: 36, padding: '0 11px', borderRadius: 4, border: `1px solid ${t === sel ? C.ink : C.line}`, background: t === sel ? C.ink : '#fff', color: t === sel ? C.cream : C.ink, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>{PITCH_NAMES[t] ?? t}</button>)}
      </div>
      <div className="psl-two" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,460px) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        <div>
          <ShapeMap label="His movement at each level: ride up, run toward his arm side" dots={dots} rings={[...avgRings, ...rings]} lines={[here.map(({ t }) => [t.hb, t.ivb] as [number, number])]} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5, marginTop: 6 }}>{here.map(({ l }) => <span key={l.level}><span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: LEVEL_COLOUR[l.level], marginRight: 6 }} />{LEVEL_LABEL[l.level]}</span>)}{avgRings.length > 0 && <span style={{ color: C.mute }}>Dashed ring = that level’s average pitch</span>}</div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {here.map(({ l, t }) => {
            const exh = isExhibition(l.level)
            const d = (a: number, b: number | undefined, k = 1) => (lo && l !== lo.l && b != null ? <span style={{ fontSize: 11.5, fontWeight: 700, color: '#3a352c' }}> {sg(a - b, k)}</span> : null)
            const cell = (label: string, v: React.ReactNode) => <div><div style={{ fontSize: 9.5, letterSpacing: '.1em', fontWeight: 800, color: C.mute, textTransform: 'uppercase' }}>{label}</div><div style={{ fontWeight: 800, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{v}</div></div>
            return (
              <div key={l.level} style={{ border: `1px solid ${C.line}`, borderLeft: `4px solid ${LEVEL_COLOUR[l.level]}`, borderRadius: 6, padding: '8px 12px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}><b>{LEVEL_LABEL[l.level]}</b><span style={{ color: C.mute }}>{l.season} · {t.n.toLocaleString()} pitches</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8, marginTop: 4 }}>
                  {cell('Velocity', <>{t.velo.toFixed(1)}{d(t.velo, lo?.t.velo)}</>)}
                  {cell('Ride', <>{t.ivb.toFixed(1)}{d(t.ivb, lo?.t.ivb)}</>)}
                  {cell('Run', <>{t.hb.toFixed(1)}{d(t.hb, lo?.t.hb)}</>)}
                  {cell('Arm angle', exh ? <span style={{ color: C.mute, fontWeight: 600, fontSize: 13 }}>pending</span> : <>{Math.round(t.slot)}°{lo && l !== lo.l && !isExhibition(lo.l.level) ? d(t.slot, lo.t.slot, 0) : null}</>)}
                </div>
              </div>
            )
          })}
          <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.5 }}>The small figure beside a number is how far it sits from the same pitch at {lo ? LEVEL_LABEL[lo.l.level] : 'the lowest level'}. Rings are averages over every pitch counted. Each dot is one of his pitches, there to show how consistent it is at each level: a tighter clump means he repeats it, a wider scatter means it moves around more (Arizona Fall League and Spring Training keep no pitch log, so they show a stored sample).</div>
        </div>
      </div>
      <style>{'@media(max-width:900px){.psl-two{grid-template-columns:1fr !important}}'}</style>
    </div>
  )
}
