// src/lib/postgame/recap.ts
//
// Postgame §1–§4 — pure derivations from PostData (no I/O):
//   header     final score, innings, venue, attendance, series line, and a plain read written
//              only from facts in the feed (margin, walk-off, extras, comeback, how deep the
//              winner's starter went) plus where the winner's win probability bottomed out
//   swing      win-probability path by plate appearance and the 3–5 plays that moved it most
//   performers top batters and pitchers of THIS game by win probability added (sum of the
//              per-play WPA the MLB feed publishes), labelled Decisive / Solid / Quiet
//   box        batting and pitching lines for both clubs, and the pitch-by-pitch log
// WPA is a published per-play number, not a model of ours; labels use fixed thresholds.

import type { PFFeed, PFPlayer, PostData, WpEntry } from './data'

export type Side = 'away' | 'home'
const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const surname = (full: string) => { const p = full.trim().split(/\s+/); const last = p[p.length - 1]; return /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(last) && p.length > 2 ? `${p[p.length - 2]} ${last}` : last }
const ord = (i: number) => { const v = i % 100; return `${i}${v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[i % 10] ?? 'th'}` }
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

// ─── §1 Final header ─────────────────────────────────────────────────────

export type Header = {
  away: { id: number; name: string; abbr: string; runs: number; hits: number; errors: number }
  home: { id: number; name: string; abbr: string; runs: number; hits: number; errors: number }
  winner: Side
  innings: number
  finalText: string
  venue: string; attendance: number | null; duration: string | null; date: string
  weather: string | null
  series: string | null
  decisions: { w?: string; l?: string; s?: string }
  read: string
  wpNote: string | null
  /** runs per inning; null = that half-inning wasn't played (home team not batting in a walk-off-free win) */
  linescore: { away: (number | null)[]; home: (number | null)[] }
}

const line = (f: PFFeed, s: Side) => f.liveData.linescore.teams?.[s] ?? {}

