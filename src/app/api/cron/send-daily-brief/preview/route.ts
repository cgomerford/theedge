// src/app/api/cron/send-daily-brief/preview/route.ts
//
// Renders the daily brief email as HTML in the browser for visual QA.
// No Resend spend, no subscriber required, no auth required (it's read-only).
//
// Usage:
//   /api/cron/send-daily-brief/preview
//   /api/cron/send-daily-brief/preview?date=2026-06-07
//   /api/cron/send-daily-brief/preview?date=2026-06-07&team=Phillies
//   /api/cron/send-daily-brief/preview?date=2026-06-07&team=Phillies&team=Mets
//   /api/cron/send-daily-brief/preview?date=2026-06-07&team=Phillies&pro=true
//   /api/cron/send-daily-brief/preview?mode=text  (plain-text version)

import { NextRequest, NextResponse } from 'next/server'
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

// ─── Build game context (same logic as the send route) ────────────────────────

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

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  // Date — defaults to today
  const date = params.get('date') ?? new Date().toISOString().split('T')[0]

  // Team filter — optional, can appear multiple times
  // ?team=Phillies or ?team=Phillies&team=Mets
  const teamFilters = params.getAll('team')

  // Pro mode — ?pro=true
  const isPro = params.get('pro') === 'true'

  // Plain-text mode — ?mode=text
  const textMode = params.get('mode') === 'text'

  // ── Fetch games + predictions ──
  let allGames: MLBGame[]
  let predictions: Map<number, any>

  try {
    ;[allGames, predictions] = await Promise.all([
      getScheduleForDate(date),
      getPredictionsForDate(date),
    ])
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch games/predictions', detail: String(err) },
      { status: 500 },
    )
  }

  if (allGames.length === 0) {
    return new NextResponse(
      `<html><body style="font-family:monospace;padding:40px;">
        <h2>No games found for ${date}</h2>
        <p>Try a different date: <code>?date=YYYY-MM-DD</code></p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } },
    )
  }

  // ── Build contexts ──
  const gameContexts = await Promise.all(
    allGames.map(game => buildGameContext(game, predictions))
  )

  // ── Filter by team if specified ──
  let filtered: BriefGameContext[]
  let teamShortNames: string[]

  if (teamFilters.length > 0) {
    // Match by short name (case-insensitive) — "Phillies", "Mets", "Yankees"
    const lowerFilters = teamFilters.map(t => t.toLowerCase())

    filtered = gameContexts.filter(ctx => {
      const awayShort = ctx.game.teams.away.team.name.split(' ').pop()?.toLowerCase()
      const homeShort = ctx.game.teams.home.team.name.split(' ').pop()?.toLowerCase()
      const awayTeam = findTeamByName(ctx.game.teams.away.team.name)
      const homeTeam = findTeamByName(ctx.game.teams.home.team.name)

      return (
        lowerFilters.includes(awayShort ?? '') ||
        lowerFilters.includes(homeShort ?? '') ||
        lowerFilters.includes(awayTeam?.slug ?? '') ||
        lowerFilters.includes(homeTeam?.slug ?? '')
      )
    })

    teamShortNames = teamFilters.map(t => t.charAt(0).toUpperCase() + t.slice(1))
  } else {
    // No filter — show first 3 games (enough to preview the layout without a huge page)
    filtered = gameContexts.slice(0, 3)
    teamShortNames = ['Preview']
  }

  if (filtered.length === 0) {
    const available = gameContexts.map(ctx => {
      const away = ctx.game.teams.away.team.name.split(' ').pop()
      const home = ctx.game.teams.home.team.name.split(' ').pop()
      return `${away} @ ${home}`
    }).join(', ')

    return new NextResponse(
      `<html><body style="font-family:monospace;padding:40px;">
        <h2>No games match "${teamFilters.join(', ')}" on ${date}</h2>
        <p>Available: ${available}</p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } },
    )
  }

  // ── Render ──
  const email = buildDailyBrief({
    recipientEmail: 'preview@edgereportdaily.com',
    preferencesToken: 'preview-token',
    games: filtered,
    teamShortNames,
    isPro,
  })

  if (textMode) {
    return new NextResponse(email.text, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  // ── Wrap in a preview chrome with metadata bar ──
  const metaBar = `
  <div style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#1a1a1a;color:#FDE047;font-family:monospace;font-size:12px;padding:8px 16px;display:flex;gap:16px;align-items:center;">
    <span>§ EMAIL PREVIEW</span>
    <span style="color:#999;">Date: ${date}</span>
    <span style="color:#999;">Games: ${filtered.length}/${allGames.length}</span>
    <span style="color:#999;">Predictions: ${predictions.size}</span>
    <span style="color:#999;">Pro: ${isPro ? 'yes' : 'no'}</span>
    <span style="color:#999;">Subject: ${email.subject}</span>
  </div>
  <div style="padding-top:36px;"></div>`

  const previewHtml = email.html.replace('<body', '<body') // Inject meta bar after <body> tag
    .replace(
      /(<body[^>]*>)/,
      `$1${metaBar}`,
    )

  return new NextResponse(previewHtml, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}