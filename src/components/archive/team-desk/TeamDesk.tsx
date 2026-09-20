// src/components/team-desk/TeamDesk.tsx
//
// The team page's "Club Desk": the Scout Report's sections, one club at a
// time. Sticky section nav on the left (same pattern as ScoutReport.tsx), each
// section wrapped in <Suspense> so a slow one streams in on its own.
//
// Server component. `isPro` is a REQUIRED prop, resolved by the page from the
// subscriber session — never defaulted here. Tier lock behavior comes from the
// shared ScoutSection frame.

import { Suspense } from 'react'
import ScoutSection from '@/components/scout/ScoutSection'
import { teamLogoUrl } from '@/lib/mlb'
import type { ScoutClub } from '@/components/scout/types'
import type { DeskGame } from '@/lib/team-desk-game'
import { TEAM_DESK_SECTIONS } from './sections'
import {
  NextGameDesk, ClubStatusDesk, FormDesk, BullpenDesk, AbsDeskBody,
  RunGameDesk, DefenseDeskBody, SplitsDesk, LeverageDesk, type DeskCtx,
} from './DeskSections'

const BODIES: Record<string, (c: DeskCtx) => React.ReactNode> = {
  'manager-card': (c) => <NextGameDesk c={c} />,
  'club-status': (c) => <ClubStatusDesk c={c} />,
  'form-vs-skill': (c) => <FormDesk c={c} />,
  bullpen: (c) => <BullpenDesk c={c} />,
  abs: (c) => <AbsDeskBody c={c} />,
  'run-game': (c) => <RunGameDesk c={c} />,
  defense: (c) => <DefenseDeskBody c={c} />,
  splits: (c) => <SplitsDesk c={c} />,
  leverage: (c) => <LeverageDesk c={c} />,
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true">
      <div className="h-4 w-1/3 rounded bg-stone-100" />
      <div className="h-56 rounded-xl bg-stone-50" />
    </div>
  )
}

export default function TeamDesk({
  team, game, today, isPro,
}: {
  team: { id: number; name: string; abbr: string }
  game: DeskGame | null
  today: string        // YYYY-MM-DD in ET — the reference date when there is no next game
  isPro: boolean
}) {
  const club: ScoutClub = game
    ? { id: team.id, name: team.name, abbr: team.abbr, probableId: game.team.probableId, probableName: game.team.probableName }
    : { id: team.id, name: team.name, abbr: team.abbr, probableId: null, probableName: null }
  const opp: ScoutClub | null = game
    ? { id: game.opp.id, name: game.opp.name, abbr: game.opp.abbr, probableId: game.opp.probableId, probableName: game.opp.probableName }
    : null

  const c: DeskCtx = {
    club, opp, side: game ? (game.isHome ? 'home' : 'away') : 'home',
    game, gameDate: game?.gameDate ?? today, gamePk: game?.gamePk ?? 0, isPro,
  }

  return (
    <section id="club-desk" className="scroll-mt-20 mt-10">
      <div className="mb-5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={teamLogoUrl(team.id)} alt="" className="w-9 h-9 object-contain shrink-0" />
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-orange-600 font-semibold">⊕ Club desk</p>
          <h2 className="font-serif text-[22px] font-bold text-stone-900 leading-tight">Scouting the {team.name}</h2>
          <p className="text-[12px] font-sans text-stone-500 mt-0.5">
            The Scout Report&apos;s views, for this club all season{game ? ` — with ${game.opp.abbr} (${game.isHome ? 'home' : 'away'}, ${game.gameDate}) as the reference for matchup views.` : ' — no next game is scheduled, so matchup views are hidden.'}
          </p>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[168px_minmax(0,1fr)] lg:gap-6 items-start">
        <nav aria-label="Club desk sections" className="hidden lg:block sticky top-20 self-start">
          <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-2 px-2">Sections</p>
          <ol className="space-y-0.5">
            {TEAM_DESK_SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex items-baseline gap-2 px-2 py-1.5 rounded-lg text-[11.5px] font-sans text-stone-800 font-semibold transition hover:bg-orange-50 hover:text-orange-700">
                  <span className="font-mono text-[9px] w-4 shrink-0 text-stone-400">{s.num}</span>
                  <span className="leading-tight">{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-5">
          <nav aria-label="Club desk sections" className="lg:hidden flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {TEAM_DESK_SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="shrink-0 text-[10px] font-mono uppercase tracking-wide px-2.5 py-1.5 rounded-lg border bg-white text-stone-500 border-stone-200 whitespace-nowrap">{s.num}. {s.title}</a>
            ))}
          </nav>

          {TEAM_DESK_SECTIONS.map((meta) => (
            <ScoutSection key={meta.id} meta={meta} locked={meta.tier === 'pro' && !isPro}>
              <Suspense fallback={<Skeleton />}>{BODIES[meta.id]?.(c)}</Suspense>
            </ScoutSection>
          ))}

          <p className="text-[10px] font-mono text-stone-400 text-center pt-1">The club desk is information, not advice.</p>
        </div>
      </div>
    </section>
  )
}
