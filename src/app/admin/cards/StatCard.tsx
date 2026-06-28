// src/components/admin/cards/StatCard.tsx
//
// PLAYER STAT CARD SYSTEM
// ────────────────────────────────────────────────────────────────────────
// One shared "stage" (brand chrome: cream background, ⊕/§ marks, border
// treatment, aspect ratio) + a small library of content templates that
// drop into it. Add a new card type by adding a new template component
// below and registering it in CARD_REGISTRY at the bottom — the stage,
// export button, and picker UI in StatCardPanel.tsx never need to change.
//
// DATA DISCIPLINE: every card template below only renders fields that are
// typed as required on its props. If a stat isn't on the type, the card
// can't silently fabricate it — this mirrors the same discipline applied
// to narrative.ts after the injury-hallucination fix. Don't loosen a
// prop to `any` to "just get a number in there."
// ────────────────────────────────────────────────────────────────────────

import { forwardRef } from 'react'

// ── Brand tokens (mirrors voice-and-brand.md — keep in sync if it changes) ──
const COLORS = {
  cream:  '#FAF8F3',
  orange: '#FF5722',
  yellow: '#FDE047',
  stone:  '#1A1A1A',
  gray:   '#A3A3A3',
  line:   '#E2DCCF',
} as const

export type AspectRatio = 'square' | 'landscape'

const DIMENSIONS: Record<AspectRatio, { w: number; h: number }> = {
  square:    { w: 1080, h: 1080 },
  landscape: { w: 1200, h: 675 },
}

// ════════════════════════════════════════════════════════════════════════
// STAGE — shared brand chrome every card type renders inside
// ════════════════════════════════════════════════════════════════════════
type StageProps = {
  aspect: AspectRatio
  kicker: string          // e.g. "§ HOT STREAK"
  children: React.ReactNode
  footerNote?: string      // small print bottom-right, e.g. team abbr + date
}

export const CardStage = forwardRef<HTMLDivElement, StageProps>(function CardStage(
  { aspect, kicker, children, footerNote },
  ref
) {
  const { w, h } = DIMENSIONS[aspect]
  return (
    <div
      ref={ref}
      style={{
        width: w,
        height: h,
        background: COLORS.cream,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        border: `3px solid ${COLORS.stone}`,
        overflow: 'hidden',
        fontFamily: 'var(--font-inter), Inter, sans-serif',
      }}
    >
      {/* Top accent bar */}
      <div style={{ height: 8, width: '100%', background: COLORS.orange, flexShrink: 0 }} />

      {/* Header */}
      <div
        style={{
          padding: aspect === 'square' ? '40px 56px 0' : '32px 48px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-jetbrains), monospace',
            fontSize: 16,
            letterSpacing: '0.18em',
            color: COLORS.orange,
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-jetbrains), monospace',
            fontSize: 15,
            letterSpacing: '0.1em',
            color: COLORS.stone,
            fontWeight: 700,
          }}
        >
          ⊕ THE EDGE
        </div>
      </div>

      {/* Content area — each template fills this */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: aspect === 'square' ? '0 56px' : '0 48px',
          minHeight: 0,
        }}
      >
        {children}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: aspect === 'square' ? '0 56px 36px' : '0 48px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-jetbrains), monospace',
            fontSize: 13,
            letterSpacing: '0.12em',
            color: COLORS.gray,
            textTransform: 'uppercase',
          }}
        >
          edgereportdaily.com
        </div>
        {footerNote && (
          <div
            style={{
              fontFamily: 'var(--font-jetbrains), monospace',
              fontSize: 13,
              letterSpacing: '0.08em',
              color: COLORS.gray,
            }}
          >
            {footerNote}
          </div>
        )}
      </div>
    </div>
  )
})

// ── Shared sub-pieces used across templates ──────────────────────────────

function BigStat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontFamily: 'var(--font-bebas), sans-serif',
          fontSize: 168,
          lineHeight: 1,
          color: COLORS.stone,
          letterSpacing: '0.01em',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-jetbrains), monospace',
          fontSize: 18,
          letterSpacing: '0.15em',
          color: COLORS.orange,
          fontWeight: 700,
          textTransform: 'uppercase',
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  )
}

function PlayerName({ name, team, position }: { name: string; team: string; position?: string | null }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      <div
        style={{
          fontFamily: 'var(--font-fraunces), serif',
          fontWeight: 600,
          fontSize: 56,
          color: COLORS.stone,
          lineHeight: 1.05,
          letterSpacing: '-0.01em',
        }}
      >
        {name}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-jetbrains), monospace',
          fontSize: 16,
          letterSpacing: '0.1em',
          color: COLORS.gray,
          marginTop: 8,
          textTransform: 'uppercase',
        }}
      >
        {team}{position ? ` · ${position}` : ''}
      </div>
    </div>
  )
}

