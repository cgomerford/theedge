// src/lib/scatter-data.ts
//
// The tables behind the admin chart builder (/admin/charts). Each is one public Baseball Savant leaderboard CSV or MLB Stats API call, read on demand from
// the admin route (never a public page) and cached for an hour. Every numeric column becomes a choosable stat; text columns (team, league, position,
// pitch name) become groups. Nothing is stored. Empty cells stay null, so a player is left off a chart that needs the missing stat.
// Savant tables carry no team, so each player is matched by MLB id to the MLB roster table for team, league, division and position.

import { parseCsv } from '@/components/admin/story-v5/csv'
import { logOnce } from '@/lib/log'
import { MLB_TEAMS, findTeamByName } from '@/lib/teams'
import { getDrs, type DrsRow } from '@/lib/fielding-bible'
import { decimalsFor, displayName, nameKey, type CatColumn, type ScatterColumn, type ScatterDataset, type ScatterRow } from '@/lib/graphics/scatter'

type Raw = Record<string, string>
type Source = { url: (y: number) => string; name: string; id: string; derive?: (r: Raw) => Record<string, number>; pct?: boolean }

const SAVANT = 'https://baseballsavant.mlb.com/leaderboard'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const BAT_SEL = 'player_age,ab,pa,hit,single,double,triple,home_run,strikeout,walk,k_percent,bb_percent,batting_avg,slg_percent,on_base_percent,on_base_plus_slg,isolated_power,babip,b_rbi,r_total_stolen_base,xba,xslg,woba,xwoba,xobp,xiso,exit_velocity_avg,launch_angle_avg,sweet_spot_percent,barrel_batted_rate,hard_hit_percent,avg_best_speed,avg_hyper_speed,whiff_percent,swing_percent,oz_swing_percent,oz_swing_miss_percent,iz_contact_percent,z_swing_percent,oz_contact_percent,pull_percent,straightaway_percent,opposite_percent,groundballs_percent,flyballs_percent,linedrives_percent,popups_percent,sprint_speed,n_outs_above_average,swing_miss_percent,in_zone_percent,edge_percent,f_strike_percent'
const PIT_SEL = 'player_age,p_game,p_formatted_ip,pa,p_win,p_loss,p_save,p_hold,p_quality_start,p_era,p_opp_batting_avg,p_opp_on_base_avg,p_opp_slg,p_opp_ops,xba,xslg,woba,xwoba,xobp,xiso,xera,p_k_percent,p_bb_percent,whiff_percent,swing_percent,oz_swing_percent,oz_swing_miss_percent,z_swing_percent,iz_contact_percent,oz_contact_percent,in_zone_percent,edge_percent,f_strike_percent,exit_velocity_avg,launch_angle_avg,sweet_spot_percent,barrel_batted_rate,hard_hit_percent,groundballs_percent,flyballs_percent,linedrives_percent,popups_percent,pull_percent,opposite_percent,p_run,p_earned_run,p_home_run,p_strikeout,p_walk,p_hit,babip,p_total_pitches,p_wild_pitch,p_balk,p_pickoff,p_stolen_base,p_caught_stealing_2b,pitcher_run_exp,ff_avg_speed,ff_avg_spin,ff_avg_break_x,ff_avg_break_z,sl_avg_speed,cu_avg_speed,ch_avg_speed,release_extension,arm_angle,avg_best_speed'
const custom = (type: 'batter' | 'pitcher', sel: string) => (y: number) => `${SAVANT}/custom?year=${y}&type=${type}&filter=&min=1&selections=${sel}&chart=false&x=xba&y=xba&r=no&chartType=beeswarm&csv=true`

