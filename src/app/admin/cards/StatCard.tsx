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
//
// WATERMARK (new): every template now accepts an optional `watermark`
// prop and forwards it to CardStage. It's a diagonal, repeated, low-opacity
// overlay across the full card — not just the small always-on footer text
// at the bottom, which is easy to crop out of a screenshot. Toggle lives
// in StatCardPanel.tsx's controls row.
// ────────────────────────────────────────────────────────────────────────

import { forwardRef } from 'react'

const COLORS = {
  cream:  '#FAF8F3',
  orange: '#FF5722',
  yellow: '#FDE047',
  stone:  '#1A1A1A',
  gray:   '#A3A3A3',
  line:   '#E2DCCF',
  gradeA: '#15803D', // green — not in the core palette, used only for grade badges
  gradeF: '#DC2626', // red — same
} as const

export type AspectRatio = 'square' | 'landscape'

const DIMENSIONS: Record<AspectRatio, { w: number; h: number }> = {
  square:    { w: 1080, h: 1080 },
  landscape: { w: 1200, h: 675 },
}

type StageProps = {
  aspect: AspectRatio
  kicker: string
  children: React.ReactNode
  footerNote?: string
  watermark?: boolean
}

export const CardStage = forwardRef<HTMLDivElement, StageProps>(function CardStage(
  { aspect, kicker, children, footerNote, watermark = false },
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
      <div style={{ height: 8, width: '100%', background: COLORS.orange, flexShrink: 0 }} />

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

      {watermark && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexWrap: 'wrap',
            alignContent: 'center',
            justifyContent: 'center',
            gap: aspect === 'square' ? 44 : 36,
            transform: 'rotate(-22deg) scale(1.3)',
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          {Array.from({ length: 16 }).map((_, i) => (
            <span
              key={i}
              style={{
                fontFamily: 'var(--font-jetbrains), monospace',
                fontSize: aspect === 'square' ? 26 : 22,
                letterSpacing: '0.15em',
                color: COLORS.stone,
                opacity: 0.07,
                whiteSpace: 'nowrap',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              ⊕ EDGEREPORTDAILY.COM
            </span>
          ))}
        </div>
      )}
    </div>
  )
})

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

export type HotStreakCardProps = {
  player_name: string
  team_abbr: string
  position?: string | null
  headline_value: string
  headline_label: string
  last_5_avg?: number | null
  last_5_obp?: number | null
  hits_last_10?: number | null
  aspect: AspectRatio
  date_label: string
  watermark?: boolean
}

export const HotStreakCard = forwardRef<HTMLDivElement, HotStreakCardProps>(function HotStreakCard(
  { player_name, team_abbr, position, headline_value, headline_label, last_5_avg, last_5_obp, hits_last_10, aspect, date_label, watermark },
  ref
) {
  const support = [
    last_5_avg != null ? { label: 'AVG · L5', value: `.${Math.round(last_5_avg * 1000)}` } : null,
    last_5_obp != null ? { label: 'OBP · L5', value: `.${Math.round(last_5_obp * 1000)}` } : null,
    hits_last_10 != null ? { label: 'HITS · L10', value: String(hits_last_10) } : null,
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <CardStage ref={ref} aspect={aspect} kicker="§ Hot Streak" footerNote={`${team_abbr} · ${date_label}`} watermark={watermark}>
      <PlayerName name={player_name} team={team_abbr} position={position} />
      <BigStat value={headline_value} label={headline_label} />
      {support.length > 0 && <SupportRow items={support} />}
    </CardStage>
  )
})

export type PitcherTrendCardProps = {
  player_name: string
  team_abbr: string
  headline_value: string
  headline_label: string
  last_3_k_per_9?: number | null
  last_3_bb_per_9?: number | null
  hr_allowed_last_3?: number | null
  aspect: AspectRatio
  date_label: string
  watermark?: boolean
}

