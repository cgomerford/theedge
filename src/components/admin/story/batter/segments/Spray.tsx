'use client'

import { SANS } from '@/components/team/ui'
import { HOME } from '../../diamondGeo'
import { BODY_TOP, SPACE, TYPE } from '../../layout'
import { buildEndOf, easeOutCubic, prog, revealAt } from '../../motion'
import Body from '../../parts/Body'
import Diamond from '../../parts/Diamond'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import { BR_SPRAY_HEADLINE, BR_SPRAY_KICKER } from '../copy'
import type { BatterReelData, BrBall } from '../types'

type P = { d: BatterReelData; localT: number; dur: number }

const BOX = 820, LEGEND_H = 60, FLIGHT = 0.35
const COLOR: Record<BrBall['kind'], string> = { '1B': '#FAF8F3', '2B': '#FDE047', '3B': '#FF9A62', HR: '#FF5722', OUT: '#6b6558' }

export default function Spray({ d, localT, dur }: P) {
  const balls = d.balls
  const be = buildEndOf(dur, 0.6)
  const counts = (['1B', '2B', '3B', 'HR', 'OUT'] as const).map(k => ({ k, n: balls.filter(b => b.kind === k).length })).filter(c => c.n > 0)
  const bodyH = BOX + SPACE.m + LEGEND_H
  return (
    <>
      <Header kicker={BR_SPRAY_KICKER} headline={BR_SPRAY_HEADLINE} />
      <Body gap={SPACE.m}>
        <div style={{ position: 'relative', width: BOX, height: BOX, alignSelf: 'center' }}>
          <Diamond box={BOX} />
          <svg viewBox="0 0 1000 1000" width={BOX} height={BOX} style={{ position: 'absolute', left: 0, top: 0 }}>
            {balls.map((b, i) => {
              const p = easeOutCubic(prog(localT, revealAt(i, balls.length, be, FLIGHT), FLIGHT))
              if (p <= 0) return null
              const cx = HOME.x + (b.x - HOME.x) * p, cy = HOME.y + (b.y - HOME.y) * p
              const r = b.kind === 'HR' ? 30 : 22
              return (
                <g key={i}>
                  <line x1={HOME.x} y1={HOME.y} x2={cx} y2={cy} stroke={COLOR[b.kind]} strokeWidth={5} opacity={0.45} />
                  <circle cx={cx} cy={cy} r={r} fill={COLOR[b.kind]} stroke="#1A1A1A" strokeWidth={5} />
                  {b.kind === 'HR' && p >= 1 && <circle cx={cx} cy={cy} r={r + 12} fill="none" stroke="#FF5722" strokeWidth={5} />}
                </g>
              )
            })}
          </svg>
        </div>
        <div style={{ height: LEGEND_H, display: 'flex', justifyContent: 'center', gap: SPACE.xl, alignItems: 'center' }}>
          {counts.map(c => (
            <div key={c.k} style={{ display: 'flex', alignItems: 'center', gap: SPACE.s }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: COLOR[c.k], border: '3px solid #1A1A1A' }} />
              <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.sub, color: '#FAF8F3', fontVariantNumeric: 'tabular-nums' }}>{c.n} {c.k === 'OUT' ? 'out' : c.k}</span>
            </div>
          ))}
        </div>
      </Body>
      <Foot after={BODY_TOP + bodyH} lines={2}>Where each ball in play landed · ringed = home run</Foot>
    </>
  )
}
