// src/lib/front-office/postseason.server-fetch-allowed.ts
//
// The four LCS clubs, from MLB's postseason series feed. This is the one live call on the
// Front Office hub: a single small request cached for 15 minutes (not a fan-out, no Savant
// CSVs). The `.server-fetch-allowed` suffix is the guard.sh opt-out. If it ever grows, move it
// to a cron + table like the rest of the hub. Returns [] on any failure.

import { MLB_TEAMS } from '@/lib/teams'

export type FinalFourSeries = { label: 'ALCS' | 'NLCS'; teamIds: number[] }

/** curl-verified 2026-10-15: /schedule/postseason/series -> series[] { series.id 'L_1'.., games[0].teams.away|home.team.id } */
export async function getFinalFour(season: number): Promise<FinalFourSeries[]> {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule/postseason/series?season=${season}`, { next: { revalidate: 900 } })
    if (!res.ok) {
      console.error('[getFinalFour] MLB Stats API status:', res.status)
      return []
    }
    const json = (await res.json()) as { series?: { series?: { id?: string }; games?: { teams?: { away?: { team?: { id?: number } }; home?: { team?: { id?: number } } } }[] }[] }
    const out: FinalFourSeries[] = []
    for (const s of json.series ?? []) {
      if (!String(s.series?.id ?? '').startsWith('L_')) continue
      const g = s.games?.[0]?.teams
      const ids = [g?.away?.team?.id, g?.home?.team?.id].filter((x): x is number => typeof x === 'number' && MLB_TEAMS.some(t => t.id === x))
      if (ids.length !== 2) continue
      const league = MLB_TEAMS.find(t => t.id === ids[0])?.league
      out.push({ label: league === 'AL' ? 'ALCS' : 'NLCS', teamIds: ids })
    }
    return out.sort((a, b) => a.label.localeCompare(b.label))
  } catch (e) {
    console.error('[getFinalFour] fetch failed:', e instanceof Error ? e.message : e)
    return []
  }
}
