// src/components/scout/ScoutReport.tsx
//
// The rebuilt Scout Report — a dashboard, not a long scroll: a sticky section
// nav on the left, the built sections as full-width cards (each split into
// away | home columns inside), and the sections still being built as a grid of
// compact tiles beneath. Registry: sections.ts. The old tabbed report
// (ScoutSlotAsync / ScoutReportTab / ScoutExpandCharts) is in components/archive/.
//
// A section goes live by adding its async server component to SECTION_BODIES.
// Each body is wrapped in <Suspense> so a slow one (the Savant pull behind §2
// takes ~10s on a cold cache) never holds up the others.

import { Suspense } from 'react'
import type { MLBGame } from '@/lib/mlb'
import ScoutSection from './ScoutSection'
import ClubStatusSection from './ClubStatusSection'
import FormTrendsSection from './FormTrendsSection'
import BullpenSection from './BullpenSection'
import ABSSection from './ABSSection'
import RunGameSection from './RunGameSection'
import DefenseSection from './DefenseSection'
import SplitsSection from './SplitsSection'
import ParkSection from './ParkSection'
import PitcherAttackSection from './PitcherAttackSection'
import LineupVsSpSection from './LineupVsSpSection'
import LeverageSection from './LeverageSection'
import ManagerCardSection from './ManagerCardSection'
import { SCOUT_SECTIONS } from './sections'
import type { ScoutClub, ScoutContext } from './types'

const SECTION_BODIES: Partial<Record<string, (ctx: ScoutContext) => React.ReactNode>> = {
  'club-status': (ctx) => <ClubStatusSection ctx={ctx} />,
  'form-vs-skill': (ctx) => <FormTrendsSection ctx={ctx} />,
  bullpen: (ctx) => <BullpenSection ctx={ctx} />,
  abs: (ctx) => <ABSSection ctx={ctx} />,
  'run-game': (ctx) => <RunGameSection ctx={ctx} />,
  defense: (ctx) => <DefenseSection ctx={ctx} />,
  splits: (ctx) => <SplitsSection ctx={ctx} />,
  park: (ctx) => <ParkSection ctx={ctx} />,
  'pitcher-attack': (ctx) => <PitcherAttackSection ctx={ctx} />,
  'lineup-vs-sp': (ctx) => <LineupVsSpSection ctx={ctx} />,
  leverage: (ctx) => <LeverageSection ctx={ctx} />,
  'manager-card': (ctx) => <ManagerCardSection ctx={ctx} />,
}

function toClub(side: MLBGame['teams']['away']): ScoutClub {
  return {
    id: side.team.id,
    name: side.team.name,
    abbr: side.team.abbreviation ?? side.team.name.slice(0, 3).toUpperCase(),
    probableId: side.probablePitcher?.id ?? null,
    probableName: side.probablePitcher?.fullName ?? null,
  }
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true">
      <div className="h-4 w-1/3 rounded bg-stone-100" />
      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => <div key={i} className="h-56 rounded-xl bg-stone-50" />)}
      </div>
    </div>
  )
}

export default function ScoutReport({ game, gameDate, isPro }: { game: MLBGame; gameDate: string; isPro: boolean }) {
  const ctx: ScoutContext = { gameDate, gamePk: game.gamePk, away: toClub(game.teams.away), home: toClub(game.teams.home), isPro,
    venueId: (game.venue as { id?: number }).id ?? null, venueName: game.venue.name, dayNight: game.dayNight ?? null }
  const withStatus = SCOUT_SECTIONS.map((meta) => ({ ...meta, status: SECTION_BODIES[meta.id] ? ('live' as const) : ('planned' as const) }))
  const live = withStatus.filter((s) => s.status === 'live')
  const planned = withStatus.filter((s) => s.status === 'planned')

  return (
    <div className="lg:grid lg:grid-cols-[168px_minmax(0,1fr)] lg:gap-6 items-start">
      <nav aria-label="Scout Report sections" className="hidden lg:block sticky top-28 self-start">
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-2 px-2">Sections</p>
        <ol className="space-y-0.5">
          {withStatus.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className={`flex items-baseline gap-2 px-2 py-1.5 rounded-lg text-[11.5px] font-sans transition hover:bg-orange-50 hover:text-orange-700 ${s.status === 'live' ? 'text-stone-800 font-semibold' : 'text-stone-400'}`}>
                <span className="font-mono text-[9px] w-4 shrink-0 text-stone-400">{s.num}</span>
                <span className="leading-tight">{s.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="min-w-0 space-y-5">
        <nav aria-label="Scout Report sections" className="lg:hidden flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {withStatus.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="shrink-0 text-[10px] font-mono uppercase tracking-wide px-2.5 py-1.5 rounded-lg border bg-white text-stone-500 border-stone-200 whitespace-nowrap">{s.num}. {s.title}</a>
          ))}
        </nav>

        {live.map((meta) => (
          <ScoutSection key={meta.id} meta={meta} locked={meta.tier === 'pro' && !isPro}>
            <Suspense fallback={<Skeleton />}>{SECTION_BODIES[meta.id]?.(ctx)}</Suspense>
          </ScoutSection>
        ))}

        {planned.length > 0 && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-400 font-semibold mb-2">Coming next</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {planned.map((meta) => <ScoutSection key={meta.id} meta={meta} locked={meta.tier === 'pro' && !isPro} compact />)}
            </div>
          </div>
        )}

        <p className="text-[10px] font-mono text-stone-400 text-center pt-1">Scout Report is information, not advice.</p>
      </div>
    </div>
  )
}
