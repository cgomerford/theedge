'use client'

import { SANS } from '@/components/team/ui'
import { BODY_TOP, SAFE_W, SPACE, TYPE } from '../../layout'
import { buildEndOf, countUp, prog, revealAt } from '../../motion'
import Body from '../../parts/Body'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import NamePlate from '../../parts/NamePlate'
import { lastName } from '../../pitcher/copy'
import { Card, Tile } from '../../pitcher/parts'
import { BR_KICKER } from '../copy'
import type { BatterReelData } from '../types'

type P = { d: BatterReelData; localT: number; dur: number }

const PLATE_H = 150, SCORE_H = 150, TILE_H = 150, TILE_W = (SAFE_W - SPACE.l * 2) / 3

export default function Game({ d, localT, dur }: P) {
  const be = buildEndOf(dur)
  const { line } = d
  const int = (v: number) => (p: number) => String(Math.round(countUp(v, p)))
  const tiles: { label: string; value: (p: number) => string; hot?: boolean }[] = [
    { label: 'H-AB', value: p => `${Math.round(countUp(line.h, p))}-${line.ab}`, hot: line.h > 0 },
    { label: 'R', value: int(line.r) }, { label: 'RBI', value: int(line.rbi), hot: line.rbi > 0 },
    { label: 'HR', value: int(line.hr), hot: line.hr > 0 }, { label: 'BB', value: int(line.bb) }, { label: 'K', value: int(line.k) },
  ]
  const won = d.score.team > d.score.opp
  const bodyH = PLATE_H + SCORE_H + TILE_H * 2 + SPACE.l * 3
  const season = d.season ? ['AVG ' + (d.season.avg ?? '—'), 'OBP ' + (d.season.obp ?? '—'), 'OPS ' + (d.season.ops ?? '—')].join(' · ') : null
  return (
    <>
      <Header kicker={BR_KICKER} headline={lastName(d.batter.name).toUpperCase()} />
      <Body gap={SPACE.l}>
        <NamePlate id={d.batter.id} name={d.batter.name} short={d.batter.short} sub={`${d.batter.pos} · ${d.team.abbr} ${d.home ? 'vs' : '@'} ${d.opp.abbr}`} color={d.team.color} head={110} width={SAFE_W} nameMax={56} pop={prog(localT, 0, 0.3)} />
        <Card p={prog(localT, 0.1, 0.3)} style={{ width: SAFE_W, height: SCORE_H, padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 56, color: '#1A1A1A' }}>{d.team.abbr}</span>
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.heroNum - 20, lineHeight: 1, color: won ? '#FF5722' : '#1A1A1A', fontVariantNumeric: 'tabular-nums' }}>{d.score.team}</span>
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 56, color: '#a89e8c' }}>–</span>
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.heroNum - 20, lineHeight: 1, color: !won ? '#FF5722' : '#1A1A1A', fontVariantNumeric: 'tabular-nums' }}>{d.score.opp}</span>
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 56, color: '#1A1A1A' }}>{d.opp.abbr}</span>
        </Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.l, width: SAFE_W }}>
          {tiles.map((t, i) => {
            const p = prog(localT, revealAt(i, tiles.length, be), 0.5)
            return <Tile key={t.label} label={t.label} value={t.value(p)} p={prog(localT, revealAt(i, tiles.length, be), 0.25)} hot={t.hot} w={TILE_W} h={TILE_H} />
          })}
        </div>
      </Body>
      <Foot after={BODY_TOP + bodyH} lines={2}>{`${d.dateLabel} · ${line.pa} PA · ${line.pitches} pitches seen${season ? ` · season ${season}` : ''}`}</Foot>
    </>
  )
}
