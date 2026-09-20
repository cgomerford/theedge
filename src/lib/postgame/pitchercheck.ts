// src/lib/postgame/pitchercheck.ts
//
// Pro: "Pitchers — was anything concerning?" For each starter, tonight's outing against his SEASON and (box-line
// items only) his last five starts, with a fixed-rule flag on each check and a 0–3+ "concern dial".
//
// Where the baselines come from (all read-only here):
//   season pitch mix / velocity / whiff% / zone% / chase%   pitcher_zone_arsenal, split `all` (fetch_pitcher_hot_zones.py, weekly).
//        whiff% = whiffs / swings, summed over the pitch's zones; zone% = pitches in zones 1–9; chase% = swings / pitches in zones 11–14.
//   first-pitch strike %, times-through-the-order wOBA     pitcher_stats (season)
//   last five starts (IP, pitches, K, BB, ER)               MLB Stats API gameLog, ONE small request per pitcher, cached 6 h
// NOT available yet, so not shown: hard-hit / barrel allowed against a season or L5 baseline, velocity and whiff against L5
// starts (those need per-start Statcast rows — the game-log precompute; see SESSION_NOTES_2026-09-19_POSTGAME.md).
//
// Flag rules (fixed; every one needs a minimum sample, otherwise the check reads "not enough to judge"):
//   Velocity      primary fastball (most-thrown of 4-seam/sinker/cutter) down ≥ 1.2 mph from his first two innings to his last
//                 two (6+ pitches each), OR averaging ≥ 1.5 mph below his season average.
//   Put-away      his best whiff pitch (highest season whiff% among pitches he throws 10%+ of the time, season 20%+) whiffing at
//                 half its season rate or less, on 6+ swings.
//   Usage         he threw that best pitch 10+ points less than usual, or leaned 12+ points more on a non-fastball whose season
//                 whiff% is under 15% (a "dead" secondary). Needs 40+ pitches.
//   Zone          zone% up 8+ pts AND chase% down 8+ pts (10+ pitches outside the zone) AND 45%+ of balls in play hit 95+ mph (8+ BIP):
//                 living in the zone and getting hit hard.
//   Finishing     first-pitch strike% 12+ pts below season (15+ batters), OR reached two strikes 6+ times and finished (struck out) 1 or fewer.
//   Release       primary fastball's average release point moved 3+ inches from the first half of his outing to the second (6+ each).
// Dial: 0 flags = Quiet night, 1–2 = Mixed, 3+ = Concerning — over the checks that had enough sample. One start is one start.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase'
import type { PostData } from './data'
import { buildPitchLog, startersOf, type PitchRec } from './pitchlog'
import type { Side } from './recap'

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const FB = new Set(['FF', 'SI', 'FC'])
const STRIKE_CALLS = new Set(['C', 'S', 'W', 'T', 'F', 'X', 'D', 'E', 'L', 'M'])   // a strike of any kind, or in play
export type State = 'flag' | 'ok' | 'na'

export type StartLine = { date: string; pitches: number; ip: number; k: number; bb: number; er: number }
type ZoneCell = { pitches?: number; swings?: number; whiffs?: number }
type ArsenalRow = { player_id: number; total_pitches: number; arsenal: Record<string, { pitch_name?: string; usage_pct?: number | null; avg_velo?: number | null; zones?: Record<string, ZoneCell> }> }
type StatsRow = { player_id: number; first_pitch_strike_pct: number | null; tto1_woba: number | null; tto2_woba: number | null; tto3_woba: number | null; tto1_pa: number | null; tto2_pa: number | null; tto3_pa: number | null }

export type SeasonPitch = { code: string; name: string; usage: number; velo: number | null; whiff: number | null; swings: number }
export type Season = { pitches: number; byPitch: Map<string, SeasonPitch>; zone: number | null; chase: number | null; fps: number | null; tto: { woba: number | null; pa: number }[] }

