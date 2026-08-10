// src/app/api/cron/check-finished-games/route.ts
//
// Post-game email cron — polls for MLB games that just went Final and
// sends the post-game report email to subscribers following either team.
// Designed to run frequently (every 10-15 min — requires Vercel Pro; Hobby
// caps crons at once/day, see note in vercel.json below) during game hours.
//
// Dedup: the `postgame_email_log` table. One row per game_pk, written once
// a send attempt has completed for that game — the next poll skips it.
// A report-BUILD failure (e.g. MLB live-feed hiccup) deliberately does NOT
// write a log row, so it retries on the next poll instead of being
// silently dropped.
//
// Test locally:
//   curl -H "Authorization: Bearer $EDGE_CRON_AUTH" \
//        "http://localhost:3000/api/cron/check-finished-games?date=2026-08-10"
//
// SAFE TESTING — three layers, cheapest/safest first:
//
//   1. ?dry_run=true
//      No email sent, no DB write. Returns exactly which real subscribers
//      would receive which game's email. Use this FIRST, on a real
//      subscriber-bearing date, before touching Resend at all.
//
//   2. TEST_EMAIL=you@example.com in the environment
//      Collapses the recipient list to that one address, for every game.
//      This is the existing daily-brief pattern. Still requires that
//      address's subscriber row to actually follow one of the two teams
//      playing — if it doesn't, you'll get 0 emails for that game (this
//      is correct team-matching precision, not a bug).
//
//   3. ?force_send=true (only takes effect when TEST_EMAIL is also set —
//      structurally cannot fire against real subscribers)
//      Bypasses the team-match filter for the TEST_EMAIL address only, so
//      you can verify the full send pipeline (Resend included) against
//      any finished game, without waiting for one your test subscriber
//      happens to follow.
//
//   Combine 1+2 first (dry_run + TEST_EMAIL) to confirm exactly who would
//   get what, THEN drop dry_run to actually send to yourself, THEN remove
//   TEST_EMAIL to go live.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getScheduleForDate, slugifyGame, type MLBGame } from '@/lib/mlb'
import { getPostGameReport } from '@/lib/postgame'
import { buildPostgameEmail } from '@/lib/email/postgame-report'
import { MLB_TEAMS } from '@/lib/teams'
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

// ─── Team abbr → subscriber slug (subscribers.teams stores slugs, e.g. "phillies") ──

function slugForAbbr(abbr: string | undefined): string | null {
  if (!abbr) return null
  return MLB_TEAMS.find(t => t.abbrev === abbr)?.slug ?? null
}

// ─── Finished-game detection ────────────────────────────────────────────────
// Same pattern as lib/lineups.ts's completed-game filter: abstractGameState
// must be Final, and detailedState must not indicate a postponement/
// cancellation/suspension (those can carry a stale Final-looking state).

