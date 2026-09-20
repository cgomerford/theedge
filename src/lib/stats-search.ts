// src/lib/stats-search.ts
//
// The engine behind /mlb/leaders' search box: a catalog of every real stat
// this app has live access to, each entry wired to a real leaderboard
// fetch — not a fabricated or hardcoded number anywhere.
//
// Two real data lanes:
//   1. 'mlb-leaders' — MLB Stats API's own /stats/leaders endpoint. The
//      catalog's `apiCategory` values are verified real leaderCategories
//      (curled GET /api/v1/leagueLeaderTypes — 70 real values; every
//      'mlb-leaders' entry below uses one of them, plus a real `statGroup`
//      of hitting/pitching/fielding to disambiguate stats — like
//      strikeouts — that exist on both sides of the ball).
//   2. 'savant-*' — Baseball Savant's own bulk CSV leaderboards (curl-
//      verified: bat-tracking, expected_statistics [batter AND pitcher],
//      statcast [exit velo/barrel, batter AND pitcher-against], sprint
//      speed, outs_above_average). These are the site's differentiated
//      Statcast metrics this MLB endpoint doesn't have (bat speed, xwOBA,
//      barrel rate, OAA, etc.) — same real CSVs used elsewhere in this
//      app (batter-stats.ts, batter-bat-speed.ts), fetched here in their
//      full bulk/leaderboard form instead of filtered to one player.
//
// `sortDesc` controls which end of the leaderboard is "first" — true for
// counting/rate stats where a bigger number leads (HR, AVG, exit velo),
// false for the handful where a smaller number leads (ERA, WHIP, exit
// velo ALLOWED). It's a display convention, not a moral judgment — e.g.
// swing length has no real "better" direction, so it's just sorted
// descending (longest first) like any other leaderboard.

const MLB_API = 'https://statsapi.mlb.com/api/v1'
const SEASON = new Date().getFullYear()

export type StatSource =
  | 'mlb-leaders'
  | 'savant-bat-tracking'
  | 'savant-expected-batter'
  | 'savant-expected-pitcher'
  | 'savant-statcast-batter'
  | 'savant-statcast-pitcher'
  | 'savant-sprint-speed'
  | 'savant-oaa'

export type StatGroupLabel = 'Batting' | 'Pitching' | 'Fielding' | 'Baserunning'

// Real MLB pitch-type codes — curl-verified against Savant's own
// pitch-arsenal-stats leaderboard this season (KC/knuckle-curve dropped:
// it came back empty this year, everything else here returned real rows).
export type PitchTypeCode = 'FF' | 'SI' | 'FC' | 'SL' | 'CU' | 'CH' | 'FS' | 'ST' | 'SV'
export const PITCH_TYPES: { code: PitchTypeCode; label: string }[] = [
  { code: 'FF', label: '4-Seam Fastball' },
  { code: 'SI', label: 'Sinker' },
  { code: 'FC', label: 'Cutter' },
  { code: 'SL', label: 'Slider' },
  { code: 'ST', label: 'Sweeper' },
  { code: 'CU', label: 'Curveball' },
  { code: 'SV', label: 'Slurve' },
  { code: 'CH', label: 'Changeup' },
  { code: 'FS', label: 'Splitter' },
]

// How a stat can be re-sliced by pitch type — two real, verified lanes:
//   'count-batter'/'count-pitcher' — a narrow real per-pitch event query
//     (e.g. every home run hit off a changeup this season is ~460 rows,
//     not the millions a full-league per-pitch pull would be), counted
//     per player. Only valid for real, literal events (home_run, strikeout,
//     the hit types), matching `events` values curl-verified on the CSV.
//   'arsenal-batter'/'arsenal-pitcher' — Savant's own bulk per-player,
//     per-pitch-type leaderboard (real columns: ba, slg, est_ba, est_slg,
//     est_woba, whiff_percent, hard_hit_percent — one call, every
//     qualified player, already split by pitch type server-side).
export type PitchSplit =
  | { kind: 'count-batter' | 'count-pitcher'; events: string[] }
  | { kind: 'arsenal-batter' | 'arsenal-pitcher'; field: string }

