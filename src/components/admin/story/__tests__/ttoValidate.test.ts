import { describe, expect, it } from 'vitest'
import { buildStory } from '../buildStory'
import { validTto } from '../ttoValidate'
import { extras, fullGame } from './fixtures'

describe('validTto', () => {
  it('Fried 109/29/91 fails (not monotone)', () => expect(validTto([109, 29, 91])).toBe(false))
  it('181/163/91 passes', () => expect(validTto([181, 163, 91])).toBe(true))
  it('282/277/163 passes', () => expect(validTto([282, 277, 163])).toBe(true))
  it('any PA under 40 fails', () => expect(validTto([60, 45, 39])).toBe(false))
  it('nulls and wrong length fail', () => {
    expect(validTto([100, null, 50])).toBe(false)
    expect(validTto([100, 90])).toBe(false)
  })
  it('both teams failing makes sp-tto unavailable; one failing keeps it', () => {
    const g = fullGame()
    g.awayPitcherTTO = { ...g.awayPitcherTTO, tto1_pa: 109, tto2_pa: 29, tto3_pa: 91 }
    g.homePitcherTTO = { ...g.homePitcherTTO, tto1_pa: 60, tto2_pa: 45, tto3_pa: 39 }
    const both = buildStory(g, extras, '2026-10-07')
    expect(both.available).not.toContain('sp-tto')
    expect(both.game.ttoOk).toEqual({ away: false, home: false })
    const one = fullGame()
    one.awayPitcherTTO = { ...one.awayPitcherTTO, tto1_pa: 109, tto2_pa: 29, tto3_pa: 91 }
    const r = buildStory(one, extras, '2026-10-07')
    expect(r.available).toContain('sp-tto')
    expect(r.game.ttoOk.away).toBe(false)
  })
})
