// src/lib/pa-query.ts
//
// The "deep" engine: stackable filters over plate appearances built straight from Baseball Savant pulls
// (see savant-pa.ts) — no database. READ-ONLY, computed in memory, cached per game day.
//
// Output is the same QueryResult shape as the quick (MLB-splits) engine, with each aggregate row mapped
// onto the same Totals field names, so every metric in stats-query-catalog.ts (AVG, OPS, K%, ...) works
// unchanged. Empty state over fabricated data: no matching plate appearances → league/breakdown come back
// null/empty. A range that has not been fully pulled yet returns `loading` progress instead of partial numbers.

import { MLB_TEAMS } from '@/lib/teams'
import { memo, type QueryResult, type TeamOut, type TeamPart, type PlayerOut } from '@/lib/stats-query'
import { aggregatePa, coverageOf, ensureNewest, ensureRange, recentMatches, rowsFor, type LoadProgress, type PaAgg, type PaQuery } from '@/lib/savant-pa'
import { throttledMlbFetch } from '@/lib/mlb-fetch-limiter'
import {
  CURRENT_SEASON, DEEP_GROUP_BY, deepGroupLabel, deepToParams,
  type Group, type QueryState, type Totals,
} from '@/lib/stats-query-catalog'

type PaRow = PaAgg

const gameTypes = (gt: string): string[] => (gt === 'P' ? ['F', 'D', 'L', 'W'] : [gt])

function toTotals(r: PaRow, group: Group): Totals {
  const common: Totals = {
    atBats: Number(r.ab), hits: Number(r.h), doubles: Number(r.d2), triples: Number(r.d3), homeRuns: Number(r.hr),
    baseOnBalls: Number(r.bb), intentionalWalks: Number(r.ibb), hitByPitch: Number(r.hbp), strikeOuts: Number(r.so),
    sacFlies: Number(r.sf), sacBunts: Number(r.sh), totalBases: Number(r.tb),
    // numeric columns arrive as strings → Number() (CLAUDE.md gotcha)
    wobaNum: Number(r.woba_num), wobaDen: Number(r.woba_den), xwobaNum: Number(r.xwoba_num),
    bbe: Number(r.bbe), evSum: Number(r.ev_sum), hardHit: Number(r.hard_hit), barrels: Number(r.barrels),
  }
  return group === 'pitching'
    ? { ...common, battersFaced: Number(r.pa) }
    : { ...common, plateAppearances: Number(r.pa) }
}

