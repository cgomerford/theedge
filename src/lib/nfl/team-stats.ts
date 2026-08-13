// src/lib/nfl-team-stats.ts
//
// NFL TEAM STATISTICS — fetch + parse layer.
//
// This is the NFL equivalent of savant.ts for MLB: it hydrates real,
// curl-verified data before anything downstream (nfl-scout.ts) touches it.
//
// Confirmed live (Aug 2026) against:
//   https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/{YEAR}/types/{SEASONTYPE}/teams/{TEAM_ID}/statistics
//
// SEASONTYPE: 1=pre, 2=regular, 3=post
//
// Every field name below (e.g. `QBRating`, `redzoneScoringPct`, `hurries`)
// was read directly off a live response, not guessed. See the caveat on
// `hurries` — it returned exactly 0 in our test fetch, the same pattern
// that meant MLB's Defense component was silently dead for months. Do
// NOT surface a "hurries" row in the scout report until a second team's
// raw JSON is checked and shows non-zero values across multiple teams.
//
// IMPORTANT: this endpoint returns SEASON TEAM TOTALS. It is not
// opponent-adjusted and not a per-game split. It answers "how good is
// this team at X over the season" — not "how does this team's passing
// attack do specifically against blitz-heavy defenses." Matchup-specific
// rows (the NFL equivalent of MLB's chase-rate-vs-putaway-pitch cross
// reference) require athlete-level splits/gamelog endpoints, which are
// NOT wired here yet and should not be assumed to exist until curled.

// ─────────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────────

// A single ESPN stat entry always carries value + rank together — we
// keep both, because "value" alone means nothing without league context
// (is 97.4 QB rating good? depends what rank it is), and MLB's scout.ts
// leaned on rank fields (chase_pct_rank_mlb) for exactly this reason.
export type NFLStatValue = {
  value: number
  displayValue: string
  rank: number | null
  rankDisplayValue: string | null
}

export type NFLTeamStatsForScout = {
  team_id: string
  team_abbr: string
  team_name: string
  season: number
  seasonType: number

  // ── Passing (team-level; effectively "starter + backups combined") ──
  qbRating: NFLStatValue | null
  completionPct: NFLStatValue | null
  yardsPerPassAttempt: NFLStatValue | null
  netPassingYardsPerGame: NFLStatValue | null
  passingTouchdownPct: NFLStatValue | null
  interceptionPct: NFLStatValue | null
  sacksTaken: NFLStatValue | null       // offense: times sacked
  sackYardsLostOff: NFLStatValue | null

  // ── Rushing ───────────────────────────────────────────────────────
  yardsPerRushAttempt: NFLStatValue | null
  rushingYardsPerGame: NFLStatValue | null
  rushingBigPlays: NFLStatValue | null
  stuffsSufferedOnRush: NFLStatValue | null // offense: run stopped at/behind LOS

  // ── Defense ───────────────────────────────────────────────────────
  defSacks: NFLStatValue | null
  tacklesForLoss: NFLStatValue | null
  passesDefended: NFLStatValue | null
  defInterceptions: NFLStatValue | null
  /** UNRELIABLE — returned 0 in test fetch. Do not surface until re-verified
   * against a second team's raw JSON showing real non-zero values. */
  hurries: NFLStatValue | null

  // ── Situational (from ESPN's "miscellaneous" category) ───────────
  redzoneScoringPct: NFLStatValue | null
  redzoneTouchdownPct: NFLStatValue | null
  thirdDownConvPct: NFLStatValue | null
  fourthDownConvPct: NFLStatValue | null
  turnOverDifferential: NFLStatValue | null
  possessionTimeSeconds: NFLStatValue | null

  // ── Special teams ─────────────────────────────────────────────────
  fieldGoalPct: NFLStatValue | null
  fieldGoalPct50Plus: NFLStatValue | null   // derived: fieldGoalsMade50/fieldGoalAttempts50 — see parser note
  netAvgPuntYards: NFLStatValue | null
  puntsInside20Pct: NFLStatValue | null
  yardsPerKickReturn: NFLStatValue | null
}

// ─────────────────────────────────────────────────────────────────────
//  RAW ESPN RESPONSE SHAPE (subset — only what we read)
// ─────────────────────────────────────────────────────────────────────

type EspnStat = {
  name: string
  value: number
  displayValue: string
  rank?: number
  rankDisplayValue?: string
}

type EspnCategory = {
  name: string
  stats: EspnStat[]
}

type EspnTeamStatsResponse = {
  splits?: {
    categories?: EspnCategory[]
  }
}

// ─────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────

function toStatValue(stat: EspnStat | undefined): NFLStatValue | null {
  if (!stat || stat.value == null) return null
  return {
    value: stat.value,
    displayValue: stat.displayValue,
    rank: stat.rank ?? null,
    rankDisplayValue: stat.rankDisplayValue ?? null,
  }
}

function findStat(category: EspnCategory | undefined, name: string): EspnStat | undefined {
  return category?.stats.find(s => s.name === name)
}

function findCategory(categories: EspnCategory[], name: string): EspnCategory | undefined {
  return categories.find(c => c.name === name)
}

// ─────────────────────────────────────────────────────────────────────
//  FETCH + PARSE
// ─────────────────────────────────────────────────────────────────────