export function buildHeader(d: PostData): Header {
  const f = d.feed, gd = f.gameData
  const aR = n(line(f, 'away').runs), hR = n(line(f, 'home').runs)
  const winner: Side = hR > aR ? 'home' : 'away'
  const inns = f.liveData.linescore.innings ?? []
  const innings = Math.max(9, inns.length)
  const abbr = (s: Side) => gd.teams[s].abbreviation ?? gd.teams[s].name.slice(0, 3).toUpperCase()
  const wR = winner === 'home' ? hR : aR, lR = winner === 'home' ? aR : hR
  const margin = wR - lR

  // facts for the plain read
  const plays = f.liveData.plays.allPlays
  const last = plays[plays.length - 1], prev = plays[plays.length - 2]
  const lastHomeAhead = prev ? n(prev.result.homeScore) > n(prev.result.awayScore) : false
  const walkOff = winner === 'home' && !!last && !last.about.isTopInning && last.about.inning >= 9 && !lastHomeAhead
  const winnerScore = (p: (typeof plays)[number]) => n(winner === 'home' ? p.result.homeScore : p.result.awayScore)
  const loserScore = (p: (typeof plays)[number]) => n(winner === 'home' ? p.result.awayScore : p.result.homeScore)
  const maxDeficit = plays.reduce((m, p) => Math.max(m, loserScore(p) - winnerScore(p)), 0)
  const wPitchers = f.liveData.boxscore.teams[winner].pitchers ?? []
  const starter = f.liveData.boxscore.teams[winner].players[`ID${wPitchers[0]}`]
  const starterIp = starter?.stats?.pitching?.inningsPitched
  const starterOuts = starterIp != null ? Math.floor(n(starterIp)) * 3 + Math.round((n(starterIp) % 1) * 10) : null
  const bullpenGame = starterOuts != null && starterOuts <= 12 && wPitchers.length >= 4

  const size = margin === 1 ? 'a one-run game' : margin >= 6 ? `a ${words[margin] ?? margin}-run blowout` : `a ${words[margin] ?? margin}-run game`
  const bits: string[] = []
  if (walkOff) bits.push('on a walk-off')
  else if (innings > 9) bits.push(`in ${innings} innings`)
  if (maxDeficit >= 3) bits.push(`after trailing by ${maxDeficit}`)
  if (lR === 0) bits.push('with a shutout')
  const bullpen = bullpenGame ? `, in what was a bullpen game for ${abbr(winner)} (starter went ${starterIp} IP)` : ''
  const read = `${abbr(winner)} won ${size}${bits.length ? ` ${bits.join(', ')}` : ''}${bullpen}.`

  // where the winner's win probability bottomed out
  const wpOf = (e: WpEntry) => (winner === 'home' ? e.homeTeamWinProbability : e.awayTeamWinProbability)
  const low = d.wp.reduce<WpEntry | null>((m, e) => (m == null || wpOf(e) < wpOf(m) ? e : m), null)
  const wpNote = low && wpOf(low) <= 35 ? `${abbr(winner)}'s win probability bottomed out at ${Math.round(wpOf(low))}% in the ${ord(low.about.inning)}${low.about.isTopInning ?? low.about.halfInning === 'top' ? ' (top)' : ' (bottom)'}.` : null

  const dur = gd.gameInfo?.gameDurationMinutes
  const w = f.liveData.decisions
  const rowRuns = (s: Side) => Array.from({ length: innings }, (_, i) => (inns[i]?.[s]?.runs == null ? null : n(inns[i][s]?.runs)))
  const team = (s: Side, r: number) => ({ id: gd.teams[s].id, name: gd.teams[s].name, abbr: abbr(s), runs: r, hits: n(line(f, s).hits), errors: n(line(f, s).errors) })
  return {
    away: team('away', aR), home: team('home', hR), winner, innings,
    finalText: inns.length > 9 ? `Final / ${inns.length}` : 'Final',
    venue: gd.venue?.name ?? '', attendance: gd.gameInfo?.attendance ?? null,
    duration: dur != null ? `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}` : null,
    date: gd.datetime?.officialDate ?? '',
    weather: gd.weather?.condition ? `${gd.weather.condition}${gd.weather.temp ? `, ${gd.weather.temp}°` : ''}` : null,
    series: d.series?.result ?? null,
    decisions: { w: w?.winner ? surname(w.winner.fullName) : undefined, l: w?.loser ? surname(w.loser.fullName) : undefined, s: w?.save ? surname(w.save.fullName) : undefined },
    read, wpNote, linescore: { away: rowRuns('away'), home: rowRuns('home') },
  }
}

// ─── §2 How the game swung ───────────────────────────────────────────────

export type SwingPoint = { i: number; inning: number; top: boolean; homeWp: number }
export type Inflection = {
  n: number; i: number; inning: number; top: boolean; homeWp: number
  kind: string; who: string; text: string
  /** win probability points gained by the club the play helped */
  gain: number; helped: Side
}
export type Swing = { points: SwingPoint[]; start: number; inflections: Inflection[]; inningStarts: { inning: number; i: number }[] }

const KIND: Record<string, string> = {
  home_run: 'HR', field_error: 'E', strikeout: 'K', strikeout_double_play: 'K·DP', grounded_into_double_play: 'DP', double_play: 'DP',
  triple: '3B', double: '2B', single: '1B', walk: 'BB', intent_walk: 'IBB', hit_by_pitch: 'HBP', sac_fly: 'SF', triple_play: 'TP',
  stolen_base_2b: 'SB', caught_stealing_2b: 'CS', wild_pitch: 'WP', passed_ball: 'PB', balk: 'BK', pickoff_1b: 'PO',
}

