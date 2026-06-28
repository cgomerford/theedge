import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import SignupForm from '@/components/SignupForm'
import { getCurrentSubscriber } from '@/lib/auth'

export const metadata = {
  title: 'Pricing · The Edge',
  description: 'Free for fans. Pro for analysts. Founding 100 members lock in £4/mo for life.',
}

export default async function PricingPage() {
  const subscriber = await getCurrentSubscriber()
  const isPro = subscriber?.is_pro ?? false

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-stone-900 overflow-x-hidden">
      <SiteHeader variant="page" />

      {/* ════ MASTHEAD ════════════════════════════════════════════════════ */}
      <div className="border-b border-stone-200 bg-stone-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-stone-400">
          <span>Pricing</span>
          <span className="text-orange-600">Beta · Pro opens at launch</span>
        </div>
      </div>

      {/* ════ HERO ════════════════════════════════════════════════════════ */}
      <div className="border-b-2 border-stone-900 bg-stone-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-8 text-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 mb-3">
            § Same game. Different depth.
          </div>
          <h1 className="font-serif font-light text-5xl sm:text-7xl tracking-tight leading-none mb-4">
            Pick your tier<span className="text-orange-600">.</span>
          </h1>
          <p className="text-stone-500 font-serif italic text-base sm:text-lg max-w-2xl mx-auto">
            Free shows the verdict. Pro shows the playbook. Both use the same Edge Score — Pro just lets you see why.
          </p>
        </div>
      </div>

      {/* ════ PRICING CARDS ══════════════════════════════════════════════ */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">

          {/* ──── FREE TIER ──────────────────────────────────────────── */}
          <div className="border border-stone-200 bg-white p-6 sm:p-8 flex flex-col">
            <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-1">
              Free tier
            </div>
            <h2 className="font-serif text-3xl font-light mb-1">
              For the fan<span className="text-orange-600">.</span>
            </h2>
            <div className="font-mono text-2xl font-bold text-stone-900 mb-2">
              £0
            </div>
            <p className="text-sm text-stone-500 font-serif italic mb-8">
              Enough to get smart. Five-minute reads. Daily email.
            </p>

            <div className="space-y-3 text-sm flex-1">
              {[
                'Edge Score + predicted winner',
                '1-sentence summary (smart-friend voice)',
                'Top 2 components shown with values',
                'Projected lineups with basic stats',
                'Daily email brief',
                'Up to 3 followed teams',
                'Public Track Record',
              ].map(f => (
                <div key={f} className="flex items-start gap-2.5">
                  <span className="text-green-600 mt-0.5 shrink-0">✓</span>
                  <span className="text-stone-700">{f}</span>
                </div>
              ))}
            </div>

            {/* Real signup form here (was a link out to /#signup) — Turnstile
                bot protection comes along for free since it's inside SignupForm */}
            <div className="mt-8 pt-6 border-t border-stone-100">
              {subscriber ? (
                <div className="text-sm font-mono text-stone-400 text-center py-3">
                  ✓ You&apos;re signed up
                </div>
              ) : (
                <SignupForm source="pricing_free" buttonText="Start with free →" theme="light" />
              )}
            </div>
          </div>

          {/* ──── PRO TIER — LOCKED ──────────────────────────────────── */}
          <div className="border-2 border-stone-900 bg-stone-900 text-stone-100 p-6 sm:p-8 flex flex-col relative">
            {/* Lock badge — replaces the old "Founding 100" live badge */}
            <div className="absolute -top-3 right-6 bg-stone-700 text-stone-200 text-[10px] font-mono uppercase tracking-widest px-3 py-1 font-bold border border-stone-600">
              🔒 Opens at launch
            </div>

            <div className="text-[10px] font-mono uppercase tracking-widest text-[#FDE047] mb-1">
              ⊕ Pro tier
            </div>
            <h2 className="font-serif text-3xl font-light mb-1">
              For the analyst<span className="text-orange-600">.</span>
            </h2>
            <div className="flex items-baseline gap-3 mb-1">
              <span className="font-mono text-2xl font-bold text-[#FDE047]">£4/mo</span>
              <span className="font-mono text-sm text-stone-400 line-through">£6/mo</span>
            </div>
            <div className="text-xs font-mono text-stone-400 mb-2">
              or £40/yr <span className="line-through text-stone-500">£60/yr</span> · Founding 100 price, at launch
            </div>
            <p className="text-sm text-stone-400 font-serif italic mb-8">
              Enough to win your fantasy league. Full data. Every angle. Join the waitlist now and the first 100 lock in this price for life.
            </p>

            <div className="space-y-3 text-sm flex-1">
              <div className="flex items-start gap-2.5 text-stone-400 pb-2 mb-1 border-b border-stone-700">
                <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                <span>Everything in Free</span>
              </div>
              {[
                { label: 'All 8 components with drill-downs', fantasy: false },
                { label: 'Full smart-friend narrative ("The Read")', fantasy: false },
                { label: 'Pitch arsenal effectiveness chart', fantasy: false },
                { label: 'Batter hot zones · L5 splits · vs LHP/RHP', fantasy: true },
                { label: 'Bullpen fatigue tracker', fantasy: true },
                { label: 'The Fantasy Desk (Streamers, Fallers, Sleepers)', fantasy: true },
                { label: '"Why we might be wrong" counter-take', fantasy: false },
                { label: 'Fantasy Matchup Intel per game', fantasy: true },
                { label: 'Unlimited team follows', fantasy: false },
              ].map(f => (
                <div key={f.label} className="flex items-start gap-2.5">
                  <span className="text-[#FDE047] mt-0.5 shrink-0">✓</span>
                  <span className="text-stone-100">
                    {f.label}
                    {f.fantasy && (
                      <span className="ml-2 text-[9px] font-mono uppercase tracking-wider text-orange-500 bg-orange-500/10 px-1.5 py-0.5">
                        Fantasy
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-stone-700">
              {isPro ? (
                <div className="text-sm font-mono text-[#FDE047] text-center py-3">
                  ✓ You&apos;re a Pro member
                </div>
              ) : (
                <>
                  {/* Pro checkout is locked until launch — no Stripe link yet.
                      Waitlist capture reuses SignupForm, wrapped in a light
                      card so it's readable on the dark Pro panel (same
                      pattern as the homepage hero-over-photo treatment). */}
                  <div className="bg-[#FAF8F3] p-3 border border-stone-700">
                    <SignupForm source="pricing_pro_waitlist" buttonText="Join Pro waitlist →" theme="light" />
                  </div>
                  <p className="text-[10px] font-mono text-stone-500 text-center mt-3">
                    No payment yet · Founding 100 price locked in when Pro opens
                  </p>
                </>
              )}
            </div>
          </div>

        </div>

        {/* ════ COMING SOON ══════════════════════════════════════════════ */}
        <div className="max-w-4xl mx-auto mt-12 text-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">
            Coming this summer
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-mono text-stone-500">
            <span>NFL Edge (August)</span>
            <span className="text-stone-300">·</span>
            <span>NBA + NHL (October)</span>
            <span className="text-stone-300">·</span>
            <span>League sync (ESPN / Yahoo / Fantrax)</span>
          </div>
        </div>

        {/* ════ FAQ ══════════════════════════════════════════════════════ */}
        <div className="max-w-3xl mx-auto mt-16 pt-12 border-t border-stone-200">
          <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 mb-4 text-center">
            § Quick questions
          </div>
          <h2 className="font-serif text-3xl font-light text-center mb-10">
            Before you decide<span className="text-orange-600">.</span>
          </h2>

          <div className="space-y-8">
            {[
              {
                q: 'What does "Founding 100" mean?',
                a: 'The first 100 people to join the Pro waitlist lock in £4/mo (or £40/yr) for as long as they stay subscribed once Pro opens. After that, Pro is £6/mo (£60/yr). Your price never changes once locked in.',
              },
              {
                q: 'Is the free tier actually useful?',
                a: 'Yes. You get the Edge Score, predicted winner, a one-sentence take, the top 2 components, projected lineups, and a daily email brief. Most sports sites charge for less.',
              },
              {
                q: 'Can I cancel anytime?',
                a: 'Anytime, no questions. Monthly subscribers cancel month-to-month. Annual subscribers get a prorated refund if they cancel within the first 30 days.',
              },
              {
                q: 'Is this a betting site?',
                a: 'No. The Edge is information only — pre-game analysis for fans and fantasy players. We never use betting language, never recommend wagers, and never take a cut of anything.',
              },
              {
                q: 'What sports are covered?',
                a: 'MLB right now, with full daily coverage. NFL launches in August (fantasy season), NBA and NHL in October. Pro subscribers get all sports at no extra cost.',
              },
              {
                q: 'How is this different from The Athletic or Baseball Savant?',
                a: 'The Athletic is long-form storytelling. Baseball Savant is raw data for engineers. The Edge sits in between — a 5-minute smart-friend brief that tells you what matters tonight, with the data to back it up.',
              },
            ].map((faq, i) => (
              <div key={i}>
                <h3 className="font-serif font-semibold text-lg text-stone-900 mb-2">
                  {faq.q}
                </h3>
                <p className="text-sm text-stone-600 leading-relaxed font-serif">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ════ FINAL CTA ════════════════════════════════════════════════ */}
        <div className="max-w-3xl mx-auto mt-16 pt-12 border-t border-stone-200 text-center">
          <h2 className="font-serif text-3xl sm:text-4xl font-light mb-4">
            Same game<span className="text-orange-600">.</span> Different depth<span className="text-orange-600">.</span>
          </h2>
          <p className="text-stone-500 font-serif italic mb-8 max-w-lg mx-auto">
            Start free. Join the Pro waitlist for when the full playbook opens.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
            {!subscriber && (
              <SignupForm source="pricing_final_cta" buttonText="Start with free →" theme="light" />
            )}
            {!isPro && (
              <Link
                href="#pro-waitlist"
                className="inline-block bg-stone-200 text-stone-700 p-[1px] px-8 py-3 text-sm font-mono uppercase tracking-widest hover:bg-stone-300 transition"
              >
                🔒 Pro waitlist — above
              </Link>
            )}
          </div>
        </div>

      </div>

      {/* ════ FOOTER ════════════════════════════════════════════════════ */}
      <footer className="border-t border-stone-200 mt-8 px-4 sm:px-6 py-8 text-[11px] font-mono text-stone-400 bg-stone-50">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/tonight"      className="hover:text-stone-600 transition">Tonight</Link>
            <Link href="/track-record" className="hover:text-stone-600 transition">Track Record</Link>
            <Link href="/about"        className="hover:text-stone-600 transition">About</Link>
            <Link href="/faq"          className="hover:text-stone-600 transition">FAQ</Link>
            <Link href="/privacy"      className="hover:text-stone-600 transition">Privacy</Link>
            <Link href="/terms"        className="hover:text-stone-600 transition">Terms</Link>
            <Link href="/pricing" className="hover:text-stone-600 transition">Pricing</Link>
          </div>
          <div className="text-stone-300 uppercase tracking-wider">
            Information only · Not gambling advice
          </div>
        </div>
      </footer>
    </main>
  )
}