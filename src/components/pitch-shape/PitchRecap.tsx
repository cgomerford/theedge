'use client'

// src/components/pitch-shape/PitchRecap.tsx
//
// The first thing on the Shape tab: a recap of which period (season or month) stood out for each measure, in
// gold, then a prompt to drill into the model and the month log below. Every card shows the sample behind it;
// a measure with fewer than two qualifying periods shows an empty state, not a crown.

import { C, Foot } from '@/components/team/ui'
import type { PitchViewMonth } from '@/lib/pitch-shape/model'
import { GATES, GOLD, METRICS, overallStandout, periodLabel, periodValues, standout } from './monthStats'

export default function PitchRecap({ periods, pitchName, scopeLabel, onDrill }: { periods: PitchViewMonth[]; pitchName: string; scopeLabel: string; onDrill: () => void }) {
  const vals = periods.map(periodValues)
  const lc = pitchName.toLowerCase()
  const overall = overallStandout(vals)
  const oi = overall.index
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="pv-k">Recap · {scopeLabel}</div>
      <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-.01em', margin: '2px 0 10px', color: C.ink }}>Where the {lc} stood out</div>
      {oi != null ? (
        <div style={{ background: GOLD.fill, borderRadius: 12, padding: '12px 14px', marginBottom: 10, color: C.ink }}>
          <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 800, textTransform: 'uppercase' }}>Overall standout</div>
          <div style={{ fontWeight: 800, fontSize: 30, lineHeight: 1.05, margin: '2px 0' }}>{periodLabel(periods[oi])}</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            Standout on {overall.wins[oi].length} of {overall.contested} measures with a real comparison: {overall.wins[oi].map(k => METRICS.find(m => m.key === k)!.title.toLowerCase()).join(', ')}.
          </div>
          <div style={{ fontSize: 11, marginTop: 3, opacity: 0.8 }}>Every measure counts equally; this is a count of gold marks, not a score.</div>
        </div>
      ) : (
        <p className="pv-note" style={{ marginTop: 0 }}>No single period stands out on two or more measures, so there is no overall gold.</p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(168px,1fr))', gap: 10 }}>
        {METRICS.map(m => {
          const { best } = standout(vals, m.key)
          const v = best != null ? vals[best] : null
          return best != null && v ? (
            <div key={m.key} style={{ background: GOLD.soft, border: `1px solid ${GOLD.line}`, borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, letterSpacing: '.12em', fontWeight: 800, color: GOLD.ink, textTransform: 'uppercase' }}>{m.crown}</div>
              <div style={{ fontWeight: 800, fontSize: 26, lineHeight: 1.05, margin: '4px 0 2px', color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{periodLabel(periods[best])}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{m.fmt(v[m.key] as number)}{m.unit}</div>
              <div style={{ fontSize: 10.5, color: GOLD.ink, marginTop: 2 }}>n = {v.n[m.key].toLocaleString()} {m.sample}</div>
            </div>
          ) : (
            <div key={m.key} style={{ background: '#fff', border: `1px dashed ${C.line}`, borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, letterSpacing: '.12em', fontWeight: 800, color: C.mute, textTransform: 'uppercase' }}>{m.title}</div>
              <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.1, margin: '4px 0 2px', color: C.faint }}>—</div>
              <div style={{ fontSize: 10.5, color: C.faint }}>{m.key === 'abs' ? `Needs ${GATES.abs}+ challenges in two periods` : 'Not enough sample to compare'}</div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <button type="button" className="pv-pill on" onClick={onDrill}>Drill down into the data ↓</button>
        <span style={{ fontSize: 12, color: '#5b5347' }}>The 3D model below is interactive: <b>drag to rotate it</b>, choose a month or year, switch camera, or exaggerate the break.</span>
      </div>
      <Foot>Overall standout is the standout {scopeLabel.toLowerCase().includes('year') ? 'season' : 'month'} for each measure (highest, or lowest xwOBA on contact). Weak contact = balls in play Savant classes Weak or Topped, ranked from {GATES.weak}+ balls in play, a lower bar than the other measures, so it is a thinner sample and harder to judge. ABS = challenged calls on this pitch that stood. Descriptions of what already happened.</Foot>
    </div>
  )
}
