// src/lib/dashboard/stats.ts
//
// The stats a My x9Lab dashboard can show: one curated list per role, each a key in league_player_stats.stats (Baseball Savant's season leaderboard,
// written by scripts/build_league_player_stats.py). `free` marks the ones a free account can use; Pro opens all of them. `better` says which way is good for
// the player, so leaderboards and colours read the right way round. Client-safe (no server imports).

export type Role = 'batter' | 'pitcher'
export type StatDef = { key: string; label: string; role: Role; decimals: number; better: 'high' | 'low'; free: boolean; unit?: '%' | 'mph' | '°'; noLeadingZero?: boolean }

const B = (key: string, label: string, decimals: number, better: 'high' | 'low', free: boolean, extra: Partial<StatDef> = {}): StatDef => ({ key, label, role: 'batter', decimals, better, free, ...extra })
const P = (key: string, label: string, decimals: number, better: 'high' | 'low', free: boolean, extra: Partial<StatDef> = {}): StatDef => ({ key, label, role: 'pitcher', decimals, better, free, ...extra })

export const STATS: StatDef[] = [
  // batters: counting
  B('home_run', 'Home runs', 0, 'high', true), B('hit', 'Hits', 0, 'high', true), B('b_rbi', 'RBI', 0, 'high', true), B('r_total_stolen_base', 'Stolen bases', 0, 'high', true),
  B('double', 'Doubles', 0, 'high', false), B('triple', 'Triples', 0, 'high', false), B('walk', 'Walks', 0, 'high', false), B('strikeout', 'Strikeouts', 0, 'low', true),
  B('ab', 'At-bats', 0, 'high', true), B('pa', 'Plate appearances', 0, 'high', true),
  // batters: rates
  B('batting_avg', 'Batting average', 3, 'high', true, { noLeadingZero: true }), B('on_base_percent', 'On-base %', 3, 'high', true, { noLeadingZero: true }),
  B('slg_percent', 'Slugging', 3, 'high', true, { noLeadingZero: true }), B('on_base_plus_slg', 'OPS', 3, 'high', true, { noLeadingZero: true }),
  B('isolated_power', 'Isolated power', 3, 'high', false, { noLeadingZero: true }), B('babip', 'BABIP', 3, 'high', false, { noLeadingZero: true }),
  B('woba', 'wOBA', 3, 'high', true, { noLeadingZero: true }), B('xwoba', 'xwOBA', 3, 'high', false, { noLeadingZero: true }), B('xba', 'xBA', 3, 'high', false, { noLeadingZero: true }), B('xslg', 'xSLG', 3, 'high', false, { noLeadingZero: true }),
  B('k_percent', 'Strikeout %', 1, 'low', true, { unit: '%' }), B('bb_percent', 'Walk %', 1, 'high', true, { unit: '%' }),
  // batters: contact quality and approach
  B('exit_velocity_avg', 'Average exit velocity', 1, 'high', false, { unit: 'mph' }), B('launch_angle_avg', 'Average launch angle', 1, 'high', false, { unit: '°' }),
  B('barrel_batted_rate', 'Barrel %', 1, 'high', false, { unit: '%' }), B('hard_hit_percent', 'Hard-hit %', 1, 'high', false, { unit: '%' }), B('sweet_spot_percent', 'Sweet-spot %', 1, 'high', false, { unit: '%' }),
  B('whiff_percent', 'Whiff %', 1, 'low', false, { unit: '%' }), B('oz_swing_percent', 'Chase %', 1, 'low', false, { unit: '%' }), B('pull_percent', 'Pull %', 1, 'high', false, { unit: '%' }),
  B('groundballs_percent', 'Ground-ball %', 1, 'low', false, { unit: '%' }), B('flyballs_percent', 'Fly-ball %', 1, 'high', false, { unit: '%' }), B('sprint_speed', 'Sprint speed', 1, 'high', false, { unit: 'mph' }),
  // pitchers
  P('p_era', 'ERA', 2, 'low', true), P('xera', 'xERA', 2, 'low', false), P('p_win', 'Wins', 0, 'high', true), P('p_save', 'Saves', 0, 'high', true), P('p_hold', 'Holds', 0, 'high', false), P('p_quality_start', 'Quality starts', 0, 'high', false),
  P('p_strikeout', 'Strikeouts', 0, 'high', true), P('p_walk', 'Walks', 0, 'low', false), P('p_home_run', 'Home runs allowed', 0, 'low', false), P('p_ip', 'Innings pitched', 1, 'high', true), P('p_game', 'Games', 0, 'high', false),
  P('k_pct', 'Strikeout %', 1, 'high', true, { unit: '%' }), P('bb_pct', 'Walk %', 1, 'low', false, { unit: '%' }), P('k_bb_pct', 'K minus BB %', 1, 'high', false, { unit: '%' }),
  P('k9', 'Strikeouts per 9', 2, 'high', false), P('bb9', 'Walks per 9', 2, 'low', false),
  P('whiff_percent', 'Whiff %', 1, 'high', true, { unit: '%' }), P('oz_swing_percent', 'Chase % induced', 1, 'high', false, { unit: '%' }), P('f_strike_percent', 'First-pitch strike %', 1, 'high', false, { unit: '%' }),
  P('woba', 'wOBA against', 3, 'low', false, { noLeadingZero: true }), P('xwoba', 'xwOBA against', 3, 'low', false, { noLeadingZero: true }), P('xba', 'xBA against', 3, 'low', false, { noLeadingZero: true }), P('xslg', 'xSLG against', 3, 'low', false, { noLeadingZero: true }),
  P('exit_velocity_avg', 'Exit velocity against', 1, 'low', false, { unit: 'mph' }), P('barrel_batted_rate', 'Barrel % against', 1, 'low', false, { unit: '%' }), P('hard_hit_percent', 'Hard-hit % against', 1, 'low', false, { unit: '%' }),
  P('groundballs_percent', 'Ground-ball %', 1, 'high', false, { unit: '%' }), P('ff_avg_speed', 'Four-seam velocity', 1, 'high', false, { unit: 'mph' }), P('ff_avg_spin', 'Four-seam spin', 0, 'high', false),
]

export const statsFor = (role: Role) => STATS.filter(s => s.role === role)
export const statDef = (role: Role, key: string) => STATS.find(s => s.role === role && s.key === key) ?? null
/** Stats a viewer may use: the free set, or everything for Pro. */
export const allowedStats = (role: Role, isPro: boolean) => statsFor(role).filter(s => isPro || s.free)

export function fmtStat(def: StatDef, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  let t = v.toFixed(def.decimals)
  if (def.noLeadingZero && Math.abs(v) < 1) t = t.replace(/^(-?)0\./, '$1.')
  return def.unit === '%' ? `${t}%` : def.unit === 'mph' ? `${t} mph` : def.unit === '°' ? `${t}°` : t
}