function SupportRow({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 48,
        marginTop: 36,
        paddingTop: 28,
        borderTop: `1px solid ${COLORS.line}`,
      }}
    >
      {items.map((item) => (
        <div key={item.label} style={{ textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'var(--font-jetbrains), monospace',
              fontSize: 28,
              fontWeight: 700,
              color: COLORS.stone,
            }}
          >
            {item.value}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-jetbrains), monospace',
              fontSize: 12,
              letterSpacing: '0.1em',
              color: COLORS.gray,
              textTransform: 'uppercase',
              marginTop: 4,
            }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// TEMPLATE 1 — HOT STREAK (batter)
// Source: BatterStreak (src/lib/streaks.ts) — on_base_streak, hit_streak,
// last_5_avg, last_5_obp, hits_last_10. All fields below are required,
// nothing inferred.
// ════════════════════════════════════════════════════════════════════════
export type HotStreakCardProps = {
  player_name: string
  team_abbr: string
  position?: string | null
  headline_value: string   // e.g. "9" — the streak length, caller decides which streak to lead with
  headline_label: string   // e.g. "GAME ON-BASE STREAK" or "GAME HIT STREAK"
  last_5_avg?: number | null
  last_5_obp?: number | null
  hits_last_10?: number | null
  aspect: AspectRatio
  date_label: string        // e.g. "Jun 24"
}

export const HotStreakCard = forwardRef<HTMLDivElement, HotStreakCardProps>(function HotStreakCard(
  { player_name, team_abbr, position, headline_value, headline_label, last_5_avg, last_5_obp, hits_last_10, aspect, date_label },
  ref
) {
  const support = [
    last_5_avg != null ? { label: 'AVG · L5', value: `.${Math.round(last_5_avg * 1000)}` } : null,
    last_5_obp != null ? { label: 'OBP · L5', value: `.${Math.round(last_5_obp * 1000)}` } : null,
    hits_last_10 != null ? { label: 'HITS · L10', value: String(hits_last_10) } : null,
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <CardStage ref={ref} aspect={aspect} kicker="§ Hot Streak" footerNote={`${team_abbr} · ${date_label}`}>
      <PlayerName name={player_name} team={team_abbr} position={position} />
      <BigStat value={headline_value} label={headline_label} />
      {support.length > 0 && <SupportRow items={support} />}
    </CardStage>
  )
})

// ════════════════════════════════════════════════════════════════════════
// TEMPLATE 2 — PITCHER TREND
// Source: PitcherTrend (src/lib/streaks.ts) — last_3_era, last_3_k_per_9,
// last_3_bb_per_9, current_scoreless_innings, hr_allowed_last_3.
// ════════════════════════════════════════════════════════════════════════
export type PitcherTrendCardProps = {
  player_name: string
  team_abbr: string
  headline_value: string    // e.g. "1.42" (ERA) or "14.2" (scoreless innings) — caller decides the lead stat
  headline_label: string    // e.g. "ERA · LAST 3 STARTS" or "CONSECUTIVE SCORELESS INNINGS"
  last_3_k_per_9?: number | null
  last_3_bb_per_9?: number | null
  hr_allowed_last_3?: number | null
  aspect: AspectRatio
  date_label: string
}

export const PitcherTrendCard = forwardRef<HTMLDivElement, PitcherTrendCardProps>(function PitcherTrendCard(
  { player_name, team_abbr, headline_value, headline_label, last_3_k_per_9, last_3_bb_per_9, hr_allowed_last_3, aspect, date_label },
  ref
) {
  const support = [
    last_3_k_per_9 != null ? { label: 'K/9 · L3', value: last_3_k_per_9.toFixed(1) } : null,
    last_3_bb_per_9 != null ? { label: 'BB/9 · L3', value: last_3_bb_per_9.toFixed(1) } : null,
    hr_allowed_last_3 != null ? { label: 'HR · L3', value: String(hr_allowed_last_3) } : null,
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <CardStage ref={ref} aspect={aspect} kicker="§ On The Mound" footerNote={`${team_abbr} · ${date_label}`}>
      <PlayerName name={player_name} team={team_abbr} position="P" />
      <BigStat value={headline_value} label={headline_label} />
      {support.length > 0 && <SupportRow items={support} />}
    </CardStage>
  )
})

// ════════════════════════════════════════════════════════════════════════
// TEMPLATE 3 — HEAD TO HEAD
// Source: the *_pitcher_vs_opponent_record / _era fields already threaded
// through NarrativeInputs in narrative.ts. Record string passed through
// as-is (e.g. "4-1") — no parsing/inference of win-loss meaning here.
// ════════════════════════════════════════════════════════════════════════
export type HeadToHeadCardProps = {
  player_name: string
  team_abbr: string
  opponent_abbr: string
  record: string      // e.g. "4-1"
  era: string         // e.g. "2.59" — passed as string since source data is string-typed
  aspect: AspectRatio
  date_label: string
}

export const HeadToHeadCard = forwardRef<HTMLDivElement, HeadToHeadCardProps>(function HeadToHeadCard(
  { player_name, team_abbr, opponent_abbr, record, era, aspect, date_label },
  ref
) {
  return (
    <CardStage ref={ref} aspect={aspect} kicker="§ History Says" footerNote={`${team_abbr} vs ${opponent_abbr} · ${date_label}`}>
      <PlayerName name={player_name} team={team_abbr} position="P" />
      <BigStat value={record} label={`CAREER VS ${opponent_abbr}`} />
      <SupportRow items={[{ label: 'ERA · CAREER VS OPP', value: era }]} />
    </CardStage>
  )
})

// ════════════════════════════════════════════════════════════════════════
// REGISTRY — the picker UI (StatCardPanel.tsx) reads this list. Add new
// card types here once a new template exists above; nothing else to wire.
// ════════════════════════════════════════════════════════════════════════
export const CARD_REGISTRY = [
  { id: 'hot_streak',     label: 'Hot Streak (batter)' },
  { id: 'pitcher_trend',  label: 'Pitcher Trend' },
  { id: 'head_to_head',   label: 'Head to Head' },
] as const

export type CardTypeId = typeof CARD_REGISTRY[number]['id']
