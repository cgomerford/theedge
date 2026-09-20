// src/lib/postgame/scorecard.ts
//
// Postgame — the hand-scored scorecard. Turns one final game's MLB live feed into what a
// person keeping score would have written: for every batting-order slot and inning, the
// result in scorekeeper notation (6-3, F8, K, 1B, HR, E6 …), the path the batter/runner
// took round the bases, the out number, RBI and the pitch tally — plus the sums, pitchers
// and header a scorecard carries.
//
// Everything here is derived from the feed; nothing is invented. Verified against a real
// final game's feed (game 824225): runner `movement` gives origin/start/end/outBase,
// `credits` gives the fielders (f_putout / f_assist / f_error / f_fielded_ball), the last
// pitch event's `hitData.trajectory` gives ground/line/fly/pop, and `boxscore.info` /
// `gameData` give attendance, weather, wind and duration.
//
// Notation rules (standard scorekeeping): fielders are numbered P1 C2 1B3 2B4 3B5 SS6 LF7
// CF8 RF9. Ground out = fielders in order (6-3, unassisted 3U); fly F8, line L6, pop P4;
// K swinging / backwards-K looking; walks BB / IBB / HBP; reached on error E6; fielder's
// choice FC; double play shows the fielder chain (6-4-3) with DP; sacrifices SF / SH.
// The full scoring is a convention — the sheet says so; rare plays fall back to the feed's
// own event name rather than a guess.

const MLB = 'https://statsapi.mlb.com/api/v1.1'

// ─── Raw feed shapes (only what is read) ─────────────────────────────────

interface RawCredit { credit: string; position: { abbreviation: string } }
interface RawRunner {
  movement: { originBase?: string | null; start?: string | null; end?: string | null; outBase?: string | null; isOut?: boolean }
  details: { runner: { id: number; fullName: string }; eventType?: string; event?: string }
  credits?: RawCredit[]
}
interface RawEvent { isPitch?: boolean; hitData?: { trajectory?: string } }
interface RawPlay {
  result: { eventType?: string; event?: string; description?: string; rbi?: number; awayScore?: number; homeScore?: number }
  about: { atBatIndex: number; inning: number; isTopInning: boolean }
  count: { balls: number; strikes: number; outs: number }
  matchup: { batter: { id: number; fullName: string } }
  runners?: RawRunner[]
  playEvents?: RawEvent[]
}
interface RawPlayer {
  person: { id: number; fullName: string }
  position?: { abbreviation?: string }
  allPositions?: { abbreviation?: string }[]
  battingOrder?: string
  stats?: { pitching?: Record<string, string | number | undefined>; fielding?: Record<string, string | number | undefined> }
}
interface RawBoxTeam { team: { id: number; name: string }; players: Record<string, RawPlayer>; pitchers?: number[] }
interface RawFeed {
  gamePk: number
  gameData: {
    datetime?: { officialDate?: string; time?: string; ampm?: string }
    teams: { away: { id: number; name: string; abbreviation?: string }; home: { id: number; name: string; abbreviation?: string } }
    venue?: { name?: string }
    weather?: { condition?: string; temp?: string; wind?: string }
    gameInfo?: { attendance?: number; gameDurationMinutes?: number }
  }
  liveData: {
    plays: { allPlays: RawPlay[] }
    boxscore: { teams: { away: RawBoxTeam; home: RawBoxTeam }; officials?: { officialType: string; official: { fullName: string } }[] }
    decisions?: { winner?: { fullName: string }; loser?: { fullName: string }; save?: { fullName: string } }
    linescore?: { teams?: { away?: { runs?: number; hits?: number; errors?: number }; home?: { runs?: number; hits?: number; errors?: number } } }
  }
}

// ─── Output ──────────────────────────────────────────────────────────────

/** 0 = home plate, 1–3 = the bases, 4 = scored. */
export type Base = 0 | 1 | 2 | 3 | 4
export type Seg = { from: Base; to: Base; label?: string }

export type PlateAppearance = {
  atBat: number
  inning: number
  slot: number            // 1–9
  sub: number             // 0 = the starter in that slot, 1 = first replacement, …
  notation: string        // the big mark: 6-3, F8, K, 1B …
  note: string | null     // small second mark: DP, SF, →9 …
  looking: boolean        // strike three looking → backwards K
  balls: number; strikes: number
  segs: Seg[]             // path round the bases (batter, then any later advancement)
  scored: boolean
  rbi: number
  outNum: 1 | 2 | 3 | null
  outAt: Base | null      // where the out was made when it was a runner out
  hit: boolean
  ab: boolean
}

