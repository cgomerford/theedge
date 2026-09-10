import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import SignupForm from '@/components/SignupForm'
import { getCurrentSubscriber } from '@/lib/auth'

// 2026-08-23: full sync pass with the redesigned homepage. Feature
// copy now matches the real module list from ScoutReportTab (Pitching
// Lab, Batting Lab, hot zone matchups, Scout Report, ABS/SB tendency)
// instead of the earlier generic "not just an ERA" framing. Postgame
// reports moved to the Free tier — confirmed there's no isPro/subscriber
// gate anywhere in src/app/mlb/[slug]/postgame/page.tsx, so listing it
// as Pro-exclusive would have been inaccurate. If gating postgame
// reports behind Pro is actually the intent, that's a real code change
// to flag separately — this pass only reflects what's actually shipped.
//
// Added a "why it's worth it" framing pass throughout: every feature
// bullet and section now pairs the what with the so-what, rather than
// listing feature names and assuming the value is self-evident.

export const metadata = {
  title: 'Pricing · The Edge',
  description: 'Free for fans. Pro for analysts. Founding 100 members lock in £4/mo for life.',
}

export default async function PricingPage() {
  const subscriber = await getCurrentSubscriber()
  const isPro = subscriber?.is_pro ?? false

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-[#1A1A1A] overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');
        .edge-display { font-family: 'Bebas Neue', sans-serif; }
      `}</style>

      <SiteHeader variant="page" />

      {/* ════ MASTHEAD ════════════════════════════════════════════════════ */}
      <div className="border-b border-[#DEDACE] bg-[#F4F1EA]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-[#8A8577]">
          <span>Pricing</span>
          <span className="text-[#FF5722]">Beta · Pro opens at launch</span>
        </div>
      </div>

      {/* ════ HERO ════════════════════════════════════════════════════════ */}
      <div className="border-b border-[#DEDACE]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-12">
          <div className="font-mono text-[11px] uppercase tracking-widest text-[#FF5722] flex items-center gap-2 mb-4">
            <span>§</span><span>Pricing</span>
          </div>
          <h1 className="edge-display text-[clamp(40px,6vw,68px)] leading-[0.98] tracking-wide mb-6 max-w-3xl">
            Baseball Savant tells you what happened.{' '}
            <span className="text-[#FF5722]">We tell you what it means.</span>
          </h1>
          <p className="font-serif text-lg text-[#4A4740] max-w-xl leading-relaxed">
            Advanced stats are everywhere now. The hard part was always knowing what to do with them — until tonight's game, in plain English, before first pitch.
          </p>
        </div>
      </div>

      {/* ════ PROOF STRIP — the number vs the read ═══════════════════════ */}
      <div className="border-b border-[#DEDACE]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
          <div className="font-mono text-[11px] uppercase tracking-widest text-[#FF5722] flex items-center gap-2 mb-6">
            <span>§</span><span>The difference</span>
          </div>
          <div className="grid sm:grid-cols-2 border border-[#1A1A1A]">
            <div className="p-7 border-b sm:border-b-0 sm:border-r border-[#1A1A1A]">
              <span className="block font-mono text-[10px] uppercase tracking-widest text-[#8A8577] mb-3">
                Just the number
              </span>
              <div className="font-mono font-bold text-[28px] text-[#8A8577]">
                Whiff rate: 34.2%
              </div>
            </div>
            <div className="p-7">
              <span className="block font-mono text-[10px] uppercase tracking-widest text-[#FF5722] mb-3">
                The Edge read
              </span>
              <p className="font-serif text-base leading-relaxed">
                His slider has been{' '}
                <strong className="bg-[#FDE047] px-1 font-semibold">unhittable in the 7th</strong>{' '}
                all season — but he's never faced this lineup a third time through. That's what makes tonight different from his last ten starts.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ════ WHAT'S IN A REPORT — real module list ═══════════════════════ */}
      <div className="border-b border-[#DEDACE] bg-[#F4F1EA]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
          <div className="font-mono text-[11px] uppercase tracking-widest text-[#FF5722] flex items-center gap-2 mb-4">
            <span>§</span><span>What's actually in a report</span>
          </div>
          <h2 className="edge-display text-[34px] mb-4 max-w-xl">
            Not just the data — what it means
          </h2>
          <p className="font-serif italic text-[#4A4740] max-w-xl mb-10">
            Every one of these is a real module in every game report. Not a marketing list — this is what actually loads.
          </p>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { num: '01', title: 'Pitching Lab', body: 'Full arsenal breakdown, count tendency, and sequencing for both starters — plus live bullpen availability. Know what he throws and when before he does it tonight.' },
              { num: '02', title: 'Hot zone matchups', body: "Every lineup's hot and cold zones against tonight's specific starter, mapped by handedness. See exactly where a lineup is vulnerable before the first pitch." },
              { num: '03', title: 'Scout Report', body: 'Bullpen usage patterns, ABS challenge tendency, stolen-base tendency vs tonight\'s catcher, and fielding alignment — the context box scores never show.' },
            ].map(item => (
              <div key={item.num}>
                <div className="font-mono text-[11px] text-[#FF5722] mb-2">{item.num}</div>
                <h3 className="font-serif font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-[#4A4740] font-serif leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ════ WHY IT'S WORTH IT ═════════════════════════════════════════ */}
      <div className="border-b border-[#DEDACE]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
          <div className="font-mono text-[11px] uppercase tracking-widest text-[#FF5722] flex items-center gap-2 mb-4">
            <span>§</span><span>Why it's worth £6 a month</span>
          </div>
          <h2 className="edge-display text-[32px] mb-10 max-w-lg">
            What you'd have to do yourself otherwise
          </h2>
          <div className="grid sm:grid-cols-2 gap-x-12 gap-y-8">
            {[
              {
                title: 'Building your own attack plan takes real time',
                body: 'Cross-referencing a batter\'s zone splits against a specific pitcher\'s arsenal, by count, is exactly the kind of research serious fans and fantasy players already do by hand — Batting Lab and Pitching Lab do it in seconds, for any matchup you pick.',
              },
              {
                title: 'This data isn\'t free anywhere else',
                body: 'Hot zone matchups, ABS challenge tendency, and stolen-base odds against a specific catcher aren\'t sitting on a free stats page. Pulling them together yourself means multiple tabs, multiple sources, and no guarantee the numbers agree.',
              },
              {
                title: 'You get it before first pitch, every night',
                body: 'No digging through box scores after the fact — the full report is ready before the game starts, every single game on the slate, all season.',
              },
              {
                title: 'It compounds with fantasy',
                body: 'Bullpen fatigue tracking and streamer/sleeper calls mean you\'re not separately maintaining a fantasy research habit on top of a scouting habit — it\'s the same data, doing double duty.',
              },
            ].map(item => (
              <div key={item.title}>
                <h3 className="font-serif font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-[#4A4740] font-serif leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ════ PRICING CARDS ══════════════════════════════════════════════ */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
        <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto">

          {/* ──── FREE TIER ──────────────────────────────────────────── */}
          <div className="border border-[#1A1A1A] bg-white p-7 flex flex-col">
            <div className="font-mono text-[10px] uppercase tracking-widest text-[#8A8577] mb-2">
              Free
            </div>
            <div className="edge-display text-[44px] leading-none mb-1">£0</div>
            <div className="font-mono text-[11px] text-[#8A8577] mb-6">forever</div>

            <ul className="space-y-0 flex-1 mb-6">
              {[
                'Factor breakdown — which side the data leans toward, and why',
                'Scout Report summary — key pitch arsenal and hot zone notes',
                'Postgame recap after every game — box score, top performers',
                'Projected lineups with basic stats',
                'Daily email brief',
                'Up to 3 followed teams',
                'Public Track Record',
              ].map((f, i) => (
                <li key={f} className={`flex items-start gap-2.5 text-sm py-2.5 ${i > 0 ? 'border-t border-[#DEDACE]' : ''}`}>
                  <span className="text-[#FF5722] font-mono text-xs mt-0.5 shrink-0">⊕</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="pt-5 border-t border-[#DEDACE]">
              {subscriber ? (
                <div className="text-sm font-mono text-[#8A8577] text-center py-3">
                  ✓ You&apos;re signed up
                </div>
              ) : (
                <SignupForm source="pricing_free" buttonText="Start with free →" theme="light" />
              )}
            </div>
          </div>

          {/* ──── PRO TIER — LOCKED ──────────────────────────────────── */}
          <div className="border-2 border-[#FF5722] bg-[#1A1A1A] text-[#FAF8F3] p-7 flex flex-col relative">
            <div className="absolute -top-[1px] right-0 bg-[#FF5722] text-white font-mono text-[10px] uppercase tracking-widest px-3 py-1.5">
              🔒 Opens at launch
            </div>

            <div className="font-mono text-[10px] uppercase tracking-widest text-[#FDE047] mb-2">
              ⊕ Pro
            </div>
            <div className="edge-display text-[44px] leading-none mb-1 flex items-baseline gap-3">
              <span className="text-[#FDE047]">£4</span>
              <span className="font-mono text-sm text-[#8A8577] line-through">£6/mo</span>
            </div>
            <div className="font-mono text-[11px] text-[#8A8577] mb-6">
              or £40/yr <span className="line-through">£60/yr</span> · Founding 100 price, at launch
            </div>

            <ul className="space-y-0 flex-1 mb-6">
              <li className="flex items-start gap-2.5 text-sm py-2.5 border-b border-[#3A3A38] text-[#8A8577]">
                <span className="text-[#FDE047] font-mono text-xs mt-0.5 shrink-0">⊕</span>
                <span>Everything in Free</span>
              </li>
              {[
                { label: 'Full Scout Report — every game, every angle', fantasy: false },
                { label: 'Pitching Lab — build your own attack plan by count', fantasy: false },
                { label: 'Batting Lab — find a lineup\'s real vulnerabilities', fantasy: false },
                { label: 'Hot zone matchups vs tonight\'s starter, every lineup spot', fantasy: false },
                { label: 'ABS challenge tendency, by team and umpire crew', fantasy: false },
                { label: 'Stolen base tendency vs tonight\'s catcher', fantasy: false },
                { label: 'Bullpen fatigue tracker', fantasy: true },
                { label: 'The Fantasy Desk (Streamers, Fallers, Sleepers)', fantasy: true },
                { label: 'Unlimited team follows', fantasy: false },
              ].map(f => (
                <li key={f.label} className="flex items-start gap-2.5 text-sm py-2.5 border-t border-[#3A3A38]">
                  <span className="text-[#FDE047] font-mono text-xs mt-0.5 shrink-0">⊕</span>
                  <span>
                    {f.label}
                    {f.fantasy && (
                      <span className="ml-2 text-[9px] font-mono uppercase tracking-wider text-[#FF5722] bg-[#FF5722]/10 px-1.5 py-0.5">
                        Fantasy
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            <div className="pt-5 border-t border-[#3A3A38]">
              {isPro ? (
                <div className="text-sm font-mono text-[#FDE047] text-center py-3">
                  ✓ You&apos;re a Pro member
                </div>
              ) : (
                <>
                  <div className="bg-[#FAF8F3] p-3 border border-[#3A3A38]">
                    <SignupForm source="pricing_pro_waitlist" buttonText="Join Pro waitlist →" theme="light" />
                  </div>
                  <p className="text-[10px] font-mono text-[#8A8577] text-center mt-3">
                    No payment yet · Founding 100 price locked in when Pro opens
                  </p>
                </>
              )}
            </div>
          </div>

        </div>

        {/* ════ COMING SOON ══════════════════════════════════════════════ */}
        <div className="max-w-4xl mx-auto mt-12 text-center">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#8A8577] mb-3">
            Coming this summer
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-mono text-[#8A8577]">
            <span>NFL Edge (August)</span>
            <span className="text-[#DEDACE]">·</span>
            <span>NBA + NHL (October)</span>
            <span className="text-[#DEDACE]">·</span>
            <span>League sync (ESPN / Yahoo / Fantrax)</span>
          </div>
        </div>

        {/* ════ FAQ ══════════════════════════════════════════════════════ */}
        <div className="max-w-3xl mx-auto mt-16 pt-12 border-t border-[#DEDACE]">
          <div className="font-mono text-[11px] uppercase tracking-widest text-[#FF5722] flex items-center justify-center gap-2 mb-4">
            <span>§</span><span>Quick questions</span>
          </div>
          <h2 className="edge-display text-[32px] text-center mb-10">
            Before you decide
          </h2>

          <div className="space-y-8">
            {[
             {
                q: 'Is Pro actually worth £6 a month?',
                a: 'If you already spend time cross-referencing a batter\'s zone splits against a pitcher\'s arsenal, or checking bullpen usage before setting a fantasy lineup — that\'s exactly what Pitching Lab and Batting Lab do in seconds. £6 a month is less than one coffee, for research that would otherwise cost you real time, every single game, all season.',
              },
              {
                q: 'What does "Founding 100" mean?',
                a: 'The first 100 people to join the Pro waitlist lock in £4/mo (or £40/yr) for as long as they stay subscribed once Pro opens. After that, Pro is £6/mo (£60/yr). Your price never changes once locked in.',
              },
              {
                q: 'What does Pro actually add over Free?',
                a: 'Depth. Free gives you the summary version of the Scout Report — Pro gives you the full thing, plus Pitching Lab and Batting Lab so you can build your own matchup analysis instead of reading someone else\'s.',
              },
              {
                q: 'Can I cancel anytime?',
                a: 'Anytime, no questions. Monthly subscribers cancel month-to-month. Annual subscribers get a prorated refund if they cancel within the first 30 days.',
              },
            
              {
                q: 'What sports are covered?',
                a: 'MLB right now, with full daily coverage. NFL launches in August (fantasy season), NBA and NHL in October. Pro subscribers get all sports at no extra cost.',
              },
              {
                q: 'How is this different from other stats sites?',
                a: 'Most sites give you either raw advanced data or long-form storytelling. The Edge sits in between — a 5-minute read that tells you what actually matters tonight, with the underlying data always visible.',
              },
            ].map((faq, i) => (
              <div key={i}>
                <h3 className="font-serif font-semibold text-lg mb-2">{faq.q}</h3>
                <p className="text-sm text-[#4A4740] leading-relaxed font-serif">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ════ FINAL CTA ════════════════════════════════════════════════ */}
        <div className="max-w-3xl mx-auto mt-16 pt-12 border-t border-[#DEDACE] text-center">
          <h2 className="edge-display text-[36px] mb-4">
            Same analysis. Different depth.
          </h2>
          <p className="font-serif italic text-lg text-[#4A4740] mb-4 max-w-lg mx-auto">
            Start free. Join the Pro waitlist for when the full depth opens.
          </p>
          <p className="font-serif italic text-base text-[#8A8577] mb-8 max-w-md mx-auto">
            We're not in the business of calls or predictions. We take the same data the pros use and make it easier to actually understand what's happening on the field.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
            {!subscriber && (
              <SignupForm source="pricing_final_cta" buttonText="Start with free →" theme="light" />
            )}
            {!isPro && (
              <Link
                href="#pro-waitlist"
                className="inline-block bg-[#F4F1EA] text-[#4A4740] border border-[#DEDACE] px-8 py-3 text-sm font-mono uppercase tracking-widest hover:bg-[#DEDACE] transition"
              >
                🔒 Pro waitlist — above
              </Link>
            )}
          </div>
        </div>

      </div>

      {/* ════ FOOTER ════════════════════════════════════════════════════ */}
      <footer className="border-t border-[#DEDACE] mt-8 px-4 sm:px-6 py-8 text-[11px] font-mono text-[#8A8577] bg-[#F4F1EA]">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/tonight"      className="hover:text-[#1A1A1A] transition">Tonight</Link>
            <Link href="/track-record" className="hover:text-[#1A1A1A] transition">Track Record</Link>
            <Link href="/about"        className="hover:text-[#1A1A1A] transition">About</Link>
            <Link href="/faq"          className="hover:text-[#1A1A1A] transition">FAQ</Link>
            <Link href="/privacy"      className="hover:text-[#1A1A1A] transition">Privacy</Link>
            <Link href="/terms"        className="hover:text-[#1A1A1A] transition">Terms</Link>
            <Link href="/pricing"      className="hover:text-[#1A1A1A] transition">Pricing</Link>
          </div>
          <div className="text-[#8A8577] uppercase tracking-wider">
            Information only · Not gambling advice
          </div>
        </div>
      </footer>
    </main>
  )
}