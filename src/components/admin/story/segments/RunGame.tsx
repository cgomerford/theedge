'use client'

import { SANS } from '@/components/team/ui'
import { fmtShortDate, RUN_HEADLINE, RUN_KICKER, runFoot } from '../copy'
import { ordinal } from '@/lib/ordinal'
import { BODY_TOP, SAFE_W, SPACE, TYPE } from '../layout'
import { easeOutCubic, prog } from '../motion'
import Body from '../parts/Body'
import Foot from '../parts/Foot'
import Header from '../parts/Header'
import NamePlate from '../parts/NamePlate'
import { signed } from '../copy'
import type { PctBar, RunCard, StoryGame } from '../types'

type P = { game: StoryGame; localT: number; dur: number }

const PLATE_H = 116, BAR_H = 64
const LABEL_W = 250, TRACK_W = 380, VAL_W = SAFE_W - LABEL_W - TRACK_W

function barColor(pct: number) { return pct >= 70 ? '#1D9E75' : pct <= 30 ? '#D4533B' : '#FAF8F3' }

function Bar({ label, bar, fmt, p }: { label: string; bar: PctBar; fmt: (v: number) => string; p: number }) {
  const e = easeOutCubic(p)
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: BAR_H, width: SAFE_W, opacity: e }}>
      <div style={{ width: LABEL_W, fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, color: '#FAF8F3', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ width: TRACK_W, height: 34, borderRadius: 10, background: 'rgba(250,248,243,.12)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: Math.max(14, (bar.pct / 100) * TRACK_W), borderRadius: 10, background: barColor(bar.pct), clipPath: `inset(0 ${(1 - e) * 100}% 0 0)` }} />
      </div>
      <div style={{ width: VAL_W, paddingLeft: SPACE.m, display: 'flex', alignItems: 'baseline', gap: SPACE.s, whiteSpace: 'nowrap' }}>
        <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.label, color: '#FAF8F3', fontVariantNumeric: 'tabular-nums' }}>{fmt(bar.value)}</span>
        <span style={{ fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.7)' }}>{ordinal(bar.rank)}/{bar.of}</span>
      </div>
    </div>
  )
}

/** Cards that can be drawn: the catcher must have at least one bar. */
export function runCards(game: StoryGame): { card: RunCard; color: string }[] {
  const run = game.scout?.run
  if (!run) return []
  const out: { card: RunCard; color: string }[] = []
  if (run.away?.catcher?.bars) out.push({ card: run.away, color: game.home.color })   // away offense runs on the HOME catcher
  if (run.home?.catcher?.bars) out.push({ card: run.home, color: game.away.color })
  return out
}

function barsOf(card: RunCard) {
  const b = card.catcher?.bars
  return b ? [b.framing, b.blocking, b.throwing, b.pop].filter(Boolean).length : 0
}
const cardHeight = (card: RunCard) => PLATE_H + SPACE.s + barsOf(card) * BAR_H

const runs = (v: number) => `${signed(Math.round(v * 10) / 10 === 0 ? 0 : Math.round(v * 10) / 10)}`

export default function RunGame({ game, localT }: P) {
  const cards = runCards(game)
  if (cards.length === 0) return null
  const minThrows = Math.min(...cards.map(c => c.card.catcher?.attempts ?? 0).filter(n => n > 0), 999)
  const bodyH = cards.reduce((s, c) => s + cardHeight(c.card), 0) + SPACE.l * (cards.length - 1)
  const thruDates = cards.map(c => c.card.catcher?.bars?.thru).filter((d): d is string => !!d).sort()
  const thru = thruDates.length ? fmtShortDate(thruDates[0]) : null
  let n = 0
  return (
    <>
      <Header kicker={RUN_KICKER} headline={RUN_HEADLINE} />
      <Body gap={SPACE.l}>
        {cards.map(({ card, color }, bi) => {
          const c = card.catcher!, b = c.bars!
          const e = easeOutCubic(prog(localT, bi * 0.3, 0.3))
          const when = (i: number) => prog(localT, bi * 0.3 + 0.15 + i * 0.08, 0.4)
          return (
            <div key={card.offense} style={{ width: SAFE_W, opacity: e, transform: `translateY(${(1 - e) * 40}px)` }}>
              <NamePlate id={c.id} name={c.name} short={c.short} sub={`C · ${card.defense} · catches ${card.offense}`} color={color} head={64} width={SAFE_W} nameMax={TYPE.sub} />
              <div style={{ height: SPACE.s }} />
              {b.framing && <Bar label="Framing runs" bar={b.framing} fmt={runs} p={when(n++)} />}
              {b.blocking && <Bar label="Blocking runs" bar={b.blocking} fmt={runs} p={when(n++)} />}
              {b.throwing && <Bar label="Throwing runs" bar={b.throwing} fmt={runs} p={when(n++)} />}
              {b.pop && <Bar label="Pop time" bar={b.pop} fmt={v => `${v.toFixed(2)}s`} p={when(n++)} />}
            </div>
          )
        })}
      </Body>
      <Foot after={BODY_TOP + bodyH} lines={2}>{runFoot(minThrows === 999 ? 0 : minThrows, thru)}</Foot>
    </>
  )
}
