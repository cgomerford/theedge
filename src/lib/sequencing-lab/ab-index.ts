// src/lib/sequencing-lab/ab-index.ts
//
// Pure logic (no database, no browser): reads the compact at-bat file built by scripts/build_league_ab_index.py (layout documented there; keep the two in step)
// and finds the real at-bats whose pitches match a stack of pitches. A stacked pitch matches a real pitch when the type is the same and the speed, arm-side break and
// induced rise are inside the windows (and the zone and result too, when chosen). The at-bat's pitcher hand and batter side must match. Each at-bat counts once.
// These are counts of what has happened, never a forecast.

export const SPEED_WIN = 1.5      // mph either side
export const MOVE_WIN = 3         // inches either side, arm-side break and induced rise
export const MAX_STACK = 6
export type ResultCode = 'B' | 'C' | 'W' | 'F' | 'XH' | 'XO'
const RES_CODE: (ResultCode | '')[] = ['', 'B', 'C', 'W', 'F', 'XH', 'XO']

export type AbIndex = {
  season: number; builtAt: string; nPitches: number; nAbs: number; types: string[]; outcomes: string[]
  type: Uint8Array; speed2: Uint8Array; hb2: Int8Array; ivb2: Int8Array; zone: Uint8Array; res: Uint8Array
  start: Uint32Array; pitcher: Uint32Array; batter: Uint32Array; gamepk: Uint32Array; date: Uint16Array
  len: Uint8Array; hand: Uint8Array; stand: Uint8Array; outcome: Uint8Array
}

export function parseIndex(buf: Buffer): AbIndex {
  if (buf.toString('latin1', 0, 4) !== 'X9AB') throw new Error('not an at-bat index')
  const hl = buf.readUInt32LE(4)
  const h = JSON.parse(buf.toString('utf8', 8, 8 + hl)) as { season: number; builtAt: string; nPitches: number; nAbs: number; types: string[]; outcomes: string[] }
  let off = 8 + hl
  const take = <T extends Uint8Array | Int8Array | Uint16Array | Uint32Array>(C: { new (b: ArrayBuffer): T; BYTES_PER_ELEMENT: number }, count: number): T => {
    const bytes = count * C.BYTES_PER_ELEMENT
    const ab = buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + bytes) as ArrayBuffer   // a copy, so it is aligned for any element size
    off += bytes
    return new C(ab)
  }
  const n = h.nPitches, m = h.nAbs
  const type = take(Uint8Array, n), speed2 = take(Uint8Array, n), hb2 = take(Int8Array, n), ivb2 = take(Int8Array, n), zone = take(Uint8Array, n), res = take(Uint8Array, n)
  const start = take(Uint32Array, m), pitcher = take(Uint32Array, m), batter = take(Uint32Array, m), gamepk = take(Uint32Array, m), date = take(Uint16Array, m)
  const len = take(Uint8Array, m), hand = take(Uint8Array, m), stand = take(Uint8Array, m), outcome = take(Uint8Array, m)
  return { ...h, type, speed2, hb2, ivb2, zone, res, start, pitcher, batter, gamepk, date, len, hand, stand, outcome }
}

export type PitchSpec = { t: string; speed: number; hb: number; ivb: number; zone?: number | null; res?: ResultCode | null }
export type MatchSpec = {
  hand: 'R' | 'L'; stand: 'R' | 'L' | null; mode: 'start' | 'any'; pitches: PitchSpec[]
  /** Optional filters. Absent = no filter, and the result is exactly what it was before they existed. */
  pitcherId?: number | null; batterId?: number | null; clusterId?: number | null
  /** The count before the first stacked pitch (0-3 balls, 0-2 strikes), rebuilt from the order of calls: a ball adds a ball; a called or swinging strike adds a strike; a foul adds one only below two. */
  count?: { balls: number; strikes: number } | null
}
/** Batter id -> hitter cluster id for the pitcher's hand (hitter_clusters). Only needed when a clusterId filter is used. */
export type MatchContext = { clusters?: Map<number, number> }
export type AbSample = { date: string; gamePk: number; pitcherId: number; batterId: number; outcome: string; pitches: { t: string; res: ResultCode | ''; speed: number | null }[] }
export type MatchResult = { total: number; outcomes: Record<string, number>; next: Record<string, number>; samples: AbSample[]; builtAt: string }

