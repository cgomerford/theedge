'use client'

import { SANS } from '@/components/team/ui'
import { BODY_TOP, SAFE_W, SPACE, TYPE } from '../../layout'
import { buildEndOf, prog, revealAt } from '../../motion'
import Body from '../../parts/Body'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import { avg3, TTO_HEADLINE, TTO_KICKER } from '../copy'
import { Card } from '../parts'
import type { PitcherReelData } from '../types'

type P = { d: PitcherReelData; localT: number; dur: number }

const CARD_H = 270

export default function Tto({ d, localT, dur }: P) {
  const be = buildEndOf(dur)
  const rows = d.tto
  const bodyH = rows.length * CARD_H + SPACE.l * (rows.length - 1)
  const stat = (label: string, value: string, hot = false) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.statNum, lineHeight: 1, color: hot ? '#FF5722' : '#1A1A1A', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: '#8a8275', marginTop: 4 }}>{label}</div>
    </div>
  )
  return (
    <>
      <Header kicker={TTO_KICKER} headline={TTO_HEADLINE} />
      <Body gap={SPACE.l}>
        {rows.map((r, i) => {
          const better = r.avg != null && r.seasonAvg != null ? r.avg < r.seasonAvg : null
          return (
            <Card key={r.label} p={prog(localT, revealAt(i, rows.length, be), 0.25)} style={{ width: SAFE_W, height: CARD_H, padding: '24px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 56, letterSpacing: '-0.02em', color: '#1A1A1A' }}>{r.label}</span>
                <span style={{ fontFamily: SANS, fontSize: TYPE.label, color: '#8a8275' }}>{r.pa} PA · {r.h}-for-{r.ab}</span>
              </div>
              <div style={{ display: 'flex', gap: SPACE.l }}>
                {stat('AVG against', avg3(r.avg), better === true)}
                {stat('K', String(r.k))}
                {stat('BB', String(r.bb))}
                {stat('season AVG', avg3(r.seasonAvg))}
              </div>
            </Card>
          )
        })}
      </Body>
      <Foot after={BODY_TOP + bodyH} lines={2}>Time N = a batter&apos;s Nth plate appearance against him this game · orange = held below his season AVG</Foot>
    </>
  )
}
