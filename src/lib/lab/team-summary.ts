// src/lib/lab/team-summary.ts
//
// Client-safe shapes + helpers shared by the Lab pages: one club for one role
// (all / starters / bullpen), and the flat metric catalog the chart builder
// draws from. Type-only imports from the fetch module, so no server code ships.

import type { Outcomes, PitchRow, PitcherArm, Role, TeamMakeup, TeamRunsByRole } from '@/lib/lab/team-pitch-makeup.server-fetch-allowed'
import type { Team } from '@/lib/teams'

export type TeamSummary = {
  teamId: number; abbrev: string; name: string; short: string; color: string
  pitches: number
  pitcherArms: PitcherArm[]
  armAngleSdPitch: number | null; armAngleLow: number | null; armAngleHigh: number | null
  releaseSpreadIn: number | null
  ra9: number | null; era: number | null; runsAllowed: number | null; ip: number | null
  outcomes: Outcomes
  szTop: number | null; szBot: number | null
  rows: PitchRow[]
}

export const ROLE_LABEL: Record<Role, string> = { all: 'All pitchers', sp: 'Starters', rp: 'Bullpen' }

export function summarize(team: Team, m: TeamMakeup, role: Role, runs?: TeamRunsByRole): TeamSummary {
  const r = m.roles[role]
  const rr = runs?.[role] ?? null
  return {
    teamId: team.id, abbrev: team.abbrev, name: team.name, short: team.short, color: team.primary_color,
    pitches: r.pitches, pitcherArms: r.pitcherArms, armAngleSdPitch: r.armAngleSdPitch,
    armAngleLow: r.armAngleLow, armAngleHigh: r.armAngleHigh, releaseSpreadIn: r.releaseSpreadIn,
    ra9: rr?.ra9 ?? null, era: rr?.era ?? null, runsAllowed: rr?.runsAllowed ?? null, ip: rr ? Math.round(rr.ip * 10) / 10 : null,
    outcomes: r.outcomes, szTop: r.szTop, szBot: r.szBot, rows: r.rows,
  }
}

// ─── metric catalog ───────────────────────────────────────────────────────

export type MetricDef = { key: string; label: string; group: string; unit: string; decimals: number; get: (t: TeamSummary) => number | null }

const TYPES: [string, string][] = [['FF', '4-seam'], ['SI', 'Sinker'], ['FC', 'Cutter'], ['SL', 'Slider'], ['ST', 'Sweeper'], ['CU', 'Curveball'], ['CH', 'Changeup'], ['FS', 'Splitter']]
const row = (t: TeamSummary, ty: string) => t.rows.find(r => r.pitchType === ty)
const share = (t: TeamSummary, types: string[]) => (t.pitches ? Math.round(t.rows.filter(r => types.includes(r.pitchType)).reduce((s, r) => s + r.usagePct, 0) * 10) / 10 : null)

