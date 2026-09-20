// src/lib/postgame/keyplayers.ts
//
// Postgame §12 Key players scorecard — the Preview's key players for this game (frozen at first
// pitch in key_players_snapshot, 3 per club), checked against what they did: Showed up / Stayed
// quiet / Missed, or "Didn't play". Read-only here.
// Verdict (fixed rules, stated on the page). Win probability added (WPA) uses the same cut as §3
// (SOLID = 6 points, summed over the game), because WPA alone under-rates a good night in a blowout:
//   Batter  Showed up: WPA ≥ +6, or 2+ hits, or 4+ total bases, or on base 3+ times.
//           Missed: not showed up, and (WPA ≤ −6, or 4+ plate appearances without reaching base).
//   Pitcher Showed up: WPA ≥ +6, or 5+ IP with ≤ 2 ER.  Missed: not showed up, and (WPA ≤ −6 or 4+ ER).
//   Otherwise Stayed quiet.  Did not appear in the box score → Didn't play.
// Egress: reason_summary is ~13 KB of JSON per row, so only the few small fields shown are pulled
// with PostgREST's `->>` JSON accessors (starter_summary, driving_pitch) — never the whole blob.

import { createAdminClient } from '@/lib/supabase'
import type { PFPlayer, PostData } from './data'
import { batLine, pitchLine, playerWpa, SOLID, type Side } from './recap'

export type KeyVerdict = 'Showed up' | 'Stayed quiet' | 'Missed' | "Didn't play"
export type KeyPlayerRow = {
  id: number; name: string; side: Side; type: 'batter' | 'pitcher'; rank: number
  preview: 'Favourable' | 'Neutral' | 'Tough'
  why: string | null
  verdict: KeyVerdict
  line: string | null
  wpa: number | null
}
type SnapRow = { team_id: number; rank: number; player_type: 'batter' | 'pitcher'; player_id: number; player_name: string; lean: string; summary: string | null; driving_pitch: string | null }

const num = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const outsOf = (ip: unknown): number => { const [w, f = '0'] = String(ip ?? '0.0').split('.'); return num(w) * 3 + num(f) }

function judge(type: 'batter' | 'pitcher', p: PFPlayer, wpa: number): KeyVerdict {
  if (type === 'batter') {
    const b = p.stats?.batting ?? {}
    const onBase = num(b.hits) + num(b.baseOnBalls) + num(b.hitByPitch)
    const pa = num(b.atBats) + num(b.baseOnBalls) + num(b.hitByPitch) + num(b.sacFlies) + num(b.sacBunts)
    if (wpa >= SOLID || num(b.hits) >= 2 || num(b.totalBases) >= 4 || onBase >= 3) return 'Showed up'
    if (wpa <= -SOLID || (pa >= 4 && onBase === 0)) return 'Missed'
    return 'Stayed quiet'
  }
  const s = p.stats?.pitching ?? {}
  if (wpa >= SOLID || (outsOf(s.inningsPitched) >= 15 && num(s.earnedRuns) <= 2)) return 'Showed up'
  if (wpa <= -SOLID || num(s.earnedRuns) >= 4) return 'Missed'
  return 'Stayed quiet'
}

const LEAN: Record<string, KeyPlayerRow['preview']> = { edge: 'Favourable', neutral: 'Neutral', tough: 'Tough' }

export async function getKeyPlayersNight(d: PostData): Promise<KeyPlayerRow[]> {
  const { data, error } = await createAdminClient()
    .from('key_players_snapshot')
    .select('team_id, rank, player_type, player_id, player_name, lean, summary:reason_summary->>starter_summary, driving_pitch:reason_summary->>driving_pitch')
    .eq('game_pk', d.feed.gamePk)
    .order('team_id', { ascending: true }).order('rank', { ascending: true })
  if (error) { console.error('[getKeyPlayersNight] Supabase error:', error.message); return [] }
  const rows = (data ?? []) as unknown as SnapRow[]
  if (rows.length === 0) return []

  const box = d.feed.liveData.boxscore.teams
  const { bat, pit } = playerWpa(d)
  return rows.flatMap((r) => {
    const id = Number(r.player_id)
    const side: Side | null = Number(r.team_id) === d.feed.gameData.teams.away.id ? 'away' : Number(r.team_id) === d.feed.gameData.teams.home.id ? 'home' : null
    if (!side) return []
    const p: PFPlayer | undefined = box[side].players[`ID${id}`]
    const batted = r.player_type === 'batter' && bat.has(id) ? bat.get(id) : undefined
    const pitched = r.player_type === 'pitcher' && pit.has(id) ? pit.get(id) : undefined
    const wpa = batted ?? pitched ?? null
    const played = p != null && wpa != null
    const verdict: KeyVerdict = !played || !p ? "Didn't play" : judge(r.player_type, p, wpa as number)
    const why = r.summary ?? (r.driving_pitch ? `Preview flagged his ${r.driving_pitch.toLowerCase()}.` : null)
    return [{
      id, name: r.player_name, side, type: r.player_type, rank: Number(r.rank),
      preview: LEAN[r.lean] ?? 'Neutral', why, verdict,
      line: played && p ? (r.player_type === 'batter' ? batLine(p) : pitchLine(p)) : null,
      wpa,
    }]
  })
}
