'use client'

import { SANS } from '@/components/team/ui'
import { fmt3, STREAK_HEADLINE, STREAK_KICKER } from '../copy'
import { countValue } from '../countDir'
import { SAFE_W, SPACE, TYPE } from '../layout'
import { buildEndOf, easeOutCubic, prog, revealAt } from '../motion'
import Body from '../parts/Body'
import Header from '../parts/Header'
import NamePlate from '../parts/NamePlate'
import type { StoryGame, StreakCard } from '../types'

type P = { game: StoryGame; localT: number; dur: number }

const CARD_PAD = 16, PLATE_H = 112, LABEL_H = 52, SEASON_H = 96

function SeasonRow({ s }: { s: NonNullable<StreakCard['season']> }) {
  const cells: [string, string][] = []
  if (s.avg != null) cells.push(['AVG', fmt3(s.avg)])
  if (s.slg != null) cells.push(['SLG', fmt3(s.slg)])
  if (s.ops != null) cells.push(['OPS', fmt3(s.ops)])
  if (s.rbi != null) cells.push(['RBI', String(Math.round(s.rbi))])
  if (cells.length === 0) return null
  const w = (SAFE_W - 52 - 12) / cells.length
  return (
    <div style={{ display: 'flex', borderTop: '2px solid #e7e2d8', marginTop: SPACE.xs, paddingTop: SPACE.xs, height: SEASON_H }}>
      {cells.map(([k, v]) => (
        <div key={k} style={{ width: w, textAlign: 'center' }}>
          <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: '#8a8275', lineHeight: 1 }}>{k}</div>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.sub, color: '#1A1A1A', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{v}</div>
        </div>
      ))}
    </div>
  )
}

export function cardHeight(s: StreakCard) {
  return CARD_PAD * 2 + PLATE_H + LABEL_H + (s.season ? SEASON_H + SPACE.xs * 2 + 2 : 0)
}

export default function Streaks({ game, localT, dur }: P) {
  return (
    <>
      <Header kicker={STREAK_KICKER} headline={STREAK_HEADLINE} />
      <Body gap={SPACE.m}>
        <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.7)', height: 36, lineHeight: '36px' }}>{game.seasonLabel}</div>
        {game.streaks.map((s, i) => {
          const be = buildEndOf(dur)
          const at = revealAt(i, game.streaks.length, be, 0.7, 0.05)
          const e = easeOutCubic(prog(localT, at, 0.3))
          const v = countValue('count', s.n, prog(localT, at + 0.05, 0.6))
          const shown = s.kind === 'scoreless' ? v.toFixed(1) : String(Math.round(v))
          return (
            <div key={s.playerId} style={{
              width: SAFE_W, boxSizing: 'border-box', background: '#FAF8F3', border: '2px solid #e7e2d8', borderRadius: 28, padding: `${CARD_PAD}px 26px`,
              opacity: e, transform: `translateY(${(1 - e) * 40}px)`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', height: PLATE_H }}>
                <NamePlate id={s.playerId} name={s.name} short={s.short} sub={`${s.position || '—'} · ${s.team.abbr}`} color={s.team.color} head={84} width={600} flat nameMax={TYPE.sub} />
                <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.heroNum, letterSpacing: '-0.03em', color: '#FF5722', fontVariantNumeric: 'tabular-nums', lineHeight: 1, paddingRight: SPACE.xs, marginLeft: 'auto' }}>{shown}</div>
              </div>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.sub, color: '#1A1A1A', paddingLeft: SPACE.s, height: LABEL_H, lineHeight: `${LABEL_H}px` }}>{s.label}</div>
              {s.season && <SeasonRow s={s.season} />}
            </div>
          )
        })}
      </Body>
    </>
  )
}
