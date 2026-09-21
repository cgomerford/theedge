// src/app/admin/dashboard/page.tsx
//
// 2026-09-21: the dashboard is now just the two things George publishes from
// daily — the Game Preview Teaser video and the Scout Report Graphic builder.
// Everything else moved, unchanged, to /admin/archive.

import { getTodaysReads, etDate } from '@/lib/admin-dashboard'
import { getScoutReportBundle } from '@/lib/scout-bundle'
import GamePreviewTeaser from '@/components/admin/GamePreviewTeaser'
import GamePreviewBuilder from '@/components/admin/game-preview/GamePreviewBuilder'
import ScoutGraphicBuilder, { type BuilderGame, type BuilderPitcherSide, type BuilderRosterBatter } from '@/components/admin/scout-graphic/ScoutGraphicBuilder'
import type { RichArsenalPitch } from '@/components/PitchLocationCard'
import { getScheduleForDate, getPitcherRecentStarts } from '@/lib/mlb'
import { getPitcherStatsFull } from '@/lib/pitcher-full-stats'
import { getPitcherMinorsProfile } from '@/lib/pitcher-minors-profile'
import { createAdminClient } from '@/lib/supabase'
import { css } from '@/app/admin/admin-css'

export const dynamic = 'force-dynamic'

async function getRosterBatters(teamId: number | null): Promise<BuilderRosterBatter[]> {
  if (!teamId) return []
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=Active`, { next: { revalidate: 3600 } })
    if (!res.ok) {
      console.error(`[getRosterBatters] MLB roster HTTP ${res.status} for team ${teamId}`)
      return []
    }
    const data = await res.json()
    return (data.roster ?? [])
      .filter((p: any) => p.position?.abbreviation !== 'P')
      .map((p: any) => ({ id: p.person.id as number, name: p.person.fullName as string }))
  } catch (err) {
    console.error(`[getRosterBatters] fetch failed for team ${teamId}:`, err)
    return []
  }
}

// pitch_arsenals numeric columns come back from Supabase as strings — coerce.
function num(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

async function getRichArsenal(pitcherId: number | null): Promise<RichArsenalPitch[]> {
  if (!pitcherId) return []
  const { data, error } = await createAdminClient()
    .from('pitch_arsenals')
    .select('pitch_type, pitch_name, percentage, count, avg_velocity, whiff_percent, put_away_percent, est_woba, hard_hit_percent, ba_against')
    .eq('player_id', pitcherId)
    .eq('season', new Date().getFullYear())
  if (error) {
    console.error('[getRichArsenal] Supabase error:', error.message)
    return []
  }
  return ((data ?? []) as Record<string, any>[]).map(r => ({
    pitch_type: String(r.pitch_type),
    pitch_name: r.pitch_name ?? null,
    percentage: num(r.percentage),
    count: num(r.count),
    avg_velocity: num(r.avg_velocity),
    whiff_percent: num(r.whiff_percent),
    put_away_percent: num(r.put_away_percent),
    est_woba: num(r.est_woba),
    hard_hit_percent: num(r.hard_hit_percent),
    ba_against: num(r.ba_against),
  }))
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const slateDate = date || etDate(0)

  const reads = await getTodaysReads(slateDate)

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

  const slateSchedule = await getScheduleForDate(slateDate)

  const builderGames: BuilderGame[] = await Promise.all(
    gamesWithReports.map(async (g) => {
      const sched = slateSchedule.find(sg => sg.gamePk === g.game_pk)
      const awayTeamId = sched?.teams.away.team.id ?? null
      const homeTeamId = sched?.teams.home.team.id ?? null
      const awayPid = sched?.teams.away.probablePitcher?.id ?? null
      const homePid = sched?.teams.home.probablePitcher?.id ?? null

      const [awayFull, homeFull, awayArsenal, homeArsenal, awayLast3, homeLast3, awayRoster, homeRoster] = await Promise.all([
        awayPid ? getPitcherStatsFull(awayPid) : Promise.resolve(null),
        homePid ? getPitcherStatsFull(homePid) : Promise.resolve(null),
        getRichArsenal(awayPid),
        getRichArsenal(homePid),
        awayPid ? getPitcherRecentStarts(awayPid, 3) : Promise.resolve([]),
        homePid ? getPitcherRecentStarts(homePid, 3) : Promise.resolve([]),
        getRosterBatters(awayTeamId),
        getRosterBatters(homeTeamId),
      ])

      // A starter with no 2026 MLB rows at all (call-up / rehab ramp-up) gets a
      // clearly-labelled minor-league profile instead of blanks. Only fetched
      // for those pitchers, so most slates make zero extra calls.
      const noMlb = (pid: number | null, full: typeof awayFull, arsenal: RichArsenalPitch[]) => !!pid && !full && arsenal.length === 0
      const [awayMinors, homeMinors] = await Promise.all([
        noMlb(awayPid, awayFull, awayArsenal) ? getPitcherMinorsProfile(awayPid!) : Promise.resolve(null),
        noMlb(homePid, homeFull, homeArsenal) ? getPitcherMinorsProfile(homePid!) : Promise.resolve(null),
      ])

      const side = (
        id: number | null,
        name: string,
        throws: 'L' | 'R',
        full: Awaited<ReturnType<typeof getPitcherStatsFull>>,
        last3: BuilderPitcherSide['last3'],
        arsenal: RichArsenalPitch[],
        hotZones: BuilderPitcherSide['hotZones'],
        minors: Awaited<ReturnType<typeof getPitcherMinorsProfile>>,
      ): BuilderPitcherSide => minors
        ? { id, name, throws, stats: minors.stats, last3: minors.last3, arsenal: minors.arsenal, hotZones: minors.hotZones, levelLabel: minors.levelLabel }
        : {
            id,
            name,
            throws,
            stats: full ? {
              era: full.era, whip: full.whip, k_per_9: full.k_per_9, bb_per_9: full.bb_per_9, l3_era: full.l3_era,
              fip: full.fip,
              tto: full.tto1_woba != null || full.tto2_woba != null || full.tto3_woba != null
                ? { woba: [full.tto1_woba, full.tto2_woba, full.tto3_woba], pa: [full.tto1_pa, full.tto2_pa, full.tto3_pa] }
                : null,
            } : null,
            last3,
            arsenal,
            hotZones,
            levelLabel: null,
          }

      return {
        gamePk: g.game_pk,
        matchup: g.matchup,
        awayAbbr: g.awayAbbr,
        homeAbbr: g.homeAbbr,
        awayTeamId,
        homeTeamId,
        awayColor: g.awayColor,
        homeColor: g.homeColor,
        venueId: sched?.venue?.id ?? null,
        venueName: sched?.venue?.name ?? '',
        firstPitch: sched?.gameDate
          ? `${new Date(sched.gameDate).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET`
          : '',
        away: side(awayPid, g.awayPitcherName, g.awayPitcherThrows, awayFull, awayLast3, awayArsenal, g.awayPitcherHotZones, awayMinors),
        home: side(homePid, g.homePitcherName, g.homePitcherThrows, homeFull, homeLast3, homeArsenal, g.homePitcherHotZones, homeMinors),
        awayRoster,
        homeRoster,
      }
    })
  )

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
        <div className="topbar">
          <div className="brand">
            <span className="mark">⊕</span> THE EDGE <span className="sub">/ admin</span>
          </div>
          <div className="topmeta">
            Slate {fmtDate(slateDate)} · <a href="/admin/archive" style={{ color: 'inherit' }}>Archive →</a>
          </div>
        </div>

        <section className="sec card">
          <div className="sechead">
            <span className="glyph">§</span>
            <h2>Game Preview Teaser</h2>
            <span className="tag">SP · team numbers · bullpen · 9:16 · fast cut</span>
          </div>
          <GamePreviewTeaser games={gamesWithReports} slateDate={slateDate} />
        </section>

        <section className="sec card">
          <div className="sechead">
            <span className="glyph">§</span>
            <h2>Scout Report Graphic</h2>
            <span className="tag">X post · 4:5 · pitcher + key-matchup zone overlay</span>
          </div>
          <ScoutGraphicBuilder games={builderGames} slateDate={slateDate} />
        </section>

        <section className="sec card">
          <div className="sechead">
            <span className="glyph">§</span>
            <h2>Game Preview Graphic</h2>
            <span className="tag">X post · 4:5 · starting pitchers head to head</span>
          </div>
          <GamePreviewBuilder games={builderGames} slateDate={slateDate} />
        </section>

        <div className="footnote">
          ⊕ Internal tool — guarded, not indexed. Performance, reads, performers, trending, stories, post-game cards and stat cards live in the <a href="/admin/archive" style={{ color: 'inherit' }}>archive</a>.
        </div>
      </div>
    </main>
  )
}
