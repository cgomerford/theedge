// src/lib/nfl-edge/factors.ts
//
// The public "Edge read": which club leans ahead on each of up to ten factors, and how many.
//
// HOUSE RULES (CLAUDE.md §1) — this file is built so they cannot be broken by a caller:
//  - There is NO raw Edge Score. Nothing here computes, returns or exposes a numeric score or a
//    win probability. Each factor resolves to a lean (home / away / even) and the page shows COUNTS
//    ("6 of 9 factors lean BUF").
//  - No odds, spreads, totals, picks. The copy says "reads", "leans", "factors".
//
// METHOD: every team-quality factor compares one unit head-to-head (e.g. pass offence EPA per dropback),
// standardised against all 32 clubs. A club "leans" on a factor when it is at least 0.4 league standard
// deviations ahead. Below that the factor is "even". A factor with no data on either side is left out of
// the count entirely (it reduces M) rather than being filled in.

import { column, mean, percentile, rankOf, sd, teamBlend, ratesOf, type LeagueForm, type LeagueRates, type Rates, leagueRates } from './form'
import { roofKind, type NflGame } from './games'
import { getQbTable, type QbSeason } from './players'

export type Side = 'home' | 'away' | 'even'

export type Factor = {
  key: string
  label: string
  plain: string            // one plain-English sentence on what this factor measures
  lean: Side
  homeDisplay: string
  awayDisplay: string
  homeRank: number | null  // rank among 32 (1 = best), where the factor is a league-ranked stat
  awayRank: number | null
  homePct: number | null   // 0–100 league percentile, drives the radar
  awayPct: number | null
  sample: string           // "n" line: what the number is built from
}

export type Strength = 'strong' | 'moderate' | 'slight' | 'even'

export type EdgeRead = {
  factors: Factor[]
  homeCount: number
  awayCount: number
  evenCount: number
  total: number            // M: factors that had data on both sides
  lean: Side
  strength: Strength
  earlyNote: string | null // set when last season is blended in
  ready: boolean           // false when league form is missing entirely
}

const LEAN_Z = 0.4

const sgn = (v: number) => (v >= 0 ? '+' : '')
const f2 = (v: number | null) => (v == null ? '—' : `${sgn(v)}${v.toFixed(2)}`)
const pct1 = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)

/** Shrink a small-sample rate toward the league rate by k pseudo-observations. */
function shrink(rate: number | null, n: number, lg: number, k: number): number {
  return (((rate ?? lg) * n) + lg * k) / (n + k)
}

type MetricDef = {
  key: string
  label: string
  plain: string
  higherBetter: boolean
  radar: boolean
  pick: (r: Rates, lg: { rz: number }) => number | null
  fmt: (v: number | null) => string
  sample: (r: Rates) => string
}

const DEFS: MetricDef[] = [
  {
    key: 'ol', label: 'Pass protection', plain: 'How rarely the offensive line lets its quarterback get sacked (sacks per dropback).',
    higherBetter: false, radar: true, pick: r => r.sackAllowed, fmt: pct1, sample: r => `${Math.round(r.plays)} plays`,
  },
  {
    key: 'passO', label: 'Pass offense', plain: 'Expected points added per dropback — how much the passing game moves the scoreboard.',
    higherBetter: true, radar: true, pick: r => r.passEpaO, fmt: f2, sample: r => `${Math.round(r.plays)} plays`,
  },
  {
    key: 'rushO', label: 'Rush offense', plain: 'Expected points added per carry.',
    higherBetter: true, radar: true, pick: r => r.rushEpaO, fmt: f2, sample: r => `${Math.round(r.plays)} plays`,
  },
  {
    key: 'passD', label: 'Pass defense', plain: 'Expected points allowed per opposing dropback — lower is better.',
    higherBetter: false, radar: true, pick: r => r.passEpaD, fmt: f2, sample: r => `${Math.round(r.plays)} plays`,
  },
  {
    key: 'rushD', label: 'Rush defense', plain: 'Expected points allowed per opposing carry — lower is better.',
    higherBetter: false, radar: true, pick: r => r.rushEpaD, fmt: f2, sample: r => `${Math.round(r.plays)} plays`,
  },
  {
    key: 'rz', label: 'Red zone', plain: 'Touchdown rate inside the 20 on offense minus the rate the defense allows (small samples are pulled toward the league average).',
    higherBetter: true, radar: true,
    pick: (r, lg) => shrink(r.rzTdO, r.rzTripsO, lg.rz, 8) - shrink(r.rzTdD, r.rzTripsD, lg.rz, 8),
    fmt: v => (v == null ? '—' : `${sgn(v)}${(v * 100).toFixed(0)} pts`), sample: r => `${r.rzTripsO} off / ${r.rzTripsD} def trips`,
  },
  {
    key: 'to', label: 'Turnovers', plain: 'Takeaways minus giveaways per game. Turnover margin swings a lot week to week, so it counts lightly.',
    higherBetter: true, radar: true,
    pick: r => (r.gamesEff > 0 ? (r.takeaways - r.giveaways) / r.gamesEff : null),
    fmt: v => (v == null ? '—' : `${sgn(v)}${v.toFixed(1)} / g`), sample: r => `${r.takeaways} takeaways · ${r.giveaways} giveaways`,
  },
]

