import SiteHeader from '@/components/SiteHeader'

export const metadata = {
  title: "How it works · The Edge",
  description: "Three steps. Five minutes. Three hours before first pitch.",
}

export default function HowItWorksPage() {
  return (
   <main className="min-h-screen bg-stone-50 text-stone-900">
      <SiteHeader variant="page" />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <a href="/" className="text-xs font-mono uppercase tracking-widest text-orange-600 hover:underline">
          ← Back to home
        </a>

        <h1 className="text-5xl md:text-6xl font-serif font-light tracking-tight mt-8 mb-16">
          How it works.
        </h1>

        <div className="space-y-16">
          <div>
            <div className="text-7xl font-serif font-light text-yellow-500 leading-none mb-4">01</div>
            <h2 className="text-3xl font-serif font-semibold mb-3">You sign up.</h2>
            <p className="text-lg leading-relaxed text-stone-700 font-serif">
              Drop your email. Pick which teams you follow. Takes thirty seconds. No credit card, no trial, nothing to cancel.
            </p>
          </div>

          <div>
            <div className="text-7xl font-serif font-light text-yellow-500 leading-none mb-4">02</div>
            <h2 className="text-3xl font-serif font-semibold mb-3">We do the work.</h2>
            <p className="text-lg leading-relaxed text-stone-700 font-serif">
              Three hours before first pitch, our system pulls Statcast data, advanced metrics, lineups, weather, and line movement. Then it surfaces the things that will actually matter tonight — pitch mix changes, hot/cold splits, bullpen leverage, situational mismatches.
            </p>
          </div>

          <div>
            <div className="text-7xl font-serif font-light text-yellow-500 leading-none mb-4">03</div>
            <h2 className="text-3xl font-serif font-semibold mb-3">You watch smarter.</h2>
            <p className="text-lg leading-relaxed text-stone-700 font-serif">
              One email lands in your inbox. Five minutes to read. The story, the data, the matchups. No hot takes, no padding, no clickbait. Just the signal.
            </p>
          </div>
        </div>

        <div className="mt-20 p-8 bg-stone-900 text-stone-100">
          <h3 className="text-2xl font-serif mb-3">Ready to try it?</h3>
          <p className="text-stone-400 mb-6 text-sm">Free. No credit card.</p>
          <form action="/api/subscribe" method="POST" className="flex gap-2 flex-col sm:flex-row">
            <input type="hidden" name="source" value="how-it-works" />
            <input
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="flex-1 px-4 py-3 bg-stone-100 text-stone-900 border-0 outline-none"
            />
            <button type="submit" className="px-6 py-3 bg-yellow-300 text-stone-900 font-semibold hover:bg-yellow-200 transition">
              Get the brief →
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}