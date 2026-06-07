import Link from 'next/link'
import { SPORT_HUB_PATH } from '@/lib/active-sport'
import type { HomeFunnelProps } from './types'
import StatusBanners from './StatusBanners'
import SignupForm from './SignupForm'
import EdgeCard from './EdgeCard'
import FunnelPath from './FunnelPath'
import HomeFooter from './HomeFooter'

/**
 * Variant A — Proof-first funnel
 * Lead with live edges + track record, compress education, repeat signup.
 */
export default function HomeFunnelProof({
  activeSport,
  activeSportLabel,
  gamesCount,
  overallStats,
  topEdges,
  status,
}: HomeFunnelProps) {
  const [featured, ...rest] = topEdges
  const hubPath = SPORT_HUB_PATH[activeSport]

  return (
    <>
      <StatusBanners {...status} />

      {/* Hero: product proof left, signup card right */}
      <section className="px-6 pt-20 pb-12 max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          <div className="lg:col-span-7">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[#ea580c] mb-4">
              THE EDGE · {activeSportLabel} IN SEASON
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-serif font-bold tracking-tight mb-5 text-stone-900 leading-[1.05]">
              See the edge before you sign up<span className="text-[#ea580c]">.</span>
            </h1>
            <p className="text-lg text-stone-600 mb-6 max-w-xl leading-relaxed">
              Tonight&apos;s slate is public. Create a free account when you want your teams in one
              Dugout — pre-game briefs ~3 hours before first pitch.
            </p>

            <div className="flex flex-wrap gap-2 mb-8">
              <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded font-mono text-xs">
                MLB — LIVE
              </span>
              <span className="bg-stone-100 text-stone-600 px-3 py-1 rounded font-mono text-xs">
                NFL — July
              </span>
              <span className="bg-stone-100 text-stone-600 px-3 py-1 rounded font-mono text-xs">
                NBA + NHL — Sept
              </span>
            </div>

            <div className="flex flex-wrap gap-6 text-[10px] font-mono uppercase tracking-widest">
              <Link
                href="/track-record"
                className="text-stone-900 hover:text-[#ea580c] transition border-b border-stone-300 pb-0.5"
              >
                {overallStats.total_reviewed} games reviewed →
              </Link>
              <span className="text-stone-400">
                {overallStats.insufficient_sample
                  ? 'Alignment tracking…'
                  : `${overallStats.alignment_percent?.toFixed(1)}% factor alignment`}
              </span>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div
              id="signup"
              className="bg-white border-2 border-stone-900 p-6 sm:p-8 shadow-[8px_8px_0_0_rgba(28,25,23,0.08)]"
            >
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#ea580c] mb-2">
                Free dugout access
              </div>
              <h2 className="font-serif text-2xl font-bold text-stone-900 mb-2">
                Your teams. One inbox.
              </h2>
              <p className="text-sm text-stone-500 mb-6">
                No card · Verify by email · Unsubscribe anytime
              </p>
              <SignupForm source="home_hero_proof" buttonLabel="Open my dugout →" />
              {gamesCount > 0 && (
                <Link
                  href="/tonight"
                  className="mt-4 inline-block text-[10px] text-stone-500 hover:text-stone-900 font-mono uppercase tracking-widest transition"
                >
                  Or browse {gamesCount} games tonight first →
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Live proof band */}
      {topEdges.length > 0 && (
        <section className="px-6 py-14 border-t border-stone-200 bg-stone-900 text-stone-100">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-wrap justify-between items-end gap-4 mb-8">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-[#fdba74] mb-2">
                  Live proof · MLB tonight
                </div>
                <h2 className="text-2xl md:text-3xl font-serif font-bold">
                  Biggest edges on the board
                </h2>
              </div>
              <Link
                href="/tonight"
                className="text-[10px] font-mono uppercase tracking-widest text-[#fdba74] hover:text-white transition"
              >
                Full slate →
              </Link>
            </div>

            <div className="grid lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7">{featured && <EdgeCard edge={featured} size="featured" />}</div>
              <div className="lg:col-span-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                {rest.map((edge) => (
                  <EdgeCard key={edge.game.gamePk} edge={edge} />
                ))}
              </div>
            </div>

            <p className="mt-8 text-center text-[10px] font-mono uppercase tracking-widest text-stone-500">
              Free to read every game ·{' '}
              <a href="#signup" className="text-[#fdba74] hover:text-white transition">
                Sign up to follow your teams →
              </a>
            </p>
          </div>
        </section>
      )}

      {/* Funnel path */}
      <section className="px-6 py-16 border-t border-stone-200 bg-[#fafaf9]">
        <div className="max-w-6xl mx-auto">
          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-6 text-center">
            How the funnel works
          </div>
          <FunnelPath gamesCount={gamesCount} />
        </div>
      </section>

      {/* Free vs Pro — side by side, scannable */}
      <section className="px-6 py-16 border-t border-stone-200 bg-white">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
          <div className="border border-stone-200 p-6">
            <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-2">
              Free
            </div>
            <h3 className="font-serif text-xl font-bold mb-3">Verdict + summary</h3>
            <p className="text-sm text-stone-600 mb-4">
              Edge Score, winner, smart-friend narrative. Enough for every game on the slate.
            </p>
            <a
              href="#signup"
              className="text-[10px] font-mono uppercase tracking-widest text-[#ea580c] hover:text-stone-900"
            >
              Start free →
            </a>
          </div>
          <div className="border-2 border-stone-900 bg-stone-900 text-stone-100 p-6">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[#fde047] mb-2">
              Pro · £4/mo
            </div>
            <h3 className="font-serif text-xl font-bold mb-3">Full 8-area playbook</h3>
            <p className="text-sm text-stone-400 mb-4">
              All component scores, hot-zones, situational depth. Same models — unlocked.
            </p>
            <Link
              href="/pricing"
              className="text-[10px] font-mono uppercase tracking-widest text-[#fde047] hover:text-white"
            >
              Go Pro →
            </Link>
          </div>
        </div>
      </section>

      {/* Single closing CTA */}
      <section className="px-6 py-20 border-t border-stone-200 bg-[#fafaf9]">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-3xl font-serif font-bold text-stone-900 mb-3">
            Ready for your Dugout?
          </h2>
          <p className="text-stone-500 text-sm mb-8">
            Join free — we&apos;ll email you when your teams are on the slate.
          </p>
          <SignupForm
            source="home_footer_proof"
            buttonLabel="Setup my dugout →"
            className="max-w-md mx-auto"
          />
          <div className="mt-6 flex justify-center gap-4 text-[10px] font-mono uppercase tracking-widest">
            <Link href={hubPath} className="text-stone-400 hover:text-stone-900">
              {activeSportLabel} hub →
            </Link>
            <Link href="/track-record" className="text-stone-400 hover:text-stone-900">
              Track record →
            </Link>
          </div>
        </div>
      </section>

      <HomeFooter />
    </>
  )
}