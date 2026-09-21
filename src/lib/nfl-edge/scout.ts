// src/lib/nfl-edge/scout.ts
//
// Data for the NFL Scout Report. Free/signup sections and Pro sections are loaded by separate functions so
// Pro data is only fetched for Pro viewers (DESIGN_SYSTEM §5).
//
// Tables read: nfl_injuries, nfl_depth_charts, nfl_snap_counts, nfl_players, nfl_team_week_splits, nfl_team_form,
// nfl_special_teams_stats_weekly, nfl_next_gen_stats, nfl_player_stats_weekly, nfl_team_scheme_profile.
// Missing tables / rows return [] / null and the page shows an empty state; nothing is estimated.
//
// NOT AVAILABLE (and therefore not shown): practice progression across the week (one status per player per
// report is stored), FTN box counts and personnel from participation for 2026, PFF grades, fantasy expected
// points (ff_opportunity is not synced), officials crews beyond the referee.

import { createAdminClient } from '@/lib/supabase'
import { fetchAll, getDepthChart, getInjuries, type InjuryRow } from './players'
import { getSeasonGames, type NflGame } from './games'
import { column, ftnRatesOf, rankOf, ratesOf, type FtnRates, type LeagueRates, type Rates, type Sums } from './form'
import { ordinal } from '@/lib/ordinal'

const N = (v: unknown) => (v == null ? 0 : Number(v))

// ── 3.1 availability ────────────────────────────────────────────────────────

export type Unit = 'QB' | 'Backfield' | 'Receivers' | 'Offensive line' | 'Defensive line' | 'Linebackers' | 'Secondary' | 'Special teams'
const UNIT_OF: Record<string, Unit> = {
  QB: 'QB', RB: 'Backfield', FB: 'Backfield', WR: 'Receivers', TE: 'Receivers',
  LT: 'Offensive line', LG: 'Offensive line', C: 'Offensive line', RG: 'Offensive line', RT: 'Offensive line', OL: 'Offensive line', T: 'Offensive line', G: 'Offensive line',
  LDE: 'Defensive line', RDE: 'Defensive line', LDT: 'Defensive line', RDT: 'Defensive line', DE: 'Defensive line', DT: 'Defensive line', NT: 'Defensive line', DL: 'Defensive line',
  MLB: 'Linebackers', WLB: 'Linebackers', SLB: 'Linebackers', ILB: 'Linebackers', OLB: 'Linebackers', LB: 'Linebackers',
  LCB: 'Secondary', RCB: 'Secondary', NB: 'Secondary', FS: 'Secondary', SS: 'Secondary', CB: 'Secondary', S: 'Secondary', DB: 'Secondary',
  PK: 'Special teams', K: 'Special teams', P: 'Special teams', LS: 'Special teams', KR: 'Special teams', PR: 'Special teams', H: 'Special teams',
}
export const UNITS: Unit[] = ['QB', 'Backfield', 'Receivers', 'Offensive line', 'Defensive line', 'Linebackers', 'Secondary', 'Special teams']

export type UnitStatus = { unit: Unit; rows: (InjuryRow & { riser: string | null })[]; startersOut: number; level: 'clear' | 'watch' | 'thin' }

export async function getAvailability(teamId: string, season: number, week: number): Promise<{ units: UnitStatus[]; total: number; reported: boolean }> {
  const [inj, depth] = await Promise.all([getInjuries(teamId, season, week), getDepthChart(teamId, season)])
  const flagged = inj.filter(i => i.status || (i.practice && !/Full/i.test(i.practice)))
  const units: UnitStatus[] = UNITS.map(unit => {
    const rows = flagged.filter(i => (i.pos ? UNIT_OF[i.pos] : undefined) === unit).sort((a, b) => ['Out', 'Doubtful', 'Questionable'].indexOf(a.status ?? 'z') - ['Out', 'Doubtful', 'Questionable'].indexOf(b.status ?? 'z'))
    const withRiser = rows.map(r => {
      const next = r.isStarter && (r.status === 'Out' || r.status === 'Doubtful') && r.pos
        ? depth.filter(d => d.position === r.pos && d.depth_rank > 1 && d.player_id !== r.playerId).sort((a, b) => a.depth_rank - b.depth_rank)[0]
        : null
      return { ...r, riser: next?.player_name ?? null }
    })
    const startersOut = rows.filter(r => r.isStarter && (r.status === 'Out' || r.status === 'Doubtful')).length
    return { unit, rows: withRiser, startersOut, level: startersOut >= 2 ? 'thin' : startersOut === 1 || rows.some(r => r.status === 'Questionable' && r.isStarter) ? 'watch' : 'clear' }
  })
  return { units, total: flagged.length, reported: inj.length > 0 }
}

