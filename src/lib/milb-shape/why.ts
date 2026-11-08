// src/lib/milb-shape/why.ts
//
// "Why aren't the results there?" for a Triple-A or Florida State League pitcher's pitch, from what is stored at that level: his speed and arm angle against the level's pitches
// that move like his (the shape bins), where he throws it (zone, down the middle, chase) against the level, and his results against the contact he allowed. Platoon, extension
// and sequencing need pitch-by-pitch slices that are not stored for the minor leagues, so they are listed as not measured rather than guessed. Rows use the MLB view's WRow so
// the two read the same. Pure; describes what has happened at that level and is not a forecast.

import type { BoardRow } from '@/lib/pitch-shape/results'
import type { Diag } from '@/lib/pitch-shape/diagnostics'
import { EFFECT_NOTICE } from '@/lib/pitch-shape/decompose'
import { ANGLE_NOTICE, CONTACT_NOTICE, SPEED_NOTICE, WHIFF_NOTICE, explainShape } from '@/lib/pitch-shape/explain'
import type { ShapeBin } from '@/lib/pitch-shape/model'
import type { WRow } from '@/lib/pitch-shape/build-why'

const d3 = (v: number) => v.toFixed(3).replace(/^0/, '')
const pc = (v: number) => `${(v * 100).toFixed(0)}%`

