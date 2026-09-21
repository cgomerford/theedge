import {
  getDailyPerformance,
  getTodaysReads,
  buildSnips,
  etDate,
} from '@/lib/admin-dashboard'
import { getTodaysStatCardData } from '@/lib/admin-dashboard-cards'
import { getScoutReportBundle } from '@/lib/scout-bundle'
import { getYesterdaysPerformers, enrichPerformersWithPitchData } from '@/lib/mlb-recap'
import { getAllLevelsTrending } from '@/lib/trending-players'
import YesterdayPerformersSection from '@/components/admin/YesterdayPerformersSection'
import TrendingPlayersSection from '@/components/admin/TrendingPlayersSection'
import TrendingReelSlideshow from '@/components/admin/TrendingReelSlideshow'
import SnipStudio from '@/app/admin/dashboard/SnipStudio'
import StatCardPanel, { type StatCardSourceData } from '@/app/admin/cards/StatCardPanel'
import AdminDataRoomSection from '@/components/admin/AdminDataRoomSection'
import AllGamesStorySlideshow from '@/components/admin/AllGamesStorySlideshow'
import { getScheduleForDate } from '@/lib/mlb'
import { css } from '@/app/admin/admin-css'
import PostGameXCardSection from '@/components/admin/PostGameXCardSection'
export const dynamic = 'force-dynamic'

