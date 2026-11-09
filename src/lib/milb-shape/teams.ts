// src/lib/milb-shape/teams.ts
//
// Triple-A and Florida State League clubs: abbreviation (Savant's home_team and our team_abbr) to MLB Stats API team id, name and parent club, for logos and labels.
// Read from /api/v1/teams?sportId=11|14&season=2026 (the Florida State League is league 123 inside Single-A). Abbreviations repeat across levels (Columbus is COL at
// Triple-A, Colorado is COL in MLB), so every lookup takes the level. Client-safe data only.

import { MLB_TEAMS } from '@/lib/teams'
import type { Level } from './levels'

export type MilbTeam = { abbr: string; id: number; name: string; parentId: number | null; parentName: string | null }

const t = (abbr: string, id: number, name: string, parentId: number | null, parentName: string | null): MilbTeam => ({ abbr, id, name, parentId, parentName })

export const MILB_TEAMS: Record<'aaa' | 'fsl', MilbTeam[]> = {
  aaa: [
    t("ABQ", 342, "Albuquerque Isotopes", 115, "Colorado Rockies"),
    t("BUF", 422, "Buffalo Bisons", 141, "Toronto Blue Jays"),
    t("CLT", 494, "Charlotte Knights", 145, "Chicago White Sox"),
    t("COL", 445, "Columbus Clippers", 114, "Cleveland Guardians"),
    t("DUR", 234, "Durham Bulls", 139, "Tampa Bay Rays"),
    t("ELP", 4904, "El Paso Chihuahuas", 135, "San Diego Padres"),
    t("GWN", 431, "Gwinnett Stripers", 144, "Atlanta Braves"),
    t("IND", 484, "Indianapolis Indians", 134, "Pittsburgh Pirates"),
    t("IOW", 451, "Iowa Cubs", 112, "Chicago Cubs"),
    t("JAX", 564, "Jacksonville Jumbo Shrimp", 146, "Miami Marlins"),
    t("LHV", 1410, "Lehigh Valley IronPigs", 143, "Philadelphia Phillies"),
    t("LOU", 416, "Louisville Bats", 113, "Cincinnati Reds"),
    t("LV", 400, "Las Vegas Aviators", 133, "Athletics"),
    t("MEM", 235, "Memphis Redbirds", 138, "St. Louis Cardinals"),
    t("NAS", 556, "Nashville Sounds", 158, "Milwaukee Brewers"),
    t("NOR", 568, "Norfolk Tides", 110, "Baltimore Orioles"),
    t("OKC", 238, "Oklahoma City Comets", 119, "Los Angeles Dodgers"),
    t("OMA", 541, "Omaha Storm Chasers", 118, "Kansas City Royals"),
    t("RNO", 2310, "Reno Aces", 109, "Arizona Diamondbacks"),
    t("ROC", 534, "Rochester Red Wings", 120, "Washington Nationals"),
    t("RR", 102, "Round Rock Express", 140, "Texas Rangers"),
    t("SAC", 105, "Sacramento River Cats", 137, "San Francisco Giants"),
    t("SL", 561, "Salt Lake Bees", 108, "Los Angeles Angels"),
    t("STP", 1960, "St. Paul Saints", 142, "Minnesota Twins"),
    t("SUG", 5434, "Sugar Land Space Cowboys", 117, "Houston Astros"),
    t("SWB", 531, "Scranton/Wilkes-Barre RailRiders", 147, "New York Yankees"),
    t("SYR", 552, "Syracuse Mets", 121, "New York Mets"),
    t("TAC", 529, "Tacoma Rainiers", 136, "Seattle Mariners"),
    t("TOL", 512, "Toledo Mud Hens", 116, "Detroit Tigers"),
    t("WOR", 533, "Worcester Red Sox", 111, "Boston Red Sox"),
  ],
  fsl: [
    t("BRD", 3390, "Bradenton Marauders", 134, "Pittsburgh Pirates"),
    t("CLR", 566, "Clearwater Threshers", 143, "Philadelphia Phillies"),
    t("DBT", 450, "Daytona Tortugas", 113, "Cincinnati Reds"),
    t("DUN", 424, "Dunedin Blue Jays", 141, "Toronto Blue Jays"),
    t("FTM", 509, "Fort Myers Mighty Mussels", 142, "Minnesota Twins"),
    t("JUP", 479, "Jupiter Hammerheads", 146, "Miami Marlins"),
    t("LAK", 570, "Lakeland Flying Tigers", 116, "Detroit Tigers"),
    t("PMB", 279, "Palm Beach Cardinals", 138, "St. Louis Cardinals"),
    t("SLU", 507, "St. Lucie Mets", 121, "New York Mets"),
    t("TAM", 587, "Tampa Tarpons", 147, "New York Yankees"),
  ],
}

const byLevel = (level: 'aaa' | 'fsl') => new Map(MILB_TEAMS[level].map(x => [x.abbr, x]))
const maps: Record<'aaa' | 'fsl', Map<string, MilbTeam>> = { aaa: byLevel('aaa'), fsl: byLevel('fsl') }
const ALIAS: Record<string, string> = { AZ: 'ARI' }   // Savant says AZ; our team list says ARI

/** The club for an abbreviation at a level (MLB uses the main team list). null when unknown. */
export function teamOf(level: Level, abbr: string | null | undefined): { id: number; name: string; parentId: number | null } | null {
  if (!abbr) return null
  const a = abbr.toUpperCase()
  // Spring Training is the major-league clubs' own games, so it uses the main team list; the Arizona Fall League has no club list here, so no badge is drawn for it
  if (level === 'mlb' || level === 'st') { const m = MLB_TEAMS.find(x => x.abbrev === (ALIAS[a] ?? a)); return m ? { id: m.id, name: m.name, parentId: null } : null }
  if (level === 'afl') return null
  const m = maps[level].get(a)
  return m ? { id: m.id, name: m.name, parentId: m.parentId } : null
}

/** Club logo URL (MLB's team-logos CDN also serves minor-league club ids). null when the club is unknown, so nothing is drawn rather than a wrong badge. */
export function teamLogoUrl(level: Level, abbr: string | null | undefined): string | null {
  const t = teamOf(level, abbr)
  return t ? `https://www.mlbstatic.com/team-logos/${t.id}.svg` : null
}
