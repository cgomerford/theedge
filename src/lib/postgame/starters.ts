// src/lib/postgame/starters.ts
//
// Postgame §6 Starters: plan vs night — how each starting pitcher's pitch mix and velocity
// tonight compare with his usual (season) mix. "Tonight" comes from the live feed's pitch events
// (pitch type code per pitch, start speed, call code); "usual" is the `all` split of
// pitcher_zone_arsenal, the same season arsenal the Scout Report's pitcher-attack section shows,
// so this is that section's promise checked against the night.
// Reads pitcher_zone_arsenal only (never writes it — single writer is fetch_pitcher_hot_zones.py).
// Fields confirmed against real responses: feed playEvents[].details.type.code / call.code and
// pitchData.startSpeed; arsenal[code].usage_pct / avg_velo / pitch_name (percent, 0–100).

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase'
import type { PostData } from './data'
import type { Side } from './recap'

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const surname = (full: string) => full.trim().split(/\s+/).slice(-1)[0]

// The feed labels a two-seamer FT; the season arsenal files it under SI.
const CANON: Record<string, string> = { FT: 'SI' }
// Not pitches thrown for the pitcher's arsenal: pitchouts, intentional balls, automatic balls, unknown.
const SKIP = new Set(['PO', 'IN', 'AB', 'UN', 'FO', ''])
// the feed's long pitch names, shortened to match the season arsenal's labels
const SHORT: Record<string, string> = { 'Four-Seam Fastball': '4-seam', 'Two-Seam Fastball': 'Sinker', 'Knuckle Curve': 'Knuckle-curve' }
const WHIFF = new Set(['S', 'W', 'T'])      // swinging strike, swinging strike (blocked), foul tip
const FASTBALLS = new Set(['FF', 'SI', 'FC'])

export type MixRow = {
  code: string
  name: string
  tonightN: number
  tonightPct: number
  usualPct: number | null
  velo: number | null
  usualVelo: number | null
  whiffs: number
}
export type StarterNight = {
  side: Side
  id: number
  name: string
  line: { ip: string; h: number; r: number; er: number; bb: number; k: number; pitches: number; strikes: number }
  mix: MixRow[]
  hasUsual: boolean
  read: string
}

export type ArsenalRow = { player_id: number; total_pitches: number; arsenal: Record<string, { pitch_name?: string; usage_pct?: number | null; avg_velo?: number | null }> }

export async function getUsualArsenals(ids: number[], year: number): Promise<Map<number, ArsenalRow>> {
  const out = new Map<number, ArsenalRow>()
  if (ids.length === 0) return out
  const { data, error } = await createAdminClient()
    .from('pitcher_zone_arsenal')
    .select('player_id, total_pitches, arsenal')
    .in('player_id', ids).eq('season', year).eq('split', 'all')
  if (error) { console.error('[getUsualArsenals] Supabase error:', error.message); return out }
  for (const r of (data ?? []) as ArsenalRow[]) out.set(Number(r.player_id), r)
  return out
}

function readFor(last: string, mix: MixRow[], hasUsual: boolean): string {
  if (!hasUsual) return `No season pitch mix is on file for ${last}, so tonight's mix is shown without a comparison.`
  const parts: string[] = []
  const shifts = mix.filter((m) => m.usualPct != null && m.tonightN >= 8).map((m) => ({ m, d: m.tonightPct - (m.usualPct as number) }))
  const up = shifts.filter((s) => s.d >= 8).sort((a, b) => b.d - a.d)[0]
  const down = shifts.filter((s) => s.d <= -8).sort((a, b) => a.d - b.d)[0]
  if (up) parts.push(`leaned on the ${up.m.name.toLowerCase()} (${Math.round(up.m.tonightPct)}% vs ${Math.round(up.m.usualPct as number)}% usual)`)
  if (down) parts.push(`went to the ${down.m.name.toLowerCase()} far less (${Math.round(down.m.tonightPct)}% vs ${Math.round(down.m.usualPct as number)}%)`)
  const fb = mix.filter((m) => FASTBALLS.has(m.code) && m.velo != null && m.usualVelo != null && m.tonightN >= 10).sort((a, b) => b.tonightN - a.tonightN)[0]
  if (fb) {
    const dv = (fb.velo as number) - (fb.usualVelo as number)
    if (Math.abs(dv) >= 1) parts.push(`his ${fb.name.toLowerCase()} averaged ${(fb.velo as number).toFixed(1)} mph, ${Math.abs(dv).toFixed(1)} ${dv > 0 ? 'above' : 'below'} his season average`)
  }
  if (parts.length === 0) return `${last} threw close to his usual mix and velocity.`
  return `${last} ${parts.join('; ')}.`
}

