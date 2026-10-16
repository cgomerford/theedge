'use client'

import { SANS } from '@/components/team/ui'
import { BODY_TOP, SAFE_W, SPACE, TYPE } from '../../layout'
import { buildEndOf, prog, revealAt } from '../../motion'
import Body from '../../parts/Body'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import { Card, Chip } from '../../pitcher/parts'
import { PG_PITCHING_HEADLINE, PG_PITCHING_KICKER } from '../copy'
import type { PostgameReelData } from '../types'

type P = { d: PostgameReelData; localT: number; dur: number }

const ROW_H = 118, HDR_H = 44
const COL = { ip: 90, h: 70, er: 70, bb: 70, k: 70 }
const NAME_W = SAFE_W - 56 - COL.ip - COL.h - COL.er - COL.bb - COL.k

export default function Pitching({ d, localT, dur }: P) {
  const be = buildEndOf(dur, 0.6)
  const rows = d.pitching
  const cell = (txt: string, w: number, hot = false) => <div style={{ width: w, textAlign: 'right', fontFamily: SANS, fontWeight: 800, fontSize: TYPE.label, color: hot ? '#FF5722' : '#1A1A1A', fontVariantNumeric: 'tabular-nums' }}>{txt}</div>
  const hdr = (t: string, w: number) => <div style={{ width: w, textAlign: 'right', fontFamily: SANS, fontSize: TYPE.foot, color: '#8a8275' }}>{t}</div>
  const bodyH = rows.length * (ROW_H + HDR_H) + SPACE.m * Math.max(0, rows.length - 1)
  return (
    <>
      <Header kicker={PG_PITCHING_KICKER} headline={PG_PITCHING_HEADLINE} />
      <Body gap={SPACE.m}>
        {rows.map((p, i) => {
          const t = p.side === 'away' ? d.away : d.home
          return (
            <Card key={p.id} p={prog(localT, revealAt(i, rows.length, be), 0.3)} style={{ width: SAFE_W, height: ROW_H + HDR_H, padding: '0 28px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', height: HDR_H }}>
                <div style={{ width: NAME_W, fontFamily: SANS, fontSize: TYPE.foot, color: '#8a8275' }}>{t.abbr} · {p.starter ? 'STARTER' : 'RELIEF'}</div>
                {hdr('IP', COL.ip)}{hdr('H', COL.h)}{hdr('ER', COL.er)}{hdr('BB', COL.bb)}{hdr('K', COL.k)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', height: ROW_H - 24 }}>
                <div style={{ width: NAME_W, display: 'flex', alignItems: 'center', gap: SPACE.m, minWidth: 0 }}>
                  <div style={{ width: 16, height: 56, borderRadius: 8, background: t.color, flex: 'none' }} />
                  <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.sub, color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                  {p.tag && <Chip>{p.tag === 'W' ? 'WIN' : p.tag === 'L' ? 'LOSS' : 'SAVE'}</Chip>}
                </div>
                {cell(p.ip, COL.ip)}{cell(String(p.h), COL.h)}{cell(String(p.er), COL.er)}{cell(String(p.bb), COL.bb)}{cell(String(p.k), COL.k, true)}
              </div>
            </Card>
          )
        })}
      </Body>
      <Foot after={BODY_TOP + bodyH}>Starters plus the pitchers who got the decision or save</Foot>
    </>
  )
}
