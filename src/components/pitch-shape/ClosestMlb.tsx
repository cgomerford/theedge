'use client'

// src/components/pitch-shape/ClosestMlb.tsx
//
// For a minor-league or exhibition pitcher: the major-league pitchers whose average pitch is nearest his on physical shape alone (speed, ride, run, and arm angle where the level has one),
// what MLB pitches that move like his have produced, and what his speed has meant at that movement. MLB results are for MLB pitches against MLB hitters, shown for comparison; none of them is counted as his.

import { useEffect, useState } from 'react'
import { C } from '@/components/team/ui'
import { GATE } from '@/lib/pitch-shape/model'
import type { Closest } from '@/lib/milb-shape/closest'
import type { MlbLite } from '@/lib/pitch-shape/results'
import { Headshot, TeamBadge } from '@/components/front-office/pitching/Avatar'
import { teamOf } from '@/lib/milb-shape/teams'
import RunsSavedExplainer from './RunsSavedExplainer'
import InfoTip, { Lab } from './InfoTip'
import { LEVEL_LABEL, type Level } from '@/lib/milb-shape/levels'
import { limitsFor } from '@/lib/milb-shape/limits'
import { log } from '@/lib/log'

const ORANGE_TEXT = '#B83A0E'
type Rate = { whiff: number | null; xwobaCon: number | null; swings: number; bbe: number; pitches: number }
type ClosestResp = {
  closest: (Closest & { mlb: MlbLite | null })[]; season: number
  /** MLB pitches that move like his (any speed): results on the MLB scale */
  movement: MlbLite | null
  mlbAvgWhiff?: number | null
  /** the same movement at his speed against every speed, and the typical speed for it */
  speed: { typicalVelo: number | null; veloDiff: number | null; all: Rate; atSpeed: Rate; whiffEffect: number | null; contactEffect: number | null } | null
}
const cache = new Map<string, ClosestResp | null>()
export type ClosestInput = { pitcherId: number; velo: number; ivb: number; hb: number; slot: number }
const pc = (x: number | null | undefined, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`)
const w3 = (x: number | null | undefined) => (x == null ? '—' : x.toFixed(3).replace(/^0/, ''))
const sg = (x: number, d = 1) => { const r = Number(x.toFixed(d)); return r === 0 ? (0).toFixed(d) : `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(d)}` }
const th: React.CSSProperties = { textAlign: 'left', fontSize: 10, letterSpacing: '.1em', fontWeight: 800, color: C.mute, textTransform: 'uppercase', padding: '6px 8px', borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: `1px solid ${C.soft}`, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

function useClosest(p: ClosestInput, type: string, hand: string, armAngle: boolean) {
  const key = `${p.pitcherId}|${type}|${hand}|${armAngle}`
  const [got, setGot] = useState<{ key: string; v: ClosestResp | null } | null>(null)
  useEffect(() => {
    if (cache.has(key)) return
    let live = true
    const slot = armAngle ? p.slot : 45   // with no arm angle at this level, compare on the other three axes by holding arm angle at a typical value for both sides
    fetch(`/api/mlb/pitch-shape/closest-mlb?type=${type}&hand=${hand}&velo=${p.velo.toFixed(1)}&ivb=${p.ivb.toFixed(1)}&hb=${p.hb.toFixed(1)}&slot=${slot.toFixed(0)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: ClosestResp) => { cache.set(key, j); if (live) setGot({ key, v: j }) })
      .catch(e => { log.error('ClosestMlb', 'closest fetch failed', e instanceof Error ? e.message : e); cache.set(key, null); if (live) setGot({ key, v: null }) })
    return () => { live = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (cache.has(key)) return cache.get(key)
  return got?.key === key ? got.v : undefined
}


