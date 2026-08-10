// src/lib/bullpen-usage.ts
//
// Powers the bullpen module on the team page:
//   1. Per RELIEVER (starters filtered out — see filterOutStarters below):
//      which inning they've appeared in most, which inning they've
//      actually been sharpest in (FIP), avg runs allowed per inning, and
//      how many times they've blown a lead / blown a save in that inning.
//   2. Batting/pitching pitch-count-by-inning charts (balls/strikes
//      stacked, runs as a label) — see BattingInningChart /
//      PitchingInningChart.
//
// SCOPE CHANGE (per your request): this now walks the FULL SEASON's
// completed games, not a 15-game sample. That's a real fetch-volume
// jump — by August that's 100+ live-feed fetches on every page load.
// I've added a long revalidate window (6 hours) and concurrency batching
// (8 at a time, same pattern you used for the minor-league roster fetch)
// to keep it from timing out, but I'd flag this as a strong candidate to
// move to a nightly cron job that writes precomputed rows to Supabase —
// same pattern as your other cron-computed tables — once you've
// confirmed the numbers look right. Happy to build that version next if
// page load feels slow.
//
// STARTER FILTERING: excludes any pitcher whose starts make up half or
// more of their season appearances (gamesStarted / gamesPitched >= 0.5)
// — a ratio-based check, not a raw gamesStarted>0 flag, so a reliever
// used as an "opener" (or one emergency spot start mixed into a normal
// relief workload) still counts as bullpen usage. See
// STARTER_RATIO_THRESHOLD near getEligibleRelieverIds for the exact cutoff.
//
// MINIMUM SAMPLE: relievers need at least MIN_APPEARANCES appearances
// this season to show up at all — checked against their real SEASON-WIDE
// games-pitched total from MLB Stats API (not just appearances captured
// within this team's games in our own play-by-play walk), so a reliever
// recently traded onto this team isn't undercounted just because most of
// their appearances happened before the trade. Combined with the
// roster check below into getEligibleRelieverIds().
//
// ROSTER CHECK: only players on the CURRENT active roster are included —
// someone who was traded away mid-season still has innings data in our
// game sample (since we walked every game this team played, including
// ones with them on it), but showing them in "your bullpen" once they're
// gone would be misleading. Pass the current roster IDs in from
// page.tsx (you already fetch this via getTeamRoster).
//
// "BEST INNING" METRIC: switched from FIP to plain runs allowed per
// appearance in that inning (avgRunsAllowed below), per your call — FIP
// was adding complexity (and an estimated-IP approximation) that wasn't
// buying much here. Note this counts ALL runs charged while the pitcher
// was on the mound for that plate appearance, not strictly "earned" runs
// in the official scorer sense — separating earned from unearned needs
// error/fielding-charge data that isn't cleanly exposed in this feed, so
// treat this as "runs allowed," a close but not 100%-official proxy for ER.
//
// BLOWN LEAD / BLOWN SAVE — METHODOLOGY NOTE:
// For each pitcher's stint within a given inning of a given game, I track
// the team's run lead the moment they entered that inning vs. the lead
// when they left it (or the game ended). "Blown lead" = they entered with
// a lead and left tied or behind. "Blown save" narrows that to entering
// with a lead of 1-3 runs — a proxy for a traditional save situation,
// NOT the official MLB save-situation rule (which also depends on
// runners on base and outs remaining, which I'm not modeling here). Treat
// "blown save" as a reasonable approximation, not an official save stat.

const MLB_API = 'https://statsapi.mlb.com/api/v1.1'
const MLB_API_V1 = 'https://statsapi.mlb.com/api/v1'
const CONCURRENCY = 8
const MIN_APPEARANCES = 3 // season-wide filter, checked against real MLB Stats API totals — see getEligibleRelieverIds
const MIN_APPEARANCES_PER_INNING = 3 // per-inning qualifier for "best inning" comparison
const MIN_GAMES_FOR_INNING_CHART = 10 // extra innings (10+) only happen in a handful of games all season —
// below this threshold the average is mostly noise (one blown lead in a 2-game sample reads as a "100% run rate"),
// so those innings are dropped from the chart entirely rather than shown misleadingly

export type InningPitchingLine = {
  inning: number
  battersFaced: number
  strikeouts: number
  walks: number
  hitByPitch: number
  homeRuns: number
  avgRunsAllowed: number
  blownLeads: number
  blownSaves: number
  appearancesInInning: number
}

