// src/lib/game-plan/data.ts
//
// Sequencing Lab → Game Plan Card: reads the stored cards only (game_plan_cards, written by scripts/build_game_plan_cards.py). One indexed read per page; nothing is
// counted live. A game with no stored card returns an empty list and the page says the card has not been built.

import { createAdminClient } from '@/lib/supabase'

export type Src = 'own' | 'cluster' | null
export type ClusterRef = { id: number; label: string | null } | null
export type CardHitter = {
  slot: number; id: number; name: string; bats: 'L' | 'R' | null; cluster: ClusterRef
  first_pitch: { value: number | null; n: number; source: Src }
  opener: { pitches: string[]; zones: (string | null)[]; pitcher_n: number; league_n: number; k_pct: number | null; hit_pct: number | null } | null
  two_strikes: { type: string; zone: string | null; pitcher_n: number; whiff_pct: number | null; swings: number; source: Src } | null
  damage_zones: { levels: (0 | 1 | 2 | null)[]; worst: string | null; source: Src; n: number }
  second_look: { ended_class: string; ended_pitch: string; n: number; opened_same_pct: number | null; top_other: string | null; top_other_pct: number | null; source: string; small?: boolean } | null
}
export type CardArsenal = { type: string; n: number; usage: number; speed: number | null; ivb: number | null; hb: number | null; stuff: number | null }
export type Card = {
  meta: { gamePk: number; date: string; firstPitchUtc: string | null; venue: string | null; away: { id: number; name: string; abbr: string | null }; home: { id: number; name: string; abbr: string | null } }
  starter: { id: number; name: string; hand: 'L' | 'R'; team: string }
  batting: { id: number; name: string; abbr: string | null }
  lineup_source: 'posted' | 'recent_vs_hand'
  pitches_before: string
  arsenal: CardArsenal[]
  hitters: CardHitter[]
}
export type StoredCard = { gamePk: number; date: string; pitcherId: number; builtAt: string; card: Card }

type Row = { game_pk: number; game_date: string; pitcher_id: number; built_at: string; card: Card }
const shape = (r: Row): StoredCard => ({ gamePk: Number(r.game_pk), date: r.game_date, pitcherId: Number(r.pitcher_id), builtAt: r.built_at, card: r.card })

/** The stored cards for one game (one per probable starter). [] when none are built or the read fails. */
export async function getCardsForGame(gamePk: number): Promise<StoredCard[]> {
  const { data, error } = await createAdminClient().from('game_plan_cards').select('game_pk, game_date, pitcher_id, built_at, card').eq('game_pk', gamePk).order('pitcher_id')
  if (error) { console.error('[getCardsForGame] Supabase error:', error.message); return [] }
  return ((data ?? []) as unknown as Row[]).map(shape)
}

/** Every card for the most recent date that has cards (or the date asked for). */
export async function getLatestCards(date?: string): Promise<{ date: string | null; cards: StoredCard[] }> {
  const supa = createAdminClient()
  let d = date ?? null
  if (!d) {
    const { data, error } = await supa.from('game_plan_cards').select('game_date').order('game_date', { ascending: false }).limit(1)
    if (error) { console.error('[getLatestCards] Supabase error:', error.message); return { date: null, cards: [] } }
    d = (data as { game_date: string }[] | null)?.[0]?.game_date ?? null
  }
  if (!d) return { date: null, cards: [] }
  const { data, error } = await supa.from('game_plan_cards').select('game_pk, game_date, pitcher_id, built_at, card').eq('game_date', d).order('game_pk')
  if (error) { console.error('[getLatestCards] Supabase error:', error.message); return { date: d, cards: [] } }
  return { date: d, cards: ((data ?? []) as unknown as Row[]).map(shape) }
}
