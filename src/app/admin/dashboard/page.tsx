import {
  getDailyPerformance,
  getTodaysReads,
  buildSnips,
  etDate,
} from '@/lib/admin-dashboard'
import { getTodaysStatCardData } from '@/lib/admin-dashboard-cards'
import { getScoutReportLineup } from '@/lib/scout-report-lineup'
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
import ScoutReportGraphicSection, { type ScoutGraphicGame } from '@/components/admin/ScoutReportGraphicSection'
import { getScheduleForDate } from '@/lib/mlb'
import PostGameXCardSection from '@/components/admin/PostGameXCardSection'
import { getPitcherStatsFull } from '@/lib/pitcher-full-stats'
import { getPitcherRecentStarts } from '@/lib/mlb'
import { createAdminClient } from '@/lib/supabase'
export const dynamic = 'force-dynamic'

async function getFinalGamePks(date: string): Promise<number[]> {
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`
  const res = await fetch(url, { next: { revalidate: 300 } })
  if (!res.ok) return []
  const data = await res.json()
  return (data.dates?.[0]?.games ?? [])
    .filter((g: any) => g.status?.abstractGameState === 'Final')
    .map((g: any) => g.gamePk as number)
}

async function getRosterBatters(teamId: number | null): Promise<{ id: number; name: string }[]> {
  if (!teamId) return []
  try {
    const url = `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=Active`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.roster ?? [])
      .filter((p: any) => p.position?.abbreviation !== 'P')
      .map((p: any) => ({ id: p.person.id, name: p.person.fullName }))
  } catch (err) {
    console.error(`Roster fetch failed for team ${teamId}:`, err)
    return []
  }
}

async function getTrendingBatters(teamId: number | null): Promise<{ playerId: number; playerName: string; note: string }[]> {
  if (!teamId) return []
  try {
    const supa = createAdminClient()
    const today = new Date().toISOString().split('T')[0]

    const teamRes = await fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}`)
    if (!teamRes.ok) return []
    const teamData = await teamRes.json()
    const teamName: string = teamData.teams?.[0]?.name ?? ''
    if (!teamName) return []
    const shortName = teamName.split(' ').slice(-1)[0]

    let { data } = await supa.from('player_form_signals')
      .select('player_id, player_name, signal, metric, current_value, magnitude, avg, games')
      .eq('computed_date', today).eq('player_type', 'batter')
      .ilike('team_name', `%${shortName}%`)
      .order('magnitude', { ascending: false }).limit(10)

    if (!data || data.length === 0) {
      const fallback = await supa.from('player_form_signals')
        .select('player_id, player_name, signal, metric, current_value, magnitude, avg, games')
        .lt('computed_date', today).eq('player_type', 'batter')
        .ilike('team_name', `%${shortName}%`)
        .order('computed_date', { ascending: false })
        .order('magnitude', { ascending: false }).limit(10)
      data = fallback.data
    }

    const byPlayer = new Map<number, any>()
    for (const r of data ?? []) {
      const existing = byPlayer.get(r.player_id)
      if (!existing || r.magnitude > existing.magnitude) byPlayer.set(r.player_id, r)
    }
    const deduped = Array.from(byPlayer.values())
      .sort((a, b) => b.magnitude - a.magnitude)
      .slice(0, 3)

    return deduped.map((r: any) => ({
      playerId: r.player_id,
      playerName: r.player_name,
      note: r.avg != null && r.games != null
        ? `${Number(r.avg).toFixed(3).replace(/^0/, '')} over last ${r.games} games`
        : `${r.signal ?? 'trending'} — ${r.metric ?? ''}`,
    }))
  } catch (err) {
    console.error(`Trending batters fetch failed for team ${teamId}:`, err)
    return []
  }
}

