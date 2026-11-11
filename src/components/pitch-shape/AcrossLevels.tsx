'use client'

// src/components/pitch-shape/AcrossLevels.tsx
//
// One pitcher's one pitch at every level he has thrown it at, set against each level's average. Three questions, answered from what the data holds:
//   * How does his shape compare with the level's average shape (speed, ride, run) at each level?
//   * Has his shape changed between levels? Pitchers keep their MLB player id, so a difference is a change in his own pitch, not a different arm.
//   * Did hitters miss it more or less than they missed the average pitch of that level? Misses are measured against each level's own hitters, parks and zone, so the comparison is
//     with that level's own average and the numbers are never put on one scale across levels.
// Spring Training and the Arizona Fall League carry no arm angle (shown as pending, never filled in) and a small minimum sample, so they read with their count beside them. Description only.

import { C } from '@/components/team/ui'
import { LEVEL_LABEL, LEVEL_SHORT, isExhibition, type Level } from '@/lib/milb-shape/levels'
import { limitsFor } from '@/lib/milb-shape/limits'
import { GATE } from '@/lib/pitch-shape/model'
import type { RepertoireRow } from '@/lib/pitch-shape/data'
import { ABOUT_LEVEL_PTS } from './finder-math'
import { usePitcherLevels } from './usePitcherLevels'
import PitcherShapeLevels from './PitcherShapeLevels'
import { Lab } from './InfoTip'

/** a level's average for this pitch and hand: its average shape and its whiffs per swing (null when no swing was recorded) */
export type LevelAvg = { whiff: number | null; velo: number; ivb: number; hb: number; slotKnown: boolean }

