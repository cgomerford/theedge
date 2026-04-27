import { getScheduleForDate, slugifyGame, shortName, type MLBGame } from '@/lib/mlb'
import { createAdminClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'

export const revalidate = 1800

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})$/)
  const date = dateMatch ? dateMatch[1] : ''
  const title = slug.replace(/-/g, ' ').replace(date, '').trim()

  return {
    title: `${title} preview · The Edge`,
    description: `Pre-game data, lineups, and matchup analysis. Powered by official MLB Stats.`,
  }
}

export default async function GamePreview({ params }: Props) {
  const { slug } = await params
  const supa = createAdminClient()

  // Try cache first
  const { data: cached } = await supa
    .from('game_previews')
    .select('*')
    .eq('slug', slug)
    .single()

  let game: MLBGame | null = null

  if (cached?.raw_data) {
    game = cached.raw_data as MLBGame
  } else {
    const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})$/)
    if (!dateMatch) notFound()
    const games = await getScheduleForDate(dateMatch[1])
    game = games.find(g => slugifyGame(g) === slug) ?? null
    if (!game) notFound()

    await supa.from('game_previews').upsert({
      slug,
      league: 'mlb',
      game_date: dateMatch[1],
      home_team: game.teams.home.team.name,
      away_team: game.teams.away.team.name,
      home_team_id: game.teams.home.team.id,
      away_team_id: game.teams.away.team.id,
      game_time: game.gameDate,
      venue: game.venue?.name,
      status: game.status?.detailedState,
      raw_data: game,
    }, { onConflict: 'slug' })
  }

  const gameTime = new Date(game.gameDate).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  })
  const gameDate = new Date(game.gameDate).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-xs font-mono uppercase tracking-widest text-orange-600 mb-4">
          MLB · {gameDate} · {game.venue?.name}
        </div>

        <h1 className="text-5xl md:text-7xl font-serif font-light leading-none tracking-tight mb-2">
          {shortName(game.teams.away.team.name)}
        </h1>
        <div className="text-3xl md:text-4xl font-serif italic font-light text-stone-400 mb-2">
          at
        </div>
        <h1 className="text-5xl md:text-7xl font-serif font-light leading-none tracking-tight mb-12">
          {shortName(game.teams.home.team.name)}
        </h1>

        <div className="grid grid-cols-2 gap-6 py-8 border-y border-stone-300 my-8">
          <div>
            <div className="text-xs uppercase tracking-widest text-stone-500 mb-2">Away</div>
            <div className="text-2xl font-serif font-bold mb-1">{game.teams.away.team.name}</div>
            {game.teams.away.leagueRecord && (
              <div className="text-sm font-mono text-stone-500">
                {game.teams.away.leagueRecord.wins}–{game.teams.away.leagueRecord.losses}
              </div>
            )}
            {game.teams.away.probablePitcher && (
              <div className="text-sm mt-3">
                <span className="text-stone-500">SP: </span>
                <span className="font-medium">{game.teams.away.probablePitcher.fullName}</span>
              </div>
            )}
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-stone-500 mb-2">Home</div>
            <div className="text-2xl font-serif font-bold mb-1">{game.teams.home.team.name}</div>
            {game.teams.home.leagueRecord && (
              <div className="text-sm font-mono text-stone-500">
                {game.teams.home.leagueRecord.wins}–{game.teams.home.leagueRecord.losses}
              </div>
            )}
            {game.teams.home.probablePitcher && (
              <div className="text-sm mt-3">
                <span className="text-stone-500">SP: </span>
                <span className="font-medium">{game.teams.home.probablePitcher.fullName}</span>
              </div>
            )}
          </div>
        </div>

        <p className="text-lg text-stone-700 mb-12">
          First pitch: <strong>{gameTime}</strong>. Status: <strong>{game.status?.detailedState}</strong>.
        </p>

        <div className="bg-stone-900 text-stone-100 p-8 my-12">
          <div className="text-xs font-mono uppercase tracking-widest text-yellow-300 mb-3">
            Get the full pre-game brief
          </div>
          <h2 className="text-2xl font-serif mb-3">
            Five-minute reads. Three hours before first pitch.
          </h2>
          <p className="text-stone-400 mb-6 text-sm">
            Pick your teams. We send the data, the storylines, and the matchups that matter.
          </p>
          <form action="/api/subscribe" method="POST" className="flex gap-2 flex-col sm:flex-row">
            <input type="hidden" name="source" value={`mlb/${slug}`} />
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

        <div className="text-xs text-stone-500 leading-relaxed border-t border-stone-200 pt-6 mt-12">
          Game data via the official MLB Stats API. The Edge provides information and statistical analysis only.
          We do not provide gambling advice, picks, or recommendations. All decisions are yours alone.
        </div>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SportsEvent',
              name: `${game.teams.away.team.name} at ${game.teams.home.team.name}`,
              startDate: game.gameDate,
              location: { '@type': 'Place', name: game.venue?.name },
              homeTeam: { '@type': 'SportsTeam', name: game.teams.home.team.name },
              awayTeam: { '@type': 'SportsTeam', name: game.teams.away.team.name },
              sport: 'Baseball',
            })
          }}
        />
      </div>
    </main>
  )
}