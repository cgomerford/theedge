// src/lib/nfl-edge/postgame.ts
//
// Everything the NFL Postgame page reads, split the same way MLB is: FREE = what happened, PRO = trajectory.
//
// Tables read: nfl_game_postgame (writer: compute_nfl_postgame.py — the play-by-play half, one jsonb row per
// final game), nfl_player_stats_weekly, nfl_player_defense_stats_weekly, nfl_special_teams_stats_weekly,
// nfl_snap_counts, nfl_players; PRO adds nfl_team_week_splits, nfl_team_form, nfl_next_gen_stats,
// nfl_pfr_advstats, nfl_depth_charts. getProPostgame() is only ever called for Pro viewers, so Pro data is
// never fetched or shipped to anyone else (DESIGN_SYSTEM §5).
//
// Missing pieces return null / [] and the page shows an empty state. Nothing is estimated.

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase'
import { fetchAll, getDepthChart } from './players'
import { getSeasonGames, type NflGame } from './games'
import { ftnRatesOf, ratesOf, type FormRow, type Sums } from './form'

export type PostgamePayload = {
  home: string; away: string; home_score: number; away_score: number
  linescore: { q: string; home: number; away: number }[]
  wp_series: [number, number][]
  inflections: { kind: string; q: number; clock: string | null; team: string; desc: string; home_wp_before: number; home_wp_after: number; t: number }[]
  scoring_drives: { team: string; result: string; q: number | null; clock: string | null; start: string | null; plays: number; yards: number; top: string | null }[]
  turnovers: { team: string; kind: string; q: number; clock: string | null; desc: string }[]
  penalties: { by_team: Record<string, { count: number; yards: number }>; costliest: { team: string; type: string | null; yards: number; q: number; clock: string | null }[] }
  team_box: Record<string, { plays: number; total_yds: number; pass_yds: number; rush_yds: number; pass_att: number; rushes: number; epa_per_play: number | null; success_rate: number | null; explosive: number; third_conv: number; third_att: number; rz_trips: number; rz_td: number; turnovers: number; sacks_taken: number; first_downs: number; drives: number }>
  qb_night: Record<string, { player_id: string; name: string | null; dropbacks: number; att: number; cmp: number; yds: number; td: number; int: number; sacks: number; epa_per_dropback: number | null; cpoe: number | null } | null>
}

async function loadPostgame(gameId: string): Promise<PostgamePayload | null> {
  const { data, error } = await createAdminClient().from('nfl_game_postgame').select('payload').eq('game_id', gameId).maybeSingle()
  if (error) {
    console.error('[getPostgame] Supabase error:', error.message)
    return null
  }
  return (data?.payload as PostgamePayload) ?? null
}

const cachedPostgame = unstable_cache(async (gameId: string) => loadPostgame(gameId), ['nfl-edge-postgame'], { revalidate: 3600 })

/** A finished game's payload never changes, so hits are cached for an hour. A miss (row not computed yet) is NEVER cached: it is one tiny query, and caching it would hide the row for an hour after the precompute runs. */
export async function getPostgame(gameId: string): Promise<PostgamePayload | null> {
  return (await cachedPostgame(gameId)) ?? loadPostgame(gameId)
}

const N = (v: unknown) => (v == null ? 0 : Number(v))

export type Performer = { id: string; name: string; team: string; pos: string; kind: 'pass' | 'rush' | 'rec' | 'def' | 'kick'; label: string; line: string; headshot: string | null }

type OffRow = { player_id: string; player_name: string; team_id: string; position: string; week: number; season: number; attempts: number | null; completions: number | null; passing_yards: number | null; passing_tds: number | null; interceptions: number | null; passing_epa: number | null; cpoe: number | null; carries: number | null; rushing_yards: number | null; rushing_tds: number | null; targets: number | null; receptions: number | null; receiving_yards: number | null; receiving_tds: number | null }
const OFF_COLS = 'player_id,player_name,team_id,position,week,season,attempts,completions,passing_yards,passing_tds,interceptions,passing_epa,cpoe,carries,rushing_yards,rushing_tds,targets,receptions,receiving_yards,receiving_tds'

