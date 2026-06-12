'use client'

/**
 * src/components/FantasyTabContent.tsx
 * Fantasy tab — rebuilt to match GM Lab / Pitching Lab quality level.
 * Sections:
 *   1. Methodology Panel (collapsible)
 *   2. Starting Pitchers (with TTO, verdict, proj, contrarian)
 *   3. Batter Intelligence table (platoon flags, proj, DFS value)
 *   4. DFS Stack Pick (hero card)
 *   5. Bullpen Watch
 */

import React, { useState, useEffect } from 'react'
import type { FantasyCards, FantasyVerdict } from '@/lib/fantasy-cards'
import BatterCardStrip from '@/components/BatterCardStrip'

// ── Types ─────────────────────────────────────────────────────────────────────

type BullpenData = {
  era: number | null
  ip_yesterday: number | null
  closer_available: boolean | null
  ip_last_3?: number | null
  k_per_9?: number | null
}

type PitcherStats = {
  era?: number | null
  fip?: number | null
  k_per_9?: number | null
  bb_per_9?: number | null
  l3_era?: number | null
  vs_lhb_baa?: number | null
  vs_rhb_baa?: number | null
  tto1_era?: number | null
  tto2_era?: number | null
  tto3_era?: number | null
  throws?: string | null
  player_name?: string | null
}

type ParkData = {
  hr_factor: number | null
  run_factor: number | null
  is_dome: boolean
}

type WeatherData = {
  temp_f: number
  wind_mph: number
  wind_dir: string
}

type FantasyTabContentProps = {
  fantasyCards: FantasyCards | null
  homeAbbr: string
  awayAbbr: string
  homeBullpen: BullpenData
  awayBullpen: BullpenData
  awayPitcherStats?: PitcherStats | null
  homePitcherStats?: PitcherStats | null
  park?: ParkData | null
  weather?: WeatherData | null
  venueName?: string | null
  isPro: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatIP(ip: number): string {
  const full = Math.floor(ip)
  const thirds = Math.round((ip - full) * 3)
  return `${full}.${thirds}`
}

function ttoColor(v: number | null): string {
  if (v == null) return '#78716C'
  if (v <= 0.280) return '#15803D'
  if (v <= 0.310) return '#2563EB'
  if (v <= 0.340) return '#D97706'
  return '#DC2626'
}

function ttoLabel(v: number | null): string {
  if (v == null) return '–'
  return v.toFixed(3)
}

function verdictStyle(v: FantasyVerdict): { bg: string; color: string } {
  switch (v) {
    case 'START': return { bg: 'rgba(21,128,61,0.12)',   color: '#15803D' }
    case 'SIT':   return { bg: 'rgba(217,119,6,0.12)',   color: '#D97706' }
    case 'AVOID': return { bg: 'rgba(220,38,38,0.12)',   color: '#DC2626' }
    case 'BENCH': return { bg: 'rgba(120,113,108,0.12)', color: '#78716C' }
    default:      return { bg: 'rgba(120,113,108,0.12)', color: '#78716C' }
  }
}

function dfsValueLabel(rating: number): { label: string; bg: string; color: string } {
  if (rating >= 5) return { label: 'Elite', bg: 'rgba(21,128,61,0.12)',   color: '#15803D' }
  if (rating >= 4) return { label: 'Good',  bg: 'rgba(37,99,235,0.10)',   color: '#2563EB' }
  if (rating >= 3) return { label: 'Avg',   bg: 'rgba(120,113,108,0.10)', color: '#78716C' }
  return               { label: 'Fade',  bg: 'rgba(220,38,38,0.10)',   color: '#DC2626' }
}

// ── MetricTip ─────────────────────────────────────────────────────────────────

function MetricTip({ children, tip }: { children: React.ReactNode; tip: string }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const ref = React.useRef<HTMLSpanElement>(null)

  function handleEnter() {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setPos({ x: rect.left + rect.width / 2, y: rect.top - 8 })
    }
    setShow(true)
  }

  return (

    <span
      ref={ref}
      className="relative inline-flex items-center gap-1 cursor-help"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
      onTouchStart={() => {
        handleEnter()
        setShow(s => !s)
      }}
    >
      {children}
      <span
        className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-bold shrink-0"
        style={{ background: 'rgba(120,113,108,0.15)', color: '#78716C' }}
      >
        ?
      </span>
      {show && (
        <span
          className="fixed w-52 px-3 py-2 rounded-lg text-[10px] font-mono leading-relaxed text-white z-[9999]"
          style={{
            background: '#1A1A1A',
            left: pos.x,
            top: pos.y,
            transform: 'translate(-50%, -100%)',
            whiteSpace: 'normal',
            pointerEvents: 'none',
          }}
        >
          {tip}
          <span
            className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent"
            style={{ borderTopColor: '#1A1A1A' }}
          />
        </span>
      )}
    </span>
  )
}

