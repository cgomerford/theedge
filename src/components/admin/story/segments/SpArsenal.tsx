'use client'

import { SANS } from '@/components/team/ui'
import { ARS_HEADLINE, ARS_KICKER } from '../copy'
import { ballAt, BALL_R_IN, planBalls, ZONE_W_IN } from '../arsenalAnim'
import { BODY_TOP, ROW, SAFE_W, SPACE, TYPE } from '../layout'
import { buildEndOf, easeOutCubic, prog } from '../motion'
import Body from '../parts/Body'
import Foot from '../parts/Foot'
import Header from '../parts/Header'
import NamePlate from '../parts/NamePlate'
import type { PitchProfile, StoryGame } from '../types'

type P = { game: StoryGame; localT: number; dur: number }

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v)}%`)
const PLATE_H = 108, HDR_H = 36, ZONE_PX = 300, ZONE_H_IN = 20
const VIEW = { x: -11, y: -2.5, w: 22, h: 28 }                       // inches around the zone
const ZONE_BOX_H = Math.round((ZONE_PX * VIEW.h) / VIEW.w)         // square-correct: same px/inch both ways
const TABLE_W = SAFE_W - ZONE_PX - SPACE.l
const COL = { name: 230, use: 100, mph: 100, whiff: 100, hard: TABLE_W - 230 - 100 - 100 - 100 }
const BLOCK_H = PLATE_H + SPACE.xs + ZONE_BOX_H

/** Strike zone with the pitch mix landing in it, Statcast-arsenal style. Pure function of localT. */
function Zone({ pitches, t, buildEnd }: { pitches: PitchProfile[]; t: number; buildEnd: number }) {
  const balls = planBalls(pitches, ZONE_H_IN, buildEnd)
  return (
    <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="xMidYMid meet" width={ZONE_PX} height={ZONE_BOX_H} style={{ display: 'block', flex: 'none' }}>
      {/* home plate + rule-book zone with its 3×3 cells */}
      <path d={`M ${-ZONE_W_IN / 2} ${ZONE_H_IN + 2} h ${ZONE_W_IN} v 1.2 l ${-ZONE_W_IN / 2} 1.5 l ${-ZONE_W_IN / 2} -1.5 Z`} fill="rgba(250,248,243,.16)" />
      <rect x={-ZONE_W_IN / 2} y={0} width={ZONE_W_IN} height={ZONE_H_IN} fill="rgba(250,248,243,.05)" stroke="rgba(250,248,243,.75)" strokeWidth={0.35} />
      {[1, 2].map(i => <line key={`v${i}`} x1={-ZONE_W_IN / 2 + (i * ZONE_W_IN) / 3} y1={0} x2={-ZONE_W_IN / 2 + (i * ZONE_W_IN) / 3} y2={ZONE_H_IN} stroke="rgba(250,248,243,.22)" strokeWidth={0.2} />)}
      {[1, 2].map(i => <line key={`h${i}`} x1={-ZONE_W_IN / 2} y1={(i * ZONE_H_IN) / 3} x2={ZONE_W_IN / 2} y2={(i * ZONE_H_IN) / 3} stroke="rgba(250,248,243,.22)" strokeWidth={0.2} />)}
      {balls.map((b, i) => {
        const s = ballAt(b, t)
        if (!s.visible) return null
        return s.landed
          ? <circle key={i} cx={s.cx} cy={s.cy} r={BALL_R_IN} fill={b.color} fillOpacity={s.opacity} stroke="#1A1A1A" strokeWidth={0.25} />
          : <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={b.color} fillOpacity={s.opacity} />
      })}
    </svg>
  )
}

export default function SpArsenal({ game, localT, dur }: P) {
  const blocks = (['away', 'home'] as const).map(side => ({ side, pitches: game.arsenal[side], sp: game.sp[side], team: game[side] })).filter(b => b.pitches && b.pitches.length)
  const be = buildEndOf(dur)
  const cell = (txt: string, w: number) => <div style={{ width: w, textAlign: 'right', fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, color: '#FAF8F3', fontVariantNumeric: 'tabular-nums' }}>{txt}</div>
  const hdr = (t: string, w: number) => <div style={{ width: w, textAlign: 'right', fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.7)' }}>{t}</div>
  const bodyH = blocks.length * BLOCK_H + SPACE.l * Math.max(0, blocks.length - 1)
  return (
    <>
      <Header kicker={ARS_KICKER} headline={ARS_HEADLINE} />
      <Body gap={SPACE.l}>
        {blocks.map((b, bi) => {
          const pitches = b.pitches as PitchProfile[]
          const tz = Math.max(0, localT - bi * 0.05)
          return (
            <div key={b.side} style={{ width: SAFE_W, height: BLOCK_H }}>
              <NamePlate id={b.sp.id} name={b.sp.name} short={b.sp.short} sub={`SP · ${b.team.abbr}`} color={b.team.color} head={72} width={SAFE_W} pop={prog(localT, bi * 0.1, 0.25)} />
              <div style={{ display: 'flex', gap: SPACE.l, marginTop: SPACE.xs, alignItems: 'flex-start' }}>
                <Zone pitches={pitches} t={tz} buildEnd={be} />
                <div style={{ width: TABLE_W }}>
                  <div style={{ display: 'flex', alignItems: 'center', height: HDR_H }}>
                    <div style={{ width: COL.name }} />{hdr('USE', COL.use)}{hdr('MPH', COL.mph)}{hdr('WHIFF', COL.whiff)}{hdr('HH', COL.hard)}
                  </div>
                  {pitches.slice(0, 5).map(p => (
                    <div key={p.code + p.name} style={{ display: 'flex', alignItems: 'center', height: ROW.grid, opacity: easeOutCubic(prog(localT, 0.1 + bi * 0.1, 0.3)) }}>
                      <div style={{ width: COL.name, display: 'flex', alignItems: 'center', gap: SPACE.s }}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: p.color, flex: 'none' }} />
                        <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.label, color: '#FAF8F3', whiteSpace: 'nowrap' }}>{p.name.replace('4-Seam Fastball', '4-Seam').replace('Fastball', 'FB')}</span>
                      </div>
                      {cell(pct(p.usagePct), COL.use)}{cell(p.velo != null ? p.velo.toFixed(1) : '—', COL.mph)}{cell(pct(p.whiffPct), COL.whiff)}{cell(pct(p.hardHitPct), COL.hard)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </Body>
      <Foot after={BODY_TOP + bodyH} lines={2}>Dots = where each pitch lands (catcher&apos;s view), one per share of the mix · 2026 reg. season</Foot>
    </>
  )
}
