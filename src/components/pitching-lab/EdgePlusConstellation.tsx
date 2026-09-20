'use client'

// src/components/pitching-lab/EdgePlusConstellation.tsx
//
// A hand-built hub-and-spoke diagram — no chart library ships this shape,
// so it's raw SVG, same pattern as the other custom diagrams in this app
// (ZoneGrid, PrevZoneBoard). The pitcher's real headshot sits at the
// center; each pitch type orbits it as a node sized by its real Edge+
// score (src/lib/edge-plus.ts) and colored by tier; that pitch's real
// percentile components (same numbers as the radar and EdgePlusCard
// elsewhere on this tab) orbit IT as smaller satellites, always in the
// same fixed clock order — 12 o'clock is always Whiff%, going clockwise
// through the rest — so the same satellite position means the same thing
// on every pitch node, comparable purely by shape.
//
// Every dot is a real hover target: hovering or tapping VISUALLY EXPANDS
// that exact dot (bigger radius, not just a tooltip) and opens a richer
// panel with the real value, percentile, and weight — not just a number
// in a tiny box. A tap pins it open (touch-friendly); tap again to unpin.

import { useRef, useState } from 'react'
import { pitchColor } from '@/lib/mlb'
import type { EdgePlusComponent } from '@/lib/edge-plus'

export type ConstellationPitch = {
  pitchType: string
  name: string
  score: number | null
  tierColor: string
  components: EdgePlusComponent[]
}

type Hover = { key: string; x: number; y: number; title: string; value: string; percentile: number | null; weight: number | null; pinned: boolean }

function mlbHeadshot(id: number | string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}

// Sequential, single hue (site orange), light -> dark — same ramp used
// for pitch density elsewhere (PitchDensityHeatmap.tsx), reused here for
// the same job: encoding a 0-100 magnitude (percentile).
function pctColor(pct: number | null): string {
  if (pct == null) return '#E7E2D6'
  if (pct < 12) return '#FDEEE3'
  if (pct < 25) return '#FCD9BD'
  if (pct < 40) return '#FBB989'
  if (pct < 55) return '#F98D4F'
  if (pct < 70) return '#F0652A'
  if (pct < 85) return '#D8451A'
  return '#A8300F'
}

