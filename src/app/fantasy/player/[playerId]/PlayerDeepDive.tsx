// src/app/fantasy/player/[playerId]/PlayerDeepDive.tsx
'use client'

import { useMemo } from 'react'
import { Radar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  RadialLinearScale, PointElement, LineElement, Filler,
  Tooltip, Legend, CategoryScale, LinearScale,
} from 'chart.js'
import PlayerHeadshot from '@/components/fantasy/PlayerHeadshot'
import FantasySectionLabel from '@/components/fantasy/FantasySectionLabel'
import type { PlayerSignalContext, WindowStats, StatcastRolling } from '@/lib/fantasy-player'
import type { PlayerNarrative } from '@/lib/fantasy-narrative'
import type { OwnershipChange } from '@/lib/fantasy-ownership'

ChartJS.register(
  RadialLinearScale, PointElement, LineElement, Filler,
  Tooltip, Legend, CategoryScale, LinearScale,
)

// ─── Direction colors — matches the rest of the site ────────────────────────
const DIRECTION_COLOR = {
  heating: '#059669',
  cooling: '#DC2626',
  neutral: '#78716C',
} as const

const DIRECTION_LABEL = {
  heating: '↑ Heating up',
  cooling: '↓ Cooling off',
  neutral: '→ On baseline',
} as const

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, digits = 3): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toFixed(digits)
}
function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n.toFixed(digits)}%`
}
function fmtInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return String(Math.round(n))
}
function fmtDelta(n: number | null | undefined, digits = 3): string {
  if (n == null || Number.isNaN(n)) return ''
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(digits)}`
}
function deltaClass(n: number | null | undefined, invert = false): string {
  if (n == null || Number.isNaN(n)) return 'text-stone-400'
  const positive = invert ? n < 0 : n > 0
  return positive ? 'text-green-600' : n === 0 ? 'text-stone-400' : 'text-red-500'
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PlayerDeepDive({
  ctx, narrative, ownership, ownershipMove,
}: {
  ctx: PlayerSignalContext
  narrative: PlayerNarrative
  ownership: number | null
  ownershipMove: OwnershipChange | null
}) {
  const accent = DIRECTION_COLOR[narrative.direction]
  const label = DIRECTION_LABEL[narrative.direction]

  // ── Radar dataset: recent (L14) vs season baseline ───────────────────
  // We rescale each axis to [0, 1] against sensible MLB-wide anchors so
  // the two shapes actually differ visually — plotting raw values means
  // OPS (0.7-1.0 range) collapses into a dot next to Barrel% (0-25).
  const radarData = useMemo(() => {
    const s = ctx.statcastSeason
    const l14 = ctx.statcastL14
    // Anchors: [floor, ceiling] approximating 10th–95th percentile qualified batter
    const anchors: Record<string, [number, number]> = {
      OPS: [0.500, 1.000],
      'xBA': [0.180, 0.320],
      'xSLG': [0.300, 0.600],
      'xwOBA': [0.260, 0.420],
      'Barrel%': [0, 20],
      'Hard-hit%': [20, 55],
    }
    const normalize = (val: number | null | undefined, key: keyof typeof anchors): number | null => {
      if (val == null) return null
      const [lo, hi] = anchors[key]
      return Math.max(0, Math.min(1, (val - lo) / (hi - lo)))
    }
    return {
      labels: Object.keys(anchors),
      datasets: [
        {
          label: 'Season baseline',
          data: [
            normalize(ctx.season.ops, 'OPS'),
            normalize(s.xba, 'xBA'),
            normalize(s.xslg, 'xSLG'),
            normalize(s.xwoba, 'xwOBA'),
            normalize(s.barrel_pct, 'Barrel%'),
            normalize(s.hard_hit_pct, 'Hard-hit%'),
          ],
          backgroundColor: 'rgba(120, 113, 108, 0.15)',
          borderColor: 'rgba(120, 113, 108, 0.7)',
          borderWidth: 1.5,
          pointRadius: 2,
          pointBackgroundColor: 'rgba(120, 113, 108, 0.9)',
        },
        {
          label: 'Last 14 days',
          data: [
            normalize(ctx.l14.ops, 'OPS'),
            normalize(l14.xba, 'xBA'),
            normalize(l14.xslg, 'xSLG'),
            normalize(l14.xwoba, 'xwOBA'),
            normalize(l14.barrel_pct, 'Barrel%'),
            normalize(l14.hard_hit_pct, 'Hard-hit%'),
          ],
          backgroundColor: hexToRgba(accent, 0.18),
          borderColor: accent,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: accent,
        },
      ],
    }
  }, [ctx, accent])

  const radarOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { font: { family: 'ui-monospace, monospace', size: 10 }, boxWidth: 12, padding: 12 },
      },
      tooltip: {
        callbacks: {
          // Show the actual value on hover, not the normalized one
          label: (item: { datasetIndex: number; label: string; dataIndex: number }) => {
            const axis = radarData.labels[item.dataIndex]
            const src = item.datasetIndex === 0 ? ctx.statcastSeason : ctx.statcastL14
            const opsSrc = item.datasetIndex === 0 ? ctx.season : ctx.l14
            const rawMap: Record<string, number | null> = {
              OPS: opsSrc.ops,
              'xBA': src.xba,
              'xSLG': src.xslg,
              'xwOBA': src.xwoba,
              'Barrel%': src.barrel_pct,
              'Hard-hit%': src.hard_hit_pct,
            }
            const raw = rawMap[axis]
            const digits = axis === 'Barrel%' || axis === 'Hard-hit%' ? 1 : 3
            return `${item.label}: ${raw == null ? '—' : raw.toFixed(digits)}${(axis.endsWith('%') && raw != null) ? '%' : ''}`
          },
        },
      },
    },
    scales: {
      r: {
        min: 0, max: 1,
        angleLines: { color: 'rgba(120, 113, 108, 0.2)' },
        grid: { color: 'rgba(120, 113, 108, 0.15)' },
        pointLabels: { font: { family: 'ui-monospace, monospace', size: 10 }, color: '#57534e' },
        ticks: { display: false },
      },
    },
  }), [radarData, ctx])

  // ── OPS trend line: Season → L30 → L14 → L7 ─────────────────────────
  const trendData = useMemo(() => ({
    labels: ['Season', 'L30', 'L14', 'L7'],
    datasets: [{
      label: 'OPS',
      data: [ctx.season.ops, ctx.l30.ops, ctx.l14.ops, ctx.l7.ops],
      borderColor: accent,
      backgroundColor: hexToRgba(accent, 0.15),
      borderWidth: 2,
      tension: 0.25,
      pointBackgroundColor: accent,
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: true,
    }],
  }), [ctx, accent])

  const trendOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        ticks: { font: { family: 'ui-monospace, monospace', size: 10 }, color: '#78716c' },
        grid: { color: 'rgba(120, 113, 108, 0.15)' },
      },
      x: {
        ticks: { font: { family: 'ui-monospace, monospace', size: 10 }, color: '#78716c' },
        grid: { display: false },
      },
    },
  }), [])

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 pb-16 pt-4">
      {/* ── Header strip ──────────────────────────────────────────────── */}
      <div className="py-6 border-b border-stone-900 mb-8">
        <div className="flex items-start gap-5">
          <PlayerHeadshot
            playerId={ctx.meta.playerId}
            size={200}
            className="w-24 h-24 md:w-32 md:h-32 object-cover border border-stone-300 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div
              className="font-mono text-[10px] font-bold uppercase tracking-widest mb-1"
              style={{ color: accent }}
            >
              ⊕ {label}
            </div>
            <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight leading-none">
              {ctx.meta.fullName}<span className="text-[#FF5722]">.</span>
            </h1>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {ctx.meta.team && (
                <span className="font-mono text-[10px] uppercase tracking-widest text-stone-500">
                  {ctx.meta.team}
                </span>
              )}
              {ctx.meta.position && (
                <span className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
                  {ctx.meta.position}
                </span>
              )}
              {ctx.meta.bats && (
                <span className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
                  B/T · {ctx.meta.bats}/{ctx.meta.throws}
                </span>
              )}
              {ctx.meta.age != null && (
                <span className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
                  {ctx.meta.age} yr
                </span>
              )}
            </div>

            {/* Ownership strip */}
            <div className="mt-4 flex items-center gap-6 flex-wrap">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-stone-300">ESPN roster</div>
                <div className="font-mono text-lg font-bold text-stone-800 tabular-nums">
                  {ownership != null ? `${Math.round(ownership)}%` : '—'}
                </div>
              </div>
              {ownershipMove && (
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-stone-300">7-day move</div>
                  <div className={`font-mono text-lg font-bold tabular-nums ${
                    ownershipMove.delta > 0 ? 'text-green-600' : 'text-red-500'
                  }`}>
                    {ownershipMove.delta > 0 ? '▲' : '▼'} {Math.abs(ownershipMove.delta).toFixed(1)}pp
                  </div>
                </div>
              )}
              {ownership != null && ownership < 15 && (
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#7C3AED] border border-[#7C3AED] px-2 py-1 self-center">
                  Under-owned
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── THE WHY — top-priority section, the whole reason this page exists ── */}
      <section className="mb-12">
        <FantasySectionLabel accent={accent}>The read</FantasySectionLabel>
        <div
          className="border-l-4 bg-white px-5 md:px-6 py-5 md:py-6"
          style={{ borderColor: accent }}
        >
          <h2 className="font-serif text-xl md:text-2xl font-bold leading-snug mb-3">
            {narrative.headline}
          </h2>
          <p className="font-serif text-[15px] text-stone-700 leading-relaxed mb-5">
            {narrative.paragraph}
          </p>
          {narrative.drivers.length > 0 && (
            <>
              <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-2">
                What&apos;s driving it
              </div>
              <ul className="space-y-1.5">
                {narrative.drivers.map((d, i) => (
                  <li key={i} className="font-serif text-sm text-stone-700 leading-relaxed flex gap-2">
                    <span className="text-[#FF5722] shrink-0">·</span>
                    <span dangerouslySetInnerHTML={{ __html: renderInlineBold(d) }} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {narrative.confidence === 'low' && (
            <div className="font-mono text-[9px] uppercase tracking-widest text-amber-600 mt-4">
              Low-confidence read · limited recent data
            </div>
          )}
        </div>
      </section>

      {/* ── Charts row — trend line + radar ───────────────────────────── */}
      <section className="mb-12 grid md:grid-cols-2 gap-6">
        <div>
          <FantasySectionLabel>OPS trend</FantasySectionLabel>
          <div className="border border-stone-200 bg-white p-4">
            <div className="h-56">
              <Line data={trendData} options={trendOptions} />
            </div>
            <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-stone-100">
              <TrendTile label="Season" value={fmt(ctx.season.ops)} />
              <TrendTile label="L30" value={fmt(ctx.l30.ops)} />
              <TrendTile label="L14" value={fmt(ctx.l14.ops)} />
              <TrendTile label="L7" value={fmt(ctx.l7.ops)} />
            </div>
          </div>
        </div>

        <div>
          <FantasySectionLabel>Statcast shape · L14 vs season</FantasySectionLabel>
          <div className="border border-stone-200 bg-white p-4">
            <div className="h-72">
              <Radar data={radarData} options={radarOptions} />
            </div>
            <p className="font-serif italic text-xs text-stone-500 mt-2 leading-relaxed">
              Each axis normalized to a qualified-batter range so the two shapes are comparable.
              Bigger orange/red shape than grey = better contact profile than baseline.
            </p>
          </div>
        </div>
      </section>

      {/* ── Splits table ───────────────────────────────────────────────── */}
      <section className="mb-12">
        <FantasySectionLabel>Splits</FantasySectionLabel>
        <div className="border border-stone-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="text-left py-2.5 px-3 font-mono text-[9px] uppercase tracking-widest text-stone-500">Window</th>
                <ThStat>G</ThStat>
                <ThStat>OPS</ThStat>
                <ThStat>AVG</ThStat>
                <ThStat>SLG</ThStat>
                <ThStat>HR</ThStat>
                <ThStat>RBI</ThStat>
                <ThStat>SB</ThStat>
                <ThStat>K%</ThStat>
                <ThStat>BB%</ThStat>
              </tr>
            </thead>
            <tbody>
              <SplitsRow label="Season" stats={ctx.season} baseline={ctx.season} />
              <SplitsRow label="L30" stats={ctx.l30} baseline={ctx.season} />
              <SplitsRow label="L14" stats={ctx.l14} baseline={ctx.season} highlight />
              <SplitsRow label="L7" stats={ctx.l7} baseline={ctx.season} />
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Statcast delta cards ──────────────────────────────────────── */}
      <section className="mb-12">
        <FantasySectionLabel>Contact quality · L14 vs season</FantasySectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatcastDeltaCard
            label="Barrel%"
            season={ctx.statcastSeason.barrel_pct}
            recent={ctx.statcastL14.barrel_pct}
            unit="%"
          />
          <StatcastDeltaCard
            label="Hard-hit%"
            season={ctx.statcastSeason.hard_hit_pct}
            recent={ctx.statcastL14.hard_hit_pct}
            unit="%"
          />
          <StatcastDeltaCard
            label="Exit velo"
            season={ctx.statcastSeason.exit_velo_avg}
            recent={ctx.statcastL14.exit_velo_avg}
            unit=" mph"
            digits={1}
          />
          <StatcastDeltaCard
            label="Sweet-spot%"
            season={ctx.statcastSeason.sweet_spot_pct}
            recent={ctx.statcastL14.sweet_spot_pct}
            unit="%"
          />
        </div>
      </section>

      {/* ── Plate discipline & batted ball placeholder ────────────────── */}
      <section className="mb-12">
        <FantasySectionLabel>Plate discipline &amp; batted ball</FantasySectionLabel>
        <div className="border border-dashed border-stone-300 bg-stone-50 px-4 py-5">
          <p className="font-serif italic text-sm text-stone-500">
            Chase%, zone-swing%, contact%, and batted-ball profile (GB/LD/FB, pull%) plug in here
            once the Savant plate-discipline endpoint is wired. Shape and space reserved so the layout
            doesn&apos;t shift when the fetch lands.
          </p>
        </div>
      </section>

      <div className="pt-6 border-t border-stone-200">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-300">
          Information only · Not gambling advice
        </p>
      </div>
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function TrendTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400">{label}</div>
      <div className="font-mono text-sm font-bold text-stone-800 tabular-nums">{value}</div>
    </div>
  )
}

function ThStat({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-right py-2.5 px-3 font-mono text-[9px] uppercase tracking-widest text-stone-500">
      {children}
    </th>
  )
}

function SplitsRow({
  label, stats, baseline, highlight = false,
}: {
  label: string
  stats: WindowStats
  baseline: WindowStats
  highlight?: boolean
}) {
  const opsDelta = stats.ops != null && baseline.ops != null && label !== 'Season'
    ? stats.ops - baseline.ops : null
  return (
    <tr className={`border-b border-stone-100 last:border-0 ${highlight ? 'bg-amber-50/40' : ''}`}>
      <td className="py-2.5 px-3 font-mono text-xs font-bold text-stone-700">{label}</td>
      <td className="py-2.5 px-3 text-right font-mono text-sm tabular-nums text-stone-700">{fmtInt(stats.games)}</td>
      <td className="py-2.5 px-3 text-right font-mono text-sm tabular-nums text-stone-700">
        {fmt(stats.ops)}
        {opsDelta != null && (
          <span className={`ml-1 text-[10px] ${deltaClass(opsDelta)}`}>{fmtDelta(opsDelta)}</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-right font-mono text-sm tabular-nums text-stone-700">{fmt(stats.avg)}</td>
      <td className="py-2.5 px-3 text-right font-mono text-sm tabular-nums text-stone-700">{fmt(stats.slg)}</td>
      <td className="py-2.5 px-3 text-right font-mono text-sm tabular-nums text-stone-700">{fmtInt(stats.hr)}</td>
      <td className="py-2.5 px-3 text-right font-mono text-sm tabular-nums text-stone-700">{fmtInt(stats.rbi)}</td>
      <td className="py-2.5 px-3 text-right font-mono text-sm tabular-nums text-stone-700">{fmtInt(stats.sb)}</td>
      <td className="py-2.5 px-3 text-right font-mono text-sm tabular-nums text-stone-700">{fmtPct(stats.k_rate)}</td>
      <td className="py-2.5 px-3 text-right font-mono text-sm tabular-nums text-stone-700">{fmtPct(stats.bb_rate)}</td>
    </tr>
  )
}

function StatcastDeltaCard({
  label, season, recent, unit, digits = 1,
}: {
  label: string
  season: number | null
  recent: number | null
  unit: string
  digits?: number
}) {
  const delta = season != null && recent != null ? recent - season : null
  return (
    <div className="border border-stone-200 bg-white px-3 py-3">
      <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400">{label}</div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="font-mono text-lg font-bold tabular-nums text-stone-800">
          {recent != null ? recent.toFixed(digits) : '—'}
        </span>
        <span className="font-mono text-[10px] text-stone-400">{unit}</span>
      </div>
      <div className="font-mono text-[10px] text-stone-400 mt-0.5">
        Season {season != null ? `${season.toFixed(digits)}${unit}` : '—'}
        {delta != null && (
          <span className={`ml-1 font-bold ${deltaClass(delta)}`}>
            {fmtDelta(delta, digits)}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function renderInlineBold(s: string): string {
  // Escape then re-inject only **bold** to avoid XSS from narrative source.
  const esc = s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold">$1</strong>')
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const bigint = parseInt(h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
