// src/lib/lineup-optimizer.ts
//
// Powers the "Confirmed vs Optimized" lineup toggle on the team page.
//
// CONFIRMED LINEUP: pulled from the MLB Stats API schedule/boxscore once
// it's posted (typically ~60-90 min before first pitch). Before that it
// won't exist yet — callers should handle `null` and show a "not posted
// yet" state rather than treating it as an error.
//
// OPTIMIZED LINEUP: reordered from the roster's AVG/OBP/SLG/OPS splits vs
// the probable opposing starter's throwing hand, using a simplified
// version of the sabermetric batting-order heuristic popularized by
// "The Book" (Tango/Lichtman/Dolphin) — NOT a full run-expectancy (RE24)
// lineup simulation, which would require Monte Carlo simulation over the
// base/out state matrix. This heuristic captures ~90% of the value with a
// fraction of the complexity:
//
//   Slot 1 (leadoff)   -> 2nd-best hitter by OBP
//   Slot 2             -> best hitter overall by OPS
//   Slot 3             -> 3rd-best hitter by OPS
//   Slot 4 (cleanup)   -> best hitter by SLG (power)
//   Slot 5             -> 4th-best hitter by OPS
//   Slots 6-9          -> remaining hitters, descending OPS
//
// This is a real, defensible ordering principle, but it's still a
// heuristic — flagged in the UI, not presented as "the" optimal order.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

import type { PlayerSlotProfile } from './lineup-slot-stats'

export type SplitLine = {
  avg: number | null
  obp: number | null
  slg: number | null
  ops: number | null
  pa: number
}

export type BatterWithSplits = {
  playerId: number
  playerName: string
  primaryPosition: string
  vsLHP: SplitLine
  vsRHP: SplitLine
  season: SplitLine
}

export type ConfirmedLineupEntry = {
  battingOrder: number // 1-9
  playerId: number
  playerName: string
  position: string
}

export type OptimizedLineupEntry = {
  battingOrder: number
  playerId: number
  playerName: string
  primaryPosition: string
  splitUsed: SplitLine
  reason: string // short human-readable reason for the slot, e.g. "2nd-best OBP vs RHP"
}

const MIN_PA_FOR_SPLIT = 20 // below this, fall back to season-wide line rather than a noisy split

function effectiveLine(batter: BatterWithSplits, throwsHand: 'L' | 'R'): SplitLine {
  const split = throwsHand === 'L' ? batter.vsLHP : batter.vsRHP
  if (split.pa >= MIN_PA_FOR_SPLIT && split.ops != null) return split
  return batter.season
}

// ─── Confirmed lineup ────────────────────────────────────────────────
export async function fetchConfirmedLineup(gamePk: number, isHome: boolean): Promise<ConfirmedLineupEntry[] | null> {
  const res = await fetch(`${MLB_API}.1/game/${gamePk}/feed/live`, { next: { revalidate: 120 } })
  if (!res.ok) return null
  const data = await res.json()
  const boxscore = data?.liveData?.boxscore
  const side = isHome ? boxscore?.teams?.home : boxscore?.teams?.away
  const battingOrder: string[] | undefined = side?.battingOrder
  const players = side?.players
  if (!battingOrder || battingOrder.length === 0 || !players) return null // not posted yet

  return battingOrder.map((personIdStr: string, i: number) => {
    const p = players[`ID${personIdStr}`]
    return {
      battingOrder: i + 1,
      playerId: Number(personIdStr),
      playerName: p?.person?.fullName ?? 'TBD',
      position: p?.position?.abbreviation ?? '',
    }
  })
}

