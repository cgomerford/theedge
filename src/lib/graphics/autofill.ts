// src/lib/graphics/autofill.ts
//
// Pure builders: real rows in, a GraphicSpec out. Anything the data does not have is left out of the
// spec and listed in `missing`, never invented (CLAUDE.md: empty state over fabricated data).
// The reads themselves live in src/components/graphics/actions.ts (server action behind /admin auth).
//
// Sources are the same tables the Scout Report on the game page reads:
//   pitch_arsenals            per-pitch usage, velocity, whiff, xwOBA        (pitcher card)
//   pitcher_stats             ERA, WHIP, K/9, times through the order        (pitcher card, head to head)
//   batter_pitch_type_splits  per-hitter xwOBA and whiff by pitch type       (attack map)
//   player_fielding_run_value fielding runs by lineup position               (attack map tiles)
//   edge_predictions.components_raw  team chase rate, K%, bullpen ERA        (head to head; stat fields only)
//   abs_challenge_team_leaderboard + MLB Stats API                           (catchers and running)

import type { PitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import type { PitcherStatsFull } from '@/lib/pitcher-full-stats'
import type { ArsenalPitch } from '@/lib/scout'
import type { GraphicSpec, Stat } from './types'

export type PitcherInput = {
  id: number
  name: string
  throws: 'L' | 'R' | null
  teamAbbr: string
  oppAbbr: string
  stats: PitcherStatsFull | null
  /** pitch_arsenals rows (what the Scout Report shows), most-used first. */
  scoutArsenal: ArsenalPitch[]
  arsenal: PitcherZoneArsenal | null
  /** Platoon splits of the same table (vs left- and right-handed hitters). */
  splits?: { lhb: PitcherZoneArsenal | null; rhb: PitcherZoneArsenal | null }
}
export type AbsInput = { teamAbbr: string; overturns: number; total: number }
export type AutofillResult = { spec: GraphicSpec; missing: string[] }

const MIN_SWINGS = 20
const num = (v: unknown): number | null => { const n = Number(v); return v == null || Number.isNaN(n) ? null : n }
const pct1 = (n: number) => `${n.toFixed(1)}%`
const rate3 = (n: number) => n.toFixed(3).replace(/^0/, '')
const dec2 = (n: number) => n.toFixed(2)
const PITCH_SHORT: Record<string, string> = { '4-Seam Fastball': 'Four seam', '2-Seam Fastball': 'Two seam', 'Split-Finger': 'Splitter', 'Knuckle Curve': 'Knuckle curve' }
const pitchName = (n: string) => PITCH_SHORT[n] ?? n
/** Scout Report percentages come as 0.232 or 23.2; normalise to a percent (same rule as normPct in scout.ts). */
const asPct = (v: unknown): number | null => { const n = num(v); return n == null ? null : n > 1.5 ? n : n * 100 }
/** Surname for tight labels: drops Jr., Sr., II, III and IV so "Mesa Jr." reads "Mesa". */
export const surname = (full: string): string => {
  const w = full.trim().split(/\s+/).filter(Boolean)
  while (w.length > 1 && /^(jr|sr|ii|iii|iv)\.?$/i.test(w[w.length - 1])) w.pop()
  return w[w.length - 1] ?? full
}
const lastName = surname

type ZoneCell = { swings?: unknown; whiffs?: unknown; woba_against?: unknown; batted_balls?: unknown }

/** Whiff% (whiffs over swings) and xwOBA on contact (batted-ball weighted) across zone cells; null when the sample is too small. */
function aggregate(zones: ZoneCell[], minSwings: number, minBb: number): { whiff: number | null; xwobacon: number | null } {
  let swings = 0, whiffs = 0, bb = 0, wsum = 0
  for (const z of zones) {
    swings += num(z.swings) ?? 0
    whiffs += num(z.whiffs) ?? 0
    const w = num(z.woba_against), b = num(z.batted_balls) ?? 0
    if (w != null && b > 0) { wsum += w * b; bb += b }
  }
  return { whiff: swings >= minSwings ? (whiffs / swings) * 100 : null, xwobacon: bb >= minBb ? wsum / bb : null }
}

/** Per-pitch line. */
export function pitchLine(p: PitcherZoneArsenal['arsenal'][string]): { whiff: number | null; xwobacon: number | null } {
  return aggregate(Object.values(p.zones ?? {}), MIN_SWINGS, 10)
}

/** Whole-arsenal line for one platoon split (every pitch, every zone). */
export function splitLine(a: PitcherZoneArsenal | null | undefined): { whiff: number | null; xwobacon: number | null } {
  if (!a) return { whiff: null, xwobacon: null }
  return aggregate(Object.values(a.arsenal).flatMap(x => Object.values(x.zones ?? {})), 40, 25)
}

export function buildPitcherSpec(p: PitcherInput, kicker: string): AutofillResult {
  const missing: string[] = []
  const rows: Stat[] = []
  const pitches = p.scoutArsenal.filter(x => (num(x.percentage) ?? 0) >= 2).slice(0, 6)
  if (pitches.length) {
    for (const x of pitches) {
      const usage = num(x.percentage) ?? 0, velo = num(x.avg_velocity), wh = num(x.whiff_percent), xw = num(x.est_woba)
      rows.push({ group: 'pitch', label: pitchName(x.pitch_name), value: velo != null ? `${velo.toFixed(1)} mph` : '', n: usage, cells: [pct1(usage), wh != null ? pct1(wh) : '', xw != null ? rate3(xw) : ''] })
    }
  } else missing.push('arsenal (no pitch_arsenals rows this season)')

  // Left panel: two numbers per row, both real. A row with either side missing is left out, never filled in.
  const s = p.stats
  const contrast: Stat[] = []
  const pair = (label: string, a: { label: string; v: number | null }, b: { label: string; v: number | null }, fmt: (n: number) => string) => {
    if (a.v == null || b.v == null) { missing.push(label); return }
    contrast.push({ group: 'contrast', label, value: fmt(a.v), n: a.v, sub: a.label, vs: { label: b.label, value: fmt(b.v), n: b.v } })
  }
  if (s) {
    pair('ERA', { label: 'Last 3', v: num(s.l3_era) }, { label: 'Season', v: num(s.era) }, dec2)
    pair('wOBA, 1st vs 3rd time through', { label: '1st time', v: num(s.tto1_woba) }, { label: '3rd time', v: num(s.tto3_woba) }, rate3)
  } else missing.push('season stats (no pitcher_stats row)')
  const L = splitLine(p.splits?.lhb), R = splitLine(p.splits?.rhb)
  pair('Whiff rate', { label: 'vs LHB', v: L.whiff }, { label: 'vs RHB', v: R.whiff }, pct1)
  pair('xwOBA on contact', { label: 'vs LHB', v: L.xwobacon }, { label: 'vs RHB', v: R.xwobacon }, rate3)

  const tiles: Stat[] = []
  if (s) {
    const add = (label: string, v: number | null) => { if (v != null) tiles.push({ group: 'tile', label, value: dec2(v) }); else missing.push(label) }
    add('WHIP', num(s.whip)); add('FIP', num(s.fip)); add('K per 9', num(s.k_per_9)); add('BB per 9', num(s.bb_per_9))
  }

  const hand = p.throws === 'L' ? 'LHP' : p.throws === 'R' ? 'RHP' : ''
  return {
    spec: {
      id: `auto-${p.id}`, template: 'contrast', kicker,
      title: hand ? `${p.name}, ${hand}` : p.name,
      subtitle: `${p.teamAbbr} against ${p.oppAbbr}. Season to date.`,
      chips: [{ text: p.teamAbbr, team: p.teamAbbr }],
      columns: ['Usage', 'Whiff', 'xwOBA'],
      panels: { contrast: 'Splits', pitch: 'Arsenal' },
      player: { id: p.id, team: p.teamAbbr },
      stats: [...contrast, ...rows, ...tiles],
    },
    missing,
  }
}

export type TeamBlock = { abbr: string; chase: number | null; kPct: number | null; bullpenEra: number | null }

/** Starters' ERA head to head, then each club's chase rate, strikeout rate and bullpen ERA (the Scout Report's team block). */
export function buildCollisionSpec(away: PitcherInput, home: PitcherInput, teams: [TeamBlock | null, TeamBlock | null], kicker: string): AutofillResult {
  const missing: string[] = []
  const hero = (p: PitcherInput): Stat | null => {
    const era = num(p.stats?.era)
    if (era == null) { missing.push(`${p.name} ERA`); return null }
    const fip = num(p.stats?.fip)
    return { group: 'hero', team: p.teamAbbr, playerId: p.id, label: `${lastName(p.name)} ERA`, value: dec2(era), ...(fip != null ? { sub: `FIP ${dec2(fip)}` } : {}) }
  }
  const tiles: Stat[] = []
  const add = (t: TeamBlock | null, abbr: string, what: 'chase' | 'kPct' | 'bullpenEra') => {
    const v = t ? (what === 'bullpenEra' ? num(t.bullpenEra) : asPct(t[what])) : null
    const label = what === 'chase' ? 'chase rate' : what === 'kPct' ? 'strikeout rate' : 'bullpen ERA'
    if (v == null) { missing.push(`${abbr} ${label}`); return }
    tiles.push({ group: 'tile', team: abbr, label: `${abbr} ${label}`, value: what === 'bullpenEra' ? dec2(v) : pct1(v) })
  }
  for (const what of ['chase', 'kPct', 'bullpenEra'] as const) { add(teams[0], away.teamAbbr, what); add(teams[1], home.teamAbbr, what) }
  const stats = [hero(away), hero(home)].filter((x): x is Stat => !!x).concat(tiles)
  return {
    spec: {
      id: `auto-${away.teamAbbr}-${home.teamAbbr}`, template: 'collision', kicker,
      title: 'Starters head to head',
      subtitle: `${away.name} and ${home.name}. Season to date.`,
      chips: [{ text: away.teamAbbr, team: away.teamAbbr }, { text: home.teamAbbr, team: home.teamAbbr }],
      stats,
    },
    missing,
  }
}

// ─── Attack map ──────────────────────────────────────────────────────────────

/** One batter_pitch_type_splits row (the Scout Report's Zone Clash source). */
export type BatterSplit = { pitch_type: string; pitch_name: string | null; pa: number | null; whiff_percent: number | null; est_woba: number | null }
export type Fielder = { position: string; playerName: string; totalRuns: number | null }
export type AttackTeam = {
  abbr: string
  confirmed: boolean
  hitters: { id: number; name: string }[]               // batting order
  splits: Record<number, BatterSplit[]>                 // by batter id
  oppName: string
  oppArsenal: ArsenalPitch[]                            // the opposing starter's pitch_arsenals rows, most-used first
  fielders: Fielder[]                                   // this team's lineup with season fielding runs
}

const MIN_PA = 15
const INFIELD = ['1B', '2B', '3B', 'SS'], OUTFIELD = ['LF', 'CF', 'RF']
const signed = (n: number) => (n > 0 ? `+${Math.round(n)}` : n < 0 ? `\u2212${Math.abs(Math.round(n))}` : '0')

/** Fielding-runs tile for a group of positions; needs most of the group to have data, never fills the rest in. */
function fieldingTile(t: AttackTeam, label: string, positions: string[]): Stat | null {
  const f = t.fielders.filter(x => positions.includes(x.position) && x.totalRuns != null)
  if (f.length < positions.length - 1) return null
  const total = f.reduce((n, x) => n + (x.totalRuns as number), 0)
  const detail = [...f].sort((a, b) => Math.abs(b.totalRuns as number) - Math.abs(a.totalRuns as number)).slice(0, 3).map(x => `${surname(x.playerName)} ${signed(x.totalRuns as number)}`).join(', ')
  return { group: 'oaa', team: t.abbr, label: `${t.abbr} ${label}`, value: signed(total), sub: detail }
}

/** One row per hitter: his xwOBA and whiff against the opposing starter's most-used pitch he has seen enough of. */
export function buildAttackSpec(away: AttackTeam, home: AttackTeam, kicker: string): AutofillResult {
  const missing: string[] = []
  const stats: Stat[] = []
  const rowsFor = (t: AttackTeam) => {
    const codes = t.oppArsenal.filter(x => (num(x.percentage) ?? 0) >= 10).map(x => x.pitch_type)
    if (!codes.length) missing.push(`${t.oppName || 'opposing starter'} arsenal`)
    let skipped = 0
    for (const h of t.hitters.slice(0, 9)) {
      const rows = t.splits[h.id] ?? []
      const row = codes.map(c => rows.find(r => r.pitch_type === c && (num(r.pa) ?? 0) >= MIN_PA)).find(Boolean)
      if (!row) { skipped++; continue }
      const xw = num(row.est_woba), wh = num(row.whiff_percent)
      stats.push({ group: t.abbr, label: surname(h.name), cells: [pitchName(row.pitch_name ?? row.pitch_type), xw != null ? rate3(xw) : '', wh != null ? pct1(wh) : ''] })
    }
    if (skipped) missing.push(`${skipped} ${t.abbr} hitter${skipped > 1 ? 's' : ''} with under ${MIN_PA} PA against his main pitches`)
    if (!t.hitters.length) missing.push(`${t.abbr} lineup`)
  }
  rowsFor(away); rowsFor(home)

  const tiles: Stat[] = []
  for (const t of [away, home]) {
    for (const [label, pos] of [['infield fielding runs', INFIELD], ['outfield fielding runs', OUTFIELD]] as const) {
      const tile = fieldingTile(t, label, [...pos])
      if (tile) tiles.push(tile); else missing.push(`${t.abbr} ${label}`)
    }
  }
  const allConfirmed = away.confirmed && home.confirmed
  return {
    spec: {
      id: `auto-attack-${away.abbr}-${home.abbr}`, template: 'attack', kicker, title: 'Attack map',
      subtitle: `Season line against each starter's most-used pitch. ${allConfirmed ? 'Confirmed lineups.' : 'At least one lineup is not confirmed yet.'}`,
      chips: [{ text: away.abbr, team: away.abbr }, { text: home.abbr, team: home.abbr }, ...(allConfirmed ? [] : [{ text: 'UNCONFIRMED', team: 'neutral' }])],
      columns: ['Pitch', 'xwOBA', 'Whiff'],
      // each team's hitters face the starter named on THEIR side's oppName
      panels: { [away.abbr]: `${away.abbr} hitters vs ${surname(away.oppName) || 'starter'}`, [home.abbr]: `${home.abbr} hitters vs ${surname(home.oppName) || 'starter'}` },
      stats: [...stats, ...tiles],
    },
    missing,
  }
}

// ─── Catchers, running game, strike zone ─────────────────────────────────────

export type Sb = { sb: number; cs: number }
export type ScoreTeam = { abbr: string; catcher: { id: number; name: string; sb: Sb } | null; runners: { name: string; sb: Sb }[]; starter: { name: string; allowed: Sb } | null }

/** Catchers (caught stealing), the running game and ABS challenges. All counts are season totals from the MLB Stats API / stored ABS table. */
export function buildScoreboardSpec(away: ScoreTeam, home: ScoreTeam, abs: AbsInput[], kicker: string): AutofillResult {
  const missing: string[] = []
  const stats: Stat[] = []
  for (const t of [away, home]) {
    const c = t.catcher
    const att = c ? c.sb.sb + c.sb.cs : 0
    if (c && att > 0) stats.push({ group: 'catcher', team: t.abbr, playerId: c.id, label: surname(c.name), value: `${Math.round((c.sb.cs / att) * 100)}%`, sub: `${c.sb.cs} of ${att} runners caught` })
    else missing.push(`${t.abbr} catcher`)
  }
  // Running game: the five best base stealers across both lineups, then what each starter allows.
  const runners = [away, home].flatMap(t => t.runners.map(r => ({ ...r, abbr: t.abbr }))).filter(r => r.sb.sb + r.sb.cs >= 8).sort((a, b) => b.sb.sb - a.sb.sb).slice(0, 5)
  for (const r of runners) stats.push({ group: 'run', team: r.abbr, label: surname(r.name), value: `${r.sb.sb} for ${r.sb.sb + r.sb.cs}` })
  for (const t of [away, home]) {
    if (t.starter) stats.push({ group: 'run', team: t.abbr, label: `${surname(t.starter.name)} allowed`, value: `${t.starter.allowed.sb} SB, ${t.starter.allowed.cs} CS` })
    else missing.push(`${t.abbr} starter`)
  }
  if (!runners.length) missing.push('base stealers (nobody with 8 or more attempts)')
  for (const a of abs) {
    if (a.total > 0) stats.push({ group: 'abs', team: a.teamAbbr, label: a.teamAbbr, value: `${a.overturns} of ${a.total}`, n: (a.overturns / a.total) * 100, sub: `${Math.round((a.overturns / a.total) * 100)}%` })
    else missing.push(`${a.teamAbbr} ABS challenges`)
  }
  return {
    spec: {
      id: `auto-run-${away.abbr}-${home.abbr}`, template: 'scoreboard', kicker, title: 'Catchers, running game, strike zone',
      subtitle: 'Who can steal, who can stop it, and who wins the challenges.',
      chips: [{ text: away.abbr, team: away.abbr }, { text: home.abbr, team: home.abbr }],
      notes: { abs: 'Team totals, season.' },
      stats,
    },
    missing: [...missing, 'pop time (not stored)'],
  }
}