async function getRecentLineupFallback(teamId: number | null): Promise<{ playerId: number; playerName: string; avg: number | null }[]> {
  if (!teamId) return []
  try {
    const today = new Date().toISOString().slice(0, 10)
    const lookback = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const schedUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&startDate=${lookback}&endDate=${today}`
    const schedRes = await fetch(schedUrl, { next: { revalidate: 1800 } })
    if (!schedRes.ok) return []
    const schedData = await schedRes.json()

    const finishedGames: { gamePk: number; date: string }[] = []
    for (const d of schedData.dates ?? []) {
      for (const g of d.games ?? []) {
        if (g.status?.abstractGameState === 'Final') {
          finishedGames.push({ gamePk: g.gamePk, date: g.officialDate ?? d.date })
        }
      }
    }
    if (finishedGames.length === 0) return []
    finishedGames.sort((a, b) => b.date.localeCompare(a.date))
    const mostRecent = finishedGames[0]

    const boxUrl = `https://statsapi.mlb.com/api/v1/game/${mostRecent.gamePk}/boxscore`
    const boxRes = await fetch(boxUrl, { next: { revalidate: 21600 } })
    if (!boxRes.ok) return []
    const box = await boxRes.json()

    const homeId = box.teams?.home?.team?.id
    const side = homeId === teamId ? 'home' : 'away'
    const teamBox = box.teams?.[side]
    if (!teamBox) return []

    const battingOrderIds: number[] = (teamBox.battingOrder ?? []).filter((id: number) => id != null)
    const players = teamBox.players ?? {}

    return battingOrderIds.map((pid: number) => {
      const p = players[`ID${pid}`]
      const avgRaw = p?.seasonStats?.batting?.avg
      return {
        playerId: pid,
        playerName: p?.person?.fullName ?? 'Unknown',
        avg: avgRaw != null ? Number(avgRaw) : null,
      }
    })
  } catch (err) {
    console.error(`Recent lineup fallback failed for team ${teamId}:`, err)
    return []
  }
}

