// src/components/admin/cards/StatCardPanel.tsx
//
// Admin panel for generating + exporting player stat cards.
// Mounted as a new button/section on /admin/predictions (see wiring notes
// at the bottom of this file for exact integration into page.tsx).
//
// EXPORT MECHANISM: uses `html-to-image` (toPng) rather than html2canvas.
// html-to-image has noticeably better support for Google Fonts loaded via
// next/font (html2canvas frequently silently falls back to a system font
// for @font-face fonts injected by next/font's CSS-in-JS approach, which
// would mean Fraunces/Bebas Neue/JetBrains Mono quietly not rendering in
// the exported PNG even though they render fine on screen).
//
// Install if not already present:
//   npm install html-to-image
//
// If you'd rather use html2canvas (e.g. already installed elsewhere in the
// project), swap the one import + the one call in handleExport() — the rest
// of this file is library-agnostic.

'use client'

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import {
  CardStage,
  HotStreakCard,
  PitcherTrendCard,
  HeadToHeadCard,
  CARD_REGISTRY,
  type AspectRatio,
  type CardTypeId,
} from '@/app/admin/cards/StatCard'

// ── Input data shape ────────────────────────────────────────────────────
// This is intentionally a flat "everything available for this game/day"
// bag rather than tightly typed per-card-type props, because the panel's
// job is letting the admin pick *which* player/stat goes into *which*
// template — the strict typing lives in StatCard.tsx's per-template props,
// and this panel must satisfy those exactly before render.
export type StatCardSourceData = {
  date_label: string // e.g. "Jun 24"
  hot_batters: {
    player_name: string
    team_abbr: string
    position?: string | null
    on_base_streak: number
    hit_streak: number
    last_5_avg: number | null
    last_5_obp: number | null
    hits_last_10: number | null
  }[]
  pitcher_trends: {
    player_name: string
    team_abbr: string
    last_3_era: number | null
    last_3_k_per_9: number | null
    last_3_bb_per_9: number | null
    hr_allowed_last_3: number | null
    current_scoreless_innings: number | null
  }[]
  h2h_pitchers: {
    player_name: string
    team_abbr: string
    opponent_abbr: string
    record: string
    era: string
  }[]
}

type Props = {
  data: StatCardSourceData
}

