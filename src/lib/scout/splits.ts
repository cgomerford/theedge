// src/lib/scout/splits.ts
//
// Scout §7 (Platoon · home/road · day/night) — season splits for tonight's
// lineup (confirmed, else projected) and tonight's starter, from the MLB Stats
// API statSplits (sitCodes vl/vr = vs left/right-handed pitching or batters,
// h/a = home/away, d/n = day/night) in ONE batched call per club side. Every
// cell carries the plate appearances (hitters) or batters faced / innings
// (pitchers) behind it; the UI fades anything under the minimum.

import { getProjectedLineup } from '@/lib/lineups'

const MLB = 'https://statsapi.mlb.com/api/v1'
export const SPLIT_KEYS = ['vl', 'vr', 'h', 'a', 'd', 'n'] as const
export type SplitKey = (typeof SPLIT_KEYS)[number]
export const MIN_SPLIT_PA = 30
export const MIN_SPLIT_BF = 40

export type HitSplit = { ops: number | null; avg: number | null; pa: number }
export type PitchSplit = { ops: number | null; era: number | null; bf: number; ip: string }

export type HitterSplits = { id: number; name: string; bats: 'L' | 'R' | 'S' | null; order: number; splits: Partial<Record<SplitKey, HitSplit>> }
export type PitcherSplits = { id: number; name: string; throws: 'L' | 'R' | null; splits: Partial<Record<SplitKey, PitchSplit>> }

export type ClubSplits = {
  lineup: HitterSplits[]
  lineupSource: 'confirmed' | 'projected_from_previous_game' | 'unavailable'
  pitcher: PitcherSplits | null
  /** PA-weighted OPS across the lineup, per split. */
  lineupOps: Partial<Record<SplitKey, { ops: number; pa: number }>>
}

const num = (v: unknown): number | null => {
  const x = Number(v)
  return v == null || v === '' || !Number.isFinite(x) ? null : x
}

type RawSplit = { split?: { code?: string }; stat?: Record<string, string | number> }
function bySit(people: { id: number; fullName: string; batSide?: { code?: string }; pitchHand?: { code?: string }; stats?: { splits?: RawSplit[] }[] }[]) {
  return people.map((p) => {
    const map = new Map<string, Record<string, string | number>>()
    for (const st of p.stats ?? []) for (const sp of st.splits ?? []) if (sp.split?.code && sp.stat && !map.has(sp.split.code)) map.set(sp.split.code, sp.stat)
    return { p, map }
  })
}

async function fetchPeople(ids: number[], group: 'hitting' | 'pitching', season: string) {
  if (ids.length === 0) return []
  try {
    const res = await fetch(
      `${MLB}/people?personIds=${ids.join(',')}&hydrate=stats(group=[${group}],type=[statSplits],sitCodes=[${SPLIT_KEYS.join(',')}],season=${season})`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15000) },
    )
    return res.ok ? bySit((await res.json()).people ?? []) : []
  } catch { return [] }
}

export async function getClubSplits(teamId: number, gameDate: string, gamePk: number, probableId: number | null): Promise<ClubSplits> {
  const season = gameDate.slice(0, 4)
  const lineup = await getProjectedLineup(teamId, gameDate, gamePk)
  const batters = lineup.batters
  const [hitPeople, pitPeople] = await Promise.all([
    fetchPeople(batters.map((b) => b.player_id), 'hitting', season),
    probableId ? fetchPeople([probableId], 'pitching', season) : Promise.resolve([]),
  ])

  const hitters: HitterSplits[] = batters.map((b) => {
    const found = hitPeople.find((x) => x.p.id === b.player_id)
    const splits: HitterSplits['splits'] = {}
    for (const k of SPLIT_KEYS) {
      const s = found?.map.get(k)
      if (s) splits[k] = { ops: num(s.ops), avg: num(s.avg), pa: Number(s.plateAppearances ?? 0) }
    }
    const code = found?.p.batSide?.code
    return { id: b.player_id, name: b.player_name, bats: code === 'L' || code === 'R' || code === 'S' ? code : null, order: b.batting_order, splits }
  })

  const lineupOps: ClubSplits['lineupOps'] = {}
  for (const k of SPLIT_KEYS) {
    const rows = hitters.map((h) => h.splits[k]).filter((s): s is HitSplit => !!s && s.ops != null && s.pa > 0)
    const pa = rows.reduce((a, s) => a + s.pa, 0)
    if (pa > 0) lineupOps[k] = { ops: rows.reduce((a, s) => a + (s.ops as number) * s.pa, 0) / pa, pa }
  }

  let pitcher: PitcherSplits | null = null
  const pp = pitPeople[0]
  if (pp) {
    const splits: PitcherSplits['splits'] = {}
    for (const k of SPLIT_KEYS) {
      const s = pp.map.get(k)
      if (s) splits[k] = { ops: num(s.ops), era: num(s.era), bf: Number(s.battersFaced ?? 0), ip: String(s.inningsPitched ?? '0.0') }
    }
    pitcher = { id: pp.p.id, name: pp.p.fullName, throws: pp.p.pitchHand?.code === 'L' ? 'L' : pp.p.pitchHand?.code === 'R' ? 'R' : null, splits }
  }
  return { lineup: hitters, lineupSource: lineup.source, pitcher, lineupOps }
}
