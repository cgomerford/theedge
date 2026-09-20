// src/components/glossary/StatDiagrams.tsx
//
// A handful of small, reusable SVG diagrams for the stats glossary
// (/mlb/glossary) — schematic, not photographic, and built from this
// site's own chart color tokens (src/components/charts/types.ts) so they
// read as part of the same visual system as every other chart, not a
// bolted-on illustration style. Each VisualKey (see stats-glossary.ts) maps
// to one of these; several related stats share the same diagram since the
// underlying concept (actual vs. expected, a bat/ball geometry, a count
// grid, a speed threshold, a percentile bar) repeats across them.

import type { ReactNode } from 'react'
import { CHART_COLORS, CHART_FONTS } from '@/components/charts/types'
import type { VisualKey } from '@/lib/stats-glossary'

const { orange, positive, negative, grid, axis, ink, mutedInk } = CHART_COLORS

function Frame({ children, height = 150 }: { children: ReactNode; height?: number }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3" style={{ height }}>
      {children}
    </div>
  )
}

// AVG / OBP / SLG / OPS / ISO / BABIP — stacked horizontal bars showing how
// each stat is a strict superset of the one below it (SLG >= OBP-ish range
// isn't literally true, but the "more outcomes counted, further right"
// relationship is the actual teaching point).
function SlashLineDiagram() {
  const rows = [
    { label: 'AVG', value: 0.27, note: 'hits only' },
    { label: 'OBP', value: 0.34, note: '+ walks, HBP' },
    { label: 'SLG', value: 0.46, note: 'hits weighted by bases' },
  ]
  const maxV = 0.5
  return (
    <Frame height={130}>
      <svg viewBox="0 0 300 110" width="100%" height="100%">
        {rows.map((r, i) => {
          const y = 8 + i * 34
          const w = (r.value / maxV) * 200
          return (
            <g key={r.label}>
              <text x={0} y={y + 13} fontSize="11" fontWeight={700} fontFamily={CHART_FONTS.mono} fill={ink}>{r.label}</text>
              <rect x={40} y={y} width={200} height={16} rx={0} fill={grid} />
              <rect x={40} y={y} width={w} height={16} rx={0} fill={orange} opacity={0.85} />
              <text x={246} y={y + 13} fontSize="9.5" fontFamily={CHART_FONTS.mono} fill={mutedInk}>{r.note}</text>
            </g>
          )
        })}
      </svg>
    </Frame>
  )
}

// Bat speed / swing length / miss distance / squared-up — top-down bat vs.
// ball geometry: a tapered bat swinging through the zone, the ball's
// center, and the miss/contact gap between the bat's sweet spot and the
// ball's center highlighted as the thing actually being measured.
function BatPathDiagram() {
  const sweetSpot = { x: 190, y: 55 }
  const ballCenter = { x: 210, y: 40 }
  return (
    <Frame>
      <svg viewBox="0 0 300 130" width="100%" height="100%">
        <text x={8} y={14} fontSize="9" fontFamily={CHART_FONTS.mono} fill={mutedInk}>top-down view</text>
        {/* home plate */}
        <path d="M 60 100 h 24 l 10 10 l -10 10 h -24 z" fill="none" stroke={axis} strokeWidth={1.5} />
        {/* bat, tapered, swinging through */}
        <path d="M 70 70 C 110 66, 150 60, 178 54 C 183 53, 186 55, 185 58 C 184 61, 180 60, 176 60 C 148 65, 112 71, 74 76 Z" fill={mutedInk} opacity={0.85} />
        {/* sweet spot marker */}
        <circle cx={sweetSpot.x} cy={sweetSpot.y} r={4} fill={orange} />
        <text x={sweetSpot.x - 8} y={sweetSpot.y + 18} fontSize="8.5" fontFamily={CHART_FONTS.mono} fill={orange} textAnchor="middle">sweet spot</text>
        {/* incoming ball */}
        <circle cx={ballCenter.x} cy={ballCenter.y} r={5} fill="#fff" stroke={ink} strokeWidth={1.5} />
        <text x={ballCenter.x + 10} y={ballCenter.y - 4} fontSize="8.5" fontFamily={CHART_FONTS.mono} fill={ink}>ball</text>
        {/* gap between sweet spot and ball = the measured distance */}
        <line x1={sweetSpot.x} y1={sweetSpot.y} x2={ballCenter.x} y2={ballCenter.y} stroke={negative} strokeWidth={1.5} strokeDasharray="3,2" />
        <text x={(sweetSpot.x + ballCenter.x) / 2 + 6} y={(sweetSpot.y + ballCenter.y) / 2 - 6} fontSize="8.5" fontFamily={CHART_FONTS.mono} fill={negative}>measured gap</text>
      </svg>
    </Frame>
  )
}

// wOBA/xwOBA, SLG/xSLG, AVG/xBA — actual vs. expected paired bars with the
// gap between them called out, since that gap (not either number alone) is
// usually the actual point of showing an "x-stat."
function ExpectedVsActualDiagram() {
  const actual = 0.34
  const expected = 0.37
  const maxV = 0.45
  const w1 = (actual / maxV) * 200
  const w2 = (expected / maxV) * 200
  return (
    <Frame height={130}>
      <svg viewBox="0 0 300 110" width="100%" height="100%">
        <text x={0} y={16} fontSize="11" fontWeight={700} fontFamily={CHART_FONTS.mono} fill={ink}>Actual</text>
        <rect x={70} y={6} width={200} height={16} fill={grid} />
        <rect x={70} y={6} width={w1} height={16} fill={mutedInk} />
        <text x={0} y={48} fontSize="11" fontWeight={700} fontFamily={CHART_FONTS.mono} fill={ink}>Expected</text>
        <rect x={70} y={38} width={200} height={16} fill={grid} />
        <rect x={70} y={38} width={w2} height={16} fill={positive} />
        <line x1={70 + w1} y1={0} x2={70 + w1} y2={62} stroke={axis} strokeWidth={1} strokeDasharray="2,2" />
        <text x={70 + Math.min(w1, w2)} y={78} fontSize="9" fontFamily={CHART_FONTS.mono} fill={positive} textAnchor="middle">
          gap = quality of contact luck hasn&apos;t caught up to yet
        </text>
      </svg>
    </Frame>
  )
}

