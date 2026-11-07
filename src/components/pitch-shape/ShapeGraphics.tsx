'use client'

// src/components/pitch-shape/ShapeGraphics.tsx
//
// Three pitch-shape graphics for X and the admin graphics studio, all drawn from one ShapeGraphicData (src/lib/pitch-shape/graphic-data.ts), so they match the Pitch Shape Lab:
//   vs       his pitch against league pitches shaped like it and the league average
//   why      the factor breakdown: platoon, velocity, extension, arm angle, location, sequencing, defense and luck
//   whatif   what league pitches with the same shape plus his changes (velocity, ride, run, arm angle) have produced, before and after
// Fixed pixel sizes (landscape 1200 x 675, portrait 1080 x 1350), cream paper, Red Hat Display only, the fixed footer and handle. They describe what has happened across the league;
// none is a forecast of how a pitcher would pitch.

import { FOOTER_TEXT, GT, HANDLE, SIZES } from '@/lib/graphics/constants'
import { SANS } from '@/components/team/ui'
import type { ShapeGraphicData } from '@/lib/pitch-shape/graphic-data'
import { MapCanvas } from './ShapeExportCard'

export type GraphicKind = 'vs' | 'why' | 'whatif'
const TONE = { good: '#13694F', bad: '#A8391F', level: '#5b5347' } as const
const STATUS = {
  explains: { word: 'Part of the gap', bg: '#FBE6E1', fg: '#A8391F' }, helps: { word: 'Helping him', bg: '#E3F3EC', fg: '#13694F' },
  small: { word: 'Not the cause', bg: '#F1EEE6', fg: '#5b5347' }, note: { word: 'Worth noting', bg: '#FFF4CC', fg: '#7A5B00' }, unknown: { word: 'No read', bg: '#F1EEE6', fg: '#8a8275' },
} as const

const verdictText = (v: ShapeGraphicData['verdict']) => (v === 'ahead' ? 'Outperforming his shape' : v === 'behind' ? 'Underperforming his shape' : v === 'level' ? 'In line with his shape' : null)
const verdictCol = (v: ShapeGraphicData['verdict']) => (v === 'ahead' ? '#13694F' : v === 'behind' ? '#A8391F' : '#5b5347')
const first = (t: string, n: number) => t.split(/(?<=[.!?])\s+(?=[A-Z])/).slice(0, n).join(' ').trim()

export function graphicTitle(d: ShapeGraphicData, kind: GraphicKind): { main: string; accent: string } {
  const p = d.pitchName.toLowerCase()
  if (kind === 'vs') return { main: `${d.name}’s`, accent: `${p} vs the league` }
  if (kind === 'why') return { main: `Why ${d.name}’s`, accent: `${p} ${d.verdict === 'behind' ? 'trails its shape' : d.verdict === 'ahead' ? 'beats its shape' : 'matches its shape'}` }
  return { main: `What if ${d.name}`, accent: `changed his ${p}?` }
}

