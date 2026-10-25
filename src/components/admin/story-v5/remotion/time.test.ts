import { describe, expect, it } from 'vitest'
import { firstPitchTimes } from './time'

describe('first pitch time is always ET and PT', () => {
  it('World Series Game 2: 00:00 UTC is 8PM ET and 5PM PT', () => {
    expect(firstPitchTimes('2026-10-25T00:00:00Z')).toEqual({ et: '8PM', pt: '5PM', line: '8PM ET · 5PM PT' })
  })
  it('shows minutes only when they are not :00, and follows daylight saving', () => {
    expect(firstPitchTimes('2026-10-24T23:07:00Z')?.line).toBe('7:07PM ET · 4:07PM PT')
    expect(firstPitchTimes('2026-11-05T00:00:00Z')?.line).toBe('7PM ET · 4PM PT')        // after the clocks go back
  })
  it('a bad date gives nothing, never a made-up time', () => {
    expect(firstPitchTimes('nope')).toBeNull()
  })
})
