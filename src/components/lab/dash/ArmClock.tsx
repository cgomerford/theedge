'use client'

// src/components/lab/dash/ArmClock.tsx
//
// Arm-angle clock for one club, in the same protractor style as the Scout
// Report graphic: 0° is a sidearm slot, 90° is straight over the top. Every
// pitcher with 100+ pitches is a dot on the arc; the orange wedge is the
// club's average ± one standard deviation (the "variation"), the grey wedge is
// the league's average ± its average variation. Beside it: where the club sits
// in the league leaderboard on arm-angle variation (1 = widest).

import { useEffect, useMemo, useState } from 'react'
import { C, Empty, SANS } from '@/components/team/ui'
import { MLB_TEAMS } from '@/lib/teams'
import { NOTE, type Ctx } from '@/components/lab/dash/shared'
import type { Tile } from '@/components/lab/dash/types'
import type { TeamSummary } from '@/lib/lab/team-summary'

const W = 380, H = 270, S = { x: 56, y: 236 }, R = 200

const at = (a: number, r: number) => ({ x: S.x + r * Math.cos((a * Math.PI) / 180), y: S.y - r * Math.sin((a * Math.PI) / 180) })
const wedge = (a0: number, a1: number, r: number) => {
  const lo = Math.max(0, Math.min(a0, a1)), hi = Math.min(90, Math.max(a0, a1))
  const p0 = at(lo, r), p1 = at(hi, r)
  return `M ${S.x} ${S.y} L ${p0.x} ${p0.y} A ${r} ${r} 0 0 0 ${p1.x} ${p1.y} Z`
}
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length
const slot = (d: number) => (d >= 60 ? 'Over the top' : d >= 45 ? 'High three-quarters' : d >= 30 ? 'Three-quarters' : d >= 15 ? 'Low three-quarters' : 'Sidearm')

