'use client'

import { SANS } from '@/components/team/ui'
import { HOME } from '../../diamondGeo'
import { BODY_TOP, SPACE, TYPE } from '../../layout'
import { buildEndOf, easeOutCubic, prog, revealAt } from '../../motion'
import Body from '../../parts/Body'
import Diamond from '../../parts/Diamond'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import { PG_SPRAY_KICKER } from '../copy'
import type { PostgameReelData } from '../types'

type P = { d: PostgameReelData; localT: number; dur: number }

const BOX = 820, LEGEND_H = 60, FLIGHT = 0.35
const AWAY_C = '#FDE047', HOME_C = '#FF5722'

export default function Spray({ d, localT, dur }: P) {
  const hits = d.hits
  const be = buildEndOf(dur, 0.65)
  const n = (s: 'away' | 'home') => hits.filter(h => h.side === s).length
  const bodyH = BOX + SPACE.m + LEGEND_H
  const key = (c: string, txt: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.s }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: '3px solid #1A1A1A' }} />
      <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.sub, color: '#FAF8F3' }}>{txt}</span>
    </div>
  )
  return (
    <>
      <Header kicker={PG_SPRAY_KICKER} headline={`${hits.length} ${hits.length === 1 ? 'HIT' : 'HITS'}`} />
      <Body gap={SPACE.m}>
        <div style={{ position: 'relative', width: BOX, height: BOX, alignSelf: 'center' }}>
          <Diamond box={BOX} />
          <svg viewBox="0 0 1000 1000" width={BOX} height={BOX} style={{ position: 'absolute', left: 0, top: 0 }}>
            {hits.map((h, i) => {
              const p = easeOutCubic(prog(localT, revealAt(i, hits.length, be, FLIGHT), FLIGHT))
              if (p <= 0) return null
              const c = h.side === 'away' ? AWAY_C : HOME_C
              const cx = HOME.x + (h.x - HOME.x) * p, cy = HOME.y + (h.y - HOME.y) * p
              const r = h.kind === 'HR' ? 26 : 19
              return (
                <g key={i}>
                  <line x1={HOME.x} y1={HOME.y} x2={cx} y2={cy} stroke={c} strokeWidth={4} opacity={0.35} />
                  <circle cx={cx} cy={cy} r={r} fill={c} stroke="#1A1A1A" strokeWidth={5} />
                  {h.kind === 'HR' && p >= 1 && <circle cx={cx} cy={cy} r={r + 11} fill="none" stroke={c} strokeWidth={5} />}
                </g>
              )
            })}
          </svg>
        </div>
        <div style={{ height: LEGEND_H, display: 'flex', justifyContent: 'center', gap: SPACE.xxl, alignItems: 'center' }}>
          {key(AWAY_C, `${d.away.abbr} ${n('away')}`)}{key(HOME_C, `${d.home.abbr} ${n('home')}`)}
        </div>
      </Body>
      <Foot after={BODY_TOP + bodyH} lines={2}>Where each hit landed · ringed = home run</Foot>
    </>
  )
}