const SOURCES: Record<string, Source> = {
  'bat-all': { url: custom('batter', BAT_SEL), name: 'last_name, first_name', id: 'player_id' },
  'pit-all': { url: custom('pitcher', PIT_SEL), name: 'last_name, first_name', id: 'player_id' },
  'bat-pct': { url: y => `${SAVANT}/percentile-rankings?type=batter&year=${y}&position=&team=&csv=true`, name: 'player_name', id: 'player_id', pct: true },
  'pit-pct': { url: y => `${SAVANT}/percentile-rankings?type=pitcher&year=${y}&position=&team=&csv=true`, name: 'player_name', id: 'player_id', pct: true },
  frv: { url: y => `${SAVANT}/fielding-run-value?type=fielder&seasonStart=${y}&seasonEnd=${y}&minInnings=1&csv=true`, name: 'name', id: 'id', derive: r => ({ innings: Math.round((Number(r.outs_total) / 3) * 10) / 10 }) },
  oaa: { url: y => `${SAVANT}/outs_above_average?type=Fielder&startYear=${y}&endYear=${y}&split=no&team=&range=year&min=1&pos=&roles=&viz=hide&csv=true`, name: 'last_name, first_name', id: 'player_id' },
  arm: { url: y => `${SAVANT}/arm-strength?type=player&year=${y}&minThrows=50&csv=true`, name: 'fielder_name', id: 'player_id' },
  framing: { url: y => `${SAVANT}/catcher-framing?year=${y}&team=&min=q&type=catcher&csv=true`, name: 'name', id: 'id' },
  poptime: { url: y => `${SAVANT}/poptime?year=${y}&team=&min2b=1&min3b=0&pos=&sort=2&sortDir=asc&csv=true`, name: 'entity_name', id: 'entity_id' },
  'xstats-bat': { url: y => `${SAVANT}/expected_statistics?type=batter&year=${y}&position=&team=&min=1&csv=true`, name: 'last_name, first_name', id: 'player_id' },
  'xstats-pit': { url: y => `${SAVANT}/expected_statistics?type=pitcher&year=${y}&position=&team=&min=1&csv=true`, name: 'last_name, first_name', id: 'player_id' },
  'statcast-bat': { url: y => `${SAVANT}/statcast?type=batter&year=${y}&position=&team=&min=1&csv=true`, name: 'last_name, first_name', id: 'player_id' },
  'statcast-pit': { url: y => `${SAVANT}/statcast?type=pitcher&year=${y}&position=&team=&min=1&csv=true`, name: 'last_name, first_name', id: 'player_id' },
  sprint: { url: y => `${SAVANT}/sprint_speed?year=${y}&position=&team=&min=10&csv=true`, name: 'last_name, first_name', id: 'player_id' },
  'bat-tracking': { url: y => `${SAVANT}/bat-tracking?attackZone=&batSide=&contactType=&count=&dateStart=${y}-02-01&dateEnd=${y}-11-30&gameType=&isHardHit=&minSwings=1&minGroupSwings=1&pitchHand=&pitchType=&seasonStart=${y}&seasonEnd=${y}&team=&type=batter&csv=true`, name: 'name', id: 'id' },
  baserun: { url: y => `${SAVANT}/baserunning-run-value?year=${y}&type=batter&min=1&csv=true`, name: 'entity_name', id: 'player_id' },
  'pit-speeds': { url: y => `${SAVANT}/pitch-arsenals?year=${y}&min=10&type=avg_speed&hand=&csv=true`, name: 'last_name, first_name', id: 'pitcher' },
  'pit-arsenal': { url: y => `${SAVANT}/pitch-arsenal-stats?type=pitcher&pitchType=&year=${y}&team=&min=1&csv=true`, name: 'last_name, first_name', id: 'player_id' },
}

const NOT_STATS = new Set(['id', 'player_id', 'entity_id', 'pitcher', 'year', 'start_year', 'end_year', 'team_id', 'primary_pos', 'primary_position', 'fielder_id', 'primary_position_name'])
/** Savant columns that are text but belong to the row, not to a stat. They become groups. */
const CAT_LABELS: Record<string, string> = { team: 'Team', league: 'League', division: 'Division', position: 'Position', pitch_name: 'Pitch', pitch_type: 'Pitch code', team_name_alt: 'Team', team_name: 'Team', display_team_name: 'Team', primary_pos_formatted: 'Position', pitch_hand: 'Throws', primary_position_name: 'Position name' }

