import SiteHeader from '@/components/SiteHeader'
import Link from 'next/link'

export const metadata = {
  title: "How it works · The Edge",
  description: "Three steps. Five minutes. Three hours before first pitch.",
}

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <SiteHeader variant="page" />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="text-xs font-mono uppercase tracking-widest text-orange-600 hover:underline">
          ← Back to home
        </Link>

        <h1 className="text-5xl md:text-6xl font-serif font-light tracking-tight mt-8 mb-16">
          How it works.
        </h1>

        <div className="space-y-20">
          {/* Step 1 */}
          <div>
            <div className="text-7xl font-serif font-light text-yellow-500 leading-none mb-4">01</div>
            <h2 className="text-3xl font-serif font-semibold mb-3">You sign up.</h2>
            <p className="text-lg leading-relaxed text-stone-700 font-serif">
              Drop your email. Pick which teams you follow. Takes thirty seconds. No credit card, no trial, nothing to cancel.
            </p>
          </div>

          {/* Step 2 - Expanded with model details */}
          <div>
            <div className="text-7xl font-serif font-light text-yellow-500 leading-none mb-4">02</div>
            <h2 className="text-3xl font-serif font-semibold mb-3">We do the work.</h2>
            <p className="text-lg leading-relaxed text-stone-700 font-serif mb-8">
              Three hours before first pitch, our system pulls Statcast data, advanced metrics, lineups, weather, and line movement. 
              Then it surfaces the factors that will actually matter tonight.
            </p>

            <div className="bg-white border border-stone-200 rounded-2xl p-8 mb-10">
              <h3 className="font-serif text-xl mb-6 flex items-center gap-3">
                <span className="text-yellow-500">The Matchup Tilt Model</span>
              </h3>
              <p className="text-stone-600 mb-8">
                We built a proprietary 8-factor model that compares the two teams across every dimension that drives outcomes. 
                Each factor produces a <span className="font-medium">Tilt score</span> (-100 to +100) showing which side has the edge.
              </p>

              <div className="grid md:grid-cols-2 gap-6 text-sm">
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-orange-500 flex-shrink-0" />
                    <div>
                      <div className="font-medium">Starting Pitching</div>
                      <div className="text-stone-500">ERA, FIP, K/9, recent form, arsenal vs lineups</div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-orange-500 flex-shrink-0" />
                    <div>
                      <div className="font-medium">Bullpen</div>
                      <div className="text-stone-500">Freshness, ERA, K/9, closer availability</div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-orange-500 flex-shrink-0" />
                    <div>
                      <div className="font-medium">Offense</div>
                      <div className="text-stone-500">R/G, OPS, power, plate discipline (last 30 days)</div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-orange-500 flex-shrink-0" />
                    <div>
                      <div className="font-medium">Pitcher-Batter Matchups</div>
                      <div className="text-stone-500">GB rate, platoon splits, recent strikeout ability</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-orange-500 flex-shrink-0" />
                    <div>
                      <div className="font-medium">Park Factors</div>
                      <div className="text-stone-500">HR/run multipliers, dome status</div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-orange-500 flex-shrink-0" />
                    <div>
                      <div className="font-medium">Weather</div>
                      <div className="text-stone-500">Temperature, wind direction + speed</div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-orange-500 flex-shrink-0" />
                    <div>
                      <div className="font-medium">Defense</div>
                      <div className="text-stone-500">OAA, DRS, infield/outfield reliability</div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-orange-500 flex-shrink-0" />
                    <div>
                      <div className="font-medium">Rest &amp; Travel</div>
                      <div className="text-stone-500">Back-to-back, travel miles, schedule fatigue</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-lg leading-relaxed text-stone-700 font-serif">
              The result is a clean, brief that surfaces the few factors that will actually move the needle tonight. We are contstantly improving the model and adding new data sources, so improve the accuracy of our reads and expand the range of actionable insights we can provide.
            </p>
          </div>

          {/* Step 3 */}
         <div>
 
  <div className="text-7xl font-serif font-light text-yellow-500 leading-none mb-4">03</div>
  <h2 className="text-3xl font-serif font-semibold mb-3">You watch smarter.</h2>
  
  <p className="text-lg leading-relaxed text-stone-700 font-serif">
    We use Claude AI to transform the raw Matchup Tilt data into a sharp, insightful narrative — 
    like getting a text from a friend who’s done all the homework. 
    Every morning at <span className="font-medium text-stone-900">8:00 AM ET</span> (1:00 PM GMT), 
    you’ll receive a concise 5-minute email with the real story behind the matchup.
  </p>

  <p className="text-lg leading-relaxed text-stone-700 font-serif mt-5">
    The free version gives you a strong daily edge.  
    <strong> Pro Members</strong> unlocks deeper stats, full sub-factor breakdowns, 
    multiple team coverage, fantasy insights, and early access to new features.
  </p>

  <p className="mt-6">
    <a 
      href="/pricing" 
      className="inline-flex items-center gap-2 text-orange-600 hover:text-orange-700 font-medium group"
    >
      See Pro benefits and pricing →
      <span className="group-hover:translate-x-0.5 transition">→</span>
    </a>
  </p>
</div>
        </div>

        {/* CTA */}
        <div className="mt-24 p-8 bg-stone-900 text-stone-100 rounded-3xl">
          <h3 className="text-2xl font-serif mb-3">Ready to try it?</h3>
          <p className="text-stone-400 mb-6 text-sm">Free. No credit card.</p>
          <form action="/api/subscribe" method="POST" className="flex gap-2 flex-col sm:flex-row">
            <input type="hidden" name="source" value="how-it-works" />
            <input
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="flex-1 px-4 py-3 bg-stone-100 text-stone-900 border-0 outline-none rounded-xl"
            />
            <button 
              type="submit" 
              className="px-8 py-3 bg-yellow-300 text-stone-900 font-semibold hover:bg-yellow-200 transition rounded-xl whitespace-nowrap"
            >
              Get the brief →
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}