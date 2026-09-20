// src/lib/postgame/hittercheck.ts
//
// Pro: "Hitters — hot, cooling, or turning a corner?" What each lineup's contact says beneath the box score, whether a hitter
// did damage in his usual places, and how tonight compares with his own last 15 games.
//   Contact-quality read (per hitter, fixed rules, on balls in play with a tracked exit speed):
//     Hit harder than the box shows  2+ balls hit 95+ mph that were outs and no more hits than hard-hit outs
//     Results ahead of contact       2+ hits with exit speed under 85 mph, and fewer hard-hit balls than that
//     Even                           anything else
//   Zone damage: the zones where he hit a ball 95+ mph or had an extra-base hit tonight vs his season damage zones (batter_hot_zones, split `all`:
//   the three strike-zone cells with the highest xwOBA, 8+ pitches each). New territory = damage outside those; Usual = inside.
//   Form read (FORM below): five factors, tonight vs his last 15 games — exit velocity, hard-hit %, xwOBA on contact, whiff %, chase %.
//   A factor with too small a sample tonight is skipped ("na"), never guessed. 2+ more factors up than down = Turning a corner
//   (Staying hot if his last 15 already ran hot vs his season); 2+ more down = Dropping off (Cooling if he was hot); else Steady.
//   Under MIN_BIP balls in play tonight or MIN_GAMES of history there is no read at all — an empty state, not a guess.
// Reads: batter_hot_zones (fetch_batter_hot_zones.py writes it); batter_form_l15() — a read-only SQL function over pitch_events /
// batted_ball_events (fetch_statcast_events.py is their single writer; scripts/sql/add_batter_form_l15.sql); tonight's xwOBA from
// batted_ball_events for this game (lands after the nightly load, so that factor shows "na" until then).

import { createAdminClient } from '@/lib/supabase'
import type { PostData } from './data'
import { buildPitchLog } from './pitchlog'
import type { Side } from './recap'

export const HARD = 95, SOFT = 85, MIN_ZONE_PITCHES = 8
type ZoneCell = { xwoba?: number | null; pitches?: number }

export type ContactRead = 'Hit harder than the box shows' | 'Results ahead of contact' | 'Even' | 'No balls in play'
export type ZoneRead = 'Usual damage zones' | 'New territory' | 'No damage' | 'No zone map'
export type HitterRow = {
  id: number; name: string; slot: number
  bip: { ev: number | null; hit: boolean; zone: number | null; result: string }[]
  hardOuts: number; softHits: number; hard: number
  read: ContactRead
  season: Record<string, number>          // zone → xwOBA for zones with enough pitches
  seasonTop: number[]                     // his three best zones
  damage: Record<string, number>          // zone → hits / 95+ balls tonight
  zoneRead: ZoneRead
  form: FormRead
}
export type HitterSide = { side: Side; rows: HitterRow[] }

// ── Form vs last 15 games ────────────────────────────────────────────────────────────────────────────────────────────
// Thresholds are proposals from the approved mockup (mockups/postgame-hitter-check.html) — tune here, in one place.
export const FORM = {
  MIN_BIP: 3, MIN_GAMES: 10, MIN_SWINGS: 6, MIN_OUTSIDE: 10,
  EV: 2, HH: 0.15, XW: 0.06, WHIFF: 0.08, CHASE: 0.08,   // how far tonight must sit from his last 15 to count as up / down
  HOT: 0.03,                                             // last-15 xwOBA on contact this far above his season = running hot
  LUCK: 0.04,                                            // xwOBA vs actual wOBA gap that earns the results-vs-contact flag
} as const
export type FactorKey = 'ev' | 'hh' | 'xw' | 'wh' | 'ch'
export type FactorState = 'up' | 'down' | 'flat' | 'na'
export type Factor = { key: FactorKey; label: string; tonight: number | null; l15: number | null; state: FactorState; why: string }
export type FormVerdict = 'Staying hot' | 'Turning a corner' | 'Steady' | 'Cooling' | 'Dropping off'
export type FormRead =
  | { kind: 'nodata'; reason: string }
  | { kind: 'read'; verdict: FormVerdict; tone: 'up' | 'down' | 'flat'; up: number; down: number; counted: number; factors: Factor[]
      luck: { kind: 'behind' | 'ahead'; xw: number; wo: number } | null
      seasonXw: number | null; spark: { xw: number | null; n: number }[]; tonightXw: number | null }
type L15Row = {
  batter_id: number; games: number; bip: number; avg_ev: number | string | null; hard_hit: number | string | null
  xwoba_con: number | string | null; woba_con: number | string | null; swings: number; whiffs: number; outside: number; chases: number
  season_xwoba_con: number | string | null; per_game: { pk: number; n: number; xw: number | string | null }[] | null
}
const num = (v: unknown): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v))

