'use client'
// src/components/TTOFatigueChart.tsx
//
// The Scout Report's signature visual — "does this pitcher fall apart late."
//
// 2026-08-20: switched from wOBA to AVG (your call) — now reads
// tto1_avg/tto2_avg/tto3_avg from pitcher-full-stats.ts, populated by
// fetch_pitcher_tto_splits_v2.py using the same reconciled hit/AB counts
// already verified against real season battersFaced (same script, same
// trust level as the wOBA fields it sits alongside — see that script's
// header for the reconciliation methodology).
//
// SCALE CHANGE — AVG and wOBA are NOT on the same numeric range, so
// every threshold below is recalibrated, not just relabeled:
//   - League-average AVG against sits ~.245-.250 (vs wOBA's ~.310-.320)
//   - AVG has no extra-base-hit weighting, so it swings less per PA than
//     wOBA does — a .030 AVG jump across TTO splits is a real signal on
//     this scale, where a .030 wOBA jump was borderline noise
//   - Color thresholds (avgColor) and headline delta cutoffs below are
//     reasonable starting estimates for THIS scale, same caveat as the
//     original wOBA version had — worth recalibrating once a full
//     season's spread of pitchers has run through the AVG-scale version.
//
// 2026-08-09: (superseded) originally rescaled from ERA to wOBA — see
// git history / fetch_pitcher_tto_splits_v2.py header for why the old
// tto1_era/tto2_era/tto3_era fields were retired in that pass.

type TTOData = {
  tto1_avg: number | null
  tto2_avg: number | null
  tto3_avg: number | null
  tto1_pa: number | null
  tto2_pa: number | null
  tto3_pa: number | null
}

type Props = {
  pitcherName: string
  abbr: string
  tto: TTOData | null
}

function avgColor(avg: number): string {
  if (avg <= 0.220) return '#16a34a'
  if (avg <= 0.260) return '#ca8a04'
  return '#dc2626'
}

function fmtAvg(v: number): string {
  return v.toFixed(3).replace(/^0/, '')
}

export default function TTOFatigueChart({ pitcherName, abbr, tto }: Props) {
  if (!tto || tto.tto1_avg == null || tto.tto2_avg == null || tto.tto3_avg == null) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-1">{abbr} · {pitcherName}</p>
        <p className="text-sm font-serif italic text-stone-400">Not enough starts to chart the order yet.</p>
      </div>
    )
  }

  const points = [
    { label: '1st', avg: tto.tto1_avg, pa: tto.tto1_pa },
    { label: '2nd', avg: tto.tto2_avg, pa: tto.tto2_pa },
    { label: '3rd', avg: tto.tto3_avg, pa: tto.tto3_pa },
  ]

  // AVG floor/ceiling for the y-axis — wide enough to hold realistic
  // outcomes (elite suppression ~.180, disaster outing ~.350+) without
  // every pitcher's line looking flat. Narrower than the old wOBA range
  // since AVG itself has a narrower realistic spread.
  const minAvg = Math.min(0.150, ...points.map(p => p.avg))
  const maxAvg = Math.max(0.350, ...points.map(p => p.avg))
  const range = maxAvg - minAvg

  const W = 260, H = 150, PAD_X = 36, PAD_TOP = 20, PAD_BOTTOM = 34
  const plotH = H - PAD_TOP - PAD_BOTTOM
  const xFor = (i: number) => PAD_X + (i * (W - PAD_X * 2)) / 2
  const yFor = (avg: number) => PAD_TOP + plotH - ((avg - minAvg) / range) * plotH
  const coords = points.map((p, i) => [xFor(i), yFor(p.avg)] as [number, number])
  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${coords[2][0]},${PAD_TOP + plotH} L${coords[0][0]},${PAD_TOP + plotH} Z`

  const delta = tto.tto3_avg - tto.tto1_avg
  const headline =
    delta >= 0.035 ? `Falls off hard the 3rd time through — AVG jumps ${fmtAvg(delta)}.`
    : delta >= 0.018 ? `Fades some the 3rd time through — up ${fmtAvg(delta)}.`
    : delta <= -0.025 ? `Gets stronger deep into starts — AVG drops ${fmtAvg(Math.abs(delta))}.`
    : `Holds steady across the order.`

  const gradId = `tto-grad-${abbr}-${pitcherName.replace(/\s+/g, '')}`

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100">
        <p className="font-mono text-[9px] uppercase tracking-widest text-stone-500">{abbr} · Times Through the Order</p>
      </div>
      <div className="p-4">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#16a34a" stopOpacity="0.25" />
              <stop offset="55%" stopColor="#ca8a04" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#dc2626" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map(f => (
            <line key={f} x1={PAD_X} x2={W - PAD_X} y1={PAD_TOP + plotH * f} y2={PAD_TOP + plotH * f} stroke="#f0ede8" strokeWidth={1} />
          ))}
          <path d={areaPath} fill={`url(#${gradId})`} />
          <path d={linePath} fill="none" stroke="#44403c" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {coords.map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r={5} fill={avgColor(points[i].avg)} stroke="#fff" strokeWidth={2} />
              <text x={x} y={y - 12} textAnchor="middle" fontSize="11" fontFamily="monospace" fontWeight={700} fill="#292524">
                {fmtAvg(points[i].avg)}
              </text>
              <text x={x} y={H - PAD_BOTTOM + 16} textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#a8a29e">
                {points[i].label}
              </text>
              <text x={x} y={H - PAD_BOTTOM + 27} textAnchor="middle" fontSize="8" fontFamily="monospace" fill="#d6d3d1">
                {points[i].pa != null ? `n=${points[i].pa} PA` : ''}
              </text>
            </g>
          ))}
        </svg>
        <p className="text-[12px] font-serif italic text-stone-600 text-center mt-1 px-2 leading-snug">
          {pitcherName} — {headline}
        </p>
      </div>
    </div>
  )
}