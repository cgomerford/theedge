// src/lib/player-card-stats.ts
//
// Stat groupings + display metadata for the /lab player card rebuild.
// Pure constants + formatters — no fetching here. Keeps the card component
// and the percentile route both reading from one source of truth for
// labels, decimals, and "higher is better" direction, instead of each
// re-deciding it.
//
// Two shapes:
//  - PITCHER_STAT_GROUPS  → reads straight off the `pitcher_stats` row
//  - TEAM_CONTEXT_GROUPS  → reads off the `team_stats` row (used as the
//    "team offense/defense/bullpen" panel on both card types — personal
//    for pitchers is pitcher_stats, personal for batters is the live MLB
//    season line from getPlayerSeasonStats; team_stats is context, not a
//    personal stat, and the card UI must label it that way)
//
// "advanced: true" fields are FanGraphs-sourced (fip_minus, era_minus,
// xfip_minus, war) and unreliable on free endpoints per model.md — the
// card component should skip the row entirely when value is null rather
// than rendering a blank "—".

export type StatFormat = (v: number) => string

export type StatDef = {
  key: string
  label: string
tooltip: StatTooltip
  format: StatFormat
  higherIsBetter: boolean
  percentileEligible?: boolean // can this be ranked via getPitcherStatPercentile?
  advanced?: boolean            // hide row if value is null — see file header
}

export type StatGroup = {
  title: string
  stats: StatDef[]
}

// ─── Shared formatters ──────────────────────────────────────────────────
const dp = (n: number): StatFormat => (v) => v.toFixed(n)
const pct = (n: number = 1): StatFormat => (v) => `${v.toFixed(n)}%`
const int = (): StatFormat => (v) => String(Math.round(v))

// ─── PITCHER CARD ────────────────────────────────────────────────────────

