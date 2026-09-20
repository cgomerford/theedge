import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getScheduleForDate, shortName, teamLogoUrl, getTodayTickerGames, slugifyGame, getPitcherSeasonStats } from '@/lib/mlb'
import { headshotUrl as pitcherHeadshotUrl } from '@/lib/mlb-assets'
import { getPredictionsForDate } from '@/lib/edge-fetch'
import { getMLBNewsMultiSource } from '@/lib/mlb-homepage'
import { getSeasonLeaders } from '@/lib/mlb-leaders'
import { getBullpenPitches3dTotals } from '@/lib/bullpen'
import { getABSChallengeLeaderboard } from '@/lib/abs-challenges'
import { getAbsInningBreakdown, getAbsDailyTrendByTeam, getPlayerChallengeEfficiency } from '@/lib/abs-challenge-log'
import { getExtraBasesStrip } from '@/lib/extra-bases'
import { getPitcherStatcastProfile } from '@/lib/pitcher-statcast-profile'
import { getBatterBatSpeedProfile, getBatSpeedProfilesForBatters } from '@/lib/batter-bat-speed'
import { getBatterSeasonStats, getTopBattersByPlateAppearances } from '@/lib/batter-stats'
import type { MlbDeepDivesData } from '@/components/MlbDeepDives'
import { getNflTickerGames } from '@/lib/nfl-ticker'
import { fetchNFLHomepageLeaders } from '@/lib/nfl/leaders'
import SiteHeader from '@/components/SiteHeader'
import ScrollReveal from '@/components/ScrollReveal'
import ArticlesTeaser from '@/components/ArticlesTeaser'
import PlayerSearch from '@/components/PlayerSearch'
import SportLiveTicker from '@/components/SportLiveTicker'
import DeepDiveCharts from '@/components/DeepDiveCharts'
import HomeLeaderboards from '@/components/HomeLeaderboards'
import NewsFeedSidebar from '@/components/NewsFeedSidebar'
import { getCurrentSubscriber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────
// 2026-09-11: REWRITE #2 — matches mockup G: two-column terminal layout.
// Content column (board table → deep-dive charts) + sidebar (real
// leaderboards → Edge's own articles → real league news). No hero, no
// animated backdrop, no headline copy — everything above the fold is
// either data or a way to interact with data.
//
// REMOVED from the previous version, per mockup G:
//   - ConstellationHero (animated diamond backdrop) — no longer used
//     anywhere. DELETE src/components/ConstellationHero.tsx unless kept
//     for another page.
//   - LiveStatsSlideshow (single-leader spotlight) — superseded by the
//     real top-N leaderboards in the sidebar. DELETE
//     src/components/LiveStatsSlideshow.tsx unless kept for another page.
//   - The big sell headline/sub-line block — gone entirely, not moved.
//
// KEPT (not shown in mockup G's static markup, but a real feature already
// built — removing it would be a regression nobody asked for):
//   - PlayerSearch, now sitting at the top of the content column (the
//     masthead strip that used to hold it was removed 2026-09-11 so the
//     page reads Header → Ticker with no dark bar between them).
//
// KEPT below the board/charts fold (mockup G didn't re-address these, so
// they're carried over unchanged from the prior version):
//   - FeaturePreviews was DROPPED here on the assumption mockup G's charts
//     supersede it for the "show the toolkit" job — flag if you want it
//     back; it's a one-line re-add.
//   - Featured Edge read, tonight's slate, Free vs Pro, articles, footer.
//
// NEW DATA WIRING:
//   - getSeasonLeaders('stolenBases', 5) added for the real SB leaderboard.
//   - fetchNFLHomepageLeaders(season) added for the real NFL leaderboard —
//     labeled "Best performance" (per-game, not season) because that's
//     honestly all ESPN's scoreboard endpoint gives us (see
//     src/lib/nfl/leaders.ts's own scope note). No sacks/explosive-play
//     columns — no confirmed real source for those.
//   - DeepDiveCharts' MLB side is now real Statcast data (ABS challenge
//     ledger, extra bases taken/given, pitch run-value by count, miss
//     distance, bat speed vs. production — see MlbDeepDives.tsx). NFL side
//     is still illustrative; no NFL equivalent data source exists yet.
//
// FONT: Outfit stands in for Effra (not on Google Fonts — licensed
// Monotype/Dalton Maag typeface). Promoted to the sitewide default via
// next/font in layout.tsx + --font-sans in globals.css — this page no
// longer needs its own scoped override.
//
// Maintenance mode is OFF (flipped 2026-09-20). To re-enable, set MAINTENANCE_MODE = true here, in MLBHomepage.tsx AND in src/proxy.ts.
// ─────────────────────────────────────────────────────────────────────────

const MAINTENANCE_MODE = false

export const revalidate = 1800

type Props = {
  searchParams: Promise<{
    'check-email'?: string
    'already-subscribed'?: string
    error?: string
  }>
}

// PLACEHOLDER — not sourced from a confirmed real current-week calculation
// anywhere else in the app. Replace before ship.
// Deterministic shuffle seeded from a string (e.g. today's date) — used
// instead of Math.random() so a page component stays a pure function of
// its inputs (also what react-hooks/purity enforces). mulberry32 PRNG:
// small, well-known, good enough distribution for "pick 10 of 30."
function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), h | 1)
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61)
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296
  }
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function getCurrentNflWeek(): { season: number; week: number } {
  const now = new Date()
  const season = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  const seasonStart = new Date(season, 8, 4)
  const diffWeeks = Math.floor((now.getTime() - seasonStart.getTime()) / (7 * 86_400_000))
  const week = Math.min(18, Math.max(1, diffWeeks + 1))
  return { season, week }
}

