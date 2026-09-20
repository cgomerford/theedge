// src/components/postgame/report/types.ts — what every Postgame section is handed.

export type PostClub = { id: number; name: string; abbr: string }

export type PostgameContext = {
  gamePk: number
  gameDate: string   // YYYY-MM-DD from the slug
  slug: string
  away: PostClub
  home: PostClub
  isPro: boolean
  isAdmin: boolean   // shows the admin-only "X graphic (PNG)" buttons
}
