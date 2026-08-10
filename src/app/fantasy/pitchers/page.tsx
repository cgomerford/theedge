// src/app/fantasy/pitchers/page.tsx
//
// Replaces /fantasy/streamers + /fantasy/two-start as standalone pages —
// everything about "which pitcher should I start" lives here now instead
// of scattered across three pages answering variations of the same
// question. Trends (heating/cooling) also folds in here for the pitcher
// side specifically.
//
// TODO: Regression Watch (pitcher rows) is NOT wired in yet. I've only seen
// fragments of regression-watch.ts's real export shape across this session,
// never the whole file — guessing at whether RegressionWatchData exposes
// `.pitchers`/`.batters`, `.rise`/`.drop`, or something else has been wrong
// enough times today that I'm not doing it a third time on this file.
// Paste regression-watch.ts in full and this section gets built for real.
//
// Chart note: the ERA/FIP/K9/WHIP chips below are threshold-colored against
// standard sabermetric bands, NOT computed percentile ranks — this page
// doesn't fetch the full SP pool needed for a real percentile. The
// combinedScore ring IS a real 0–100 value (already computed by the
// pipeline), just newly visualized as a ring instead of a text badge.

import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import FantasySubNav from '@/components/fantasy/FantasySubNav'
import { getCurrentSubscriber } from '@/lib/auth'
import { getStreamersWeek } from '@/lib/fantasy-streamers'
import { getTwoStartPitchers, type TwoStartPitcher } from '@/lib/fantasy-two-start'
import { getPitcherFormSignals, type FormSignalRow } from '@/lib/player-form'
import FantasyPlayerCard from '@/components/fantasy/FantasyPlayerCard'

export const revalidate = 1800
export const metadata = {
  title: 'Pitchers · The Fantasy Desk · The Edge',
  description: 'Streamers, two-start weeks, and trending pitchers — everything about who to start, in one place.',
}

const playerHeadshotUrl = (id: number) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`

const TIER_META = {
  strong: { label: 'Strong', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-500', ring: '#059669' },
  viable: { label: 'Viable', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-500', ring: '#D97706' },
  mixed: { label: 'Mixed', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-500', ring: '#EA580C' },
  avoid: { label: 'Avoid', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-500', ring: '#DC2626' },
} as const

// ── Threshold color bands (vs. league norms — not a computed percentile) ──
function eraFipColor(v: number | null | undefined): string {
  if (v == null) return '#A8A29E'
  if (v < 3.00) return '#059669'
  if (v < 3.75) return '#65A30D'
  if (v < 4.50) return '#D97706'
  return '#DC2626'
}
function k9Color(v: number | null | undefined): string {
  if (v == null) return '#A8A29E'
  if (v >= 10.0) return '#059669'
  if (v >= 8.5) return '#65A30D'
  if (v >= 7.0) return '#D97706'
  return '#DC2626'
}
function whipColor(v: number | null | undefined): string {
  if (v == null) return '#A8A29E'
  if (v < 1.05) return '#059669'
  if (v < 1.20) return '#65A30D'
  if (v < 1.35) return '#D97706'
  return '#DC2626'
}

// ── Ring — percentile-ring-styled SVG, reused wherever we have a genuine
// 0–100 value. Deliberately NOT used for raw ERA/FIP/etc, which aren't
// on a 0–100 scale and aren't percentile ranks in this file's data.
function Ring({
  value,
  size = 56,
  stroke = 5,
  color,
  trackColor = '#EDEBE4',
  valueColor = '#1A1A1A',
}: {
  value: number
  size?: number
  stroke?: number
  color: string
  trackColor?: string
  valueColor?: string
}) {
  const clamped = Math.max(0, Math.min(100, value))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (clamped / 100) * c
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.4s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono font-bold tabular-nums" style={{ fontSize: size * 0.32, color: valueColor }}>
          {Math.round(clamped)}
        </span>
      </div>
    </div>
  )
}

// ── Header trend donut — heating vs cooling split, real counts, no fabrication
function TrendDonut({ heating, cooling }: { heating: number; cooling: number }) {
  const total = heating + cooling
  if (total === 0) return null
  const size = 60, stroke = 8, r = (size - stroke) / 2, c = 2 * Math.PI * r
  const heatLen = (heating / total) * c
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="#DC2626" strokeOpacity={0.85} strokeWidth={stroke}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="#10B981" strokeWidth={stroke}
          strokeDasharray={`${heatLen} ${c - heatLen}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono font-bold text-white text-sm">{total}</span>
      </div>
    </div>
  )
}

// ── Small colored stat chip — threshold-banded, labeled honestly ──────────
function StatChip({ label, value, display, color }: { label: string; value: number | null | undefined; display: string; color: string }) {
  if (value == null) return null
  return (
    <div className="flex flex-col items-center px-2">
      <span className="font-mono text-[8px] uppercase tracking-widest text-stone-400 mb-0.5">{label}</span>
      <span className="font-mono text-xs font-bold" style={{ color }}>{display}</span>
    </div>
  )
}