export default function ShapeGraphic({ d, kind, size }: { d: ShapeGraphicData; kind: GraphicKind; size: 'landscape' | 'portrait' }) {
  const { w, h } = SIZES[size]
  const portrait = size === 'portrait'
  const mapPx = portrait ? 440 : kind === 'why' ? 300 : 372
  const label: React.CSSProperties = { fontSize: portrait ? 15 : 12, letterSpacing: '.14em', fontWeight: 800, color: GT.muted, textTransform: 'uppercase' }
  const t = graphicTitle(d, kind)
  const p = d.pitchName.toLowerCase()
  const lg = d.leagueWhiff != null ? `${(d.leagueWhiff * 100).toFixed(1)}%` : null
  const whiff = d.lines.find(l => l.id === 'whiff')

  const sub = kind === 'vs'
    ? (whiff ? `${whiff.his} whiffs per swing against ${whiff.shape} for league ${p}s shaped like his${lg ? ` and ${lg} for the average ${p}` : ''}. ${verdictText(d.verdict) ?? ''}.`.replace(/\s+\./, '.') : `${d.name}’s ${p} against the league.`)
    : kind === 'why' ? (d.why?.lead ? first(d.why.lead, 2) : 'The factor breakdown is not available for this pitch yet.')
    : (d.whatIf?.lead ? first(d.whatIf.lead, 2) : 'Choose at least one change to compare.')

  const mapBlock = d.map ? (
    <div style={{ flexShrink: 0 }}>
      <MapCanvas m={{ payload: d.map.payload, span: 'latest', leagueRate: d.map.leagueRate, points: d.map.points, avg: d.map.avg }} px={mapPx} to={kind === 'whatif' && d.whatIf && d.whatIf.changes.some(c => c.label === 'Ride' || c.label === 'Run') ? { hb: d.whatIf.after.hb, ivb: d.whatIf.after.ivb } : null} />
      <div style={{ fontSize: portrait ? 15 : 11, color: GT.muted, marginTop: 5, maxWidth: mapPx, lineHeight: 1.25 }}>League {p}s by movement, orange where hitters miss more than average. Dots are his pitches, the ring his average{kind === 'whatif' ? ', the arrow the change in ride and run' : ''}.</div>
    </div>
  ) : null

  const scoreBlock = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: portrait ? 14 : 8 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: portrait ? 80 : 56, lineHeight: 1, letterSpacing: '-.03em' }}>{d.score ?? '—'}</div>
        <div style={label}>Shape Score</div>
      </div>
      <div>
        {d.shapeWord && <div style={{ fontWeight: 800, fontSize: portrait ? 26 : 20, color: GT.accent }}>{d.shapeWord}</div>}
        {verdictText(d.verdict) && <div style={{ fontWeight: 800, fontSize: portrait ? 21 : 17, color: verdictCol(d.verdict) }}>{verdictText(d.verdict)}</div>}
        {d.small && <div style={{ fontSize: portrait ? 16 : 12, color: '#7A5B00', fontWeight: 700 }}>Small sample · {d.ownPitches.toLocaleString()} pitches</div>}
      </div>
    </div>
  )

  const fs = portrait ? 22 : 17
  const vsBlock = (
    <div>
      {scoreBlock}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: portrait ? '10px 22px' : '4px 20px', fontSize: fs, fontVariantNumeric: 'tabular-nums', alignItems: 'baseline' }}>
        <span style={label}>His {p}</span><span style={{ ...label, textAlign: 'right' }}>Him</span><span style={{ ...label, textAlign: 'right' }}>Same shape</span><span style={{ ...label, textAlign: 'right' }}>League</span>
        {d.lines.map(l => (
          <div key={l.id} style={{ display: 'contents' }}>
            <span style={{ fontWeight: 700 }}>{l.label}</span>
            <b style={{ textAlign: 'right', color: TONE[l.tone] }}>{l.his}</b>
            <span style={{ textAlign: 'right', color: GT.muted }}>{l.shape}</span>
            <span style={{ textAlign: 'right', color: GT.muted }}>{l.league}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: portrait ? 16 : 12, color: GT.muted, marginTop: portrait ? 14 : 8, lineHeight: 1.3 }}>“Same shape” is the league’s {p}s within 1 inch of his average ride and run. For wOBA and xwOBA lower is better for the pitcher. {d.ownSwings.toLocaleString()} swings on his {p}.</div>
    </div>
  )

  const whyRows = (d.why?.rows ?? []).filter(r => r.status !== 'unknown')
  const whyBlock = (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: portrait ? 14 : 8 }}>
        <div style={{ fontWeight: 800, fontSize: portrait ? 64 : 44, lineHeight: 1, letterSpacing: '-.03em' }}>{d.score ?? '—'}</div>
        <div><div style={label}>Shape Score</div>{verdictText(d.verdict) && <div style={{ fontWeight: 800, fontSize: portrait ? 22 : 17, color: verdictCol(d.verdict) }}>{verdictText(d.verdict)}{d.gap != null ? ` · ${d.gap >= 0 ? '+' : '−'}${Math.abs(d.gap).toFixed(2)} runs per 100` : ''}</div>}</div>
      </div>
      {whyRows.length === 0 ? <div style={{ fontSize: fs, color: GT.muted }}>No factor breakdown yet.</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: portrait ? '1fr' : '1fr 1fr', gap: portrait ? 10 : 6 }}>
          {whyRows.map(r => (
            <div key={r.id} style={{ background: STATUS[r.status].bg, borderRadius: 8, padding: portrait ? '10px 16px' : '5px 11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: 800, fontSize: portrait ? 22 : 15, color: STATUS[r.status].fg }}><span>{r.label}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.number}</span></div>
              <div style={{ fontSize: portrait ? 17 : 12.5, color: '#3a352c' }}>{STATUS[r.status].word}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const wi = d.whatIf
  const whatBlock = (
    <div>
      {wi && wi.changes.length > 0 ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: portrait ? 16 : 10 }}>
            {wi.changes.map(c => <span key={c.label} style={{ background: '#FFE4D6', color: '#B83A0E', fontWeight: 800, fontSize: portrait ? 22 : 16, borderRadius: 6, padding: portrait ? '6px 14px' : '3px 10px' }}>{c.label} {c.to >= c.from ? '+' : '−'}{Math.abs(c.to - c.from).toFixed(c.digits)} {c.unit}</span>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: portrait ? '10px 22px' : '4px 20px', fontSize: fs, fontVariantNumeric: 'tabular-nums', alignItems: 'baseline' }}>
            <span style={label}>League {p}s</span><span style={{ ...label, textAlign: 'right' }}>As thrown</span><span style={{ ...label, textAlign: 'right' }}>With changes</span><span style={{ ...label, textAlign: 'right' }}>Change</span>
            {wi.rows.map(r => (
              <div key={r.label} style={{ display: 'contents' }}>
                <span style={{ fontWeight: 700 }}>{r.label}</span>
                <span style={{ textAlign: 'right', color: GT.muted }}>{r.before}</span>
                <b style={{ textAlign: 'right' }}>{r.after}</b>
                <b style={{ textAlign: 'right', color: r.better == null ? GT.muted : r.better ? '#13694F' : '#A8391F' }}>{r.diff}</b>
              </div>
            ))}
          </div>
          <div style={{ fontSize: portrait ? 16 : 12, color: GT.muted, marginTop: portrait ? 14 : 8, lineHeight: 1.3 }}>This is what league {p}s with each shape have produced ({wi.swingsBefore.toLocaleString()} swings as thrown, {wi.swingsAfter.toLocaleString()} with the changes). It is not a forecast of how he would pitch: command, deception and sequencing stay his own.</div>
        </>
      ) : <div style={{ fontSize: fs, color: GT.muted }}>Choose at least one change (velocity, ride, run or arm angle) to compare.</div>}
    </div>
  )

  const body = kind === 'vs' ? vsBlock : kind === 'why' ? whyBlock : whatBlock
  return (
    <div data-graphic-root style={{ width: w, height: h, overflow: 'hidden', boxSizing: 'border-box', background: GT.paper, color: GT.ink, fontFamily: SANS, padding: portrait ? '46px 50px 34px' : '24px 44px 18px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontWeight: 800, fontSize: portrait ? 42 : 30, letterSpacing: '-.02em' }}>x9<span style={{ color: GT.accent }}>Lab</span></span>
        <span style={{ ...label, color: GT.accent }}>Pitch Shape Lab · {d.hand === 'R' ? 'RHP' : 'LHP'} · {d.team} · {d.season}</span>
      </div>
      <div style={{ marginTop: portrait ? 26 : 14, flexShrink: 0 }}>
        <div style={{ fontWeight: 900, fontSize: portrait ? 76 : 44, lineHeight: 1, letterSpacing: '-.035em' }}>{t.main} <span style={{ color: GT.accent }}>{t.accent}</span></div>
        <div style={{ fontSize: portrait ? 29 : 18.5, fontWeight: 500, lineHeight: 1.25, marginTop: portrait ? 16 : 6, maxWidth: portrait ? 940 : 1110 }}>{sub}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: portrait ? 26 : 28, marginTop: portrait ? 22 : 12, alignItems: portrait ? 'center' : 'flex-start' }}>
        {mapBlock}
        <div style={{ flex: 1, minWidth: 0, width: portrait ? '100%' : undefined }}>{body}</div>
      </div>
      <div style={{ flexShrink: 0, borderTop: `2px solid ${GT.ink}`, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
        <span style={{ fontSize: portrait ? 19 : 15, fontWeight: 500 }}>{FOOTER_TEXT}</span>
        <span style={{ fontWeight: 800, fontSize: portrait ? 24 : 19, color: GT.accent, whiteSpace: 'nowrap' }}>{HANDLE}</span>
      </div>
    </div>
  )
}
