import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getScheduleForDate, slugifyGame, shortName, teamLogoUrl } from '@/lib/mlb'
import { getOverallStats } from '@/lib/track-record'
import { getPredictionsForDate } from '@/lib/edge-fetch'
import { getMLBNewsMultiSource } from '@/lib/mlb-homepage'
import SiteHeader from '@/components/SiteHeader'
import LiveTicker from '@/components/LiveTicker'
import SignupForm from '@/components/SignupForm'
import ScrollReveal from '@/components/ScrollReveal'
import { getActiveSport, SPORT_LABELS } from '@/lib/active-sport'
import FactorsTabs from '@/components/FactorsTabs'

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

function tierStyles(tier: string) {
  if (tier === 'strong')   return 'text-[#FF5722] border-orange-200 bg-orange-50'
  if (tier === 'moderate') return 'text-yellow-700 border-yellow-200 bg-yellow-50'
  return 'text-stone-600 border-stone-200 bg-stone-50'
}

function tierText(tier: string) {
  if (tier === 'strong')   return 'Strong edge'
  if (tier === 'moderate') return 'Moderate edge'
  return 'Slight edge'
}

export default async function HomePage({ searchParams }: Props) {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('edge_session')
  if (sessionCookie?.value) redirect('/dugout')

  const { primary: activeSport } = getActiveSport()
  const today = new Date().toISOString().split('T')[0]

  const [games, overallStats, predictions, news] = await Promise.all([
    getScheduleForDate(today),
    getOverallStats(),
    getPredictionsForDate(today),
    getMLBNewsMultiSource(),
  ])

  const topEdges = games
    .map(game => ({ game, pred: predictions.get(game.gamePk) }))
    .filter(({ pred }) => pred && pred.confidence_tier !== 'tossup' && pred.summary)
    .sort((a, b) => Math.abs(b.pred!.edge_score) - Math.abs(a.pred!.edge_score))
    .slice(0, 5)

  const featuredEdge = topEdges[0] ?? null
  const sideEdges    = topEdges.slice(1, 5)

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-stone-900 font-sans selection:bg-orange-200">
      <SiteHeader variant="home" />
      <LiveTicker />

      {/* ── HERO — photo-driven ── */}
      <section className="relative border-b border-stone-200 overflow-hidden">
        {/* background photo + overlay */}
        <div className="absolute inset-0">
          <Image
            src="/images/sports/mlb-hero.jpg"
            alt=""
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#1A1A1A]/95 via-[#1A1A1A]/75 to-[#1A1A1A]/35" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A]/70 via-transparent to-transparent" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-2 gap-0">

            {/* Left — headline + signup, now sat on the photo */}
            <div className="py-14 md:py-24 md:pr-10">
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#FDE047] mb-4">
                § Sports analytics · {SPORT_LABELS[activeSport]} in season
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-serif font-bold tracking-tight leading-[1.05] mb-5 text-[#FAF8F3]">
                Sharp analysis.<br />
                Every major sport<span className="text-[#FF5722]">.</span>
              </h1>
              <p className="text-base sm:text-lg text-stone-200 mb-7 leading-relaxed font-serif italic max-w-md">
                A proprietary data model does the maths to help you understand who has the edge in the the data. AI insights turns it into a 5-minute read that will help you follow your teams, make fantasy calls, and enjoy the game more.
              </p>

              <div className="bg-[#FAF8F3]/95 backdrop-blur-sm p-4 border border-stone-200 max-w-md">
                <SignupForm source="home_hero" buttonText="Get beta access →" theme="light" />
              </div>
           <p className="text-[10px] text-stone-300 font-mono uppercase tracking-widest mt-3">
  Beta access · Free during beta · No spam
</p>

              <div className="flex flex-wrap gap-2 mt-6">
                <span className="bg-[#FF5722] text-[#1A1A1A] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider">MLB — Live now</span>
                <span className="bg-white/10 text-stone-100 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider border border-white/20">NFL — Sept 9</span>
                <span className="bg-white/10 text-stone-100 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider border border-white/20">NBA + NHL — Coming</span>
              </div>
            </div>

            {/* Right — featured edge, floating card over the photo */}
            <div className="hidden md:flex flex-col justify-center py-24 pl-10">
              {featuredEdge ? (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-stone-200 mb-4">⊕ Featured Matchup</div>
                  <Link
                    href={`/mlb/${slugifyGame(featuredEdge.game)}`}
                    className="block bg-[#FAF8F3]/97 backdrop-blur-sm border border-stone-200 p-6 hover:border-stone-400 hover:shadow-xl transition group"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <img src={teamLogoUrl(featuredEdge.game.teams.away.team.id)} alt="" className="w-8 h-8 object-contain" />
                      <span className="font-serif text-lg font-bold">{shortName(featuredEdge.game.teams.away.team.name)}</span>
                      <span className="text-stone-300 font-mono">@</span>
                      <img src={teamLogoUrl(featuredEdge.game.teams.home.team.id)} alt="" className="w-8 h-8 object-contain" />
                      <span className="font-serif text-lg font-bold">{shortName(featuredEdge.game.teams.home.team.name)}</span>
                    </div>
                    {featuredEdge.pred!.story_lead ? (
                      <p className="font-serif italic text-stone-700 leading-relaxed text-[15px] line-clamp-4 mb-5">
                        {featuredEdge.pred!.story_lead}
                      </p>
                    ) : featuredEdge.pred!.summary ? (
                      <p className="font-serif italic text-stone-700 leading-relaxed text-[15px] line-clamp-4 mb-5">
                        &ldquo;{featuredEdge.pred!.summary}&rdquo;
                      </p>
                    ) : null}
                    <div className="flex justify-between items-center text-[10px] font-mono text-stone-400 pt-4 border-t border-stone-100">
                      <span>{new Date(featuredEdge.game.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET</span>
                      <span className="text-[#FF5722] group-hover:text-stone-900 transition">Full read →</span>
                    </div>
                  </Link>
                  {games.length > 0 && (
                    <Link href="/mlb" className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-[#FDE047] hover:text-white transition mt-4">
                      See all {games.length} games tonight →
                    </Link>
                  )}
                </div>
              ) : (
                <div className="text-center bg-[#FAF8F3]/95 backdrop-blur-sm p-8 border border-stone-200">
                  <p className="font-serif text-stone-400 italic mb-4">Today&apos;s edges publish at 10am ET</p>
                  <Link href="/mlb" className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722]">View MLB hub →</Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <ScrollReveal>
        <section className="bg-white border-b border-stone-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
            <div className="grid grid-cols-3 divide-x divide-stone-100">

              <Link href="/why-edge" className="group px-4 sm:px-6 py-1 flex flex-col justify-center">
                <div className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 group-hover:text-[#FF5722] transition leading-none mb-1">
                  8
                </div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-stone-900">
                  Factors per game
                </div>
                <div className="text-[8px] font-mono text-stone-400 mt-1 max-w-[160px] leading-tight group-hover:text-stone-500 transition">
                  Pitching, bullpen, matchup, park, weather — all of it.
                </div>
              </Link>

              <Link href="/why-edge" className="group px-4 sm:px-6 py-1 flex flex-col justify-center">
                <div className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 group-hover:text-[#FF5722] transition leading-none mb-1">
                  100%
                </div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-stone-900">
                  Reasoning shown
                </div>
                <div className="text-[8px] font-mono text-stone-400 mt-1 max-w-[160px] leading-tight group-hover:text-stone-500 transition">
                  Every factor&apos;s lean, every game — never a black box.
                </div>
              </Link>

              <div className="px-4 sm:px-6 py-1 flex flex-col justify-center">
                <div className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 leading-none mb-1">
                  5 min
                </div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-1">
                  Morning read
                </div>
                <div className="text-[8px] font-mono text-stone-400 mt-1 max-w-[160px] leading-tight">
                In your inbox. Free.
                </div>
              </div>

            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* ── MULTI-SPORT STRIP (new) ── */}
      <ScrollReveal>
        <section className="bg-white border-b border-stone-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
            <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-2">§ One model, every league</div>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 mb-6">
             Unique Data Models<span className="text-[#FF5722]">.</span> Every sport you follow<span className="text-[#FF5722]">.</span>
            </h2>
            <div className="grid sm:grid-cols-3 gap-4">

              <Link href="/nfl" className="relative group block h-56 overflow-hidden border border-stone-200">
                <Image src="/images/sports/nfl.jpg" alt="" fill className="object-cover group-hover:scale-105 transition duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A]/90 via-[#1A1A1A]/15 to-transparent" />
                <div className="absolute bottom-0 left-0 p-4">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FDE047] block mb-1">NFL Edge</span>
                  <span className="text-white font-serif font-bold text-lg block">Launching Sept 9 →</span>
                </div>
              </Link>

              <div className="relative group block h-56 overflow-hidden border border-stone-200">
                <Image src="/images/sports/nba.jpg" alt="" fill className="object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A]/90 via-[#1A1A1A]/15 to-transparent" />
                <div className="absolute bottom-0 left-0 p-4">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-stone-300 block mb-1">NBA Edge</span>
                  <span className="text-white font-serif font-bold text-lg block">Coming soon</span>
                </div>
              </div>

              <div className="relative group block h-56 overflow-hidden border border-stone-200">
                <Image src="/images/sports/nhl.jpg" alt="" fill className="object-cover grayscale" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A]/90 via-[#1A1A1A]/15 to-transparent" />
                <div className="absolute bottom-0 left-0 p-4">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-stone-300 block mb-1">NHL Edge</span>
                  <span className="text-white font-serif font-bold text-lg block">Coming next</span>
                </div>
              </div>

            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* ── EDGES + NEWS ── */}
      <ScrollReveal>
        <section className="border-b border-stone-200 bg-[#FAF8F3]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
            <div className="grid md:grid-cols-2 gap-8">

              {/* LEFT — Tonight's edges */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722]">§ MLB · Tonight&apos;s reads</div>
                  <Link href="/mlb" className="text-[10px] font-mono uppercase tracking-widest text-stone-400 hover:text-stone-900 transition">Full slate →</Link>
                </div>
                <div className="space-y-2">
                  {topEdges.map(({ game, pred }) => (
                    <Link
                      key={game.gamePk}
                      href={`/mlb/${slugifyGame(game)}`}
                      className="flex items-start gap-3 bg-white border border-stone-200 p-4 hover:border-stone-400 hover:shadow-sm transition group"
                    >
                      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                        <img src={teamLogoUrl(game.teams.away.team.id)} alt="" className="w-5 h-5 object-contain" />
                        <img src={teamLogoUrl(game.teams.home.team.id)} alt="" className="w-5 h-5 object-contain" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="font-serif text-sm font-bold">{shortName(game.teams.away.team.name)}</span>
                          <span className="text-stone-300 font-mono text-xs">@</span>
                          <span className="font-serif text-sm font-bold">{shortName(game.teams.home.team.name)}</span>
                        </div>
                        {pred!.summary && (
                          <p className="text-[11px] font-serif italic text-stone-500 line-clamp-2 leading-relaxed">
                            &ldquo;{pred!.summary}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="text-[9px] font-mono text-stone-300 shrink-0 mt-0.5">
                        {new Date(game.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}
                      </div>
                    </Link>
                  ))}
                  {topEdges.length === 0 && (
                    <div className="bg-white border border-stone-200 p-6 text-center">
                      <p className="font-serif italic text-stone-400 text-sm">Today&apos;s edges publish at 10am ET</p>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT — News */}
              {news.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722]">§ Around the league</div>
                  </div>
                  <div className="space-y-0">
                    {news.slice(0, 6).map((item, i) => (
                      <a
                        key={item.id}
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-3 py-3 border-b border-stone-200 last:border-0 group hover:bg-stone-50 -mx-2 px-2 transition"
                      >
                        <div className="w-16 h-16 shrink-0 overflow-hidden bg-stone-100">
                          {item.image ? (
                            <img src={item.image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center font-mono text-[9px] uppercase tracking-wider text-white"
                              style={{ background: i % 2 === 0 ? '#1A1A1A' : '#FF5722' }}
                            >
                              MLB
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-serif font-semibold text-stone-900 text-sm leading-snug group-hover:text-[#FF5722] transition line-clamp-2 mb-1">
                            {item.headline}
                          </h4>
                          <span className="text-[9px] font-mono text-stone-400 uppercase tracking-widest">{timeAgo(item.published)}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </section>
      </ScrollReveal>
      {/* ── FREE VS PRO (replaces the old "four levels" grid) ── */}
      <ScrollReveal>
        <section className="bg-white border-b border-stone-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-2">§ Free vs Pro</div>
            <h2 className="text-3xl font-serif font-bold text-stone-900 mb-8">
              Free shows the verdict<span className="text-[#FF5722]">.</span> Pro shows the playbook<span className="text-[#FF5722]">.</span>
            </h2>

            <div className="grid md:grid-cols-2 gap-px bg-stone-200 border border-stone-200 mb-8">
              <div className="bg-white p-6 sm:p-8">
                <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-stone-400 mb-2">Free</div>
                <h3 className="font-serif text-xl font-bold text-stone-900 mb-2">For the fan</h3>
                <p className="font-serif italic text-stone-500 text-sm mb-5">Enough to get smart, every night — free forever.</p>
                <ul className="space-y-2.5 text-sm font-mono text-stone-600">
                  <li>Edge verdict + one-sentence summary</li>
                  <li>Top 2 factors shown, every game</li>
                  <li>Starting lineups, basic stats</li>
                  <li>Daily email brief</li>
                  <li>Follow up to 3 teams</li>
                  <li>Public track record — full transparency</li>
                </ul>
              </div>

              <div className="bg-[#1A1A1A] p-6 sm:p-8 relative">
                <div className="absolute top-6 right-6 sm:top-8 sm:right-8 text-[9px] font-mono uppercase tracking-widest text-stone-500 border border-stone-700 px-2 py-1">
                  🔒 Opens at launch
                </div>
                <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FDE047] mb-2">⊕ Pro · £6/mo</div>
                <h3 className="font-serif text-xl font-bold text-white mb-2">For the analyst</h3>
                <p className="font-serif italic text-stone-300 text-sm mb-5">Every factor, every angle — built for fantasy GMs.</p>
                <ul className="space-y-2.5 text-sm font-mono text-stone-300">
                  <li>All 8 factors, fully broken down</li>
                  <li>Full smart-friend narrative read</li>
                  <li>Matchup &amp; performance charts</li>
                  <li>Fatigue &amp; availability tracker</li>
                  <li>Fantasy start/sit calls</li>
                  <li>&ldquo;Why we might be wrong&rdquo; counter-take</li>
                  <li>Unlimited team follows, all sports</li>
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              <Link
                href="/pricing"
                className="text-[10px] font-mono font-bold uppercase tracking-widest text-white bg-[#FF5722] px-6 py-3 hover:bg-orange-600 transition"
              >
                Join the Pro waitlist →
              </Link>
              <Link
                href="/why-edge"
                className="text-[10px] font-mono uppercase tracking-widest text-stone-500 border border-stone-300 bg-white px-6 py-3 hover:bg-stone-50 transition"
              >
                See the difference →
              </Link>
              <span className="text-[9px] font-mono text-stone-400 uppercase tracking-widest">First 100 to join lock in £4/mo at launch</span>
            </div>
          </div>
        </section>
      </ScrollReveal>

   {/* ── HOW IT WORKS · WHERE AI FITS ── */}
      <ScrollReveal>
        <section className="bg-[#FAF8F3] border-b border-stone-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
            <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-2">§ How it works</div>
            <h2 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 mb-8">
              Maths does the analysis<span className="text-[#FF5722]">.</span> AI does the writing<span className="text-[#FF5722]">.</span>
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  n: '1',
                  label: 'The model',
                  title: 'The maths reads the game',
                  body: 'Eight factors — starting pitcher, bullpen, offense, defense, matchup, park, weather, rest — scored and weighted before every first pitch. Rule-based, not AI. No gut feel, no black box. You can check it.',
                },
                {
                  n: '2',
                  label: 'The AI',
                  title: 'AI writes it up',
                  body: "Here's where AI comes in: a language model turns the model's numbers into a 5-minute read in plain English — specific stats, real names, the one thing that matters tonight. It works only from the data, and never invents a stat.",
                },
                {
                  n: '3',
                  label: 'Your dugout',
                  title: 'Your teams, your inbox',
                  body: 'Follow your teams and get the brief before you wake up. Every read shows which way each factor leans — Pro unlocks the full 8-factor breakdown, hot zones and fantasy calls.',
                },
              ].map(item => (
                <div key={item.n} className="flex gap-4">
                  <div className="text-3xl font-serif text-[#FF5722] font-bold shrink-0 leading-none mt-1">{item.n}</div>
                  <div>
                    <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-stone-400 mb-1.5">{item.label}</div>
                    <h3 className="font-serif font-bold text-stone-900 text-base mb-2">{item.title}</h3>
                    <p className="text-stone-500 text-sm leading-relaxed">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* NEW — tab switcher: the 8 factors, per sport */}
            <FactorsTabs />

            <p className="text-[11px] font-mono text-stone-400 uppercase tracking-widest mt-8 leading-relaxed max-w-2xl">
              The model is the part you can check. The AI is the part that makes it readable.<span className="text-stone-900"> Neither one guesses.</span>
            </p>
          </div>
        </section>
      </ScrollReveal>

      <footer className="bg-[#FAF8F3] px-4 sm:px-6 py-10 border-t border-stone-200">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-wrap gap-x-8 gap-y-3 mb-6 text-[10px] font-mono uppercase tracking-widest text-stone-500">
            <Link href="/mlb" className="hover:text-stone-900 transition">MLB</Link>
            <Link href="/nfl" className="hover:text-stone-900 transition">NFL</Link>
            <Link href="/track-record" className="hover:text-stone-900 transition">Track Record</Link>
            <Link href="/why-edge" className="hover:text-stone-900 transition">Why The Edge</Link>
            <Link href="/pricing" className="hover:text-stone-900 transition">Pricing</Link>
            <Link href="/privacy" className="hover:text-stone-900 transition">Privacy</Link>
            <Link href="/terms" className="hover:text-stone-900 transition">Terms</Link>
            <a href="mailto:hello@edgereportdaily.com" className="hover:text-stone-900 transition">Contact</a>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-[10px] font-mono text-stone-400">© 2026 The Edge · edgereportdaily.com</div>
            <div className="text-[10px] font-mono text-stone-400 max-w-md leading-relaxed">
              Statistical analysis only. No gambling advice, picks, or wagering recommendations.
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}