async function playerNames(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const need = ids.filter(Boolean)
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100)
    const names = await memo(`names|${chunk.join(',')}`, CURRENT_SEASON, async () => {
      try {
        const res = await throttledMlbFetch(`https://statsapi.mlb.com/api/v1/people?personIds=${chunk.join(',')}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
        if (!res.ok) throw new Error(`MLB people ${res.status}`)
        const j = await res.json()
        return (j.people ?? []).map((p: { id: number; fullName: string }) => [p.id, p.fullName] as const)
      } catch (e) {
        console.error('[playerNames] failed:', (e as Error).message)
        return [] as (readonly [number, string])[]
      }
    })
    for (const [id, name] of names) out.set(id, name)
  }
  return out
}

const SCORE_BUCKETS: { label: string; test: (d: number) => boolean }[] = [
  { label: 'Behind 4+', test: d => d <= -4 }, { label: 'Behind 2–3', test: d => d >= -3 && d <= -2 }, { label: 'Behind 1', test: d => d === -1 },
  { label: 'Tied', test: d => d === 0 }, { label: 'Ahead 1', test: d => d === 1 }, { label: 'Ahead 2–3', test: d => d >= 2 && d <= 3 }, { label: 'Ahead 4+', test: d => d >= 4 },
]

function addRow(acc: PaRow, r: PaRow): PaRow {
  const out = { ...acc } as Record<string, number | string>
  for (const k of Object.keys(r)) if (k !== 'grp' && k !== 'grp2') out[k] = Number(out[k] ?? 0) + Number((r as unknown as Record<string, number | string>)[k])
  return out as unknown as PaRow
}

/** Club-by-club parts from rows that were split by team (grp2). Rows for the same club are summed. */
function teamParts(rows: PaRow[], group: Group): TeamPart[] {
  const m = new Map<string, PaRow>()
  for (const r of rows) {
    const k = r.grp2 ?? ''
    if (!k) continue
    const cur = m.get(k)
    m.set(k, cur ? addRow(cur, r) : { ...r })
  }
  return [...m.entries()].map(([abbr, r]) => ({ abbr, name: MLB_TEAMS.find(t => t.abbrev === abbr)?.name ?? abbr, totals: toTotals(r, group) }))
}

const FINDER_FLOOR = 2015   // the Statcast era
const FINDER_ENOUGH = 5      // matches that make a useful "last times" list

export async function runDeepQuery(q: QueryState): Promise<QueryResult> {
  if (q.group === 'fielding') throw new Error('Fielding is not available in the plate-appearance engine.')
  if (!q.deep) throw new Error('No deep filters supplied.')
  const group = q.group
  const result: QueryResult = { query: q, engine: 'deep', seasons: [], league: null, baseline: null }

  const filters: PaQuery = deepToParams(q.deep, group)
  const finder = q.view === 'recent'
  const years = q.view === 'compare' ? [...new Set(q.years)] : []
  const from = q.view === 'compare' ? Math.min(...years) : Math.min(q.from, q.to)
  const to = q.view === 'compare' ? Math.max(...years) : Math.max(q.from, q.to)
  // "When did this last happen" ignores the season and game-type pickers: it looks back from today, newest day first, until it has found enough.
  result.seasons = finder ? Array.from({ length: CURRENT_SEASON - FINDER_FLOOR + 1 }, (_, i) => CURRENT_SEASON - i) : q.view === 'compare' ? years : Array.from({ length: to - from + 1 }, (_, i) => from + i)

  // Pull whatever Savant days are still missing (a bounded batch per request); until the whole range is
  // in, report progress instead of numbers built from a partial range.
  const types = finder ? ['R', 'F', 'D', 'L', 'W'] : gameTypes(q.gameType)
  const progress: LoadProgress & { days: string[]; finished?: boolean } = finder
    ? await ensureNewest(result.seasons, types, days => recentMatches(rowsFor(days, types), filters, 30).total >= FINDER_ENOUGH)
    : await ensureRange(result.seasons, types)
  if (finder ? !progress.finished : progress.done < progress.total) return { ...result, loading: { done: progress.done, total: progress.total } }
  const plateAppearances = rowsFor(progress.days, types)
  result.coverage = coverageOf(plateAppearances)

  const run = (extra: Partial<PaQuery>, withFilters = true): Promise<PaRow[]> =>
    Promise.resolve(aggregatePa(plateAppearances, { ...(withFilters ? filters : {}), ...extra }))

  const teamKey = group === 'pitching' ? 'pitcher_team' : 'batter_team'
  const totalsOf = (rows: PaRow[]): Totals | null => (rows.length ? toTotals(rows[0], group) : null)

  switch (q.view) {
    case 'summary': {
      const [rows, base] = await Promise.all([run({}), run({}, false)])
      result.league = totalsOf(rows)
      result.baseline = totalsOf(base)
      if (q.teams) result.leagueTeams = teamParts(await run({ split_by: teamKey }), group)
      break
    }
    case 'breakdown': {
      const gb = DEEP_GROUP_BY[q.family]
      if (!gb) throw new Error('That grouping is not available with stacked filters.')
      const [rows0, base] = await Promise.all([run({ group_by: gb, ...(q.teams ? { split_by: teamKey } : {}) }), run({}, false)])
      result.baseline = totalsOf(base)
      // rows come back per (group, club); collapse to one PaRow per group for the totals, keep the club split for the parts
      const teamRows = rows0
      const byGrp = new Map<string, PaRow>()
      for (const r of rows0) byGrp.set(r.grp, byGrp.has(r.grp) ? addRow(byGrp.get(r.grp)!, r) : { ...r, grp2: '' })
      const rows = [...byGrp.values()]
      if (gb === 'score_diff') {
        result.breakdown = SCORE_BUCKETS.map(b => {
          const hit = rows.filter(r => b.test(Number(r.grp)))
          const sum = hit.reduce<PaRow | null>((a, r) => (a ? addRow(a, r) : r), null)
          return { code: b.label, label: b.label, totals: sum ? toTotals(sum, group) : null, teams: q.teams ? teamParts(teamRows.filter(r => b.test(Number(r.grp))), group) : undefined }
        })
      } else {
        const numeric = ['inning', 'outs', 'base_state', 'pitches'].includes(gb)
        let list = rows
        if (gb === 'pitches') {
          // 15+ pitch plate appearances are rare; fold the tail into one row so the chart stays readable
          const tail = rows.filter(r => Number(r.grp) >= 15)
          const head = rows.filter(r => Number(r.grp) < 15)
          const folded = tail.reduce<PaRow | null>((a, r) => (a ? addRow(a, r) : { ...r, grp: '15+' }), null)
          list = folded ? [...head, folded] : head
        }
        if (numeric) list = [...list].sort((a, b) => (a.grp === '15+' ? 99 : Number(a.grp)) - (b.grp === '15+' ? 99 : Number(b.grp)))
        result.breakdown = list.map(r => ({
          code: r.grp, label: r.grp === '15+' ? '15+ pitches' : deepGroupLabel(gb, r.grp), totals: toTotals(r, group),
          teams: q.teams ? teamParts(teamRows.filter(t => (r.grp === '15+' ? Number(t.grp) >= 15 : t.grp === r.grp)), group) : undefined,
        }))
      }
      break
    }
    case 'trend':
    case 'compare': {
      const [rows0, baseRows] = await Promise.all([run({ group_by: 'season', ...(q.teams ? { split_by: teamKey } : {}) }), run({ group_by: 'season' }, false)])
      const bySeasonRow = new Map<string, PaRow>()
      for (const r of rows0) bySeasonRow.set(r.grp, bySeasonRow.has(r.grp) ? addRow(bySeasonRow.get(r.grp)!, r) : { ...r, grp2: '' })
      const rows = [...bySeasonRow.values()]
      const keep = (y: number) => (q.view === 'compare' ? years.includes(y) : true)
      const base = new Map(baseRows.map(r => [Number(r.grp), r]))
      const bySeason = rows.filter(r => keep(Number(r.grp))).map(r => ({
        season: Number(r.grp), totals: toTotals(r, group), baseline: base.get(Number(r.grp)) ? toTotals(base.get(Number(r.grp))!, group) : null,
        teams: q.teams ? teamParts(rows0.filter(t => t.grp === r.grp), group) : undefined,
      }))
      result.bySeason = q.view === 'compare'
        ? years.map(y => bySeason.find(s => s.season === y) ?? { season: y, totals: null, baseline: null })
        : bySeason.sort((a, b) => a.season - b.season)
      break
    }
    case 'teams': {
      const rows = await run({ group_by: group === 'pitching' ? 'pitcher_team' : 'batter_team' })
      const league: Totals = {}
      result.teams = rows.map((r): TeamOut => {
        const t = MLB_TEAMS.find(x => x.abbrev === r.grp)
        const tot = toTotals(r, group)
        for (const k of Object.keys(tot)) league[k] = (league[k] ?? 0) + tot[k]
        return { teamId: t?.id ?? 0, name: t?.name ?? r.grp, abbr: r.grp, totals: tot }
      })
      result.league = rows.length ? league : null
      break
    }
    case 'recent': {
      const { total, hits } = recentMatches(plateAppearances, filters, 30)
      const names = await playerNames([...new Set(hits.flatMap(h => [h.batter_id, h.pitcher_id]))])
      result.recentTotal = total
      result.recent = hits.map(h => ({
        gamePk: h.game_pk, date: h.game_date, atBat: h.at_bat_number, inning: h.inning, half: h.half, outs: h.outs, baseState: h.base_state, scoreDiff: h.score_diff,
        batterId: h.batter_id, batter: names.get(h.batter_id) ?? `Player ${h.batter_id}`, pitcherId: h.pitcher_id, pitcher: names.get(h.pitcher_id) ?? `Player ${h.pitcher_id}`,
        battingTeam: h.batter_team, fieldingTeam: h.pitcher_team, homeTeam: h.half === 'Top' ? h.pitcher_team : h.batter_team, awayTeam: h.half === 'Top' ? h.batter_team : h.pitcher_team,
        pitches: h.pitches, event: h.events, count: `${h.last_balls ?? '?'}-${h.last_strikes ?? '?'}`,
        ev: h.launch_speed, la: h.launch_angle ?? null, dist: h.hit_distance ?? null, bbType: h.bb_type ?? null,
      }))
      result.league = totalsOf(await run({}))
      break
    }
    case 'players': {
      const rows = await run({ group_by: group === 'pitching' ? 'pitcher_id' : 'batter_id', min_pa: q.minSample, row_limit: 400 })
      const names = await playerNames(rows.map(r => Number(r.grp)))
      result.players = rows.map((r): PlayerOut => ({ id: Number(r.grp), name: names.get(Number(r.grp)) ?? `Player ${r.grp}`, teamId: null, abbr: '', totals: toTotals(r, group) }))
      const base = await run({}, true)
      result.league = totalsOf(base)
      result.playersTruncated = rows.length >= 400
      break
    }
  }
  if (!result.league && result.baseline) result.league = null
  return result
}
