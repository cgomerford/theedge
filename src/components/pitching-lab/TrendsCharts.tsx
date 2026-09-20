'use client'

// src/components/pitching-lab/TrendsCharts.tsx
//
// "Is this the same pitcher as April?" — src/lib/pitcher-start-trends.ts's
// real per-start data (official box score + live Statcast, merged by
// date), charted. The spec asked for a "dual-axis line: velo + usage by
// start" — that's a dual-y-axis chart, which this site's dataviz rules
// explicitly forbid (two measures of different scale never share an
// axis). Same information, correct chart hygiene instead: velo and usage
// get their own small-multiple panels sharing the same x-axis (start
// date) rather than one chart with two y-scales. Same fix applied to
// ERA/FIP (comparable run-average scale, share one chart) vs xwOBA (a
// .200-.400 rate stat — gets its own chart, not squeezed onto the same
// axis where it would read as a flat line near zero).

import { useMemo, useState } from 'react'
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import { pitchColor } from '@/lib/mlb'
import type { PitcherStartTrends } from '@/lib/pitcher-start-trends'
import { rollingAverage } from '@/lib/pitcher-start-trends'

// 2026-09-14: chased what looked like a recharts ResponsiveContainer
// mount-race (charts appearing blank until a scroll/reflow) through
// several fixes (resize dispatch, mount delay, ResizeObserver remount
// key) — none of them were the real cause. A live DOM check proved the
// SVG paths were rendering correctly with real coordinates within ~1s of
// mount the whole time; the "blank" screenshots were catching recharts'
// default entrance animation (a stroke-dashoffset sweep) mid-transition.
// Fix: turn the animation off — the real data draws immediately instead
// of sweeping in, so there's no window where it can look empty.
const NO_ANIM = { isAnimationActive: false } as const

const AXIS_TICK = { fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">{title}</p>
      {sub && <p className="text-[10px] font-mono text-stone-400 mb-3">{sub}</p>}
      {children}
    </div>
  )
}

function shortDate(d: string): string {
  const parts = d.split('-')
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : d
}

// Real least-squares linear fit over the real per-start values (x = start
// index, y = the metric) — only the fitted value at the first and last
// real data point is returned so a <Line dataKey> can overlay it as a
// straight dashed segment on this chart's categorical (date) x-axis via
// connectNulls. Same real-trend technique as VeloBandChart.tsx /
// EdgePlusGameCard.tsx's linearTrend().
function linearTrendAtEnds(values: (number | null)[]): (number | null)[] {
  const points = values.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v != null)
  const out: (number | null)[] = values.map(() => null)
  if (points.length < 2) return out
  const n = points.length
  const sumX = points.reduce((s, p) => s + p.i, 0)
  const sumY = points.reduce((s, p) => s + p.v, 0)
  const sumXY = points.reduce((s, p) => s + p.i * p.v, 0)
  const sumXX = points.reduce((s, p) => s + p.i * p.i, 0)
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return out
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  const first = points[0].i, last = points[points.length - 1].i
  out[first] = Math.round((slope * first + intercept) * 10) / 10
  out[last] = Math.round((slope * last + intercept) * 10) / 10
  return out
}

