// src/lib/matchup-tilt.ts
//
// Types and data builder for the Matchup Tilt V3 model.
// Reads directly from the components_raw shape already stored by edge.ts:
//
//   components_raw: {
//     home_pitcher: <pitcher_stats row>,
//     away_pitcher: <pitcher_stats row>,
//     home_team:    <team_stats row>,
//     away_team:    <team_stats row>,
//     park:         <park factor object>,
//     weather:      { temp_f, wind_mph, wind_dir },
//     _hidden:      { pitcherFatigue, lineupConfidence },
//   }
//
// And reads tilt values from edge_predictions.components (the 8 component scores).
//
// Used by:
//   - mlb/[slug]/page.tsx  → builds MatchupTiltData for the <MatchupTilt /> component
//   - emails.ts            → builds MatchupTiltData for the email block

// ─── What's stored in edge_predictions.components_raw ─────────────────────────

export interface ComponentsRaw {
  home_pitcher: any | null;
  away_pitcher: any | null;
  home_team: any | null;
  away_team: any | null;
  park: any | null;
  weather?: { temp_f: number; wind_mph: number; wind_dir: string } | null;
  _hidden?: { pitcherFatigue: number; lineupConfidence: number };
}

// ─── What's stored in edge_predictions.components (the tilt values) ───────────

export interface ComponentScores {
  starting_pitcher: number;
  bullpen: number;
  offense: number;
  defense: number;
  matchup: number;
  park: number;
  weather: number;
  rest: number;
}

// ─── What the React component renders ─────────────────────────────────────────

export interface SubFactor {
  label: string;
  home: string;
  away: string;
  homeWins: boolean;
  note?: string;
}

export interface ComponentTilt {
  tilt: number;
  summary: string;
  subfactors: SubFactor[];
}

