// src/lib/nfl-edge/league.ts
//
// League-wide desks for the NFL homepage: team quality board (offence vs defence EPA, sack and blitz
// rates), season player leaders, and the coverage desk.
//
// Tables read: nfl_team_form (writer: compute_team_week_splits.py), nfl_player_stats_weekly (sync_players.py),
// nfl_players, nfl_team_scheme_profile (sync_team_scheme_profile.py).
//
// COVERAGE SEASON: nfl_team_scheme_profile is built from nflverse *participation* data, which is not published
// for 2026 yet (load_participation stops at 2025). The desk therefore shows the newest season that has data and
// labels it plainly; nothing is estimated for 2026. Blitz rate comes from FTN charting, which IS available for
// 2026, and is read from nfl_team_form instead.

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase'
import { fetchAll } from './players'
import { ftnRatesOf, leagueRates, teamBlend, type LeagueForm } from './form'

export type TeamBoardRow = {
  id: string
  offEpa: number | null; defEpa: number | null           // EPA/play; defEpa is EPA ALLOWED (lower is better)
  passEpaO: number | null; rushEpaO: number | null
  passEpaD: number | null; rushEpaD: number | null
  explosiveO: number | null
  sackAllowed: number | null; sackGen: number | null
  blitz: number | null                                   // share of opposing dropbacks the defence blitzed (FTN)
  motion: number | null                                  // share of offensive plays with pre-snap motion (FTN)
  paRate: number | null                                  // play-action share of dropbacks (FTN)
  plays: number
  games: number
  usesPrior: boolean
}

export function buildTeamBoard(lf: LeagueForm): TeamBoardRow[] {
  const lr = leagueRates(lf)
  return [...lr.entries()].map(([id, r]) => {
    const b = teamBlend(lf, id)
    const fo = ftnRatesOf(b.ftn_off), fd = ftnRatesOf(b.ftn_def)
    return {
      id, offEpa: r.offEpa, defEpa: r.defEpa, passEpaO: r.passEpaO, rushEpaO: r.rushEpaO, passEpaD: r.passEpaD, rushEpaD: r.rushEpaD,
      explosiveO: r.explosiveO, sackAllowed: r.sackAllowed, sackGen: r.sackGen,
      blitz: fd.blitzGen, motion: fo.motionRate, paRate: fo.paRate, plays: r.plays, games: b.games, usesPrior: b.usesPrior,
    }
  })
}

// ── player leaders ───────────────────────────────────────────────────────────

export type Leader = { id: string; name: string; team: string; headshot: string | null; value: number; sub: string }
export type LeaderBoard = { key: string; title: string; unit: string; rows: Leader[] }
export type Leaders = { season: number; games: number; boards: LeaderBoard[] }

type Row = { player_id: string; player_name: string; team_id: string; position: string; week: number; passing_yards: number | null; passing_tds: number | null; attempts: number | null; passing_epa: number | null; rushing_yards: number | null; carries: number | null; receiving_yards: number | null; receptions: number | null; targets: number | null }

const N = (v: unknown) => (v == null ? 0 : Number(v))