export const getStarterNights = cache(async (d: PostData, gameDate: string): Promise<StarterNight[]> => {
  const f = d.feed
  const box = f.liveData.boxscore.teams
  const starters = (['away', 'home'] as Side[]).flatMap((side) => {
    const id = box[side].pitchers?.[0]
    const p = id != null ? box[side].players[`ID${id}`] : undefined
    return id != null && p ? [{ side, id, p }] : []
  })
  if (starters.length === 0) return []

  const usual = await getUsualArsenals(starters.map((s) => s.id), Number(gameDate.slice(0, 4)))

  // tonight's pitches by starter
  const byId = new Map<number, Map<string, { n: number; velo: number; veloN: number; whiffs: number; name: string }>>()
  for (const s of starters) byId.set(s.id, new Map())
  for (const play of f.liveData.plays.allPlays) {
    const bucket = byId.get(play.matchup.pitcher.id)
    if (!bucket) continue
    for (const e of play.playEvents ?? []) {
      if (!e.isPitch) continue
      const raw = e.details?.type?.code ?? ''
      if (SKIP.has(raw)) continue
      const code = CANON[raw] ?? raw
      const row = bucket.get(code) ?? { n: 0, velo: 0, veloN: 0, whiffs: 0, name: SHORT[e.details?.type?.description ?? ''] ?? e.details?.type?.description ?? code }
      row.n += 1
      if (e.pitchData?.startSpeed != null) { row.velo += e.pitchData.startSpeed; row.veloN += 1 }
      if (WHIFF.has(e.details?.call?.code ?? '')) row.whiffs += 1
      bucket.set(code, row)
    }
  }

  return starters.map(({ side, id, p }) => {
    const st = p.stats?.pitching ?? {}
    const bucket = byId.get(id) ?? new Map()
    const total = [...bucket.values()].reduce((a, r) => a + r.n, 0)
    const u = usual.get(id)
    const mix: MixRow[] = [...bucket.entries()].map(([code, r]) => {
      const ua = u?.arsenal?.[code]
      return {
        code,
        // the season arsenal's label is the shorter, friendlier one ("4-seam"); fall back to the feed's
        name: ua?.pitch_name ?? r.name,
        tonightN: r.n,
        tonightPct: total > 0 ? (r.n / total) * 100 : 0,
        usualPct: ua?.usage_pct != null ? n(ua.usage_pct) : null,   // not in his season arsenal → no comparison, not a made-up 0%
        velo: r.veloN > 0 ? r.velo / r.veloN : null,
        usualVelo: ua?.avg_velo != null ? n(ua.avg_velo) : null,
        whiffs: r.whiffs,
      }
    }).sort((a, b) => b.tonightN - a.tonightN)
    // a pitch in his usual arsenal that he never threw tonight is part of the story too
    if (u) {
      for (const [code, ua] of Object.entries(u.arsenal ?? {})) {
        const usualPct = n(ua.usage_pct)
        if (!bucket.has(code) && usualPct >= 5) mix.push({ code, name: ua.pitch_name ?? code, tonightN: 0, tonightPct: 0, usualPct, velo: null, usualVelo: ua.avg_velo != null ? n(ua.avg_velo) : null, whiffs: 0 })
      }
    }
    const hasUsual = !!u && Object.keys(u.arsenal ?? {}).length > 0
    return {
      side, id, name: p.person.fullName,
      line: { ip: String(st.inningsPitched ?? '0.0'), h: n(st.hits), r: n(st.runs), er: n(st.earnedRuns), bb: n(st.baseOnBalls), k: n(st.strikeOuts), pitches: n(st.pitchesThrown ?? st.numberOfPitches), strikes: n(st.strikes) },
      mix, hasUsual,
      read: readFor(surname(p.person.fullName), mix, hasUsual),
    }
  })
})
