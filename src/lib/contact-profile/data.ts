// src/lib/contact-profile/data.ts
//
// SERVER-ONLY readers for the Contact tab and the Contact Engine. Pages read cached rows; nothing here fetches Baseball
// Savant. Table: batter_contact_profile (migration 20261021120000; writer contact-profile.yml). batter_id 0 = league.
// Data functions return null / [] on failure with a prefixed log, never a fabricated row.

import { createAdminClient } from '@/lib/supabase'
import { MIN_LEADERBOARD, toLeader, type ContactLeaders, type ContactProfile, type ContactRow } from './model'

const COLS = 'batter_id,season,period,month,name,team,n_bbe,weak,topped,under,flare_burner,solid,barrel,gb,air,pull_gb,straight_gb,oppo_gb,pull_air,straight_air,oppo_air'
const PAGE = 1000 // PostgREST caps a response at 1,000 rows

/** A batter's season and month rows plus the league rows (batter_id 0), or null when he has no season row. */
export async function getContactProfile(batterId: number): Promise<ContactProfile | null> {
  if (!Number.isFinite(batterId) || batterId <= 0) return null
  const { data, error } = await createAdminClient()
    .from('batter_contact_profile').select(COLS).in('batter_id', [batterId, 0]).order('season').order('month').limit(PAGE)
  if (error) { console.error('[getContactProfile] Supabase error:', error.message); return null }
  const rows = (data ?? []) as unknown as ContactRow[]
  const mine = rows.filter(r => r.batter_id === batterId), lg = rows.filter(r => r.batter_id === 0)
  const seasons = mine.filter(r => r.period === 'season')
  if (seasons.length === 0) return null
  const season = seasons[seasons.length - 1].season
  return {
    batterId, name: seasons[seasons.length - 1].name, team: seasons[seasons.length - 1].team, season, seasons,
    months: mine.filter(r => r.period === 'month' && r.season === season),
    league: { seasons: lg.filter(r => r.period === 'season'), months: lg.filter(r => r.period === 'month' && r.season === season) },
  }
}

/** Every hitter with at least MIN_LEADERBOARD batted balls in a season, with the league row. null on error. */
export async function getContactLeaders(seasonWanted?: number): Promise<ContactLeaders | null> {
  const supa = createAdminClient()
  const lgRes = await supa.from('batter_contact_profile').select(COLS).eq('batter_id', 0).eq('period', 'season').order('season')
  if (lgRes.error) { console.error('[getContactLeaders] Supabase error (league):', lgRes.error.message); return null }
  const lg = (lgRes.data ?? []) as unknown as ContactRow[]
  if (lg.length === 0) return null
  const seasons = lg.map(r => r.season)
  const season = seasonWanted && seasons.includes(seasonWanted) ? seasonWanted : seasons[seasons.length - 1]
  const out: ContactRow[] = []
  for (let from = 0; ; from += PAGE) { // one season is ~500 qualified rows today; page anyway
    const { data, error } = await supa.from('batter_contact_profile').select(COLS)
      .eq('period', 'season').eq('season', season).gt('batter_id', 0).gte('n_bbe', MIN_LEADERBOARD).range(from, from + PAGE - 1)
    if (error) { console.error('[getContactLeaders] Supabase error:', error.message); return null }
    out.push(...((data ?? []) as unknown as ContactRow[]))
    if (!data || data.length < PAGE) break
  }
  return { season, seasons, rows: out.filter(r => r.name).map(toLeader), league: lg.find(r => r.season === season) ?? null }
}
