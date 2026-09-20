'use client'

// src/components/scout/ZoneMetric.tsx
//
// §10 Zone clash — one metric toggle that re-colours every hitter's 3×3 zone map, for
// both lineups at once. The server renders the cards and hands each map its per-zone
// numbers; only the choice of metric lives here (React context), so nothing refetches.
//
//   Edge     — the default clash view: blue where the hitter has the edge on tonight's
//              starter, orange where the pitcher does (tilt)
//   AVG / SLG / xwOBA / wOBA / EV / Hard-hit — the hitter's own number in each zone
//   Pitches  — how many pitches he has seen there (the sample behind every other view)
// A zone is only coloured with enough behind it; smaller samples are faded and unlabelled.

import { createContext, useContext, useState } from 'react'

export type Metric = 'edge' | 'avg' | 'slg' | 'xwoba' | 'woba' | 'ev' | 'hh' | 'pitches'

export type ZoneStat = {
  tilt: number | null
  pitches: number
  ab: number
  bbe: number
  ba: number | null; slg: number | null; xwoba: number | null; woba: number | null
  ev: number | null; hh: number | null
  /** tooltip text for the Edge view, prepared on the server */
  edgeTitle: string
}

const METRICS: { key: Metric; label: string; long: string }[] = [
  { key: 'edge', label: 'Edge', long: 'Matchup edge against tonight’s starter' },
  { key: 'avg', label: 'AVG', long: 'Batting average in the zone' },
  { key: 'slg', label: 'SLG', long: 'Slugging in the zone' },
  { key: 'xwoba', label: 'xwOBA', long: 'Expected wOBA in the zone (from exit speed and angle)' },
  { key: 'woba', label: 'wOBA', long: 'Actual wOBA in the zone' },
  { key: 'ev', label: 'EV', long: 'Average exit velocity on balls in play in the zone' },
  { key: 'hh', label: 'Hard hit', long: 'Share of balls in play hit 95+ mph in the zone' },
  { key: 'pitches', label: 'Pitches', long: 'Pitches seen in the zone' },
]

// Diverging ramp for the hitter's own numbers: red = hot, blue = cold, grey = about a typical
// league value. [midpoint, distance from midpoint that reaches full colour]. The midpoints are
// round "typical" figures, not a computed league average.
const CENTER: Partial<Record<Metric, { mid: number; span: number; text: string }>> = {
  avg: { mid: 0.245, span: 0.09, text: '.245' }, slg: { mid: 0.41, span: 0.22, text: '.410' },
  xwoba: { mid: 0.315, span: 0.11, text: '.315' }, woba: { mid: 0.315, span: 0.11, text: '.315' },
  ev: { mid: 88, span: 7, text: '88 mph' }, hh: { mid: 38, span: 20, text: '38%' },
}
// samples needed before a zone shows a number for that metric
const GATE: Record<Metric, (z: ZoneStat, minPitches: number) => boolean> = {
  edge: (z, m) => z.pitches >= m && z.tilt != null,
  avg: (z, m) => z.pitches >= m && z.ab >= 8 && z.ba != null,
  slg: (z, m) => z.pitches >= m && z.ab >= 8 && z.slg != null,
  xwoba: (z, m) => z.pitches >= m && z.xwoba != null,
  woba: (z, m) => z.pitches >= m && z.woba != null,
  ev: (z, m) => z.pitches >= m && z.bbe >= 5 && z.ev != null,
  hh: (z, m) => z.pitches >= m && z.bbe >= 5 && z.hh != null,
  pitches: (z) => z.pitches > 0,
}

const valueOf = (m: Metric, z: ZoneStat): number | null =>
  m === 'avg' ? z.ba : m === 'slg' ? z.slg : m === 'xwoba' ? z.xwoba : m === 'woba' ? z.woba : m === 'ev' ? z.ev : m === 'hh' ? z.hh : m === 'pitches' ? z.pitches : z.tilt

const fmt = (m: Metric, v: number): string =>
  m === 'ev' ? v.toFixed(0) : m === 'hh' ? `${v.toFixed(0)}` : m === 'pitches' ? String(v) : v.toFixed(3).replace(/^0/, '')

const EDGE = 0.15
const BLUE = '42,120,214', ORANGE = '235,104,52', RED = '214,64,52'

function edgeColor(t: number): string {
  if (Math.abs(t) < EDGE) return '#eeeeec'
  const a = Math.min(1, Math.abs(t) / 0.6)
  return `rgba(${t > 0 ? BLUE : ORANGE},${(0.25 + a * 0.6).toFixed(2)})`
}