export async function getHitterChecks(d: PostData, gameDate: string): Promise<HitterSide[]> {
  const log = buildPitchLog(d)
  const box = d.feed.liveData.boxscore.teams
  const lineups = (['away', 'home'] as Side[]).map((side) => ({ side, players: Object.values(box[side].players).filter((p) => p.battingOrder).sort((a, b) => Number(a.battingOrder) - Number(b.battingOrder)) }))
  const ids = lineups.flatMap((l) => l.players.map((p) => p.person.id))
  const zones = new Map<number, Record<string, ZoneCell>>()
  if (ids.length) {
    const { data, error } = await createAdminClient().from('batter_hot_zones').select('player_id, zones').in('player_id', ids).eq('season', Number(gameDate.slice(0, 4))).eq('split', 'all')
    if (error) console.error('[getHitterChecks] Supabase error:', error.message)
    for (const r of (data ?? []) as { player_id: number; zones: Record<string, ZoneCell> }[]) zones.set(Number(r.player_id), r.zones ?? {})
  }
  const l15 = new Map<number, L15Row>()
  const tonightXw = new Map<number, { xw: number | null }>()
  if (ids.length) {
    const sb = createAdminClient()
    const [{ data: f, error: fe }, { data: t, error: te }] = await Promise.all([
      sb.rpc('batter_form_l15', { p_ids: ids, p_game_pk: d.feed.gamePk, p_date: gameDate }),
      sb.from('batted_ball_events').select('batter_id, estimated_woba').eq('game_pk', d.feed.gamePk),
    ])
    if (fe) console.error('[getHitterChecks] batter_form_l15 error:', fe.message)
    if (te) console.error('[getHitterChecks] batted_ball_events error:', te.message)
    for (const r of (f ?? []) as L15Row[]) l15.set(Number(r.batter_id), r)
    const acc = new Map<number, number[]>()
    for (const r of (t ?? []) as { batter_id: number; estimated_woba: number | string | null }[]) {
      const v = num(r.estimated_woba)
      if (v != null) acc.set(Number(r.batter_id), [...(acc.get(Number(r.batter_id)) ?? []), v])
    }
    for (const [k, v] of acc) tonightXw.set(k, { xw: v.reduce((a, b) => a + b, 0) / v.length })
  }
  return lineups.map(({ side, players }) => ({
    side,
    rows: players.flatMap((p): HitterRow[] => {
      const mine = log.filter((x) => x.batterId === p.person.id && x.inPlay)
      if (log.every((x) => x.batterId !== p.person.id)) return []
      const bip = mine.map((x) => ({ ev: x.ev, hit: x.hit, zone: x.zone, result: x.result }))
      const tracked = mine.filter((x) => x.ev != null)
      const hardOuts = tracked.filter((x) => (x.ev as number) >= HARD && !x.hit).length
      const hard = tracked.filter((x) => (x.ev as number) >= HARD).length
      const softHits = tracked.filter((x) => (x.ev as number) < SOFT && x.hit).length
      const hits = tracked.filter((x) => x.hit).length
      const read: ContactRead = tracked.length === 0 ? 'No balls in play' : hardOuts >= 2 && hits <= hardOuts ? 'Hit harder than the box shows' : softHits >= 2 && hard < softHits ? 'Results ahead of contact' : 'Even'
      const z = zones.get(p.person.id)
      const season: Record<string, number> = {}
      for (const [k, c] of Object.entries(z ?? {})) if (Number(k) >= 1 && Number(k) <= 9 && (c.pitches ?? 0) >= MIN_ZONE_PITCHES && c.xwoba != null && Number.isFinite(Number(c.xwoba))) season[k] = Number(c.xwoba)
      const seasonTop = Object.entries(season).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => Number(k))
      const damage: Record<string, number> = {}
      for (const x of mine) if (x.zone != null && ((x.ev ?? 0) >= HARD || ['double', 'triple', 'home_run'].includes(x.resultType))) damage[String(x.zone)] = (damage[String(x.zone)] ?? 0) + 1
      const dz = Object.keys(damage).map(Number)
      const zoneRead: ZoneRead = seasonTop.length === 0 ? 'No zone map' : dz.length === 0 ? 'No damage' : dz.some((k) => !seasonTop.includes(k)) ? 'New territory' : 'Usual damage zones'
      const form = buildForm(log.filter((x) => x.batterId === p.person.id), l15.get(p.person.id), tonightXw.get(p.person.id)?.xw ?? null)
      return [{ id: p.person.id, name: p.person.fullName, slot: Math.floor(Number(p.battingOrder) / 100), bip, hardOuts, softHits, hard, read, season, seasonTop, damage, zoneRead, form }]
    }),
  }))
}

