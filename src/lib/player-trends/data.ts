// src/lib/player-trends/data.ts
//
// Server-side builders for the Pro "Statcast trends" tab. Reads ONLY:
//   • Supabase `pitch_events` and `batted_ball_events` — every pitch / every
//     ball in play since 2026-03-27 (single writer: scripts/fetch_statcast_events.py,
//     nightly). Columns curl-verified 2026-09-20:
//       pitch_events        game_pk, game_date, at_bat_number, pitch_number, pitcher_id,
//                           batter_id, pitch_type, release_speed, description, events, zone
//       batted_ball_events  game_pk, game_date, at_bat_number, batter_id, pitcher_id,
//                           launch_speed, launch_angle, events, estimated_woba, launch_speed_angle
//   • MLB Stats API: pitcher game log (per-start box lines, keyed by game.gamePk),
//     the club's schedule (dayNight per gamePk), and /people (pitch hand, batched).
//   • ONE cached Savant CSV per (batter, season) for balls in play — the only
//     source with hit coordinates (spray) and last season's exit velocities.
//     Parsed to a few hundred small rows and cached in Supabase (withSavantCache),
//     so the 2 MB CSV is never held by Next's data cache. BOM stripped (CLAUDE.md gotcha).
//
// Rows are sent to the browser compact; the client recomputes rolling windows
// and toggles from them (see rolling.ts). Every failure returns null with a
// prefixed log — the tab shows an empty state, never a fabricated line.
//
// NOT included, on purpose: spin rate / extension. They are not in pitch_events,
// and the live Savant pull that has them is not stable enough to trend.

import { createAdminClient } from '@/lib/supabase'
import { withSavantCache } from '@/lib/savant-cache'
import { getLeagueTables, ipToDecimal } from '@/lib/team-profile/league'
import { BB_WEIGHT, HBP_WEIGHT, type BatterTrendsData, type BbePoint, type PaRow, type PitGame, type PitTypeGame, type PitcherTrendsData } from './rolling'

const MLB = 'https://statsapi.mlb.com/api/v1'
const SWING = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul_tip', 'foul', 'foul_bunt', 'missed_bunt', 'hit_into_play', 'hit_into_play_score', 'hit_into_play_no_out'])
const WHIFF = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul_tip', 'missed_bunt'])
const NOT_AB = new Set(['walk', 'intent_walk', 'hit_by_pitch', 'sac_bunt', 'sac_fly', 'sac_bunt_double_play', 'sac_fly_double_play', 'catcher_interf', 'truncated_pa'])
const HITS = new Set(['single', 'double', 'triple', 'home_run'])
const NUM = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

type PitchRow = { game_pk: number; game_date: string; at_bat_number: number; pitch_number: number; pitcher_id: number; batter_id: number; pitch_type: string | null; release_speed: number | string | null; description: string | null; events: string | null; zone: number | null }
type BbeRow = { game_pk: number; at_bat_number: number; game_date: string; launch_speed: number | string | null; launch_speed_angle: number | null; estimated_woba: number | string | null }

