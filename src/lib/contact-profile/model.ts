// src/lib/contact-profile/model.ts
//
// Pure (no server imports) model for the Contact tab and the Contact Engine. Rows come from batter_contact_profile
// (migration 20261021120000, written by scripts/build_contact_profile.py): COUNTS per batter × season × period, so any
// rate can show the n behind it. batter_id 0 is the league row (every batter added up).
//
// A batted ball is counted only when Statcast gave it launch_speed_angle, bb_type, hc_x and hc_y, so every group below adds
// up to n_bbe:   weak + topped + under + flare_burner + solid + barrel = n_bbe ;  gb + air = n_bbe ;
//                pull_gb + straight_gb + oppo_gb = gb ;  pull_air + straight_air + oppo_air = air.
// Spray direction is mirrored for left-handed batters (pull is always the pull side). Air = fly ball + line drive + popup.
// Descriptions only; nothing here looks forward.

export type Period = 'season' | 'month'

export type ContactRow = {
  batter_id: number; season: number; period: Period; month: number; name: string | null; team: string | null
  n_bbe: number
  weak: number; topped: number; under: number; flare_burner: number; solid: number; barrel: number
  gb: number; air: number
  pull_gb: number; straight_gb: number; oppo_gb: number; pull_air: number; straight_air: number; oppo_air: number
}

export const BUCKETS: { key: 'weak' | 'topped' | 'under' | 'flare_burner' | 'solid' | 'barrel'; label: string; bg: string; fg: string }[] = [
  { key: 'weak', label: 'Weak', bg: '#d9d3c4', fg: '#1A1A1A' },
  { key: 'topped', label: 'Topped', bg: '#bdb5a2', fg: '#1A1A1A' },
  { key: 'under', label: 'Under', bg: '#a39b8a', fg: '#fff' },
  { key: 'flare_burner', label: 'Flare / burner', bg: '#f4a574', fg: '#1A1A1A' },
  { key: 'solid', label: 'Solid contact', bg: '#ee6a36', fg: '#fff' },
  { key: 'barrel', label: 'Barrel', bg: '#8f2a0c', fg: '#fff' },
]

// ---------- reliability (sample size) ----------
export const MIN_SHOWN = 30        // fewer batted balls than this is not shown at all
export const STABLE_BBE = 150
export const MODERATE_BBE = 75
export const MIN_LEADERBOARD = 100 // the Contact Engine lists hitters with at least this many batted balls
export const MIN_MONTH_POINT = 30  // a monthly point needs this many batted balls
export type Reliability = 'stable' | 'moderate' | 'thin'
export const tierOf = (n: number): Reliability | null => (n >= STABLE_BBE ? 'stable' : n >= MODERATE_BBE ? 'moderate' : n >= MIN_SHOWN ? 'thin' : null)
export const TIER_LABEL: Record<Reliability, string> = { stable: 'Stable', moderate: 'Moderate', thin: 'Thin' }

// ---------- rates ----------
export type MetricKey = 'pullAir' | 'barrel' | 'solidBarrel' | 'gb' | 'pull'
export const METRICS: { key: MetricKey; label: string; define: string }[] = [
  { key: 'pullAir', label: 'Pull AIR%', define: 'pulled fly balls, line drives and popups ÷ all batted balls' },
  { key: 'barrel', label: 'Barrel%', define: 'barrels ÷ all batted balls' },
  { key: 'solidBarrel', label: 'Solid + barrel%', define: 'solid contact and barrels ÷ all batted balls' },
  { key: 'gb', label: 'Ground-ball%', define: 'ground balls ÷ all batted balls' },
  { key: 'pull', label: 'Pull%', define: 'balls hit to his pull side ÷ all batted balls' },
]
/** the count behind a metric (numerator) */
export function numerator(r: ContactRow, k: MetricKey): number {
  switch (k) {
    case 'pullAir': return r.pull_air
    case 'barrel': return r.barrel
    case 'solidBarrel': return r.solid + r.barrel
    case 'gb': return r.gb
    case 'pull': return r.pull_gb + r.pull_air
  }
}
export const rate = (r: ContactRow | null | undefined, k: MetricKey): number | null => (r && r.n_bbe > 0 ? numerator(r, k) / r.n_bbe : null)

export const MONTH_NAMES = ['', '', '', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']
// month numbers are calendar months; the builder only reads game days from March 15 to November 10
export const monthLabel = (m: number) => ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m] ?? String(m)

// ---------- what the pages receive ----------
export type ContactProfile = {
  batterId: number; name: string | null; team: string | null
  season: number                      // the season shown (the latest he has)
  seasons: ContactRow[]               // his season rows, oldest first
  months: ContactRow[]                // his month rows of `season`, calendar order
  league: { seasons: ContactRow[]; months: ContactRow[] } // batter_id 0 rows, same shapes
}

export type LeaderRow = { id: number; name: string; team: string | null; n: number; barrel: number; pullAir: number; pull: number; gb: number }
export type ContactLeaders = { season: number; seasons: number[]; rows: LeaderRow[]; league: ContactRow | null }

export const toLeader = (r: ContactRow): LeaderRow => ({
  id: r.batter_id, name: r.name ?? `#${r.batter_id}`, team: r.team, n: r.n_bbe,
  barrel: r.barrel / r.n_bbe, pullAir: r.pull_air / r.n_bbe, pull: (r.pull_gb + r.pull_air) / r.n_bbe, gb: r.gb / r.n_bbe,
})
