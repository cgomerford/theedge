'use client'

// src/components/pitch-shape/PitchStatLine.tsx
//
// The full stat line on the pitch that is open: what he threw, how hitters swung, what ended plate appearances on it, and the contact that came back, counted from his per-pitch log
// (pitch-line.ts). ERA is a pitcher stat (innings and runs charged to him), so it is shown beside the line as his season figure for all his pitches, not as a pitch stat; on the pitch the
// equivalents are the slash line, strikeout and walk rates, home runs, wOBA and xwOBA of the plate appearances that ended on it. Description only.

import { C } from '@/components/team/ui'
import { isMilb, LEVEL_LABEL, type Level } from '@/lib/milb-shape/levels'
import { usePitcherLog } from './usePitcherLog'
import { usePitcherLevels } from './usePitcherLevels'
import { limitsFor } from '@/lib/milb-shape/limits'
import { pitchLine } from '@/lib/pitch-shape/pitch-line'

const k: React.CSSProperties = { fontSize: 9.5, letterSpacing: '.12em', fontWeight: 800, color: C.mute, textTransform: 'uppercase' }
const d3 = (v: number | null) => (v == null ? '—' : v.toFixed(3).replace(/^0/, ''))
const pc = (v: number | null, d = 1) => (v == null ? '—' : `${(v * 100).toFixed(d)}%`)
const n1 = (v: number | null, u = '') => (v == null ? '—' : `${v.toFixed(1)}${u}`)
const THIN_PA = 25
const TONES: Record<string, Record<string, string>> = {
  orange: { '--tile-bg': '#FFE9DE', '--tile-hi': '#FFCDB3', '--tile-fg': '#B83A0E' },
  yellow: { '--tile-bg': '#FFF5C4', '--tile-hi': '#FDE98A', '--tile-fg': '#7A5B00' },
  cream: { '--tile-bg': '#F1EEE6', '--tile-hi': '#E4DECF', '--tile-fg': '#5b5347' },
  white: { '--tile-bg': '#FFFFFF', '--tile-hi': '#FFF1EA', '--tile-edge': '1px solid #e7e2d8', '--tile-fg': '#5b5347' },
}

