'use client'

import { SANS } from '@/components/team/ui'
import { fmt3, lateFoot, LATE_DIFF_CAPTION, LATE_HEADLINE, LATE_KICKER, signed } from '../copy'
import { BODY_TOP, SAFE_W, SPACE, TYPE } from '../layout'
import { easeOutCubic, prog } from '../motion'
import Body from '../parts/Body'
import Foot from '../parts/Foot'
import Header from '../parts/Header'
import TeamTag from '../parts/TeamTag'
import type { LateCard, StoryGame } from '../types'

type P = { game: StoryGame; localT: number; dur: number }

const OPS_H = 188, CAP_H = 36, DIFF_H = 148

const blockHeight = (c: LateCard) => 64 + SPACE.xs + (c.hitting.length ? OPS_H : 0) + (c.innings.length ? SPACE.s + CAP_H + DIFF_H : 0)

export default function Late({ game, localT }: P) {
  const sc = game.scout
  if (!sc) return null
  const blocks: { card: LateCard; color: string }[] = []
  if (sc.late.away) blocks.push({ card: sc.late.away, color: game.away.color })
  if (sc.late.home) blocks.push({ card: sc.late.home, color: game.home.color })
  const bodyH = blocks.reduce((s, b) => s + blockHeight(b.card), 0) + SPACE.l * Math.max(0, blocks.length - 1)
  const games = Math.max(0, ...blocks.map(b => b.card.games))
  const tile = (w: number) => ({ width: w, boxSizing: 'border-box' as const, background: '#FAF8F3', border: '2px solid #e7e2d8', borderRadius: 28, textAlign: 'center' as const })
  return (
    <>
      <Header kicker={LATE_KICKER} headline={LATE_HEADLINE} />
      <Body gap={SPACE.l}>
        {blocks.map(({ card, color }, bi) => {
          const e = easeOutCubic(prog(localT, bi * 0.25, 0.3))
          const wOps = (SAFE_W - SPACE.s * (card.hitting.length - 1)) / Math.max(card.hitting.length, 1)
          const wDiff = (SAFE_W - SPACE.s * (card.innings.length - 1)) / Math.max(card.innings.length, 1)
          return (
            <div key={card.abbr} style={{ width: SAFE_W, opacity: e, transform: `translateY(${(1 - e) * 40}px)` }}>
              <TeamTag abbr={card.abbr} color={color} label={card.oneRun ? `1-run games ${card.oneRun.w}-${card.oneRun.l}` : undefined} />
              {card.hitting.length > 0 && (
                <div style={{ display: 'flex', gap: SPACE.s, marginTop: SPACE.xs }}>
                  {card.hitting.map(h => (
                    <div key={h.label} style={{ ...tile(wOps), height: OPS_H, padding: '14px 10px' }}>
                      <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: '#8a8275', lineHeight: 1.2 }}>{h.label}</div>
                      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.statNum, color: '#1A1A1A', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>{fmt3(h.ops)}</div>
                      <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: '#8a8275', lineHeight: 1.2 }}>OPS · {h.pa} PA</div>
                    </div>
                  ))}
                </div>
              )}
              {card.innings.length > 0 && (
                <>
                  <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.7)', height: CAP_H, lineHeight: `${CAP_H}px`, marginTop: SPACE.s }}>{LATE_DIFF_CAPTION}</div>
                  <div style={{ display: 'flex', gap: SPACE.s }}>
                    {card.innings.map(d => (
                      <div key={d.label} style={{ ...tile(wDiff), height: DIFF_H, padding: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: SPACE.s }}>
                          <span style={{ fontFamily: SANS, fontSize: TYPE.foot, color: '#8a8275' }}>{d.label}</span>
                          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.statNum, color: d.diff > 0 ? '#1D9E75' : d.diff < 0 ? '#D4533B' : '#1A1A1A', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{signed(d.diff)}</span>
                        </div>
                        <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: '#8a8275', lineHeight: 1.2 }}>{d.scored} RS · {d.allowed} RA</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </Body>
      <Foot after={BODY_TOP + bodyH} lines={2}>{lateFoot(games)}</Foot>
    </>
  )
}
