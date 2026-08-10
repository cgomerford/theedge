// src/lib/lineup-slot-stats.ts
//
// Replaces the abstract "Book" heuristic in lineup-optimizer.ts with real
// history: for each player, how have THEY actually hit in each lineup
// slot (1-9) this season? If Harper has a .950 OPS batting 3rd and a .820
// OPS batting 2nd, he should show up 3rd — that's the actual ask.
//
// DATA SOURCE: for each sampled gamePk, pull the live feed boxscore for
// our team. Each player's boxscore entry has:
//   - `battingOrder`: a 3-digit string, e.g. "300" = started in slot 3,
//     "301" = first substitute into slot 3 later in the game. Slot number
//     is `Math.floor(Number(battingOrder) / 100)`.
//   - `stats.batting`: that game's raw counting stats (AB, H, 2B, 3B, HR,
//     BB, HBP, SF) — accurate for computing real AVG/OBP/SLG/OPS by slot,
//     rather than trusting a stats-API split endpoint that may not exist
//     for "by lineup slot" at all (it doesn't, as a standard sitCode).
//
// Aggregated across whatever gamePks you pass in (same sample as
// bullpen-usage.ts — recommend sharing one getRecentGamePks() call across
// both so you're not double-fetching the same games).

const MLB_API = 'https://statsapi.mlb.com/api/v1.1'

export type SlotLine = {
  slot: number
  pa: number
  ab: number
  hits: number
  avg: number | null
  obp: number | null
  slg: number | null
  ops: number | null
}

export type PlayerSlotProfile = {
  playerId: number
  playerName: string
  primaryPosition: string
  bySlot: SlotLine[] // only slots with pa > 0, sorted by slot number
  overall: SlotLine // aggregate across every slot they've hit in, for fallback
}

type RawAccum = {
  ab: number; hits: number; doubles: number; triples: number; hr: number
  bb: number; hbp: number; sf: number
}

function emptyAccum(): RawAccum {
  return { ab: 0, hits: 0, doubles: 0, triples: 0, hr: 0, bb: 0, hbp: 0, sf: 0 }
}

function lineFromAccum(slot: number, a: RawAccum): SlotLine {
  const singles = a.hits - a.doubles - a.triples - a.hr
  const totalBases = singles + 2 * a.doubles + 3 * a.triples + 4 * a.hr
  const pa = a.ab + a.bb + a.hbp + a.sf
  const avg = a.ab > 0 ? a.hits / a.ab : null
  const obpDenom = a.ab + a.bb + a.hbp + a.sf
  const obp = obpDenom > 0 ? (a.hits + a.bb + a.hbp) / obpDenom : null
  const slg = a.ab > 0 ? totalBases / a.ab : null
  const ops = obp != null && slg != null ? obp + slg : null
  return { slot, pa, ab: a.ab, hits: a.hits, avg, obp, slg, ops }
}

export async function getPlayerSlotProfiles(teamId: number, gamePks: number[]): Promise<PlayerSlotProfile[]> {
  // playerId -> slot -> accumulated raw counts
  const bySlotMap = new Map<number, Map<number, RawAccum>>()
  const overallMap = new Map<number, RawAccum>()
  const nameMap = new Map<number, { name: string; position: string }>()

  for (const gamePk of gamePks) {
    try {
      const res = await fetch(`${MLB_API}/game/${gamePk}/feed/live`, { next: { revalidate: 3600 } })
      if (!res.ok) continue
      const data = await res.json()
      const isHome = data?.gameData?.teams?.home?.id === teamId
      const isAway = data?.gameData?.teams?.away?.id === teamId
      if (!isHome && !isAway) continue

      const side = isHome ? data?.liveData?.boxscore?.teams?.home : data?.liveData?.boxscore?.teams?.away
      const players = side?.players
      if (!players) continue

      for (const key of Object.keys(players)) {
        const p = players[key]
        const battingOrderRaw = p?.battingOrder
        const batting = p?.stats?.batting
        if (!battingOrderRaw || !batting) continue // didn't bat / not in lineup

        const slot = Math.floor(Number(battingOrderRaw) / 100)
        if (!Number.isFinite(slot) || slot < 1 || slot > 9) continue

        const playerId = p.person?.id
        if (!playerId) continue
        nameMap.set(playerId, { name: p.person?.fullName ?? `Player ${playerId}`, position: p.position?.abbreviation ?? '' })

        const gameLine: RawAccum = {
          ab: batting.atBats ?? 0,
          hits: batting.hits ?? 0,
          doubles: batting.doubles ?? 0,
          triples: batting.triples ?? 0,
          hr: batting.homeRuns ?? 0,
          bb: batting.baseOnBalls ?? 0,
          hbp: batting.hitByPitch ?? 0,
          sf: batting.sacFlies ?? 0,
        }

        if (!bySlotMap.has(playerId)) bySlotMap.set(playerId, new Map())
        const slotMap = bySlotMap.get(playerId)!
        if (!slotMap.has(slot)) slotMap.set(slot, emptyAccum())
        const slotAccum = slotMap.get(slot)!
        slotAccum.ab += gameLine.ab; slotAccum.hits += gameLine.hits; slotAccum.doubles += gameLine.doubles
        slotAccum.triples += gameLine.triples; slotAccum.hr += gameLine.hr; slotAccum.bb += gameLine.bb
        slotAccum.hbp += gameLine.hbp; slotAccum.sf += gameLine.sf

        if (!overallMap.has(playerId)) overallMap.set(playerId, emptyAccum())
        const overallAccum = overallMap.get(playerId)!
        overallAccum.ab += gameLine.ab; overallAccum.hits += gameLine.hits; overallAccum.doubles += gameLine.doubles
        overallAccum.triples += gameLine.triples; overallAccum.hr += gameLine.hr; overallAccum.bb += gameLine.bb
        overallAccum.hbp += gameLine.hbp; overallAccum.sf += gameLine.sf
      }
    } catch {
      continue
    }
  }

  const profiles: PlayerSlotProfile[] = [...nameMap.entries()].map(([playerId, meta]) => {
    const slotMap = bySlotMap.get(playerId) ?? new Map()
    const bySlot = [...slotMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([slot, accum]) => lineFromAccum(slot, accum))
    const overallAccum = overallMap.get(playerId) ?? emptyAccum()
    return {
      playerId,
      playerName: meta.name,
      primaryPosition: meta.position,
      bySlot,
      overall: lineFromAccum(0, overallAccum),
    }
  })

  return profiles
}
