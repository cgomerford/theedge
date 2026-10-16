'use client'

import { SANS } from '@/components/team/ui'
import { BODY_TOP, SAFE_W, SPACE, TYPE } from '../../layout'
import { prog } from '../../motion'
import Body from '../../parts/Body'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import NamePlate from '../../parts/NamePlate'
import { daysBetween, fmtDay, NEXT_HEADLINE, NEXT_KICKER } from '../copy'
import { Card, Chip } from '../parts'
import type { PitcherReelData } from '../types'

type P = { d: PitcherReelData; localT: number; dur: number }

const PLATE_H = 150, CARD_H = 470

export default function Next({ d, localT }: P) {
  const n = d.next
  if (!n) return null
  const rest = daysBetween(d.slateDate, n.date) - 1
  const bodyH = PLATE_H + SPACE.l + CARD_H
  return (
    <>
      <Header kicker={NEXT_KICKER} headline={NEXT_HEADLINE} />
      <Body gap={SPACE.l}>
        <NamePlate id={d.pitcher.id} name={d.pitcher.name} short={d.pitcher.short} sub={`${d.team.abbr} · ${d.line.pitches} pitches last time`} color={d.team.color} head={110} width={SAFE_W} nameMax={56} pop={prog(localT, 0, 0.3)} />
        <Card p={prog(localT, 0.15, 0.4)} style={{ width: SAFE_W, height: CARD_H, padding: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>{n.kind === 'announced' ? <Chip>ANNOUNCED</Chip> : <Chip bg="#e7e2d8" color="#1A1A1A">EARLIEST ON NORMAL REST</Chip>}</div>
          <div>
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 96, lineHeight: 1, letterSpacing: '-0.02em', color: '#1A1A1A' }}>{fmtDay(n.date)}</div>
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 72, lineHeight: 1.1, color: '#FF5722', marginTop: SPACE.m }}>{n.home ? 'vs' : '@'} {n.oppAbbr}</div>
          </div>
          <div style={{ fontFamily: SANS, fontSize: TYPE.label, color: '#8a8275' }}>{rest} {rest === 1 ? 'day' : 'days'} of rest</div>
        </Card>
      </Body>
      <Foot after={BODY_TOP + bodyH} lines={2}>{n.kind === 'announced' ? 'Probable pitcher as listed by MLB' : "Not announced yet · first game after 4 days' rest"}</Foot>
    </>
  )
}
