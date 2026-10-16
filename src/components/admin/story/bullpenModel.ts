// src/components/admin/story/bullpenModel.ts
//
// "Who's available" model. Pure: takes already-fetched game-feed summaries
// (one per FINAL game in the window, postseason included) and builds the
// per-reliever grid. Pitch counts come from the game feeds, never from
// bullpen_availability or pitcher_workload_daily.

export type FeedArm = { id: number; name: string; hand: 'L' | 'R' | null; pitches: number }
export type FeedGame = {
  gamePk: number
  date: string                     // YYYY-MM-DD (officialDate)
  type: string                     // 'R' regular; 'F','D','L','W' postseason
  teamId: number
  starterId: number | null         // pitchers[0] of this team that game
  arms: FeedArm[]                  // every pitcher who threw for this team (starter included)
  unused: number[]                 // boxscore bullpen list (didn't pitch)
}

export type AvailTag = 'Back-to-back' | '30+ yesterday' | 'Rested 3+ days' | null

/** days = pitches on each of the 4 calendar days before the slate, oldest → newest. */
export function availabilityTag(days: number[]): AvailTag {
  if (days.length < 4) return null
  if (days[3] > 0 && days[2] > 0) return 'Back-to-back'
  if (days[3] >= 30) return '30+ yesterday'
  if (days[1] === 0 && days[2] === 0 && days[3] === 0) return 'Rested 3+ days'
  return null
}

export type PenRow = {
  id: number; name: string; hand: 'L' | 'R' | null
  days: number[]                   // 4 values
  total: number                    // over the 4 days
  tag: AvailTag
}
export type PenTeam = {
  teamId: number
  dates: string[]                  // the 4 dates, oldest → newest
  rows: PenRow[]                   // ≤ MAX_ROWS
  last3: number                    // relievers' pitches, days[1..3]
}

export const MAX_ROWS = 7
export const CORE_ROWS = 6

export function windowDates(slate: string): string[] {
  const out: string[] = []
  for (let i = 4; i >= 1; i--) {
    const d = new Date(`${slate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

export function buildPenTeam(o: { slate: string; teamId: number; games: FeedGame[]; tonightStarters: number[] }): PenTeam {
  const dates = windowDates(o.slate)
  const games = o.games.filter(g => g.teamId === o.teamId && dates.includes(g.date))
  const started = new Set<number>()
  for (const g of games) if (g.starterId != null) started.add(g.starterId)
  const exclude = new Set<number>([...started, ...o.tonightStarters])

  const byId = new Map<number, PenRow>()
  for (const g of games) {
    for (const a of g.arms) {
      if (exclude.has(a.id) || a.id === g.starterId) continue
      let r = byId.get(a.id)
      if (!r) { r = { id: a.id, name: a.name, hand: a.hand, days: [0, 0, 0, 0], total: 0, tag: null }; byId.set(a.id, r) }
      r.days[dates.indexOf(g.date)] += a.pitches    // doubleheaders add up on the same date
      r.total += a.pitches
    }
  }
  for (const r of byId.values()) r.tag = availabilityTag(r.days)

  const all = [...byId.values()]
  const rows = all.filter(r => r.total > 0).sort((a, b) => b.total - a.total).slice(0, MAX_ROWS)
  const last3 = all.reduce((s, r) => s + r.days[1] + r.days[2] + r.days[3], 0)
  return { teamId: o.teamId, dates, rows, last3 }
}

export const shadeStep = (n: number): 0 | 1 | 2 | 3 => (n <= 0 ? 0 : n < 15 ? 1 : n < 30 ? 2 : 3)
