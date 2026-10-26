'use client'

import { usePathname } from 'next/navigation'
import { PITCH_NAME, pitchColor } from '@/lib/lab/pitch-meta'

// A STATIC MOCKUP of whichever lab tab the visitor is on, for people who cannot open it yet. Every number here is a made-up
// sample, and the page says so in words above it ("Example only..."). It carries no data about the player and loads none. The gate
// lives in the shared layout, so this picks its mockup from the last URL segment.

const GOOD = '#1D9E75', BAD = '#D4533B', LINE = '#e7e2d8', MUTE = '#8a8275'
const TH: React.CSSProperties = { textAlign: 'left', fontSize: 12, fontWeight: 800, color: MUTE, padding: '8px 10px', borderBottom: `1px solid ${LINE}`, whiteSpace: 'nowrap' }
const TD: React.CSSProperties = { padding: '9px 10px', borderBottom: `1px solid ${LINE}`, fontVariantNumeric: 'tabular-nums', fontSize: 14 }
const TITLE: React.CSSProperties = { margin: '0 0 8px', fontSize: 13, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5722' }

/** What each tab is, for the "Sign up to see X's ..." line. */
export const LAB_NOUN: Record<'batting' | 'pitching', Record<string, string>> = {
  batting: { '': 'overview', arsenal: 'results against every pitch type', location: 'pitch locations', 'hot-zones': 'hot zones', sequencing: 'pitch sequencing', trends: 'trends', h2h: 'head-to-head record', swing: 'swing changes', contact: 'contact quality', outcomes: 'three true outcomes', platoon: 'platoon splits', approach: 'swing decisions', reaction: 'reaction window' },
  pitching: { '': 'overview', arsenal: 'arsenal', location: 'pitch locations', overlay: 'hot zone overlay', sequencing: 'pitch sequencing', shape: 'pitch shape', stuff: 'stuff', trends: 'trends', h2h: 'head-to-head record' },
}

export function tabOf(path: string | null): string {
  return (path ?? '').replace(/\/$/, '').split('/').pop() ?? ''
}

const MIX: Array<[string, number, number, number, number]> = [
  ['FF', 94.1, 38, 24, 412], ['SL', 85.6, 24, 36, 261], ['CH', 87.9, 16, 30, 174], ['CU', 79.8, 12, 33, 130],
]

function PitchChip({ code }: { code: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
      <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: pitchColor(code), display: 'inline-block' }} />
      {code} {PITCH_NAME[code]}
    </span>
  )
}

