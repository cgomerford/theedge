// src/app/api/cron/send-daily-brief/route.ts
//
// Daily brief email cron — runs at 12:00 UTC via Vercel Cron.
// Fetches today's games + predictions, matches to subscribers, sends via Resend.
//
// Test locally:
//   curl -H "Authorization: Bearer $EDGE_CRON_AUTH" \
//        "http://localhost:3000/api/cron/send-daily-brief?date=2026-06-07"
//
// Preview without sending:
//   /api/cron/send-daily-brief/preview?date=2026-06-07&team=Phillies

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
import { getPredictionsForDate } from '@/lib/edge-fetch'
import { buildDailyBrief, type BriefGameContext } from '@/lib/email/daily-brief'
import { Resend } from 'resend'

export const maxDuration = 300

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const validSecrets = [
    process.env.CRON_SECRET,
    process.env.EDGE_CRON_AUTH,
  ].filter(Boolean)

  return validSecrets.some(secret => authHeader === `Bearer ${secret}`)
}

// ─── Build game context ───────────────────────────────────────────────────────

async function buildGameContext(
  game: MLBGame,
  predictions: Map<number, any>,
): Promise<BriefGameContext> {
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
    llm_narrative_pro: prediction?.narrative_pro ?? null,
    components: prediction?.components ?? null,
    components_raw: prediction?.components_raw ?? null,
  }
}

// ─── Subscriber matching ──────────────────────────────────────────────────────

function matchGamesToSubscriber(
  gameContexts: BriefGameContext[],
  subscriberTeams: string[],
): { matchingGames: BriefGameContext[]; teamShortNames: string[] } {
  const matchingGames = gameContexts.filter(ctx => {
    const awayTeam = findTeamByName(ctx.game.teams.away.team.name)
    const homeTeam = findTeamByName(ctx.game.teams.home.team.name)
    return (
      (awayTeam && subscriberTeams.includes(awayTeam.slug)) ||
      (homeTeam && subscriberTeams.includes(homeTeam.slug))
    )
  })

  // Collect short names for followed teams (used in subject + headline)
  const shortNames = matchingGames.flatMap(ctx => {
    const aw = findTeamByName(ctx.game.teams.away.team.name)
    const hm = findTeamByName(ctx.game.teams.home.team.name)
    const out: string[] = []
    if (aw && subscriberTeams.includes(aw.slug)) out.push(aw.short)
    if (hm && subscriberTeams.includes(hm.slug)) out.push(hm.short)
    return out
  })

  return {
    matchingGames,
    teamShortNames: Array.from(new Set(shortNames)),
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // 1. Auth
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY missing' }, { status: 500 })
  }

  const supa = createAdminClient()

  // Support ?date= param for backfilling / testing
  const dateParam = request.nextUrl.searchParams.get('date')
  const today = dateParam ?? new Date().toISOString().split('T')[0]

  console.log(`[daily-brief] Starting for ${today}`)

  // 2. Fetch today's games
  const allGames = await getScheduleForDate(today)
  console.log(`[daily-brief] ${allGames.length} games found`)

  if (allGames.length === 0) {
    return NextResponse.json({ message: 'No games today, nothing to send' })
  }

  // 3. Fetch predictions
  const predictions = await getPredictionsForDate(today)
  console.log(`[daily-brief] ${predictions.size} predictions loaded`)

  // 4. Build game contexts (pitcher stats + weather + prediction) — once for all subscribers
  const gameContexts = await Promise.all(
    allGames.map(game => buildGameContext(game, predictions))
  )

  // 5. Fetch active subscribers
  const { data: subscribers, error: subError } = await supa
    .from('subscribers')
    .select('email, teams, preferences_token, unsubscribed_at, email_verified, is_pro')
    .is('unsubscribed_at', null)
    .eq('email_verified', true)
    .not('teams', 'is', null)

  if (subError) {
    console.error('[daily-brief] subscriber fetch error', subError)
    return NextResponse.json({ error: subError.message }, { status: 500 })
  }

  const activeSubs = (subscribers ?? []).filter(
    s => Array.isArray(s.teams) && s.teams.length > 0
  )

  // TEST_EMAIL override — send to one address only
  const subsToProcess = process.env.TEST_EMAIL
    ? activeSubs.filter(s => s.email === process.env.TEST_EMAIL)
    : activeSubs

  console.log(
    `[daily-brief] Sending to ${subsToProcess.length} subscriber(s)` +
    (process.env.TEST_EMAIL ? ` [TEST: ${process.env.TEST_EMAIL}]` : '')
  )

  // 6. Send
  const resend = new Resend(process.env.RESEND_API_KEY)
  let sentCount = 0
  let skippedCount = 0
  const errors: string[] = []

  for (const sub of subsToProcess) {
    try {
      const subTeams = sub.teams as string[]
      const { matchingGames, teamShortNames } = matchGamesToSubscriber(gameContexts, subTeams)

      if (matchingGames.length === 0) {
        skippedCount++
        continue
      }

      const isPro = sub.is_pro === true || sub.is_pro === 'true'

      const email = buildDailyBrief({
        recipientEmail: sub.email,
        preferencesToken: sub.preferences_token ?? '',
        games: matchingGames,
        teamShortNames,
        isPro,
      })

      await resend.emails.send({
        from: 'The Edge <hello@edgereportdaily.com>',
        to: sub.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      })

      sentCount++

      // Throttle — Resend free tier is 10 req/sec
      await new Promise(r => setTimeout(r, 150))
    } catch (err) {
      console.error(`[daily-brief] error for ${sub.email}:`, err)
      errors.push(`${sub.email}: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  console.log(`[daily-brief] Done: ${sentCount} sent, ${skippedCount} skipped, ${errors.length} errors`)

  return NextResponse.json({
    date: today,
    sent: sentCount,
    skipped: skippedCount,
    errors,
    games_today: allGames.length,
    predictions_loaded: predictions.size,
    active_subscribers: activeSubs.length,
    test_mode: !!process.env.TEST_EMAIL,
  })
}