// ── 3.2 / 3.7 form from per-game splits ─────────────────────────────────────

export type GameSplit = { week: number; opp: string; isHome: boolean; r: Rates; ftnO: FtnRates; ftnD: FtnRates; kickoff: string | null; roof: string | null; gameId: string }

export async function getSplits(teamId: string, season: number): Promise<GameSplit[]> {
  const sb = createAdminClient()
  const [res, games] = await Promise.all([
    sb.from('nfl_team_week_splits').select('team_id,week,opponent_id,is_home,game_id,off,def,ftn_off,ftn_def').eq('team_id', teamId).eq('season', season).eq('season_type', 'REG').order('week'),
    getSeasonGames(season),
  ])
  if (res.error) {
    console.error('[getSplits] Supabase error:', res.error.message)
    return []
  }
  const by = new Map(games.map(g => [g.id, g]))
  return ((res.data ?? []) as { week: number; opponent_id: string; is_home: boolean; game_id: string; off: Sums; def: Sums; ftn_off: Sums; ftn_def: Sums }[]).map(r => ({
    week: r.week, opp: r.opponent_id, isHome: r.is_home, r: ratesOf({ off: r.off, def: r.def }),
    ftnO: ftnRatesOf(r.ftn_off), ftnD: ftnRatesOf(r.ftn_def), kickoff: by.get(r.game_id)?.kickoff ?? null, roof: by.get(r.game_id)?.roof ?? null, gameId: r.game_id,
  }))
}

/** Sum a subset of games' raw sums back into one rate set (used for L3 / home-road / day-night). */
export async function getSplitSums(teamId: string, season: number): Promise<{ week: number; isHome: boolean; kickoff: string | null; roof: string | null; off: Sums; def: Sums; ftn_off: Sums; ftn_def: Sums }[]> {
  const sb = createAdminClient()
  const [res, games] = await Promise.all([
    sb.from('nfl_team_week_splits').select('week,is_home,game_id,off,def,ftn_off,ftn_def').eq('team_id', teamId).eq('season', season).eq('season_type', 'REG').order('week'),
    getSeasonGames(season),
  ])
  if (res.error) return []
  const by = new Map(games.map(g => [g.id, g]))
  return ((res.data ?? []) as { week: number; is_home: boolean; game_id: string; off: Sums; def: Sums; ftn_off: Sums; ftn_def: Sums }[]).map(r => ({ ...r, isHome: r.is_home, kickoff: by.get(r.game_id)?.kickoff ?? null, roof: by.get(r.game_id)?.roof ?? null }))
}

export function sumSums(list: (Sums | undefined)[]): Sums {
  const out: Sums = {}
  for (const s of list) for (const [k, v] of Object.entries(s ?? {})) out[k] = (out[k] ?? 0) + v
  return out
}

// ── 3.3 snap intelligence ───────────────────────────────────────────────────

export type SnapRow = { name: string; pos: string; l3: number | null; season: number | null; delta: number | null; games: number; last: number | null }

export async function getSnapBoard(teamId: string, season: number): Promise<{ offense: SnapRow[]; defense: SnapRow[]; games: number }> {
  const sb = createAdminClient()
  const [snaps, players] = await Promise.all([
    fetchAll<{ player_id: string; player_name: string; week: number; offense_pct: number | null; offense_snaps: number | null; defense_pct: number | null; defense_snaps: number | null }>(
      (a, b) => sb.from('nfl_snap_counts').select('player_id,player_name,week,offense_pct,offense_snaps,defense_pct,defense_snaps').eq('team_id', teamId).eq('season', season).range(a, b), 'getSnapBoard'),
    sb.from('nfl_players').select('pfr_id,position').eq('team_id', teamId),
  ])
  const pos = new Map(((players.data ?? []) as { pfr_id: string | null; position: string | null }[]).filter(p => p.pfr_id).map(p => [p.pfr_id as string, p.position ?? '']))
  const weeks = [...new Set(snaps.map(s => s.week))].sort((a, b) => a - b)
  const l3w = new Set(weeks.slice(-3))
  const build = (side: 'offense' | 'defense', keep: (p: string) => boolean): SnapRow[] => {
    const by = new Map<string, typeof snaps>()
    for (const s of snaps) if (N(side === 'offense' ? s.offense_snaps : s.defense_snaps) > 0) by.set(s.player_id, [...(by.get(s.player_id) ?? []), s])
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
    return [...by.entries()].filter(([id]) => keep(pos.get(id) ?? '')).map(([id, rs]) => {
      const v = (r: (typeof snaps)[number]) => N(side === 'offense' ? r.offense_pct : r.defense_pct)
      const sea = avg(rs.map(v)), l3 = avg(rs.filter(r => l3w.has(r.week)).map(v))
      const last = rs.sort((a, b) => b.week - a.week)[0]
      return { name: rs[0].player_name, pos: pos.get(id) ?? '', l3, season: sea, delta: l3 != null && sea != null ? l3 - sea : null, games: rs.length, last: last ? v(last) : null }
    }).sort((a, b) => (b.season ?? 0) - (a.season ?? 0)).slice(0, 9)
  }
  return {
    offense: build('offense', p => ['WR', 'RB', 'TE', 'FB'].includes(p)),
    defense: build('defense', p => ['DL', 'DE', 'DT', 'LB', 'OLB', 'ILB', 'CB', 'S', 'DB', 'SS', 'FS', 'NT'].includes(p)),
    games: weeks.length,
  }
}

