import { describe, expect, it } from 'vitest'
import { headlineLines } from './HeadlineCard'
import { validateSpec } from '@/lib/graphics/schema'

describe('headline card', () => {
  it('splits lines and marks the orange phrase', () => {
    expect(headlineLines('Paul Skenes\nlost his *99 mph*\nfastball.')).toEqual([
      [{ text: 'Paul Skenes', hot: false }],
      [{ text: 'lost his ', hot: false }, { text: '99 mph', hot: true }],
      [{ text: 'fastball.', hot: false }],
    ])
  })
  it('needs no stats', () => {
    expect(validateSpec({ id: 'h', template: 'headline', kicker: '', title: 'A *b*', chips: [], stats: [] }).ok).toBe(true)
  })
})