/** Plain-English names for the columns people chart. Anything not listed gets its header with underscores or camel case turned into words. */
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
  // custom leaderboard
  player_age: 'Age', ab: 'At-bats', hit: 'Hits', single: 'Singles', double: 'Doubles', triple: 'Triples', home_run: 'Home runs', strikeout: 'Strikeouts', walk: 'Walks', k_percent: 'K%', bb_percent: 'BB%',
  batting_avg: 'AVG', slg_percent: 'SLG', on_base_percent: 'OBP', on_base_plus_slg: 'OPS', isolated_power: 'ISO', b_rbi: 'RBI', r_total_stolen_base: 'Stolen bases', xobp: 'xOBP', xiso: 'xISO',
  exit_velocity_avg: 'Average exit velocity (mph)', launch_angle_avg: 'Average launch angle', sweet_spot_percent: 'Sweet-spot%', barrel_batted_rate: 'Barrel%', hard_hit_percent: 'Hard-hit%',
  avg_best_speed: 'Best-swings bat speed (mph)', avg_hyper_speed: 'Fastest-swings bat speed (mph)', whiff_percent: 'Whiff%', swing_percent: 'Swing%', oz_swing_percent: 'Chase%', oz_swing_miss_percent: 'Chase miss%',
  iz_contact_percent: 'In-zone contact%', z_swing_percent: 'Zone swing%', oz_contact_percent: 'Chase contact%', pull_percent: 'Pull%', straightaway_percent: 'Straightaway%', opposite_percent: 'Opposite-field%',
  groundballs_percent: 'Ground-ball%', flyballs_percent: 'Fly-ball%', linedrives_percent: 'Line-drive%', popups_percent: 'Pop-up%', n_outs_above_average: 'Outs above average (OAA)', swing_miss_percent: 'Swing-and-miss%',
  in_zone_percent: 'Zone%', edge_percent: 'Edge%', f_strike_percent: 'First-pitch strike%',
  p_game: 'Games', p_formatted_ip: 'Innings pitched', p_win: 'Wins', p_loss: 'Losses', p_save: 'Saves', p_hold: 'Holds', p_quality_start: 'Quality starts', p_era: 'ERA', p_opp_batting_avg: 'Opponent AVG',
  p_opp_on_base_avg: 'Opponent OBP', p_opp_slg: 'Opponent SLG', p_opp_ops: 'Opponent OPS', p_k_percent: 'K%', p_bb_percent: 'BB%', p_run: 'Runs allowed', p_earned_run: 'Earned runs', p_home_run: 'Home runs allowed',
  p_strikeout: 'Strikeouts', p_walk: 'Walks', p_hit: 'Hits allowed', p_total_pitches: 'Pitches', p_wild_pitch: 'Wild pitches', p_balk: 'Balks', p_pickoff: 'Pickoffs', p_stolen_base: 'Stolen bases allowed',
  p_caught_stealing_2b: 'Caught stealing at second', pitcher_run_exp: 'Pitcher runs', ff_avg_speed: 'Four-seam speed (mph)', ff_avg_spin: 'Four-seam spin (rpm)', ff_avg_break_x: 'Four-seam horizontal break (in)',
  ff_avg_break_z: 'Four-seam vertical break (in)', sl_avg_speed: 'Slider speed (mph)', cu_avg_speed: 'Curveball speed (mph)', ch_avg_speed: 'Changeup speed (mph)', si_avg_speed: 'Sinker speed (mph)', fc_avg_speed: 'Cutter speed (mph)',
  fs_avg_speed: 'Splitter speed (mph)', kn_avg_speed: 'Knuckleball speed (mph)', st_avg_speed: 'Sweeper speed (mph)', sv_avg_speed: 'Slurve speed (mph)', release_extension: 'Extension (ft)', arm_angle: 'Arm angle (°)',
  // Defensive Runs Saved, from The Fielding Bible (Sports Info Solutions)
  drs: 'DRS (runs saved)', drs_part: 'DRS: range and positioning', drs_sb: 'DRS: stolen bases', drs_bunts: 'DRS: bunts', drs_gfp: 'DRS: good plays and misplays', drs_adj_er: 'DRS: adjusted earned runs saved',
  drs_strike_zone: 'DRS: strike zone (framing)', drs_gdp: 'DRS: double plays', drs_of_arm: 'DRS: outfield arm', drs_innings: 'Innings (Fielding Bible)',
  // percentile table
  xwoba: 'xwOBA', xba: 'xBA', xslg: 'xSLG', brl: 'Barrels', exit_velocity: 'Exit velocity', max_ev: 'Max exit velocity', chase_percent: 'Chase%', arm_strength: 'Arm strength', oaa: 'Outs above average (OAA)',
  bat_speed: 'Bat speed', squared_up_rate: 'Squared-up%', swing_length_pct: 'Swing length',
  // pitch arsenal
  run_value_per_100: 'Runs per 100 pitches', run_value: 'Runs', pitches: 'Pitches', pitch_usage: 'Usage%', put_away: 'Put-away%',
  // baserunning
  runner_runs_tot: 'Baserunning runs', runner_runs_XB: 'Extra-base runs', runner_runs_SBX: 'Stolen-base runs', N_runner_moved: 'Times moved up',
  // MLB Stats API
  gamesPlayed: 'Games', gamesStarted: 'Games started', atBats: 'At-bats', plateAppearances: 'Plate appearances', avg: 'AVG', obp: 'OBP', ops: 'OPS', homeRuns: 'Home runs', strikeOuts: 'Strikeouts', baseOnBalls: 'Walks',
  intentionalWalks: 'Intentional walks', hitByPitch: 'Hit by pitch', rbi: 'RBI', stolenBases: 'Stolen bases', caughtStealing: 'Caught stealing', stolenBasePercentage: 'Stolen-base%', totalBases: 'Total bases',
  groundIntoDoublePlay: 'Double plays hit into', leftOnBase: 'Left on base', sacBunts: 'Sacrifice bunts', sacFlies: 'Sacrifice flies', groundOutsToAirouts: 'Ground-outs to air-outs', atBatsPerHomeRun: 'At-bats per home run',
  numberOfPitches: 'Pitches', inningsPitched: 'Innings pitched', whip: 'WHIP', strikeoutsPer9Inn: 'K per 9', walksPer9Inn: 'BB per 9', hitsPer9Inn: 'Hits per 9', homeRunsPer9: 'HR per 9', strikeoutWalkRatio: 'K/BB',
  winPercentage: 'Win%', pitchesPerInning: 'Pitches per inning', strikePercentage: 'Strike%', earnedRuns: 'Earned runs', saveOpportunities: 'Save chances', blownSaves: 'Blown saves', battersFaced: 'Batters faced',
  fielding: 'Fielding%', chances: 'Chances', assists: 'Assists', putOuts: 'Putouts', errors: 'Errors', doublePlays: 'Double plays', passedBall: 'Passed balls', rangeFactorPerGame: 'Range factor per game', rangeFactorPer9Inn: 'Range factor per 9',
}
const words = (k: string) => { const t = k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1) }
const labelOf = (k: string, pct: boolean) => `${LABELS[k] ?? words(k)}${pct ? ' (percentile)' : ''}`