// One team's row inside a board card: logo + name, then starting pitcher
// (name + headshot) and, below that, how hard the bullpen has been used —
// total pitches thrown by relievers on this team over the last 3 calendar
// days (see getBullpenPitches3dTotals / scripts/fetch_bullpen_availability.py).
function TeamPitcherRow({
  teamId,
  teamName,
  pitcher,
  bullpenPitches,
}: {
  teamId: number
  teamName: string
  pitcher?: { id: number; fullName: string }
  bullpenPitches?: number
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center gap-2 mb-1.5">
        <img src={teamLogoUrl(teamId)} alt="" className="w-6 h-6 object-contain shrink-0" />
        <span className="font-bold text-sm">{teamName}</span>
      </div>
      {pitcher ? (
        <div className="flex items-center gap-2 mb-1">
          <img src={pitcherHeadshotUrl(pitcher.id, 60)} alt="" className="w-6 h-6 rounded-full object-cover border border-[#DEDACE] shrink-0" />
          <span className="text-[11px] text-[#8A8577] truncate"><span className="font-bold text-[#1A1A1A]">SP</span> {pitcher.fullName}</span>
        </div>
      ) : (
        <div className="text-[11px] text-[#8A8577] italic mb-1 pl-8">SP TBD</div>
      )}
      {bullpenPitches !== undefined && (
        <div className="text-[10px] text-[#8A8577] pl-8">
          Bullpen has thrown <span className="font-semibold text-[#1A1A1A]">{bullpenPitches}</span> pitches in 3 days
        </div>
      )}
    </div>
  )
}

async function redirectSignedInHome() {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('edge_session')
  if (!sessionCookie?.value) return

  const sub = await getCurrentSubscriber()
  if (!sub) return

  const supa = createAdminClient()
  const { data: subscriber } = await supa
    .from('subscribers')
    .select('primary_team, teams')
    .eq('id', sub.id)
    .single()

  const primarySlug = subscriber?.primary_team ?? subscriber?.teams?.[0] ?? 'phillies'
  redirect(`/mlb/teams/${primarySlug}`)
}

