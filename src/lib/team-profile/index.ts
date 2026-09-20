// src/lib/team-profile/index.ts
//
// getTeamProfile(teamId) — everything the redesigned team page says about a
// club, assembled from real sources into ONE plain-JSON object:
//
//   league.ts       6 league-wide MLB calls → ranks for every headline number
//   season.ts       1 schedule call         → game-by-game season story
//   roster.ts       1 roster call + Supabase pitch_arsenals → who + what they throw
//   precomputed.ts  Supabase team_stats / team_defense / team_platoon_splits
//   scout/abs-desk  Supabase abs_challenge_log (the same ABS module the Scout Report uses)
//
// Rules this file follows (CLAUDE.md):
//   • Rank = position among the clubs that HAVE the number. Missing data →
//     null and an empty state in the UI, never a substitute value.
//   • No win-probability / odds / confidence anywhere. "Pythagorean record" is
//     a descriptive run-differential record, not a forecast.
//   • The raw Edge Score is not used or exposed here.
//   • Every sub-fetch fails independently (null / []) with a prefixed log —
//     one bad source leaves a hole in one section, not a broken page.

import { MLB_TEAMS } from '@/lib/teams'
import { getAbsDesk, type AbsClub } from '@/lib/scout/abs-desk'
import { getLeagueTables, metric, metricFromValues, fmt, type LeagueTables, type LeagueTeamRow, type Metric } from './league'
import { getSeasonStory, type SeasonStory } from './season'
import { getRosterProfile, getStaffArsenal, type RosterProfile, type StaffArsenal } from './roster'
import { getPrecomputed, type Precomputed } from './precomputed'

export type { Metric } from './league'
export type { SeasonStory } from './season'
export type { RosterProfile, StaffArsenal, PitcherLine, HitterLine } from './roster'
export { ordinal } from './league'

export type RadarAxis = { label: string; group: 'Offense' | 'Pitching' | 'Defense'; pct: number; rank: number | null; display: string }

export type DivisionRow = { id: number; abbr: string; name: string; w: number; l: number; pct: number; gb: string; wcgb: string; diff: number; streak: string; isMe: boolean }

export type SplitBar = { label: string; w: number; l: number; pct: number | null }

export type FormRow = { label: string; recent: number | null; season: number | null; recentLabel: string; higherIsBetter: boolean; fmt: 'rate3' | 'dec2' }

export type BattedBall = { label: string; team: number | null; league: number | null }

export type StyleTwin = { id: number; slug: string; abbr: string; name: string; w: number; l: number; similarity: number; shares: string | null }

export type TeamProfile = {
  season: number
  row: LeagueTeamRow
  pythag: { winPct: number; expectedW: number; expectedL: number; luck: number } | null
  headline: { best: { unit: string; metric: Metric }[]; worst: { unit: string; metric: Metric } | null }
  radar: RadarAxis[]
  ranks: { offense: Metric[]; rotation: Metric[]; bullpen: Metric[]; staff: Metric[]; defense: Metric[]; running: Metric[] }
  splitBars: SplitBar[]
  division: DivisionRow[]
  wildCard: DivisionRow[]
  form: FormRow[]
  battedBall: BattedBall[]
  platoon: { vsLhp: Metric; vsRhp: Metric; risp: Metric; pullLhb: { team: number | null; league: number | null }; pullRhb: { team: number | null; league: number | null } }
  oaa: { label: string; team: number | null; league: number | null }[]
  staffAdv: { rotation: Metric[]; bullpen: Metric[] }
  twins: StyleTwin[]
  distMetrics: { group: string; metric: Metric }[]
  precomputedAsOf: string | null
  story: SeasonStory | null
  roster: RosterProfile | null
}

const pctFromRank = (m: Metric): number => (m.rank == null || m.of < 2 ? 50 : Math.round(((m.of - m.rank) / (m.of - 1)) * 100))

const SPLIT_LABELS: [string, string][] = [
  ['home', 'Home'], ['away', 'Road'], ['day', 'Day'], ['night', 'Night'],
  ['left', 'vs LHP'], ['right', 'vs RHP'], ['oneRun', 'One-run games'], ['extraInning', 'Extra innings'],
  ['lastTen', 'Last 10'], ['winners', 'vs winning clubs'], ['grass', 'Grass'], ['turf', 'Turf'],
]

