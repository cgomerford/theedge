// src/lib/postgame/countaudit.ts
//
// Pro §15 Count spot audit — where the starter's pitches actually landed in each kind of count,
// against his pre-game map (pitcher_count_tendency, split `all`, season; read-only): for each count
// and pitch type, the zone he most often throws it to. A pitch "hit its usual spot" when it landed in
// that zone. Statcast zones: 1–9 the strike zone (catcher's view, 1 = top-left), 11–14 the four
// quadrants outside it (11 top-left, 12 top-right, 13 bottom-left, 14 bottom-right). Count buckets
// come from pitchlog.countGroup. Pitch/count pairs with under MIN_N season examples have no usual spot.

import { createAdminClient } from '@/lib/supabase'
import type { PostData } from './data'
import { buildPitchLog, COUNT_GROUPS, countGroup, startersOf } from './pitchlog'
import type { Side } from './recap'

export const MIN_N = 5
type Counts = Record<string, { pitches?: { pitch_type: string; pct: number; count_n: number; top_zone: string | null }[] }>

export type CountGroupNight = {
  group: (typeof COUNT_GROUPS)[number]
  n: number                        // pitches thrown in this bucket
  graded: number                   // ...that have a usual spot to compare with
  onSpot: number
  zones: Record<string, number>    // tonight's pitches by zone
  usualZones: string[]             // the zones his map points to in this bucket
}
export type CountStarter = { side: Side; id: number; name: string; graded: number; onSpot: number; groups: CountGroupNight[] }

export async function getCountAudit(d: PostData, gameDate: string): Promise<{ starters: CountStarter[]; missing: string[] }> {
  const starters = startersOf(d)
  const { data, error } = await createAdminClient().from('pitcher_count_tendency').select('player_id, counts')
    .in('player_id', starters.map((s) => s.id)).eq('season', Number(gameDate.slice(0, 4))).eq('split', 'all')
  if (error) console.error('[getCountAudit] Supabase error:', error.message)
  const usual = new Map<number, Counts>()
  for (const r of (data ?? []) as { player_id: number; counts: Counts }[]) usual.set(Number(r.player_id), r.counts ?? {})

  const log = buildPitchLog(d)
  const out: CountStarter[] = [], missing: string[] = []
  for (const s of starters) {
    const counts = usual.get(s.id)
    if (!counts) { missing.push(s.name); continue }
    const groups = new Map(COUNT_GROUPS.map((g) => [g, { group: g, n: 0, graded: 0, onSpot: 0, zones: {} as Record<string, number>, usualZones: new Set<string>() }]))
    for (const [key, c] of Object.entries(counts)) {
      const [b, st] = key.split('-').map(Number)
      const g = groups.get(countGroup(b, st))
      if (!g) continue
      for (const p of c.pitches ?? []) if (p.top_zone && p.count_n >= MIN_N && p.pct >= 10) g.usualZones.add(String(p.top_zone))
    }
    let graded = 0, onSpot = 0
    for (const p of log) {
      if (p.pitcherId !== s.id) continue
      const g = groups.get(countGroup(p.balls, p.strikes))!
      g.n += 1
      if (p.zone != null) g.zones[String(p.zone)] = (g.zones[String(p.zone)] ?? 0) + 1
      const spot = counts[`${p.balls}-${p.strikes}`]?.pitches?.find((x) => x.pitch_type === p.type && x.count_n >= MIN_N && x.top_zone)
      if (!spot || p.zone == null) continue
      g.graded += 1; graded += 1
      if (String(p.zone) === String(spot.top_zone)) { g.onSpot += 1; onSpot += 1 }
    }
    out.push({ side: s.side, id: s.id, name: s.name, graded, onSpot, groups: [...groups.values()].map((g) => ({ ...g, usualZones: [...g.usualZones] })) })
  }
  return { starters: out, missing }
}
