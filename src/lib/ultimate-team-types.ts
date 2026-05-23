// ============================================================
// ULTIMATE TEAM — SHARED TYPES
// ============================================================

export const HITTER_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as const
export const PITCHER_SLOTS = ['SP1', 'SP2', 'SP3', 'RP1', 'RP2'] as const
export const ALL_SLOTS = [...HITTER_POSITIONS, ...PITCHER_SLOTS] as const

export type HitterPosition = typeof HITTER_POSITIONS[number]
export type PitcherSlot = typeof PITCHER_SLOTS[number]
export type SquadSlot = typeof ALL_SLOTS[number]

// What comes back from the DB player pool
export type PoolPlayer = {
  player_id: number
  full_name: string
  team_id: number
  team_short: string
  primary_position: string
  player_type: 'hitter' | 'pitcher'
  // Hitter stats
  avg: number | null
  obp: number | null
  slg: number | null
  ops: number | null
  home_runs: number | null
  rbi: number | null
  stolen_bases: number | null
  // Pitcher stats
  era: number | null
  whip: number | null
  k_per_9: number | null
  wins: number | null
  saves: number | null
  innings_pitched: number | null
  // Universal
  games_played: number | null
  position_percentile: number | null
  grade: string | null  // 'A+', 'A', 'B', 'C', 'D', 'F'
}

// The lineup stored in JSONB: slot → player_id
// e.g. { "C": 660271, "1B": 592450, "SP1": 669373, ... }
export type SquadLineup = Partial<Record<SquadSlot, number>>

// Full squad with resolved player data
export type ResolvedSquad = {
  lineup: SquadLineup
  players: Record<number, PoolPlayer>  // player_id → full player data
  squad_grade: string | null
  total_percentile: number | null
}

// What position types can fill each slot
export function positionsForSlot(slot: SquadSlot): string[] {
  if (slot === 'SP1' || slot === 'SP2' || slot === 'SP3') return ['SP']
  if (slot === 'RP1' || slot === 'RP2') return ['RP']
  // Hitter slots: match exact position (C can only go in C slot, etc.)
  return [slot]
}

// Grade color mapping
export function gradeColor(grade: string | null): string {
  switch (grade) {
    case 'A+': return '#15803d'  // green-700
    case 'A':  return '#16a34a'  // green-600
    case 'B':  return '#2563eb'  // blue-600
    case 'C':  return '#d97706'  // amber-600
    case 'D':  return '#dc2626'  // red-600
    case 'F':  return '#991b1b'  // red-800
    default:   return '#78716c'  // stone-500
  }
}

// Grade background (lighter version for cards)
export function gradeBg(grade: string | null): string {
  switch (grade) {
    case 'A+': return 'rgba(21, 128, 61, 0.12)'
    case 'A':  return 'rgba(22, 163, 74, 0.10)'
    case 'B':  return 'rgba(37, 99, 235, 0.10)'
    case 'C':  return 'rgba(217, 119, 6, 0.10)'
    case 'D':  return 'rgba(220, 38, 38, 0.10)'
    case 'F':  return 'rgba(153, 27, 27, 0.10)'
    default:   return 'rgba(120, 113, 108, 0.08)'
  }
}