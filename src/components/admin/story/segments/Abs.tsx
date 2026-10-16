'use client'

import { SANS } from '@/components/team/ui'
import { ABS_HEADLINE, ABS_KICKER } from '../copy'
import { countValue } from '../countDir'
import { MAX_ZONE_PTS } from '../scoutReduce'
import { BODY_TOP, COL2, SPACE, TYPE } from '../layout'
import { easeOutCubic, prog } from '../motion'
import Body from '../parts/Body'
import Foot from '../parts/Foot'
import Header from '../parts/Header'
import TeamTag from '../parts/TeamTag'
import type { AbsCard, StoryGame } from '../types'

type P = { game: StoryGame; localT: number; dur: number }

const LINE_H = 44, SPLIT_H = 36, KEY_H = 52
const ZONE_VIEW_W = 40                    // inches: x −20 … 20
const BALL_R = 1.45                       // inches (ball to scale)
const ZONE_W_IN = 17                      // rule-book zone width

function zoneBoxHeight(card: AbsCard): number {
  const h = (card.zoneH || 20) + 12
  return Math.round((COL2 * h) / ZONE_VIEW_W)
}

function cardHeight(card: AbsCard): number {
  return 64 + 120 + 40 + LINE_H * 2 + SPLIT_H + 36 + SPACE.xs * 2 + Math.min(card.top.length, 2) * LINE_H + (card.zone.length ? zoneBoxHeight(card) + SPACE.s : 0) + SPACE.s * 4
}

function Zone({ card, p }: { card: AbsCard; p: number }) {
  const zh = card.zoneH || 20
  const H = zh + 12
  const boxH = zoneBoxHeight(card)
  const n = Math.ceil(card.zone.length * easeOutCubic(p))
  return (
    <svg viewBox={`-20 0 ${ZONE_VIEW_W} ${H}`} preserveAspectRatio="xMidYMid meet" width={COL2} height={boxH} style={{ display: 'block' }}>
      <rect x={-ZONE_W_IN / 2} y={6} width={ZONE_W_IN} height={zh} fill="rgba(250,248,243,.06)" stroke="rgba(250,248,243,.7)" strokeWidth={0.35} />
      {card.zone.slice(0, n).map((pt, i) => {
        const cy = 6 + (1 - pt.z) * zh
        return pt.ov
          ? <circle key={i} cx={pt.x} cy={cy} r={BALL_R} fill="#FF5722" fillOpacity={0.85} />
          : <circle key={i} cx={pt.x} cy={cy} r={BALL_R - 0.2} fill="none" stroke="rgba(250,248,243,.75)" strokeWidth={0.4} />
      })}
    </svg>
  )
}

export default function Abs({ game, localT }: P) {
  const sc = game.scout
  if (!sc) return null
  const cards: { card: AbsCard; color: string }[] = []
  if (sc.abs.away) cards.push({ card: sc.abs.away, color: game.away.color })
  if (sc.abs.home) cards.push({ card: sc.abs.home, color: game.home.color })
  const tallest = Math.max(...cards.map(c => cardHeight(c.card)), 0)
  const regN = cards.reduce((s, c) => s + c.card.regN, 0)
  const postN = cards.reduce((s, c) => s + c.card.postN, 0)
  return (
    <>
      <Header kicker={ABS_KICKER} headline={ABS_HEADLINE} />
      <Body>
        <div style={{ display: 'flex', gap: SPACE.l, alignItems: 'flex-start' }}>
          {cards.map(({ card, color }, i) => {
            const e = easeOutCubic(prog(localT, i * 0.2, 0.3))
            const pct = card.overturnPct == null ? null : Math.round(countValue('count', card.overturnPct, prog(localT, i * 0.2 + 0.1, 0.7)))
            const tot = Math.max(card.split.batter + card.split.catcher + card.split.pitcher, 1)
            const seg = (n: number, bg: string) => ({ width: (n / tot) * (COL2 - 4), height: 28, background: bg })
            return (
              <div key={card.abbr} style={{ width: COL2, opacity: e, transform: `translateY(${(1 - e) * 40}px)` }}>
                <TeamTag abbr={card.abbr} color={color} />
                <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.heroNum, color: '#FF5722', letterSpacing: '-0.03em', lineHeight: 1, height: 120, fontVariantNumeric: 'tabular-nums' }}>{pct == null ? '—' : `${pct}%`}</div>
                <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.7)', height: 40, lineHeight: '40px', whiteSpace: 'nowrap' }}>overturned · {card.overturns} of {card.challenges}</div>
                {card.leagueOverturnPct != null && <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, color: '#FAF8F3', height: LINE_H, lineHeight: `${LINE_H}px` }}>League {card.leagueOverturnPct}%</div>}
                {card.perGame != null && <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, color: '#FAF8F3', height: LINE_H, lineHeight: `${LINE_H}px`, whiteSpace: 'nowrap' }}>{card.perGame.toFixed(2)}/G{card.leaguePerGame != null ? ` (lg ${card.leaguePerGame.toFixed(2)})` : ''}</div>}
                <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', marginTop: SPACE.xs, width: COL2 - 4 }}>
                  <div style={seg(card.split.batter, '#FAF8F3')} /><div style={seg(card.split.catcher, '#FF5722')} /><div style={seg(card.split.pitcher, '#8a8275')} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.s, height: 36, fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.85)', whiteSpace: 'nowrap' }}>
                  {([['Bat', card.split.batter, '#FAF8F3'], ['C', card.split.catcher, '#FF5722'], ['P', card.split.pitcher, '#8a8275']] as const).map(([k, n, c]) => (
                    <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 14, height: 14, borderRadius: 3, background: c, display: 'inline-block' }} />{k} {n}
                    </span>
                  ))}
                </div>
                {card.top.slice(0, 2).map(t => (
                  <div key={t.short} style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, color: '#FAF8F3', height: LINE_H, lineHeight: `${LINE_H}px`, whiteSpace: 'nowrap' }}>{t.short} <span style={{ fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.75)' }}>{t.w}-{t.l}</span></div>
                ))}
                {card.zone.length > 0 && <div style={{ marginTop: SPACE.s }}><Zone card={card} p={prog(localT, i * 0.2 + 0.2, 1.0)} /></div>}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.xl, height: KEY_H, marginTop: SPACE.s }} data-abs-key>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE.s, fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, color: '#FAF8F3', whiteSpace: 'nowrap' }}>
            <svg width={28} height={28} viewBox="0 0 28 28"><circle cx={14} cy={14} r={12} fill="#FF5722" fillOpacity={0.9} /></svg>Overturned
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE.s, fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, color: '#FAF8F3', whiteSpace: 'nowrap' }}>
            <svg width={28} height={28} viewBox="0 0 28 28"><circle cx={14} cy={14} r={11} fill="none" stroke="rgba(250,248,243,.85)" strokeWidth={2.5} /></svg>Upheld
          </span>
          <span style={{ fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.7)', whiteSpace: 'nowrap' }}>latest {MAX_ZONE_PTS} per club</span>
        </div>
      </Body>
      <Foot after={BODY_TOP + tallest + KEY_H + SPACE.s} lines={2}>{`2026 reg. season · ${regN} challenges${postN > 0 ? ` · postseason (${postN}) not counted` : ''} `}</Foot>
    </>
  )
}
