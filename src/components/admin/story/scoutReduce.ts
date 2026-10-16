// src/components/admin/story/scoutReduce.ts
//
// Pure reducers: the Scout Report desks (src/lib/scout/*) → small, display-ready
// cards for the story. Only `import type` from the desks, so this file is
// testable without Supabase or the network. Nothing here invents a number: a
// card is null when its sample is too thin or the desk returned nothing.

import type { AbsClub } from '@/lib/scout/abs-desk'
import type { ClubStatus } from '@/lib/scout/club-status'
import type { DefenseDesk } from '@/lib/scout/defense'
import type { LateInnings } from '@/lib/scout/late-innings'
import type { Leverage } from '@/lib/scout/leverage'
import type { RunGame } from '@/lib/scout/run-game'
import { shortName } from './names'
import type { AbsCard, CatcherBars, ClubCard, ClubLine, DefDeskCard, InningDiff, LateCard, Pitch, PctBar, RunCard, SplitStat, ZonePt } from './types'

const MIN_ABS_N = 5
const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

export function reduceRun(rg: RunGame | null, offense: string, defense: string): RunCard | null {
  if (!rg) return null
  const c = rg.catcher
  const card: RunCard = {
    offense, defense,
    catcher: c ? {
      id: c.id, name: c.name, short: shortName(c.name), attempts: c.popAttempts, sb: c.sb, cs: c.cs,
      strips: c.strips.filter(s => s.value != null).map(s => ({
        label: s.label.startsWith('Pop') ? 'Pop time' : s.label.startsWith('Exchange') ? 'Exchange' : 'Arm',
        unit: s.unit, value: s.value as number, rank: s.rank, of: s.of, median: s.median, betterLow: s.betterLow, decimals: s.decimals,
      })),
    } : null,
    pitcher: rg.pitcher ? { short: shortName(rg.pitcher.name), sb: rg.pitcher.sb, cs: rg.pitcher.cs, pickoffs: rg.pitcher.pickoffs } : null,
    attemptsPerGame: rg.offense.attemptsPerGame, leagueAttemptsPerGame: rg.offense.league.attemptsPerGame,
    successPct: rg.offense.successPct, leagueSuccessPct: rg.offense.league.successPct,
    rank: rg.offense.rank.attempts, of: rg.offense.rank.of,
    runners: rg.offense.runners.filter(r => r.sprint != null).sort((a, b) => (b.sprint ?? 0) - (a.sprint ?? 0)).slice(0, 3)
      .map(r => ({ short: shortName(r.name), sprint: r.sprint, sb: r.sb, cs: r.cs })),
  }
  const hasAnything = (card.catcher && (card.catcher.strips.length > 0 || card.catcher.sb + card.catcher.cs > 0)) || card.attemptsPerGame != null
  return hasAnything ? card : null
}

/** abs_challenge_log columns the story needs (plate_x/z are feet; sz_* feet). */
export type AbsLogRow = {
  game_pk: number; game_date: string; challenging_team_id: number; challenge_side: 'batting' | 'fielding'
  challenger_player_id: number | null; challenger_player_name: string | null
  batter_id: number | null; pitcher_id: number | null; is_overturned: boolean
  plate_x: number | null; plate_z: number | null; sz_top: number | null; sz_bot: number | null; sz_width_in: number | null
}

/** Regular season ends at the last club game date the desk counted (the log has no game_type column). */
export function absRegEnd(...clubs: (AbsClub | null)[]): string | null {
  const dates = clubs.flatMap(c => (c?.perGame ?? []).map(g => g.date))
  return dates.length ? dates.sort().at(-1)! : null
}

/** Who made the challenge: batting side → batter; fielding side → pitcher if he asked, else the catcher. */
export function challengerRole(r: Pick<AbsLogRow, 'challenge_side' | 'challenger_player_id' | 'pitcher_id'>): 'batter' | 'pitcher' | 'catcher' {
  if (r.challenge_side === 'batting') return 'batter'
  return r.challenger_player_id != null && r.challenger_player_id === r.pitcher_id ? 'pitcher' : 'catcher'
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0 }
export const MAX_ZONE_PTS = 40       // the latest 40 challenges: a readable scatter, not a blob

