// src/components/admin/cards/StatCardPanel.tsx
//
// Admin panel for generating + exporting player stat cards.
//
// EXPORT MECHANISM: html-to-image (toPng). See original file header notes
// on why (Google Font support via next/font) — unchanged.
//
// NEW: watermark toggle (diagonal repeated overlay, see StatCard.tsx) and
// the "Graded Performance" card type, sourced from mlb-recap.ts's
// getYesterdaysPerformers() output (BatterPerformance[] / PitcherPerformance[]).

'use client'

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import {
  CardStage,
  HotStreakCard,
  PitcherTrendCard,
  HeadToHeadCard,
  PerformanceGradeCard,
  CARD_REGISTRY,
  type AspectRatio,
  type CardTypeId,
} from '@/app/admin/cards/StatCard'

export type StatCardSourceData = {
  date_label: string
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
  // NEW — from getYesterdaysPerformers() in mlb-recap.ts. Batters and
  // pitchers merged into one flat list with a `role` discriminator, since
  // the panel just needs "everything gradeable from yesterday" to pick from.
  graded_performers: {
    role: 'batter' | 'pitcher'
    player_name: string
    team_abbr: string
    line: string
    grade: string
    score: number
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
  const [watermark, setWatermark] = useState(false)
  const [exporting, setExporting] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)

  const hasAnyData =
    data.hot_batters.length > 0 ||
    data.pitcher_trends.length > 0 ||
    data.h2h_pitchers.length > 0 ||
    data.graded_performers.length > 0

  async function handleExport() {
    if (!stageRef.current) return
    setExporting(true)
    try {
      const dataUrl = await toPng(stageRef.current, {
        pixelRatio: 1,
        cacheBust: true,
      })
      const link = document.createElement('a')
      const suffix = watermark ? '-wm' : ''
      link.download = `edge-card-${cardType}${suffix}-${Date.now()}.png`
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
      const useOnBase = b.on_base_streak >= b.hit_streak
      return (
        <HotStreakCard
          ref={stageRef}
          aspect={aspect}
          date_label={data.date_label}
          watermark={watermark}
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
      const leadScoreless = (p.current_scoreless_innings ?? 0) >= 12
      return (
        <PitcherTrendCard
          ref={stageRef}
          aspect={aspect}
          date_label={data.date_label}
          watermark={watermark}
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
          watermark={watermark}
          player_name={h.player_name}
          team_abbr={h.team_abbr}
          opponent_abbr={h.opponent_abbr}
          record={h.record}
          era={h.era}
        />
      )
    }

    if (cardType === 'performance_grade') {
      const performers = data.graded_performers
      if (performers.length === 0) return <EmptyState label="No graded performances for yesterday's slate." />
      const perf = performers[Math.min(selectedIndex, performers.length - 1)]
      return (
        <PerformanceGradeCard
          ref={stageRef}
          aspect={aspect}
          date_label={data.date_label}
          watermark={watermark}
          player_name={perf.player_name}
          team_abbr={perf.team_abbr}
          role={perf.role}
          line={perf.line}
          grade={perf.grade}
          score={perf.score}
        />
      )
    }

    return null
  }

  function currentList(): { player_name: string; team_abbr: string }[] {
    if (cardType === 'hot_streak') return data.hot_batters
    if (cardType === 'pitcher_trend') return data.pitcher_trends
    if (cardType === 'performance_grade') return data.graded_performers
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

                <Field label="Watermark">
                  <button
                    type="button"
                    onClick={() => setWatermark((w) => !w)}
                    className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wide border ${
                      watermark ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300 text-stone-600'
                    }`}
                  >
                    {watermark ? 'On' : 'Off'}
                  </button>
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
   WIRING NOTES — updating src/app/admin/dashboard/page.tsx

   import { getYesterdaysPerformers } from '@/lib/mlb-recap'

   const { batters, pitchers } = await getYesterdaysPerformers(perfDate)

   const graded_performers: StatCardSourceData['graded_performers'] = [
     ...(batters.available ? batters.items.map(b => ({
       role: 'batter' as const, player_name: b.name, team_abbr: b.teamAbbr,
       line: b.line, grade: b.grade, score: b.score,
     })) : []),
     ...(pitchers.available ? pitchers.items.map(p => ({
       role: 'pitcher' as const, player_name: p.name, team_abbr: p.teamAbbr,
       line: p.line, grade: p.grade, score: p.score,
     })) : []),
   ]

   const cardData: StatCardSourceData = { ...existingCardData, graded_performers }
   ════════════════════════════════════════════════════════════════════════ */