function isRealFinal(game: MLBGame): boolean {
  const state = game.status?.abstractGameState
  const detailed = game.status?.detailedState ?? ''
  if (state !== 'Final') return false
  if (['Postponed', 'Cancelled', 'Suspended'].some(s => detailed.includes(s))) return false
  return true
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // 1. Auth
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1b. Beta pause — same switch as send-daily-brief, so one env var kills all sends.
  if (process.env.BETA_PAUSE_EMAILS === 'true') {
    console.log('[check-finished-games] Skipped — BETA_PAUSE_EMAILS=true')
    return NextResponse.json({ skipped: true, reason: 'beta_pause_emails' })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY missing' }, { status: 500 })
  }

  const supa = createAdminClient()

  // Support ?date= for backfilling/testing — defaults to "today" in US Eastern,
  // NOT UTC (games finishing after 8pm ET are still "today" past UTC midnight —
  // same fix already applied elsewhere for the UTC/Eastern boundary bug).
  const dateParam = request.nextUrl.searchParams.get('date')
  const today = dateParam ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  const dryRun = request.nextUrl.searchParams.get('dry_run') === 'true'

  // force_send only ever activates alongside TEST_EMAIL — without TEST_EMAIL
  // set, this flag is inert. That's the whole safety guarantee: there is no
  // query param that can widen the recipient list past whatever TEST_EMAIL
  // already restricted it to.
  const forceSend = request.nextUrl.searchParams.get('force_send') === 'true' && !!process.env.TEST_EMAIL

  console.log(`[check-finished-games] Checking ${today}${dryRun ? ' [DRY RUN]' : ''}${forceSend ? ' [FORCE_SEND]' : ''}`)

  // 2. Pull today's schedule, find real Final games
  const allGames = await getScheduleForDate(today)
  const finishedGames = allGames.filter(isRealFinal)

  if (finishedGames.length === 0) {
    return NextResponse.json({ message: 'No finished games yet', games_checked: allGames.length })
  }

  // 3. Filter out games already processed
  const { data: alreadySent, error: logError } = await supa
    .from('postgame_email_log')
    .select('game_pk')
    .in('game_pk', finishedGames.map(g => g.gamePk))

  if (logError) {
    console.error('[check-finished-games] postgame_email_log read error', logError)
    return NextResponse.json({ error: logError.message }, { status: 500 })
  }

  const sentSet = new Set((alreadySent ?? []).map(r => r.game_pk))
  const newlyFinished = finishedGames.filter(g => !sentSet.has(g.gamePk))

  if (newlyFinished.length === 0) {
    return NextResponse.json({
      message: 'No new finished games',
      games_checked: allGames.length,
      games_finished: finishedGames.length,
    })
  }

  console.log(`[check-finished-games] ${newlyFinished.length} newly finished game(s)`)

  // 4. Fetch active subscribers once (same filter as send-daily-brief)
  const { data: subscribers, error: subError } = await supa
    .from('subscribers')
    .select('email, teams, preferences_token, unsubscribed_at, email_verified, is_pro')
    .is('unsubscribed_at', null)
    .eq('email_verified', true)
    .not('teams', 'is', null)

  if (subError) {
    console.error('[check-finished-games] subscriber fetch error', subError)
    return NextResponse.json({ error: subError.message }, { status: 500 })
  }

  const activeSubs = (subscribers ?? []).filter(
    s => Array.isArray(s.teams) && s.teams.length > 0
  )

  // TEST_EMAIL override — send to one address only
  const subsToProcess = process.env.TEST_EMAIL
    ? activeSubs.filter(s => s.email === process.env.TEST_EMAIL)
    : activeSubs

  const resend = new Resend(process.env.RESEND_API_KEY)

  let gamesProcessed = 0
  let totalEmailsSent = 0
  const errors: string[] = []
  // dry_run report — which real subscribers WOULD have received WHICH game's
  // email, without sending anything or writing to the dedupe log. This is
  // the thing to read closely before layer 2/3 ever touch Resend.
  const dryRunPlan: { game_pk: number; matchup: string; would_email: string[] }[] = []

  // 5. Process each newly finished game
  for (const game of newlyFinished) {
    try {
      const awayAbbr = game.teams.away.team.abbreviation
      const homeAbbr = game.teams.home.team.abbreviation
      const awaySlug = slugForAbbr(awayAbbr)
      const homeSlug = slugForAbbr(homeAbbr)
      const matchup = `${game.teams.away.team.name} @ ${game.teams.home.team.name}`

      if (!awaySlug && !homeSlug) {
        errors.push(`Game ${game.gamePk}: could not resolve either team abbreviation (${awayAbbr}/${homeAbbr})`)
        continue
      }

      // force_send (test-only, see header note) bypasses the team-match
      // requirement entirely for whatever subsToProcess already is — which,
      // since force_send can only be true alongside TEST_EMAIL, is always
      // just that one test address.
      const matchingSubs = forceSend
        ? subsToProcess
        : subsToProcess.filter(s => {
            const subTeams = s.teams as string[]
            return (awaySlug && subTeams.includes(awaySlug)) || (homeSlug && subTeams.includes(homeSlug))
          })

      if (dryRun) {
        dryRunPlan.push({ game_pk: game.gamePk, matchup, would_email: matchingSubs.map(s => s.email) })
        continue // no DB write, no report build, no send — that's the whole point of dry_run
      }

      // Nobody follows either team — log it as processed so we stop re-checking
      // it on every poll, but skip the (fairly expensive) report build entirely.
      if (matchingSubs.length === 0) {
        await supa.from('postgame_email_log').insert({
          game_pk: game.gamePk,
          sent_at: new Date().toISOString(),
          recipients: 0,
        })
        gamesProcessed++
        continue
      }

      // Build the report ONCE per game, reuse for every matching subscriber.
      const report = await getPostGameReport(game.gamePk)

      const finalScore = {
        away: (game.teams.away as { score?: number }).score ?? 0,
        home: (game.teams.home as { score?: number }).score ?? 0,
      }
      const slug = slugifyGame(game)

      let sentForThisGame = 0
      for (const sub of matchingSubs) {
        try {
          const isPro = sub.is_pro === true || sub.is_pro === 'true'

          const email = buildPostgameEmail({
            recipientEmail: sub.email,
            preferencesToken: sub.preferences_token ?? '',
            report,
            awayTeamName: game.teams.away.team.name,
            homeTeamName: game.teams.home.team.name,
            finalScore,
            slug,
            isPro,
          })

          await resend.emails.send({
            from: 'The Edge <hello@edgereportdaily.com>',
            to: sub.email,
            subject: email.subject,
            html: email.html,
            text: email.text,
          })

          sentForThisGame++
          totalEmailsSent++

          // Throttle — Resend free tier is 10 req/sec
          await new Promise(r => setTimeout(r, 150))
        } catch (err) {
          console.error(`[check-finished-games] send error for ${sub.email}:`, err)
          errors.push(`${sub.email} (game ${game.gamePk}): ${err instanceof Error ? err.message : 'unknown'}`)
        }
      }

      // Mark the game processed AFTER attempting all sends — a partial failure
      // (some subscribers errored) still records the game as handled, matching
      // send-daily-brief's per-subscriber error tolerance.
      //
      // force_send is deliberately excluded from writing this log row — a
      // forced test send to your own address should never mark a real game
      // as "processed," or real subscribers who follow that team would
      // silently never receive their actual email.
      if (!forceSend) {
        await supa.from('postgame_email_log').insert({
          game_pk: game.gamePk,
          sent_at: new Date().toISOString(),
          recipients: sentForThisGame,
        })
      }

      gamesProcessed++
    } catch (err) {
      // Deliberately NOT writing to postgame_email_log here — a failure at
      // the report-build stage (live feed unavailable, etc.) should retry
      // on the next poll rather than being permanently skipped.
      console.error(`[check-finished-games] game ${game.gamePk} failed:`, err)
      errors.push(`Game ${game.gamePk}: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  console.log(`[check-finished-games] Done: ${gamesProcessed} game(s) processed, ${totalEmailsSent} email(s) sent`)

  return NextResponse.json({
    date: today,
    games_checked: allGames.length,
    games_finished: finishedGames.length,
    games_newly_processed: gamesProcessed,
    emails_sent: totalEmailsSent,
    errors: errors.length > 0 ? errors : undefined,
    test_mode: !!process.env.TEST_EMAIL,
    dry_run: dryRun || undefined,
    dry_run_plan: dryRun ? dryRunPlan : undefined,
    force_send: forceSend || undefined,
  })
}