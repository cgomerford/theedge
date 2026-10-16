'use client'

import { SANS } from '@/components/team/ui'
import { BODY_TOP, SAFE_W, SPACE, TYPE } from '../../layout'
import { buildEndOf, countUp, prog, revealAt } from '../../motion'
import Body from '../../parts/Body'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import { Card, Chip } from '../../pitcher/parts'
import { PG_FINAL_HEADLINE, PG_KICKER } from '../copy'
import type { PgTeam, PostgameReelData } from '../types'

type P = { d: PostgameReelData; localT: number; dur: number }

const TEAM_H = 150, LINE_H = 230, DEC_H = 60

export default function Final({ d, localT, dur }: P) {
  const be = buildEndOf(dur, 0.45)
  const team = (t: PgTeam, win: boolean, i: number) => {
    const p = prog(localT, revealAt(i, 2, be), 0.5)
    return (
      <Card key={t.abbr} p={prog(localT, revealAt(i, 2, be), 0.25)} style={{ width: SAFE_W, height: TEAM_H, padding: '0 40px 0 0', display: 'flex', alignItems: 'center', gap: SPACE.l, overflow: 'hidden' }}>
        <div style={{ width: 22, alignSelf: 'stretch', background: t.color }} />
        <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 64, letterSpacing: '-0.02em', color: '#1A1A1A', width: 150 }}>{t.abbr}</span>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, color: '#8a8275', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
        <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.heroNum, lineHeight: 1, color: win ? '#FF5722' : '#1A1A1A', fontVariantNumeric: 'tabular-nums' }}>{Math.round(countUp(t.score, p))}</span>
      </Card>
    )
  }
  const innings = Math.max(9, ...d.linescore.map(r => r.runs.length))
  const NAME_W = 110, RHE_W = 74
  const cellW = Math.floor((SAFE_W - 56 - NAME_W - RHE_W * 3) / innings)
  const cell = (txt: string, w: number, strong = false, dim = false) => (
    <div style={{ width: w, textAlign: 'center', fontFamily: SANS, fontWeight: strong ? 800 : 600, fontSize: TYPE.label, color: dim ? '#a89e8c' : '#1A1A1A', fontVariantNumeric: 'tabular-nums' }}>{txt}</div>
  )
  const totals = { away: d.away, home: d.home }
  const decisions = [d.decisions.w && `W ${d.decisions.w}`, d.decisions.l && `L ${d.decisions.l}`, d.decisions.s && `SV ${d.decisions.s}`].filter(Boolean) as string[]
  const bodyH = TEAM_H * 2 + LINE_H + (decisions.length ? DEC_H : 0) + SPACE.l * 3
  return (
    <>
      <Header kicker={PG_KICKER} headline={PG_FINAL_HEADLINE} />
      <Body gap={SPACE.l}>
        {team(d.away, d.winner === 'away', 0)}
        {team(d.home, d.winner === 'home', 1)}
        <Card p={prog(localT, 0.3, 0.3)} style={{ width: SAFE_W, height: LINE_H, padding: '0 28px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', height: 52 }}>
            <div style={{ width: NAME_W }} />
            {Array.from({ length: innings }, (_, i) => cell(String(i + 1), cellW, false, true))}
            {cell('R', RHE_W, false, true)}{cell('H', RHE_W, false, true)}{cell('E', RHE_W, false, true)}
          </div>
          {d.linescore.map(r => (
            <div key={r.side} style={{ display: 'flex', alignItems: 'center', height: 64 }}>
              <div style={{ width: NAME_W, fontFamily: SANS, fontWeight: 800, fontSize: TYPE.label, color: '#1A1A1A' }}>{r.abbr}</div>
              {Array.from({ length: innings }, (_, i) => cell(r.runs[i] == null ? '' : String(r.runs[i]), cellW))}
              {cell(String(totals[r.side].score), RHE_W, true)}{cell(String(totals[r.side].hits), RHE_W, true)}{cell(String(totals[r.side].errors), RHE_W, true)}
            </div>
          ))}
        </Card>
        {decisions.length > 0 && (
          <div style={{ display: 'flex', gap: SPACE.m, alignItems: 'center', height: DEC_H, flexWrap: 'nowrap', opacity: prog(localT, 0.5, 0.3) }}>
            {decisions.map(t => <Chip key={t} bg="#FAF8F3" color="#1A1A1A">{t}</Chip>)}
          </div>
        )}
      </Body>
      <Foot after={BODY_TOP + bodyH}>{`FINAL · ${d.dateLabel}`}</Foot>
    </>
  )
}