// ─── Split stats fetch ──────────────────────────────────────────────
// sitCodes 'vl' (vs LHP) / 'vr' (vs RHP) are the standard MLB Stats API
// handedness splits and are generally reliable (unlike some of the more
// obscure sitCodes found broken during earlier work on this app — see
// fetch_player_form.py notes). If these come back empty for a given
// player, effectiveLine() above silently falls back to their season
// line rather than showing zeros.
export async function fetchBatterSplits(personIds: number[], season: number): Promise<BatterWithSplits[]> {
  const results = await Promise.all(
    personIds.map(async (id): Promise<BatterWithSplits | null> => {
      try {
        const [seasonRes, vlRes, vrRes] = await Promise.all([
          fetch(`${MLB_API}/people/${id}/stats?stats=season&group=hitting&season=${season}`, { next: { revalidate: 3600 } }),
          fetch(`${MLB_API}/people/${id}/stats?stats=statSplits&sitCodes=vl&group=hitting&season=${season}`, { next: { revalidate: 3600 } }),
          fetch(`${MLB_API}/people/${id}/stats?stats=statSplits&sitCodes=vr&group=hitting&season=${season}`, { next: { revalidate: 3600 } }),
        ])
        const [seasonJson, vlJson, vrJson] = await Promise.all([seasonRes.json(), vlRes.json(), vrRes.json()])

        const seasonStat = seasonJson?.stats?.[0]?.splits?.[0]?.stat
        const playerName = seasonJson?.stats?.[0]?.splits?.[0]?.player?.fullName ?? `Player ${id}`
        const position = seasonJson?.stats?.[0]?.splits?.[0]?.player?.primaryPosition?.abbreviation ?? ''

        const toLine = (stat: any): SplitLine => ({
          avg: stat?.avg != null ? Number(stat.avg) : null,
          obp: stat?.obp != null ? Number(stat.obp) : null,
          slg: stat?.slg != null ? Number(stat.slg) : null,
          ops: stat?.ops != null ? Number(stat.ops) : null,
          pa: stat?.plateAppearances != null ? Number(stat.plateAppearances) : 0,
        })

        const vlStat = vlJson?.stats?.[0]?.splits?.[0]?.stat
        const vrStat = vrJson?.stats?.[0]?.splits?.[0]?.stat

        return {
          playerId: id,
          playerName,
          primaryPosition: position,
          season: toLine(seasonStat),
          vsLHP: toLine(vlStat),
          vsRHP: toLine(vrStat),
        }
      } catch {
        return null
      }
    }),
  )
  return results.filter((r): r is BatterWithSplits => r !== null)
}

// ─── Optimization by ACTUAL lineup-slot performance ─────────────────
// Replaces the abstract "Book" heuristic below with real per-player,
// per-slot history from lineup-slot-stats.ts. If Harper has hit better
// batting 3rd than 2nd this season, he gets slot 3 — that's the whole
// point of this version.
//
// Algorithm: greedy matching, not a globally-optimal assignment (a true
// optimum would need the Hungarian algorithm over a 9x9 value matrix —
// doable if you want it, but greedy gets very close in practice and is
// far easier to reason about / debug). For every (player, slot) pair with
// enough sample size, sort all pairs by value descending, and assign
// greedily — first pair wins that player AND that slot, then move down
// the list skipping any pair where either side is already taken.
//
// VALUE BLEND: primarily the player's own slot-specific OPS (min PA
// threshold below). Where slot history is too thin, falls back to their
// vs-pitcher-hand OPS (still respects the RHP/LHP toggle), then to their
// season OPS as a last resort. This keeps the "vs LHP/RHP" toggle
// meaningful even though the slot history itself isn't split by opposing
// pitcher hand (that would fragment an already-small sample too far).

const MIN_SLOT_PA = 12

export function optimizeLineupBySlotHistory(
  slotProfiles: PlayerSlotProfile[],
  handSplits: BatterWithSplits[],
  opposingThrows: 'L' | 'R',
): OptimizedLineupEntry[] {
  const handByPlayer = new Map(handSplits.map(b => [b.playerId, b]))
  const eligible = slotProfiles.filter(p => p.primaryPosition !== 'P')

  // Build every (player, slot) candidate with a value + reason
  type Candidate = { playerId: number; playerName: string; primaryPosition: string; slot: number; value: number; reason: string }
  const candidates: Candidate[] = []

  for (const profile of eligible) {
    const hand = handByPlayer.get(profile.playerId)
    const handLine = hand ? (opposingThrows === 'L' ? hand.vsLHP : hand.vsRHP) : null
    const handOPS = handLine && handLine.pa >= 20 ? handLine.ops : (hand?.season.ops ?? null)
    const vsLabel = opposingThrows === 'L' ? 'LHP' : 'RHP'

    for (let slot = 1; slot <= 9; slot++) {
      const slotLine = profile.bySlot.find(s => s.slot === slot)
      if (slotLine && slotLine.pa >= MIN_SLOT_PA && slotLine.ops != null) {
        const value = handOPS != null ? 0.7 * slotLine.ops + 0.3 * handOPS : slotLine.ops
        candidates.push({
          playerId: profile.playerId, playerName: profile.playerName, primaryPosition: profile.primaryPosition,
          slot, value,
          reason: `${slotLine.ops.toFixed(3)} OPS batting ${slot}${slotOrdinal(slot)} this season (${slotLine.pa} PA)`,
        })
      } else if (handOPS != null) {
        // no reliable slot history — fall back to hand split at reduced confidence
        candidates.push({
          playerId: profile.playerId, playerName: profile.playerName, primaryPosition: profile.primaryPosition,
          slot, value: handOPS * 0.92, // small penalty for using a proxy instead of real slot data
          reason: `Limited slot history — ranked by ${handOPS.toFixed(3)} OPS vs ${vsLabel}`,
        })
      } else if (profile.overall.ops != null) {
        candidates.push({
          playerId: profile.playerId, playerName: profile.playerName, primaryPosition: profile.primaryPosition,
          slot, value: profile.overall.ops * 0.85,
          reason: `Limited data — ranked by ${profile.overall.ops.toFixed(3)} overall OPS this sample`,
        })
      }
    }
  }

  candidates.sort((a, b) => b.value - a.value)

  const takenSlots = new Set<number>()
  const takenPlayers = new Set<number>()
  const result: OptimizedLineupEntry[] = []

  for (const c of candidates) {
    if (takenSlots.has(c.slot) || takenPlayers.has(c.playerId)) continue
    takenSlots.add(c.slot)
    takenPlayers.add(c.playerId)
    result.push({
      battingOrder: c.slot,
      playerId: c.playerId,
      playerName: c.playerName,
      primaryPosition: c.primaryPosition,
      splitUsed: { avg: null, obp: null, slg: null, ops: c.value, pa: 0 },
      reason: c.reason,
    })
    if (result.length === 9) break
  }

  return result.sort((a, b) => a.battingOrder - b.battingOrder)
}

