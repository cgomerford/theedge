'use client'

import { SANS } from '@/components/team/ui'
import { BODY_TOP, SAFE_W, SPACE, TYPE } from '../../layout'
import { buildEndOf, easeOutCubic, prog } from '../../motion'
import Body from '../../parts/Body'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import { biggestSwing } from '../calc'
import { inningLabel, PG_FLOW_HEADLINE, PG_FLOW_KICKER } from '../copy'
import type { PostgameReelData } from '../types'

type P = { d: PostgameReelData; localT: number; dur: number }

const W = SAFE_W, H = 760, PAD = 12, LABEL_H = 56

/** Win-probability line: the home club's share across the game, home colour above the midline, away below. */
export default function Flow({ d, localT, dur }: P) {
  const be = buildEndOf(dur, 0.6)
  const pts = d.flow
  const e = easeOutCubic(prog(localT, 0, be))
  const x = (i: number) => PAD + (i / Math.max(1, pts.length - 1)) * (W - PAD * 2)
  const y = (v: number) => H - PAD - (v / 100) * (H - PAD * 2)
  const line = pts.map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p.home).toFixed(1)}`).join(' ')
  const mid = y(50)
  const area = `${line} L ${x(pts.length - 1).toFixed(1)} ${mid} L ${x(0).toFixed(1)} ${mid} Z`
  const swing = biggestSwing(pts)
  // inning ticks: first point of each new inning
  const ticks = pts.map((p, i) => ({ p, i })).filter(({ p, i }) => i === 0 || p.inning !== pts[i - 1].inning)
  const bodyH = LABEL_H * 2 + H + SPACE.m * 2
  const lab = (abbr: string, color: string, txt: string) => (
    <div style={{ height: LABEL_H, display: 'flex', alignItems: 'center', gap: SPACE.s }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: color, border: '2px solid #FAF8F3', boxSizing: 'border-box' }} />
      <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.label, color: '#FAF8F3' }}>{abbr}</span>
      <span style={{ fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.7)' }}>{txt}</span>
    </div>
  )
  return (
    <>
      <Header kicker={PG_FLOW_KICKER} headline={PG_FLOW_HEADLINE} />
      <Body gap={SPACE.m}>
        {lab(d.home.abbr, d.home.color, 'line above the midline = home club ahead')}
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', background: 'rgba(250,248,243,.05)', borderRadius: 24 }}>
          <defs>
            <clipPath id="pgflow-reveal"><rect x={0} y={0} width={W * e} height={H} /></clipPath>
            <clipPath id="pgflow-top"><rect x={0} y={0} width={W} height={mid} /></clipPath>
            <clipPath id="pgflow-bot"><rect x={0} y={mid} width={W} height={H - mid} /></clipPath>
          </defs>
          <g clipPath="url(#pgflow-reveal)">
            <g clipPath="url(#pgflow-top)"><path d={area} fill={d.home.color} fillOpacity={0.55} /></g>
            <g clipPath="url(#pgflow-bot)"><path d={area} fill={d.away.color} fillOpacity={0.55} /></g>
            <path d={line} fill="none" stroke="#FAF8F3" strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
          </g>
          <line x1={0} y1={mid} x2={W} y2={mid} stroke="rgba(250,248,243,.6)" strokeWidth={3} strokeDasharray="10 10" />
          {ticks.filter(t => t.p.inning % 2 === 1 || ticks.length < 8).map(({ p, i }) => (
            <text key={i} x={x(i)} y={H - 18} fontFamily={SANS} fontSize={TYPE.foot} fill="rgba(250,248,243,.7)" textAnchor="middle">{p.inning}</text>
          ))}
          {swing && e >= 0.999 && (
            <g>
              <circle cx={x(swing.i)} cy={y(pts[swing.i].home)} r={18} fill="#FDE047" stroke="#1A1A1A" strokeWidth={5} />
            </g>
          )}
        </svg>
        {lab(d.away.abbr, d.away.color, 'line below the midline = away club ahead')}
      </Body>
      <Foot after={BODY_TOP + bodyH} lines={2}>{`Win probability after each plate appearance${swing ? ` · biggest swing: ${inningLabel(swing.half, swing.inning)} (yellow dot)` : ''}`}</Foot>
    </>
  )
}
