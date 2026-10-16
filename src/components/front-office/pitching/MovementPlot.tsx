'use client'

// §01 Movement profile (Pro). Each dot is a pitch (<= 150 per type, seeded sample from fo_pitch_points); solid
// larger dots are his pitch-type means; dashed rings are the league average for that type (toggle); the dashed
// line from the origin is his arm angle; a compared pitcher's means show as hollow diamonds.
// x = horizontal break (arm side positive, mirrored for lefties), y = induced vertical break, both in inches.
// Hover a single pitch for its break and release point, a solid dot for the average against the league's, a ring for
// the league figure, a diamond for the compared pitcher. Reads the focused pitch type from the Arsenal table.
// Props are plain data. Recharts only.

import { useState } from 'react'
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { C, MONO, SANS } from '@/components/team/ui'
import { usePitchFocus } from './ArsenalTable'
import { fx, fsigned, pitchColor, pitchName } from './format'

export type MovePoint = { hb: number; ivb: number; rel_x?: number; rel_z?: number }
export type MoveMean = { pitchType: string; hb: number; ivb: number; pitches?: number; velo?: number | null }

type Datum = { kind: 'pitch' | 'avg' | 'league' | 'compare'; pitchType: string; hb: number; ivb: number; rel_x?: number; rel_z?: number; pitches?: number; velo?: number | null; name?: string }

const AXIS = { fontSize: 11, fontFamily: SANS, fill: '#8a8275' }

function Pop({ title, lines, note }: { title: string; lines: [string, string][]; note?: string }) {
  return (
    <div style={{ background: '#1A1A1A', color: '#FAF8F3', borderRadius: 10, padding: '9px 12px', fontFamily: SANS, fontSize: 12, lineHeight: 1.45, minWidth: 170, boxShadow: '0 8px 24px rgba(0,0,0,.28)' }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>{title}</div>
      {lines.map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}><span style={{ opacity: .7 }}>{k}</span><b style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</b></div>)}
      {note && <div style={{ marginTop: 5, opacity: .7, fontFamily: MONO, fontSize: 10 }}>{note}</div>}
    </div>
  )
}

