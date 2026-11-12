import { describe, it, expect } from 'vitest'
import { percentileRank } from './milb-percentiles'

describe('percentileRank', () => {
  const pool = [1, 2, 3, 4, 5]
  it('ranks the best value at 100 and the worst at 0', () => {
    expect(percentileRank(pool, 5)).toBe(100)
    expect(percentileRank(pool, 1)).toBe(0)
    expect(percentileRank(pool, 3)).toBe(50)
  })
  it('flips for a stat where lower is better', () => {
    expect(percentileRank(pool, 1, true)).toBe(100)
    expect(percentileRank(pool, 5, true)).toBe(0)
  })
  it('counts ties as half', () => {
    expect(percentileRank([2, 2, 2, 2], 2)).toBe(50)
  })
  it('gives 50 when there is nobody to compare with', () => {
    expect(percentileRank([3], 3)).toBe(50)
  })
})
