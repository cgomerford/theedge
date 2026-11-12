// src/lib/team-levels.ts
//
// teamId -> level for every club in MLB and the minors (plus Fall/Winter league clubs). The player endpoint does not say which level a club plays at, so it comes from the
// teams list: one call, cached 24 hours. Empty on failure, so callers just show no badge.
import { LEVEL_BY_SPORT_ID, SPORT_IDS, type LevelKey } from '@/lib/levels'
import { mlb } from '@/lib/mlb-cockpit.server-fetch-allowed'

export async function getTeamLevels(): Promise<Map<number, { level: LevelKey; label: string }>> {
  const out = new Map<number, { level: LevelKey; label: string }>()
  const json = await mlb<{ teams?: { id: number; sport?: { id?: number } }[] }>(`/teams?sportIds=${SPORT_IDS}&season=${new Date().getFullYear()}`, 86400)
  if (!json) { console.error('[getTeamLevels] MLB Stats API error: no response'); return out }
  for (const t of json.teams ?? []) {
    const lvl = LEVEL_BY_SPORT_ID[Number(t.sport?.id)]
    if (lvl) out.set(Number(t.id), { level: lvl.key, label: lvl.label })
  }
  return out
}
