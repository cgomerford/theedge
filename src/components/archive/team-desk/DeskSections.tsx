// src/components/team-desk/DeskSections.tsx
//
// Async server-component bodies for the team page's Club Desk. Each one
// fetches its own data (so <Suspense> in TeamDesk.tsx streams them
// independently — a slow Savant pull in one never holds up the others) and
// renders the Scout Report's own single-club panels, exported from
// components/scout/*. No new data fetching logic lives here: every number
// comes from the same src/lib/scout/* libs the game Scout Report uses, and
// those read precomputed Supabase tables / cached Savant pulls, not live
// fan-out.
//
// Matchup-dependent views (run game vs the battery, defense vs the lineup,
// late innings vs this opponent, watch-fors) key off the club's NEXT game.
// With no next game they render an explicit empty state — never a guess.

import Link from 'next/link'
import { teamLogoUrl } from '@/lib/mlb'
import type { DeskGame } from '@/lib/team-desk-game'
import type { ScoutClub, ScoutContext } from '@/components/scout/types'
import Tabs from '@/components/scout/Tabs'
import StatExplorer from '@/components/scout/StatExplorer'
import Leaderboard from '@/components/scout/Leaderboard'
import PrintButton from '@/components/scout/PrintButton'

import { getManagerCards } from '@/lib/scout/manager-card'
import { Column as WatchColumn, CSS as MANAGER_CSS } from '@/components/scout/ManagerCardSection'

import { getClubStatus } from '@/lib/scout/club-status'
import { getRosterProfiles, MIN_TYPE_PA } from '@/lib/scout/roster-profile'
import { MlbColumn } from '@/components/scout/ClubStatusSection'

import { getTeamTrend, OFFENSE_STATS, OFFENSE_TILES } from '@/lib/scout/team-trends'
import { Summary as FormSummary } from '@/components/scout/FormTrendsSection'

import { getBullpenDesk, FLAG_RULES } from '@/lib/scout/bullpen-desk'
import { getBullpenTrends, PEN_STATS, PEN_TILES } from '@/lib/scout/bullpen-trends'
import { WORKLOAD_RULES } from '@/lib/scout/workload'
import { AvailabilityColumn } from '@/components/scout/BullpenSection'
import { RestPanel, UsagePanel } from '@/components/scout/BullpenPanels'

import { getAbsDesk, MIN_RANK_CHALLENGES } from '@/lib/scout/abs-desk'
import { RatePanel, WhoPanel, InningsPanel, SituationsPanel, WatchPanel } from '@/components/scout/ABSSection'

import { getRunGame } from '@/lib/scout/run-game'
import { getSbSituations } from '@/lib/scout/situations'
import { Matchup as RunMatchup, SituationsColumn } from '@/components/scout/RunGameSection'

import { getDefenseDesk } from '@/lib/scout/defense'
import { Matchup as DefenseMatchup, AlignmentGuide } from '@/components/scout/DefenseSection'

import { getClubSplits, MIN_SPLIT_BF, MIN_SPLIT_PA } from '@/lib/scout/splits'
import { getParkDeep } from '@/lib/scout/park-deep'
import { fetchPitcherHands } from '@/lib/pitcher-hands'
import { Column as SplitsColumn, VIEWS, tonightKeys } from '@/components/scout/SplitsSection'

import { getLeverage } from '@/lib/scout/leverage'
import { getLateInnings } from '@/lib/scout/late-innings'
import { CloseLate, BullpenLeverage, Aggression, LateInningsPanel } from '@/components/scout/LeverageSection'

export type DeskCtx = {
  club: ScoutClub
  opp: ScoutClub | null
  side: 'away' | 'home'
  game: DeskGame | null
  gameDate: string      // the next game's date, or today (ET) when there is none
  gamePk: number        // 0 when there is no next game
  isPro: boolean
}

const Foot = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-mono text-stone-400 leading-relaxed">{children}</p>
)

function NoGame({ club, what }: { club: ScoutClub; what: string }) {
  return (
    <p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">
      {club.abbr} has no upcoming game on the schedule, so {what} isn&apos;t shown — it returns when the next game is set.
    </p>
  )
}

// A ScoutContext is only needed by the few scout helpers that still take one
// (manager card, tonightKeys). Built only when there IS an opponent.
function scoutCtx(c: DeskCtx): ScoutContext | null {
  if (!c.opp || !c.game) return null
  return {
    gameDate: c.gameDate, gamePk: c.gamePk,
    away: c.side === 'away' ? c.club : c.opp,
    home: c.side === 'home' ? c.club : c.opp,
    isPro: c.isPro, venueId: c.game.venueId, venueName: c.game.venueName, dayNight: c.game.dayNight,
  }
}

// ── §1 Next game + watch-fors ────────────────────────────────────────────

