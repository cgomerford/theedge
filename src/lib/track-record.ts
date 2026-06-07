// src/lib/track-record.ts
//
// FACTOR ALIGNMENT ANALYSIS
//
// This replaces "prediction accuracy" with something fundamentally different.
//
// Old framing: "The model predicted X and was correct Y% of the time."
// New framing: "When N of 8 factors leaned one way, the outcome matched Z% of the time."
//
// Why: the old framing sounds like a betting tipster grading picks.
// The new framing is observational — it tells the reader which factor
// patterns are most predictive, without ever claiming "we called it."
//
// The computation is independent of `predicted_winner`. It looks at
// the raw components, counts how many favor each side, and checks
// whether the team with more factors actually won. Pure factor-vs-outcome.

import { createAdminClient } from '@/lib/supabase'

const supa = createAdminClient()

const MIN_SAMPLE_SIZE = 100

const COMPONENT_KEYS = [
  'starting_pitcher', 'bullpen', 'offense', 'matchup',
  'park', 'weather', 'defense', 'rest',
] as const

const COMPONENT_LABELS: Record<string, string> = {
  starting_pitcher: 'Starting Pitching',
  bullpen: 'Bullpen',
  offense: 'Offense',
  matchup: 'Pitch Matchups',
  park: 'Park Factor',
  weather: 'Weather',
  defense: 'Defense',
  rest: 'Rest & Travel',
}

// A component "favors" a side when its absolute value exceeds this.
// Below this threshold, the factor is neutral / too close to call.
// Matches the ±5 threshold used in the Matchup Tilt display.
const FACTOR_THRESHOLD = 5

// ─── Types ────────────────────────────────────────────────────────────────────

export type OverallStats = {
  total_reviewed: number
  total_matched: number
  alignment_percent: number | null
  insufficient_sample: boolean
  date_range_start: string | null
  date_range_end: string | null
}

export type FactorBracketStats = {
  label: string
  min_factors: number
  max_factors: number
  games: number
  matched: number
  alignment_percent: number | null
}

export type LeadingFactorStats = {
  factor_key: string
  factor_label: string
  games_led: number
  matched: number
  alignment_percent: number | null
}

export type RecentRead = {
  game_pk: number
  game_date: string
  home_team: string
  away_team: string
  factor_lean: 'home' | 'away' | 'split'
  lean_factors: number
  total_factors: number  // home + away (excludes neutral)
  actual_winner: 'home' | 'away'
  outcome_matched: boolean | null
  home_score: number | null
  away_score: number | null
}

// ─── Factor analysis helper ──────────────────────────────────────────────────
//
// For each game, count how many of the 8 components favor home vs away.
// Positive component value = home edge. Negative = away edge.
// Values between -5 and +5 are neutral (too close to call).
//
// This is the same ±5 threshold used in the Matchup Tilt bars on the site.

function analyzeFactors(components: Record<string, any>): {
  homeFactors: number
  awayFactors: number
  neutralFactors: number
  lean: 'home' | 'away' | 'split'
  leanCount: number
} {
  let home = 0
  let away = 0
  let neutral = 0

  for (const key of COMPONENT_KEYS) {
    // Supabase JSONB may return strings — always cast to number
    const val = Number(components[key] ?? 0)
    if (val > FACTOR_THRESHOLD) home++
    else if (val < -FACTOR_THRESHOLD) away++
    else neutral++
  }

  const lean: 'home' | 'away' | 'split' =
    home > away ? 'home' : away > home ? 'away' : 'split'

  return {
    homeFactors: home,
    awayFactors: away,
    neutralFactors: neutral,
    lean,
    leanCount: Math.max(home, away),
  }
}

// ─── Overall alignment stats ─────────────────────────────────────────────────
//
// "Across all reviewed games where factors leaned one way,
//  how often did the outcome match?"
//
// Split games (equal factors each way) are excluded — there's no lean to check.

export async function getOverallStats(): Promise<OverallStats> {
  const { data, error } = await supa
    .from('edge_predictions')
    .select('components, actual_winner, game_date')
    .not('graded_at', 'is', null)
    .not('actual_winner', 'is', null)

  if (error || !data) {
    return {
      total_reviewed: 0,
      total_matched: 0,
      alignment_percent: null,
      insufficient_sample: true,
      date_range_start: null,
      date_range_end: null,
    }
  }

  const analyzed = data
    .map(d => ({
      factors: analyzeFactors(d.components ?? {}),
      actual_winner: d.actual_winner as string,
      game_date: d.game_date as string,
    }))
    .filter(d => d.factors.lean !== 'split')

  const matched = analyzed.filter(d => d.factors.lean === d.actual_winner).length
  const dates = data
    .map(d => d.game_date as string)
    .filter(Boolean)
    .sort()

  return {
    total_reviewed: analyzed.length,
    total_matched: matched,
    alignment_percent:
      analyzed.length > 0 ? (matched / analyzed.length) * 100 : null,
    insufficient_sample: analyzed.length < MIN_SAMPLE_SIZE,
    date_range_start: dates[0] ?? null,
    date_range_end: dates[dates.length - 1] ?? null,
  }
}
// ============================================================
// INLINE CALIBRATION — for the game page trust strip
// ============================================================
export type InlineCalibration = {
  tier: string
  wins: number
  losses: number
  total: number
  accuracy_percent: number | null
  has_sample: boolean  // false if < 5 graded games for this tier
}