export default function PitchStatLine({ pitcherId, season, level, pitchType, pitchName, era, fip, xera, ip }: {
  pitcherId: number; season: number; level: Level; pitchType: string; pitchName: string
  era: number | null; fip: number | null; xera: number | null; ip: number | null
}) {
  const log = usePitcherLog(pitcherId, season, level)
  const stored = usePitcherLevels(isMilb(level) && log === null ? pitcherId : null)   // a level with no pitch log: the line is built from the numbers stored for the level
  const lc = pitchName.toLowerCase()

  let body: React.ReactNode
  if (log === undefined) body = <div style={{ fontSize: 13, color: C.mute }}>Counting his {lc}s…</div>
  else if (log === null) {
    const rep = stored?.find(x => x.level === level)?.repertoire
    const row = rep?.rows.find(r => r.pitchType === pitchType)
    if (stored === undefined) body = <div style={{ fontSize: 13, color: C.mute }}>Reading his {lc}s at {LEVEL_LABEL[level]}…</div>
    else if (!rep || !row) body = <div style={{ fontSize: 13, color: '#5b5347' }}>{isMilb(level) ? `A pitch-by-pitch log is not kept for ${LEVEL_LABEL[level]}, and no stored line is available for his ${lc}.` : 'His pitch-by-pitch log could not be read right now, so the stat line on the pitch is not shown.'}</div>
    else {
      const total = rep.rows.reduce((s2, r) => s2 + r.nPitches, 0)
      const noMin = !limitsFor(level).gated
      const small = noMin && row.nSwings < 100
      const star = small ? '*' : ''
      const swingMin = noMin ? 1 : 40
      const whiff = row.nSwings >= swingMin ? row.nWhiffs / row.nSwings : null
      const d = row.diag
      const tile = (label: string, v: string, sub?: string, hi = false) => (
        <div key={label} style={{ background: hi ? 'var(--tile-hi, #FFF1EA)' : 'var(--tile-bg, #F1EEE6)', border: 'var(--tile-edge, 0)', borderRadius: 6, padding: '7px 10px', minWidth: 0 }}>
          <div style={k}>{label}</div>
          <b style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{v}</b>
          {sub && <div style={{ fontSize: 10.5, color: C.mute }}>{sub}</div>}
        </div>
      )
      const grid = (children: React.ReactNode) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>{children}</div>
      const head = (h: string, sub?: string) => <div style={{ ...k, color: 'var(--tile-fg, #B83A0E)', margin: '12px 0 5px' }}>{h}{sub ? <span style={{ color: C.mute, fontWeight: 600, letterSpacing: 0, textTransform: 'none' }}> · {sub}</span> : null}</div>
      const group = (h: string, sub: string | undefined, children: React.ReactNode, tone = 'cream', place = '') => <div className={place} style={{ minWidth: 0, ...(TONES[tone] as React.CSSProperties) }}>{head(h, sub)}{grid(children)}</div>
      body = (
        <div className="psl-grid" style={{ display: 'grid', gap: '0 22px', alignItems: 'start' }}><style>{'.psl-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.psl-grid>div{margin-bottom:6px}@media(min-width:1001px){.psl-r{grid-column:1;grid-row:1/span 2}.psl-sw{grid-column:2;grid-row:1}.psl-co{grid-column:2;grid-row:2}.psl-pi{grid-column:3;grid-row:1}.psl-se{grid-column:3;grid-row:2}.psl-a1{grid-column:1}.psl-a2{grid-column:2}.psl-a3{grid-column:3}}@media(max-width:1000px){.psl-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.psl-grid{grid-template-columns:minmax(0,1fr)}}'}</style>
          <p style={{ fontSize: 12.5, color: '#5b5347', margin: '4px 0 0', gridColumn: '1 / -1' }}>{LEVEL_LABEL[level]} keeps no pitch-by-pitch log, so this is the line stored for the level: what he threw, how hitters swung, where, and the contact that came back.</p>
          {group('Swing and miss', `${row.nSwings.toLocaleString()} swings`, <>
            {tile(`Whiffs per swing${star}`, pc(whiff), `${row.nWhiffs.toLocaleString()} misses`, true)}
            {tile('Chase rate', pc(d.chasePct), 'swings outside the zone')}
            {tile('Zone rate', pc(d.zonePct), 'in the strike zone')}
            {tile('Down the middle', pc(d.heartPct), 'heart of the zone')}
          </>, 'yellow', 'psl-a1')}
          {group('Contact against it', `${d.nBbe.toLocaleString()} balls in play`, <>{tile(`xwOBA on contact${star}`, d.nBbe >= (noMin ? 1 : 25) ? d3(d.xwobaCon) : '—', 'lower is better for the pitcher')}</>, 'cream', 'psl-a2')}
          {group('The pitch', `${row.nPitches.toLocaleString()} thrown`, <>
            {tile('Usage', pc(total > 0 ? row.nPitches / total : null), `of his pitches at ${LEVEL_LABEL[level]}`)}
            {tile('Speed', n1(row.velo, ' mph'))}
            {tile('Ride', n1(row.ivb, ' in'))}
            {tile('Run', n1(row.hb, ' in'))}
            {tile('Arm angle', noMin ? 'pending' : `${Math.round(row.slot)}°`)}
          </>, 'cream', 'psl-a3')}
          {small && <div style={{ fontSize: 12, color: '#7A5B00', marginTop: 8, gridColumn: '1 / -1' }}>* A small sample ({row.nSwings.toLocaleString()} swings): results are hard to judge.</div>}
        </div>
      )
    }
  }
  else {
    const l = pitchLine(log.pitches, pitchType, log.pitches.length)
    if (!l) body = <div style={{ fontSize: 13, color: '#5b5347' }}>No {lc}s in his log this season.</div>
    else {
      const thin = l.pa < THIN_PA
      const tile = (label: string, v: string, sub?: string, hi = false) => (
        <div key={label} style={{ background: hi ? 'var(--tile-hi, #FFF1EA)' : 'var(--tile-bg, #F1EEE6)', border: 'var(--tile-edge, 0)', borderRadius: 6, padding: '7px 10px', minWidth: 0 }}>
          <div style={k}>{label}</div>
          <b style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{v}</b>
          {sub && <div style={{ fontSize: 10.5, color: C.mute }}>{sub}</div>}
        </div>
      )
      const grid = (children: React.ReactNode) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>{children}</div>
      const head = (t: string, sub?: string) => <div style={{ ...k, color: '#B83A0E', margin: '12px 0 5px' }}>{t}{sub ? <span style={{ color: C.mute, fontWeight: 600, letterSpacing: 0, textTransform: 'none' }}> · {sub}</span> : null}</div>
      const group = (h: string, sub: string | undefined, children: React.ReactNode, tone = 'cream', place = '') => <div className={place} style={{ minWidth: 0, ...(TONES[tone] as React.CSSProperties) }}>{head(h, sub)}{grid(children)}</div>
      body = (
        <div className="psl-grid" style={{ display: 'grid', gap: '0 22px', alignItems: 'start' }}><style>{'.psl-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.psl-grid>div{margin-bottom:6px}@media(min-width:1001px){.psl-r{grid-column:1;grid-row:1/span 2}.psl-sw{grid-column:2;grid-row:1}.psl-co{grid-column:2;grid-row:2}.psl-pi{grid-column:3;grid-row:1}.psl-se{grid-column:3;grid-row:2}.psl-a1{grid-column:1}.psl-a2{grid-column:2}.psl-a3{grid-column:3}}@media(max-width:1000px){.psl-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.psl-grid{grid-template-columns:minmax(0,1fr)}}'}</style>
          {group('Results on the pitch', `${l.pa.toLocaleString()} plate appearances ended on it${thin ? ', a thin sample' : ''}`, <>
            {tile('Average against', d3(l.avg), `${l.hits} for ${l.ab}`, true)}
            {tile('On-base', d3(l.obp))}
            {tile('Slugging', d3(l.slg))}
            {tile('OPS against', d3(l.ops))}
            {tile('Strikeout rate', pc(l.kPct), `${l.k} strikeouts`)}
            {tile('Walk rate', pc(l.bbPct), `${l.bb} walks`)}
            {tile('Home runs', String(l.hr))}
            {tile('wOBA against', d3(l.woba))}
            {tile('xwOBA against', d3(l.xwoba), 'from contact quality')}
          </>, 'orange', 'psl-r')}
          {group('Swing and miss', `${l.swings.toLocaleString()} swings`, <>
            {tile('Whiffs per swing', pc(l.whiffPct), `${l.whiffs} misses`, true)}
            {tile('Called + swinging strikes', pc(l.cswPct), 'of pitches')}
            {tile('Chase rate', pc(l.chasePct), 'swings outside the zone')}
            {tile('Zone rate', pc(l.zonePct), 'in the strike zone')}
          </>, 'yellow', 'psl-sw')}
          {group('Contact against it', `${l.bbe.toLocaleString()} balls in play`, <>
            {tile('Hard-hit rate', pc(l.hardHitPct), '95+ mph')}
            {tile('Average exit speed', n1(l.avgEv, ' mph'))}
          </>, 'cream', 'psl-co')}
          {group('The pitch', `${l.pitches.toLocaleString()} thrown`, <>
            {tile('Usage', pc(l.usage), 'of all his pitches')}
            {tile('Speed', n1(l.velo, ' mph'))}
            {tile('Spin', l.spin == null ? '—' : `${Math.round(l.spin).toLocaleString()} rpm`)}
            {tile('Ride', n1(l.ivb, ' in'))}
            {tile('Run', n1(l.hb, ' in'))}
            {tile('Extension', l.ext == null ? '—' : `${l.ext.toFixed(2)} ft`)}
          </>, 'cream', 'psl-pi')}
          {era != null || fip != null || xera != null ? group('His season, all pitches', `ERA is a pitcher stat${ip != null ? `, over ${ip.toFixed(0)} innings` : ''}`, <>
            {tile('ERA', era == null ? '—' : era.toFixed(2))}
            {tile('FIP', fip == null ? '—' : fip.toFixed(2))}
            {tile('xERA', xera == null ? '—' : xera.toFixed(2))}
          </>) : null}
        </div>
      )
    }
  }

  return (
    <div>
      {body}
    </div>
  )
}
