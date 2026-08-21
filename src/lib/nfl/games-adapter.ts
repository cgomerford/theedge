// src/lib/nfl/games-adapter.ts
//
// Reshapes rows from the nfl_games Supabase table (written only by
// scripts/nfl_scoreboard_ingest.py) into the exact NFLGame / NFLGameTeam
// shape defined in src/lib/nfl-schedule.ts, so NFLHomepage.tsx and
// NFLTeamPage.tsx don't need any changes -- only the two page.tsx files
// swap their data source.
//
// slug generation below is a direct copy of nfl-schedule.ts's private
// buildSlug() (that function isn't exported, so it can't be imported --
// if you export it later, replace this local copy with the import instead
// of maintaining two copies of the same map).
//
// KNOWN BUG ELSEWHERE, NOT FIXED HERE: nfl-schedule.ts's
// getNFLGameBySlugEnhanced() has its own ABBR_TO_ID map with the same
// shuffled-id bug that was in the old SLUG_TO_ID (BUF:'17', MIA:'20',
// ARI:'32', etc. -- all wrong). That map is only used as a fallback when a
// slug isn't found in the live scoreboard, so it's lower-impact than the
// page-route bug was, but it should get the same fix at some point.

import { getNFLTeams } from "@/lib/nfl";
import { getRecentNFLGames, getTeamNFLGames, type NFLGame as SupabaseNFLGame } from "@/lib/nfl/games";
import type { NFLGame, NFLGameTeam } from "@/lib/nfl-schedule";

// Exact copy of nfl-schedule.ts's teamSlugMap -- keep in sync if that file changes.
const TEAM_SLUG_MAP: Record<string, string> = {
  'BUF': 'buffalo-bills', 'MIA': 'miami-dolphins', 'NE': 'new-england-patriots', 'NYJ': 'new-york-jets',
  'BAL': 'baltimore-ravens', 'CIN': 'cincinnati-bengals', 'CLE': 'cleveland-browns', 'PIT': 'pittsburgh-steelers',
  'HOU': 'houston-texans', 'IND': 'indianapolis-colts', 'JAX': 'jacksonville-jaguars', 'TEN': 'tennessee-titans',
  'DEN': 'denver-broncos', 'KC': 'kansas-city-chiefs', 'LV': 'las-vegas-raiders', 'LAC': 'los-angeles-chargers',
  'DAL': 'dallas-cowboys', 'NYG': 'new-york-giants', 'PHI': 'philadelphia-eagles', 'WSH': 'washington-commanders',
  'CHI': 'chicago-bears', 'DET': 'detroit-lions', 'GB': 'green-bay-packers', 'MIN': 'minnesota-vikings',
  'ATL': 'atlanta-falcons', 'CAR': 'carolina-panthers', 'NO': 'new-orleans-saints', 'TB': 'tampa-bay-buccaneers',
  'ARI': 'arizona-cardinals', 'LAR': 'los-angeles-rams', 'SF': 'san-francisco-49ers', 'SEA': 'seattle-seahawks',
}

function buildSlug(awayAbbr: string, homeAbbr: string, date: string): string {
  const awaySlug = TEAM_SLUG_MAP[awayAbbr] ?? awayAbbr.toLowerCase()
  const homeSlug = TEAM_SLUG_MAP[homeAbbr] ?? homeAbbr.toLowerCase()
  const dateStr = date.split('T')[0]
  return `${awaySlug}-at-${homeSlug}-${dateStr}`
}

function statusFromRow(row: SupabaseNFLGame): NFLGame["status"] {
  // nfl_games only stores is_complete (post-game ingestion) -- there's no
  // "in_progress" state in this table since the script only writes after
  // games finish. If you want live/in-progress games to show before the
  // week closes, that has to come from a different, live-read source
  // (e.g. getNFLCurrentWeek's direct ESPN fetch), not this table.
  return row.isComplete ? "final" : "scheduled";
}

async function buildTeamLookup() {
  const teams = await getNFLTeams();
  const byId = new Map(teams.map((t: any) => [t.id, t]));
  return byId;
}