function slotOrdinal(n: number): string {
  if (n === 1) return 'st'
  if (n === 2) return 'nd'
  if (n === 3) return 'rd'
  return 'th'
}

// ─── Legacy generic "Book" heuristic (kept for reference / fallback) ──
export function optimizeLineup(batters: BatterWithSplits[], opposingThrows: 'L' | 'R'): OptimizedLineupEntry[] {
  const eligible = batters.filter(b => b.primaryPosition !== 'P')
  const ranked = eligible
    .map(b => ({ batter: b, line: effectiveLine(b, opposingThrows) }))
    .filter(x => x.line.ops != null)
    .sort((a, b) => (b.line.ops ?? 0) - (a.line.ops ?? 0))

  if (ranked.length === 0) return []

  const byOBP = [...ranked].sort((a, b) => (b.line.obp ?? 0) - (a.line.obp ?? 0))
  const bySLG = [...ranked].sort((a, b) => (b.line.slg ?? 0) - (a.line.slg ?? 0))

  const used = new Set<number>()
  const take = (pool: typeof ranked, label: string): { batter: BatterWithSplits; line: SplitLine; reason: string } | null => {
    const next = pool.find(x => !used.has(x.batter.playerId))
    if (!next) return null
    used.add(next.batter.playerId)
    return { ...next, reason: label }
  }

  const vs = opposingThrows === 'L' ? 'LHP' : 'RHP'
  const slots: (ReturnType<typeof take>)[] = []

  // Slot 1 (leadoff) = 2nd-best OBP specifically, not the best — the
  // single best OBP hitter is more valuable in slot 2 where they get more
  // plate appearances with runners on over a season.
  const obpPool = byOBP.filter(x => !used.has(x.batter.playerId))
  const leadoff = obpPool[1] ?? obpPool[0] ?? null
  if (leadoff) {
    used.add(leadoff.batter.playerId)
    slots.push({ ...leadoff, reason: `2nd-best OBP vs ${vs}` })
  } else {
    slots.push(null)
  }

  slots.push(take(ranked, `Best OPS vs ${vs}`)) // slot 2
  slots.push(take(ranked, `3rd-best OPS vs ${vs}`)) // slot 3
  slots.push(take(bySLG, `Best SLG (power) vs ${vs}`)) // slot 4
  slots.push(take(ranked, `Next-best OPS vs ${vs}`)) // slot 5

  const remaining = ranked.filter(x => !used.has(x.batter.playerId))
  for (const r of remaining) {
    if (slots.length >= 9) break
    used.add(r.batter.playerId)
    slots.push({ ...r, reason: `Remaining, by OPS vs ${vs}` })
  }

  return slots
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .slice(0, 9)
    .map((s, i) => ({
      battingOrder: i + 1,
      playerId: s.batter.playerId,
      playerName: s.batter.playerName,
      primaryPosition: s.batter.primaryPosition,
      splitUsed: s.line,
      reason: s.reason,
    }))
}
