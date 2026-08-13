// src/app/api/cron/postgame-emails/route.ts
//
// Intended to run on a Vercel cron (e.g. every 15 min during game windows).
// For each game that finished today and hasn't been emailed yet:
//   1. fetch the live feed, confirm it's Final
//   2. aggregate → PostgameReport
//   3. cache it in game_postgame_reports
//   4. build + send the email via Resend to active subscribers
//   5. stamp emailed_at so it isn't sent twice
//
// ASSUMPTIONS TO VERIFY — I don't have your subscribers table schema or
// Resend send helper in front of me, so both are stubbed with the shape
// implied by your architecture notes (Resend for email, Supabase for
// storage). Swap in the real table name / column names / send helper.
//
// Vercel cron wiring (add to vercel.json, not written here since I don't
// have your current vercel.json):
//   { "path": "/api/cron/postgame-emails", "schedule": "*/15 6-8 * * *" }
// (schedule is UTC — adjust the hour window to cover your typical first
// pitch → last final window)

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getLiveFeed, getDoubleheaderGames } from '@/lib/mlb-live-feed'
import { aggregateGameFeed } from '@/lib/postgame-aggregate'
import { buildPostgameReportEmail } from '@/lib/email/templates/postgame-report'

const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: Request) {
  // Vercel cron requests carry this header — reject anything else so the
  // route can't be hit publicly to spam-trigger emails.
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)

  // Pull today's scheduled games that we know about via game_previews
  // (already populated by the game page / your existing schedule sync).
  const { data: candidates, error } = await supa
    .from('game_previews')
    .select('slug, home_team_id, away_team_id, status')
    .eq('game_date', today)

  if (error || !candidates) {
    return NextResponse.json({ error: 'could not load candidate games' }, { status: 500 })
  }

  const results: { slug: string; sent: boolean; reason?: string }[] = []

  for (const game of candidates) {
    // We only have team ids + slug from game_previews — resolve to a gamePk
    // via the doubleheader-aware schedule lookup (returns 1 game on a
    // normal day, 2 on a doubleheader).
    const scheduled = await getDoubleheaderGames(today, game.home_team_id, game.away_team_id)

    for (const sched of scheduled) {
      const { data: existing } = await supa
        .from('game_postgame_reports')
        .select('game_pk, emailed_at')
        .eq('game_pk', sched.gamePk)
        .maybeSingle()

      if (existing?.emailed_at) {
        results.push({ slug: game.slug, sent: false, reason: 'already emailed' })
        continue
      }

      const feed = await getLiveFeed(sched.gamePk)
      if (!feed || feed.gameData.status.abstractGameState !== 'Final') {
        results.push({ slug: game.slug, sent: false, reason: 'not final yet' })
        continue
      }

      const slug = scheduled.length > 1 ? `${game.slug}-game${sched.gameNumber}` : game.slug
      const report = aggregateGameFeed(feed, slug)
      if (!report) {
        results.push({ slug, sent: false, reason: 'aggregation failed' })
        continue
      }

      await supa.from('game_postgame_reports').upsert({
        game_pk: report.gamePk,
        slug: report.slug,
        game_date: report.gameDate,
        away_team_id: report.away.teamId,
        home_team_id: report.home.teamId,
        away_abbr: report.away.abbreviation,
        home_abbr: report.home.abbreviation,
        final_away_score: report.finalAwayScore,
        final_home_score: report.finalHomeScore,
        report_data: report,
      }, { onConflict: 'game_pk' })

      const { subject, html } = buildPostgameReportEmail(report)
      const sendOk = await sendPostgameEmail(subject, html)

      if (sendOk) {
        await supa
          .from('game_postgame_reports')
          .update({ emailed_at: new Date().toISOString() })
          .eq('game_pk', report.gamePk)
      }

      results.push({ slug: report.slug, sent: sendOk })
    }
  }

  return NextResponse.json({ results })
}

// TODO: replace with your real Resend broadcast call + subscriber
// audience/segment. Stubbed here so the route is otherwise complete.
async function sendPostgameEmail(subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'The Edge <postgame@edgereportdaily.com>',
        // TODO: swap for your actual audience/segment mechanism — this
        // assumes a single "postgame" list id, not per-team subscriptions.
        to: process.env.POSTGAME_AUDIENCE_ID,
        subject,
        html,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
