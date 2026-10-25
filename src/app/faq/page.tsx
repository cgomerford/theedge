import SiteHeader from '@/components/SiteHeader'
import Link from 'next/link'
import { CONTACT_EMAIL } from '@/lib/site'
import { pageMeta } from '@/lib/seo'
import { FAQSchema, BreadcrumbSchema } from '@/components/StructuredData'

export const metadata = pageMeta({
  title: 'FAQ',
  description:
    'Answers to common questions about x9Lab: what the site shows, how often the numbers update, and what the free daily email includes. Short answers, no jargon.',
  path: '/faq',
})

const FAQS = [
  {
    section: 'What is x9Lab',
    items: [
      {
        q: 'What is x9Lab?',
        a: 'x9Lab is a daily sports analysis platform that publishes pre-game statistical breakdowns for MLB (and soon NFL, NBA, and NHL). We pull advanced metrics — pitch data, pitcher arsenals, bullpen availability, and more — and turn them into a scannable 5-minute read before each game.',
      },
      {
        q: 'Who is it for?',
        a: 'MLB fans who want more than just scores, and fantasy baseball players who want to make smarter Start/Sit decisions. You don\'t need to be a data scientist — we translate the numbers into plain English. If you\'ve ever wanted to understand why a pitcher is struggling beyond "he had a bad night," x9Lab is for you.',
      },
      {
        q: 'How is it different from Other stat sites or The Athletic?',
        a: 'Other stat sites shows you the raw data — it\'s powerful but dense. The Athletic gives you long-form storytelling — excellent, but a 20-minute read. x9Lab sits between them: we take the same advanced metrics and give you the strategic story in 5 minutes, timed to land before first pitch.',
      },
      {
        q: 'Is x9Lab free?',
        a: 'Yes. The core daily brief — Edge Score, The Story, starting pitcher breakdown, and two key components — is free, always. Pro subscribers unlock all 8 components, deeper analytics, the Bullpen Fatigue Tracker, and eventually fantasy league sync. Pro is £4/month or £40/year for our first 100 founding members, then £6/month or £60/year.',
      },
    ],
  },
  {
    section: 'The Data',
    items: [
      {
        q: 'Why xFIP and not ERA for pitchers?',
        a: 'ERA includes things a pitcher can\'t control — a ball through a fielder\'s legs, a blooper that falls in. xFIP strips those out, leaving only the stuff the pitcher actually controls: strikeouts, walks, and fly balls that leave the yard. It\'s a much better predictor of future performance than ERA, which is why we use it as the base for our Starting Pitching component.',
      },
      {
        q: 'How current is the data?',
        a: 'We refresh multiple times daily. The main prediction run happens 10:00 UTC (early UK morning), with lineup confirmations updated at 14:00, 17:00, and 20:00 UTC. We flag when lineups are confirmed vs. projected so you always know what you\'re looking at.',
      },
      {
        q: 'Can the data be wrong?',
        a: 'Yes, and we\'re transparent about it. We have a public Track Record page that logs every prediction with win/loss results. We also include a "Why We Might Be Wrong" section on each game page — a genuine counter-take on our own analysis. No model is perfect. Ours is a starting point for your own thinking, not gospel.',
      },
    ],
  },
  {
    section: 'Gambling & Legal',
    items: [
      {
        q: 'Is this a gambling tip site?',
        a: 'No. x9Lab is an information-only platform. We provide statistical analysis for educational and entertainment purposes. We do not give gambling advice, picks, or recommendations of any kind. Our Edge Score is an analytical tool — not a betting line. We deliberately avoid betting language in all our content.',
      },
      {
        q: 'Can I use x9Lab to inform bets?',
        a: 'We can\'t stop you reading our analysis and making your own decisions — that\'s your right. But x9Lab does not endorse, encourage, or facilitate gambling. If you choose to gamble, please do so responsibly. The UK\'s GamCare (gamcare.org.uk) and BeGambleAware (begambleaware.org) offer free support.',
      },
      {
        q: 'Is x9Lab affiliated with MLB, any team, or any sportsbook?',
        a: 'No. We are entirely independent. Team names and league names are trademarks of their respective owners — we use them for informational reference only. We are not sponsored by, affiliated with, or endorsed by any professional sports league, team, or gambling operator.',
      },
    ],
  },
  {
    section: 'Account & Pro',
    items: [
      {
        q: 'How do I sign up?',
        a: 'Drop your email on the homepage. We\'ll send a one-click verification link — no password needed. Pick which teams you follow and you\'re in. Takes about 30 seconds.',
      },
      {
        q: 'When does Pro launch?',
        a: 'We\'re targeting June 1, 2026. If you\'re reading this before then, get on the waitlist and we\'ll notify you the moment Pro goes live. Early subscribers will get a launch discount.',
      },
      {
        q: 'Can I cancel Pro?',
        a: 'Yes, any time. No cancellation fees, no awkward forms. If you cancel, you keep Pro access until the end of your billing period.',
      },
      {
        q: 'Do you store my payment details?',
        a: 'We use Stripe for payments — an industry-standard processor used by millions of businesses. Your card details never touch our servers. Stripe holds them securely under PCI-DSS compliance.',
      },
    ],
  },
]

