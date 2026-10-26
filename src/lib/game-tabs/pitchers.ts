// Data for the game page's Pitchers tab: both probable starters, arsenal, times through the order, recent outings, and (gated) zone maps and count plans.
// Sources: MLB Stats API (season line, game logs) and the stored Statcast tables the repo already fills (pitcher_zone_arsenal, pitcher_count_tendency,
// pitch_shape_monthly via getSpinByPitch, pitcher_stats tto columns). Nothing is invented: a missing value is null and renders "pending".
import { mlb } from '@/lib/mlb-cockpit.server-fetch-allowed'
import { getPitcherZoneArsenal, type PitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import { getPitcherCountTendency } from '@/lib/pitcher-sequencing'
import { getPitcherStatsFull } from '@/lib/pitcher-full-stats'
import { getSpinByPitch } from '@/lib/mlb-homepage'
import { fetchPitcherHands } from '@/lib/pitcher-hands'
import { PITCH_NAME } from '@/lib/lab/pitch-meta'

type Splits = { date?: string; gameType?: string; opponent?: { name?: string; abbreviation?: string }; stat: Record<string, string | number> }[]
type StatsResp = { stats?: { type?: { displayName: string }; splits: Splits }[] }
const n = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
export const outsOf = (ip: unknown) => { const [a, b] = String(ip ?? '0').split('.'); return Number(a) * 3 + Number(b ?? 0) }
export const ipText = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`

export type ArsenalRow = { code: string; name: string; use: number | null; vL: number | null; vR: number | null; mph: number | null; ivb: number | null; hb: number | null; spin: number | null; whiff: number | null; swings: number; xwoba: number | null; bbe: number; pitches: number }
export type Recent = { date: string; game: string; ip: string; h: number; er: number; bb: number; k: number; hr: number; pit: number | null }
export type ZoneGrid = { share: (number | null)[]; xwoba: (number | null)[]; bbe: number[]; outside: number | null; n: number }
export type CountRow = { label: string; n: number; mix: { code: string; pct: number }[] }
export type PitcherTabData = {
  id: number | null; name: string | null; hand: 'L' | 'R' | null; teamAbbr: string
  line: { w: number | null; l: number | null; era: number | null; ip: string | null; k: number | null; bb: number | null; whip: number | null } | null
  xwLHB: { v: number; n: number } | null; xwRHB: { v: number; n: number } | null
  post: { outs: number; g: number; er: number; k: number } | null
  arsenal: ArsenalRow[]; totalPitches: number; arsenalThrough: string | null
  tto: { label: string; pa: number | null; woba: number | null }[]
  recent: Recent[]
  zones?: { lhb: ZoneGrid | null; rhb: ZoneGrid | null }    // gated: only present when the viewer may see zone maps
  counts?: CountRow[]                                        // gated
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function zoneGrid(a: PitcherZoneArsenal | undefined): ZoneGrid | null {
  if (!a) return null
  const share: number[] = Array(9).fill(0), woba: number[] = Array(9).fill(0), bbe: number[] = Array(9).fill(0)
  let inZone = 0
  for (const p of Object.values(a.arsenal)) for (const [z, c] of Object.entries(p.zones)) {
    const i = Number(z) - 1
    if (i < 0 || i > 8) continue
    const pc = Number(c.pitches ?? 0); share[i] += pc; inZone += pc
    const bb = Number(c.batted_balls ?? 0)
    if (c.woba_against != null && bb > 0) { woba[i] += Number(c.woba_against) * bb; bbe[i] += bb }
  }
  const total = Number(a.total_pitches) || inZone
  if (!total) return null
  return { share: share.map(v => (v / total) * 100), xwoba: woba.map((w, i) => (bbe[i] > 0 ? w / bbe[i] : null)), bbe, outside: total > inZone ? ((total - inZone) / total) * 100 : null, n: total }
}

function sideXwoba(a: PitcherZoneArsenal | undefined): { v: number; n: number } | null {
  if (!a) return null
  let w = 0, bb = 0
  for (const p of Object.values(a.arsenal)) for (const c of Object.values(p.zones)) { const k = Number(c.batted_balls ?? 0); if (c.woba_against != null && k > 0) { w += Number(c.woba_against) * k; bb += k } }
  return bb > 0 ? { v: w / bb, n: bb } : null
}

// Count groups for the plan: First pitch, Ahead (more strikes than balls), Even, Behind, Two strikes. A pitch can sit in two groups (e.g. 1-2 is Ahead and Two strikes).
const GROUPS: { label: string; counts: string[] }[] = [
  { label: 'First pitch', counts: ['0-0'] },
  { label: 'Ahead', counts: ['0-1', '0-2', '1-2'] },
  { label: 'Even', counts: ['1-1', '2-2'] },
  { label: 'Behind', counts: ['1-0', '2-0', '3-0', '2-1', '3-1', '3-2'] },
  { label: 'Two strikes', counts: ['0-2', '1-2', '2-2', '3-2'] },
]

export async function getPitcherTabData(id: number | undefined, name: string | undefined, teamAbbr: string, season: number, includeGated: boolean): Promise<PitcherTabData> {
  const empty: PitcherTabData = { id: null, name: null, hand: null, teamAbbr, line: null, xwLHB: null, xwRHB: null, post: null, arsenal: [], totalPitches: 0, arsenalThrough: null, tto: [], recent: [] }
  if (!id) return empty
  const [seasonResp, logReg, logPost, arsenal, spin, full, hands, counts] = await Promise.all([
    mlb<StatsResp>(`/people/${id}/stats?stats=season&group=pitching&season=${season}`),
    mlb<StatsResp>(`/people/${id}/stats?stats=gameLog&group=pitching&season=${season}`),
    mlb<StatsResp>(`/people/${id}/stats?stats=gameLog&group=pitching&season=${season}&gameType=W,L,D,F`),
    getPitcherZoneArsenal(id).catch(() => ({} as Record<string, PitcherZoneArsenal>)),
    getSpinByPitch(id).catch(() => ({})),
    getPitcherStatsFull(id).catch(() => null),
    fetchPitcherHands([id]).catch(() => new Map<number, 'L' | 'R'>()),
    includeGated ? getPitcherCountTendency(id).catch(() => ({})) : Promise.resolve({}),
  ])
  const s = seasonResp?.stats?.[0]?.splits?.[0]?.stat
  const all = arsenal['all'], vl = arsenal['vs_lhb'], vr = arsenal['vs_rhb']

  const rows: ArsenalRow[] = all ? Object.entries(all.arsenal).map(([code, p]) => {
    let whiffs = 0, swings = 0, w = 0, bb = 0
    for (const c of Object.values(p.zones)) { whiffs += Number(c.whiffs ?? 0); swings += Number(c.swings ?? 0); const k = Number(c.batted_balls ?? 0); if (c.woba_against != null && k > 0) { w += Number(c.woba_against) * k; bb += k } }
    const sp = (spin as Record<string, { rpm: number | null; ivb: number | null; hb: number | null }>)[code]
    return {
      code, name: PITCH_NAME[code] ?? p.pitch_name, use: p.usage_pct == null ? null : Number(p.usage_pct),
      vL: vl?.arsenal[code]?.usage_pct == null ? null : Number(vl.arsenal[code].usage_pct), vR: vr?.arsenal[code]?.usage_pct == null ? null : Number(vr.arsenal[code].usage_pct),
      mph: p.avg_velo == null ? null : Number(p.avg_velo), ivb: sp?.ivb ?? null, hb: sp?.hb ?? null, spin: sp?.rpm ?? null,
      whiff: swings > 0 ? (whiffs / swings) * 100 : null, swings, xwoba: bb > 0 ? w / bb : null, bbe: bb, pitches: Number(p.total_pitches),
    }
  }).filter(r => (r.use ?? 0) >= 1).sort((a, b) => (b.use ?? 0) - (a.use ?? 0)) : []

  const toGame = (sp: Splits[number], post: boolean): Recent & { sortKey: string } => ({
    sortKey: sp.date ?? '', date: (sp.date ?? '').slice(5).replace('-', '/'), game: `${post ? 'Post' : 'Reg'} · ${sp.opponent?.name?.split(' ').slice(-1)[0] ?? sp.opponent?.abbreviation ?? ''}`,
    ip: String(sp.stat.inningsPitched ?? '0.0'), h: Number(sp.stat.hits ?? 0), er: Number(sp.stat.earnedRuns ?? 0), bb: Number(sp.stat.baseOnBalls ?? 0), k: Number(sp.stat.strikeOuts ?? 0), hr: Number(sp.stat.homeRuns ?? 0), pit: n(sp.stat.numberOfPitches),
  })
  const postSplits = logPost?.stats?.[0]?.splits ?? []
  const games = [...(logReg?.stats?.[0]?.splits ?? []).map(x => toGame(x, false)), ...postSplits.map(x => toGame(x, true))].filter(g => g.sortKey).sort((a, b) => b.sortKey.localeCompare(a.sortKey))
  // starts only (a relief outing is not an outing "of the starter")
  const recent = games.filter((_, i) => true).slice(0, 5).map(({ sortKey: _k, ...r }) => r)

  const postOuts = sum(postSplits.map(x => outsOf(x.stat.inningsPitched)))
  const out: PitcherTabData = {
    id, name: name ?? null, hand: hands.get(id) ?? null, teamAbbr,
    line: s ? { w: n(s.wins), l: n(s.losses), era: n(s.era), ip: String(s.inningsPitched ?? ''), k: n(s.strikeOuts), bb: n(s.baseOnBalls), whip: n(s.whip) } : null,
    xwLHB: sideXwoba(vl), xwRHB: sideXwoba(vr),
    post: postSplits.length ? { outs: postOuts, g: postSplits.length, er: sum(postSplits.map(x => Number(x.stat.earnedRuns ?? 0))), k: sum(postSplits.map(x => Number(x.stat.strikeOuts ?? 0))) } : null,
    arsenal: rows, totalPitches: all ? Number(all.total_pitches) : 0, arsenalThrough: null,
    tto: [1, 2, 3].map(i => ({ label: ['1st time', '2nd time', '3rd time'][i - 1], pa: full ? (full as unknown as Record<string, number | null>)[`tto${i}_pa`] : null, woba: full ? (full as unknown as Record<string, number | null>)[`tto${i}_woba`] : null })),
    recent,
  }
  if (includeGated) {
    out.zones = { lhb: zoneGrid(vl), rhb: zoneGrid(vr) }
    const ct = (counts as Record<string, { counts: Record<string, { total_pitches: number; pitches: { pitch_type: string; count_n: number }[] }> }>)['all']
    out.counts = ct ? GROUPS.map(g => {
      const byPitch = new Map<string, number>(); let total = 0
      for (const c of g.counts) { const b = ct.counts[c]; if (!b) continue; total += Number(b.total_pitches ?? 0); for (const p of b.pitches) byPitch.set(p.pitch_type, (byPitch.get(p.pitch_type) ?? 0) + Number(p.count_n ?? 0)) }
      return { label: g.label, n: total, mix: [...byPitch.entries()].map(([code, c]) => ({ code, pct: total ? (c / total) * 100 : 0 })).sort((a, b) => b.pct - a.pct) }
    }).filter(r => r.n > 0) : []
  }
  return out
}
