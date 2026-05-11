import { Metadata } from 'next'
import Link from 'next/link'
import {
  getOverallStats,
  getTierStats,
  getComponentStats,
  getRecentPredictions,
} from '@/lib/track-record'
import SiteHeader from '@/components/SiteHeader'
import AnalyticsTrigger from '@/components/AnalyticsTrigger'

export const revalidate = 1800 // 30 min cache

export const metadata: Metadata = {
  title: 'Edge Track Record · The Edge',
  description: 'Public accuracy tracking for The Edge predictions. Information only, fully transparent.',
}

export default async function TrackRecordPage() {
  const [overall, tiers, components, recent] = await Promise.all([
    getOverallStats(),
    getTierStats(),
    getComponentStats(),
    getRecentPredictions(20),
  ])

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader />
      
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        
        {/* HERO */}
        <header className="mb-12">
          <div className="text-[#FF5722] text-xs font-mono uppercase tracking-wider mb-2">
            — Public Track Record
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-[#1A1A1A] mb-4" style={{ fontFamily: 'Fraunces, serif' }}>
            Every prediction. <em className="text-[#FF5722]">Tracked.</em>
          </h1>
          <p className="text-base md:text-lg text-[#4A4A4A] leading-relaxed max-w-2xl">
            We log every Edge Score we publish. Each game gets graded against the actual result. 
            Information only — no advice, no betting recommendations, no cherry-picking.
          </p>
        </header>

        {/* OVERALL ACCURACY */}
        <section className="bg-[#1A1A1A] rounded-lg p-6 md:p-8 mb-8 text-[#FAF8F3]">
          <div className="text-[#FF5722] text-xs font-mono uppercase tracking-wider mb-4">
            ⊕ Overall Accuracy
          </div>
          
          {overall.insufficient_sample ? (
            <div>
              <div className="text-2xl md:text-3xl font-bold mb-3" style={{ fontFamily: 'Fraunces, serif' }}>
                Currently tracking — too early to publish
              </div>
              <p className="text-[#FAF8F3]/80 leading-relaxed mb-4">
                We're building the public sample. Right now we have <strong>{overall.total_graded} graded predictions</strong>{overall.date_range_start && ` since ${formatDate(overall.date_range_start)}`}. 
                Statistical significance requires at least 100 graded games.
              </p>
              <p className="text-[#FAF8F3]/60 text-sm">
                Check back as the sample grows. Goal: 60%+ accuracy on confident predictions, comparable to Vegas closing lines.
              </p>
              {overall.total_graded > 0 && (
                <div className="mt-6 pt-4 border-t border-[#FAF8F3]/20">
                  <div className="text-xs font-mono uppercase text-[#FAF8F3]/60 mb-2">
                    Internal sample (not publicly reported until 100+ games)
                  </div>
                  <div className="text-sm text-[#FAF8F3]/80">
                    {overall.total_correct} correct of {overall.total_graded} graded
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-baseline gap-3 mb-3">
                <div className="text-6xl md:text-7xl font-bold leading-none" style={{ color: '#FDE047', fontFamily: 'Bebas Neue, sans-serif' }}>
                  {overall.accuracy_percent?.toFixed(1)}%
                </div>
                <div className="text-sm text-[#FAF8F3]/60 font-mono uppercase">
                  over {overall.total_graded} graded games
                </div>
              </div>
              {overall.date_range_start && overall.date_range_end && (
                <p className="text-[#FAF8F3]/60 text-sm font-mono">
                  {formatDate(overall.date_range_start)} — {formatDate(overall.date_range_end)}
                </p>
              )}
              <p className="text-[#FAF8F3]/80 text-sm mt-4">
                {overall.total_correct} correct · {overall.total_incorrect} incorrect · {overall.total_games - overall.total_graded} ungraded toss-ups
              </p>
            </div>
          )}
        </section>

        {/* BY CONFIDENCE TIER */}
        <section className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-[#1A1A1A] mb-2" style={{ fontFamily: 'Fraunces, serif' }}>
            Accuracy by <em className="text-[#FF5722]">confidence</em>
          </h2>
          <p className="text-[#4A4A4A] mb-6 text-sm">
            How the model performs at different confidence levels.
          </p>
          <AnalyticsTrigger event="track_record_viewed" />
          
          <div className="bg-white border-2 border-[#1A1A1A]/10 rounded-lg overflow-hidden">
            {tiers.map((tier, i) => (
              <div 
                key={tier.tier}
                className={`flex items-center justify-between p-4 md:p-6 ${i < tiers.length - 1 ? 'border-b border-[#1A1A1A]/10' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${tierDotColor(tier.tier)}`} />
                  <div>
                    <div className="font-bold text-[#1A1A1A] capitalize text-sm md:text-base">
                      {tier.tier} Edge
                    </div>
                    <div className="text-xs text-[#4A4A4A] font-mono">
                      {tier.tier === 'strong' && 'Edge Score ≥ 25'}
                      {tier.tier === 'moderate' && 'Edge Score 12-24'}
                      {tier.tier === 'slight' && 'Edge Score 5-11'}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  {tier.games < 10 ? (
                    <div className="text-sm text-[#4A4A4A]">
                      <span className="font-mono">{tier.games}</span> games · sample too small
                    </div>
                  ) : (
                    <>
                      <div className="text-2xl font-bold text-[#1A1A1A]" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                        {tier.accuracy_percent?.toFixed(1)}%
                      </div>
                      <div className="text-xs text-[#4A4A4A] font-mono">
                        {tier.correct} of {tier.games} games
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* COMPONENT-LEVEL ACCURACY */}
        {components.length > 0 && (
          <section className="mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-[#1A1A1A] mb-2" style={{ fontFamily: 'Fraunces, serif' }}>
              When <em className="text-[#FF5722]">factors</em> dominate
            </h2>
            <p className="text-[#4A4A4A] mb-6 text-sm">
              Accuracy when a single component is highly favored. Reveals which factors carry the most predictive signal.
            </p>
            
            <div className="bg-white border-2 border-[#1A1A1A]/10 rounded-lg overflow-hidden">
              {components.map((comp, i) => (
                <div 
                  key={comp.threshold_label}
                  className={`flex items-center justify-between p-4 md:p-6 ${i < components.length - 1 ? 'border-b border-[#1A1A1A]/10' : ''}`}
                >
                  <div className="font-medium text-[#1A1A1A] text-sm md:text-base">
                    {comp.threshold_label}
                  </div>
                  <div className="text-right">
                    {comp.games < 10 ? (
                      <div className="text-sm text-[#4A4A4A]">
                        <span className="font-mono">{comp.games}</span> games · sample too small
                      </div>
                    ) : (
                      <>
                        <div className="text-2xl font-bold text-[#FF5722]" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                          {comp.accuracy_percent?.toFixed(1)}%
                        </div>
                        <div className="text-xs text-[#4A4A4A] font-mono">
                          {comp.correct} of {comp.games} games
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* RECENT PREDICTIONS */}
        {recent.length > 0 && (
          <section className="mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-[#1A1A1A] mb-2" style={{ fontFamily: 'Fraunces, serif' }}>
              Last <em className="text-[#FF5722]">{recent.length}</em> predictions
            </h2>
            <p className="text-[#4A4A4A] mb-6 text-sm">
              The most recent graded games, newest first.
            </p>
            
            <div className="bg-white border-2 border-[#1A1A1A]/10 rounded-lg overflow-hidden">
              {recent.map((p, i) => (
                <div
                  key={`${p.game_date}-${p.home_team}-${p.away_team}-${i}`}
                  className={`flex items-center justify-between p-4 ${i < recent.length - 1 ? 'border-b border-[#1A1A1A]/10' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono text-[#4A4A4A] mb-1">
                      {formatDate(p.game_date)}
                    </div>
                    <div className="text-sm md:text-base font-medium text-[#1A1A1A] truncate">
                      {p.away_team} @ {p.home_team}
                    </div>
                    {p.home_score !== null && p.away_score !== null && (
                      <div className="text-xs font-mono text-[#4A4A4A] mt-1">
                        Final: {p.away_score}-{p.home_score}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="text-right">
                      <div className="text-xs font-mono text-[#4A4A4A] uppercase">
                        Edge {p.edge_score >= 0 ? '+' : ''}{Math.round(p.edge_score)}
                      </div>
                      <div className="text-xs text-[#4A4A4A] capitalize">
                        {p.confidence_tier}
                      </div>
                    </div>
                    
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                      p.was_correct === true ? 'bg-[#16A34A]' : 
                      p.was_correct === false ? 'bg-[#DC2626]' :
                      'bg-[#A3A3A3]'
                    }`}>
                      {p.was_correct === true ? '✓' : p.was_correct === false ? '✗' : '–'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* METHODOLOGY */}
        <section className="bg-[#FAF8F3] border-2 border-[#1A1A1A]/10 rounded-lg p-6 md:p-8 mb-8">
          <h2 className="text-xl font-bold text-[#1A1A1A] mb-4" style={{ fontFamily: 'Fraunces, serif' }}>
            How this works
          </h2>
          <div className="space-y-3 text-sm text-[#4A4A4A] leading-relaxed">
            <p>
              <strong>Eight components.</strong> Every game gets scored on starting pitcher, bullpen, offense, defense, matchup, park factor, weather, and rest. Each weighted, summed, and capped at -100 to +100.
            </p>
            <p>
              <strong>Confidence tiers.</strong> Strong (≥25), Moderate (12-24), Slight (5-11), Toss-up (under 5). We only publish predictions for the first three. Toss-ups are excluded from accuracy.
            </p>
            <p>
              <strong>Auto-graded.</strong> Each morning, yesterday's results are pulled from MLB Stats API and predictions are graded automatically. Nothing here is hand-picked.
            </p>
            <p>
              <strong>Information only.</strong> The Edge does not provide betting advice. Track record exists for transparency, not as a tipping service.
            </p>
            <p className="text-xs italic pt-2">
              Want to see the math live? Open any game preview and tap "See the math behind each component."
            </p>
          </div>
        </section>

        {/* FOOTER LINK */}
        <div className="text-center pb-12">
          <Link 
            href="/"
            className="text-sm font-mono uppercase tracking-wider text-[#FF5722] hover:underline"
          >
            ← Back to today's games
          </Link>
        </div>
      </div>
    </main>
  )
}

// ============================================================
// HELPERS
// ============================================================
function tierDotColor(tier: string): string {
  if (tier === 'strong') return 'bg-[#FF5722]'
  if (tier === 'moderate') return 'bg-[#FDE047]'
  if (tier === 'slight') return 'bg-[#A3A3A3]'
  return 'bg-[#A3A3A3]'
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}