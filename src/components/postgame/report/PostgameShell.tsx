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
import HitDeskSection from './HitDeskSection'
import PitchDeskSection from './PitchDeskSection'
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
  'hit-desk': (ctx) => <HitDeskSection ctx={ctx} />,
  'pitch-desk': (ctx) => <PitchDeskSection ctx={ctx} />,
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

// `only` picks the sections of one tab (the report is five tabs, like the labs); without it every section shows, as before.
export default function PostgameShell({ ctx, only }: { ctx: PostgameContext; only?: string[] }) {
  const withStatus = POSTGAME_SECTIONS.map((meta) => ({ ...meta, status: SECTION_BODIES[meta.id] ? ('live' as const) : ('planned' as const) }))
  const live = withStatus.filter((s) => s.status === 'live' && (!only || only.includes(s.id))).sort((a, b) => (only ? only.indexOf(a.id) - only.indexOf(b.id) : 0))

  return (
    <div className="min-w-0 space-y-5">
      {live.length > 1 && (
        <nav aria-label="Sections in this tab" className="flex gap-1.5 overflow-x-auto pb-1">
          {live.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-full border bg-white text-stone-600 border-stone-200 whitespace-nowrap hover:border-orange-400 hover:text-orange-700">{s.title}</a>
          ))}
        </nav>
      )}

      {live.map((meta) => (
        <ScoutSection key={meta.id} meta={meta} locked={meta.tier === 'pro' && !ctx.isPro}>
          {ctx.isAdmin && CARDS[meta.id] && <CardLink gamePk={ctx.gamePk} card={CARDS[meta.id]} />}
          <Suspense fallback={<Skeleton />}>{SECTION_BODIES[meta.id]?.(ctx)}</Suspense>
        </ScoutSection>
      ))}

      <p className="text-[10px] text-stone-400 text-center pt-1">The Postgame report describes what happened. It is information, not advice.</p>
    </div>
  )
}
