// src/lib/usage-strip/types.ts
//
// Shared types for <UsageStrip>, the "N game average usage" card used on both
// NFL and NHL team/player pages. This file does not exist anywhere in the repo
// yet (neither does the KAN-18 NFL snap-share work it's meant to share with),
// so this IS the canonical definition -- KAN-18, when it lands, imports from
// here rather than defining its own and extends UsageMetric/METRIC_SPECS
// rather than forking the component. See the N2 STOP summary for the full
// reasoning.
//
// FIELD NAMING: lastPct/l3Pct/seasonPct carry the metric's VALUE (a share for
// toi_*/snap metrics, a plain count for shifts, seconds for avg_shift) and
// lastSnaps/l3Snaps/seasonSnaps carry the RAW amount behind it -- named after
// NFL's snap-share origin, kept as-is for every sport so one field name never
// means two different things. "l3" means "the metric's own windowN window":
// 3 games for NFL snap metrics, 5 for NHL's.

export type SnapMetric = 'offense' | 'defense' | 'st'
export type NhlDeploymentMetric = 'nhl_toi_5v5' | 'nhl_toi_ev' | 'nhl_toi_pp' | 'nhl_toi_sh' | 'nhl_shifts' | 'nhl_avg_shift'
export type UsageMetric = SnapMetric | NhlDeploymentMetric

export interface MetricSpec {
  label: string
  valueKind: 'share' | 'count' | 'seconds'
  rawUnit: 'snaps' | 'min' | 'shifts' | 's'
  windowN: 3 | 5
  deltaMin: number
  emptyCopy: string
  foot: string[]
}

export const METRIC_SPECS: Record<UsageMetric, MetricSpec> = {
  offense: {
    label: 'Offensive snaps',
    valueKind: 'share',
    rawUnit: 'snaps',
    windowN: 3,
    deltaMin: 10,
    emptyCopy: 'No offensive snap data yet this season.',
    foot: ['Source: nflverse (CC-BY 4.0).', 'Snap counts: Pro Football Reference via nflverse (grade U).'],
  },
  defense: {
    label: 'Defensive snaps',
    valueKind: 'share',
    rawUnit: 'snaps',
    windowN: 3,
    deltaMin: 10,
    emptyCopy: 'No defensive snap data yet this season.',
    foot: ['Source: nflverse (CC-BY 4.0).', 'Snap counts: Pro Football Reference via nflverse (grade U).'],
  },
  st: {
    label: 'Special teams snaps',
    valueKind: 'share',
    rawUnit: 'snaps',
    windowN: 3,
    deltaMin: 10,
    emptyCopy: 'No special-teams snap data yet this season.',
    foot: ['Source: nflverse (CC-BY 4.0).', 'Snap counts: Pro Football Reference via nflverse (grade U).'],
  },
  nhl_toi_5v5: {
    label: '5-on-5 ice time',
    valueKind: 'share',
    rawUnit: 'min',
    windowN: 5,
    deltaMin: 8,
    emptyCopy: 'No 5-on-5 ice-time data yet.',
    foot: ['Source: NHL.', 'EV/PP/SH split is computed by x9Lab from play-by-play and shift data, not an NHL figure.'],
  },
  nhl_toi_ev: {
    label: 'Even-strength ice time',
    valueKind: 'share',
    rawUnit: 'min',
    windowN: 5,
    deltaMin: 8,
    emptyCopy: 'No even-strength ice-time data yet.',
    foot: ['Source: NHL.', 'EV/PP/SH split is computed by x9Lab from play-by-play and shift data, not an NHL figure.'],
  },
  nhl_toi_pp: {
    label: 'Power-play ice time',
    valueKind: 'share',
    rawUnit: 'min',
    windowN: 5,
    deltaMin: 8,
    emptyCopy: 'No power-play ice-time data yet.',
    foot: ['Source: NHL.', 'EV/PP/SH split is computed by x9Lab from play-by-play and shift data, not an NHL figure.'],
  },
  nhl_toi_sh: {
    label: 'Penalty-kill ice time',
    valueKind: 'share',
    rawUnit: 'min',
    windowN: 5,
    deltaMin: 8,
    emptyCopy: 'No penalty-kill ice-time data yet.',
    foot: ['Source: NHL.', 'EV/PP/SH split is computed by x9Lab from play-by-play and shift data, not an NHL figure.'],
  },
  nhl_shifts: {
    label: 'Shifts per game',
    valueKind: 'count',
    rawUnit: 'shifts',
    windowN: 5,
    deltaMin: 3,
    emptyCopy: 'No shift data yet.',
    foot: ['Source: NHL.', 'Shift counts are de-duplicated from the NHL shift chart, not an NHL figure.'],
  },
  nhl_avg_shift: {
    label: 'Average shift length',
    valueKind: 'seconds',
    rawUnit: 's',
    windowN: 5,
    deltaMin: 3,
    emptyCopy: 'No shift data yet.',
    foot: ['Source: NHL.', 'Average shift length is computed by x9Lab from de-duplicated shift intervals.'],
  },
}

export interface StripRow {
  playerId: number | string
  name: string
  position?: string | null
  teamAbbr?: string
  lastPct: number | null
  l3Pct: number | null
  seasonPct: number | null
  lastSnaps: number | null
  l3Snaps: number | null
  seasonSnaps: number | null
  n: number // games played in the window (honest-n)
  trend?: 'up' | 'down' | null
  streak?: number
}

export interface StripData {
  rows: StripRow[]
  throughLabel?: string // e.g. "through 3 Oct · 4 games"; falls back to "through Wk N" in NFL callers
  extraFoot?: string // honest-n line appended to the card's Foot, e.g.
  // "4 games · 243 team PP minutes · 1 game excluded (ice-time check failed)"
}

export interface UsageStripTeam {
  id: number | string
  nick: string
  color: string
}

export interface UsageStripProps {
  team?: UsageStripTeam // optional: absent for mixed-team rows (My Team / risers boards)
  title?: string // used instead of `team` when team is absent
  metric: UsageMetric
  data: StripData
  limit?: number
}
