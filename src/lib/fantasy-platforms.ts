/**
 * src/lib/fantasy-platforms.ts
 *
 * Scoring translator: takes a pitcher's projected stat line and converts it
 * into points across 5 major fantasy platforms.
 *
 * Each platform's formula is encoded as a pure function so it's easy to verify
 * against their official scoring docs.
 *
 * Default scoring as of June 2026 — Yahoo, ESPN, Sleeper use H2H Points (most common).
 * DraftKings is Classic MLB. CBS is Standard Points.
 */

export type ProjectedLine = {
  ip: number          // innings pitched (decimal — e.g. 5.7 = 5.2 innings in baseball notation? no — we use decimal: 5.7 = 5 IP and ~2/3)
  k: number           // strikeouts
  er: number          // earned runs
  bb: number          // walks
  h: number           // hits allowed
  win_prob: number    // 0-1 probability of a quality start with run support
  qs_prob: number     // 0-1 probability of a quality start (6+ IP, ≤3 ER)
}

export type PlatformScore = {
  platform: 'Yahoo' | 'ESPN' | 'Sleeper' | 'DraftKings' | 'CBS'
  points: number
  breakdown: {
    label: string
    value: number
    contribution: number
  }[]
  format: 'h2h_points' | 'dfs' | 'rotisserie'
}

// ─── Scoring formulas ─────────────────────────────────────────────────────────

/** Yahoo standard H2H Points */
function yahooPoints(line: ProjectedLine): PlatformScore {
  const b = [
    { label: 'IP',  value: line.ip, contribution: round1(line.ip * 2.25) },
    { label: 'K',   value: line.k,  contribution: round1(line.k * 1.0) },
    { label: 'W',   value: line.win_prob, contribution: round1(line.win_prob * 4) },
    { label: 'ER',  value: line.er, contribution: round1(line.er * -2) },
    { label: 'H',   value: line.h,  contribution: round1(line.h * -0.6) },
    { label: 'BB',  value: line.bb, contribution: round1(line.bb * -0.6) },
  ]
  return {
    platform: 'Yahoo',
    points: round1(b.reduce((sum, x) => sum + x.contribution, 0)),
    breakdown: b,
    format: 'h2h_points',
  }
}

/** ESPN standard H2H Points (popular default) */
function espnPoints(line: ProjectedLine): PlatformScore {
  const b = [
    { label: 'IP',  value: line.ip, contribution: round1(line.ip * 3.0) },
    { label: 'K',   value: line.k,  contribution: round1(line.k * 1.0) },
    { label: 'W',   value: line.win_prob, contribution: round1(line.win_prob * 5) },
    { label: 'QS',  value: line.qs_prob, contribution: round1(line.qs_prob * 3) },
    { label: 'ER',  value: line.er, contribution: round1(line.er * -1) },
    { label: 'BB',  value: line.bb, contribution: round1(line.bb * -1) },
    { label: 'H',   value: line.h,  contribution: round1(line.h * -1) },
  ]
  return {
    platform: 'ESPN',
    points: round1(b.reduce((sum, x) => sum + x.contribution, 0)),
    breakdown: b,
    format: 'h2h_points',
  }
}

/** Sleeper default H2H Points */
function sleeperPoints(line: ProjectedLine): PlatformScore {
  const b = [
    { label: 'IP',  value: line.ip, contribution: round1(line.ip * 2.25) },
    { label: 'K',   value: line.k,  contribution: round1(line.k * 1.0) },
    { label: 'W',   value: line.win_prob, contribution: round1(line.win_prob * 5) },
    { label: 'ER',  value: line.er, contribution: round1(line.er * -2) },
    { label: 'BB',  value: line.bb, contribution: round1(line.bb * -1) },
    { label: 'H',   value: line.h,  contribution: round1(line.h * -1) },
  ]
  return {
    platform: 'Sleeper',
    points: round1(b.reduce((sum, x) => sum + x.contribution, 0)),
    breakdown: b,
    format: 'h2h_points',
  }
}

