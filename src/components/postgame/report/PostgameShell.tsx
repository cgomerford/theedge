// src/components/postgame/report/PostgameShell.tsx
//
// The Postgame report — same frame as the Scout Report: sticky section nav on the left, live
// sections as full-width cards, sections still being built as compact tiles beneath. Registry:
// sections.ts. A section goes live by adding its async server component to SECTION_BODIES; each
// body streams under its own <Suspense> so a slow one never holds up the others.

import { Suspense } from 'react'
import ScoutSection from '@/components/scout/ScoutSection'
import HeaderSection from './HeaderSection'
import SwingSection from './SwingSection'
import PerformersSection from './PerformersSection'
import BoxSection from './BoxSection'
import ScorecardSection from '../ScorecardSection'
import StartersSection from './StartersSection'
import ContactSection from './ContactSection'
import AbsSection from './AbsSection'
import BullpenSection from './BullpenSection'
import DefenseSection from './DefenseSection'
import UmpiresSection from './UmpiresSection'
import KeyPlayersSection from './KeyPlayersSection'
import NextSection from './NextSection'
import PitcherCheckSection from './PitcherCheckSection'
import HitterCheckSection from './HitterCheckSection'
import TeamChartsSection from './TeamChartsSection'
import SeqAuditSection from './SeqAuditSection'
import CountAuditSection from './CountAuditSection'
import ZoneResultSection from './ZoneResultSection'
import ArsenalNightSection from './ArsenalNightSection'
import LeverageSection from './LeverageSection'
import TomorrowSection from './TomorrowSection'
import { CardLink } from './ui'
import { POSTGAME_SECTIONS } from './sections'
import type { PostgameContext } from './types'

const SECTION_BODIES: Partial<Record<string, (ctx: PostgameContext) => React.ReactNode>> = {
  final: (ctx) => <HeaderSection ctx={ctx} />,
  swing: (ctx) => <SwingSection ctx={ctx} />,
  performers: (ctx) => <PerformersSection ctx={ctx} />,
  box: (ctx) => <BoxSection ctx={ctx} />,
  scorecard: (ctx) => <ScorecardSection gamePk={ctx.gamePk} />,
  starters: (ctx) => <StartersSection ctx={ctx} />,
  contact: (ctx) => <ContactSection ctx={ctx} />,
  abs: (ctx) => <AbsSection ctx={ctx} />,
  bullpen: (ctx) => <BullpenSection ctx={ctx} />,
  defense: (ctx) => <DefenseSection ctx={ctx} />,
  umpires: (ctx) => <UmpiresSection ctx={ctx} />,
  'key-players': (ctx) => <KeyPlayersSection ctx={ctx} />,
  next: (ctx) => <NextSection ctx={ctx} />,
  'pitcher-check': (ctx) => <PitcherCheckSection ctx={ctx} />,
  'hitter-check': (ctx) => <HitterCheckSection ctx={ctx} />,
  'team-charts': (ctx) => <TeamChartsSection ctx={ctx} />,
  'seq-audit': (ctx) => <SeqAuditSection ctx={ctx} />,
  'count-audit': (ctx) => <CountAuditSection ctx={ctx} />,
  'zone-result': (ctx) => <ZoneResultSection ctx={ctx} />,
  'arsenal-night': (ctx) => <ArsenalNightSection ctx={ctx} />,
  'leverage-line': (ctx) => <LeverageSection ctx={ctx} />,
  tomorrow: (ctx) => <TomorrowSection ctx={ctx} />,
}

// sections that have an X graphic (lib/postgame/cards) → the card kind
const CARDS: Record<string, string> = { final: 'final', swing: 'swing', performers: 'performers', starters: 'starters', contact: 'contact', abs: 'abs', umpires: 'umpire', 'leverage-line': 'leverage' }

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true">
      <div className="h-4 w-1/3 rounded bg-stone-100" />
      <div className="h-56 rounded-xl bg-stone-50" />
    </div>
  )
}

export default function PostgameShell({ ctx }: { ctx: PostgameContext }) {
  const withStatus = POSTGAME_SECTIONS.map((meta) => ({ ...meta, status: SECTION_BODIES[meta.id] ? ('live' as const) : ('planned' as const) }))
  const live = withStatus.filter((s) => s.status === 'live')
  const planned = withStatus.filter((s) => s.status === 'planned')
  const freePlanned = planned.filter((s) => s.tier !== 'pro'), proPlanned = planned.filter((s) => s.tier === 'pro')

  return (
    <div className="lg:grid lg:grid-cols-[176px_minmax(0,1fr)] lg:gap-6 items-start">
      <nav aria-label="Postgame sections" className="hidden lg:block sticky top-28 self-start">
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
        <nav aria-label="Postgame sections" className="lg:hidden flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {withStatus.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="shrink-0 text-[10px] font-mono uppercase tracking-wide px-2.5 py-1.5 rounded-lg border bg-white text-stone-500 border-stone-200 whitespace-nowrap">{s.num}. {s.title}</a>
          ))}
        </nav>

        {live.map((meta) => (
          <ScoutSection key={meta.id} meta={meta} locked={meta.tier === 'pro' && !ctx.isPro}>
            {ctx.isAdmin && CARDS[meta.id] && <CardLink gamePk={ctx.gamePk} card={CARDS[meta.id]} />}
            <Suspense fallback={<Skeleton />}>{SECTION_BODIES[meta.id]?.(ctx)}</Suspense>
          </ScoutSection>
        ))}

        {freePlanned.length > 0 && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-400 font-semibold mb-2">Coming next · free</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{freePlanned.map((meta) => <ScoutSection key={meta.id} meta={meta} locked={false} compact />)}</div>
          </div>
        )}
        {proPlanned.length > 0 && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-400 font-semibold mb-2">Coming next · Pro — plan vs execution</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{proPlanned.map((meta) => <ScoutSection key={meta.id} meta={meta} locked={!ctx.isPro} compact />)}</div>
          </div>
        )}

        <p className="text-[10px] font-mono text-stone-400 text-center pt-1">The Postgame report describes what happened. It is information, not advice.</p>
      </div>
    </div>
  )
}