export async function getTopPerformers(game: NflGame): Promise<Performer[]> {
  const sb = createAdminClient()
  const teams = [game.homeId, game.awayId]
  const [off, def, st] = await Promise.all([
    fetchAll<OffRow>((a, b) => sb.from('nfl_player_stats_weekly').select(OFF_COLS).eq('season', game.season).eq('week', game.week).in('team_id', teams).range(a, b), 'getTopPerformers:off'),
    fetchAll<{ player_id: string; team_id: string; position: string; tackles_solo: number | null; tackles_assist: number | null; tackles_for_loss: number | null; sacks: number | null; qb_hits: number | null; interceptions: number | null; passes_defended: number | null; fumbles_forced: number | null; defensive_tds: number | null }>(
      (a, b) => sb.from('nfl_player_defense_stats_weekly').select('player_id,team_id,position,tackles_solo,tackles_assist,tackles_for_loss,sacks,qb_hits,interceptions,passes_defended,fumbles_forced,defensive_tds').eq('season', game.season).eq('week', game.week).in('team_id', teams).range(a, b), 'getTopPerformers:def'),
    fetchAll<{ player_id: string; team_id: string; fg_made: number | null; fg_att: number | null; fg_long: number | null; pat_made: number | null; pat_att: number | null }>(
      (a, b) => sb.from('nfl_special_teams_stats_weekly').select('player_id,team_id,fg_made,fg_att,fg_long,pat_made,pat_att').eq('season', game.season).eq('week', game.week).in('team_id', teams).range(a, b), 'getTopPerformers:st'),
  ])
  const out: Performer[] = []
  for (const t of teams) {
    const mine = off.filter(r => r.team_id === t)
    const qb = [...mine].sort((a, b) => N(b.attempts) - N(a.attempts))[0]
    if (qb && N(qb.attempts) > 0) out.push({ id: qb.player_id, name: qb.player_name, team: t, pos: 'QB', kind: 'pass', label: 'Passing', line: `${N(qb.completions)}/${N(qb.attempts)} · ${N(qb.passing_yards)} yds · ${N(qb.passing_tds)} TD · ${N(qb.interceptions)} INT`, headshot: null })
    const ru = [...mine].filter(r => r.position !== 'QB').sort((a, b) => N(b.rushing_yards) - N(a.rushing_yards))[0]
    if (ru && N(ru.carries) > 0) out.push({ id: ru.player_id, name: ru.player_name, team: t, pos: ru.position, kind: 'rush', label: 'Rushing', line: `${N(ru.carries)} car · ${N(ru.rushing_yards)} yds${N(ru.rushing_tds) ? ` · ${N(ru.rushing_tds)} TD` : ''}`, headshot: null })
    const re = [...mine].sort((a, b) => N(b.receiving_yards) - N(a.receiving_yards))[0]
    if (re && N(re.targets) > 0) out.push({ id: re.player_id, name: re.player_name, team: t, pos: re.position, kind: 'rec', label: 'Receiving', line: `${N(re.receptions)}/${N(re.targets)} · ${N(re.receiving_yards)} yds${N(re.receiving_tds) ? ` · ${N(re.receiving_tds)} TD` : ''}`, headshot: null })
    const score = (d: (typeof def)[number]) => N(d.sacks) * 3 + N(d.interceptions) * 4 + N(d.tackles_for_loss) * 1.5 + N(d.passes_defended) + N(d.fumbles_forced) * 2 + N(d.defensive_tds) * 5 + (N(d.tackles_solo) + N(d.tackles_assist) * 0.5) * 0.25
    const df = def.filter(d => d.team_id === t).sort((a, b) => score(b) - score(a))[0]
    if (df && score(df) > 0) {
      const bits = [N(df.sacks) ? `${N(df.sacks)} sack${N(df.sacks) === 1 ? '' : 's'}` : null, N(df.interceptions) ? `${N(df.interceptions)} INT` : null, N(df.tackles_for_loss) ? `${N(df.tackles_for_loss)} TFL` : null, N(df.passes_defended) ? `${N(df.passes_defended)} PD` : null, `${N(df.tackles_solo) + N(df.tackles_assist)} tkl`].filter(Boolean)
      out.push({ id: df.player_id, name: '', team: t, pos: df.position, kind: 'def', label: 'Defense', line: bits.join(' · '), headshot: null })
    }
    const k = st.filter(s => s.team_id === t && N(s.fg_att) + N(s.pat_att) > 0).sort((a, b) => N(b.fg_att) - N(a.fg_att))[0]
    if (k) out.push({ id: k.player_id, name: '', team: t, pos: 'K', kind: 'kick', label: 'Special teams', line: `FG ${N(k.fg_made)}/${N(k.fg_att)}${N(k.fg_long) ? ` (long ${N(k.fg_long)})` : ''} · XP ${N(k.pat_made)}/${N(k.pat_att)}`, headshot: null })
  }
  // Fill names/headshots for defenders and kickers (their stat tables carry only ids).
  const ids = out.map(p => p.id)
  const { data } = ids.length ? await sb.from('nfl_players').select('gsis_id,full_name,headshot_url').in('gsis_id', ids) : { data: [] }
  const by = new Map(((data ?? []) as { gsis_id: string; full_name: string; headshot_url: string | null }[]).map(x => [x.gsis_id, x]))
  return out.map(p => ({ ...p, name: p.name || by.get(p.id)?.full_name || 'Unknown', headshot: by.get(p.id)?.headshot_url ?? null }))
}

