'use client'

import { SANS } from '@/components/team/ui'
import { BODY_TOP, SAFE_W, SPACE, TYPE } from '../../layout'
import { buildEndOf, countUp, prog, revealAt } from '../../motion'
import Body from '../../parts/Body'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import NamePlate from '../../parts/NamePlate'
import { lastName, PR_KICKER } from '../copy'
import { Card, Chip, Tile } from '../parts'
import { ipToOuts } from '../calc'
import type { PitcherReelData } from '../types'

type P = { d: PitcherReelData; localT: number; dur: number }

const PLATE_H = 150, SCORE_H = 190, TILE_H = 150, TILE_W = (SAFE_W - SPACE.l * 2) / 3

export default function Game({ d, localT, dur }: P) {
  const be = buildEndOf(dur)
  const { line } = d
  const outs = ipToOuts(line.ip)
  const tiles: { label: string; value: (p: number) => string; hot?: boolean }[] = [
    { label: 'IP', value: p => { const o = Math.round(countUp(outs, p)); return `${Math.floor(o / 3)}.${o % 3}` } },
    { label: 'H', value: p => String(Math.round(countUp(line.h, p))) },
    { label: 'R', value: p => String(Math.round(countUp(line.r, p))) },
    { label: 'ER', value: p => String(Math.round(countUp(line.er, p))) },
    { label: 'BB', value: p => String(Math.round(countUp(line.bb, p))) },
    { label: 'K', value: p => String(Math.round(countUp(line.k, p))), hot: true },
  ]
  const won = d.score.team > d.score.opp
  const side = (abbr: string, score: number, win: boolean, align: 'left' | 'right') => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: SPACE.m, justifyContent: align === 'left' ? 'flex-start' : 'flex-end', flexDirection: align === 'left' ? 'row' : 'row-reverse' }}>
      <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 56, letterSpacing: '-0.02em', color: '#1A1A1A' }}>{abbr}</span>
      <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.heroNum, lineHeight: 1, color: win ? '#FF5722' : '#1A1A1A', fontVariantNumeric: 'tabular-nums' }}>{score}</span>
    </div>
  )
  const bodyH = PLATE_H + SCORE_H + TILE_H * 2 + SPACE.l * 3 + SPACE.l
  return (
    <>
      <Header kicker={PR_KICKER} headline={lastName(d.pitcher.name).toUpperCase()} />
      <Body gap={SPACE.l}>
        <NamePlate id={d.pitcher.id} name={d.pitcher.name} short={d.pitcher.short} sub={`${d.pitcher.throws ? `${d.pitcher.throws}HP · ` : ''}${d.team.abbr} ${d.home ? 'vs' : '@'} ${d.opp.abbr}`} color={d.team.color} head={110} width={SAFE_W} nameMax={56} pop={prog(localT, 0, 0.3)} />
        <Card p={prog(localT, 0.1, 0.3)} style={{ width: SAFE_W, height: SCORE_H, padding: '0 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: SPACE.s }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.l }}>
            {side(d.team.abbr, d.score.team, won, 'left')}
            <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 56, color: '#a89e8c' }}>–</span>
            {side(d.opp.abbr, d.score.opp, !won, 'right')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: SANS, fontSize: TYPE.foot, color: '#8a8275' }}>FINAL · {d.dateLabel}</span>
            {d.decision && <Chip>{d.decision === 'W' ? 'WIN' : d.decision === 'L' ? 'LOSS' : 'SAVE'}</Chip>}
          </div>
        </Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.l, width: SAFE_W }}>
          {tiles.map((t, i) => {
            const p = prog(localT, revealAt(i, tiles.length, be), 0.5)
            return <Tile key={t.label} label={t.label} value={t.value(p)} p={prog(localT, revealAt(i, tiles.length, be), 0.25)} hot={t.hot} w={TILE_W} h={TILE_H} />
          })}
        </div>
      </Body>
      <Foot after={BODY_TOP + bodyH}>{`${line.pitches} pitches · ${line.strikes} strikes · ${line.bf} batters faced`}</Foot>
    </>
  )
}
