'use server'

// src/components/admin/story/scoutExtras.ts
//
// Server action the admin player calls when a game is selected. It runs the
// existing Scout Report desks (src/lib/scout/*, imported unchanged) for ONE
// game and returns compact cards. Lives behind /admin's basic-auth proxy.
// Each desk is isolated: one failing desk logs and returns null, never
// blanks the story.
//
// Extra reads (admin Supabase client, both precomputed tables):
//   player_fielding_run_value  → catcher framing / blocking / throwing percentile bars
//   abs_challenge_log          → who challenged, and where every challenged pitch was

import { getAbsDesk } from '@/lib/scout/abs-desk'
import { getClubStatus } from '@/lib/scout/club-status'
import { getDefenseDesk } from '@/lib/scout/defense'
import { getLateInnings } from '@/lib/scout/late-innings'
import { getLeverage } from '@/lib/scout/leverage'
import { getRunGame } from '@/lib/scout/run-game'
import { createAdminClient } from '@/lib/supabase'
import {
  absRegEnd, catcherAbsStats, reduceAbs, reduceArsenal, reduceCatcherBars, reduceClub, reduceDefDesk, reduceLate, reduceRun,
  type AbsLogRow, type FrvRow,
} from './scoutReduce'
import type { Pair, RunCard, ScoutExtras, SeriesState } from './types'

type Req = {
  gamePk: number; gameDate: string
  awayTeamId: number; homeTeamId: number; awayAbbr: string; homeAbbr: string
  awayPitcherId: number | null; homePitcherId: number | null
}

const PAGE = 1000

async function arsenalRows(pitcherId: number | null, season: number): Promise<Record<string, unknown>[] | null> {
  if (!pitcherId) return null
  const { data, error } = await createAdminClient()
    .from('pitch_arsenals')
    .select('pitch_type, pitch_name, percentage, count, avg_velocity, whiff_percent, put_away_percent, hard_hit_percent')
    .eq('player_id', pitcherId).eq('season', season)
  if (error) { console.error('[loadScoutExtras] pitch_arsenals error:', error.message); return null }
  return (data ?? []) as Record<string, unknown>[]
}

async function frvRows(season: number): Promise<FrvRow[] | null> {
  const { data, error } = await createAdminClient()
    .from('player_fielding_run_value')
    .select('player_id, framing_runs, blocking_runs, throwing_runs, outs_2, updated_at')
    .eq('season', season)
  if (error) { console.error('[loadScoutExtras] player_fielding_run_value error:', error.message); return null }
  return (data ?? []) as FrvRow[]
}