export function reduceAbs(a: AbsClub | null, abbr: string, teamId: number, log: AbsLogRow[] | null, regEnd: string | null): AbsCard | null {
  if (!a) return null
  const all = a.season.all
  if (all.n < MIN_ABS_N) return null
  const lg = a.league.all
  const mine = (log ?? []).filter(r => r.challenging_team_id === teamId)
  const reg = regEnd ? mine.filter(r => r.game_date <= regEnd) : mine
  const post = regEnd ? mine.length - reg.length : 0
  const split = { batter: 0, catcher: 0, pitcher: 0 }
  const by = new Map<number, { name: string; side: 'batting' | 'fielding'; w: number; l: number }>()
  for (const r of reg) {
    split[challengerRole(r)] += 1
    if (r.challenger_player_id == null) continue
    const e = by.get(r.challenger_player_id) ?? { name: r.challenger_player_name ?? '', side: r.challenge_side, w: 0, l: 0 }
    if (r.is_overturned) e.w += 1; else e.l += 1
    by.set(r.challenger_player_id, e)
  }
  const top = [...by.values()].sort((x, y) => (y.w + y.l) - (x.w + x.l)).slice(0, 2)
    .map(t => ({ short: shortName(t.name), w: t.w, l: t.l, side: t.side }))
  const withLoc = reg.filter(r => r.plate_x != null && r.plate_z != null && r.sz_top != null && r.sz_bot != null && r.sz_top > r.sz_bot)
  const zoneH = Math.round(median(withLoc.map(r => ((r.sz_top as number) - (r.sz_bot as number)) * 12)) * 10) / 10
  const zone: ZonePt[] = withLoc.slice(-MAX_ZONE_PTS).map(r => ({
    x: Math.round((r.plate_x as number) * 12 * 10) / 10,
    z: Math.round((((r.plate_z as number) - (r.sz_bot as number)) / ((r.sz_top as number) - (r.sz_bot as number))) * 1000) / 1000,
    ov: r.is_overturned,
  }))
  return {
    abbr, games: a.season.games, challenges: all.n, overturns: all.ov,
    overturnPct: Math.round((all.ov / all.n) * 100),
    leagueOverturnPct: lg.n > 0 ? Math.round((lg.ov / lg.n) * 100) : null,
    perGame: a.season.games > 0 ? Math.round((all.n / a.season.games) * 100) / 100 : null,
    leaguePerGame: a.league.games > 0 ? Math.round((lg.n / a.league.games) * 100) / 100 : null,
    split, top, zone, zoneH, regN: reg.length, postN: post,
  }
}

// ── catcher percentile bars (player_fielding_run_value) ──────────────────
export type FrvRow = { player_id: number; framing_runs: number | null; blocking_runs: number | null; throwing_runs: number | null; outs_2: number | null; updated_at: string | null }
export const MIN_C_OUTS = 1500          // ≈ 500 inn at C

function pctBar(value: number | null, field: number[], betterLow = false): PctBar | null {
  if (value == null || field.length < 2) return null
  const better = field.filter(v => (betterLow ? v < value : v > value)).length
  const rank = 1 + better
  return { value, rank, of: field.length, pct: Math.round(((field.length - rank) / (field.length - 1)) * 100) }
}

const num = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

export function reduceCatcherBars(o: {
  id: number; rows: FrvRow[]; popStrip: { value: number; rank: number | null; of: number } | null; slate: string
  abs: { n: number; w: number } | null; absRank: { rank: number; of: number } | null
}): CatcherBars | null {
  const field = o.rows.filter(r => (num(r.outs_2) ?? 0) >= MIN_C_OUTS)
  const me = o.rows.find(r => r.player_id === o.id)
  const f = (k: 'framing_runs' | 'blocking_runs' | 'throwing_runs') => field.map(r => num(r[k])).filter((v): v is number => v != null)
  const bars = {
    framing: me ? pctBar(num(me.framing_runs), f('framing_runs')) : null,
    blocking: me ? pctBar(num(me.blocking_runs), f('blocking_runs')) : null,
    throwing: me ? pctBar(num(me.throwing_runs), f('throwing_runs')) : null,
    pop: o.popStrip && o.popStrip.rank != null ? { value: o.popStrip.value, rank: o.popStrip.rank, of: o.popStrip.of, pct: o.popStrip.of > 1 ? Math.round(((o.popStrip.of - o.popStrip.rank) / (o.popStrip.of - 1)) * 100) : 100 } : null,
  }
  const thru = me?.updated_at ? me.updated_at.slice(0, 10) : null
  const sevenBefore = new Date(`${o.slate}T12:00:00Z`); sevenBefore.setUTCDate(sevenBefore.getUTCDate() - 7)
  const abs = o.abs && o.abs.n >= 5 ? { n: o.abs.n, w: o.abs.w, pct: Math.round((o.abs.w / o.abs.n) * 100), rank: o.absRank?.rank ?? null, of: o.absRank?.of ?? 0 } : null
  if (!bars.framing && !bars.blocking && !bars.throwing && !bars.pop) return null
  return {
    ...bars, inn: me && num(me.outs_2) != null ? Math.round((num(me.outs_2) as number) / 3) : null,
    thru, stale: !!thru && thru < sevenBefore.toISOString().slice(0, 10), abs,
  }
}

