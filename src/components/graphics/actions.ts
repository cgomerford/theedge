'use server'

// src/components/graphics/actions.ts
//
// Server actions for /admin/graphics (behind the /admin basic-auth proxy, same as the Stat Line builder).
// Reads only: the slate comes from the free MLB Stats API; numbers come from the precomputed Supabase
// tables the site already uses (pitcher_stats, pitcher_zone_arsenal, abs_challenge_team_leaderboard).
// Nothing here writes, and nothing is fetched from Baseball Savant at request time.

import { buildAttackSpec, buildCollisionSpec, buildPitcherSpec, buildScoreboardSpec, type AbsInput, type AttackTeam, type AutofillResult, type BatterSplit, type PitcherInput, type Sb, type ScoreTeam, type TeamBlock } from '@/lib/graphics/autofill'
import { getEdgePrediction } from '@/lib/edge-fetch'
import { getFieldingAlignment } from '@/lib/fielding-alingment'
import { getProjectedLineup } from '@/lib/lineups'
import type { ArsenalPitch } from '@/lib/scout'
import { getPitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import { getPitcherStatsFull } from '@/lib/pitcher-full-stats'
import { createAdminClient } from '@/lib/supabase'
import { MLB_TEAMS } from '@/lib/teams'

const MLB = 'https://statsapi.mlb.com/api/v1'

export type SlateSide = { teamId: number; abbr: string; pitcherId: number | null; pitcherName: string }
export type SlateGame = { gamePk: number; label: string; away: SlateSide; home: SlateSide }

const abbrOf = (id: number, fallback?: string) => MLB_TEAMS.find(t => t.id === id)?.abbrev ?? fallback ?? String(id)

export async function loadSlate(date: string): Promise<SlateGame[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
  try {
    const res = await fetch(`${MLB}/schedule?sportId=1&date=${date}&hydrate=team,probablePitcher`, { signal: AbortSignal.timeout(10000), cache: 'no-store' })
    if (!res.ok) { console.error('[loadSlate] HTTP', res.status); return [] }
    const data = await res.json()
    const games = (data.dates?.[0]?.games ?? []) as Array<{ gamePk: number; teams: Record<'away' | 'home', { team: { id: number; abbreviation?: string }; probablePitcher?: { id: number; fullName: string } }> }>
    return games.map(g => {
      const side = (k: 'away' | 'home'): SlateSide => ({
        teamId: g.teams[k].team.id,
        abbr: abbrOf(g.teams[k].team.id, g.teams[k].team.abbreviation),
        pitcherId: g.teams[k].probablePitcher?.id ?? null,
        pitcherName: g.teams[k].probablePitcher?.fullName ?? '',
      })
      const away = side('away'), home = side('home')
      return { gamePk: g.gamePk, label: `${away.abbr} @ ${home.abbr}`, away, home }
    })
  } catch (err) {
    console.error('[loadSlate] failed:', err)
    return []
  }
}

async function throwsOf(id: number): Promise<'L' | 'R' | null> {
  try {
    const res = await fetch(`${MLB}/people/${id}`, { signal: AbortSignal.timeout(8000), cache: 'no-store' })
    if (!res.ok) return null
    const code = (await res.json()).people?.[0]?.pitchHand?.code
    return code === 'L' || code === 'R' ? code : null
  } catch (err) {
    console.error('[throwsOf] failed:', err)
    return null
  }
}

/** The Scout Report's own pitch table (pitch_arsenals), most-used pitch first. */
async function scoutArsenalOf(playerId: number, season: number): Promise<ArsenalPitch[]> {
  const { data, error } = await createAdminClient()
    .from('pitch_arsenals')
    .select('pitch_type, pitch_name, percentage, count, avg_velocity, whiff_percent, put_away_percent, est_woba, hard_hit_percent, ba_against')
    .eq('player_id', playerId).eq('season', season)
    .order('percentage', { ascending: false })
  if (error) { console.error('[scoutArsenalOf] Supabase error:', error.message); return [] }
  return ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
    pitch_type: String(r.pitch_type), pitch_name: String(r.pitch_name ?? r.pitch_type),
    percentage: r.percentage == null ? null : Number(r.percentage), count: r.count == null ? null : Number(r.count),
    avg_velocity: r.avg_velocity == null ? null : Number(r.avg_velocity), whiff_percent: r.whiff_percent == null ? null : Number(r.whiff_percent),
    put_away_percent: r.put_away_percent == null ? null : Number(r.put_away_percent), est_woba: r.est_woba == null ? null : Number(r.est_woba),
    hard_hit_percent: r.hard_hit_percent == null ? null : Number(r.hard_hit_percent), ba_against: r.ba_against == null ? null : Number(r.ba_against),
  }))
}

