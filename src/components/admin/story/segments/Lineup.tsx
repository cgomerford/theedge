'use client'

import { SANS } from '@/components/team/ui'
import { fmt3, lineupFooter, lineupKicker, LINEUP_HEADLINE } from '../copy'
import { BODY_TOP, ROW, SAFE_W, SPACE, TYPE } from '../layout'
import { buildEndOf, easeOutCubic, prog, revealAt } from '../motion'
import Body from '../parts/Body'
import Foot from '../parts/Foot'
import Header from '../parts/Header'
import NamePlate from '../parts/NamePlate'
import type { StoryGame } from '../types'

type P = { game: StoryGame; localT: number; dur: number; side: 'away' | 'home' }

const HDR_H = 36, GAP = 6
const COLS = { avg: 130, ops: 130, rbi: 100 }

export default function Lineup({ game, localT, dur, side }: P) {
  const team = side === 'away' ? game.away : game.home
  const rows = game.lineups[side]
  const col = (txt: string, w: number, strong = true) => (
    <div style={{ width: w, textAlign: 'center', fontFamily: strong ? SANS : SANS, fontWeight: strong ? 800 : 400, fontSize: strong ? TYPE.sub : TYPE.foot, color: strong ? '#1A1A1A' : '#8a8275', fontVariantNumeric: 'tabular-nums' }}>{txt}</div>
  )
  const bodyH = HDR_H + rows.length * (ROW.lineup + GAP)
  return (
    <>
      <Header kicker={lineupKicker(team.abbr)} headline={LINEUP_HEADLINE} />
      <Body gap={GAP}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: SPACE.l, height: HDR_H, width: SAFE_W, boxSizing: 'border-box' }}>
          {col('AVG', COLS.avg, false)}{col('OPS', COLS.ops, false)}{col('RBI', COLS.rbi, false)}
        </div>
        {rows.map((r, i) => {
          const e = easeOutCubic(prog(localT, revealAt(i, rows.length, buildEndOf(dur), 0.3, 0.05), 0.3))
          return (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', width: SAFE_W, height: ROW.lineup, boxSizing: 'border-box', background: '#FAF8F3', border: '2px solid #e7e2d8', borderRadius: 28,
              padding: '0 24px 0 20px', opacity: e, transform: `translateX(${(1 - e) * -60}px)`,
            }}>
              <div style={{ width: 52, fontFamily: SANS, fontWeight: 800, fontSize: TYPE.sub, color: '#FF5722' }}>{r.order}</div>
              <NamePlate id={r.id} name={r.name} short={r.short} sub={r.pos} color={team.color} head={56} width={460} flat nameMax={TYPE.body} style={{ padding: '2px 6px 2px 26px' }} />
              <div style={{ width: 950 - 40 - 24 - 52 - 460 - COLS.avg - COLS.ops - COLS.rbi }} />
              {col(fmt3(r.avg), COLS.avg)}{col(fmt3(r.ops), COLS.ops)}{col(r.rbi == null ? '—' : String(Math.round(r.rbi)), COLS.rbi)}
            </div>
          )
        })}
      </Body>
      <Foot after={BODY_TOP + bodyH}>{lineupFooter(game.lineupsConfirmed)}</Foot>
    </>
  )
}