// ── 3.9 special teams ───────────────────────────────────────────────────────

export async function getKicking(teamId: string, season: number): Promise<{ name: string; made: number; att: number; long: number; xpMade: number; xpAtt: number; games: number } | null> {
  const sb = createAdminClient()
  const rows = await fetchAll<{ player_id: string; fg_made: number | null; fg_att: number | null; fg_long: number | null; pat_made: number | null; pat_att: number | null }>(
    (a, b) => sb.from('nfl_special_teams_stats_weekly').select('player_id,fg_made,fg_att,fg_long,pat_made,pat_att').eq('team_id', teamId).eq('season', season).gt('fg_att', -1).range(a, b), 'getKicking')
  const k = rows.filter(r => N(r.fg_att) + N(r.pat_att) > 0)
  if (!k.length) return null
  const id = k.sort((a, b) => N(b.fg_att) - N(a.fg_att))[0].player_id
  const mine = k.filter(r => r.player_id === id)
  const { data } = await sb.from('nfl_players').select('full_name').eq('gsis_id', id).maybeSingle()
  return { name: (data as { full_name?: string } | null)?.full_name ?? 'Kicker', made: mine.reduce((s, r) => s + N(r.fg_made), 0), att: mine.reduce((s, r) => s + N(r.fg_att), 0), long: Math.max(0, ...mine.map(r => N(r.fg_long))), xpMade: mine.reduce((s, r) => s + N(r.pat_made), 0), xpAtt: mine.reduce((s, r) => s + N(r.pat_att), 0), games: mine.length }
}

// ── PRO: Next Gen Stats deep ────────────────────────────────────────────────

export type NgsPassing = { name: string; games: number; ttt: number | null; aggressiveness: number | null; cpoe: number | null; airYards: number | null }
export type NgsReceiver = { name: string; games: number; separation: number | null; cushion: number | null; yacAboveExp: number | null; targets: number; shareAir: number | null }
export type NgsRusher = { name: string; games: number; ryoe: number | null; att: number; eight: number | null }

