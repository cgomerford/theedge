'use client'

/**
 * src/components/FantasyPlayerCard.tsx
 *
 * Per-player fantasy card for the Fantasy tab.
 * Two variants: pitcher (SP) and batter.
 * Shows: rating, verdict, rationale, projected line, contrarian angle.
 */

import type { FantasyPitcherCard, FantasyBatterCard, FantasyVerdict } from '@/lib/fantasy-cards'

// ─── Verdict config ───────────────────────────────────────────────────────────

const VERDICT_CONFIG: Record<FantasyVerdict, { bg: string; text: string; label: string }> = {
  START: { bg: 'bg-emerald-600', text: 'text-white',      label: 'START'  },
  SIT:   { bg: 'bg-amber-400',   text: 'text-stone-900',  label: 'SIT'    },
  AVOID: { bg: 'bg-red-600',     text: 'text-white',      label: 'AVOID'  },
  BENCH: { bg: 'bg-stone-500',   text: 'text-white',      label: 'BENCH'  },
}

// ─── Star rating ──────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`text-sm leading-none ${
            i < rating ? 'text-[#FF5722]' : 'text-stone-300'
          }`}
        >
          ●
        </span>
      ))}
    </div>
  )
}

// ─── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FF5722] mb-1.5">
      {children}
    </div>
  )
}

// ─── Pitcher card ─────────────────────────────────────────────────────────────

type PitcherCardProps = {
  card: FantasyPitcherCard
}

export function PitcherCard({ card }: PitcherCardProps) {
  const verdict = VERDICT_CONFIG[card.verdict] ?? VERDICT_CONFIG.SIT

  return (
    <div className="rounded-xl overflow-hidden border border-stone-200 bg-white shadow-sm">
      {/* Header — dark hero */}
      <div className="bg-[#1A1A1A] px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-[#FF5722] mb-0.5">
            § Starting Pitcher · {card.team}
          </div>
          <div className="font-serif font-light text-xl text-white leading-tight">
            {card.name}
          </div>
          {card.top_pitch && (
            <div className="text-[10px] font-mono text-white/50 mt-0.5">
              {card.top_pitch}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded ${verdict.bg} ${verdict.text}`}
          >
            {verdict.label}
          </span>
          <StarRating rating={card.rating} />
        </div>
      </div>

      {/* Body */}
      <div className="divide-y divide-stone-100">
        {/* Rationale */}
        <div className="px-4 py-3">
          <SectionLabel>§ The case</SectionLabel>
          <p className="text-sm text-stone-700 font-serif leading-relaxed">
            {card.rationale}
          </p>
        </div>

        {/* Projected line */}
        <div className="px-4 py-3">
          <SectionLabel>§ Proj tonight</SectionLabel>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'IP',  value: card.proj.ip.toFixed(1) },
              { label: 'K',   value: card.proj.k },
              { label: 'ER',  value: card.proj.er },
              { label: 'BB',  value: card.proj.bb },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-lg font-mono font-bold text-[#1A1A1A] leading-none">
                  {stat.value}
                </div>
                <div className="text-[9px] font-mono uppercase tracking-wider text-stone-400 mt-0.5">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Contrarian */}
        <div className="px-4 py-3 bg-stone-50">
          <SectionLabel>§ The contrarian</SectionLabel>
          <p className="text-sm text-stone-500 font-serif italic leading-relaxed">
            {card.contrarian}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Batter card ──────────────────────────────────────────────────────────────

type BatterCardProps = {
  card: FantasyBatterCard
  isPro: boolean
}

export function BatterCard({ card, isPro }: BatterCardProps) {
  const verdict = VERDICT_CONFIG[card.verdict] ?? VERDICT_CONFIG.SIT

  if (!isPro) {
    return (
      <div className="rounded-xl overflow-hidden border border-stone-200 bg-white shadow-sm">
        <div className="bg-[#1A1A1A] px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-[#FF5722] mb-0.5">
              § Batter · {card.team}
            </div>
            <div className="font-serif font-light text-xl text-white leading-tight blur-sm select-none">
              {card.name}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-stone-700 text-stone-400">
              PRO
            </span>
          </div>
        </div>
        <div className="px-4 py-4 flex items-center justify-between">
          <p className="text-sm text-stone-500 font-serif italic">
            Per-batter analysis with projections — Pro only.
          </p>
          <a
            href="/pricing"
            className="text-[10px] font-mono uppercase tracking-widest bg-stone-900 text-yellow-300 px-3 py-1.5 hover:bg-[#FF5722] hover:text-white transition rounded ml-4 whitespace-nowrap"
          >
            Pro →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden border border-stone-200 bg-white shadow-sm">
      {/* Header */}
      <div className="bg-[#1A1A1A] px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-[#FF5722] mb-0.5">
            § {card.position}
            {card.batting_order ? ` · Bats ${card.batting_order}th` : ''} · {card.team}
          </div>
          <div className="font-serif font-light text-xl text-white leading-tight">
            {card.name}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded ${verdict.bg} ${verdict.text}`}
          >
            {verdict.label}
          </span>
          <StarRating rating={card.rating} />
        </div>
      </div>

      {/* Body */}
      <div className="divide-y divide-stone-100">
        {/* Rationale */}
        <div className="px-4 py-3">
          <SectionLabel>§ The case</SectionLabel>
          <p className="text-sm text-stone-700 font-serif leading-relaxed">
            {card.rationale}
          </p>
        </div>

        {/* Projected stats */}
        <div className="px-4 py-3">
          <SectionLabel>§ Proj tonight</SectionLabel>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'H',   value: card.proj.h.toFixed(1) },
              { label: 'HR',  value: card.proj.hr.toFixed(1) },
              { label: 'RBI', value: card.proj.rbi.toFixed(1) },
              { label: 'SB',  value: card.proj.sb.toFixed(1) },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-lg font-mono font-bold text-[#1A1A1A] leading-none">
                  {stat.value}
                </div>
                <div className="text-[9px] font-mono uppercase tracking-wider text-stone-400 mt-0.5">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Contrarian */}
        <div className="px-4 py-3 bg-stone-50">
          <SectionLabel>§ The contrarian</SectionLabel>
          <p className="text-sm text-stone-500 font-serif italic leading-relaxed">
            {card.contrarian}
          </p>
        </div>
      </div>
    </div>
  )
}
