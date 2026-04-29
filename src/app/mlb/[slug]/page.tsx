import {
  getScheduleForDate,
  slugifyGame,
  shortName,
  getPitcherRecentStarts,
  getPitcherSeasonStats,
  getGameWeather,
  getPitchMix,
  pitchColor,
  getTeamForm,
  describeTeamForm,
  teamLogoUrl,
  playerHeadshotUrl,
  type MLBGame
} from '@/lib/mlb'
import { getVenueInfo, describeWindImpact } from '@/lib/venues'
import WeatherIcon from '@/components/WeatherIcon'
import WindArrow from '@/components/WindArrow'
import { createAdminClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'

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
    awayPitchMix,
    homePitchMix,
    awayForm,
    homeForm,
  ] = await Promise.all([
    awayPitcherId ? getPitcherRecentStarts(awayPitcherId, 5) : Promise.resolve([]),
    homePitcherId ? getPitcherRecentStarts(homePitcherId, 5) : Promise.resolve([]),
    awayPitcherId ? getPitcherSeasonStats(awayPitcherId) : Promise.resolve(null),
    homePitcherId ? getPitcherSeasonStats(homePitcherId) : Promise.resolve(null),
    venue && !venue.indoor
      ? getGameWeather(venue.lat, venue.lon, game.gameDate)
      : Promise.resolve(null),
    awayPitcherId ? getPitchMix(awayPitcherId) : Promise.resolve([]),
    homePitcherId ? getPitchMix(homePitcherId) : Promise.resolve([]),
    getTeamForm(game.teams.away.team.id),
    getTeamForm(game.teams.home.team.id),
  ])

  const gameTime = new Date(game.gameDate).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  })
  const gameDate = new Date(game.gameDate).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })

  return (
<main className="min-h-screen bg-stone-50 text-stone-900">
      <SiteHeader variant="page" />
      <div className="max-w-3xl mx-auto px-6 py-12">
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
            <div className="text-xs uppercase tracking-widest text-stone-500 mb-3">Away</div>
            <div className="flex items-center gap-3 mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={teamLogoUrl(game.teams.away.team.id)}
                alt={`${game.teams.away.team.name} logo`}
                className="w-12 h-12 object-contain"
              />
              <div className="text-2xl font-serif font-bold leading-tight">{game.teams.away.team.name}</div>
            </div>
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
            <div className="text-xs uppercase tracking-widest text-stone-500 mb-3">Home</div>
            <div className="flex items-center gap-3 mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={teamLogoUrl(game.teams.home.team.id)}
                alt={`${game.teams.home.team.name} logo`}
                className="w-12 h-12 object-contain"
              />
              <div className="text-2xl font-serif font-bold leading-tight">{game.teams.home.team.name}</div>
            </div>
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
{/* FORM GUIDE */}
        {(awayForm || homeForm) && (
          <section className="my-16 border-t border-b border-stone-300 py-12">
            <div className="text-xs font-mono uppercase tracking-widest text-orange-600 mb-2">
              § Form Guide
            </div>
            <h2 className="text-3xl font-serif font-light tracking-tight mb-8">
              How they&apos;re trending.
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
       {/* AWAY FORM */}
              {awayForm && (
                <div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-stone-500 mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={teamLogoUrl(game.teams.away.team.id)}
                      alt=""
                      className="w-5 h-5 object-contain"
                    />
                    {shortName(game.teams.away.team.name)}
                    {awayForm.streak && (
                      <span className={`ml-2 font-mono font-bold ${
                        awayForm.streak_type === 'W' ? 'text-green-700' :
                        awayForm.streak_type === 'L' ? 'text-red-700' : 'text-stone-600'
                      }`}>
                        {awayForm.streak}
                      </span>
                    )}
                  </div>
                  <p className="font-serif text-lg leading-snug mb-6 text-stone-800">
                    {describeTeamForm(awayForm, shortName(game.teams.away.team.name))}
                  </p>

                  <div className="grid grid-cols-3 gap-4 pb-4">
                    <div>
                      <div className="text-3xl font-serif font-semibold tracking-tight">
                        {awayForm.last_10_wins}–{awayForm.last_10_losses}
                      </div>
                      <div className="text-xs uppercase tracking-wider text-stone-500 mt-1">L10</div>
                    </div>
                    <div>
                      <div className="text-3xl font-serif font-semibold tracking-tight">
                        {awayForm.runs_per_game_l10}
                      </div>
                      <div className="text-xs uppercase tracking-wider text-stone-500 mt-1">Runs / G</div>
                    </div>
                    <div>
                      <div className={`text-3xl font-serif font-semibold tracking-tight ${
                        awayForm.run_diff_l10 > 0 ? 'text-green-700' :
                        awayForm.run_diff_l10 < 0 ? 'text-red-700' : ''
                      }`}>
                        {awayForm.run_diff_l10 > 0 ? '+' : ''}{awayForm.run_diff_l10}
                      </div>
                      <div className="text-xs uppercase tracking-wider text-stone-500 mt-1">Run Diff</div>
                    </div>
                  </div>
                </div>
              )}

          
            {/* HOME FORM */}
              {homeForm && (
                <div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-stone-500 mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={teamLogoUrl(game.teams.home.team.id)}
                      alt=""
                      className="w-5 h-5 object-contain"
                    />
                    {shortName(game.teams.home.team.name)}
                    {homeForm.streak && (
                      <span className={`ml-2 font-mono font-bold ${
                        homeForm.streak_type === 'W' ? 'text-green-700' :
                        homeForm.streak_type === 'L' ? 'text-red-700' : 'text-stone-600'
                      }`}>
                        {homeForm.streak}
                      </span>
                    )}
                  </div>
                  <p className="font-serif text-lg leading-snug mb-6 text-stone-800">
                    {describeTeamForm(homeForm, shortName(game.teams.home.team.name))}
                  </p>

                  <div className="grid grid-cols-3 gap-4 pb-4">
                    <div>
                      <div className="text-3xl font-serif font-semibold tracking-tight">
                        {homeForm.last_10_wins}–{homeForm.last_10_losses}
                      </div>
                      <div className="text-xs uppercase tracking-wider text-stone-500 mt-1">L10</div>
                    </div>
                    <div>
                      <div className="text-3xl font-serif font-semibold tracking-tight">
                        {homeForm.runs_per_game_l10}
                      </div>
                      <div className="text-xs uppercase tracking-wider text-stone-500 mt-1">Runs / G</div>
                    </div>
                    <div>
                      <div className={`text-3xl font-serif font-semibold tracking-tight ${
                        homeForm.run_diff_l10 > 0 ? 'text-green-700' :
                        homeForm.run_diff_l10 < 0 ? 'text-red-700' : ''
                      }`}>
                        {homeForm.run_diff_l10 > 0 ? '+' : ''}{homeForm.run_diff_l10}
                      </div>
                      <div className="text-xs uppercase tracking-wider text-stone-500 mt-1">Run Diff</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
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
                  <div className="flex items-center gap-4 mb-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={playerHeadshotUrl(game.teams.away.probablePitcher.id, 120)}
                      alt={game.teams.away.probablePitcher.fullName}
                      className="w-16 h-16 rounded-full object-cover bg-stone-100"
                    />
                    <h3 className="text-2xl font-serif font-semibold leading-tight">
                      {game.teams.away.probablePitcher.fullName}
                    </h3>
                  </div>

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

                 {awayPitchMix.length > 0 && (
                    <div className="mb-6 pb-6 border-b border-stone-200">
                      <div className="text-xs uppercase tracking-widest text-stone-500 mb-4 font-mono">
                        Pitch Arsenal · {new Date().getFullYear()}
                      </div>
                      <div className="space-y-3">
                        {awayPitchMix.slice(0, 5).map((p, i) => (
                          <div key={i}>
                            <div className="flex items-center gap-3 text-sm mb-1">
                              <div className="w-28 text-stone-800 font-medium truncate">{p.pitch_name}</div>
                              <div className="flex-1 h-5 bg-stone-100 relative">
                                <div
                                  className="h-full"
                                  style={{
                                    width: `${p.percentage}%`,
                                    backgroundColor: pitchColor(p.pitch_code)
                                  }}
                                />
                              </div>
                              <div className="w-12 text-right font-mono text-xs text-stone-600">{p.percentage.toFixed(1)}%</div>
                              {p.avg_velocity > 0 && (
                                <div className="w-16 text-right font-mono text-xs text-stone-400">{p.avg_velocity} mph</div>
                              )}
                            </div>
                            {(p.whiff_percent !== null || p.ba_against !== null) && (
                              <div className="ml-28 pl-3 flex gap-4 text-xs font-mono text-stone-500">
                                {p.whiff_percent !== null && (
                                  <span><span className="text-stone-400">Whiff</span> <strong className={`${
                                    p.whiff_percent >= 30 ? 'text-green-700' :
                                    p.whiff_percent <= 15 ? 'text-red-700' : 'text-stone-700'
                                  }`}>{p.whiff_percent.toFixed(1)}%</strong></span>
                                )}
                                {p.ba_against !== null && (
                                  <span><span className="text-stone-400">BAA</span> <strong className={`${
                                    p.ba_against <= 0.220 ? 'text-green-700' :
                                    p.ba_against >= 0.290 ? 'text-red-700' : 'text-stone-700'
                                  }`}>.{Math.round(p.ba_against * 1000).toString().padStart(3, '0')}</strong></span>
                                )}
                                {p.k_percent !== null && p.k_percent >= 25 && (
                                  <span className="text-green-700"><span className="text-stone-400">K</span> <strong>{p.k_percent.toFixed(0)}%</strong></span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
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
                            <tr key={i} className="border-t border-stone-200 hover:bg-stone-50 transition-colors">
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
                  <div className="flex items-center gap-4 mb-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={playerHeadshotUrl(game.teams.home.probablePitcher.id, 120)}
                      alt={game.teams.home.probablePitcher.fullName}
                      className="w-16 h-16 rounded-full object-cover bg-stone-100"
                    />
                    <h3 className="text-2xl font-serif font-semibold leading-tight">
                      {game.teams.home.probablePitcher.fullName}
                    </h3>
                  </div>

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

                  {homePitchMix.length > 0 && (
                    <div className="mb-6 pb-6 border-b border-stone-200">
                      <div className="text-xs uppercase tracking-widest text-stone-500 mb-4 font-mono">
                        Pitch Arsenal · {new Date().getFullYear()}
                      </div>
                      <div className="space-y-3">
                        {homePitchMix.slice(0, 5).map((p, i) => (
                          <div key={i}>
                            <div className="flex items-center gap-3 text-sm mb-1">
                              <div className="w-28 text-stone-800 font-medium truncate">{p.pitch_name}</div>
                              <div className="flex-1 h-5 bg-stone-100 relative">
                                <div
                                  className="h-full"
                                  style={{
                                    width: `${p.percentage}%`,
                                    backgroundColor: pitchColor(p.pitch_code)
                                  }}
                                />
                              </div>
                              <div className="w-12 text-right font-mono text-xs text-stone-600">{p.percentage.toFixed(1)}%</div>
                              {p.avg_velocity > 0 && (
                                <div className="w-16 text-right font-mono text-xs text-stone-400">{p.avg_velocity} mph</div>
                              )}
                            </div>
                            {(p.whiff_percent !== null || p.ba_against !== null) && (
                              <div className="ml-28 pl-3 flex gap-4 text-xs font-mono text-stone-500">
                                {p.whiff_percent !== null && (
                                  <span><span className="text-stone-400">Whiff</span> <strong className={`${
                                    p.whiff_percent >= 30 ? 'text-green-700' :
                                    p.whiff_percent <= 15 ? 'text-red-700' : 'text-stone-700'
                                  }`}>{p.whiff_percent.toFixed(1)}%</strong></span>
                                )}
                                {p.ba_against !== null && (
                                  <span><span className="text-stone-400">BAA</span> <strong className={`${
                                    p.ba_against <= 0.220 ? 'text-green-700' :
                                    p.ba_against >= 0.290 ? 'text-red-700' : 'text-stone-700'
                                  }`}>.{Math.round(p.ba_against * 1000).toString().padStart(3, '0')}</strong></span>
                                )}
                                {p.k_percent !== null && p.k_percent >= 25 && (
                                  <span className="text-green-700"><span className="text-stone-400">K</span> <strong>{p.k_percent.toFixed(0)}%</strong></span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
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
                            <tr key={i} className="border-t border-stone-200 hover:bg-stone-50 transition-colors">
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
            <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
              <h2 className="text-3xl font-serif font-light tracking-tight">
                {venue?.indoor ? 'Indoors tonight.' : 'Game-time forecast.'}
              </h2>
              {weather && !venue?.indoor && (
                <div className="flex items-center gap-3">
                  <WeatherIcon conditions={weather.conditions} size={48} />
                  <div className="font-serif text-stone-600 italic">{weather.conditions}</div>
                </div>
              )}
            </div>

            {venue?.indoor ? (
              <p className="text-lg text-stone-600 font-serif leading-relaxed">
                Climate-controlled. Roof closed. Weather is not a factor.
              </p>
            ) : weather ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                  <div>
                    <div className={`text-4xl font-serif font-semibold tracking-tight ${
                      weather.temp_f >= 85 ? 'text-orange-700' :
                      weather.temp_f <= 50 ? 'text-blue-700' :
                      'text-stone-900'
                    }`}>
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
                      <WindArrow
                        direction={weather.wind_direction}
                        size={20}
                        className="text-stone-700 self-center"
                      />
                    </div>
                    <div className="text-xs uppercase tracking-wider text-stone-500 mt-2">
                      Wind · from {weather.wind_direction_text}
                    </div>
                  </div>

                  <div>
                    <div className={`text-4xl font-serif font-semibold tracking-tight ${
                      weather.precipitation_chance >= 50 ? 'text-blue-700' : 'text-stone-900'
                    }`}>
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

                {(() => {
                  const impact = describeWindImpact(
                    game.venue?.name ?? '',
                    weather.wind_direction,
                    weather.wind_mph
                  )
                  return (
                    <div className="border-t border-stone-200 pt-4 space-y-1">
                      <p className="text-stone-600 font-serif italic">
                        {weather.conditions}
                        {venue?.city && ` in ${venue.city}`} at first pitch.
                      </p>
                      {impact && (
                        <p className="text-sm font-mono uppercase tracking-wider text-orange-600">
                          → {impact}
                        </p>
                      )}
                    </div>
                  )
                })()}
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