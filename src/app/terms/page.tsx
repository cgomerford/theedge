export const metadata = pageMeta({
  title: 'Terms of use',
  description:
    'The terms for using x9Lab: what the site provides, how its data may be used, and the limits on our responsibility for the information shown.',
  path: '/terms',
})

import SiteHeader from '@/components/SiteHeader'
import { CONTACT_EMAIL } from '@/lib/site'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'Terms', path: '/terms' }]} />
      <SiteHeader variant="page" />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <a href="/" className="text-xs font-mono uppercase tracking-widest text-orange-600 hover:underline">
          ← Back to home
        </a>

        <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight mt-8 mb-2">
          Terms of Use
        </h1>
        <p className="text-sm text-stone-500 font-mono mb-12">Last updated: April 27, 2026</p>

        <div className="space-y-8 text-stone-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3">What this is</h2>
            <p>
              x9Lab is a free informational service that publishes statistical analysis of sporting events. By using this site or subscribing to our emails, you agree to these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3">Information only</h2>
            <p>
              x9Lab provides statistical information and analysis for educational and entertainment purposes. We do not provide gambling advice, picks, recommendations, or financial advice of any kind. Any decisions you make based on information from x9Lab are entirely your own. We are not liable for any losses, financial or otherwise, resulting from use of our content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3">Data accuracy</h2>
            <p>
              We pull data from official and reputable sources and do our best to ensure accuracy, but data may be delayed, incomplete, or contain errors. Always verify important information against primary sources.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3">Acceptable use</h2>
            <p>
              You may use x9Lab for personal, non-commercial purposes. You may not scrape, redistribute, or republish our content (paid or otherwise) without permission. You may share individual pages or quote briefly with attribution.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3">Trademarks & data sources</h2>
            <p>
              Team names, league names, and player names are trademarks of their respective owners. x9Lab is not affiliated with, endorsed by, or sponsored by any professional sports league or team. All third-party trademarks are used for informational reference only.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3">Termination</h2>
            <p>
              We may suspend or terminate access to the service at any time, for any reason, without notice. You can stop using the service at any time by unsubscribing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3">Changes</h2>
            <p>
              We may update these terms from time to time. Material changes will be communicated to subscribers by email.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3">Contact</h2>
            <p>
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-orange-600 hover:underline">{CONTACT_EMAIL}</a>
            </p>
          </section>

        </div>
      </div>
    </main>
  )
}