export interface MatchupTiltData {
  home: { abbr: string; name: string; primaryColor: string; stats?: any };
  away: { abbr: string; name: string; primaryColor: string; stats?: any };
  venue: string;
  gameTime: string;
  components: {
    pitching: ComponentTilt;
    bullpen: ComponentTilt;
    offense: ComponentTilt;
    matchup: ComponentTilt;
    park: ComponentTilt;
    weather: ComponentTilt;
    defense: ComponentTilt;
    rest: ComponentTilt;
  };
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function fmt(val: any, decimals = 2): string {
  if (val == null || val === undefined || isNaN(val)) return '—';
  return Number(val).toFixed(decimals);
}

function fmtPct(val: any): string {
  if (val == null || val === undefined || isNaN(val)) return '—';
  const n = Number(val);
  // Handle both 0.225 and 22.5 formats
  if (n < 1) return `${(n * 100).toFixed(1)}%`;
  return `${n.toFixed(1)}%`;
}

function signed(val: any): string {
  if (val == null) return '—';
  const n = Number(val);
  return `${n > 0 ? '+' : ''}${n}`;
}

function windDescription(weather?: { temp_f: number; wind_mph: number; wind_dir: string } | null): string {
  if (!weather) return '—';
  const dir = weather.wind_dir === 'out' ? 'blowing out'
    : weather.wind_dir === 'in' ? 'blowing in'
    : weather.wind_dir === 'cross' ? 'crosswind'
    : weather.wind_dir ?? 'variable';
  return `${weather.wind_mph} mph ${dir}`;
}

// ─── Summary generators (free-tier one-liners) ───────────────────────────────

function isOpener(p: any): boolean {
  if (!p) return false
  const starts = p.starts ?? 0
  const games = p.games_played ?? 1
  const ip = p.innings_pitched ?? 0
  return starts <= 2 || (games >= 5 && starts / games < 0.4) || (games >= 5 && ip / games < 2.0)
}

function pitchingSummary(
  hp: any, ap: any, tilt: number, homeAbbr: string, awayAbbr: string,
): string {
  const homeName = hp?.player_name ?? 'TBD'
  const awayName = ap?.player_name ?? 'TBD'

  const homeIsOpener = isOpener(hp)
  const awayIsOpener = isOpener(ap)

  if (homeIsOpener && awayIsOpener) return 'Both teams running openers — bullpen game tonight'
  if (homeIsOpener) return `${homeAbbr} running an opener — bullpen game vs ${awayName}`
  if (awayIsOpener) return `${awayAbbr} running an opener — bullpen game vs ${homeName}`

  if (Math.abs(tilt) < 5) return `${homeName} vs ${awayName} — evenly matched`
  const leader = tilt > 0 ? homeName : awayName
  const other  = tilt > 0 ? awayName : homeName
  return `${leader} holds the pitching edge tonight vs ${other}`
}
function bullpenSummary(
  ht: any, at: any, tilt: number, homeAbbr: string, awayAbbr: string,
): string {
  if (Math.abs(tilt) < 5) return 'Both bullpens equally rested';
  const fresher = tilt > 0 ? homeAbbr : awayAbbr;
  const homeIp = ht?.bullpen_innings_yesterday ?? 0;
  const awayIp = at?.bullpen_innings_yesterday ?? 0;
  return `${fresher} pen fresher — ${fmt(homeIp, 1)} vs ${fmt(awayIp, 1)} IP last night`;
}

function offenseSummary(
  ht: any, at: any, tilt: number, homeAbbr: string, awayAbbr: string,
): string {
  if (Math.abs(tilt) < 5) return 'Offences similarly productive over the last 30 days';
  const edge = tilt > 0 ? homeAbbr : awayAbbr;
  const rpg = tilt > 0 ? ht?.runs_per_game_l30 : at?.runs_per_game_l30;
  return `${edge} bats sharper — ${fmt(rpg, 1)} R/G over last 30 days`;
}

function matchupSummary(hp: any, ap: any, tilt: number): string {
  if (!hp && !ap) return 'Pitch matchup data pending lineup confirmation';
  if (Math.abs(tilt) < 5) return 'Pitcher-lineup matchups roughly even';
  const dominant = tilt > 0 ? hp : ap;
  const name = dominant?.player_name ?? 'Starter';
  return `${name}'s arsenal has the edge in tonight's matchup`;
}

function parkSummary(park: any, weather: any): string {
  if (!park) return 'Park factor data pending';
  if (park.is_dome) return 'Dome game — park plays neutral';
  const wind = weather ? windDescription(weather) : 'variable wind';
  return `Park factor: ${wind}, ${weather?.temp_f != null ? `${fmt(weather.temp_f, 0)}°F` : 'temp TBD'}`;
}

function weatherSummary(weather: any, park: any): string {
  if (park?.is_dome) return 'Dome game — weather is a non-factor';
  if (!weather) return 'Weather data pending';
  if (Math.abs(weather.temp_f - 72) < 10 && weather.wind_mph < 5)
    return 'Weather is a non-factor tonight';
  return `${fmt(weather.temp_f, 0)}°F, ${windDescription(weather)}`;
}

function defenseSummary(
  ht: any, at: any, tilt: number, homeAbbr: string, awayAbbr: string,
): string {
  if (Math.abs(tilt) < 5) return 'Defences evenly matched';
  const leader = tilt > 0 ? homeAbbr : awayAbbr;
  return `${leader} holds the defensive edge`;
}

function restSummary(
  ht: any, at: any, tilt: number, homeAbbr: string, awayAbbr: string,
): string {
  if (Math.abs(tilt) < 5) return 'Similar rest and travel for both sides';
  const advantage = tilt > 0 ? homeAbbr : awayAbbr;
  return `${advantage} side better rested`;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Builds MatchupTiltData from the raw prediction data.
 *
 * @param raw       - edge_predictions.components_raw (the full DB rows stored by edge.ts)
 * @param scores    - edge_predictions.components (the 8 tilt values, -100 to +100)
 * @param home      - { abbr, name, primaryColor, stats? }
 * @param away      - { abbr, name, primaryColor, stats? }
 * @param venue     - venue name
 * @param gameTime  - formatted game time string
 */
export function buildMatchupTiltData(
  raw: ComponentsRaw,
  scores: ComponentScores,
  home: MatchupTiltData['home'],
  away: MatchupTiltData['away'],
  venue: string,
  gameTime: string,
): MatchupTiltData {
  
  // Merge live database stats (if provided via page.tsx) with the cached Python prediction payload
  const hp = { ...(raw.home_pitcher || {}), ...(home.stats || {}) };
  const ap = { ...(raw.away_pitcher || {}), ...(away.stats || {}) };
  const ht = raw.home_team;
  const at = raw.away_team;
  const park = raw.park;
  const weather = raw.weather;

  return {
    home,
    away,
    venue,
    gameTime,
    components: {

      // ── Starting Pitching ──────────────────────────────────────────────
      pitching: {
        tilt: scores.starting_pitcher,
        summary: pitchingSummary(hp, ap, scores.starting_pitcher, home.abbr, away.abbr),
        subfactors: [
          {
            label: 'ERA',
            home: fmt(hp?.era),
            away: fmt(ap?.era),
            homeWins: (hp?.era ?? 99) < (ap?.era ?? 99),
            note: 'lower = better',
          },
          {
            label: 'FIP',
            home: fmt(hp?.fip),
            away: fmt(ap?.fip),
            homeWins: (hp?.fip ?? 99) < (ap?.fip ?? 99),
            note: 'defense-independent',
          },
          {
            label: 'L3 ERA (recent form)',
            home: fmt(hp?.l3_era),
            away: fmt(ap?.l3_era),
            homeWins: (hp?.l3_era ?? 99) < (ap?.l3_era ?? 99),
          },
          {
            label: 'K/9',
            home: fmt(hp?.k_per_9, 1),
            away: fmt(ap?.k_per_9, 1),
            homeWins: (hp?.k_per_9 ?? 0) > (ap?.k_per_9 ?? 0),
            note: 'higher = better',
          },
          {
            label: 'BB/9',
            home: fmt(hp?.bb_per_9, 1),
            away: fmt(ap?.bb_per_9, 1),
            homeWins: (hp?.bb_per_9 ?? 99) < (ap?.bb_per_9 ?? 99),
            note: 'lower = better',
          },
          {
            label: 'WHIP',
            home: fmt(hp?.whip),
            away: fmt(ap?.whip),
            homeWins: (hp?.whip ?? 99) < (ap?.whip ?? 99),
          },
        ],
      },

      // ── Bullpen ────────────────────────────────────────────────────────
      bullpen: {
        tilt: scores.bullpen,
        summary: bullpenSummary(ht, at, scores.bullpen, home.abbr, away.abbr),
        subfactors: [
          {
            label: 'Bullpen ERA',
            home: fmt(ht?.bullpen_era),
            away: fmt(at?.bullpen_era),
            homeWins: (ht?.bullpen_era ?? 99) < (at?.bullpen_era ?? 99),
          },
          {
            label: 'Bullpen K/9',
            home: fmt(ht?.bullpen_k_per_9, 1),
            away: fmt(at?.bullpen_k_per_9, 1),
            homeWins: (ht?.bullpen_k_per_9 ?? 0) > (at?.bullpen_k_per_9 ?? 0),
          },
          {
            label: 'IP yesterday',
            home: fmt(ht?.bullpen_innings_yesterday, 1),
            away: fmt(at?.bullpen_innings_yesterday, 1),
            homeWins: (ht?.bullpen_innings_yesterday ?? 99) < (at?.bullpen_innings_yesterday ?? 99),
            note: 'lower = fresher',
          },
          {
            label: 'IP last 3 days',
            home: fmt(ht?.bullpen_ip_last_3, 1),
            away: fmt(at?.bullpen_ip_last_3, 1),
            homeWins: (ht?.bullpen_ip_last_3 ?? 99) < (at?.bullpen_ip_last_3 ?? 99),
          },
          {
            label: 'Closer available',
            home: ht?.closer_available === false ? 'No' : ht?.closer_available === true ? 'Yes' : '—',
            away: at?.closer_available === false ? 'No' : at?.closer_available === true ? 'Yes' : '—',
            homeWins: ht?.closer_available !== false,
          },
        ],
      },

      // ── Offensive Form ─────────────────────────────────────────────────
      offense: {
        tilt: scores.offense,
        summary: offenseSummary(ht, at, scores.offense, home.abbr, away.abbr),
        subfactors: [
          {
            label: 'R/G (L30)',
            home: fmt(ht?.runs_per_game_l30, 1),
            away: fmt(at?.runs_per_game_l30, 1),
            homeWins: (ht?.runs_per_game_l30 ?? 0) > (at?.runs_per_game_l30 ?? 0),
          },
          {
            label: 'OPS (L30)',
            home: ht?.ops_l30 != null ? `.${Math.round(ht.ops_l30 * 1000)}` : '—',
            away: at?.ops_l30 != null ? `.${Math.round(at.ops_l30 * 1000)}` : '—',
            homeWins: (ht?.ops_l30 ?? 0) > (at?.ops_l30 ?? 0),
          },
          {
            label: 'ISO (power)',
            home: ht?.iso != null ? `.${Math.round(ht.iso * 1000)}` : '—',
            away: at?.iso != null ? `.${Math.round(at.iso * 1000)}` : '—',
            homeWins: (ht?.iso ?? 0) > (at?.iso ?? 0),
          },
          {
            label: 'K%',
            home: fmtPct(ht?.k_pct),
            away: fmtPct(at?.k_pct),
            homeWins: (ht?.k_pct ?? 99) < (at?.k_pct ?? 99),
            note: 'lower = better',
          },
          {
            label: 'BB%',
            home: fmtPct(ht?.bb_pct),
            away: fmtPct(at?.bb_pct),
            homeWins: (ht?.bb_pct ?? 0) > (at?.bb_pct ?? 0),
            note: 'higher = better',
          },
        ],
      },

      // ── Pitch Matchups ─────────────────────────────────────────────────
      matchup: {
        tilt: scores.matchup,
        summary: matchupSummary(hp, ap, scores.matchup),
        subfactors: [
          {
            label: 'GB% (groundball rate)',
            home: hp?.gb_rate != null ? `${Number(hp.gb_rate).toFixed(1)}%` : '—',
            away: ap?.gb_rate != null ? `${Number(ap.gb_rate).toFixed(1)}%` : '—',
            homeWins: (hp?.gb_rate ?? 0) > (ap?.gb_rate ?? 0),
            note: 'higher = more GBs',
          },
          {
            label: 'vs LHB (batting avg)',
            home: hp?.vs_lhb_baa != null ? `.${Math.round(hp.vs_lhb_baa * 1000)}` : '—',
            away: ap?.vs_lhb_baa != null ? `.${Math.round(ap.vs_lhb_baa * 1000)}` : '—',
            homeWins: (hp?.vs_lhb_baa ?? 1) < (ap?.vs_lhb_baa ?? 1),
            note: 'lower = better',
          },
          {
            label: 'vs RHB (batting avg)',
            home: hp?.vs_rhb_baa != null ? `.${Math.round(hp.vs_rhb_baa * 1000)}` : '—',
            away: ap?.vs_rhb_baa != null ? `.${Math.round(ap.vs_rhb_baa * 1000)}` : '—',
            homeWins: (hp?.vs_rhb_baa ?? 1) < (ap?.vs_rhb_baa ?? 1),
            note: 'lower = better',
          },
          {
            label: 'L3 K/9 (recent)',
            home: fmt(hp?.l3_k_per_9, 1),
            away: fmt(ap?.l3_k_per_9, 1),
            homeWins: (hp?.l3_k_per_9 ?? 0) > (ap?.l3_k_per_9 ?? 0),
            note: 'higher = better',
          },
        ],
      },

      // ── Park Factor ────────────────────────────────────────────────────
      park: {
        tilt: scores.park,
        summary: parkSummary(park, weather),
        subfactors: [
          {
            label: 'HR factor',
            home: fmt(park?.hr_factor),
            away: '—',
            homeWins: (park?.hr_factor ?? 1) > 1,
            note: '>1 = more HRs',
          },
          {
            label: 'Run factor',
            home: fmt(park?.run_factor),
            away: '—',
            homeWins: (park?.run_factor ?? 1) > 1,
            note: '>1 = more runs',
          },
          {
            label: 'Dome',
            home: park?.is_dome ? 'Yes' : 'No',
            away: '—',
            homeWins: false,
          },
          {
            label: 'Wind',
            home: windDescription(weather),
            away: '—',
            homeWins: weather?.wind_dir === 'out',
          },
        ],
      },

      // ── Weather ────────────────────────────────────────────────────────
      weather: {
        tilt: scores.weather,
        summary: weatherSummary(weather, park),
        subfactors: [
          {
            label: 'Temperature',
            home: weather?.temp_f != null ? `${fmt(weather.temp_f, 0)}°F` : '—',
            away: '—',
            homeWins: (weather?.temp_f ?? 70) > 65,
          },
          {
            label: 'Wind',
            home: windDescription(weather),
            away: '—',
            homeWins: weather?.wind_dir !== 'in',
          },
          {
            label: 'Wind speed',
            home: weather?.wind_mph != null ? `${weather.wind_mph} mph` : '—',
            away: '—',
            homeWins: (weather?.wind_mph ?? 0) < 10,
          },
        ],
      },

      // ── Defense ────────────────────────────────────────────────────────
      defense: {
        tilt: scores.defense,
        summary: defenseSummary(ht, at, scores.defense, home.abbr, away.abbr),
        subfactors: [
          {
            label: 'OAA (outs above avg)',
            home: signed(ht?.oaa),
            away: signed(at?.oaa),
            homeWins: (ht?.oaa ?? 0) > (at?.oaa ?? 0),
          },
          {
            label: 'DRS (def. runs saved)',
            home: signed(ht?.drs),
            away: signed(at?.drs),
            homeWins: (ht?.drs ?? 0) > (at?.drs ?? 0),
          },
          {
            label: 'Errors/G (L30)',
            home: fmt(ht?.errors_per_game_l30),
            away: fmt(at?.errors_per_game_l30),
            homeWins: (ht?.errors_per_game_l30 ?? 99) < (at?.errors_per_game_l30 ?? 99),
            note: 'lower = better',
          },
          {
            label: 'Infield OAA',
            home: signed(ht?.infield_oaa),
            away: signed(at?.infield_oaa),
            homeWins: (ht?.infield_oaa ?? 0) > (at?.infield_oaa ?? 0),
          },
          {
            label: 'Outfield OAA',
            home: signed(ht?.outfield_oaa),
            away: signed(at?.outfield_oaa),
            homeWins: (ht?.outfield_oaa ?? 0) > (at?.outfield_oaa ?? 0),
          },
        ],
      },

      // ── Rest & Travel ──────────────────────────────────────────────────
      rest: {
        tilt: scores.rest,
        summary: restSummary(ht, at, scores.rest, home.abbr, away.abbr),
        subfactors: [
          {
            label: 'Travel (last leg)',
            home: 'Home',
            away: at?.travel_miles_last != null && at.travel_miles_last > 0
              ? `${at.travel_miles_last} mi`
              : 'Home',
            homeWins: (at?.travel_miles_last ?? 0) > 0,
          },
          {
            label: 'Games in last 10 days',
            home: fmt(ht?.games_last_10_days, 0),
            away: fmt(at?.games_last_10_days, 0),
            homeWins: (ht?.games_last_10_days ?? 99) < (at?.games_last_10_days ?? 99),
          },
          {
            label: 'Consecutive road G',
            home: '—',
            away: at?.consecutive_road_games != null ? `${at.consecutive_road_games}` : '—',
            homeWins: (at?.consecutive_road_games ?? 0) >= 5,
            note: 'away fatigue',
          },
          {
            label: 'Day after night game',
            home: ht?.day_after_night ? 'Yes' : 'No',
            away: at?.day_after_night ? 'Yes' : 'No',
            homeWins: !ht?.day_after_night,
          },
        ],
      },

    },
  };
}