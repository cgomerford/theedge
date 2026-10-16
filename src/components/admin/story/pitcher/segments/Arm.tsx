'use client'

import { SANS } from '@/components/team/ui'
import { BODY_TOP, SAFE_W, SPACE, TYPE } from '../../layout'
import { buildEndOf, countUp, easeOutCubic, prog } from '../../motion'
import Body from '../../parts/Body'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import { ARM_HEADLINE, ARM_KICKER, armSlot } from '../copy'
import type { PitcherReelData } from '../types'

type P = { d: PitcherReelData; localT: number; dur: number }

const W = SAFE_W, H = 600, R = 340, LEN = 330
const PIVOT = { x: W / 2, y: 500 }
const GRAPHIC_H = H, NUM_H = 130, CHIPS_H = 60

export default function Arm({ d, localT, dur }: P) {
  const arm = d.arm
  if (!arm || arm.overall == null) return null
  const be = buildEndOf(dur, 0.5)
  const dir = d.pitcher.throws === 'L' ? -1 : 1
  const sweep = easeOutCubic(prog(localT, 0.1, be - 0.3))
  const deg = arm.overall * sweep
  const S = { x: PIVOT.x + dir * 40, y: PIVOT.y }
  const at = (a: number, r: number) => ({ x: S.x + dir * r * Math.cos((a * Math.PI) / 180), y: S.y - r * Math.sin((a * Math.PI) / 180) })
  const tip = at(deg, LEN)
  const wedgeEnd = at(deg, R)
  const wedgeStart = at(0, R)
  const types = arm.byType.slice(0, 5)
  const fade = easeOutCubic(prog(localT, be - 0.5, 0.4))
  const bodyH = GRAPHIC_H + NUM_H + CHIPS_H + SPACE.m * 2
  return (
    <>
      <Header kicker={ARM_KICKER} headline={ARM_HEADLINE} />
      <Body gap={SPACE.m}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
          {/* protractor: 0° sidearm → 90° over the top */}
          <path d={`M ${S.x} ${S.y} L ${wedgeStart.x} ${wedgeStart.y} A ${R} ${R} 0 0 ${dir === 1 ? 0 : 1} ${wedgeEnd.x} ${wedgeEnd.y} Z`} fill="rgba(255,87,34,.22)" />
          <path d={`M ${at(0, R).x} ${at(0, R).y} A ${R} ${R} 0 0 ${dir === 1 ? 0 : 1} ${at(90, R).x} ${at(90, R).y}`} fill="none" stroke="rgba(250,248,243,.35)" strokeWidth={4} />
          {[0, 30, 60, 90].map(a => {
            const o = at(a, R + 14), l = at(a, R + 52)
            return (
              <g key={a}>
                <line x1={at(a, R - 14).x} y1={at(a, R - 14).y} x2={o.x} y2={o.y} stroke="rgba(250,248,243,.6)" strokeWidth={4} />
                <text x={l.x} y={l.y + 10} textAnchor="middle" fontFamily={SANS} fontSize={TYPE.foot} fill="rgba(250,248,243,.7)">{a}°</text>
              </g>
            )
          })}
          {/* per-pitch slots, faded in during the build */}
          {types.map(t => {
            const e = at(t.deg, R - 30)
            return (
              <g key={t.code} opacity={fade}>
                <line x1={S.x} y1={S.y} x2={e.x} y2={e.y} stroke={t.color} strokeWidth={6} strokeLinecap="round" opacity={0.85} />
                <circle cx={e.x} cy={e.y} r={14} fill={t.color} stroke="#1A1A1A" strokeWidth={3} />
              </g>
            )
          })}
          {/* pitcher: torso, head, then the sweeping arm */}
          <line x1={PIVOT.x} y1={PIVOT.y} x2={PIVOT.x} y2={H - 4} stroke="#FAF8F3" strokeWidth={34} strokeLinecap="round" />
          <circle cx={PIVOT.x} cy={PIVOT.y - 92} r={46} fill="#FAF8F3" />
          <line x1={S.x} y1={S.y} x2={tip.x} y2={tip.y} stroke="#FF5722" strokeWidth={26} strokeLinecap="round" />
          <circle cx={S.x} cy={S.y} r={22} fill="#FF5722" />
          <circle cx={tip.x} cy={tip.y} r={30} fill="#FAF8F3" stroke="#1A1A1A" strokeWidth={4} />
        </svg>
        <div style={{ height: NUM_H, display: 'flex', alignItems: 'baseline', gap: SPACE.l }}>
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.heroNum + 20, lineHeight: 1, color: '#FF5722', fontVariantNumeric: 'tabular-nums' }}>{Math.round(countUp(arm.overall, sweep))}°</span>
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.sub, color: '#FAF8F3', opacity: fade }}>{armSlot(arm.overall)}</span>
        </div>
        <div style={{ height: CHIPS_H, display: 'flex', gap: SPACE.l, opacity: fade, whiteSpace: 'nowrap' }}>
          {types.map(t => (
            <div key={t.code} style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: t.color }} />
              <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, color: '#FAF8F3', fontVariantNumeric: 'tabular-nums' }}>{t.code} {Math.round(t.deg)}°</span>
            </div>
          ))}
        </div>
      </Body>
      <Foot after={BODY_TOP + bodyH} lines={2}>{arm.source === 'season' ? "S0° sidearm, 90° over the top" : '0° sidearm, 90° over the top ·'}</Foot>
    </>
  )
}
