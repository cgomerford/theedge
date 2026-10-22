// src/lib/platoon/data.ts
//
// SERVER-ONLY readers for the Platoon Lab. Pages read cached rows; nothing here fetches Baseball Savant. Table: batter_platoon_process (migration 20261023100000;
// writer batter-platoon.yml); batter_id 0 = league. Names and teams come from batter_tto. Data functions return null / [] on failure with a prefixed log, never a fabricated row.

import { createAdminClient } from '@/lib/supabase'
import { CALL_MIN_PA, DEF, handName, paOf, platoonCall, statOf, type Hand, type PlatoonHitter, type PlatoonRow } from './model'
import type { Bucket, LeagueDot } from '@/components/platoon-lab/PlatoonView'

const COLS = 'batter_id,season,coord_era,bat_side,p_throws,metric,n,value_sum,value_sq_sum,updated_at'
const PAGE = 1000 // PostgREST caps a response at 1,000 rows
const SWITCH_MIN_PA = 50 // a hitter needs this many PA from his lesser side before he is treated as a switch hitter

type Db = Omit<PlatoonRow, 'value_sum' | 'value_sq_sum'> & { value_sum: string | number; value_sq_sum: string | number; updated_at: string }
const toRow = (r: Db): PlatoonRow => ({ batter_id: r.batter_id, season: r.season, coord_era: r.coord_era, bat_side: r.bat_side, p_throws: r.p_throws, metric: r.metric, n: r.n, value_sum: Number(r.value_sum), value_sq_sum: Number(r.value_sq_sum) }) // numeric columns come back as strings

/** A hitter's platoon rows for his latest season, with the league rows, or null when he has none. */
export async function getPlatoonHitter(batterId: number): Promise<{ hitter: PlatoonHitter; updated: string } | null> {
  if (!Number.isFinite(batterId) || batterId <= 0) return null
  const supa = createAdminClient()
  const latest = await supa.from('batter_platoon_process').select('season').eq('batter_id', batterId).order('season', { ascending: false }).limit(1)
  if (latest.error) { console.error('[getPlatoonHitter] Supabase error (season):', latest.error.message); return null }
  const season = latest.data?.[0]?.season as number | undefined
  if (!season) return null
  const [rows, lgRows, who] = await Promise.all([
    supa.from('batter_platoon_process').select(COLS).eq('batter_id', batterId).eq('season', season).limit(PAGE),
    supa.from('batter_platoon_process').select(COLS).eq('batter_id', 0).eq('season', season).not('metric', 'like', 'cp_%').limit(PAGE), // the league's contact-point cells are not needed on a hitter page
    supa.from('batter_tto').select('name,team').eq('batter_id', batterId).order('season', { ascending: false }).limit(1),
  ])
  if (rows.error || lgRows.error) { console.error('[getPlatoonHitter] Supabase error:', (rows.error ?? lgRows.error)?.message); return null }
  const all = [...(rows.data ?? []), ...(lgRows.data ?? [])] as unknown as Db[]
  const mine = all.filter(r => r.batter_id === batterId).map(toRow), lg = all.filter(r => r.batter_id === 0).map(toRow)
  const bySide: Record<Hand, PlatoonRow[]> = { L: mine.filter(r => r.bat_side === 'L'), R: mine.filter(r => r.bat_side === 'R') }
  const paL = paOf(bySide.L), paR = paOf(bySide.R)
  const bats = Math.min(paL, paR) >= SWITCH_MIN_PA ? 'S' : paL >= paR ? 'L' : 'R'
  const name = (who.data?.[0] as { name: string | null } | undefined)?.name ?? `#${batterId}`
  const team = (who.data?.[0] as { team: string | null } | undefined)?.team ?? null
  const updated = all.map(r => r.updated_at).sort().pop() ?? ''
  return {
    hitter: { batterId, name, team, bats, season, coordEra: mine[0]?.coord_era ?? '2026', bySide, league: { L: lg.filter(r => r.bat_side === 'L'), R: lg.filter(r => r.bat_side === 'R') } },
    updated: updated.slice(0, 10),
  }
}