async function pitcherInput(side: SlateSide, oppAbbr: string, season: number): Promise<PitcherInput | null> {
  if (!side.pitcherId) return null
  const [stats, arsenalMap, hand, scoutArsenal] = await Promise.all([getPitcherStatsFull(side.pitcherId), getPitcherZoneArsenal(side.pitcherId), throwsOf(side.pitcherId), scoutArsenalOf(side.pitcherId, season)])
  return { id: side.pitcherId, name: side.pitcherName, throws: hand, teamAbbr: side.abbr, oppAbbr, stats, scoutArsenal, arsenal: arsenalMap.all ?? null, splits: { lhb: arsenalMap.vs_lhb ?? null, rhb: arsenalMap.vs_rhb ?? null } }
}

async function absFor(side: SlateSide): Promise<AbsInput | null> {
  const { data, error } = await createAdminClient().from('abs_challenge_team_leaderboard').select('team_id, total_challenges, total_overturns, season').eq('team_id', side.teamId).order('season', { ascending: false }).limit(1).maybeSingle()
  if (error) { if (error.code !== 'PGRST205') console.error('[absFor] Supabase error:', error.message); return null }
  if (!data) return null
  const d = data as { total_challenges: unknown; total_overturns: unknown }
  return { teamAbbr: side.abbr, overturns: Number(d.total_overturns), total: Number(d.total_challenges) }
}

export type AutofillTemplate = 'collision' | 'pitcher' | 'attack' | 'scoreboard'
export type AutofillArgs = { game: SlateGame; template: AutofillTemplate; side: 'away' | 'home'; kicker: string; date: string }

/** Runs `fn` over `items` at most six at a time (the MLB Stats API resets bursts from one process). */
async function pool<T, R>(items: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]) }
  }))
  return out
}

/** Season stolen bases / caught stealing for a player. Catchers: the split played at C; otherwise the first split. */
async function sbOf(id: number, group: 'hitting' | 'pitching' | 'fielding', year: number): Promise<Sb | null> {
  try {
    const res = await fetch(`${MLB}/people/${id}/stats?stats=season&group=${group}&season=${year}`, { signal: AbortSignal.timeout(8000), cache: 'no-store' })
    if (!res.ok) { console.error('[sbOf] HTTP', res.status, id, group); return null }
    const splits = ((await res.json()).stats?.[0]?.splits ?? []) as Array<{ team?: unknown; position?: { abbreviation?: string }; stat: { stolenBases?: number; caughtStealing?: number } }>
    const mine = group === 'fielding' ? splits.filter(x => x.position?.abbreviation === 'C') : splits
    // A traded player comes back as one combined row (no team) plus one row per club: use the combined row, never the sum.
    const row = mine.find(x => !x.team) ?? mine[0]
    if (!row) return null
    return { sb: Number(row.stat.stolenBases ?? 0), cs: Number(row.stat.caughtStealing ?? 0) }
  } catch (err) {
    console.error('[sbOf] failed:', err)
    return null
  }
}

async function lineupOf(side: SlateSide, game: SlateGame, date: string) {
  const l = await getProjectedLineup(side.teamId, date, game.gamePk)
  return { confirmed: l.source === 'confirmed', batters: l.batters }
}

async function attackTeam(side: SlateSide, opp: SlateSide, game: SlateGame, date: string, season: number): Promise<AttackTeam> {
  const [lineup, oppArsenal] = await Promise.all([lineupOf(side, game, date), opp.pitcherId ? scoutArsenalOf(opp.pitcherId, season) : Promise.resolve([])])
  const ids = lineup.batters.map(b => b.player_id)
  const [{ data, error }, fielders] = await Promise.all([
    ids.length ? createAdminClient().from('batter_pitch_type_splits').select('player_id, pitch_type, pitch_name, pa, whiff_percent, est_woba').in('player_id', ids) : Promise.resolve({ data: [], error: null }),
    getFieldingAlignment(lineup.batters, season),
  ])
  if (error) console.error('[attackTeam] Supabase error:', error.message)
  const splits: Record<number, BatterSplit[]> = {}
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const id = Number(r.player_id)
    ;(splits[id] ??= []).push({ pitch_type: String(r.pitch_type), pitch_name: (r.pitch_name as string) ?? null, pa: r.pa == null ? null : Number(r.pa), whiff_percent: r.whiff_percent == null ? null : Number(r.whiff_percent), est_woba: r.est_woba == null ? null : Number(r.est_woba) })
  }
  return { abbr: side.abbr, confirmed: lineup.confirmed, hitters: lineup.batters.map(b => ({ id: b.player_id, name: b.player_name })), splits, oppName: opp.pitcherName, oppArsenal, fielders: fielders.map(f => ({ position: f.position, playerName: f.playerName, totalRuns: f.totalRuns })) }
}

