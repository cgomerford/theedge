import 'server-only'
// src/lib/gm/cockpit.ts
//
// The GM cockpit on My x9Lab: the players a person follows treated as a squad they run. For each one it gathers what we really hold and nothing more:
//   rating   the average of his Savant percentile ranks (Pro only: a free account sees three ranks, and an average of the best three would mislead, so no number is shown)
//   form     the latest heating or cooling signal (player_form_signals) with its 8-point trend and how old it is
//   ranks    where he sits among qualified players on key stats, from league_player_stats
//   flags    things worth a look: form swings, results far from contact quality (wOBA vs xwOBA, ERA vs xERA), and roster moves
// Everything describes what has happened, with the sample behind it. Nothing is predicted. A missing source is skipped, never filled with a guess.

import { createAdminClient } from '@/lib/supabase'
import { getLeagueRows } from '@/lib/dashboard/data'
import { ranked, type LeagueRow } from '@/lib/dashboard/compute'
import { fmtStat, statDef, type Role } from '@/lib/dashboard/stats'
import type { FollowedPlayer } from '@/lib/follows/me-data'
import type { PctBlock, PctRow } from '@/lib/follows/percentiles'
import type { FeedRow } from '@/lib/follows/feed'
import { logOnce } from '@/lib/log'

export type Signal = { signal: 'heating' | 'cooling'; metric: string; magnitude: number; current: number; extreme: number | null; trend: number[]; games: number | null; date: string }
export type Rank = { label: string; value: string; rank: number; of: number }
export type Flag = { id: string; tone: 'good' | 'warn' | 'info'; playerId: number | null; player: string; title: string; detail: string; date: string | null }
export type SquadMember = {
  id: number; name: string; team: string | null; pos: string | null; isPitcher: boolean
  rating: number | null; pct: PctRow[]; lockedCount: number
  signal: Signal | null; ranks: Rank[]; tiles: { v: string; l: string }[]
  lastGame: string | null; next: string | null
}
export type Cockpit = { members: SquadMember[]; flags: Flag[]; gauges: { rating: number | null; rated: number; heating: number; cooling: number; flags: number } }

const METRIC: Record<string, string> = { ops: 'OPS', avg: 'AVG', slg: 'SLG', obp: 'OBP', era: 'ERA', whip: 'WHIP' }
const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtM = (m: string, v: number) => (m === 'era' ? v.toFixed(2) : v.toFixed(3).replace(/^0/, ''))
const MIN = { batter: { key: 'pa', n: 100 }, pitcher: { key: 'p_ip', n: 30 } } as const
const RANK_STATS: Record<Role, string[]> = { batter: ['on_base_plus_slg', 'woba', 'home_run'], pitcher: ['p_era', 'k_pct', 'xera'] }

/** The latest signal for each player: the newest date, and on that date the biggest swing. */
async function getSignals(ids: number[]): Promise<Map<number, Signal>> {
  const out = new Map<number, Signal>()
  if (ids.length === 0) return out
  const { data, error } = await createAdminClient().from('player_form_signals').select('player_id,computed_date,signal,metric,magnitude,current_value,extreme_value,trend,games').in('player_id', ids).order('computed_date', { ascending: false }).limit(400)
  if (error) { logOnce('gm.signals', 'getSignals', 'Supabase error', error.message); return out }
  for (const r of (data ?? []) as unknown as { player_id: number; computed_date: string; signal: string; metric: string; magnitude: number | string; current_value: number | string; extreme_value: number | string | null; trend: number[] | null; games: number | null }[]) {
    if (r.signal !== 'heating' && r.signal !== 'cooling') continue
    const s: Signal = { signal: r.signal, metric: r.metric, magnitude: Number(r.magnitude), current: Number(r.current_value), extreme: r.extreme_value == null ? null : Number(r.extreme_value), trend: Array.isArray(r.trend) ? r.trend.map(Number).filter(Number.isFinite) : [], games: r.games == null ? null : Number(r.games), date: r.computed_date }
    const have = out.get(Number(r.player_id))
    if (!have || (s.date === have.date && s.magnitude > have.magnitude)) out.set(Number(r.player_id), s)
  }
  return out
}

function rankFor(rows: LeagueRow[], role: Role, id: number): { qualified: boolean; rank: Rank[] } {
  const me = rows.find(r => r.id === id)
  const min = MIN[role]
  if (!me || (me.s[min.key] ?? 0) < min.n) return { qualified: false, rank: [] }
  const pool = rows.filter(r => (r.s[min.key] ?? 0) >= min.n)
  const out: Rank[] = []
  for (const key of RANK_STATS[role]) {
    const def = statDef(role, key)
    if (!def || me.s[key] == null) continue
    const order = ranked(pool, role, key, 'best')
    const i = order.findIndex(r => r.id === id)
    if (i >= 0) out.push({ label: def.label, value: fmtStat(def, me.s[key]), rank: i + 1, of: order.length })
  }
  return { qualified: true, rank: out }
}