function Mix({ cols = ['Velo', 'Usage', 'Whiff %', 'Pitches (n)'], pick = [1, 2, 3, 4] }: { cols?: string[]; pick?: number[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr><th style={{ ...TH, position: 'sticky', left: 0, background: '#FAF8F3' }}>Pitch</th>{cols.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
        <tbody>
          {MIX.map(r => (
            <tr key={r[0]}>
              <th scope="row" style={{ ...TD, textAlign: 'left', position: 'sticky', left: 0, background: '#FAF8F3', whiteSpace: 'nowrap' }}><PitchChip code={r[0]} /></th>
              {pick.map((k, i) => <td key={i} style={TD}>{k === 1 ? r[1].toFixed(1) : k === 4 ? r[4] : `${r[k]}%`}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const ZONE_SAMPLE = [[.31, .36, .28], [.26, .41, .30], [.18, .24, .21]]
function Zones({ unit = 'xwOBA' }: { unit?: string }) {
  const rows = ['Up', 'Middle', 'Down'], cols = ['Inside', 'Middle', 'Away']
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(3, minmax(64px, 96px))', gap: 4, alignItems: 'center' }}>
        <span />{cols.map(c => <span key={c} style={{ fontSize: 12, fontWeight: 800, color: MUTE, textAlign: 'center' }}>{c}</span>)}
        {rows.map((r, i) => (
          <div key={r} style={{ display: 'contents' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{r}</span>
            {ZONE_SAMPLE[i].map((v, j) => (
              <span key={j} style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums', background: v >= .3 ? BAD : v <= .24 ? GOOD : '#f1eee6', color: v >= .3 || v <= .24 ? '#fff' : '#1A1A1A' }}>{v.toFixed(3).slice(1)}</span>
            ))}
          </div>
        ))}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: MUTE }}>{unit} by zone. Red = more damage, green = less. Catcher view.</p>
    </div>
  )
}

function Chart({ x, y, series = 1 }: { x: string; y: string; series?: number }) {
  const pts = [[0, 60], [20, 48], [40, 55], [60, 34], [80, 40], [100, 22]]
  const pts2 = [[0, 30], [20, 36], [40, 28], [60, 40], [80, 32], [100, 38]]
  const path = (p: number[][]) => p.map((q, i) => `${i ? 'L' : 'M'}${q[0] * 2.6 + 10},${q[1] * 1.7 + 8}`).join(' ')
  return (
    <div>
      <svg viewBox="0 0 280 130" role="img" aria-label={`Example chart: ${y} by ${x}`} style={{ width: '100%', maxWidth: 520, height: 'auto', display: 'block' }}>
        <line x1="10" y1="120" x2="272" y2="120" stroke={LINE} strokeWidth="2" /><line x1="10" y1="8" x2="10" y2="120" stroke={LINE} strokeWidth="2" />
        <path d={path(pts)} fill="none" stroke="#FF5722" strokeWidth="3" />
        {series > 1 && <path d={path(pts2)} fill="none" stroke="#1A1A1A" strokeWidth="3" strokeDasharray="6 4" />}
      </svg>
      <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 800, color: MUTE }}>{y} by {x}</p>
    </div>
  )
}

function Rows({ rows, head }: { rows: string[][]; head: string[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{head.map((h, i) => <th key={i} style={{ ...TH, ...(i === 0 ? { position: 'sticky', left: 0, background: '#FAF8F3' } : null) }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((v, i) => i === 0
          ? <th key={i} scope="row" style={{ ...TD, textAlign: 'left', fontWeight: 700, position: 'sticky', left: 0, background: '#FAF8F3', whiteSpace: 'nowrap' }}>{v}</th>
          : <td key={i} style={TD}>{v}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

function Shape() {
  const dots: Array<[string, number, number]> = [['FF', 8, 17], ['FF', 10, 15], ['SL', -4, 2], ['SL', -6, 0], ['CH', 14, 8], ['CH', 15, 6], ['CU', -9, -9], ['CU', -11, -11]]
  const X = (v: number) => 150 + v * 7, Y = (v: number) => 110 - v * 4.2
  return (
    <div>
      <svg viewBox="0 0 300 220" role="img" aria-label="Example movement map: horizontal break by induced vertical break" style={{ width: '100%', maxWidth: 460, height: 'auto', display: 'block' }}>
        <line x1="10" y1="110" x2="290" y2="110" stroke={LINE} strokeWidth="2" /><line x1="150" y1="8" x2="150" y2="212" stroke={LINE} strokeWidth="2" />
        {dots.map((d, i) => <circle key={i} cx={X(d[1])} cy={Y(d[2])} r="7" fill={pitchColor(d[0])} stroke="#fff" strokeWidth="1.5" />)}
      </svg>
      <p style={{ margin: '6px 0 8px', fontSize: 12, fontWeight: 800, color: MUTE }}>Horizontal break (x) by induced vertical break (y), inches</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 13 }}>
        {['FF', 'SL', 'CH', 'CU'].map(c => <li key={c}><PitchChip code={c} /></li>)}
      </ul>
    </div>
  )
}

function Mockup({ lab, tab }: { lab: 'batting' | 'pitching'; tab: string }) {
  const bat = lab === 'batting'
  const stack = (...n: React.ReactNode[]) => <div style={{ display: 'grid', gap: 22 }}>{n}</div>
  switch (tab) {
    case 'hot-zones': case 'overlay': return stack(<Zones />, bat ? null : <p style={{ margin: 0, fontSize: 13, color: MUTE }}>Pick a hitter to lay his zones over the pitcher&apos;s.</p>)
    case 'location': return stack(<Zones unit="Share of pitches" />, <Mix cols={['Usage', 'Pitches (n)']} pick={[2, 4]} />)
    case 'sequencing': return <Rows head={['Count', 'Most common pitch', 'Share', 'Pitches (n)']} rows={[['First pitch', 'FF Four-seam', '52%', '311'], ['Ahead in the count', 'SL Slider', '41%', '188'], ['Behind in the count', 'FF Four-seam', '63%', '140'], ['Two strikes', 'CH Changeup', '38%', '176']]} />
    case 'trends': return stack(<Chart x="month" y={bat ? 'Rolling xwOBA' : 'Pitch mix share'} series={2} />)
    case 'h2h': return <Rows head={[bat ? 'Pitcher' : 'Hitter', 'PA', 'AVG', 'OPS', 'HR', 'K']} rows={[['Sample name', '24', '.250', '.780', '2', '6'], ['Sample name', '11', '.182', '.540', '0', '4']]} />
    case 'stuff': return <Mix cols={['Velo', 'Spin', 'Pitches (n)']} pick={[1, 2, 4]} />
    case 'shape': return <Shape />
    case 'swing': return stack(<Chart x="month" y="Swing speed" />, <Chart x="month" y="Hard-hit rate" />)
    case 'contact': return stack(<Rows head={['Measure', 'Count', 'Rate']} rows={[['Balls in play', '312', '—'], ['Hard hit', '141', '45%'], ['Barrels', '38', '12%']]} />, <Rows head={['Direction', 'Share']} rows={[['Pull', '41%'], ['Middle', '34%'], ['Opposite field', '25%']]} />)
    case 'outcomes': return <Rows head={['Outcome', 'Count', 'Share of plate appearances']} rows={[['Strikeouts', '118', '21%'], ['Walks', '64', '11%'], ['Home runs', '31', '5%'], ['Balls in play', '352', '63%']]} />
    case 'platoon': return <Rows head={['Against', 'wOBA', 'Chase rate', 'Plate appearances (n)']} rows={[['Left-handed pitching', '.331', '27%', '168'], ['Right-handed pitching', '.372', '24%', '412']]} />
    case 'approach': return <Rows head={['Count', 'Swings in the zone', 'Swings outside', 'League average']} rows={[['First pitch', '61%', '19%', '55%'], ['Ahead in the count', '66%', '22%', '60%'], ['Two strikes', '82%', '34%', '78%']]} />
    case '': return <Rows head={['Measure', 'This season', 'Percentile']} rows={[['Season line', '.285 / .365 / .510', '—'], ['Quality of contact', '90.1 mph', '78th']]} />
    default: return <Mix />
  }
}

export default function LabTabShell({ lab, name }: { lab: 'batting' | 'pitching'; name?: string }) {
  const tab = tabOf(usePathname())
  const who = name ?? 'this player'
  return (
    <div>
      <p style={{ margin: '0 0 14px', padding: '10px 0', borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, fontSize: 14, color: '#3a352c' }}>
        <b>Example only.</b> These are not {who === 'this player' ? 'his' : `${who}'s`} numbers: this is what the feature looks like.
      </p>
      <h3 style={TITLE}>{(LAB_NOUN[lab][tab] ?? 'detail')}</h3>
      <div aria-label="Static example, sample numbers">
        <Mockup lab={lab} tab={tab} />
      </div>
    </div>
  )
}
