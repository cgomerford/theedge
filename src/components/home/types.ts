import type { MLBGame } from '@/lib/mlb'
import type { EdgePrediction } from '@/lib/edge-fetch'
import type { Sport } from '@/lib/active-sport'

export type TopEdge = {
  game: MLBGame
  pred: EdgePrediction
}

export type HomeFunnelStats = {
  total_reviewed: number
  insufficient_sample: boolean
  alignment_percent: number | null
}

export type HomeFunnelProps = {
  activeSport: Sport
  activeSportLabel: string
  gamesCount: number
  overallStats: HomeFunnelStats
  topEdges: TopEdge[]
  status: {
    checkEmail?: boolean
    alreadySubscribed?: boolean
    error?: string
  }
}

export type HomeVariant = 'proof' | 'editorial'