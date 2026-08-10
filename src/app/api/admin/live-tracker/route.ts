// src/app/api/admin/live-tracker/route.ts
//
// Three buckets from today's slate:
//   - Live  -> full panel, fetched fresh every single poll (has to be,
//     the game is still moving).
//   - Final -> full panel too, but a Final game's feed never changes
//     again, so it's cached in-process after the first build instead of
//     re-fetching and re-aggregating on every 30s tick for the rest of
//     the day. See CACHE NOTE below for the one real caveat on this.
//   - Preview -> nothing's happened yet, just the bare card.
//
// CACHE NOTE: `finalPanelCache` is a plain module-level Map, which only
// works as a cache for as long as this stays the same warm Node process.
// On a long-running server (the assumption throughout this feature) that's
// fine and this is genuinely free after the first hit. On a serverless/edge
// deployment where each invocation can spin up a fresh process, this
// silently stops caching and falls back to re-fetching every time — still
// correct, just not free anymore. If you're on Vercel serverless functions
// rather than a persistent server, swap this for the same
// game_postgame_reports Supabase table the postgame-report feature already
// writes to (a Final game's row would already exist there once that's
// wired up) instead of process memory.
//
// LOAD NOTE — unchanged: Live games are still ~15 concurrent GUMBO fetches
// every 30s on a busy night. Don't drop the client interval below 30s.
//
// gameSlug is still null everywhere — pending your real slug-building
// function, same placeholder as every other piece of this feature.

import { NextResponse } from 'next/server'
import { getGamesForDate, getLiveFeed } from '@/lib/mlb-live-feed'
import { buildSnapshot, computeGameKeyStats, computeHeadlineEvents, detectPerGameEvents, type GameSnapshot } from '@/lib/notable-events'
import { teamName } from '@/lib/mlb-assets'
import type { LiveGameCard, LiveGamePanel, LiveTrackerPayload } from '@/types/live-tracker'

const finalPanelCache = new Map<number, LiveGamePanel>()

function toCard(g: Awaited<ReturnType<typeof getGamesForDate>>[number]): LiveGameCard {
  return {
    gamePk: g.gamePk,
    matchup: `${g.awayAbbr} @ ${g.homeAbbr}`,
    awayAbbr: g.awayAbbr,
    homeAbbr: g.homeAbbr,
    awayName: teamName(g.awayTeamId, g.awayAbbr),
    homeName: teamName(g.homeTeamId, g.homeAbbr),
    awayTeamId: g.awayTeamId,
    homeTeamId: g.homeTeamId,
    awayScore: g.awayScore,
    homeScore: g.homeScore,
    inning: g.inning,
    inningHalf: g.inningHalf,
    status: g.status,
  }
}

function emptyPanel(card: LiveGameCard): LiveGamePanel {
  return {
    game: card,
    keyStats: {
      gamePk: card.gamePk, fastestPitch: null, slowestPitch: null, mostBreak: null, highestSpin: null,
      hardestHit: null, longestHit: null, longestAtBat: null, mostPatientBatter: null, biggestInning: null,
      topSwingAndMiss: null, rbiLeader: null, runsLeader: null, stolenBaseLeader: null, hardHitRate: null,
    },
    events: [],
    linescore: [],
  }
}

function buildPanel(card: LiveGameCard, snap: GameSnapshot | null): LiveGamePanel {
  if (!snap) return emptyPanel(card)
  return {
    game: card,
    keyStats: computeGameKeyStats(snap),
    events: detectPerGameEvents(snap),
    linescore: snap.report.linescore,
  }
}

export async function GET() {
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const slate = await getGamesForDate(today)

  const liveGames = slate.filter(g => g.status === 'Live')
  const finalGames = slate.filter(g => g.status === 'Final')
  const previewGames = slate.filter(g => g.status === 'Preview')

  // ── live: always fresh ──────────────────────────────────────────────
  const liveSnapshots = (
    await Promise.all(
      liveGames.map(async g => {
        const feed = await getLiveFeed(g.gamePk)
        return feed ? buildSnapshot(feed, null) : null
      }),
    )
  ).filter((s): s is NonNullable<typeof s> => s !== null)
  const liveSnapshotByPk = new Map(liveSnapshots.map(s => [s.report.gamePk, s]))

  const panels: LiveGamePanel[] = liveGames.map(g => buildPanel(toCard(g), liveSnapshotByPk.get(g.gamePk) ?? null))

  // ── final: cache-first, only fetch/aggregate on a cache miss ───────
  const finishedPanels: LiveGamePanel[] = []
  for (const g of finalGames) {
    const cached = finalPanelCache.get(g.gamePk)
    if (cached) {
      finishedPanels.push(cached)
      continue
    }
    const feed = await getLiveFeed(g.gamePk)
    const snap = feed ? buildSnapshot(feed, null) : null
    const panel = buildPanel(toCard(g), snap)
    if (snap) finalPanelCache.set(g.gamePk, panel) // only cache real results, not fetch failures
    finishedPanels.push(panel)
  }

  const payload: LiveTrackerPayload = {
    asOf: new Date().toISOString(),
    panels,
    finishedPanels,
    otherGames: previewGames.map(toCard),
    headlineEvents: computeHeadlineEvents(liveSnapshots),
  }

  return NextResponse.json(payload)
}