'use client'

import { SANS } from '@/components/team/ui'
import { BODY_TOP, SAFE_W, SPACE, TYPE } from '../../layout'
import { buildEndOf, prog, revealAt } from '../../motion'
import Body from '../../parts/Body'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import { Card, Tile } from '../../pitcher/parts'
import { BR_CONTACT_HEADLINE, BR_CONTACT_KICKER } from '../copy'
import type { BatterReelData } from '../types'

type P = { d: BatterReelData; localT: number; dur: number }

const TILE_H = 150, TILE_W = (SAFE_W - SPACE.l) / 2, ROW_H = 76, MAX_ROWS = 6
const COL = { ev: 130, la: 120, dist: 140 }
const NAME_W = SAFE_W - 56 - COL.ev - COL.la - COL.dist

export default function Contact({ d, localT, dur }: P) {
  const be = buildEndOf(dur, 0.5)
  const c = d.contact
  const rows = d.balls.slice(0, MAX_ROWS)
  const tiles = [
    { label: 'HARDEST HIT (MPH)', v: c?.hardest != null ? c.hardest.toFixed(1) : '—', hot: true },
    { label: 'AVG EXIT VELO', v: c?.avgEv != null ? c.avgEv.toFixed(1) : '—', hot: false },
    { label: 'HARD HIT (95+)', v: c ? `${c.hardHit} of ${c.inPlay}` : '—', hot: false },
    { label: 'LONGEST (FT)', v: c?.longest != null ? String(Math.round(c.longest)) : '—', hot: false },
  ]
  const cell = (t: string, w: number, strong = false) => <div style={{ width: w, textAlign: 'right', fontFamily: SANS, fontWeight: strong ? 800 : 600, fontSize: TYPE.label, color: '#1A1A1A', fontVariantNumeric: 'tabular-nums' }}>{t}</div>
  const bodyH = TILE_H * 2 + SPACE.l * 2 + 48 + rows.length * ROW_H + 24
  return (
    <>
      <Header kicker={BR_CONTACT_KICKER} headline={BR_CONTACT_HEADLINE} />
      <Body gap={SPACE.l}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.l, width: SAFE_W }}>
          {tiles.map((t, i) => <Tile key={t.label} label={t.label} value={t.v} p={prog(localT, revealAt(i, tiles.length, be), 0.3)} hot={t.hot} w={TILE_W} h={TILE_H} />)}
        </div>
        <Card p={prog(localT, 0.3, 0.3)} style={{ width: SAFE_W, padding: '12px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', height: 48 }}>
            <div style={{ width: NAME_W, fontFamily: SANS, fontSize: TYPE.foot, color: '#8a8275' }}>RESULT</div>
            {['EV', 'LA', 'FT'].map((h, i) => <div key={h} style={{ width: [COL.ev, COL.la, COL.dist][i], textAlign: 'right', fontFamily: SANS, fontSize: TYPE.foot, color: '#8a8275' }}>{h}</div>)}
          </div>
          {rows.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', height: ROW_H, opacity: prog(localT, revealAt(i, rows.length, be, 0.2, 0.15), 0.25) }}>
              <div style={{ width: NAME_W, fontFamily: SANS, fontWeight: 800, fontSize: TYPE.label, color: b.kind === 'OUT' ? '#1A1A1A' : '#FF5722', whiteSpace: 'nowrap' }}>{b.label}</div>
              {cell(b.ev != null ? b.ev.toFixed(1) : '—', COL.ev, true)}
              {cell(b.la != null ? `${Math.round(b.la)}°` : '—', COL.la)}
              {cell(b.dist != null ? String(Math.round(b.dist)) : '—', COL.dist)}
            </div>
          ))}
        </Card>
      </Body>
      <Foot after={BODY_TOP + bodyH}>Exit velocity (mph), launch angle, distance · Statcast tracking</Foot>
    </>
  )
}
