import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getScheduleForDate, slugifyGame, shortName, teamLogoUrl } from '@/lib/mlb'
import { getPredictionsForDate } from '@/lib/edge-fetch'
import { getMLBNewsMultiSource } from '@/lib/mlb-homepage'
import { getSeasonLeaders } from '@/lib/mlb-leaders'
import { getGamesAnalyzedCount } from '@/lib/edge-coverage-stats'
import ScoutReportShowcase from '@/components/ScoutReportShowcase'
import SiteHeader from '@/components/SiteHeader'
import LiveTicker from '@/components/LiveTicker'
import SignupForm from '@/components/SignupForm'
import ScrollReveal from '@/components/ScrollReveal'
import LeagueLeadersFloat, { type LeaderCardData } from '@/components/LeagueLeadersFloat'
import AnimatedStatGrid, { type StatEntry } from '@/components/AnimatedStatGrid'
import { getActiveSport, SPORT_LABELS } from '@/lib/active-sport'
import { getCurrentSubscriber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import ArticlesTeaser from '@/components/ArticlesTeaser'

// 2026-08-23: content pass — "What's inside" expanded from 4 generic
// bullets to 6 real features pulled directly from ScoutReportTab and the
// game-slug page's slot structure (Pitching Lab, Batting Lab, hot zone
// matchups, Scout Report modules, Key Players, postgame). Edge
// Indicator/lean language demoted throughout per instruction — "Data
// lean" in the featured card is now a small secondary line, not the
// headline, and the card's primary visual is the actual report content
// (arsenal/hot-zone/scout tags). New "After the final out" section
// covers the real postgame report (box score, spray charts, win
// probability, umpire report — see src/app/mlb/[slug]/postgame/page.tsx).
// Tonight's reports cards get a small "Final · Postgame report" link
// for completed games instead of only the pregame lean line.

export const revalidate = 1800

type Props = {
  searchParams: Promise<{
    'check-email'?: string
    'already-subscribed'?: string
    error?: string
  }>
}

function timeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
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

function FloatingBg({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const orb = variant === 'light' ? 'bg-[#FF5722]/10' : 'bg-[#FF5722]/15'
  const plus = variant === 'light' ? 'text-[#1A1A1A]/10' : 'text-white/10'
  return (
    <>
      <div className={`absolute top-10 left-[6%] w-56 h-56 rounded-full ${orb} blur-3xl edge-float-slow pointer-events-none`} />
      <div className={`absolute bottom-0 right-[10%] w-72 h-72 rounded-full ${orb} blur-3xl edge-float-reverse pointer-events-none`} />
      <div className={`absolute top-1/3 right-[20%] text-3xl font-light ${plus} edge-float pointer-events-none select-none`}>+</div>
      <div className={`absolute bottom-1/4 left-[15%] text-2xl font-light ${plus} edge-float-reverse pointer-events-none select-none`}>+</div>
    </>
  )
}

function SeamTransition({ from, to }: { from: string; to: string }) {
  return (
    <div
      className="relative h-24 -mb-24 pointer-events-none"
      style={{ background: `linear-gradient(to bottom, ${from}, ${to})` }}
    />
  )
}

export default async function HomePage({ searchParams }: Props) {
  await redirectSignedInHome()

  const { primary: activeSport } = getActiveSport()
  const today = new Date().toISOString().split('T')[0]

    const [games, predictions, news, opsLeaders, avgLeaders, eraLeaders, hrLeaders, gamesAnalyzedCount] = await Promise.all([
    getScheduleForDate(today),
    getPredictionsForDate(today),
    getMLBNewsMultiSource(),
    getSeasonLeaders('onBasePlusSlugging', 1),
    getSeasonLeaders('battingAverage', 1),
    getSeasonLeaders('earnedRunAverage', 1),
    getSeasonLeaders('homeRuns', 1),
    getGamesAnalyzedCount(new Date().getFullYear()),
  ])

  const leaders: LeaderCardData[] = [
    { label: 'OPS leader', category: 'onBasePlusSlugging', row: opsLeaders[0] },
    { label: 'AVG leader', category: 'battingAverage', row: avgLeaders[0] },
    { label: 'ERA leader', category: 'earnedRunAverage', row: eraLeaders[0] },
    { label: 'HR leader', category: 'homeRuns', row: hrLeaders[0] },
  ].filter((l): l is LeaderCardData => l.row != null)

  const allGames = [...games]
    .map(game => ({ game, pred: predictions.get(game.gamePk) ?? null }))
    .sort((a, b) => new Date(a.game.gameDate).getTime() - new Date(b.game.gameDate).getTime())

  const featured = allGames.find(g => g.pred) ?? allGames[0] ?? null
  const slate = allGames.slice(0, 6)
  const hidden = Math.max(0, allGames.length - slate.length)

  // TODO: gamesAnalyzedSeason needs a real Supabase count query — left
  // at 0, not fabricated. Everything else here is real.
  const statEntries: StatEntry[] = [
    { icon: 'report', value: allGames.length, label: 'Games analyzed today' },
    { icon: 'grid',   value: 8,  label: 'Factors per game' },
    { icon: 'team',   value: 30, label: 'MLB teams covered' },
       { icon: 'chart',  value: gamesAnalyzedCount,  label: 'Games analyzed this season' },
    { icon: 'check',  value: 16, label: 'Data modules per matchup' },
    { icon: 'ruler',  value: 4,  label: 'Sports on the way' },
  ]

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-[#1A1A1A] overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');
        .edge-display { font-family: 'Bebas Neue', sans-serif; }
@keyframes edge-scout-scroll {
  0% { transform: translateY(0); }
  100% { transform: translateY(-50%); }
}
        @keyframes edge-float {
          0%, 100% { transform: translateY(0) translateX(0); }
          33% { transform: translateY(-14px) translateX(8px); }
          66% { transform: translateY(8px) translateX(-6px); }
        }
        @keyframes edge-float-slow {
          0%, 100% { transform: translateY(0) translateX(0) rotate(0deg); }
          50% { transform: translateY(-24px) translateX(14px) rotate(4deg); }
        }
        @keyframes edge-float-reverse {
          0%, 100% { transform: translateY(0) translateX(0); }
          50% { transform: translateY(18px) translateX(-12px); }
        }
        @keyframes edge-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .edge-float { animation: edge-float 8s ease-in-out infinite; }
        .edge-float-slow { animation: edge-float-slow 13s ease-in-out infinite; }
        .edge-float-reverse { animation: edge-float-reverse 10s ease-in-out infinite; }
        .edge-marquee-track { animation: edge-marquee 28s linear infinite; }
      `}</style>

      <SiteHeader variant="home" />
      <LiveTicker />

      {/* ════ MASTHEAD ════════════════════════════════════════════════ */}
      <div className="border-b border-[#DEDACE] bg-[#F4F1EA]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-[#8A8577]">
          <span>{SPORT_LABELS[activeSport]} · Reports live daily</span>
          <span className="text-[#FF5722] flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF5722] opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#FF5722]" />
            </span>
            Live
          </span>
        </div>
      </div>

      {/* ════ HERO ════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden border-b border-[#DEDACE]">
        <FloatingBg variant="light" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-6 text-center">
          <div className="font-mono text-[11px] uppercase tracking-widest text-[#FF5722] flex items-center justify-center gap-2 mb-4">
            <span>§</span><span>Baseball Savant tells you what happened</span>
          </div>
          <h1 className="edge-display text-[clamp(40px,6vw,68px)] leading-[0.98] tracking-wide mb-6">
            We tell you what<br className="hidden sm:block" /> it means<span className="text-[#FF5722]">.</span>
          </h1>
          <p className="font-serif italic text-lg text-[#4A4740] max-w-xl mx-auto mb-10">
            Pitch arsenal breakdowns, hot zone matchups, bullpen intelligence, and the three players who matter most — turned into a clear read, every night.
          </p>
          <div className="max-w-md mx-auto">
            <SignupForm source="home_hero" buttonText="Get free reports →" theme="light" />
            <p className="text-[10px] font-mono uppercase tracking-widest text-[#8A8577] mt-4">
              Free during beta · No spam
            </p>
          </div>
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pb-16">
          <LeagueLeadersFloat leaders={leaders} />
        </div>
      </div>

            {/* ════ SCOUT REPORT SHOWCASE ═══════════════════════════════════ */}
      <ScrollReveal>
        <div className="relative overflow-hidden border-b border-[#DEDACE] bg-[#F4F1EA]">
          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-16 grid md:grid-cols-2 gap-10 items-center">
            <div className="order-2 md:order-1">
              <div className="font-mono text-[11px] uppercase tracking-widest text-[#FF5722] flex items-center gap-2 mb-4">
                <span>§</span><span>The Scout Report</span>
              </div>
              <h2 className="edge-display text-[36px] leading-tight mb-4">
                Everything we know, one scroll.
              </h2>
              <p className="font-serif text-[#4A4740] leading-relaxed mb-6">
                Season numbers and rolling form. Full pitch arsenal, usage and velocity. Hot zones against tonight's specific starter. Bullpen usage patterns — not just who's available, but who's actually sharp. ABS challenge tendency. Stolen base odds against tonight's catcher. Ballpark and weather. All of it, for both teams, before first pitch.
              </p>
              <Link
                href="/mlb"
                className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#FF5722] hover:text-[#1A1A1A] transition"
              >
                See tonight's reports →
              </Link>
            </div>
            <div className="order-1 md:order-2">
              <ScoutReportShowcase />
            </div>
          </div>
          <SeamTransition from="#F4F1EA" to="#FAF8F3" />
        </div>
      </ScrollReveal>

      {/* ════ STAT GRID ═══════════════════════════════════════════════ */}
      <ScrollReveal>
        <div className="border-b border-[#DEDACE] bg-[#FAF8F3]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
            <div className="font-mono text-[10px] uppercase tracking-widest text-[#FF5722] flex items-center gap-2 mb-8">
              <span>§</span><span>The Edge, by the numbers</span>
            </div>
            <AnimatedStatGrid stats={statEntries} />
          </div>
          <SeamTransition from="#FAF8F3" to="#1A1A1A" />
        </div>
      </ScrollReveal>

      <div className="relative bg-[#1A1A1A] overflow-hidden border-b border-[#1A1A1A] py-3">
        <div className="flex whitespace-nowrap edge-marquee-track">
          {[...Array(2)].map((_, dup) => (
            <div key={dup} className="flex items-center gap-10 pr-10 shrink-0">
              {['Pitch arsenal breakdowns every start', 'Hot zone matchups by handedness', 'Bullpen fatigue, updated daily', 'ABS challenge and SB tendency', 'Build your own attack plan', 'Postgame box score breakdowns'].map((t, i) => (
                <span key={i} className="font-mono text-[11px] uppercase tracking-widest text-[#FAF8F3]/70 flex items-center gap-10">
                  {t}<span className="text-[#FF5722]">§</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ════ WHAT'S INSIDE A REPORT ═══════════════════════════════════ */}
      <ScrollReveal>
        <div className="relative overflow-hidden border-b border-[#DEDACE] bg-[#F4F1EA]">
          <FloatingBg variant="light" />
          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-16">
            <div className="font-mono text-[11px] uppercase tracking-widest text-[#FF5722] flex items-center justify-center gap-2 mb-4">
              <span>§</span><span>What's inside</span>
            </div>
            <h2 className="edge-display text-[34px] text-center mb-4">
              Every game, six ways in.
            </h2>
            <p className="font-serif italic text-center text-[#4A4740] max-w-lg mx-auto mb-12">
              Not one score — a full breakdown of why, built from the same data the pros use.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-10 gap-y-10 max-w-4xl mx-auto">
              {[
                { num: '01', title: 'Pitching Lab', body: 'Full arsenal breakdown, pitch movement, count tendency and sequencing for both starters — plus live bullpen availability.' },
                { num: '02', title: 'Hot zone matchups', body: "Every lineup's hot and cold zones against tonight's starter, mapped by handedness." },
                { num: '03', title: 'Scout Report', body: 'Bullpen usage patterns, ABS challenge tendency, stolen-base tendency vs tonight\'s catcher, and fielding alignment — one place.' },
                { num: '04', title: 'Batting Lab', body: 'Build an attack plan for a specific batter against a specific arsenal, any count.' },
                { num: '05', title: 'Key players', body: "The three players from each side whose matchup, form, and role actually decide tonight's game." },
                { num: '06', title: 'After the game', body: 'Box score breakdown, spray charts, win probability, and the umpire report — the full picture once it\'s over.' },
              ].map(item => (
                <div key={item.num} className="group transition-transform duration-300 hover:-translate-y-1">
                  <div className="font-mono text-[11px] text-[#FF5722] mb-2">{item.num}</div>
                  <h3 className="font-serif text-xl mb-2 group-hover:text-[#FF5722] transition-colors">{item.title}</h3>
                  <p className="text-sm text-[#4A4740] font-serif leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
          <SeamTransition from="#F4F1EA" to="#FAF8F3" />
        </div>
      </ScrollReveal>

      {/* ════ FEATURED REPORT ═══════════════════════════════════════ */}
      {featured?.game && (
        <ScrollReveal>
          <div className="border-b border-[#DEDACE] bg-[#FAF8F3]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
              <div className="flex items-end justify-between mb-8">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-[#8A8577] mb-2">Featured report</div>
                  <h2 className="edge-display text-[32px]">Today's deepest read</h2>
                </div>
                <Link href={`/mlb/${slugifyGame(featured.game)}`} className="hidden sm:inline-flex text-xs font-mono uppercase tracking-widest text-[#8A8577] hover:text-[#1A1A1A] transition">
                  Open full report →
                </Link>
              </div>

              <Link
                href={`/mlb/${slugifyGame(featured.game)}`}
                className="group block border border-[#DEDACE] hover:border-[#1A1A1A] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.15)]"
              >
                <div className="grid lg:grid-cols-12">
                  <div className="lg:col-span-7 p-8 sm:p-10 border-b lg:border-b-0 lg:border-r border-[#DEDACE]">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-[#8A8577] mb-6">
                      {new Date(featured.game.gameDate).toLocaleTimeString('en-US', {
                        hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
                      })} ET
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mb-8">
                      <img src={teamLogoUrl(featured.game.teams.away.team.id)} alt="" className="w-10 h-10 object-contain transition-transform duration-500 group-hover:scale-110" />
                      <span className="edge-display text-[28px]">{shortName(featured.game.teams.away.team.name)}</span>
                      <span className="text-[#DEDACE] font-mono">@</span>
                      <img src={teamLogoUrl(featured.game.teams.home.team.id)} alt="" className="w-10 h-10 object-contain transition-transform duration-500 group-hover:scale-110" />
                      <span className="edge-display text-[28px]">{shortName(featured.game.teams.home.team.name)}</span>
                    </div>

                    {/* Report contents are the primary visual now — Edge
                        lean demoted to a small secondary line below. */}
                    <div className="flex flex-wrap gap-2 mb-6">
                      {['Pitch arsenal', 'Hot zones', 'Bullpen intel', 'ABS + SB tendency'].map(tag => (
                        <span key={tag} className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 border border-[#DEDACE] text-[#8A8577] group-hover:border-[#FF5722]/40 group-hover:text-[#FF5722] transition-colors">
                          {tag}
                        </span>
                      ))}
                    </div>

                    {featured.pred && (
                      <div className="text-xs font-mono text-[#8A8577]">
                        {Object.values(featured.pred.components).filter(v => v > 0).length} of{' '}
                        {Object.values(featured.pred.components).length} factors lean{' '}
                        <span className="text-[#FF5722]">
                          {featured.pred.predicted_winner === 'home'
                            ? shortName(featured.game.teams.home.team.name)
                            : shortName(featured.game.teams.away.team.name)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="lg:col-span-5 p-8 sm:p-10 flex flex-col justify-between bg-[#F4F1EA]">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-widest text-[#8A8577] mb-6">3 key players tonight</div>
                      <div className="space-y-5">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="flex items-center gap-4 transition-transform duration-300 group-hover:translate-x-1" style={{ transitionDelay: `${i * 60}ms` }}>
                            <div className="w-9 h-9 border border-[#DEDACE] flex items-center justify-center text-[#8A8577] font-mono text-xs shrink-0 group-hover:border-[#FF5722]/40 group-hover:text-[#FF5722] transition-colors">
                              {i}
                            </div>
                            <div>
                              <div className="font-serif text-base">Key player {i}</div>
                              <div className="text-xs font-mono text-[#8A8577]">Matchup · Sequencing · Form</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-10 pt-6 border-t border-[#DEDACE]">
                      <span className="text-[#FF5722] font-mono text-xs uppercase tracking-widest group-hover:text-[#1A1A1A] transition-colors">
                        Open full scouting report →
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* ════ TONIGHT'S REPORTS ═══════════════════════════════════════ */}
      <ScrollReveal>
        <div className="border-b border-[#DEDACE] bg-[#F4F1EA]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
            <div className="flex items-end justify-between mb-8">
              <h2 className="edge-display text-[32px]">Tonight's reports</h2>
              <Link href="/mlb" className="text-xs font-mono uppercase tracking-widest text-[#8A8577] hover:text-[#1A1A1A] transition">Full slate →</Link>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {slate.map(({ game, pred }) => {
                const away = shortName(game.teams.away.team.name)
                const home = shortName(game.teams.home.team.name)
                const winner = pred ? (pred.predicted_winner === 'home' ? home : away) : null
                const isFinal = game.status?.abstractGameState === 'Final'
                const gameSlug = slugifyGame(game)

                return (
                  <Link
                    key={game.gamePk}
                    href={isFinal ? `/mlb/${gameSlug}/postgame` : `/mlb/${gameSlug}`}
                    className="group block bg-white border border-[#DEDACE] p-5 hover:border-[#1A1A1A] hover:-translate-y-1 transition-all duration-300"
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <img src={teamLogoUrl(game.teams.away.team.id)} alt="" className="w-6 h-6 object-contain transition-transform group-hover:scale-110" />
                      <span className="font-serif font-medium text-sm">{away}</span>
                      <span className="text-[#DEDACE] font-mono text-xs">@</span>
                      <img src={teamLogoUrl(game.teams.home.team.id)} alt="" className="w-6 h-6 object-contain transition-transform group-hover:scale-110" />
                      <span className="font-serif font-medium text-sm">{home}</span>
                    </div>
                    {isFinal ? (
                      <div className="text-xs font-mono text-[#8A8577] mb-3">Final <span className="text-[#FF5722]">· Postgame report</span></div>
                    ) : pred && winner ? (
                      <div className="text-xs font-mono text-[#8A8577] mb-3">Leans <span className="text-[#FF5722]">{winner}</span></div>
                    ) : (
                      <div className="text-xs font-mono text-[#DEDACE] mb-3">Report coming</div>
                    )}
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#8A8577]">
                      <span>{new Date(game.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}</span>
                      <span className="text-[#FF5722] opacity-0 group-hover:opacity-100 transition-opacity">
                        {isFinal ? 'Recap →' : 'Report →'}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>

            {hidden > 0 && (
              <div className="mt-8 text-center">
                <Link href="/mlb" className="text-xs font-mono uppercase tracking-widest text-[#8A8577] hover:text-[#1A1A1A] transition">
                  +{hidden} more reports today →
                </Link>
              </div>
            )}
          </div>
          <SeamTransition from="#F4F1EA" to="#FAF8F3" />
        </div>
      </ScrollReveal>

      {/* ════ AFTER THE FINAL OUT — postgame reports ═══════════════════ */}
      <ScrollReveal>
        <div className="relative overflow-hidden border-b border-[#DEDACE] bg-[#FAF8F3]">
          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-16">
            <div className="font-mono text-[11px] uppercase tracking-widest text-[#FF5722] flex items-center gap-2 mb-4">
              <span>§</span><span>Once it's over</span>
            </div>
            <h2 className="edge-display text-[32px] mb-4">
              Every finished game gets a postgame report too.
            </h2>
            <p className="font-serif italic text-[#4A4740] max-w-xl mb-12">
              Not just a final score — a full breakdown of how the game actually went.
            </p>

            <div className="grid sm:grid-cols-2 gap-x-10 gap-y-8 max-w-3xl">
              {[
                { title: 'Top performers', body: 'Who actually decided the game, on both sides.' },
                { title: 'Box score breakdown', body: 'Full pitching lines, batting lines, and the pitch-by-pitch log.' },
                { title: 'Spray charts', body: 'Where every ball in play actually landed, scaled to the real ballpark.' },
                { title: 'Win probability', body: 'How the game swung, inning by inning.' },
                { title: 'Bullpen usage', body: "Last 3 days' workload for both bullpens, heading into tomorrow." },
                { title: 'Umpire report', body: "Tonight's crew and how their zone played." },
              ].map(item => (
                <div key={item.title}>
                  <h3 className="font-serif text-lg mb-1">{item.title}</h3>
                  <p className="text-sm text-[#4A4740] font-serif leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
          <SeamTransition from="#FAF8F3" to="#1A1A1A" />
        </div>
      </ScrollReveal>

      {/* ════ FREE VS PRO ═══════════════════════════════════════════ */}
      <ScrollReveal>
        <div className="relative overflow-hidden bg-[#1A1A1A] text-[#FAF8F3] border-b border-[#1A1A1A]">
          <FloatingBg variant="dark" />
          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-16">
            <h2 className="edge-display text-[40px] sm:text-[48px] leading-tight mb-12 max-w-2xl">
              Free shows you the basics. Pro shows you everything behind it<span className="text-[#FF5722]">.</span>
            </h2>

            <div className="grid md:grid-cols-2 gap-px bg-[#3A3A38] mb-10">
              <div className="bg-[#1A1A1A] p-8">
                <div className="font-mono text-[10px] uppercase tracking-widest text-[#8A8577] mb-3">Free</div>
                <h3 className="font-serif text-2xl mb-2">For the fan</h3>
                <p className="text-sm text-[#8A8577] font-serif italic mb-8">Clear reports, every night.</p>
                <ul className="space-y-3 text-sm text-[#D8D5CC] font-mono">
                  <li>· Factor breakdown + top 2 factors</li>
                  <li>· Starting lineups & basic stats</li>
                  <li>· Daily email brief</li>
                  <li>· Follow up to 3 teams</li>
                </ul>
              </div>
              <div className="bg-[#242422] p-8 relative">
                <div className="absolute top-6 right-6 text-[9px] font-mono uppercase tracking-widest text-[#8A8577] border border-[#3A3A38] px-2.5 py-1">
                  Opens at launch
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-[#FDE047] mb-3">Pro · £6/mo</div>
                <h3 className="font-serif text-2xl mb-2">For the analyst</h3>
                <p className="text-sm text-[#8A8577] font-serif italic mb-8">Every layer of the data.</p>
                <ul className="space-y-3 text-sm text-[#D8D5CC] font-mono">
                  <li>· Full Scout Report, every game</li>
                  <li>· Pitching Lab + Batting Lab</li>
                  <li>· Hot zone matchups by handedness</li>
                  <li>· Bullpen fatigue tracker</li>
                  <li>· Full postgame reports</li>
                  <li>· Unlimited teams, all sports</li>
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 items-center">
              <Link href="/pricing" className="bg-[#FF5722] text-white px-7 py-3 text-xs font-mono uppercase tracking-widest hover:bg-[#e64a1a] transition-all hover:scale-105">
                Join Pro waitlist →
              </Link>
              <Link href="/why-edge" className="border border-[#3A3A38] text-[#D8D5CC] px-7 py-3 text-xs font-mono uppercase tracking-widest hover:border-[#8A8577] hover:text-white transition-colors">
                See the difference →
              </Link>
              <span className="text-[10px] font-mono text-[#8A8577] uppercase tracking-widest">First 100 lock £4/mo</span>
            </div>
          </div>
          <SeamTransition from="#1A1A1A" to="#FAF8F3" />
        </div>
      </ScrollReveal>

      {/* ════ ARTICLES ═══════════════════════════════════════════════ */}
      <ScrollReveal>
        <div className="border-b border-[#DEDACE] bg-[#FAF8F3]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <ArticlesTeaser />
          </div>
        </div>
      </ScrollReveal>

      {/* ════ NEWS ═══════════════════════════════════════════════════ */}
      {news.length > 0 && (
        <ScrollReveal>
          <div className="border-b border-[#DEDACE] bg-[#F4F1EA]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
              <h2 className="edge-display text-[32px] mb-10">Around the league</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {news.slice(0, 6).map((item, i) => (
                  <a key={item.id} href={item.link} target="_blank" rel="noopener noreferrer" className="group">
                    <div className="aspect-[16/10] bg-[#DEDACE] overflow-hidden mb-4">
                      {item.image ? (
                        <img src={item.image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-mono text-xs uppercase tracking-widest text-white" style={{ background: i % 2 === 0 ? '#1A1A1A' : '#FF5722' }}>
                          MLB
                        </div>
                      )}
                    </div>
                    <h3 className="font-serif text-base leading-snug group-hover:text-[#FF5722] transition-colors line-clamp-2 mb-2">{item.headline}</h3>
                    <span className="text-[10px] font-mono text-[#8A8577] uppercase tracking-widest">{timeAgo(item.published)}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* ════ FOOTER ═══════════════════════════════════════════════════ */}
      <footer className="bg-[#F4F1EA] px-4 sm:px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap gap-x-8 gap-y-3 mb-10 text-xs font-mono uppercase tracking-widest text-[#8A8577]">
            <Link href="/mlb" className="hover:text-[#1A1A1A] transition-colors">MLB</Link>
            <Link href="/nfl" className="hover:text-[#1A1A1A] transition-colors">NFL</Link>
            <Link href="/stats" className="hover:text-[#1A1A1A] transition-colors">Stats</Link>
            <Link href="/track-record" className="hover:text-[#1A1A1A] transition-colors">Track record</Link>
            <Link href="/why-edge" className="hover:text-[#1A1A1A] transition-colors">Why The Edge</Link>
            <Link href="/pricing" className="hover:text-[#1A1A1A] transition-colors">Pricing</Link>
            <Link href="/privacy" className="hover:text-[#1A1A1A] transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-[#1A1A1A] transition-colors">Terms</Link>
            <a href="mailto:hello@edgereportdaily.com" className="hover:text-[#1A1A1A] transition-colors">Contact</a>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[10px] font-mono text-[#8A8577]">
            <div>© 2026 The Edge · edgereportdaily.com</div>
            <div className="max-w-md leading-relaxed">Statistical analysis only. No gambling advice, picks, or wagering recommendations.</div>
          </div>
        </div>
      </footer>
    </main>
  )
}