export type RelieverProfile = {
  playerId: number
  playerName: string
  appearances: number
  appearancesByInning: Record<number, number>
  lines: InningPitchingLine[]
  mostUsedInning: number | null
  bestInning: { inning: number; avgRunsAllowed: number } | null
  totalBlownLeads: number
  totalBlownSaves: number
  summary: string
}

export type BattingPitchingInningUsage = {
  inning: number
  avgBallsSeen: number
  avgStrikesSeen: number
  avgRunsScored: number
  avgBallsThrown: number
  avgStrikesThrown: number
  avgRunsAllowed: number
  gamesSampled: number // how many games actually reached this inning — low = noisy, shown in chart tooltip
}

export type BullpenReport = {
  relievers: RelieverProfile[]
  inningUsage: BattingPitchingInningUsage[]
  gamesSampled: number
}

// ─── Raw shapes ───────────────────────────────────────────────────────
interface RawPlayEvent { isPitch?: boolean; details?: { call?: { code?: string } } }
interface RawPlay {
  about: { inning: number; halfInning: 'top' | 'bottom' }
  matchup: { pitcher: { id: number; fullName: string } }
  result: { eventType?: string; awayScore?: number; homeScore?: number }
  playEvents: RawPlayEvent[]
}
interface RawLiveFeed {
  gameData: { teams: { away: { id: number }; home: { id: number } } }
  liveData: { plays: { allPlays: RawPlay[] } }
}

function classifyPitch(ev: RawPlayEvent): 'ball' | 'strike' {
  const code = ev.details?.call?.code
  return code === 'B' || code === 'IB' || code === 'AB' ? 'ball' : 'strike'
}

