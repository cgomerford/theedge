'use client'

// src/components/lab/TeamMakeupClient.tsx
//
// Interactive pieces of the "Team make-up: pitching" lab page. Props are plain,
// already-computed data (no fetching, no functions from the server component).
//
//   TeamExplorer   pick a club → pitch mix + velocity range + movement profile
//   SpreadVsRuns   30 clubs: variation (release point or arm angle) vs runs allowed per 9

import { useMemo, useState } from 'react'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, ReferenceLine } from 'recharts'
import { Card, C, Empty, Foot, SANS } from '@/components/team/ui'
import { PITCH_COLOR, PITCH_NAME, PITCH_ORDER } from '@/lib/lab/pitch-meta'
import type { PitchRow } from '@/lib/lab/team-pitch-makeup.server-fetch-allowed'

import type { TeamSummary } from '@/lib/lab/team-summary'
import { METRIC_BY_KEY, fmt, pearson } from '@/lib/lab/team-summary'

const AXIS = { fontSize: 10, fontFamily: SANS, fill: '#a89e8c' }
const colorOf = (t: string) => PITCH_COLOR[t] ?? '#a89e8c'
const nameOf = (t: string) => PITCH_NAME[t] ?? t
const orderOf = (t: string) => { const i = PITCH_ORDER.indexOf(t); return i === -1 ? 99 : i }

// ─── Team explorer ────────────────────────────────────────────────────────