export async function NextGameDesk({ c }: { c: DeskCtx }) {
  const g = c.game
  const ctx = scoutCtx(c)
  if (!g || !ctx || !c.opp) return <NoGame club={c.club} what="the next-game watch-fors" />

  const cards = await getManagerCards(ctx).catch((err) => {
    console.error('[NextGameDesk] getManagerCards failed:', err instanceof Error ? err.message : err)
    return null
  })
  const when = new Date(g.gameTime).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })

  return (
    <div className="space-y-4">
      <style>{MANAGER_CSS}</style>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={teamLogoUrl(c.opp.id)} alt="" className="w-8 h-8 object-contain shrink-0" />
        <div className="min-w-0">
          <p className="text-[14px] font-sans font-bold text-stone-900 leading-tight">{g.isHome ? 'vs' : '@'} {c.opp.name}{g.live ? ' · LIVE' : ''}</p>
          <p className="text-[10.5px] font-mono text-stone-500">{when} ET · {g.venueName}</p>
        </div>
        <p className="text-[11px] font-sans text-stone-600 leading-snug">
          Probable: <span className="font-semibold">{c.club.probableName ?? 'TBD'}</span> vs <span className="font-semibold">{c.opp.probableName ?? 'TBD'}</span>
        </p>
        <div className="ml-auto flex items-center gap-4">
          <Link href={`/mlb/${g.slug}`} className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-semibold hover:text-orange-700">Game preview →</Link>
          <Link href={`/mlb/${g.slug}/scout-report`} className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-semibold hover:text-orange-700">Full scout report →</Link>
        </div>
      </div>
      <div className="mc-noprint flex justify-end"><PrintButton /></div>
      <WatchColumn club={c.club} side={c.side} items={cards ? cards[c.side] : []} isPro={c.isPro} />
      <Foot>Information, not advice. Each row restates numbers from the sections below with the sample behind it; rows are left out when their sample is too thin.</Foot>
    </div>
  )
}

// ── §2 Club status + roster construction ─────────────────────────────────

export async function ClubStatusDesk({ c }: { c: DeskCtx }) {
  const status = await getClubStatus(c.club.id, c.gameDate, c.gamePk, c.club.probableId).catch(() => null)
  const profiles = status ? await getRosterProfiles(c.club.id, status.roster40Ids, c.gameDate).catch(() => null) : null
  const season = Number(c.gameDate.slice(0, 4))
  return (
    <div className="space-y-4">
      <MlbColumn club={c.club} side={c.side} status={status} profiles={profiles} season={season} />
      <Foot>
        Out = injured list, development list or suspended per the MLB roster. Questionable is derived, not reported: back from the IL within 5 days, a regular missing from a posted lineup, an arm with a heavy recent workload, or a player on a rehab assignment. Roster construction (age, birth country, hands, hitter type) is built from the 40-man; hitter types need {MIN_TYPE_PA}+ PA to be assigned.
      </Foot>
    </div>
  )
}

// ── §3 Form vs skill ─────────────────────────────────────────────────────

export async function FormDesk({ c }: { c: DeskCtx }) {
  const trend = await getTeamTrend(c.club.id, c.club.abbr, c.gameDate, c.club.name).catch(() => null)
  return (
    <div className="space-y-5">
      <FormSummary club={c.club} side={c.side === 'home' ? 'Home' : 'Away'} trend={trend} />
      <StatExplorer
        stats={OFFENSE_STATS}
        clubs={[trend?.explorer ?? null]}
        meta={[{ name: c.club.name, abbr: c.club.abbr, side: c.side === 'home' ? 'Home' : 'Away', logo: teamLogoUrl(c.club.id) }]}
        tiles={OFFENSE_TILES}
        defaultStat="xwoba"
        defaultWindow={7}
        sampleUnit="PA"
        gameUnit="games"
        isPro={c.isPro}
        flagPrompt="Pick a player or a starter faced…"
      />
      <Foot>
        Built from Baseball Savant pitch data and the MLB Stats API, regular season. xwOBA is expected wOBA on contact (actual outcomes on walks and strikeouts). Every window shows the sample behind it.
      </Foot>
    </div>
  )
}

// ── §4 Bullpen ───────────────────────────────────────────────────────────