// League scatter: every hitter's process gap and wOBA gap, one season and 2024-2026 pooled. In memory for an hour (about 20 pages of rows).
// (A page that renders while a rebuild is half-written would be cached for the full hour; the weekly build runs at 09:00 UTC on Sunday, when traffic is lightest.)
const TTL_MS = 60 * 60 * 1000
let leagueCache: { at: number; sets: { single: LeagueDot[]; pooled: LeagueDot[]; season: number } } | null = null
const METRICS = ['bat_speed', 'chase', 'woba']
// every metric the call reads (the contact-point cells, cp_*, are left out)
const ALL_NON_CP = ['bat_speed', 'swing_tilt', 'contact_depth', 'contact_x', 'attack_direction', 'chase', 'zone_contact', 'squared_up', 'k_pct', 'bb_pct', 'xwoba', 'woba', 'spray_gb_pull', 'spray_gb_straight', 'spray_gb_oppo', 'spray_air_pull', 'spray_air_straight', 'spray_air_oppo']

async function fetchAll(seasons: number[], metrics: string[] | null = METRICS): Promise<PlatoonRow[] | null> {
  const supa = createAdminClient()
  const page = (from: number) => supa.from('batter_platoon_process').select(COLS, from === 0 ? { count: 'exact' } : undefined)
    .gt('batter_id', 0).in('season', seasons).filter('metric', 'in', `(${(metrics ?? ALL_NON_CP).join(',')})`).order('batter_id').order('season').order('bat_side').order('p_throws').order('metric').range(from, from + PAGE - 1)
  const first = await page(0)
  if (first.error) { console.error('[getPlatoonLeague] Supabase error:', first.error.message); return null }
  const total = first.count ?? 0
  const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(total / PAGE) - 1) }, (_, i) => page((i + 1) * PAGE)))
  const out = [...(first.data ?? [])]
  for (const r of rest) { if (r.error) { console.error('[getPlatoonLeague] Supabase error:', r.error.message); return null } out.push(...(r.data ?? [])) }
  return (out as unknown as Db[]).map(toRow)
}

/** Dots for the league view. A switch hitter's gap is between his two sides, so he is left out; everyone else uses his main side. Pooled keeps bat speed only (chase is zone-based, never pooled across eras). */
function dotsFrom(rows: PlatoonRow[], names: Map<number, string>, pooled: boolean, info?: Map<number, { bucket: Bucket; note: string }>): LeagueDot[] {
  const byBatter = new Map<number, PlatoonRow[]>()
  for (const r of rows) { const a = byBatter.get(r.batter_id); if (a) a.push(r); else byBatter.set(r.batter_id, [r]) }
  const out: LeagueDot[] = []
  for (const [id, rs] of byBatter) {
    const side = (s: Hand) => rs.filter(r => r.bat_side === s)
    const paL = paOf(side('L')), paR = paOf(side('R'))
    if (Math.min(paL, paR) >= SWITCH_MIN_PA) continue
    const mine = paL >= paR ? side('L') : side('R')
    // pool seasons on the same side: counts and sums add
    const pool = (metric: string, hand: Hand) => {
      const m = mine.filter(r => r.metric === metric && r.p_throws === hand)
      const n = m.reduce((a, r) => a + r.n, 0), s = m.reduce((a, r) => a + r.value_sum, 0)
      return n ? { n, mean: s / n } : { n: 0, mean: null as number | null }
    }
    const wL = pool('woba', 'L'), wR = pool('woba', 'R')
    if (wL.mean == null || wR.mean == null || wL.n < 20 || wR.n < 20) continue
    const bL = pool('bat_speed', 'L'), bR = pool('bat_speed', 'R'), cL = pool('chase', 'L'), cR = pool('chase', 'R')
    const batGap = bL.mean != null && bR.mean != null && bL.n >= DEF.bat_speed.gate && bR.n >= DEF.bat_speed.gate ? bL.mean - bR.mean : null
    const chaseGap = !pooled && cL.mean != null && cR.mean != null && cL.n >= DEF.chase.gate && cR.n >= DEF.chase.gate ? cL.mean - cR.mean : null
    if (batGap == null && chaseGap == null) continue
    const b = info?.get(id)
    out.push({ batterId: id, name: names.get(id) ?? `#${id}`, paL: wL.n, wobaGap: wL.mean - wR.mean, batGap, chaseGap, ...(b ? { bucket: b.bucket, note: b.note } : {}) })
  }
  return out
}

