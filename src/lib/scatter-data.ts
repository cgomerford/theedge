// src/lib/scatter-data.ts
//
// The player tables behind the admin scatter builder (/admin/scatter). Each is one public Baseball Savant leaderboard CSV, read on demand from the
// admin route (never a public page) and cached for an hour; the files are small (under 100 KB). Every numeric column becomes a choosable stat.
// Nothing is stored. Empty cells stay null, so a player is simply left off a chart that needs the missing stat.

import { parseCsv } from '@/components/admin/story-v5/csv'
import { logOnce } from '@/lib/log'
import { decimalsFor, displayName, type ScatterColumn, type ScatterDataset, type ScatterRow } from '@/lib/graphics/scatter'

type Source = { url: (y: number) => string; name: string; id: string; team?: string; derive?: (r: Record<string, string>) => Record<string, number> }

const SAVANT = 'https://baseballsavant.mlb.com/leaderboard'
const SOURCES: Record<string, Source> = {
  frv: { url: y => `${SAVANT}/fielding-run-value?type=fielder&seasonStart=${y}&seasonEnd=${y}&minInnings=1&csv=true`, name: 'name', id: 'id', derive: r => ({ innings: Math.round((Number(r.outs_total) / 3) * 10) / 10 }) },
  oaa: { url: y => `${SAVANT}/outs_above_average?type=Fielder&startYear=${y}&endYear=${y}&split=no&team=&range=year&min=1&pos=&roles=&viz=hide&csv=true`, name: 'last_name, first_name', id: 'player_id', team: 'display_team_name' },
  arm: { url: y => `${SAVANT}/arm-strength?type=player&year=${y}&minThrows=50&csv=true`, name: 'fielder_name', id: 'player_id' },
  'xstats-bat': { url: y => `${SAVANT}/expected_statistics?type=batter&year=${y}&position=&team=&min=1&csv=true`, name: 'last_name, first_name', id: 'player_id' },
  'xstats-pit': { url: y => `${SAVANT}/expected_statistics?type=pitcher&year=${y}&position=&team=&min=1&csv=true`, name: 'last_name, first_name', id: 'player_id' },
  'statcast-bat': { url: y => `${SAVANT}/statcast?type=batter&year=${y}&position=&team=&min=1&csv=true`, name: 'last_name, first_name', id: 'player_id' },
  'statcast-pit': { url: y => `${SAVANT}/statcast?type=pitcher&year=${y}&position=&team=&min=1&csv=true`, name: 'last_name, first_name', id: 'player_id' },
  sprint: { url: y => `${SAVANT}/sprint_speed?year=${y}&position=&team=&min=10&csv=true`, name: 'last_name, first_name', id: 'player_id', team: 'team' },
  'bat-tracking': { url: y => `${SAVANT}/bat-tracking?attackZone=&batSide=&contactType=&count=&dateStart=${y}-02-01&dateEnd=${y}-11-30&gameType=&isHardHit=&minSwings=1&minGroupSwings=1&pitchHand=&pitchType=&seasonStart=${y}&seasonEnd=${y}&team=&type=batter&csv=true`, name: 'name', id: 'id' },
}

const NOT_STATS = new Set(['id', 'player_id', 'entity_id', 'year', 'team_id', 'age', 'primary_pos', 'primary_position', 'fielder_id'])

