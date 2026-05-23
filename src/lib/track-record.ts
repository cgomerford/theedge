import { createClient } from '@supabase/supabase-js'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================================
// TYPES
// ============================================================
export type OverallStats = {
  total_games: number
  total_graded: number
  total_correct: number
  total_incorrect: number
  accuracy_percent: number | null
  insufficient_sample: boolean  // true if < 100 graded games
  date_range_start: string | null
  date_range_end: string | null
}

export type TierStats = {
  tier: 'strong' | 'moderate' | 'slight'
  games: number
  correct: number
  accuracy_percent: number | null
}

export type ComponentStats = {
  component: string
  threshold_label: string  // e.g. ">+30"
  games: number
  correct: number
  accuracy_percent: number | null
}

export type RecentPrediction = {
  game_pk: number
  game_date: string
  away_team: string
  home_team: string
  edge_score: number
  confidence_tier: string
  predicted_winner: string
  actual_winner: string | null
  was_correct: boolean | null
  home_score: number | null
  away_score: number | null
  summary: string | null
}

const MIN_SAMPLE_SIZE = 100

// ============================================================
// OVERALL ACCURACY
// ============================================================
export async function getOverallStats(): Promise<OverallStats> {
  const { data, error } = await supa
    .from('edge_predictions')
    .select('was_correct, game_date')
    .not('graded_at', 'is', null)

  if (error || !data) {
    return {
      total_games: 0,
      total_graded: 0,
      total_correct: 0,
      total_incorrect: 0,
      accuracy_percent: null,
      insufficient_sample: true,
      date_range_start: null,
      date_range_end: null,
    }
  }

  const gradeable = data.filter(d => d.was_correct !== null)
  const correct = gradeable.filter(d => d.was_correct === true).length
  const incorrect = gradeable.filter(d => d.was_correct === false).length

  const dates = data.map(d => d.game_date).sort()
  
  return {
    total_games: data.length,
    total_graded: gradeable.length,
    total_correct: correct,
    total_incorrect: incorrect,
    accuracy_percent: gradeable.length > 0 ? (correct / gradeable.length) * 100 : null,
    insufficient_sample: gradeable.length < MIN_SAMPLE_SIZE,
    date_range_start: dates[0] ?? null,
    date_range_end: dates[dates.length - 1] ?? null,
  }
}

// ============================================================
// ACCURACY BY CONFIDENCE TIER
// ============================================================
export async function getTierStats(): Promise<TierStats[]> {
  const { data, error } = await supa
    .from('edge_predictions')
    .select('confidence_tier, was_correct')
    .not('graded_at', 'is', null)
    .not('was_correct', 'is', null)

  if (error || !data) return []

  const tiers: ('strong' | 'moderate' | 'slight')[] = ['strong', 'moderate', 'slight']
  
  return tiers.map(tier => {
    const games = data.filter(d => d.confidence_tier === tier)
    const correct = games.filter(d => d.was_correct === true).length
    return {
      tier,
      games: games.length,
      correct,
      accuracy_percent: games.length > 0 ? (correct / games.length) * 100 : null,
    }
  })
}

// ============================================================
// COMPONENT-LEVEL ACCURACY
// ============================================================
const COMPONENT_THRESHOLDS = [
  { component: 'starting_pitcher', label: 'Starting Pitcher >+20', threshold: 20 },
  { component: 'starting_pitcher', label: 'Starting Pitcher >+30', threshold: 30 },
  { component: 'bullpen', label: 'Bullpen >+15', threshold: 15 },
  { component: 'offense', label: 'Offense >+15', threshold: 15 },
  { component: 'matchup', label: 'Matchup >+15', threshold: 15 },
  { component: 'park', label: 'Park >+5', threshold: 5 },
]

export async function getComponentStats(): Promise<ComponentStats[]> {
  const { data, error } = await supa
    .from('edge_predictions')
    .select('components, was_correct')
    .not('graded_at', 'is', null)
    .not('was_correct', 'is', null)

  if (error || !data) return []

  return COMPONENT_THRESHOLDS.map(({ component, label, threshold }) => {
    // Filter games where this component is dominant (above threshold AND favoring same team as prediction)
    const games = data.filter(d => {
      const componentValue = d.components?.[component]
      return typeof componentValue === 'number' && Math.abs(componentValue) >= threshold
    })
    
    const correct = games.filter(d => d.was_correct === true).length
    
    return {
      component,
      threshold_label: label,
      games: games.length,
      correct,
      accuracy_percent: games.length > 0 ? (correct / games.length) * 100 : null,
    }
  }).filter(s => s.games >= 5) // hide stats with too-small samples
}

// ============================================================
// PREDICTIONS BY DATE RANGE (admin tool)
// ============================================================
export async function getPredictionsInRange(
  startDate: string,  // YYYY-MM-DD inclusive
  endDate: string,    // YYYY-MM-DD inclusive
): Promise<RecentPrediction[]> {
  const { data, error } = await supa
    .from('edge_predictions')
    .select('game_pk, game_date, away_team, home_team, edge_score, confidence_tier, predicted_winner, actual_winner, was_correct, home_score, away_score, summary')
    .gte('game_date', startDate)
    .lte('game_date', endDate)
    .order('game_date', { ascending: false })
    .order('edge_score', { ascending: false })

  if (error || !data) return []
  return data as RecentPrediction[]
}

// ============================================================
// RECENT PREDICTIONS
// ============================================================
export async function getRecentPredictions(limit: number = 20): Promise<RecentPrediction[]> {
  const { data, error } = await supa
    .from('edge_predictions')
    .select('game_date, away_team, home_team, edge_score, confidence_tier, predicted_winner, actual_winner, was_correct, home_score, away_score')
    .not('graded_at', 'is', null)
    .order('game_date', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data as RecentPrediction[]
}