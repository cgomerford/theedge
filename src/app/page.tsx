import { getScheduleForDate, slugifyGame, shortName } from '@/lib/mlb'
import Link from 'next/link'

export const revalidate = 1800

export default async function HomePage() {
  const today = new Date().toISOString().split('T')[0]
  const games = await getScheduleForDate(today)

  return (
    <main className="min-h-screen bg-stone-950 text-stone-100">
      <nav className="border-b border-stone-800 px-6 py-5 flex justify-between items-center">
        <div className="font-serif font-black text-2xl tracking-tight flex items-center gap-2">
          The Edge<span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
        </div>
        <a href="#signup" className="bg-stone-100 text-stone-900 px-4 py-2 text-sm font-semibold">
          Get tonight&apos;s brief
        </a>
      </nav>

      <section className="px-6 py-24 max-w-5xl mx-auto">
        <div className="text-xs font-mono uppercase tracking-widest text-orange-500 mb-6">
          — Issue 001
        </div>
        <h1 className="text-6xl md:text-8xl font-serif font-light leading-none tracking-tight mb-8">
          The pre-game brief<br />
          for the{' '}
          <em className="italic text-yellow-300 font-normal">analytics era.</em>
        </h1>
        <p className="text-xl text-stone-400 mb-10 max-w-2xl leading-relaxed font-light">
          Statcast, advanced metrics, and the data that explains tonight&apos;s game — distilled into a five-minute read, three hours before first pitch.
        </p>

        <form id="signup" action="/api/subscribe" method="POST" className="flex gap-2 max-w-md flex-col sm:flex-row mb-3">
          <input type="hidden" name="source" value="home" />
          <input
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="flex-1 px-4 py-4 bg-stone-900 border border-stone-800 text-stone-100 outline-none focus:border-stone-600"
          />
          <button type="submit" className="px-6 py-4 bg-stone-100 text-stone-900 font-semibold hover:bg-yellow-300 transition">
            Get the brief →
          </button>
        </form>
        <div className="text-xs text-stone-500 font-mono">No spam. Unsubscribe anytime.</div>
      </section>

      <section className="px-6 py-16 border-t border-stone-800">
        <div className="max-w-5xl mx-auto">
          <div className="text-xs font-mono uppercase tracking-widest text-orange-500 mb-2">
            § Tonight in MLB
          </div>
          <h2 className="text-4xl font-serif font-light mb-12">
            {games.length > 0 ? `${games.length} games on the slate.` : 'No games today.'}
          </h2>

          {games.length > 0 && (
            <div className="grid md:grid-cols-2 gap-px bg-stone-800 border border-stone-800">
              {games.map((game) => (
                <Link
                  key={game.gamePk}
                  href={`/mlb/${slugifyGame(game)}`}
                  className="bg-stone-950 p-6 hover:bg-stone-900 transition group"
                >
                  <div className="text-xs font-mono uppercase tracking-wider text-stone-500 mb-3">
                    {new Date(game.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
                    {' · '}{game.venue?.name}
                  </div>
                  <div className="text-2xl font-serif font-medium mb-1">
                    {shortName(game.teams.away.team.name)}
                    <span className="text-stone-600 italic font-light"> at </span>
                    {shortName(game.teams.home.team.name)}
                  </div>
                  {(game.teams.away.probablePitcher || game.teams.home.probablePitcher) && (
                    <div className="text-sm text-stone-500 mt-2 font-mono">
                      {game.teams.away.probablePitcher?.fullName ?? 'TBD'}
                      {' vs '}
                      {game.teams.home.probablePitcher?.fullName ?? 'TBD'}
                    </div>
                  )}
                  <div className="text-xs text-orange-500 mt-4 font-mono group-hover:text-yellow-300 transition">
                    Read the preview →
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="px-6 py-12 border-t border-stone-800 text-xs text-stone-500 font-mono">
        <div className="max-w-5xl mx-auto">
          <div className="mb-4">
            © 2026 The Edge · Game data via official MLB Stats API
          </div>
          <div className="text-stone-600 leading-relaxed max-w-2xl">
            The Edge provides information and statistical analysis only. We do not provide gambling advice, picks, or recommendations. All decisions are yours alone.
          </div>
        </div>
      </footer>
    </main>
  )
}