import { describe, expect, it } from 'vitest'
import { otdFileName } from './otd-export'

describe('otdFileName', () => {
  it('keeps a preset id that already starts with its post date', () => {
    expect(otdFileName('2026-11-02-cubs-game7', 'Cubs 8, Cleveland 7 in 10 innings')).toBe('2026-11-02-cubs-game7.png')
  })
  it('uses the date and a slug of the headline otherwise, without accents', () => {
    expect(otdFileName('custom', 'Jeremy Peña was MVP', new Date('2026-11-05T12:00:00Z'))).toBe('2026-11-05-jeremy-pena-was-mvp.png')
  })
})
