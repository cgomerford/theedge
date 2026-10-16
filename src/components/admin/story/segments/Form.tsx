'use client'

import { SANS } from '@/components/team/ui'
import { FORM_COOLING, FORM_HEATING, FORM_KICKER, FORM_TREND_LABEL, fmt3 } from '../copy'
import { countValue } from '../countDir'
import { HEADER_INSET, KICKER_H, SAFE, SAFE_W, SPACE, TYPE } from '../layout'
import { buildEndOf, easeOutCubic, prog, revealAt } from '../motion'
import Body from '../parts/Body'
import NamePlate from '../parts/NamePlate'
import TrendLine from '../parts/TrendLine'
import type { FormPick, StoryGame } from '../types'

type P = { game: StoryGame; localT: number; dur: number }

const GOOD = '#1D9E75', BAD = '#D4533B'
const CARD_H = 252, SECTION_H = 84

function Card({ pk, i, n, localT, be }: { pk: FormPick; i: number; n: number; localT: number; be: number }) {
  const col = pk.signal === 'heating' ? GOOD : BAD
  const at = revealAt(i, n, be, 0.7, 0.05)
  const e = easeOutCubic(prog(localT, at, 0.3))
  // heating climbs from his low, cooling falls from his peak (trending rows start at the typical level)
  const value = countValue(pk.signal, pk.current, prog(localT, at + 0.05, 0.6), pk.extreme)
  return (
    <div style={{
      width: SAFE_W, height: CARD_H, boxSizing: 'border-box', background: '#FAF8F3', border: '2px solid #e7e2d8', borderRadius: 28, padding: '18px 24px',
      opacity: e, transform: `translateY(${(1 - e) * 40}px)`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 38, height: 112 }}>
        <NamePlate id={pk.playerId} name={pk.name} short={pk.short} sub={pk.team.abbr} color={pk.team.color} head={84} width={460} flat nameMax={TYPE.sub} />
        <div style={{ textAlign: 'right', width: 400 }}>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.heroNum, letterSpacing: '-0.03em', color: col, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmt3(value)}</div>
          <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: '#8a8275', lineHeight: 1.1, marginTop: 4 }}>{pk.metricLabel}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 18, height: 100 }}>
        <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: TYPE.body, lineHeight: 1.15, color: '#1A1A1A', width: 560 }}>{pk.sentence}</div>
        {pk.trend.length >= 2 && (
          <div style={{ width: 320, flex: 'none' }}>
            <TrendLine data={pk.trend} w={320} h={88} color={col} p={prog(localT, at + 0.15, 0.5)} />
          </div>
        )}
      </div>
    </div>
  )
}

export function formStackHeight(picks: FormPick[]): number {
  const hot = picks.filter(p => p.signal === 'heating').length, cold = picks.length - hot
  const sections = (hot ? 1 : 0) + (cold ? 1 : 0)
  return sections * SECTION_H + picks.length * CARD_H + (picks.length - 1) * SPACE.m + (sections - 1) * SPACE.m
}

export default function Form({ game, localT, dur }: P) {
  const picks = game.form
  const hot = picks.filter(p => p.signal === 'heating')
  const cold = picks.filter(p => p.signal === 'cooling')
  const mixed = hot.length > 0 && cold.length > 0
  const sectionHead = (txt: string) => (
    <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.headline, letterSpacing: '-0.02em', textTransform: 'uppercase', color: '#FAF8F3', lineHeight: 1.02, height: SECTION_H, whiteSpace: 'nowrap' }}>{txt}</div>
  )
  let n = 0
  const be = buildEndOf(dur)
  const cards = (list: FormPick[]) => list.map(pk => <Card key={pk.playerId} pk={pk} i={n++} n={picks.length} localT={localT} be={be} />)
  const games = picks.find(p => p.games)?.games ?? 15
  return (
    <>
      <div style={{ position: 'absolute', left: SAFE.left, top: SAFE.top + HEADER_INSET, width: SAFE_W, fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, letterSpacing: '.14em', color: '#FF5722', lineHeight: 1.1, height: KICKER_H }}>{FORM_KICKER}</div>
      <Body gap={SPACE.m} top={SAFE.top + HEADER_INSET + KICKER_H + SPACE.s}>
        {mixed ? (
          <>
            {sectionHead(FORM_HEATING)}{cards(hot)}
            {sectionHead(FORM_COOLING)}{cards(cold)}
          </>
        ) : (
          <>
            {sectionHead(hot.length ? FORM_HEATING : FORM_COOLING)}
            {cards(picks)}
          </>
        )}
        <div style={{ fontFamily: SANS, fontSize: TYPE.foot, lineHeight: 1.25, color: 'rgba(250,248,243,.7)' }}>
          L{games} games · {game.seasonLabel} · {FORM_TREND_LABEL}
        </div>
      </Body>
    </>
  )
}