export default async function HomePage({ searchParams }: Props) {
  if (!MAINTENANCE_MODE) {
    await redirectSignedInHome()
  }

  const today = new Date().toISOString().split('T')[0]
  const { season: nflSeason, week: nflWeek } = getCurrentNflWeek()

  const TOP_BATTERS_LIMIT = 100 // "Bat speed vs. production"'s radar/neural pool — see getTopBattersByPlateAppearances

  const [
    games, predictions, news,
    hrLeaders, sbLeaders, eraLeaders, hr30Pool, topBatters,
    mlbTickerGames, nflTickerGames,
    bullpenPitches3d,
    absLedger, absInningBreakdown, absDailyTrendByTeam, absPlayerEfficiency, extraBases,
    nflLeaders,
  ] = await Promise.all([
    getScheduleForDate(today),
    getPredictionsForDate(today),
    getMLBNewsMultiSource(),
    getSeasonLeaders('homeRuns', 5),
    getSeasonLeaders('stolenBases', 5),
    getSeasonLeaders('earnedRunAverage', 5),
    getSeasonLeaders('homeRuns', 30), // sampling pool for "Miss distance"'s 10-random-batter selector — top-30 HR hitters are all real everyday regulars with a meaningful whiff sample, cheap JSON leaderboard call (not a heavy Statcast CSV)
    getTopBattersByPlateAppearances(TOP_BATTERS_LIMIT), // real everyday regulars ranked by playing time (not by any one skill), full season line in ONE call — the bat-speed radar/neural pool's backbone
    getTodayTickerGames(),
    getNflTickerGames(nflSeason, nflWeek),
    getBullpenPitches3dTotals(today),
    getABSChallengeLeaderboard(),
    getAbsInningBreakdown(),
    getAbsDailyTrendByTeam(),
    getPlayerChallengeEfficiency(),
    getExtraBasesStrip(),
    fetchNFLHomepageLeaders(nflSeason),
  ])

  const allGames = [...games]
    .map(game => ({ game, pred: predictions.get(game.gamePk) ?? null }))
    .sort((a, b) => new Date(a.game.gameDate).getTime() - new Date(b.game.gameDate).getTime())

  // "Tonight's board" merges the old featured-matchup spotlight and the
  // slate grid into one set of cards — featured game always first (and
  // rendered 2x width), so it can't be pushed out by slice(0, N) the way
  // it could when this was two independent sections.
  //
  // Card count: the featured card spans 2 of the grid's 3 columns, so row 1
  // is [featured][rest[0]]. 7 more games after that fills two full rows of
  // 3 — 8 cards total, no dangling partial row at the bottom.
  const featured = allGames.find(g => g.pred) ?? allGames[0] ?? null
  const rest = allGames.filter(g => g.game.gamePk !== featured?.game.gamePk).slice(0, 7)
  const boardGames = featured ? [featured, ...rest] : rest

  // Deep Dives (MLB) — the featured game's confirmed starter gets the
  // pitch-level charts (run value by count, miss distance); prefer the
  // home starter, fall back to away, since either is a fine subject.
  const featuredPitcherPick = featured
    ? featured.game.teams.home.probablePitcher
      ? { pitcher: featured.game.teams.home.probablePitcher, teamAbbr: shortName(featured.game.teams.home.team.name), opponentAbbr: shortName(featured.game.teams.away.team.name) }
      : featured.game.teams.away.probablePitcher
        ? { pitcher: featured.game.teams.away.probablePitcher, teamAbbr: shortName(featured.game.teams.away.team.name), opponentAbbr: shortName(featured.game.teams.home.team.name) }
        : null
    : null

  // Pitcher selector pool for the "Pitch run-value by count" card —
  // tonight's featured starter, every other probable starter on tonight's
  // board (so "all pitchers" means every arm actually pitching tonight,
  // not an arbitrary handful), plus the current ERA leaders as bonus
  // marquee names even when they're not starting today. All deduped by id.
  // Each candidate needs both its heavy per-pitch Statcast log (profile,
  // for the count grid) and its light season line (era/whip/K etc., for
  // the "general stats" strip and the official-total reconciliation row)
  // — the season fetch is cheap JSON, the profile fetch is the same
  // ~1-3MB CSV pull already used for the single featured pitcher, just
  // repeated per candidate.
  type PitcherCandidate = { id: number; name: string; teamAbbr: string; opponentAbbr: string | null }
  const pitcherCandidates: PitcherCandidate[] = []
  if (featuredPitcherPick) {
    pitcherCandidates.push({ id: featuredPitcherPick.pitcher.id, name: featuredPitcherPick.pitcher.fullName, teamAbbr: featuredPitcherPick.teamAbbr, opponentAbbr: featuredPitcherPick.opponentAbbr })
  }
  for (const { game } of boardGames) {
    const home = game.teams.home.probablePitcher
    const away = game.teams.away.probablePitcher
    if (home && !pitcherCandidates.some(c => c.id === home.id)) {
      pitcherCandidates.push({ id: home.id, name: home.fullName, teamAbbr: shortName(game.teams.home.team.name), opponentAbbr: shortName(game.teams.away.team.name) })
    }
    if (away && !pitcherCandidates.some(c => c.id === away.id)) {
      pitcherCandidates.push({ id: away.id, name: away.fullName, teamAbbr: shortName(game.teams.away.team.name), opponentAbbr: shortName(game.teams.home.team.name) })
    }
  }
  for (const l of eraLeaders) {
    if (pitcherCandidates.some(c => c.id === l.personId)) continue
    pitcherCandidates.push({ id: l.personId, name: l.name, teamAbbr: l.teamAbbr, opponentAbbr: null })
  }

  // "Miss distance"'s selector — 10 batters picked at random from the
  // top-30 HR pool, reshuffled once per calendar day (seeded off `today`)
  // rather than via Math.random(): a page component is expected to render
  // the same output for the same inputs, and Math.random() breaks that
  // (it's also flagged by react-hooks/purity). Seeding off the date keeps
  // it "random" from a reader's point of view — a fresh 10 tomorrow — while
  // staying a pure, deterministic function of today's date, so every
  // request/user sees the same 10 rather than a different set per request.
  const missDistanceCandidates = seededShuffle(hr30Pool, today).slice(0, 10)

  const [batSpeedResults, pitcherOptionResults, missDistanceBatterResults, topBatterProfiles] = await Promise.all([
    Promise.all(hrLeaders.map(async l => {
      const [profile, seasonStats] = await Promise.all([
        getBatterBatSpeedProfile(l.personId),
        getBatterSeasonStats(l.personId),
      ])
      return profile ? { id: l.personId, name: l.name, teamAbbr: l.teamAbbr, seasonStats, profile } : null
    })),
    Promise.all(pitcherCandidates.map(async c => {
      const [profile, seasonStats] = await Promise.all([
        getPitcherStatcastProfile(c.id),
        getPitcherSeasonStats(c.id),
      ])
      return profile ? { id: c.id, name: c.name, teamAbbr: c.teamAbbr, opponentAbbr: c.opponentAbbr, seasonStats, profile } : null
    })),
    Promise.all(missDistanceCandidates.map(async l => {
      const [profile, seasonStats] = await Promise.all([
        getBatterBatSpeedProfile(l.personId),
        getBatterSeasonStats(l.personId),
      ])
      return profile ? { id: l.personId, name: l.name, teamAbbr: l.teamAbbr, seasonStats, profile } : null
    })),
    // One bounded-concurrency pass fetches every top-100 batter's per-pitch
    // bat-speed profile (see getBatSpeedProfilesForBatters) — each player's
    // own CSV pull is independently 6h-cached by URL, so this cost is only
    // paid once per player per cache window, not on every page view.
    getBatSpeedProfilesForBatters(topBatters.map(b => b.personId)),
  ])

  const pitcherOptions = pitcherOptionResults.filter((r): r is NonNullable<typeof r> => r !== null)
  const featuredPitcherOption = featuredPitcherPick ? pitcherOptions.find(p => p.id === featuredPitcherPick.pitcher.id) ?? null : null
  const missDistanceBatters = missDistanceBatterResults.filter((r): r is NonNullable<typeof r> => r !== null)
  const batSpeedHrLeaders = batSpeedResults.filter((r): r is NonNullable<typeof r> => r !== null)

  // "Bat speed vs. production"'s radar/scatter pool — every top-100-by-
  // plate-appearances batter (real everyday regulars, ranked by playing
  // time rather than any one skill) that has a qualifying bat-speed
  // profile, plus the 5 HR leaders already fetched above as a safety net
  // for star power hitters whose lower PA (platooning, a missed week) kept
  // them just outside the top 100.
  //
  // `source` matters beyond bookkeeping: a HR-leaders-only pool would be
  // selected BECAUSE those batters hit a lot of home runs, so any
  // correlation between bat speed and power computed across it would be
  // inflated by that selection bias. Plate-appearance rank carries no such
  // bias (it's about playing time, not power), so the top-100 pool is
  // tagged 'random' here and feeds the "does bat speed actually predict
  // power" correlation in BatSpeedRadarSection at full size — only the
  // HR-leader safety-net additions are excluded from that read.
  const batSpeedPlayersById = new Map<number, { id: number; name: string; teamAbbr: string; seasonStats: (typeof missDistanceBatters)[number]['seasonStats']; profile: (typeof missDistanceBatters)[number]['profile']; source: 'random' | 'hrLeader' }>()
  for (const b of topBatters) {
    const profile = topBatterProfiles.get(b.personId)
    if (profile) batSpeedPlayersById.set(b.personId, { id: b.personId, name: b.name, teamAbbr: b.teamAbbr, seasonStats: b.seasonStats, profile, source: 'random' })
  }
  for (const b of batSpeedHrLeaders) {
    const id = b.profile.batterId
    if (!batSpeedPlayersById.has(id)) batSpeedPlayersById.set(id, { id, name: b.name, teamAbbr: b.teamAbbr, seasonStats: b.seasonStats, profile: b.profile, source: 'hrLeader' })
  }
  const batSpeedPlayers = [...batSpeedPlayersById.values()]

  const mlbDeepDives: MlbDeepDivesData = {
    absLedger,
    absInningBreakdown,
    absDailyTrendByTeam,
    absPlayerEfficiency,
    extraBases,
    featuredPitcher: featuredPitcherOption
      ? { name: featuredPitcherOption.name, teamAbbr: featuredPitcherOption.teamAbbr, opponentAbbr: featuredPitcherOption.opponentAbbr ?? '', profile: featuredPitcherOption.profile }
      : null,
    pitcherOptions,
    missDistanceBatters,
    batSpeedPlayers,
  }
  const hidden = Math.max(0, allGames.length - boardGames.length)

  return (
    <main className="min-h-screen bg-white text-[#1A1A1A] overflow-x-hidden">
      <style>{`
        /* Outfit (Effra stand-in) is now the sitewide default font — see
           layout.tsx/globals.css — so this page no longer needs its own
           @import or a scoped .edge-page font-family override. */
        .edge-display { font-weight: 800; }

        /* Page-load entrance — staggered fade/slide for above-the-fold
           chrome. Scroll-triggered reveals below the fold use ScrollReveal
           instead; this covers what's visible before any scrolling. */
        @keyframes edgeEnter {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: no-preference) {
          .edge-enter {
            opacity: 0;
            animation: edgeEnter 0.6s ease-out forwards;
          }
        }
      `}</style>

      <div className="edge-page">
        <SiteHeader variant="home" />

        <div className="edge-enter">
          <SportLiveTicker mlbGames={mlbTickerGames} nflGames={nflTickerGames} />
        </div>

        {/* ════ TWO-COLUMN LAYOUT — content + sidebar ═══════════════════ */}
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 py-6">
          <ScrollReveal className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
            {/* ---- CONTENT: board table, then deep-dive charts ---- */}
            <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5">
              <div className="mb-4 max-w-md">
                <PlayerSearch maintenance={MAINTENANCE_MODE} />
              </div>
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-[#FF5722]">§ Tonight&apos;s board</div>
                  <div className="text-[10px] text-[#8A8577]">Starting pitchers &amp; bullpen fatigue for tonight&apos;s slate</div>
                </div>
                {hidden > 0 && (
                  <span className="text-[10px] uppercase tracking-widest text-[#8A8577] shrink-0">+{hidden} more tonight</span>
                )}
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                {boardGames.map(({ game, pred }) => {
                  const isFeatured = featured?.game.gamePk === game.gamePk
                  const isFinal = game.status?.abstractGameState === 'Final'
                  const gameSlug = slugifyGame(game)
                  const away = shortName(game.teams.away.team.name)
                  const home = shortName(game.teams.home.team.name)
                  const gameTime = new Date(game.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })

                  let edge: { leanCount: number; totalFactors: number; winnerName: string } | null = null
                  if (isFeatured && pred) {
                    const factorValues = Object.values(pred.components)
                    edge = {
                      leanCount: factorValues.filter(v => v > 0).length,
                      totalFactors: factorValues.length,
                      winnerName: pred.predicted_winner === 'home' ? home : away,
                    }
                  }

                  return (
                    <div
                      key={game.gamePk}
                      className={`group relative rounded-xl bg-white p-5 transition-all duration-300 hover:shadow-lg hover:shadow-black/10 overflow-hidden ${isFeatured ? 'sm:col-span-2 border-2 border-[#1A1A1A]' : 'border border-[#DEDACE]'}`}
                    >
                      {/* ── hover overlay: Scout Report + Game Preview, or Postgame once final ── */}
                      <div className="absolute inset-0 z-10 flex items-center justify-center gap-2.5 rounded-xl bg-[#1A1A1A]/85 opacity-0 pointer-events-none transition-opacity duration-200 group-hover:opacity-100 group-hover:pointer-events-auto">
                        {isFinal ? (
                          <Link
                            href={`/mlb/${gameSlug}/postgame`}
                            className="px-4 py-2 rounded-lg bg-[#FF5722] text-white text-[11px] font-mono font-bold uppercase tracking-widest hover:bg-white hover:text-[#1A1A1A] transition"
                          >
                            Postgame
                          </Link>
                        ) : (
                          <>
                            <Link
                              href={`/mlb/${gameSlug}/scout-report`}
                              className="px-4 py-2 rounded-lg bg-white text-[#1A1A1A] text-[11px] font-mono font-bold uppercase tracking-widest hover:bg-[#FF5722] hover:text-white transition"
                            >
                              Scout Report
                            </Link>
                            <Link
                              href={`/mlb/${gameSlug}`}
                              className="px-4 py-2 rounded-lg bg-white text-[#1A1A1A] text-[11px] font-mono font-bold uppercase tracking-widest hover:bg-[#FF5722] hover:text-white transition"
                            >
                              Game Preview
                            </Link>
                          </>
                        )}
                      </div>

                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] uppercase tracking-widest text-[#8A8577] font-bold">{gameTime} ET</span>
                        <div className="flex items-center gap-1.5">
                          {isFeatured && (
                            <span className="rounded-full bg-[#FF5722] text-white px-2 py-0.5 text-[10px] uppercase tracking-widest font-bold">★ Featured</span>
                          )}
                          <span className="rounded-full border border-[#DEDACE] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[#8A8577]">Sept 18</span>
                        </div>
                      </div>

                      <div className={isFeatured ? 'grid sm:grid-cols-2 gap-x-8' : ''}>
                        <TeamPitcherRow
                          teamId={game.teams.away.team.id}
                          teamName={away}
                          pitcher={game.teams.away.probablePitcher}
                          bullpenPitches={bullpenPitches3d.get(game.teams.away.team.id)}
                        />
                        <TeamPitcherRow
                          teamId={game.teams.home.team.id}
                          teamName={home}
                          pitcher={game.teams.home.probablePitcher}
                          bullpenPitches={bullpenPitches3d.get(game.teams.home.team.id)}
                        />
                      </div>

                      {edge && (
                        <div className="mt-4 rounded-lg bg-[#1A1A1A] text-white p-4">
                          <div className="text-[10px] uppercase tracking-widest font-bold text-[#FDE047] mb-1">The edge</div>
                          <div className="edge-display text-2xl leading-none mb-1">
                            {edge.leanCount} <span className="text-[#8A8577] text-sm font-normal">of {edge.totalFactors}</span>
                          </div>
                          <div className="text-xs text-white/70">factors lean <span className="text-[#FF5722] font-bold">{edge.winnerName}</span></div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="mt-6">
                <DeepDiveCharts mlbData={mlbDeepDives} />
              </div>
            </div>

            {/* ---- SIDEBAR: real leaderboards, articles, real news ---- */}
            <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5">
              <HomeLeaderboards
                mlbHr={hrLeaders}
                mlbSb={sbLeaders}
                mlbEra={eraLeaders}
                nflPassing={nflLeaders.passingYards?.leaders ?? []}
                nflRushing={nflLeaders.rushingYards?.leaders ?? []}
                nflReceiving={nflLeaders.receivingYards?.leaders ?? []}
              />

              <div className="mt-6 pt-5 border-t border-[#E8E4DC]">
                <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-[#8A8577] mb-3">§ Latest</div>
                <ArticlesTeaser />
              </div>

              <NewsFeedSidebar items={news} />
            </div>
          </ScrollReveal>
        </div>

        {/* ════ FREE VS PRO ═══════════════════════════════════════════ */}
        <ScrollReveal>
          <div className="relative overflow-hidden bg-white text-[#1A1A1A] border-b border-[#E8E4DC]">
            <div className="relative max-w-[1320px] mx-auto px-4 sm:px-6 py-16">
              <h2 className="edge-display text-[40px] sm:text-[48px] leading-tight mb-12 max-w-2xl">
                Free shows you the count. Pro shows you which ones<span className="text-[#FF5722]">.</span>
              </h2>

              <div className="grid md:grid-cols-2 gap-5 mb-10">
                <div className="rounded-2xl border border-[#DEDACE] bg-[#FAF8F3] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-[#C9C4B6]">
                  <div className="text-[10px] uppercase tracking-widest text-[#8A8577] mb-3">Free</div>
                  <h3 className="text-2xl font-semibold mb-2">For the fan</h3>
                  <p className="text-sm text-[#8A8577] italic mb-8">Clear reports, every night.</p>
                  <ul className="space-y-3 text-sm text-[#4A4740]">
                    <li>· Factor count + top 2 factors</li>
                    <li>· Top 5 leaders in every stat category</li>
                    <li>· Starting lineups & basic stats</li>
                    <li>· Follow up to 3 teams</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-[#3A3A38] bg-[#242422] p-8 relative transition-all duration-300 hover:-translate-y-1 hover:border-[#FF5722]/40">
                  <div className="absolute top-6 right-6 rounded-full text-[9px] uppercase tracking-widest text-[#8A8577] border border-[#3A3A38] px-2.5 py-1">
                    Opens at launch
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-[#FDE047] mb-3">Pro · £6/mo</div>
                  <h3 className="text-2xl font-semibold mb-2">For the analyst</h3>
                  <p className="text-sm text-[#8A8577] italic mb-8">Every layer of the data.</p>
                  <ul className="space-y-3 text-sm text-[#D8D5CC]">
                    <li>· Full factor-by-factor breakdown, every game</li>
                    <li>· Pitching Lab, Batting Lab & coverage matchups</li>
                    <li>· Bullpen fatigue tracker</li>
                    <li>· Full postgame reports</li>
                    <li>· Unlimited teams, all sports</li>
                  </ul>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 items-center">
                <span className="rounded-full bg-[#FF5722] text-white px-7 py-3 text-xs uppercase tracking-widest font-bold">
                  Pro opens Sept 18
                </span>
                <span className="text-[10px] text-[#8A8577] uppercase tracking-widest">First 100 lock £4/mo for life</span>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* ════ FOOTER ═══════════════════════════════════════════════════ */}
        <footer className="bg-[#FAF8F3] border-t border-[#E8E4DC] px-4 sm:px-6 py-12">
          <div className="max-w-[1320px] mx-auto">
            <div className="flex flex-wrap gap-x-8 gap-y-3 mb-10 text-xs uppercase tracking-widest text-[#8A8577]">
              <Link href="/why-edge" className="hover:text-[#1A1A1A] transition-colors">Why The Edge</Link>
              <Link href="/pricing" className="hover:text-[#1A1A1A] transition-colors">Pricing</Link>
              <Link href="/privacy" className="hover:text-[#1A1A1A] transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-[#1A1A1A] transition-colors">Terms</Link>
              <a href="mailto:hello@edgereportdaily.com" className="hover:text-[#1A1A1A] transition-colors">Contact</a>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[10px] text-[#8A8577]">
              <div>© 2026 The Edge · edgereportdaily.com · currently patching, features reopen Sept 18</div>
              <div className="max-w-md leading-relaxed">Statistical analysis only. No gambling advice, picks, or wagering recommendations.</div>
            </div>
          </div>
        </footer>
      </div>
    </main>
  )
}