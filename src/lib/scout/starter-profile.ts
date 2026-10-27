// src/lib/scout/starter-profile.ts
//
// A starter's season, cut the ways the Scout Report's Starters tab reads him, from his per-pitch log (src/lib/pitcher-pitch-log.ts, the full log):
//   countState   pitch mix and zone rate by the count the pitch was thrown in
//   platoon      pitch mix and wOBA against left- and right-handed hitters, and by pitch
//   innings      inning by inning: pitches, mix, zone rate, whiffs, xwOBA, strikeouts and walks, fastball speed
//   tto          times through the order (the nth time he faces a hitter in a game): xwOBA, wOBA, strikeouts, walks, hard-hit, fastball speed (the "fade")
//   zones        every zone: share of his pitches, xwOBA and whiffs
//   habits       where he puts the ball by count and by hitter side: up, down, arm side, glove side, in the zone
// Counts and shares only; xwOBA is Savant's expected wOBA on balls in play and the real wOBA on walks and strikeouts (see zone-stats.ts). Small groups carry their n.
import { getPitcherPitchLog, type RawPitch } from '@/lib/pitcher-pitch-log'
import { ALL_ZONES, aggregate, metric, type Agg } from '@/lib/zone-stats'

export type Mix = Record<string, number>   // pitch type -> share of that row's pitches
export type Row = { label: string; n: number; pa: number; mix: Mix; zonePct: number | null; swingPct: number | null; whiffPct: number | null; chasePct: number | null; xwoba: number | null; woba: number | null; kPct: number | null; bbPct: number | null; hardPct: number | null; fbVelo: number | null }
export type Habit = { label: string; n: number; up: number | null; down: number | null; armSide: number | null; gloveSide: number | null; inZone: number | null }
export type StarterProfile = {
  pitcherId: number; throws: 'L' | 'R' | null; pitches: number
  types: { t: string; name: string; n: number }[]
  fastball: string | null                       // the type whose speed is read for the fade
  countState: Row[]; platoon: Row[]; platoonByPitch: { type: string; name: string; side: 'L' | 'R'; n: number; whiffPct: number | null; xwoba: number | null }[]
  innings: Row[]; tto: Row[]
  zones: { zone: string; n: number; share: number; xwoba: number | null; whiffPct: number | null }[]
  habits: { byCount: Habit[]; bySide: Habit[] }
}

const FB = new Set(['FF', 'SI', 'FC', 'FA'])
const ratio = (a: number, b: number) => (b > 0 ? a / b : null)
const inZone = (z: string | null) => z != null && Number(z) >= 1 && Number(z) <= 9

function countGroup(p: RawPitch): string {
  const b = p.balls ?? 0, s = p.strikes ?? 0
  return b === 0 && s === 0 ? 'First pitch (0-0)' : s === 2 ? 'Two strikes' : s > b ? 'Ahead in the count' : s === b ? 'Even' : 'Behind in the count'
}
export const COUNT_ORDER = ['First pitch (0-0)', 'Ahead in the count', 'Even', 'Behind in the count', 'Two strikes']

function row(label: string, ps: RawPitch[], fbType: string | null): Row {
  const a: Agg = aggregate(ps).all
  const mix: Mix = {}
  for (const p of ps) mix[p.pitchType] = (mix[p.pitchType] ?? 0) + 1
  for (const k of Object.keys(mix)) mix[k] = mix[k] / ps.length
  const withZone = ps.filter(p => p.zone != null), out = withZone.filter(p => !inZone(p.zone))
  let k = 0, bb = 0
  for (const p of ps) if (p.wobaDen != null && p.wobaDen > 0) { const e = p.result ?? ''; if (e.startsWith('strikeout')) k++; else if (e === 'walk' || e === 'intent_walk') bb++ }
  const fv = ps.filter(p => fbType != null && p.pitchType === fbType && p.velo != null).map(p => p.velo as number)
  return {
    label, n: ps.length, pa: a.den, mix,
    zonePct: ratio(withZone.filter(p => inZone(p.zone)).length, withZone.length),
    swingPct: metric(a, 'swing', 0).v, whiffPct: metric(a, 'whiff', 0).v,
    chasePct: ratio(out.filter(p => ['swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play', 'foul_bunt', 'missed_bunt'].includes(p.description ?? '')).length, out.length),
    xwoba: metric(a, 'xwoba', 0).v, woba: a.den > 0 ? a.woba / a.den : null,
    kPct: ratio(k, a.den), bbPct: ratio(bb, a.den), hardPct: metric(a, 'hard', 0).v,
    fbVelo: fv.length ? fv.reduce((s, v) => s + v, 0) / fv.length : null,
  }
}

