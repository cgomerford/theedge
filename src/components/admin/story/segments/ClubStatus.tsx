'use client'

import { SANS } from '@/components/team/ui'
import { CLUB_FOOT, CLUB_HEADLINE, CLUB_KICKER } from '../copy'
import { BODY_TOP, ROW, SAFE_W, SPACE, TYPE } from '../layout'
import { easeOutCubic, prog } from '../motion'
import Body from '../parts/Body'
import Foot from '../parts/Foot'
import Header from '../parts/Header'
import TeamTag from '../parts/TeamTag'
import type { ClubCard, ClubLine, StoryGame } from '../types'

type P = { game: StoryGame; localT: number; dur: number }

const OUT_MAX = 5, Q_MAX = 3

function Line({ l, dot }: { l: ClubLine; dot: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: ROW.list, width: SAFE_W }}>
      <div style={{ width: 16, height: 16, borderRadius: 8, background: dot, flex: 'none' }} />
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.body, color: '#FAF8F3', flex: 'none' }}>{l.short}</div>
      <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.7)', whiteSpace: 'nowrap' }}>{l.pos}{l.reason ? ` · ${l.reason}` : ''}</div>
    </div>
  )
}

export default function ClubStatus({ game, localT }: P) {
  const sc = game.scout
  if (!sc) return null
  const blocks: { card: ClubCard; color: string }[] = []
  if (sc.club.away) blocks.push({ card: sc.club.away, color: game.away.color })
  if (sc.club.home) blocks.push({ card: sc.club.home, color: game.home.color })
  const more = (n: number) => (n > 0 ? <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.7)', paddingLeft: 30, height: 36 }}>+{n} more</div> : null)
  const heightOf = ({ card }: { card: ClubCard }) => {
    const o = Math.min(card.out.length, OUT_MAX), q = Math.min(card.questionable.length, Q_MAX)
    return 64 + (o + q) * ROW.list + (card.out.length + card.outMore > o ? 36 : 0) + (card.questionable.length + card.questionableMore > q ? 36 : 0) + (card.moves[0] ? 40 : 0)
  }
  const bodyH = blocks.reduce((s, b) => s + heightOf(b), 0) + SPACE.l * Math.max(0, blocks.length - 1)
  return (
    <>
      <Header kicker={CLUB_KICKER} headline={CLUB_HEADLINE} />
      <Body gap={SPACE.l}>
        {blocks.map(({ card, color }, bi) => {
          const e = easeOutCubic(prog(localT, bi * 0.3, 0.3))
          const outShown = card.out.slice(0, OUT_MAX), qShown = card.questionable.slice(0, Q_MAX)
          return (
            <div key={card.abbr} style={{ width: SAFE_W, opacity: e, transform: `translateY(${(1 - e) * 40}px)` }}>
              <TeamTag abbr={card.abbr} color={color} label={`${card.out.length + card.outMore} out`} />
              {outShown.map(l => <Line key={l.short} l={l} dot="#D4533B" />)}
              {more(card.out.length - outShown.length + card.outMore)}
              {qShown.map(l => <Line key={l.short} l={l} dot="#FDE047" />)}
              {more(card.questionable.length - qShown.length + card.questionableMore)}
              {card.moves[0] && <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.85)', marginTop: SPACE.xs, height: 32 }}>{card.moves[0]}</div>}
            </div>
          )
        })}
      </Body>
      <Foot after={BODY_TOP + bodyH}>{CLUB_FOOT}</Foot>
    </>
  )
}