/** Tonight (game feed pitch log + the game's Statcast xwOBA) against his last 15 games. */
function buildForm(pitches: ReturnType<typeof buildPitchLog>, base: L15Row | undefined, tonightXw: number | null): FormRead {
  if (!base) return { kind: 'nodata', reason: 'Last-15 baseline not available yet' }
  if (base.games < FORM.MIN_GAMES) return { kind: 'nodata', reason: `Only ${base.games} games of history so far` }
  const balls = pitches.filter((x) => x.inPlay && x.ev != null)
  if (balls.length < FORM.MIN_BIP) return { kind: 'nodata', reason: `Needs ${FORM.MIN_BIP}+ balls in play tonight; he had ${balls.length}` }

  const evs = balls.map((x) => x.ev as number)
  const tEv = evs.reduce((a, b) => a + b, 0) / evs.length
  const tHh = evs.filter((v) => v >= HARD).length / evs.length
  const swings = pitches.filter((x) => x.swing), outside = pitches.filter((x) => x.zone != null && x.zone >= 11)
  const tWh = swings.length >= FORM.MIN_SWINGS ? swings.filter((x) => x.whiff).length / swings.length : null
  const tCh = outside.length >= FORM.MIN_OUTSIDE ? outside.filter((x) => x.swing).length / outside.length : null
  const lWh = base.swings > 0 ? base.whiffs / base.swings : null
  const lCh = base.outside > 0 ? base.chases / base.outside : null
  const judge = (t: number | null, l: number | null, thr: number, higherBetter: boolean): FactorState => {
    if (t == null || l == null) return 'na'
    const diff = (t - l) * (higherBetter ? 1 : -1)
    return diff >= thr ? 'up' : diff <= -thr ? 'down' : 'flat'
  }
  const lEv = num(base.avg_ev), lHh = num(base.hard_hit), lXw = num(base.xwoba_con), lWo = num(base.woba_con), sXw = num(base.season_xwoba_con)
  const factors: Factor[] = [
    { key: 'ev', label: 'Exit velo', tonight: tEv, l15: lEv, state: judge(tEv, lEv, FORM.EV, true), why: 'Average exit velocity on balls in play, tonight vs his last 15 games. Up or down means 2+ mph different.' },
    { key: 'hh', label: 'Hard-hit %', tonight: tHh, l15: lHh, state: judge(tHh, lHh, FORM.HH, true), why: 'Share of balls in play hit 95+ mph. Up or down means 15+ points different.' },
    { key: 'xw', label: 'xwOBA on contact', tonight: tonightXw, l15: lXw, state: judge(tonightXw, lXw, FORM.XW, true), why: 'What his contact was worth from exit speed and launch angle alone, ignoring defense and luck. Up or down means .060+ different. Shows “–” until the game’s Statcast data loads overnight.' },
    { key: 'wh', label: 'Whiff %', tonight: tWh, l15: lWh, state: judge(tWh, lWh, FORM.WHIFF, false), why: `Share of swings that missed; fewer misses reads as up. Needs ${FORM.MIN_SWINGS}+ swings tonight; up or down means 8+ points different.` },
    { key: 'ch', label: 'Chase %', tonight: tCh, l15: lCh, state: judge(tCh, lCh, FORM.CHASE, false), why: `Share of pitches outside the zone he swung at; fewer chases reads as up. Needs ${FORM.MIN_OUTSIDE}+ such pitches tonight; up or down means 8+ points different.` },
  ]
  const counted = factors.filter((f) => f.state !== 'na').length
  const up = factors.filter((f) => f.state === 'up').length, down = factors.filter((f) => f.state === 'down').length
  const hot = lXw != null && sXw != null && lXw - sXw >= FORM.HOT
  const net = up - down
  const verdict: FormVerdict = net >= 2 ? (hot ? 'Staying hot' : 'Turning a corner') : net <= -2 ? (hot ? 'Cooling' : 'Dropping off') : 'Steady'
  const gap = lXw != null && lWo != null ? lXw - lWo : null
  const luck = gap != null && lXw != null && lWo != null && Math.abs(gap) >= FORM.LUCK ? { kind: (gap > 0 ? 'behind' : 'ahead') as 'behind' | 'ahead', xw: lXw, wo: lWo } : null
  const spark = (base.per_game ?? []).map((g) => ({ xw: num(g.xw), n: Number(g.n) }))
  return { kind: 'read', verdict, tone: net >= 2 ? 'up' : net <= -2 ? 'down' : 'flat', up, down, counted, factors, luck, seasonXw: sXw, spark, tonightXw }
}
