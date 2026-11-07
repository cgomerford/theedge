'use client'

// src/components/pitch-shape/ShapeCard.tsx
//
// The article "Pitch shape card", in the Pitch Shape Lab's current look: the league movement map with his pitches on it, his Shape Score, his line against league pitches shaped like his
// and the league average, and the first reasons the data points to. It takes the same ShapeGraphicData as the admin graphics (src/lib/pitch-shape/graphic-data.ts), so the numbers match the
// Lab page and those graphics. Inserted into articles as a picture by the chart picker, so it has plain data and no controls. Descriptions of what happened, not a forecast.

import { C, SANS } from '@/components/team/ui'
import type { ShapeGraphicData } from '@/lib/pitch-shape/graphic-data'
import { MapCanvas } from './ShapeExportCard'

export type ShapeCardData = ShapeGraphicData

const TONE = { good: '#13694F', bad: '#A8391F', level: '#5b5347' } as const
const STATUS = {
  explains: { word: 'Part of the gap', bg: '#FBE6E1', fg: '#A8391F' }, helps: { word: 'Helping him', bg: '#E3F3EC', fg: '#13694F' },
  small: { word: 'Not the cause', bg: '#F1EEE6', fg: '#5b5347' }, note: { word: 'Worth noting', bg: '#FFF4CC', fg: '#7A5B00' }, unknown: { word: 'No read', bg: '#F1EEE6', fg: '#8a8275' },
} as const
const k: React.CSSProperties = { fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.mute, textTransform: 'uppercase' }

export default function ShapeCard({ d }: { d: ShapeCardData }) {
  if (!d.map) return <div style={{ padding: 30, textAlign: 'center', fontSize: 13, color: C.mute }}>The league map isn’t built for this pitch yet.</div>
  const lc = d.pitchName.toLowerCase()
  const verdict = d.verdict === 'ahead' ? 'Outperforming his shape' : d.verdict === 'behind' ? 'Underperforming his shape' : d.verdict === 'level' ? 'In line with his shape' : null
  const vcol = d.verdict === 'ahead' ? '#13694F' : d.verdict === 'behind' ? '#A8391F' : '#5b5347'
  const whiff = d.lines.find(l => l.id === 'whiff')
  // behind his shape: what accounts for the gap; ahead: what is helping him; otherwise anything worth noting
  const reasons = (d.why?.rows ?? []).filter(r => (d.verdict === 'behind' ? r.status === 'explains' || r.status === 'note' : d.verdict === 'ahead' ? r.status === 'helps' : r.status === 'explains' || r.status === 'note' || r.status === 'helps')).slice(0, 3)
  return (
    <div style={{ fontFamily: SANS }}>
      <div style={{ borderBottom: `1px solid ${C.ink}`, paddingBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.orange, textTransform: 'uppercase' }}>Pitch Shape Lab · {d.hand === 'R' ? 'RHP' : 'LHP'} · {d.team}</div>
          <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-.01em' }}>{d.name} · {d.pitchName} · {d.season}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 34, lineHeight: 1, letterSpacing: '-.02em' }}>{d.score ?? '—'}</div>
          <div style={k}>Shape Score</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {d.shapeWord && <span style={{ background: '#FFE4D6', color: '#B83A0E', fontWeight: 800, fontSize: 11.5, borderRadius: 3, padding: '2px 8px' }}>{d.shapeWord}</span>}
        {verdict && <span style={{ background: d.verdict === 'ahead' ? '#E3F3EC' : d.verdict === 'behind' ? '#FBE6E1' : '#F1EEE6', color: vcol, fontWeight: 800, fontSize: 11.5, borderRadius: 3, padding: '2px 8px' }}>{verdict}{d.gap != null ? ` · ${d.gap >= 0 ? '+' : '−'}${Math.abs(d.gap).toFixed(2)} runs per 100` : ''}</span>}
        {d.small && <span style={{ background: '#FFF4CC', color: '#7A5B00', fontWeight: 800, fontSize: 11.5, borderRadius: 3, padding: '2px 8px' }}>Small sample · {d.ownPitches.toLocaleString()} pitches</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.15fr)', gap: 16, marginTop: 10, alignItems: 'start' }}>
        <div>
          <MapCanvas m={{ payload: d.map.payload, span: 'latest', leagueRate: d.map.leagueRate, points: d.map.points, avg: d.map.avg }} px={250} />
          <div style={{ fontSize: 9.5, color: C.mute, marginTop: 4, lineHeight: 1.3 }}>League {lc}s by movement, orange where hitters miss more than average. Dots are his pitches, the ring his average: {d.shape.ivb.toFixed(1)} in of ride, {d.shape.hb.toFixed(1)} in of run{d.shape.velo ? `, ${d.shape.velo.toFixed(1)} mph` : ''}.</div>
        </div>
        <div>
          {whiff && <p style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.4, color: '#3a352c' }}><b style={{ color: C.ink }}>{whiff.his}</b> of swings miss his {lc}, against {whiff.shape} for league {lc}s shaped like his{d.leagueWhiff != null ? ` and ${(d.leagueWhiff * 100).toFixed(1)}% for the average ${lc}` : ''}.</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto auto', gap: '4px 12px', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', alignItems: 'baseline' }}>
            <span /><span style={{ ...k, textAlign: 'right' }}>Him</span><span style={{ ...k, textAlign: 'right' }}>Same shape</span><span style={{ ...k, textAlign: 'right' }}>League</span>
            {d.lines.map(l => (
              <div key={l.id} style={{ display: 'contents' }}>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{l.label.replace(' per 100', '/100').replace(' against', '').replace(' per swing', '/swing')}</span><b style={{ textAlign: 'right', color: TONE[l.tone] }}>{l.his}</b><span style={{ textAlign: 'right', color: C.mute }}>{l.shape}</span><span style={{ textAlign: 'right', color: C.mute }}>{l.league}</span>
              </div>
            ))}
          </div>
          {reasons.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ ...k, marginBottom: 4 }}>What the data points to</div>
              <div style={{ display: 'grid', gap: 4 }}>
                {reasons.map(r => <div key={r.id} style={{ background: STATUS[r.status].bg, borderRadius: 6, padding: '4px 9px', display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}><b style={{ color: STATUS[r.status].fg }}>{r.label} · {STATUS[r.status].word}</b><span style={{ fontVariantNumeric: 'tabular-nums', color: '#3a352c' }}>{r.number}</span></div>)}
              </div>
            </div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 9.5, color: '#8A8275', marginTop: 10, lineHeight: 1.4 }}>
        “Same shape” is every league {lc} thrown {d.hand === 'R' ? 'right' : 'left'}-handed within 1 in of his average ride and run, {d.season}. For wOBA and xwOBA lower is better for the pitcher. {d.ownSwings.toLocaleString()} swings on his {lc}. Describes what has happened, not a forecast. Source: Baseball Savant.
      </div>
    </div>
  )
}