export default function FAQPage() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <FAQSchema items={FAQS.flatMap(sec => sec.items.map(i => ({ question: i.q, answer: i.a })))} />
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'FAQ', path: '/faq' }]} />
      <SiteHeader variant="page" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">

        {/* Back link */}
        <Link href="/" className="text-xs font-mono uppercase tracking-widest text-orange-600 hover:underline">
          ← Back to home
        </Link>

        {/* Hero */}
        <div className="mt-8 mb-14 border-b border-stone-200 pb-10">
          <div className="text-xs font-mono uppercase tracking-widest text-orange-600 mb-3">
            — Frequently asked questions
          </div>
          <h1 className="text-5xl md:text-6xl font-serif font-light tracking-tight leading-none mb-4">
            FAQ.
          </h1>
          <p className="text-lg text-stone-600 font-serif leading-relaxed max-w-xl">
            What x9Lab is, how the data works, and — importantly — what it isn&apos;t.
          </p>
        </div>

        {/* FAQ sections */}
        <div className="space-y-14">
          {FAQS.map((section) => (
            <div key={section.section}>
              {/* Section label */}
              <div className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-6">
                {section.section}
              </div>

              {/* Questions */}
              <div className="space-y-8">
                {section.items.map((item) => (
                  <div key={item.q} className="border-b border-stone-100 pb-8 last:border-0">
                    <h2 className="font-serif font-semibold text-lg text-stone-900 mb-2 leading-snug">
                      {item.q}
                    </h2>
                    <p className="text-stone-600 leading-relaxed text-[15px]">
                      {item.a}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer CTA */}
        <div className="mt-16 p-8 bg-stone-900 text-stone-100">
          <div className="text-xs font-mono uppercase tracking-widest text-orange-400 mb-3">
            — Still have a question?
          </div>
          <h3 className="text-2xl font-serif font-semibold mb-2">
            We&apos;re a small team. We read everything.
          </h3>
          <p className="text-stone-400 text-sm mb-5 font-serif">
            If your question isn&apos;t answered above, drop us an email.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-block text-xs font-mono uppercase tracking-widest bg-yellow-300 text-stone-900 px-5 py-3 hover:bg-yellow-200 transition font-semibold"
          >
            {CONTACT_EMAIL}
          </a>
        </div>

        {/* Legal note */}
        <p className="text-center text-[11px] font-mono text-stone-400 mt-8 uppercase tracking-wider">
          x9Lab · Information only · Not gambling advice ·{' '}
          <Link href="/terms" className="hover:text-stone-600 transition">Terms</Link>
          {' · '}
          <Link href="/privacy" className="hover:text-stone-600 transition">Privacy</Link>
        </p>
      </div>
    </main>
  )
}