/**
 * Fetches and parses real team statistics from ESPN's core API.
 *
 * Empty state beats fabricated data: if the fetch fails or the shape is
 * unexpected, this returns null. Callers must NOT invent placeholder
 * numbers when this returns null — show an empty/pending state instead,
 * same rule as the MLB pipeline.
 */
export async function fetchNFLTeamStats(
  teamId: string,
  teamAbbr: string,
  teamName: string,
  season: number,
  seasonType: 1 | 2 | 3 = 2,
): Promise<NFLTeamStatsForScout | null> {
  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/types/${seasonType}/teams/${teamId}/statistics`

  let json: EspnTeamStatsResponse
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } } as RequestInit)
    if (!res.ok) {
      console.error(`nfl-team-stats: ${teamAbbr} fetch failed — ${res.status}`)
      return null
    }
    json = await res.json()
  } catch (e) {
    console.error(`nfl-team-stats: ${teamAbbr} fetch threw`, e)
    return null
  }

  const categories = json.splits?.categories
  if (!categories || categories.length === 0) {
    console.error(`nfl-team-stats: ${teamAbbr} — no categories in response`)
    return null
  }

  const passing = findCategory(categories, 'passing')
  const rushing = findCategory(categories, 'rushing')
  const defensive = findCategory(categories, 'defensive')
  const misc = findCategory(categories, 'miscellaneous')
  const kicking = findCategory(categories, 'kicking')
  const punting = findCategory(categories, 'punting')
  const returning = findCategory(categories, 'returning')

  return {
    team_id: teamId,
    team_abbr: teamAbbr,
    team_name: teamName,
    season,
    seasonType,

    qbRating: toStatValue(findStat(passing, 'QBRating')),
    completionPct: toStatValue(findStat(passing, 'completionPct')),
    yardsPerPassAttempt: toStatValue(findStat(passing, 'yardsPerPassAttempt')),
    netPassingYardsPerGame: toStatValue(findStat(passing, 'netPassingYardsPerGame')),
    passingTouchdownPct: toStatValue(findStat(passing, 'passingTouchdownPct')),
    interceptionPct: toStatValue(findStat(passing, 'interceptionPct')),
    sacksTaken: toStatValue(findStat(passing, 'sacks')),
    sackYardsLostOff: toStatValue(findStat(passing, 'sackYardsLost')),

    yardsPerRushAttempt: toStatValue(findStat(rushing, 'yardsPerRushAttempt')),
    rushingYardsPerGame: toStatValue(findStat(rushing, 'rushingYardsPerGame')),
    rushingBigPlays: toStatValue(findStat(rushing, 'rushingBigPlays')),
    stuffsSufferedOnRush: toStatValue(findStat(rushing, 'stuffs')),

    defSacks: toStatValue(findStat(defensive, 'sacks')),
    tacklesForLoss: toStatValue(findStat(defensive, 'tacklesForLoss')),
    passesDefended: toStatValue(findStat(defensive, 'passesDefended')),
    defInterceptions: toStatValue(findStat(defensive, 'interceptions')),
    hurries: toStatValue(findStat(defensive, 'hurries')),

    redzoneScoringPct: toStatValue(findStat(misc, 'redzoneScoringPct')),
    redzoneTouchdownPct: toStatValue(findStat(misc, 'redzoneTouchdownPct')),
    thirdDownConvPct: toStatValue(findStat(misc, 'thirdDownConvPct')),
    fourthDownConvPct: toStatValue(findStat(misc, 'fourthDownConvPct')),
    turnOverDifferential: toStatValue(findStat(misc, 'turnOverDifferential')),
    possessionTimeSeconds: toStatValue(findStat(misc, 'possessionTimeSeconds')),

    fieldGoalPct: toStatValue(findStat(kicking, 'fieldGoalPct')),
    // NOTE: ESPN does not expose a direct "50+ FG%" stat — only counts
    // (fieldGoalAttempts50, fieldGoalsMade50). If you want this rate,
    // compute it from those two raw counts in the scout builder, don't
    // invent a percentage here. Left null on purpose.
    fieldGoalPct50Plus: null,
    netAvgPuntYards: toStatValue(findStat(punting, 'netAvgPuntYards')),
    puntsInside20Pct: toStatValue(findStat(punting, 'puntsInside20Pct')),
    yardsPerKickReturn: toStatValue(findStat(returning, 'yardsPerKickReturn')),
  }
}

/**
 * Fetches stats for both teams in a matchup in parallel. Returns
 * whichever succeeded — a failed fetch for one team does not block
 * the other. Callers should check for null per-team, not assume both
 * arrived.
 */
export async function fetchNFLMatchupTeamStats(
  home: { id: string; abbr: string; name: string },
  away: { id: string; abbr: string; name: string },
  season: number,
  seasonType: 1 | 2 | 3 = 2,
): Promise<{ home: NFLTeamStatsForScout | null; away: NFLTeamStatsForScout | null }> {
  const [homeStats, awayStats] = await Promise.all([
    fetchNFLTeamStats(home.id, home.abbr, home.name, season, seasonType),
    fetchNFLTeamStats(away.id, away.abbr, away.name, season, seasonType),
  ])
  return { home: homeStats, away: awayStats }
}