export async function BullpenDesk({ c }: { c: DeskCtx }) {
  const desk = await getBullpenDesk(c.club.id, c.gameDate).catch(() => null)
  const trends = await getBullpenTrends(c.club.id, c.club.abbr, c.club.name, (desk?.arms ?? []).map((a) => a.id), c.gameDate).catch(() => null)
  const meta = [{ name: c.club.name, abbr: c.club.abbr, side: (c.side === 'home' ? 'Home' : 'Away') as 'Home' | 'Away', logo: teamLogoUrl(c.club.id) }]
  return (
    <div className="space-y-4">
      <Tabs tabs={[
        { id: 'availability', label: 'Availability & roles', content: <AvailabilityColumn club={c.club} side={c.side} desk={desk} /> },
        { id: 'trends', label: 'Trends', content: (
          <StatExplorer stats={PEN_STATS} clubs={[trends?.explorer ?? null]} meta={meta} tiles={PEN_TILES} defaultStat="kbbPct" defaultWindow={7}
            sampleUnit="batters faced" gameUnit="games" isPro={c.isPro} flagPrompt="Pick a starting pitcher…" />
        ) },
        { id: 'rest', label: 'Rest & fatigue', content: <RestPanel club={c.club} side={c.side} trends={trends} /> },
        { id: 'usage', label: 'Usage by arm', content: <UsagePanel club={c.club} side={c.side} trends={trends} desk={desk} /> },
      ]} />
      <div className="text-[10px] font-mono text-stone-400 leading-relaxed space-y-0.5">
        <p><span className="text-amber-700">▲ Overworked</span> = {WORKLOAD_RULES.yesterdayPitches}+ pitches yesterday, {WORKLOAD_RULES.last3Pitches}+ over 3 days, back-to-back days with {WORKLOAD_RULES.backToBackPlusLast3}+ in 3, or {WORKLOAD_RULES.appearsInLast4} of the last 4 days.</p>
        <p><span className="text-emerald-700">● Sharp</span> / <span className="text-rose-700">▼ Shaky</span> = L7 ERA ≤ {FLAG_RULES.sharpEra.toFixed(2)} / ≥ {FLAG_RULES.shakyEra.toFixed(2)}, only once the arm has faced {FLAG_RULES.minBf}+ batters in the window. <span>○ Rested</span> = no pitches in the last 3 days.</p>
      </div>
    </div>
  )
}

// ── §5 ABS ───────────────────────────────────────────────────────────────

