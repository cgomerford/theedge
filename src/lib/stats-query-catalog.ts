// src/lib/stats-query-catalog.ts
//
// Pure, dependency-free catalog for the /stats "Ask the Stats" query lab:
// game types, situation filters, metrics, and the plain-English parser.
// Shared by the server (stats-query.ts) and the client (StatsQueryLab.tsx),
// so it must not import anything server-only.
//
// Every situation code below was curl-verified (2025) against
//   GET statsapi.mlb.com/api/v1/teams/stats?stats=statSplits&sitCodes=<code>
// for BOTH hitting and pitching — codes that returned no team rows (pitch
// type, days-of-rest, h1/h2, vs-division, ...) were deliberately left out
// rather than offered and then shown empty.
//
// MLB's API applies ONE situation code at a time. Two filters together
// ("7th inning+ AND runners in scoring position") would need pitch-level
// data, which this lab does not fabricate — the UI says so.

import { MLB_TEAMS } from '@/lib/teams'

export type Group = 'hitting' | 'pitching' | 'fielding'

export const GROUPS: { key: Group; label: string }[] = [
  { key: 'hitting', label: 'Batting' },
  { key: 'pitching', label: 'Pitching' },
  { key: 'fielding', label: 'Fielding' },
]
export const GROUP_LABEL: Record<Group, string> = { hitting: 'Batting', pitching: 'Pitching', fielding: 'Fielding' }
export const defaultMetric = (g: Group): string => (g === 'hitting' ? 'avg' : g === 'pitching' ? 'era' : 'fpct')

export const GAME_TYPES: { key: string; label: string }[] = [
  { key: 'R', label: 'Regular season' },
  { key: 'P', label: 'All postseason' },
  { key: 'F', label: 'Wild Card' },
  { key: 'D', label: 'Division Series' },
  { key: 'L', label: 'League Championship' },
  { key: 'W', label: 'World Series' },
]

export const FIRST_SEASON = 2000

// ── Situation filters ───────────────────────────────────────────────────

export type SplitDef = { code: string; label: string; only?: Group }
export type SplitFamily = { key: string; label: string; blurb: string; splits: SplitDef[] }