export type SnapLeader = { name: string; team: string; pct: number; snaps: number; side: 'offense' | 'defense' }

export async function getSnapLeaders(game: NflGame): Promise<SnapLeader[]> {
  const rows = await fetchAll<{ player_name: string; team_id: string; offense_snaps: number | null; offense_pct: number | null; defense_snaps: number | null; defense_pct: number | null }>(
    (a, b) => createAdminClient().from('nfl_snap_counts').select('player_name,team_id,offense_snaps,offense_pct,defense_snaps,defense_pct').eq('season', game.season).eq('week', game.week).in('team_id', [game.homeId, game.awayId]).range(a, b),
    'getSnapLeaders',
  )
  const out: SnapLeader[] = []
  for (const t of [game.awayId, game.homeId]) {
    const mine = rows.filter(r => r.team_id === t)
    mine.filter(r => N(r.offense_snaps) > 0).sort((a, b) => N(b.offense_pct) - N(a.offense_pct)).slice(0, 6).forEach(r => out.push({ name: r.player_name, team: t, pct: N(r.offense_pct), snaps: N(r.offense_snaps), side: 'offense' }))
    mine.filter(r => N(r.defense_snaps) > 0).sort((a, b) => N(b.defense_pct) - N(a.defense_pct)).slice(0, 4).forEach(r => out.push({ name: r.player_name, team: t, pct: N(r.defense_pct), snaps: N(r.defense_snaps), side: 'defense' }))
  }
  return out
}

export type QbNight = {
  team: string; id: string; name: string
  tonight: { att: number; cmp: number; yds: number; td: number; int: number; epaAtt: number | null; cpoe: number | null; compPct: number | null; ypa: number | null }
  season: { games: number; epaAtt: number | null; cpoe: number | null; compPct: number | null; ypa: number | null } | null
  epaByGame: { week: number; epaAtt: number | null }[]
}

const rate = (a: number, b: number): number | null => (b > 0 ? a / b : null)

/** Tonight's line vs the same QB's season-to-date average (weeks before this game), all from weekly player stats. */
export async function getQbNights(game: NflGame, payload: PostgamePayload | null): Promise<QbNight[]> {
  const out: QbNight[] = []
  for (const t of [game.awayId, game.homeId]) {
    const q = payload?.qb_night?.[t]
    if (!q?.player_id) continue
    const rows = await fetchAll<OffRow>(
      (a, b) => createAdminClient().from('nfl_player_stats_weekly').select(OFF_COLS).eq('player_id', q.player_id).in('season', [game.season]).order('week').range(a, b),
      'getQbNights',
    )
    const tonightRow = rows.find(r => r.week === game.week)
    const before = rows.filter(r => r.week < game.week && N(r.attempts) > 0)
    const sum = (rs: OffRow[]) => ({ att: rs.reduce((s, r) => s + N(r.attempts), 0), cmp: rs.reduce((s, r) => s + N(r.completions), 0), yds: rs.reduce((s, r) => s + N(r.passing_yards), 0), epa: rs.reduce((s, r) => s + N(r.passing_epa), 0), cpW: rs.reduce((s, r) => s + N(r.cpoe) * N(r.attempts), 0) })
    const tn = tonightRow ? sum([tonightRow]) : null
    const se = before.length ? sum(before) : null
    out.push({
      team: t, id: q.player_id, name: q.name ?? 'Quarterback',
      tonight: { att: q.att, cmp: q.cmp, yds: q.yds, td: q.td, int: q.int, epaAtt: tn ? rate(tn.epa, tn.att) : null, cpoe: tn ? rate(tn.cpW, tn.att) : null, compPct: rate(q.cmp, q.att), ypa: rate(q.yds, q.att) },
      season: se ? { games: before.length, epaAtt: rate(se.epa, se.att), cpoe: rate(se.cpW, se.att), compPct: rate(se.cmp, se.att), ypa: rate(se.yds, se.att) } : null,
      epaByGame: rows.filter(r => N(r.attempts) > 0).map(r => ({ week: r.week, epaAtt: rate(N(r.passing_epa), N(r.attempts)) })),
    })
  }
  return out
}

