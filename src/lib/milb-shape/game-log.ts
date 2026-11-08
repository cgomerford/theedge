// src/lib/milb-shape/game-log.ts
//
// Which of a pitcher's games were at which level, from the MLB Stats API game log (free, no auth): /people/{id}/stats?stats=gameLog&group=pitching&season=Y&sportId=S.
// Each split carries the game's gamePk and league. A pitcher can pitch at several levels in a season and Savant's minor-league CSV returns all the Single-A leagues together, so the
// pitch log keeps only the games the Stats API places at the level asked for: Triple-A is sport 11 (any league), the Florida State League is sport 14 AND league 123. Cached six hours.
// null on any failure (logged), never a guess at which games count.

import { logOnce } from '@/lib/log'
import { EXPECTED_LEAGUES, SPORT_ID, type Level, type MilbLevel } from './levels'

const STATS = 'https://statsapi.mlb.com/api/v1'
type Split = { game?: { gamePk?: number }; league?: { id?: number; name?: string }; stat?: { numberOfPitches?: number } }

async function splits(pitcherId: number, season: number, sportId: number): Promise<Split[] | null> {
  try {
    const res = await fetch(`${STATS}/people/${pitcherId}/stats?stats=gameLog&group=pitching&season=${season}&sportId=${sportId}`, { next: { revalidate: 21600 } })
    if (!res.ok) { logOnce(`gamelog.http.${sportId}`, 'getMilbGames', 'MLB Stats API HTTP', res.status); return null }
    return ((await res.json()) as { stats?: { splits?: Split[] }[] }).stats?.[0]?.splits ?? []
  } catch (e) {
    logOnce(`gamelog.err.${sportId}`, 'getMilbGames', 'failed', e instanceof Error ? e.message : String(e))
    return null
  }
}

const inLevel = (level: MilbLevel, s: Split) => level === 'aaa' || EXPECTED_LEAGUES.fsl.includes(s.league?.id ?? -1)

/** The gamePks he pitched at the level that season. An empty set means he has none there; null means the Stats API could not be read. */
export async function getMilbGames(pitcherId: number, season: number, level: MilbLevel): Promise<Set<number> | null> {
  const sp = await splits(pitcherId, season, SPORT_ID[level])
  if (sp == null) return null
  return new Set(sp.filter(s => inLevel(level, s)).map(s => s.game?.gamePk).filter((x): x is number => typeof x === 'number'))
}

export type LevelUse = { level: Level; games: number; pitches: number }

/** Where he pitched this season: games and pitches at MLB, Triple-A and the Florida State League (levels with none are left out). */
export async function getLevelUse(pitcherId: number, season: number): Promise<LevelUse[]> {
  const [mlb, aaa, a] = await Promise.all([splits(pitcherId, season, 1), splits(pitcherId, season, SPORT_ID.aaa), splits(pitcherId, season, SPORT_ID.fsl)])
  const sum = (sp: Split[] | null) => ({ games: sp?.length ?? 0, pitches: (sp ?? []).reduce((n, s) => n + (s.stat?.numberOfPitches ?? 0), 0) })
  const out: LevelUse[] = []
  const m = sum(mlb), t = sum(aaa), f = sum((a ?? []).filter(s => inLevel('fsl', s)))
  if (m.games) out.push({ level: 'mlb', ...m })
  if (t.games) out.push({ level: 'aaa', ...t })
  if (f.games) out.push({ level: 'fsl', ...f })
  return out
}