export const PITCHER_STAT_GROUPS: StatGroup[] = [
  {
    title: 'Season',
    stats: [
      { key: 'era', label: 'ERA', higherIsBetter: false, percentileEligible: true, format: dp(2),
  tooltip: {
    description: 'Earned runs allowed per 9 innings pitched — the classic measure of run prevention.',
    howToRead: 'Lower is better. League average sits around 4.00. Under 3.00 is elite; over 5.00 is a problem.',
    formula: 'ERA = (Earned Runs × 9) / Innings Pitched',
    related: ['FIP', 'WHIP', 'xERA'],
  } },
{ key: 'whip', label: 'WHIP', higherIsBetter: false, percentileEligible: true, format: dp(2),
  tooltip: {
    description: 'Walks plus hits allowed, per inning — how many baserunners a pitcher lets on.',
    howToRead: 'Lower is better. Under 1.10 is elite, around 1.30 is average, over 1.45 is a red flag.',
    formula: 'WHIP = (Walks + Hits) / Innings Pitched',
    related: ['ERA', 'K/BB'],
  } },
{ key: 'fip', label: 'FIP', higherIsBetter: false, percentileEligible: true, format: dp(2),
  tooltip: {
    description: 'ERA estimated from only what a pitcher directly controls — strikeouts, walks, home runs — stripping out defense and luck.',
    howToRead: 'Lower is better, same scale as ERA. If FIP is well below ERA, positive regression is likely coming.',
    formula: 'FIP = ((13×HR) + 3×(BB+HBP) − 2×K) / IP + league constant',
    related: ['ERA', 'xERA', 'K-BB%'],
  } },
{ key: 'k_per_9', label: 'K/9', higherIsBetter: true, percentileEligible: true, format: dp(1),
  tooltip: {
    description: 'Strikeouts per 9 innings — raw swing-and-miss output.',
    howToRead: 'Higher is better. Over 10.0 is elite stuff, league average is roughly 8.5.',
    formula: 'K/9 = (Strikeouts / Innings Pitched) × 9',
    related: ['Whiff%', 'K%', 'SwStr%'],
  } },
{ key: 'bb_per_9', label: 'BB/9', higherIsBetter: false, percentileEligible: true, format: dp(1),
  tooltip: {
    description: 'Walks allowed per 9 innings — command and control.',
    howToRead: 'Lower is better. Under 2.5 is excellent command; over 4.0 signals control issues.',
    formula: 'BB/9 = (Walks / Innings Pitched) × 9',
    related: ['BB%', 'WHIP', '1st-pitch strike%'],
  } },
{ key: 'k_bb_ratio', label: 'K/BB', higherIsBetter: true, percentileEligible: true, format: dp(2),
  tooltip: {
    description: 'Strikeouts per walk — command and swing-and-miss stuff combined into one number.',
    howToRead: 'Higher is better. Over 4.0 is elite command; under 2.0 suggests control problems.',
    formula: 'K/BB = Strikeouts / Walks',
    related: ['K/9', 'BB/9'],
  } },
    
      { key: 'wins', label: 'W', tooltip: 'Wins this season.', format: int(), higherIsBetter: true },
      { key: 'losses', label: 'L', tooltip: 'Losses this season.', format: int(), higherIsBetter: false },
      { key: 'saves', label: 'SV', tooltip: 'Saves this season.', format: int(), higherIsBetter: true },
    ],
  },
  {
    title: 'Last 3 starts',
    stats: [
      { key: 'l3_era', label: 'ERA', tooltip: 'ERA over the pitcher\u2019s last 3 starts.', format: dp(2), higherIsBetter: false },
      { key: 'l3_k_per_9', label: 'K/9', tooltip: 'K/9 over the last 3 starts.', format: dp(1), higherIsBetter: true },
      { key: 'l3_innings', label: 'IP', tooltip: 'Innings pitched across the last 3 starts.', format: dp(1), higherIsBetter: true },
      { key: 'l3_strikeouts', label: 'K', tooltip: 'Strikeouts across the last 3 starts.', format: int(), higherIsBetter: true },
      { key: 'l3_walks', label: 'BB', tooltip: 'Walks across the last 3 starts.', format: int(), higherIsBetter: false },
    ],
  },
  {
    title: 'Times through the order',
    stats: [
      { key: 'tto1_xwoba', label: '1st TTO xwOBA', tooltip: 'Expected wOBA allowed the first time through the lineup. Lower is better.', format: dp(3), higherIsBetter: false },
      { key: 'tto2_xwoba', label: '2nd TTO xwOBA', tooltip: 'Expected wOBA allowed the second time through. Lower is better.', format: dp(3), higherIsBetter: false },
      { key: 'tto3_xwoba', label: '3rd TTO xwOBA', tooltip: 'Expected wOBA allowed the third time through — usually the tell for when to pull a starter. Lower is better.', format: dp(3), higherIsBetter: false },
    ],
  },
  {
    title: 'Contact quality allowed',
    stats: [
      { key: 'hard_hit_pct', label: 'Hard-hit%', higherIsBetter: false, percentileEligible: true, format: pct(1),
  tooltip: {
    description: 'Share of batted balls allowed hit 95+ mph off the bat.',
    howToRead: 'Lower is better for the pitcher. Under 30% is excellent; over 40% means hitters are squaring him up.',
    related: ['Avg EV', 'Barrel%'],
  } },
{ key: 'avg_exit_velocity', label: 'Avg EV', higherIsBetter: false, percentileEligible: true, format: dp(1),
  tooltip: {
    description: 'Average exit velocity, in mph, of balls put in play against this pitcher.',
    howToRead: 'Lower is better for the pitcher. League average sits around 88–89 mph.',
    related: ['Hard-hit%', 'Barrel%'],
  } },
{ key: 'barrel_pct', label: 'Barrel%', higherIsBetter: false, percentileEligible: true, format: pct(1),
  tooltip: {
    description: 'Share of batted balls hit with the ideal exit-velocity-and-launch-angle combo for extra bases.',
    howToRead: 'Lower is better for the pitcher. Under 6% is strong; over 10% means hitters are barreling him up regularly.',
    related: ['Hard-hit%', 'HR/FB'],
  } },
      { key: 'soft_contact_pct', label: 'Soft%', tooltip: 'Share of batted balls classified as soft contact. Higher is better.', format: pct(1), higherIsBetter: true },
      { key: 'medium_contact_pct', label: 'Medium%', tooltip: 'Share of batted balls classified as medium contact.', format: pct(1), higherIsBetter: false },
      { key: 'hard_contact_pct', label: 'Hard%', tooltip: 'Share of batted balls classified as hard contact. Lower is better.', format: pct(1), higherIsBetter: false },
      { key: 'gb_percent', label: 'GB%', tooltip: 'Ground-ball rate. Ground-ball pitchers limit home runs.', format: pct(1), higherIsBetter: true },
      { key: 'fb_percent', label: 'FB%', tooltip: 'Fly-ball rate.', format: pct(1), higherIsBetter: false },
      { key: 'line_drive_pct', label: 'LD%', tooltip: 'Line-drive rate — the most damaging batted-ball type. Lower is better.', format: pct(1), higherIsBetter: false },
      { key: 'hr_per_fb', label: 'HR/FB', tooltip: 'Home runs per fly ball allowed. Lower is better.', format: pct(1), higherIsBetter: false },
    ],
  },
  {
    title: 'Plate discipline induced',
    stats: [
     { key: 'k_pct', label: 'K%', higherIsBetter: true, percentileEligible: true, format: pct(1),
  tooltip: {
    description: 'Share of plate appearances that end in a strikeout.',
    howToRead: 'Higher is better for the pitcher. Over 28% is elite; league average is around 22%.',
    formula: 'K% = Strikeouts / Plate Appearances',
    related: ['K/9', 'SwStr%', 'Whiff%'],
  } },
{ key: 'bb_pct', label: 'BB%', higherIsBetter: false, percentileEligible: true, format: pct(1),
  tooltip: {
    description: 'Share of plate appearances that end in a walk.',
    howToRead: 'Lower is better. Under 6% is excellent command; over 10% is a problem.',
    formula: 'BB% = Walks / Plate Appearances',
    related: ['BB/9', '1st-pitch strike%'],
  } },
{ key: 'whiff_pct', label: 'Whiff%', higherIsBetter: true, percentileEligible: true, format: pct(1),
  tooltip: {
    description: 'Of all swings taken against this pitcher, the share that miss entirely.',
    howToRead: 'Higher is better. Over 30% is elite swing-and-miss stuff.',
    related: ['K%', 'SwStr%', 'Chase%'],
  } },
{ key: 'swstr_pct', label: 'SwStr%', higherIsBetter: true, percentileEligible: true, format: pct(1),
  tooltip: {
    description: 'Swinging strikes as a share of every pitch thrown — not just swings.',
    howToRead: 'Higher is better. Over 13% is elite; under 8% is below average.',
    related: ['Whiff%', 'K%'],
  } },
{ key: 'chase_rate', label: 'Chase%', higherIsBetter: true, percentileEligible: true, format: pct(1),
  tooltip: {
    description: 'How often batters swing at pitches outside the strike zone against this pitcher.',
    howToRead: 'Higher is better for the pitcher — it means deception is working.',
    related: ['Zone contact%', 'Whiff%'],
  } },
{ key: 'zone_contact_rate', label: 'Zone contact%', higherIsBetter: false, percentileEligible: true, format: pct(1),
  tooltip: {
    description: 'Contact rate batters make on pitches inside the strike zone.',
    howToRead: 'Lower is better for the pitcher — it means even hittable pitches are getting missed.',
    related: ['Chase%', 'Whiff%'],
  } },
      { key: 'first_pitch_strike_pct', label: '1st-pitch strike%', tooltip: 'First-pitch strikes thrown. Higher is better.', format: pct(1), higherIsBetter: true, percentileEligible: true },
    ],
  },
  {
    title: 'Splits',
    stats: [
      { key: 'home_era', label: 'Home ERA', tooltip: 'ERA in home starts.', format: dp(2), higherIsBetter: false },
      { key: 'away_era', label: 'Away ERA', tooltip: 'ERA in road starts.', format: dp(2), higherIsBetter: false },
      { key: 'vs_lhb_baa', label: 'BAA vs LHB', tooltip: 'Batting average against, vs left-handed batters. Lower is better.', format: dp(3), higherIsBetter: false },
      { key: 'vs_rhb_baa', label: 'BAA vs RHB', tooltip: 'Batting average against, vs right-handed batters. Lower is better.', format: dp(3), higherIsBetter: false },
    ],
  },
  {
    title: 'Situational',
    stats: [
      { key: 'days_rest', label: 'Days rest', tooltip: 'Days since this pitcher\u2019s last appearance.', format: int(), higherIsBetter: true },
      { key: 'pitch_count_last', label: 'Last pitch count', tooltip: 'Pitches thrown in the most recent outing.', format: int(), higherIsBetter: false },
      { key: 'avg_pitch_count', label: 'Avg pitch count', tooltip: 'Average pitches per outing this season.', format: int(), higherIsBetter: false },
      { key: 'quality_start_pct', label: 'Quality start%', tooltip: 'Share of starts with 6+ IP and \u22643 ER. Higher is better.', format: pct(1), higherIsBetter: true },
      { key: 'strand_rate', label: 'Strand%', tooltip: 'Share of baserunners left on base. Higher is better.', format: pct(1), higherIsBetter: true },
      { key: 'season_ip_pace', label: 'IP pace', tooltip: 'Recent innings-per-start pace.', format: dp(1), higherIsBetter: true },
    ],
  },
  {
    title: 'Advanced',
    stats: [
      { key: 'xera', label: 'xERA', tooltip: 'Expected ERA based on quality of contact allowed, independent of results. Lower is better.', format: dp(2), higherIsBetter: false },
      { key: 'xwoba_allowed', label: 'xwOBA allowed', tooltip: 'Expected wOBA allowed, based on contact quality. Lower is better.', format: dp(3), higherIsBetter: false },
      { key: 'babip', label: 'BABIP', tooltip: 'Batting average on balls in play. Extreme values often regress. League average is around .300.', format: dp(3), higherIsBetter: false },
      { key: 'fip_minus', label: 'FIP-', tooltip: 'FIP scaled to league average (100). Below 100 is better.', format: dp(0), higherIsBetter: false, advanced: true },
      { key: 'era_minus', label: 'ERA-', tooltip: 'ERA scaled to league average (100). Below 100 is better.', format: dp(0), higherIsBetter: false, advanced: true },
      { key: 'war', label: 'WAR', tooltip: 'Wins Above Replacement. Higher is better.', format: dp(1), higherIsBetter: true, advanced: true },
    ],
  },
]

