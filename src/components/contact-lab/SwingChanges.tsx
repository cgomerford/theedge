'use client'

// src/components/contact-lab/SwingChanges.tsx
//
// Contact Lab § 02 "Swing Changes" (and the Batting Lab Swing tab): did his setup or swing change, and did the results move over the
// same months? Top row = inputs (stance angle, stance width, bat speed, attack angle, each needing 50+ swings in a month); bottom row
// = outcomes (Pull AIR%, barrel rate, squared-up rate, each needing 40+ batted balls); thin months are hatched, not drawn. Dashed line =
// his season mean. The one-line summary compares Apr–May with Jul–Sep per metric with fixed thresholds and says "alongside" or "over the
// same months", never "because". Props are plain data. Sign-up gate only (the page checks it).

import { useId } from 'react'
import { C, Card, Empty, Foot } from '@/components/team/ui'
import {
  EARLY, INPUTS, INPUT_GATE, LATE, MONTHS, MONTH_LABEL, OUTPUTS, OUTPUT_GATE, compare, inputSeries, outputSeries, swingSentence,
  type Compared, type MetricDef, type MonthSeries, type OutcomeMonthRow, type SwingMonthRow,
} from '@/lib/nerve-centre/model'

const fmt = (n: number) => n.toLocaleString('en-US')
const sgn = (v: number, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`

export default function SwingChanges({ swing, contact, season, name }: { swing: SwingMonthRow[]; contact: OutcomeMonthRow[]; season: number; name: string | null }) {
  const ins = inputSeries(swing), outs = outputSeries(contact, swing)
  const haveAny = [...Object.values(ins), ...Object.values(outs)].some(s => s.gate.some(Boolean))
  if (!haveAny) {
    return <Empty>Not enough monthly data for {name ?? 'this hitter'} yet: a chart needs a month with {INPUT_GATE}+ swings or {OUTPUT_GATE}+ batted balls.</Empty>
  }
  const cIn = compare(INPUTS, ins), cOut = compare(OUTPUTS, outs)
  const nLate = LATE.reduce((a, m) => { const i = MONTHS.indexOf(m); return a + (outs.pullAir.gate[i] ? outs.pullAir.ns[i] : 0) }, 0)
  const s = swingSentence(cIn, cOut, nLate)
  return (
    <Card>
      <style>{CSS}</style>
      <div className="sc-rowlabel"><span className="sc-eyebrow">Setup &amp; swing</span><b>Did the swing itself change?</b></div>
      <div className="sc-g4">{cIn.map(d => <Mini key={d.k} def={d} series={ins[d.k]} />)}</div>
      <div className="sc-rowlabel"><span className="sc-eyebrow">Outcomes</span><b>What happened</b></div>
      <div className="sc-g3">{cOut.map(d => <Mini key={d.k} def={d} series={outs[d.k]} />)}</div>
      <p className="sc-callout"><b>{s.lead}</b> {s.text}</p>
      <Foot>
        By month, {season}. Source: Baseball Savant via pybaseball: bat speed, attack angle, squared-up and stance from Savant’s bat-tracking and batting-stance leaderboards (competitive swings); Pull AIR% and barrel rate from the batted-ball record.
        Setup and swing inputs need {INPUT_GATE}+ swings in a month, outcomes {OUTPUT_GATE}+ batted balls (squared-up rate: bat contacts); a thinner month is hatched. Dashed line = his season mean. April–May is compared with July–September (June left out);
        a change smaller than {INPUTS.map(d => `${d.threshold}${d.unit.trim() || ''} ${d.label.toLowerCase()}`).join(', ')}, or {OUTPUTS.map(d => `${d.threshold} points of ${d.label.replace('%', '')}`).join(', ')} is called steady.
        Stance angle is Savant’s measure of how open or closed his feet are to the pitcher (positive = more open, negative = more closed).
      </Foot>
    </Card>
  )
}

function Mini({ def, series }: { def: Compared; series: MonthSeries }) {
  const uid = useId().replace(/:/g, '')
  const shownIdx = series.gate.map((g, i) => (g ? i : -1)).filter(i => i >= 0)
  const lateHl = def.moved ? LATE.map(m => MONTHS.indexOf(m)).filter(i => series.gate[i]) : []
  const W = 240, H = 112, pl = 8, pr = 8, pt = 20, pb = 20
  let body: React.ReactNode
  if (shownIdx.length < 2) {
    body = <div style={{ height: H, display: 'grid', placeItems: 'center', fontSize: 12, color: C.mute, textAlign: 'center', padding: '0 10px' }}>Not enough {def.k === 'sq' || def.k === 'pullAir' || def.k === 'barrel' ? 'batted balls' : 'swings'} in two or more months.</div>
  } else {
    const vals = shownIdx.map(i => series.values[i] as number), lo = Math.min(...vals), hi = Math.max(...vals), pad = Math.max((hi - lo) * 0.35, 0.6), mn = lo - pad, mx = hi + pad
    const X = (i: number) => pl + (i / (MONTHS.length - 1)) * (W - pl - pr), Y = (v: number) => pt + ((mx - v) / (mx - mn)) * (H - pt - pb)
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const path = shownIdx.map((i, k) => `${k ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(series.values[i] as number).toFixed(1)}`).join(' ')
    body = (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${def.label} by month: ${MONTHS.map((m, i) => (series.gate[i] ? `${MONTH_LABEL[i]} ${(series.values[i] as number).toFixed(1)}${def.unit}` : `${MONTH_LABEL[i]} too few`)).join(', ')}`}>
        <defs><pattern id={`h${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill={C.soft} /><line x1="0" y1="0" x2="0" y2="6" stroke={C.line} strokeWidth="2" /></pattern></defs>
        <line x1={pl} x2={W - pr} y1={Y(mean)} y2={Y(mean)} stroke={C.mute} strokeDasharray="3 3" />
        <path d={path} fill="none" stroke={C.ink} strokeWidth={2} />
        {MONTHS.map((m, i) => {
          const g = series.gate[i], v = series.values[i], hl = lateHl.includes(i)
          return (
            <g key={m}>
              {g && v != null ? (
                <>
                  <circle cx={X(i)} cy={Y(v)} r={hl ? 4.5 : 3.2} fill={hl ? C.orange : C.ink}><title>{`${MONTH_LABEL[i]}: ${v.toFixed(1)}${def.unit} (n = ${fmt(series.ns[i])})`}</title></circle>
                  {(i === shownIdx[0] || i === shownIdx[shownIdx.length - 1] || hl) && <text x={X(i)} y={Y(v) - 7} textAnchor="middle" fontSize={10} fill={C.mute}>{v.toFixed(1)}</text>}
                </>
              ) : <rect x={X(i) - 7} y={pt} width={14} height={H - pt - pb} rx={3} fill={`url(#h${uid})`}><title>{`${MONTH_LABEL[i]}: too few (${fmt(series.ns[i])})`}</title></rect>}
              <text x={X(i)} y={H - 4} textAnchor="middle" fontSize={10} fill={C.mute}>{MONTH_LABEL[i]}</text>
            </g>
          )
        })}
      </svg>
    )
  }
  const anyThin = shownIdx.length >= 2 && series.gate.some(g => !g)
  return (
    <div className={`sc-mini${def.moved ? ' hl' : ''}`}>
      <div className="sc-t">{def.label}</div>
      {body}
      <div className="sc-s">
        {def.delta == null ? 'No comparison yet' : def.moved ? <><b style={{ color: C.ink }}>{sgn(def.delta)}{def.unit}</b> {EARLY.length ? 'Apr–May to Jul–Sep' : ''}</> : 'Held steady'}
        {anyThin ? ' · thin month hatched' : ''}
      </div>
    </div>
  )
}

const CSS = `
.sc-rowlabel{display:flex;gap:10px;align-items:baseline;margin:6px 0 10px;flex-wrap:wrap}
.sc-rowlabel b{font-size:16px;font-weight:800}
.sc-eyebrow{font-size:10px;letter-spacing:.14em;font-weight:700;color:${C.orange};text-transform:uppercase}
.sc-g4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.sc-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.sc-mini{border:1px solid ${C.line};border-radius:12px;padding:10px 12px;background:#fff}
.sc-mini.hl{border-color:${C.ink}}
.sc-t{font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:${C.mute}}
.sc-s{font-size:12px;color:${C.mute};margin-top:2px}
.sc-callout{margin:18px 0 0;font-size:15px;color:${C.ink};background:#fffdf3;border:1px solid ${C.line};border-radius:12px;padding:12px 14px}
@media(max-width:900px){.sc-g4{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:620px){.sc-g3{grid-template-columns:minmax(0,1fr)}}
`