export async function getTeamProfile(teamId: number, season: number, todayET: string): Promise<TeamProfile | null> {
  const meta = MLB_TEAMS.find(t => t.id === teamId)
  if (!meta) return null

  const tables = await getLeagueTables(season)
  if (!tables) return null
  const row = tables.rows.find(r => r.id === teamId)
  if (!row) return null

  // Independent fan-out — each entry already handles its own failure.
  // ABS and the pitch mix are NOT loaded here: they are the slow pieces (a
  // 7,500-row log and a paginated league baseline), so the page streams them
  // separately via getTeamAbs / getTeamArsenal behind <Suspense>.
  const [story, roster, pre] = await Promise.all([
    getSeasonStory(teamId, season, tables),
    getRosterProfile(teamId, season, tables.cFIP),
    getPrecomputed(season).catch((e): Precomputed => { console.error('[getTeamProfile] precomputed', e); return { stats: [], defense: [], pull: [] } }),
  ])

  type Def = Parameters<typeof metric>[2]
  const F = fmt
  const M = (def: Def, id: number = teamId) => metric(tables, id, def)
  // Precomputed-table metrics (OAA / sprint speed) rank the same way, from Supabase rows.
  const P = {
    oaa: { key: 'oaa', label: 'Outs above avg', higherIsBetter: true, fmt: F.signed },
    ioaa: { key: 'ioaa', label: 'Infield OAA', higherIsBetter: true, fmt: F.signed },
    ooaa: { key: 'ooaa', label: 'Outfield OAA', higherIsBetter: true, fmt: F.signed },
    spd: { key: 'spd', label: 'Sprint speed (ft/s)', higherIsBetter: true, fmt: F.dec1 },
  }
  const oaaOf = (id: number) => metricFromValues(pre.defense.map(d => ({ id: d.id, v: d.oaa })), id, P.oaa)

  // League-table metric definitions — defined ONCE so a club's page and every
  // other club's "style twin" vector use identical math.
  const D: Record<string, Def> = {
    rpg: { key: 'rpg', label: 'Runs / game', higherIsBetter: true, fmt: F.dec2, get: r => r.hit?.rPerG ?? null },
    ops: { key: 'ops', label: 'OPS', higherIsBetter: true, fmt: F.rate3, get: r => r.hit?.ops ?? null },
    avg: { key: 'avg', label: 'Batting avg', higherIsBetter: true, fmt: F.rate3, get: r => r.hit?.avg ?? null },
    obp: { key: 'obp', label: 'On-base %', higherIsBetter: true, fmt: F.rate3, get: r => r.hit?.obp ?? null },
    iso: { key: 'iso', label: 'Isolated power', higherIsBetter: true, fmt: F.rate3, get: r => r.hit?.iso ?? null },
    hr: { key: 'hr', label: 'Home runs', higherIsBetter: true, fmt: F.int, get: r => r.hit?.hr ?? null },
    bb: { key: 'bb', label: 'Walk rate', higherIsBetter: true, fmt: F.pct1, get: r => r.hit?.bbPct ?? null },
    k: { key: 'k', label: 'Strikeout rate', higherIsBetter: false, fmt: F.pct1, get: r => r.hit?.kPct ?? null },
    risp: { key: 'risp', label: 'OPS w/ RISP', higherIsBetter: true, fmt: F.rate3, get: r => r.risp?.ops ?? null },
    spEra: { key: 'era', label: 'Starter ERA', higherIsBetter: false, fmt: F.dec2, get: r => r.sp?.era ?? null },
    spFip: { key: 'fip', label: 'Starter FIP', higherIsBetter: false, fmt: F.dec2, get: r => r.sp?.fip ?? null },
    spWhip: { key: 'whip', label: 'Starter WHIP', higherIsBetter: false, fmt: F.dec2, get: r => r.sp?.whip ?? null },
    spK: { key: 'k', label: 'Strikeout rate', higherIsBetter: true, fmt: F.pct1, get: r => r.sp?.kPct ?? null },
    spBb: { key: 'bb', label: 'Walk rate', higherIsBetter: false, fmt: F.pct1, get: r => r.sp?.bbPct ?? null },
    spHr9: { key: 'hr9', label: 'HR / 9', higherIsBetter: false, fmt: F.dec2, get: r => r.sp?.hr9 ?? null },
    spIp: { key: 'ipgs', label: 'Innings / start', higherIsBetter: true, fmt: F.dec1, get: r => r.sp?.ipPerGame ?? null },
    rpEra: { key: 'era', label: 'Bullpen ERA', higherIsBetter: false, fmt: F.dec2, get: r => r.rp?.era ?? null },
    rpFip: { key: 'fip', label: 'Bullpen FIP', higherIsBetter: false, fmt: F.dec2, get: r => r.rp?.fip ?? null },
    rpWhip: { key: 'whip', label: 'Bullpen WHIP', higherIsBetter: false, fmt: F.dec2, get: r => r.rp?.whip ?? null },
    rpK: { key: 'k', label: 'Strikeout rate', higherIsBetter: true, fmt: F.pct1, get: r => r.rp?.kPct ?? null },
    rpBb: { key: 'bb', label: 'Walk rate', higherIsBetter: false, fmt: F.pct1, get: r => r.rp?.bbPct ?? null },
    rpHr9: { key: 'hr9', label: 'HR / 9', higherIsBetter: false, fmt: F.dec2, get: r => r.rp?.hr9 ?? null },
    rpSv: { key: 'sv', label: 'Save conversion', higherIsBetter: true, fmt: F.pct1, get: r => r.rp?.savePct ?? null },
    stEra: { key: 'era', label: 'Staff ERA', higherIsBetter: false, fmt: F.dec2, get: r => r.pit?.era ?? null },
    stFip: { key: 'fip', label: 'Staff FIP', higherIsBetter: false, fmt: F.dec2, get: r => r.pit?.fip ?? null },
    stK: { key: 'k', label: 'Strikeout rate', higherIsBetter: true, fmt: F.pct1, get: r => r.pit?.kPct ?? null },
    stBb: { key: 'bb', label: 'Walk rate', higherIsBetter: false, fmt: F.pct1, get: r => r.pit?.bbPct ?? null },
    stHr9: { key: 'hr9', label: 'HR / 9', higherIsBetter: false, fmt: F.dec2, get: r => r.pit?.hr9 ?? null },
    stGo: { key: 'gbfb', label: 'Ground-out / air-out', higherIsBetter: true, fmt: F.dec2, get: r => r.pit?.gbFbRatio ?? null },
    fpct: { key: 'fpct', label: 'Fielding %', higherIsBetter: true, fmt: F.rate3, get: r => r.fld?.fpct ?? null },
    err: { key: 'err', label: 'Errors', higherIsBetter: false, fmt: F.int, get: r => r.fld?.errors ?? null },
    cs: { key: 'cs', label: 'Catcher CS %', higherIsBetter: true, fmt: F.rate3, get: r => r.fld?.csPct ?? null },
    sba: { key: 'sba', label: 'Steals allowed', higherIsBetter: false, fmt: F.int, get: r => r.fld?.sbAllowed ?? null },
    sb: { key: 'sb', label: 'Stolen bases', higherIsBetter: true, fmt: F.int, get: r => r.hit?.sb ?? null },
    sbp: { key: 'sbp', label: 'Steal success %', higherIsBetter: true, fmt: F.pct1, get: r => (r.hit && r.hit.sb + r.hit.cs > 0 ? r.hit.sb / (r.hit.sb + r.hit.cs) : null) },
    vl: { key: 'vl', label: 'OPS vs LHP', higherIsBetter: true, fmt: F.rate3, get: r => r.vl?.ops ?? null },
    vr: { key: 'vr', label: 'OPS vs RHP', higherIsBetter: true, fmt: F.rate3, get: r => r.vr?.ops ?? null },
    // Pro-only derived metrics
    spKbb: { key: 'kbb', label: 'K–BB %', higherIsBetter: true, fmt: F.pct1, get: r => (r.sp?.kPct != null && r.sp?.bbPct != null ? r.sp.kPct - r.sp.bbPct : null) },
    rpKbb: { key: 'kbb', label: 'K–BB %', higherIsBetter: true, fmt: F.pct1, get: r => (r.rp?.kPct != null && r.rp?.bbPct != null ? r.rp.kPct - r.rp.bbPct : null) },
    spGap: { key: 'gap', label: 'ERA minus FIP', higherIsBetter: false, fmt: (v: number) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)), get: r => (r.sp?.era != null && r.sp?.fip != null ? r.sp.era - r.sp.fip : null) },
    rpGap: { key: 'gap', label: 'ERA minus FIP', higherIsBetter: false, fmt: (v: number) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)), get: r => (r.rp?.era != null && r.rp?.fip != null ? r.rp.era - r.rp.fip : null) },
    spGo: { key: 'go', label: 'Ground-out / air-out', higherIsBetter: true, fmt: F.dec2, get: r => r.sp?.gbFbRatio ?? null },
    rpGo: { key: 'go', label: 'Ground-out / air-out', higherIsBetter: true, fmt: F.dec2, get: r => r.rp?.gbFbRatio ?? null },
    hrPerG: { key: 'hrg', label: 'HR / game', higherIsBetter: true, fmt: F.dec2, get: r => r.hit?.hrPerG ?? null },
  }
  const m = (k: string, id: number = teamId) => M(D[k], id)

  // ── ranks ──
  const offense = ['rpg', 'ops', 'avg', 'obp', 'iso', 'hr', 'bb', 'k', 'risp'].map(k => m(k))
  const rotation = ['spEra', 'spFip', 'spWhip', 'spK', 'spBb', 'spHr9', 'spIp'].map(k => m(k))
  const bullpen = ['rpEra', 'rpFip', 'rpWhip', 'rpK', 'rpBb', 'rpHr9', 'rpSv'].map(k => m(k))
  const staff = ['stEra', 'stFip', 'stK', 'stBb', 'stHr9', 'stGo'].map(k => m(k))
  const defense: Metric[] = [
    oaaOf(teamId),
    metricFromValues(pre.defense.map(d => ({ id: d.id, v: d.infield })), teamId, P.ioaa),
    metricFromValues(pre.defense.map(d => ({ id: d.id, v: d.outfield })), teamId, P.ooaa),
    ...['fpct', 'err', 'cs', 'sba'].map(k => m(k)),
  ]
  const spdOf = (id: number) => metricFromValues(pre.stats.map(s => ({ id: s.id, v: s.sprintSpeed })), id, P.spd)
  const running: Metric[] = [m('sb'), m('sbp'), spdOf(teamId)]

  // Pro: advanced pitching ranks
  const staffAdv = {
    rotation: ['spKbb', 'spGap', 'spGo'].map(k => m(k)),
    bullpen: ['rpKbb', 'rpGap', 'rpGo'].map(k => m(k)),
  }

  // ── headline: best / weakest unit (descriptive, from rank alone) ──
  const units: { unit: string; metric: Metric }[] = [
    { unit: 'Offense', metric: offense[0] }, { unit: 'Rotation', metric: rotation[0] },
    { unit: 'Bullpen', metric: bullpen[0] }, { unit: 'Defense', metric: defense[0] }, { unit: 'Running game', metric: running[0] },
  ].filter(u => u.metric.rank != null)
  const sorted = [...units].sort((a, b) => (a.metric.rank as number) - (b.metric.rank as number))
  const headline = { best: sorted.slice(0, 2), worst: sorted.length > 2 ? sorted[sorted.length - 1] : null }

  // ── radar (+ every club's vector, for "style twins") ──
  type AxisDef = { label: string; group: RadarAxis['group']; metricFor: (id: number) => Metric }
  const AXES: AxisDef[] = [
    { label: 'Run scoring', group: 'Offense', metricFor: id => m('rpg', id) },
    { label: 'Power', group: 'Offense', metricFor: id => m('iso', id) },
    { label: 'Patience', group: 'Offense', metricFor: id => m('bb', id) },
    { label: 'Contact', group: 'Offense', metricFor: id => m('k', id) },
    { label: 'With RISP', group: 'Offense', metricFor: id => m('risp', id) },
    { label: 'Running', group: 'Offense', metricFor: id => m('sb', id) },
    { label: 'Rotation', group: 'Pitching', metricFor: id => m('spEra', id) },
    { label: 'Bullpen', group: 'Pitching', metricFor: id => m('rpEra', id) },
    { label: 'Bat-missing', group: 'Pitching', metricFor: id => m('stK', id) },
    { label: 'Command', group: 'Pitching', metricFor: id => m('stBb', id) },
    { label: 'Range (OAA)', group: 'Defense', metricFor: id => oaaOf(id) },
    { label: 'Sure hands', group: 'Defense', metricFor: id => m('fpct', id) },
  ]
  const radar: RadarAxis[] = AXES.map(a => { const mm = a.metricFor(teamId); return { label: a.label, group: a.group, pct: pctFromRank(mm), rank: mm.rank, display: mm.display } })
  const vecOf = (id: number) => AXES.map(a => pctFromRank(a.metricFor(id)))
  const myVec = radar.map(a => a.pct)
  const twins: StyleTwin[] = tables.rows
    .filter(r => r.id !== teamId)
    .map(r => {
      const v = vecOf(r.id)
      const dist = Math.sqrt(v.reduce((acc, x, i) => acc + (x - myVec[i]) ** 2, 0))
      // the axis where the two clubs are closest AND both are strong = what they share
      const shared = AXES.map((a, i) => ({ label: a.label, both: Math.min(v[i], myVec[i]), gap: Math.abs(v[i] - myVec[i]) })).filter(x => x.gap <= 12).sort((a, b) => b.both - a.both)[0]
      return { id: r.id, slug: MLB_TEAMS.find(t => t.id === r.id)?.slug ?? '', abbr: r.abbr, name: r.name, w: r.st.w, l: r.st.l, similarity: Math.round(100 * (1 - dist / (Math.sqrt(AXES.length) * 100))), shares: shared && shared.both >= 60 ? shared.label : null }
    })
    .sort((a, b) => b.similarity - a.similarity).slice(0, 3)

  // ── Pro: where all 30 clubs sit on the headline metrics ──
  const distMetrics: { group: string; metric: Metric }[] = [
    ...['rpg', 'ops', 'iso', 'bb', 'k'].map(k => ({ group: 'Offense', metric: m(k) })),
    ...['spEra', 'spFip', 'spK'].map(k => ({ group: 'Rotation', metric: m(k) })),
    ...['rpEra', 'rpFip', 'rpK'].map(k => ({ group: 'Bullpen', metric: m(k) })),
    { group: 'Defense', metric: oaaOf(teamId) },
    { group: 'Running', metric: m('sb') },
  ]

  // ── pythagorean (exponent 1.83, the common baseball fit) ──
  const { rs, ra, gp, w } = row.st
  const pyW = rs > 0 && ra > 0 ? Math.pow(rs, 1.83) / (Math.pow(rs, 1.83) + Math.pow(ra, 1.83)) : null
  const pythag = pyW != null ? { winPct: pyW, expectedW: pyW * gp, expectedL: gp - pyW * gp, luck: w - pyW * gp } : null

  // ── record splits ──
  const splitBars: SplitBar[] = SPLIT_LABELS
    .map(([k, label]) => ({ k, label, s: row.st.splits[k] }))
    .filter(x => x.s && x.s.w + x.s.l > 0)
    .map(x => ({ label: x.label, w: x.s.w, l: x.s.l, pct: x.s.w / (x.s.w + x.s.l) }))

  // ── division + wild card ──
  const toDiv = (r: LeagueTeamRow): DivisionRow => ({ id: r.id, abbr: r.abbr, name: r.name, w: r.st.w, l: r.st.l, pct: r.st.pct, gb: r.st.gb, wcgb: r.st.wcgb, diff: r.st.diff, streak: r.st.streak, isMe: r.id === teamId })
  const division = tables.rows.filter(r => { const t = MLB_TEAMS.find(x => x.id === r.id); return t && t.league === meta.league && t.division === meta.division }).sort((a, b) => a.st.divRank - b.st.divRank).map(toDiv)
  const wildCard = tables.rows
    .filter(r => { const t = MLB_TEAMS.find(x => x.id === r.id); return t && t.league === meta.league && r.st.divRank !== 1 })
    .sort((a, b) => b.st.pct - a.st.pct).slice(0, 6).map(toDiv)

  // ── form (explicit windows only) ──
  const mine = pre.stats.find(s => s.id === teamId) ?? null
  const form: FormRow[] = mine ? [
    { label: 'OPS', recent: mine.opsL30, season: row.hit?.ops ?? null, recentLabel: 'L30', higherIsBetter: true, fmt: 'rate3' },
    { label: 'Runs / game', recent: mine.runsPerGameL30, season: row.hit?.rPerG ?? null, recentLabel: 'L30', higherIsBetter: true, fmt: 'dec2' },
    { label: 'HR / game', recent: mine.hrPerGameL30, season: row.hit?.hrPerG ?? null, recentLabel: 'L30', higherIsBetter: true, fmt: 'dec2' },
    { label: 'Bullpen ERA', recent: mine.bullpenEraL14, season: row.rp?.era ?? null, recentLabel: 'L14', higherIsBetter: false, fmt: 'dec2' },
    { label: 'Bullpen WHIP', recent: mine.bullpenWhipL14, season: row.rp?.whip ?? null, recentLabel: 'L14', higherIsBetter: false, fmt: 'dec2' },
  ] : []

  // ── batted-ball profile vs league average ──
  const avgOf = (pick: (s: (typeof pre.stats)[number]) => number | null) => {
    const v = pre.stats.map(pick).filter((x): x is number => x != null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  const battedBall: BattedBall[] = mine ? [
    { label: 'Ground ball', team: mine.gbPct, league: avgOf(s => s.gbPct) },
    { label: 'Line drive', team: mine.ldPct, league: avgOf(s => s.ldPct) },
    { label: 'Fly ball', team: mine.fbPct, league: avgOf(s => s.fbPct) },
    { label: 'Pop-up', team: mine.popupPct, league: avgOf(s => s.popupPct) },
  ] : []

  const myPull = pre.pull.find(p => p.id === teamId)
  const avgPull = (pick: (p: (typeof pre.pull)[number]) => number | null) => {
    const v = pre.pull.map(pick).filter((x): x is number => x != null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  const platoon = {
    vsLhp: m('vl'),
    vsRhp: m('vr'),
    risp: offense[8],
    pullLhb: { team: myPull?.pullLhb ?? null, league: avgPull(p => p.pullLhb) },
    pullRhb: { team: myPull?.pullRhb ?? null, league: avgPull(p => p.pullRhb) },
  }

  const myDef = pre.defense.find(d => d.id === teamId)
  const avgDef = (pick: (d: (typeof pre.defense)[number]) => number | null) => {
    const v = pre.defense.map(pick).filter((x): x is number => x != null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  const oaa = myDef ? [
    { label: 'Infield', team: myDef.infield, league: avgDef(d => d.infield) },
    { label: 'Outfield', team: myDef.outfield, league: avgDef(d => d.outfield) },
    { label: 'Left field', team: myDef.lf, league: avgDef(d => d.lf) },
    { label: 'Center field', team: myDef.cf, league: avgDef(d => d.cf) },
    { label: 'Right field', team: myDef.rf, league: avgDef(d => d.rf) },
  ] : []

  return {
    season, row, pythag, headline, radar,
    ranks: { offense, rotation, bullpen, staff, defense, running },
    splitBars, division, wildCard, form, battedBall, platoon, oaa, staffAdv, twins, distMetrics,
    precomputedAsOf: [mine?.updatedAt, myDef?.updatedAt].filter(Boolean).sort().pop() ?? null,
    story, roster,
  }
}

/** Slow piece #1 — ABS challenge record (same module the Scout Report uses). */
export async function getTeamAbs(teamId: number, todayET: string): Promise<AbsClub | null> {
  const abbr = MLB_TEAMS.find(t => t.id === teamId)?.abbrev
  if (!abbr) return null
  try {
    return await getAbsDesk(teamId, abbr, todayET)
  } catch (err) {
    console.error('[getTeamAbs]', err instanceof Error ? err.message : err)
    return null
  }
}

/** Slow piece #2 — what the current staff throws (pitch_arsenals, league baseline paginated). */
export async function getTeamArsenal(pitcherIds: number[], season: number): Promise<StaffArsenal | null> {
  try {
    return await getStaffArsenal(pitcherIds, season)
  } catch (err) {
    console.error('[getTeamArsenal]', err instanceof Error ? err.message : err)
    return null
  }
}

export type { LeagueTables }