const loadLeaders = unstable_cache(
  async (season: number): Promise<Leaders | null> => {
    const rows = await fetchAll<Row>(
      (a, b) => createAdminClient().from('nfl_player_stats_weekly').select('player_id,player_name,team_id,position,week,passing_yards,passing_tds,attempts,passing_epa,rushing_yards,carries,receiving_yards,receptions,targets').eq('season', season).eq('season_type', 'REG').range(a, b),
      'getPlayerLeaders',
    )
    if (!rows.length) return null
    const by = new Map<string, { name: string; team: string; pos: string; pYds: number; pTd: number; att: number; pEpa: number; rYds: number; car: number; recYds: number; rec: number; tgt: number; games: number; lastWeek: number }>()
    for (const r of rows) {
      const p = by.get(r.player_id) ?? { name: r.player_name, team: r.team_id, pos: r.position, pYds: 0, pTd: 0, att: 0, pEpa: 0, rYds: 0, car: 0, recYds: 0, rec: 0, tgt: 0, games: 0, lastWeek: 0 }
      p.pYds += N(r.passing_yards); p.pTd += N(r.passing_tds); p.att += N(r.attempts); p.pEpa += N(r.passing_epa)
      p.rYds += N(r.rushing_yards); p.car += N(r.carries); p.recYds += N(r.receiving_yards); p.rec += N(r.receptions); p.tgt += N(r.targets)
      p.games += 1
      if (r.week >= p.lastWeek) { p.lastWeek = r.week; p.team = r.team_id }
      by.set(r.player_id, p)
    }
    const all = [...by.entries()].map(([id, p]) => ({ id, ...p }))
    const top = <T extends { id: string }>(list: T[], val: (x: T) => number, n = 5) => [...list].filter(x => val(x) > 0).sort((a, b) => val(b) - val(a)).slice(0, n)
    const passers = top(all.filter(p => p.pos === 'QB'), p => p.pYds)
    const rushers = top(all, p => p.rYds)
    const receivers = top(all, p => p.recYds)
    const tds = top(all.filter(p => p.pos === 'QB'), p => p.pTd)
    const ids = [...new Set([...passers, ...rushers, ...receivers, ...tds].map(p => p.id))]
    const { data } = ids.length ? await createAdminClient().from('nfl_players').select('gsis_id,headshot_url').in('gsis_id', ids) : { data: [] }
    const shot = new Map(((data ?? []) as { gsis_id: string; headshot_url: string | null }[]).map(x => [x.gsis_id, x.headshot_url]))
    const mk = <T extends { id: string; name: string; team: string }>(list: T[], value: (x: T) => number, sub: (x: T) => string): Leader[] =>
      list.map(x => ({ id: x.id, name: x.name, team: x.team, headshot: shot.get(x.id) ?? null, value: value(x), sub: sub(x) }))
    return {
      season, games: Math.max(...all.map(p => p.lastWeek)),
      boards: [
        { key: 'pass', title: 'Passing yards', unit: 'yds', rows: mk(passers, p => p.pYds, p => `${p.pTd} TD · ${p.att} att · ${p.games} G`) },
        { key: 'rush', title: 'Rushing yards', unit: 'yds', rows: mk(rushers, p => p.rYds, p => `${p.car} car · ${p.rYds && p.car ? (p.rYds / p.car).toFixed(1) : '—'} ypc`) },
        { key: 'rec', title: 'Receiving yards', unit: 'yds', rows: mk(receivers, p => p.recYds, p => `${p.rec} rec · ${p.tgt} tgt`) },
        { key: 'ptd', title: 'Passing touchdowns', unit: 'TD', rows: mk(tds, p => p.pTd, p => `${p.pYds} yds · ${p.games} G`) },
      ],
    }
  },
  ['nfl-edge-leaders'],
  { revalidate: 10800 },
)

export async function getLeaders(season: number): Promise<Leaders | null> {
  return loadLeaders(season)
}

// ── coverage desk ────────────────────────────────────────────────────────────

export type CoverageRow = { id: string; man: number | null; zone: number | null; cover1: number | null; cover2: number | null; cover3: number | null; cover4: number | null; cover6: number | null; blitz: number | null; box: number | null }
export type CoverageDesk = { season: number; rows: CoverageRow[] }

type SchemeRow = { team_id: string; season: number; def_man_pct: number | null; def_zone_pct: number | null; def_cover1_pct: number | null; def_cover2_pct: number | null; def_cover3_pct: number | null; def_cover4_pct: number | null; def_cover6_pct: number | null; def_blitz_rate: number | null; def_avg_box_defenders: number | null; def_coverage_classified_pct: number | null }

const loadCoverage = unstable_cache(
  async (season: number): Promise<CoverageDesk | null> => {
    const { data, error } = await createAdminClient()
      .from('nfl_team_scheme_profile')
      .select('team_id,season,def_man_pct,def_zone_pct,def_cover1_pct,def_cover2_pct,def_cover3_pct,def_cover4_pct,def_cover6_pct,def_blitz_rate,def_avg_box_defenders,def_coverage_classified_pct')
      .in('season', [season, season - 1])
    if (error) {
      console.error('[getCoverageDesk] Supabase error:', error.message)
      return null
    }
    const rows = (data ?? []) as SchemeRow[]
    const pick = [season, season - 1].find(s => rows.filter(r => r.season === s && r.def_zone_pct != null).length >= 16)
    if (pick == null) return null
    const n = (v: number | null) => (v == null ? null : Number(v))
    return {
      season: pick,
      rows: rows.filter(r => r.season === pick).map(r => ({
        id: r.team_id, man: n(r.def_man_pct), zone: n(r.def_zone_pct), cover1: n(r.def_cover1_pct), cover2: n(r.def_cover2_pct), cover3: n(r.def_cover3_pct),
        cover4: n(r.def_cover4_pct), cover6: n(r.def_cover6_pct), blitz: n(r.def_blitz_rate), box: n(r.def_avg_box_defenders),
      })),
    }
  },
  ['nfl-edge-coverage'],
  { revalidate: 21600 },
)

export async function getCoverageDesk(season: number): Promise<CoverageDesk | null> {
  return loadCoverage(season)
}