export type PitcherCheck = {
  side: Side; id: number; name: string
  hasSeason: boolean
  outing: { pitches: number; ip: string; k: number; bb: number; er: number; strikePct: number | null; l5: StartLine[] }
  velo: { state: State; note: string; types: { code: string; name: string; tonight: number | null; season: number | null; byInning: { inning: number; velo: number; n: number }[] }[]; primary: string | null; drop: number | null; vsSeason: number | null }
  whiff: { state: State; note: string; rows: { code: string; name: string; n: number; swings: number; tonight: number | null; season: number | null; putAway: boolean }[] }
  usage: { state: State; note: string; rows: { code: string; name: string; tonight: number; season: number | null }[] }
  zone: { state: State; note: string; zone: number | null; seasonZone: number | null; chase: number | null; seasonChase: number | null; chaseN: number; hard: number | null; bip: number }
  finish: { state: State; note: string; fps: number | null; fpsN: number; seasonFps: number | null; reached: number; finished: number }
  tto: { label: string; pa: number; woba: number | null; season: number | null; seasonPa: number }[]
  release: { state: State; note: string; type: string | null; early: { x: number; z: number }[]; late: { x: number; z: number }[]; shiftIn: number | null }
  dial: { flags: number; evaluated: number; label: 'Quiet night' | 'Mixed' | 'Concerning'; reasons: string[] }
}

const WOBA: Record<string, number> = { walk: 0.69, hit_by_pitch: 0.72, single: 0.89, double: 1.27, triple: 1.62, home_run: 2.1 }
const NOT_PA = new Set(['intent_walk', 'sac_bunt', 'sac_bunt_double_play', 'catcher_interf'])

async function getSeason(ids: number[], year: number): Promise<Map<number, Season>> {
  const out = new Map<number, Season>()
  if (ids.length === 0) return out
  const supa = createAdminClient()
  const [ars, sts] = await Promise.all([
    supa.from('pitcher_zone_arsenal').select('player_id, total_pitches, arsenal').in('player_id', ids).eq('season', year).eq('split', 'all'),
    supa.from('pitcher_stats').select('player_id, first_pitch_strike_pct, tto1_woba, tto2_woba, tto3_woba, tto1_pa, tto2_pa, tto3_pa').in('player_id', ids).eq('season', year),
  ])
  if (ars.error) console.error('[getSeason] pitcher_zone_arsenal error:', ars.error.message)
  if (sts.error) console.error('[getSeason] pitcher_stats error:', sts.error.message)
  const stats = new Map((sts.data as StatsRow[] | null ?? []).map((r) => [Number(r.player_id), r]))
  for (const r of (ars.data as ArsenalRow[] | null ?? [])) {
    const byPitch = new Map<string, SeasonPitch>()
    let inZone = 0, located = 0, outSw = 0, outN = 0
    for (const [code, a] of Object.entries(r.arsenal ?? {})) {
      let sw = 0, wh = 0
      for (const [z, c] of Object.entries(a.zones ?? {})) {
        sw += n(c.swings); wh += n(c.whiffs)
        if (Number(z) <= 9) inZone += n(c.pitches); else { outN += n(c.pitches); outSw += n(c.swings) }
        located += n(c.pitches)
      }
      byPitch.set(code, { code, name: a.pitch_name ?? code, usage: n(a.usage_pct), velo: a.avg_velo != null ? n(a.avg_velo) : null, whiff: sw > 0 ? (wh / sw) * 100 : null, swings: sw })
    }
    const st = stats.get(Number(r.player_id))
    out.set(Number(r.player_id), {
      pitches: n(r.total_pitches), byPitch, zone: located ? (inZone / located) * 100 : null, chase: outN ? (outSw / outN) * 100 : null,
      fps: st?.first_pitch_strike_pct != null ? n(st.first_pitch_strike_pct) : null,
      tto: [1, 2, 3].map((i) => ({ woba: st?.[`tto${i}_woba` as 'tto1_woba'] != null ? n(st[`tto${i}_woba` as 'tto1_woba']) : null, pa: n(st?.[`tto${i}_pa` as 'tto1_pa']) })),
    })
  }
  return out
}

