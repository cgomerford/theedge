import { describe, expect, it } from 'vitest'
import { initials, shortName, surname } from '../names'

describe('names', () => {
  it('handles suffixes', () => {
    expect(shortName('Fernando Tatis Jr.')).toBe('F. Tatis Jr.')
    expect(surname('Fernando Tatis Jr.')).toBe('Tatis Jr.')
    expect(shortName('Vladimir Guerrero Jr.')).toBe('V. Guerrero Jr.')
    expect(shortName('Ken Griffey Sr.')).toBe('K. Griffey Sr.')
    expect(shortName('Cal Ripken III')).toBe('C. Ripken III')
    expect(surname('Jazz Chisholm Jr.')).toBe('Chisholm Jr.')
  })
  it('passes single names through and keeps multi-word surnames', () => {
    expect(shortName('Ichiro')).toBe('Ichiro')
    expect(surname('Ichiro')).toBe('Ichiro')
    expect(shortName('Elly De La Cruz')).toBe('E. De La Cruz')
  })
  it('initials skip suffixes', () => {
    expect(initials('Fernando Tatis Jr.')).toBe('FT')
    expect(initials('Ichiro')).toBe('I')
  })
})
