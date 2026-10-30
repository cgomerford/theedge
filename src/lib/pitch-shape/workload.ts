// src/lib/pitch-shape/workload.ts
//
// One pitcher's season workload (innings, batters faced, strikeouts, ERA) from the free MLB Stats API, for converting a shape change to per-nine figures. Cached six hours.
// A traded pitcher comes back as one line per club; they are added up. null on any failure (logged), and the page then shows no per-nine figure.

export type Workload = { ip: number; bf: number; k: number; era: number | null }

export type Split = { team?: unknown; stat: { inningsPitched: string; battersFaced: number; strikeOuts: number; earnedRuns: number } }

/**
 * A traded pitcher comes back as a combined line (no team) followed by one line per club. Use the combined line when there is one; otherwise add the club lines.
 * (Adding all of them double-counts: Casey Legumina's 71.2 innings read as 143.)
 */
export function combineSplits(splits: Split[]): Workload | null {
  if (splits.length === 0) return null
  const total = splits.find(s => !s.team)
  const use = total ? [total] : splits
  let ip = 0, bf = 0, k = 0, er = 0
  for (const s of use) { ip += innings(s.stat.inningsPitched); bf += s.stat.battersFaced ?? 0; k += s.stat.strikeOuts ?? 0; er += s.stat.earnedRuns ?? 0 }
  return ip > 0 ? { ip, bf, k, era: (er * 9) / ip } : null
}

const innings = (s: string) => { const [w, f] = String(s).split('.'); return Number(w) + (f ? Number(f) / 3 : 0) }

export async function getWorkload(pitcherId: number, season: number): Promise<Workload | null> {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats?stats=season&group=pitching&season=${season}&gameType=R`, { next: { revalidate: 21600 } })
    if (!res.ok) { console.error('[getWorkload] MLB Stats API HTTP', res.status); return null }
    const splits = ((await res.json()) as { stats?: { splits?: Split[] }[] }).stats?.[0]?.splits ?? []
    return combineSplits(splits)
  } catch (e) {
    console.error('[getWorkload] failed:', e instanceof Error ? e.message : e)
    return null
  }
}
