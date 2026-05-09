import { dailyBriefEmail, type BriefGameContext } from '../src/lib/emails'
import { getScheduleForDate, slugifyGame, getPitcherSeasonStats, getGameWeather } from '../src/lib/mlb'
import { getVenueInfo, describeWindImpact } from '../src/lib/venues'
import { getPredictionsForDate } from '../src/lib/edge-fetch'
import { Resend } from 'resend'

const TEST_EMAIL = 'cgomerford@gmail.com'  // ← change this

async function main() {
  if (TEST_EMAIL === 'cgomerford@gmail.com') {
    console.error('cgomerford@gmail.com')
    process.exit(1)
  }

  const today = new Date().toISOString().split('T')[0]
  const allGames = await getScheduleForDate(today)
  const predictions = await getPredictionsForDate(today)
  
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
      }
    })
  )

  const email = dailyBriefEmail(
    TEST_EMAIL,
    'test-token-12345',
    gameContexts,
    ['Phillies', 'Mets']
  )

  console.log(`Sending test to ${TEST_EMAIL}...`)
  console.log(`Subject: ${email.subject}`)
  
  const resend = new Resend(process.env.RESEND_API_KEY)
  const result = await resend.emails.send({
    from: 'The Edge <hello@edgereportdaily.com>',
    to: TEST_EMAIL,
    subject: email.subject,
    html: email.html,
    text: email.text,
  })
  
  console.log('Sent:', result)
}

main().catch(console.error)