export type SlotPlayer = { id: number; name: string; pos: string }
export type Slot = { slot: number; players: SlotPlayer[]; ab: number; r: number; h: number; rbi: number }

export type PitcherLine = {
  id: number; name: string; dec: string | null
  ip: string; h: number; r: number; er: number; bb: number; so: number; hb: number; bk: number; wp: number; tbf: number
}

export type TeamSheet = {
  side: 'away' | 'home'
  teamId: number; name: string; abbr: string
  slots: Slot[]
  /** plate appearances keyed `${slot}-${inning}` (more than one when a club bats around) */
  cells: Record<string, PlateAppearance[]>
  sums: { runs: number[]; hits: number[]; errors: number[]; lob: number[] }
  pitchers: PitcherLine[]      // this club's pitchers
  catchers: { name: string; pb: number }[]
}

export type Scorecard = {
  gamePk: number
  innings: number
  date: string
  venue: string
  attendance: number | null
  startTime: string | null; endTime: string | null; timeOfGame: string | null
  weather: string | null; wind: string | null
  notes: string
  umpires: { hp?: string; b1?: string; b2?: string; b3?: string }
  away: TeamSheet; home: TeamSheet
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const POS_NUM: Record<string, number> = { P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9 }
const NON_AB = new Set(['walk', 'intent_walk', 'hit_by_pitch', 'sac_fly', 'sac_bunt', 'sac_fly_double_play', 'sac_bunt_double_play', 'catcher_interf'])
const HITS = new Set(['single', 'double', 'triple', 'home_run'])
const RUNNER_LABEL: Record<string, string> = {
  stolen_base_2b: 'SB', stolen_base_3b: 'SB', stolen_base_home: 'SB', wild_pitch: 'WP', passed_ball: 'PB', balk: 'BK',
  defensive_indiff: 'DI', caught_stealing_2b: 'CS', caught_stealing_3b: 'CS', caught_stealing_home: 'CS',
  pickoff_1b: 'PO', pickoff_2b: 'PO', pickoff_3b: 'PO', pickoff_caught_stealing_2b: 'CS', pickoff_caught_stealing_3b: 'CS', pickoff_caught_stealing_home: 'CS',
}

const baseOf = (s: string | null | undefined): Base => (s === '1B' ? 1 : s === '2B' ? 2 : s === '3B' ? 3 : s === 'score' || s === '4B' ? 4 : 0)
const num = (c: RawCredit) => POS_NUM[c.position.abbreviation]

/** "Michael Clark Jr." → "M. Clark Jr." */
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length < 2) return full
  const suffix = /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(parts[parts.length - 1]) && parts.length > 2 ? ` ${parts.pop()}` : ''
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}${suffix}`
}

/** Fielders in the order they touched it: assists first, then the putout. */
function chain(credits: RawCredit[]): number[] {
  const seq = [...credits.filter((c) => c.credit === 'f_assist'), ...credits.filter((c) => c.credit === 'f_putout')].map(num).filter((n) => n != null)
  return seq.filter((n, i) => i === 0 || n !== seq[i - 1])
}

function notate(play: RawPlay, batter: RawRunner | undefined, others: RawRunner[]): { notation: string; note: string | null; looking: boolean } {
  const et = play.result.eventType ?? ''
  const desc = (play.result.description ?? '').toLowerCase()
  const traj = [...(play.playEvents ?? [])].reverse().find((e) => e.hitData)?.hitData?.trajectory ?? ''
  const bc = batter?.credits ?? []
  const putout = bc.find((c) => c.credit === 'f_putout')
  const fielded = bc.find((c) => c.credit === 'f_fielded_ball')
  const err = bc.find((c) => c.credit === 'f_error') ?? others.flatMap((r) => r.credits ?? []).find((c) => c.credit === 'f_error')
  const allChain = () => {
    const all = [...others, ...(batter ? [batter] : [])].flatMap((r) => chain(r.credits ?? []))
    return all.filter((n, i) => i === 0 || n !== all[i - 1])
  }
  const fly = (n: number | undefined) => (traj.includes('line') ? `L${n ?? ''}` : traj.includes('pop') ? `P${n ?? ''}` : `F${n ?? ''}`)

  switch (et) {
    case 'strikeout': return { notation: 'K', note: null, looking: desc.includes('looking') || desc.includes('called out on strikes') }
    case 'strikeout_double_play': return { notation: 'K', note: 'DP', looking: desc.includes('looking') }
    case 'walk': return { notation: 'BB', note: null, looking: false }
    case 'intent_walk': return { notation: 'IBB', note: null, looking: false }
    case 'hit_by_pitch': return { notation: 'HBP', note: null, looking: false }
    case 'single': return { notation: '1B', note: fielded ? `to ${num(fielded)}` : null, looking: false }
    case 'double': return { notation: '2B', note: fielded ? `to ${num(fielded)}` : null, looking: false }
    case 'triple': return { notation: '3B', note: fielded ? `to ${num(fielded)}` : null, looking: false }
    case 'home_run': return { notation: 'HR', note: null, looking: false }
    case 'field_out': {
      const c = chain(bc)
      if (traj.includes('fly') || traj.includes('line') || traj.includes('pop')) return { notation: fly(putout ? num(putout) : c[c.length - 1]), note: null, looking: false }
      return { notation: c.length > 1 ? c.join('-') : `${c[0] ?? ''}U`, note: null, looking: false }
    }
    case 'force_out': case 'fielders_choice_out': case 'fielders_choice': {
      const out = others.find((r) => r.movement.isOut)
      const c = out ? chain(out.credits ?? []) : []
      return { notation: 'FC', note: c.length ? c.join('-') : null, looking: false }
    }
    case 'grounded_into_double_play': case 'double_play': return { notation: allChain().join('-') || 'DP', note: 'DP', looking: false }
    case 'triple_play': return { notation: allChain().join('-') || 'TP', note: 'TP', looking: false }
    case 'sac_fly': return { notation: fly(putout ? num(putout) : undefined), note: 'SF', looking: false }
    case 'sac_fly_double_play': return { notation: fly(putout ? num(putout) : undefined), note: 'SF·DP', looking: false }
    case 'sac_bunt': { const c = chain(bc); return { notation: c.join('-') || 'SH', note: 'SH', looking: false } }
    case 'field_error': return { notation: `E${err ? num(err) : ''}`, note: null, looking: false }
    case 'catcher_interf': return { notation: 'CI', note: null, looking: false }
    default: return { notation: (play.result.event ?? et).split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 4) || '?', note: null, looking: false }
  }
}

// ─── Build ───────────────────────────────────────────────────────────────

const to12 = (mins: number) => { const h = Math.floor(mins / 60) % 24, m = mins % 60; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }

export function buildScorecard(feed: RawFeed): Scorecard {
  const gd = feed.gameData, box = feed.liveData.boxscore
  const plays = feed.liveData.plays.allPlays
  const sides = ['away', 'home'] as const

  // batting order: slot + who batted in it, from each player's boxscore battingOrder ("100" starter, "101" first sub…)
  const slotOf = new Map<number, { slot: number; sub: number }>()
  const sheets = {} as Record<'away' | 'home', TeamSheet>
  for (const side of sides) {
    const t = box.teams[side]
    const slots: Slot[] = Array.from({ length: 9 }, (_, i) => ({ slot: i + 1, players: [], ab: 0, r: 0, h: 0, rbi: 0 }))
    const ordered = Object.values(t.players).filter((p) => p.battingOrder).sort((a, b) => Number(a.battingOrder) - Number(b.battingOrder))
    for (const p of ordered) {
      const o = Number(p.battingOrder), slot = Math.floor(o / 100), sub = o % 100
      if (slot < 1 || slot > 9) continue
      slotOf.set(p.person.id, { slot, sub })
      const pos = [...new Set((p.allPositions ?? [{ abbreviation: p.position?.abbreviation }]).map((x) => x.abbreviation).filter(Boolean))].join('-')
      slots[slot - 1].players.push({ id: p.person.id, name: shortName(p.person.fullName), pos })
    }
    const meta = gd.teams[side]
    sheets[side] = { side, teamId: meta.id, name: meta.name, abbr: meta.abbreviation ?? meta.name.slice(0, 3).toUpperCase(), slots, cells: {}, sums: { runs: [], hits: [], errors: [], lob: [] }, pitchers: [], catchers: [] }
  }

  // walk the half-innings in order, tracking who is on base so later advancement lands on the right cell
  let innings = 9
  let lastHalf = ''
  let onBase = new Map<number, { pa: PlateAppearance; base: Base }>()
  let outs = 0
  let prevAway = 0, prevHome = 0
  const closeHalf = (sheet: TeamSheet | null, inning: number) => { if (sheet) sheet.sums.lob[inning - 1] = onBase.size }

  let sheetNow: TeamSheet | null = null, inningNow = 0
  for (const play of plays) {
    const { inning, isTopInning } = play.about
    innings = Math.max(innings, inning)
    const half = `${inning}${isTopInning ? 't' : 'b'}`
    if (half !== lastHalf) {
      closeHalf(sheetNow, inningNow)
      lastHalf = half; onBase = new Map(); outs = 0
      sheetNow = sheets[isTopInning ? 'away' : 'home']; inningNow = inning
      for (const k of ['runs', 'hits', 'errors'] as const) sheetNow.sums[k][inning - 1] ??= 0
    }
    const bat = sheetNow!
    const runners = play.runners ?? []
    const batterEntry = runners.find((r) => r.details.runner.id === play.matchup.batter.id && !r.movement.originBase && !r.movement.start)
    const others = runners.filter((r) => r !== batterEntry)

    // a plate appearance exists only when the batter has a movement of his own (a pickoff that ends the inning has none)
    let pa: PlateAppearance | null = null
    const slotInfo = slotOf.get(play.matchup.batter.id)
    if (batterEntry && slotInfo) {
      const n = notate(play, batterEntry, others)
      const et = play.result.eventType ?? ''
      pa = {
        atBat: play.about.atBatIndex, inning, slot: slotInfo.slot, sub: slotInfo.sub, notation: n.notation, note: n.note, looking: n.looking,
        balls: play.count.balls, strikes: play.count.strikes, segs: [], scored: false, rbi: play.result.rbi ?? 0,
        outNum: null, outAt: null, hit: HITS.has(et), ab: !NON_AB.has(et),
      }
      ;(bat.cells[`${slotInfo.slot}-${inning}`] ??= []).push(pa)
      onBase.set(play.matchup.batter.id, { pa, base: 0 })
    }

    // runner movements in the order the feed lists them
    for (const r of runners) {
      const id = r.details.runner.id, cur = onBase.get(id)
      const isBatter = r === batterEntry
      if (!cur) continue
      const mv = r.movement
      const from = cur.base
      const out = !!mv.isOut
      const to: Base = out ? baseOf(mv.outBase) : baseOf(mv.end)
      const label = RUNNER_LABEL[r.details.eventType ?? '']
      if (out) {
        outs += 1
        cur.pa.outNum = Math.min(3, outs) as 1 | 2 | 3
        cur.pa.outAt = isBatter ? null : to
        if (!isBatter && to > from) cur.pa.segs.push({ from, to, label })
        else if (!isBatter && label) cur.pa.segs.push({ from, to: from, label })
        onBase.delete(id)
        continue
      }
      if (to > from) cur.pa.segs.push({ from, to, label })
      else if (label) cur.pa.segs.push({ from, to: from, label })
      cur.base = to
      if (to === 4) { cur.pa.scored = true; onBase.delete(id) }
    }

    // sums for this half
    const before = bat.sums
    const res = play.result
    const away = res.awayScore ?? prevAway, home = res.homeScore ?? prevHome
    const scored = isTopInning ? away - prevAway : home - prevHome
    before.runs[inning - 1] = (before.runs[inning - 1] ?? 0) + Math.max(0, scored)
    prevAway = away; prevHome = home
    if (HITS.has(res.eventType ?? '')) before.hits[inning - 1] = (before.hits[inning - 1] ?? 0) + 1
    // errors are charged to the fielding club but written on the sheet of the club that was batting
    const errs = runners.flatMap((r) => r.credits ?? []).filter((c) => c.credit === 'f_error').length
    if (errs) before.errors[inning - 1] = (before.errors[inning - 1] ?? 0) + errs
  }
  closeHalf(sheetNow, inningNow)

  // slot totals
  for (const side of sides) {
    const sh = sheets[side]
    for (const [key, list] of Object.entries(sh.cells)) {
      const s = sh.slots[Number(key.split('-')[0]) - 1]
      for (const pa of list) { if (pa.ab) s.ab += 1; if (pa.hit) s.h += 1; if (pa.scored) s.r += 1; s.rbi += pa.rbi }
    }
    for (const k of ['runs', 'hits', 'errors', 'lob'] as const) for (let i = 0; i < innings; i++) sh.sums[k][i] ??= 0
  }

  // pitchers + catchers from the boxscore
  const dec = feed.liveData.decisions
  for (const side of sides) {
    const t = box.teams[side]
    for (const id of t.pitchers ?? []) {
      const p = t.players[`ID${id}`]
      const st = p?.stats?.pitching
      if (!p || !st) continue
      const n = (k: string) => Number(st[k] ?? 0)
      const d = dec?.winner?.fullName === p.person.fullName ? 'W' : dec?.loser?.fullName === p.person.fullName ? 'L' : dec?.save?.fullName === p.person.fullName ? 'S' : n('holds') > 0 ? 'H' : null
      sheets[side].pitchers.push({ id, name: shortName(p.person.fullName), dec: d, ip: String(st.inningsPitched ?? '0.0'), h: n('hits'), r: n('runs'), er: n('earnedRuns'), bb: n('baseOnBalls'), so: n('strikeOuts'), hb: n('hitByPitch'), bk: n('balks'), wp: n('wildPitches'), tbf: n('battersFaced') })
    }
    sheets[side].catchers = Object.values(t.players).filter((p) => (p.allPositions ?? []).some((x) => x.abbreviation === 'C') && p.battingOrder).map((p) => ({ name: shortName(p.person.fullName), pb: Number(p.stats?.fielding?.passedBall ?? 0) }))
  }

  // header
  const dur = gd.gameInfo?.gameDurationMinutes ?? null
  const t = gd.datetime?.time, ampm = gd.datetime?.ampm
  let startMin: number | null = null
  if (t && ampm) { const [h, m] = t.split(':').map(Number); startMin = ((h % 12) + (ampm === 'PM' ? 12 : 0)) * 60 + m }
  const hrs: string[] = []
  for (const side of sides) for (const [, list] of Object.entries(sheets[side].cells)) for (const pa of list) if (pa.notation === 'HR') {
    const who = sheets[side].slots[pa.slot - 1].players[pa.sub]?.name
    if (who) hrs.push(`${who} (${sheets[side].abbr})`)
  }
  const wl = [dec?.winner ? `W ${shortName(dec.winner.fullName)}` : null, dec?.loser ? `L ${shortName(dec.loser.fullName)}` : null, dec?.save ? `S ${shortName(dec.save.fullName)}` : null].filter(Boolean).join('  ')
  const off = Object.fromEntries((box.officials ?? []).map((o) => [o.officialType, o.official.fullName]))

  return {
    gamePk: feed.gamePk, innings, date: gd.datetime?.officialDate ?? '', venue: gd.venue?.name ?? '',
    attendance: gd.gameInfo?.attendance ?? null,
    startTime: startMin != null ? to12(startMin) : null,
    endTime: startMin != null && dur != null ? to12(startMin + dur) : null,
    timeOfGame: dur != null ? `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}` : null,
    weather: gd.weather?.condition ? `${gd.weather.condition}${gd.weather.temp ? `, ${gd.weather.temp}°` : ''}` : null,
    wind: gd.weather?.wind ?? null,
    notes: [wl, hrs.length ? `HR: ${hrs.join(', ')}` : ''].filter(Boolean).join('   '),
    umpires: { hp: off['Home Plate'], b1: off['First Base'], b2: off['Second Base'], b3: off['Third Base'] },
    away: sheets.away, home: sheets.home,
  }
}

/** Final games never change, so the feed is cached hard. Returns null (and logs) on any failure. */
export async function getScorecard(gamePk: number): Promise<Scorecard | null> {
  try {
    const res = await fetch(`${MLB}/game/${gamePk}/feed/live`, { next: { revalidate: 21600 }, signal: AbortSignal.timeout(20000) })
    if (!res.ok) { console.error('[getScorecard] feed HTTP', res.status); return null }
    return buildScorecard((await res.json()) as RawFeed)
  } catch (err) {
    console.error('[getScorecard] failed:', err instanceof Error ? err.message : err)
    return null
  }
}