// ── Methodology Panel ─────────────────────────────────────────────────────────

function MethodologyPanel() {
  const [open, setOpen] = useState(true)

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem('edge_fantasy_method_dismissed')
      if (dismissed === 'true') setOpen(false)
    } catch {}
  }, [])

  function dismiss() {
    setOpen(false)
    try { localStorage.setItem('edge_fantasy_method_dismissed', 'true') } catch {}
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left px-4 py-3 rounded-xl border border-stone-200 flex items-center justify-between hover:bg-stone-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-orange-500 font-bold uppercase tracking-widest">
            ⊕ How we build this
          </span>
          <span className="font-mono text-[9px] text-stone-400">— tap to expand</span>
        </div>
        <span className="text-stone-400 text-xs">↓</span>
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-stone-200 overflow-hidden bg-white">
      <div
        className="px-5 py-3 border-b border-stone-100 flex items-center justify-between"
        style={{ background: '#FAFAF8' }}
      >
        <span className="font-mono text-[9px] text-orange-500 font-bold uppercase tracking-widest">
          ⊕ How we build this
        </span>
        <button
          onClick={dismiss}
          className="font-mono text-[9px] text-stone-400 hover:text-stone-600 transition-colors uppercase tracking-wider"
        >
          Got it ✕
        </button>
      </div>

      <div className="px-5 py-4 space-y-4">
        <p
          className="font-serif italic text-sm text-stone-600 leading-relaxed"
          style={{
            borderLeft: '3px solid #FDE047',
            background: 'rgba(253,224,71,0.06)',
            padding: '10px 14px',
            borderRadius: '0 6px 6px 0',
          }}
        >
          Every number here is generated fresh each day using our V4 model data built on a python framework — real Statcast metrics,
          platoon splits, and park factors — then it is passed through Claude Haiku to provide an explanation in plain English. We combine all of that into a single START/SIT/AVOID verdict and a DFS Value rating to help you make informed decisions at a glance.
        </p>

        <div className="grid md:grid-cols-2 gap-3">
          {[
            {
              label: 'Verdicts (START / SIT / AVOID)',
              body: "Combines ERA, FIP, K/9, park HR factor, bullpen fatigue, and platoon matchup into a single recommendation. FIP is weighted more heavily than ERA because it removes defensive luck.",
            },
            {
              label: 'Projected stats',
              body: "IP, K, ER, BB for pitchers — H, HR, RBI, SB for batters. Built from season averages adjusted for tonight's park factor, opposing pitcher quality, and recent form (L3 ERA trend).",
            },
            {
              label: 'TTO (Times Through Order)',
              body: 'Shows xwOBA allowed the 1st, 2nd, and 3rd time through the batting order. Lower = better. A big jump from 2nd to 3rd TTO means the manager should pull him before the lineup comes around again.',
            },
            {
              label: 'Platoon flags',
              body: 'LHB ✓ or RHB ✓ means the opposing pitcher has a meaningful split (>25 points of BAA) against that handedness. Target batters with the platoon advantage.',
            },
            {
              label: 'DFS Value (Elite / Good / Avg / Fade)',
              body: "A ceiling-vs-salary composite. Elite = high upside relative to expected salary tier. Fade = projection doesn't justify the price. Season-long: treat as start/sit confidence.",
            },
            {
              label: 'DFS Stack Pick',
              body: 'Two or three hitters from the same team to correlate. Stacking works because when a team scores a lot, multiple players benefit. We pick the stack with the best platoon matchup, park, and lineup position upside.',
            },
          ].map((item, i) => (
            <div key={i} className="bg-stone-50 rounded-lg px-4 py-3">
              <div className="font-mono text-[9px] font-bold text-orange-500 uppercase tracking-wider mb-1.5">
                ⊕ {item.label}
              </div>
              <p className="font-serif text-xs text-stone-600 leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>

        <p className="font-mono text-[9px] text-stone-400 leading-relaxed border-t border-stone-100 pt-3">
          Projections are probabilistic estimates, not guarantees. The Edge provides analysis only. Always consider the full context and your own judgment when making fantasy decisions.
        </p>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">
      § {children}
    </h3>
  )
}

function ReadLine({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-4 py-3 mb-4 rounded-r-lg border-l-[3px] border-yellow-400 font-serif italic text-sm text-stone-600 leading-relaxed"
      style={{ background: 'rgba(253,224,71,0.07)' }}
    >
      {children}
    </div>
  )
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="w-2 h-2 rounded-full"
          style={{ background: i < rating ? '#FF5722' : '#D4D0C8' }} />
      ))}
    </div>
  )
}