/** the starter's box lines from MLB's game log — one small request each */
async function getStarts(id: number, year: number, before: string): Promise<StartLine[]> {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=gameLog&group=pitching&season=${year}`, { next: { revalidate: 21600 }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) { console.error('[getStarts] HTTP', res.status); return [] }
    const j = (await res.json()) as { stats?: { splits?: { date?: string; stat: Record<string, string | number> }[] }[] }
    const outs = (ip: unknown) => { const [w, f = '0'] = String(ip ?? '0.0').split('.'); return n(w) + n(f) / 3 }
    return (j.stats?.[0]?.splits ?? []).filter((s) => n(s.stat.gamesStarted) === 1 && (s.date ?? '') < before)
      .map((s) => ({ date: s.date ?? '', pitches: n(s.stat.numberOfPitches), ip: outs(s.stat.inningsPitched), k: n(s.stat.strikeOuts), bb: n(s.stat.baseOnBalls), er: n(s.stat.earnedRuns) }))
  } catch (err) { console.error('[getStarts] failed:', err instanceof Error ? err.message : err); return [] }
}

function build(side: Side, id: number, name: string, log: PitchRec[], d: PostData, season: Season | undefined, starts: StartLine[]): PitcherCheck {
  const mine = log.filter((p) => p.pitcherId === id)
  const box = d.feed.liveData.boxscore.teams[side].players[`ID${id}`]?.stats?.pitching ?? {}
  const total = mine.length
  const reasons: string[] = []
  const sn = (t: string) => season?.byPitch.get(t)

  // ── outing header ─────────────────────────────────────────────
  const strikes = n(box.strikes)
  const outing = { pitches: n(box.pitchesThrown ?? box.numberOfPitches) || total, ip: String(box.inningsPitched ?? '0.0'), k: n(box.strikeOuts), bb: n(box.baseOnBalls), er: n(box.earnedRuns), strikePct: total && strikes ? (strikes / (n(box.pitchesThrown ?? box.numberOfPitches) || total)) * 100 : null, l5: starts.slice(-5) }

  // ── pitch types tonight ───────────────────────────────────────
  const types = new Map<string, PitchRec[]>()
  for (const p of mine) types.set(p.type, [...(types.get(p.type) ?? []), p])
  const ordered = [...types.entries()].sort((a, b) => b[1].length - a[1].length)
  const primary = ordered.find(([t, r]) => FB.has(t) && r.length >= 10)?.[0] ?? null

  // ── velocity ──────────────────────────────────────────────────
  const inningsSeq = [...new Set(mine.map((p) => p.inning))]
  const early2 = new Set(inningsSeq.slice(0, 2)), late2 = new Set(inningsSeq.slice(-2))
  const velo: PitcherCheck['velo'] = { state: 'na', note: 'No fastball with enough pitches to judge.', types: [], primary, drop: null, vsSeason: null }
  for (const [t, rs] of ordered.filter(([, r]) => r.length >= 12).slice(0, 3)) {
    const v = rs.filter((r) => r.velo != null)
    const byInning = inningsSeq.map((inn) => { const x = v.filter((r) => r.inning === inn).map((r) => r.velo as number); return { inning: inn, velo: avg(x) ?? 0, n: x.length } }).filter((x) => x.n >= 3)
    velo.types.push({ code: t, name: rs[0].typeName, tonight: avg(v.map((r) => r.velo as number)), season: sn(t)?.velo ?? null, byInning })
  }
  if (primary) {
    const pv = types.get(primary)!.filter((r) => r.velo != null)
    const e = pv.filter((r) => early2.has(r.inning)).map((r) => r.velo as number), l = pv.filter((r) => late2.has(r.inning) && !early2.has(r.inning)).map((r) => r.velo as number)
    const tonight = avg(pv.map((r) => r.velo as number)), s = sn(primary)?.velo ?? null
    velo.drop = e.length >= 6 && l.length >= 6 ? (avg(e) as number) - (avg(l) as number) : null
    velo.vsSeason = tonight != null && s != null ? tonight - s : null
    if (velo.drop != null || velo.vsSeason != null) {
      const bad = (velo.drop ?? 0) >= 1.2 || (velo.vsSeason ?? 0) <= -1.5
      velo.state = bad ? 'flag' : 'ok'
      velo.note = bad ? `${types.get(primary)![0].typeName} ${(velo.drop ?? 0) >= 1.2 ? `faded ${velo.drop!.toFixed(1)} mph from his first two innings to his last two` : `averaged ${Math.abs(velo.vsSeason as number).toFixed(1)} mph below his season average`}.` : `${types.get(primary)![0].typeName} held its velocity${velo.vsSeason != null ? ` (${velo.vsSeason >= 0 ? '+' : '−'}${Math.abs(velo.vsSeason).toFixed(1)} mph vs season)` : ''}.`
      if (bad) reasons.push('fastball velocity')
    }
  }

  // ── whiff by pitch + put-away pitch ───────────────────────────
  const putAwayCode = season ? [...season.byPitch.values()].filter((p) => p.usage >= 10 && p.whiff != null && p.swings >= 30).sort((a, b) => (b.whiff as number) - (a.whiff as number))[0]?.code ?? null : null
  const whiffRows = ordered.map(([t, rs]) => { const sw = rs.filter((r) => r.swing); return { code: t, name: rs[0].typeName, n: rs.length, swings: sw.length, tonight: sw.length ? (sw.filter((r) => r.whiff).length / sw.length) * 100 : null, season: sn(t)?.whiff ?? null, putAway: t === putAwayCode } }).filter((r) => r.n >= 5)
  const whiff: PitcherCheck['whiff'] = { state: 'na', note: 'Not enough swings on his put-away pitch to judge.', rows: whiffRows }
  const pa = whiffRows.find((r) => r.putAway)
  if (pa && pa.swings >= 6 && pa.tonight != null && pa.season != null && pa.season >= 20) {
    const bad = pa.tonight <= pa.season * 0.5
    whiff.state = bad ? 'flag' : 'ok'
    whiff.note = bad ? `His put-away pitch, the ${pa.name.toLowerCase()}, got misses on ${pa.tonight.toFixed(0)}% of swings against ${pa.season.toFixed(0)}% for the season.` : `His put-away pitch, the ${pa.name.toLowerCase()}, kept working (${pa.tonight.toFixed(0)}% whiffs per swing vs ${pa.season.toFixed(0)}%).`
    if (bad) reasons.push('put-away pitch')
  }

  // ── usage shock ───────────────────────────────────────────────
  const usageRows = ordered.map(([t, rs]) => ({ code: t, name: rs[0].typeName, tonight: (rs.length / total) * 100, season: sn(t)?.usage ?? null }))
  const usage: PitcherCheck['usage'] = { state: 'na', note: 'No season mix on file, or too few pitches, to compare.', rows: usageRows }
  if (season && total >= 40 && season.byPitch.size > 0) {
    const lost = putAwayCode ? usageRows.find((r) => r.code === putAwayCode) : undefined
    const lostBy = putAwayCode ? (sn(putAwayCode)?.usage ?? 0) - (lost?.tonight ?? 0) : 0
    const dead = usageRows.find((r) => !FB.has(r.code) && r.season != null && (sn(r.code)?.whiff ?? 99) < 15 && r.tonight - (r.season as number) >= 12)
    const bad = (putAwayCode != null && lostBy >= 10) || !!dead
    usage.state = bad ? 'flag' : 'ok'
    usage.note = bad ? (putAwayCode != null && lostBy >= 10 ? `He threw his best pitch, the ${(sn(putAwayCode)?.name ?? putAwayCode).toLowerCase()}, ${lostBy.toFixed(0)} points less than usual.` : `He leaned on his ${dead!.name.toLowerCase()} ${(dead!.tonight - (dead!.season as number)).toFixed(0)} points more than usual, a pitch that averages ${(sn(dead!.code)?.whiff as number).toFixed(0)}% whiffs per swing.`) : 'His pitch mix stayed close to his season mix.'
    if (bad) reasons.push('pitch usage')
  }

  // ── chase / zone / hard contact ───────────────────────────────
  const located = mine.filter((p) => p.zone != null), outside = located.filter((p) => (p.zone as number) >= 11)
  const bip = mine.filter((p) => p.inPlay && p.ev != null)
  const z = { zone: located.length ? (located.filter((p) => (p.zone as number) <= 9).length / located.length) * 100 : null, chase: outside.length ? (outside.filter((p) => p.swing).length / outside.length) * 100 : null, hard: bip.length ? (bip.filter((p) => (p.ev as number) >= 95).length / bip.length) * 100 : null }
  const zone: PitcherCheck['zone'] = { state: 'na', note: 'Not enough pitches outside the zone or balls in play to judge.', zone: z.zone, seasonZone: season?.zone ?? null, chase: z.chase, seasonChase: season?.chase ?? null, chaseN: outside.length, hard: z.hard, bip: bip.length }
  if (z.zone != null && z.chase != null && season?.zone != null && season?.chase != null && outside.length >= 10 && bip.length >= 8 && z.hard != null) {
    const bad = z.zone - season.zone >= 8 && season.chase - z.chase >= 8 && z.hard >= 45
    zone.state = bad ? 'flag' : 'ok'
    zone.note = bad ? `He lived in the zone (${z.zone.toFixed(0)}% vs ${season.zone.toFixed(0)}%), drew fewer chases (${z.chase.toFixed(0)}% vs ${season.chase.toFixed(0)}%) and ${z.hard.toFixed(0)}% of balls in play were hit 95+ mph.` : `Zone ${z.zone.toFixed(0)}% (season ${season.zone.toFixed(0)}%), chase ${z.chase.toFixed(0)}% (season ${season.chase.toFixed(0)}%), hard-hit ${z.hard.toFixed(0)}% on ${bip.length} balls in play.`
    if (bad) reasons.push('living in the zone, hit hard')
  } else if (z.zone != null && season?.zone != null) zone.note = `Zone ${z.zone.toFixed(0)}% vs ${season.zone.toFixed(0)}% for the season${z.chase != null && season.chase != null ? `; chase ${z.chase.toFixed(0)}% vs ${season.chase.toFixed(0)}%` : ''}. Too few outside pitches / balls in play to judge.`

  // ── first-pitch strike / finishing ────────────────────────────
  const firsts = mine.filter((p) => p.seq === 1)
  const fps = firsts.length ? (firsts.filter((p) => STRIKE_CALLS.has(p.call)).length / firsts.length) * 100 : null
  const byPa = new Map<number, PitchRec[]>()
  for (const p of mine) byPa.set(p.atBat, [...(byPa.get(p.atBat) ?? []), p])
  const twoK = [...byPa.values()].filter((rs) => rs.some((p) => p.strikes === 2))
  const finished = twoK.filter((rs) => rs[0].resultType.startsWith('strikeout')).length
  const finish: PitcherCheck['finish'] = { state: 'na', note: 'Too few batters to judge.', fps, fpsN: firsts.length, seasonFps: season?.fps ?? null, reached: twoK.length, finished }
  const fpsBad = fps != null && season?.fps != null && firsts.length >= 15 && season.fps - fps >= 12
  const finBad = twoK.length >= 6 && finished <= 1
  if (firsts.length >= 15 || twoK.length >= 6) {
    finish.state = fpsBad || finBad ? 'flag' : 'ok'
    finish.note = fpsBad || finBad ? [fpsBad ? `first-pitch strikes on ${fps!.toFixed(0)}% of batters (season ${season!.fps!.toFixed(0)}%)` : '', finBad ? `reached two strikes ${twoK.length} times and struck out ${finished}` : ''].filter(Boolean).join('; ') + '.' : `First-pitch strikes on ${fps != null ? fps.toFixed(0) : '—'}% of batters${season?.fps != null ? ` (season ${season.fps.toFixed(0)}%)` : ''}; struck out ${finished} of ${twoK.length} batters he got to two strikes.`
    if (fpsBad) reasons.push('first-pitch strikes'); if (finBad) reasons.push('finishing hitters')
  }

  // ── times through the order ───────────────────────────────────
  const paKey = new Map<string, PitchRec>()
  for (const p of mine) if (!paKey.has(`${p.atBat}`)) paKey.set(`${p.atBat}`, p)
  const tto = [1, 2, 3].map((k) => {
    const rs = [...paKey.values()].filter((p) => (k === 3 ? p.tto >= 3 : p.tto === k) && !NOT_PA.has(p.resultType))
    const num = rs.reduce((a, p) => a + (WOBA[p.resultType] ?? 0), 0)
    const s = season?.tto[k - 1]
    return { label: k === 3 ? '3rd time+' : k === 1 ? '1st time' : '2nd time', pa: rs.length, woba: rs.length ? num / rs.length : null, season: s?.woba ?? null, seasonPa: s?.pa ?? 0 }
  })

  // ── release point drift (primary fastball, first half vs second half of the outing) ──
  const release: PitcherCheck['release'] = { state: 'na', note: 'Not enough fastballs with a release point to judge.', type: primary, early: [], late: [], shiftIn: null }
  if (primary) {
    const rs = types.get(primary)!.filter((p) => p.rx != null && p.rz != null)
    const half = Math.floor(rs.length / 2)
    const E = rs.slice(0, half), Lt = rs.slice(half)
    release.early = E.map((p) => ({ x: p.rx as number, z: p.rz as number })); release.late = Lt.map((p) => ({ x: p.rx as number, z: p.rz as number }))
    if (E.length >= 6 && Lt.length >= 6) {
      const c = (a: { x: number; z: number }[]) => ({ x: avg(a.map((p) => p.x)) as number, z: avg(a.map((p) => p.z)) as number })
      const ce = c(release.early), cl = c(release.late)
      release.shiftIn = Math.hypot(cl.x - ce.x, cl.z - ce.z) * 12
      const bad = release.shiftIn >= 3
      release.state = bad ? 'flag' : 'ok'
      release.note = bad ? `His release point moved ${release.shiftIn.toFixed(1)} inches from the first half of the outing to the second.` : `Release point stayed put (${release.shiftIn.toFixed(1)} inches between halves).`
      if (bad) reasons.push('release point drift')
    }
  }

  const checks = [velo.state, whiff.state, usage.state, zone.state, finish.state, release.state]
  const flags = checks.filter((s) => s === 'flag').length, evaluated = checks.filter((s) => s !== 'na').length
  return {
    side, id, name, hasSeason: !!season && season.byPitch.size > 0, outing, velo, whiff, usage, zone, finish, tto, release,
    dial: { flags, evaluated, label: flags === 0 ? 'Quiet night' : flags <= 2 ? 'Mixed' : 'Concerning', reasons },
  }
}

export const getPitcherChecks = cache(async (d: PostData, gameDate: string): Promise<PitcherCheck[]> => {
  const st = startersOf(d), year = Number(gameDate.slice(0, 4))
  const [season, starts] = await Promise.all([getSeason(st.map((s) => s.id), year), Promise.all(st.map((s) => getStarts(s.id, year, gameDate)))])
  const log = buildPitchLog(d)
  return st.map((s, i) => build(s.side, s.id, s.name, log, d, season.get(s.id), starts[i]))
})