const PROGRESSION: Level[] = ['fsl', 'afl', 'aaa', 'st', 'mlb']   // lowest to highest, so the change reads as a progression
const th: React.CSSProperties = { textAlign: 'left', fontSize: 10, letterSpacing: '.1em', fontWeight: 800, color: C.mute, textTransform: 'uppercase', padding: '6px 8px', borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '7px 8px', borderBottom: `1px solid ${C.soft}`, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const sg = (x: number, d = 1) => { const r = Number(x.toFixed(d)); return r === 0 ? (0).toFixed(d) : `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(d)}` }
const pc = (x: number | null, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`)

type Row = { level: Level; season: number | null; r: RepertoireRow }

export default function AcrossLevels({ pitcherId, type, pitchName, level, levelAvg }: {
  pitcherId: number; type: string; pitchName: string
  /** the level the page is showing, marked in the table */
  level: Level
  /** each level's average for this pitch and hand, from the level comparison; a level missing here has no average to set him against */
  levelAvg: Partial<Record<Level, LevelAvg>>
}) {
  const levels = usePitcherLevels(pitcherId)
  const lc = pitchName.toLowerCase()
  if (levels === undefined) return <div style={{ fontSize: 13, color: C.mute }}>Loading his shape at each level…</div>
  if (levels === null) return <div style={{ fontSize: 13, color: '#5b5347' }}>His levels could not be read right now.</div>
  const rows: Row[] = levels
    .flatMap(l => { const r = l.repertoire?.rows.find(x => x.pitchType === type); return r ? [{ level: l.level, season: l.season, r }] : [] })
    .sort((a, b) => PROGRESSION.indexOf(a.level) - PROGRESSION.indexOf(b.level))
  if (rows.length === 0) return <div style={{ fontSize: 13, color: '#5b5347' }}>He has no tracked {lc}s at any level in the data.</div>

  const low = rows[0], high = rows[rows.length - 1]
  const moved = rows.length > 1 ? { velo: high.r.velo - low.r.velo, ivb: high.r.ivb - low.r.ivb, hb: high.r.hb - low.r.hb } : null
  const steady = moved != null && Math.abs(moved.velo) < 1 && Math.abs(moved.ivb) < 1 && Math.abs(moved.hb) < 1   // within a mile an hour and an inch on each axis
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
          <thead><tr>
            <th style={th}><Lab t="Level" /></th><th style={th}><Lab t="Pitches" /></th><th style={th}><Lab t="Velocity" /></th><th style={th}><Lab t="Ride" /></th><th style={th}><Lab t="Run" /></th>
            <th style={th}><Lab t="Arm angle" /></th><th style={th}><Lab t="Whiffs / swing" /></th><th style={th}>Against the level’s average</th>
          </tr></thead>
          <tbody>
            {rows.map(({ level: lv, season, r }) => {
              const avg = levelAvg[lv]
              const swingMin = limitsFor(lv).gated ? GATE.swings : 1
              const whiff = r.nSwings >= swingMin ? r.nWhiffs / r.nSwings : null
              const diff = whiff != null && avg?.whiff != null ? (whiff - avg.whiff) * 100 : null
              const tone = diff == null ? null : diff >= ABOUT_LEVEL_PTS ? 'good' : diff <= -ABOUT_LEVEL_PTS ? 'bad' : 'level'
              const arm = !isExhibition(lv)
              return (
                <tr key={lv} style={{ background: lv === level ? '#FFF3EA' : undefined }}>
                  <td style={{ ...td, fontWeight: 800 }}>{LEVEL_LABEL[lv]}{season ? <span style={{ color: C.mute, fontWeight: 600 }}> · {season}</span> : null}</td>
                  <td style={td}>{r.nPitches.toLocaleString()}</td>
                  <td style={td}><b>{r.velo.toFixed(1)}</b>{avg && <span style={{ color: C.mute, fontSize: 11.5 }}> avg {avg.velo.toFixed(1)}</span>}</td>
                  <td style={td}><b>{r.ivb.toFixed(1)}</b>{avg && <span style={{ color: C.mute, fontSize: 11.5 }}> avg {avg.ivb.toFixed(1)}</span>}</td>
                  <td style={td}><b>{r.hb.toFixed(1)}</b>{avg && <span style={{ color: C.mute, fontSize: 11.5 }}> avg {avg.hb.toFixed(1)}</span>}</td>
                  <td style={td}>{arm ? `${Math.round(r.slot)}°` : <span style={{ color: C.mute }}>pending</span>}</td>
                  <td style={td}>{whiff != null ? <b>{pc(whiff)}</b> : <span style={{ color: C.mute }}>pending</span>}<span style={{ color: C.mute, fontSize: 11.5 }}> {r.nWhiffs.toLocaleString()} of {r.nSwings.toLocaleString()}</span></td>
                  <td style={td}>
                    {diff == null || tone == null ? <span style={{ color: C.mute }}>{whiff == null ? 'too few swings' : 'no level average'}</span> : (
                      <span style={{ background: tone === 'good' ? '#E3F3EC' : tone === 'bad' ? '#FBE6E1' : C.soft, color: tone === 'good' ? '#13694F' : tone === 'bad' ? '#A8391F' : '#5b5347', fontWeight: 800, borderRadius: 3, padding: '2px 8px' }}>
                        {tone === 'level' ? 'about the same' : `${sg(diff)} pts`}
                      </span>
                    )}
                    {avg?.whiff != null && <span style={{ color: C.mute, fontSize: 11.5 }}> {LEVEL_SHORT[lv]} avg {pc(avg.whiff)}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 13, color: '#3a352c', lineHeight: 1.55, margin: '10px 0 0' }}>
        {moved == null
          ? <>He has thrown his {lc} at one level in the data ({LEVEL_LABEL[low.level]}), so there is no change to show yet. The row above sets his shape and his misses against that level’s average.</>
          : steady
            ? <>His {lc} has not changed shape from {LEVEL_LABEL[low.level]} to {LEVEL_LABEL[high.level]}: within a mile an hour and an inch of ride and run ({sg(moved.velo)} mph, {sg(moved.ivb)} in of ride, {sg(moved.hb)} in of run).</>
            : <>From {LEVEL_LABEL[low.level]} to {LEVEL_LABEL[high.level]} his {lc} changed by <b>{sg(moved.velo)} mph</b>, <b>{sg(moved.ivb)} in of ride</b> and <b>{sg(moved.hb)} in of run</b>. The same arm, so this is a change in the pitch.</>}
        {' '}Misses are counted against each level’s own hitters, so “against the level’s average” compares him with that level only, not one level with another.
      </p>
      {rows.length > 1 && (
        <details open style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13.5, minHeight: 32 }}>See his {lc} at each level on the movement map</summary>
          <PitcherShapeLevels pitcherId={pitcherId} initialType={type} levelAvg={levelAvg} />
        </details>
      )}
    </div>
  )
}