const num = (s: string | undefined): number | null => {
  if (s == null) return null
  const t = s.trim().replace(/%$/, '')
  if (t === '' || t === '-' || t === '.---' || t === '-.--' || t === '*.**') return null
  const x = Number(t)
  return Number.isFinite(x) ? x : null
}

// ── Team, league and position for every player, from the MLB roster tables ──
type Info = { team: string; league: string; division: string; position: string }
async function mlbJson(url: string, key: string): Promise<any | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(20000) })
    if (!res.ok) { logOnce(`scatter:${key}:${res.status}`, 'scatter-data', `${key} HTTP ${res.status}`); return null }
    return await res.json()
  } catch (e) { logOnce(`scatter:${key}:threw`, 'scatter-data', `${key} fetch failed`, e); return null }
}
type Split = { team?: { name: string }; player?: { id: number; fullName: string }; league?: { name: string }; position?: { abbreviation: string }; stat: Record<string, unknown> }
const teamMeta = (name: string | undefined) => { const t = name ? findTeamByName(name) ?? MLB_TEAMS.find(x => x.name === name) : undefined; return t ? { abbr: t.abbrev, league: t.league, division: `${t.league} ${t.division}` } : null }

async function playerInfo(season: number): Promise<{ byId: Map<number, Info>; byName: Map<string, Info> }> {
  const out = new Map<number, Info>(); const byName = new Map<string, Info>()
  const [hit, pit] = await Promise.all(['hitting', 'pitching'].map(g => mlbJson(`https://statsapi.mlb.com/api/v1/stats?stats=season&group=${g}&season=${season}&sportIds=1&playerPool=ALL&limit=3000`, `roster-${g}`)))
  for (const [data, def] of [[pit, 'P'], [hit, '']] as const) for (const s of ((data?.stats?.[0]?.splits ?? []) as Split[])) {
    const id = s.player?.id; if (!id) continue
    const m = teamMeta(s.team?.name)
    const info = { team: m?.abbr ?? s.team?.name ?? '', league: m?.league ?? '', division: m?.division ?? '', position: s.position?.abbreviation ?? def }
    out.set(id, info)
    if (s.player?.fullName) byName.set(nameKey(s.player.fullName), info)
  }
  return { byId: out, byName }
}

