// src/lib/lab-scope.ts
//
// Which Batting / Pitching Lab tabs a player has data for. Every lab tab except Overview reads MLB Statcast tables, so a player with no MLB games at all (a minor leaguer)
// would open empty tabs. The lab layouts use this to show only the tabs that have data, instead of a row of "isn't built yet" pages.
// Read-only: it reads the page data already cached for the profile, plus one count on pitch_shape_pitcher_milb (written by scripts/import-milb-pitch-shape.ts).
import { getPlayerPageData } from '@/lib/player-page'
import { createAdminClient } from '@/lib/supabase'
import { getHitterLevelUse } from '@/lib/milb-shape/game-log'
import { log } from '@/lib/log'

export type LabScope = {
  /** true when he has minor-league games and has never played an MLB game */
  minorsOnly: boolean
  /** pitchers only: the minor-league pitch-shape tables hold rows for him, so the Levels tab has something to show */
  hasMilbShape: boolean
  /** hitters only: he has Triple-A or Florida State League games this season, so his pitch log at that level can be read (Location Lab, Sequencing) */
  hasMilbLog: boolean
}

const games = (rows: { stat: Record<string, string | number> }[]) => rows.reduce((a, r) => a + Number(r.stat.gamesPlayed ?? 0), 0)

export async function getLabScope(playerId: number): Promise<LabScope> {
  const data = await getPlayerPageData(playerId)
  if (!data) return { minorsOnly: false, hasMilbShape: false, hasMilbLog: false }   // unknown: leave every tab visible rather than hide real ones
  const mlbGames = games(data.yearByYearHitting) + games(data.yearByYearPitching)
  const minorGames = games(data.minorsHitting) + games(data.minorsPitching)
  const minorsOnly = mlbGames === 0 && minorGames > 0
  if (minorsOnly && !data.identity.isPitcher) {
    const use = await getHitterLevelUse(playerId, new Date().getFullYear())
    return { minorsOnly, hasMilbShape: false, hasMilbLog: use.some(u => u.level !== 'mlb' && u.pitches > 0) }
  }
  if (!minorsOnly || !data.identity.isPitcher) return { minorsOnly, hasMilbShape: false, hasMilbLog: false }
  const { count, error } = await createAdminClient().from('pitch_shape_pitcher_milb').select('pitcher_id', { count: 'exact', head: true }).eq('pitcher_id', playerId)
  if (error) log.error('getLabScope', 'Supabase error', error.message)
  return { minorsOnly, hasMilbShape: !error && (count ?? 0) > 0, hasMilbLog: false }
}
