// src/lib/pitch-shape/build-why.ts
//
// The "why aren't the results there?" rows for one pitcher's pitch: platoon, velocity, extension, arm angle, location, sequencing, and defense and luck, each with a status, a number and a
// sentence, plus the one-line lead. Plain functions with no React, so the Lab's detail, its X export and the admin graphics all say the same thing. Describes what has happened.

import type { BoardRow } from './results'
import type { DiagnosisResult, WhyResult } from './diagnosis'
import { EFFECT_NOTICE, EXTENSION_NOTICE_FT, SPEED_NOTICE_MPH, ZONE_LABEL, biggestZoneShift, verdictOf, type Factor } from './decompose'
import { explainShape } from './explain'
import type { ShapeBin } from './model'

export type Status = 'explains' | 'helps' | 'small' | 'note' | 'unknown'
export type WRow = { id: string; label: string; status: Status; number: string; text: string; sortKey: number }
const d3 = (v: number) => v.toFixed(3).replace(/^0/, '')

/** The factor rows and the one-line lead for a pitcher's pitch, shared by the detail table and the X export. `why` must be a loaded breakdown. */
export function buildWhy(sel: BoardRow, lc: string, why: Extract<WhyResult, { hisPitches: number }>, bins: ShapeBin[] | null | undefined, diagnosis: DiagnosisResult | 'locked' | undefined) {
  const shapeNow = sel.velo != null && sel.slot != null ? { velo: sel.velo, ivb: sel.ivb, hb: sel.hb, slot: sel.slot } : null
  const ex = bins && shapeNow ? explainShape(bins, shapeNow) : null
  const f = (id: Factor['id']) => why.factors.find(x => x.id === id) as Factor
  const platoon = f('platoon'), location = f('location'), sequencing = f('sequencing')
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`
  const eff = (v: number | null) => (v == null ? '' : Math.abs(v) < 0.005 ? '0.00 runs per 100' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} runs per 100`)
  const mixStatus = (e: number | null): Status => { const v = verdictOf(e); return v == null ? 'unknown' : v }

  const rows: WRow[] = []
  // platoon
  const lh = platoon.slices.find(x => x.key === 'L')
  rows.push({ id: 'platoon', label: 'Platoon', status: mixStatus(platoon.effect), number: eff(platoon.effect), sortKey: platoon.effect ?? -9,
    text: lh ? `He throws ${pct(lh.his)} of his ${lc}s to left-handed batters; league ${lc}s with this shape go ${pct(lh.league)} to them. Priced at what the league got from each side for this shape, his mix ${platoon.effect != null && platoon.effect >= EFFECT_NOTICE ? 'costs' : platoon.effect != null && platoon.effect <= -EFFECT_NOTICE ? 'saves' : 'changes almost nothing'}.` : 'No platoon read.' })
  // velocity
  const vd = why.velocity.diff
  const speedEff = ex?.whiffEffect.speed ?? null, speedCon = ex?.contactEffect.speed ?? null
  let vStatus: Status = 'small', vText = 'His speed is close to the league’s for this shape.'
  if (vd != null && Math.abs(vd) >= SPEED_NOTICE_MPH) {
    const slow = vd < 0
    const hurts = (speedEff != null && speedEff <= -0.03) || (speedCon != null && speedCon >= 0.015)
    const aids = (speedEff != null && speedEff >= 0.03) || (speedCon != null && speedCon <= -0.015)
    vStatus = slow ? (hurts ? 'explains' : 'note') : aids ? 'helps' : 'small'
    vText = `He throws it ${Math.abs(vd).toFixed(1)} mph ${slow ? 'slower' : 'faster'} than league ${lc}s with this movement.${ex && (speedEff != null || speedCon != null) ? ` League ${lc}s with this movement at his speed get ${ex.atSpeed.whiff == null ? '—' : `${(ex.atSpeed.whiff * 100).toFixed(1)}%`} whiffs per swing against ${ex.all.whiff == null ? '—' : `${(ex.all.whiff * 100).toFixed(1)}%`} at every speed${speedCon != null && ex.atSpeed.xwobaCon != null && ex.all.xwobaCon != null ? `, and ${d3(ex.atSpeed.xwobaCon)} xwOBA on contact against ${d3(ex.all.xwobaCon)}` : ''}.` : ''}`
  }
  rows.push({ id: 'velo', label: 'Velocity', status: vStatus, number: why.velocity.his != null && why.velocity.league != null ? `${why.velocity.his.toFixed(1)} vs ${why.velocity.league.toFixed(1)} mph` : '—', sortKey: vStatus === 'explains' ? 5 : vStatus === 'note' ? 1 : -1, text: vText })
  // extension
  const ed = why.extension.diff
  let eStatus: Status = 'small', eText = 'His extension is close to the league’s for this shape.'
  if (ed != null && Math.abs(ed) >= EXTENSION_NOTICE_FT) eStatus = ed < 0 ? 'note' : 'helps', eText = `He releases it ${Math.abs(ed).toFixed(2)} ft ${ed < 0 ? 'shorter' : 'longer'} than league ${lc}s with this movement. ${ed < 0 ? 'A shorter reach releases the ball farther from the plate, which tends to make a pitch play slower than its radar speed.' : 'A longer reach releases the ball closer to the plate, which tends to make a pitch play faster than its radar speed.'}`
  rows.push({ id: 'ext', label: 'Extension', status: eStatus, number: why.extension.his != null && why.extension.league != null ? `${why.extension.his.toFixed(2)} vs ${why.extension.league.toFixed(2)} ft` : '—', sortKey: eStatus === 'note' ? 1 : -1, text: eText })
  // arm angle
  const sd = ex?.slotDiff ?? null, angEff = ex?.whiffEffect.angle ?? null, angCon = ex?.contactEffect.angle ?? null
  let aStatus: Status = 'small', aText = bins === undefined ? 'Checking arm angle…' : 'His arm angle is close to the league’s for this shape.'
  if (ex && sd != null && Math.abs(sd) >= 8) {
    const hurts = (angEff != null && angEff <= -0.03) || (angCon != null && angCon >= 0.015), aids = (angEff != null && angEff >= 0.03) || (angCon != null && angCon <= -0.015)
    aStatus = hurts ? 'explains' : aids ? 'helps' : 'small'
    aText = `His arm angle is ${Math.abs(sd).toFixed(0)}° ${sd < 0 ? 'lower' : 'higher'} than league ${lc}s with this movement. At his angle they get ${ex.atAngle.whiff == null ? '—' : `${(ex.atAngle.whiff * 100).toFixed(1)}%`} whiffs per swing against ${ex.all.whiff == null ? '—' : `${(ex.all.whiff * 100).toFixed(1)}%`} at every angle.`
  }
  rows.push({ id: 'angle', label: 'Arm angle', status: aStatus, number: shapeNow && ex?.typicalSlot != null ? `${shapeNow.slot.toFixed(0)}° vs ${ex.typicalSlot.toFixed(0)}°` : '—', sortKey: aStatus === 'explains' ? 4 : -1, text: aText })
  // location (command)
  const zs = biggestZoneShift(location)
  const outHis = location.slices.filter(x => Number(x.key) >= 11).reduce((a, x) => a + x.his, 0), outLg = location.slices.filter(x => Number(x.key) >= 11).reduce((a, x) => a + x.league, 0)
  rows.push({ id: 'location', label: 'Location (command)', status: mixStatus(location.effect), number: eff(location.effect), sortKey: location.effect ?? -9,
    text: `${zs && zs.his - zs.league >= 0.01 ? `He throws ${pct(zs.his)} of his ${lc}s to the ${ZONE_LABEL[zs.key].toLowerCase()} square against ${pct(zs.league)} for league ${lc}s with this shape. ` : ''}${pct(outHis)} are outside the zone against ${pct(outLg)}. Priced at the league’s results for this shape in each square, where he puts it ${location.effect != null && location.effect >= EFFECT_NOTICE ? 'costs him' : location.effect != null && location.effect <= -EFFECT_NOTICE ? 'helps him' : 'changes almost nothing'}.` })
  // sequencing
  const ah = sequencing.slices.find(x => x.key === 'ahead'), bh = sequencing.slices.find(x => x.key === 'behind')
  const proc = diagnosis && diagnosis !== 'locked' && diagnosis !== null && !('needsSql' in diagnosis) ? diagnosis.process.filter(p => p.hurts && (p.id === 'repeat' || p.id === 'aheadFb')) : []
  rows.push({ id: 'sequencing', label: 'Sequencing', status: mixStatus(sequencing.effect), number: eff(sequencing.effect), sortKey: sequencing.effect ?? -9,
    text: `${ah && bh ? `He throws it ahead in the count ${pct(ah.his)} of the time and behind ${pct(bh.his)}; league ${lc}s with this shape ${pct(ah.league)} and ${pct(bh.league)}. ` : ''}Priced at the league’s results by count for this shape, his counts ${sequencing.effect != null && sequencing.effect >= EFFECT_NOTICE ? 'cost him' : sequencing.effect != null && sequencing.effect <= -EFFECT_NOTICE ? 'help him' : 'change almost nothing'}.${proc.length ? ` Across his whole arsenal: ${proc.map(p => p.text).join(' ')}` : ''}` })
  // defense and luck
  const w = sel.ownRaw.woba, x = sel.ownRaw.xwoba
  const cg = w != null && x != null && sel.ownRaw.n.pa >= 20 ? w - x : null
  rows.push({ id: 'luck', label: 'Defense and luck', status: cg == null ? 'unknown' : cg >= 0.03 ? 'explains' : cg <= -0.03 ? 'helps' : 'small', number: cg == null ? '—' : `${w != null ? d3(w) : ''} wOBA vs ${x != null ? d3(x) : ''} xwOBA`, sortKey: cg == null ? -9 : cg >= 0.03 ? 2 : -1,
    text: cg == null ? 'Too few plate appearances on this pitch to compare results with contact quality.' : cg >= 0.03 ? 'His results are worse than the contact quality he allowed on this pitch, which can point to defense or luck.' : cg <= -0.03 ? 'His results are better than the contact quality he allowed on this pitch, so defense or luck may be helping.' : 'His results match the contact quality he allowed on this pitch.' })

  const gap = why.gap
  const hurting = rows.filter(r => r.status === 'explains').sort((a, b) => b.sortKey - a.sortKey)
  const lead = gap == null ? null
    : gap >= EFFECT_NOTICE
      ? (hurting.length ? `He allows ${gap.toFixed(2)} more runs per 100 ${lc}s than league ${lc}s with this shape. The data points to ${hurting.map(r => `${r.label.toLowerCase()}${r.number && r.id !== 'velo' && r.id !== 'angle' ? ` (${r.number})` : ''}`).join(', ')}.`
        : `He allows ${gap.toFixed(2)} more runs per 100 ${lc}s than league ${lc}s with this shape, and none of platoon, speed, extension, arm angle, location or sequencing accounts for it. What is left is execution inside those slices (command inside the zone, deception), defense and luck.`)
      : gap <= -EFFECT_NOTICE ? `He allows ${Math.abs(gap).toFixed(2)} fewer runs per 100 ${lc}s than league ${lc}s with this shape. ${rows.filter(r => r.status === 'helps').length ? `What is helping him: ${rows.filter(r => r.status === 'helps').map(r => r.label.toLowerCase()).join(', ')}.` : 'None of the factors below explains it, so it sits in execution, deception, defense and luck.'}`
      : `His ${lc} results are in line with league ${lc}s with this shape (${gap >= 0 ? '+' : '−'}${Math.abs(gap).toFixed(2)} runs per 100).`
  return { rows, lead, hurting, gap, location, ex, shapeNow }
}