export async function buildCockpit(players: FollowedPlayer[], blocks: Map<number, PctBlock>, feed: FeedRow[], isPro: boolean): Promise<Cockpit> {
  const [signals, bat, pit] = await Promise.all([getSignals(players.map(p => p.id)), getLeagueRows('batter'), getLeagueRows('pitcher')])
  const flags: Flag[] = []
  const members: SquadMember[] = players.map(p => {
    const role: Role = p.isPitcher ? 'pitcher' : 'batter'
    const league = (p.isPitcher ? pit : bat)?.rows ?? []
    const { qualified, rank } = league.length ? rankFor(league, role, p.id) : { qualified: false, rank: [] as Rank[] }
    const block = blocks.get(p.id)
    const pct = block?.state === 'ok' ? block.rows : []
    // an average of every rank is only honest when every rank is in view, so it is Pro's alone
    const rating = isPro && pct.length >= 4 ? Math.round(pct.reduce((a, r) => a + r.pct, 0) / pct.length) : null
    const signal = signals.get(p.id) ?? null

    if (signal) {
      const m = METRIC[signal.metric] ?? signal.metric.toUpperCase()
      const up = signal.signal === 'heating'
      flags.push({ id: `sig-${p.id}`, tone: up ? 'good' : 'warn', playerId: p.id, player: p.name, date: signal.date,
        title: `${p.name} is ${up ? 'heating up' : 'cooling off'}: ${m} ${fmtM(signal.metric, signal.current)}`,
        detail: `${m} is ${up ? 'up' : 'down'} ${fmtM(signal.metric, signal.magnitude)} ${up ? 'from a recent low of' : 'from a recent high of'} ${signal.extreme == null ? 'its recent range' : fmtM(signal.metric, signal.extreme)}${signal.games ? `, over the last ${signal.games} games` : ''}. Latest signal on file.` })
    }
    if (qualified && league.length) {
      const me = league.find(r => r.id === p.id)!
      if (!p.isPitcher && me.s.woba != null && me.s.xwoba != null && Math.abs(me.s.woba - me.s.xwoba) >= 0.03) {
        const better = me.s.woba > me.s.xwoba
        flags.push({ id: `luck-${p.id}`, tone: 'info', playerId: p.id, player: p.name, date: null, title: `${p.name}: results ${better ? 'ahead of' : 'behind'} contact quality`,
          detail: `wOBA ${fmtM('ops', me.s.woba)} against xwOBA ${fmtM('ops', me.s.xwoba)} on ${Math.round(me.s.pa)} plate appearances. ${better ? 'His results are better than the contact he made, which can point to defense or luck helping.' : 'His results are worse than the contact he made, which can point to defense or luck hurting.'}` })
      }
      if (p.isPitcher && me.s.p_era != null && me.s.xera != null && Math.abs(me.s.p_era - me.s.xera) >= 0.5) {
        const higher = me.s.p_era > me.s.xera
        flags.push({ id: `luck-${p.id}`, tone: 'info', playerId: p.id, player: p.name, date: null, title: `${p.name}: ERA ${higher ? 'above' : 'below'} xERA`,
          detail: `ERA ${me.s.p_era.toFixed(2)} against xERA ${me.s.xera.toFixed(2)} over ${me.s.p_ip.toFixed(0)} innings. ${higher ? 'The contact he allowed has been better than his ERA, which can point to defense or luck hurting.' : 'The contact he allowed has been worse than his ERA, which can point to defense or luck helping.'}` })
      }
    }
    return {
      id: p.id, name: p.name, team: p.teamAbbrev, pos: p.pos, isPitcher: p.isPitcher, rating, pct, lockedCount: block?.lockedCount ?? 0,
      signal, ranks: rank, tiles: p.stats.slice(0, 4),
      lastGame: p.lastGame ? `Last: ${shortDate(p.lastGame.date)} · ${p.lastGame.line}` : null, next: p.next ? `${shortDate(p.next.date)} ${p.next.label}` : null,
    }
  })
  for (const f of feed.filter(f => f.kind === 'player').slice(0, 4)) flags.push({ id: `tx-${f.date}-${f.who}`, tone: 'info', playerId: null, player: f.who, title: f.text, detail: 'Roster move from MLB transactions.', date: f.date })

  const rated = members.filter(m => m.rating != null)
  const order = (f: Flag) => (f.id.startsWith('tx-') ? 0 : f.id.startsWith('sig-') && f.tone === 'warn' ? 1 : f.id.startsWith('sig-') ? 2 : 3)
  flags.sort((a, b) => order(a) - order(b) || (b.date ?? '').localeCompare(a.date ?? ''))
  return {
    members, flags: flags.slice(0, 12),
    gauges: { rating: rated.length ? Math.round(rated.reduce((a, m) => a + (m.rating ?? 0), 0) / rated.length) : null, rated: rated.length, heating: members.filter(m => m.signal?.signal === 'heating').length, cooling: members.filter(m => m.signal?.signal === 'cooling').length, flags: flags.length },
  }
}
