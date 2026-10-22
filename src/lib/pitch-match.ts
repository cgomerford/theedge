// src/lib/pitch-match.ts
//
// "When did a pitch like this last happen to this batter?" — reads the batter's own pitch log
// (getBatterPitchLog: one cached Statcast pull per player per season) and keeps the pitches that look like
// the one being asked about: same pitch type, a similar spot over the plate, a similar speed, and optionally
// the same count and / or the same pitcher.
//
// Limits, stated plainly in the UI: the pitch log is REGULAR SEASON only, so postseason pitches are not searched.
// Nothing is estimated — a window with no match returns an empty list.

import { getBatterPitchLog, type RawBatterPitch } from '@/lib/batter-pitch-log'

export type PitchMatchQuery = {
  batterId: number
  type: string
  x: number; z: number; speed: number | null
  /** only pitches in this count (balls-strikes before the pitch) */
  count?: string
  pitcherId?: number
  fromSeason: number; toSeason: number
}
export type PitchMatchRow = {
  date: string; gamePk: number | null; pitcher: string; pitcherId: number | null
  type: string; speed: number | null; x: number; z: number; count: string | null
  /** Statcast description (swinging_strike, foul, hit_into_play, ...) */
  description: string | null; result: string | null
  ev: number | null; la: number | null
}
export type PitchMatchResult = {
  rows: PitchMatchRow[]; total: number
  tally: { key: string; n: number }[]
  seasons: number[]; missingSeasons: number[]
}

const RADIUS_FT = 0.5     // how far from the reference spot still counts as "the same spot"
const SPEED_MPH = 3       // how far off in speed

export async function matchPitches(q: PitchMatchQuery): Promise<PitchMatchResult> {
  const seasons: number[] = []
  for (let y = q.toSeason; y >= q.fromSeason; y--) seasons.push(y)
  const logs = await Promise.all(seasons.map(async y => ({ y, log: await getBatterPitchLog(q.batterId, y).catch(e => { console.error('[matchPitches] log failed:', q.batterId, y, (e as Error).message); return null }) })))
  const missingSeasons = logs.filter(l => !l.log).map(l => l.y)
  const hits: PitchMatchRow[] = []
  for (const { log } of logs) {
    if (!log) continue
    for (const p of log.pitches as RawBatterPitch[]) {
      if (p.pitchType !== q.type) continue
      if (!Number.isFinite(p.plateX) || !Number.isFinite(p.plateZ)) continue
      if (Math.hypot(p.plateX - q.x, p.plateZ - q.z) > RADIUS_FT) continue
      if (q.speed != null && p.releaseSpeed != null && Math.abs(p.releaseSpeed - q.speed) > SPEED_MPH) continue
      const count = p.balls != null && p.strikes != null ? `${p.balls}-${p.strikes}` : null
      if (q.count && count !== q.count) continue
      if (q.pitcherId && p.pitcherId !== q.pitcherId) continue
      hits.push({
        date: p.date, gamePk: p.gamePk, pitcher: p.pitcherId != null ? log.pitcherNames[p.pitcherId] ?? `#${p.pitcherId}` : '—', pitcherId: p.pitcherId,
        type: p.pitchType, speed: p.releaseSpeed, x: p.plateX, z: p.plateZ, count,
        description: p.description, result: p.result, ev: p.launchSpeed, la: p.launchAngle,
      })
    }
  }
  hits.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const t = new Map<string, number>()
  for (const h of hits) { const k = h.description ?? 'unknown'; t.set(k, (t.get(k) ?? 0) + 1) }
  return {
    rows: hits.slice(0, 12), total: hits.length,
    tally: [...t].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n),
    seasons, missingSeasons,
  }
}
