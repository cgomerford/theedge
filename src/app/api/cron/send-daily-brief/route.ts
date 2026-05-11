import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import {
  getScheduleForDate,
  slugifyGame,
  getPitcherSeasonStats,
  getGameWeather,
  type MLBGame,
} from '@/lib/mlb'
import { getVenueInfo, describeWindImpact } from '@/lib/venues'
import { findTeamByName } from '@/lib/teams'
import { dailyBriefEmail, type BriefGameContext } from '@/lib/emails'
import { Resend } from 'resend'
import { getPredictionsForDate } from '@/lib/edge-fetch'

// Vercel cron will hit this — we secure it with a shared secret
export const maxDuration = 300  // 5 min max execution

export async function GET(req: NextRequest) {
  // TEMP: auth disabled for email rendering test — RE-ENABLE BEFORE BED
 const authHeader = req.headers.get('authorization')
if (authHeader !== `Bearer ${process.env.EDGE_CRON_AUTH}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

  const supa = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  console.log(`[daily-brief] Starting for ${today}`)

  // 1. Fetch today's MLB schedule once
  const allGames = await getScheduleForDate(today)
  console.log(`[daily-brief] Found ${allGames.length} games today`)

  if (allGames.length === 0) {
    return NextResponse.json({ message: 'No games today, nothing to send' })
  }

  // 2. Fetch all V2 predictions for today in one batch
  const predictions = await getPredictionsForDate(today)
  console.log(`[daily-brief] Loaded ${predictions.size} V2 predictions`)

  // 3. Pre-compute context (pitcher stats + weather + V2 prediction) for every game
  const gameContexts = await Promise.all(
    allGames.map(async (game): Promise<BriefGameContext> => {
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
        // V2 prediction fields
        edge_score: prediction?.edge_score ?? null,
        predicted_winner: prediction?.predicted_winner ?? null,
        confidence_tier: prediction?.confidence_tier ?? null,
        llm_summary: prediction?.summary ?? null,
        llm_narrative: prediction?.narrative ?? null,
      }
    })
  )

  // 4. Get all subscribers with at least one team picked
  const { data: subscribers, error: subError } = await supa
    .from('subscribers')
    .select('email, teams, preferences_token, unsubscribed_at, email_verified')
    .is('unsubscribed_at', null)
    .eq('email_verified', true)
    .not('teams', 'is', null)

  if (subError) {
    console.error('[daily-brief] subscriber fetch error', subError)
    return NextResponse.json({ error: subError.message }, { status: 500 })
  }

  const activeSubs = (subscribers ?? []).filter((s) => Array.isArray(s.teams) && s.teams.length > 0)
  console.log(`[daily-brief] ${activeSubs.length} active subscribers with team prefs`)

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY missing' }, { status: 500 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  let sentCount = 0
  let skippedCount = 0
  const errors: string[] = []

  // 5. Loop through subscribers, send each their personalized brief
  for (const sub of activeSubs) {
    try {
      const subTeams: string[] = sub.teams as string[]

      // Find games featuring any of their teams
      const matchingGames = gameContexts.filter((ctx) => {
        const awayTeam = findTeamByName(ctx.game.teams.away.team.name)
        const homeTeam = findTeamByName(ctx.game.teams.home.team.name)
        return (
          (awayTeam && subTeams.includes(awayTeam.slug)) ||
          (homeTeam && subTeams.includes(homeTeam.slug))
        )
      })

      if (matchingGames.length === 0) {
        skippedCount++
        continue
      }

      // Get short names of teams they follow that play tonight
      const followedShortNames = matchingGames.flatMap((ctx) => {
        const aw = findTeamByName(ctx.game.teams.away.team.name)
        const hm = findTeamByName(ctx.game.teams.home.team.name)
        const out: string[] = []
        if (aw && subTeams.includes(aw.slug)) out.push(aw.short)
        if (hm && subTeams.includes(hm.slug)) out.push(hm.short)
        return out
      })
      const uniqueShortNames = Array.from(new Set(followedShortNames))

      const emailContent = dailyBriefEmail(
        sub.email,
        sub.preferences_token ?? '',
        matchingGames,
        uniqueShortNames
      )

      await resend.emails.send({
        from: 'The Edge <hello@edgereportdaily.com>',
        to: sub.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      })

      sentCount++

      // Be polite to Resend rate limits (10/sec on free tier)
      await new Promise((r) => setTimeout(r, 150))
    } catch (err) {
      console.error('[daily-brief] error for', sub.email, err)
      errors.push(`${sub.email}: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  console.log(`[daily-brief] Done. Sent: ${sentCount}, Skipped (no matches): ${skippedCount}, Errors: ${errors.length}`)

  return NextResponse.json({
    sent: sentCount,
    skipped: skippedCount,
    errors,
    games_today: allGames.length,
    active_subscribers: activeSubs.length,
  })
}