export default async function AdminDashboard({
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

  const slateSchedule = await getScheduleForDate(slateDate)
  const _scoutSeason = new Date().getFullYear()
  const _adminSupa = createAdminClient()

  const scoutGraphicGames: ScoutGraphicGame[] = await Promise.all(
    gamesWithReports.map(async (g) => {
      const scheduleMatch = slateSchedule.find(sg => sg.gamePk === g.game_pk)
      const awayTeamId = scheduleMatch?.teams.away.team.id ?? null
      const homeTeamId = scheduleMatch?.teams.home.team.id ?? null
      const awayPitcherId = scheduleMatch?.teams.away.probablePitcher?.id ?? null
      const homePitcherId = scheduleMatch?.teams.home.probablePitcher?.id ?? null

      const [
        awayFullStats, homeFullStats, awayTeamRow, homeTeamRow, awayArsenalRes, homeArsenalRes,
        awayLineupResult, homeLineupResult,
      ] = await Promise.all([
        awayPitcherId ? getPitcherStatsFull(awayPitcherId) : Promise.resolve(null),
        homePitcherId ? getPitcherStatsFull(homePitcherId) : Promise.resolve(null),
        awayTeamId ? _adminSupa.from('team_stats').select('bullpen_era, ops_l30, risp_avg').eq('team_id', awayTeamId).single() : Promise.resolve({ data: null }),
        homeTeamId ? _adminSupa.from('team_stats').select('bullpen_era, ops_l30, risp_avg').eq('team_id', homeTeamId).single() : Promise.resolve({ data: null }),
        awayPitcherId
          ? _adminSupa.from('pitch_arsenals').select('pitch_type, pitch_name, percentage, count, avg_velocity, whiff_percent, put_away_percent, est_woba, hard_hit_percent, ba_against').eq('player_id', awayPitcherId).eq('season', _scoutSeason)
          : Promise.resolve({ data: [] }),
        homePitcherId
          ? _adminSupa.from('pitch_arsenals').select('pitch_type, pitch_name, percentage, count, avg_velocity, whiff_percent, put_away_percent, est_woba, hard_hit_percent, ba_against').eq('player_id', homePitcherId).eq('season', _scoutSeason)
          : Promise.resolve({ data: [] }),
        awayTeamId
          ? getScoutReportLineup(awayTeamId, slateDate, g.game_pk)
          : Promise.resolve({ batters: [], isFallback: false }),
        homeTeamId
          ? getScoutReportLineup(homeTeamId, slateDate, g.game_pk)
          : Promise.resolve({ batters: [], isFallback: false }),
      ])

      return {
        gamePk: g.game_pk,
        matchup: g.matchup,
        awayAbbr: g.awayAbbr,
        homeAbbr: g.homeAbbr,
        awayTeamId,
        homeTeamId,
        awayColor: g.awayColor,
        homeColor: g.homeColor,
        awayPitcherId,
        homePitcherId,
        awayPitcherName: g.awayPitcherName,
        homePitcherName: g.homePitcherName,
        awayPitcherHotZones: g.awayPitcherHotZones,
        homePitcherHotZones: g.homePitcherHotZones,
        awayPitcherArsenalZones: g.awayPitcherArsenalZones,
        homePitcherArsenalZones: g.homePitcherArsenalZones,
        awayPitcherRichArsenal: (awayArsenalRes?.data ?? []) as any,
        homePitcherRichArsenal: (homeArsenalRes?.data ?? []) as any,
        awayRosterBatters: await getRosterBatters(awayTeamId),
        homeRosterBatters: await getRosterBatters(homeTeamId),
        awayPitcherLast3: awayPitcherId ? await getPitcherRecentStarts(awayPitcherId, 3) : [],
        homePitcherLast3: homePitcherId ? await getPitcherRecentStarts(homePitcherId, 3) : [],
        awayLineup: awayLineupResult.batters,
        homeLineup: homeLineupResult.batters,
        awayLineupIsFallback: awayLineupResult.isFallback,
        homeLineupIsFallback: homeLineupResult.isFallback,
        awayTrending: awayTeamId ? await getTrendingBatters(awayTeamId) : [],
        homeTrending: homeTeamId ? await getTrendingBatters(homeTeamId) : [],
        awayRolling: (awayFullStats || awayTeamRow?.data) ? {
          sp_era: awayFullStats?.era ?? null,
          bullpen_era: (awayTeamRow?.data as any)?.bullpen_era ?? null,
          ops_l30: (awayTeamRow?.data as any)?.ops_l30 ?? null,
          risp_avg: (awayTeamRow?.data as any)?.risp_avg ?? null,
        } : null,
        homeRolling: (homeFullStats || homeTeamRow?.data) ? {
          sp_era: homeFullStats?.era ?? null,
          bullpen_era: (homeTeamRow?.data as any)?.bullpen_era ?? null,
          ops_l30: (homeTeamRow?.data as any)?.ops_l30 ?? null,
          risp_avg: (homeTeamRow?.data as any)?.risp_avg ?? null,
        } : null,
      }
    })
  )

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
            <span className="mark">⊕</span> THE EDGE <span className="sub">/ admin</span>
          </div>
          <div className="topmeta">Slate {fmtDate(slateDate)}</div>
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

        {/* ── FULL WIDTH: Scout Report Graphic ───────────── */}
        <section className="sec card">
          <div className="sechead">
            <span className="glyph">§</span>
            <h2>Scout Report Graphic</h2>
            <span className="tag">X-post format · rolling numbers / attack-plan / lineup AVG</span>
          </div>
          <ScoutReportGraphicSection games={scoutGraphicGames} />
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

const css = `
.admin {
  background: #FAF8F3;
  color: #1A1A1A;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  min-height: 100vh;
  padding: 0 24px 80px;
}

.admin .wrap {
  max-width: 1480px;
  margin: 0 auto;
}

/* ── Topbar ─────────────────────────────────────── */
.admin .topbar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 3px solid #1A1A1A;
  padding: 24px 0 16px;
  margin-bottom: 28px;
  flex-wrap: wrap;
  gap: 8px;
}
.admin .brand {
  font-family: Fraunces, Georgia, serif;
  font-weight: 900;
  font-size: 28px;
  letter-spacing: -0.5px;
}
.admin .brand .mark { color: #FF5722; }
.admin .brand .sub {
  font-weight: 400;
  font-size: 15px;
  color: #6b6b66;
}
.admin .topmeta {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #6b6b66;
}

/* ── Grid rows ──────────────────────────────────── */
.admin .row {
  display: grid;
  gap: 24px;
  margin-bottom: 24px;
}
.admin .row-1 { grid-template-columns: 1fr; }
.admin .row-2 { grid-template-columns: 1fr 1fr; }

/* ── Section cards ──────────────────────────────── */
.admin .sec {
  margin-bottom: 0;
}
.admin .sec.card {
  background: #fff;
  border: 1px solid #1A1A1A14;
  border-radius: 6px;
  padding: 20px 22px 22px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.admin .sechead {
  display: flex;
  align-items: baseline;
  gap: 10px;
  border-bottom: 1px solid #1A1A1A12;
  padding-bottom: 10px;
  margin-bottom: 16px;
}
.admin .sechead .glyph {
  color: #FF5722;
  font-size: 18px;
}
.admin .sechead h2 {
  font-family: Fraunces, Georgia, serif;
  font-weight: 600;
  font-size: 19px;
  letter-spacing: -0.3px;
  margin: 0;
}
.admin .sechead .tag {
  margin-left: auto;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1.4px;
  color: #6b6b66;
  white-space: nowrap;
}

/* ── Empty state ────────────────────────────────── */
.admin .empty {
  border: 1px dashed #1A1A1A1a;
  padding: 18px;
  font-size: 13px;
  color: #6b6b66;
  background: #fafafa;
  border-radius: 4px;
}

/* ── Yesterday performance ──────────────────────── */
.admin .yday {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 28px;
  align-items: center;
}
.admin .record {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 92px;
  line-height: 0.82;
  letter-spacing: 1px;
}
.admin .record small {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #6b6b66;
  margin-top: 8px;
}
.admin .ydstats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px 20px;
}
.admin .stat .n {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 32px;
  line-height: 1;
  color: #FF5722;
}
.admin .stat .l {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #6b6b66;
  margin-top: 3px;
}
.admin .extremes {
  grid-column: 1 / -1;
  border-top: 1px dashed #1A1A1A1a;
  padding-top: 14px;
  margin-top: 4px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  font-size: 12px;
}
.admin .extremes .ok { color: #15803d; font-weight: 700; }
.admin .extremes .miss { color: #FF5722; font-weight: 700; }

/* ── Reads list ─────────────────────────────────── */
.admin .reads-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 520px;
  overflow-y: auto;
  padding-right: 4px;
}
.admin .read {
  display: grid;
  grid-template-columns: 30px 1fr auto;
  gap: 12px;
  align-items: center;
  border: 1px solid #1A1A1A12;
  border-left: 4px solid #1A1A1A12;
  padding: 11px 13px;
  background: #fafafa;
  border-radius: 3px;
}
.admin .read.top {
  border-left-color: #FF5722;
  background: #fff7f4;
}
.admin .rank {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 24px;
  color: #6b6b66;
  text-align: center;
}
.admin .read.top .rank { color: #FF5722; }
.admin .matchup {
  font-weight: 700;
  font-size: 14px;
}
.admin .submeta {
  font-size: 11px;
  color: #6b6b66;
  margin-top: 2px;
}
.admin .submeta .star {
  color: #FF5722;
  font-weight: 700;
}
.admin .edge {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 32px;
  text-align: right;
  line-height: 1;
}
.admin .edge small {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  letter-spacing: 1px;
  color: #6b6b66;
  text-transform: uppercase;
}
.admin .lin-ok { color: #15803d; }
.admin .lin-wait { color: #6b6b66; }

/* ── Footnote ───────────────────────────────────── */
.admin .footnote {
  font-size: 11px;
  color: #6b6b66;
  border-top: 1px solid #1A1A1A1a;
  padding-top: 16px;
  margin-top: 32px;
  line-height: 1.7;
}

/* ── Responsive ─────────────────────────────────── */
@media (max-width: 1100px) {
  .admin .row-2 {
    grid-template-columns: 1fr;
  }
  .admin .yday {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .admin .record {
    font-size: 76px;
  }
}

@media (max-width: 600px) {
  .admin {
    padding: 0 12px 60px;
  }
  .admin .sec.card {
    padding: 16px;
  }
  .admin .read {
    grid-template-columns: 24px 1fr;
    gap: 8px;
  }
  .admin .edge {
    grid-column: 2;
    text-align: left;
    margin-top: 4px;
  }
  .admin .extremes {
    grid-template-columns: 1fr;
  }
}
`