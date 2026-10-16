'use client'

import { SANS } from '@/components/team/ui'
import { BODY_TOP, SAFE_W, SPACE, TYPE } from '../../layout'
import { buildEndOf, prog, revealAt } from '../../motion'
import Body from '../../parts/Body'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import { Card } from '../../pitcher/parts'
import { clip, inningLabel, PG_PLAYS_HEADLINE, PG_PLAYS_KICKER } from '../copy'
import type { PostgameReelData } from '../types'

type P = { d: PostgameReelData; localT: number; dur: number }

const ROW_H = 176, CHIP_W = 110

export default function Plays({ d, localT, dur }: P) {
  const be = buildEndOf(dur, 0.6)
  const plays = d.plays
  const bodyH = plays.length * ROW_H + SPACE.m * Math.max(0, plays.length - 1)
  return (
    <>
      <Header kicker={PG_PLAYS_KICKER} headline={PG_PLAYS_HEADLINE} />
      <Body gap={SPACE.m}>
        {plays.map((p, i) => (
          <Card key={i} p={prog(localT, revealAt(i, plays.length, be), 0.3)} style={{ width: SAFE_W, height: ROW_H, padding: '0 28px', display: 'flex', alignItems: 'center', gap: SPACE.l, overflow: 'hidden' }}>
            <div style={{ width: CHIP_W, flex: 'none', textAlign: 'center', fontFamily: SANS, fontWeight: 800, fontSize: TYPE.sub, color: p.scoring ? '#FAF8F3' : '#1A1A1A', background: p.scoring ? '#FF5722' : '#e7e2d8', borderRadius: 999, padding: '8px 0' }}>{inningLabel(p.half, p.inning)}</div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 30, lineHeight: 1.2, height: 72, overflow: 'hidden', color: '#1A1A1A' }}>{clip(p.text, 120)}</div>
              <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: '#8a8275', fontVariantNumeric: 'tabular-nums' }}>{d.away.abbr} {p.away} – {d.home.abbr} {p.home}</div>
            </div>
          </Card>
        ))}
      </Body>
      <Foot after={BODY_TOP + bodyH}>Scoring plays first, then the most decisive at-bats</Foot>
    </>
  )
}