export default function MovementPlot({ sets, means, league, armAngle, compare }: {
  sets: { pitchType: string; points: MovePoint[] }[]; means: MoveMean[]; league: MoveMean[]; armAngle: number | null
  compare: { name: string; means: MoveMean[] } | null
}) {
  const { focus, setFocus } = usePitchFocus()
  const [rings, setRings] = useState(true)
  const all = [...sets.flatMap(s => s.points), ...means, ...league, ...(compare?.means ?? [])]
  const xs = all.map(p => p.hb), ys = all.map(p => p.ivb)
  const xlo = Math.floor(Math.min(...xs, 0) / 5) * 5 - 5, xhi = Math.ceil(Math.max(...xs, 0) / 5) * 5 + 5
  const ylo = Math.floor(Math.min(...ys, 0) / 5) * 5 - 5, yhi = Math.ceil(Math.max(...ys, 0) / 5) * 5 + 5
  const ticks = (lo: number, hi: number) => Array.from({ length: Math.round((hi - lo) / 5) + 1 }, (_, i) => lo + i * 5)
  const dim = (t: string) => (focus && focus !== t ? 0.08 : 1)
  const arm = armAngle == null ? null : { x: Math.cos((armAngle * Math.PI) / 180) * 24, y: Math.sin((armAngle * Math.PI) / 180) * 24 }
  const lgFor = (t: string) => league.find(l => l.pitchType === t)

  function tooltip(d: Datum) {
    const nm = pitchName(d.pitchType)
    if (d.kind === 'pitch') {
      return <Pop title={`${nm} · one pitch`} lines={[['Horizontal break', `${fx(d.hb)} in`], ['Induced vertical break', `${fx(d.ivb)} in`], ['Release side', d.rel_x == null ? '—' : `${fx(d.rel_x, 2)} ft`], ['Release height', d.rel_z == null ? '—' : `${fx(d.rel_z, 2)} ft`]]} note="One of up to 150 sampled pitches of this type." />
    }
    if (d.kind === 'avg') {
      const lg = lgFor(d.pitchType)
      const lines: [string, string][] = [['Horizontal break', `${fx(d.hb)} in`], ['Induced vertical break', `${fx(d.ivb)} in`]]
      if (d.velo != null) lines.push(['Velocity', `${fx(d.velo)} mph`])
      if (d.pitches != null) lines.push(['Pitches', String(d.pitches)])
      if (lg) lines.push(['HB vs league', `${fsigned(d.hb - lg.hb)} in`], ['IVB vs league', `${fsigned(d.ivb - lg.ivb)} in`])
      return <Pop title={`${nm} · his average`} lines={lines} note="Click a pitch in the arsenal table to focus it." />
    }
    if (d.kind === 'league') return <Pop title={`${nm} · league average`} lines={[['Horizontal break', `${fx(d.hb)} in`], ['Induced vertical break', `${fx(d.ivb)} in`]]} note="Pitchers with 100+ of this pitch." />
    return <Pop title={`${d.name ?? 'Compared pitcher'} · ${nm}`} lines={[['Horizontal break', `${fx(d.hb)} in`], ['Induced vertical break', `${fx(d.ivb)} in`]]} />
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {means.map(m => (
          <button key={m.pitchType} onClick={() => setFocus(focus === m.pitchType ? null : m.pitchType)} aria-pressed={focus === m.pitchType}
            style={{ all: 'unset', cursor: 'pointer', fontFamily: SANS, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: focus && focus !== m.pitchType ? .45 : 1 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: pitchColor(m.pitchType) }} />{pitchName(m.pitchType)}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute, display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={rings} onChange={e => setRings(e.target.checked)} /> League-average rings
        </label>
      </div>
      <div style={{ height: 440 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 14, bottom: 26, left: 4 }}>
            <CartesianGrid stroke="#efebe1" />
            <XAxis type="number" dataKey="hb" domain={[xlo, xhi]} ticks={ticks(xlo, xhi)} tick={AXIS} tickLine={false} axisLine={{ stroke: C.line }} allowDataOverflow
              label={{ value: 'Horizontal break, in (arm side →)', position: 'insideBottom', offset: -14, style: { ...AXIS } }} />
            <YAxis type="number" dataKey="ivb" domain={[ylo, yhi]} ticks={ticks(ylo, yhi)} tick={AXIS} tickLine={false} axisLine={false} width={34} allowDataOverflow
              label={{ value: 'Induced vertical break, in', angle: -90, position: 'insideLeft', style: { ...AXIS } }} />
            <ZAxis range={[14, 14]} />
            <Tooltip cursor={false} isAnimationActive={false} content={({ payload }) => {
              const d = payload?.[0]?.payload as Datum | undefined
              return d && d.kind ? tooltip(d) : null
            }} />
            <ReferenceLine x={0} stroke="#cfc8b8" /><ReferenceLine y={0} stroke="#cfc8b8" />
            {arm && <ReferenceLine segment={[{ x: 0, y: 0 }, { x: arm.x, y: arm.y }]} stroke="#1A1A1A" strokeDasharray="3 4" strokeOpacity={0.55}
              label={{ value: `arm ${armAngle!.toFixed(0)}°`, position: 'insideTopRight', style: { ...AXIS, fontSize: 10 } }} />}

            {sets.map(s => (
              <Scatter key={s.pitchType} data={s.points.map(p => ({ ...p, kind: 'pitch' as const, pitchType: s.pitchType }))} fill={pitchColor(s.pitchType)}
                fillOpacity={0.42 * dim(s.pitchType) + (focus === s.pitchType ? 0.2 : 0)} isAnimationActive={false} />
            ))}
            {rings && league.map(l => (
              <Scatter key={`lg-${l.pitchType}`} data={[{ ...l, kind: 'league' as const }]} isAnimationActive={false}
                shape={(p: { cx?: number; cy?: number }) => p.cx == null || p.cy == null ? <g /> :
                  <circle cx={p.cx} cy={p.cy} r={15} fill="transparent" stroke={pitchColor(l.pitchType)} strokeWidth={1.6} strokeDasharray="3 3" opacity={dim(l.pitchType) < 1 ? 0.2 : 0.9} />} />
            ))}
            {means.map(m => (
              <Scatter key={`mean-${m.pitchType}`} data={[{ ...m, kind: 'avg' as const }]} isAnimationActive={false}
                shape={(p: { cx?: number; cy?: number }) => p.cx == null || p.cy == null ? <g /> :
                  <circle cx={p.cx} cy={p.cy} r={focus === m.pitchType ? 9 : 7} fill={pitchColor(m.pitchType)} stroke="#1A1A1A" strokeWidth={1.4} opacity={dim(m.pitchType) < 1 ? 0.25 : 1} style={{ cursor: 'pointer' }} />} />
            ))}
            {compare?.means.map(m => (
              <Scatter key={`cmp-${m.pitchType}`} data={[{ ...m, kind: 'compare' as const, name: compare.name }]} isAnimationActive={false}
                shape={(p: { cx?: number; cy?: number }) => p.cx == null || p.cy == null ? <g /> :
                  <path d={`M${p.cx} ${p.cy - 8} L${p.cx + 8} ${p.cy} L${p.cx} ${p.cy + 8} L${p.cx - 8} ${p.cy} Z`} fill="#fff" fillOpacity={0.6} stroke={pitchColor(m.pitchType)} strokeWidth={2} opacity={dim(m.pitchType) < 1 ? 0.25 : 1} />} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {compare && <div style={{ fontFamily: MONO, fontSize: 10, color: C.mute, marginTop: 4 }}>◇ hollow diamonds: {compare.name}&apos;s pitch averages</div>}
    </div>
  )
}