export default function ArmClock({ tile, ctx }: { tile: Tile; ctx: Ctx }) {
  const role = ctx.force ?? tile.x.role
  const [pick, setPick] = useState<number | null>(null)
  useEffect(() => { if (pick != null && !ctx.sel.includes(pick)) setPick(null) }, [ctx.sel, pick])
  const focusId = pick ?? ctx.sel[0] ?? null

  const league = useMemo(() => ctx.clubs.flatMap(t => {
    const s = ctx.summaryOf(role, t.id)
    return s && s.armAngleSdPitch != null && s.pitcherArms.length ? [{ t, s, sd: s.armAngleSdPitch }] : []
  }), [ctx, role])
  if (league.length < 2) return <Empty>{ctx.loading ? 'Loading clubs…' : 'Not enough clubs.'}</Empty>

  const board = [...league].sort((a, b) => b.sd - a.sd)
  const avgSd = mean(league.map(r => r.sd))
  const allArms = league.flatMap(r => r.s.pitcherArms.map(p => p.armAngle))
  const leagueMean = mean(allArms)
  const focus = focusId != null ? league.find(r => r.t.id === focusId) ?? null : null
  const rank = focus ? board.findIndex(r => r.t.id === focus.t.id) + 1 : null
  const teamMean = focus ? mean(focus.s.pitcherArms.map(p => p.armAngle)) : null
  const dots = focus ? focus.s.pitcherArms : league.flatMap(r => r.s.pitcherArms)
  const maxSd = board[0].sd
  const roleNote = role === 'all' ? '' : role === 'sp' ? ' · starters' : ' · bullpen'

  return (
    <>
      <div style={{ ...NOTE, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>{focus ? `${focus.s.name}${roleNote}` : `League${roleNote}: select a team to see where it sits`}</span>
        {ctx.sel.length > 1 && ctx.sel.map(id => {
          const t = MLB_TEAMS.find(x => x.id === id)
          return t ? <button key={id} onClick={() => setPick(id)} style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: `1px solid ${focusId === id ? C.ink : C.line}`, background: focusId === id ? C.ink : '#fff', color: focusId === id ? '#fff' : '#5b5347' }}>{t.abbrev}</button> : null
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 6, alignItems: 'start' }}>
        <div>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 300 }} role="img" aria-label="Arm-angle clock">
            <path d={wedge(0, 90, R)} fill={C.soft} />
            <path d={wedge(leagueMean - avgSd, leagueMean + avgSd, R)} fill="rgba(138,130,117,.28)" />
            {focus && teamMean != null && <path d={wedge(teamMean - focus.sd, teamMean + focus.sd, R)} fill="rgba(255,87,34,.30)" />}
            <path d={`M ${at(0, R).x} ${at(0, R).y} A ${R} ${R} 0 0 0 ${at(90, R).x} ${at(90, R).y}`} fill="none" stroke={C.line} strokeWidth={2} />
            {[0, 15, 30, 45, 60, 75, 90].map(a => {
              const i = at(a, R - 6), o = at(a, R + 6), l = at(a, R + 20)
              return (
                <g key={a}>
                  <line x1={i.x} y1={i.y} x2={o.x} y2={o.y} stroke={C.mute} strokeWidth={1.5} />
                  <text x={l.x} y={l.y + 4} textAnchor="middle" fontFamily={SANS} fontSize={10} fill={C.mute}>{a}°</text>
                </g>
              )
            })}
            <line x1={S.x} y1={S.y} x2={at(leagueMean, R).x} y2={at(leagueMean, R).y} stroke={C.mute} strokeWidth={2} strokeDasharray="5 4" />
            {dots.map(p => {
              const e = at(Math.min(90, Math.max(0, p.armAngle)), R - 22)
              return <circle key={`${p.id}`} cx={e.x} cy={e.y} r={focus ? Math.max(4, Math.min(9, Math.sqrt(p.pitches) / 3.2)) : 2.4} fill={focus ? C.orange : '#8a8275'} fillOpacity={focus ? 0.85 : 0.4} stroke="#fff" strokeWidth={focus ? 1.5 : 0}><title>{`${p.name}: ${p.armAngle.toFixed(0)}° · ${p.pitches} pitches`}</title></circle>
            })}
            {focus && teamMean != null && <line x1={S.x} y1={S.y} x2={at(teamMean, R).x} y2={at(teamMean, R).y} stroke={C.orange} strokeWidth={4} strokeLinecap="round" />}
            <line x1={S.x} y1={S.y} x2={S.x} y2={H - 6} stroke={C.ink} strokeWidth={16} strokeLinecap="round" opacity={0.85} />
            <circle cx={S.x} cy={S.y - 34} r={15} fill={C.ink} opacity={0.85} />
            <circle cx={S.x} cy={S.y} r={7} fill={focus ? C.orange : C.mute} />
          </svg>
          <div style={{ ...NOTE, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'rgba(255,87,34,.45)', marginRight: 4 }} />{focus ? `${focus.s.abbrev} average ± 1 SD` : 'select a team'}</span>
            <span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'rgba(138,130,117,.45)', marginRight: 4 }} />League average ± {avgSd.toFixed(1)}°</span>
            <span>Dots = pitchers (100+ pitches). 0° sidearm, 90° over the top; the few below 0° sit on the edge (hover for the real number).</span>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <div>
              <div style={{ ...NOTE }}>{focus ? `${focus.s.abbrev} variation (SD)` : 'League variation (SD)'}</div>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 30, lineHeight: 1, color: focus ? C.orange : C.ink, fontVariantNumeric: 'tabular-nums' }}>{(focus ? focus.sd : avgSd).toFixed(1)}°</div>
            </div>
            <div>
              <div style={NOTE}>League average</div>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 22, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{avgSd.toFixed(1)}°</div>
            </div>
            {rank != null && (
              <div>
                <div style={NOTE}>Leaderboard</div>
                <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 22, lineHeight: 1 }}>#{rank} <span style={{ fontSize: 12, fontWeight: 600, color: C.mute }}>of {board.length} · {rank <= board.length / 3 ? 'widest third' : rank > (board.length * 2) / 3 ? 'tightest third' : 'middle'}</span></div>
              </div>
            )}
          </div>
          {focus && teamMean != null && (
            <p style={{ fontFamily: SANS, fontSize: 12.5, color: '#5b5347', margin: '8px 0 0' }}>
              Average slot {teamMean.toFixed(0)}° ({slot(teamMean)}), league {leagueMean.toFixed(0)}°. Pitchers run from {focus.s.armAngleLow?.toFixed(0)}° to {focus.s.armAngleHigh?.toFixed(0)}°, a {((focus.s.armAngleHigh ?? 0) - (focus.s.armAngleLow ?? 0)).toFixed(0)}° gap.
            </p>
          )}
          <div style={{ ...NOTE, margin: '10px 0 4px' }}>Arm-angle variation, widest to tightest · click a club to select it</div>
          <div style={{ maxHeight: 230, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {board.map((r, i) => {
              const on = focus?.t.id === r.t.id
              return (
                <div key={r.t.id} onClick={() => ctx.toggle(r.t.id)} style={{ display: 'grid', gridTemplateColumns: '22px 36px minmax(0,1fr) 40px', gap: 6, alignItems: 'center', cursor: 'pointer', background: on ? '#FFF3D6' : 'transparent', borderRadius: 4, padding: '1px 2px' }}>
                  <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.faint, textAlign: 'right' }}>{i + 1}</span>
                  <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700 }}>{r.t.abbrev}</span>
                  <div style={{ position: 'relative', height: 8, background: C.soft, borderRadius: 4 }}>
                    <div style={{ width: `${(r.sd / maxSd) * 100}%`, height: '100%', borderRadius: 4, background: on ? C.orange : '#cfc8b8' }} />
                    <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${(avgSd / maxSd) * 100}%`, width: 2, background: C.ink }} />
                  </div>
                  <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: on ? 800 : 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.sd.toFixed(1)}°</span>
                </div>
              )
            })}
          </div>
          <div style={NOTE}>Black tick = league average. Rank 1 = widest variation across all pitches.</div>
        </div>
      </div>
    </>
  )
}