// ─── Percentile-eligible pitcher metrics ────────────────────────────────
// Whitelist used by the percentile route below — never pass an
// un-whitelisted column name into a Supabase .select().
export const PITCHER_PERCENTILE_METRICS: Record<string, { higherIsBetter: boolean }> =
  Object.fromEntries(
    PITCHER_STAT_GROUPS.flatMap(g => g.stats)
      .filter(s => s.percentileEligible)
      .map(s => [s.key, { higherIsBetter: s.higherIsBetter }])
  )

// ─── TEAM CONTEXT (used on batter cards, labeled as team-level) ─────────

export const TEAM_CONTEXT_GROUPS: StatGroup[] = [
  {
    title: 'Team offense (L30)',
    stats: [
      { key: 'wrc_plus_l30', label: 'wRC+', tooltip: 'Weighted runs created, scaled to league average (100). Higher is better.', format: int(), higherIsBetter: true },
      { key: 'ops_l30', label: 'OPS', tooltip: 'On-base plus slugging, last 30 days.', format: dp(3), higherIsBetter: true },
      { key: 'woba_l30', label: 'wOBA', tooltip: 'Weighted on-base average, last 30 days.', format: dp(3), higherIsBetter: true },
      { key: 'xwoba_l30', label: 'xwOBA', tooltip: 'Expected wOBA based on contact quality, last 30 days.', format: dp(3), higherIsBetter: true },
      { key: 'iso', label: 'ISO', tooltip: 'Isolated power — extra bases per at-bat.', format: dp(3), higherIsBetter: true },
      { key: 'barrel_pct', label: 'Barrel%', tooltip: 'Share of batted balls barreled up.', format: pct(1), higherIsBetter: true },
      { key: 'hard_hit_pct', label: 'Hard-hit%', tooltip: 'Share of batted balls hit 95+ mph.', format: pct(1), higherIsBetter: true },
      { key: 'chase_rate', label: 'Chase%', tooltip: 'Swings outside the zone. Lower is better for the hitter.', format: pct(1), higherIsBetter: false },
      { key: 'k_pct', label: 'K%', tooltip: 'Strikeout rate. Lower is better for the hitter.', format: pct(1), higherIsBetter: false },
      { key: 'bb_pct', label: 'BB%', tooltip: 'Walk rate. Higher is better for the hitter.', format: pct(1), higherIsBetter: true },
      { key: 'sprint_speed_avg', label: 'Sprint speed', tooltip: 'Average sprint speed, ft/sec.', format: dp(1), higherIsBetter: true },
    ],
  },
  {
    title: 'Team situational',
    stats: [
      { key: 'ops_with_risp', label: 'OPS w/ RISP', tooltip: 'OPS with runners in scoring position.', format: dp(3), higherIsBetter: true },
      { key: 'avg_with_risp', label: 'AVG w/ RISP', tooltip: 'Batting average with runners in scoring position.', format: dp(3), higherIsBetter: true },
      { key: 'lob_pct', label: 'LOB%', tooltip: 'Runners left on base rate.', format: pct(1), higherIsBetter: false },
      { key: 'gdp_per_game', label: 'GDP/game', tooltip: 'Double plays grounded into, per game.', format: dp(2), higherIsBetter: false },
      { key: 'wrc_plus_vs_lhp', label: 'wRC+ vs LHP', tooltip: 'Team wRC+ against left-handed pitching.', format: int(), higherIsBetter: true },
      { key: 'wrc_plus_vs_rhp', label: 'wRC+ vs RHP', tooltip: 'Team wRC+ against right-handed pitching.', format: int(), higherIsBetter: true },
    ],
  },
  {
    title: 'Team defense',
    stats: [
      { key: 'oaa', label: 'OAA', tooltip: 'Outs Above Average — total team defensive value. Higher is better.', format: dp(1), higherIsBetter: true },
      { key: 'drs', label: 'DRS', tooltip: 'Defensive Runs Saved. Higher is better.', format: int(), higherIsBetter: true },
      { key: 'defensive_efficiency', label: 'Def. efficiency', tooltip: 'Share of balls in play converted to outs.', format: pct(1), higherIsBetter: true },
      { key: 'fielding_pct', label: 'Fielding%', tooltip: 'Plays made cleanly, of total chances.', format: dp(3), higherIsBetter: true },
    ],
  },
  {
    title: 'Team bullpen',
    stats: [
      { key: 'bullpen_era', label: 'Bullpen ERA', tooltip: 'Relief-pitching ERA.', format: dp(2), higherIsBetter: false },
      { key: 'bullpen_era_l14', label: 'Bullpen ERA (L14)', tooltip: 'Relief ERA, last 14 days.', format: dp(2), higherIsBetter: false },
      { key: 'bullpen_k_per_9', label: 'Bullpen K/9', tooltip: 'Relief strikeouts per 9 innings.', format: dp(1), higherIsBetter: true },
      { key: 'bullpen_whip_l14', label: 'Bullpen WHIP (L14)', tooltip: 'Relief WHIP, last 14 days.', format: dp(2), higherIsBetter: false },
      { key: 'bullpen_ip_last_3', label: 'Bullpen IP (L3)', tooltip: 'Relief innings thrown across the last 3 games — fatigue signal.', format: dp(1), higherIsBetter: false },
    ],
  },
]
// View-mode filtering — "Offense/Core" shows just these groups, "Advanced"
// shows everything. Referencing titles rather than restructuring the
// group arrays above keeps this additive, not a rewrite.
export const PITCHER_CORE_GROUP_TITLES = new Set(['Season', 'Last 3 starts'])
export const BATTER_CORE_GROUP_TITLES = new Set(['Season line', 'Power'])
export const TEAM_CORE_GROUP_TITLES = new Set(['Team offense (L30)', 'Team situational'])

