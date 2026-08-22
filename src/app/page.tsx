import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getScheduleForDate, slugifyGame, shortName, teamLogoUrl } from '@/lib/mlb'
import { getPredictionsForDate } from '@/lib/edge-fetch'
import { getMLBNewsMultiSource } from '@/lib/mlb-homepage'
import SiteHeader from '@/components/SiteHeader'
import LiveTicker from '@/components/LiveTicker'
import SignupForm from '@/components/SignupForm'
import ScrollReveal from '@/components/ScrollReveal'
import { getActiveSport, SPORT_LABELS } from '@/lib/active-sport'
import { getCurrentSubscriber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import ArticlesTeaser from '@/components/ArticlesTeaser'

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

export default async function HomePage({ searchParams }: Props) {
  await redirectSignedInHome()

  const { primary: activeSport } = getActiveSport()
  const today = new Date().toISOString().split('T')[0]

  const [games, predictions, news] = await Promise.all([
    getScheduleForDate(today),
    getPredictionsForDate(today),
    getMLBNewsMultiSource(),
  ])

  const allGames = [...games]
    .map(game => ({ game, pred: predictions.get(game.gamePk) ?? null }))
    .sort((a, b) => new Date(a.game.gameDate).getTime() - new Date(b.game.gameDate).getTime())

  const featured = allGames.find(g => g.pred) ?? allGames[0] ?? null
  const slate = allGames.slice(0, 6)
  const hidden = Math.max(0, allGames.length - slate.length)

  return (
    <main className="min-h-screen bg-[#F4F1EA] text-stone-900 font-sans selection:bg-orange-300/70 antialiased overflow-x-hidden">
      {/* Global keyframes for animations */}
      <style>{`
        @keyframes slow-zoom {
          0% { transform: scale(1.05); }
          100% { transform: scale(1.15); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); }
          33% { transform: translateY(-18px) translateX(12px); }
          66% { transform: translateY(10px) translateX(-8px); }
        }
        @keyframes float-slow {
          0%, 100% { transform: translateY(0) translateX(0) rotate(0deg); }
          50% { transform: translateY(-28px) translateX(16px) rotate(3deg); }
        }
        @keyframes float-reverse {
          0%, 100% { transform: translateY(0) translateX(0); }
          50% { transform: translateY(22px) translateX(-14px); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.08); }
        }
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes drift {
          0% { transform: translate(0, 0); }
          100% { transform: translate(40px, -30px); }
        }
        .animate-slow-zoom { animation: slow-zoom 32s ease-in-out infinite alternate; }
        .animate-float { animation: float 9s ease-in-out infinite; }
        .animate-float-slow { animation: float-slow 14s ease-in-out infinite; }
        .animate-float-reverse { animation: float-reverse 11s ease-in-out infinite; }
        .animate-pulse-glow { animation: pulse-glow 6s ease-in-out infinite; }
        .animate-gradient { background-size: 200% 200%; animation: gradient-shift 18s ease infinite; }
        .animate-drift { animation: drift 20s linear infinite alternate; }
      `}</style>

      <SiteHeader variant="home" />
      <LiveTicker />

      {/* ══════════════════════════════════════
          HERO
         ══════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-[#0A0A0A] text-white">
        {/* Animated background image */}
        <div className="absolute inset-0">
          <Image
            src="/images/sports/mlb-hero.jpg"
            alt=""
            fill
            priority
            className="object-cover animate-slow-zoom opacity-50"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A]/60 via-[#0A0A0A]/80 to-[#0A0A0A]" />
          {/* Moving gradient wash */}
          <div className="absolute inset-0 opacity-30 animate-gradient bg-[linear-gradient(120deg,#FF5722_0%,transparent_40%,#0A0A0A_70%,#FF5722_100%)]" />
        </div>

        {/* Floating orbs */}
        <div className="absolute top-1/4 left-[8%] w-64 h-64 rounded-full bg-[#FF5722]/20 blur-3xl animate-float-slow pointer-events-none" />
        <div className="absolute bottom-1/3 right-[12%] w-80 h-80 rounded-full bg-orange-400/15 blur-3xl animate-float-reverse pointer-events-none" />
        <div className="absolute top-[60%] left-[40%] w-40 h-40 rounded-full bg-white/10 blur-2xl animate-pulse-glow pointer-events-none" />

        {/* Decorative floating crosses (runrobrun vibe) */}
        <div className="absolute top-24 right-[18%] text-white/20 text-2xl font-light animate-float pointer-events-none select-none">+</div>
        <div className="absolute bottom-32 left-[15%] text-white/15 text-xl font-light animate-float-reverse pointer-events-none select-none">+</div>
        <div className="absolute top-[45%] right-[8%] text-white/10 text-3xl font-light animate-float-slow pointer-events-none select-none">+</div>

        <div className="relative max-w-[1400px] mx-auto px-6 sm:px-10 pt-28 pb-24 lg:pt-36 lg:pb-32">
          <div className="max-w-5xl">
            <div className="flex items-center gap-3 mb-10">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF5722] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#FF5722]" />
              </span>
              <span className="text-[12px] font-mono uppercase tracking-[0.25em] text-[#FF5722]">
                {SPORT_LABELS[activeSport]} · Reports live daily
              </span>
            </div>

            <h1 className="text-[clamp(3.8rem,11vw,9rem)] font-serif font-bold tracking-[-0.045em] leading-[0.88] mb-10">
              Scouting<br />
              reports<span className="text-[#FF5722]">.</span>
            </h1>

            <p className="text-xl sm:text-2xl text-stone-300 max-w-2xl leading-relaxed font-light mb-14">
              Deep-dive data for every game — ABS challenges, stolen bases, pitch sequencing, and the three players who matter most — turned into a clear 5-minute read.
            </p>

            <div className="flex flex-col sm:flex-row gap-5 items-start">
              <div className="bg-white text-stone-900 p-5 w-full max-w-md shadow-2xl shadow-black/40 transition-transform duration-500 hover:-translate-y-1">
                <SignupForm source="home_hero" buttonText="Get free reports →" theme="light" />
              </div>
              <p className="text-[12px] font-mono uppercase tracking-widest text-stone-500 pt-4 sm:pt-6">
                Free during beta · No spam
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          WHAT’S INSIDE A REPORT
         ══════════════════════════════════════ */}
      <section className="relative bg-[#F4F1EA] border-b border-stone-200 overflow-hidden">
        {/* Soft floating background shapes */}
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-orange-200/30 blur-3xl animate-float-slow pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full bg-stone-300/40 blur-3xl animate-float-reverse pointer-events-none" />

        <div className="relative max-w-[1400px] mx-auto px-6 sm:px-10 py-24 sm:py-32">
          <div className="mb-20 max-w-4xl">
            <h2 className="text-[clamp(2.8rem,6vw,5rem)] font-serif font-bold tracking-tight leading-[0.95] text-stone-900">
              Every game.<br />
              One clear report<span className="text-[#FF5722]">.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-x-16 gap-y-16">
            {[
              {
                num: '01',
                title: 'ABS challenges',
                body: 'How often each side challenges, success rate, and the real impact on the count.',
              },
              {
                num: '02',
                title: 'Stolen bases',
                body: 'Jump times, catcher pop times, success rates, and when the run is actually on.',
              },
              {
                num: '03',
                title: 'Pitch sequencing',
                body: 'What the starter leans on in leverage and how hitters have responded this season.',
              },
              {
                num: '04',
                title: '3 key players',
                body: 'The three players the data says will decide the game — matchup, form, and the one number that matters.',
              },
            ].map((item, idx) => (
              <div
                key={item.num}
                className="group"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                <div className="text-[13px] font-mono text-[#FF5722] tracking-widest mb-4">
                  {item.num}
                </div>
                <h3 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight mb-4 group-hover:text-[#FF5722] transition-colors duration-300">
                  {item.title}
                </h3>
                <p className="text-lg text-stone-500 leading-relaxed max-w-md">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          FEATURED REPORT
         ══════════════════════════════════════ */}
      {featured?.game && (
        <ScrollReveal>
          <section className="relative bg-white border-b border-stone-200 overflow-hidden">
            <div className="absolute top-20 right-10 w-48 h-48 rounded-full bg-[#FF5722]/10 blur-3xl animate-pulse-glow pointer-events-none" />

            <div className="relative max-w-[1400px] mx-auto px-6 sm:px-10 py-24 sm:py-32">
              <div className="flex items-end justify-between mb-12">
                <div>
                  <div className="text-[12px] font-mono uppercase tracking-[0.2em] text-stone-400 mb-3">
                    Featured report
                  </div>
                  <h2 className="text-4xl sm:text-5xl font-serif font-bold tracking-tight">
                    Today’s deepest read
                  </h2>
                </div>
                <Link
                  href={`/mlb/${slugifyGame(featured.game)}`}
                  className="hidden sm:inline-flex text-sm font-medium text-stone-400 hover:text-stone-900 transition"
                >
                  Open full report →
                </Link>
              </div>

              <Link
                href={`/mlb/${slugifyGame(featured.game)}`}
                className="group block border border-stone-200 bg-[#F4F1EA] hover:border-stone-400 transition-all duration-500 hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.2)] hover:-translate-y-2"
              >
                <div className="grid lg:grid-cols-12">
                  <div className="lg:col-span-7 p-8 sm:p-12 lg:p-16 border-b lg:border-b-0 lg:border-r border-stone-200">
                    <div className="text-[12px] font-mono uppercase tracking-widest text-stone-400 mb-8">
                      {new Date(featured.game.gameDate).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: 'America/New_York',
                      })} ET
                    </div>

                    <div className="flex flex-wrap items-center gap-4 mb-10">
                      <img
                        src={teamLogoUrl(featured.game.teams.away.team.id)}
                        alt=""
                        className="w-14 h-14 object-contain transition-transform duration-500 group-hover:scale-110"
                      />
                      <span className="text-3xl sm:text-4xl font-serif font-bold tracking-tight">
                        {shortName(featured.game.teams.away.team.name)}
                      </span>
                      <span className="text-stone-300 font-mono text-xl">@</span>
                      <img
                        src={teamLogoUrl(featured.game.teams.home.team.id)}
                        alt=""
                        className="w-14 h-14 object-contain transition-transform duration-500 group-hover:scale-110"
                      />
                      <span className="text-3xl sm:text-4xl font-serif font-bold tracking-tight">
                        {shortName(featured.game.teams.home.team.name)}
                      </span>
                    </div>

                    {featured.pred ? (
                      <div className="mb-10">
                        <div className="text-[12px] font-mono uppercase tracking-widest text-stone-400 mb-2">
                          Data lean
                        </div>
                        <div className="text-2xl sm:text-3xl font-serif font-bold leading-snug">
                          {Object.values(featured.pred.components).filter(v => v > 0).length} of{' '}
                          {Object.values(featured.pred.components).length} factors favour{' '}
                          <span className="text-[#FF5722]">
                            {featured.pred.predicted_winner === 'home'
                              ? shortName(featured.game.teams.home.team.name)
                              : shortName(featured.game.teams.away.team.name)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-stone-400 font-mono text-sm mb-10">
                        Full report publishing at 10am ET
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {['ABS', 'SB rates', 'Pitch sequencing', 'Matchup'].map(tag => (
                        <span
                          key={tag}
                          className="text-[11px] font-mono uppercase tracking-wider px-3 py-1.5 bg-white border border-stone-200 text-stone-600 transition-colors group-hover:border-orange-200 group-hover:text-stone-800"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="lg:col-span-5 p-8 sm:p-12 lg:p-16 flex flex-col justify-between">
                    <div>
                      <div className="text-[12px] font-mono uppercase tracking-widest text-stone-400 mb-8">
                        3 key players of the series
                      </div>

                      <div className="space-y-6">
                        {[1, 2, 3].map(i => (
                          <div
                            key={i}
                            className="flex items-center gap-5 transition-transform duration-500 group-hover:translate-x-1"
                            style={{ transitionDelay: `${i * 60}ms` }}
                          >
                            <div className="w-12 h-12 rounded-full bg-stone-200 flex items-center justify-center text-stone-400 font-mono text-sm shrink-0 group-hover:bg-[#FF5722]/15 group-hover:text-[#FF5722] transition-colors">
                              {i}
                            </div>
                            <div>
                              <div className="font-serif font-bold text-lg">Key Player {i}</div>
                              <div className="text-sm text-stone-500">Matchup · Sequencing · Form</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-12 pt-8 border-t border-stone-200">
                      <span className="text-[#FF5722] font-medium group-hover:text-stone-900 transition-colors">
                        Open full scouting report →
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </section>
        </ScrollReveal>
      )}

      {/* ══════════════════════════════════════
          TONIGHT’S REPORTS
         ══════════════════════════════════════ */}
      <ScrollReveal>
        <section className="relative bg-[#F4F1EA] border-b border-stone-200 overflow-hidden">
          <div className="absolute -bottom-20 right-1/4 w-96 h-96 rounded-full bg-orange-100/50 blur-3xl animate-float pointer-events-none" />

          <div className="relative max-w-[1400px] mx-auto px-6 sm:px-10 py-24 sm:py-32">
            <div className="flex items-end justify-between mb-14">
              <h2 className="text-4xl sm:text-5xl font-serif font-bold tracking-tight">
                Tonight’s reports
              </h2>
              <Link href="/mlb" className="text-sm font-medium text-stone-400 hover:text-stone-900 transition">
                Full slate →
              </Link>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {slate.map(({ game, pred }, idx) => {
                const away = shortName(game.teams.away.team.name)
                const home = shortName(game.teams.home.team.name)
                const winner = pred
                  ? pred.predicted_winner === 'home' ? home : away
                  : null

                return (
                  <Link
                    key={game.gamePk}
                    href={`/mlb/${slugifyGame(game)}`}
                    className="group block bg-white border border-stone-200 p-7 hover:border-stone-400 hover:shadow-xl hover:-translate-y-1.5 transition-all duration-400"
                    style={{ transitionDelay: `${idx * 40}ms` }}
                  >
                    <div className="flex items-center gap-3 mb-6">
                      <img src={teamLogoUrl(game.teams.away.team.id)} alt="" className="w-8 h-8 object-contain transition-transform group-hover:scale-110" />
                      <span className="font-serif font-bold text-lg">{away}</span>
                      <span className="text-stone-300 font-mono text-sm">@</span>
                      <img src={teamLogoUrl(game.teams.home.team.id)} alt="" className="w-8 h-8 object-contain transition-transform group-hover:scale-110" />
                      <span className="font-serif font-bold text-lg">{home}</span>
                    </div>

                    {pred && winner ? (
                      <div className="text-sm text-stone-500 mb-4">
                        Data leans <span className="text-[#FF5722] font-medium">{winner}</span>
                      </div>
                    ) : (
                      <div className="text-sm text-stone-300 mb-4">Report coming</div>
                    )}

                    <div className="flex items-center justify-between text-[12px] font-mono text-stone-400">
                      <span>
                        {new Date(game.gameDate).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: 'America/New_York',
                        })}
                      </span>
                      <span className="text-[#FF5722] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        Report →
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>

            {hidden > 0 && (
              <div className="mt-10 text-center">
                <Link
                  href="/mlb"
                  className="inline-flex text-sm font-medium text-stone-500 hover:text-stone-900 transition"
                >
                  +{hidden} more reports today →
                </Link>
              </div>
            )}
          </div>
        </section>
      </ScrollReveal>

      {/* ══════════════════════════════════════
          MULTI-SPORT
         ══════════════════════════════════════ */}
      <ScrollReveal>
        <section className="bg-white border-b border-stone-200">
          <div className="max-w-[1400px] mx-auto px-6 sm:px-10 py-24 sm:py-32">
            <h2 className="text-4xl sm:text-5xl font-serif font-bold tracking-tight mb-16 max-w-3xl">
              Same depth.<br />
              More sports<span className="text-[#FF5722]">.</span>
            </h2>

            <div className="grid sm:grid-cols-3 gap-5">
              <Link href="/nfl" className="relative group h-80 overflow-hidden bg-stone-100">
                <Image src="/images/sports/nfl.jpg" alt="" fill className="object-cover group-hover:scale-110 transition duration-700 ease-out" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="absolute bottom-0 left-0 p-8">
                  <div className="text-[12px] font-mono uppercase tracking-widest text-[#FF5722] mb-2">NFL</div>
                  <div className="text-white text-2xl font-serif font-bold">Launching Sept 9</div>
                </div>
              </Link>

              <div className="relative h-80 overflow-hidden bg-stone-100">
                <Image src="/images/sports/nba.jpg" alt="" fill className="object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="absolute bottom-0 left-0 p-8">
                  <div className="text-[12px] font-mono uppercase tracking-widest text-stone-400 mb-2">NBA</div>
                  <div className="text-white text-2xl font-serif font-bold">Coming soon</div>
                </div>
              </div>

              <div className="relative h-80 overflow-hidden bg-stone-100">
                <Image src="/images/sports/nhl.jpg" alt="" fill className="object-cover grayscale group-hover:grayscale-0 transition duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="absolute bottom-0 left-0 p-8">
                  <div className="text-[12px] font-mono uppercase tracking-widest text-stone-400 mb-2">NHL</div>
                  <div className="text-white text-2xl font-serif font-bold">Coming next</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* ══════════════════════════════════════
          GO DEEPER
         ══════════════════════════════════════ */}
      <ScrollReveal>
        <section className="relative bg-[#F4F1EA] border-b border-stone-200 overflow-hidden">
          <div className="absolute top-1/2 left-0 w-80 h-80 rounded-full bg-orange-200/20 blur-3xl animate-float-reverse pointer-events-none" />

          <div className="relative max-w-[1400px] mx-auto px-6 sm:px-10 py-24 sm:py-32">
            <h2 className="text-4xl sm:text-5xl font-serif font-bold tracking-tight mb-16">
              Go deeper<span className="text-[#FF5722]">.</span>
            </h2>

            <div className="grid sm:grid-cols-2 gap-5">
              <Link
                href="/stats"
                className="group block bg-white border border-stone-200 p-10 sm:p-14 hover:border-stone-400 hover:shadow-2xl hover:-translate-y-2 transition-all duration-500"
              >
                <div className="text-[12px] font-mono uppercase tracking-widest text-[#FF5722] mb-6">
                  Player Stats
                </div>
                <h3 className="text-3xl font-serif font-bold mb-4 group-hover:text-[#FF5722] transition-colors">
                  Season trends,<br />game by game
                </h3>
                <p className="text-stone-500 text-lg leading-relaxed max-w-sm mb-8">
                  AVG, OPS, ERA, WHIP plotted across the whole season. Overlay any prior year.
                </p>
                <span className="text-sm font-medium text-stone-400 group-hover:text-stone-900 transition">
                  Explore stats →
                </span>
              </Link>

              <Link
                href="/lab"
                className="group block bg-white border border-stone-200 p-10 sm:p-14 hover:border-stone-400 hover:shadow-2xl hover:-translate-y-2 transition-all duration-500"
              >
                <div className="text-[12px] font-mono uppercase tracking-widest text-[#FF5722] mb-6">
                  The Lab
                </div>
                <h3 className="text-3xl font-serif font-bold mb-4 group-hover:text-[#FF5722] transition-colors">
                  Build your own<br />comparisons
                </h3>
                <p className="text-stone-500 text-lg leading-relaxed max-w-sm mb-8">
                  Four players or two teams side by side. Radar profiles, rolling trends, the same data.
                </p>
                <span className="text-sm font-medium text-stone-400 group-hover:text-stone-900 transition">
                  Open the Lab →
                </span>
              </Link>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* ══════════════════════════════════════
          FREE VS PRO
         ══════════════════════════════════════ */}
      <ScrollReveal>
        <section className="relative bg-[#0A0A0A] text-white overflow-hidden">
          {/* Animated background orbs */}
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full bg-[#FF5722]/10 blur-[100px] animate-float-slow pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-orange-600/10 blur-[80px] animate-float-reverse pointer-events-none" />

          <div className="relative max-w-[1400px] mx-auto px-6 sm:px-10 py-24 sm:py-32">
            <h2 className="text-[clamp(2.8rem,6vw,5rem)] font-serif font-bold tracking-tight leading-[0.95] mb-20 max-w-4xl">
              Free gets you the report.<br />
              Pro gets you the full depth<span className="text-[#FF5722]">.</span>
            </h2>

            <div className="grid md:grid-cols-2 gap-px bg-stone-800 mb-16">
              <div className="bg-[#0A0A0A] p-10 sm:p-14">
                <div className="text-stone-500 font-mono text-xs uppercase tracking-widest mb-4">Free</div>
                <h3 className="text-3xl font-serif font-bold mb-3">For the fan</h3>
                <p className="text-stone-400 mb-10">Clear reports, every night.</p>
                <ul className="space-y-4 text-stone-300 text-lg">
                  <li>Full scouting report summary</li>
                  <li>Top factors + key players</li>
                  <li>Starting lineups & basic stats</li>
                  <li>Daily email brief</li>
                  <li>Follow up to 3 teams</li>
                </ul>
              </div>

              <div className="bg-[#141414] p-10 sm:p-14 relative">
                <div className="absolute top-10 right-10 text-[10px] font-mono uppercase tracking-widest text-stone-500 border border-stone-700 px-3 py-1">
                  Opens at launch
                </div>
                <div className="text-[#FF5722] font-mono text-xs uppercase tracking-widest mb-4">Pro · £6/mo</div>
                <h3 className="text-3xl font-serif font-bold mb-3">For the analyst</h3>
                <p className="text-stone-400 mb-10">Every layer of the data.</p>
                <ul className="space-y-4 text-stone-300 text-lg">
                  <li>Complete 8-factor breakdown</li>
                  <li>Full narrative + charts</li>
                  <li>Fatigue & availability tracker</li>
                  <li>Fantasy start/sit calls</li>
                  <li>“Why we might be wrong”</li>
                  <li>Unlimited teams, all sports</li>
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap gap-5 items-center">
              <Link
                href="/pricing"
                className="bg-[#FF5722] text-black px-8 py-4 text-sm font-medium hover:bg-orange-400 transition-all duration-300 hover:scale-105"
              >
                Join Pro waitlist →
              </Link>
              <Link
                href="/why-edge"
                className="border border-stone-600 text-stone-300 px-8 py-4 text-sm font-medium hover:border-stone-400 hover:text-white transition"
              >
                See the difference →
              </Link>
              <span className="text-xs font-mono text-stone-500 uppercase tracking-widest">
                First 100 lock £4/mo
              </span>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* ══════════════════════════════════════
          ARTICLES
         ══════════════════════════════════════ */}
      <ScrollReveal>
        <section className="bg-[#F4F1EA] border-b border-stone-200">
          <div className="max-w-[1400px] mx-auto px-6 sm:px-10">
            <ArticlesTeaser />
          </div>
        </section>
      </ScrollReveal>

      {/* ══════════════════════════════════════
          NEWS
         ══════════════════════════════════════ */}
      {news.length > 0 && (
        <ScrollReveal>
          <section className="bg-white border-b border-stone-200">
            <div className="max-w-[1400px] mx-auto px-6 sm:px-10 py-24">
              <h2 className="text-4xl font-serif font-bold tracking-tight mb-12">Around the league</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {news.slice(0, 6).map((item, i) => (
                  <a
                    key={item.id}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group"
                  >
                    <div className="aspect-[16/10] bg-stone-100 overflow-hidden mb-5">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-110 transition duration-700 ease-out"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center font-mono text-xs uppercase tracking-widest text-white"
                          style={{ background: i % 2 === 0 ? '#0A0A0A' : '#FF5722' }}
                        >
                          MLB
                        </div>
                      )}
                    </div>
                    <h3 className="font-serif font-bold text-lg leading-snug group-hover:text-[#FF5722] transition line-clamp-2 mb-2">
                      {item.headline}
                    </h3>
                    <span className="text-xs font-mono text-stone-400 uppercase tracking-widest">
                      {timeAgo(item.published)}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </section>
        </ScrollReveal>
      )}

      {/* ══════════════════════════════════════
          FOOTER
         ══════════════════════════════════════ */}
      <footer className="bg-[#F4F1EA] px-6 sm:px-10 py-16">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex flex-wrap gap-x-12 gap-y-4 mb-12 text-sm text-stone-500">
            <Link href="/mlb" className="hover:text-stone-900 transition">MLB</Link>
            <Link href="/nfl" className="hover:text-stone-900 transition">NFL</Link>
            <Link href="/stats" className="hover:text-stone-900 transition">Stats</Link>
            <Link href="/track-record" className="hover:text-stone-900 transition">Track Record</Link>
            <Link href="/why-edge" className="hover:text-stone-900 transition">Why The Edge</Link>
            <Link href="/pricing" className="hover:text-stone-900 transition">Pricing</Link>
            <Link href="/privacy" className="hover:text-stone-900 transition">Privacy</Link>
            <Link href="/terms" className="hover:text-stone-900 transition">Terms</Link>
            <a href="mailto:hello@edgereportdaily.com" className="hover:text-stone-900 transition">Contact</a>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-stone-400">
            <div>© 2026 The Edge · edgereportdaily.com</div>
            <div className="max-w-md leading-relaxed">
              Statistical analysis only. No gambling advice, picks, or wagering recommendations.
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}