// Exit velocity / hard-hit / barrel% / sweet-spot% — a speed gauge arc with
// the 95mph hard-hit threshold marked, and a marker for one example ball.
function ExitVeloGaugeDiagram() {
  const min = 60, max = 115, threshold = 95, value = 101
  const angleFor = (v: number) => -90 + ((v - min) / (max - min)) * 180
  const toXY = (deg: number, r: number) => {
    const rad = (deg * Math.PI) / 180
    return { x: 150 + r * Math.sin(rad), y: 85 - r * Math.cos(rad) }
  }
  const thresholdPt = toXY(angleFor(threshold), 60)
  const valuePt = toXY(angleFor(value), 50)
  const arcStart = toXY(-90, 60)
  const arcMid = toXY(angleFor(threshold), 60)
  const arcEnd = toXY(90, 60)
  return (
    <Frame>
      <svg viewBox="0 0 300 110" width="100%" height="100%">
        <path d={`M ${arcStart.x} ${arcStart.y} A 60 60 0 0 1 ${arcMid.x} ${arcMid.y}`} fill="none" stroke={grid} strokeWidth={10} />
        <path d={`M ${arcMid.x} ${arcMid.y} A 60 60 0 0 1 ${arcEnd.x} ${arcEnd.y}`} fill="none" stroke={orange} strokeWidth={10} />
        <line x1={150} y1={85} x2={thresholdPt.x} y2={thresholdPt.y} stroke={ink} strokeWidth={1} strokeDasharray="2,2" />
        <text x={thresholdPt.x} y={thresholdPt.y - 6} fontSize="8.5" fontFamily={CHART_FONTS.mono} fill={ink} textAnchor="middle">95mph threshold</text>
        <circle cx={valuePt.x} cy={valuePt.y} r={4} fill={ink} />
        <text x={150} y={104} fontSize="9" fontFamily={CHART_FONTS.mono} fill={mutedInk} textAnchor="middle">example: {value}mph batted ball = hard-hit</text>
      </svg>
    </Frame>
  )
}

// Run value / hits & runs allowed / whiff rate — a small ball-strike count
// grid with one cell highlighted, standing in for "this stat is measured
// PER COUNT, and small-sample counts get filtered out."
function CountGridDiagram() {
  const counts = ['0-0', '1-0', '0-1', '1-1', '2-1', '1-2', '2-2', '3-2']
  const highlighted = '1-2'
  return (
    <Frame>
      <svg viewBox="0 0 300 110" width="100%" height="100%">
        <text x={0} y={12} fontSize="9" fontFamily={CHART_FONTS.mono} fill={mutedInk}>balls-strikes count</text>
        {counts.map((c, i) => {
          const col = i % 4
          const row = Math.floor(i / 4)
          const x = 10 + col * 70
          const y = 22 + row * 38
          const isHi = c === highlighted
          return (
            <g key={c}>
              <rect x={x} y={y} width={60} height={30} rx={4} fill={isHi ? orange : grid} opacity={isHi ? 0.9 : 1} />
              <text x={x + 30} y={y + 19} fontSize="11" fontWeight={700} fontFamily={CHART_FONTS.mono} textAnchor="middle" fill={isHi ? '#fff' : mutedInk}>{c}</text>
            </g>
          )
        })}
      </svg>
    </Frame>
  )
}

// Percentile rank — mini Savant-style bar, 0/50/100 marked.
function PercentileBarDiagram() {
  const pct = 82
  return (
    <Frame height={110}>
      <svg viewBox="0 0 300 60" width="100%" height="100%">
        <rect x={10} y={20} width={280} height={14} rx={7} fill={grid} />
        <rect x={10} y={20} width={(pct / 100) * 280} height={14} rx={7} fill={positive} />
        <line x1={150} y1={12} x2={150} y2={42} stroke={axis} strokeWidth={1} />
        <text x={10} y={54} fontSize="9" fontFamily={CHART_FONTS.mono} fill={mutedInk}>0</text>
        <text x={146} y={54} fontSize="9" fontFamily={CHART_FONTS.mono} fill={mutedInk}>50th (avg)</text>
        <text x={272} y={54} fontSize="9" fontFamily={CHART_FONTS.mono} fill={mutedInk}>100</text>
        <text x={10 + (pct / 100) * 280} y={16} fontSize="9.5" fontWeight={700} fontFamily={CHART_FONTS.mono} fill={positive} textAnchor="middle">{pct}th</text>
      </svg>
    </Frame>
  )
}

export function StatVisual({ visual }: { visual: VisualKey }) {
  switch (visual) {
    case 'slash-line': return <SlashLineDiagram />
    case 'bat-path': return <BatPathDiagram />
    case 'expected-vs-actual': return <ExpectedVsActualDiagram />
    case 'exit-velo-gauge': return <ExitVeloGaugeDiagram />
    case 'count-grid': return <CountGridDiagram />
    case 'percentile-bar': return <PercentileBarDiagram />
    case 'none': return null
  }
}
