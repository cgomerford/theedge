import { describe, it, expect } from 'vitest'
import { fromCsv, fromFeed, halfUp, hbFromFeed, hbFromPfxX, ivbFromPfxZ } from './normalise'

// Four REAL pitches (2026-08-01), the same pitch read from the Savant minors CSV and from the live feed: two Triple-A right-handed four-seams (Durham, game 816704) and
// two Florida State League left-handed four-seams (Roger Dean, game 820514). Values copied from the two responses.
const FIX = [
  { hand: 'R' as const, csv: { p_throws: 'R', pitch_type: 'FF', release_speed: 95.1, pfx_x: -0.74, pfx_z: 1.28, arm_angle: 23.9, release_extension: 6.4, release_spin_rate: 2177 },
    feed: { isPitch: true, details: { type: { code: 'FF' } }, pitchData: { startSpeed: 95.1, extension: 6.427126198339168, breaks: { spinRate: 2177, breakVerticalInduced: 15.4, breakHorizontal: 8.9 } } } },
  { hand: 'R' as const, csv: { p_throws: 'R', pitch_type: 'FF', release_speed: 95.6, pfx_x: -0.43, pfx_z: 1.42, arm_angle: 19.2, release_extension: 6.6, release_spin_rate: 2147 },
    feed: { isPitch: true, details: { type: { code: 'FF' } }, pitchData: { startSpeed: 95.6, extension: 6.5510007334502, breaks: { spinRate: 2147, breakVerticalInduced: 17.0, breakHorizontal: 5.2 } } } },
  { hand: 'L' as const, csv: { p_throws: 'L', pitch_type: 'FF', release_speed: 96.1, pfx_x: 0.89, pfx_z: 1.06, arm_angle: 38.0, release_extension: 6.5, release_spin_rate: 2378 },
    feed: { isPitch: true, details: { type: { code: 'FF' } }, pitchData: { startSpeed: 96.1, extension: 6.460571086280748, breaks: { spinRate: 2378, breakVerticalInduced: 12.7, breakHorizontal: -10.7 } } } },
  { hand: 'L' as const, csv: { p_throws: 'L', pitch_type: 'FF', release_speed: 96.7, pfx_x: 0.97, pfx_z: 1.37, arm_angle: 32.0, release_extension: 6.6, release_spin_rate: 2403 },
    feed: { isPitch: true, details: { type: { code: 'FF' } }, pitchData: { startSpeed: 96.7, extension: 6.5631123151402315, breaks: { spinRate: 2403, breakVerticalInduced: 16.4, breakHorizontal: -11.6 } } } },
]

/** The MLB builders' own formula, copied from scripts/build_pitch_shape_cells.py and build_pitch_shape_bins.py: hb = (-pfx_x*12) for RHP else pfx_x*12; ivb = pfx_z*12. */
const mlbHb = (pfxX: number, hand: string) => (hand === 'R' ? -pfxX * 12 : pfxX * 12)

describe('units and sign: the same pitch from the CSV and the feed lands in the same place as the MLB map', () => {
  for (const f of FIX) {
    it(`${f.hand === 'R' ? 'right' : 'left'}-hander, ${f.csv.release_speed} mph`, () => {
      const c = fromCsv(f.csv)!, e = fromFeed(f.feed, f.hand)!
      // exactly the MLB map's placement for the CSV pitch
      expect(c.hb).toBeCloseTo(mlbHb(f.csv.pfx_x, f.hand), 10)
      expect(c.ivb).toBeCloseTo(f.csv.pfx_z * 12, 10)
      // arm side is positive for both hands
      expect(c.hb).toBeGreaterThan(0)
      // the feed (already inches, opposite sign to catcher's view) agrees with the CSV to the CSV's two-decimal-foot rounding (0.06 in)
      expect(Math.abs(c.hb - e.hb)).toBeLessThan(0.15)
      expect(Math.abs(c.ivb - e.ivb)).toBeLessThan(0.15)
      expect(c.velo).toBe(e.velo)
    })
  }
  it('converts feet to inches once and flips only the left-hander', () => {
    expect(hbFromPfxX(-0.5, 'R')).toBe(6)
    expect(hbFromPfxX(0.5, 'L')).toBe(6)
    expect(hbFromPfxX(0.5, 'R')).toBe(-6)
    expect(ivbFromPfxZ(1.25)).toBe(15)
    expect(hbFromFeed(7.2, 'R')).toBe(7.2)
    expect(hbFromFeed(-9.35, 'L')).toBe(9.35)
  })
})

describe('arm angle is observed, never estimated', () => {
  it('the CSV carries it', () => expect(fromCsv(FIX[0].csv)!.slot).toBe(23.9))
  it('the feed never does: null, not 0 and not a guess from release position', () => {
    const e = fromFeed(FIX[0].feed, 'R')!
    expect(e.slot).toBeNull()
  })
  it('a CSV row with a blank arm angle stays null', () => expect(fromCsv({ ...FIX[0].csv, arm_angle: '' })!.slot).toBeNull())
})

describe('untracked pitches', () => {
  it('a row without speed or movement is skipped, as the MLB builders skip it', () => {
    expect(fromCsv({ ...FIX[0].csv, release_speed: '' })).toBeNull()
    expect(fromCsv({ ...FIX[0].csv, pfx_x: '' })).toBeNull()
    expect(fromCsv({ ...FIX[0].csv, pitch_type: '' })).toBeNull()
    expect(fromFeed({ isPitch: true, details: { type: { code: 'FF' } }, pitchData: {} }, 'R')).toBeNull()
    expect(fromFeed({ isPitch: false }, 'R')).toBeNull()
  })
  it('rounds half up like Math.round and the Python builders', () => {
    expect(halfUp(2.5)).toBe(3); expect(halfUp(-2.5)).toBe(-2); expect(halfUp(0.449)).toBe(0)
  })
})
