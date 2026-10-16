'use client'

import { SANS } from '@/components/team/ui'
import { fmt3, TTO_CAPTION, TTO_CAPTION_AVG, TTO_HEADLINE, TTO_KICKER } from '../copy'
import { BODY_TOP, COL2, ROW, SPACE, TYPE } from '../layout'
import { buildEndOf, prog, revealAt } from '../motion'
import Body from '../parts/Body'
import Foot from '../parts/Foot'
import Header from '../parts/Header'
import NamePlate from '../parts/NamePlate'
import StatRow from '../parts/StatRow'
import type { StoryGame } from '../types'

type P = { game: StoryGame; localT: number; dur: number }

const REVIEW = 'Split data under review'
const PLATE_H = 128, CAP_H = 36

export default function SpTto({ game, localT, dur }: P) {
  const { away, home, sp, tto, ttoOk } = game
  const okA = ttoOk.away, okH = ttoOk.home
  const plate = (side: 'away' | 'home', i: number) => {
    const t = side === 'away' ? away : home, s = sp[side]
    const ok = side === 'away' ? okA : okH
    return (
      <div style={{ width: COL2 }}>
        <NamePlate id={s.id} name={s.name} short={s.short} sub={`SP · ${t.abbr}`} color={t.color} head={96} width={COL2} pop={prog(localT, i * 0.08, 0.25)} />
        {!ok && <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.55)', paddingLeft: SPACE.m, marginTop: SPACE.xs }}>{REVIEW}</div>}
      </div>
    )
  }
  const val = (ok: boolean, v: number | null) => (ok ? v : null)
  const avgRows = tto.filter(r => (okA && r.awayAvg != null) || (okH && r.homeAvg != null))
  const pa = (side: 'awayPa' | 'homePa', ok: boolean) => (ok ? tto.map(r => r[side] ?? '—').join(' / ') : null)
  const paBits = [pa('awayPa', okA) && `${away.abbr} ${pa('awayPa', okA)}`, pa('homePa', okH) && `${home.abbr} ${pa('homePa', okH)}`].filter(Boolean)
  let n = 0
  const be = buildEndOf(dur)
  const nRows = tto.length + avgRows.length
  // exact body height: plates (+margin), caption, rows, [caption, rows], plus the 12px gap between children
  const kids = 1 + 1 + tto.length + (avgRows.length ? 1 + avgRows.length : 0)
  const reviewH = !okA || !okH ? SPACE.xs + Math.ceil(TYPE.foot * 1.2) : 0     // "Split data under review" line under a plate
  const bodyH = (PLATE_H + reviewH + SPACE.s) + CAP_H + tto.length * ROW.stat + (avgRows.length ? CAP_H + avgRows.length * ROW.stat : 0) + SPACE.s * (kids - 1)
  return (
    <>
      <Header kicker={TTO_KICKER} headline={TTO_HEADLINE} />
      <Body gap={SPACE.s}>
        <div style={{ display: 'flex', gap: SPACE.l, marginBottom: SPACE.s }}>{plate('away', 0)}{plate('home', 1)}</div>
        <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.7)', paddingLeft: SPACE.xs, height: CAP_H, lineHeight: `${CAP_H}px` }}>{TTO_CAPTION}</div>
        {tto.map(r => (
          <StatRow key={`w${r.label}`} label={r.label} a={val(okA, r.away)} h={val(okH, r.home)} away={fmt3(val(okA, r.away))} home={fmt3(val(okH, r.home))} p={prog(localT, revealAt(n++, nRows, be), 0.25)} />
        ))}
        {avgRows.length > 0 && <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.7)', paddingLeft: SPACE.xs, height: CAP_H, lineHeight: `${CAP_H}px` }}>{TTO_CAPTION_AVG}</div>}
        {avgRows.map(r => (
          <StatRow key={`a${r.label}`} label={r.label} a={val(okA, r.awayAvg)} h={val(okH, r.homeAvg)} away={fmt3(val(okA, r.awayAvg))} home={fmt3(val(okH, r.homeAvg))} p={prog(localT, revealAt(n++, nRows, be), 0.25)} />
        ))}
      </Body>
      <Foot after={BODY_TOP + bodyH}>{`${paBits.length ? `PA by time through · ${paBits.join(' · ')} · ` : ''}${game.spLabel}`}</Foot>
    </>
  )
}
