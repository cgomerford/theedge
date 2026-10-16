'use client'

import { SANS } from '@/components/team/ui'
import { ordinal } from '@/lib/ordinal'
import { DEFENSE_HEADLINE, defenseKicker, signed } from '../copy'
import { SPOTS, toPx } from '../diamondGeo'
import { BODY_TOP, SAFE, SAFE_W, TYPE } from '../layout'
import { prog } from '../motion'
import Diamond from '../parts/Diamond'
import FielderTag, { TAG_H, TAG_W } from '../parts/FielderTag'
import Foot from '../parts/Foot'
import Header from '../parts/Header'
import type { Fielder, StoryGame } from '../types'

type P = { game: StoryGame; localT: number; dur: number; side: 'away' | 'home' }

const ORDER = ['CF', 'LF', 'RF', 'SS', '2B', '3B', '1B', 'C']
const OAA_LINE_H = 56
const BOX = 950

export default function Defense({ game, localT, side }: P) {
  const d = game.defense[side]
  if (!d) return null
  const team = d.team
  const byPos = new Map(d.fielders.map(f => [f.position, f]))
  const diamondTop = BODY_TOP + (d.teamOaa != null ? OAA_LINE_H : 0)
  const hasC = !!byPos.get('C')?.name
  return (
    <>
      <Header kicker={defenseKicker(team.abbr)} headline={DEFENSE_HEADLINE} />
      {d.teamOaa != null && (
        <div style={{ position: 'absolute', left: SAFE.left, top: BODY_TOP, width: SAFE_W, height: OAA_LINE_H, display: 'flex', alignItems: 'baseline', gap: 18 }}>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.sub + 8, color: d.teamOaa >= 0 ? '#1D9E75' : '#D4533B', letterSpacing: '-0.02em', lineHeight: 1 }}>{signed(Math.round(d.teamOaa))} OAA</div>
          {d.teamRank != null && <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.75)' }}>team · {ordinal(d.teamRank)} of {d.teamOf}</div>}
        </div>
      )}
      <div style={{ position: 'absolute', left: SAFE.left, top: diamondTop, width: BOX, height: BOX }}>
        <Diamond box={BOX} />
        {ORDER.map((pos, i) => {
          const f = byPos.get(pos) as Fielder
          const c = toPx(SPOTS[pos], BOX)
          return (
            <div key={pos} style={{ position: 'absolute', left: c.x, top: c.y, transform: 'translate(-50%, -50%)', width: TAG_W, height: TAG_H }}>
              <FielderTag playerId={f.playerId} name={f.name} short={f.short} position={pos} oaa={f.oaa} color={team.color} pop={prog(localT, i * 0.07, 0.12)} pill={prog(localT, 0.7 + i * 0.04, 0.15)} />
            </div>
          )
        })}
      </div>
      <Foot after={diamondTop + BOX} lines={hasC ? 3 : 2}>
        {hasC && <div>C: no OAA (catchers aren&apos;t graded)</div>}
        <div>{d.footer}</div>
      </Foot>
    </>
  )
}