/** Plain-English names for the columns people chart. Anything not listed gets its header with underscores turned into spaces. */
const LABELS: Record<string, string> = {
  total_runs: 'Fielding runs (FRV)', inf_of_runs: 'Infield/outfield runs', range_runs: 'Range runs', arm_runs: 'Arm runs', dp_runs: 'Double-play runs', catching_runs: 'Catching runs',
  framing_runs: 'Framing runs', throwing_runs: 'Throwing runs', blocking_runs: 'Blocking runs', abs_runs: 'Challenge-system runs', outs_total: 'Outs played', innings: 'Innings played',
  fielding_runs_prevented_on_rec1b: 'First-base receiving runs',
  outs_above_average: 'Outs above average (OAA)', fielding_runs_prevented: 'Fielding runs prevented', outs_above_average_infront: 'OAA in front', outs_above_average_lateral_toward3bline: 'OAA toward third base',
  outs_above_average_lateral_toward1bline: 'OAA toward first base', outs_above_average_behind: 'OAA behind', outs_above_average_rhh: 'OAA vs right-handed hitters', outs_above_average_lhh: 'OAA vs left-handed hitters',
  actual_success_rate_formatted: 'Success rate on plays (%)', adj_estimated_success_rate_formatted: 'Expected success rate (%)', diff_success_rate_formatted: 'Success rate vs expected (%)',
  arm_overall: 'Arm strength (mph)', max_arm_strength: 'Hardest throw (mph)', total_throws: 'Throws',
  pa: 'Plate appearances', bip: 'Balls in play', ba: 'BA', est_ba: 'xBA', est_ba_minus_ba_diff: 'xBA minus BA', slg: 'SLG', est_slg: 'xSLG', est_slg_minus_slg_diff: 'xSLG minus SLG',
  woba: 'wOBA', est_woba: 'xwOBA', est_woba_minus_woba_diff: 'xwOBA minus wOBA', era: 'ERA', xera: 'xERA', era_minus_xera_diff: 'ERA minus xERA',
  avg_hit_angle: 'Average launch angle', anglesweetspotpercent: 'Sweet-spot%', max_hit_speed: 'Max exit velocity (mph)', avg_hit_speed: 'Average exit velocity (mph)', ev50: 'EV50 (mph)',
  fbld: 'Fly-ball/line-drive exit velocity (mph)', gb: 'Ground-ball exit velocity (mph)', max_distance: 'Max distance (ft)', avg_distance: 'Average distance (ft)', avg_hr_distance: 'Average home run distance (ft)',
  ev95plus: 'Hard-hit balls', ev95percent: 'Hard-hit%', barrels: 'Barrels', brl_percent: 'Barrel%', brl_pa: 'Barrels per PA (%)', attempts: 'Batted balls',
  sprint_speed: 'Sprint speed (ft/s)', hp_to_1b: 'Home to first (s)', bolts: 'Bolts', competitive_runs: 'Competitive runs',
  avg_bat_speed: 'Bat speed (mph)', hard_swing_rate: 'Hard-swing rate', squared_up_per_bat_contact: 'Squared-up% of contact', squared_up_per_swing: 'Squared-up% of swings', blast_per_bat_contact: 'Blast% of contact',
  blast_per_swing: 'Blast% of swings', swing_length: 'Swing length (ft)', swords: 'Swords', batter_run_value: 'Batter runs', whiffs: 'Whiffs', whiff_per_swing: 'Whiff%', swings_competitive: 'Competitive swings',
  percent_swings_competitive: 'Competitive swings (%)', contact: 'Contacts', batted_ball_events: 'Batted-ball events', batted_ball_event_per_swing: 'Batted-ball events per swing',
}
const prettify = (k: string) => { const t = k.replace(/_/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1) }

const num = (s: string | undefined): number | null => {
  if (s == null) return null
  const t = s.trim().replace(/%$/, '')
  if (t === '') return null
  const x = Number(t)
  return Number.isFinite(x) ? x : null
}

export async function getScatterDataset(id: string, season: number): Promise<ScatterDataset | null> {
  const src = SOURCES[id]
  if (!src) return null
  try {
    const res = await fetch(src.url(season), { next: { revalidate: 3600 }, signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', Accept: 'text/csv,*/*' } })
    if (!res.ok) { logOnce(`scatter:${id}:${res.status}`, 'scatter-data', `${id} HTTP ${res.status}`); return null }
    const raw = parseCsv(await res.text())
    if (!raw.length) return null
    const head = Object.keys(raw[0])
    const derived = src.derive ? raw.map(r => src.derive!(r)) : []
    const keys = head.filter(h => h !== src.name && !NOT_STATS.has(h) && h !== src.team)
    const stat = [...keys, ...(derived[0] ? Object.keys(derived[0]) : [])].filter(k => {
      const vals = raw.map((r, i) => (k in (derived[i] ?? {}) ? derived[i][k] : num(r[k]))).filter((v): v is number => v != null && Number.isFinite(v))
      return vals.length >= Math.max(10, raw.length * 0.3)
    })
    const rows: ScatterRow[] = raw.map((r, i) => {
      const v: Record<string, number | null> = {}
      for (const k of stat) v[k] = k in (derived[i] ?? {}) ? derived[i][k] : num(r[k])
      return { id: num(r[src.id]), name: displayName(r[src.name] ?? ''), team: src.team ? r[src.team] || undefined : undefined, v }
    }).filter(r => r.name)
    const columns: ScatterColumn[] = stat.map(k => ({ key: k, label: LABELS[k] ?? prettify(k), decimals: decimalsFor(rows.map(r => r.v[k]).filter((x): x is number => x != null)) }))
    return { id, label: id, columns, rows }
  } catch (e) {
    logOnce(`scatter:${id}:threw`, 'scatter-data', `${id} fetch failed`, e)
    return null
  }
}