function habit(label: string, ps: RawPitch[], hand: 'L' | 'R' | null): Habit {
  const loc = ps.filter(p => p.plateX != null && p.plateZ != null)
  const n = loc.length
  // x is the batter's view (right is toward first base); a right-hander's arm side is the left of that view, a left-hander's the right.
  const arm = (p: RawPitch) => (hand === 'L' ? p.plateX > 0 : p.plateX < 0)
  return {
    label, n,
    up: ratio(loc.filter(p => p.plateZ > 3.0).length, n), down: ratio(loc.filter(p => p.plateZ < 2.0).length, n),
    armSide: ratio(loc.filter(p => Math.abs(p.plateX) > 0.28 && arm(p)).length, n), gloveSide: ratio(loc.filter(p => Math.abs(p.plateX) > 0.28 && !arm(p)).length, n),
    inZone: ratio(loc.filter(p => inZone(p.zone)).length, loc.filter(p => p.zone != null).length),
  }
}

export async function getStarterProfile(pitcherId: number, season: number): Promise<StarterProfile | null> {
  const log = await getPitcherPitchLog(pitcherId, season).catch(() => null)
  if (!log || log.pitches.length === 0) return null
  const ps = log.pitches
  const byType = new Map<string, number>()
  for (const p of ps) byType.set(p.pitchType, (byType.get(p.pitchType) ?? 0) + 1)
  const types = [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ t, name: log.pitchNames[t] ?? t, n }))
  const fastball = types.find(t => FB.has(t.t))?.t ?? null

  // Times through the order: the nth plate appearance this hitter has had against him in this game.
  const tto = new Map<RawPitch, number>()
  const byGame = new Map<number, RawPitch[]>()
  for (const p of ps) if (p.gamePk != null) { if (!byGame.has(p.gamePk)) byGame.set(p.gamePk, []); byGame.get(p.gamePk)!.push(p) }
  for (const list of byGame.values()) {
    const seen = new Map<number, number[]>()
    for (const p of [...list].sort((a, b) => (a.atBatNumber ?? 0) - (b.atBatNumber ?? 0) || (a.pitchNumber ?? 0) - (b.pitchNumber ?? 0))) {
      if (p.batterId == null || p.atBatNumber == null) continue
      const abs = seen.get(p.batterId) ?? []
      if (!abs.includes(p.atBatNumber)) abs.push(p.atBatNumber)
      seen.set(p.batterId, abs)
      tto.set(p, abs.indexOf(p.atBatNumber) + 1)
    }
  }

  const zoneAgg = aggregate(ps).byZone
  const total = ALL_ZONES.reduce((s, z) => s + zoneAgg[z].n, 0)
  const hand = log.throws
  const innings: Row[] = []
  for (let i = 1; i <= 9; i++) {
    const group = ps.filter(p => (i === 9 ? (p.inning ?? 0) >= 9 : p.inning === i))
    if (group.length >= 1) innings.push(row(i === 9 ? '9th+' : `${i}${['st', 'nd', 'rd'][i - 1] ?? 'th'}`, group, fastball))
  }
  return {
    pitcherId, throws: hand, pitches: ps.length, types, fastball,
    countState: COUNT_ORDER.map(g => row(g, ps.filter(p => countGroup(p) === g), fastball)).filter(r => r.n > 0),
    platoon: (['L', 'R'] as const).map(h => row(h === 'L' ? 'Left-handed hitters' : 'Right-handed hitters', ps.filter(p => p.stand === h), fastball)).filter(r => r.n > 0),
    platoonByPitch: types.flatMap(t => (['L', 'R'] as const).map(h => { const g = ps.filter(p => p.pitchType === t.t && p.stand === h), a = aggregate(g).all; return { type: t.t, name: t.name, side: h, n: g.length, whiffPct: metric(a, 'whiff', 0).v, xwoba: metric(a, 'xwoba', 0).v } })).filter(x => x.n > 0),
    innings,
    tto: [1, 2, 3].map(k => row(k === 1 ? 'First time through' : k === 2 ? 'Second time' : 'Third time or more', ps.filter(p => { const t = tto.get(p); return t != null && (k === 3 ? t >= 3 : t === k) }), fastball)).filter(r => r.n > 0),
    zones: ALL_ZONES.map(z => ({ zone: z, n: zoneAgg[z].n, share: total ? zoneAgg[z].n / total : 0, xwoba: metric(zoneAgg[z], 'xwoba', 0).v, whiffPct: metric(zoneAgg[z], 'whiff', 0).v })),
    habits: {
      byCount: COUNT_ORDER.map(g => habit(g, ps.filter(p => countGroup(p) === g), hand)).filter(h => h.n > 0),
      bySide: (['L', 'R'] as const).map(h => habit(h === 'L' ? 'Left-handed hitters' : 'Right-handed hitters', ps.filter(p => p.stand === h), hand)).filter(h => h.n > 0),
    },
  }
}