export async function getNgs(teamId: string, season: number): Promise<{ passing: NgsPassing | null; receivers: NgsReceiver[]; rushers: NgsRusher[] }> {
  const rows = await fetchAll<{ player_id: string; stat_type: string; week: number; raw_source_json: Record<string, number | string | null> }>(
    (a, b) => createAdminClient().from('nfl_next_gen_stats').select('player_id,stat_type,week,raw_source_json').eq('team_id', teamId).eq('season', season).range(a, b), 'getNgs')
  const avg = (a: (number | null | undefined)[]) => { const v = a.filter((x): x is number => x != null && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null }
  const grp = (t: string) => { const m = new Map<string, typeof rows>(); for (const r of rows.filter(x => x.stat_type === t)) m.set(r.player_id, [...(m.get(r.player_id) ?? []), r]); return [...m.values()] }
  const num = (r: (typeof rows)[number], k: string) => (r.raw_source_json[k] == null ? null : Number(r.raw_source_json[k]))
  const pass = grp('passing').sort((a, b) => b.length - a.length)[0]
  return {
    passing: pass ? { name: String(pass[0].raw_source_json.player_display_name ?? 'QB'), games: pass.length, ttt: avg(pass.map(r => num(r, 'avg_time_to_throw'))), aggressiveness: avg(pass.map(r => num(r, 'aggressiveness'))), cpoe: avg(pass.map(r => num(r, 'completion_percentage_above_expectation'))), airYards: avg(pass.map(r => num(r, 'avg_intended_air_yards'))) } : null,
    receivers: grp('receiving').map(rs => ({ name: String(rs[0].raw_source_json.player_display_name ?? ''), games: rs.length, separation: avg(rs.map(r => num(r, 'avg_separation'))), cushion: avg(rs.map(r => num(r, 'avg_cushion'))), yacAboveExp: avg(rs.map(r => num(r, 'avg_yac_above_expectation'))), targets: rs.reduce((s, r) => s + N(num(r, 'targets')), 0), shareAir: avg(rs.map(r => num(r, 'percent_share_of_intended_air_yards'))) })).sort((a, b) => b.targets - a.targets).slice(0, 5),
    rushers: grp('rushing').map(rs => ({ name: String(rs[0].raw_source_json.player_display_name ?? ''), games: rs.length, ryoe: avg(rs.map(r => num(r, 'rush_yards_over_expected_per_att'))), att: rs.reduce((s, r) => s + N(num(r, 'rush_attempts')), 0), eight: avg(rs.map(r => num(r, 'percent_attempts_gte_eight_defenders'))) })).sort((a, b) => b.att - a.att).slice(0, 4),
  }
}

export type { NflGame }

// ── 3.13 coach card: watch-fors written from the numbers, never invented ────


export function buildWatchList(args: {
  game: NflGame; homeId: string; awayId: string; lr: LeagueRates
  availability: { home: UnitStatus[]; away: UnitStatus[] }
}): string[] {
  const { game, homeId, awayId, lr, availability } = args
  const h = lr.get(homeId), a = lr.get(awayId)
  const out: string[] = []
  if (!h || !a) return out
  const rk = (v: number | null, pick: (r: Rates) => number | null, hb: boolean) => rankOf(v, column(lr, pick), hb)
  const e = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`)
  const pc = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`)
  const pair = (off: Rates, def: Rates, offId: string, defId: string, o: keyof Rates, d: keyof Rates, label: string) => {
    const ov = off[o] as number | null, dv = def[d] as number | null
    if (ov == null || dv == null) return
    const ro = rk(ov, r => r[o] as number | null, true), rd = rk(dv, r => r[d] as number | null, false)
    out.push(`${offId} ${label} runs at ${e(ov)} EPA${ro ? ` (${ordinal(ro)} of 32)` : ''} against a ${defId} defense allowing ${e(dv)}${rd ? ` (${ordinal(rd)} of 32)` : ''}. Watch who wins that snap-to-snap.`)
  }
  pair(a, h, awayId, homeId, 'passEpaO', 'passEpaD', 'passing game')
  pair(h, a, homeId, awayId, 'passEpaO', 'passEpaD', 'passing game')
  pair(a, h, awayId, homeId, 'rushEpaO', 'rushEpaD', 'run game')
  pair(h, a, homeId, awayId, 'rushEpaO', 'rushEpaD', 'run game')
  if (h.sackAllowed != null && a.sackGen != null) out.push(`${homeId} has been sacked on ${pc(h.sackAllowed)} of dropbacks; ${awayId}'s defense is getting home on ${pc(a.sackGen)}. Protection is the thing to watch early.`)
  if (a.sackAllowed != null && h.sackGen != null) out.push(`${awayId} has been sacked on ${pc(a.sackAllowed)} of dropbacks; ${homeId}'s defense is getting home on ${pc(h.sackGen)}.`)
  if (h.rzTdO != null && a.rzTdO != null) out.push(`Inside the 20, ${awayId} scores touchdowns on ${pc(a.rzTdO)} of trips (${a.rzTripsO}) and ${homeId} on ${pc(h.rzTdO)} (${h.rzTripsO}). Small samples, so treat as direction, not destiny.`)
  for (const [id, units] of [[awayId, availability.away], [homeId, availability.home]] as [string, UnitStatus[]][]) {
    const out2 = units.flatMap(u => u.rows.filter(r => r.isStarter && (r.status === 'Out' || r.status === 'Doubtful')))
    if (out2.length) out.push(`${id} lists ${out2.length} starter${out2.length === 1 ? '' : 's'} Out or Doubtful: ${out2.slice(0, 3).map(r => `${r.name} (${r.pos})`).join(', ')}. Watch how the depth behind them holds up.`)
  }
  if (game.homeRest != null && game.awayRest != null && Math.abs(game.homeRest - game.awayRest) >= 2) out.push(`Rest gap: ${game.homeId} has ${game.homeRest} days, ${game.awayId} has ${game.awayRest}.`)
  return out.slice(0, 8)
}
