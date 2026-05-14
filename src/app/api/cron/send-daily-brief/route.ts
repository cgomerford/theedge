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

export const maxDuration = 300

export async function GET(request: NextRequest) {
  // 1. Authorization
  const authHeader = request.headers.get('authorization')
  const validSecrets = [
    process.env.CRON_SECRET,
    process.env.EDGE_CRON_AUTH,
  ].filter(Boolean)

  const isValid = validSecrets.some(secret =>
    authHeader === `Bearer ${secret}`
  )

  if (!isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supa = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  console.log(`[daily-brief] Starting for ${today}`)

  // 2. Fetch today's schedule
  const allGames = await getScheduleForDate(today)
  console.log(`[daily-brief] Found ${allGames.length} games today`)

  if (allGames.length === 0) {
    return NextResponse.json({ message: 'No games today, nothing to send' })
  }

  // 3. Fetch predictions
  const predictions = await getPredictionsForDate(today)
  console.log(`[daily-brief] Loaded ${predictions.size} V2 predictions`)

  // 4. Pre-compute game context (pitcher stats + weather + prediction)
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
        edge_score: prediction?.edge_score ?? null,
        predicted_winner: prediction?.predicted_winner ?? null,
        confidence_tier: prediction?.confidence_tier ?? null,
        llm_summary: prediction?.summary ?? null,
        llm_narrative: prediction?.narrative ?? null,
      }
    })
  )

  // 5. Fetch active subscribers — no is_pro column yet, that's Phase 2
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

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY missing' }, { status: 500 })
  }

  const activeSubs = (subscribers ?? []).filter(
    (s) => Array.isArray(s.teams) && s.teams.length > 0
  )

  // TEST_EMAIL override — set in Vercel env to send to one address only
  // Remove or blank this env var to send to all subscribers
  const subsToProcess = process.env.TEST_EMAIL
    ? activeSubs.filter((s) => s.email === process.env.TEST_EMAIL)
    : activeSubs

  console.log(
    `[daily-brief] Sending to ${subsToProcess.length} subscriber(s)` +
    (process.env.TEST_EMAIL ? ` [TEST MODE: ${process.env.TEST_EMAIL}]` : '')
  )

  const resend = new Resend(process.env.RESEND_API_KEY)
  let sentCount = 0
  let skippedCount = 0
  const errors: string[] = []

  // 6. Send to each subscriber
  for (const sub of subsToProcess) {
    try {
      const subTeams = sub.teams as string[]

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
        uniqueShortNames,
      )

      await resend.emails.send({
        from: 'The Edge <hello@edgereportdaily.com>',
        to: sub.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      })

      sentCount++

      // Throttle — Resend free tier is 10 req/sec
      await new Promise((r) => setTimeout(r, 150))
    } catch (err) {
      console.error(`[daily-brief] error for ${sub.email}:`, err)
      errors.push(`${sub.email}: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  return NextResponse.json({
    sent: sentCount,
    skipped: skippedCount,
    errors,
    games_today: allGames.length,
    active_subscribers: activeSubs.length,
    test_mode: !!process.env.TEST_EMAIL,
  })
}