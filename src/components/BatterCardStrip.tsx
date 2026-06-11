'use client'

/**
 * src/components/BatterCardStrip.tsx
 * Compact batter card strip for the Fantasy tab.
 * Replaces the BatterTable grid view.
 * Shows: batting order, name, platoon flag, DFS value, proj H/HR, verdict.
 * Pro-gated after first 2 cards.
 */

import type { FantasyCards, FantasyVerdict } from '@/lib/fantasy-cards'

type PitcherStats = {
  vs_lhb_baa?: number | null
  vs_rhb_baa?: number | null
  throws?: string | null
}

type BatterCardStripProps = {
  batters: NonNullable<FantasyCards>['batters']
  abbr: string
  opposingPitcherStats: PitcherStats | null | undefined
  isPro: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function verdictStyle(v: FantasyVerdict): { label: string; bg: string; color: string } {
  switch (v) {
    case 'START': return { label: 'Start', bg: '#EAF3DE', color: '#27500A' }
    case 'SIT':   return { label: 'Sit',   bg: '#FAEEDA', color: '#633806' }
    case 'AVOID': return { label: 'Avoid', bg: '#FCEBEB', color: '#791F1F' }
    case 'BENCH': return { label: 'Bench', bg: '#F1EFE8', color: '#5F5E5A' }
    default:      return { label: v,       bg: '#F1EFE8', color: '#5F5E5A' }
  }
}

function dfsStyle(rating: number): { label: string; bg: string; color: string } {
  if (rating >= 5) return { label: 'Elite', bg: '#EAF3DE', color: '#27500A' }
  if (rating >= 4) return { label: 'Good',  bg: '#E6F1FB', color: '#0C447C' }
  if (rating >= 3) return { label: 'Avg',   bg: '#F1EFE8', color: '#5F5E5A' }
  return               { label: 'Fade',  bg: '#FCEBEB', color: '#791F1F' }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// ── Single batter card ────────────────────────────────────────────────────────

function BatterCard({
  batter,
  platoonAdv,
  dimmed,
}: {
  batter: NonNullable<FantasyCards>['batters'][0]
  platoonAdv: { label: string; bg: string; color: string } | null
  dimmed: boolean
}) {
  const verdict = verdictStyle(batter.verdict)
  const dfs = dfsStyle(batter.rating)
  const isStart = batter.verdict === 'START'

  return (
    <div
      className="bg-white rounded-xl overflow-hidden flex flex-col"
      style={{
        border: isStart
          ? '1.5px solid rgba(21,128,61,0.35)'
          : '0.5px solid var(--color-border-tertiary)',
        opacity: dimmed ? 0.3 : 1,
        filter: dimmed ? 'blur(2.5px)' : 'none',
        pointerEvents: dimmed ? 'none' : 'auto',
        userSelect: dimmed ? 'none' : 'auto',
      }}
    >
      {/* Verdict bar at top */}
      <div
        className="px-3 py-1.5 flex items-center justify-between"
        style={{ background: verdict.bg }}
      >
        <span
          className="font-mono font-bold text-[10px] uppercase tracking-wider"
          style={{ color: verdict.color }}
        >
          {verdict.label}
        </span>
        {batter.batting_order != null && (
          <span className="font-mono text-[9px]" style={{ color: verdict.color, opacity: 0.7 }}>
            {ordinal(batter.batting_order)}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-3 flex-1 flex flex-col gap-2">
        {/* Name + position */}
        <div>
          <div className="font-serif font-semibold text-stone-900 leading-tight" style={{ fontSize: '14px' }}>
            {batter.name}
          </div>
          <div className="font-mono text-stone-400 uppercase tracking-wider mt-0.5" style={{ fontSize: '9px' }}>
            {batter.position} · {batter.team}
          </div>
        </div>

        {/* Platoon + DFS badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {platoonAdv && (
            <span
              className="font-mono font-bold"
              style={{
                fontSize: '9px',
                padding: '2px 6px',
                borderRadius: '4px',
                background: platoonAdv.bg,
                color: platoonAdv.color,
              }}
            >
              {platoonAdv.label}
            </span>
          )}
          <span
            className="font-mono font-bold"
            style={{
              fontSize: '9px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: dfs.bg,
              color: dfs.color,
            }}
          >
            {dfs.label}
          </span>
        </div>

        {/* Proj stats */}
        <div
          className="grid grid-cols-2 gap-2 pt-2"
          style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}
        >
          <div>
            <div className="font-mono font-bold text-stone-900" style={{ fontSize: '15px', lineHeight: 1 }}>
              {batter.proj.h.toFixed(1)}
            </div>
            <div className="font-mono text-stone-400 uppercase tracking-wider mt-1" style={{ fontSize: '9px' }}>
              Proj H
            </div>
          </div>
          <div>
            <div className="font-mono font-bold text-stone-900" style={{ fontSize: '15px', lineHeight: 1 }}>
              {batter.proj.hr.toFixed(1)}
            </div>
            <div className="font-mono text-stone-400 uppercase tracking-wider mt-1" style={{ fontSize: '9px' }}>
              Proj HR
            </div>
          </div>
        </div>

        {/* RBI + SB */}
        <div className="font-mono text-stone-400" style={{ fontSize: '10px' }}>
          {batter.proj.rbi.toFixed(1)} RBI
          {batter.proj.sb > 0.1 && ` · ${batter.proj.sb.toFixed(1)} SB`}
        </div>
      </div>
    </div>
  )
}

// ── Pro gate card ─────────────────────────────────────────────────────────────

function ProGateCard({ count }: { count: number }) {
  return (
    <div
      className="rounded-xl flex flex-col items-center justify-center text-center gap-3 p-4"
      style={{
        background: 'var(--color-background-secondary)',
        border: '0.5px solid var(--color-border-tertiary)',
        minHeight: '160px',
      }}
    >
      <div className="font-serif text-stone-500" style={{ fontSize: '13px' }}>
        {count} more batter{count !== 1 ? 's' : ''}
      </div>
      <a
        href="/pricing"
        className="font-mono text-[10px] uppercase tracking-widest px-3 py-2 rounded-lg transition-colors"
        style={{
          background: '#1A1A1A',
          color: '#FDE047',
          textDecoration: 'none',
          letterSpacing: '0.1em',
        }}
      >
        Pro →
      </a>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function BatterCardStrip({
  batters,
  abbr,
  opposingPitcherStats,
  isPro,
}: BatterCardStripProps) {
  if (batters.length === 0) return null

  const vsLhb = opposingPitcherStats?.vs_lhb_baa
  const vsRhb = opposingPitcherStats?.vs_rhb_baa
  const hasPlatoonEdge = vsLhb != null && vsRhb != null && Math.abs(vsLhb - vsRhb) > 0.025

  // Shared platoon advantage label — applies to all batters of the favoured hand
  // (we don't have per-batter handedness from LLM cards, so show at section level)
  const sectionPlatoonAdv = hasPlatoonEdge
    ? vsLhb! > vsRhb!
      ? { label: 'RHB ✓', bg: '#EAF3DE', color: '#3B6D11' }
      : { label: 'LHB ✓', bg: '#EAF3DE', color: '#3B6D11' }
    : null

  // Sort: STARTs first, then by rating desc
  const sorted = [...batters].sort((a, b) => {
    const verdictOrder: Record<string, number> = { START: 0, SIT: 1, BENCH: 2, AVOID: 3 }
    const vA = verdictOrder[a.verdict] ?? 4
    const vB = verdictOrder[b.verdict] ?? 4
    if (vA !== vB) return vA - vB
    return b.rating - a.rating
  })

  const visibleCount = isPro ? sorted.length : Math.min(2, sorted.length)
  const hiddenCount = isPro ? 0 : sorted.length - visibleCount

  // Top pick for the featured hero
  const topPick = sorted[0] ?? null

  return (
    <div className="space-y-4">
      {/* Featured hero — top-rated batter */}
      {topPick && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: '#1A1A1A', border: '0.5px solid rgba(255,87,34,0.25)' }}
        >
          <div className="px-5 py-4 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div
                className="font-mono uppercase tracking-widest mb-1"
                style={{ fontSize: '9px', color: '#FF5722' }}
              >
                ⊕ Tonight's best play · {abbr}
              </div>
              <div className="font-serif font-semibold text-white leading-tight" style={{ fontSize: '17px' }}>
                {topPick.name}
                <span
                  className="font-mono font-normal ml-2"
                  style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}
                >
                  · {topPick.position}
                  {topPick.batting_order != null && ` · Bats ${ordinal(topPick.batting_order)}`}
                </span>
              </div>
              <div
                className="font-serif italic mt-2 leading-relaxed"
                style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}
              >
                {topPick.rationale}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span
                className="font-mono font-bold uppercase tracking-wider"
                style={{
                  fontSize: '10px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: '#EAF3DE',
                  color: '#27500A',
                }}
              >
                {verdictStyle(topPick.verdict).label}
              </span>
              <div className="flex gap-1">
                {Array.from({ length: 5 }, (_, i) => (
                  <div
                    key={i}
                    className="rounded-full"
                    style={{
                      width: '7px',
                      height: '7px',
                      background: i < topPick.rating ? '#FF5722' : 'rgba(255,255,255,0.15)',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Card strip */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
      >
        {sorted.slice(0, visibleCount).map((b, i) => (
          <BatterCard
            key={b.name}
            batter={b}
            platoonAdv={sectionPlatoonAdv}
            dimmed={false}
          />
        ))}

        {/* Blurred ghost cards for non-pro */}
        {!isPro && sorted.slice(visibleCount, visibleCount + 2).map((b, i) => (
          <BatterCard
            key={`blur-${i}`}
            batter={b}
            platoonAdv={null}
            dimmed={true}
          />
        ))}

        {/* Pro gate tile */}
        {!isPro && hiddenCount > 0 && (
          <ProGateCard count={hiddenCount} />
        )}
      </div>
    </div>
  )
}
