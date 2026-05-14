import { writeFileSync } from 'fs'
import { dailyBriefEmail, type BriefGameContext } from '../src/lib/emails'
import { getScheduleForDate, slugifyGame, getPitcherSeasonStats, getGameWeather } from '../src/lib/mlb'
import { getVenueInfo, describeWindImpact } from '../src/lib/venues'
import { getPredictionsForDate } from '../src/lib/edge-fetch'

async function main() {
  const today = new Date().toISOString().split('T')[0]
  
  console.log(`Building preview for ${today}...`)
  
  const allGames = await getScheduleForDate(today)
  const predictions = await getPredictionsForDate(today)
  
  console.log(`Found ${allGames.length} games, ${predictions.size} predictions`)
  
  // Take top 3 games for preview (don't need all 15)
  const sampleGames = allGames.slice(0, 3)
  
  const gameContexts = await Promise.all(
    sampleGames.map(async (game): Promise<BriefGameContext> => {
      const venue = getVenueInfo(game.venue?.name)
      const awayPitcherId = game.teams.away.probablePitcher?.id
      const homePitcherId = game.teams.home.probablePitcher?.id

      const [awaySeasonStats, homeSeasonStats, weather] = await Promise.all([
        awayPitcherId ? getPitcherSeasonStats(awayPitcherId) : Promise.resolve(null),
        homePitcherId ? getPitcherSeasonStats(homePitcherId) : Promise.resolve(null),
        venue && !venue.indoor
          ? getGameWeather(venue.lat, venue.lon, game.gameDate)
          : Promise.resolve(null),
      ])

      const windImpact = weather && game.venue?.name
        ? describeWindImpact(game.venue.name, weather.wind_direction, weather.wind_mph)
        : null

      const prediction = predictions.get(game.gamePk)

      return {
        game,
        awaySeasonStats,
        homeSeasonStats,
        weather,
        windImpact,
        venueName: game.venue?.name ?? '',
        isIndoor: venue?.indoor ?? false,
        slug: slugifyGame(game),
        edge_score: prediction?.edge_score ?? null,
        predicted_winner: prediction?.predicted_winner ?? null,
        confidence_tier: prediction?.confidence_tier ?? null,
        llm_summary: prediction?.summary ?? null,
        llm_narrative: prediction?.narrative ?? null,
        llm_narrative_pro: null,
      }
    })
  )

  // Render the email
  const email = dailyBriefEmail(
    'preview@edgereportdaily.com',
    'preview-token-12345',
    gameContexts,
    ['Phillies', 'Mets']  // fake team selection for preview
  )

  // Write HTML to a file we can open in browser
  writeFileSync('email-preview.html', email.html)
  writeFileSync('email-preview.txt', email.text)
  
  console.log(`\n✓ Subject: ${email.subject}`)
  console.log(`✓ HTML written to: email-preview.html`)
  console.log(`✓ Plain text written to: email-preview.txt`)
  console.log(`\nOpen email-preview.html in your browser to view.`)
}

main().catch(console.error)