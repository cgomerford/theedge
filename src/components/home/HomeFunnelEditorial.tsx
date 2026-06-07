import Link from 'next/link'
import { SPORT_HUB_PATH } from '@/lib/active-sport'
import type { HomeFunnelProps } from './types'
import StatusBanners from './StatusBanners'
import SignupForm from './SignupForm'
import EdgeCard from './EdgeCard'
import FunnelPath from './FunnelPath'
import HomeFooter from './HomeFooter'

/**
 * Variant B — Editorial funnel
 * Magazine hero, trust stats, education, classic long-scroll conversion.
 */
export default function HomeFunnelEditorial({
  activeSport,
  activeSportLabel,
  gamesCount,
  overallStats,
  topEdges,
  status,
}: HomeFunnelProps) {
  const hubPath = SPORT_HUB_PATH[activeSport]

  return (
    <>
      <StatusBanners {...status} />

      <section className="px-6 pt-24 pb-20 max-w-5xl mx-auto">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#ea580c] mb-6">
          THE EDGE · {activeSportLabel} IN SEASON
        </div>
        <h1 className="text-6xl md:text-7xl font-serif font-bold tracking-tight mb-6 text-stone-900">
          Sharp analysis.
          <br />
          For every major sport<span className="text-[#ea580c]">.</span>
        </h1>
        <p className="text-xl text-stone-500 mb-10 max-w-2xl leading-relaxed font-serif italic">
          Pre-game breakdowns built for serious fans. One clear Edge Score, smart narrative, and
          deep data — delivered before tip-off, kickoff, or first pitch.
        </p>

        <div className="flex flex-wrap gap-2 text-sm mb-8">
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

        <SignupForm id="signup" source="home_hero" className="max-w-md mb-4" />
        <div className="text-[10px] text-stone-400 font-mono mb-8 uppercase tracking-widest">
          Free forever · No spam · Unsubscribe anytime
        </div>

        {gamesCount > 0 && (
          <Link
            href="/tonight"
            className="inline-flex items-center gap-2 text-[10px] text-[#ea580c] hover:text-stone-900 transition font-mono uppercase tracking-widest"
          >
            See tonight&apos;s MLB slate ({gamesCount} games) →
          </Link>
        )}
      </section>

      <section className="px-6 py-10 border-t border-stone-200 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-3 divide-x divide-stone-100">
            <Link href="/track-record" className="group px-6 py-2 first:pl-0">
              <div className="text-4xl md:text-5xl font-serif font-bold text-stone-900 group-hover:text-[#ea580c] transition leading-none mb-2">
                {overallStats.total_reviewed}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
                Games reviewed
              </div>
            </Link>
            <Link href="/track-record" className="group px-6 py-2">
              <div className="text-4xl md:text-5xl font-serif font-bold text-stone-900 group-hover:text-[#ea580c] transition leading-none mb-2">
                {overallStats.insufficient_sample ? (
                  <span className="text-stone-400 text-2xl font-normal">Tracking…</span>
                ) : (
                  `${overallStats.alignment_percent?.toFixed(1)}%`
                )}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
                {overallStats.insufficient_sample
                  ? 'Building sample size'
                  : 'Factor alignment rate'}
              </div>
            </Link>
            <div className="px-6 py-2">
              <div className="text-4xl md:text-5xl font-serif font-bold text-stone-900 leading-none mb-2">
                4
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
                Major leagues covered
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-stone-100 flex items-center justify-between flex-wrap gap-3">
            <Link
              href="/track-record"
              className="text-[10px] text-[#ea580c] hover:text-stone-900 transition font-mono uppercase tracking-widest"
            >
              Every game reviewed publicly →
            </Link>
            <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest">
              <span className="text-[#ea580c] font-bold">MLB LIVE</span>
              <span className="text-stone-300">·</span>
              <span>NFL July</span>
              <span className="text-stone-300">·</span>
              <span>NBA + NHL Sept</span>
            </div>
          </div>
        </div>
      </section>

      {topEdges.length > 0 && (
        <section className="px-6 py-20 border-t border-stone-200 bg-[#fafaf9]">
          <div className="max-w-5xl mx-auto">
            <div className="flex justify-between items-end mb-8">
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 flex items-center gap-2">
                <span className="text-stone-400">⊕</span> TONIGHT&apos;S BIGGEST EDGES — MLB
              </div>
              <Link
                href="/tonight"
                className="text-[10px] font-mono uppercase tracking-widest text-[#ea580c] hover:text-stone-900 transition"
              >
                FULL MLB SLATE →
              </Link>
            </div>
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {topEdges.map((edge) => (
                <EdgeCard key={edge.game.gamePk} edge={edge} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="px-6 py-16 border-t border-stone-200 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-6 text-center">
            From first visit to your dugout
          </div>
          <FunnelPath gamesCount={gamesCount} />
        </div>
      </section>

      <section className="px-6 py-20 border-t border-stone-200 bg-[#fafaf9]">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#ea580c] mb-4">
            Free for standard tracking · Pro for absolute depth
          </div>
          <h2 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 mb-4">
            Same slate<span className="text-[#ea580c]">.</span> Unlocked potential
            <span className="text-[#ea580c]">.</span>
          </h2>
          <p className="text-stone-500 font-serif italic mb-10 max-w-lg mx-auto text-lg">
            Free accounts show who holds the base line. Pro opens the comprehensive playbook — all
            8 core area scores, hot-zones, and granular situational data.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href="#signup"
              className="inline-block bg-white border border-stone-300 text-stone-900 px-8 py-3.5 text-[10px] font-mono uppercase tracking-widest hover:bg-stone-50 transition shadow-sm"
            >
              Enter the free dugout →
            </a>
            <Link
              href="/pricing"
              className="inline-block bg-[#ea580c] text-white px-8 py-3.5 text-[10px] font-mono uppercase tracking-widest font-bold hover:bg-orange-700 transition shadow-sm"
            >
              Go Pro · £4/mo →
            </Link>
          </div>
          <p className="text-[10px] font-mono text-stone-400 mt-6 uppercase tracking-widest">
            Early analyst rate locked in permanently for first 100 subscribers
          </p>
        </div>
      </section>

      <section className="px-6 py-24 border-t border-stone-200 bg-white">
        <div className="space-y-12 max-w-4xl mx-auto">
          {[
            {
              n: '1',
              title: 'Sport-tailored, unbiased architecture.',
              body: 'We ingest pure raw metrics directly from official feeds. No talking heads, no narrative bias, and no generic cross-sport templates. Our deep-analytical math engines are custom-engineered from scratch to process the unique mechanics of MLB, NFL, NBA, and NHL respectively.',
            },
            {
              n: '2',
              title: 'The 8-Area Edge breakdown.',
              body: 'The models segment every matchup into 8 distinct dimensions of performance. Instead of a vague outcome guess, you see structural friction: where your team is statistically likely to struggle, and contextual elements to watch during the game.',
            },
            {
              n: '3',
              title: 'Your dedicated Dugout space.',
              body: 'Subscribing spins up your personal Dugout dashboard. Select preferred teams across active and upcoming sports to receive customized pre-game analysis in your account and inbox ~3 hours before first pitch.',
            },
          ].map((step) => (
            <div key={step.n} className="grid md:grid-cols-12 gap-8 items-start">
              <div className="md:col-span-1 text-5xl font-serif text-[#ea580c] font-bold mt-[-8px]">
                {step.n}
              </div>
              <div className="md:col-span-11">
                <h3 className="text-2xl font-serif font-bold text-stone-900 mb-3">{step.title}</h3>
                <p className="text-stone-600 leading-relaxed text-lg">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-24 border-t border-stone-200 bg-[#fafaf9]">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#ea580c] mb-4">
            Personalised · Unbiased · Zero fluff
          </div>
          <h2 className="text-4xl md:text-5xl font-serif font-bold text-stone-900 mb-4">
            Your teams. Your data.
            <br />
            <em className="text-stone-500 font-normal italic">
              Ready hours before the whistle blows.
            </em>
          </h2>
          <p className="text-stone-400 font-mono text-[10px] uppercase tracking-widest mb-10">
            Free tracking account · No card required · Unsubscribe anytime
          </p>
          <SignupForm
            source="home_footer"
            buttonLabel="Setup my dugout →"
            className="max-w-md mx-auto"
          />
          <p className="mt-8 text-[10px] font-mono uppercase tracking-widest text-stone-400">
            <Link href={hubPath} className="hover:text-stone-900">
              Explore {activeSportLabel} →
            </Link>
          </p>
        </div>
      </section>

      <HomeFooter />
    </>
  )
}