export async function AbsDeskBody({ c }: { c: DeskCtx }) {
  const abs = await getAbsDesk(c.club.id, c.club.abbr, c.gameDate).catch(() => null)
  return (
    <div className="space-y-4">
      <Tabs tabs={[
        { id: 'rate', label: 'Rate & success', content: <RatePanel club={c.club} side={c.side} abs={abs} /> },
        { id: 'board', label: 'League leaderboard', content: abs ? (
          <div className="space-y-2">
            <p className="text-[11px] font-sans text-stone-600">Every club&apos;s challenge record this season. Click a column to sort; {c.club.abbr} is highlighted.</p>
            <Leaderboard rows={abs.leaderboard} highlight={[c.club.id]} minRank={MIN_RANK_CHALLENGES} />
            <p className="text-[9.5px] font-mono text-stone-400">Overturned / batter-started / 7th+ shares are faded for clubs under {MIN_RANK_CHALLENGES} challenges.</p>
          </div>
        ) : <p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">No ABS challenge log is available yet.</p> },
        { id: 'who', label: 'Who challenges', content: <WhoPanel club={c.club} side={c.side} abs={abs} /> },
        { id: 'innings', label: 'Innings', content: <InningsPanel club={c.club} side={c.side} abs={abs} /> },
        { id: 'situations', label: 'Counts & situations', content: <SituationsPanel club={c.club} side={c.side} abs={abs} /> },
        { id: 'watch', label: 'Watch-fors', content: <WatchPanel club={c.club} side={c.side} abs={abs} /> },
      ]} />
      <Foot>
        Source: MLB&apos;s game-feed challenge log — the same ABS challenge data Baseball Savant&apos;s boards are built on — for the regular season. Rates are per game played, so games with no challenges count. This describes how the club has used its challenges; it is not a recommendation.
      </Foot>
    </div>
  )
}

// ── §6 Run game ──────────────────────────────────────────────────────────

export async function RunGameDesk({ c }: { c: DeskCtx }) {
  if (!c.opp) return <NoGame club={c.club} what="the run-game matchup" />
  const [rg, mine, theirs] = await Promise.all([
    getRunGame(c.club.id, c.opp.id, c.gameDate, c.gamePk, c.opp.probableId).catch(() => null),
    getSbSituations(c.club.id).catch(() => null),
    getSbSituations(c.opp.id).catch(() => null),
  ])
  return (
    <div className="space-y-4">
      <Tabs tabs={[
        { id: 'matchup', label: `Runners vs ${c.opp.abbr} battery`, content: <RunMatchup runners={c.club} defender={c.opp} side={c.side} rg={rg} defProbable={c.opp.probableName} /> },
        { id: 'situations', label: 'Counts & situations', content: <SituationsColumn runners={c.club} defender={c.opp} side={c.side} mine={mine} theirs={theirs} /> },
      ]} />
      <Foot>
        Sources: Baseball Savant catcher pop-time and sprint-speed leaderboards; MLB Stats API stolen-base and caught-stealing counts; the game-by-game feed for the count and situation of each attempt. These describe what has happened, with the attempts behind each — not steal odds.
      </Foot>
    </div>
  )
}

// ── §7 Defense ───────────────────────────────────────────────────────────

export async function DefenseDeskBody({ c }: { c: DeskCtx }) {
  if (!c.opp) return <NoGame club={c.club} what="the alignment matchup" />
  const d = await getDefenseDesk(c.club.id, c.club.abbr, c.opp.id, c.gameDate, c.gamePk, c.club.probableId).catch(() => null)
  return (
    <div className="space-y-4">
      <AlignmentGuide />
      <DefenseMatchup defense={c.club} offense={c.opp} side={c.side} d={d} />
      <Foot>
        Alignment: Baseball Savant pitch data for the last ~40 days, as shares of pitches (the full shift is banned, so this is Standard vs Strategic vs infield shade). Pull rates: season spray data. OAA: Baseball Savant. Shade direction is a convention, not a measured fielder position. This describes tendencies; it is not a prediction.
      </Foot>
    </div>
  )
}

// ── §8 Splits ────────────────────────────────────────────────────────────

export async function SplitsDesk({ c }: { c: DeskCtx }) {
  const oppHands = c.opp?.probableId ? await fetchPitcherHands([c.opp.probableId]).catch(() => new Map<number, 'L' | 'R'>()) : new Map<number, 'L' | 'R'>()
  const [splits, park] = await Promise.all([
    getClubSplits(c.club.id, c.gameDate, c.gamePk, c.club.probableId).catch(() => null),
    c.game ? getParkDeep(c.game.venueId, c.game.venueName).catch(() => null) : Promise.resolve(null),
  ])
  const ctx = scoutCtx(c)
  const oppHand = c.opp?.probableId ? oppHands.get(c.opp.probableId) ?? null : null
  const tonight = ctx && c.game ? tonightKeys(ctx, c.game.isHome, oppHand) : { platoon: null, homeroad: null, daynight: null }

  return (
    <div className="space-y-4">
      <Tabs tabs={VIEWS.map((v) => ({
        id: v.id, label: v.label,
        content: (
          <div className="space-y-4">
            {v.id === 'daynight' && park && c.game && (
              <p className="text-[11px] font-sans text-stone-600 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                {park.venueName} on Statcast Park Factors — day: runs {park.bySession.Day?.runs ?? '—'} · wOBA {park.bySession.Day?.woba ?? '—'}; night: runs {park.bySession.Night?.runs ?? '—'} · wOBA {park.bySession.Night?.woba ?? '—'} (100 = average).
                {c.game.dayNight ? ` The next game is a ${c.game.dayNight} game.` : ''}
              </p>
            )}
            <SplitsColumn club={c.club} side={c.side} splits={splits} view={v} tonight={tonight[v.id] ?? null} opp={c.opp ?? c.club} />
          </div>
        ),
      }))} />
      <Foot>
        Season splits from the MLB Stats API for the {splits?.lineupSource === 'confirmed' ? 'confirmed' : 'confirmed or projected'} lineup. ★ marks the split that applies to the next game{c.game ? '' : ' (none scheduled)'}. Small numbers beside each OPS are plate appearances (batters faced for pitchers); cells under {MIN_SPLIT_PA} PA / {MIN_SPLIT_BF} BF are faded and not read into.
      </Foot>
    </div>
  )
}

// ── §9 Leverage ──────────────────────────────────────────────────────────

export async function LeverageDesk({ c }: { c: DeskCtx }) {
  const [lv, late] = await Promise.all([
    getLeverage(c.club.id, c.gameDate).catch(() => null),
    c.opp ? getLateInnings(c.club.id, c.opp.id, c.gameDate).catch(() => null) : Promise.resolve(null),
  ])
  const tabs = [
    { id: 'close', label: 'Late & close', content: <CloseLate club={c.club} side={c.side} lv={lv} /> },
    { id: 'pen', label: 'Bullpen in high leverage', content: <BullpenLeverage club={c.club} side={c.side} lv={lv} /> },
    { id: 'aggr', label: 'Late aggression', content: <Aggression club={c.club} side={c.side} lv={lv} /> },
    ...(c.opp ? [{ id: 'late', label: `Late innings vs ${c.opp.abbr}`, content: <LateInningsPanel club={c.club} opp={c.opp} side={c.side} li={late} /> }] : []),
  ]
  return (
    <div className="space-y-4">
      <Tabs tabs={tabs} />
      <Foot>
        Situational splits are from the MLB Stats API (season to date); bullpen save/hold/blown-save and inherited-runner counts come from each reliever&apos;s game log; challenge and steal timing comes from the game-by-game feed. Every figure shows its sample. This describes tendencies — it isn&apos;t a prediction.
      </Foot>
    </div>
  )
}
