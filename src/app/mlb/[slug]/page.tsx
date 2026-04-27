import {
  getScheduleForDate,
  slugifyGame,
  shortName,
  getPitcherRecentStarts,
  getPitcherSeasonStats,
  getGameWeather,
  type MLBGame
} from '@/lib/mlb'
import { getVenueInfo } from '@/lib/venues'
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
// Fetch pitcher data in parallel (faster than sequential)
  const awayPitcherId = game.teams.away.probablePitcher?.id
  const homePitcherId = game.teams.home.probablePitcher?.id
const venue = getVenueInfo(game.venue?.name)

  const [
    awayRecentStarts,
    homeRecentStarts,
    awaySeasonStats,
    homeSeasonStats,
    weather,
  ] = await Promise.all([
    awayPitcherId ? getPitcherRecentStarts(awayPitcherId, 5) : Promise.resolve([]),
    homePitcherId ? getPitcherRecentStarts(homePitcherId, 5) : Promise.resolve([]),
    awayPitcherId ? getPitcherSeasonStats(awayPitcherId) : Promise.resolve(null),
    homePitcherId ? getPitcherSeasonStats(homePitcherId) : Promise.resolve(null),
    venue && !venue.indoor
      ? getGameWeather(venue.lat, venue.lon, game.gameDate)
      : Promise.resolve(null),
  ])
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

        {/* PITCHING MATCHUP */}
        {(awayPitcherId || homePitcherId) && (
          <section className="my-16 border-t border-b border-stone-300 py-12">
            <div className="text-xs font-mono uppercase tracking-widest text-orange-600 mb-2">
              § Pitching Matchup
            </div>
            <h2 className="text-3xl font-serif font-light tracking-tight mb-8">
              The arms tonight.
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
              {/* AWAY PITCHER */}
              {game.teams.away.probablePitcher && (
                <div>
                  <div className="text-xs uppercase tracking-widest text-stone-500 mb-2">
                    {shortName(game.teams.away.team.name)} · {awaySeasonStats?.wins ?? '–'}–{awaySeasonStats?.losses ?? '–'}
                  </div>
                  <h3 className="text-2xl font-serif font-semibold mb-6">
                    {game.teams.away.probablePitcher.fullName}
                  </h3>

                  {awaySeasonStats && (
                    <div className="grid grid-cols-3 gap-4 mb-6 pb-6 border-b border-stone-200">
                      <div>
                        <div className="text-3xl font-serif font-semibold tracking-tight">{awaySeasonStats.era}</div>
                        <div className="text-xs uppercase tracking-wider text-stone-500 mt-1">ERA</div>
                      </div>
                      <div>
                        <div className="text-3xl font-serif font-semibold tracking-tight">{awaySeasonStats.whip}</div>
                        <div className="text-xs uppercase tracking-wider text-stone-500 mt-1">WHIP</div>
                      </div>
                      <div>
                        <div className="text-3xl font-serif font-semibold tracking-tight">{awaySeasonStats.k_per_9}</div>
                        <div className="text-xs uppercase tracking-wider text-stone-500 mt-1">K/9</div>
                      </div>
                    </div>
                  )}

                  {awayRecentStarts.length > 0 && (
                    <div>
                      <div className="text-xs uppercase tracking-widest text-stone-500 mb-3 font-mono">
                        Last {awayRecentStarts.length} Starts
                      </div>
                      <table className="w-full text-sm font-mono">
                        <thead>
                          <tr className="text-stone-400 text-xs uppercase tracking-wider">
                            <th className="text-left pb-2 font-normal">Date</th>
                            <th className="text-left pb-2 font-normal">Opp</th>
                            <th className="text-right pb-2 font-normal">IP</th>
                            <th className="text-right pb-2 font-normal">ER</th>
                            <th className="text-right pb-2 font-normal">K</th>
                            <th className="text-right pb-2 font-normal">Res</th>
                          </tr>
                        </thead>
                        <tbody>
                          {awayRecentStarts.map((g, i) => (
                            <tr key={i} className="border-t border-stone-200">
                              <td className="py-2 text-stone-600">{new Date(g.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</td>
                              <td className="py-2 text-stone-700">{shortName(g.opponent)}</td>
                              <td className="py-2 text-right">{g.ip}</td>
                              <td className="py-2 text-right">{g.er}</td>
                              <td className="py-2 text-right">{g.so}</td>
                              <td className={`py-2 text-right font-semibold ${
                                g.result === 'W' ? 'text-green-700' : g.result === 'L' ? 'text-red-700' : 'text-stone-500'
                              }`}>{g.result}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* HOME PITCHER */}
              {game.teams.home.probablePitcher && (
                <div>
                  <div className="text-xs uppercase tracking-widest text-stone-500 mb-2">
                    {shortName(game.teams.home.team.name)} · {homeSeasonStats?.wins ?? '–'}–{homeSeasonStats?.losses ?? '–'}
                  </div>
                  <h3 className="text-2xl font-serif font-semibold mb-6">
                    {game.teams.home.probablePitcher.fullName}
                  </h3>

                  {homeSeasonStats && (
                    <div className="grid grid-cols-3 gap-4 mb-6 pb-6 border-b border-stone-200">
                      <div>
                        <div className="text-3xl font-serif font-semibold tracking-tight">{homeSeasonStats.era}</div>
                        <div className="text-xs uppercase tracking-wider text-stone-500 mt-1">ERA</div>
                      </div>
                      <div>
                        <div className="text-3xl font-serif font-semibold tracking-tight">{homeSeasonStats.whip}</div>
                        <div className="text-xs uppercase tracking-wider text-stone-500 mt-1">WHIP</div>
                      </div>
                      <div>
                        <div className="text-3xl font-serif font-semibold tracking-tight">{homeSeasonStats.k_per_9}</div>
                        <div className="text-xs uppercase tracking-wider text-stone-500 mt-1">K/9</div>
                      </div>
                    </div>
                  )}
                  {homeRecentStarts.length > 0 && (
                    <div>
                      <div className="text-xs uppercase tracking-widest text-stone-500 mb-3 font-mono">
                        Last {homeRecentStarts.length} Starts
                      </div>
                      <table className="w-full text-sm font-mono">
                        <thead>
                          <tr className="text-stone-400 text-xs uppercase tracking-wider">
                            <th className="text-left pb-2 font-normal">Date</th>
                            <th className="text-left pb-2 font-normal">Opp</th>
                            <th className="text-right pb-2 font-normal">IP</th>
                            <th className="text-right pb-2 font-normal">ER</th>
                            <th className="text-right pb-2 font-normal">K</th>
                            <th className="text-right pb-2 font-normal">Res</th>
                          </tr>
                        </thead>
                        <tbody>
                          {homeRecentStarts.map((g, i) => (
                            <tr key={i} className="border-t border-stone-200">
                              <td className="py-2 text-stone-600">{new Date(g.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</td>
                              <td className="py-2 text-stone-700">{shortName(g.opponent)}</td>
                              <td className="py-2 text-right">{g.ip}</td>
                              <td className="py-2 text-right">{g.er}</td>
                              <td className="py-2 text-right">{g.so}</td>
                              <td className={`py-2 text-right font-semibold ${
                                g.result === 'W' ? 'text-green-700' : g.result === 'L' ? 'text-red-700' : 'text-stone-500'
                              }`}>{g.result}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
{/* CONDITIONS */}
        {(weather || venue?.indoor) && (
          <section className="my-16 border-t border-b border-stone-300 py-12">
            <div className="text-xs font-mono uppercase tracking-widest text-orange-600 mb-2">
              § Conditions
            </div>
            <h2 className="text-3xl font-serif font-light tracking-tight mb-8">
              {venue?.indoor ? 'Indoors tonight.' : 'Game-time forecast.'}
            </h2>

            {venue?.indoor ? (
              <p className="text-lg text-stone-600 font-serif leading-relaxed">
                Climate-controlled. Roof closed. Weather is not a factor.
              </p>
            ) : weather ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                  <div>
                    <div className="text-4xl font-serif font-semibold tracking-tight">
                      {weather.temp_f}°
                      <span className="text-stone-400 text-2xl font-light">F</span>
                    </div>
                    <div className="text-xs uppercase tracking-wider text-stone-500 mt-2">
                      Temp · feels {weather.feels_like_f}°
                    </div>
                  </div>

                  <div>
                    <div className="text-4xl font-serif font-semibold tracking-tight flex items-baseline gap-2">
                      {weather.wind_mph}
                      <span className="text-stone-400 text-base font-mono">mph</span>
                    </div>
                    <div className="text-xs uppercase tracking-wider text-stone-500 mt-2">
                      Wind · from {weather.wind_direction_text}
                    </div>
                  </div>

                  <div>
                    <div className="text-4xl font-serif font-semibold tracking-tight">
                      {weather.precipitation_chance}
                      <span className="text-stone-400 text-2xl font-light">%</span>
                    </div>
                    <div className="text-xs uppercase tracking-wider text-stone-500 mt-2">
                      Precipitation
                    </div>
                  </div>

                  <div>
                    <div className="text-4xl font-serif font-semibold tracking-tight">
                      {weather.cloud_cover}
                      <span className="text-stone-400 text-2xl font-light">%</span>
                    </div>
                    <div className="text-xs uppercase tracking-wider text-stone-500 mt-2">
                      Cloud cover
                    </div>
                  </div>
                </div>

                <p className="text-stone-600 font-serif italic">
                  {weather.conditions}
                  {venue?.city && ` in ${venue.city}`} at first pitch.
                </p>
              </>
            ) : null}
          </section>
        )}
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