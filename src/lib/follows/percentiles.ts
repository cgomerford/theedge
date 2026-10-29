// src/lib/follows/percentiles.ts
//
// Savant percentile ranks for the My x9Lab player cards, read from the stored table player_percentiles (scripts/fetch_player_percentiles.py, nightly). Higher is better for every
// metric (Savant corrects the direction). THE PRO TRIM HAPPENS HERE, ON THE SERVER: for a viewer who is not Pro this returns only the top 3 ranks plus `lockedCount` (an integer),
// never the labels or values of the rest, so nothing locked reaches a component, the page HTML or any JSON. Pro gets the full set.
// Sample minimums come from MIN_SAMPLE: a block needs batterPercentilePA / pitcherPercentileBF; Hard-Hit% also needs hardHitBBE batted balls, and is left out (and reported) below it.
// A missing row is "pending"; nothing is estimated.

import { createAdminClient } from '@/lib/supabase'
import { MIN_SAMPLE } from '@/lib/min-sample'

type Meta = { label: string; skill: string; stat: 'bb' | 'hr' | 'avg' | 'sb' | 'ops' | 'k' | 'era' }
const BATTER: Record<string, Meta> = {
  xwoba: { label: 'xwOBA', skill: 'Hitting results', stat: 'ops' }, xba: { label: 'xBA', skill: 'Contact', stat: 'avg' }, xslg: { label: 'xSLG', skill: 'Power', stat: 'hr' },
  xobp: { label: 'xOBP', skill: 'Plate discipline', stat: 'bb' }, brl_percent: { label: 'Barrel%', skill: 'Power', stat: 'hr' }, exit_velocity: { label: 'Exit velo', skill: 'Power', stat: 'hr' },
  max_ev: { label: 'Max exit velo', skill: 'Power', stat: 'hr' }, hard_hit_percent: { label: 'Hard-hit%', skill: 'Power', stat: 'hr' }, k_percent: { label: 'K%', skill: 'Contact', stat: 'avg' },
  bb_percent: { label: 'BB%', skill: 'Plate discipline', stat: 'bb' }, whiff_percent: { label: 'Whiff%', skill: 'Contact', stat: 'avg' }, chase_percent: { label: 'Chase%', skill: 'Plate discipline', stat: 'bb' },
  sprint_speed: { label: 'Sprint speed', skill: 'Speed', stat: 'sb' }, bat_speed: { label: 'Bat speed', skill: 'Bat speed', stat: 'avg' }, squared_up_rate: { label: 'Squared-up%', skill: 'Contact', stat: 'avg' },
}
const PITCHER: Record<string, Meta> = {
  xera: { label: 'xERA', skill: 'Run prevention', stat: 'era' }, xwoba: { label: 'xwOBA against', skill: 'Run prevention', stat: 'era' }, xba: { label: 'xBA against', skill: 'Run prevention', stat: 'era' },
  xslg: { label: 'xSLG against', skill: 'Run prevention', stat: 'era' }, brl_percent: { label: 'Barrel% allowed', skill: 'Contact management', stat: 'era' }, exit_velocity: { label: 'Exit velo allowed', skill: 'Contact management', stat: 'era' },
  hard_hit_percent: { label: 'Hard-hit% allowed', skill: 'Contact management', stat: 'era' }, k_percent: { label: 'K%', skill: 'Strikeouts', stat: 'k' }, whiff_percent: { label: 'Whiff%', skill: 'Strikeouts', stat: 'k' },
  chase_percent: { label: 'Chase%', skill: 'Strikeouts', stat: 'k' }, bb_percent: { label: 'BB%', skill: 'Control', stat: 'bb' }, fb_velocity: { label: 'Fastball velo', skill: 'Velocity', stat: 'k' },
  fb_spin: { label: 'Fastball spin', skill: 'Stuff', stat: 'k' }, curve_spin: { label: 'Curve spin', skill: 'Stuff', stat: 'k' },
}
const FREE_COUNT = 3