const MLB_API = 'https://statsapi.mlb.com/api/v1'
const MLB_SOURCES: Record<string, { url: (y: number) => string; team: boolean }> = {
  'mlb-hit': { url: y => `${MLB_API}/stats?stats=season&group=hitting&season=${y}&sportIds=1&playerPool=ALL&limit=3000`, team: false },
  'mlb-pit': { url: y => `${MLB_API}/stats?stats=season&group=pitching&season=${y}&sportIds=1&playerPool=ALL&limit=3000`, team: false },
  'mlb-field': { url: y => `${MLB_API}/stats?stats=season&group=fielding&season=${y}&sportIds=1&playerPool=ALL&limit=3000`, team: false },
  'mlb-team-hit': { url: y => `${MLB_API}/teams/stats?stats=season&group=hitting&season=${y}&sportIds=1`, team: true },
  'mlb-team-pit': { url: y => `${MLB_API}/teams/stats?stats=season&group=pitching&season=${y}&sportIds=1`, team: true },
  'mlb-team-field': { url: y => `${MLB_API}/teams/stats?stats=season&group=fielding&season=${y}&sportIds=1`, team: true },
}
/** 182.1 innings means 182 and one third. */
const innings = (v: unknown) => { const s = String(v); const [w, f] = s.split('.'); const n = Number(w) + (Number(f || 0) / 3); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null }

function finish(id: string, rows: ScatterRow[], keys: string[], cats: CatColumn[], pct = false, minShare = 0.25): ScatterDataset {
  const stat = keys.filter(k => rows.filter(r => r.v[k] != null).length >= Math.max(8, rows.length * minShare))
  const columns: ScatterColumn[] = stat.map(k => ({ key: k, label: labelOf(k, pct), decimals: decimalsFor(rows.map(r => r.v[k]).filter((x): x is number => x != null)) }))
  return { id, label: id, columns, cats, rows }
}

