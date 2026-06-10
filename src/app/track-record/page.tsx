// src/app/track-record/page.tsx
//
// HISTORICAL ARCHIVE PAGE
//
// Displays the pre-game factor analysis side-by-side with the actual final box score.
// Uses neutral terminology ("Factor Lean") and neutral colors to maintain an objective, 
// non-betting data terminal aesthetic.

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
    <main className="min-h-screen bg-[#fafaf9]">
      <SiteHeader />

      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        {/* ════════════════════════════════════════════════
            HERO & DISCLAIMER
            ════════════════════════════════════════════════ */}
        <header className="mb-10">
          <div className="text-[#ea580c] text-[10px] font-mono uppercase tracking-widest mb-3">
            — Historical Data Archive
          </div>
          <h1
            className="text-4xl md:text-5xl font-bold text-stone-900 mb-5 tracking-tight"
            style={{ fontFamily: 'Fraunces, serif' }}
          >
            The Archive.
          </h1>
          <p className="text-base md:text-lg text-stone-500 leading-relaxed max-w-2xl font-serif italic mb-8">
            We don&apos;t hide our math. Below is a raw log of recent matchups, showing exactly where our 8-factor model identified a structural lean at 10:00 AM ET, side-by-side with the final box score. 
          </p>

          <div className="bg-stone-100 border border-stone-200 rounded-lg p-4 md:p-5">
            <h2 className="text-[9px] font-mono text-stone-500 uppercase tracking-widest mb-1 font-bold">
              Information Only
            </h2>
            <p className="text-xs text-stone-500 leading-relaxed font-serif">
              This archive is provided for research and transparency purposes. The Edge provides statistical analysis only. We do not aggregate "win rates" because this is not a tipster service. Users bear sole responsibility for any actions taken using our historical or current data.
            </p>
          </div>
        </header>

        {/* ════════════════════════════════════════════════
            GAME LOGS (NEUTRAL SIDE-BY-SIDE UI)
            ════════════════════════════════════════════════ */}
        <section className="space-y-6 mb-12">
          {recent.length === 0 ? (
            <div className="text-center py-12 border border-stone-200 rounded-xl bg-white">
              <p className="font-serif italic text-stone-400">Archive is currently building. Check back soon.</p>
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

              return (
                <div key={`${r.game_pk}-${i}`} className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm hover:border-stone-300 transition">
                  
                  {/* Card Header: Matchup & Date */}
                  <div className="bg-[#fafaf9] px-5 py-3 border-b border-stone-200 flex justify-between items-center">
                    <span className="font-bold text-sm text-stone-900 tracking-wide">
                      {r.away_team} <span className="text-stone-400 font-mono text-xs mx-1">@</span> {r.home_team}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
                      {formatDate(r.game_date)}
                    </span>
                  </div>

                  {/* Card Body: Pre-Game vs Outcome */}
                  <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-stone-200">
                    
                    {/* Left: Pre-Game Analysis */}
                    <div className="p-5 flex flex-col justify-center bg-white">
                      <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2">
                        Pre-Game Data
                      </div>
                      {r.factor_lean === 'split' ? (
                        <div>
                          <div className="text-sm font-serif font-bold text-stone-800">
                            Factors evenly split
                          </div>
                          <div className="text-xs text-stone-500 mt-1 font-serif italic">
                            No clear structural lean identified.
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-sm font-serif font-bold text-stone-900">
                            Majority Data Factors : <span className="text-stone-900">{leanTeam}</span>
                          </div>
                          <div className="text-xs text-stone-500 mt-1 font-serif italic">
                            {r.lean_factors} of 8 data factors were for the {r.factor_lean} side.
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Final Outcome */}
                    <div className="p-5 flex flex-col justify-center bg-[#fafaf9]">
                      <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2">
                        Final Outcome
                      </div>
                      {r.away_score != null && r.home_score != null ? (
                        <div>
                          <div className="text-sm font-mono font-bold text-stone-900 mb-1">
                            <span>{r.away_team} {r.away_score}</span>
                            <span className="text-stone-300 mx-1.5">—</span>
                            <span>{r.home_score} {r.home_team}</span>
                          </div>
                          <div className="text-xs text-stone-500 font-serif italic">
                            Winner: <span className="font-semibold text-stone-700">{winnerTeam}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm font-serif italic text-stone-400">
                          Game pending or postponed
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )
            })
          )}
        </section>

        {/* ════════════════════════════════════════════════
            FOOTER CTA
            ════════════════════════════════════════════════ */}
        <div className="text-center pb-12 border-t border-stone-200 pt-10">
          <h3 className="text-xl font-serif font-bold text-stone-900 mb-3">Stop looking backward.</h3>
          <p className="text-stone-500 font-serif italic mb-6">See where the structural leans lie for tonight's slate.</p>
          <Link
            href="/mlb"
            className="inline-block bg-[#ea580c] text-white px-8 py-3 text-[10px] font-mono uppercase tracking-widest font-bold hover:bg-orange-700 transition"
          >
            View Today&apos;s Games →
          </Link>
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