'use client'

// src/components/player-page/MilbVsPitchType.tsx
//
// A minor-league hitter's results against each pitch type, worked out in the browser from his own pitch log at one level (fetchLabLog -> /api/mlb/batter-pitch-log?level=, Baseball Savant's minor-league
// tracking: Triple-A and the Florida State League only). It is fetched here rather than on the server so no Savant file is read while a page renders.
// PA = pitches that ended a plate appearance; whiff% = swings and misses per swing; xwOBA = expected wOBA over those plate appearances. A row under the sample minimum carries the small-sample star.
import { useEffect, useState } from 'react'
import { pitchColor, pitchLabel } from '@/lib/lab/pitch-meta'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { fetchLabLog } from '@/lib/lab-log'

type P = { pitchType: string; description: string | null; wobaDen: number | null; xwoba: number | null }
type Row = { code: string; pa: number; swings: number; whiffs: number; xw: number; xwDen: number }
const MUTE = '#8a8275', LINE = '#e7e2d8'
const SWING = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play', 'foul_bunt', 'missed_bunt'])
// The site's definition (scripts/build_pitch_shape_bins.py): a foul tip is a swing, not a whiff.
const WHIFF = new Set(['swinging_strike', 'swinging_strike_blocked', 'missed_bunt'])

export default function MilbVsPitchType({ playerId, level, season, levelName }: { playerId: number; level: 'aaa' | 'fsl'; season: number; levelName: string }) {
  const [state, setState] = useState<{ rows: Row[]; seen: number } | 'loading' | 'none'>('loading')
  useEffect(() => {
    let live = true
    setState('loading')
    fetchLabLog('batter', playerId, season, `&level=${level}`)
      .then(j => {
        if (!live) return
        if (!j) { setState('none'); return }
        const by = new Map<string, Row>()
        for (const p of j.pitches as P[]) {
          const r = by.get(p.pitchType) ?? { code: p.pitchType, pa: 0, swings: 0, whiffs: 0, xw: 0, xwDen: 0 }
          if (p.description && SWING.has(p.description)) { r.swings++; if (WHIFF.has(p.description)) r.whiffs++ }
          if (p.wobaDen != null && p.wobaDen > 0) { r.pa++; if (p.xwoba != null) { r.xw += p.xwoba * p.wobaDen; r.xwDen += p.wobaDen } }
          by.set(p.pitchType, r)
        }
        const rows = [...by.values()].filter(r => r.pa + r.swings > 0).sort((a, b) => b.pa - a.pa)
        setState(rows.length ? { rows, seen: j.pitches.length } : 'none')
      })
    return () => { live = false }
  }, [playerId, level, season])

  const note = { padding: '10px 0', fontSize: 13, color: MUTE, borderTop: `1px solid ${LINE}` } as const
  if (state === 'loading') return <div style={note}>Loading his pitches at {levelName}…</div>
  if (state === 'none') return <div style={note}>No tracked pitches for him at {levelName} this season. Nothing is estimated in their place.</div>
  const small = state.rows.some(r => r.pa < MIN_SAMPLE.vsPitchTypeSeen)
  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
          <thead><tr style={{ color: MUTE, fontSize: 12 }}>{['Pitch', 'Whiff%', 'xwOBA', 'n PA'].map((h, i) => <th key={h} style={{ padding: '6px 8px', textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
          <tbody>{state.rows.map(r => (
            <tr key={r.code} style={{ borderTop: `1px solid ${LINE}` }}>
              <td style={{ padding: '6px 8px', fontWeight: 700 }}><span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: pitchColor(r.code), marginRight: 8 }} />{pitchLabel(r.code)}{r.pa < MIN_SAMPLE.vsPitchTypeSeen ? <span title="Small sample size" style={{ color: '#FF5722', fontWeight: 800 }}>*</span> : null}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.swings ? `${((100 * r.whiffs) / r.swings).toFixed(1)}%` : ''} <span style={{ fontSize: 12, color: MUTE }}>n {r.swings}</span></td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.xwDen ? (r.xw / r.xwDen).toFixed(3).replace(/^0/, '') : ''}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.pa.toLocaleString('en-US')}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: MUTE, marginTop: 4 }}>{state.seen.toLocaleString('en-US')} pitches seen at {levelName} this season, from Baseball Savant&apos;s minor-league tracking.</div>
      {small ? <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>* Small sample size: under {MIN_SAMPLE.vsPitchTypeSeen} plate appearances against that pitch. Read with caution.</div> : null}
    </>
  )
}