// Batter stat defs don't carry higherIsBetter (MLB's strings, not our
// numbers) — this covers the handful where lower is actually better, for
// compare-mode highlighting.
export const BATTER_LOWER_IS_BETTER = new Set(['strikeOuts', 'groundIntoDoublePlay', 'caughtStealing'])
export function batterHigherIsBetter(key: string): boolean {
  return !BATTER_LOWER_IS_BETTER.has(key)
}
// ─── BATTER CARD ─────────────────────────────────────────────────────────
// Unlike pitcher/team stats, batter values arrive as pre-formatted strings
// straight from MLB's API (getPlayerSeasonStats in lab.ts) — MLB returns
// ".285" not 0.285. So no `format()` function here, just grouping +
// tooltip + percentile-eligibility metadata. percentileEligible keys must
// match a key in lib/lab.ts's LEADER_METRICS exactly.

export type BatterStatMeta = {
  key: string
  label: string
  tooltip: StatTooltip
  percentileEligible?: boolean
}

// Simple WCAG-style luminance check — same pattern already used in
// share-card/[gamePk]/route.tsx for picking readable text on team colors.
export function textColorForBg(hex: string): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return '#FAF8F3'
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum < 0.5 ? '#FAF8F3' : '#1A1A1A'
}

export type StatTooltip = string | {
  description: string
  howToRead?: string
  formula?: string
  related?: string[]
}