async function scoreTeam(side: SlateSide, game: SlateGame, date: string, year: number): Promise<ScoreTeam> {
  const lineup = await lineupOf(side, game, date)
  const cat = lineup.batters.find(b => b.position === 'C')
  const [catSb, runSb, pitSb] = await Promise.all([
    cat ? sbOf(cat.player_id, 'fielding', year) : Promise.resolve(null),
    pool(lineup.batters, b => sbOf(b.player_id, 'hitting', year)),
    side.pitcherId ? sbOf(side.pitcherId, 'pitching', year) : Promise.resolve(null),
  ])
  return {
    abbr: side.abbr,
    catcher: cat && catSb ? { id: cat.player_id, name: cat.player_name, sb: catSb } : null,
    runners: lineup.batters.flatMap((b, i) => (runSb[i] ? [{ name: b.player_name, sb: runSb[i] as Sb }] : [])),
    starter: side.pitcherName && pitSb ? { name: side.pitcherName, allowed: pitSb } : null,
  }
}

/** Team block from the game's stored scout numbers: stat fields only (chase rate, strikeout rate, bullpen ERA). */
async function teamBlocks(gamePk: number, game: SlateGame): Promise<[TeamBlock | null, TeamBlock | null]> {
  const raw = (await getEdgePrediction(gamePk).catch(() => null))?.components_raw as { away_team?: Record<string, unknown>; home_team?: Record<string, unknown> } | null | undefined
  const n = (v: unknown) => (v == null || Number.isNaN(Number(v)) ? null : Number(v))
  const one = (t: Record<string, unknown> | undefined, abbr: string): TeamBlock | null => (t ? { abbr, chase: n(t.chase_rate ?? t.chase_pct_vs_rhp), kPct: n(t.k_pct), bullpenEra: n(t.bullpen_era) } : null)
  return [one(raw?.away_team, game.away.abbr), one(raw?.home_team, game.home.abbr)]
}

export async function autofillGraphic(args: AutofillArgs): Promise<AutofillResult | { error: string }> {
  const { game, template, side, kicker, date } = args
  const year = Number(date.slice(0, 4)) || new Date().getFullYear()
  try {
    if (template === 'pitcher') {
      const mine = game[side], theirs = game[side === 'away' ? 'home' : 'away']
      const p = await pitcherInput(mine, theirs.abbr, year)
      return p ? buildPitcherSpec(p, kicker) : { error: `No probable pitcher listed for ${mine.abbr} yet.` }
    }
    if (template === 'attack') {
      const [a, h] = await Promise.all([attackTeam(game.away, game.home, game, date, year), attackTeam(game.home, game.away, game, date, year)])
      return buildAttackSpec(a, h, kicker)
    }
    if (template === 'scoreboard') {
      const [a, h, abs] = await Promise.all([scoreTeam(game.away, game, date, year), scoreTeam(game.home, game, date, year), Promise.all([absFor(game.away), absFor(game.home)])])
      return buildScoreboardSpec(a, h, abs.filter((x): x is AbsInput => !!x), kicker)
    }
    const [away, home, teams] = await Promise.all([pitcherInput(game.away, game.home.abbr, year), pitcherInput(game.home, game.away.abbr, year), teamBlocks(game.gamePk, game)])
    if (!away || !home) return { error: 'Both teams need a probable pitcher listed.' }
    return buildCollisionSpec(away, home, teams, kicker)
  } catch (err) {
    console.error('[autofillGraphic] failed:', err)
    return { error: 'Auto-fill failed. Check the server log.' }
  }
}

export type PlayerHit = { id: number; name: string; pos: string; active: boolean }

/** Name search for headshots (free MLB Stats API). Returns up to 12 matches, active players first. */
export async function searchPlayers(name: string): Promise<PlayerHit[]> {
  const q = name.trim()
  if (q.length < 3) return []
  try {
    const res = await fetch(`${MLB}/people/search?names=${encodeURIComponent(q)}&sportIds=1`, { signal: AbortSignal.timeout(8000), cache: 'no-store' })
    if (!res.ok) { console.error('[searchPlayers] HTTP', res.status); return [] }
    const people = ((await res.json()).people ?? []) as Array<{ id: number; fullName: string; active?: boolean; primaryPosition?: { abbreviation?: string } }>
    return people.map(p => ({ id: p.id, name: p.fullName, pos: p.primaryPosition?.abbreviation ?? '', active: !!p.active })).sort((a, b) => Number(b.active) - Number(a.active)).slice(0, 12)
  } catch (err) {
    console.error('[searchPlayers] failed:', err)
    return []
  }
}