export function buildSwing(d: PostData): Swing | null {
  const wp = d.wp
  if (wp.length < 4) return null
  const first = wp[0]
  const start = first.homeTeamWinProbability - n(first.homeTeamWinProbabilityAdded)
  const points: SwingPoint[] = wp.map((e, i) => ({ i, inning: e.about.inning, top: e.about.isTopInning ?? e.about.halfInning === 'top', homeWp: e.homeTeamWinProbability }))
  const inningStarts: { inning: number; i: number }[] = []
  points.forEach((p) => { if (!inningStarts.some((s) => s.inning === p.inning)) inningStarts.push({ inning: p.inning, i: p.i }) })

  const ranked = wp.map((e, i) => ({ e, i, mag: Math.abs(n(e.homeTeamWinProbabilityAdded)) })).filter((x) => x.mag >= 6).sort((a, b) => b.mag - a.mag)
  // keep them apart so labels don't stack: at most one per plate appearance neighbourhood
  const picked: typeof ranked = []
  for (const r of ranked) { if (picked.length < 5 && !picked.some((p) => Math.abs(p.i - r.i) < 2)) picked.push(r) }
  const inflections: Inflection[] = picked.sort((a, b) => a.i - b.i).map((x, k) => {
    const wpa = n(x.e.homeTeamWinProbabilityAdded)
    const et = x.e.result.eventType ?? ''
    const challenged = (x.e.result.description ?? '').toLowerCase().includes('challenged')
    return {
      n: k + 1, i: x.i, inning: x.e.about.inning, top: x.e.about.isTopInning ?? x.e.about.halfInning === 'top', homeWp: x.e.homeTeamWinProbability,
      kind: challenged ? 'ABS' : KIND[et] ?? (x.e.result.event ?? 'Play').slice(0, 4), who: x.e.matchup?.batter?.fullName ? surname(x.e.matchup.batter.fullName) : '',
      text: x.e.result.description ?? '', gain: Math.abs(wpa), helped: wpa >= 0 ? 'home' : 'away',
    }
  })
  return { points, start, inflections, inningStarts }
}

// ─── §3 Top performers ───────────────────────────────────────────────────

export type Chip = { id: number; name: string; side: Side; group: 'bat' | 'pitch'; label: 'Decisive' | 'Solid' | 'Quiet'; line: string; wpa: number }
export const DECISIVE = 15, SOLID = 6   // win probability points (sum over the game)
const labelOf = (v: number): Chip['label'] => (v >= DECISIVE ? 'Decisive' : v >= SOLID ? 'Solid' : 'Quiet')

export function batLine(p: PFPlayer): string {
  const b = p.stats?.batting ?? {}
  const parts = [`${n(b.hits)}-${n(b.atBats)}`]
  const add = (k: string, label: string) => { const v = n(b[k]); if (v > 0) parts.push(v === 1 ? label : `${v} ${label}`) }
  add('homeRuns', 'HR'); add('triples', '3B'); add('doubles', '2B')
  if (n(b.rbi) > 0) parts.push(`${n(b.rbi)} RBI`)
  add('stolenBases', 'SB'); add('baseOnBalls', 'BB')
  return parts.join(', ')
}
export function pitchLine(p: PFPlayer): string {
  const s = p.stats?.pitching ?? {}
  return `${s.inningsPitched ?? '0.0'} IP, ${n(s.earnedRuns)} ER, ${n(s.strikeOuts)} K${n(s.baseOnBalls) ? `, ${n(s.baseOnBalls)} BB` : ''}`
}

/** Win probability added per player over the game (batting club's gain to the batter, its loss to the pitcher). */
export function playerWpa(d: PostData): { bat: Map<number, number>; pit: Map<number, number> } {
  const bat = new Map<number, number>(), pit = new Map<number, number>()
  for (const e of d.wp) {
    const top = e.about.isTopInning ?? e.about.halfInning === 'top'
    const homeGain = n(e.homeTeamWinProbabilityAdded)
    const batterGain = top ? -homeGain : homeGain                    // the batting club's gain
    const b = e.matchup?.batter?.id, p = e.matchup?.pitcher?.id
    if (b) bat.set(b, (bat.get(b) ?? 0) + batterGain)
    if (p) pit.set(p, (pit.get(p) ?? 0) - batterGain)
  }
  return { bat, pit }
}

