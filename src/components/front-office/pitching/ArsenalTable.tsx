'use client'

// §01 Arsenal table (free) + the shared "focused pitch type" state that the Movement plot (Pro) also reads.
// Clicking a row focuses that pitch in the plots; clicking it again clears. League averages and SDs come from
// fo_pitch_league_avg (pitchers with 100+ pitches of that type). Shading only where one direction is clearly better
// (velocity, whiff%, xwOBA); every other column still shows its league comparison on hover.
// Stuff Grade is "—" until x9Lab's own model ships.

import { createContext, useContext, useState } from 'react'
import { C, MONO, SANS } from '@/components/team/ui'
import { dash, f3, fint, fsigned, fx, pitchColor, pitchName, shade, type LeagueStat } from './format'
import Tip, { TipBody } from './Tip'

type Focus = { focus: string | null; setFocus: (t: string | null) => void }
const FocusCtx = createContext<Focus>({ focus: null, setFocus: () => {} })
export const usePitchFocus = () => useContext(FocusCtx)

export function PitchFocusProvider({ children }: { children: React.ReactNode }) {
  const [focus, setFocus] = useState<string | null>(null)
  return <FocusCtx.Provider value={{ focus, setFocus }}>{children}</FocusCtx.Provider>
}

export type ArsenalLine = {
  pitchType: string; pitches: number; usage: number | null; velo: number | null; ivb: number | null; hb: number | null; spin: number | null
  activeSpin: number | null; vaa: number | null; ext: number | null; whiff: number | null; xwoba: number | null; rv: number | null; stuff: number | null
}
export type LeagueByType = Record<string, { n: number | null; stats: Record<string, LeagueStat> }>   // pitchType -> metric -> {mean, sd}

type Col = {
  head: string; def: string; show: (r: ArsenalLine) => string; get?: (r: ArsenalLine) => number | null
  stat?: string; hi?: boolean; shaded?: boolean; dec?: number; unit?: string
}

const COLS: Col[] = [
  { head: 'Usage', def: 'Share of his pitches (in this window and batter side) that were this type.', show: r => (r.usage == null ? dash : `${r.usage.toFixed(0)}%`) },
  { head: 'Velo', def: 'Average release speed, mph.', show: r => fx(r.velo), get: r => r.velo, stat: 'velo', hi: true, shaded: true, dec: 1 },
  { head: 'IVB', def: 'Induced vertical break, inches: rise relative to a spinless pitch. Higher means more rise, lower means more sink.', show: r => fx(r.ivb), get: r => r.ivb, stat: 'ivb', dec: 1 },
  { head: 'HB', def: 'Horizontal break, inches, arm side positive (mirrored for left-handers so both hands compare).', show: r => fx(r.hb), get: r => r.hb, stat: 'hb', dec: 1 },
  { head: 'Spin', def: 'Average spin rate, rpm.', show: r => fint(r.spin), get: r => r.spin, stat: 'spin', dec: 0 },
  { head: 'Active spin', def: 'Share of the spin that creates movement (a season-level figure).', show: r => (r.activeSpin == null ? dash : `${r.activeSpin.toFixed(0)}%`), get: r => r.activeSpin, stat: 'activeSpinPct', dec: 0, unit: '%' },
  { head: 'VAA', def: 'Vertical approach angle at the front of the plate, degrees. Closer to zero is flatter, which plays up in the zone.', show: r => fx(r.vaa), get: r => r.vaa, stat: 'vaa', dec: 1 },
  { head: 'Ext', def: 'Release extension: how far down the mound he lets go of the ball, feet.', show: r => fx(r.ext), get: r => r.ext, stat: 'extension', dec: 1 },
  { head: 'Whiff%', def: 'Swings that miss, per swing.', show: r => fx(r.whiff), get: r => r.whiff, stat: 'whiffPct', hi: true, shaded: true, dec: 1, unit: '%' },
  { head: 'xwOBA', def: 'Expected wOBA on the plate appearances this pitch ended. Lower is better for the pitcher.', show: r => f3(r.xwoba), get: r => r.xwoba, stat: 'xwoba', hi: false, shaded: true, dec: 3 },
  { head: 'RV/100', def: 'Runs saved per 100 pitches, positive = good for the pitcher (Savant run values).', show: r => fsigned(r.rv, 1), get: r => r.rv },
  { head: 'Stuff Grade', def: "x9Lab's own pitch model on the 20-80 scale. It arrives in a later release.", show: r => (r.stuff == null ? dash : String(Math.round(r.stuff))) },
]