export default async function PitchersPage() {
  const [streamerDays, twoStart, trends, subscriber] = await Promise.all([
    getStreamersWeek(7),
    getTwoStartPitchers(),
    getPitcherFormSignals(),
    getCurrentSubscriber(),
  ])
  const isPro = subscriber?.is_pro ?? false

  const today = streamerDays.find(d => d.isToday)
  const tonightPicks = today?.picks ?? []

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-stone-900 overflow-x-hidden">
      <SiteHeader variant="page" />
      <FantasySubNav active="pitchers" isPro={isPro} />

      <div className="bg-gradient-to-br from-[#1A1A1A] to-[#2b2b2b] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-orange-500 mb-2">
            § Pitchers
          </div>
          <h1 className="font-serif font-light text-5xl sm:text-7xl tracking-tight leading-none">
            Who to start<span className="text-orange-500">.</span>
          </h1>
          <p className="font-serif italic mt-3 text-base sm:text-lg max-w-2xl text-white/55">
            Tonight's streamers, this week's two-start arms, and who's trending — in one place.
          </p>

          <div className="flex items-center border-t border-white/10 mt-6 pt-4 gap-6">
            <TrendDonut heating={trends.heating.length} cooling={trends.cooling.length} />
            <div className="flex flex-1">
              <div className="flex-1 border-r border-white/10 pr-4">
                <div className="font-display text-3xl leading-none">{trends.heating.length + trends.cooling.length}</div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-white/40 mt-1">Trending today</div>
              </div>
              <div className="flex-1 border-r border-white/10 px-4">
                <div className="font-display text-3xl leading-none text-emerald-400">▲ {trends.heating.length}</div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-white/40 mt-1">Heating up</div>
              </div>
              <div className="flex-1 border-r border-white/10 px-4">
                <div className="font-display text-3xl leading-none text-red-400">▼ {trends.cooling.length}</div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-white/40 mt-1">Cooling off</div>
              </div>
              <div className="flex-1 pl-4">
                <div className="font-display text-3xl leading-none">{twoStart.length}</div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-white/40 mt-1">Two-start this week</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-10">

        {/* ── Trending ── */}
        {(trends.heating.length > 0 || trends.cooling.length > 0) && (
          <section>
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="font-display text-2xl">Trending Now</h2>
              <span className="text-[10px] font-mono uppercase tracking-widest text-stone-400">Form Trend · rolling ERA peak/trough</span>
              <Link href="/fantasy/trends" className="ml-auto text-[10px] font-mono uppercase tracking-widest text-orange-500 hover:text-orange-600">
                Full trends board →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[...trends.heating.slice(0, 2), ...trends.cooling.slice(0, 2)].map(r => (
                <TrendMiniCard key={r.playerId} row={r} />
              ))}
            </div>
          </section>
        )}

        {/* ── Tonight's streamers ── */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="font-display text-2xl">Tonight's Streamers</h2>
            {today?.isToday && (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-[9px] tracking-widest uppercase text-emerald-600">Live</span>
              </span>
            )}
          </div>
          {tonightPicks.length > 0 ? (
            <div className="space-y-2.5">
              {tonightPicks.map(p => <FantasyPlayerCard key={p.id} pick={p} />)}
            </div>
          ) : (
            <div className="border border-dashed border-stone-300 rounded-lg bg-stone-50 p-4 text-sm text-stone-500 font-serif italic">
              Picks compute at 11:30 PM UK. Check back later.
            </div>
          )}
        </section>

        {/* ── Two-start pitchers this week ── */}
        <section>
          <h2 className="font-display text-2xl mb-3">Two-Start Pitchers This Week</h2>
          {twoStart.length === 0 ? (
            <div className="border border-dashed border-stone-300 rounded-lg bg-stone-50 p-6 text-sm text-stone-500 font-serif italic text-center">
              No two-start pitchers in the upcoming 7 days. Schedule confirms 24-48 hrs out.
            </div>
          ) : (
            <div className="space-y-3">
              {twoStart.map(p => <TwoStartRow key={p.playerId} pitcher={p} />)}
            </div>
          )}
        </section>

        {/* ── Regression Watch (pitchers) — placeholder, see file header note ── */}
        <section>
          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-3 pb-2 border-b border-stone-200">
            Regression Watch
          </div>
          <div className="border border-dashed border-stone-300 rounded-lg bg-stone-50 p-6 text-sm text-stone-500 font-serif italic text-center">
            Not wired in yet — see the TODO at the top of this file.
          </div>
        </section>

        {/* ── PRO UPSELL ── */}
        {!isPro && (
          <section className="bg-stone-900 rounded-lg p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-yellow-300 font-bold mb-2">
                  ⊕ Pro Tier · £4/mo · Founding 100
                </div>
                <h3 className="font-serif font-light text-2xl text-white leading-tight mb-2">
                  See the full week, not just tonight.
                </h3>
                <p className="text-sm text-stone-400 font-serif">
                  Pro members get 7-day streamer projections and two-week two-start previews.
                </p>
              </div>
              <Link href="/pricing" className="shrink-0 text-xs font-mono uppercase tracking-widest bg-yellow-300 text-stone-900 px-6 py-3 hover:bg-yellow-200 transition whitespace-nowrap rounded">
                See Pro →
              </Link>
            </div>
          </section>
        )}
      </div>

      <footer className="border-t border-stone-200 mt-8 px-4 sm:px-6 py-8 text-[11px] font-mono text-stone-400 bg-stone-50">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/fantasy" className="hover:text-stone-600 transition">Fantasy Desk</Link>
            <Link href="/fantasy/batters" className="hover:text-stone-600 transition">Batters</Link>
            <Link href="/fantasy/trends" className="hover:text-stone-600 transition">Trends</Link>
          </div>
          <div className="text-stone-300 uppercase tracking-wider">Information only · Not gambling advice</div>
        </div>
      </footer>
    </main>
  )
}

