'use client'

import { SANS } from '@/components/team/ui'
import { BODY_TOP, SAFE_W, SPACE, TYPE } from '../../layout'
import { buildEndOf, easeOutCubic, prog, revealAt } from '../../motion'
import Body from '../../parts/Body'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import { ZONE_FT } from '../../pitcher/calc'
import { KEY_ROW_H } from '../../pitcher/parts'
import { BR_ZONE_HEADLINE, BR_ZONE_KICKER, CALL_COLOR, CALL_LABEL } from '../copy'
import type { BatterReelData, BrCall } from '../types'

type P = { d: BatterReelData; localT: number; dur: number }

const ZONE_PX = 540
const ZONE_W_IN = 17, ZONE_H_IN = ZONE_FT * 12, BALL_R = 1.15
const VIEW = { x: -11, y: -4, w: 22, h: 32 }
const ZONE_BOX_H = Math.round((ZONE_PX * VIEW.h) / VIEW.w)
const CALLS: BrCall[] = ['whiff', 'called', 'foul', 'inplay', 'ball']

/** Every pitch he saw, catcher's view, coloured by what happened; key with counts underneath. */
export default function Zone({ d, localT, dur }: P) {
  const be = buildEndOf(dur, 0.6)
  const ps = d.pitchesSeen
  const keyH = Math.ceil(CALLS.length / 2) * KEY_ROW_H
  const bodyH = ZONE_BOX_H + SPACE.l + keyH
  return (
    <>
      <Header kicker={BR_ZONE_KICKER} headline={BR_ZONE_HEADLINE} />
      <Body gap={SPACE.l}>
        <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="xMidYMid meet" width={SAFE_W} height={ZONE_BOX_H} style={{ display: 'block' }}>
          <path d={`M ${-ZONE_W_IN / 2} ${ZONE_H_IN + 2} h ${ZONE_W_IN} v 1.2 l ${-ZONE_W_IN / 2} 1.5 l ${-ZONE_W_IN / 2} -1.5 Z`} fill="rgba(250,248,243,.16)" />
          <rect x={-ZONE_W_IN / 2} y={0} width={ZONE_W_IN} height={ZONE_H_IN} fill="rgba(250,248,243,.05)" stroke="rgba(250,248,243,.75)" strokeWidth={0.35} />
          {[1, 2].map(i => <line key={`v${i}`} x1={-ZONE_W_IN / 2 + (i * ZONE_W_IN) / 3} y1={0} x2={-ZONE_W_IN / 2 + (i * ZONE_W_IN) / 3} y2={ZONE_H_IN} stroke="rgba(250,248,243,.22)" strokeWidth={0.2} />)}
          {[1, 2].map(i => <line key={`h${i}`} x1={-ZONE_W_IN / 2} y1={(i * ZONE_H_IN) / 3} x2={ZONE_W_IN / 2} y2={(i * ZONE_H_IN) / 3} stroke="rgba(250,248,243,.22)" strokeWidth={0.2} />)}
          {ps.map((o, i) => {
            const e = easeOutCubic(prog(localT, revealAt(i, ps.length, be, 0.2, 0.05), 0.2))
            if (e <= 0) return null
            const cx = Math.max(VIEW.x + BALL_R, Math.min(VIEW.x + VIEW.w - BALL_R, o.x * 12))
            const cy = Math.max(VIEW.y + BALL_R, Math.min(ZONE_H_IN + 1.5, (ZONE_FT - o.z) * 12))
            return <circle key={i} cx={cx} cy={cy} r={BALL_R * (1 + (1 - e) * 0.8)} fill={CALL_COLOR[o.call]} fillOpacity={0.35 + 0.65 * e} stroke="#1A1A1A" strokeWidth={0.25} />
          })}
        </svg>
        <div style={{ width: SAFE_W, display: 'flex', flexWrap: 'wrap', columnGap: SPACE.l, opacity: easeOutCubic(prog(localT, 0.1, 0.3)) }}>
          {CALLS.map(c => (
            <div key={c} style={{ width: (SAFE_W - SPACE.l) / 2, height: KEY_ROW_H, display: 'flex', alignItems: 'center', gap: SPACE.s, whiteSpace: 'nowrap' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: CALL_COLOR[c], flex: 'none', border: '2px solid #1A1A1A', boxSizing: 'border-box' }} />
              <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.label, color: '#FAF8F3', flex: 1 }}>{CALL_LABEL[c]}</span>
              <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, color: 'rgba(250,248,243,.7)', fontVariantNumeric: 'tabular-nums' }}>{ps.filter(p => p.call === c).length}</span>
            </div>
          ))}
        </div>
      </Body>
      <Foot after={BODY_TOP + bodyH} lines={2}>{`Catcher's view · ${ps.length} located pitches, each coloured by the result`}</Foot>
    </>
  )
}
