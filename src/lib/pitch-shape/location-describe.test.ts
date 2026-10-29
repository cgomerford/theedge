import { describe, it, expect } from 'vitest'
import { describeLocation } from './location-describe'

describe('describeLocation', () => {
  it('describes a pitch that lives high and away', () => {
    // [lx, lz, count]: 80 in the upper third / away third, 20 low and inside
    const d = describeLocation([15, 17, 80, 8, 10, 20], 'Four-seam')
    expect(d.sentence).toContain('upper third of the zone')
    expect(d.sentence).toContain('the away third')
    expect(d.vertical[3]).toBeCloseTo(0.8)
    expect(d.inZone).toBe(1)
  })
  it('puts pitches above the zone and off an edge in their own buckets', () => {
    const d = describeLocation([3, 22, 60, 12, 12, 40], 'Four-seam')
    expect(d.sentence).toContain('above the zone')
    expect(d.sentence).toContain('off the inside edge')
    expect(d.inZone).toBeCloseTo(0.4)
  })
  it('says nothing when there are no pitches', () => {
    expect(describeLocation([], 'Four-seam').sentence).toBeNull()
  })
  it('never uses a forecast word', () => {
    expect(describeLocation([12, 12, 10], 'Sweeper').sentence).not.toMatch(/will|predict/i)
  })
})
