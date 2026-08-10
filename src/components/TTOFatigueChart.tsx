'use client'

// src/components/TTOFatigueChart.tsx
//
// The Scout Report's signature visual — "does this pitcher fall apart late."
//
// 2026-08-09: rescaled from ERA to wOBA. Uses tto1_woba/tto2_woba/tto3_woba
// + PA counts from pitcher-full-stats.ts, sourced from
// fetch_pitcher_tto_splits_v2.py (MLB Stats API play-by-play, self-verified
// against real battersFaced — see that script's header comment for why the
// old tto1_era/tto2_era/tto3_era fields were retired).
//
// wOBA scale: league average sits ~.310-.320. Lower is better for a
// pitcher (less damage allowed). Color thresholds and delta cutoffs below
// are reasonable starting estimates — worth recalibrating once a real
// spread of pitchers has been processed by the new script.

type TTOData = {
  tto1_woba: number | null
  tto2_woba: number | null
  tto3_woba: number | null
  tto1_pa: number | null
  tto2_pa: number | null
  tto3_pa: number | null
}

type Props = {
  pitcherName: string
  abbr: string
  tto: TTOData | null
}

function wobaColor(woba: number): string {
  if (woba <= 0.290) return '#16a34a'
  if (woba <= 0.340) return '#ca8a04'
  return '#dc2626'
}

export default function TTOFatigueChart({ pitcherName, abbr, tto }: Props) {
  if (!tto || tto.tto1_woba == null || tto.tto2_woba == null || tto.tto3_woba == null) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-1">{abbr} · {pitcherName}</p>
        <p className="text-sm font-serif italic text-stone-400">Not enough starts to chart the order yet.</p>
      </div>
    )
  }

  const points = [
    { label: '1st', woba: tto.tto1_woba, pa: tto.tto1_pa },
    { label: '2nd', woba: tto.tto2_woba, pa: tto.tto2_pa },
    { label: '3rd', woba: tto.tto3_woba, pa: tto.tto3_pa },
  ]

  // wOBA floor/ceiling for the y-axis — wide enough to hold realistic
  // outcomes (elite suppression ~.250, disaster outing ~.450+) without
  // every pitcher's line looking flat.
  const minWoba = Math.min(0.250, ...points.map(p => p.woba))
  const maxWoba = Math.max(0.450, ...points.map(p => p.woba))
  const range = maxWoba - minWoba
  const W = 260, H = 150, PAD_X = 36, PAD_TOP = 20, PAD_BOTTOM = 34
  const plotH = H - PAD_TOP - PAD_BOTTOM
  const xFor = (i: number) => PAD_X + (i * (W - PAD_X * 2)) / 2
  const yFor = (woba: number) => PAD_TOP + plotH - ((woba - minWoba) / range) * plotH

  const coords = points.map((p, i) => [xFor(i), yFor(p.woba)] as [number, number])
  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${coords[2][0]},${PAD_TOP + plotH} L${coords[0][0]},${PAD_TOP + plotH} Z`

  const delta = tto.tto3_woba - tto.tto1_woba
  const headline =
    delta >= 0.050 ? `Falls off hard the 3rd time through — wOBA jumps ${delta.toFixed(3)}.`
    : delta >= 0.025 ? `Fades some the 3rd time through — up ${delta.toFixed(3)}.`
    : delta <= -0.035 ? `Gets stronger deep into starts — wOBA drops ${Math.abs(delta).toFixed(3)}.`
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
              <circle cx={x} cy={y} r={5} fill={wobaColor(points[i].woba)} stroke="#fff" strokeWidth={2} />
              <text x={x} y={y - 12} textAnchor="middle" fontSize="11" fontFamily="monospace" fontWeight={700} fill="#292524">
                {points[i].woba.toFixed(3)}
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