export function buildPerformers(d: PostData): { batters: Chip[]; pitchers: Chip[] } | null {
  if (d.wp.length === 0) return null
  const { bat, pit } = playerWpa(d)
  const box = d.feed.liveData.boxscore.teams
  const find = (id: number): { p: PFPlayer; side: Side } | null => {
    for (const s of ['away', 'home'] as Side[]) { const p = box[s].players[`ID${id}`]; if (p) return { p, side: s } }
    return null
  }
  const chips = (m: Map<number, number>, group: Chip['group']): Chip[] => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).flatMap(([id, wpa]) => {
    const hit = find(id); if (!hit) return []
    return [{ id, name: hit.p.person.fullName, side: hit.side, group, label: labelOf(wpa), line: group === 'bat' ? batLine(hit.p) : pitchLine(hit.p), wpa }]
  })
  return { batters: chips(bat, 'bat'), pitchers: chips(pit, 'pitch') }
}

// ─── §4 Box score ────────────────────────────────────────────────────────

export type BatRow = { id: number; name: string; pos: string; sub: boolean; ab: number; r: number; h: number; rbi: number; bb: number; so: number; hr: number; note: string }
export type PitRow = { id: number; name: string; dec: string | null; ip: string; h: number; r: number; er: number; bb: number; so: number; hr: number; pitches: number; strikes: number; bf: number }
export type PitchRow = { atBat: number; inning: number; top: boolean; batter: string; pitcher: string; result: string; pitches: { t: string; v: number | null; r: string; c: string }[] }
export type Box = { away: { bat: BatRow[]; pit: PitRow[] }; home: { bat: BatRow[]; pit: PitRow[] }; log: PitchRow[]; pitchCount: number }

export function buildBox(d: PostData): Box {
  const f = d.feed, dec = f.liveData.decisions
  const side = (s: Side) => {
    const t = f.liveData.boxscore.teams[s]
    const bat: BatRow[] = Object.values(t.players).filter((p) => p.battingOrder).sort((a, b) => n(a.battingOrder) - n(b.battingOrder)).map((p) => {
      const b = p.stats?.batting ?? {}
      return { id: p.person.id, name: p.person.fullName, pos: p.position?.abbreviation ?? '', sub: n(p.battingOrder) % 100 !== 0, ab: n(b.atBats), r: n(b.runs), h: n(b.hits), rbi: n(b.rbi), bb: n(b.baseOnBalls), so: n(b.strikeOuts), hr: n(b.homeRuns), note: batLine(p).split(', ').slice(1).filter((x) => /HR|2B|3B|SB/.test(x)).join(', ') }
    })
    const pit: PitRow[] = (t.pitchers ?? []).flatMap((id) => {
      const p = t.players[`ID${id}`], st = p?.stats?.pitching
      if (!p || !st) return []
      const nm = p.person.fullName
      return [{ id, name: nm, dec: dec?.winner?.fullName === nm ? 'W' : dec?.loser?.fullName === nm ? 'L' : dec?.save?.fullName === nm ? 'S' : n(st.holds) > 0 ? 'H' : null, ip: String(st.inningsPitched ?? '0.0'), h: n(st.hits), r: n(st.runs), er: n(st.earnedRuns), bb: n(st.baseOnBalls), so: n(st.strikeOuts), hr: n(st.homeRuns), pitches: n(st.pitchesThrown ?? st.numberOfPitches), strikes: n(st.strikes), bf: n(st.battersFaced) }]
    })
    return { bat, pit }
  }
  const log: PitchRow[] = f.liveData.plays.allPlays.map((pl) => ({
    atBat: pl.about.atBatIndex, inning: pl.about.inning, top: pl.about.isTopInning, batter: surname(pl.matchup.batter.fullName), pitcher: surname(pl.matchup.pitcher.fullName),
    result: pl.result.event ?? '',
    pitches: (pl.playEvents ?? []).filter((e) => e.isPitch).map((e) => ({ t: e.details?.type?.code ?? '', v: e.pitchData?.startSpeed != null ? Math.round(e.pitchData.startSpeed * 10) / 10 : null, r: e.details?.call?.description ?? '', c: `${e.count?.balls ?? 0}-${e.count?.strikes ?? 0}` })),
  })).filter((r) => r.pitches.length > 0)
  return { away: side('away'), home: side('home'), log, pitchCount: log.reduce((a, r) => a + r.pitches.length, 0) }
}
