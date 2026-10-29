// src/lib/follows/config.ts: the follow limits, in one place. A free account follows up to 10 players and 3 teams; Pro has no player cap
// (and no team cap). src/lib/follows.ts, src/lib/pricing.ts and /me all read these.
export const FREE_LIMITS = { player: 10, team: 3 } as const

// Opening Day of the next season: before this date My x9Lab is in its off-season state. From the MLB schedule (/seasons/2027: regularSeasonStartDate). Move it here if the date shifts.
export const OPENING_DAY = '2027-03-25'