async function getFinalGamePks(date: string): Promise<number[]> {
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`
  try {
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.dates?.[0]?.games ?? [])
      .filter((g: any) => g.status?.abstractGameState === 'Final')
      .map((g: any) => g.gamePk as number)
  } catch (err) {
    console.error(`getFinalGamePks failed for ${date}:`, err)
    return []
  }
}

export default async function AdminArchive({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const slateDate = date || etDate(0)

  const today = etDate(0)
  const yesterday = (() => {
    const d = new Date(`${today}T12:00:00`)
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })()

  const trendingPromise = getAllLevelsTrending(5)

  const [yesterdayFinals, todayFinals] = await Promise.all([
    getFinalGamePks(yesterday),
    getFinalGamePks(today),
  ])

  const hasTodayFinals = todayFinals.length > 0

  const modelPerfDate = (() => {
    const d = new Date(`${slateDate}T12:00:00`)
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })()

  const [perf, reads] = await Promise.all([
    getDailyPerformance(modelPerfDate),
    getTodaysReads(slateDate),
  ])

  const gamesWithReports = await Promise.all(
    reads.map(async (r) => {
      const bundle = await getScoutReportBundle(r.game_pk)

      const parts = r.matchup.split(/@|vs/i).map((s) => s.trim())
      const awayAbbr = parts[0] || 'AWAY'
      const homeAbbr = parts[1] || 'HOME'

      if (!bundle) {
        return {
          ...r,
          report: null,
          awayAbbr,
          homeAbbr,
          awayName: awayAbbr,
          homeName: homeAbbr,
          awayColor: '#FF5722',
          homeColor: '#1A1A1A',
          awayPitcherName: 'TBD',
          homePitcherName: 'TBD',
          awayPitcherHotZones: {},
          homePitcherHotZones: {},
          awayPitcherArsenalZones: {},
          homePitcherArsenalZones: {},
          awayLineupZones: [],
          homeLineupZones: [],
          awayLineupSpray: [],
          homeLineupSpray: [],
          awayPitcherTTO: null,
          homePitcherTTO: null,
          awayPitcherThrows: 'R' as const,
          homePitcherThrows: 'R' as const,
          awayLineupSize: 0,
          homeLineupSize: 0,
        }
      }

      return { ...r, ...bundle }
    })
  )

  const snips = await buildSnips(reads, perf)

  const cardData = await getTodaysStatCardData(slateDate)

  const { batters: rawYBatters, pitchers: rawYPitchers } =
    await getYesterdaysPerformers(yesterday, 5)

  const { batters: yBatters, pitchers: yPitchers } =
    await enrichPerformersWithPitchData(
      rawYBatters.available ? rawYBatters.items : [],
      rawYPitchers.available ? rawYPitchers.items : [],
      yesterdayFinals
    )

  let tBatters: typeof yBatters = []
  let tPitchers: typeof yPitchers = []

  if (hasTodayFinals) {
    const { batters: rawTBatters, pitchers: rawTPitchers } =
      await getYesterdaysPerformers(today, 5)

    const enriched = await enrichPerformersWithPitchData(
      rawTBatters.available ? rawTBatters.items : [],
      rawTPitchers.available ? rawTPitchers.items : [],
      todayFinals
    )
    tBatters = enriched.batters
    tPitchers = enriched.pitchers
  }

  const graded_performers: StatCardSourceData['graded_performers'] = [
    ...(hasTodayFinals ? tBatters : yBatters).map((b) => ({
      role: 'batter' as const,
      player_name: b.name,
      team_abbr: b.teamAbbr,
      line: b.line,
      grade: b.grade,
      score: b.score,
    })),
    ...(hasTodayFinals ? tPitchers : yPitchers).map((p) => ({
      role: 'pitcher' as const,
      player_name: p.name,
      team_abbr: p.teamAbbr,
      line: p.line,
      grade: p.grade,
      score: p.score,
    })),
  ]

  const cardDataWithGrades: StatCardSourceData = {
    ...cardData,
    graded_performers,
  }

  const trending = await trendingPromise

  const [yesterdaySchedule, todaySchedule] = await Promise.all([
    getScheduleForDate(yesterday),
    getScheduleForDate(today),
  ])
  const finishedGameOptions = [...yesterdaySchedule, ...todaySchedule]
    .filter(g => g.status?.abstractGameState === 'Final')
    .map(g => ({
      gamePk: g.gamePk,
      matchup: `${g.teams.away.team.abbreviation ?? g.teams.away.team.name} @ ${g.teams.home.team.abbreviation ?? g.teams.home.team.name}`,
    }))

  const gradeLookup = new Map<string, string>(
    graded_performers.map(p => [`${p.player_name}|${p.team_abbr}`, p.grade])
  )

  const reelTrending = {
    mlb: trending.mlb.batters,
    aaa: trending.aaa.batters,
    aa: trending.aa.batters,
  }

  const fmtDate = (s: string) =>
    new Date(`${s}T12:00:00`).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })

  return (
    <main className="admin">
      <style>{css}</style>

      <div className="wrap">
        {/* ── TOPBAR ─────────────────────────────────────── */}
        <div className="topbar">
          <div className="brand">
            <span className="mark">⊕</span> THE EDGE <span className="sub">/ admin / archive</span>
          </div>
          <div className="topmeta">
            Slate {fmtDate(slateDate)} · <a href="/admin/dashboard" style={{ color: 'inherit' }}>← Dashboard</a>
          </div>
        </div>

        {/* ── ROW 1: Performance + Reads ─────────────────── */}
        <div className="row row-2">
          <section className="sec card">
            <div className="sechead">
              <span className="glyph">§</span>
              <h2>Yesterday&rsquo;s performance</h2>
              <span className="tag">{fmtDate(perf.date)} · internal</span>
            </div>

            {perf.graded === 0 ? (
              <div className="empty">
                No graded games for {fmtDate(perf.date)} yet — the grading cron may still be running.
              </div>
            ) : (
              <div className="yday">
                <div className="record">
                  {perf.wins}–{perf.losses}
                  <small>reads that aligned</small>
                </div>
                <div className="ydstats">
                  <div className="stat">
                    <div className="n">
                      {perf.alignment_percent != null
                        ? `${Math.round(perf.alignment_percent)}%`
                        : '—'}
                    </div>
                    <div className="l">alignment (n={perf.graded})</div>
                  </div>
                  <div className="stat">
                    <div className="n">
                      {perf.strong_hit} / {perf.strong_total}
                    </div>
                    <div className="l">strong leans hit</div>
                  </div>
                  <div className="stat">
                    <div className="n">
                      {perf.avg_factors_on_wins != null
                        ? `${perf.avg_factors_on_wins.toFixed(1)}/8`
                        : '—'}
                    </div>
                    <div className="l">avg factors on wins</div>
                  </div>
                  <div className="stat">
                    <div className="n">{perf.tossups}</div>
                    <div className="l">toss-ups</div>
                  </div>
                  {(perf.best || perf.worst) && (
                    <div className="extremes">
                      {perf.best && (
                        <div>
                          <span className="ok">BEST ⊕</span> {perf.best.matchup}{' '}
                          {perf.best.factor_count}/8 — {perf.best.detail}
                        </div>
                      )}
                      {perf.worst && (
                        <div>
                          <span className="miss">MISS ⊕</span> {perf.worst.matchup}{' '}
                          {perf.worst.factor_count}/8 — {perf.worst.detail}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="sec card">
            <div className="sechead">
              <span className="glyph">§</span>
              <h2>Today&rsquo;s reads</h2>
              <span className="tag">ranked by lean strength</span>
            </div>

            {reads.length === 0 ? (
              <div className="empty">No reads generated for {fmtDate(slateDate)} yet.</div>
            ) : (
              <div className="reads-list">
                {reads.map((r, i) => (
                  <div
                    key={r.game_pk}
                    className={`read${i === 0 && !r.near_split ? ' top' : ''}`}
                  >
                    <div className="rank">{i + 1}</div>
                    <div>
                      <div className="matchup">{r.matchup}</div>
                      <div className="submeta">
                        {i === 0 && !r.near_split && (
                          <span className="star">★ Edge of the Day · </span>
                        )}
                        led by {r.dominant_factor}
                        {' · '}
                        {r.lineups_confirmed ? (
                          <span className="lin-ok">✓ lineups confirmed</span>
                        ) : (
                          <span className="lin-wait">⧗ lineups pending</span>
                        )}
                      </div>
                    </div>
                    <div className="edge">
                      {r.factor_count}/8
                      <small>{r.lean_team}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── ROW 2: Performers ──────────────────────────── */}
        <div className={`row ${hasTodayFinals ? 'row-2' : 'row-1'}`}>
          <section className="sec card">
            <div className="sechead">
              <span className="glyph">§</span>
              <h2>Yesterday’s top performers</h2>
              <span className="tag">graded · pitch data · {fmtDate(yesterday)}</span>
            </div>
            <YesterdayPerformersSection
              batters={yBatters}
              pitchers={yPitchers}
              dateLabel={fmtDate(yesterday)}
            />
          </section>

          {hasTodayFinals && (
            <section className="sec card">
              <div className="sechead">
                <span className="glyph">§</span>
                <h2>Today’s top performers</h2>
                <span className="tag">graded · pitch data · {fmtDate(today)} · live</span>
              </div>
              <YesterdayPerformersSection
                batters={tBatters}
                pitchers={tPitchers}
                dateLabel={fmtDate(today)}
              />
            </section>
          )}
        </div>

        {/* ── ROW 3: Trending ────────────────────────────── */}
        <div className="row row-2">
          <section className="sec card">
            <div className="sechead">
              <span className="glyph">§</span>
              <h2>Trending players</h2>
              <span className="tag">true last 14 games · MLB · AAA · AA</span>
            </div>
            <TrendingPlayersSection trending={trending} />
          </section>

          <section className="sec card">
            <div className="sechead">
              <span className="glyph">§</span>
              <h2>Trending Reel</h2>
              <span className="tag">animated · 9:16 · export per league</span>
            </div>
            <TrendingReelSlideshow trending={reelTrending} />
          </section>
        </div>

        {/* ── FULL WIDTH: Scout Stories ──────────────────── */}
        <section className="sec card">
          <div className="sechead">
            <span className="glyph">§</span>
            <h2>Scout Stories</h2>
            <span className="tag">real report sections · animated · 9:16</span>
          </div>
          <AllGamesStorySlideshow games={gamesWithReports} slateDate={slateDate} />
        </section>

        {/* ── ROW 4: X tools ─────────────────────────────── */}
        <div className="row row-2">
          <section className="sec card">
            <div className="sechead">
              <span className="glyph">§</span>
              <h2>Post-Game X Cards</h2>
              <span className="tag">pitcher / batter · 4:5 export</span>
            </div>
            <PostGameXCardSection games={finishedGameOptions} gradeLookup={gradeLookup} />
          </section>

          <section className="sec card">
            <div className="sechead">
              <span className="glyph">§</span>
              <h2>Pre-game data room</h2>
              <span className="tag">rolling stats · MLB Stats API · raw model OK</span>
            </div>
            <AdminDataRoomSection
              reads={reads.map((r) => ({ game_pk: r.game_pk, matchup: r.matchup }))}
            />
          </section>
        </div>

        {/* ── FULL WIDTH: Snip Studio ────────────────────── */}
        <SnipStudio snips={snips} />

        {/* ── FULL WIDTH: Player Stat Cards ──────────────── */}
        <section className="sec card">
          <div className="sechead">
            <span className="glyph">§</span>
            <h2>Player stat cards</h2>
            <span className="tag">image export · player-level, not model output</span>
          </div>
          <StatCardPanel data={cardDataWithGrades} />
        </section>

        <div className="footnote">
          ⊕ Internal tool — guarded, not indexed. The <b>Yesterday</b> box is your honest scoreboard (your eyes only).
        </div>
      </div>
    </main>
  )
}