function PendingCard({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-5 flex items-center gap-3">
      <span className="text-stone-300 text-lg">◎</span>
      <div>
        <div className="text-sm font-serif text-stone-500">{label}</div>
        <div className="text-[10px] font-mono text-stone-400 mt-0.5 uppercase tracking-widest">
          Updates ~3 hrs pre-game
        </div>
      </div>
    </div>
  )
}

// ── SP Card ───────────────────────────────────────────────────────────────────

function SPCard({
  card,
  stats,
  abbr,
}: {
  card: NonNullable<FantasyCards>['pitchers'][0]
  stats: PitcherStats | null | undefined
  abbr: string
}) {
  const vs = verdictStyle(card.verdict)
  const tto1 = stats?.tto1_era ?? null
  const tto2 = stats?.tto2_era ?? null
  const tto3 = stats?.tto3_era ?? null
  const hasTTO = tto1 != null || tto2 != null || tto3 != null

  const isImproving = stats?.l3_era != null && stats?.era != null && stats.l3_era < stats.era - 0.3
  const isDeclining = stats?.l3_era != null && stats?.era != null && stats.l3_era > stats.era + 0.5
  const trendLabel = isImproving ? '↑ Trending up' : isDeclining ? '↓ Declining' : null
  const trendColor = isImproving ? '#15803D' : '#DC2626'

  const projStats = [
    {
      label: (
        <MetricTip tip="Projected innings pitched — based on season avg, pitch count trends, and team hook tendencies">
          Proj IP
        </MetricTip>
      ),
      value: card.proj.ip.toFixed(1),
      danger: false,
    },
    {
      label: (
        <MetricTip tip="Projected strikeouts — weighted by K/9, opposing lineup K%, and park strikeout factor">
          Proj K
        </MetricTip>
      ),
      value: String(card.proj.k),
      danger: false,
    },
    {
      label: (
        <MetricTip tip="Projected earned runs — adjusted for park HR factor, opposing OPS, and pitcher FIP vs ERA gap">
          Proj ER
        </MetricTip>
      ),
      value: String(card.proj.er),
      danger: card.proj.er >= 3,
    },
    {
      label: (
        <MetricTip tip="Projected walks — high BB/9 pitchers lose value in tight park conditions">
          Proj BB
        </MetricTip>
      ),
      value: String(card.proj.bb),
      danger: false,
    },
  ]

  const ttoStats = [
    {
      label: (
        <MetricTip tip="xwOBA allowed 1st time through the order. Lower = pitcher dominating early at-bats">
          1st time thru
        </MetricTip>
      ),
      val: tto1,
    },
    {
      label: (
        <MetricTip tip="xwOBA 2nd time through. Batters have seen his arsenal once — typically harder to get outs">
          2nd time thru
        </MetricTip>
      ),
      val: tto2,
    },
    {
      label: (
        <MetricTip tip="xwOBA 3rd time through. A sharp rise here means pull him before the lineup comes around again">
          3rd time thru
        </MetricTip>
      ),
      val: tto3,
    },
  ]

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4" style={{ background: '#1A1A1A' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[9px] text-orange-500 uppercase tracking-widest mb-1">
              {abbr} · Starting Pitcher
            </div>
            <div className="font-serif font-semibold text-white text-lg leading-tight">{card.name}</div>
            <div className="font-mono text-[9px] text-white/40 mt-1 uppercase tracking-wider">
              {stats?.era != null && `${stats.era.toFixed(2)} ERA`}
              {stats?.fip != null && ` · ${stats.fip.toFixed(2)} FIP`}
              {stats?.k_per_9 != null && ` · ${stats.k_per_9.toFixed(1)} K/9`}
              {trendLabel && (
                <span className="ml-2 font-bold" style={{ color: trendColor }}>{trendLabel}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span
              className="font-mono text-[10px] font-bold px-2.5 py-1 rounded uppercase tracking-wider"
              style={{ background: vs.bg, color: vs.color, border: `1px solid ${vs.color}30` }}
            >
              {card.verdict}
            </span>
            <Stars rating={card.rating} />
          </div>
        </div>
        {card.top_pitch && (
          <div
            className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold px-2.5 py-1 rounded"
            style={{ background: 'rgba(255,87,34,0.15)', color: '#FF5722' }}
          >
            ⊕ {card.top_pitch}
          </div>
        )}
      </div>

      <div className="px-4 pt-4">
        <ReadLine>{card.rationale}</ReadLine>
      </div>

      <div className="grid grid-cols-4 border-t border-stone-100">
        {projStats.map((s, i) => (
          <div key={i} className="text-center py-3 border-r border-stone-100 last:border-r-0">
            <div
              className="font-bold leading-none mb-1"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '28px',
                color: s.danger ? '#DC2626' : '#1A1A1A',
              }}
            >
              {s.value}
            </div>
            <div className="font-mono text-[9px] text-stone-400 uppercase tracking-wider flex items-center justify-center">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {hasTTO && (
        <div className="grid grid-cols-3 border-t border-stone-100">
          {ttoStats.map((t, i) => (
            <div
              key={i}
              className="text-center py-2.5 border-r border-stone-100 last:border-r-0"
              style={{ background: t.val != null && t.val > 0.350 ? 'rgba(220,38,38,0.03)' : 'transparent' }}
            >
              <div className="font-mono text-sm font-bold" style={{ color: ttoColor(t.val) }}>
                {ttoLabel(t.val)}
              </div>
              <div className="font-mono text-[8px] text-stone-400 uppercase tracking-wider mt-0.5 flex items-center justify-center">
                {t.label}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className="px-4 py-3 border-t border-stone-100 flex items-start gap-2"
        style={{ background: 'rgba(120,113,108,0.04)' }}
      >
        <span className="font-mono text-[9px] font-bold text-stone-500 bg-stone-100 px-2 py-1 rounded shrink-0 uppercase tracking-wider">
          Bear
        </span>
        <span className="font-serif italic text-xs text-stone-500 leading-relaxed">{card.contrarian}</span>
      </div>
    </div>
  )
}

// ── Batter Table ──────────────────────────────────────────────────────────────

function BatterTable({
  batters,
  abbr,
  opposingPitcherStats,
  isPro,
}: {
  batters: NonNullable<FantasyCards>['batters']
  abbr: string
  opposingPitcherStats: PitcherStats | null | undefined
  isPro: boolean
}) {
  if (batters.length === 0) return null

  const vsLhb = opposingPitcherStats?.vs_lhb_baa
  const vsRhb = opposingPitcherStats?.vs_rhb_baa
  const hasPlatoonEdge = vsLhb != null && vsRhb != null && Math.abs(vsLhb - vsRhb) > 0.025

  const platoonStr = hasPlatoonEdge
    ? vsLhb! > vsRhb!
      ? `Opposing SP vulnerable to LHB (.${Math.round(vsLhb! * 1000)} BAA). Target left-handed hitters.`
      : `Opposing SP vulnerable to RHB (.${Math.round(vsRhb! * 1000)} BAA). Target right-handed hitters.`
    : null

  const platoonAdv = vsLhb != null && vsRhb != null
    ? vsLhb > vsRhb + 0.025
      ? { label: 'RHB ✓', color: '#16A34A', bg: 'rgba(21,128,61,0.10)' }
      : vsRhb > vsLhb + 0.025
        ? { label: 'LHB ✓', color: '#16A34A', bg: 'rgba(21,128,61,0.10)' }
        : { label: 'Even', color: '#78716C', bg: 'rgba(120,113,108,0.08)' }
    : null

  return (
    <div>
      {platoonStr && <ReadLine>{platoonStr}</ReadLine>}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div
          className="grid border-b border-stone-100 px-4 py-2"
          style={{ gridTemplateColumns: '28px 1fr 80px 60px 55px 52px', gap: '12px', background: '#FAFAF8' }}
        >
          <div />
          <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400">Batter</div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400 text-right">
            <MetricTip tip="H, HR, RBI, SB projections — season rates adjusted for tonight's matchup, park, and pitcher quality">
              Projection
            </MetricTip>
          </div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400 text-center">
            <MetricTip tip="Does this batter have a handedness advantage vs tonight's starter? LHB ✓ means the pitcher gives up significantly more to left-handers">
              Platoon
            </MetricTip>
          </div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400 text-center">
            <MetricTip tip="Ceiling vs salary estimate. Elite = high upside for the price. Fade = doesn't justify the cost in DFS or deep leagues">
              DFS Val
            </MetricTip>
          </div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400 text-center">
            <MetricTip tip="START = strong play everywhere. SIT = viable but concerns. BENCH = deep leagues only. AVOID = fade completely">
              Play
            </MetricTip>
          </div>
        </div>

        {batters.map((b, i) => {
          const vs = verdictStyle(b.verdict)
          const dfs = dfsValueLabel(b.rating)

          if (!isPro && i >= 2) {
            return (
              <div
                key={i}
                className="grid items-center px-4 py-3 border-t border-stone-50"
                style={{
                  gridTemplateColumns: '28px 1fr 80px 60px 55px 52px',
                  gap: '12px',
                  opacity: 0.35,
                  filter: 'blur(3px)',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              >
                <div className="w-6 h-6 rounded-full bg-stone-200 flex items-center justify-center font-mono text-xs text-stone-500">
                  {b.batting_order ?? i + 1}
                </div>
                <div>
                  <div className="font-serif text-sm font-semibold text-stone-900">{b.name}</div>
                  <div className="font-mono text-[9px] text-stone-400 uppercase mt-0.5">{b.position} · {b.team}</div>
                </div>
                <div className="text-right font-mono text-xs text-stone-400">
                  {b.proj.h.toFixed(1)}H · {b.proj.hr.toFixed(1)}HR
                </div>
                <div /><div /><div />
              </div>
            )
          }

          return (
            <div
              key={i}
              className="grid items-center px-4 py-3 border-t border-stone-50 hover:bg-stone-50/50 transition-colors"
              style={{ gridTemplateColumns: '28px 1fr 80px 60px 55px 52px', gap: '12px' }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center font-bold shrink-0"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: '15px',
                  background: b.verdict === 'START' ? '#1A1A1A' : '#F4F0E8',
                  color: b.verdict === 'START' ? '#FAF8F3' : '#1A1A1A',
                }}
              >
                {b.batting_order ?? i + 1}
              </div>
              <div className="min-w-0">
                <div className="font-serif text-sm font-semibold text-stone-900 leading-tight">{b.name}</div>
                <div className="font-mono text-[9px] text-stone-400 uppercase tracking-wider mt-0.5">
                  {b.position} · {b.team}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs font-bold text-stone-700">
                  {b.proj.h.toFixed(1)}H · {b.proj.hr.toFixed(1)}HR
                </div>
                <div className="font-mono text-[9px] text-stone-400 mt-0.5">
                  {b.proj.rbi.toFixed(1)} RBI{b.proj.sb > 0.1 ? ` · ${b.proj.sb.toFixed(1)}SB` : ''}
                </div>
              </div>
              <div className="text-center">
                {platoonAdv && (
                  <span
                    className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: platoonAdv.bg, color: platoonAdv.color }}
                  >
                    {platoonAdv.label}
                  </span>
                )}
              </div>
              <div className="text-center">
                <span
                  className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: dfs.bg, color: dfs.color }}
                >
                  {dfs.label}
                </span>
              </div>
              <div className="text-center">
                <span
                  className="font-mono text-[9px] font-bold px-2 py-1 rounded uppercase"
                  style={{ background: vs.bg, color: vs.color, border: `1px solid ${vs.color}25` }}
                >
                  {b.verdict}
                </span>
              </div>
            </div>
          )
        })}

        {!isPro && batters.length > 2 && (
          <div
            className="px-5 py-4 border-t border-stone-100 flex items-center justify-between"
            style={{ background: 'rgba(255,87,34,0.03)' }}
          >
            <div>
              <div className="font-serif font-semibold text-stone-900 text-sm">
                {batters.length - 2} more batters + stack pick
              </div>
              <div className="font-serif italic text-xs text-stone-400 mt-0.5">
                Full batter grid, platoon analysis, and DFS correlations — Pro only.
              </div>
            </div>
            <a
              href="/pricing"
              className="font-mono text-[10px] uppercase tracking-widest px-4 py-2 rounded whitespace-nowrap transition-colors"
              style={{ background: '#1A1A1A', color: '#FDE047' }}
            >
              Pro →
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

// ── DFS Stack Hero ────────────────────────────────────────────────────────────

function StackHero({
  stack,
  park,
  weather,
}: {
  stack: NonNullable<FantasyCards>['stack_pick']
  park: ParkData | null | undefined
  weather: WeatherData | null | undefined
}) {
  if (!stack) return null

  const isHitterPark = (park?.hr_factor ?? 1) > 1.05
  const isWindOut = weather?.wind_dir?.toLowerCase().includes('out') && (weather?.wind_mph ?? 0) > 8

  const contextTags = [
    isHitterPark && park?.hr_factor != null
      ? { label: `HR factor ${park.hr_factor.toFixed(2)} ↑`, color: '#DC2626', bg: 'rgba(220,38,38,0.12)' }
      : null,
    isWindOut
      ? { label: `Wind out ${weather!.wind_mph}mph`, color: '#D97706', bg: 'rgba(217,119,6,0.12)' }
      : null,
    weather?.temp_f != null && weather.temp_f > 82
      ? { label: `${weather.temp_f}°F — ball carries`, color: '#D97706', bg: 'rgba(217,119,6,0.10)' }
      : null,
  ].filter(Boolean) as { label: string; color: string; bg: string }[]

  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ background: '#1A1A1A', borderColor: 'rgba(255,87,34,0.25)' }}
    >
      <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] text-orange-500 uppercase tracking-widest mb-2">
              ⊕ Tonight's DFS Stack · {stack.team}
            </div>
            <div className="flex flex-wrap gap-2">
              {stack.players.map(p => (
                <span
                  key={p}
                  className="font-mono text-[11px] font-bold px-3 py-1.5 rounded"
                  style={{
                    background: 'rgba(253,224,71,0.12)',
                    color: '#FDE047',
                    border: '1px solid rgba(253,224,71,0.2)',
                  }}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
          {contextTags.length > 0 && (
            <div className="flex flex-col gap-1.5 shrink-0">
              {contextTags.map((t, i) => (
                <span
                  key={i}
                  className="font-mono text-[9px] font-bold px-2 py-1 rounded"
                  style={{ background: t.bg, color: t.color }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="px-5 py-4">
        <p
          className="font-serif italic text-sm leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.6)' }}
        >
          {stack.rationale}
        </p>
      </div>
    </div>
  )
}

// ── Bullpen Panel ─────────────────────────────────────────────────────────────

function BullpenPanel({ abbr, data }: { abbr: string; data: BullpenData }) {
  const ip3 = data.ip_last_3 ?? 0
  const ipY = data.ip_yesterday ?? 0
  const fatigueLevel = ip3 >= 15 ? 'heavy' : ipY >= 4 ? 'moderate' : 'fresh'
  const fatigueColor = fatigueLevel === 'heavy' ? '#DC2626' : fatigueLevel === 'moderate' ? '#D97706' : '#15803D'
  const fatigueLabel = fatigueLevel === 'heavy' ? 'Taxed' : fatigueLevel === 'moderate' ? 'Moderate' : 'Fresh'

  const fantasyNote =
    fatigueLevel === 'heavy'
      ? 'Depleted pen — avoid targeting relievers. Blown save risk elevated.'
      : data.closer_available === false
        ? 'Closer unavailable. Save chance redistributed or lost entirely.'
        : fatigueLevel === 'moderate'
          ? 'Some usage yesterday. Monitor for lineup changes.'
          : 'Full save and hold upside tonight — pen is rested.'

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <div
        className="px-5 py-3 border-b border-stone-100 flex items-center justify-between"
        style={{ background: '#1A1A1A' }}
      >
        <div>
          <div className="font-mono text-[9px] text-orange-500 uppercase tracking-widest mb-1">{abbr} Bullpen</div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: fatigueColor }} />
            <span className="font-mono text-[10px] font-bold text-white uppercase tracking-wider">{fatigueLabel}</span>
          </div>
        </div>
        <div className="text-right">
          <div
            className="font-bold text-white"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '30px', lineHeight: 1 }}
          >
            {data.era?.toFixed(2) ?? '–'}
          </div>
          <div className="font-mono text-[9px] text-white/40 uppercase tracking-wider">Bullpen ERA</div>
        </div>
      </div>
      <div className="px-5 py-3 space-y-2">
        {[
          { label: 'IP last night', value: formatIP(ipY), warn: ipY >= 4 },
          {
            label: 'Closer available',
            value: data.closer_available === true ? 'Yes ✓' : data.closer_available === false ? 'No ✕' : '?',
            warn: data.closer_available === false,
          },
          { label: 'K/9', value: data.k_per_9?.toFixed(1) ?? '–', warn: false },
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-stone-400 uppercase tracking-wider">{row.label}</span>
            <span className="font-mono text-xs font-bold" style={{ color: row.warn ? '#DC2626' : '#1A1A1A' }}>
              {row.value}
            </span>
          </div>
        ))}
        <div className="pt-2 border-t border-stone-100">
          <p className="font-serif italic text-xs text-stone-500 leading-relaxed">{fantasyNote}</p>
        </div>
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function FantasyTabContent({
  fantasyCards,
  homeAbbr,
  awayAbbr,
  homeBullpen,
  awayBullpen,
  awayPitcherStats,
  homePitcherStats,
  park,
  weather,
  venueName,
  isPro,
}: FantasyTabContentProps) {
  if (!isPro) {
    return (
      <div className="py-16 flex flex-col items-center justify-center text-center gap-4">
        <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400">
          ⊕ Pro feature
       </div>
        <div className="font-serif text-2xl font-semibold text-stone-900">
          Fantasy Desk
        </div>
        <p className="font-serif italic text-stone-500 text-sm max-w-xs leading-relaxed">
          Per-game fantasy ratings, batter intelligence, DFS stack picks, and bullpen watch — Pro only.
        </p>
        
          <a href="/pricing"
          className="font-mono text-[10px] uppercase tracking-widest bg-stone-900 text-yellow-300 px-5 py-2.5 rounded hover:bg-[#FF5722] hover:text-white transition mt-2">
      
          Upgrade to Pro →
        </a>
      </div>
    )
  }
  if (!fantasyCards) {

    return (
      <div className="space-y-10">
        <MethodologyPanel />
        <section>
          <SectionLabel>Starting Pitchers</SectionLabel>
          <div className="grid md:grid-cols-2 gap-4">
            <PendingCard label="Away starter analysis generating" />
            <PendingCard label="Home starter analysis generating" />
          </div>
        </section>
        <section>
          <SectionLabel>Bullpen Watch</SectionLabel>
          <div className="grid md:grid-cols-2 gap-4">
            <BullpenPanel abbr={awayAbbr} data={awayBullpen} />
            <BullpenPanel abbr={homeAbbr} data={homeBullpen} />
          </div>
        </section>
      </div>
    )
  }

  const { pitchers, batters, stack_pick, lineups_used } = fantasyCards

  const awayPitcher = pitchers.find(p => p.team === awayAbbr) ?? pitchers[0] ?? null
  const homePitcher = pitchers.find(p => p.team === homeAbbr) ?? pitchers[1] ?? null

  const awayBatters = batters.filter(b => b.team === awayAbbr)
  const homeBatters = batters.filter(b => b.team === homeAbbr)

  return (
    <div className="space-y-10">

      {/* Methodology panel */}
      <MethodologyPanel />

      {/* ── 1. Starting Pitchers ── */}
      <section>
        <SectionLabel>Starting Pitchers</SectionLabel>
        <div className="grid md:grid-cols-2 gap-4">
          {awayPitcher
            ? <SPCard card={awayPitcher} stats={awayPitcherStats} abbr={awayAbbr} />
            : <PendingCard label="Away starter not confirmed" />}
          {homePitcher
            ? <SPCard card={homePitcher} stats={homePitcherStats} abbr={homeAbbr} />
            : <PendingCard label="Home starter not confirmed" />}
        </div>
      </section>

      {/* ── 2. Batter Intelligence ── */}
      {lineups_used && batters.length > 0 ? (
        <>
          {awayBatters.length > 0 && (
            <section>
              <SectionLabel>{awayAbbr} Batters — vs {homeAbbr} Starter</SectionLabel>
             <BatterCardStrip
  batters={awayBatters}
  abbr={awayAbbr}
  opposingPitcherStats={homePitcherStats}
  isPro={isPro}
/>
            </section>
          )}
          {homeBatters.length > 0 && (
  <section>
    <SectionLabel>{homeAbbr} Batters — vs {awayAbbr} Starter</SectionLabel>
    <BatterCardStrip
      batters={homeBatters}
      abbr={homeAbbr}
      opposingPitcherStats={awayPitcherStats}
      isPro={isPro}
    />
  </section>
)}
        </>
      ) : (
        <section>
          <SectionLabel>Batter Intelligence</SectionLabel>
          <PendingCard label="Batter analysis generates when lineups confirm" />
        </section>
      )}

      {/* ── 3. DFS Stack Pick ── */}
      {isPro ? (
        <section>
          <SectionLabel>DFS Stack Pick</SectionLabel>
          {stack_pick
            ? <StackHero stack={stack_pick} park={park} weather={weather} />
            : <PendingCard label="Stack pick generates when lineups confirm" />}
        </section>
      ) : (
        <section>
          <SectionLabel>DFS Stack Pick</SectionLabel>
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-5 py-5 flex items-center justify-between">
            <div>
              <div className="font-serif font-semibold text-stone-900">Tonight's Stack Pick</div>
              <p className="text-sm text-stone-500 mt-1 font-serif">
                Best 2–3 hitters to correlate in DFS, with the math behind it.
              </p>
            </div>
            <a
              href="/pricing"
              className="font-mono text-[10px] uppercase tracking-widest px-4 py-2 rounded whitespace-nowrap ml-4 transition-colors"
              style={{ background: '#1A1A1A', color: '#FDE047' }}
            >
              Pro →
            </a>
          </div>
        </section>
      )}

      {/* ── 4. Bullpen Watch ── */}
      <section>
        <SectionLabel>Bullpen Watch — Save & Hold Landscape</SectionLabel>
        <div className="grid md:grid-cols-2 gap-4">
          <BullpenPanel abbr={awayAbbr} data={awayBullpen} />
          <BullpenPanel abbr={homeAbbr} data={homeBullpen} />
        </div>
      </section>

    </div>
  )
}