export function TeamExplorer({ teams }: { teams: TeamSummary[] }) {
  const sorted = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams])
  const [picked, setPicked] = useState<number | null>(null)
  const teamId = picked ?? sorted.find(t => t.abbrev === 'NYY')?.teamId ?? sorted[0]?.teamId ?? 0
  const team = teams.find(t => t.teamId === teamId) ?? sorted[0]
  const rows = useMemo(
    () => [...(team?.rows ?? [])].sort((a, b) => orderOf(a.pitchType) - orderOf(b.pitchType)),
    [team],
  )
  if (!team) return <Empty>No clubs loaded yet.</Empty>
  const veloRows = rows.filter(p => p.veloAvg != null && p.veloP10 != null && p.veloP90 != null)
  const vMin = Math.floor(Math.min(...veloRows.map(p => p.veloP10 as number), 100) / 5) * 5
  const vMax = Math.ceil(Math.max(...veloRows.map(p => p.veloP90 as number), 70) / 5) * 5
  const pos = (v: number) => `${((v - vMin) / (vMax - vMin)) * 100}%`
  const move = rows.filter(p => p.hBreak != null && p.vBreak != null)

  return (
    <div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: SANS, fontSize: 11, color: C.mute, marginBottom: 14 }}>
        TEAM
        <select
          value={teamId}
          onChange={e => setPicked(Number(e.target.value))}
          style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.ink }}
        >
          {sorted.map(t => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
        </select>
      </label>

      {rows.length === 0 ? <Empty>No pitch data stored for this club.</Empty> : (
        <div className="lab-grid-2">
          <Card title="Pitch mix & velocity variation" note="bar = middle 80% of velocities · tick = average">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map(p => (
                <div key={p.pitchType} style={{ display: 'grid', gridTemplateColumns: '88px 46px minmax(0,1fr)', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: colorOf(p.pitchType), fontFamily: SANS }}>{nameOf(p.pitchType)}</span>
                  <span style={{ fontFamily: SANS, fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: 12, textAlign: 'right' }}>{p.usagePct == null ? '—' : `${p.usagePct.toFixed(1)}%`}</span>
                  <div style={{ position: 'relative', height: 16 }} title={p.veloAvg == null ? 'Velocity not tracked' : `${p.veloP10?.toFixed(1)}–${p.veloP90?.toFixed(1)} mph, avg ${p.veloAvg.toFixed(1)}`}>
                    <div style={{ position: 'absolute', top: 7, left: 0, right: 0, height: 2, background: C.soft }} />
                    {p.veloAvg != null && p.veloP10 != null && p.veloP90 != null && (
                      <>
                        <div style={{ position: 'absolute', top: 3, height: 10, borderRadius: 5, background: colorOf(p.pitchType), opacity: 0.35, left: pos(p.veloP10), width: `calc(${pos(p.veloP90)} - ${pos(p.veloP10)})` }} />
                        <div style={{ position: 'absolute', top: 0, width: 3, height: 16, borderRadius: 2, background: colorOf(p.pitchType), left: pos(p.veloAvg) }} />
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '88px 46px minmax(0,1fr)', gap: 8, fontFamily: SANS, fontSize: 9, color: C.faint }}>
                <span /><span />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{vMin} mph</span><span>{vMax} mph</span></div>
              </div>
            </div>
            <Foot>Usage = share of the club&apos;s {team.pitches.toLocaleString()} tracked pitches. Pitch types under 50 pitches are left out.</Foot>
          </Card>

          <Card title="Movement profile" note="pitcher's view · dot = average, ring = ±1 SD">
            {move.length === 0 ? <Empty>No movement data.</Empty> : (
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
                    <CartesianGrid stroke="#f1eee6" />
                    <XAxis type="number" dataKey="hBreak" name="Arm-side break" unit="″" tick={AXIS} domain={[-25, 25]} label={{ value: '← glove side · arm side →', position: 'bottom', offset: 2, style: AXIS }} />
                    <YAxis type="number" dataKey="vBreak" name="Induced vertical" unit="″" tick={AXIS} domain={[-25, 25]} width={36} />
                    <ZAxis type="number" dataKey="pitches" range={[60, 380]} />
                    <ReferenceLine x={0} stroke="#cfc8b8" />
                    <ReferenceLine y={0} stroke="#cfc8b8" />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const p = payload[0].payload as PitchRow
                      return (
                        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 10px', fontFamily: SANS, fontSize: 12 }}>
                          <b style={{ color: colorOf(p.pitchType) }}>{nameOf(p.pitchType)}</b>
                          <div style={{ fontFamily: SANS, fontSize: 10.5, color: '#5b5347', marginTop: 3 }}>
                            {p.hBreak?.toFixed(1)}″ arm-side · {p.vBreak?.toFixed(1)}″ vertical<br />
                            variation ±{p.hBreakSd?.toFixed(1) ?? '—'}″ / ±{p.vBreakSd?.toFixed(1) ?? '—'}″ · {p.pitches.toLocaleString()} pitches
                          </div>
                        </div>
                      )
                    }} />
                    {move.map(p => (
                      <Scatter key={p.pitchType} data={[p]} fill={colorOf(p.pitchType)} fillOpacity={0.85} />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
            <Foot>Horizontal break is flipped for right-handers so arm side is always to the right. Vertical = induced (gravity removed). n = {team.pitches.toLocaleString()} pitches.</Foot>
          </Card>
        </div>
      )}
      {rows.length > 0 && (
        <Card title="Release point by pitch" note="variation = standard deviation across the club, inches" style={{ marginTop: 16 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr style={{ fontFamily: SANS, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.mute, textAlign: 'right' }}>
                  {['Pitch', 'Pitchers', 'Side (ft)', 'Height (ft)', 'Side variation', 'Height variation', 'Arm angle', 'Angle variation'].map((h, i) => (
                    <th key={h} style={{ padding: '4px 8px', fontWeight: 400, textAlign: i === 0 ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.pitchType} style={{ borderTop: `1px solid ${C.soft}`, textAlign: 'right' }}>
                    <td style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, color: colorOf(p.pitchType) }}>{nameOf(p.pitchType)}</td>
                    <td style={{ padding: '6px 8px' }}>{p.nPitchers ?? '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{p.relSide?.toFixed(2) ?? '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{p.relHeight?.toFixed(2) ?? '—'}</td>
                    <td style={{ padding: '6px 8px', fontWeight: 700 }}>{p.relSideSdIn == null ? '—' : `±${p.relSideSdIn.toFixed(1)}″`}</td>
                    <td style={{ padding: '6px 8px', fontWeight: 700 }}>{p.relHeightSdIn == null ? '—' : `±${p.relHeightSdIn.toFixed(1)}″`}</td>
                    <td style={{ padding: '6px 8px' }}>{p.armAngle == null ? '—' : `${p.armAngle.toFixed(1)}°`}</td>
                    <td style={{ padding: '6px 8px', fontWeight: 700 }}>{p.armAngleSd == null ? '—' : `±${p.armAngleSd.toFixed(1)}°`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Foot>Release side is measured from the middle of the rubber, arm side positive. Variation includes pitcher-to-pitcher differences, so a club with many different arm slots shows a wider number.</Foot>
        </Card>
      )}
    </div>
  )
}

// ─── Variation vs runs ───────────────────────────────────────────────────────

type SpreadKey = 'release' | 'arm'
const SPREADS: Record<SpreadKey, { label: string; unit: string; get: (t: TeamSummary) => number | null; blurb: string }> = {
  release: { label: 'Release-point variation', unit: '″', get: t => t.releaseSpreadIn, blurb: 'How far apart the club\'s release points land for the same pitch type (usage-weighted, inches).' },
  arm: { label: 'Arm-angle variation', unit: '°', get: t => t.armAngleSdPitch, blurb: 'Standard deviation of arm angle across every pitch the club threw (degrees).' },
}

export function SpreadVsRuns({ teams, season, roleLabel }: { teams: TeamSummary[]; season: number; roleLabel: string }) {
  const [key, setKey] = useState<SpreadKey>('release')
  const [outKey, setOutKey] = useState('ra9')
  const out = METRIC_BY_KEY.get(outKey)!
  const spec = SPREADS[key]
  const pts = useMemo(
    () => teams.flatMap(t => {
      const x = spec.get(t)
      const y = out.get(t)
      return x != null && y != null ? [{ x, y, abbrev: t.abbrev, name: t.name, color: t.color }] : []
    }),
    [teams, spec, out],
  )
  const r = pearson(pts.map(p => p.x), pts.map(p => p.y))
  const read = r == null ? 'Not enough data.'
    : Math.abs(r) < 0.2 ? 'No clear relationship in either direction.'
    : r > 0 ? 'Wider variation went with more runs allowed.'
    : 'Tighter variation went with more runs allowed.'

  return (
    <Card title={`${spec.label} vs ${out.label}`} note={`${roleLabel} · ${pts.length} clubs · ${season}`}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {(Object.keys(SPREADS) as SpreadKey[]).map(k => (
          <button key={k} onClick={() => setKey(k)} style={{
            fontFamily: SANS, fontWeight: 700, fontSize: 12, padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
            border: `1px solid ${k === key ? C.ink : C.line}`, background: k === key ? C.ink : '#fff', color: k === key ? '#fff' : '#5b5347',
          }}>{SPREADS[k].label}</button>
        ))}
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontFamily: SANS, fontSize: 10, color: C.mute, marginBottom: 8 }}>
        OUTCOME
        <select value={outKey} onChange={e => setOutKey(e.target.value)} style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: '5px 8px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', flex: 1 }}>
          {['ra9', 'era', 'xwoba', 'whiff', 'csw', 'chase', 'zone', 'kpct', 'bbpct', 'hardhit', 'barrel', 'ev'].map(k => <option key={k} value={k}>{METRIC_BY_KEY.get(k)!.label}</option>)}
        </select>
      </label>
      <p style={{ fontFamily: SANS, fontSize: 13, color: '#5b5347', margin: '0 0 8px' }}>{spec.blurb}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 26, fontVariantNumeric: 'tabular-nums' }}>{r == null ? '—' : `r = ${r.toFixed(2)}`}</span>
        <span style={{ fontFamily: SANS, fontSize: 13, color: '#5b5347' }}>{read}</span>
      </div>
      {pts.length === 0 ? <Empty>No data.</Empty> : (
        <div style={{ height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 16, bottom: 22, left: 0 }}>
              <CartesianGrid stroke="#f1eee6" />
              <XAxis type="number" dataKey="x" name={spec.label} unit={spec.unit} tick={AXIS} domain={['dataMin - 0.2', 'dataMax + 0.2']} tickFormatter={(v: number) => v.toFixed(1)} label={{ value: `${spec.label} (tighter ← → wider)`, position: 'bottom', offset: 6, style: AXIS }} />
              <YAxis type="number" dataKey="y" name={out.label} tick={AXIS} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(out.decimals)} width={36} />
              <ZAxis range={[90, 90]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as (typeof pts)[number]
                return (
                  <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 10px', fontFamily: SANS, fontSize: 12 }}>
                    <b>{p.name}</b>
                    <div style={{ fontFamily: SANS, fontSize: 10.5, color: '#5b5347', marginTop: 3 }}>{spec.label}: {p.x.toFixed(2)}{spec.unit} · {out.label}: {fmt(out, p.y)}</div>
                  </div>
                )
              }} />
              <Scatter data={pts} shape={(props: { cx?: number; cy?: number; payload?: (typeof pts)[number] }) => (
                <g>
                  <circle cx={props.cx} cy={props.cy} r={5.5} fill={props.payload?.color} fillOpacity={0.85} stroke="#fff" strokeWidth={1} />
                  <text x={(props.cx ?? 0) + 8} y={(props.cy ?? 0) + 3} fontSize={9} fontFamily={SANS} fill="#5b5347">{props.payload?.abbrev}</text>
                </g>
              )} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
      <Foot>
        One dot per club ({season} regular season). r is the Pearson correlation across these {pts.length} clubs: a description of how the two lined up, not proof that one drives the other —
        run prevention also reflects defence, park and the quality of the arms behind the variation.  xwOBA against stands in for xERA, which Savant doesn't publish per team.
      </Foot>
    </Card>
  )
}