/** DraftKings Classic MLB scoring */
function draftKingsPoints(line: ProjectedLine): PlatformScore {
  const b = [
    { label: 'IP',  value: line.ip, contribution: round1(line.ip * 2.25) },
    { label: 'K',   value: line.k,  contribution: round1(line.k * 2.0) },
    { label: 'W',   value: line.win_prob, contribution: round1(line.win_prob * 4) },
    { label: 'ER',  value: line.er, contribution: round1(line.er * -2) },
    { label: 'H',   value: line.h,  contribution: round1(line.h * -0.6) },
    { label: 'BB',  value: line.bb, contribution: round1(line.bb * -0.6) },
  ]
  return {
    platform: 'DraftKings',
    points: round1(b.reduce((sum, x) => sum + x.contribution, 0)),
    breakdown: b,
    format: 'dfs',
  }
}

/** CBS standard H2H Points */
function cbsPoints(line: ProjectedLine): PlatformScore {
  const b = [
    { label: 'IP',  value: line.ip, contribution: round1(line.ip * 3.0) },
    { label: 'K',   value: line.k,  contribution: round1(line.k * 0.5) },
    { label: 'W',   value: line.win_prob, contribution: round1(line.win_prob * 7) },
    { label: 'ER',  value: line.er, contribution: round1(line.er * -1) },
    { label: 'BB',  value: line.bb, contribution: round1(line.bb * -1) },
    { label: 'H',   value: line.h,  contribution: round1(line.h * -0.5) },
  ]
  return {
    platform: 'CBS',
    points: round1(b.reduce((sum, x) => sum + x.contribution, 0)),
    breakdown: b,
    format: 'h2h_points',
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Project a pitcher's line tonight based on:
 *  - their season averages (IP/start, K/9, BB/9, H/9, ER from FIP)
 *  - opponent's offensive quality (modifier on K and ER)
 *  - the streamer's signal score (high score → easier matchup → better line)
 */
export function projectLineFromPick(pick: {
  details?: any
  signal_score?: number | null
}): ProjectedLine {
  const d = pick.details ?? {}

  // Pull what we have, fall back to league averages
  const k9   = Number(d.k_per_9 ?? 8.8)
  const era  = Number(d.era ?? 4.20)
  const fip  = Number(d.fip ?? era)

  // Project IP — top streamers go deeper; weak ones get pulled early
  const score = pick.signal_score ?? 50
  const ipBoost = (score - 50) / 50   // -1 to +1
  const ip = clamp(5.5 + ipBoost * 1.0, 4.5, 6.8)

  // Opponent modifier from streamer details: higher opp score = weaker offence = more Ks, fewer ER
  const oppScore = Number(d.opponent ?? 50)
  const oppMod = (oppScore - 50) / 50   // weak offences boost K, suppress ER

  // K projection: K/9 × IP × opponent modifier
  const k = round1(clamp((k9 / 9) * ip * (1 + oppMod * 0.15), 0, 14))

  // ER projection: FIP-based with opponent modifier
  const erRate = fip / 9
  const er = round1(clamp(erRate * ip * (1 - oppMod * 0.20), 0, 6))

  // BB projection: typical SP averages 2.8 BB/9
  const bb = round1(clamp((2.8 / 9) * ip, 0.5, 4))

  // Hits projection: BABIP-stable, typical 8 H/9 with opponent modifier
  const h = round1(clamp((8 / 9) * ip * (1 - oppMod * 0.10), 2, 10))

  // Quality start probability: 6+ IP and ≤3 ER
  const qsProb = clamp((score - 40) / 80, 0.05, 0.85)
  const winProb = clamp((score - 35) / 100, 0.10, 0.65)

  return { ip, k, er, bb, h, win_prob: winProb, qs_prob: qsProb }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/** Score a projected line across all 5 platforms */
export function scoreAcrossPlatforms(line: ProjectedLine): PlatformScore[] {
  return [
    yahooPoints(line),
    espnPoints(line),
    sleeperPoints(line),
    draftKingsPoints(line),
    cbsPoints(line),
  ]
}

// ─── Platform metadata ────────────────────────────────────────────────────────
export const PLATFORM_META = {
  Yahoo:      { color: 'bg-purple-600', accent: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-200' },
  ESPN:       { color: 'bg-red-600',    accent: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-200' },
  Sleeper:    { color: 'bg-indigo-600', accent: 'text-indigo-700', bg: 'bg-indigo-50',  border: 'border-indigo-200' },
  DraftKings: { color: 'bg-green-700',  accent: 'text-green-800',  bg: 'bg-green-50',   border: 'border-green-200' },
  CBS:        { color: 'bg-blue-700',   accent: 'text-blue-800',   bg: 'bg-blue-50',    border: 'border-blue-200' },
} as const