const ord = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`)

export const SPLIT_FAMILIES: SplitFamily[] = [
  {
    key: 'inning', label: 'Inning', blurb: 'Which inning the plate appearance happened in',
    splits: [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ code: `i0${n}`, label: `${ord(n)} inning` })),
      { code: 'ix', label: 'Extra innings' },
      { code: 'ig01', label: 'Innings 1–6' },
      { code: 'ig07', label: '7th inning or later' },
      { code: 'ig08', label: '8th inning or later' },
      { code: 'ig09', label: '9th inning or later' },
      { code: 'fip', label: 'First inning pitched', only: 'pitching' },
      { code: 'lo', label: 'Leading off an inning' },
    ],
  },
  {
    key: 'count', label: 'Count', blurb: 'Balls and strikes when the plate appearance ended',
    splits: [
      { code: 'fp', label: 'First pitch' },
      { code: 'ac', label: 'Ahead in count' },
      { code: 'ec', label: 'Even count' },
      { code: 'bc', label: 'Behind in count' },
      { code: '2s', label: 'Two strikes' },
      { code: 'fc', label: 'Full count' },
      ...['c00', 'c01', 'c02', 'c10', 'c11', 'c12', 'c20', 'c21', 'c22', 'c30', 'c31', 'c32'].map(c => ({
        code: c, label: `${c[1]}-${c[2]} count`,
      })),
    ],
  },
  {
    key: 'outs', label: 'Outs', blurb: 'Outs in the inning',
    splits: [
      { code: 'o0', label: 'No outs' },
      { code: 'o1', label: 'One out' },
      { code: 'o2', label: 'Two outs' },
    ],
  },
  {
    key: 'runners', label: 'Runners on base', blurb: 'Base state when the plate appearance began',
    splits: [
      { code: 'r0', label: 'Bases empty' },
      { code: 'ron', label: 'Runners on' },
      { code: 'risp', label: 'Runners in scoring position' },
      { code: 'risp2', label: 'RISP, two outs' },
      { code: 'r1', label: 'Runner on 1st' },
      { code: 'r2', label: 'Runner on 2nd' },
      { code: 'r3', label: 'Runner on 3rd' },
      { code: 'r12', label: 'Runners on 1st & 2nd' },
      { code: 'r13', label: 'Runners on 1st & 3rd' },
      { code: 'r23', label: 'Runners on 2nd & 3rd' },
      { code: 'r123', label: 'Bases loaded' },
    ],
  },
  {
    key: 'state', label: 'Game state', blurb: 'Score situation and game context',
    splits: [
      { code: 'sah', label: 'Team ahead' },
      { code: 'sti', label: 'Score tied' },
      { code: 'sbh', label: 'Team behind' },
      { code: 'lc', label: 'Late & close' },
      { code: 'twn', label: 'In games the team won' },
      { code: 'tls', label: 'In games the team lost' },
      { code: 'taw', label: 'Day after a win' },
      { code: 'tal', label: 'Day after a loss' },
    ],
  },
  {
    key: 'venue', label: 'Home / away & day / night', blurb: 'Where and when',
    splits: [
      { code: 'h', label: 'Home games' },
      { code: 'a', label: 'Away games' },
      { code: 'd', label: 'Day games' },
      { code: 'n', label: 'Night games' },
      { code: 'g', label: 'On grass' },
      { code: 't', label: 'On turf' },
    ],
  },
  {
    key: 'hand', label: 'Handedness & league', blurb: 'Platoon matchups and league',
    splits: [
      { code: 'vl', label: 'Against left-handed opponents' },
      { code: 'vr', label: 'Against right-handed opponents' },
      { code: 'l', label: 'Batting left-handed', only: 'hitting' },
      { code: 'r', label: 'Batting right-handed', only: 'hitting' },
      { code: 'val', label: 'Against the AL' },
      { code: 'vnl', label: 'Against the NL' },
    ],
  },
  {
    key: 'month', label: 'Month & period', blurb: 'Calendar slices',
    splits: [
      { code: '3', label: 'March' }, { code: '4', label: 'April' }, { code: '5', label: 'May' },
      { code: '6', label: 'June' }, { code: '7', label: 'July' }, { code: '8', label: 'August' },
      { code: '9', label: 'September' },
      { code: 'preas', label: 'Before the All-Star break' },
      { code: 'posas', label: 'After the All-Star break' },
    ],
  },
  {
    key: 'weekday', label: 'Day of week', blurb: 'Weekday slices',
    splits: [
      { code: 'dmo', label: 'Monday' }, { code: 'dtu', label: 'Tuesday' }, { code: 'dwe', label: 'Wednesday' },
      { code: 'dth', label: 'Thursday' }, { code: 'dfr', label: 'Friday' }, { code: 'dsa', label: 'Saturday' },
      { code: 'dsu', label: 'Sunday' },
    ],
  },
  {
    key: 'order', label: 'Batting order & role', blurb: 'Lineup slot, starter vs reliever, pinch roles',
    splits: [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ code: `b${n}`, label: `Batting ${ord(n)}`, only: 'hitting' as Group })),
      { code: 'sp', label: 'Starting pitchers' },
      { code: 'rp', label: 'Relief pitchers' },
      { code: 'pH', label: 'Pinch hitters' },
      { code: 'pR', label: 'Pinch runners' },
    ],
  },
  {
    key: 'position', label: 'Defensive position', blurb: 'Position played by the hitter',
    splits: [
      { code: 'p2', label: 'Catcher' }, { code: 'p3', label: 'First base' }, { code: 'p4', label: 'Second base' },
      { code: 'p5', label: 'Third base' }, { code: 'p6', label: 'Shortstop' }, { code: 'p7', label: 'Left field' },
      { code: 'p8', label: 'Center field' }, { code: 'p9', label: 'Right field' }, { code: 'pO', label: 'Outfield' },
      { code: 'pD', label: 'Designated hitter' },
    ].map(s => ({ ...s, only: 'hitting' as Group })),
  },
  {
    key: 'pitchcount', label: 'Pitch count', blurb: "Pitcher's pitch count at the time",
    splits: [
      { code: 'pi000', label: 'First 75 pitches' },
      { code: 'pi760', label: 'Pitches 76+' },
      { code: 'pi100', label: 'First 100 pitches' },
      { code: 'pi001', label: 'Pitches 1–15' },
      { code: 'pi016', label: 'Pitches 16–30' },
      { code: 'pi031', label: 'Pitches 31–45' },
      { code: 'pi046', label: 'Pitches 46–60' },
      { code: 'pi061', label: 'Pitches 61–75' },
      { code: 'pi076', label: 'Pitches 76–90' },
      { code: 'pi091', label: 'Pitches 91–105' },
      { code: 'pi106', label: 'Pitches 106–120' },
    ],
  },
  {
    key: 'zone', label: 'Pitch zone', blurb: "MLB's zone numbering (1–9 in the strike zone, 11–14 outside)",
    splits: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14].map(n => ({
      code: `zn${String(n).padStart(2, '0')}`, label: `Zone ${n}`,
    })),
  },
]

// FIELDING has NO situation splits. The API returns a row per team for codes like i07 / risp, but
// each row's `stat` object is missing entirely (curl-verified 2025, team and player level), so
// offering them would show empty data. Fielding is season totals + the position breakdown only.
const FIELDING_CODES = new Set<string>()

/** Fielding-only "family": position played. Not a situation code — positions are built from player-level rows. */
export const FIELD_POSITIONS: SplitDef[] = [
  { code: 'P', label: 'Pitcher' }, { code: 'C', label: 'Catcher' }, { code: '1B', label: 'First base' },
  { code: '2B', label: 'Second base' }, { code: '3B', label: 'Third base' }, { code: 'SS', label: 'Shortstop' },
  { code: 'LF', label: 'Left field' }, { code: 'CF', label: 'Center field' }, { code: 'RF', label: 'Right field' },
]
export const FIELDPOS_FAMILY: SplitFamily = {
  key: 'fieldpos', label: 'Position', blurb: 'Fielding position played', splits: FIELD_POSITIONS,
}

const SPLIT_INDEX = new Map<string, SplitDef & { family: string }>()
for (const f of SPLIT_FAMILIES) for (const s of f.splits) SPLIT_INDEX.set(s.code, { ...s, family: f.key })

export function splitLabel(code: string): string {
  return SPLIT_INDEX.get(code)?.label ?? code
}
export function isValidSplit(code: string, group: Group): boolean {
  const s = SPLIT_INDEX.get(code)
  if (!s) return false
  if (group === 'fielding') return FIELDING_CODES.has(code)
  return !s.only || s.only === group
}
export function familyFor(key: string): SplitFamily | undefined {
  return key === 'fieldpos' ? FIELDPOS_FAMILY : SPLIT_FAMILIES.find(f => f.key === key) ?? DEEP_ONLY_FAMILIES.find(f => f.key === key)
}
export function familySplits(family: SplitFamily, group: Group): SplitDef[] {
  return family.splits.filter(s => isValidSplit(s.code, group))
}
/** Families that have at least one split for this group (drops e.g. 'position' for pitching). */
export function familiesFor(group: Group): SplitFamily[] {
  const fams = SPLIT_FAMILIES.filter(f => familySplits(f, group).length > 0)
  return group === 'fielding' ? [FIELDPOS_FAMILY, ...fams] : fams
}

// ── Metrics ─────────────────────────────────────────────────────────────

/** Raw summed counting stats. Keys are MLB Stats API field names (curl-verified). */
export type Totals = Record<string, number>

export type MetricDef = {
  key: string
  label: string
  full: string
  group: Group
  kind: 'count' | 'rate'
  /** which sample the metric is a share of — used for the "small sample" warning */
  fmt: (v: number) => string
  compute: (t: Totals, lg?: Totals) => number | null
  /** display direction for rank bars: does a larger number lead the table */
  sortDesc: boolean
}

const n = (t: Totals, k: string) => t[k] ?? 0
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null)

/** Team-games behind a row. League rows are rewritten server-side to count each game once (see stats-query.ts), so the
 *  raw team-game total travels separately as `teamGames` for the per-game rates. Negative = not countable exactly. */
const tg = (t: Totals) => t.teamGames ?? n(t, 'gamesPlayed')
const gamesOf = (t: Totals, key: string): number | null => { const v = t[key]; return v == null || v < 0 ? null : v }

const f3 = (v: number) => v.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.')
const f2 = (v: number) => v.toFixed(2)
const f1 = (v: number) => v.toFixed(1)
const f0 = (v: number) => Math.round(v).toLocaleString('en-US')
const fp = (v: number) => `${(v * 100).toFixed(1)}%`
const fIp = (outs: number) => `${Math.floor(outs / 3).toLocaleString('en-US')}.${Math.round(outs) % 3}`

const H = (key: string, label: string, full: string, kind: 'count' | 'rate', fmt: (v: number) => string, compute: MetricDef['compute'], sortDesc = true): MetricDef =>
  ({ key, label, full, group: 'hitting', kind, fmt, compute, sortDesc })
const P = (key: string, label: string, full: string, kind: 'count' | 'rate', fmt: (v: number) => string, compute: MetricDef['compute'], sortDesc = true): MetricDef =>
  ({ key, label, full, group: 'pitching', kind, fmt, compute, sortDesc })

const obpOf = (t: Totals) => div(n(t, 'hits') + n(t, 'baseOnBalls') + n(t, 'hitByPitch'), n(t, 'atBats') + n(t, 'baseOnBalls') + n(t, 'hitByPitch') + n(t, 'sacFlies'))
const slgOf = (t: Totals) => div(n(t, 'totalBases'), n(t, 'atBats'))
const babipOf = (t: Totals) => div(n(t, 'hits') - n(t, 'homeRuns'), n(t, 'atBats') - n(t, 'strikeOuts') - n(t, 'homeRuns') + n(t, 'sacFlies'))
const ip = (t: Totals) => n(t, 'outs') / 3

/** FIP constant so that the league's own FIP equals its ERA for the same selection (standard definition). */
function fipConst(lg: Totals | undefined): number | null {
  if (!lg || n(lg, 'outs') <= 0) return null
  const lgIp = ip(lg)
  const eraLg = (9 * n(lg, 'earnedRuns')) / lgIp
  const raw = (13 * n(lg, 'homeRuns') + 3 * (n(lg, 'baseOnBalls') + n(lg, 'hitByPitch')) - 2 * n(lg, 'strikeOuts')) / lgIp
  return eraLg - raw
}

const F = (key: string, label: string, full: string, kind: 'count' | 'rate', fmt: (v: number) => string, compute: MetricDef['compute'], sortDesc = true): MetricDef =>
  ({ key, label, full, group: 'fielding', kind, fmt, compute, sortDesc })
const chOf = (t: Totals) => n(t, 'putOuts') + n(t, 'assists') + n(t, 'errors')
const fpOf = (t: Totals) => div(n(t, 'putOuts') + n(t, 'assists'), chOf(t))

export const METRICS: MetricDef[] = [
  // ── Hitting: counting ──
  H('h_g', 'G', 'Games', 'count', f0, t => gamesOf(t, 'gamesPlayed')),
  H('pa', 'PA', 'Plate appearances', 'count', f0, t => n(t, 'plateAppearances')),
  H('ab', 'AB', 'At-bats', 'count', f0, t => n(t, 'atBats')),
  H('r', 'R', 'Runs', 'count', f0, t => n(t, 'runs')),
  H('h', 'H', 'Hits', 'count', f0, t => n(t, 'hits')),
  H('2b', '2B', 'Doubles', 'count', f0, t => n(t, 'doubles')),
  H('3b', '3B', 'Triples', 'count', f0, t => n(t, 'triples')),
  H('hr', 'HR', 'Home runs', 'count', f0, t => n(t, 'homeRuns')),
  H('rbi', 'RBI', 'Runs batted in', 'count', f0, t => n(t, 'rbi')),
  H('bb', 'BB', 'Walks', 'count', f0, t => n(t, 'baseOnBalls')),
  H('ibb', 'IBB', 'Intentional walks', 'count', f0, t => n(t, 'intentionalWalks')),
  H('so', 'SO', 'Strikeouts', 'count', f0, t => n(t, 'strikeOuts')),
  H('hbp', 'HBP', 'Hit by pitch', 'count', f0, t => n(t, 'hitByPitch')),
  H('sb', 'SB', 'Stolen bases', 'count', f0, t => n(t, 'stolenBases')),
  H('cs', 'CS', 'Caught stealing', 'count', f0, t => n(t, 'caughtStealing')),
  H('sf', 'SF', 'Sacrifice flies', 'count', f0, t => n(t, 'sacFlies')),
  H('sh', 'SH', 'Sacrifice bunts', 'count', f0, t => n(t, 'sacBunts')),
  H('tb', 'TB', 'Total bases', 'count', f0, t => n(t, 'totalBases')),
  H('xbh', 'XBH', 'Extra-base hits', 'count', f0, t => n(t, 'doubles') + n(t, 'triples') + n(t, 'homeRuns')),
  H('gidp', 'GIDP', 'Grounded into double plays', 'count', f0, t => n(t, 'groundIntoDoublePlay')),
  H('lob', 'LOB', 'Runners left on base', 'count', f0, t => n(t, 'leftOnBase')),
  H('pitches_seen', 'Pitches', 'Pitches seen', 'count', f0, t => n(t, 'numberOfPitches')),
  // ── Hitting: rates ──
  H('avg', 'AVG', 'Batting average', 'rate', f3, t => div(n(t, 'hits'), n(t, 'atBats'))),
  H('obp', 'OBP', 'On-base percentage', 'rate', f3, obpOf),
  H('slg', 'SLG', 'Slugging percentage', 'rate', f3, slgOf),
  H('ops', 'OPS', 'On-base plus slugging', 'rate', f3, t => { const o = obpOf(t), s = slgOf(t); return o != null && s != null ? o + s : null }),
  H('iso', 'ISO', 'Isolated power (SLG − AVG)', 'rate', f3, t => { const s = slgOf(t), a = div(n(t, 'hits'), n(t, 'atBats')); return s != null && a != null ? s - a : null }),
  H('babip', 'BABIP', 'Batting average on balls in play', 'rate', f3, babipOf),
  H('k_pct', 'K%', 'Strikeout rate (per PA)', 'rate', fp, t => div(n(t, 'strikeOuts'), n(t, 'plateAppearances')), false),
  H('bb_pct', 'BB%', 'Walk rate (per PA)', 'rate', fp, t => div(n(t, 'baseOnBalls'), n(t, 'plateAppearances'))),
  H('kbb_pct', 'BB−K%', 'Walk rate minus strikeout rate', 'rate', fp, t => { const p = n(t, 'plateAppearances'); return p > 0 ? (n(t, 'baseOnBalls') - n(t, 'strikeOuts')) / p : null }),
  H('hr_pct', 'HR%', 'Home runs per PA', 'rate', fp, t => div(n(t, 'homeRuns'), n(t, 'plateAppearances'))),
  H('xbh_pct', 'XBH%', 'Extra-base hits per PA', 'rate', fp, t => div(n(t, 'doubles') + n(t, 'triples') + n(t, 'homeRuns'), n(t, 'plateAppearances'))),
  H('contact_pct', 'Contact%', 'At-bats without a strikeout', 'rate', fp, t => div(n(t, 'atBats') - n(t, 'strikeOuts'), n(t, 'atBats'))),
  H('sb_pct', 'SB%', 'Stolen-base success rate', 'rate', fp, t => div(n(t, 'stolenBases'), n(t, 'stolenBases') + n(t, 'caughtStealing'))),
  H('sb_per_g', 'SB/G', 'Stolen bases per team-game', 'rate', f2, t => div(n(t, 'stolenBases'), tg(t))),
  H('r_per_g', 'R/G', 'Runs per team-game', 'rate', f2, t => div(n(t, 'runs'), tg(t))),
  H('hr_per_g', 'HR/G', 'Home runs per team-game', 'rate', f2, t => div(n(t, 'homeRuns'), tg(t))),
  H('pitches_per_pa', 'P/PA', 'Pitches seen per plate appearance', 'rate', f2, t => div(n(t, 'numberOfPitches'), n(t, 'plateAppearances'))),
  H('go_ao', 'GO/AO', 'Ground-outs per air-out', 'rate', f2, t => div(n(t, 'groundOuts'), n(t, 'airOuts'))),
  H('ab_per_hr', 'AB/HR', 'At-bats per home run', 'rate', f1, t => div(n(t, 'atBats'), n(t, 'homeRuns')), false),
  H('gidp_pct', 'GIDP%', 'Double-play rate (per PA)', 'rate', fp, t => div(n(t, 'groundIntoDoublePlay'), n(t, 'plateAppearances')), false),

  // ── Plate-appearance engine extras (need the deep engine's wOBA / Statcast fields) ──
  H('woba', 'wOBA', 'Weighted on-base average', 'rate', f3, t => div(n(t, 'wobaNum'), n(t, 'wobaDen'))),
  H('xwoba', 'xwOBA', 'Expected wOBA (Statcast quality of contact)', 'rate', f3, t => div(n(t, 'xwobaNum'), n(t, 'wobaDen'))),
  H('ev', 'EV', 'Average exit velocity (tracked batted balls)', 'rate', v => `${v.toFixed(1)} mph`, t => div(n(t, 'evSum'), n(t, 'bbe'))),
  H('hh_pct', 'HH%', 'Hard-hit rate (95+ mph, per batted ball)', 'rate', fp, t => div(n(t, 'hardHit'), n(t, 'bbe'))),
  H('barrel_pct', 'Brl%', 'Barrel rate (per batted ball)', 'rate', fp, t => div(n(t, 'barrels'), n(t, 'bbe'))),
  H('bbe', 'BBE', 'Tracked batted balls', 'count', f0, t => n(t, 'bbe')),
  P('p_bbe', 'BBE', 'Tracked batted balls allowed', 'count', f0, t => n(t, 'bbe')),
  P('p_woba', 'wOBA', 'wOBA allowed', 'rate', f3, t => div(n(t, 'wobaNum'), n(t, 'wobaDen')), false),
  P('p_xwoba', 'xwOBA', 'Expected wOBA allowed', 'rate', f3, t => div(n(t, 'xwobaNum'), n(t, 'wobaDen')), false),
  P('p_ev', 'EV', 'Average exit velocity allowed', 'rate', v => `${v.toFixed(1)} mph`, t => div(n(t, 'evSum'), n(t, 'bbe')), false),
  P('p_hh_pct', 'HH%', 'Hard-hit rate allowed', 'rate', fp, t => div(n(t, 'hardHit'), n(t, 'bbe')), false),
  P('p_barrel_pct', 'Brl%', 'Barrel rate allowed', 'rate', fp, t => div(n(t, 'barrels'), n(t, 'bbe')), false),

  // ── Fielding ──
  F('f_g', 'G', 'Games', 'count', f0, t => gamesOf(t, 'games')),
  F('f_gs', 'GS', 'Games started', 'count', f0, t => n(t, 'gamesStarted')),
  F('f_inn', 'Inn', 'Innings in the field', 'count', v => fIp(v * 3), t => n(t, 'inningsOuts') / 3),
  F('ch', 'Ch', 'Total chances', 'count', f0, chOf),
  F('po', 'PO', 'Putouts', 'count', f0, t => n(t, 'putOuts')),
  F('ast', 'A', 'Assists', 'count', f0, t => n(t, 'assists')),
  F('e', 'E', 'Errors', 'count', f0, t => n(t, 'errors')),
  F('dp', 'DP', 'Double plays turned', 'count', f0, t => n(t, 'doublePlays')),
  F('fpct', 'Fld%', 'Fielding percentage', 'rate', f3, fpOf),
  F('e_pct', 'E%', 'Errors per chance', 'rate', fp, t => div(n(t, 'errors'), chOf(t)), false),
  F('rf9', 'RF/9', 'Range factor per 9 innings', 'rate', f2, t => div(27 * (n(t, 'putOuts') + n(t, 'assists')), n(t, 'inningsOuts'))),
  F('ch9', 'Ch/9', 'Chances per 9 innings', 'rate', f2, t => div(27 * chOf(t), n(t, 'inningsOuts'))),
  F('e9', 'E/9', 'Errors per 9 innings', 'rate', f2, t => div(27 * n(t, 'errors'), n(t, 'inningsOuts')), false),
  F('te', 'TE', 'Throwing errors', 'count', f0, t => n(t, 'throwingErrors')),
  F('pb', 'PB', 'Passed balls', 'count', f0, t => n(t, 'passedBall')),
  F('f_wp', 'WP', 'Wild pitches', 'count', f0, t => n(t, 'wildPitches')),
  F('f_sb', 'SB', 'Stolen bases allowed', 'count', f0, t => n(t, 'stolenBases')),
  F('f_cs', 'CS', 'Runners caught stealing', 'count', f0, t => n(t, 'caughtStealing')),
  F('f_cs_pct', 'CS%', 'Caught-stealing rate', 'rate', fp, t => div(n(t, 'caughtStealing'), n(t, 'stolenBases') + n(t, 'caughtStealing'))),
  F('pk', 'PK', 'Pickoffs', 'count', f0, t => n(t, 'pickoffs')),

  // ── Pitching: counting ──
  P('g', 'G', 'Games', 'count', f0, t => gamesOf(t, 'gamesPlayed')),
  P('gs', 'GS', 'Games started', 'count', f0, t => n(t, 'gamesStarted')),
  P('w', 'W', 'Wins', 'count', f0, t => n(t, 'wins')),
  P('l', 'L', 'Losses', 'count', f0, t => n(t, 'losses')),
  P('sv', 'SV', 'Saves', 'count', f0, t => n(t, 'saves')),
  P('hld', 'HLD', 'Holds', 'count', f0, t => n(t, 'holds')),
  P('bs', 'BS', 'Blown saves', 'count', f0, t => n(t, 'blownSaves')),
  P('ip', 'IP', 'Innings pitched', 'count', v => fIp(v * 3), t => ip(t)),
  P('bf', 'BF', 'Batters faced', 'count', f0, t => n(t, 'battersFaced')),
  P('p_h', 'H', 'Hits allowed', 'count', f0, t => n(t, 'hits')),
  P('p_r', 'R', 'Runs allowed', 'count', f0, t => n(t, 'runs')),
  P('p_er', 'ER', 'Earned runs', 'count', f0, t => n(t, 'earnedRuns')),
  P('p_hr', 'HR', 'Home runs allowed', 'count', f0, t => n(t, 'homeRuns')),
  P('p_bb', 'BB', 'Walks', 'count', f0, t => n(t, 'baseOnBalls')),
  P('p_so', 'SO', 'Strikeouts', 'count', f0, t => n(t, 'strikeOuts')),
  P('p_hbp', 'HBP', 'Hit batters', 'count', f0, t => n(t, 'hitBatsmen')),
  P('p_wp', 'WP', 'Wild pitches', 'count', f0, t => n(t, 'wildPitches')),
  P('p_bk', 'BK', 'Balks', 'count', f0, t => n(t, 'balks')),
  P('p_sb', 'SB', 'Stolen bases allowed', 'count', f0, t => n(t, 'stolenBases')),
  P('p_cs', 'CS', 'Runners caught stealing', 'count', f0, t => n(t, 'caughtStealing')),
  P('p_pitches', 'Pitches', 'Pitches thrown', 'count', f0, t => n(t, 'numberOfPitches')),
  P('cg', 'CG', 'Complete games', 'count', f0, t => n(t, 'completeGames')),
  P('sho', 'SHO', 'Shutouts', 'count', f0, t => n(t, 'shutouts')),
  // ── Pitching: rates ──
  P('era', 'ERA', 'Earned run average', 'rate', f2, t => div(27 * n(t, 'earnedRuns'), n(t, 'outs')), false),
  P('whip', 'WHIP', 'Walks + hits per inning', 'rate', f2, t => div(3 * (n(t, 'baseOnBalls') + n(t, 'hits')), n(t, 'outs')), false),
  P('fip', 'FIP', 'Fielding-independent pitching (constant set from this selection’s league ERA)', 'rate', f2, (t, lg) => {
    const c = fipConst(lg); const i = ip(t)
    return c != null && i > 0 ? (13 * n(t, 'homeRuns') + 3 * (n(t, 'baseOnBalls') + n(t, 'hitByPitch')) - 2 * n(t, 'strikeOuts')) / i + c : null
  }, false),
  P('r9', 'R/9', 'Runs allowed per 9', 'rate', f2, t => div(27 * n(t, 'runs'), n(t, 'outs')), false),
  P('k9', 'K/9', 'Strikeouts per 9', 'rate', f2, t => div(27 * n(t, 'strikeOuts'), n(t, 'outs'))),
  P('bb9', 'BB/9', 'Walks per 9', 'rate', f2, t => div(27 * n(t, 'baseOnBalls'), n(t, 'outs')), false),
  P('hr9', 'HR/9', 'Home runs per 9', 'rate', f2, t => div(27 * n(t, 'homeRuns'), n(t, 'outs')), false),
  P('h9', 'H/9', 'Hits per 9', 'rate', f2, t => div(27 * n(t, 'hits'), n(t, 'outs')), false),
  P('kbb', 'K/BB', 'Strikeouts per walk', 'rate', f2, t => div(n(t, 'strikeOuts'), n(t, 'baseOnBalls'))),
  P('p_k_pct', 'K%', 'Strikeout rate (per batter faced)', 'rate', fp, t => div(n(t, 'strikeOuts'), n(t, 'battersFaced'))),
  P('p_bb_pct', 'BB%', 'Walk rate (per batter faced)', 'rate', fp, t => div(n(t, 'baseOnBalls'), n(t, 'battersFaced')), false),
  P('p_kbb_pct', 'K−BB%', 'Strikeout rate minus walk rate', 'rate', fp, t => { const b = n(t, 'battersFaced'); return b > 0 ? (n(t, 'strikeOuts') - n(t, 'baseOnBalls')) / b : null }),
  P('p_hr_pct', 'HR%', 'Home runs per batter faced', 'rate', fp, t => div(n(t, 'homeRuns'), n(t, 'battersFaced')), false),
  P('opp_avg', 'Opp AVG', 'Opponent batting average', 'rate', f3, t => div(n(t, 'hits'), n(t, 'atBats')), false),
  P('opp_obp', 'Opp OBP', 'Opponent on-base percentage', 'rate', f3, obpOf, false),
  P('opp_slg', 'Opp SLG', 'Opponent slugging', 'rate', f3, slgOf, false),
  P('opp_ops', 'Opp OPS', 'Opponent OPS', 'rate', f3, t => { const o = obpOf(t), s = slgOf(t); return o != null && s != null ? o + s : null }, false),
  P('p_babip', 'BABIP', 'Opponent BABIP', 'rate', f3, babipOf, false),
  P('strike_pct', 'Strike%', 'Strikes per pitch', 'rate', fp, t => div(n(t, 'strikes'), n(t, 'numberOfPitches'))),
  P('p_per_ip', 'P/IP', 'Pitches per inning', 'rate', f1, t => div(3 * n(t, 'numberOfPitches'), n(t, 'outs')), false),
  P('p_per_bf', 'P/BF', 'Pitches per batter faced', 'rate', f2, t => div(n(t, 'numberOfPitches'), n(t, 'battersFaced')), false),
  P('p_go_ao', 'GO/AO', 'Ground-outs per air-out', 'rate', f2, t => div(n(t, 'groundOuts'), n(t, 'airOuts'))),
  P('p_sb_pct', 'SB% against', 'Stolen-base success rate against', 'rate', fp, t => div(n(t, 'stolenBases'), n(t, 'stolenBases') + n(t, 'caughtStealing')), false),
  P('p_ip_per_g', 'IP/G', 'Innings per appearance', 'rate', f2, t => div(ip(t), tg(t))),
]

/** MLB field names that must be summed for every metric above. */
export const SUM_FIELDS: Record<Group, string[]> = {
  hitting: ['gamesPlayed', 'plateAppearances', 'atBats', 'runs', 'hits', 'doubles', 'triples', 'homeRuns', 'rbi', 'baseOnBalls', 'intentionalWalks', 'strikeOuts', 'hitByPitch', 'stolenBases', 'caughtStealing', 'sacFlies', 'sacBunts', 'totalBases', 'groundIntoDoublePlay', 'leftOnBase', 'numberOfPitches', 'groundOuts', 'airOuts'],
  fielding: ['games', 'gamesStarted', 'inningsOuts', 'chances', 'putOuts', 'assists', 'errors', 'doublePlays', 'throwingErrors', 'passedBall', 'wildPitches', 'stolenBases', 'caughtStealing', 'pickoffs'],
  pitching: ['gamesPlayed', 'gamesStarted', 'wins', 'losses', 'saves', 'holds', 'blownSaves', 'outs', 'battersFaced', 'atBats', 'hits', 'runs', 'earnedRuns', 'homeRuns', 'doubles', 'triples', 'baseOnBalls', 'intentionalWalks', 'strikeOuts', 'hitByPitch', 'hitBatsmen', 'wildPitches', 'balks', 'stolenBases', 'caughtStealing', 'numberOfPitches', 'strikes', 'completeGames', 'shutouts', 'sacFlies', 'sacBunts', 'totalBases', 'groundOuts', 'airOuts'],
}
// hitBatsmen is the pitching spelling of HBP in the API; hitting-style HBP also appears as hitByPitch.
// For pitching, OBP/FIP need hitByPitch — the API supplies both; they are summed independently.

export function metricsFor(group: Group): MetricDef[] {
  return METRICS.filter(m => m.group === group)
}
export function metricByKey(key: string): MetricDef | undefined {
  return METRICS.find(m => m.key === key)
}
/** Headline tiles + the matrix columns for each group. */
export const HEADLINE: Record<Group, string[]> = {
  hitting: ['avg', 'obp', 'slg', 'ops', 'hr', 'sb', 'k_pct', 'bb_pct'],
  pitching: ['era', 'whip', 'k9', 'bb9', 'opp_avg', 'opp_ops', 'p_so', 'hr9'],
  fielding: ['fpct', 'ch', 'po', 'ast', 'e', 'dp', 'rf9', 'f_cs_pct'],
}
export const MATRIX_COLS: Record<Group, string[]> = {
  hitting: ['pa', 'avg', 'obp', 'slg', 'ops', 'iso', 'babip', 'hr_pct', 'k_pct', 'bb_pct', 'sb'],
  pitching: ['bf', 'era', 'whip', 'opp_avg', 'opp_ops', 'k9', 'bb9', 'hr9', 'p_k_pct', 'p_bb_pct', 'p_babip'],
  fielding: ['ch', 'po', 'ast', 'e', 'dp', 'fpct', 'rf9', 'ch9', 'e9', 'f_cs_pct'],
}
/** The "sample" metric per group — what a small-sample warning counts. */
export const SAMPLE: Record<Group, { key: string; label: string; min: number }> = {
  hitting: { key: 'pa', label: 'PA', min: 150 },
  pitching: { key: 'bf', label: 'batters faced', min: 150 },
  fielding: { key: 'ch', label: 'chances', min: 300 },
}
/** Raw field that holds each group's sample size. */
export const SAMPLE_FIELD: Record<Group, string> = { hitting: 'plateAppearances', pitching: 'battersFaced', fielding: 'chances' }

// ── Query shape ─────────────────────────────────────────────────────────

export type ViewMode = 'summary' | 'breakdown' | 'trend' | 'compare' | 'teams' | 'players' | 'recent'

export type QueryState = {
  group: Group
  gameType: string
  from: number
  to: number
  split: string        // '' = no situation filter
  family: string       // breakdown family key
  metric: string       // focus metric
  view: ViewMode
  minSample: number    // players view: minimum PA / BF
  years: number[]      // compare view: seasons to line up; years[0] is the base year
  teams: boolean       // include each club's share of every row (Pro) so a number can be expanded into what makes it up
  deep: DeepFilters | null  // plate-appearance engine (stackable filters); null = quick MLB-splits engine
}

export const CURRENT_SEASON = new Date().getFullYear()

export const DEFAULT_QUERY: QueryState = {
  group: 'hitting', gameType: 'P', from: CURRENT_SEASON, to: CURRENT_SEASON,
  split: '', family: 'inning', metric: 'avg', view: 'summary', minSample: 10,
  years: [CURRENT_SEASON, CURRENT_SEASON - 1, CURRENT_SEASON - 2],
  teams: false,
  deep: null,
}

// ── Plain-English search ────────────────────────────────────────────────
// Deterministic keyword matcher (no LLM, no network). It only fills in the
// filter controls — the person always sees what was understood as chips and
// can change any of it.

const GAME_TYPE_WORDS: [RegExp, string][] = [
  [/world series|\bws\b/, 'W'],
  [/league championship|\bl?cs\b|\balcs\b|\bnlcs\b|championship series/, 'L'],
  [/division series|\blds\b|\balds\b|\bnlds\b/, 'D'],
  [/wild[- ]?card/, 'F'],
  [/post[- ]?season|playoff|october baseball/, 'P'],
  [/regular season/, 'R'],
]

const SPLIT_WORDS: [RegExp, string][] = [
  [/(after|past|beyond|from) (the )?(6th|sixth)( inning)?|7th (inning )?(or later|and later|\+)|seventh (inning )?(or later|and later)|late innings?|innings? 7\+/, 'ig07'],
  [/8th (inning )?(or later|and later|\+)|eighth (inning )?(or later|and later)/, 'ig08'],
  [/9th (inning )?(or later|and later|\+)|ninth (inning )?(or later|and later)/, 'ig09'],
  [/early innings?|first (6|six) innings|innings 1.?(to|-|–).?6/, 'ig01'],
  [/extra[- ]innings?|extras/, 'ix'],
  [/(\b1st|first) inning/, 'i01'], [/(\b2nd|second) inning/, 'i02'], [/(\b3rd|third) inning/, 'i03'],
  [/(\b4th|fourth) inning/, 'i04'], [/(\b5th|fifth) inning/, 'i05'], [/(\b6th|sixth) inning/, 'i06'],
  [/(\b7th|seventh) inning/, 'i07'], [/(\b8th|eighth) inning/, 'i08'], [/(\b9th|ninth) inning/, 'i09'],
  [/bases loaded/, 'r123'],
  [/(runners? in scoring position|\brisp\b).*(two outs|2 outs)|(two outs|2 outs).*(runners? in scoring position|\brisp\b)/, 'risp2'],
  [/runners? in scoring position|\brisp\b|scoring position/, 'risp'],
  [/runners? on( base)?|men on/, 'ron'],
  [/bases empty|nobody on|no one on/, 'r0'],
  [/two outs|2 outs/, 'o2'], [/one out\b|1 out\b/, 'o1'], [/no outs|zero outs|0 outs/, 'o0'],
  [/late (and|&) close|close and late/, 'lc'],
  [/full count|3-2 count/, 'fc'],
  [/two strikes|2 strikes/, '2s'],
  [/first pitch/, 'fp'],
  [/ahead in (the )?count/, 'ac'], [/behind in (the )?count/, 'bc'],
  [/leading off|leadoff (an )?inning/, 'lo'],
  [/day games?/, 'd'], [/night games?/, 'n'],
  [/home games?|at home/, 'h'], [/away games?|on the road|road games?/, 'a'],
  [/against lefties|vs\.? lefties|against left-?handed|vs\.? left-?handed|\bvs\.? lhp\b/, 'vl'],
  [/against righties|vs\.? righties|against right-?handed|vs\.? right-?handed|\bvs\.? rhp\b/, 'vr'],
  [/pinch[- ]hit/, 'pH'],
  [/when (leading|ahead)|team ahead/, 'sah'], [/when (trailing|behind)|team behind/, 'sbh'], [/tied game|score tied|when tied/, 'sti'],
  [/starters?\b|starting pitchers?/, 'sp'], [/relievers?|bullpen|relief/, 'rp'],
  [/on turf/, 't'], [/on grass/, 'g'],
  // Any single count ("on 0-2 counts", "in a 3-1 count"). The lookbehind keeps "trailing by 1-2" from reading as a count.
  ...([0, 1, 2, 3] as const).flatMap(b => ([0, 1, 2] as const).map(st => [new RegExp(`(?<!by )(?<!\\d)${b}-${st}(?!\\d)`), `c${b}${st}`] as [RegExp, string])),
]

const METRIC_WORDS: [RegExp, string, Group][] = [
  [/batting average|\bavg\b|\bba\b/, 'avg', 'hitting'],
  [/on[- ]base (percentage|pct)|\bobp\b/, 'obp', 'hitting'],
  [/slugging|\bslg\b/, 'slg', 'hitting'],
  [/\bops\b/, 'ops', 'hitting'],
  [/\biso\b|isolated power/, 'iso', 'hitting'],
  [/home runs?|homers?|\bhrs?\b/, 'hr', 'hitting'],
  [/stolen bases?|steals?|\bsb\b/, 'sb', 'hitting'],
  [/\bbabip\b/, 'babip', 'hitting'],
  [/\brbis?\b|runs batted in/, 'rbi', 'hitting'],
  [/doubles/, '2b', 'hitting'], [/triples/, '3b', 'hitting'],
  [/walk rate|bb%/, 'bb_pct', 'hitting'],
  [/strikeout rate|k%/, 'k_pct', 'hitting'],
  [/fielding (percentage|pct)|\bfld%/, 'fpct', 'fielding'],
  [/range factor/, 'rf9', 'fielding'],
  [/errors?\b/, 'e', 'fielding'],
  [/putouts?/, 'po', 'fielding'],
  [/assists?/, 'ast', 'fielding'],
  [/double plays? turned|turned double plays?/, 'dp', 'fielding'],
  [/passed balls?/, 'pb', 'fielding'],
  [/\bera\b|earned run average/, 'era', 'pitching'],
  [/\bwhip\b/, 'whip', 'pitching'],
  [/\bfip\b/, 'fip', 'pitching'],
  [/k\/9|strikeouts per (9|nine)/, 'k9', 'pitching'],
  [/saves?\b/, 'sv', 'pitching'],
  [/opponent batting average|opp avg|batting average against/, 'opp_avg', 'pitching'],
]

export type Parsed = { state: Partial<QueryState>; understood: string[]; metrics: string[] }

export function parseQuery(text: string, current: QueryState): Parsed {
  const q = text.toLowerCase()
  const state: Partial<QueryState> = {}
  const understood: string[] = []

  for (const [re, key] of GAME_TYPE_WORDS) {
    if (re.test(q)) { state.gameType = key; understood.push(GAME_TYPES.find(g => g.key === key)!.label); break }
  }

  const years = [...q.matchAll(/\b(19|20)\d{2}\b/g)].map(m => Number(m[0])).filter(y => y >= FIRST_SEASON && y <= CURRENT_SEASON)
  const since = q.match(/since (20\d{2})/)
  const lastN = q.match(/last (\d+) (seasons|years)/)
  if (since) { state.from = Math.max(FIRST_SEASON, Number(since[1])); state.to = CURRENT_SEASON }
  else if (lastN) { state.to = CURRENT_SEASON; state.from = Math.max(FIRST_SEASON, CURRENT_SEASON - Number(lastN[1]) + 1) }
  else if (years.length) { state.from = Math.min(...years); state.to = Math.max(...years) }
  else if (/all[- ]time|every season|history/.test(q)) { state.from = FIRST_SEASON; state.to = CURRENT_SEASON }
  if (state.from != null) understood.push(state.from === state.to ? String(state.from) : `${state.from}–${state.to}`)

  if (years.length >= 2 && /compare|\bvs\.?\b|versus|against/.test(q)) {
    state.view = 'compare'; state.years = [...new Set(years)].slice(0, 12)
    understood.push(`compare ${state.years.join(' vs ')}`)
  }

  let group: Group = current.group
  // Every metric named in the search (same side of the ball as the first one) — these pre-select the metric picker.
  const metrics: string[] = []
  for (const [re, key, g] of METRIC_WORDS) {
    if (!re.test(q)) continue
    if (metrics.length === 0) { group = g; state.group = g }
    if (g === group && !metrics.includes(key)) metrics.push(key)
  }
  if (metrics.length) { state.metric = metrics[0]; understood.push(...metrics.map(k => metricByKey(k)!.full)) }
  if (!state.metric && /pitch(er|ing)s?\b/.test(q)) { state.group = 'pitching'; group = 'pitching'; state.metric = 'era' }

  // Results the finder can look for ("last time a grand slam"): only read as a result when asking about the last time,
  // because "home runs on 0-2 counts" is a stat, not a result filter.
  const asksLast = /last time|most recent(ly)?|\blatest\b|last happened|when (did|was|has|have)\b.*\blast\b|how long since|when was the last/.test(q)
    || /\blast\s+(?:a\s+|an\s+|the\s+)?(?:grand slams?|home ?runs?|homers?|triples?|doubles?|singles?|strike ?outs?|walks?|double plays?|sac(?:rifice)? flys?)\b/.test(q)
  const evts: string[] = []
  if (asksLast) {
    if (/grand slam/.test(q) || /home ?runs?|homers?|\bhr\b/.test(q)) evts.push('home_run')
    if (/strike ?outs?/.test(q)) evts.push('strikeout', 'strikeout_double_play')
    if (/\bwalks?\b|base on balls/.test(q) && !/walk-?off/.test(q)) evts.push('walk', 'intent_walk')
    if (/double plays?|\bgidp\b/.test(q)) evts.push('grounded_into_double_play', 'double_play', 'strikeout_double_play', 'sac_fly_double_play', 'sac_bunt_double_play', 'triple_play')
    if (/\btriples?\b/.test(q)) evts.push('triple')
    if (/\bdoubles?\b/.test(q) && !/double plays?/.test(q)) evts.push('double')
    if (/\bsingles?\b/.test(q)) evts.push('single')
    if (/hit by (a )?pitch|\bhbp\b/.test(q)) evts.push('hit_by_pitch')
    if (/sac(rifice)? fly/.test(q)) evts.push('sac_fly')
  }

  // Every situation phrase that matches (one per family). One match = quick engine; a pitch count,
  // score margin, or two+ situations together = deep engine, which can stack them.
  const matched: string[] = []
  const usedFam = new Set<string>()
  for (const [re, code] of SPLIT_WORDS) {
    if (!re.test(q) || !isValidSplit(code, group)) continue
    const fam = SPLIT_INDEX.get(code)?.family ?? code
    if (usedFam.has(fam)) continue
    usedFam.add(fam); matched.push(code)
  }
  if (asksLast && /grand slam/.test(q) && !usedFam.has('runners')) { matched.push('r123'); usedFam.add('runners') }
  const dp = parseDeepPhrases(q)
  if (dp.any || matched.length >= 2 || evts.length) {
    // an explicit margin ("trailing by 1-3") replaces the generic ahead / behind / tied tags
    const hasMargin = dp.scoreMin != null || dp.scoreMax != null
    const stack = matched.filter(c => deepSupports(c, group) && !(hasMargin && ['sah', 'sbh', 'sti'].includes(c)))
    const deep: DeepFilters = { stack, pitchesMin: dp.pitchesMin, pitchesMax: dp.pitchesMax, scoreMin: dp.scoreMin, scoreMax: dp.scoreMax, events: evts.length ? [...new Set(evts)] : undefined }
    state.deep = deep; state.split = ''
    understood.push(...describeDeep(deep))
  } else if (matched.length === 1) {
    state.split = matched[0]; state.deep = null
    understood.push(splitLabel(matched[0]))
  }

  // "When did this last happen?" → the Last-happened finder
  if (state.view === 'compare') { /* set above */ }
  else if (asksLast) { state.view = 'recent'; understood.push('last time it happened') }
  else if (/by inning|each inning|every inning/.test(q)) { state.view = 'breakdown'; state.family = 'inning' }
  else if (/by position|each position/.test(q)) { state.view = 'breakdown'; state.family = group === 'fielding' ? 'fieldpos' : 'position' }
  else if (/by count|every count/.test(q)) { state.view = 'breakdown'; state.family = 'count' }
  else if (/by month/.test(q)) { state.view = 'breakdown'; state.family = 'month' }
  else if (/by team|each team|every team/.test(q)) state.view = 'teams'
  else if (/leaders?|best players|top players|by player/.test(q)) state.view = 'players'
  else if (/trend|over time|by season|each season|every season|since/.test(q)) state.view = 'trend'
  else if (Object.keys(state).length) state.view = 'summary'

  return { state, understood, metrics }
}

/** Starter searches shown under the box, grouped the way a fan thinks about a question. */
export const PROMPT_GROUPS: { title: string; blurb: string; pro?: boolean; prompts: { label: string; text: string }[] }[] = [
  { title: 'Player vs club', blurb: 'One hitter or pitcher against one club', prompts: [
    { label: 'Bryce Harper vs San Diego', text: 'Bryce Harper vs San Diego' },
    { label: 'Juan Soto vs the Yankees', text: 'Juan Soto vs Yankees' },
    { label: 'Tarik Skubal vs Red Sox', text: 'Tarik Skubal vs Red Sox' },
    { label: 'Shohei Ohtani vs Giants, since 2024', text: 'Shohei Ohtani vs Giants since 2024' },
  ] },
  { title: 'Situations', blurb: 'The moment in the game', prompts: [
    { label: 'ERA with runners in scoring position', text: 'ERA with runners in scoring position' },
    { label: 'Postseason OPS after the 6th inning', text: 'postseason OPS after the 6th inning' },
    { label: 'Batting average by count', text: 'regular season batting average by count' },
    { label: 'Hitting in 8+ pitch at-bats, trailing', text: 'OPS in 8+ pitch at-bats trailing by 1-3' },
  ] },
  { title: 'Leaders & clubs', blurb: 'Who is on top, and how clubs compare', prompts: [
    { label: 'Home run leaders', text: 'home run leaders' },
    { label: 'Every club\'s ERA', text: 'ERA by team' },
    { label: 'Stolen bases by inning (postseason)', text: 'postseason stolen bases by inning' },
    { label: 'World Series home runs by season', text: 'world series home runs by season' },
  ] },
  { title: 'Last time it happened', blurb: 'Find the most recent occurrence', prompts: [
    { label: 'Last grand slam', text: 'last time a grand slam' },
    { label: 'Last triple', text: 'last time a triple' },
  ] },
]
export const PRESETS: { label: string; text: string }[] = PROMPT_GROUPS.flatMap(g => g.prompts)

// ── Free vs Pro ─────────────────────────────────────────────────────────
// FREE = the standard (box-score) stats. PRO = advanced metrics, chart-type
// switching, PNG/CSV export and the column picker. Situation filters,
// seasons and groupings stay free. Enforced server-side too (the API strips
// the raw fields only advanced metrics need) — the UI is not the only gate.

const STANDARD_KEYS: Record<Group, string[]> = {
  hitting: ['h_g', 'pa', 'ab', 'r', 'h', '2b', '3b', 'hr', 'rbi', 'bb', 'so', 'hbp', 'sb', 'cs', 'avg', 'obp', 'slg', 'ops'],
  pitching: ['g', 'gs', 'w', 'l', 'sv', 'hld', 'ip', 'bf', 'p_h', 'p_r', 'p_er', 'p_hr', 'p_bb', 'p_so', 'era', 'whip'],
  fielding: ['f_g', 'f_gs', 'f_inn', 'ch', 'po', 'ast', 'e', 'dp', 'fpct'],
}

export function isStandardMetric(key: string): boolean {
  return STANDARD_KEYS.hitting.includes(key) || STANDARD_KEYS.pitching.includes(key) || STANDARD_KEYS.fielding.includes(key)
}
export function standardMetricsFor(group: Group): MetricDef[] {
  return STANDARD_KEYS[group].map(k => metricByKey(k)!).filter(Boolean)
}
/** What a non-Pro viewer sees in tables / tiles. */
export const FREE_COLS: Record<Group, string[]> = {
  hitting: ['h_g', 'pa', 'avg', 'obp', 'slg', 'ops', 'hr', 'rbi', 'sb', 'bb', 'so'],
  pitching: ['g', 'bf', 'era', 'whip', 'w', 'l', 'sv', 'p_so', 'p_bb', 'p_hr'],
  fielding: ['f_g', 'ch', 'po', 'ast', 'e', 'dp', 'fpct', 'f_inn'],
}
export const FREE_HEADLINE: Record<Group, string[]> = {
  hitting: ['avg', 'obp', 'slg', 'ops', 'hr', 'rbi', 'sb', 'r'],
  pitching: ['era', 'whip', 'w', 'l', 'sv', 'p_so', 'p_bb', 'ip'],
  fielding: ['fpct', 'ch', 'po', 'ast', 'e', 'dp', 'f_inn', 'f_g'],
}
/** Raw API fields the standard metrics (plus the PA-outcome donut) need — everything else is dropped for free viewers. */
export const FREE_FIELDS: Record<Group, string[]> = {
  hitting: ['gamesPlayed', 'teamGames', 'plateAppearances', 'atBats', 'runs', 'hits', 'doubles', 'triples', 'homeRuns', 'rbi', 'baseOnBalls', 'strikeOuts', 'hitByPitch', 'stolenBases', 'caughtStealing', 'sacFlies', 'totalBases'],
  pitching: ['gamesPlayed', 'teamGames', 'gamesStarted', 'wins', 'losses', 'saves', 'holds', 'outs', 'battersFaced', 'hits', 'runs', 'earnedRuns', 'homeRuns', 'baseOnBalls', 'strikeOuts', 'doubles', 'triples', 'hitByPitch'],
  fielding: ['games', 'teamGames', 'gamesStarted', 'inningsOuts', 'putOuts', 'assists', 'errors', 'doublePlays', 'chances'],
}

export type ChartType = 'bar' | 'hbar' | 'line' | 'area' | 'pie' | 'radar' | 'scatter' | 'table'
export const CHART_TYPES: { key: ChartType; label: string }[] = [
  { key: 'bar', label: 'Columns' },
  { key: 'hbar', label: 'Bars' },
  { key: 'line', label: 'Line' },
  { key: 'area', label: 'Area' },
  { key: 'pie', label: 'Donut' },
  { key: 'radar', label: 'Radar' },
  { key: 'scatter', label: 'Scatter' },
  { key: 'table', label: 'Table only' },
]

// ── Deep (plate-appearance) engine ──────────────────────────────────────
// Backed by plate appearances built in memory from Baseball Savant's per-pitch export (src/lib/savant-pa.ts;
// no database). Unlike MLB's one-split-at-a-time
// API, every filter here STACKS: "16+ pitch at-bats, 7th inning or later, RISP, vs lefties".

export type DeepFilters = {
  /** situation chip codes applied together (same codes as the quick engine) */
  stack: string[]
  pitchesMin?: number
  pitchesMax?: number
  inningFrom?: number
  inningTo?: number
  /** batting team's lead (+) or deficit (−) when the plate appearance began */
  scoreMin?: number
  scoreMax?: number
  /** how the plate appearance ended (single, home_run, strikeout, ...) — used by the last-happened finder */
  events?: string[]
  /** limit to a club and / or a player */
  who?: Who
  /** batted-ball detail: exit velocity, launch angle, distance, trajectory */
  hit?: HitFilter
}

/** Batted-ball limits. Bounds are inclusive; `ref` is the hit being matched (used to show how far off each result is). */
export type HitFilter = {
  evMin?: number; evMax?: number
  laMin?: number; laMax?: number
  distMin?: number; distMax?: number
  bbTypes?: string[]
  /** order results by how close they are to `ref` instead of newest first */
  rank?: 'recent' | 'closest'
  ref?: HitRef
}
export type HitRef = { ev: number; la: number | null; dist: number | null; bbType?: string | null; event?: string }

/** Club and player limits for a plate-appearance search. team: the club's abbreviation (NYY). */
export type Who = {
  team?: string
  /** bat = the club was batting, field = the club was fielding / pitching, any = either */
  teamRole?: 'bat' | 'field' | 'any'
  playerId?: number
  playerName?: string
  /** bat = the player was the batter, pitch = the pitcher, any = either */
  playerRole?: 'bat' | 'pitch' | 'any'
  /** the other side of a head-to-head: with playerRole 'bat' this is the pitcher faced; with 'pitch' it is the batter */
  opponentId?: number
}

export const EMPTY_DEEP: DeepFilters = { stack: [] }

/** Filters understood by the plate-appearance engine (savant-pa.ts → aggregatePa). */
export type PaParams = {
  inning_from?: number; inning_to?: number; half?: 'Top' | 'Bot'
  outs?: number[]; base_states?: number[]
  pitches_min?: number; pitches_max?: number
  score_diff_min?: number; score_diff_max?: number
  stand?: 'L' | 'R'; p_throws?: 'L' | 'R'
  last_balls?: number; last_strikes?: number
  events?: string[]
  batter_team?: string; pitcher_team?: string; any_team?: string
  batter_id?: number; pitcher_id?: number; any_player?: number
  ev_min?: number; ev_max?: number; la_min?: number; la_max?: number; dist_min?: number; dist_max?: number
  bb_types?: string[]
  rank?: 'recent' | 'closest'
  ref?: HitRef
}

const ALL_BASES = [1, 2, 3, 4, 5, 6, 7]
const RISP = [2, 3, 6, 7]

/** What a situation chip means in plate-appearance terms. null = this chip can't be applied to PA data. */
export function chipToPa(code: string, group: Group): PaParams | null {
  let m: RegExpMatchArray | null
  if ((m = code.match(/^i0([1-9])$/))) return { inning_from: +m[1], inning_to: +m[1] }
  switch (code) {
    case 'ix': return { inning_from: 10 }
    case 'ig01': return { inning_to: 6 }
    case 'ig07': return { inning_from: 7 }
    case 'ig08': return { inning_from: 8 }
    case 'ig09': return { inning_from: 9 }
    case 'o0': return { outs: [0] }
    case 'o1': return { outs: [1] }
    case 'o2': return { outs: [2] }
    case 'r0': return { base_states: [0] }
    case 'ron': return { base_states: ALL_BASES }
    case 'risp': return { base_states: RISP }
    case 'risp2': return { base_states: RISP, outs: [2] }
    case 'r1': return { base_states: [1] }
    case 'r2': return { base_states: [2] }
    case 'r3': return { base_states: [4] }
    case 'r12': return { base_states: [3] }
    case 'r13': return { base_states: [5] }
    case 'r23': return { base_states: [6] }
    case 'r123': return { base_states: [7] }
    case 'fp': return { last_balls: 0, last_strikes: 0 }
    case '2s': return { last_strikes: 2 }
    case 'fc': return { last_balls: 3, last_strikes: 2 }
    case 'sah': return { score_diff_min: 1 }
    case 'sbh': return { score_diff_max: -1 }
    case 'sti': return { score_diff_min: 0, score_diff_max: 0 }
    case 'lc': return { inning_from: 7, score_diff_min: -3, score_diff_max: 3 }
    case 'vl': return group === 'pitching' ? { stand: 'L' } : { p_throws: 'L' }
    case 'vr': return group === 'pitching' ? { stand: 'R' } : { p_throws: 'R' }
    case 'l': return { stand: 'L' }
    case 'r': return { stand: 'R' }
    case 'h': return { half: group === 'pitching' ? 'Top' : 'Bot' }
    case 'a': return { half: group === 'pitching' ? 'Bot' : 'Top' }
  }
  if ((m = code.match(/^c([0-3])([0-2])$/))) return { last_balls: +m[1], last_strikes: +m[2] }
  return null
}
export const deepSupports = (code: string, group: Group): boolean => group !== 'fielding' && chipToPa(code, group) !== null

const inter = (a?: number[], b?: number[]) => (a && b ? a.filter(x => b.includes(x)) : (a ?? b))
const lo = (a?: number, b?: number) => (a == null ? b : b == null ? a : Math.max(a, b))
const hi = (a?: number, b?: number) => (a == null ? b : b == null ? a : Math.min(a, b))

/** Merge every stacked chip + the numeric controls into one pa_query parameter set (ranges intersect). */
export function deepToParams(d: DeepFilters, group: Group): PaParams {
  let out: PaParams = {}
  const parts: PaParams[] = [
    ...d.stack.map(c => chipToPa(c, group)).filter((x): x is PaParams => !!x),
    {
      pitches_min: d.pitchesMin, pitches_max: d.pitchesMax, inning_from: d.inningFrom, inning_to: d.inningTo,
      score_diff_min: d.scoreMin, score_diff_max: d.scoreMax, events: d.events?.length ? d.events : undefined,
    },
  ]
  for (const p of parts) {
    out = {
      ...out, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)),
      inning_from: lo(out.inning_from, p.inning_from), inning_to: hi(out.inning_to, p.inning_to),
      pitches_min: lo(out.pitches_min, p.pitches_min), pitches_max: hi(out.pitches_max, p.pitches_max),
      score_diff_min: lo(out.score_diff_min, p.score_diff_min), score_diff_max: hi(out.score_diff_max, p.score_diff_max),
      outs: inter(out.outs, p.outs), base_states: inter(out.base_states, p.base_states),
    }
  }
  const h = d.hit
  if (h) {
    if (h.evMin != null) out.ev_min = h.evMin
    if (h.evMax != null) out.ev_max = h.evMax
    if (h.laMin != null) out.la_min = h.laMin
    if (h.laMax != null) out.la_max = h.laMax
    if (h.distMin != null) out.dist_min = h.distMin
    if (h.distMax != null) out.dist_max = h.distMax
    if (h.bbTypes?.length) out.bb_types = h.bbTypes
    if (h.rank) out.rank = h.rank
    if (h.ref) out.ref = h.ref
  }
  const w = d.who
  if (w?.team) {
    if (w.teamRole === 'bat') out.batter_team = w.team
    else if (w.teamRole === 'field') out.pitcher_team = w.team
    else out.any_team = w.team
  }
  if (w?.playerId) {
    if (w.playerRole === 'bat') out.batter_id = w.playerId
    else if (w.playerRole === 'pitch') out.pitcher_id = w.playerId
    else out.any_player = w.playerId
    if (w.opponentId && w.playerRole === 'bat') out.pitcher_id = w.opponentId
    else if (w.opponentId && w.playerRole === 'pitch') out.batter_id = w.opponentId
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as PaParams
}

export function describeDeep(d: DeepFilters): string[] {
  const out = d.stack.map(splitLabel)
  if (d.pitchesMin != null || d.pitchesMax != null) {
    out.push(d.pitchesMin != null && d.pitchesMax != null
      ? (d.pitchesMin === d.pitchesMax ? `${d.pitchesMin}-pitch at-bats` : `${d.pitchesMin}–${d.pitchesMax} pitch at-bats`)
      : d.pitchesMin != null ? `${d.pitchesMin}+ pitch at-bats` : `up to ${d.pitchesMax} pitches`)
  }
  if (d.inningFrom != null || d.inningTo != null) out.push(`innings ${d.inningFrom ?? 1}–${d.inningTo ?? '9+'}`)
  if (d.scoreMin != null || d.scoreMax != null) out.push(`score margin ${d.scoreMin ?? '−∞'} to ${d.scoreMax ?? '+∞'}`)
  if (d.hit) {
    const h = d.hit
    const rng = (lo?: number, hi?: number, unit = '') => (lo != null && hi != null ? `${lo}–${hi}${unit}` : lo != null ? `${lo}+${unit}` : `up to ${hi}${unit}`)
    if (h.evMin != null || h.evMax != null) out.push(`exit velo ${rng(h.evMin, h.evMax, ' mph')}`)
    if (h.laMin != null || h.laMax != null) out.push(`launch angle ${rng(h.laMin, h.laMax, '°')}`)
    if (h.distMin != null || h.distMax != null) out.push(`distance ${rng(h.distMin, h.distMax, ' ft')}`)
    if (h.bbTypes?.length) out.push(h.bbTypes.map(t => BB_LABEL[t] ?? t).join(' / '))
  }
  if (d.who?.team) out.push(`${d.who.team} ${d.who.teamRole === 'bat' ? 'batting' : d.who.teamRole === 'field' ? 'pitching' : 'involved'}`)
  if (d.who?.playerId) out.push(`${d.who.playerName ?? 'player'} ${d.who.playerRole === 'bat' ? 'batting' : d.who.playerRole === 'pitch' ? 'pitching' : 'involved'}`)
  if (d.events?.length) out.push(`ending in ${[...new Set(d.events.map(e => deepGroupLabel('events', e).toLowerCase()))].join(' / ')}`)
  return out
}

/** Metrics the plate-appearance table can compute (no R/RBI/SB/CS/ERA etc. — those aren't plate-appearance facts). */
export const DEEP_METRICS: Record<Group, string[]> = {
  hitting: ['pa', 'ab', 'h', '2b', '3b', 'hr', 'bb', 'ibb', 'so', 'hbp', 'sf', 'sh', 'tb', 'xbh', 'avg', 'obp', 'slg', 'ops', 'iso', 'babip', 'k_pct', 'bb_pct', 'kbb_pct', 'hr_pct', 'xbh_pct', 'contact_pct', 'woba', 'xwoba', 'ev', 'hh_pct', 'barrel_pct', 'bbe'],
  pitching: ['bf', 'p_h', 'p_hr', 'p_bb', 'p_so', 'opp_avg', 'opp_obp', 'opp_slg', 'opp_ops', 'p_babip', 'p_k_pct', 'p_bb_pct', 'p_kbb_pct', 'p_hr_pct', 'p_woba', 'p_xwoba', 'p_ev', 'p_hh_pct', 'p_barrel_pct', 'p_bbe'],
  fielding: [],
}
export const isDeepMetric = (key: string, group: Group): boolean => DEEP_METRICS[group].includes(key)

/** Group-by families the deep engine can break out → pa_query group_by key. */
export const DEEP_GROUP_BY: Record<string, string> = {
  inning: 'inning', outs: 'outs', runners: 'base_state', count: 'last_count', atbatlen: 'pitches',
  state: 'score_diff', result: 'events',
}
export const DEEP_ONLY_FAMILIES: SplitFamily[] = [
  { key: 'atbatlen', label: 'Pitches in the at-bat', blurb: 'How many pitches the plate appearance took', splits: [] },
  { key: 'result', label: 'How it ended', blurb: 'The result of the plate appearance', splits: [] },
]

const BASE_LABELS = ['Bases empty', 'Runner on 1st', 'Runner on 2nd', 'Runners on 1st & 2nd', 'Runner on 3rd', 'Runners on 1st & 3rd', 'Runners on 2nd & 3rd', 'Bases loaded']
const EVENT_LABELS: Record<string, string> = {
  single: 'Single', double: 'Double', triple: 'Triple', home_run: 'Home run', walk: 'Walk', intent_walk: 'Intentional walk',
  hit_by_pitch: 'Hit by pitch', strikeout: 'Strikeout', strikeout_double_play: 'Strikeout (DP)', field_out: 'Field out',
  force_out: 'Force out', grounded_into_double_play: 'Grounded into DP', double_play: 'Double play', triple_play: 'Triple play',
  sac_fly: 'Sac fly', sac_bunt: 'Sac bunt', sac_fly_double_play: 'Sac fly (DP)', sac_bunt_double_play: 'Sac bunt (DP)',
  fielders_choice: "Fielder's choice", fielders_choice_out: "Fielder's choice (out)", field_error: 'Reached on error', catcher_interf: "Catcher's interference",
}
/** Display label for a pa_query group value. */
export function deepGroupLabel(groupBy: string, g: string): string {
  switch (groupBy) {
    case 'inning': return `${ord(+g)} inning`
    case 'outs': return `${g} out${g === '1' ? '' : 's'}`
    case 'base_state': return BASE_LABELS[+g] ?? g
    case 'pitches': return `${g} pitch${g === '1' ? '' : 'es'}`
    case 'half': return g === 'Top' ? 'Top of inning' : 'Bottom of inning'
    case 'events': return EVENT_LABELS[g] ?? g
    case 'last_count': return `${g} count`
    case 'score_diff': return +g > 0 ? `Ahead by ${g}` : +g < 0 ? `Behind by ${-g}` : 'Tied'
    default: return g
  }
}

// Phrases that only the deep engine can answer.
export function parseDeepPhrases(q: string): Partial<DeepFilters> & { any: boolean } {
  const out: Partial<DeepFilters> & { any: boolean } = { any: false }
  let m: RegExpMatchArray | null
  if ((m = q.match(/(\d{1,2})\s*\+\s*(?:-|\s)?pitch|(\d{1,2})\s*(?:or more|and more|plus)\s*pitch|at least (\d{1,2}) pitch/))) {
    out.pitchesMin = Number(m[1] ?? m[2] ?? m[3]); out.any = true
  } else if ((m = q.match(/(\d{1,2})[- ]pitch (?:at[- ]?bats?|plate appearances?|pa\b)|(\d{1,2}) pitches? (?:at[- ]?bats?)/))) {
    out.pitchesMin = out.pitchesMax = Number(m[1] ?? m[2]); out.any = true
  } else if ((m = q.match(/(?:fewer than|under|less than) (\d{1,2}) pitch/))) {
    out.pitchesMax = Number(m[1]) - 1; out.any = true
  } else if (/long (?:at[- ]?bats?|plate appearances?)/.test(q)) {
    out.pitchesMin = 8; out.any = true
  }
  if ((m = q.match(/(?:trailing|behind|down|losing) by (\d)(?:\s*(?:-|to)\s*(\d))?/))) {
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a
    out.scoreMin = -Math.max(a, b); out.scoreMax = -Math.min(a, b); out.any = true
  } else if ((m = q.match(/(?:leading|ahead|up|winning) by (\d)(?:\s*(?:-|to)\s*(\d))?/))) {
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a
    out.scoreMin = Math.min(a, b); out.scoreMax = Math.max(a, b); out.any = true
  }
  return out
}

/** The Games column for each side of the ball (hitting and pitching both use a 'g' stat, so the keys differ). */
export const GAMES_KEY: Record<Group, string> = { hitting: 'h_g', pitching: 'g', fielding: 'f_g' }

// ── Team contribution ("how the overall number is made up") ─────────────
// For a rate that is a ratio of sums, a team's contribution is its numerator
// divided by the LEAGUE's denominator — so the contributions of all clubs add up
// exactly to the league number (AVG = Σ team hits ÷ league at-bats). Counting stats
// are simply additive. Metrics that are not a clean ratio of sums (FIP, BABIP, ...)
// have no contribution and fall back to a plain per-club comparison.

export const CONTRIB: Record<string, (t: Totals, lg: Totals) => number | null> = (() => {
  const ab = (t: Totals) => n(t, 'atBats')
  const obpDen = (t: Totals) => n(t, 'atBats') + n(t, 'baseOnBalls') + n(t, 'hitByPitch') + n(t, 'sacFlies')
  const obpNum = (t: Totals) => n(t, 'hits') + n(t, 'baseOnBalls') + n(t, 'hitByPitch')
  const outs = (t: Totals) => n(t, 'outs')
  const c = {
    avg: (t: Totals, lg: Totals) => div(n(t, 'hits'), ab(lg)),
    obp: (t: Totals, lg: Totals) => div(obpNum(t), obpDen(lg)),
    slg: (t: Totals, lg: Totals) => div(n(t, 'totalBases'), ab(lg)),
    iso: (t: Totals, lg: Totals) => div(n(t, 'totalBases') - n(t, 'hits'), ab(lg)),
    k_pct: (t: Totals, lg: Totals) => div(n(t, 'strikeOuts'), n(lg, 'plateAppearances')),
    bb_pct: (t: Totals, lg: Totals) => div(n(t, 'baseOnBalls'), n(lg, 'plateAppearances')),
    hr_pct: (t: Totals, lg: Totals) => div(n(t, 'homeRuns'), n(lg, 'plateAppearances')),
    xbh_pct: (t: Totals, lg: Totals) => div(n(t, 'doubles') + n(t, 'triples') + n(t, 'homeRuns'), n(lg, 'plateAppearances')),
    contact_pct: (t: Totals, lg: Totals) => div(n(t, 'atBats') - n(t, 'strikeOuts'), ab(lg)),
    woba: (t: Totals, lg: Totals) => div(n(t, 'wobaNum'), n(lg, 'wobaDen')),
    xwoba: (t: Totals, lg: Totals) => div(n(t, 'xwobaNum'), n(lg, 'wobaDen')),
    hh_pct: (t: Totals, lg: Totals) => div(n(t, 'hardHit'), n(lg, 'bbe')),
    barrel_pct: (t: Totals, lg: Totals) => div(n(t, 'barrels'), n(lg, 'bbe')),
    // pitching
    era: (t: Totals, lg: Totals) => div(27 * n(t, 'earnedRuns'), outs(lg)),
    whip: (t: Totals, lg: Totals) => div(3 * (n(t, 'baseOnBalls') + n(t, 'hits')), outs(lg)),
    r9: (t: Totals, lg: Totals) => div(27 * n(t, 'runs'), outs(lg)),
    k9: (t: Totals, lg: Totals) => div(27 * n(t, 'strikeOuts'), outs(lg)),
    bb9: (t: Totals, lg: Totals) => div(27 * n(t, 'baseOnBalls'), outs(lg)),
    hr9: (t: Totals, lg: Totals) => div(27 * n(t, 'homeRuns'), outs(lg)),
    h9: (t: Totals, lg: Totals) => div(27 * n(t, 'hits'), outs(lg)),
    opp_avg: (t: Totals, lg: Totals) => div(n(t, 'hits'), ab(lg)),
    opp_obp: (t: Totals, lg: Totals) => div(obpNum(t), obpDen(lg)),
    opp_slg: (t: Totals, lg: Totals) => div(n(t, 'totalBases'), ab(lg)),
    p_k_pct: (t: Totals, lg: Totals) => div(n(t, 'strikeOuts'), n(lg, 'battersFaced')),
    p_bb_pct: (t: Totals, lg: Totals) => div(n(t, 'baseOnBalls'), n(lg, 'battersFaced')),
    p_hr_pct: (t: Totals, lg: Totals) => div(n(t, 'homeRuns'), n(lg, 'battersFaced')),
    p_woba: (t: Totals, lg: Totals) => div(n(t, 'wobaNum'), n(lg, 'wobaDen')),
    p_xwoba: (t: Totals, lg: Totals) => div(n(t, 'xwobaNum'), n(lg, 'wobaDen')),
    p_hh_pct: (t: Totals, lg: Totals) => div(n(t, 'hardHit'), n(lg, 'bbe')),
    p_barrel_pct: (t: Totals, lg: Totals) => div(n(t, 'barrels'), n(lg, 'bbe')),
    // fielding
    fpct: (t: Totals, lg: Totals) => div(n(t, 'putOuts') + n(t, 'assists'), n(lg, 'putOuts') + n(lg, 'assists') + n(lg, 'errors')),
    e_pct: (t: Totals, lg: Totals) => div(n(t, 'errors'), n(lg, 'putOuts') + n(lg, 'assists') + n(lg, 'errors')),
  } as Record<string, (t: Totals, lg: Totals) => number | null>
  c.ops = (t, lg) => { const o = c.obp(t, lg), sl = c.slg(t, lg); return o != null && sl != null ? o + sl : null }
  c.opp_ops = (t, lg) => { const o = c.opp_obp(t, lg), sl = c.opp_slg(t, lg); return o != null && sl != null ? o + sl : null }
  return c
})()

/** A club's contribution to the overall value of `key`; all clubs' contributions sum to the overall number. */
export function contribOf(key: string, t: Totals, lg: Totals): number | null {
  const m = metricByKey(key)
  if (!m) return null
  if (!canStack(key)) return null
  if (m.kind === 'count') { const v = m.compute(t, lg); return v != null && Number.isFinite(v) ? v : null }
  const f = CONTRIB[key]
  if (!f) return null
  const v = f(t, lg)
  return v != null && Number.isFinite(v) ? v : null
}
export const canStack = (key: string): boolean => {
  const m = metricByKey(key)
  if (key === 'h_g' || key === 'g' || key === 'f_g') return false   // clubs' games overlap (each game has two clubs)
  return !!m && (m.kind === 'count' || !!CONTRIB[key])
}

// ── From a live game to a search ────────────────────────────────────────
// Clicking a live game turns the moment it is in into the same stacked filters the search uses,
// so "bottom 8th, 2 outs, runners on 1st and 2nd, tied" can be looked up in the history.

export type LivePick = 'outs' | 'runners' | 'inning' | 'score' | 'count' | 'batter' | 'pitcher' | 'atbat'
export type LiveMoment = { outs: number; baseState: number; inning: number; scoreDiff: number; balls: number; strikes: number; stand: string; throws: string; pitches: number }

export const BASE_CHIP: Record<number, string> = { 0: 'r0', 1: 'r1', 2: 'r2', 3: 'r12', 4: 'r3', 5: 'r13', 6: 'r23', 7: 'r123' }

export function deepFromLive(m: LiveMoment, picks: LivePick[]): DeepFilters {
  const stack: string[] = []
  const d: DeepFilters = { stack }
  if (picks.includes('outs')) stack.push(`o${Math.min(2, m.outs)}`)
  if (picks.includes('runners')) stack.push(BASE_CHIP[m.baseState] ?? 'r0')
  if (picks.includes('inning')) { d.inningFrom = m.inning; d.inningTo = m.inning }
  if (picks.includes('score')) stack.push(m.scoreDiff > 0 ? 'sah' : m.scoreDiff < 0 ? 'sbh' : 'sti')
  if (picks.includes('count')) stack.push(`c${Math.min(3, m.balls)}${Math.min(2, m.strikes)}`)
  if (picks.includes('batter') && (m.stand === 'L' || m.stand === 'R')) stack.push(m.stand === 'L' ? 'l' : 'r')
  if (picks.includes('pitcher') && (m.throws === 'L' || m.throws === 'R')) stack.push(m.throws === 'L' ? 'vl' : 'vr')
  if (picks.includes('atbat') && m.pitches > 0) d.pitchesMin = m.pitches
  return d
}

/** MLB game-type letter → the search's game-type key (all postseason rounds roll up to 'P'). */
export const gameTypeForSearch = (t: string): string => (['F', 'D', 'L', 'W'].includes(t) ? 'P' : 'R')

// ── Batted-ball search: how alike should it be? ─────────────────────────

export const BB_TYPES: { key: string; label: string }[] = [
  { key: 'ground_ball', label: 'Ground ball' }, { key: 'line_drive', label: 'Line drive' },
  { key: 'fly_ball', label: 'Fly ball' }, { key: 'popup', label: 'Pop-up' },
]
const BB_LABEL: Record<string, string> = Object.fromEntries(BB_TYPES.map(t => [t.key, t.label]))

/** Result groups — "the true three outcomes" is home run, walk or strikeout (no ball in play, or one that ends it all). */
export const EVENT_PRESETS: { key: string; label: string; blurb: string; events: string[] }[] = [
  { key: 'three', label: 'True three outcomes', blurb: 'Home run, walk or strikeout — the plate appearances where the defense never gets involved.',
    events: ['home_run', 'walk', 'intent_walk', 'strikeout', 'strikeout_double_play'] },
  { key: 'hits', label: 'Any hit', blurb: 'Single, double, triple or home run.', events: ['single', 'double', 'triple', 'home_run'] },
  { key: 'xbh', label: 'Extra-base hit', blurb: 'Double, triple or home run.', events: ['double', 'triple', 'home_run'] },
  { key: 'hr', label: 'Home run', blurb: 'Over the fence.', events: ['home_run'] },
  { key: 'single', label: 'Single', blurb: 'One base.', events: ['single'] },
  { key: 'double', label: 'Double', blurb: 'Two bases.', events: ['double'] },
  { key: 'outinplay', label: 'Out on a ball in play', blurb: 'Hit in play and caught, thrown out or forced.',
    events: ['field_out', 'force_out', 'grounded_into_double_play', 'double_play', 'triple_play', 'fielders_choice_out', 'sac_fly', 'sac_bunt'] },
  { key: 'noplay', label: 'Walk or strikeout', blurb: 'The batter never put the ball in play.', events: ['walk', 'intent_walk', 'strikeout', 'strikeout_double_play'] },
]

export type MatchLevel = 'generic' | 'similar' | 'near' | 'custom'
export type MatchDims = { result: boolean; ev: boolean; la: boolean; dist: boolean; type: boolean }

export const MATCH_LEVELS: { key: MatchLevel; label: string; blurb: string; tol: { ev: number; la: number; dist: number }; dims: MatchDims }[] = [
  { key: 'generic', label: 'Generic', blurb: 'Just the same kind of result — for example any double. No speed or angle needed.',
    tol: { ev: 0, la: 0, dist: 0 }, dims: { result: true, ev: false, la: false, dist: false, type: false } },
  { key: 'similar', label: 'Similar', blurb: 'Same result, hit about as hard and at about the same angle (±5 mph, ±10°, ±40 ft).',
    tol: { ev: 5, la: 10, dist: 40 }, dims: { result: true, ev: true, la: true, dist: true, type: false } },
  { key: 'near', label: 'Near-identical', blurb: 'Almost the same ball: same result and kind of contact, within ±2 mph, ±4° and ±15 ft.',
    tol: { ev: 2, la: 4, dist: 15 }, dims: { result: true, ev: true, la: true, dist: true, type: true } },
  { key: 'custom', label: 'My own settings', blurb: 'Choose exactly what to match and how wide each range is.',
    tol: { ev: 5, la: 10, dist: 40 }, dims: { result: true, ev: true, la: true, dist: false, type: false } },
]

/** Turn a reference hit + the chosen level of detail into the filters that find hits like it. */
export function hitFromRef(ref: HitRef, tol: { ev: number; la: number; dist: number }, dims: MatchDims): { hit: HitFilter; events?: string[] } {
  const hit: HitFilter = { ref, rank: 'closest' }
  if (dims.ev) { hit.evMin = Math.max(0, Math.round((ref.ev - tol.ev) * 10) / 10); hit.evMax = Math.round((ref.ev + tol.ev) * 10) / 10 }
  if (dims.la && ref.la != null) { hit.laMin = Math.round(ref.la - tol.la); hit.laMax = Math.round(ref.la + tol.la) }
  if (dims.dist && ref.dist != null) { hit.distMin = Math.max(0, Math.round(ref.dist - tol.dist)); hit.distMax = Math.round(ref.dist + tol.dist) }
  if (dims.type && ref.bbType) hit.bbTypes = [ref.bbType]
  return { hit, events: dims.result && ref.event ? [ref.event] : undefined }
}

/** MLB's play-by-play wording ("Home Run", "Groundout") → the event keys the search uses. */
export function eventKeyFromMlb(label: string): string | undefined {
  const l = label.toLowerCase()
  if (l === 'single') return 'single'
  if (l === 'double') return 'double'
  if (l === 'triple') return 'triple'
  if (l === 'home run') return 'home_run'
  if (/sac fly/.test(l)) return 'sac_fly'
  if (/sac bunt/.test(l)) return 'sac_bunt'
  if (/grounded into dp|gidp/.test(l)) return 'grounded_into_double_play'
  if (/force/.test(l)) return 'force_out'
  if (/field error|error/.test(l)) return 'field_error'
  if (/fielder'?s choice/.test(l)) return 'fielders_choice'
  if (/groundout|flyout|lineout|pop out|bunt/.test(l)) return 'field_out'
  return undefined
}


// ── "Player vs club" phrases ────────────────────────────────────────────
// "Bryce Harper vs San Diego" → batter = Harper, club pitching = SD. The club half is matched here (pure text);
// the player half needs a name lookup, so the search box resolves it (queryWho.tsx → resolveMatchup).

const CITY_AMBIGUOUS = new Set(['new york', 'chicago', 'los angeles'])
/** alias → club abbreviation, longest alias first so "red sox" wins over "sox". */
const TEAM_ALIASES: [string, string][] = (() => {
  const out = new Map<string, string>()
  for (const t of MLB_TEAMS) {
    const city = t.name.endsWith(t.short) ? t.name.slice(0, t.name.length - t.short.length).trim() : ''
    for (const a of [t.name, t.short, t.abbrev, t.slug.replace(/-/g, ' '), city]) {
      const k = a.toLowerCase().trim()
      if (k.length >= 2 && !CITY_AMBIGUOUS.has(k) && !out.has(k)) out.set(k, t.abbrev)
    }
  }
  out.set('d-backs', 'ARI'); out.set('dbacks', 'ARI'); out.set('a\'s', 'ATH')
  return [...out.entries()].sort((a, b) => b[0].length - a[0].length)
})()

export type Matchup = {
  /** club found after "vs / against / versus / facing" */
  team?: string
  /** a city that is shared by two clubs ("new york") — the caller should ask which one */
  ambiguous?: string
  /** text before the vs-word, which should hold the player's name (plus any stat words) */
  before: string
  /** the text with the vs-word and club removed, to hand on to parseQuery */
  rest: string
}

export function extractMatchup(text: string): Matchup | null {
  const m = text.match(/^(.*?)\b(?:vs\.?|versus|against|facing|off|v)\b\s+(.+)$/i)
  if (!m) return null
  const after = m[2].toLowerCase()
  for (const city of CITY_AMBIGUOUS) if (new RegExp(`(^|[^a-z])${city}([^a-z]|$)`).test(after)) {
    const tail = after.replace(city, '').trim()
    if (!MLB_TEAMS.some(t => tail.includes(t.short.toLowerCase()))) return { ambiguous: city, before: m[1].trim(), rest: m[1].trim() }
  }
  for (const [alias, abbr] of TEAM_ALIASES) {
    const re = new RegExp(`(^|[^a-z])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`)
    if (re.test(after)) {
      return { team: abbr, before: m[1].trim(), rest: `${m[1]} ${after.replace(alias, ' ')}`.replace(/\s+/g, ' ').trim() }
    }
  }
  return null
}