export default function EdgePlusConstellation({ pitcherId, pitches }: { pitcherId: number; pitches: ConstellationPitch[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<Hover | null>(null)

  const withData = pitches.filter(p => p.components.length > 0)
  if (withData.length === 0) return null

  const nComponents = withData[0].components.length
  const size = 640
  const cx = size / 2, cy = size / 2
  const pitchRingR = Math.min(230, 100 + withData.length * 12)
  const satelliteR = 52
  const hubR = 30

  const nodes = withData.map((p, i) => {
    const angle = (i / withData.length) * Math.PI * 2 - Math.PI / 2
    return { ...p, x: cx + Math.cos(angle) * pitchRingR, y: cy + Math.sin(angle) * pitchRingR }
  })

  function moveHover(e: React.MouseEvent, key: string, title: string, value: string, percentile: number | null, weight: number | null) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover(h => (h?.pinned ? h : { key, x: e.clientX - rect.left, y: e.clientY - rect.top, title, value, percentile, weight, pinned: false }))
  }
  function pinHover(e: React.MouseEvent, key: string, title: string, value: string, percentile: number | null, weight: number | null) {
    e.stopPropagation()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover(h => (h?.pinned && h.key === key ? null : { key, x: e.clientX - rect.left, y: e.clientY - rect.top, title, value, percentile, weight, pinned: true }))
  }
  function clearHover() {
    setHover(h => (h?.pinned ? h : null))
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Edge+ constellation</p>
      <p className="text-[10px] font-mono text-stone-400 mb-3">
        Node size = Edge+ score. Each pitch&apos;s satellites are always in the same order — 12 o&apos;clock Whiff%, clockwise through Hard-Hit%, xwOBA, Put-Away%, Extension, Spin, Velo, Movement — brighter/bigger satellite = higher real percentile. Hover or tap any dot — it expands with the real number.
      </p>
      <div ref={containerRef} className="relative w-full max-w-[640px] mx-auto" onMouseLeave={clearHover}>
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full block">
          <defs>
            <clipPath id="edge-constellation-hub-clip">
              <circle cx={cx} cy={cy} r={hubR} />
            </clipPath>
          </defs>

          {nodes.map(p => (
            <line
              key={`spoke-${p.pitchType}`}
              x1={cx} y1={cy} x2={p.x} y2={p.y}
              stroke={p.tierColor}
              strokeWidth={p.score != null ? 1 + (p.score / 100) * 2.5 : 1}
              opacity={0.3}
            />
          ))}

          {nodes.map(p => p.components.map((c, ci) => {
            const angle = (ci / nComponents) * Math.PI * 2 - Math.PI / 2
            const sx = p.x + Math.cos(angle) * satelliteR
            const sy = p.y + Math.sin(angle) * satelliteR
            const color = pctColor(c.percentile)
            const key = `${p.pitchType}-${c.key}`
            const isHovered = hover?.key === key
            const baseR = 3 + ((c.percentile ?? 0) / 100) * 6
            const r = isHovered ? baseR * 1.9 + 2 : baseR
            return (
              <g key={key}>
                <line
                  x1={p.x} y1={p.y} x2={sx} y2={sy}
                  stroke={color} strokeWidth={1.25}
                  opacity={c.percentile != null ? 0.3 + (c.percentile / 100) * 0.5 : 0.15}
                />
                <circle
                  cx={sx} cy={sy} r={Math.max(r, 8)} fill="transparent"
                  onMouseEnter={e => moveHover(e, key, `${p.name} — ${c.label}`, c.value, c.percentile, c.weight)}
                  onMouseMove={e => moveHover(e, key, `${p.name} — ${c.label}`, c.value, c.percentile, c.weight)}
                  onClick={e => pinHover(e, key, `${p.name} — ${c.label}`, c.value, c.percentile, c.weight)}
                  style={{ cursor: 'pointer' }}
                />
                <circle cx={sx} cy={sy} r={r} fill={color} stroke="#fff" strokeWidth={isHovered ? 1.5 : 0.75} pointerEvents="none" style={{ transition: 'r 120ms ease' }} />
              </g>
            )
          }))}

          {nodes.map(p => {
            const key = `pitch-${p.pitchType}`
            const isHovered = hover?.key === key
            const baseR = 20 + ((p.score ?? 0) / 100) * 16
            const r = isHovered ? baseR * 1.15 : baseR
            const sub = `Edge+ ${p.score ?? 'unranked'}`
            return (
              <g key={key}>
                <circle
                  cx={p.x} cy={p.y} r={r} fill={pitchColor(p.pitchType)} fillOpacity={0.88} stroke={p.tierColor} strokeWidth={isHovered ? 3.5 : 2.5}
                  onMouseEnter={e => moveHover(e, key, p.name, sub, p.score, null)}
                  onMouseMove={e => moveHover(e, key, p.name, sub, p.score, null)}
                  onClick={e => pinHover(e, key, p.name, sub, p.score, null)}
                  style={{ cursor: 'pointer', transition: 'r 120ms ease' }}
                />
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={13} fontWeight={600} fill="#fff" pointerEvents="none" style={{ fontFamily: 'system-ui, sans-serif' }}>
                  {p.score ?? '—'}
                </text>
                <text x={p.x} y={p.y + r + 15} textAnchor="middle" fontSize={10} fontWeight={400} fill="#78716C" pointerEvents="none" style={{ fontFamily: 'system-ui, sans-serif' }}>
                  {p.name}
                </text>
              </g>
            )
          })}

          <circle cx={cx} cy={cy} r={hubR + 2} fill="#fff" stroke="#E7E2D6" strokeWidth={2} />
          <image href={mlbHeadshot(pitcherId)} x={cx - hubR} y={cy - hubR} width={hubR * 2} height={hubR * 2} clipPath="url(#edge-constellation-hub-clip)" preserveAspectRatio="xMidYMid slice" />
        </svg>

        {hover && (
          <div
            className="absolute pointer-events-none bg-white border border-stone-200 rounded-lg shadow-lg px-3 py-2 z-10 min-w-[160px]"
            style={{ left: hover.x, top: hover.y, transform: 'translate(-50%, -115%)' }}
          >
            <p className="text-[11px] font-bold text-stone-900 whitespace-nowrap">{hover.title}</p>
            <p className="text-[13px] font-mono font-bold text-stone-900 whitespace-nowrap mt-0.5">{hover.value}</p>
            <p className="text-[10px] font-mono text-stone-500 whitespace-nowrap">
              {hover.percentile != null ? `${hover.percentile}th percentile` : 'No real data yet'}
              {hover.weight != null ? ` · weight ${Math.round(hover.weight * 100)}%` : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
