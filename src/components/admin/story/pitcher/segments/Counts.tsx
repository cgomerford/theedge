'use client'

import { SANS } from '@/components/team/ui'
import { BODY_TOP, SAFE_W, SPACE, TYPE } from '../../layout'
import { buildEndOf, easeOutCubic, prog, revealAt } from '../../motion'
import Body from '../../parts/Body'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import { ZONE_FT } from '../calc'
import { COUNTS_HEADLINE, COUNTS_KICKER, shortPitch } from '../copy'
import { KEY_ROW_H, PitchKey } from '../parts'
import { arsenalRows } from './Arsenal'
import type { PitcherReelData } from '../types'

type P = { d: PitcherReelData; localT: number; dur: number }

const COLS = 3, ROWS = 4, GAP = 12
const BOX_W = (SAFE_W - GAP * (COLS - 1)) / COLS            // 308.67
const BOX_H = 205
const HALF_W = 1.75                                           // ft either side of the plate shown
const VIEW_H = (BOX_H / BOX_W) * (HALF_W * 2)                // same px/ft both ways → round balls, true zone shape
const VIEW_Y0 = ZONE_FT / 2 - VIEW_H / 2                     // zone centred vertically
const ZONE_HALF_W = 17 / 12 / 2
const DOT_R = 0.085

export default function Counts({ d, localT, dur }: P) {
  const be = buildEndOf(dur, 0.6)
  const dots = d.pitchDots
  // global game order drives the animation: the same pitch lands in its count's box at its turn
  const order = dots.map((p, i) => ({ p, i }))
  const boxes = Array.from({ length: ROWS * COLS }, (_, k) => ({ balls: Math.floor(k / COLS), strikes: k % COLS }))
  const keyRows = arsenalRows(d)
  const bodyH = ROWS * BOX_H + GAP * (ROWS - 1) + SPACE.l + Math.ceil(keyRows.length / 3) * KEY_ROW_H
  return (
    <>
      <Header kicker={COUNTS_KICKER} headline={COUNTS_HEADLINE} />
      <Body gap={GAP} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, alignContent: 'flex-start' }}>
        {boxes.map(b => {
          const mine = order.filter(o => o.p.balls === b.balls && o.p.strikes === b.strikes)
          return (
            <div key={`${b.balls}-${b.strikes}`} style={{ position: 'relative', width: BOX_W, height: BOX_H, background: 'rgba(250,248,243,.06)', border: '2px solid rgba(250,248,243,.22)', borderRadius: 20, overflow: 'hidden', boxSizing: 'border-box', opacity: mine.length ? 1 : 0.55 }}>
              <svg width={BOX_W - 4} height={BOX_H - 4} viewBox={`${-HALF_W} ${-(VIEW_Y0 + VIEW_H)} ${HALF_W * 2} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
                <rect x={-ZONE_HALF_W} y={-ZONE_FT} width={ZONE_HALF_W * 2} height={ZONE_FT} fill="rgba(250,248,243,.05)" stroke="rgba(250,248,243,.75)" strokeWidth={0.025} />
                {mine.map(({ p, i }) => {
                  const e = easeOutCubic(prog(localT, revealAt(i, dots.length, be, 0.2, 0.05), 0.2))
                  if (e <= 0) return null
                  const x = Math.max(-HALF_W + DOT_R, Math.min(HALF_W - DOT_R, p.x))
                  const y = Math.max(VIEW_Y0 + DOT_R, Math.min(VIEW_Y0 + VIEW_H - DOT_R, p.z))
                  return <circle key={i} cx={x} cy={-y} r={DOT_R * (1 + (1 - e) * 1.2)} fill={p.color} fillOpacity={0.4 + 0.55 * e} stroke="#1A1A1A" strokeWidth={0.018} />
                })}
              </svg>
              <div style={{ position: 'absolute', left: 14, top: 8, fontFamily: SANS, fontWeight: 800, fontSize: TYPE.foot, color: '#FAF8F3' }}>{b.balls}-{b.strikes}</div>
              <div style={{ position: 'absolute', right: 14, top: 8, fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.7)' }}>{mine.length}</div>
            </div>
          )
        })}
        <div style={{ marginTop: SPACE.l - GAP }}>
          <PitchKey cols={3} width={SAFE_W} items={keyRows.map(r => ({ color: r.color, name: shortPitch(r.name) }))} />
        </div>
      </Body>
      <Foot after={BODY_TOP + bodyH}>{`Catcher's view · balls-strikes · ${dots.length} located pitches`}</Foot>
    </>
  )
}
