// src/lib/milb-shape/normalise.ts
//
// Turns one pitch from either source into the Pitch Shape Lab's own units. The Lab defines (scripts/build_pitch_shape_cells.py, build_pitch_shape_bins.py):
//   hb  = horizontal break in INCHES, arm-side POSITIVE (left-handers flipped):  RHP  -pfx_x * 12,   LHP  +pfx_x * 12      (Savant pfx_x is feet, catcher's view)
//   ivb = induced vertical break in INCHES, up positive:                          pfx_z * 12
//   velo = release_speed (mph), slot = arm_angle (degrees)
//
// Checked 2026-11-08 against both sources for the same pitches (Triple-A game 816704, Florida State League game 820514):
//   * CSV pfx_z * 12  equals the feed's breaks.breakVerticalInduced  (14.14 vs 14.14 in on Triple-A right-hander four-seams)
//   * the feed's breaks.breakHorizontal is ALREADY in inches but its sign is the opposite of catcher's view: right-handers read +7.21 where the CSV gives
//     pfx_x*12 = -7.22; left-handers read -9.35 where the CSV gives +9.36. So arm-side-positive hb from the feed is  RHP +breakHorizontal, LHP -breakHorizontal.
//   * the feed's coordinates.pfxX / pfxZ are NOT the CSV's pfx values (different scale): never use them.
//   * api_break_z_with_gravity is total drop, not induced break: never used.
// Arm angle exists only in the CSV; the feed has none. It is never estimated: a missing arm angle stays null.

export type Hand = 'R' | 'L'

export type ShapePitch = {
  pitchType: string
  hand: Hand
  velo: number
  /** arm-side positive, inches */
  hb: number
  /** induced vertical break, inches */
  ivb: number
  /** arm angle in degrees; null when the source has none */
  slot: number | null
  ext: number | null
  spin: number | null
}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** hb in inches, arm-side positive, from Savant's catcher's-view pfx_x (FEET). */
export const hbFromPfxX = (pfxXFeet: number, hand: Hand) => (hand === 'R' ? -pfxXFeet : pfxXFeet) * 12
/** ivb in inches from Savant's pfx_z (FEET). */
export const ivbFromPfxZ = (pfxZFeet: number) => pfxZFeet * 12
/** hb in inches, arm-side positive, from the live feed's breaks.breakHorizontal (INCHES, sign opposite to catcher's view). */
export const hbFromFeed = (breakHorizontalIn: number, hand: Hand) => (hand === 'R' ? breakHorizontalIn : -breakHorizontalIn)

export type CsvPitch = Record<string, unknown>

/** One Savant CSV row to the Lab's units. null when the pitch has no tracking (the Lab's own builders skip those rows too). */
export function fromCsv(r: CsvPitch): ShapePitch | null {
  const hand = r.p_throws === 'L' ? 'L' : r.p_throws === 'R' ? 'R' : null
  const pt = typeof r.pitch_type === 'string' && r.pitch_type ? r.pitch_type : null
  const velo = num(r.release_speed), pfx = num(r.pfx_x), pfz = num(r.pfx_z)
  if (!hand || !pt || velo == null || pfx == null || pfz == null) return null
  return { pitchType: pt, hand, velo, hb: hbFromPfxX(pfx, hand), ivb: ivbFromPfxZ(pfz), slot: num(r.arm_angle), ext: num(r.release_extension), spin: num(r.release_spin_rate) }
}

type FeedEvent = { isPitch?: boolean; details?: { type?: { code?: string } }; pitchData?: { startSpeed?: number; extension?: number; breaks?: { spinRate?: number; breakVerticalInduced?: number; breakHorizontal?: number } } }

/** One live-feed pitch (liveData.plays.allPlays[].playEvents[]) to the Lab's units. `hand` is the play's matchup.pitchHand.code. Arm angle is always null. */
export function fromFeed(e: FeedEvent, hand: Hand): ShapePitch | null {
  if (!e.isPitch) return null
  const pd = e.pitchData, code = e.details?.type?.code
  const velo = num(pd?.startSpeed), bh = num(pd?.breaks?.breakHorizontal), bv = num(pd?.breaks?.breakVerticalInduced)
  if (!code || velo == null || bh == null || bv == null) return null
  return { pitchType: code, hand, velo, hb: hbFromFeed(bh, hand), ivb: bv, slot: null, ext: num(pd?.extension), spin: num(pd?.breaks?.spinRate) }
}

/** Round-half-up (floor(x + 0.5)), the same as JavaScript's Math.round and the Lab's Python builders. */
export const halfUp = (x: number) => Math.floor(x + 0.5)
