'use client'

import { SANS } from '@/components/team/ui'
import { HOME } from '../../diamondGeo'
import { BODY_TOP, SPACE, TYPE } from '../../layout'
import { buildEndOf, easeOutCubic, prog, revealAt } from '../../motion'
import Body from '../../parts/Body'
import Diamond from '../../parts/Diamond'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import { HITS_KICKER, hitsHeadline } from '../copy'
import type { PitcherReelData, ReelHit } from '../types'

type P = { d: PitcherReelData; localT: number; dur: number }

const BOX = 820, LEGEND_H = 60, FLIGHT = 0.35
const KIND_COLOR: Record<ReelHit['kind'], string> = { '1B': '#FAF8F3', '2B': '#FDE047', '3B': '#FF9A62', HR: '#FF5722' }

export default function Hits({ d, localT, dur }: P) {
  const hits = d.hits
  const be = buildEndOf(dur, 0.6)
  const counts = (['1B', '2B', '3B', 'HR'] as const).map(k => ({ k, n: hits.filter(h => h.kind === k).length })).filter(c => c.n > 0)
  const hardest = hits.reduce<number | null>((m, h) => (h.exitVelo != null && (m == null || h.exitVelo > m) ? h.exitVelo : m), null)
  const bodyH = BOX + SPACE.m + LEGEND_H
  return (
    <>
      <Header kicker={HITS_KICKER} headline={hitsHeadline(hits.length)} />
      <Body gap={SPACE.m}>
        <div style={{ position: 'relative', width: BOX, height: BOX, alignSelf: 'center' }}>
          <Diamond box={BOX} />
          <svg viewBox="0 0 1000 1000" width={BOX} height={BOX} style={{ position: 'absolute', left: 0, top: 0 }}>
            {hits.map((h, i) => {
              const p = easeOutCubic(prog(localT, revealAt(i, hits.length, be, FLIGHT), FLIGHT))
              if (p <= 0) return null
              const cx = HOME.x + (h.x - HOME.x) * p, cy = HOME.y + (h.y - HOME.y) * p
              const r = h.kind === 'HR' ? 30 : 22
              return (
                <g key={i}>
                  <line x1={HOME.x} y1={HOME.y} x2={cx} y2={cy} stroke={KIND_COLOR[h.kind]} strokeWidth={5} opacity={0.45} />
                  <circle cx={cx} cy={cy} r={r} fill={KIND_COLOR[h.kind]} stroke="#1A1A1A" strokeWidth={5} />
                  {h.kind === 'HR' && p >= 1 && <circle cx={cx} cy={cy} r={r + 12} fill="none" stroke="#FF5722" strokeWidth={5} />}
                </g>
              )
            })}
          </svg>
        </div>
        <div style={{ height: LEGEND_H, display: 'flex', justifyContent: 'center', gap: SPACE.xl, alignItems: 'center' }}>
          {counts.map(c => (
            <div key={c.k} style={{ display: 'flex', alignItems: 'center', gap: SPACE.s }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: KIND_COLOR[c.k], border: '3px solid #1A1A1A' }} />
              <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.sub, color: '#FAF8F3', fontVariantNumeric: 'tabular-nums' }}>{c.n} {c.k}</span>
            </div>
          ))}
        </div>
      </Body>
      <Foot after={BODY_TOP + bodyH} lines={2}>{`Where each hit landed, catcher's view${hardest != null ? ` · hardest hit allowed ${hardest.toFixed(1)} mph` : ''}`}</Foot>
    </>
  )
}
