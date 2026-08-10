// src/app/api/cron/check-finished-games/preview/route.ts
//
// Renders the post-game report email as HTML in the browser for visual QA.
// No Resend spend, no subscriber data touched, no auth required (read-only) —
// same pattern as send-daily-brief/preview. This is the SAFEST first step
// when testing: it never sends anything to anyone, real or test.
//
// Usage:
//   /api/cron/check-finished-games/preview?date=2026-08-09
//   /api/cron/check-finished-games/preview?date=2026-08-09&team=Phillies
//   /api/cron/check-finished-games/preview?date=2026-08-09&team=Phillies&pro=true
//   /api/cron/check-finished-games/preview?date=2026-08-09&mode=text

import { NextRequest, NextResponse } from 'next/server'
import { getScheduleForDate, slugifyGame, type MLBGame } from '@/lib/mlb'
import { getPostGameReport } from '@/lib/postgame'
import { buildPostgameEmail } from '@/lib/email/postgame-report'    
import { findTeamByName } from '@/lib/teams'

function isRealFinal(game: MLBGame): boolean {
  const state = game.status?.abstractGameState
  const detailed = game.status?.detailedState ?? ''
  if (state !== 'Final') return false
  if (['Postponed', 'Cancelled', 'Suspended'].some(s => detailed.includes(s))) return false
  return true
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  // Pick a date with games you know already finished — "today" only works
  // once games have actually gone final. Use a recent past date for
  // reliable testing (e.g. yesterday), same advice as the daily-brief preview.
  const date = params.get('date') ?? new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const teamFilter = params.get('team')
  const isPro = params.get('pro') === 'true'
  const textMode = params.get('mode') === 'text'

  const allGames = await getScheduleForDate(date)
  const finishedGames = allGames.filter(isRealFinal)

  if (finishedGames.length === 0) {
    const statuses = allGames.map(g => `${g.teams.away.team.name} @ ${g.teams.home.team.name}: ${g.status?.detailedState}`).join('<br>')
    return new NextResponse(
      `<html><body style="font-family:monospace;padding:40px;">
        <h2>No finished games on ${date}</h2>
        <p>${allGames.length} game(s) found, none Final yet:</p>
        <p>${statuses}</p>
        <p>Try a date in the past: <code>?date=YYYY-MM-DD</code></p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } },
    )
  }

  // Pick the requested team's game, or the first finished game if no filter
  let game: MLBGame | undefined
  if (teamFilter) {
    const lower = teamFilter.toLowerCase()
    game = finishedGames.find(g => {
      const awayTeam = findTeamByName(g.teams.away.team.name)
      const homeTeam = findTeamByName(g.teams.home.team.name)
      return (
        g.teams.away.team.name.toLowerCase().includes(lower) ||
        g.teams.home.team.name.toLowerCase().includes(lower) ||
        awayTeam?.slug === lower ||
        homeTeam?.slug === lower
      )
    })
  } else {
    game = finishedGames[0]
  }

  if (!game) {
    const available = finishedGames.map(g => `${g.teams.away.team.name} @ ${g.teams.home.team.name}`).join(', ')
    return new NextResponse(
      `<html><body style="font-family:monospace;padding:40px;">
        <h2>No finished game matches "${teamFilter}" on ${date}</h2>
        <p>Finished games available: ${available}</p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } },
    )
  }

  // ── Build the real report + email (read-only — nothing is sent) ──
  const report = await getPostGameReport(game.gamePk)
  const finalScore = {
    away: (game.teams.away as { score?: number }).score ?? 0,
    home: (game.teams.home as { score?: number }).score ?? 0,
  }
  const slug = slugifyGame(game)

  const email = buildPostgameEmail({
    recipientEmail: 'preview@edgereportdaily.com',
    preferencesToken: 'preview-token',
    report,
    awayTeamName: game.teams.away.team.name,
    homeTeamName: game.teams.home.team.name,
    finalScore,
    slug,
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
    <span>§ POST-GAME EMAIL PREVIEW</span>
    <span style="color:#999;">Date: ${date}</span>
    <span style="color:#999;">Game: ${game.teams.away.team.name} @ ${game.teams.home.team.name}</span>
    <span style="color:#999;">gamePk: ${game.gamePk}</span>
    <span style="color:#999;">Pro: ${isPro ? 'yes' : 'no'}</span>
    <span style="color:#999;">Subject: ${email.subject}</span>
    <span style="color:#999;">CTA → /mlb/${slug}/postgame</span>
  </div>
  <div style="padding-top:36px;"></div>`

  const previewHtml = email.html.replace(
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