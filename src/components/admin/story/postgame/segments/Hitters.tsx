'use client'

import { SANS } from '@/components/team/ui'
import { BODY_TOP, SAFE_W, SPACE, TYPE } from '../../layout'
import { buildEndOf, prog, revealAt } from '../../motion'
import Body from '../../parts/Body'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import NamePlate from '../../parts/NamePlate'
import { PG_HITTERS_HEADLINE, PG_HITTERS_KICKER } from '../copy'
import type { PgSide, PostgameReelData } from '../types'

type P = { d: PostgameReelData; localT: number; dur: number }

const PLATE_H = 118

export default function Hitters({ d, localT, dur }: P) {
  const be = buildEndOf(dur, 0.6)
  const rows = d.hitters
  const sides: PgSide[] = (['away', 'home'] as const).filter(s => rows.some(r => r.side === s))
  const bodyH = rows.length * PLATE_H + SPACE.m * Math.max(0, rows.length - 1) + (sides.length - 1) * SPACE.xl
  let idx = -1
  return (
    <>
      <Header kicker={PG_HITTERS_KICKER} headline={PG_HITTERS_HEADLINE} />
      <Body gap={SPACE.m}>
        {sides.map((s, si) => (
          <div key={s} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.m, marginTop: si ? SPACE.xl - SPACE.m : 0 }}>
            {rows.filter(r => r.side === s).map(r => {
              idx += 1
              const t = s === 'away' ? d.away : d.home
              return (
                <div key={r.id} style={{ position: 'relative', width: SAFE_W, height: PLATE_H }}>
                  <NamePlate id={r.id} name={r.name} sub={`${r.pos} · ${t.abbr} · ${r.extras || r.line}`} color={t.color} head={80} width={SAFE_W - 250} nameMax={44} pop={prog(localT, revealAt(idx, rows.length, be), 0.3)} />
                  <div style={{ position: 'absolute', right: 0, top: 0, height: PLATE_H, width: 230, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontFamily: SANS, fontWeight: 800, fontSize: TYPE.sub, color: '#FF5722', whiteSpace: 'nowrap', opacity: prog(localT, revealAt(idx, rows.length, be), 0.3) }}>{r.line}</div>
                </div>
              )
            })}
          </div>
        ))}
      </Body>
      <Foot after={BODY_TOP + bodyH}>Best bats of each club by hits, homers, RBI and runs</Foot>
    </>
  )
}