export default function ArsenalTable({ rows, league }: { rows: ArsenalLine[]; league: LeagueByType }) {
  const { focus, setFocus } = usePitchFocus()

  function cellTip(c: Col, r: ArsenalLine): React.ReactNode {
    const lines: [string, string][] = [[c.head, c.show(r)]]
    const lg = league[r.pitchType]
    const st = c.stat ? lg?.stats[c.stat] : undefined
    const v = c.get ? c.get(r) : null
    if (st && st.mean != null && st.sd != null && st.sd > 0 && v != null) {
      const d = c.dec ?? 1
      const z = (v - st.mean) / st.sd
      lines.push([`League ${pitchName(r.pitchType).toLowerCase()} average`, `${st.mean.toFixed(d)}${c.unit ?? ''}`], ['Standard deviation', st.sd.toFixed(d)])
      if (c.hi != null) lines.push(['Against the league', `${Math.abs(z).toFixed(1)} SD ${((c.hi ? z : -z) >= 0) ? 'better' : 'worse'}`])
      else lines.push(['Against the league', `${Math.abs(z).toFixed(1)} SD ${z >= 0 ? 'above' : 'below'}`])
    }
    return <TipBody title={`${pitchName(r.pitchType)} · ${c.head}`} lines={lines}
      note={`${c.def}${lg?.n ? ` League sample: ${lg.n} pitchers with 100+ ${pitchName(r.pitchType).toLowerCase()}s.` : ''}`} />
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr style={{ color: C.mute, fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>
            <th style={{ textAlign: 'left', fontWeight: 400, padding: '6px 8px' }}>Pitch</th>
            <th style={{ textAlign: 'right', fontWeight: 400, padding: '6px 8px' }}>#</th>
            {COLS.map(c => (
              <th key={c.head} style={{ textAlign: 'right', fontWeight: 400, padding: '6px 8px', whiteSpace: 'nowrap' }}>
                <Tip content={<TipBody title={c.head} note={c.def} />}>{c.head}</Tip>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.pitchType} tabIndex={0} aria-selected={focus === r.pitchType} className="pd-row"
              onClick={() => setFocus(focus === r.pitchType ? null : r.pitchType)}
              onKeyDown={e => { if (e.key === 'Enter') setFocus(focus === r.pitchType ? null : r.pitchType) }}
              style={{ borderTop: `1px solid ${C.line}`, cursor: 'pointer', background: focus === r.pitchType ? '#FFF3E8' : undefined, opacity: focus && focus !== r.pitchType ? .55 : 1 }}>
              <td style={{ padding: '7px 8px', whiteSpace: 'nowrap', fontWeight: 700 }}>
                <Tip content={<TipBody title={pitchName(r.pitchType)} lines={[['Pitches', fint(r.pitches)], ['Usage', r.usage == null ? dash : `${r.usage.toFixed(1)}%`]]} note="Click to focus this pitch in the charts; click again to clear." />}>
                  <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: pitchColor(r.pitchType), marginRight: 8 }} />{pitchName(r.pitchType)}
                </Tip>
              </td>
              <td style={{ textAlign: 'right', padding: '7px 8px', color: C.mute }}>{r.pitches}</td>
              {COLS.map(c => {
                const t = c.shaded && c.stat && c.get ? shade(c.get(r), league[r.pitchType]?.stats[c.stat], c.hi ?? true) : null
                return (
                  <td key={c.head} style={{ textAlign: 'right', padding: '7px 8px', whiteSpace: 'nowrap', background: t?.bg, color: t?.fg ?? C.ink, fontWeight: t ? 700 : 400 }}>
                    <Tip block content={cellTip(c, r)}>{c.show(r)}</Tip>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