export type PctRow = { key: string; label: string; pct: number }
export type PctBlock = {
  state: 'ok' | 'small' | 'pending'
  /** plate appearances (hitters) or batters faced (pitchers) behind the block */
  n: number; need: number
  /** the free 3 for a non-Pro viewer; every available rank, high to low, for Pro */
  rows: PctRow[]
  /** how many more ranks exist beyond `rows`, for the locked placeholders (0 for Pro) */
  lockedCount: number
  /** set when Hard-hit% was left out for lack of batted balls: how many there were */
  hardHitSmall: number | null
  /** the highest of the free 3 (never a locked value) with its skill and the season stat to quote */
  best: { skill: string; label: string; pct: number; stat: Meta['stat'] } | null
}

export async function getPercentileBlocks(players: { id: number; isPitcher: boolean; n: number }[], season: number, isPro: boolean): Promise<Map<number, PctBlock>> {
  const out = new Map<number, PctBlock>()
  if (players.length === 0) return out
  const supa = createAdminClient()
  const { data, error } = await supa.from('player_percentiles').select('player_id, kind, ranks').eq('season', season).in('player_id', players.map(p => p.id))
  if (error) console.error('[getPercentileBlocks] Supabase error:', error.message)
  const byKey = new Map<string, Record<string, number | null>>()
  for (const r of (data ?? []) as unknown as { player_id: number; kind: string; ranks: Record<string, number | null> }[]) byKey.set(`${r.player_id}-${r.kind}`, r.ranks)
  // batted balls, only where Hard-hit% could be shown
  const bbe = new Map<number, number>()
  await Promise.all(players.map(async p => {
    if (!(byKey.get(`${p.id}-${p.isPitcher ? 'pitcher' : 'batter'}`)?.hard_hit_percent != null)) return
    const { count, error: e } = await supa.from('batted_ball_events').select('id', { count: 'exact', head: true }).eq(p.isPitcher ? 'pitcher_id' : 'batter_id', p.id).gte('game_date', `${season}-01-01`).lt('game_date', `${season + 1}-01-01`)
    if (e) console.error('[getPercentileBlocks] batted balls:', e.message)
    else bbe.set(p.id, count ?? 0)
  }))
  for (const p of players) {
    const need = p.isPitcher ? MIN_SAMPLE.pitcherPercentileBF : MIN_SAMPLE.batterPercentilePA
    const ranks = byKey.get(`${p.id}-${p.isPitcher ? 'pitcher' : 'batter'}`)
    const base = { n: p.n, need, rows: [] as PctRow[], lockedCount: 0, hardHitSmall: null as number | null, best: null as PctBlock['best'] }
    if (!ranks) { out.set(p.id, { state: 'pending', ...base }); continue }
    if (p.n < need) { out.set(p.id, { state: 'small', ...base }); continue }
    const meta = p.isPitcher ? PITCHER : BATTER
    let hardHitSmall: number | null = null
    const rows: PctRow[] = []
    for (const [k, m] of Object.entries(meta)) {
      const v = ranks[k]
      if (v == null) continue
      if (k === 'hard_hit_percent' && (bbe.get(p.id) ?? 0) < MIN_SAMPLE.hardHitBBE) { hardHitSmall = bbe.get(p.id) ?? 0; continue }
      rows.push({ key: k, label: m.label, pct: Math.round(v) })
    }
    rows.sort((a, b) => b.pct - a.pct)
    const free = rows.slice(0, FREE_COUNT)
    const top = free[0]
    out.set(p.id, {
      state: rows.length ? 'ok' : 'pending', n: p.n, need, hardHitSmall,
      rows: isPro ? rows : free,                                   // the trim: a non-Pro viewer is never given the rest
      lockedCount: isPro ? 0 : Math.max(0, rows.length - FREE_COUNT),
      best: top ? { skill: meta[top.key].skill, label: top.label, pct: top.pct, stat: meta[top.key].stat } : null,
    })
  }
  return out
}