async function mlbDataset(id: string, season: number): Promise<ScatterDataset | null> {
  const src = MLB_SOURCES[id]
  const json = await mlbJson(src.url(season), id)
  const splits = (json?.stats?.[0]?.splits ?? []) as Split[]
  if (!splits.length) return null
  const rows: ScatterRow[] = []
  const keys = new Set<string>()
  const merged = new Map<string, ScatterRow>()
  for (const s of splits) {
    const m = teamMeta(s.team?.name)
    const name = src.team ? (m?.abbr ?? s.team?.name ?? '') : s.player?.fullName ?? ''
    if (!name) continue
    const v: Record<string, number | null> = {}
    for (const [k, val] of Object.entries(s.stat)) {
      if (typeof val === 'object') continue
      const x = k === 'inningsPitched' ? innings(val) : num(String(val))
      v[k] = x; if (x != null) keys.add(k)
    }
    const c: Record<string, string> = {}
    if (m) { c.team = m.abbr; c.league = m.league; c.division = m.division } else if (s.team?.name) c.team = s.team.name
    if (!src.team && s.position?.abbreviation) c.position = s.position.abbreviation
    // The fielding table has one row per player and position; keep the one with the most chances.
    const key = `${s.player?.id ?? name}`
    const row: ScatterRow = { id: s.player?.id ?? (m ? MLB_TEAMS.find(t => t.abbrev === m.abbr)?.id ?? null : null), name, team: c.team, v, c }
    const prev = merged.get(key)
    if (!prev || (v.chances ?? 0) > (prev.v.chances ?? 0)) merged.set(key, row)
  }
  rows.push(...merged.values())
  const cats: CatColumn[] = [{ key: 'team', label: 'Team' }, { key: 'league', label: 'League' }, { key: 'division', label: 'Division' }, ...(src.team ? [] : [{ key: 'position', label: 'Position' }])]
  return finish(id, rows, [...keys], cats)
}

/** `lite` skips the roster join (team, league, position), which a season-by-season line chart does not need. */
const DRS_COLS: [keyof DrsRow, string][] = [['drs', 'drs'], ['part', 'drs_part'], ['sb', 'drs_sb'], ['bunts', 'drs_bunts'], ['gfp', 'drs_gfp'], ['adjEr', 'drs_adj_er'], ['strikeZone', 'drs_strike_zone'], ['gdp', 'drs_gdp'], ['ofArm', 'drs_of_arm']]
/** One DRS row per name (the one with the most innings if a name repeats), keyed the way player names are matched everywhere else. */
function drsByName(rows: DrsRow[]): Map<string, DrsRow> {
  const m = new Map<string, DrsRow>()
  for (const r of rows) { const k = nameKey(r.name); const p = m.get(k); if (!p || (r.innings ?? 0) > (p.innings ?? 0)) m.set(k, r) }
  return m
}

/** DRS as its own table: every fielder with each DRS component. Team, league and position come from the roster table by name. */
async function drsDataset(season: number, lite: boolean): Promise<ScatterDataset | null> {
  const [rowsIn, info] = await Promise.all([getDrs(season), lite ? Promise.resolve(null) : playerInfo(season)])
  if (!rowsIn.length) return null
  const rows: ScatterRow[] = [...drsByName(rowsIn).values()].map(r => {
    const v: Record<string, number | null> = { drs_innings: r.innings }
    for (const [k, key] of DRS_COLS) v[key] = r[k] as number | null
    const inf = info?.byName.get(nameKey(r.name))
    const c: Record<string, string> = {}
    if (inf) { if (inf.team) c.team = inf.team; if (inf.league) c.league = inf.league; if (inf.division) c.division = inf.division; if (inf.position) c.position = inf.position }
    return { id: null, name: r.name, team: c.team, v, c }
  })
  const cats: CatColumn[] = ['team', 'league', 'division', 'position'].filter(k => rows.some(r => r.c[k])).map(k => ({ key: k, label: CAT_LABELS[k] ?? words(k) }))
  // catcher-only parts (framing, adjusted earned runs) are few rows, so the usual coverage floor is dropped for this table
  return finish('drs', rows, ['drs_innings', ...DRS_COLS.map(([, k]) => k)], cats, false, 0)
}

