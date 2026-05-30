'use client'

/**
 * src/components/FantasyTabContent.tsx
 *
 * Full Fantasy tab layout for the game page.
 * Replaces the existing slotFantasy content.
 *
 * Sections:
 *  1. Starting Pitchers (always shown — SP data always available)
 *  2. Key Batters (Pro-gated; shown when lineups confirmed)
 *  3. Bullpen Watch (always shown)
 *  4. Stack Pick (Pro-gated; shown when lineups confirmed)
 */

import { PitcherCard, BatterCard } from '@/components/FantasyPlayerCard'
import FantasyBullpenWatch from '@/components/FantasyBullpenWatch'
import type { FantasyCards } from '@/lib/fantasy-cards'

type BullpenData = {
  era: number | null
  ip_yesterday: number | null
  closer_available: boolean | null
}

type FantasyTabContentProps = {
  fantasyCards: FantasyCards | null
  homeAbbr: string
  awayAbbr: string
  homeBullpen: BullpenData
  awayBullpen: BullpenData
  isPro: boolean
}

// ─── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-mono uppercase tracking-widest text-[#FF5722] font-bold">
        {label}
      </h3>
      {children}
    </section>
  )
}

// ─── Pending state ─────────────────────────────────────────────────────────────

function PendingCard({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-5 flex items-center gap-3">
      <span className="text-stone-300 text-lg">◎</span>
      <div>
        <div className="text-sm font-serif text-stone-500">{label}</div>
        <div className="text-[10px] font-mono text-stone-400 mt-0.5 uppercase tracking-widest">
          Lineups pending — updates ~3 hrs pre-game
        </div>
      </div>
    </div>
  )
}

// ─── Stack Pick panel ──────────────────────────────────────────────────────────

function StackPickPanel({
  team,
  players,
  rationale,
}: {
  team: string
  players: string[]
  rationale: string
}) {
  return (
    <div className="rounded-xl overflow-hidden border border-stone-200 bg-white shadow-sm">
      <div className="bg-[#1A1A1A] px-4 py-3 flex items-center gap-3">
        <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FF5722]">
          § DFS Stack Pick
        </div>
        <div className="text-[9px] font-mono text-[#FDE047] bg-[#FDE047]/10 px-2 py-0.5 rounded border border-[#FDE047]/20">
          {team}
        </div>
      </div>
      <div className="px-4 py-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          {players.map((p) => (
            <span
              key={p}
              className="text-[11px] font-mono text-stone-700 bg-stone-100 px-2.5 py-1 rounded border border-stone-200"
            >
              {p}
            </span>
          ))}
        </div>
        <p className="text-sm text-stone-600 font-serif leading-relaxed pt-1">
          {rationale}
        </p>
      </div>
    </div>
  )
}

// ─── Pro gate for batters ──────────────────────────────────────────────────────