/** QB form: a QB's blended passing EPA per attempt (this season + faded last season). */
function qbEpa(table: QbSeason[], id: string | null, season: number): { v: number | null; att: number } {
  if (!id) return { v: null, att: 0 }
  const cur = table.find(q => q.id === id && q.season === season)
  const prev = table.find(q => q.id === id && q.season === season - 1)
  const w = 0.4 * Math.max(0, 1 - (cur?.games ?? 0) / 12)
  const att = (cur?.att ?? 0) + (prev?.att ?? 0) * w
  if (att < 20) return { v: null, att }
  const epa = (cur?.epa ?? 0) + (prev?.epa ?? 0) * w
  return { v: epa / att, att }
}

export async function computeEdgeRead(args: {
  game: NflGame
  lf: LeagueForm
  homeQbId: string | null
  awayQbId: string | null
}): Promise<EdgeRead> {
  const { game, lf } = args
  const lr: LeagueRates = leagueRates(lf)
  const home = lr.get(game.homeId)
  const away = lr.get(game.awayId)
  if (!home || !away || lr.size < 16) {
    return { factors: [], homeCount: 0, awayCount: 0, evenCount: 0, total: 0, lean: 'even', strength: 'even', earlyNote: null, ready: false }
  }

  const rzLg = mean(column(lr, r => r.rzTdO))
  const lg = { rz: Number.isFinite(rzLg) ? rzLg : 0.58 }
  const factors: Factor[] = []

  const push = (
    def: { key: string; label: string; plain: string; higherBetter: boolean },
    hv: number | null, av: number | null, all: number[], fmt: (v: number | null) => string, sample: string, sdOverride?: number,
  ) => {
    if (hv == null || av == null) return
    const s = sdOverride ?? sd(all)
    const better = def.higherBetter ? hv - av : av - hv
    const z = s > 0 ? better / s : 0
    factors.push({
      key: def.key, label: def.label, plain: def.plain,
      lean: z >= LEAN_Z ? 'home' : z <= -LEAN_Z ? 'away' : 'even',
      homeDisplay: fmt(hv), awayDisplay: fmt(av),
      homeRank: rankOf(hv, all, def.higherBetter), awayRank: rankOf(av, all, def.higherBetter),
      homePct: percentile(hv, all, def.higherBetter), awayPct: percentile(av, all, def.higherBetter),
      sample,
    })
  }

  // QB form first (it is the biggest single lever), then the unit factors.
  const table = await getQbTable(game.season)
  const hq = qbEpa(table, args.homeQbId, game.season)
  const aq = qbEpa(table, args.awayQbId, game.season)
  const qbAll = table.filter(q => q.season === game.season - 1 && q.att >= 200).map(q => q.epa / q.att)
  push(
    { key: 'qb', label: 'QB form', plain: "Each starting quarterback's passing EPA per attempt (this season, with last season blended in early on).", higherBetter: true },
    hq.v, aq.v, qbAll.length >= 8 ? qbAll : [], f2,
    `${Math.round(hq.att)} / ${Math.round(aq.att)} weighted attempts`, qbAll.length >= 8 ? undefined : 0.12,
  )
  // QB has no 32-club ranking; give the radar a percentile against last season's qualified QBs instead.
  const qbF = factors.find(f => f.key === 'qb')
  if (qbF && qbAll.length >= 8) {
    qbF.homePct = percentile(hq.v, qbAll, true)
    qbF.awayPct = percentile(aq.v, qbAll, true)
    qbF.homeRank = null
    qbF.awayRank = null
  }

  for (const d of DEFS) {
    const all = column(lr, r => d.pick(r, lg))
    push(d, d.pick(home, lg), d.pick(away, lg), all, d.fmt, `${d.sample(home)} · ${d.sample(away)}`)
  }

  // Rest: days between games. Three or more days of difference is a real edge; two is borderline; keep 2 as the line.
  if (game.homeRest != null && game.awayRest != null) {
    const diff = game.homeRest - game.awayRest
    factors.push({
      key: 'rest', label: 'Rest', plain: 'Days since each club last played. A short week or a bye changes recovery and prep.',
      lean: diff >= 2 ? 'home' : diff <= -2 ? 'away' : 'even',
      homeDisplay: `${game.homeRest} days`, awayDisplay: `${game.awayRest} days`, homeRank: null, awayRank: null, homePct: null, awayPct: null,
      sample: 'schedule',
    })
  }

  // Weather / roof: only a factor when conditions are known. Upcoming games usually have none yet.
  const rk = roofKind(game.roof, game.stadium)
  if (rk === 'dome') {
    factors.push({
      key: 'weather', label: 'Weather / roof', plain: 'Roofed stadium: weather is not in play, so neither side gets a lean.',
      lean: 'even', homeDisplay: 'Roof closed', awayDisplay: 'Roof closed', homeRank: null, awayRank: null, homePct: null, awayPct: null, sample: 'stadium',
    })
  } else if (rk === 'outdoors' && (game.temp != null || game.wind != null)) {
    const rough = (game.wind ?? 0) >= 15 || (game.temp != null && game.temp <= 32)
    const hr = home.rushEpaO, ar = away.rushEpaO
    let lean: Side = 'even'
    if (rough && hr != null && ar != null) {
      const s = sd(column(lr, r => r.rushEpaO))
      const z = s > 0 ? (hr - ar) / s : 0
      lean = z >= LEAN_Z ? 'home' : z <= -LEAN_Z ? 'away' : 'even'
    }
    const cond = `${game.temp != null ? `${game.temp}°F` : '—'} · ${game.wind != null ? `${game.wind} mph` : '—'}`
    factors.push({
      key: 'weather', label: 'Weather / roof',
      plain: rough
        ? 'Wind of 15+ mph or freezing cold works against the passing game, so the club with the stronger rush offense leans.'
        : 'Mild conditions: weather is not shaping this game, so neither side gets a lean.',
      lean, homeDisplay: cond, awayDisplay: cond, homeRank: null, awayRank: null, homePct: null, awayPct: null, sample: 'reported game conditions',
    })
  }

  const homeCount = factors.filter(f => f.lean === 'home').length
  const awayCount = factors.filter(f => f.lean === 'away').length
  const gap = Math.abs(homeCount - awayCount)
  const hb = teamBlend(lf, game.homeId), ab = teamBlend(lf, game.awayId)
  const early = hb.usesPrior || ab.usesPrior
  return {
    factors, homeCount, awayCount, evenCount: factors.length - homeCount - awayCount, total: factors.length,
    lean: gap === 0 ? 'even' : homeCount > awayCount ? 'home' : 'away',
    strength: gap >= 4 ? 'strong' : gap >= 2 ? 'moderate' : gap === 1 ? 'slight' : 'even',
    earlyNote: early
      ? `Early-season read: ${Math.min(hb.games, ab.games)} game${Math.min(hb.games, ab.games) === 1 ? '' : 's'} played so far, so ${game.season - 1} results are blended in (weight fades to zero by game 12).`
      : null,
    ready: true,
  }
}

export function leanLabel(read: EdgeRead, homeAbbr: string, awayAbbr: string): string {
  if (!read.ready || read.total === 0) return 'Not enough data yet'
  if (read.lean === 'even') return 'Even read'
  const who = read.lean === 'home' ? homeAbbr : awayAbbr
  const word = read.strength === 'strong' ? 'Strong' : read.strength === 'moderate' ? 'Moderate' : 'Slight'
  return `${word} lean ${who}`
}

export { ratesOf }
