
import { Metadata } from 'next'
import Link from 'next/link'
import { getRecentReads } from '@/lib/track-record'
import SiteHeader from '@/components/SiteHeader'

export const revalidate = 1800

export const metadata: Metadata = {
  title: 'Historical Archive · The Edge',
  description:
    'Review past slates. Compare our pre-game structural analysis alongside actual game outcomes. Raw data, pure transparency.',
}

export default async function HistoricalArchivePage() {
  const recent = await getRecentReads(50)

  return (
    <main className="min-h-screen bg-[#fafaf9] font-sans">
      <SiteHeader />

      <div className="max-w-6xl mx-auto px-6 py-10 md:py-16">
        {/* ════════════════════════════════════════════════
            HERO SECTION - Like "The Stats" / Dashboard
            ════════════════════════════════════════════════ */}
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-[#ea580c] text-xs font-mono uppercase tracking-[3px]">THE EDGE • MLB</div>
          </div>
          
          <h1
            className="text-5xl md:text-6xl font-bold text-stone-900 mb-3 tracking-tighter"
            style={{ fontFamily: 'Fraunces, serif' }}
          >
            The Archive.
          </h1>
          <p className="text-xl text-stone-600 max-w-2xl leading-tight font-light">
            Every matchup. Every structural lean. Side by side.
          </p>
          <p className="text-base text-stone-500 mt-2 max-w-xl">
            Pre-game factor analysis compared to final outcomes. Raw transparency.
          </p>
        </header>

        {/* Disclaimer - More subtle, like info panels in screenshots */}
        <div className="mb-12 bg-white border border-stone-200 rounded-2xl p-6 text-sm">
          <div className="flex items-start gap-4">
            <div className="text-[#ea580c] mt-0.5">ⓘ</div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-stone-500 mb-1">RESEARCH ONLY</div>
              <p className="text-stone-600 leading-relaxed">
                This is a historical log of our 8-factor model. Provided for transparency and analysis. 
                No win-rate aggregation. Users are responsible for their own decisions.
              </p>
            </div>
          </div>
        </div>

        {/* Filters / Controls - Inspired by screenshots */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 items-end">
          <div className="flex-1">
            <div className="text-xs font-mono uppercase tracking-widest text-stone-500 mb-2">RECENT GAMES</div>
            <div className="flex gap-2">
              <button className="px-5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm font-medium hover:border-stone-400 transition flex items-center gap-2">
                <span>All Slates</span>
                <span className="text-xs text-stone-400">↓</span>
              </button>
              <button className="px-5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm font-medium hover:border-stone-400 transition">
                Last 30 Days
              </button>
            </div>
          </div>
          
          <div className="flex gap-3">
            <div className="text-right">
              <div className="text-xs font-mono uppercase tracking-widest text-stone-500">SHOWING</div>
              <div className="text-2xl font-mono font-semibold text-stone-900">{recent.length}</div>
            </div>
          </div>
        </div>

        {/* GAME LOGS - Enhanced card design */}
        <section className="space-y-6">
          {recent.length === 0 ? (
            <div className="text-center py-20 bg-white border border-stone-200 rounded-3xl">
              <div className="mx-auto w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-6">
                📊
              </div>
              <p className="font-light text-stone-400 text-lg">Archive is populating. Check back soon.</p>
            </div>
          ) : (
            recent.map((r, i) => {
              const leanTeam =
                r.factor_lean === 'home'
                  ? r.home_team
                  : r.factor_lean === 'away'
                    ? r.away_team
                    : null
              
              const winnerTeam =
                r.actual_winner === 'home' ? r.home_team : r.away_team

              const isLeanHome = r.factor_lean === 'home'
              const isWinnerHome = r.actual_winner === 'home'

              return (
                <div 
                  key={`${r.game_pk}-${i}`} 
                  className="bg-white border border-stone-200 rounded-3xl overflow-hidden hover:shadow-xl hover:border-stone-300 transition-all duration-200 group"
                >
                  {/* Header with teams and date - More prominent */}
                  <div className="px-8 py-5 border-b border-stone-100 bg-[#fafaf9] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-3 text-sm font-semibold">
                        <span className="text-stone-900">{r.away_team}</span>
                        <span className="text-stone-300 font-mono">@</span>
                        <span className="text-stone-900">{r.home_team}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6 text-sm">
                      <div className="font-mono text-xs uppercase tracking-widest text-stone-500">
                        {formatDate(r.game_date)}
                      </div>
                      <div className="h-5 w-px bg-stone-200"></div>
                      <div className="text-xs px-3 py-1 bg-white border border-stone-200 rounded-full font-mono text-stone-500">
                        GAME {r.game_pk}
                      </div>
                    </div>
                  </div>

                  {/* Main Content Grid */}
                  <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-100">
                    
                    {/* PRE-GAME ANALYSIS - Left Side */}
                    <div className="p-8">
                      <div className="uppercase text-[#ea580c] text-xs font-mono tracking-[1px] mb-4 flex items-center gap-2">
                        <div className="w-2 h-2 bg-[#ea580c] rounded-full animate-pulse"></div>
                        PRE-GAME 8-FACTOR MODEL
                      </div>
                      
                      {r.factor_lean === 'split' ? (
                        <div className="space-y-4">
                          <div className="text-2xl font-light text-stone-400">Balanced</div>
                          <div className="text-stone-600">
                            Factors were evenly split across both sides. No dominant structural lean.
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-baseline gap-3 mb-1">
                            <span className="text-4xl font-semibold text-stone-900 tracking-tighter">{leanTeam}</span>
                            <span className="text-sm font-mono uppercase text-emerald-600">LEAN</span>
                          </div>
                          <div className="text-stone-500 text-sm">
                            {r.lean_factors} of 8 data factors favored the {r.factor_lean} side
                          </div>
                          
                          {/* Mini factor visualization */}
                          <div className="mt-6 h-2 bg-stone-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                              style={{ width: `${(r.lean_factors / 8) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* FINAL OUTCOME - Right Side */}
                    <div className="p-8 bg-[#fafaf9]">
                      <div className="uppercase text-stone-500 text-xs font-mono tracking-[1px] mb-4">FINAL BOX SCORE</div>
                      
                      {r.away_score != null && r.home_score != null ? (
                        <div className="space-y-6">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                              <div className={`text-5xl font-mono font-semibold tabular-nums ${isWinnerHome ? 'text-stone-400' : 'text-stone-900'}`}>
                                {r.away_score}
                              </div>
                              <div>
                                <div className="text-sm font-medium">{r.away_team}</div>
                                <div className="text-xs text-stone-500">AWAY</div>
                              </div>
                            </div>
                            
                            <div className="text-stone-300 text-4xl font-light">—</div>
                            
                            <div className="flex items-center gap-4 text-right">
                              <div>
                                <div className="text-sm font-medium">{r.home_team}</div>
                                <div className="text-xs text-stone-500">HOME</div>
                              </div>
                              <div className={`text-5xl font-mono font-semibold tabular-nums ${isWinnerHome ? 'text-stone-900' : 'text-stone-400'}`}>
                                {r.home_score}
                              </div>
                            </div>
                          </div>
                          
                          <div className="pt-4 border-t border-stone-200">
                            <div className="inline-flex items-center gap-2 text-sm">
                              <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">WINNER</div>
                              <span className="font-semibold text-stone-800">{winnerTeam}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="py-12 text-center text-stone-400 italic">
                          Game data pending
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </section>

        {/* Footer CTA - Clean like the dashboard */}
        <div className="mt-16 text-center">
          <div className="inline-flex flex-col items-center">
            <div className="text-stone-400 text-sm mb-2 tracking-widest">NEXT UP</div>
            <Link
              href="/mlb"
              className="group inline-flex items-center justify-center gap-3 bg-stone-900 hover:bg-black text-white px-10 py-4 rounded-2xl text-sm font-mono uppercase tracking-[2px] transition-all active:scale-[0.985]"
            >
              TODAY&apos;S STRUCTURAL LEANS
              <span className="group-hover:translate-x-1 transition">→</span>
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