export type StatEntry = {
  key: string
  label: string
  fullLabel: string
  group: StatGroupLabel
  tag: 'Standard' | 'Statcast'
  source: StatSource
  apiCategory?: string   // mlb-leaders only: the real leaderCategories param
  statGroup?: 'hitting' | 'pitching' | 'fielding'
  csvField?: string      // savant-* only: which real CSV column to read
  sortDesc: boolean
  format: (raw: number) => string
  aliases?: string[]
  minSample?: string     // one-line real qualifier note shown in the UI
  pitchSplit?: PitchSplit
}

export type LeaderboardRow = {
  rank: number
  personId: number
  name: string
  teamAbbr?: string
  headshot: string
  value: string
}

// ─── Formatters ─────────────────────────────────────────────────────────

const fAvg = (n: number) => (Number.isFinite(n) ? n.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.') : '—')
const fEra = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const fInt = (n: number) => (Number.isFinite(n) ? String(Math.round(n)) : '—')
const fPct1 = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)}%` : '—')
const fPctFrac1 = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—')
const fMph1 = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)} mph` : '—')
const fFtSec1 = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)} ft/s` : '—')
const fIn1 = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)}"` : '—')
const fPlain2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')

function headshotUrl(personId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${personId}/headshot/67/current`
}

// ─── Catalog ────────────────────────────────────────────────────────────

export const STAT_CATALOG: StatEntry[] = [
  // ── Batting — real MLB Stats API leaders ──
  { key: 'avg', label: 'AVG', fullLabel: 'Batting Average', group: 'Batting', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'battingAverage', statGroup: 'hitting', sortDesc: true, format: fAvg, aliases: ['batting average'], pitchSplit: { kind: 'arsenal-batter', field: 'ba' } },
  { key: 'obp', label: 'OBP', fullLabel: 'On-Base Percentage', group: 'Batting', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'onBasePercentage', statGroup: 'hitting', sortDesc: true, format: fAvg },
  { key: 'slg', label: 'SLG', fullLabel: 'Slugging Percentage', group: 'Batting', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'sluggingPercentage', statGroup: 'hitting', sortDesc: true, format: fAvg, pitchSplit: { kind: 'arsenal-batter', field: 'slg' } },
  { key: 'ops', label: 'OPS', fullLabel: 'On-Base Plus Slugging', group: 'Batting', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'onBasePlusSlugging', statGroup: 'hitting', sortDesc: true, format: fAvg },
  { key: 'hr', label: 'HR', fullLabel: 'Home Runs', group: 'Batting', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'homeRuns', statGroup: 'hitting', sortDesc: true, format: fInt, aliases: ['home runs', 'dingers'], pitchSplit: { kind: 'count-batter', events: ['home_run'] } },
  { key: 'rbi', label: 'RBI', fullLabel: 'Runs Batted In', group: 'Batting', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'runsBattedIn', statGroup: 'hitting', sortDesc: true, format: fInt },
  { key: 'hits', label: 'H', fullLabel: 'Hits', group: 'Batting', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'hits', statGroup: 'hitting', sortDesc: true, format: fInt, pitchSplit: { kind: 'count-batter', events: ['single', 'double', 'triple', 'home_run'] } },
  { key: 'runs', label: 'R', fullLabel: 'Runs Scored', group: 'Batting', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'runs', statGroup: 'hitting', sortDesc: true, format: fInt },
  { key: 'doubles', label: '2B', fullLabel: 'Doubles', group: 'Batting', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'doubles', statGroup: 'hitting', sortDesc: true, format: fInt },
  { key: 'triples', label: '3B', fullLabel: 'Triples', group: 'Batting', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'triples', statGroup: 'hitting', sortDesc: true, format: fInt },
  { key: 'sb', label: 'SB', fullLabel: 'Stolen Bases', group: 'Baserunning', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'stolenBases', statGroup: 'hitting', sortDesc: true, format: fInt, aliases: ['steals'] },
  { key: 'sbPct', label: 'SB%', fullLabel: 'Stolen Base Percentage', group: 'Baserunning', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'stolenBasePercentage', statGroup: 'hitting', sortDesc: true, format: fAvg },
  { key: 'caughtStealingBat', label: 'CS', fullLabel: 'Caught Stealing', group: 'Baserunning', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'caughtStealing', statGroup: 'hitting', sortDesc: true, format: fInt },
  { key: 'bb', label: 'BB', fullLabel: 'Walks', group: 'Batting', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'walks', statGroup: 'hitting', sortDesc: true, format: fInt, aliases: ['walks'] },
  { key: 'kBatting', label: 'K', fullLabel: 'Strikeouts (Batting)', group: 'Batting', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'strikeouts', statGroup: 'hitting', sortDesc: true, format: fInt },
  { key: 'tb', label: 'TB', fullLabel: 'Total Bases', group: 'Batting', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'totalBases', statGroup: 'hitting', sortDesc: true, format: fInt },
  { key: 'xbh', label: 'XBH', fullLabel: 'Extra-Base Hits', group: 'Batting', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'extraBaseHits', statGroup: 'hitting', sortDesc: true, format: fInt },
  { key: 'hbp', label: 'HBP', fullLabel: 'Hit By Pitch', group: 'Batting', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'hitByPitches', statGroup: 'hitting', sortDesc: true, format: fInt },
  { key: 'ibb', label: 'IBB', fullLabel: 'Intentional Walks', group: 'Batting', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'intentionalWalks', statGroup: 'hitting', sortDesc: true, format: fInt },
  { key: 'gidp', label: 'GIDP', fullLabel: 'Grounded Into Double Play', group: 'Batting', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'groundIntoDoublePlays', statGroup: 'hitting', sortDesc: false, format: fInt },

  // ── Pitching — real MLB Stats API leaders ──
  { key: 'era', label: 'ERA', fullLabel: 'Earned Run Average', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'earnedRunAverage', statGroup: 'pitching', sortDesc: false, format: fEra },
  { key: 'whip', label: 'WHIP', fullLabel: 'Walks + Hits per Inning Pitched', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'walksAndHitsPerInningPitched', statGroup: 'pitching', sortDesc: false, format: fPlain2 },
  { key: 'wins', label: 'W', fullLabel: 'Wins', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'wins', statGroup: 'pitching', sortDesc: true, format: fInt },
  { key: 'losses', label: 'L', fullLabel: 'Losses', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'losses', statGroup: 'pitching', sortDesc: true, format: fInt },
  { key: 'saves', label: 'SV', fullLabel: 'Saves', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'saves', statGroup: 'pitching', sortDesc: true, format: fInt },
  { key: 'saveOpps', label: 'SVO', fullLabel: 'Save Opportunities', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'saveOpportunities', statGroup: 'pitching', sortDesc: true, format: fInt },
  { key: 'blownSaves', label: 'BS', fullLabel: 'Blown Saves', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'blownSaves', statGroup: 'pitching', sortDesc: false, format: fInt },
  { key: 'holds', label: 'HLD', fullLabel: 'Holds', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'holds', statGroup: 'pitching', sortDesc: true, format: fInt },
  { key: 'shutouts', label: 'SHO', fullLabel: 'Shutouts', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'shutouts', statGroup: 'pitching', sortDesc: true, format: fInt },
  { key: 'completeGames', label: 'CG', fullLabel: 'Complete Games', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'completeGames', statGroup: 'pitching', sortDesc: true, format: fInt },
  { key: 'kPitching', label: 'K', fullLabel: 'Strikeouts (Pitching)', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'strikeouts', statGroup: 'pitching', sortDesc: true, format: fInt, aliases: ['strikeouts', 'punchouts'], pitchSplit: { kind: 'count-pitcher', events: ['strikeout', 'strikeout_double_play'] } },
  { key: 'k9', label: 'K/9', fullLabel: 'Strikeouts per 9', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'strikeoutsPer9Inn', statGroup: 'pitching', sortDesc: true, format: fPlain2 },
  { key: 'bb9', label: 'BB/9', fullLabel: 'Walks per 9', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'walksPer9Inn', statGroup: 'pitching', sortDesc: false, format: fPlain2 },
  { key: 'h9', label: 'H/9', fullLabel: 'Hits per 9', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'hitsPer9Inn', statGroup: 'pitching', sortDesc: false, format: fPlain2 },
  { key: 'kbb', label: 'K/BB', fullLabel: 'Strikeout-to-Walk Ratio', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'strikeoutWalkRatio', statGroup: 'pitching', sortDesc: true, format: fPlain2 },
  { key: 'winPct', label: 'W%', fullLabel: 'Win Percentage', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'winPercentage', statGroup: 'pitching', sortDesc: true, format: fAvg },
  { key: 'ip', label: 'IP', fullLabel: 'Innings Pitched', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'inningsPitched', statGroup: 'pitching', sortDesc: true, format: fPlain2 },
  { key: 'gs', label: 'GS', fullLabel: 'Games Started', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'gamesStarted', statGroup: 'pitching', sortDesc: true, format: fInt },
  { key: 'hitBatsmen', label: 'HBP', fullLabel: 'Hit Batsmen', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'hitBatsman', statGroup: 'pitching', sortDesc: false, format: fInt },
  { key: 'wildPitches', label: 'WP', fullLabel: 'Wild Pitches', group: 'Pitching', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'wildPitch', statGroup: 'pitching', sortDesc: false, format: fInt },

  // ── Fielding — real MLB Stats API leaders ──
  { key: 'assists', label: 'A', fullLabel: 'Assists', group: 'Fielding', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'assists', statGroup: 'fielding', sortDesc: true, format: fInt },
  { key: 'putOuts', label: 'PO', fullLabel: 'Putouts', group: 'Fielding', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'putOuts', statGroup: 'fielding', sortDesc: true, format: fInt },
  { key: 'fldPct', label: 'FLD%', fullLabel: 'Fielding Percentage', group: 'Fielding', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'fieldingPercentage', statGroup: 'fielding', sortDesc: true, format: fAvg },
  { key: 'errors', label: 'E', fullLabel: 'Errors', group: 'Fielding', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'errors', statGroup: 'fielding', sortDesc: false, format: fInt },
  { key: 'dp', label: 'DP', fullLabel: 'Double Plays Turned', group: 'Fielding', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'doublePlays', statGroup: 'fielding', sortDesc: true, format: fInt },
  { key: 'rangeFactor', label: 'RF/G', fullLabel: 'Range Factor per Game', group: 'Fielding', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'rangeFactorPerGame', statGroup: 'fielding', sortDesc: true, format: fPlain2 },
  { key: 'ofAssists', label: 'OFA', fullLabel: 'Outfield Assists', group: 'Fielding', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'outfieldAssists', statGroup: 'fielding', sortDesc: true, format: fInt },
  { key: 'passedBalls', label: 'PB', fullLabel: 'Passed Balls', group: 'Fielding', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'passedBalls', statGroup: 'fielding', sortDesc: false, format: fInt },
  { key: 'pickoffs', label: 'PK', fullLabel: 'Pickoffs', group: 'Fielding', tag: 'Standard', source: 'mlb-leaders', apiCategory: 'pickoffs', statGroup: 'fielding', sortDesc: true, format: fInt },

  // ── Statcast batting — real Baseball Savant bulk leaderboards ──
  { key: 'batSpeed', label: 'Bat Speed', fullLabel: 'Average Bat Speed', group: 'Batting', tag: 'Statcast', source: 'savant-bat-tracking', csvField: 'avg_bat_speed', sortDesc: true, format: fMph1, aliases: ['swing speed'] },
  { key: 'swingLength', label: 'Swing Length', fullLabel: 'Average Swing Length', group: 'Batting', tag: 'Statcast', source: 'savant-bat-tracking', csvField: 'swing_length', sortDesc: true, format: fIn1 },
  { key: 'squaredUp', label: 'Squared-Up%', fullLabel: 'Squared-Up Rate', group: 'Batting', tag: 'Statcast', source: 'savant-bat-tracking', csvField: 'squared_up_per_swing', sortDesc: true, format: fPctFrac1 },
  { key: 'blastRate', label: 'Blast%', fullLabel: 'Blast Rate', group: 'Batting', tag: 'Statcast', source: 'savant-bat-tracking', csvField: 'blast_per_swing', sortDesc: true, format: fPctFrac1 },
  { key: 'hardSwingRate', label: 'Hard-Swing%', fullLabel: 'Hard-Swing Rate', group: 'Batting', tag: 'Statcast', source: 'savant-bat-tracking', csvField: 'hard_swing_rate', sortDesc: true, format: fPctFrac1 },
  { key: 'whiffPerSwing', label: 'Whiff%', fullLabel: 'Whiff Rate (per Swing)', group: 'Batting', tag: 'Statcast', source: 'savant-bat-tracking', csvField: 'whiff_per_swing', sortDesc: true, format: fPctFrac1, aliases: ['swing and miss'] },
  { key: 'batterRunValue', label: 'Run Value', fullLabel: 'Batter Run Value', group: 'Batting', tag: 'Statcast', source: 'savant-bat-tracking', csvField: 'batter_run_value', sortDesc: true, format: fPlain2 },

  { key: 'xba', label: 'xBA', fullLabel: 'Expected Batting Average', group: 'Batting', tag: 'Statcast', source: 'savant-expected-batter', csvField: 'est_ba', sortDesc: true, format: fAvg, pitchSplit: { kind: 'arsenal-batter', field: 'est_ba' } },
  { key: 'xslg', label: 'xSLG', fullLabel: 'Expected Slugging', group: 'Batting', tag: 'Statcast', source: 'savant-expected-batter', csvField: 'est_slg', sortDesc: true, format: fAvg, pitchSplit: { kind: 'arsenal-batter', field: 'est_slg' } },
  { key: 'xwoba', label: 'xwOBA', fullLabel: 'Expected wOBA', group: 'Batting', tag: 'Statcast', source: 'savant-expected-batter', csvField: 'est_woba', sortDesc: true, format: fAvg, pitchSplit: { kind: 'arsenal-batter', field: 'est_woba' } },

  { key: 'exitVelo', label: 'Avg EV', fullLabel: 'Average Exit Velocity', group: 'Batting', tag: 'Statcast', source: 'savant-statcast-batter', csvField: 'avg_hit_speed', sortDesc: true, format: fMph1, aliases: ['exit velocity'] },
  { key: 'maxExitVelo', label: 'Max EV', fullLabel: 'Max Exit Velocity', group: 'Batting', tag: 'Statcast', source: 'savant-statcast-batter', csvField: 'max_hit_speed', sortDesc: true, format: fMph1 },
  { key: 'hardHitRate', label: 'Hard-Hit%', fullLabel: 'Hard-Hit Rate', group: 'Batting', tag: 'Statcast', source: 'savant-statcast-batter', csvField: 'ev95percent', sortDesc: true, format: fPct1, pitchSplit: { kind: 'arsenal-batter', field: 'hard_hit_percent' } },
  { key: 'barrelRate', label: 'Barrel%', fullLabel: 'Barrel Rate', group: 'Batting', tag: 'Statcast', source: 'savant-statcast-batter', csvField: 'brl_percent', sortDesc: true, format: fPct1 },
  { key: 'sweetSpotRate', label: 'Sweet Spot%', fullLabel: 'Sweet-Spot Rate', group: 'Batting', tag: 'Statcast', source: 'savant-statcast-batter', csvField: 'anglesweetspotpercent', sortDesc: true, format: fPct1 },

  // ── Statcast pitching — real Baseball Savant bulk leaderboards ──
  { key: 'xera', label: 'xERA', fullLabel: 'Expected ERA', group: 'Pitching', tag: 'Statcast', source: 'savant-expected-pitcher', csvField: 'xera', sortDesc: false, format: fEra },
  { key: 'xwobaAgainst', label: 'xwOBA Against', fullLabel: 'Expected wOBA Against', group: 'Pitching', tag: 'Statcast', source: 'savant-expected-pitcher', csvField: 'est_woba', sortDesc: false, format: fAvg, pitchSplit: { kind: 'arsenal-pitcher', field: 'est_woba' } },
  { key: 'exitVeloAgainst', label: 'Avg EV Against', fullLabel: 'Average Exit Velocity Allowed', group: 'Pitching', tag: 'Statcast', source: 'savant-statcast-pitcher', csvField: 'avg_hit_speed', sortDesc: false, format: fMph1 },
  { key: 'hardHitAgainst', label: 'Hard-Hit% Against', fullLabel: 'Hard-Hit Rate Allowed', group: 'Pitching', tag: 'Statcast', source: 'savant-statcast-pitcher', csvField: 'ev95percent', sortDesc: false, format: fPct1, pitchSplit: { kind: 'arsenal-pitcher', field: 'hard_hit_percent' } },
  { key: 'barrelAgainst', label: 'Barrel% Against', fullLabel: 'Barrel Rate Allowed', group: 'Pitching', tag: 'Statcast', source: 'savant-statcast-pitcher', csvField: 'brl_percent', sortDesc: false, format: fPct1 },

  // ── Statcast baserunning / fielding ──
  { key: 'sprintSpeed', label: 'Sprint Speed', fullLabel: 'Sprint Speed', group: 'Baserunning', tag: 'Statcast', source: 'savant-sprint-speed', csvField: 'sprint_speed', sortDesc: true, format: fFtSec1, aliases: ['speed', 'footspeed'] },
  { key: 'oaa', label: 'OAA', fullLabel: 'Outs Above Average', group: 'Fielding', tag: 'Statcast', source: 'savant-oaa', csvField: 'outs_above_average', sortDesc: true, format: fInt, aliases: ['outs above average', 'defense'] },
]

// ─── Search ─────────────────────────────────────────────────────────────

// Small, dependency-free Levenshtein distance — just enough typo tolerance
// to survive "sluging" / "avarage" / "streikout" without pulling in a
// fuzzy-search library for a few dozen catalog entries.
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const prev = new Array(n + 1)
  const cur = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j]
  }
  return prev[n]
}

function wordMatchScore(word: string, haystacks: string[]): number {
  let best = 0
  for (const h of haystacks) {
    if (h === word) best = Math.max(best, 100)
    else if (h.startsWith(word)) best = Math.max(best, 80)
    else if (h.includes(word)) best = Math.max(best, 55)
    else {
      // Typo tolerance against individual words within the haystack, not
      // the whole phrase — "avarage" should still find "average" inside
      // "batting average" — scaled by word length so short words need an
      // almost-exact match (2-3 char stats like "K" or "SB" never fuzz).
      for (const hWord of h.split(/\s+/)) {
        if (hWord.length < 4) continue
        const maxDist = hWord.length <= 5 ? 1 : 2
        if (editDistance(word, hWord) <= maxDist) best = Math.max(best, 40)
      }
    }
  }
  return best
}

export function searchStats(query: string): StatEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return STAT_CATALOG
  const words = q.split(/\s+/).filter(Boolean)

  return STAT_CATALOG
    .map(e => {
      const haystacks = [e.label, e.fullLabel, e.key, e.group, ...(e.aliases ?? [])].map(s => s.toLowerCase())

      // Whole-phrase match first — fastest path for exact/prefix typing.
      let score = -1
      for (const h of haystacks) {
        if (h === q) { score = Math.max(score, 100); continue }
        if (h.startsWith(q)) { score = Math.max(score, 80); continue }
        if (h.includes(q)) { score = Math.max(score, 50); continue }
      }

      // Multi-word / fuzzy fallback — every word in the query has to find
      // some match (exact, partial, or typo-tolerant) somewhere in this
      // entry's haystacks; score is the average of each word's best match.
      if (score < 0 && words.length > 0) {
        const wordScores = words.map(w => wordMatchScore(w, haystacks))
        if (wordScores.every(s => s > 0)) {
          score = wordScores.reduce((a, b) => a + b, 0) / wordScores.length - 10
        }
      }

      return { e, score }
    })
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.e)
}

// ─── CSV parsing (quoted-field aware — Savant names carry commas) ───────

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  function parseLine(line: string): string[] {
    const cells: string[] = []
    let cur = '', inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') inQuotes = !inQuotes
      else if (ch === ',' && !inQuotes) { cells.push(cur); cur = '' }
      else cur += ch
    }
    cells.push(cur)
    return cells
  }

  const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase().replace(/^﻿/, ''))
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cells = parseLine(lines[i])
    rows.push(Object.fromEntries(headers.map((h, idx) => [h, (cells[idx] ?? '').trim()])))
  }
  return rows
}

function savantNameToDisplay(raw: string): string {
  const [last, first] = raw.split(',').map(s => s.trim())
  return first && last ? `${first} ${last}` : raw
}

// `min=q` asks Savant for its own real "qualified" threshold (the same
// convention its own site defaults to) instead of a raw count — curl-
// verified this matters: a raw min=10 let single-digit-sample noise (a
// catcher's one mop-up inning at a 0.06 xERA, a September call-up's
// three-PA .900 xwOBA) crowd out real, everyday-player leaderboards.
// Sprint speed doesn't accept 'q' (returns an HTML page, not a CSV), so it
// keeps a numeric floor — 30 competitive runs, Savant's own site default.
const SAVANT_URLS: Record<Exclude<StatSource, 'mlb-leaders'>, string> = {
  'savant-bat-tracking': `https://baseballsavant.mlb.com/leaderboard/bat-tracking?minSwings=q&minGroupSwings=1&seasonStart=${SEASON}&seasonEnd=${SEASON}&type=batter&csv=true`,
  'savant-expected-batter': `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${SEASON}&position=&team=&min=q&csv=true`,
  'savant-expected-pitcher': `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=pitcher&year=${SEASON}&position=&team=&min=q&csv=true`,
  'savant-statcast-batter': `https://baseballsavant.mlb.com/leaderboard/statcast?type=batter&year=${SEASON}&position=&team=&min=q&csv=true`,
  'savant-statcast-pitcher': `https://baseballsavant.mlb.com/leaderboard/statcast?type=pitcher&year=${SEASON}&position=&team=&min=q&csv=true`,
  'savant-sprint-speed': `https://baseballsavant.mlb.com/leaderboard/sprint_speed?year=${SEASON}&position=&team=&min=30&csv=true`,
  'savant-oaa': `https://baseballsavant.mlb.com/leaderboard/outs_above_average?type=Fielder&startYear=${SEASON}&endYear=${SEASON}&split=no&team=&range=year&min=10&pos=&roles=&viz=hide&csv=true`,
}