// Custom tooltip so "was velo down when he got hit" is answerable from one
// hover — hits/ER/command% shown alongside velo for that exact start,
// without putting them on their own y-axis (very different scales: velo
// ~90-100, hits/ER 0-10, command% 0-100 — sharing an axis with velo would
// misrepresent all three, so this is a text readout, not a second series).
function VeloTooltip({ active, payload }: { active?: boolean; payload?: { payload: Record<string, unknown> }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as {
    fullDate: string; opponent: string; velo: number | null
    hits: number; earnedRuns: number; commandPct: number | null
    strikesThrown: number | null; totalPitches: number
  }
  return (
    <div className="bg-white border border-stone-200 rounded-lg shadow-md px-3 py-2 text-[11px] font-mono">
      <div className="font-bold text-stone-900 mb-1">{d.fullDate} vs {d.opponent}</div>
      <div className="text-stone-600">Velo: <span className="font-bold">{d.velo != null ? `${d.velo.toFixed(1)} mph` : '—'}</span> <span className="text-stone-400">(avg, all real pitches)</span></div>
      <div className="text-stone-600">Hits: <span className="font-bold">{d.hits}</span> · ER: <span className="font-bold">{d.earnedRuns}</span></div>
      <div className="text-stone-600">
        Command%: <span className="font-bold">{d.commandPct != null ? `${d.commandPct.toFixed(1)}%` : '—'}</span>
        {d.strikesThrown != null && <span className="text-stone-400"> ({d.strikesThrown} of {d.totalPitches} pitches were strikes)</span>}
      </div>
    </div>
  )
}

export default function TrendsCharts({ trends }: { trends: PitcherStartTrends }) {
  const [rollWindow, setRollWindow] = useState(5)

  const chartData = useMemo(() => {
    const rows = trends.starts.map(s => ({
      date: shortDate(s.date), fullDate: s.date, opponent: s.opponent,
      velo: s.avgVelo, ip: s.ip, era: s.era, fip: s.fip, xwoba: s.xwoba,
      hits: s.hits, earnedRuns: s.earnedRuns, commandPct: s.commandPct,
      strikesThrown: s.strikesThrown, totalPitches: s.totalPitches,
      heartPct: s.heartPct, edgePct: s.edgePct,
      veloTrend: null as number | null,
      ...s.pitchMix,
    }))
    const trend = linearTrendAtEnds(rows.map(r => r.velo))
    rows.forEach((r, i) => { r.veloTrend = trend[i] })
    return rows
  }, [trends.starts])

  const rollingEra = rollingAverage(trends.starts.map(s => s.era), rollWindow)
  const rollingFip = rollingAverage(trends.starts.map(s => s.fip), rollWindow)
  const rollingXwoba = rollingAverage(trends.starts.map(s => s.xwoba), rollWindow)
  const rollingData = chartData.map((d, i) => ({ date: d.date, era: rollingEra[i], fip: rollingFip[i] }))
  const rollingXwobaData = chartData.map((d, i) => ({ date: d.date, xwoba: rollingXwoba[i] }))

  const topPitches = trends.pitchTypesSeen.slice(0, 5)

  if (trends.starts.length < 2) {
    return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Not enough starts on record yet to chart trends.</div>
  }

  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-2 gap-5">
        <ChartCard title="Velocity by start" sub="Hover a point for hits / ER / command% that start — dot size = earned runs allowed. Faint dashed line is the real linear trend across these starts.">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f1ea" />
              <XAxis dataKey="date" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} domain={['auto', 'auto']} width={36} unit=" mph" />
              <Tooltip content={<VeloTooltip />} />
              <Line
                {...NO_ANIM} type="linear" dataKey="veloTrend"
                stroke="#FF5722" strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="4 3"
                dot={false} activeDot={false} legendType="none" connectNulls
              />
              <Line
                {...NO_ANIM}
                type="monotone" dataKey="velo" name="Velo" stroke="#FF5722" strokeWidth={2} connectNulls
                dot={(props: { cx?: number; cy?: number; payload?: { earnedRuns?: number }; key?: React.Key | null }) => {
                  const { cx, cy, payload, key } = props
                  if (cx == null || cy == null) return <g key={key} />
                  const er = payload?.earnedRuns ?? 0
                  const r = 3 + Math.min(er, 6) * 1.4
                  return <circle key={key} cx={cx} cy={cy} r={r} fill={er > 0 ? '#DC2626' : '#FF5722'} fillOpacity={er > 0 ? 0.55 : 1} stroke="#fff" strokeWidth={1} />
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Pitch usage by start" sub="Top 5 pitches by season usage — separate axis from velo on purpose (different scale)">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f1ea" />
              <XAxis dataKey="date" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} domain={[0, 'auto']} width={36} unit="%" />
              <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? `${v.toFixed(1)}%` : '—')} labelFormatter={(_, p) => p?.[0]?.payload?.fullDate ?? ''} />
              <Legend wrapperStyle={{ fontSize: 9, fontFamily: 'monospace' }} />
              {topPitches.map(pt => (
                <Line {...NO_ANIM} key={pt} type="monotone" dataKey={pt} name={trends.pitchNames[pt] ?? pt} stroke={pitchColor(pt)} strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <ChartCard title={`Rolling ${rollWindow}-start ERA / FIP`} sub="Real per-start box score. FIP uses a fixed 3.10 constant (approximation, not season-specific lgERA).">
          <div className="flex gap-1 mb-2">
            {[3, 5, 8].map(w => (
              <button key={w} onClick={() => setRollWindow(w)} className={`text-[9px] font-mono px-2 py-0.5 rounded border ${rollWindow === w ? 'border-orange-500 text-orange-600 bg-orange-50' : 'border-stone-200 text-stone-400'}`}>{w}-start</button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={rollingData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f1ea" />
              <XAxis dataKey="date" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} domain={['auto', 'auto']} width={32} />
              <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(2) : '—')} />
              <Legend wrapperStyle={{ fontSize: 9, fontFamily: 'monospace' }} />
              <Line {...NO_ANIM} type="monotone" dataKey="era" name="ERA" stroke="#FF5722" strokeWidth={2} dot={false} connectNulls />
              <Line {...NO_ANIM} type="monotone" dataKey="fip" name="FIP" stroke="#2563EB" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={`Rolling ${rollWindow}-start xwOBA`} sub="Estimated wOBA (speed+angle), live Statcast — own axis, different scale than ERA/FIP">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={rollingXwobaData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f1ea" />
              <XAxis dataKey="date" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} domain={['auto', 'auto']} width={36} />
              <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(3).replace(/^0\./, '.') : '—')} />
              <Line {...NO_ANIM} type="monotone" dataKey="xwoba" name="xwOBA" stroke="#059669" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Pitch mix over time" sub="Usage% stacked by start, every pitch type thrown">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f1ea" />
            <XAxis dataKey="date" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} domain={[0, 100]} width={36} unit="%" />
            <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? `${v.toFixed(1)}%` : '—')} labelFormatter={(_, p) => p?.[0]?.payload?.fullDate ?? ''} />
            <Legend wrapperStyle={{ fontSize: 9, fontFamily: 'monospace' }} />
            {trends.pitchTypesSeen.map(pt => (
              <Area {...NO_ANIM} key={pt} type="monotone" dataKey={pt} name={trends.pitchNames[pt] ?? pt} stackId="1" stroke={pitchColor(pt)} fill={pitchColor(pt)} fillOpacity={0.75} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Command trend — heart% vs edge%" sub="Share of pitches in the true middle-middle zone vs the 4 shadow/chase quadrants, per start">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f1ea" />
            <XAxis dataKey="date" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} domain={[0, 'auto']} width={36} unit="%" />
            <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? `${v.toFixed(1)}%` : '—')} labelFormatter={(_, p) => p?.[0]?.payload?.fullDate ?? ''} />
            <Legend wrapperStyle={{ fontSize: 9, fontFamily: 'monospace' }} />
            <Line {...NO_ANIM} type="monotone" dataKey="heartPct" name="Heart%" stroke="#DC2626" strokeWidth={2} dot={false} connectNulls />
            <Line {...NO_ANIM} type="monotone" dataKey="edgePct" name="Edge%" stroke="#2563EB" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