export async function getInlineCalibration(
  tier: string
): Promise<InlineCalibration> {
  const empty: InlineCalibration = {
    tier, wins: 0, losses: 0, total: 0,
    accuracy_percent: null, has_sample: false,
  }

  if (!['strong', 'moderate', 'slight'].includes(tier)) return empty

  const { data, error } = await supa
    .from('edge_predictions')
    .select('was_correct')
    .eq('confidence_tier', tier)
    .not('graded_at', 'is', null)
    .not('was_correct', 'is', null)

  if (error || !data) return empty

  const wins   = data.filter(d => d.was_correct === true).length
  const losses = data.filter(d => d.was_correct === false).length
  const total  = data.length

  return {
    tier,
    wins,
    losses,
    total,
    accuracy_percent: total > 0 ? (wins / total) * 100 : null,
    has_sample: total >= 5,
  }
}
// ─── Factor bracket stats ────────────────────────────────────────────────────
//
// Replaces the old tier stats (strong/moderate/slight).
// Groups by how many of 8 factors leaned one way:
//
//   7–8 factors aligned  →  strong lean
//   5–6 factors aligned  →  moderate lean
//   3–4 factors          →  near-split
//
// The question each bracket answers: "When this many factors agree,
// how often does the outcome follow?"

export async function getFactorBracketStats(): Promise<FactorBracketStats[]> {
  const { data, error } = await supa
    .from('edge_predictions')
    .select('components, actual_winner')
    .not('graded_at', 'is', null)
    .not('actual_winner', 'is', null)

  if (error || !data) return []

  const analyzed = data
    .map(d => ({
      factors: analyzeFactors(d.components ?? {}),
      actual_winner: d.actual_winner as string,
    }))
    .filter(d => d.factors.lean !== 'split')

  const brackets = [
    { label: '7–8 of 8 factors aligned', min: 7, max: 8 },
    { label: '5–6 of 8 factors aligned', min: 5, max: 6 },
    { label: '3–4 of 8 factors (near-split)', min: 3, max: 4 },
  ]

  return brackets.map(b => {
    const games = analyzed.filter(
      d => d.factors.leanCount >= b.min && d.factors.leanCount <= b.max,
    )
    const matched = games.filter(d => d.factors.lean === d.actual_winner).length

    return {
      label: b.label,
      min_factors: b.min,
      max_factors: b.max,
      games: games.length,
      matched,
      alignment_percent:
        games.length > 0 ? (matched / games.length) * 100 : null,
    }
  })
}

// ─── Leading factor stats ────────────────────────────────────────────────────
//
// "When starting pitching was the dominant factor, how often did the
//  outcome follow the factor lean?"
//
// "Dominant" = that component had the highest absolute value of all 8.
// Ties go to both components (a game can count for multiple leaders).

export async function getLeadingFactorStats(): Promise<LeadingFactorStats[]> {
  const { data, error } = await supa
    .from('edge_predictions')
    .select('components, actual_winner')
    .not('graded_at', 'is', null)
    .not('actual_winner', 'is', null)

  if (error || !data) return []

  return COMPONENT_KEYS.map(key => {
    const gamesWhereLead = data.filter(d => {
      if (!d.components) return false
      const absVal = Math.abs(Number(d.components[key] ?? 0))
      // Must be above threshold to count as "leading"
      if (absVal <= FACTOR_THRESHOLD) return false
      // Must be >= every other component's absolute value
      return COMPONENT_KEYS.every(other =>
        absVal >= Math.abs(Number(d.components[other] ?? 0)),
      )
    })

    const matched = gamesWhereLead.filter(d => {
      const factors = analyzeFactors(d.components ?? {})
      return factors.lean !== 'split' && factors.lean === (d.actual_winner as string)
    }).length

    return {
      factor_key: key,
      factor_label: COMPONENT_LABELS[key] ?? key,
      games_led: gamesWhereLead.length,
      matched,
      alignment_percent:
        gamesWhereLead.length > 0
          ? (matched / gamesWhereLead.length) * 100
          : null,
    }
  })
    .filter(f => f.games_led > 0)
    .sort((a, b) => b.games_led - a.games_led)
}

// ─── Recent reads ────────────────────────────────────────────────────────────
//
// Last N reviewed games with factor analysis. Used on the Track Record page
// and (later) for inline calibration on game pages.
//
// NOTE: if your edge_predictions table doesn't have home_team / away_team
// columns, you'll need to resolve team names from game_pk via the schedule
// API or a teams lookup. Adjust the select() accordingly.

export async function getRecentReads(limit = 20): Promise<RecentRead[]> {
  const { data, error } = await supa
    .from('edge_predictions')
    .select(
      'game_pk, game_date, home_team, away_team, components, actual_winner, home_score, away_score',
    )
    .not('graded_at', 'is', null)
    .not('actual_winner', 'is', null)
    .order('game_date', { ascending: false })
    .limit(limit)

  if (error || !data) return []

  return data.map(d => {
    const factors = analyzeFactors(d.components ?? {})
    return {
      game_pk: d.game_pk,
      game_date: d.game_date,
      home_team: d.home_team ?? 'Home',
      away_team: d.away_team ?? 'Away',
      factor_lean: factors.lean,
      lean_factors: factors.leanCount,
      total_factors: factors.homeFactors + factors.awayFactors,
      actual_winner: d.actual_winner as 'home' | 'away',
      outcome_matched:
        factors.lean === 'split'
          ? null
          : factors.lean === (d.actual_winner as string),
      home_score: d.home_score ?? null,
      away_score: d.away_score ?? null,
    }
  })
}