function eventMatches(eventType: string | undefined, prefix: string): boolean {
  return !!eventType && eventType.startsWith(prefix)
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// ─── Game pk fetchers ────────────────────────────────────────────────
export async function getRecentGamePks(teamId: number, limit = 15, lookbackDays = 30): Promise<number[]> {
  const end = new Date()
  const start = new Date(end.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const res = await fetch(
    `${MLB_API_V1}/schedule?sportId=1&teamId=${teamId}&startDate=${fmt(start)}&endDate=${fmt(end)}`,
    { next: { revalidate: 3600 } },
  )
  if (!res.ok) return []
  const data = await res.json()
  const gamePks: number[] = []
  for (const dateEntry of data.dates ?? []) {
    for (const game of dateEntry.games ?? []) {
      if (game.status?.abstractGameState === 'Final') gamePks.push(game.gamePk)
    }
  }
  return gamePks.reverse().slice(0, limit)
}

// Full regular-season completed games. gameType=R excludes spring
// training / postseason so it lines up with regular-season stats
// everywhere else in the app.
export async function getSeasonGamePks(teamId: number, season: number): Promise<number[]> {
  const res = await fetch(
    `${MLB_API_V1}/schedule?sportId=1&teamId=${teamId}&season=${season}&gameType=R`,
    { next: { revalidate: 21600 } }, // 6h — this list only grows by ~1 game/day
  )
  if (!res.ok) return []
  const data = await res.json()
  const gamePks: number[] = []
  for (const dateEntry of data.dates ?? []) {
    for (const game of dateEntry.games ?? []) {
      if (game.status?.abstractGameState === 'Final') gamePks.push(game.gamePk)
    }
  }
  return gamePks
}

// ─── Starter vs. reliever classification ──────────────────────────────
// Uses the ratio of starts to total appearances rather than an average-
// innings-per-start heuristic — the earlier version fetched each
// pitcher's game log and excluded anyone whose average start length was
// "too long," which wrongly dropped real relievers who'd made a single
// long spot start (e.g. 20 relief outings + 1 emergency 3-inning start
// got misread as "a real starter" because that one start dragged the
// average up). A ratio of starts-to-total-appearances is far more robust:
// someone who starts less than half the time they pitch is functionally
// a reliever for this page's purposes, full stop.
const STARTER_RATIO_THRESHOLD = 0.5 // gamesStarted / gamesPitched at or above this = primarily a rotation starter, excluded

// ─── Reliever eligibility: non-starter (openers OK) + real season appearances + on current roster ──
// One combined check, one batch of fetches (concurrency-limited) rather
// than three separate passes over the pitching staff. No game-log fetch
// needed anymore — the season-totals call alone has everything required.
export async function getEligibleRelieverIds(
  pitcherIds: number[],
  season: number,
  currentRosterIds: Set<number>,
  minAppearances: number = MIN_APPEARANCES,
): Promise<Set<number>> {
  const eligible = new Set<number>()
  await mapWithConcurrency(pitcherIds, CONCURRENCY, async (id) => {
    if (!currentRosterIds.has(id)) return // not on the roster right now — exclude regardless of past stats
    try {
      const res = await fetch(
        `${MLB_API_V1}/people/${id}/stats?stats=season&group=pitching&season=${season}`,
        { next: { revalidate: 21600 } },
      )
      if (!res.ok) { eligible.add(id); return } // fail open — don't silently drop a real reliever over a fetch hiccup
      const data = await res.json()
      const stat = data?.stats?.[0]?.splits?.[0]?.stat
      const gamesStarted = stat?.gamesStarted ?? 0
      const gamesPitched = stat?.gamesPitched ?? 0 // season-wide, not scoped to this team — correct for mid-season trades
      if (gamesPitched < minAppearances) return
      const startRatio = gamesPitched > 0 ? gamesStarted / gamesPitched : 0
      const isPrimarilyStarter = startRatio >= STARTER_RATIO_THRESHOLD
      if (!isPrimarilyStarter) eligible.add(id)
    } catch {
      eligible.add(id)
    }
  })
  return eligible
}

// Kept for backwards compatibility if anything else still imports it —
// prefer getEligibleRelieverIds above, which also handles the roster and
// appearance-count checks in the same pass.
export async function filterOutStarters(pitcherIds: number[], season: number): Promise<Set<number>> {
  const relieverIds = new Set<number>()
  await mapWithConcurrency(pitcherIds, CONCURRENCY, async (id) => {
    try {
      const res = await fetch(
        `${MLB_API_V1}/people/${id}/stats?stats=season&group=pitching&season=${season}`,
        { next: { revalidate: 21600 } },
      )
      if (!res.ok) { relieverIds.add(id); return }
      const data = await res.json()
      const gamesStarted = data?.stats?.[0]?.splits?.[0]?.stat?.gamesStarted ?? 0
      if (gamesStarted === 0) relieverIds.add(id)
    } catch {
      relieverIds.add(id)
    }
  })
  return relieverIds
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

// ─── Main aggregation ─────────────────────────────────────────────────
export async function getBullpenReport(teamId: number, gamePks: number[], season: number): Promise<BullpenReport> {
  const pitcherInning = new Map<number, Map<number, {
    bf: number; k: number; bb: number; hbp: number; hr: number
    runsAllowed: number; games: Set<number>
    blownLeads: number; blownSaves: number
  }>>()
  const pitcherName = new Map<number, string>()
  const pitcherGamesByInning = new Map<number, Map<number, Set<number>>>()

  const inningAgg = new Map<number, {
    battingBalls: number; battingStrikes: number; battingGames: Set<number>
    pitchingBalls: number; pitchingStrikes: number; pitchingGames: Set<number>
    runsScored: number; runsScoredGames: Set<number>
    runsAllowed: number; runsAllowedGames: Set<number>
  }>()

  const feeds = await mapWithConcurrency(gamePks, CONCURRENCY, async (gamePk) => {
    try {
      const res = await fetch(`${MLB_API}/game/${gamePk}/feed/live`, { next: { revalidate: 21600 } })
      if (!res.ok) return null
      return (await res.json()) as RawLiveFeed
    } catch {
      return null
    }
  })

  gamePks.forEach((gamePk, idx) => {
    const data = feeds[idx]
    if (!data) return
    const isTeamHome = data.gameData.teams.home.id === teamId
    const isTeamAway = data.gameData.teams.away.id === teamId
    if (!isTeamHome && !isTeamAway) return

    let prevAway = 0
    let prevHome = 0

    // (pitcherId:inning) -> lead when they entered, most recent lead
    const stintLead = new Map<string, { entered: number; current: number }>()

    for (const play of data.liveData.plays.allPlays) {
      const inn = play.about.inning
      const teamIsBatting = (play.about.halfInning === 'top' && isTeamAway) || (play.about.halfInning === 'bottom' && isTeamHome)
      const teamIsPitching = !teamIsBatting

      const pitchEvents = play.playEvents.filter(e => e.isPitch)
      let ballsThisPlay = 0
      let strikesThisPlay = 0
      for (const ev of pitchEvents) {
        if (classifyPitch(ev) === 'ball') ballsThisPlay += 1
        else strikesThisPlay += 1
      }

      if (!inningAgg.has(inn)) {
        inningAgg.set(inn, {
          battingBalls: 0, battingStrikes: 0, battingGames: new Set(),
          pitchingBalls: 0, pitchingStrikes: 0, pitchingGames: new Set(),
          runsScored: 0, runsScoredGames: new Set(),
          runsAllowed: 0, runsAllowedGames: new Set(),
        })
      }
      const bucket = inningAgg.get(inn)!

      const awayScore = play.result.awayScore ?? prevAway
      const homeScore = play.result.homeScore ?? prevHome
      const ourRunsThisPlay = isTeamAway ? Math.max(0, awayScore - prevAway) : Math.max(0, homeScore - prevHome)
      const theirRunsThisPlay = isTeamAway ? Math.max(0, homeScore - prevHome) : Math.max(0, awayScore - prevAway)
      const ourLeadNow = isTeamHome ? (homeScore - awayScore) : (awayScore - homeScore)

      if (teamIsBatting) {
        bucket.battingBalls += ballsThisPlay
        bucket.battingStrikes += strikesThisPlay
        bucket.battingGames.add(gamePk)
        bucket.runsScored += ourRunsThisPlay
        bucket.runsScoredGames.add(gamePk)
      } else {
        bucket.pitchingBalls += ballsThisPlay
        bucket.pitchingStrikes += strikesThisPlay
        bucket.pitchingGames.add(gamePk)
        bucket.runsAllowed += theirRunsThisPlay
        bucket.runsAllowedGames.add(gamePk)
      }

      prevAway = awayScore
      prevHome = homeScore

      if (!teamIsPitching) continue
      const pid = play.matchup.pitcher.id
      pitcherName.set(pid, play.matchup.pitcher.fullName)

      // lead-tracking for blown lead/save, per (pitcher, inning) stint
      const leadKey = `${pid}:${inn}`
      const preplayLead = ourLeadNow - ourRunsThisPlay + theirRunsThisPlay // lead just before this play's runs applied — approximation using this play's net delta
      if (!stintLead.has(leadKey)) {
        stintLead.set(leadKey, { entered: preplayLead, current: ourLeadNow })
      } else {
        stintLead.get(leadKey)!.current = ourLeadNow
      }

      if (!pitcherInning.has(pid)) pitcherInning.set(pid, new Map())
      const innMap = pitcherInning.get(pid)!
      if (!innMap.has(inn)) innMap.set(inn, { bf: 0, k: 0, bb: 0, hbp: 0, hr: 0, runsAllowed: 0, games: new Set(), blownLeads: 0, blownSaves: 0 })
      const line = innMap.get(inn)!
      line.bf += 1
      line.runsAllowed += theirRunsThisPlay
      line.games.add(gamePk)
      const et = play.result.eventType
      if (eventMatches(et, 'strikeout')) line.k += 1
      if (eventMatches(et, 'walk')) line.bb += 1
      if (et === 'hit_by_pitch') line.hbp += 1
      if (et === 'home_run') line.hr += 1

      if (!pitcherGamesByInning.has(pid)) pitcherGamesByInning.set(pid, new Map())
      const gamesByInning = pitcherGamesByInning.get(pid)!
      if (!gamesByInning.has(inn)) gamesByInning.set(inn, new Set())
      gamesByInning.get(inn)!.add(gamePk)
    }

    // finalize blown lead/save per stint for this game
    for (const [key, { entered, current }] of stintLead.entries()) {
      const [pidStr, innStr] = key.split(':')
      const pid = Number(pidStr)
      const inn = Number(innStr)
      const blownLead = entered > 0 && current <= 0
      const blownSave = blownLead && entered >= 1 && entered <= 3
      if (blownLead) {
        const innMap = pitcherInning.get(pid)
        const line = innMap?.get(inn)
        if (line) {
          line.blownLeads += 1
          if (blownSave) line.blownSaves += 1
        }
      }
    }
  })

  // ── Build reliever profiles (starter filtering happens in caller) ──
  const relievers: RelieverProfile[] = [...pitcherInning.entries()].map(([playerId, innMap]) => {
    const lines: InningPitchingLine[] = [...innMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([inning, c]) => ({
        inning, battersFaced: c.bf, strikeouts: c.k, walks: c.bb, hitByPitch: c.hbp, homeRuns: c.hr,
        avgRunsAllowed: c.games.size > 0 ? Number((c.runsAllowed / c.games.size).toFixed(2)) : 0,
        blownLeads: c.blownLeads, blownSaves: c.blownSaves,
        appearancesInInning: c.games.size,
      }))

    const appearancesByInning: Record<number, number> = {}
    const gamesByInning = pitcherGamesByInning.get(playerId) ?? new Map()
    const totalAppearanceGames = new Set<number>()
    for (const [inning, games] of gamesByInning.entries()) {
      appearancesByInning[inning] = games.size
      for (const g of games) totalAppearanceGames.add(g)
    }

    const mostUsedEntry = Object.entries(appearancesByInning).sort((a, b) => b[1] - a[1])[0]
    const mostUsedInning = mostUsedEntry ? Number(mostUsedEntry[0]) : null

    const qualified = lines.filter(l => l.appearancesInInning >= MIN_APPEARANCES_PER_INNING)
    const best = qualified.length > 0 ? [...qualified].sort((a, b) => a.avgRunsAllowed - b.avgRunsAllowed)[0] : null
    const bestInning = best ? { inning: best.inning, avgRunsAllowed: best.avgRunsAllowed } : null

    const totalBlownLeads = lines.reduce((s, l) => s + l.blownLeads, 0)
    const totalBlownSaves = lines.reduce((s, l) => s + l.blownSaves, 0)

    let summary = 'Sample too small to call'
    if (mostUsedInning != null && bestInning) {
      summary = mostUsedInning === bestInning.inning
        ? `Most used AND sharpest (lowest runs allowed) in the ${ordinal(mostUsedInning)} (${bestInning.avgRunsAllowed} R/app)`
        : `Most used in the ${ordinal(mostUsedInning)}, sharpest in the ${ordinal(bestInning.inning)} (${bestInning.avgRunsAllowed} R/app)`
    } else if (mostUsedInning != null) {
      summary = `Most used in the ${ordinal(mostUsedInning)} — not enough innings yet to call a "best" one`
    }
    if (totalBlownSaves > 0) summary += ` · ${totalBlownSaves} blown save${totalBlownSaves === 1 ? '' : 's'} this season`
    else if (totalBlownLeads > 0) summary += ` · ${totalBlownLeads} blown lead${totalBlownLeads === 1 ? '' : 's'} this season`

    return {
      playerId,
      playerName: pitcherName.get(playerId) ?? `Player ${playerId}`,
      appearances: totalAppearanceGames.size,
      appearancesByInning,
      lines,
      mostUsedInning,
      bestInning,
      totalBlownLeads,
      totalBlownSaves,
      summary,
    }
  })
    .sort((a, b) => b.appearances - a.appearances)
  // NOTE: no appearance-count filter here anymore — that's now handled
  // externally by getEligibleRelieverIds() using real season-wide totals
  // plus the current-roster check, applied by the caller (page.tsx).

  const inningUsage: BattingPitchingInningUsage[] = [...inningAgg.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([inning, bucket]) => ({
      inning,
      avgBallsSeen: bucket.battingGames.size > 0 ? Number((bucket.battingBalls / bucket.battingGames.size).toFixed(1)) : 0,
      avgStrikesSeen: bucket.battingGames.size > 0 ? Number((bucket.battingStrikes / bucket.battingGames.size).toFixed(1)) : 0,
      avgRunsScored: bucket.runsScoredGames.size > 0 ? Number((bucket.runsScored / bucket.runsScoredGames.size).toFixed(2)) : 0,
      avgBallsThrown: bucket.pitchingGames.size > 0 ? Number((bucket.pitchingBalls / bucket.pitchingGames.size).toFixed(1)) : 0,
      avgStrikesThrown: bucket.pitchingGames.size > 0 ? Number((bucket.pitchingStrikes / bucket.pitchingGames.size).toFixed(1)) : 0,
      avgRunsAllowed: bucket.runsAllowedGames.size > 0 ? Number((bucket.runsAllowed / bucket.runsAllowedGames.size).toFixed(2)) : 0,
      gamesSampled: Math.max(bucket.battingGames.size, bucket.pitchingGames.size),
    }))
    .filter(row => row.gamesSampled >= MIN_GAMES_FOR_INNING_CHART || row.inning <= 9) // always keep regulation innings 1-9; extra innings need real sample size

  return { relievers, inningUsage, gamesSampled: gamePks.length }
}