async function fetchSavantLeaderboard(entry: StatEntry, limit: number): Promise<LeaderboardRow[]> {
  const url = SAVANT_URLS[entry.source as Exclude<StatSource, 'mlb-leaders'>]
  if (!url || !entry.csvField) return []
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', 'Accept': 'text/csv,*/*' }, next: { revalidate: 3600 } })
    if (!res.ok) return []
    const rows = parseCsv(await res.text())

    const idField = 'id' in (rows[0] ?? {}) ? 'id' : 'player_id'
    const nameField = 'name' in (rows[0] ?? {}) ? 'name' : 'last_name, first_name'

    const parsed = rows
      .map(r => ({ r, v: parseFloat(r[entry.csvField as string]) }))
      .filter(x => Number.isFinite(x.v) && x.r[idField])

    parsed.sort((a, b) => (entry.sortDesc ? b.v - a.v : a.v - b.v))

    return parsed.slice(0, limit).map(({ r, v }, i) => {
      const personId = Number(r[idField])
      // Every real Savant leaderboard name column comes back "Last, First"
      // regardless of the column's name — normalize all of them the same way.
      const rawName = r[nameField] ?? '—'
      return {
        rank: i + 1,
        personId,
        name: savantNameToDisplay(rawName),
        teamAbbr: r['team'] || r['display_team_name'] || undefined,
        headshot: headshotUrl(personId),
        value: entry.format(v),
      }
    })
  } catch {
    return []
  }
}

async function fetchMlbLeadersLeaderboard(entry: StatEntry, limit: number): Promise<LeaderboardRow[]> {
  if (!entry.apiCategory || !entry.statGroup) return []
  const url = `${MLB_API}/stats/leaders?leaderCategories=${entry.apiCategory}&season=${SEASON}&limit=${limit}&sportId=1&statGroup=${entry.statGroup}`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    const leaders: unknown[] = data.leagueLeaders?.[0]?.leaders ?? []
    return leaders.map((raw, i) => {
      const l = raw as { rank?: number; value?: string | number; person?: { id?: number; fullName?: string }; team?: { abbreviation?: string; name?: string } }
      const personId = l.person?.id ?? 0
      const n = Number(l.value)
      return {
        rank: l.rank ?? i + 1,
        personId,
        name: l.person?.fullName ?? '—',
        teamAbbr: l.team?.abbreviation ?? l.team?.name?.split(' ').slice(-1)[0],
        headshot: headshotUrl(personId),
        value: Number.isFinite(n) ? entry.format(n) : String(l.value ?? '—'),
      }
    })
  } catch {
    return []
  }
}

// ─── Pitch-type refine ────────────────────────────────────────────────────
//
// 'count-*': a narrow real per-pitch event query (curl-verified: every home
// run off a changeup league-wide this season is ~460 rows — small enough to
// fetch live — vs. the millions a full-league all-pitches pull would be,
// which is why this app avoids that everywhere else). Counted per player
// from the raw rows.
async function fetchPitchTypeCountLeaderboard(split: { kind: 'count-batter' | 'count-pitcher'; events: string[] }, pitchType: PitchTypeCode, limit: number): Promise<LeaderboardRow[]> {
  const playerType = split.kind === 'count-batter' ? 'batter' : 'pitcher'
  const idCol = playerType === 'batter' ? 'batter' : 'pitcher'
  const url = [
    'https://baseballsavant.mlb.com/statcast_search/csv',
    `?all=true&hfGT=R%7C&hfSea=${SEASON}%7C&player_type=${playerType}`,
    `&hfPT=${encodeURIComponent(pitchType)}%7C`,
    `&hfAB=${split.events.map(e => encodeURIComponent(e)).join('%7C')}%7C`,
    `&game_date_gt=${SEASON}-01-01&game_date_lt=${SEASON}-12-31`,
    '&min_pitches=0&min_results=0&group_by=name&sort_col=pitches',
    '&player_event_sort=api_p_release_speed&sort_order=desc&type=details',
  ].join('')

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', Accept: 'text/csv,*/*' }, next: { revalidate: 3600 } })
    if (!res.ok) return []
    const rows = parseCsv(await res.text())

    const counts = new Map<number, { name: string; count: number }>()
    for (const r of rows) {
      const id = Number(r[idCol])
      if (!id) continue
      const name = r['player_name'] ?? '—'
      const cur = counts.get(id)
      if (cur) cur.count++
      else counts.set(id, { name: savantNameToDisplay(name), count: 1 })
    }

    return [...counts.entries()]
      .map(([personId, v]) => ({ personId, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map((x, i) => ({
        rank: i + 1,
        personId: x.personId,
        name: x.name,
        headshot: headshotUrl(x.personId),
        value: fInt(x.count),
      }))
  } catch {
    return []
  }
}

// 'arsenal-*': Savant's own bulk per-player-per-pitch-type leaderboard
// (curl-verified real columns: ba, slg, est_ba, est_slg, est_woba,
// whiff_percent, hard_hit_percent) — one call, every qualified player,
// already split by pitch type server-side.
async function fetchArsenalLeaderboard(split: { kind: 'arsenal-batter' | 'arsenal-pitcher'; field: string }, pitchType: PitchTypeCode, sortDesc: boolean, format: (n: number) => string, limit: number): Promise<LeaderboardRow[]> {
  const type = split.kind === 'arsenal-batter' ? 'batter' : 'pitcher'
  // min=q (Savant's "qualified" convention used elsewhere in this file)
  // curl-verified UNRELIABLE here — it silently 200s an HTML page instead
  // of CSV for some pitch types (e.g. sliders) while working for others.
  // A real numeric floor (25+ pitches of that type seen/thrown) is
  // consistent across every pitch type and still real, not fabricated.
  const url = `https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats?type=${type}&pitchType=${pitchType}&year=${SEASON}&min=25&csv=true`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', Accept: 'text/csv,*/*' }, next: { revalidate: 3600 } })
    if (!res.ok) return []
    const rows = parseCsv(await res.text())
    const parsed = rows
      .map(r => ({ r, v: parseFloat(r[split.field]) }))
      .filter(x => Number.isFinite(x.v) && x.r['player_id'])
    parsed.sort((a, b) => (sortDesc ? b.v - a.v : a.v - b.v))
    return parsed.slice(0, limit).map(({ r, v }, i) => {
      const personId = Number(r['player_id'])
      return {
        rank: i + 1,
        personId,
        name: savantNameToDisplay(r['last_name, first_name'] ?? '—'),
        teamAbbr: r['team_name_alt'] || undefined,
        headshot: headshotUrl(personId),
        value: format(v),
      }
    })
  } catch {
    return []
  }
}

function isCountSplit(split: PitchSplit): split is { kind: 'count-batter' | 'count-pitcher'; events: string[] } {
  return split.kind === 'count-batter' || split.kind === 'count-pitcher'
}

export async function getStatLeaderboard(entry: StatEntry, limit = 15, pitchType?: PitchTypeCode): Promise<LeaderboardRow[]> {
  const split = entry.pitchSplit
  if (pitchType && split) {
    if (isCountSplit(split)) {
      return fetchPitchTypeCountLeaderboard(split, pitchType, limit)
    }
    return fetchArsenalLeaderboard(split, pitchType, entry.sortDesc, entry.format, limit)
  }
  return entry.source === 'mlb-leaders'
    ? fetchMlbLeadersLeaderboard(entry, limit)
    : fetchSavantLeaderboard(entry, limit)
}