export type BatterStatGroup = { title: string; stats: BatterStatMeta[] }

export const BATTER_STAT_GROUPS: BatterStatGroup[] = [
  {
    title: 'Season line',
    stats: [
     { key: 'avg', label: 'AVG', percentileEligible: true,
  tooltip: { description: 'Batting average — hits divided by at-bats.', howToRead: 'Higher is better. .300+ is excellent, .250 is roughly league average.', formula: 'AVG = Hits / At-Bats', related: ['OBP', 'SLG'] } },
{ key: 'obp', label: 'OBP', percentileEligible: true,
  tooltip: { description: 'On-base percentage — how often a batter reaches base by any means: hit, walk, or hit-by-pitch.', howToRead: 'Higher is better. Over .360 is strong; league average is around .320.', formula: 'OBP = (Hits + Walks + HBP) / (AB + Walks + HBP + Sac Flies)', related: ['AVG', 'BB'] } },
{ key: 'slg', label: 'SLG', percentileEligible: true,
  tooltip: { description: 'Slugging percentage — total bases earned per at-bat, rewarding extra-base hits.', howToRead: 'Higher is better. Over .450 is strong power output.', formula: 'SLG = Total Bases / At-Bats', related: ['OPS', 'ISO'] } },
{ key: 'ops', label: 'OPS', percentileEligible: true,
  tooltip: { description: 'On-base plus slugging — a single number combining getting on base and hitting for power.', howToRead: 'Higher is better. Over .850 is very good; over 1.000 is elite.', formula: 'OPS = OBP + SLG', related: ['OBP', 'SLG', 'wOBA'] } },
{ key: 'homeRuns', label: 'HR', percentileEligible: true,
  tooltip: { description: 'Total home runs hit this season.', howToRead: 'Higher is better — raw power production count.' } },
{ key: 'rbi', label: 'RBI', percentileEligible: true,
  tooltip: { description: 'Runs batted in — runs that scored as a direct result of this batter\u2019s plate appearance.', howToRead: 'Higher is better, though it\u2019s influenced by lineup spot and opportunity, not just skill.' } },
      { key: 'runs', label: 'R', tooltip: 'Runs scored.' },
      { key: 'hits', label: 'H', tooltip: 'Total hits.', percentileEligible: true },
    ],
  },
  {
    title: 'Power',
    stats: [
      { key: 'doubles', label: '2B', tooltip: 'Doubles.', percentileEligible: true },
      { key: 'triples', label: '3B', tooltip: 'Triples.', percentileEligible: true },
      { key: 'totalBases', label: 'TB', tooltip: 'Total bases — 1 for a single, 2 for a double, up to 4 for a homer.', percentileEligible: true },
      { key: 'atBatsPerHomeRun', label: 'AB/HR', tooltip: 'At-bats needed per home run. Lower means more power.' },
      { key: 'babip', label: 'BABIP', tooltip: 'Batting average on balls in play. Extreme values often regress toward .300.' },
    ],
  },
  {
    title: 'Plate discipline',
    stats: [
      { key: 'baseOnBalls', label: 'BB', tooltip: 'Walks drawn.', percentileEligible: true },
      { key: 'strikeOuts', label: 'K', tooltip: 'Strikeouts. Fewer is generally better.', percentileEligible: true },
      { key: 'hitByPitch', label: 'HBP', tooltip: 'Times hit by a pitch.' },
      { key: 'plateAppearances', label: 'PA', tooltip: 'Total plate appearances this season.' },
      { key: 'atBats', label: 'AB', tooltip: 'Total at-bats this season.' },
    ],
  },
  {
    title: 'Baserunning',
    stats: [
      { key: 'stolenBases', label: 'SB', tooltip: 'Stolen bases.', percentileEligible: true },
      { key: 'caughtStealing', label: 'CS', tooltip: 'Times caught stealing.' },
      { key: 'stolenBasePercentage', label: 'SB%', tooltip: 'Success rate on stolen base attempts.' },
    ],
  },
  {
  title: 'Advanced (Statcast)',
  stats: [
    { key: 'xba', label: 'xBA', tooltip: { description: 'Expected batting average, based purely on the quality of contact — exit velocity and launch angle — stripping out luck and defense.', howToRead: 'If xBA is well above actual AVG, positive regression is likely coming.', related: ['AVG', 'xSLG'] } },
    { key: 'xslg', label: 'xSLG', tooltip: { description: 'Expected slugging percentage based on contact quality alone.', howToRead: 'A gap between SLG and xSLG suggests luck, not skill, is driving the difference.', related: ['SLG', 'xBA'] } },
    { key: 'xwoba', label: 'xwOBA', tooltip: { description: 'Expected weighted on-base average — the most complete Statcast-era measure of overall offensive contact quality.', howToRead: 'Higher is better. Over .370 is excellent.', related: ['xBA', 'xSLG'] } },
    { key: 'avg_exit_velocity', label: 'Avg EV', tooltip: { description: 'Average exit velocity, in mph, of balls this batter puts in play.', howToRead: 'Higher is better. Above 90 mph is above average; elite hitters sit above 92 mph.' } },
    { key: 'max_exit_velocity', label: 'Max EV', tooltip: { description: 'The single hardest-hit ball this batter has recorded this season, in mph.' } },
    { key: 'hard_hit_pct', label: 'Hard-hit%', tooltip: { description: 'Share of batted balls hit 95+ mph off the bat.', howToRead: 'Higher is better. Over 45% is strong.' } },
    { key: 'barrel_pct', label: 'Barrel%', tooltip: { description: 'Share of batted balls hit with the ideal exit-velocity-and-launch-angle combination.', howToRead: 'League average is 6–7%. Above 10% is elite power.' } },
    { key: 'sweet_spot_pct', label: 'Sweet spot%', tooltip: { description: 'Share of batted balls hit at the optimal launch angle range (8–32°) for offensive value.' } },
    { key: 'sprint_speed', label: 'Sprint speed', tooltip: { description: 'Top running speed, in feet per second, over a player\u2019s fastest one-second window.', howToRead: 'League average is around 27 ft/s. Elite runners exceed 29 ft/s.' } },
    { key: 'k_pct', label: 'K% (Statcast)', tooltip: 'Strikeout rate, sourced from Statcast rather than the season-total split above — may differ slightly by sample.' },
    { key: 'bb_pct', label: 'BB% (Statcast)', tooltip: 'Walk rate, sourced from Statcast rather than the season-total split above — may differ slightly by sample.' },
  ],
},
  {
    title: 'Situational',
    stats: [
      { key: 'sacFlies', label: 'SF', tooltip: 'Sacrifice flies.' },
      { key: 'groundIntoDoublePlay', label: 'GIDP', tooltip: 'Grounded into a double play. Lower is better.' },
      { key: 'leftOnBase', label: 'LOB', tooltip: 'Runners left on base.' },
    ],
  },
]