/** Overturn-rate rank among league catchers with ≥ MIN_RANK challenges (regular season). */
export function catcherAbsStats(log: AbsLogRow[], regEnd: string | null, catcherId: number, minRank = 20) {
  const rows = log.filter(r => (!regEnd || r.game_date <= regEnd) && r.challenge_side === 'fielding' && r.challenger_player_id != null && challengerRole(r) === 'catcher')
  const by = new Map<number, { n: number; w: number }>()
  for (const r of rows) {
    const e = by.get(r.challenger_player_id as number) ?? { n: 0, w: 0 }
    e.n += 1; if (r.is_overturned) e.w += 1
    by.set(r.challenger_player_id as number, e)
  }
  const mine = by.get(catcherId) ?? null
  const field = [...by.values()].filter(e => e.n >= minRank).map(e => e.w / e.n)
  const rank = mine && mine.n >= minRank ? 1 + field.filter(v => v > mine.w / mine.n).length : null
  return { mine, rank: rank != null ? { rank, of: field.length } : null }
}

export function reduceClub(c: ClubStatus | null, abbr: string): ClubCard | null {
  if (!c) return null
  const line = (p: ClubStatus['players'][number]): ClubLine => ({ short: shortName(p.name), pos: p.pos, reason: trim(p.reason ?? '', 26) })
  const out = c.players.filter(p => p.status === 'out')
  const q = c.players.filter(p => p.status === 'questionable')
  const moves = c.transactions
    .filter(t => t.effect !== 'other' && !t.is_milb_move)
    .slice(0, 2)
    .map(t => `${t.effect === 'added' ? '+' : '−'} ${shortName(t.player_name)} · ${t.category.toLowerCase()}`)
  if (out.length === 0 && q.length === 0 && moves.length === 0) return null
  return {
    abbr, out: out.slice(0, 5).map(line), outMore: Math.max(0, out.length - 5),
    questionable: q.slice(0, 3).map(line), questionableMore: Math.max(0, q.length - 3), moves,
  }
}

const MIN_LEV_PA = 60

export function reduceLate(lev: Leverage | null, late: LateInnings | null, abbr: string): LateCard | null {
  const hitting: SplitStat[] = []
  if (lev) {
    const add = (label: string, s: { pa: number; ops: number | null; avg: number | null }) => {
      if (s.ops != null && s.pa >= MIN_LEV_PA) hitting.push({ label, pa: s.pa, ops: s.ops, avg: s.avg })
    }
    add('Late & close', lev.offense.lc)
    add('RISP', lev.offense.risp)
    add('7th inning+', lev.offense.late)
  }
  // Run differential by inning: the schedule's linescores (final games, regular season). Extras are left out.
  const sc = late?.season
  const innings: InningDiff[] = sc && sc.games > 0
    ? ['7th', '8th', '9th'].map((label, i) => ({ label, scored: sc.scored[i] ?? 0, allowed: sc.allowed[i] ?? 0, diff: (sc.scored[i] ?? 0) - (sc.allowed[i] ?? 0) }))
    : []
  if (hitting.length === 0 && innings.length === 0) return null
  return { abbr, hitting, oneRun: lev?.records.oneRun ?? null, innings, games: sc?.games ?? 0 }
}

export function reduceDefDesk(d: DefenseDesk | null, abbr: string): DefDeskCard | null {
  if (!d) return null
  const f = d.fielders.filter(x => x.oaa != null) as (typeof d.fielders[number] & { oaa: number })[]
  const sorted = [...f].sort((a, b) => b.oaa - a.oaa)
  const best = sorted.filter(x => x.oaa > 0).slice(0, 3)
  const worst = sorted.filter(x => x.oaa < 0).reverse().slice(0, 2)
  if (d.team.oaa == null && f.length === 0) return null
  const oaaById: Record<number, number> = {}
  for (const x of f) oaaById[x.id] = x.oaa
  const m = (x: typeof f[number]) => ({ short: shortName(x.name), pos: x.pos, oaa: x.oaa })
  return { abbr, oaa: d.team.oaa, rank: d.team.rank, of: d.team.of, oaaById, best: best.map(m), worst: worst.map(m) }
}

const MIN_PITCH_N = 50   // pitches of a type before it is listed

/** pitch_arsenals rows (numerics may be strings) → top pitches by usage. */
export function reduceArsenal(rows: Record<string, unknown>[] | null): Pitch[] | null {
  if (!rows || rows.length === 0) return null
  const n = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
  const out = rows.map(r => ({
    name: String(r.pitch_name ?? r.pitch_type ?? ''), code: String(r.pitch_type ?? ''),
    usagePct: n(r.percentage), velo: n(r.avg_velocity), whiffPct: n(r.whiff_percent),
    hardHitPct: n(r.hard_hit_percent), putAwayPct: n(r.put_away_percent), n: n(r.count) ?? 0,
  })).filter(p => p.name && p.n >= MIN_PITCH_N && p.usagePct != null)
    .sort((a, b) => (b.usagePct ?? 0) - (a.usagePct ?? 0)).slice(0, 5)
  return out.length ? out : null
}
