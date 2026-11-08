'use client'

// src/components/pitch-shape/MilbPitcherCard.tsx
//
// What the Lab shows for a Triple-A or Florida State League pitcher in place of the MLB pitcher read (which needs MLB-only data: the Shape Score board, run values, the
// season line and ESPN ownership). Level-only facts, each with its denominator: his average shape, how often hitters at THIS level missed his pitch, and the sample.
// Below it, "Closest MLB shape": the major-league pitchers whose average pitch is nearest on physical shape alone. No MLB result is attached to him.

import { useEffect, useState } from 'react'
import { C } from '@/components/team/ui'
import { GATE } from '@/lib/pitch-shape/model'
import type { Closest } from '@/lib/milb-shape/closest'
import { LEVEL_LABEL, type Level } from '@/lib/milb-shape/levels'
import { log } from '@/lib/log'

const ORANGE_TEXT = '#B83A0E'
const cache = new Map<string, Closest[] | null>()

export type MilbPitcher = { pitcherId: number; name: string; teamAbbr: string; nPitches: number; velo: number; ivb: number; hb: number; slot: number; nSwings: number; nWhiffs: number }

function useClosest(p: MilbPitcher, type: string, hand: string, armAngle: boolean) {
  const key = `${p.pitcherId}|${type}|${hand}|${armAngle}`
  const [got, setGot] = useState<{ key: string; v: Closest[] | null } | null>(null)
  useEffect(() => {
    if (cache.has(key)) return
    let live = true
    const slot = armAngle ? p.slot : 45   // with no arm angle at this level, compare on the other three axes by holding arm angle at a typical value for both sides
    fetch(`/api/mlb/pitch-shape/closest-mlb?type=${type}&hand=${hand}&velo=${p.velo.toFixed(1)}&ivb=${p.ivb.toFixed(1)}&hb=${p.hb.toFixed(1)}&slot=${slot.toFixed(0)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { closest: Closest[] }) => { cache.set(key, j.closest); if (live) setGot({ key, v: j.closest }) })
      .catch(e => { log.error('MilbPitcherCard', 'closest fetch failed', e instanceof Error ? e.message : e); cache.set(key, null); if (live) setGot({ key, v: null }) })
    return () => { live = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (cache.has(key)) return cache.get(key)
  return got?.key === key ? got.v : undefined
}

export default function MilbPitcherCard({ p, level, season, type, hand, pitchName, armAngle, onClear }: {
  p: MilbPitcher; level: Level; season: number | null; type: string; hand: 'R' | 'L'; pitchName: string; armAngle: boolean; onClear: () => void
}) {
  const closest = useClosest(p, type, hand, armAngle)
  const lc = pitchName.toLowerCase()
  const whiff = p.nSwings >= GATE.swings ? p.nWhiffs / p.nSwings : null
  const stat: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 96 }
  const k: React.CSSProperties = { fontSize: 10, letterSpacing: '.12em', fontWeight: 800, color: C.mute, textTransform: 'uppercase' }
  const v: React.CSSProperties = { fontWeight: 800, fontSize: 20, letterSpacing: '-.01em', fontVariantNumeric: 'tabular-nums' }
  return (
    <section aria-label={`${p.name} at ${LEVEL_LABEL[level]}`} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <div className="pv-k" style={{ color: ORANGE_TEXT }}>{LEVEL_LABEL[level]}{season ? ` · ${season}` : ''}</div>
          <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-.02em' }}>{p.name} <span style={{ fontWeight: 600, fontSize: 14, color: C.mute }}>{p.teamAbbr}</span></div>
          <div style={{ fontSize: 13.5, color: '#5b5347' }}>His {hand === 'L' ? 'left' : 'right'}-handed {lc}, {p.nPitches.toLocaleString()} pitches with tracking at this level.</div>
        </div>
        <button type="button" onClick={onClear} style={{ minHeight: 40, padding: '0 12px', borderRadius: 4, border: `1.5px solid ${C.orange}`, background: '#fff7f3', color: ORANGE_TEXT, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Clear selected pitcher</button>
      </div>

      <div style={{ display: 'flex', gap: '12px 24px', flexWrap: 'wrap', margin: '14px 0' }}>
        <div style={stat}><span style={k}>Velocity</span><span style={v}>{p.velo.toFixed(1)} mph</span></div>
        <div style={stat}><span style={k}>Ride</span><span style={v}>{p.ivb.toFixed(1)} in</span></div>
        <div style={stat}><span style={k}>Run</span><span style={v}>{p.hb.toFixed(1)} in</span></div>
        <div style={stat}><span style={k}>Arm angle</span><span style={armAngle ? v : { ...v, color: C.mute }}>{armAngle ? `${Math.round(p.slot)}°` : 'pending'}</span></div>
        <div style={stat}>
          <span style={k}>Whiffs per swing</span>
          {whiff != null ? <span style={v}>{(whiff * 100).toFixed(1)}%</span> : <span style={{ ...v, color: C.mute }}>pending</span>}
          <span style={{ fontSize: 11.5, color: C.mute }}>{p.nWhiffs.toLocaleString()} of {p.nSwings.toLocaleString()} swings{whiff == null ? `, under ${GATE.swings} needed` : ''}</span>
        </div>
      </div>
      {!armAngle && <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#5b5347' }}>Arm angle is pending at this level for this pitch, so it is left out of the shape and never estimated.</p>}

      <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
        <div className="pv-k" style={{ color: ORANGE_TEXT }}>Closest MLB shape</div>
        <p style={{ margin: '2px 0 8px', fontSize: 12.5, color: '#5b5347', lineHeight: 1.5 }}>Major-league {lc}s nearest to this one on physical shape alone: speed, ride, run{armAngle ? ' and arm angle' : ''}. It says how the pitch moves, not how it has done: no MLB result is applied to him.</p>
        {closest === undefined ? <div style={{ fontSize: 13, color: C.mute }}>Finding the closest MLB shapes…</div>
          : closest === null || closest.length === 0 ? <div style={{ fontSize: 13, color: C.mute }}>No major-league {lc}s to compare with yet.</div>
          : (
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
              {closest.map(c => (
                <li key={c.pitcherId} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 13.5, background: C.soft, borderRadius: 6, padding: '8px 10px' }}>
                  <b>{c.name}</b><span style={{ color: C.mute }}>{c.teamAbbr}</span>
                  <span style={{ color: '#3a352c', fontVariantNumeric: 'tabular-nums' }}>{c.velo.toFixed(1)} mph · {c.ivb.toFixed(1)} in ride · {c.hb.toFixed(1)} in run{armAngle ? ` · ${Math.round(c.slot)}°` : ''}</span>
                </li>
              ))}
            </ol>
          )}
      </div>
    </section>
  )
}