// ---- the three lists ----
// Usage = how often he faces each pitcher hand against how often hitters on his batting side do (league rows). Sheltered: under 60% of the usual share against a hand. Faces it fully: 75% or more.
// should     Platoon: Yes, and he is not sheltered from his weaker hand.
// everyday   Platoon: No (no split, results only or swing only), yet he is sheltered from a hand: the data does not back the platoon he is getting.
// notworth   a real split, but his wOBA against the weaker hand is still at or above league average (reason not_worth), whatever his usage.
const SHELTERED = 0.6, FULL_TIME = 0.75, USAGE_MIN_PA = 150
const pct = (v: number) => `${Math.round(v * 100)}%`
const w3 = (v: number) => v.toFixed(3).replace(/^0/, '')

function bucketFor(mine: PlatoonRow[], lgSide: PlatoonRow[], pooled: Record<Hand, { n: number; mean: number | null }>): { bucket: Bucket; note: string } | null {
  const call = platoonCall(mine, lgSide)
  const pa = { L: statOf(mine, 'woba', 'L').n, R: statOf(mine, 'woba', 'R').n }
  const lg = { L: statOf(lgSide, 'woba', 'L').n, R: statOf(lgSide, 'woba', 'R').n }
  const tot = pa.L + pa.R, lgTot = lg.L + lg.R
  if (tot < USAGE_MIN_PA || lgTot === 0) return null
  const ratio = (x: Hand) => (pa[x] / tot) / (lg[x] / lgTot)
  const share = (x: Hand) => `faces ${handName(x)} in ${pct(pa[x] / tot)} of his PA (league ${pct(lg[x] / lgTot)})`
  const wl = statOf(mine, 'woba', 'L').mean, wr = statOf(mine, 'woba', 'R').mean
  const wobas = wl != null && wr != null ? `wOBA ${w3(wl)} vs LHP over ${pa.L} PA, ${w3(wr)} vs RHP over ${pa.R} PA` : ''
  const weak = call.weak
  if (call.call === 'not_enough') return everyday()
  if (call.reason === 'not_worth' && weak) return { bucket: 'notworth', note: `${wobas}; ${w3(call.weakWoba as number)} against ${handName(weak)} is still above the league’s ${w3(call.leagueWoba as number)}; ${share(weak)}` }
  if (call.call === 'yes' && weak && ratio(weak) >= FULL_TIME) return { bucket: 'should', note: `${wobas}; ${share(weak)}` }
  return call.call === 'no' ? everyday() : null

  // platooned: sheltered from a hand, and his wOBA against it over all stored seasons (same batting side) is within .040 of his wOBA against the other hand, on 100+ PA
  function everyday(): { bucket: Bucket; note: string } | null {
    const s: Hand = ratio('L') <= ratio('R') ? 'L' : 'R', o: Hand = s === 'L' ? 'R' : 'L'
    if (ratio(s) >= SHELTERED || pooled[s].n < CALL_MIN_PA || pooled[o].n < CALL_MIN_PA || pooled[s].mean == null || pooled[o].mean == null) return null
    if ((pooled[s].mean as number) - (pooled[o].mean as number) <= -DEF.woba.practical) return null
    return { bucket: 'everyday', note: `${share(s)}, but hits it: wOBA ${w3(pooled[s].mean as number)} vs ${handName(s)} over ${pooled[s].n} PA across 2024–2026 (${w3(pooled[o].mean as number)} vs ${handName(o)} over ${pooled[o].n})` }
  }
}

