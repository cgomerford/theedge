'use client'

// §03 Velocity by appearance (Pro). One line per pitch type (mean velocity each outing), injured-list stints
// shaded, and a flag when his primary fastball's last-3-appearance average is >= 1.0 mph below its season mean.
// Public tracking trends only: not a medical assessment. Props are plain data. Recharts only.

import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, MONO, SANS } from '@/components/team/ui'
import { pitchColor, pitchName } from './format'

export type VeloGame = { date: string; velo: Record<string, number>; pitches: number | null; daysRest: number | null; bf: number | null; k: number | null; bb: number | null; csw: number | null }
export type Stint = { start: string; end: string | null; ilType: string | null; description: string | null }

const AXIS = { fontSize: 11, fontFamily: SANS, fill: '#8a8275' }
const FLAG_MPH = 1.0

export default function VeloByAppearance({ games, stints, types, primary }: { games: VeloGame[]; stints: Stint[]; types: string[]; primary: string | null }) {
  const data = games.map((g, i) => ({ i, ...g.velo, _g: g }))
  const dates = games.map(g => g.date)
  const step = Math.max(1, Math.ceil(games.length / 8))   // about eight date labels, always on real appearances
  const tickIdx = games.map((_, i) => i).filter(i => i % step === 0)
  // Map an IL stint to the span of appearance indices it covers (appearances strictly inside the stint).
  const spans = stints.map(s => {
    const inside = games.map((g, i) => ({ i, d: g.date })).filter(x => x.d >= s.start && (s.end == null || x.d <= s.end))
    const before = games.findIndex(g => g.date >= s.start)
    const after = s.end == null ? games.length - 1 : games.findIndex(g => g.date > s.end!)
    if (inside.length) return { x1: inside[0].i - 0.5, x2: inside[inside.length - 1].i + 0.5, s }
    if (before > 0 || (before === -1 && games.length)) {   // stint fell between two appearances: shade the gap
      const a = before === -1 ? games.length - 1 : before - 1
      const b = after === -1 ? games.length - 1 : Math.max(after, a + 1)
      return { x1: a + 0.1, x2: Math.min(b, games.length - 1) - 0.1, s }
    }
    return null
  }).filter((x): x is { x1: number; x2: number; s: Stint } => !!x && x.x2 > x.x1)

  let flag: string | null = null
  if (primary) {
    const series = games.map(g => g.velo[primary]).filter((v): v is number => Number.isFinite(v))
    if (series.length >= 6) {
      const mean = series.reduce((a, b) => a + b, 0) / series.length
      const last3 = series.slice(-3).reduce((a, b) => a + b, 0) / 3
      if (mean - last3 >= FLAG_MPH) flag = `Velocity flag: his ${pitchName(primary).toLowerCase()} averaged ${last3.toFixed(1)} mph over his last three appearances, ${(mean - last3).toFixed(1)} below his ${mean.toFixed(1)} season average.`
    }
  }

  return (
    <div>
      {flag && <div style={{ background: '#FBEAE4', color: '#7A1F14', fontFamily: SANS, fontSize: 12.5, fontWeight: 600, borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>{flag}</div>}
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 14, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="#efebe1" vertical={false} />
            <XAxis dataKey="i" type="number" domain={[-0.5, Math.max(games.length - 0.5, 0.5)]} tick={AXIS} tickLine={false} axisLine={{ stroke: C.line }}
              ticks={tickIdx} tickFormatter={(i: number) => dates[i]?.slice(5) ?? ''} />
            <YAxis domain={['auto', 'auto']} tick={AXIS} tickLine={false} axisLine={false} width={34} tickFormatter={(v: number) => v.toFixed(0)} />
            {spans.map((p, k) => <ReferenceArea key={k} x1={p.x1} x2={p.x2} fill="#D4533B" fillOpacity={0.12} stroke="none" ifOverflow="visible" />)}
            <Tooltip cursor={{ stroke: '#cfc8b8' }} content={({ payload }) => {
              const g = (payload?.[0]?.payload as { _g?: VeloGame } | undefined)?._g
              if (!g) return null
              const line = (k: string, v: string) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}><span style={{ opacity: .7 }}>{k}</span><b>{v}</b></div>
              return (
                <div style={{ background: '#1A1A1A', color: '#FAF8F3', borderRadius: 10, padding: '9px 12px', fontFamily: SANS, fontSize: 12, lineHeight: 1.45, minWidth: 190, boxShadow: '0 8px 24px rgba(0,0,0,.28)' }}>
                  <b style={{ fontSize: 12.5 }}>{g.date}</b>
                  <div style={{ margin: '4px 0' }}>{types.filter(t => g.velo[t] != null).map(t => line(pitchName(t), `${g.velo[t].toFixed(1)} mph`))}</div>
                  <div style={{ borderTop: '1px solid #444', paddingTop: 4 }}>
                    {g.pitches != null && line('Pitches', String(g.pitches))}
                    {g.bf != null && line('Batters faced', `${g.bf} (${g.k ?? 0} K, ${g.bb ?? 0} BB)`)}
                    {g.csw != null && line('CSW%', `${g.csw.toFixed(1)}%`)}
                    {line('Rest', g.daysRest == null ? 'first appearance' : `${g.daysRest} day${g.daysRest === 1 ? '' : 's'}`)}
                  </div>
                </div>
              )
            }} />
            {types.map(t => <Line key={t} type="monotone" dataKey={t} stroke={pitchColor(t)} strokeWidth={t === primary ? 2.6 : 1.6} dot={{ r: 2.5 }} connectNulls isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontFamily: MONO, fontSize: 10, color: C.mute }}>
        {types.map(t => <span key={t}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: pitchColor(t), marginRight: 5 }} />{pitchName(t)}</span>)}
        {spans.length > 0 && <span><span style={{ display: 'inline-block', width: 12, height: 8, background: 'rgba(212,83,59,.25)', marginRight: 5 }} />Injured list</span>}
      </div>
      {stints.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, fontFamily: SANS, fontSize: 12, color: '#5b5347', display: 'grid', gap: 3 }}>
          {stints.map(s => (
            <li key={s.start}><b style={{ color: C.ink }}>{s.ilType ?? 'Injured list'}</b> · {s.start} to {s.end ?? 'no activation on file'}{s.description && s.description.includes('. ') ? <span style={{ color: C.faint }}> — {s.description.split('. ').slice(1).join('. ')}</span> : null}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