export const PitcherTrendCard = forwardRef<HTMLDivElement, PitcherTrendCardProps>(function PitcherTrendCard(
  { player_name, team_abbr, headline_value, headline_label, last_3_k_per_9, last_3_bb_per_9, hr_allowed_last_3, aspect, date_label, watermark },
  ref
) {
  const support = [
    last_3_k_per_9 != null ? { label: 'K/9 · L3', value: last_3_k_per_9.toFixed(1) } : null,
    last_3_bb_per_9 != null ? { label: 'BB/9 · L3', value: last_3_bb_per_9.toFixed(1) } : null,
    hr_allowed_last_3 != null ? { label: 'HR · L3', value: String(hr_allowed_last_3) } : null,
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <CardStage ref={ref} aspect={aspect} kicker="§ On The Mound" footerNote={`${team_abbr} · ${date_label}`} watermark={watermark}>
      <PlayerName name={player_name} team={team_abbr} position="P" />
      <BigStat value={headline_value} label={headline_label} />
      {support.length > 0 && <SupportRow items={support} />}
    </CardStage>
  )
})

export type HeadToHeadCardProps = {
  player_name: string
  team_abbr: string
  opponent_abbr: string
  record: string
  era: string
  aspect: AspectRatio
  date_label: string
  watermark?: boolean
}

export const HeadToHeadCard = forwardRef<HTMLDivElement, HeadToHeadCardProps>(function HeadToHeadCard(
  { player_name, team_abbr, opponent_abbr, record, era, aspect, date_label, watermark },
  ref
) {
  return (
    <CardStage ref={ref} aspect={aspect} kicker="§ History Says" footerNote={`${team_abbr} vs ${opponent_abbr} · ${date_label}`} watermark={watermark}>
      <PlayerName name={player_name} team={team_abbr} position="P" />
      <BigStat value={record} label={`CAREER VS ${opponent_abbr}`} />
      <SupportRow items={[{ label: 'ERA · CAREER VS OPP', value: era }]} />
    </CardStage>
  )
})

// TEMPLATE 4 — PERFORMANCE GRADE (new)
export type PerformanceGradeCardProps = {
  player_name: string
  team_abbr: string
  position?: string | null
  role: 'batter' | 'pitcher'
  line: string
  grade: string
  score: number
  aspect: AspectRatio
  date_label: string
  watermark?: boolean
}

function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return COLORS.gradeA
  if (grade.startsWith('B')) return COLORS.stone
  if (grade.startsWith('C')) return COLORS.orange
  return COLORS.gradeF
}

export const PerformanceGradeCard = forwardRef<HTMLDivElement, PerformanceGradeCardProps>(function PerformanceGradeCard(
  { player_name, team_abbr, position, role, line, grade, score, aspect, date_label, watermark },
  ref
) {
  const badgeColor = gradeColor(grade)
  return (
    <CardStage
      ref={ref}
      aspect={aspect}
      kicker="§ Graded Performance"
      footerNote={`${team_abbr} · ${date_label}`}
      watermark={watermark}
    >
      <PlayerName name={player_name} team={team_abbr} position={position ?? (role === 'pitcher' ? 'P' : undefined)} />

      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-block',
            fontFamily: 'var(--font-bebas), sans-serif',
            fontSize: 148,
            lineHeight: 1,
            color: badgeColor,
            border: `6px solid ${badgeColor}`,
            padding: '4px 36px',
            letterSpacing: '0.01em',
          }}
        >
          {grade}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-jetbrains), monospace',
            fontSize: 16,
            letterSpacing: '0.12em',
            color: COLORS.orange,
            fontWeight: 700,
            textTransform: 'uppercase',
            marginTop: 14,
          }}
        >
          {role === 'batter' ? 'Total Bases Score' : 'Game Score'}: {score.toFixed(1)}
        </div>
      </div>

      <div
        style={{
          textAlign: 'center',
          marginTop: 32,
          paddingTop: 24,
          borderTop: `1px solid ${COLORS.line}`,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-jetbrains), monospace',
            fontSize: 22,
            fontWeight: 700,
            color: COLORS.stone,
          }}
        >
          {line}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-jetbrains), monospace',
            fontSize: 12,
            letterSpacing: '0.1em',
            color: COLORS.gray,
            textTransform: 'uppercase',
            marginTop: 6,
          }}
        >
          The Line
        </div>
      </div>
    </CardStage>
  )
})

export const CARD_REGISTRY = [
  { id: 'hot_streak',        label: 'Hot Streak (batter)' },
  { id: 'pitcher_trend',     label: 'Pitcher Trend' },
  { id: 'head_to_head',      label: 'Head to Head' },
  { id: 'performance_grade', label: 'Graded Performance (yesterday)' },
] as const

export type CardTypeId = typeof CARD_REGISTRY[number]['id']