function toGameTeam(teamRecord: any, fallbackAbbrev: string): NFLGameTeam {
  // getNFLTeams()'s NFLTeamCard shape isn't fully confirmed field-for-field
  // -- wins/losses/ties are read defensively so this doesn't throw if any
  // are missing, but double-check the record string renders correctly once
  // this is live and fix the field names below if it comes out "undefined-undefined."
  const wins = teamRecord.wins ?? 0;
  const losses = teamRecord.losses ?? 0;
  const ties = teamRecord.ties ?? 0;
  const record = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;

  return {
    id: teamRecord.id,
    name: teamRecord.name ?? fallbackAbbrev,
    shortName: teamRecord.shortName ?? teamRecord.name ?? fallbackAbbrev,
    abbreviation: teamRecord.abbreviation ?? fallbackAbbrev,
    logo: teamRecord.logo ?? `https://a.espncdn.com/i/teamlogos/nfl/500/${fallbackAbbrev.toLowerCase()}.png`,
    record,
    rank: null, // not available from getNFLTeams() -- wire in from standings if you want this populated
  };
}

function rowToNFLGame(
  row: SupabaseNFLGame,
  teamsById: Map<string, any>
): NFLGame | null {
  const homeTeamRecord = teamsById.get(row.homeTeamId);
  const awayTeamRecord = teamsById.get(row.awayTeamId);

  // If either team isn't in getNFLTeams()'s result, we can't build a
  // correct NFLGameTeam (no name/logo to show). Skip rather than render a
  // broken card -- empty state over thin data.
  if (!homeTeamRecord || !awayTeamRecord) {
    console.warn(
      `[games-adapter] Missing team lookup for game ${row.gameId} (home=${row.homeTeamId}, away=${row.awayTeamId}) -- skipping.`
    );
    return null;
  }

  const status = statusFromRow(row);

  return {
    id: row.gameId,
    slug: buildSlug(row.awayTeamAbbrev, row.homeTeamAbbrev, row.startDate),
    date: row.startDate,
    week: row.week,
    season: row.seasonYear,
    homeTeam: toGameTeam(homeTeamRecord, row.homeTeamAbbrev),
    awayTeam: toGameTeam(awayTeamRecord, row.awayTeamAbbrev),
    status,
    statusDisplay: row.statusDetail ?? (status === 'final' ? 'Final' : 'Scheduled'),
    homeScore: row.isComplete ? row.homeScore : null,
    awayScore: row.isComplete ? row.awayScore : null,
    venue: '', // not stored in nfl_games -- add a column (or join to a venues table) if you want this populated
    broadcast: '', // not stored in nfl_games -- same as venue
    weather: null,
  };
}

/**
 * Homepage schedule section. Replaces getNFLCurrentWeek() in page.tsx.
 * Note: only returns COMPLETED games (see statusFromRow) -- there is no
 * live/in-progress data in nfl_games, so during an active game window this
 * will under-represent "this week" until the ingest script runs after it closes.
 */
export async function getRecentNFLGamesAdapted(
  limit = 12,
  seasonType = 1
): Promise<NFLGame[]> {
  const [rows, teamsById] = await Promise.all([
    getRecentNFLGames(limit, seasonType),
    buildTeamLookup(),
  ]);
  return rows
    .map((row) => rowToNFLGame(row, teamsById))
    .filter((g): g is NFLGame => g !== null);
}

/**
 * Team page schedule. Replaces getNFLTeamSchedule(id, season) in page.tsx.
 * `season` param kept for signature compatibility but currently unused --
 * nfl_games doesn't yet distinguish "2025 season" vs "2026 preseason" in a
 * way this function filters on beyond seasonType. Revisit once regular-season
 * rows exist and you need to separate "last completed season" from "this one."
 */
export async function getNFLTeamGamesAdapted(
  espnTeamId: string,
  _season?: number,
  limit = 20
): Promise<NFLGame[]> {
  const [rows, teamsById] = await Promise.all([
    getTeamNFLGames(espnTeamId, limit),
    buildTeamLookup(),
  ]);
  return rows
    .map((row) => rowToNFLGame(row, teamsById))
    .filter((g): g is NFLGame => g !== null);
}