export default function StatCardPanel({ data }: Props) {
  const [open, setOpen] = useState(false)
  const [cardType, setCardType] = useState<CardTypeId>('hot_streak')
  const [aspect, setAspect] = useState<AspectRatio>('square')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [exporting, setExporting] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)

  const hasAnyData =
    data.hot_batters.length > 0 || data.pitcher_trends.length > 0 || data.h2h_pitchers.length > 0

  async function handleExport() {
    if (!stageRef.current) return
    setExporting(true)
    try {
      const dataUrl = await toPng(stageRef.current, {
        pixelRatio: 1, // stage is already rendered at full export resolution (1080/1200px) — don't double it
        cacheBust: true,
      })
      const link = document.createElement('a')
      link.download = `edge-card-${cardType}-${Date.now()}.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Card export failed:', err)
      alert('Export failed — check the console. The card is still visible above, you can right-click → save image as a fallback.')
    } finally {
      setExporting(false)
    }
  }

  function renderSelectedCard() {
    if (cardType === 'hot_streak') {
      const batters = data.hot_batters
      if (batters.length === 0) return <EmptyState label="No hot batters in today's data." />
      const b = batters[Math.min(selectedIndex, batters.length - 1)]
      // Lead with whichever streak is longer/more notable — on-base streaks
      // read as more impressive than hit streaks at the same length, so
      // prefer on-base when both are present and roughly comparable.
      const useOnBase = b.on_base_streak >= b.hit_streak
      return (
        <HotStreakCard
          ref={stageRef}
          aspect={aspect}
          date_label={data.date_label}
          player_name={b.player_name}
          team_abbr={b.team_abbr}
          position={b.position}
          headline_value={String(useOnBase ? b.on_base_streak : b.hit_streak)}
          headline_label={useOnBase ? 'GAME ON-BASE STREAK' : 'GAME HIT STREAK'}
          last_5_avg={b.last_5_avg}
          last_5_obp={b.last_5_obp}
          hits_last_10={b.hits_last_10}
        />
      )
    }

    if (cardType === 'pitcher_trend') {
      const pitchers = data.pitcher_trends
      if (pitchers.length === 0) return <EmptyState label="No pitcher trend data in today's data." />
      const p = pitchers[Math.min(selectedIndex, pitchers.length - 1)]
      // Lead with scoreless-innings streak if it's notable (12+, matches the
      // threshold already used in streaks.ts trend_label logic), else ERA.
      const leadScoreless = (p.current_scoreless_innings ?? 0) >= 12
      return (
        <PitcherTrendCard
          ref={stageRef}
          aspect={aspect}
          date_label={data.date_label}
          player_name={p.player_name}
          team_abbr={p.team_abbr}
          headline_value={leadScoreless ? String(p.current_scoreless_innings) : (p.last_3_era?.toFixed(2) ?? '—')}
          headline_label={leadScoreless ? 'CONSECUTIVE SCORELESS INNINGS' : 'ERA · LAST 3 STARTS'}
          last_3_k_per_9={p.last_3_k_per_9}
          last_3_bb_per_9={p.last_3_bb_per_9}
          hr_allowed_last_3={p.hr_allowed_last_3}
        />
      )
    }

    if (cardType === 'head_to_head') {
      const h2h = data.h2h_pitchers
      if (h2h.length === 0) return <EmptyState label="No head-to-head data in today's data." />
      const h = h2h[Math.min(selectedIndex, h2h.length - 1)]
      return (
        <HeadToHeadCard
          ref={stageRef}
          aspect={aspect}
          date_label={data.date_label}
          player_name={h.player_name}
          team_abbr={h.team_abbr}
          opponent_abbr={h.opponent_abbr}
          record={h.record}
          era={h.era}
        />
      )
    }

    return null
  }

  function currentList(): { player_name: string; team_abbr: string }[] {
    if (cardType === 'hot_streak') return data.hot_batters
    if (cardType === 'pitcher_trend') return data.pitcher_trends
    return data.h2h_pitchers
  }

  return (
    <div className="border border-stone-200 bg-white mt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs font-mono uppercase tracking-widest font-bold text-stone-900">
          ⊕ Stat Card Generator
        </span>
        <span className="text-xs font-mono text-stone-400">{open ? '▴ Close' : '▾ Open'}</span>
      </button>

      {open && (
        <div className="border-t border-stone-200 p-4">
          {!hasAnyData ? (
            <EmptyState label="No player stat data available for this date range yet." />
          ) : (
            <>
              {/* ── Controls ── */}
              <div className="flex flex-wrap items-end gap-4 mb-5">
                <Field label="Card type">
                  <select
                    value={cardType}
                    onChange={(e) => {
                      setCardType(e.target.value as CardTypeId)
                      setSelectedIndex(0)
                    }}
                    className="border border-stone-300 px-3 py-1.5 text-sm font-mono"
                  >
                    {CARD_REGISTRY.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Player">
                  <select
                    value={selectedIndex}
                    onChange={(e) => setSelectedIndex(Number(e.target.value))}
                    className="border border-stone-300 px-3 py-1.5 text-sm font-mono min-w-[200px]"
                  >
                    {currentList().map((p, i) => (
                      <option key={`${p.player_name}-${i}`} value={i}>
                        {p.player_name} ({p.team_abbr})
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Shape">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setAspect('square')}
                      className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wide border ${
                        aspect === 'square' ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300 text-stone-600'
                      }`}
                    >
                      1:1
                    </button>
                    <button
                      type="button"
                      onClick={() => setAspect('landscape')}
                      className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wide border ${
                        aspect === 'landscape' ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300 text-stone-600'
                      }`}
                    >
                      16:9
                    </button>
                  </div>
                </Field>

                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting}
                  className="ml-auto bg-orange-600 text-white px-4 py-1.5 text-xs font-mono uppercase tracking-widest hover:bg-orange-700 transition disabled:opacity-50"
                >
                  {exporting ? 'Exporting…' : 'Download PNG'}
                </button>
              </div>

              {/* ── Preview — rendered at true export size, scaled down visually ── */}
              <div className="bg-stone-100 p-6 flex justify-center overflow-auto">
                <div
                  style={{
                    transform: aspect === 'square' ? 'scale(0.4)' : 'scale(0.45)',
                    transformOrigin: 'top center',
                  }}
                >
                  {renderSelectedCard()}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-mono uppercase tracking-widest text-stone-500">{label}</label>
      {children}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return <div className="text-sm font-serif italic text-stone-400 py-8 text-center">{label}</div>
}

/* ════════════════════════════════════════════════════════════════════════
   WIRING NOTES — integrating into src/app/admin/predictions/page.tsx

   This panel needs a `StatCardSourceData` object built from whatever
   streak/H2H data you already fetch for the admin page (or a new fetch
   alongside `getRecentReads`). I haven't seen the full page.tsx beyond
   the snippet retrieved via project-knowledge search, so wire this
   yourself or paste the file back to me for an exact diff. Sketch:

   import StatCardPanel from '@/components/admin/cards/StatCardPanel'
   import { getTopBatterStreaks, getPitcherTrend } from '@/lib/streaks'

   // ... inside the page component, after predictions are fetched:
   const cardData: StatCardSourceData = {
     date_label: new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
     hot_batters: [...],      // map from getTopBatterStreaks() results across today's games
     pitcher_trends: [...],   // map from getPitcherTrend() results
     h2h_pitchers: [...],     // map from the *_pitcher_vs_opponent_record/_era fields
                               // already computed for narrative.ts inputs
   }

   // ... in the JSX, alongside the existing predictions table:
   <StatCardPanel data={cardData} />

   None of this touches ShareButton.tsx or share-text.ts — those remain
   the text-copy path; this is the new, separate graphics path, per your
   request to add it as a new section on the same page rather than
   replacing what's there.
   ════════════════════════════════════════════════════════════════════════ */