export const METRICS: MetricDef[] = (() => {
  const m: MetricDef[] = [
    { key: 'ra9', label: 'Runs allowed per 9', group: 'Results', unit: '', decimals: 2, get: t => t.ra9 },
    { key: 'era', label: 'ERA', group: 'Results', unit: '', decimals: 2, get: t => t.era },
    { key: 'runs', label: 'Runs allowed', group: 'Results', unit: '', decimals: 0, get: t => t.runsAllowed },
    { key: 'ip', label: 'Innings pitched', group: 'Results', unit: '', decimals: 1, get: t => t.ip },
    { key: 'xwoba', label: 'xwOBA against (quality of contact + K/BB)', group: 'Outcomes', unit: '', decimals: 3, get: t => t.outcomes.xwoba },
    { key: 'whiff', label: 'Whiff % (per swing)', group: 'Outcomes', unit: '%', decimals: 1, get: t => t.outcomes.whiffPct },
    { key: 'csw', label: 'Called + swinging strikes %', group: 'Outcomes', unit: '%', decimals: 1, get: t => t.outcomes.cswPct },
    { key: 'chase', label: 'Chase % (swings outside zone)', group: 'Outcomes', unit: '%', decimals: 1, get: t => t.outcomes.chasePct },
    { key: 'zone', label: 'Zone %', group: 'Outcomes', unit: '%', decimals: 1, get: t => t.outcomes.zonePct },
    { key: 'kpct', label: 'Strikeout % (of batters faced)', group: 'Outcomes', unit: '%', decimals: 1, get: t => t.outcomes.kPct },
    { key: 'bbpct', label: 'Walk % (of batters faced)', group: 'Outcomes', unit: '%', decimals: 1, get: t => t.outcomes.bbPct },
    { key: 'hardhit', label: 'Hard-hit % (95+ mph)', group: 'Outcomes', unit: '%', decimals: 1, get: t => t.outcomes.hardHitPct },
    { key: 'barrel', label: 'Barrel %', group: 'Outcomes', unit: '%', decimals: 1, get: t => t.outcomes.barrelPct },
    { key: 'ev', label: 'Average exit velocity against', group: 'Outcomes', unit: ' mph', decimals: 1, get: t => t.outcomes.avgEv },
    { key: 'pitches', label: 'Tracked pitches', group: 'Staff', unit: '', decimals: 0, get: t => t.pitches },
    { key: 'pitchers', label: 'Pitchers with 100+ pitches', group: 'Staff', unit: '', decimals: 0, get: t => (t.pitcherArms.length ? t.pitcherArms.length : null) },
    { key: 'relVar', label: 'Release-point variation', group: 'Variation', unit: '″', decimals: 1, get: t => t.releaseSpreadIn },
    { key: 'aaSd', label: 'Arm-angle variation (SD)', group: 'Variation', unit: '°', decimals: 1, get: t => t.armAngleSdPitch },
    { key: 'aaRange', label: 'Arm-angle width (high − low)', group: 'Variation', unit: '°', decimals: 0, get: t => (t.armAngleHigh != null && t.armAngleLow != null ? t.armAngleHigh - t.armAngleLow : null) },
    { key: 'aaLow', label: 'Lowest pitcher arm angle', group: 'Variation', unit: '°', decimals: 1, get: t => t.armAngleLow },
    { key: 'aaHigh', label: 'Highest pitcher arm angle', group: 'Variation', unit: '°', decimals: 1, get: t => t.armAngleHigh },
    { key: 'fbShare', label: 'Fastball share (4-seam, sinker, cutter)', group: 'Mix', unit: '%', decimals: 1, get: t => share(t, ['FF', 'SI', 'FC']) },
    { key: 'brkShare', label: 'Breaking-ball share', group: 'Mix', unit: '%', decimals: 1, get: t => share(t, ['SL', 'ST', 'SV', 'CU', 'KC', 'CS']) },
    { key: 'offShare', label: 'Offspeed share (change, splitter)', group: 'Mix', unit: '%', decimals: 1, get: t => share(t, ['CH', 'FS', 'FO']) },
  ]
  for (const [ty, name] of TYPES) {
    m.push(
      { key: `use_${ty}`, label: `${name} usage`, group: 'Mix', unit: '%', decimals: 1, get: t => row(t, ty)?.usagePct ?? null },
      { key: `whiff_${ty}`, label: `${name} whiff %`, group: 'Outcomes', unit: '%', decimals: 1, get: t => row(t, ty)?.whiffPct ?? null },
      { key: `velo_${ty}`, label: `${name} velocity`, group: 'Velocity', unit: ' mph', decimals: 1, get: t => row(t, ty)?.veloAvg ?? null },
      { key: `veloRange_${ty}`, label: `${name} velocity range (middle 80%)`, group: 'Velocity', unit: ' mph', decimals: 1, get: t => { const r = row(t, ty); return r?.veloP10 != null && r.veloP90 != null ? Math.round((r.veloP90 - r.veloP10) * 10) / 10 : null } },
      { key: `hb_${ty}`, label: `${name} arm-side break`, group: 'Movement', unit: '″', decimals: 1, get: t => row(t, ty)?.hBreak ?? null },
      { key: `vb_${ty}`, label: `${name} induced vertical break`, group: 'Movement', unit: '″', decimals: 1, get: t => row(t, ty)?.vBreak ?? null },
      { key: `relSide_${ty}`, label: `${name} release-side variation`, group: 'Variation', unit: '″', decimals: 1, get: t => row(t, ty)?.relSideSdIn ?? null },
      { key: `relHt_${ty}`, label: `${name} release-height variation`, group: 'Variation', unit: '″', decimals: 1, get: t => row(t, ty)?.relHeightSdIn ?? null },
    )
  }
  return m
})()

export const METRIC_BY_KEY = new Map(METRICS.map(m => [m.key, m]))
export const fmt = (m: MetricDef, v: number | null) => (v == null ? '—' : `${v.toFixed(m.decimals)}${m.unit}`)

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2 }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy)
}
export function linearFit(xs: number[], ys: number[]): { slope: number; intercept: number } | null {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  if (sxx === 0) return null
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx
  return { slope, intercept: my - slope * mx }
}
