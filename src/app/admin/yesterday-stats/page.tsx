// src/app/admin/yesterday-stats/page.tsx
//
// Pulls every Final game from yesterday across three levels — MLB, Triple-A,
// Double-A — and runs each slate through the identical Top3/nugget pipeline.
// compileTop3Stats and compileYesterdayStats are sport-agnostic (they only
// ever touch PostgameReport, never sportId), so no changes needed there.
//
// EXPECTATION: AA/AAA sheets and video pickers will be sparser than MLB's.
// Statcast (pitch velo, spin rate, exit velo, batted-ball distance) is not
// reliably present outside MLB parks, so any category sourced from
// GameSuperlatives/battedBalls/pitchLog will likely show "No qualifying
// performance" for most minor-league games, and the video picker will show
// fewer populated categories to choose from. Boxscore-derived categories
// (K, RBI, SB, XBH, best starter line, starter strike%, bullpen IP, biggest
// inning, blowout margin) work at any level. This is real data absence, not
// a bug — see compileTop3Stats' empty-state handling.
//
// getGamesForDateAndLevel's AAA/AA sportId values (11 / 12) are UNVERIFIED
// against a live response — see the comment on that function in
// mlb-live-feed.ts. If the AAA/AA sections come back completely empty on a
// date you know had games, that's the first thing to check, before
// assuming the aggregation pipeline itself is broken.

import { createAdminClient } from '@/lib/supabase'
import {
  getGamesForDateAndLevel,
  getLiveFeed,
  SPORT_ID_MLB,
  SPORT_ID_AAA,
  SPORT_ID_AA,
} from '@/lib/mlb-live-feed'
import { aggregateGameFeed } from '@/lib/postgame-aggregate'
import { compileYesterdayStats } from '@/lib/yesterday-stats'
import { compileTop3Stats } from '@/lib/top3-stats'
import { YesterdayStatsView } from '@/components/admin/YesterdayStatsView'
import Top3StatsSheet from '@/components/admin/Top3StatsSheet'
import VideoExportPanel from '@/components/admin/VideoExportPanel'
import type { PostgameReport } from '@/types/postgame'
import type { Top3StatsPayload } from '@/types/live-tracker'

const supa = createAdminClient()

function yesterdayDate(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function SectionHeader({ title, tag }: { title: string; tag: string }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'baseline', gap: 10,
        borderBottom: '1px solid #1A1A1A1a', paddingBottom: 8, marginBottom: 16,
      }}
    >
      <span style={{ color: '#FF5722', fontSize: 18 }}>§</span>
      <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontWeight: 600, fontSize: 20, letterSpacing: '-0.3px' }}>
        {title}
      </h2>
      <span
        style={{
          marginLeft: 'auto', fontSize: 10, textTransform: 'uppercase',
          letterSpacing: '1.5px', color: '#6b6b66', fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        {tag}
      </span>
    </div>
  )
}

/** Same cache-first, live-feed-fallback logic used for MLB, now reused for
 *  any sportId — the cache table is keyed on gamePk, which is globally
 *  unique across levels, so no schema change needed there either. The
 *  .in('game_pk', ...) filter is a defensive guard against a shared cache
 *  table returning cross-level rows on the same date, not a confirmed
 *  collision risk — drop it if it proves unnecessary overhead. */
async function buildReportsForLevel(
  date: string,
  sportId: number,
): Promise<{ reports: PostgameReport[]; missing: number }> {
  const slate = await getGamesForDateAndLevel(date, sportId)
  const finalGames = slate.filter(g => g.status === 'Final')

  const { data: cached } = await supa
    .from('game_postgame_reports')
    .select('game_pk, report_data')
    .eq('game_date', date)
    .in('game_pk', finalGames.map(g => g.gamePk))

  const cachedByPk = new Map((cached ?? []).map(row => [row.game_pk, row.report_data as PostgameReport]))

  const reports: PostgameReport[] = []
  let missing = 0

  for (const g of finalGames) {
    const fromCache = cachedByPk.get(g.gamePk)
    if (fromCache) {
      reports.push(fromCache)
      continue
    }
    const feed = await getLiveFeed(g.gamePk)
    const aggregated = feed ? aggregateGameFeed(feed, `fallback-${g.gamePk}`) : null
    if (aggregated) reports.push(aggregated)
    else missing += 1
  }

  return { reports, missing }
}

export default async function YesterdayStatsPage() {
  const date = yesterdayDate()

  const [mlb, aaa, aa] = await Promise.all([
    buildReportsForLevel(date, SPORT_ID_MLB),
    buildReportsForLevel(date, SPORT_ID_AAA),
    buildReportsForLevel(date, SPORT_ID_AA),
  ])

  const mlbTop3: Top3StatsPayload = compileTop3Stats(mlb.reports, date, mlb.missing)
  const aaaTop3: Top3StatsPayload = compileTop3Stats(aaa.reports, date, aaa.missing)
  const aaTop3: Top3StatsPayload = compileTop3Stats(aa.reports, date, aa.missing)

  const mlbNuggets = compileYesterdayStats(mlb.reports, date, mlb.missing)

  return (
    <main style={{ background: '#FAF8F3', minHeight: '100vh', padding: '24px 16px 80px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* ── TOP 3 STAT SHEETS ─────────────────────────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <SectionHeader title="Top 3 stat sheet — MLB" tag={`${mlb.reports.length} games · A4 · PDF export`} />
          <Top3StatsSheet payload={mlbTop3} levelLabel="yesterday's stats · MLB" />
        </section>

        <section style={{ marginBottom: 40 }}>
          <SectionHeader title="Top 3 stat sheet — Triple-A" tag={`${aaa.reports.length} games · sparser without Statcast`} />
          <Top3StatsSheet payload={aaaTop3} levelLabel="yesterday's stats · AAA" />
        </section>

        <section style={{ marginBottom: 40 }}>
          <SectionHeader title="Top 3 stat sheet — Double-A" tag={`${aa.reports.length} games · sparser without Statcast`} />
          <Top3StatsSheet payload={aaTop3} levelLabel="yesterday's stats · AA" />
        </section>

        {/* ── VIDEO EXPORT ──────────────────────────────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <SectionHeader title="Video export — MLB" tag="vertical 9:16 · single stat or reel · MP4" />
          <VideoExportPanel payload={mlbTop3} />
        </section>

        <section style={{ marginBottom: 40 }}>
          <SectionHeader title="Video export — Triple-A" tag="vertical 9:16 · single stat or reel · MP4" />
          <VideoExportPanel payload={aaaTop3} />
        </section>

        <section style={{ marginBottom: 40 }}>
          <SectionHeader title="Video export — Double-A" tag="vertical 9:16 · single stat or reel · MP4" />
          <VideoExportPanel payload={aaTop3} />
        </section>

        {/* ── FULL NUGGET LIST ──────────────────────────────────────── */}
        <section>
          <SectionHeader title="Full nugget list — MLB" tag="up to 30 · copy per-nugget" />
          <YesterdayStatsView payload={mlbNuggets} />
        </section>
      </div>
    </main>
  )
}