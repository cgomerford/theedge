import { describe, it, expect } from 'vitest'
import { ABOUT_LEVEL_PTS, MIN_WINDOW_SWINGS, STRONG_SWINGS, boxColour, divergingColour, MAP_BG, movementStats, nameSpot, rateThrowers, splitThrowers, toneLine, toneOf, verdictOf, type Thrower } from './finder-math'

// A tiny league: movement centred near (8, 16) in, spread about 2 in.
const cells: number[] = []
for (const [hb, iv, n] of [[60, 140, 50], [80, 160, 100], [100, 180, 50], [80, 140, 50], [80, 180, 50]]) cells.push(hb, iv, n, n, 0)
const ms = movementStats(cells)!

describe('boxColour', () => {
  it('is blank under the swing gate, faded when thin, full when strong', () => {
    expect(boxColour(MIN_WINDOW_SWINGS - 1, 10, 0.19)).toBeNull()
    const thin = boxColour(MIN_WINDOW_SWINGS, 20, 0.19)!, strong = boxColour(STRONG_SWINGS, 50, 0.19)!
    expect(thin).not.toBeNull()
    // the same rate drawn thin sits closer to the background than drawn strong
    const rate = 0.4
    const t = boxColour(60, 60 * rate, 0.19)!, s = boxColour(200, 200 * rate, 0.19)!
    const dist = (c: number[]) => Math.abs(c[0] - MAP_BG[0]) + Math.abs(c[1] - MAP_BG[1]) + Math.abs(c[2] - MAP_BG[2])
    expect(dist(t)).toBeLessThan(dist(s))
    expect(strong).toHaveLength(3)
  })
  it('is cream at the league rate, bluer below, more orange above', () => {
    const at = divergingColour(0.19, 0.19), lo = divergingColour(0.1, 0.19), hi = divergingColour(0.3, 0.19)
    expect(lo[2]).toBeGreaterThan(lo[0])          // blue-grey leans blue
    expect(hi[0]).toBeGreaterThan(hi[2])          // orange leans red
    expect(at[0]).toBeGreaterThan(230)            // cream is light
  })
})

describe('nameSpot', () => {
  it('names high ride as the rising fastball, high run as heavy-run, both as ride with some run, neither as the middle', () => {
    expect(nameSpot('FF', 'Four-seam', ms.meanHb - 3 * ms.sdHb, ms.meanIvb + 2 * ms.sdIvb, ms).name).toBe('The rising fastball')
    expect(nameSpot('FF', 'Four-seam', ms.meanHb + 2 * ms.sdHb, ms.meanIvb, ms).name).toBe('The heavy-run fastball')
    expect(nameSpot('FF', 'Four-seam', ms.meanHb + 2 * ms.sdHb, ms.meanIvb + 2 * ms.sdIvb, ms).name).toBe('Ride with some run')
    expect(nameSpot('FF', 'Four-seam', ms.meanHb, ms.meanIvb, ms).name).toMatch(/near the middle/)
  })
  it('uses neutral wording for other pitch types', () => {
    expect(nameSpot('ST', 'Sweeper', ms.meanHb, ms.meanIvb + 2 * ms.sdIvb, ms).name).toBe('High-ride sweeper')
  })
})

describe('toneOf and toneLine', () => {
  it('splits at the stated points and never uses a forecast word', () => {
    expect(toneOf(3)).toBe('red'); expect(toneOf(-3)).toBe('blue'); expect(toneOf(2.9)).toBe('level')
    for (const t of ['red', 'blue', 'level'] as const) expect(toneLine(t, 'Four-seam')).not.toMatch(/will|predict|expect to/i)
  })
})

describe('verdicts for pitchers', () => {
  it('compares his rate to the spot rate with an about-level band', () => {
    expect(verdictOf(0.30, 0.26).verdict).toBe('ahead')
    expect(verdictOf(0.26 + ABOUT_LEVEL_PTS / 100, 0.26).verdict).toBe('level')
    expect(verdictOf(0.20, 0.26).verdict).toBe('behind')
    expect(verdictOf(null, 0.26).verdict).toBeNull()
  })
  it('needs 100 of his own swings, and splits ahead (biggest first) and behind (biggest shortfall first)', () => {
    const t = (id: number, nS: number, nW: number): Thrower => ({ pitcherId: id, name: `P${id}`, teamAbbr: 'X', nPitches: 500, nSwings: nS, nWhiffs: nW, estPitches: 100 - id, share: 0.2 })
    const r = rateThrowers([t(1, 200, 70), t(2, 200, 40), t(3, 200, 50), t(4, 50, 30), t(5, 200, 30)], 0.26)
    const s = splitThrowers(r)
    expect(s.ahead.map(x => x.pitcherId)).toEqual([1])
    expect(s.behind.map(x => x.pitcherId)).toEqual([5, 2])
    expect(s.level.map(x => x.pitcherId)).toEqual([3])
    expect(s.unknown.map(x => x.pitcherId)).toEqual([4])
  })
})