export default function ClosestMlb({ p, level, type, hand, pitchName, armAngle }: { p: ClosestInput; level: Level; type: string; hand: 'R' | 'L'; pitchName: string; armAngle: boolean }) {
  const closest = useClosest(p, type, hand, armAngle)
  const lc = pitchName.toLowerCase()
  const swingMin = limitsFor(level).gated ? GATE.swings : 1
  return (
      <div>
        <div className="pv-k" style={{ color: ORANGE_TEXT }}>Closest MLB shape<InfoTip k="closest" /></div>
        <p style={{ margin: '2px 0 8px', fontSize: 12.5, color: '#5b5347', lineHeight: 1.5 }}>Major-league {lc}s nearest to this one on physical shape alone: speed, ride, run{armAngle ? ' and arm angle' : ''}. Below is what MLB pitches of this shape have done, and how speed changes it. These are MLB results for MLB pitches, shown for comparison; none of them is counted as his.</p>
        {closest === undefined ? <div style={{ fontSize: 13, color: C.mute }}>Finding the closest MLB shapes…</div>
          : closest === null || closest.closest.length === 0 ? <div style={{ fontSize: 13, color: C.mute }}>No major-league {lc}s to compare with yet.</div>
          : (
            <>
              {closest.movement && (
                <div style={{ background: C.soft, borderRadius: 6, padding: '10px 12px', marginBottom: 10, fontSize: 13.5, lineHeight: 1.55, color: '#3a352c' }}>
                  <b>What this movement has produced in MLB.</b> MLB {lc}s within 1 in of his ride and run ({closest.movement.pitches.toLocaleString()} pitches, any speed): {closest.movement.whiff != null ? <><b>{pc(closest.movement.whiff)}</b> whiffs per swing ({closest.movement.swings.toLocaleString()} swings)</> : 'too few swings for a whiff rate'}{closest.movement.saved != null ? <>, <b>{sg(closest.movement.saved, 2)}</b> runs saved per 100 pitches</> : ''}{closest.movement.woba != null ? <>, wOBA <b>{w3(closest.movement.woba)}</b></> : ''}{closest.movement.xwoba != null ? <> and xwOBA <b>{w3(closest.movement.xwoba)}</b></> : ''}.
                  {closest.speed && closest.speed.typicalVelo != null && closest.speed.veloDiff != null && (
                    <> <b>Speed.</b> MLB {lc}s with this movement are thrown at about <b>{closest.speed.typicalVelo.toFixed(1)} mph</b>; he throws {p.velo.toFixed(1)}, which is <b>{Math.abs(closest.speed.veloDiff).toFixed(1)} mph</b> {closest.speed.veloDiff < 0 ? 'slower' : 'faster'}.{' '}
                      {closest.speed.atSpeed.whiff != null && closest.speed.all.whiff != null
                        ? <>MLB {lc}s with this movement at his speed get <b>{pc(closest.speed.atSpeed.whiff)}</b> whiffs per swing ({closest.speed.atSpeed.swings.toLocaleString()} swings), against <b>{pc(closest.speed.all.whiff)}</b> at every speed{closest.speed.whiffEffect != null ? <> ({sg(closest.speed.whiffEffect * 100)} pts)</> : ''}{closest.speed.atSpeed.xwobaCon != null && closest.speed.all.xwobaCon != null ? <>; contact against them averages {w3(closest.speed.atSpeed.xwobaCon)} xwOBA against {w3(closest.speed.all.xwobaCon)} at every speed</> : ''}.</>
                        : <>Too few MLB {lc}s at his speed with this movement to say what his speed has meant.</>}</>
                  )}
                </div>
              )}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
                  <thead><tr><th style={th}><Lab t="MLB pitcher" /></th><th style={th}><Lab t="Velocity" /></th><th style={th}><Lab t="vs his" /></th><th style={th}><Lab t="Ride" /></th><th style={th}><Lab t="Run" /></th>{armAngle && <th style={th}><Lab t="Arm" /></th>}<th style={th}><Lab t="Pitches" /></th><th style={th}><Lab t="Whiffs / swing" /></th><th style={th}><Lab t="Runs saved / 100" /></th><th style={th}><Lab t="wOBA" /></th><th style={th}><Lab t="xwOBA" /></th></tr></thead>
                  <tbody>
                    {closest.closest.map(c => {
                      const tm = teamOf('mlb', c.teamAbbr)
                      return (
                        <tr key={c.pitcherId}>
                          <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Headshot id={c.pitcherId} size={34} /><span><b>{c.name}</b><span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: C.mute }}>{tm && <TeamBadge id={tm.id} size={18} disc={false} />}{c.teamAbbr}</span></span></span></td>
                          <td style={td}>{c.velo.toFixed(1)}</td>
                          <td style={{ ...td, fontWeight: 700, color: Math.abs(c.velo - p.velo) < 0.05 ? C.mute : '#3a352c' }}>{sg(c.velo - p.velo)}</td>
                          <td style={td}>{c.ivb.toFixed(1)}</td><td style={td}>{c.hb.toFixed(1)}</td>{armAngle && <td style={td}>{Math.round(c.slot)}°</td>}
                          <td style={td}>{c.mlb ? c.mlb.pitches.toLocaleString() : '—'}</td>
                          <td style={td}>{c.mlb && c.mlb.whiff != null && c.mlb.swings >= swingMin ? pc(c.mlb.whiff) : <span style={{ color: C.mute }}>pending</span>}</td>
                          <td style={td}>{c.mlb && c.mlb.saved != null && c.mlb.rvPitches >= 300 ? sg(c.mlb.saved, 2) : <span style={{ color: C.mute }}>pending</span>}</td>
                          <td style={td}>{c.mlb && c.mlb.woba != null ? w3(c.mlb.woba) : '—'}</td><td style={td}>{c.mlb && c.mlb.xwoba != null ? w3(c.mlb.xwoba) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <RunsSavedExplainer level="mlb" compact />
              <div style={{ fontSize: 12, color: C.mute, marginTop: 6, lineHeight: 1.5 }}>“vs his” is the MLB pitcher’s speed minus his. Each MLB pitcher’s results are his own {closest.season} {lc} against MLB hitters; runs saved per 100 is the MLB average minus his. Whiff rates need {swingMin} swings and runs per 100 need 300 pitches. They show what that pitch has done in MLB, not what his would do.</div>
            </>
          )}
      </div>
  )
}