function TrendMiniCard({ row }: { row: FormSignalRow }) {
  const heating = row.signal === 'heating'
  const accentColor = heating ? '#059669' : '#DC2626'
  return (
    <Link
      href={`/stats/player/${row.playerId}?subject=pitcher&name=${encodeURIComponent(row.playerName)}&team=${encodeURIComponent(row.teamName ?? '')}`}
      className="block bg-white border border-stone-200 hover:border-stone-300 transition-colors relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: accentColor }} />
      <div className="p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- external CDN, small fixed size */}
        <img src={playerHeadshotUrl(row.playerId)} alt="" className="w-12 h-12 rounded-full object-cover bg-stone-100 mb-2.5" />
        <div className="font-serif font-bold text-[15px] text-stone-900 leading-tight truncate">{row.playerName}</div>
        <div className="font-mono text-[9.5px] text-stone-400 uppercase mt-0.5">{row.teamName ?? '—'} · SP</div>
        <div className="flex items-baseline gap-2 mt-3">
          <span className="font-display text-3xl leading-none">{row.currentValue.toFixed(2)}</span>
          <span className="font-mono text-[11px] font-bold" style={{ color: accentColor }}>
            {heating ? '▲' : '▼'} {row.magnitude.toFixed(2)}
          </span>
        </div>
      </div>
      <div className="text-center font-mono text-[9.5px] uppercase tracking-wider py-2.5 border-t border-stone-200 text-stone-700 hover:text-orange-600">
        Full trend →
      </div>
    </Link>
  )
}

function TwoStartRow({ pitcher }: { pitcher: TwoStartPitcher }) {
  const meta = TIER_META[pitcher.tier]
  return (
    <div className={`bg-white rounded-lg shadow-sm border ${meta.border} border-l-[3px] overflow-hidden`}>
      <div className="px-4 sm:px-5 py-4 flex items-center gap-4">
        <Ring value={pitcher.combinedScore} color={meta.ring} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-serif font-semibold text-base text-stone-900 leading-tight">{pitcher.playerName}</span>
            <span className="font-mono text-[10px] text-stone-500 tracking-wide">{pitcher.teamName}</span>
            <span className={`font-mono text-[9px] tracking-widest uppercase font-bold ${meta.color}`}>{meta.label}</span>
          </div>
          <div className="mt-2 flex items-center flex-wrap -mx-2 divide-x divide-stone-100">
            <StatChip label="ERA" value={pitcher.era} display={pitcher.era?.toFixed(2) ?? '–'} color={eraFipColor(pitcher.era)} />
            <StatChip label="FIP" value={pitcher.fip} display={pitcher.fip?.toFixed(2) ?? '–'} color={eraFipColor(pitcher.fip)} />
            <StatChip label="K/9" value={pitcher.k9} display={pitcher.k9?.toFixed(1) ?? '–'} color={k9Color(pitcher.k9)} />
            <StatChip label="WHIP" value={pitcher.whip} display={pitcher.whip?.toFixed(2) ?? '–'} color={whipColor(pitcher.whip)} />
          </div>
          <div className="font-mono text-[8px] text-stone-300 mt-1.5 uppercase tracking-wider">vs. league norms · not a percentile rank</div>
        </div>
      </div>
      <div className={`px-4 sm:px-5 py-3 ${meta.bg} border-t ${meta.border} border-opacity-30`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {pitcher.starts.map((start, i) => (
            <div key={i} className="bg-white rounded p-3 border border-stone-200 flex items-center gap-3">
              <Ring
                value={start.matchupScore}
                size={40}
                stroke={4}
                color={
                  start.matchupScore >= 65 ? '#059669' :
                  start.matchupScore >= 50 ? '#D97706' :
                  start.matchupScore >= 40 ? '#EA580C' : '#DC2626'
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-mono text-[10px] text-stone-500">{start.displayDate} · {start.gameTime}</span>
                </div>
                <div className="font-serif text-sm text-stone-900">{start.isHome ? 'vs' : '@'} {start.opponent}</div>
                <div className="font-mono text-[10px] text-stone-500 mt-1">
                  {start.oppWrcPlus != null && <span>wRC+ {start.oppWrcPlus} · </span>}
                  {start.oppRpgL30 != null && <span>{start.oppRpgL30.toFixed(1)} R/G</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}