export type ScoreRow = { id: string; name: string; team: string; pos: string; expected: number; actual: number; hit: boolean; basis: string }

/** Key Players scorecard: top-3 skill players per side by usage BEFORE this game; did each beat their own per-game yardage? */
export async function getKeyScorecard(game: NflGame): Promise<ScoreRow[]> {
  const rows = await fetchAll<OffRow>(
    (a, b) => createAdminClient().from('nfl_player_stats_weekly').select(OFF_COLS).eq('season', game.season).lte('week', game.week).in('team_id', [game.homeId, game.awayId]).neq('position', 'QB').range(a, b),
    'getKeyScorecard',
  )
  const out: ScoreRow[] = []
  for (const t of [game.awayId, game.homeId]) {
    const mine = rows.filter(r => r.team_id === t)
    const pre = new Map<string, OffRow[]>()
    for (const r of mine.filter(r => r.week < game.week)) pre.set(r.player_id, [...(pre.get(r.player_id) ?? []), r])
    const usage = [...pre.entries()].map(([id, rs]) => ({ id, rs, u: rs.reduce((s, r) => s + N(r.targets) + N(r.carries), 0) / rs.length })).sort((a, b) => b.u - a.u).slice(0, 3)
    for (const p of usage) {
      const isRb = p.rs[0].position === 'RB' || p.rs[0].position === 'FB'
      const yds = (r: OffRow) => (isRb ? N(r.rushing_yards) : N(r.receiving_yards))
      const expected = p.rs.reduce((s, r) => s + yds(r), 0) / p.rs.length
      const tonight = mine.find(r => r.player_id === p.id && r.week === game.week)
      out.push({ id: p.id, name: p.rs[0].player_name, team: t, pos: p.rs[0].position, expected, actual: tonight ? yds(tonight) : 0, hit: (tonight ? yds(tonight) : 0) >= expected, basis: `${p.rs.length} prior game${p.rs.length === 1 ? '' : 's'}` })
    }
  }
  return out
}

export async function getNextGames(game: NflGame): Promise<Record<string, NflGame | null>> {
  const games = await getSeasonGames(game.season)
  const next = (id: string) => games.filter(g => (g.homeId === id || g.awayId === id) && g.kickoff && game.kickoff && g.kickoff > game.kickoff).sort((a, b) => (a.kickoff ?? '').localeCompare(b.kickoff ?? ''))[0] ?? null
  return { [game.homeId]: next(game.homeId), [game.awayId]: next(game.awayId) }
}

// ── PRO ─────────────────────────────────────────────────────────────────────

export type ProPostgame = {
  qbDial: { team: string; name: string; pressurePct: number | null; pressureSeason: number | null; tttTonight: number | null; tttSeason: number | null }[]
  defFlags: { team: string; passTonight: number | null; passSeason: number | null; rushTonight: number | null; rushSeason: number | null }[]
  ftn: { team: string; blitzFacedTonight: number | null; blitzFacedSeason: number | null; motionTonight: number | null; motionSeason: number | null; paTonight: number | null; paSeason: number | null; n: number }[]
  situational: { team: string; thirdTonight: number | null; thirdSeason: number | null; rzTonight: number | null; rzSeason: number | null; rzTripsTonight: number }[]
  personnel: { team: string; pos: string; name: string; depth: number; snapPct: number | null }[]
  skill: { team: string; name: string; pos: string; touchesTonight: number; touchesPrior: number | null; snapTonight: number | null; snapPrior: number | null }[]
  nextWeek: { team: string; heavy: { name: string; pct: number }[]; nextOpp: string | null; restDays: number | null }[]
  hasSplits: boolean
}