export function buildMilbWhy(sel: BoardRow, lc: string, levelLabel: string, bins: ShapeBin[] | null | undefined, diag: Diag | null | undefined, leagueDiag: Diag | null | undefined, verdictGap: number | null) {
  const shapeNow = sel.velo != null && sel.slot != null ? { velo: sel.velo, ivb: sel.ivb, hb: sel.hb, slot: sel.slot } : null
  const ex = bins && shapeNow ? explainShape(bins, shapeNow) : null
  const rows: WRow[] = []
  const unmeasured = (id: string, label: string): WRow => ({ id, label, status: 'unknown', number: '—', sortKey: -9, text: `Not measured at ${levelLabel}: it needs pitch-by-pitch slices that are not stored for the minor leagues.` })
  rows.push(unmeasured('platoon', 'Platoon'))

  // velocity
  const vd = ex?.veloDiff ?? null, speedEff = ex?.whiffEffect.speed ?? null, speedCon = ex?.contactEffect.speed ?? null
  let vStatus: WRow['status'] = 'small', vText = `His speed is close to that of ${levelLabel} ${lc}s with this movement.`
  if (vd != null && Math.abs(vd) >= SPEED_NOTICE && ex) {
    const slow = vd < 0
    const hurts = (speedEff != null && speedEff <= -WHIFF_NOTICE) || (speedCon != null && speedCon >= CONTACT_NOTICE)
    const aids = (speedEff != null && speedEff >= WHIFF_NOTICE) || (speedCon != null && speedCon <= -CONTACT_NOTICE)
    vStatus = slow ? (hurts ? 'explains' : 'note') : aids ? 'helps' : 'small'
    vText = `He throws it ${Math.abs(vd).toFixed(1)} mph ${slow ? 'slower' : 'faster'} than ${levelLabel} ${lc}s with this movement.${ex.atSpeed.whiff != null && ex.all.whiff != null ? ` Those at his speed get ${(ex.atSpeed.whiff * 100).toFixed(1)}% whiffs per swing against ${(ex.all.whiff * 100).toFixed(1)}% at every speed (${ex.atSpeed.swings.toLocaleString()} swings).` : ''}`
  }
  rows.push({ id: 'velo', label: 'Velocity', status: vStatus, number: shapeNow && ex?.typicalVelo != null ? `${shapeNow.velo.toFixed(1)} vs ${ex.typicalVelo.toFixed(1)} mph` : '—', sortKey: vStatus === 'explains' ? 5 : vStatus === 'note' ? 2 : -1, text: vText })

  rows.push(unmeasured('ext', 'Extension'))

  // arm angle
  const sd = ex?.slotDiff ?? null, angEff = ex?.whiffEffect.angle ?? null, angCon = ex?.contactEffect.angle ?? null
  let aStatus: WRow['status'] = 'small', aText = bins === undefined ? 'Checking arm angle…' : `His arm angle is close to that of ${levelLabel} ${lc}s with this movement.`
  if (ex && sd != null && Math.abs(sd) >= ANGLE_NOTICE) {
    const hurts = (angEff != null && angEff <= -WHIFF_NOTICE) || (angCon != null && angCon >= CONTACT_NOTICE), aids = (angEff != null && angEff >= WHIFF_NOTICE) || (angCon != null && angCon <= -CONTACT_NOTICE)
    aStatus = hurts ? 'explains' : aids ? 'helps' : 'small'
    aText = `His arm angle is ${Math.abs(sd).toFixed(0)}° ${sd < 0 ? 'lower' : 'higher'} than ${levelLabel} ${lc}s with this movement.${ex.atAngle.whiff != null && ex.all.whiff != null ? ` At his angle they get ${(ex.atAngle.whiff * 100).toFixed(1)}% whiffs per swing against ${(ex.all.whiff * 100).toFixed(1)}% overall.` : ''}`
  }
  rows.push({ id: 'angle', label: 'Arm angle', status: aStatus, number: shapeNow && ex?.typicalSlot != null ? `${shapeNow.slot.toFixed(0)}° vs ${ex.typicalSlot.toFixed(0)}°` : '—', sortKey: aStatus === 'explains' ? 4 : -1, text: aText })

  // location (command): the rates this level stores. Down the middle and chase are the two a hitter can punish or be fooled by.
  if (diag && leagueDiag && diag.heartPct != null && leagueDiag.heartPct != null) {
    const heart = diag.heartPct - leagueDiag.heartPct, chase = diag.chasePct != null && leagueDiag.chasePct != null ? diag.chasePct - leagueDiag.chasePct : null
    const hurts = heart >= 0.03 || (chase != null && chase <= -0.04), aids = heart <= -0.03 || (chase != null && chase >= 0.04)
    rows.push({ id: 'location', label: 'Location (command)', status: hurts ? 'explains' : aids ? 'helps' : 'small', number: `${diag.zonePct == null ? '—' : pc(diag.zonePct)} zone · ${pc(diag.heartPct)} middle`, sortKey: hurts ? 3 : -1,
      text: `He throws ${pc(diag.heartPct)} of his ${lc}s down the middle against ${pc(leagueDiag.heartPct)} for ${levelLabel} ${lc}s${diag.chasePct != null && leagueDiag.chasePct != null ? `, and hitters chase ${pc(diag.chasePct)} of his outside the zone against ${pc(leagueDiag.chasePct)}` : ''}. This is where the pitch goes, not the exact spot: ${hurts ? 'the share down the middle or the lack of chases points to command' : aids ? 'the location rates point to command helping him' : 'the rates are close to the level’s'}.` })
  } else rows.push({ id: 'location', label: 'Location (command)', status: 'unknown', number: '—', sortKey: -9, text: 'Too few pitches with a recorded location to compare.' })

  rows.push(unmeasured('sequencing', 'Sequencing'))

  // defense and luck
  const w = sel.ownRaw.woba, x = sel.ownRaw.xwoba
  const cg = w != null && x != null && sel.ownRaw.n.pa >= 20 ? w - x : null
  rows.push({ id: 'luck', label: 'Defense and luck', status: cg == null ? 'unknown' : cg >= 0.03 ? 'explains' : cg <= -0.03 ? 'helps' : 'small', number: cg == null ? '—' : `${d3(w as number)} wOBA vs ${d3(x as number)} xwOBA`, sortKey: cg == null ? -9 : cg >= 0.03 ? 3 : -1,
    text: cg == null ? 'Too few plate appearances on this pitch to compare results with contact quality.' : cg >= 0.03 ? 'His results are worse than the contact quality he allowed on this pitch, which can point to defense or luck.' : cg <= -0.03 ? 'His results are better than the contact quality he allowed, which can point to defense or luck helping.' : 'His results match the contact quality he allowed.' })

  const allowedMore = verdictGap == null ? null : -verdictGap   // runs per 100 he allows beyond what pitches shaped like his have at this level
  const hurting = rows.filter(r => r.status === 'explains').sort((a, b) => b.sortKey - a.sortKey)
  const lead = allowedMore == null ? null
    : allowedMore >= EFFECT_NOTICE
      ? (hurting.length ? `He allows ${allowedMore.toFixed(2)} more runs per 100 ${lc}s than ${levelLabel} ${lc}s with this shape. The data points to ${hurting.map(r => r.label.toLowerCase()).join(', ')}.`
        : `He allows ${allowedMore.toFixed(2)} more runs per 100 ${lc}s than ${levelLabel} ${lc}s with this shape, and nothing measured here accounts for it. Platoon, extension and sequencing are not measured at this level.`)
      : allowedMore <= -EFFECT_NOTICE ? `He allows ${Math.abs(allowedMore).toFixed(2)} fewer runs per 100 ${lc}s than ${levelLabel} ${lc}s with this shape.${rows.some(r => r.status === 'helps') ? ` What is helping him: ${rows.filter(r => r.status === 'helps').map(r => r.label.toLowerCase()).join(', ')}.` : ''}`
      : `His ${lc} results are in line with ${levelLabel} ${lc}s with this shape.`
  return { rows, lead, hurting, allowedMore }
}
