'use client'

// src/components/game-preview/SeriesTopPerformers.tsx
//
// "Best graded players" for this series — same grading model as the admin
// dashboard's Yesterday Performers section (lib/mlb-recap.ts's
// batterScore/pitcherGameScore + letter grade), just scoped to this
// series' completed games via getPerformersForGames instead of "every
// game yesterday". A much lighter card than the admin version's deep-dive
// (no per-pitch zone chart / usage bar — those need a full game-feed pull
// per player and belong in that admin tool, not a preview-page widget).
// The grade badge is rounded here — the admin version's is a hard square
// with sharp corners; per George, wanted a nicer/rounder treatment. Font
// is font-sans (Outfit, the sitewide default — genuinely rounded
// letterforms) rather than font-display (Bebas Neue): tried Bebas first
// since the admin card uses it, but it's a tall condensed display face,
// not rounded, and it was the one component on this page not matching
// the font-sans/font-mono system everything else here already uses.

import { useState } from 'react'
import type { BatterPerformance, PitcherPerformance, Grade } from '@/lib/mlb-recap'
import type { SeriesBatterLine, SeriesPitcherLine } from '@/lib/series-stats'
import PerformerCardModal from './PerformerCardModal'

function gradeColor(g: Grade): string {
  if (g.startsWith('A')) return '#15803d'
  if (g.startsWith('B')) return '#1A1A1A'
  if (g.startsWith('C')) return '#FF5722'
  return '#DC2626'
}

function GradeBadge({ grade }: { grade: Grade }) {
  const c = gradeColor(grade)
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-sans font-bold"
      style={{
        fontSize: 13,
        lineHeight: 1,
        color: c,
        border: `2px solid ${c}`,
        width: 32,
        height: 32,
      }}
    >
      {grade}
    </div>
  )
}

function PerformerChip({
  headshot, name, teamAbbr, line, grade, onClick,
}: {
  headshot: string
  name: string
  teamAbbr: string
  line: string
  grade: Grade
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-left hover:border-orange-300 hover:bg-orange-50/40 transition"
    >
      <GradeBadge grade={grade} />
      <img
        src={headshot}
        alt=""
        className="w-9 h-9 rounded-full object-cover bg-stone-200 shrink-0"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
      />
      <div className="min-w-0">
        <p className="font-sans font-semibold text-[12.5px] text-stone-900 truncate leading-tight">{name}</p>
        <p className="font-mono text-[9.5px] text-stone-400 uppercase mb-0.5">{teamAbbr}</p>
        <p className="font-mono text-[10.5px] font-bold text-stone-700 truncate">{line}</p>
      </div>
    </button>
  )
}

type SelectedPerformer =
  | { kind: 'batter'; data: BatterPerformance; seriesLine: SeriesBatterLine | null }
  | { kind: 'pitcher'; data: PitcherPerformance; seriesLine: SeriesPitcherLine | null }

export default function SeriesTopPerformers({
  batters, pitchers, awayBattingLines, homeBattingLines, awayPitchingLines, homePitchingLines,
}: {
  batters: BatterPerformance[]
  pitchers: PitcherPerformance[]
  awayBattingLines: SeriesBatterLine[]
  homeBattingLines: SeriesBatterLine[]
  awayPitchingLines: SeriesPitcherLine[]
  homePitchingLines: SeriesPitcherLine[]
}) {
  const [selected, setSelected] = useState<SelectedPerformer | null>(null)
  const allBattingLines = [...awayBattingLines, ...homeBattingLines]
  const allPitchingLines = [...awayPitchingLines, ...homePitchingLines]

  if (batters.length === 0 && pitchers.length === 0) {
    return <p className="text-xs font-sans italic text-stone-400 py-2">No graded performances for this series yet.</p>
  }

  return (
    <div className="space-y-4">
      {batters.length > 0 && (
        <div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-2">Top batters</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {batters.map((b, i) => (
              <PerformerChip
                key={`${b.personId}-${i}`} headshot={b.headshot} name={b.name} teamAbbr={b.teamAbbr} line={b.line} grade={b.grade}
                onClick={() => setSelected({ kind: 'batter', data: b, seriesLine: allBattingLines.find(l => l.playerId === b.personId) ?? null })}
              />
            ))}
          </div>
        </div>
      )}
      {pitchers.length > 0 && (
        <div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-2">Top pitchers</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {pitchers.map((p, i) => (
              <PerformerChip
                key={`${p.personId}-${i}`} headshot={p.headshot} name={p.name} teamAbbr={p.teamAbbr} line={p.line} grade={p.grade}
                onClick={() => setSelected({ kind: 'pitcher', data: p, seriesLine: allPitchingLines.find(l => l.playerId === p.personId) ?? null })}
              />
            ))}
          </div>
        </div>
      )}

      {selected && <PerformerCardModal performer={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
