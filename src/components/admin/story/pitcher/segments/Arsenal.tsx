'use client'

import { BODY_TOP, SAFE_W, SPACE, TYPE } from '../../layout'
import { buildEndOf, easeOutCubic, prog, revealAt } from '../../motion'
import Body from '../../parts/Body'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import { ZONE_FT } from '../calc'
import { ARS_HEADLINE, ARS_KICKER, shortPitch } from '../copy'
import { KEY_ROW_H, PitchKey } from '../parts'
import type { PitcherReelData } from '../types'

type P = { d: PitcherReelData; localT: number; dur: number }

const MAX_ROWS = 6
const ZONE_PX = 540
const ZONE_W_IN = 17, ZONE_H_IN = ZONE_FT * 12, BALL_R = 1.15
const VIEW = { x: -11, y: -4, w: 22, h: 32 }                        // inches around the zone, y down
const ZONE_BOX_H = Math.round((ZONE_PX * VIEW.h) / VIEW.w)           // same px/inch both ways → round balls

export function arsenalRows(d: PitcherReelData) {
  return d.arsenal.filter(p => p.usagePct >= 1).slice(0, MAX_ROWS)
}

/** Big zone in the middle showing every pitch, colour key with the mix underneath. */
export default function Arsenal({ d, localT, dur }: P) {
  const rows = arsenalRows(d)
  const be = buildEndOf(dur, 0.5)
  const dots = d.pitchDots
  const keyH = Math.ceil(rows.length / 2) * KEY_ROW_H
  const bodyH = ZONE_BOX_H + SPACE.l + keyH
  return (
    <>
      <Header kicker={ARS_KICKER} headline={ARS_HEADLINE} />
      <Body gap={SPACE.l}>
        <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="xMidYMid meet" width={SAFE_W} height={ZONE_BOX_H} style={{ display: 'block' }}>
          <path d={`M ${-ZONE_W_IN / 2} ${ZONE_H_IN + 2} h ${ZONE_W_IN} v 1.2 l ${-ZONE_W_IN / 2} 1.5 l ${-ZONE_W_IN / 2} -1.5 Z`} fill="rgba(250,248,243,.16)" />
          <rect x={-ZONE_W_IN / 2} y={0} width={ZONE_W_IN} height={ZONE_H_IN} fill="rgba(250,248,243,.05)" stroke="rgba(250,248,243,.75)" strokeWidth={0.35} />
          {[1, 2].map(i => <line key={`v${i}`} x1={-ZONE_W_IN / 2 + (i * ZONE_W_IN) / 3} y1={0} x2={-ZONE_W_IN / 2 + (i * ZONE_W_IN) / 3} y2={ZONE_H_IN} stroke="rgba(250,248,243,.22)" strokeWidth={0.2} />)}
          {[1, 2].map(i => <line key={`h${i}`} x1={-ZONE_W_IN / 2} y1={(i * ZONE_H_IN) / 3} x2={ZONE_W_IN / 2} y2={(i * ZONE_H_IN) / 3} stroke="rgba(250,248,243,.22)" strokeWidth={0.2} />)}
          {dots.map((o, i) => {
            const e = easeOutCubic(prog(localT, revealAt(i, dots.length, be, 0.2, 0.05), 0.2))
            if (e <= 0) return null
            const cx = Math.max(VIEW.x + BALL_R, Math.min(VIEW.x + VIEW.w - BALL_R, o.x * 12))
            const cy = Math.max(VIEW.y + BALL_R, Math.min(ZONE_H_IN + 1.5, (ZONE_FT - o.z) * 12))
            return <circle key={i} cx={cx} cy={cy} r={BALL_R * (1 + (1 - e) * 0.8)} fill={o.color} fillOpacity={0.35 + 0.65 * e} stroke="#1A1A1A" strokeWidth={0.25} />
          })}
        </svg>
        <PitchKey cols={2} width={SAFE_W} reveal={prog(localT, 0.1, 0.3)} items={rows.map(r => ({ color: r.color, name: shortPitch(r.name), value: `${Math.round(r.usagePct)}%${r.avgVelo != null ? ` · ${r.avgVelo.toFixed(1)}` : ''}` }))} />
      </Body>
      <Foot after={BODY_TOP + bodyH} lines={2}>{`Dots = where each of ${d.line.pitches} pitches landed ) · key shows usage % and avg mph`}</Foot>
    </>
  )
}