export async function getProPostgame(game: NflGame, payload: PostgamePayload | null): Promise<ProPostgame> {
  const sb = createAdminClient()
  const teams = [game.awayId, game.homeId]
  const [splits, formRows, ngs, pfr, players, snaps, stats, nextGames] = await Promise.all([
    sb.from('nfl_team_week_splits').select('team_id,off,def,ftn_off,ftn_def').eq('game_id', game.id),
    sb.from('nfl_team_form').select('team_id,games,season_sum').eq('season', game.season).in('team_id', teams),
    fetchAll<{ player_id: string; week: number; stat_type: string; raw_source_json: { avg_time_to_throw?: number } }>((a, b) => sb.from('nfl_next_gen_stats').select('player_id,week,stat_type,raw_source_json').eq('season', game.season).eq('stat_type', 'passing').lte('week', game.week).range(a, b), 'getProPostgame:ngs'),
    fetchAll<{ player_id: string; team_id: string; week: number; raw_source_json: { times_pressured_pct?: number } }>((a, b) => sb.from('nfl_pfr_advstats').select('player_id,team_id,week,raw_source_json').eq('season', game.season).eq('stat_type', 'pass').in('team_id', teams).lte('week', game.week).range(a, b), 'getProPostgame:pfr'),
    sb.from('nfl_players').select('gsis_id,pfr_id,full_name').in('team_id', teams),
    fetchAll<{ player_id: string; player_name: string; team_id: string; week: number; offense_pct: number | null; defense_pct: number | null }>((a, b) => sb.from('nfl_snap_counts').select('player_id,player_name,team_id,week,offense_pct,defense_pct').eq('season', game.season).in('team_id', teams).lte('week', game.week).range(a, b), 'getProPostgame:snaps'),
    fetchAll<OffRow>((a, b) => sb.from('nfl_player_stats_weekly').select(OFF_COLS).eq('season', game.season).lte('week', game.week).in('team_id', teams).neq('position', 'QB').range(a, b), 'getProPostgame:stats'),
    getNextGames(game),
  ])
  const sp = (splits.data ?? []) as { team_id: string; off: Sums; def: Sums; ftn_off: Sums; ftn_def: Sums }[]
  const form = new Map(((formRows.data ?? []) as { team_id: string; games: number; season_sum: { off: Sums; def: Sums; ftn_off: Sums; ftn_def: Sums } | null }[]).map(f => [f.team_id, f]))
  const pl = (players.data ?? []) as { gsis_id: string; pfr_id: string | null; full_name: string }[]
  const pfrOf = new Map(pl.map(p => [p.gsis_id, p.pfr_id]))

  const qbDial = teams.flatMap(t => {
    const q = payload?.qb_night?.[t]
    if (!q) return []
    const pfrId = pfrOf.get(q.player_id)
    const pr = pfr.filter(r => r.player_id === pfrId && r.raw_source_json?.times_pressured_pct != null)
    const tn = pr.find(r => r.week === game.week)?.raw_source_json.times_pressured_pct ?? null
    const prior = pr.filter(r => r.week < game.week).map(r => Number(r.raw_source_json.times_pressured_pct))
    const nr = ngs.filter(r => r.player_id === q.player_id && r.raw_source_json?.avg_time_to_throw != null)
    const tt = nr.find(r => r.week === game.week)?.raw_source_json.avg_time_to_throw ?? null
    const tprior = nr.filter(r => r.week < game.week).map(r => Number(r.raw_source_json.avg_time_to_throw))
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
    return [{ team: t, name: q.name ?? 'QB', pressurePct: tn, pressureSeason: avg(prior), tttTonight: tt, tttSeason: avg(tprior) }]
  })

  const seasonRates = (t: string) => {
    const f = form.get(t)?.season_sum
    return f ? { r: ratesOf({ off: f.off, def: f.def }), ftnO: ftnRatesOf(f.ftn_off), ftnD: ftnRatesOf(f.ftn_def) } : null
  }
  const defFlags: ProPostgame['defFlags'] = [], ftn: ProPostgame['ftn'] = [], situational: ProPostgame['situational'] = []
  for (const s of sp) {
    const tr = ratesOf({ off: s.off, def: s.def }), fo = ftnRatesOf(s.ftn_off), se = seasonRates(s.team_id)
    defFlags.push({ team: s.team_id, passTonight: tr.passEpaD, passSeason: se?.r.passEpaD ?? null, rushTonight: tr.rushEpaD, rushSeason: se?.r.rushEpaD ?? null })
    // ftn_off is grouped by the offence, so its blitz count is blitzes THIS offence faced.
    ftn.push({ team: s.team_id, blitzFacedTonight: fo.blitzFaced, blitzFacedSeason: se?.ftnO.blitzFaced ?? null, motionTonight: fo.motionRate, motionSeason: se?.ftnO.motionRate ?? null, paTonight: fo.paRate, paSeason: se?.ftnO.paRate ?? null, n: fo.plays })
    situational.push({ team: s.team_id, thirdTonight: tr.thirdO, thirdSeason: se?.r.thirdO ?? null, rzTonight: tr.rzTdO, rzSeason: se?.r.rzTdO ?? null, rzTripsTonight: tr.rzTripsO })
  }

  // Personnel audit: depth-chart starters vs the snaps they actually took.
  const pfrToName = new Map(pl.filter(p => p.pfr_id).map(p => [p.pfr_id as string, p.gsis_id]))
  const personnel: ProPostgame['personnel'] = []
  for (const t of teams) {
    const depth = await getDepthChart(t, game.season)
    const tonightSnaps = new Map(snaps.filter(s => s.team_id === t && s.week === game.week).map(s => [pfrToName.get(s.player_id) ?? s.player_id, s.offense_pct]))
    for (const pos of ['QB', 'RB', 'WR', 'WR', 'WR', 'TE']) {
      const seen = personnel.filter(p => p.team === t && p.pos.startsWith(pos)).length
      const cand = depth.filter(d => d.position === pos).sort((a, b) => a.depth_rank - b.depth_rank)[pos === 'WR' ? seen : 0]
      if (cand) personnel.push({ team: t, pos: pos === 'WR' ? `WR${seen + 1}` : pos, name: cand.player_name, depth: cand.depth_rank, snapPct: tonightSnaps.get(cand.player_id) ?? null })
    }
  }

  // Skill trajectory: touches + snap share tonight vs the same player's earlier games.
  const skill: ProPostgame['skill'] = []
  for (const t of teams) {
    const mine = stats.filter(r => r.team_id === t)
    const ids = [...new Set(mine.filter(r => r.week === game.week).map(r => r.player_id))]
    const top = ids.map(id => ({ id, rows: mine.filter(r => r.player_id === id) })).map(p => ({ ...p, tn: N(p.rows.find(r => r.week === game.week)?.targets) + N(p.rows.find(r => r.week === game.week)?.carries) })).sort((a, b) => b.tn - a.tn).slice(0, 4)
    for (const p of top) {
      const prior = p.rows.filter(r => r.week < game.week)
      const gsis = p.id
      const snapOf = (w: (x: number) => boolean) => { const v = snaps.filter(s => s.team_id === t && (pfrToName.get(s.player_id) ?? s.player_id) === gsis && w(s.week)).map(s => N(s.offense_pct)); return v.length ? v : null }
      const st = snapOf(w => w === game.week), sp2 = snapOf(w => w < game.week)
      skill.push({
        team: t, name: p.rows[0].player_name, pos: p.rows[0].position, touchesTonight: p.tn,
        touchesPrior: prior.length ? prior.reduce((s, r) => s + N(r.targets) + N(r.carries), 0) / prior.length : null,
        snapTonight: st ? st[0] : null, snapPrior: sp2 ? sp2.reduce((a, b) => a + b, 0) / sp2.length : null,
      })
    }
  }

  const nextWeek = teams.map(t => {
    const heavy = snaps.filter(s => s.team_id === t && s.week === game.week && Math.max(N(s.offense_pct), N(s.defense_pct)) >= 0.9).map(s => ({ name: s.player_name, pct: Math.max(N(s.offense_pct), N(s.defense_pct)) })).sort((a, b) => b.pct - a.pct).slice(0, 5)
    const ng = nextGames[t]
    const rest = ng?.kickoff && game.kickoff ? Math.round((new Date(ng.kickoff).getTime() - new Date(game.kickoff).getTime()) / 86400000) : null
    return { team: t, heavy, nextOpp: ng ? (ng.homeId === t ? ng.awayId : ng.homeId) : null, restDays: rest }
  })

  return { qbDial, defFlags, ftn, situational, personnel, skill, nextWeek, hasSplits: sp.length > 0 }
}

export type { FormRow }
