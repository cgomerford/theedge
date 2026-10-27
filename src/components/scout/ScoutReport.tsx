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
import Tabs from '@/components/ui/Tabs'
import { getDeepLookState } from '@/lib/deep-look'
import { ProGateRow, FREE_LOOK_NOTE } from '@/components/pro/ProGateView'
import type { MLBGame } from '@/lib/mlb'
import ScoutSection from './ScoutSection'
import ClubDeskSection from './ClubDeskSection'
import FormTrendsSection from './FormTrendsSection'
import BullpenDeskSection from './BullpenDeskSection'
import ABSDeskSection from './ABSDeskSection'
import RunLabSection from './RunLabSection'
import DefenseDeskSection from './DefenseDeskSection'
import ParkSection from './ParkSection'
import OnePager from './OnePager'
import StarterDeskSection from './StarterDeskSection'
import LineupDeskSection from './LineupDeskSection'
import LeverageDeskSection from './LeverageDeskSection'
import ScoutAppendix from './ScoutAppendix'
import TendenciesDeskSection from './TendenciesDeskSection'
import { SCOUT_SECTIONS } from './sections'
import type { ScoutClub, ScoutContext } from './types'

const SECTION_BODIES: Partial<Record<string, (ctx: ScoutContext) => React.ReactNode>> = {
  'club-status': (ctx) => <ClubDeskSection ctx={ctx} />,
  'form-vs-skill': (ctx) => <FormTrendsSection ctx={ctx} />,
  bullpen: (ctx) => <BullpenDeskSection ctx={ctx} />,
  abs: (ctx) => <ABSDeskSection ctx={ctx} />,
  'run-game': (ctx) => <RunLabSection ctx={ctx} />,
  defense: (ctx) => <DefenseDeskSection ctx={ctx} />,
  park: (ctx) => <ParkSection ctx={ctx} />,
  'pitcher-attack': (ctx) => <StarterDeskSection ctx={ctx} />,
  'lineup-vs-sp': (ctx) => <LineupDeskSection ctx={ctx} />,
  leverage: (ctx) => <LeverageDeskSection ctx={ctx} />,
  'manager-card': (ctx) => <TendenciesDeskSection ctx={ctx} />,
}

// The report in ten tabs, like the labs: one subject per tab (the overview, starters, lineups, bullpen, leverage, ABS, fielding, base running,
// tendencies, then club status, form and park). The free sections (club status, form, bullpen) stay free; Starters and Lineups are the lab layout.
const REPORT_TABS: { id: string; label: string; sections: string[] }[] = [
  { id: 'overview', label: 'Overview', sections: [] },   // the one-page overview (OnePager), not a section
  { id: 'starters', label: 'Starters', sections: ['pitcher-attack'] },
  { id: 'lineups', label: 'Lineups', sections: ['lineup-vs-sp'] },
  { id: 'bullpen', label: 'Bullpen', sections: ['bullpen'] },
  { id: 'leverage', label: 'Leverage', sections: ['leverage'] },
  { id: 'abs', label: 'ABS', sections: ['abs'] },
  { id: 'fielding', label: 'Fielding', sections: ['defense'] },
  { id: 'baserunning', label: 'Base running', sections: ['run-game'] },
  { id: 'tendencies', label: 'Tendencies', sections: ['manager-card'] },
  { id: 'club', label: 'Club, form & park', sections: ['club-status'] },
]

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
      <div className="grid gap-6 md:grid-cols-2">
        {[0, 1].map((i) => <div key={i} className="h-56 rounded-xl bg-stone-50" />)}
      </div>
    </div>
  )
}

// The free and teaser sections are open to everyone. The 8 'pro' sections (registry: sections.ts) open for Pro, or for a free account
// that opens its daily deep look for this game ('scout_report', one look opens all 8). Anyone else gets the section titles and their
// scope lines with ONE row before the first locked section, and the section bodies are never built (no Pro data in the HTML).
// Visiting this page never spends a look: the row's Open button does.
export default async function ScoutReport({ game, gameDate, tab }: { game: MLBGame; gameDate: string; tab?: string }) {
  const state = await getDeepLookState('scout_report', String(game.gamePk))
  const proOpen = state === 'pro' || state === 'this_look'
  const tier = state === 'look_left' || state === 'used' ? 'member' : 'anon'
  let rowShown = false
  const ctx: ScoutContext = { gameDate, gamePk: game.gamePk, away: toClub(game.teams.away), home: toClub(game.teams.home), isPro: proOpen,
    venueId: (game.venue as { id?: number }).id ?? null, venueName: game.venue.name, dayNight: game.dayNight ?? null,
    postseason: !!game.seriesDescription && game.seriesDescription !== 'Regular Season' }
  const active = REPORT_TABS.find(t => t.id === tab) ?? REPORT_TABS[0]
  const inTab = active.sections.map(id => SCOUT_SECTIONS.find(m => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m && !!SECTION_BODIES[m.id])

  return (
    <div className="min-w-0 space-y-5">
      <Suspense fallback={null}>
        <Tabs label="Scout report" defaultTab={REPORT_TABS[0].id} tabs={REPORT_TABS.map(t => ({ id: t.id, label: t.label }))} />
      </Suspense>

      {active.id === 'overview' && <Suspense fallback={<Skeleton />}><OnePager ctx={ctx} /></Suspense>}

      {inTab.length > 1 && (
        <nav aria-label="Sections in this tab" className="flex gap-1.5 overflow-x-auto pb-1">
          {inTab.map((m) => (
            <a key={m.id} href={`#${m.id}`} className="shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-full border bg-white text-stone-600 border-stone-200 whitespace-nowrap hover:border-orange-400 hover:text-orange-700">{m.title}</a>
          ))}
        </nav>
      )}

      {state === 'this_look' && <p style={{ margin: 0, fontSize: 13, color: '#8a8275' }}>{FREE_LOOK_NOTE}</p>}
      {inTab.map((meta) => {
        if (meta.tier === 'pro' && !proOpen) {
          const showRow = !rowShown
          rowShown = true
          return (
            <div key={meta.id}>
              {showRow && <ProGateRow tier={tier} source="scout_report" openable={state === 'look_left' ? { feature: 'scout_report', entityId: String(game.gamePk) } : undefined} noButton={state === 'unavailable'} />}
              <ScoutSection meta={meta} locked>
                <ul className="space-y-1">{meta.scope.map((line) => <li key={line} className="font-sans text-[12px] text-stone-500 leading-snug">{line}</li>)}</ul>
              </ScoutSection>
            </div>
          )
        }
        return (
          <ScoutSection key={meta.id} meta={meta} locked={false}>
            <Suspense fallback={<Skeleton />}>{SECTION_BODIES[meta.id]?.(ctx)}</Suspense>
          </ScoutSection>
        )
      })}

      <ScoutAppendix />

      <p className="text-[10px] text-stone-400 text-center pt-1">Scout Report is information, not advice.</p>
    </div>
  )
}