/** PostgREST caps a response at 1,000 rows (CLAUDE.md gotcha) — page until a short page comes back. */
async function fetchAll<T>(table: string, select: string, col: string, id: number, tag: string): Promise<T[] | null> {
  const supa = createAdminClient()
  const out: T[] = []
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supa.from(table).select(select).eq(col, id).order('id', { ascending: true }).range(from, from + 999)
    if (error) { console.error(`[${tag}] Supabase error:`, error.message); return null }
    out.push(...((data ?? []) as unknown as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

const byPa = (a: PitchRow, b: PitchRow) => a.game_date.localeCompare(b.game_date) || a.game_pk - b.game_pk || a.at_bat_number - b.at_bat_number || a.pitch_number - b.pitch_number

/** xwOBA value of one plate appearance: contact from Statcast's estimate, walks/HBP at standard weights, strikeouts 0. null = excluded. */
function paValue(ev: string | null, est: number | null): number | null {
  if (est != null) return est
  if (ev === 'walk') return BB_WEIGHT
  if (ev === 'hit_by_pitch') return HBP_WEIGHT
  if (ev === 'strikeout' || ev === 'strikeout_double_play') return 0
  return null   // intentional walk, sacrifice bunt, truncated PA, or contact with no tracked estimate: not guessed
}

async function handsOf(ids: number[]): Promise<Map<number, 'L' | 'R'>> {
  // Batched /people (100 ids per call) — NOT one call per pitcher: that burst is exactly what
  // triggers the MLB API's ECONNRESET (CLAUDE.md gotcha).
  const out = new Map<number, 'L' | 'R'>()
  const uniq = [...new Set(ids)]
  for (let i = 0; i < uniq.length; i += 100) {
    try {
      const res = await fetch(`${MLB}/people?personIds=${uniq.slice(i, i + 100).join(',')}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(10000) })
      if (!res.ok) continue
      for (const p of (await res.json()).people ?? []) { const c = p.pitchHand?.code; if (c === 'L' || c === 'R') out.set(p.id, c) }
    } catch (e) { console.error('[handsOf]', e instanceof Error ? e.message : e) }
  }
  return out
}

async function sessionsOf(teamId: number | null, season: number): Promise<Map<number, 'day' | 'night'>> {
  const m = new Map<number, 'day' | 'night'>()
  if (!teamId) return m
  try {
    const res = await fetch(`${MLB}/schedule?sportId=1&teamId=${teamId}&season=${season}&gameType=R`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(12000) })
    if (!res.ok) return m
    for (const d of (await res.json()).dates ?? []) for (const g of d.games ?? []) if (g.dayNight === 'day' || g.dayNight === 'night') m.set(g.gamePk, g.dayNight)
  } catch (e) { console.error('[sessionsOf]', e instanceof Error ? e.message : e) }
  return m
}

// ── Savant balls-in-play log (spray + exit velocity) ──────────────────────────
function parseLine(line: string): string[] {
  const cells: string[] = []; let cur = '', q = false
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { cells.push(cur.trim()); cur = '' } else cur += ch }
  cells.push(cur.trim()); return cells
}

async function fetchBbe(batterId: number, season: number): Promise<BbePoint[] | null> {
  const url = ['https://baseballsavant.mlb.com/statcast_search/csv', `?all=true&hfGT=R%7C&hfSea=${season}%7C&player_type=batter`, `&batters_lookup%5B%5D=${batterId}`,
    `&game_date_gt=${season}-01-01&game_date_lt=${season}-12-31`, '&min_pitches=0&min_results=0&group_by=name&sort_col=pitches', '&player_event_sort=api_p_release_speed&sort_order=desc&type=details'].join('')
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', Accept: 'text/csv,*/*' }, cache: 'no-store', signal: AbortSignal.timeout(30000) })
    if (!res.ok) { console.error('[fetchBbe] Savant status', res.status); return null }
    const lines = (await res.text()).replace(/^﻿/, '').trim().split(/\r?\n/)
    if (lines.length < 2) return []
    const head = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, ''))
    const ix = (n: string) => head.indexOf(n)
    const [iD, iPk, iX, iY, iSt, iH, iS, iA, iT] = ['game_date', 'game_pk', 'hc_x', 'hc_y', 'stand', 'p_throws', 'launch_speed', 'launch_angle', 'type'].map(ix)
    if ([iD, iX, iSt, iS, iT].some(i => i < 0)) { console.error('[fetchBbe] unexpected Savant columns'); return null }
    const out: BbePoint[] = []
    for (const l of lines.slice(1)) {
      const c = parseLine(l)
      if (c[iT] !== 'X') continue
      out.push({ d: c[iD], pk: Number(c[iPk]) || 0, x: NUM(c[iX]), y: NUM(c[iY]), st: c[iSt] === 'L' || c[iSt] === 'R' ? (c[iSt] as 'L' | 'R') : null, h: c[iH] === 'L' || c[iH] === 'R' ? (c[iH] as 'L' | 'R') : null, s: NUM(c[iS]), a: NUM(c[iA]) })
    }
    return out.sort((a, b) => a.d.localeCompare(b.d) || a.pk - b.pk)
  } catch (e) { console.error('[fetchBbe]', e instanceof Error ? e.message : e); return null }
}
const getBbe = (id: number, season: number) => withSavantCache<BbePoint[] | null>(`bbe-trend:${id}:${season}`, 21600, () => fetchBbe(id, season))

// ── hitters ────────────────────────────────────────────────────────────────────
export async function getBatterTrendsData(batterId: number, teamId: number | null, season: number): Promise<BatterTrendsData | null> {
  const [pitches, bbes] = await Promise.all([
    fetchAll<PitchRow>('pitch_events', 'id, game_pk, game_date, at_bat_number, pitch_number, pitcher_id, batter_id, pitch_type, release_speed, description, events, zone', 'batter_id', batterId, 'getBatterTrendsData:pitches'),
    fetchAll<BbeRow>('batted_ball_events', 'id, game_pk, game_date, at_bat_number, launch_speed, launch_speed_angle, estimated_woba', 'batter_id', batterId, 'getBatterTrendsData:bbe'),
  ])
  if (!pitches || !bbes || pitches.length === 0) return null

  const [hands, sessions, bbe, bbePrev] = await Promise.all([
    handsOf(pitches.map(p => p.pitcher_id)), sessionsOf(teamId, season), getBbe(batterId, season), getBbe(batterId, season - 1),
  ])
  const bbeMap = new Map(bbes.map(b => [`${b.game_pk}:${b.at_bat_number}`, b]))

  const groups = new Map<string, PitchRow[]>()
  for (const p of pitches.sort(byPa)) { const k = `${p.game_pk}:${p.at_bat_number}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(p) }

  const pa: PaRow[] = []
  for (const [k, ps] of groups) {
    const last = ps[ps.length - 1]
    const ev = last.events
    if (ev === 'truncated_pa') continue
    if (ev == null) continue    // an unfinished PA (pitch log ends mid-at-bat) — not counted
    let sw = 0, wh = 0, oz = 0, ozs = 0
    for (const p of ps) {
      const swung = p.description != null && SWING.has(p.description)
      if (swung) sw++
      if (p.description != null && WHIFF.has(p.description)) wh++
      if (p.zone != null && p.zone >= 11) { oz++; if (swung) ozs++ }
    }
    const b = bbeMap.get(k)
    const est = b ? NUM(b.estimated_woba) : null
    const s = b ? NUM(b.launch_speed) : null
    pa.push({
      n: pa.length + 1, d: last.game_date, pk: last.game_pk,
      h: hands.get(last.pitcher_id) ?? null, dn: sessions.get(last.game_pk) ?? null, ev,
      sw, wh, oz, ozs, x: paValue(ev, est), ab: NOT_AB.has(ev) ? 0 : 1, hit: HITS.has(ev) ? 1 : 0,
      bbe: b ? { s, b: b.launch_speed_angle === 6 ? 1 : 0 } : null,
    })
  }
  if (pa.length === 0) return null
  return {
    playerId: batterId, season, pa, bbe, bbePrev, prevSeason: season - 1,
    dayNightKnown: pa.filter(r => r.dn).length, handKnown: pa.filter(r => r.h).length,
  }
}

// ── pitchers ───────────────────────────────────────────────────────────────────
export async function getPitcherTrendsData(pitcherId: number, season: number): Promise<PitcherTrendsData | null> {
  const [pitches, bbes, tables, log] = await Promise.all([
    fetchAll<PitchRow>('pitch_events', 'id, game_pk, game_date, at_bat_number, pitch_number, pitcher_id, batter_id, pitch_type, release_speed, description, events, zone', 'pitcher_id', pitcherId, 'getPitcherTrendsData:pitches'),
    fetchAll<BbeRow>('batted_ball_events', 'id, game_pk, game_date, at_bat_number, launch_speed, launch_speed_angle, estimated_woba', 'pitcher_id', pitcherId, 'getPitcherTrendsData:bbe'),
    getLeagueTables(season),
    fetch(`${MLB}/people/${pitcherId}/stats?stats=gameLog&group=pitching&season=${season}`, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(12000) }).then(r => (r.ok ? r.json() : null)).catch(() => null),
  ])
  if (!pitches || !bbes || pitches.length === 0) return null

  const official = new Map<number, { d: string; ip: number; er: number; bb: number; so: number; hr: number; hbp: number; gs: number }>()
  for (const s of log?.stats?.[0]?.splits ?? []) {
    const pk = s.game?.gamePk; if (!pk) continue
    const st = s.stat ?? {}
    official.set(pk, { d: String(s.date ?? ''), ip: ipToDecimal(st.inningsPitched), er: Number(st.earnedRuns ?? 0), bb: Number(st.baseOnBalls ?? 0), so: Number(st.strikeOuts ?? 0), hr: Number(st.homeRuns ?? 0), hbp: Number(st.hitBatsmen ?? 0), gs: Number(st.gamesStarted ?? 0) })
  }

  const bbeByGame = new Map<number, BbeRow[]>(), bbeKey = new Map<string, BbeRow>()
  for (const b of bbes) { if (!bbeByGame.has(b.game_pk)) bbeByGame.set(b.game_pk, []); bbeByGame.get(b.game_pk)!.push(b); bbeKey.set(`${b.game_pk}:${b.at_bat_number}`, b) }

  const byGame = new Map<number, PitchRow[]>()
  for (const p of pitches.sort(byPa)) { if (!byGame.has(p.game_pk)) byGame.set(p.game_pk, []); byGame.get(p.game_pk)!.push(p) }

  const games: PitGame[] = []
  for (const [pk, ps] of byGame) {
    const types: Record<string, PitTypeGame> = {}
    const velo: Record<string, number[]> = {}
    let zin = 0, zn = 0, oz = 0, ozs = 0
    for (const p of ps) {
      const t = p.pitch_type ?? 'UN'
      const o = (types[t] ??= { n: 0, velo: null, sw: 0, wh: 0 })
      o.n++
      const swung = p.description != null && SWING.has(p.description)
      if (swung) o.sw++
      if (p.description != null && WHIFF.has(p.description)) o.wh++
      const v = NUM(p.release_speed); if (v != null) (velo[t] ??= []).push(v)
      if (p.zone != null) { zn++; if (p.zone <= 9) zin++; else { oz++; if (swung) ozs++ } }
    }
    for (const [t, vs] of Object.entries(velo)) types[t].velo = vs.reduce((a, b) => a + b, 0) / vs.length

    // PA-level xwOBA against
    let paN = 0, xwSum = 0
    const pas = new Map<number, PitchRow>()
    for (const p of ps) pas.set(p.at_bat_number, p)     // sorted, so the last pitch of each PA wins
    for (const [ab, last] of pas) {
      if (last.events == null) continue
      const b = bbeKey.get(`${pk}:${ab}`)
      const v = paValue(last.events, b ? NUM(b.estimated_woba) : null)
      if (v != null) { paN++; xwSum += v }
    }
    const gb = (bbeByGame.get(pk) ?? []).map(b => ({ s: NUM(b.launch_speed), brl: b.launch_speed_angle === 6 })).filter(b => b.s != null)
    const off = official.get(pk)
    games.push({
      pk, d: ps[0].game_date, n: ps.length, types, zin, zn, oz, ozs,
      bbe: gb.length, hh: gb.filter(b => (b.s as number) >= 95).length, brl: gb.filter(b => b.brl).length, paN, xwSum,
      ip: off?.ip ?? null, er: off?.er ?? null, bb: off?.bb ?? null, so: off?.so ?? null, hr: off?.hr ?? null, hbp: off?.hbp ?? null, gs: off?.gs ?? null,
    })
  }
  // Appearances with an official box line but NO pitch rows (the nightly Statcast load starts Mar 27, and
  // a night can be missing): keep them so ERA / FIP cover every outing. Their pitch-based fields are zero,
  // which every rolling metric treats as "no sample" — never as a value.
  for (const [pk, o] of official) {
    if (byGame.has(pk) || !o.d) continue
    games.push({ pk, d: o.d, n: 0, types: {}, zin: 0, zn: 0, oz: 0, ozs: 0, bbe: 0, hh: 0, brl: 0, paN: 0, xwSum: 0, ip: o.ip, er: o.er, bb: o.bb, so: o.so, hr: o.hr, hbp: o.hbp, gs: o.gs })
  }
  games.sort((a, b) => a.d.localeCompare(b.d) || a.pk - b.pk)
  return { playerId: pitcherId, season, games, cFIP: tables?.cFIP ?? 3.1 }
}