function ProGateBanner() {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 px-5 py-5 flex items-center justify-between shadow-sm">
      <div>
        <div className="font-serif text-lg font-medium text-stone-900">Batter ratings + Stack Pick</div>
        <p className="text-sm text-stone-500 mt-1 font-serif">
          Per-batter analysis with projected stats, rationale, and contrarian angles — Pro only.
        </p>
      </div>
      <a
        href="/pricing"
        className="ml-4 text-[10px] font-mono uppercase tracking-widest bg-stone-900 text-yellow-300 px-4 py-2 hover:bg-[#FF5722] hover:text-white transition rounded whitespace-nowrap"
      >
        Pro →
      </a>
    </div>
  )
}

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden animate-pulse">
      <div className="h-16 bg-stone-200" />
      <div className="p-4 space-y-2">
        <div className="h-3 bg-stone-100 rounded w-2/3" />
        <div className="h-3 bg-stone-100 rounded w-full" />
        <div className="h-3 bg-stone-100 rounded w-4/5" />
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function FantasyTabContent({
  fantasyCards,
  homeAbbr,
  awayAbbr,
  homeBullpen,
  awayBullpen,
  isPro,
}: FantasyTabContentProps) {
  // ── 1. Loading state ─────────────────────────────────────────────────────────
  if (!fantasyCards) {
    return (
      <div className="space-y-10">
        <Section label="§ Starting Pitchers">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <p className="text-[10px] font-mono text-stone-400 text-center pt-1 uppercase tracking-widest">
            Generating analysis — check back shortly
          </p>
        </Section>
        <FantasyBullpenWatch
          homeAbbr={homeAbbr}
          awayAbbr={awayAbbr}
          homeBullpen={homeBullpen}
          awayBullpen={awayBullpen}
        />
      </div>
    )
  }

  const { pitchers, batters, stack_pick, lineups_used } = fantasyCards

  // Separate pitchers by team
  const awayPitcher = pitchers.find((p) => p.team === awayAbbr) ?? pitchers[0] ?? null
  const homePitcher = pitchers.find((p) => p.team === homeAbbr) ?? pitchers[1] ?? null

  // Separate batters by team
  const awayBatters = batters.filter((b) => b.team === awayAbbr)
  const homeBatters = batters.filter((b) => b.team === homeAbbr)

  return (
    <div className="space-y-10">

      {/* ── 1. Starting pitchers ─────────────────────────────────────────────── */}
      <Section label="§ Starting Pitchers">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {awayPitcher ? (
            <PitcherCard card={awayPitcher} />
          ) : (
            <PendingCard label="Away starter not confirmed" />
          )}
          {homePitcher ? (
            <PitcherCard card={homePitcher} />
          ) : (
            <PendingCard label="Home starter not confirmed" />
          )}
        </div>
      </Section>

      {/* ── 2. Key batters (Pro only) ─────────────────────────────────────────── */}
      {isPro ? (
        lineups_used && batters.length > 0 ? (
          <>
            {awayBatters.length > 0 && (
              <Section label={`§ ${awayAbbr} Key Batters`}>
                <div className="space-y-3">
                  {awayBatters.map((b) => (
                    <BatterCard key={b.name} card={b} isPro={isPro} />
                  ))}
                </div>
              </Section>
            )}
            {homeBatters.length > 0 && (
              <Section label={`§ ${homeAbbr} Key Batters`}>
                <div className="space-y-3">
                  {homeBatters.map((b) => (
                    <BatterCard key={b.name} card={b} isPro={isPro} />
                  ))}
                </div>
              </Section>
            )}
          </>
        ) : (
          <Section label="§ Key Batters">
            <PendingCard label="Batter analysis generates when lineups confirm" />
          </Section>
        )
      ) : (
        <Section label="§ Key Batters">
          {/* Show 2 blurred teaser cards, then the gate */}
          <div className="space-y-3 mb-3 opacity-60 pointer-events-none select-none">
            {batters.slice(0, 2).map((b) => (
              <BatterCard key={b.name} card={b} isPro={false} />
            ))}
          </div>
          <ProGateBanner />
        </Section>
      )}

      {/* ── 3. Bullpen Watch ─────────────────────────────────────────────────── */}
      <FantasyBullpenWatch
        homeAbbr={homeAbbr}
        awayAbbr={awayAbbr}
        homeBullpen={homeBullpen}
        awayBullpen={awayBullpen}
      />

      {/* ── 4. Stack Pick (Pro only) ──────────────────────────────────────────── */}
      {isPro && stack_pick ? (
        <Section label="§ DFS Stack Pick">
          <StackPickPanel
            team={stack_pick.team}
            players={stack_pick.players}
            rationale={stack_pick.rationale}
          />
        </Section>
      ) : isPro && !lineups_used ? (
        <Section label="§ DFS Stack Pick">
          <PendingCard label="Stack pick generates when lineups confirm" />
        </Section>
      ) : !isPro ? (
        <Section label="§ DFS Stack Pick">
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-5 py-4 flex items-center justify-between shadow-sm">
            <div>
              <div className="font-serif text-lg font-medium text-stone-900">DFS Stack Pick</div>
              <p className="text-sm text-stone-500 mt-1 font-serif">
                Best 2–3 hitters to correlate tonight, with the math behind it.
              </p>
            </div>
            <a
              href="/pricing"
              className="ml-4 text-[10px] font-mono uppercase tracking-widest bg-stone-900 text-yellow-300 px-4 py-2 hover:bg-[#FF5722] hover:text-white transition rounded whitespace-nowrap"
            >
              Pro →
            </a>
          </div>
        </Section>
      ) : null}

    </div>
  )
}