const EPOCH_MS = Date.UTC(2020, 0, 1)

export function matchSequence(ix: AbIndex, spec: MatchSpec, sampleCount = 8, ctx: MatchContext = {}): MatchResult {
  const ps = spec.pitches.slice(0, MAX_STACK)
  const out: MatchResult = { total: 0, outcomes: {}, next: {}, samples: [], builtAt: ix.builtAt }
  if (ps.length === 0) return out
  const want = ps.map(p => ({ t: ix.types.indexOf(p.t), lo: (p.speed - SPEED_WIN) * 2, hi: (p.speed + SPEED_WIN) * 2, hlo: (p.hb - MOVE_WIN) * 2, hhi: (p.hb + MOVE_WIN) * 2, vlo: (p.ivb - MOVE_WIN) * 2, vhi: (p.ivb + MOVE_WIN) * 2, z: p.zone ?? null, r: p.res ? RES_CODE.indexOf(p.res) : null }))
  if (want.some(w => w.t < 0)) return out
  const hand = spec.hand === 'L' ? 1 : 0, stand = spec.stand == null ? null : spec.stand === 'L' ? 1 : 0
  const ok = (i: number, w: (typeof want)[number]) =>
    ix.type[i] === w.t && ix.speed2[i] > 0 && ix.speed2[i] >= w.lo && ix.speed2[i] <= w.hi && ix.hb2[i] !== -128 && ix.hb2[i] >= w.hlo && ix.hb2[i] <= w.hhi &&
    ix.ivb2[i] !== -128 && ix.ivb2[i] >= w.vlo && ix.ivb2[i] <= w.vhi && (w.z == null || ix.zone[i] === w.z) && (w.r == null || ix.res[i] === w.r)
  const hits: number[] = []
  const k = ps.length
  for (let a = 0; a < ix.nAbs; a++) {
    const L = ix.len[a]
    if (L < k || ix.hand[a] !== hand || (stand != null && ix.stand[a] !== stand)) continue
    if (spec.pitcherId != null && ix.pitcher[a] !== spec.pitcherId) continue
    if (spec.batterId != null && ix.batter[a] !== spec.batterId) continue
    if (spec.clusterId != null && ctx.clusters?.get(ix.batter[a]) !== spec.clusterId) continue
    const s = ix.start[a], lastStart = spec.mode === 'start' ? 0 : L - k
    let balls = 0, strikes = 0                       // the count before pitch o, rebuilt from the calls
    for (let o = 0; o <= lastStart; o++) {
      if (o > 0) {
        const r = ix.res[s + o - 1]
        if (r === 1) balls++; else if (r === 2 || r === 3) strikes++; else if (r === 4 && strikes < 2) strikes++
      }
      if (spec.count && (balls !== spec.count.balls || strikes !== spec.count.strikes)) continue
      let all = true
      for (let j = 0; j < k && all; j++) all = ok(s + o + j, want[j])
      if (all) {
        out.total++
        const oc = ix.outcomes[ix.outcome[a]] ?? 'unknown'
        out.outcomes[oc] = (out.outcomes[oc] ?? 0) + 1
        const nx = o + k < L ? (ix.types[ix.type[s + o + k]] ?? '?') : 'end'
        out.next[nx] = (out.next[nx] ?? 0) + 1
        hits.push(a)
        break
      }
    }
  }
  // the most recent at-bats, newest first
  hits.sort((x, y) => ix.date[y] - ix.date[x] || ix.gamepk[y] - ix.gamepk[x] || ix.start[y] - ix.start[x])
  for (const a of hits.slice(0, sampleCount)) {
    const s = ix.start[a]
    out.samples.push({
      date: new Date(EPOCH_MS + ix.date[a] * 86400000).toISOString().slice(0, 10), gamePk: ix.gamepk[a], pitcherId: ix.pitcher[a], batterId: ix.batter[a],
      outcome: ix.outcomes[ix.outcome[a]] ?? 'unknown',
      pitches: Array.from({ length: ix.len[a] }, (_, j) => ({ t: ix.types[ix.type[s + j]] ?? '?', res: RES_CODE[ix.res[s + j]] ?? '', speed: ix.speed2[s + j] > 0 ? ix.speed2[s + j] / 2 : null })),
    })
  }
  return out
}
