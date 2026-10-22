// src/lib/nerve-centre/data.ts
//
// SERVER-ONLY readers for the Contact Lab's Swing Changes and Three True Outcomes sections. Pages read cached rows; nothing here
// fetches Baseball Savant. Tables: batter_swing_monthly (writer swing-monthly.yml) and batter_tto (writer batter-tto.yml);
// batter_id 0 is the league row. Return null / [] on failure with a prefixed log, never a fabricated row.

import { createAdminClient } from '@/lib/supabase'
import { TTO_MIN_PA, type SwingMonthRow, type TtoRow } from './model'

const num = (v: string | number | null) => (v == null ? null : Number(v)) // numeric columns come back as strings

type SwingDb = Omit<SwingMonthRow, 'bat_speed_mean' | 'attack_angle_mean' | 'stance_angle_mean' | 'stance_width_mean'> & {
  bat_speed_mean: string | number | null; attack_angle_mean: string | number | null; stance_angle_mean: string | number | null; stance_width_mean: string | number | null
}
/** A hitter's monthly swing rows for a season, and the league's. null on error. */
export async function getSwingMonthly(batterId: number, season: number): Promise<{ mine: SwingMonthRow[]; league: SwingMonthRow[] } | null> {
  const { data, error } = await createAdminClient().from('batter_swing_monthly')
    .select('batter_id,season,month,n_swings,n_contact,n_bbe,bat_speed_mean,attack_angle_mean,squared_up_n,stance_angle_mean,stance_width_mean')
    .in('batter_id', [batterId, 0]).eq('season', season).order('month').limit(100)
  if (error) { console.error('[getSwingMonthly] Supabase error:', error.message); return null }
  const rows = ((data ?? []) as unknown as SwingDb[]).map(r => ({
    ...r, bat_speed_mean: num(r.bat_speed_mean), attack_angle_mean: num(r.attack_angle_mean), stance_angle_mean: num(r.stance_angle_mean), stance_width_mean: num(r.stance_width_mean),
  }))
  return { mine: rows.filter(r => r.batter_id === batterId), league: rows.filter(r => r.batter_id === 0) }
}

type TtoDb = Omit<TtoRow, 'rolling_tto_sd'> & { rolling_tto_sd: string | number | null }
const TTO_COLS = 'batter_id,season,name,team,pa,k,bb,hr,hbp,hit_in_play,other_in_play,gb,ld,fb,pu,rolling_tto_n,rolling_k_n,rolling_bb_n,rolling_hr_n,rolling_tto_sd'
const toTto = (r: TtoDb): TtoRow => ({ ...r, rolling_tto_sd: num(r.rolling_tto_sd) })

/** Every hitter with TTO_MIN_PA+ plate appearances in a season (the leaderboard and the ternary dots), plus the league row. null on error / no rows. */
export async function getTtoLeaders(season: number): Promise<{ rows: TtoRow[]; league: TtoRow | null } | null> {
  const supa = createAdminClient()
  const [rows, lg] = await Promise.all([
    supa.from('batter_tto').select(TTO_COLS).eq('season', season).gt('batter_id', 0).gte('pa', TTO_MIN_PA).limit(1000),
    supa.from('batter_tto').select(TTO_COLS).eq('season', season).eq('batter_id', 0).maybeSingle(),
  ])
  if (rows.error) { console.error('[getTtoLeaders] Supabase error:', rows.error.message); return null }
  if (lg.error) { console.error('[getTtoLeaders] Supabase error (league):', lg.error.message); return null }
  const list = ((rows.data ?? []) as unknown as TtoDb[]).map(toTto).filter(r => r.name)
  if (list.length === 0) return null
  return { rows: list, league: lg.data ? toTto(lg.data as unknown as TtoDb) : null }
}

/** One hitter's TTO row for a season (any plate-appearance count, so the page can say how few he has). null when he has none. */
export async function getTtoProfile(batterId: number, season: number): Promise<TtoRow | null> {
  const { data, error } = await createAdminClient().from('batter_tto').select(TTO_COLS).eq('batter_id', batterId).eq('season', season).maybeSingle()
  if (error) { console.error('[getTtoProfile] Supabase error:', error.message); return null }
  return data ? toTto(data as unknown as TtoDb) : null
}
