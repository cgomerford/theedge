export const metadata = {
  title: "Privacy Policy · The Edge",
  description: "How we handle your data.",
}
import SiteHeader from '@/components/SiteHeader'
export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <SiteHeader variant="page" />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <a href="/" className="text-xs font-mono uppercase tracking-widest text-orange-600 hover:underline">
          ← Back to home
        </a>

        <h1 className="text-4xl md:text-5xl font-serif font-light tracking-tight mt-8 mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-stone-500 font-mono mb-12">Last updated: April 27, 2026</p>

        <div className="space-y-8 text-stone-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3">What we collect</h2>
            <p>
              When you sign up to The Edge, we collect your email address and which sports/teams you choose to follow. We do not ask for your name, location, or any other identifying information. If you contact us by email, we&apos;ll have a record of that conversation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3">How we use it</h2>
            <p>
              Your email is used solely to send you the daily brief and occasional updates about The Edge (e.g., a new sport launching). We do not sell, rent, or share your email with third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3">Cookies & analytics</h2>
            <p>
              We use minimal, privacy-respecting analytics (no third-party tracking pixels, no advertising cookies) to understand which content is read most. We do not use cookies to identify individuals across sessions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3">Where data is stored</h2>
            <p>
              Subscriber data is stored on Supabase (a US/EU-based hosting provider). The Edge is hosted on Vercel. Email delivery is handled by Resend. All providers are GDPR and CCPA compliant.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3">Your rights</h2>
            <p>
              You can unsubscribe at any time using the link at the bottom of every email. To request deletion of your data entirely, email <a href="mailto:hello@edgereportdaily.com" className="text-orange-600 hover:underline">hello@edgereportdaily.com</a> and we&apos;ll process it within 7 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3">Children</h2>
            <p>
              The Edge is not directed at children under 13. We do not knowingly collect data from children. If we learn we have, we&apos;ll delete it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3">Changes</h2>
            <p>
              If we make material changes to this policy, we&apos;ll email subscribers and update the date at the top of this page.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3">Contact</h2>
            <p>
              Questions about this policy: <a href="mailto:hello@edgereportdaily.com" className="text-orange-600 hover:underline">hello@edgereportdaily.com</a>
            </p>
          </section>

        </div>
      </div>
    </main>
  )
}