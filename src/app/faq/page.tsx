import SiteHeader from '@/components/SiteHeader'
import Link from 'next/link'
import { CONTACT_EMAIL } from '@/lib/site'
import { pageMeta } from '@/lib/seo'
import { FAQSchema, BreadcrumbSchema } from '@/components/StructuredData'

export const metadata = pageMeta({
  title: 'FAQ',
  description:
    'Answers to common questions about x9Lab: what the site shows, how often the numbers update, and what a free account includes. Short answers, no jargon.',
  path: '/faq',
})

const FAQS = [
  {
    section: 'What is x9Lab',
    items: [
      { q: 'What is x9Lab?', a: 'x9Lab turns public MLB game data into plain-number breakdowns of players, pitchers and games, with the sample size shown beside every stat.' },
      { q: 'Who is it for?', a: "Fans who want more than a box score. You don't need to be a data scientist: the numbers come with plain labels and their sample sizes." },
      { q: 'Is x9Lab free?', a: 'Yes. A free account gets the scout report summary and recap, follows for up to 10 players and 3 teams, the free Batting Lab tabs, live games and one full deep look a day. Pro opens every deep module.' },
    ],
  },
  {
    section: 'The data',
    items: [
      { q: 'How current is the data?', a: 'Game data refreshes through the day. Pitch-level pages carry a "Through" date showing the latest game in the data.' },
      { q: 'Can the data be wrong?', a: 'Yes. Small samples especially can mislead, which is why every stat shows its n and small samples are labelled instead of shown as a number.' },
    ],
  },
  {
    section: 'Betting and legal',
    items: [
      { q: 'Is this for betting?', a: "No. It's information about how players and pitchers perform. Nothing more." },
      { q: 'Is x9Lab affiliated with MLB, any team, or any sportsbook?', a: 'No. We are entirely independent. Team and league names are trademarks of their owners and are used for reference only.' },
    ],
  },
  {
    section: 'Account',
    items: [
      { q: 'How do I sign up?', a: "Create a free account with your email. We send a one-click sign-in link; there's no password." },
      { q: 'Can I cancel?', a: 'Yes, any time, from your account page. You keep access until the end of your billing period.' },
      { q: 'Do you store my payment details?', a: 'No. Payments run through Stripe; your card details never touch our servers.' },
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