export async function getPlatoonLeague(): Promise<{ single: LeagueDot[]; pooled: LeagueDot[]; season: number } | null> {
  if (process.env.NODE_ENV === 'production' && leagueCache && Date.now() - leagueCache.at < TTL_MS) return leagueCache.sets   // cached for an hour in production only: in dev a half-written rebuild would otherwise linger
  const supa = createAdminClient()
  const seasonsRes = await supa.from('batter_platoon_process').select('season').eq('batter_id', 0).eq('metric', 'woba').limit(20)
  if (seasonsRes.error) { console.error('[getPlatoonLeague] Supabase error (seasons):', seasonsRes.error.message); return null }
  const seasons = [...new Set((seasonsRes.data ?? []).map(r => r.season as number))].sort((a, b) => a - b)
  if (seasons.length === 0) return null
  const latest = seasons[seasons.length - 1]
  const [rows, full, lgRes, nm] = await Promise.all([
    fetchAll(seasons), fetchAll([latest], null),
    supa.from('batter_platoon_process').select(COLS).eq('batter_id', 0).eq('season', latest).not('metric', 'like', 'cp_%').limit(PAGE),
    supa.from('batter_tto').select('batter_id,name').eq('season', latest).limit(PAGE),
  ])
  if (!rows || !full || lgRes.error) { if (lgRes.error) console.error('[getPlatoonLeague] Supabase error (league rows):', lgRes.error.message); return null }
  const lgRows = ((lgRes.data ?? []) as unknown as Db[]).map(toRow)
  // the call for every hitter on one side (switch hitters are left out), then the three lists
  const info = new Map<number, { bucket: Bucket; note: string }>()
  const byId = new Map<number, PlatoonRow[]>()
  for (const r of full) { const a = byId.get(r.batter_id); if (a) a.push(r); else byId.set(r.batter_id, [r]) }
  for (const [id, rs] of byId) {
    const sd = (s: Hand) => rs.filter(r => r.bat_side === s)
    const paL = paOf(sd('L')), paR = paOf(sd('R'))
    if (Math.min(paL, paR) >= SWITCH_MIN_PA) continue
    const side: Hand = paL >= paR ? 'L' : 'R'
    const allSeasons = (rows.filter(r => r.batter_id === id && r.bat_side === side && r.metric === 'woba'))
    const pool = (hand: Hand) => { const m = allSeasons.filter(r => r.p_throws === hand), n = m.reduce((a, r) => a + r.n, 0); return { n, mean: n ? m.reduce((a, r) => a + r.value_sum, 0) / n : null as number | null } }
    const b = bucketFor(sd(side), lgRows.filter(r => r.bat_side === side), { L: pool('L'), R: pool('R') })
    if (b) info.set(id, b)
  }
  const names = new Map<number, string>(((nm.data ?? []) as { batter_id: number; name: string | null }[]).filter(r => r.name).map(r => [r.batter_id, r.name as string]))
  const sets = { single: dotsFrom(rows.filter(r => r.season === latest), names, false, info), pooled: dotsFrom(rows, names, true), season: latest }
  leagueCache = { at: Date.now(), sets }
  return sets
}

/** The selected hitter's own gaps, for the highlighted dot. */
export function gapsOf(rows: PlatoonRow[]) {
  const g = (m: 'bat_speed' | 'chase' | 'woba') => { const l = statOf(rows, m, 'L').mean, r = statOf(rows, m, 'R').mean; return l != null && r != null ? l - r : null }
  return { batGap: g('bat_speed'), chaseGap: g('chase'), wobaGap: g('woba'), paL: statOf(rows, 'woba', 'L').n }
}
