// src/components/scout/types.ts — what every Scout section is handed.

export type ScoutClub = {
  id: number
  name: string
  abbr: string
  probableId: number | null
  probableName: string | null
}

export type ScoutContext = {
  gameDate: string   // YYYY-MM-DD, the game's local date (from the slug)
  gamePk: number
  away: ScoutClub
  home: ScoutClub
  isPro: boolean
  venueId: number | null
  venueName: string
  dayNight: 'day' | 'night' | null
}