type Ctx = { metric: Metric; setMetric: (m: Metric) => void; available: Record<Metric, boolean> }
const MetricCtx = createContext<Ctx>({ metric: 'edge', setMetric: () => {}, available: { edge: true, avg: true, slg: true, xwoba: true, woba: true, ev: true, hh: true, pitches: true } })

/** Wrap both lineups so the toggle and every map share one choice. `available` disables metrics no hitter has data for yet. */
export function ZoneMetricProvider({ available, children }: { available: Record<Metric, boolean>; children: React.ReactNode }) {
  const [metric, setMetric] = useState<Metric>('edge')
  return <MetricCtx.Provider value={{ metric, setMetric, available }}>{children}</MetricCtx.Provider>
}

export function ZoneMetricToggle() {
  const { metric, setMetric, available } = useContext(MetricCtx)
  const cur = METRICS.find((m) => m.key === metric)!
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/60 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Zone map metric">
        <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mr-1">Show</span>
        {METRICS.map((m) => (
          <button key={m.key} type="button" aria-pressed={metric === m.key} disabled={!available[m.key]} onClick={() => setMetric(m.key)}
            title={available[m.key] ? m.long : `${m.label} isn’t loaded for these hitters yet`}
            className={`text-[10.5px] font-mono px-2 py-1 rounded-md border ${metric === m.key ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'} disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:border-stone-200`}>{m.label}</button>
        ))}
      </div>
      <p className="text-[10px] font-sans text-stone-500 mt-1.5 flex flex-wrap items-center gap-x-1.5">
        <span>{cur.long}.</span>
        {metric === 'edge' ? <span>Blue = hitter edge, orange = pitcher edge.</span>
          : metric === 'pitches' ? <span>Darker = more pitches seen.</span>
          : <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-16 h-2" style={{ background: `linear-gradient(90deg, rgb(${BLUE}), #eeeeec, rgb(${RED}))` }} aria-hidden />
              <span><span style={{ color: `rgb(${BLUE})` }}>blue = cold</span> · grey ≈ {CENTER[metric]?.text} · <span style={{ color: `rgb(${RED})` }}>red = hot</span></span>
            </span>}
      </p>
    </div>
  )
}

const CORE = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** One hitter's 3×3 zone map, coloured by the metric chosen in the toggle. */
export function ZoneMap({ zones, label, minPitches }: { zones: Record<string, ZoneStat>; label: string; minPitches: number }) {
  const { metric } = useContext(MetricCtx)
  const maxPitches = Math.max(1, ...CORE.map((z) => zones[z]?.pitches ?? 0))
  const center = CENTER[metric]
  return (
    <div className="grid grid-cols-3 gap-[3px] w-[96px] mx-auto" role="img" aria-label={label}>
      {CORE.map((zk) => {
        const z = zones[zk]
        if (!z) return <div key={zk} className="h-[30px] rounded-[3px]" style={{ background: '#f5f5f4' }} title="no data" />
        const ok = GATE[metric](z, minPitches)
        const v = valueOf(metric, z)
        let bg = '#f5f5f4', dark = false
        if (ok && v != null) {
          if (metric === 'edge') bg = edgeColor(v)
          else if (metric === 'pitches') {
            const a = 0.08 + (v / maxPitches) * 0.82
            bg = `rgba(87,83,78,${a.toFixed(2)})`; dark = a > 0.5          // a count, not good/bad — neutral stone
          } else if (center) {
            const t = Math.max(-1, Math.min(1, (v - center.mid) / center.span))
            if (Math.abs(t) >= 0.08) { const a = 0.14 + Math.abs(t) * 0.76; bg = `rgba(${t > 0 ? RED : BLUE},${a.toFixed(2)})`; dark = a > 0.5 }
            else bg = '#eeeeec'
          }
        }
        const title = metric === 'edge' ? z.edgeTitle
          : `${METRICS.find((m) => m.key === metric)!.label}: ${ok && v != null ? (metric === 'hh' ? `${v.toFixed(0)}%` : metric === 'ev' ? `${v.toFixed(1)} mph` : fmt(metric, v)) : 'too few'} · ${z.pitches} pitches${metric === 'ev' || metric === 'hh' ? ` · ${z.bbe} balls in play` : metric === 'avg' || metric === 'slg' ? ` · ${z.ab} AB` : ''}`
        return (
          <div key={zk} className="h-[30px] rounded-[3px] flex items-center justify-center text-[9px] font-mono leading-none" style={{ background: bg, color: dark ? '#fff' : '#57534e' }} title={title}>
            {metric !== 'edge' && ok && v != null ? fmt(metric, v) : ''}
          </div>
        )
      })}
    </div>
  )
}