export async function getScatterDataset(id: string, season: number, lite = false): Promise<ScatterDataset | null> {
  if (MLB_SOURCES[id]) return mlbDataset(id, season)
  if (id === 'drs') return drsDataset(season, lite)
  const src = SOURCES[id]
  if (!src) return null
  try {
    const joinDrs = id === 'frv' || id === 'oaa'
    const [res, info, drsRows] = await Promise.all([
      fetch(src.url(season), { next: { revalidate: 3600 }, signal: AbortSignal.timeout(25000), headers: { 'User-Agent': UA, Accept: 'text/csv,*/*' } }),
      lite ? Promise.resolve({ byId: new Map<number, Info>(), byName: new Map<string, Info>() }) : playerInfo(season),
      joinDrs ? getDrs(season) : Promise.resolve([] as DrsRow[]),
    ])
    if (!res.ok) { logOnce(`scatter:${id}:${res.status}`, 'scatter-data', `${id} HTTP ${res.status}`); return null }
    const raw: Raw[] = parseCsv(await res.text())
    if (!raw.length) return null
    const head = Object.keys(raw[0])
    const derived = src.derive ? raw.map(r => src.derive!(r)) : []
    // A text column (few distinct values, not numbers) is a group; a numeric column is a stat.
    const isNumeric = (k: string) => { const filled = raw.map(r => r[k]).filter(x => x != null && x !== ''); return filled.length > 0 && filled.filter(x => num(x) != null).length / filled.length > 0.6 }
    const catKeys = head.filter(k => k !== src.name && !NOT_STATS.has(k) && !isNumeric(k) && new Set(raw.map(r => r[k])).size <= 60 && raw.some(r => r[k]))
    const statKeys = [...head.filter(k => k !== src.name && !NOT_STATS.has(k) && !catKeys.includes(k) && isNumeric(k)), ...(derived[0] ? Object.keys(derived[0]) : [])]
    const drs = drsByName(drsRows)
    const rows: ScatterRow[] = raw.map((r, i) => {
      const v: Record<string, number | null> = {}
      for (const k of statKeys) v[k] = k in (derived[i] ?? {}) ? derived[i][k] : num(r[k])
      // Defensive Runs Saved joined by player name onto the Savant fielding tables
      const d = joinDrs ? drs.get(nameKey(displayName(r[src.name] ?? ''))) : undefined
      if (joinDrs) for (const [k, key] of DRS_COLS) v[key] = d ? (d[k] as number | null) : null
      const pid = num(r[src.id])
      const c: Record<string, string> = {}
      const alias: Record<string, string> = { display_team_name: 'team', team_name: 'team', team_name_alt: 'team', primary_pos_formatted: 'position' }
      for (const k of catKeys) if (r[k] && !alias[k]) c[k] = r[k]
      const inf = pid != null ? info.byId.get(pid) : undefined
      // The roster table's abbreviations win; the leaderboard's own team or position text is the fallback.
      for (const k of catKeys) if (r[k] && alias[k] && !c[alias[k]]) c[alias[k]] = r[k]
      if (inf) { if (inf.team) c.team = inf.team; if (inf.league) c.league = inf.league; if (inf.division) c.division = inf.division; if (inf.position) c.position = inf.position }
      return { id: pid, name: displayName(r[src.name] ?? ''), team: c.team, v, c }
    }).filter(r => r.name)
    const catList = [...new Set([...catKeys.filter(k => !['display_team_name', 'team_name', 'team_name_alt', 'primary_pos_formatted'].includes(k)), 'team', 'league', 'division', 'position'])].filter(k => rows.some(r => r.c[k]))
    const cats: CatColumn[] = catList.map(k => ({ key: k, label: CAT_LABELS[k] ?? words(k) }))
    return finish(id, rows, joinDrs && drsRows.length ? [...statKeys, ...DRS_COLS.map(([, k]) => k)] : statKeys, cats, !!src.pct)
  } catch (e) {
    logOnce(`scatter:${id}:threw`, 'scatter-data', `${id} fetch failed`, e)
    return null
  }
}
