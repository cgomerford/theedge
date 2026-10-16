'use client'

import { SANS } from '@/components/team/ui'
import { BODY_TOP, SAFE_W, SPACE, TYPE } from '../../layout'
import { buildEndOf, prog, revealAt } from '../../motion'
import Body from '../../parts/Body'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import { Card } from '../../pitcher/parts'
import { inningLabel } from '../../postgame/copy'
import { BR_PAS_HEADLINE, BR_PAS_KICKER } from '../copy'
import type { BatterReelData } from '../types'

type P = { d: BatterReelData; localT: number; dur: number }

const MAX_ROWS = 6, ROW_H = 150, CHIP_W = 110

export default function Pas({ d, localT, dur }: P) {
  const be = buildEndOf(dur, 0.6)
  const pas = d.pas.slice(0, MAX_ROWS)
  const bodyH = pas.length * ROW_H + SPACE.m * Math.max(0, pas.length - 1)
  return (
    <>
      <Header kicker={BR_PAS_KICKER} headline={BR_PAS_HEADLINE} />
      <Body gap={SPACE.m}>
        {pas.map((pa, i) => (
          <Card key={i} p={prog(localT, revealAt(i, pas.length, be), 0.3)} style={{ width: SAFE_W, height: ROW_H, padding: '0 28px', display: 'flex', alignItems: 'center', gap: SPACE.l, overflow: 'hidden' }}>
            <div style={{ width: CHIP_W, flex: 'none', textAlign: 'center', fontFamily: SANS, fontWeight: 800, fontSize: TYPE.sub, color: pa.hit ? '#FAF8F3' : '#1A1A1A', background: pa.hit ? '#FF5722' : '#e7e2d8', borderRadius: 999, padding: '8px 0' }}>{inningLabel(pa.half, pa.inning)}</div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.sub, lineHeight: 1.1, color: pa.hit ? '#FF5722' : '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pa.result}</div>
              <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: '#8a8275', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>vs {pa.pitcher} · {pa.pitches} {pa.pitches === 1 ? 'pitch' : 'pitches'}{pa.count ? ` · ${pa.count}` : ''}</div>
            </div>
          </Card>
        ))}
      </Body>
      <Foot after={BODY_TOP + bodyH}>{d.pas.length > MAX_ROWS ? `First ${MAX_ROWS} of ${d.pas.length} plate appearances` : 'Orange = hit · count shown is the final count'}</Foot>
    </>
  )
}