/** Paginated (PAGE rows) read of the whole log; there is no game_type column, so the regular season is cut by date later. */
async function absLog(): Promise<AbsLogRow[] | null> {
  const supa = createAdminClient()
  const out: AbsLogRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supa.from('abs_challenge_log')
      .select('game_pk, game_date, challenging_team_id, challenge_side, challenger_player_id, challenger_player_name, batter_id, pitcher_id, is_overturned, plate_x, plate_z, sz_top, sz_bot, sz_width_in')
      .order('play_id').range(offset, offset + PAGE - 1)
    if (error) { console.error('[loadScoutExtras] abs_challenge_log error:', error.message); return out.length ? out : null }
    const rows = (data ?? []) as AbsLogRow[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

async function seriesState(gamePk: number): Promise<SeriesState | null> {
  const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?gamePk=${gamePk}&hydrate=seriesStatus`, { next: { revalidate: 300 } })
  if (!res.ok) { console.error('[loadScoutExtras] seriesStatus HTTP', res.status); return null }
  const g = (await res.json())?.dates?.[0]?.games?.[0]
  const s = g?.seriesStatus
  if (!s || typeof s.wins !== 'number') return null
  return { leaderId: s.winningTeam?.id ?? null, wins: s.wins, losses: s.losses, tied: !!s.isTied, over: !!s.isOver }
}

async function safe<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  try { return await fn() } catch (err) { console.error(`[loadScoutExtras] ${name} failed:`, err); return null }
}

export async function loadScoutExtras(r: Req): Promise<ScoutExtras> {
  const d = r.gameDate
  const season = Number(d.slice(0, 4))
  const [arsA, arsH, runA, runH, absA, absH, clubA, clubH, levA, levH, lateA, lateH, defA, defH, frv, log, series] = await Promise.all([
    safe('arsenal away', () => arsenalRows(r.awayPitcherId, season)),
    safe('arsenal home', () => arsenalRows(r.homePitcherId, season)),
    safe('run away', () => getRunGame(r.awayTeamId, r.homeTeamId, d, r.gamePk, r.homePitcherId)),
    safe('run home', () => getRunGame(r.homeTeamId, r.awayTeamId, d, r.gamePk, r.awayPitcherId)),
    safe('abs away', () => getAbsDesk(r.awayTeamId, r.awayAbbr, d)),
    safe('abs home', () => getAbsDesk(r.homeTeamId, r.homeAbbr, d)),
    safe('club away', () => getClubStatus(r.awayTeamId, d, r.gamePk, r.awayPitcherId)),
    safe('club home', () => getClubStatus(r.homeTeamId, d, r.gamePk, r.homePitcherId)),
    safe('leverage away', () => getLeverage(r.awayTeamId, d)),
    safe('leverage home', () => getLeverage(r.homeTeamId, d)),
    safe('late away', () => getLateInnings(r.awayTeamId, r.homeTeamId, d)),
    safe('late home', () => getLateInnings(r.homeTeamId, r.awayTeamId, d)),
    safe('defense away', () => getDefenseDesk(r.awayTeamId, r.awayAbbr, r.homeTeamId, d, r.gamePk, r.awayPitcherId)),
    safe('defense home', () => getDefenseDesk(r.homeTeamId, r.homeAbbr, r.awayTeamId, d, r.gamePk, r.homePitcherId)),
    safe('frv', () => frvRows(season)),
    safe('abs log', () => absLog()),
    safe('series', () => seriesState(r.gamePk)),
  ])
  const regEnd = absRegEnd(absA, absH)

  // Catcher bars: the catcher each club RUNS ON (away offense → home catcher).
  const withBars = (card: RunCard | null, rg: typeof runA): RunCard | null => {
    if (!card?.catcher || !frv) return card
    const pop = rg?.catcher?.strips.find(s => s.label.startsWith('Pop')) ?? null
    const st = log ? catcherAbsStats(log, regEnd, card.catcher.id) : null
    const bars = reduceCatcherBars({
      id: card.catcher.id, rows: frv, slate: d,
      popStrip: pop && pop.value != null ? { value: pop.value, rank: pop.rank, of: pop.of } : null,
      abs: st?.mine ? { n: st.mine.n, w: st.mine.w } : null, absRank: st?.rank ?? null,
    })
    return { ...card, catcher: { ...card.catcher, bars } }
  }

  const pair = <T,>(a: T | null, h: T | null): Pair<T> => ({ away: a, home: h })
  return {
    series,
    arsenal: pair(reduceArsenal(arsA), reduceArsenal(arsH)),
    run: pair(withBars(reduceRun(runA, r.awayAbbr, r.homeAbbr), runA), withBars(reduceRun(runH, r.homeAbbr, r.awayAbbr), runH)),
    abs: pair(reduceAbs(absA, r.awayAbbr, r.awayTeamId, log, regEnd), reduceAbs(absH, r.homeAbbr, r.homeTeamId, log, regEnd)),
    club: pair(reduceClub(clubA, r.awayAbbr), reduceClub(clubH, r.homeAbbr)),
    late: pair(reduceLate(levA, lateA, r.awayAbbr), reduceLate(levH, lateH, r.homeAbbr)),
    defdesk: pair(reduceDefDesk(defA, r.awayAbbr), reduceDefDesk(defH, r.homeAbbr)),
  }
}
