import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getScheduleForDate, slugifyGame, shortName, teamLogoUrl } from '@/lib/mlb'
import { getOverallStats } from '@/lib/track-record'
import { getPredictionsForDate } from '@/lib/edge-fetch'
import { getMLBNewsMultiSource } from '@/lib/mlb-homepage'
import SiteHeader from '@/components/SiteHeader'
import LiveTicker from '@/components/LiveTicker'
import SignupForm from '@/components/SignupForm'
import { getActiveSport, SPORT_LABELS } from '@/lib/active-sport'

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
  if (tier === 'strong')   return 'text-orange-700 border-orange-200 bg-orange-50'
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
    <main className="min-h-screen bg-[#fafaf9] text-stone-900 font-sans selection:bg-orange-200">
      <SiteHeader variant="home" />
      <LiveTicker />

      {/* ── HERO ── */}
      <section className="border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-2 gap-0 md:divide-x md:divide-stone-200">

            {/* Left — headline + signup */}
            <div className="py-10 md:py-14 md:pr-10">
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#ea580c] mb-4">
                § The Edge · {SPORT_LABELS[activeSport]} in season
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-serif font-bold tracking-tight leading-[1.05] mb-5 text-stone-900">
                Sharp analysis.<br />
                Every major sport<span className="text-[#ea580c]">.</span>
              </h1>
              <p className="text-base sm:text-lg text-stone-500 mb-7 leading-relaxed font-serif italic max-w-md">
                Pre-game breakdowns for serious fans. One clear Edge Score, smart narrative, and deep data — before first pitch.
              </p>
              <SignupForm source="home_hero" buttonText="Get free access →" theme="light" />
              <p className="text-[10px] text-stone-400 font-mono uppercase tracking-widest mt-3">
                Free forever · No spam · Unsubscribe anytime
              </p>
              <div className="flex flex-wrap gap-2 mt-6">
                <span className="bg-orange-100 text-orange-700 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider">MLB — Live</span>
                <span className="bg-stone-100 text-stone-500 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider">NFL — Sept</span>
                <span className="bg-stone-100 text-stone-500 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider">NBA + NHL — Sept</span>
              </div>
            </div>

            {/* Right — featured edge */}
            <div className="hidden md:flex flex-col justify-center py-14 pl-10">
              {featuredEdge ? (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-4">⊕ Featured Matchup</div>
                  <Link href={`/mlb/${slugifyGame(featuredEdge.game)}`}
                    className="block bg-white border border-stone-200 rounded-xl p-6 hover:border-stone-400 hover:shadow-md transition group">
                    <div className="flex items-center gap-3 mb-4">
                      <img src={teamLogoUrl(featuredEdge.game.teams.away.team.id)} alt="" className="w-8 h-8 object-contain" />
                      <span className="font-serif text-lg font-bold">{shortName(featuredEdge.game.teams.away.team.name)}</span>
                      <span className="text-stone-300 font-mono">@</span>
                      <img src={teamLogoUrl(featuredEdge.game.teams.home.team.id)} alt="" className="w-8 h-8 object-contain" />
                      <span className="font-serif text-lg font-bold">{shortName(featuredEdge.game.teams.home.team.name)}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                
                      <span className="text-[10px] font-mono text-stone-500">
                        favours <span className="font-bold text-stone-900">
                          {shortName(featuredEdge.pred!.predicted_winner === 'home' ? featuredEdge.game.teams.home.team.name : featuredEdge.game.teams.away.team.name)}
                        </span>
                      </span>
                    </div>
                    {featuredEdge.pred!.summary && (
                      <p className="font-serif italic text-stone-600 leading-relaxed text-sm line-clamp-4 mb-5">
                        &ldquo;{featuredEdge.pred!.summary}&rdquo;
                      </p>
                    )}
                    <div className="flex justify-between items-center text-[10px] font-mono text-stone-400 pt-4 border-t border-stone-100">
                      <span>{new Date(featuredEdge.game.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET</span>
                      <span className="text-[#ea580c] group-hover:text-stone-900 transition">Full analysis →</span>
                    </div>
                  </Link>
                  {games.length > 0 && (
                    <Link href="/mlb" className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-[#ea580c] hover:text-stone-900 transition mt-4">
                      See all {games.length} games tonight →
                    </Link>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <p className="font-serif text-stone-400 italic mb-4">Today&apos;s edges publish at 10am ET</p>
                  <Link href="/mlb" className="text-[10px] font-mono uppercase tracking-widest text-[#ea580c]">View MLB hub →</Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

  {/* ── STATS BAR ── */}
      <section className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
          <div className="grid grid-cols-3 divide-x divide-stone-100">
            
            {/* ── STAT 1: Methodology Focus ── */}
            <Link href="/why-edge" className="group px-0 sm:px-6 py-1 first:pl-0 flex flex-col justify-center">
              <div className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 group-hover:text-[#ea580c] transition leading-none mb-1">
                8
              </div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-stone-900">
                Proprietary Factors
              </div>
              <div className="text-[8px] font-mono text-stone-400 mt-1 max-w-[160px] leading-tight group-hover:text-stone-500 transition">
                Matchups split into core dimensions.
              </div>
            </Link>

            {/* ── STAT 2: Objectivity Focus ── */}
            <Link href="/why-edge" className="group px-4 sm:px-6 py-1 flex flex-col justify-center">
              <div className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 group-hover:text-[#ea580c] transition leading-none mb-1">
                100%
              </div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-stone-900">
                Objective Analysis
              </div>
              <div className="text-[8px] font-mono text-stone-400 mt-1 max-w-[160px] leading-tight group-hover:text-stone-500 transition">
                Raw data. Zero narrative bias.
              </div>
            </Link>

            {/* ── STAT 3: Scale Focus ── */}
            <div className="px-4 sm:px-6 py-1 flex flex-col justify-center">
              <div className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 leading-none mb-1">
                4
              </div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-1">
                Leagues covered
              </div>
              <div className="text-[8px] font-mono text-stone-400 mt-1 max-w-[160px] leading-tight">
                MLB, NFL, NBA, and NHL.
              </div>
            </div>
            
          </div>
        </div>
      </section>

      {/* ── EDGES + NEWS — two column split ── */}
      <section className="border-b border-stone-200 bg-[#fafaf9]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid md:grid-cols-2 gap-8">

            {/* LEFT — Tonight's edges */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500">⊕ Selected Matches</div>
                <Link href="/mlb" className="text-[10px] font-mono uppercase tracking-widest text-[#ea580c] hover:text-stone-900 transition">Full slate →</Link>
              </div>
              <div className="space-y-3">
                {topEdges.map(({ game, pred }) => (
                  <Link key={game.gamePk} href={`/mlb/${slugifyGame(game)}`}
                    className="flex items-start gap-3 bg-white border border-stone-200 rounded-xl p-4 hover:border-stone-400 hover:shadow-sm transition group">
                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                      <img src={teamLogoUrl(game.teams.away.team.id)} alt="" className="w-5 h-5 object-contain" />
                      <img src={teamLogoUrl(game.teams.home.team.id)} alt="" className="w-5 h-5 object-contain" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-serif text-sm font-bold">{shortName(game.teams.away.team.name)}</span>
                        <span className="text-stone-300 font-mono text-xs">@</span>
                        <span className="font-serif text-sm font-bold">{shortName(game.teams.home.team.name)}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-1.5">
                    
                    
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
                  <div className="bg-white border border-stone-200 rounded-xl p-6 text-center">
                    <p className="font-serif italic text-stone-400 text-sm">Today&apos;s edges publish at 10am ET</p>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT — News articles */}
            {news.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500">§ Around the league</div>
                </div>
                <div className="space-y-0">
                  {news.slice(0, 6).map((item, i) => (
                    <a key={item.id} href={item.link} target="_blank" rel="noopener noreferrer"
                      className="flex items-start gap-3 py-3 border-b border-stone-200 last:border-0 group hover:bg-stone-50 -mx-2 px-2 transition rounded">
                      {/* Thumbnail */}
                      <div className="w-16 h-16 rounded shrink-0 overflow-hidden bg-stone-100">
                        {item.image ? (
                          <img src={item.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-mono text-[9px] uppercase tracking-wider text-white"
                            style={{ background: i % 2 === 0 ? '#1A1A1A' : '#FF5722' }}>
                            MLB
                          </div>
                        )}
                      </div>
                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-serif font-semibold text-stone-900 text-sm leading-snug group-hover:text-[#ea580c] transition line-clamp-2 mb-1">
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

      {/* ── PRO TEASER ── */}
      <section className="bg-[#fafaf9] border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="grid md:grid-cols-3 gap-8 items-center">
            <div className="md:col-span-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#ea580c] mb-3">⊕ Free for standard tracking · Pro for absolute depth</div>
              <h2 className="text-3xl font-serif font-bold text-stone-900 mb-3">Same slate<span className="text-[#ea580c]">.</span> Unlocked potential<span className="text-[#ea580c]">.</span></h2>
              <p className="text-stone-500 font-serif italic text-base leading-relaxed max-w-lg">
                Free accounts show who holds the edge. Pro opens the full playbook — all 8 components, hot zones, arsenal breakdowns, and the GM briefing.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Link href="/pricing" className="block text-center bg-[#ea580c] text-white px-6 py-3.5 text-[10px] font-mono uppercase tracking-widest font-bold hover:bg-orange-700 transition">
                Go Pro · £6/mo →
              </Link>
              <Link href="/why-edge" className="block text-center bg-white border border-stone-300 text-stone-700 px-6 py-3.5 text-[10px] font-mono uppercase tracking-widest hover:bg-stone-50 transition">
                Why The Edge →
              </Link>
              <p className="text-[9px] font-mono text-stone-400 uppercase tracking-widest text-center">First 100 subscribers lock in founding rate</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-6">⊕ How it works</div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { n: '1', title: 'Sport-tailored model', body: 'Raw metrics from official feeds. No narrative bias. Custom-engineered for MLB, NFL, NBA, and NHL.' },
              { n: '2', title: '8-area edge breakdown', body: "Every matchup split into 8 dimensions. See exactly where your team has an edge — and where they don't." },
              { n: '3', title: 'Your personal Dugout', body: 'Follow your teams. Get a personalised brief in your inbox hours before first pitch, every single day.' },
            ].map(item => (
              <div key={item.n} className="flex gap-4">
                <div className="text-3xl font-serif text-[#ea580c] font-bold shrink-0 leading-none mt-1">{item.n}</div>
                <div>
                  <h3 className="font-serif font-bold text-stone-900 text-base mb-1">{item.title}</h3>
                  <p className="text-stone-500 text-sm leading-relaxed">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-[#fafaf9] px-4 sm:px-6 py-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-wrap gap-x-8 gap-y-3 mb-6 text-[10px] font-mono uppercase tracking-widest text-stone-500">
            <Link href="/mlb" className="hover:text-stone-900 transition">MLB</Link>
            <Link href="/track-record" className="hover:text-stone-900 transition">Track Record</Link>
            <Link href="/why-edge" className="hover:text-stone-900 transition">Why The Edge</Link>
            <Link href="/about" className="hover:text-stone-900 transition">About</Link>
            <Link href="/pricing" className="hover:text-stone-900 transition">Pricing</Link>
            <Link href="/privacy" className="hover:text-stone-900 transition">Privacy</Link>
            <Link href="/terms" className="hover:text-stone-900 transition">Terms</Link>
            <a href="mailto:hello@edgereportdaily.com" className="hover:text-stone-900 transition">Contact</a>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-[10px] font-mono text-stone-400">© 2026 The Edge · Unbiased Cross-Sport Modeling</div>
            <div className="text-[10px] font-mono text-stone-400 max-w-md leading-relaxed">
              Statistical metrics and model calculations only. No gambling advice, picks, or wagering recommendations.
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}