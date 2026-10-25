import { describe, expect, it } from 'vitest'
import sample from '../__fixtures__/preview-849802.json'
import { defaultTitles, resolveTitles } from './titles'
import type { PreviewData } from '../types'

const d = sample as unknown as PreviewData

describe('slide wording', () => {
  it('defaults come from the data', () => {
    expect(defaultTitles('arsenal', d)).toMatchObject({ kicker: 'Rays · Drew Rasmussen', headline: 'Four looks, one finisher.' })
    expect(defaultTitles('tunnel', d).kicker).toBe('Brewers · Logan Henderson')
    expect(defaultTitles('hook', d)).toMatchObject({ headline: 'Game 2 tonight.', extraLabel: 'Line under the number' })
    expect(defaultTitles('outro', d)).toMatchObject({ headline: 'Rasmussen vs Henderson', extra: 'Full Scout at x9Lab' })
  })
  it('the side by side slide names each starter\'s most used pitch', () => {
    expect(defaultTitles('compare', d)).toMatchObject({ kicker: 'ARSENALS SIDE BY SIDE', headline: 'Cutter for Rasmussen, four-seamer for Henderson.' })
  })
  it('the home and away defense slides each name their own club and headline', () => {
    expect(defaultTitles('defense', d, { defenseMode: 'home' }).kicker).toMatch(/^Brewers DEFENSE/)
    expect(defaultTitles('defenseAway', d).kicker).toMatch(/^Rays DEFENSE/)
    expect(defaultTitles('defenseAway', d).headline).toBe(d.defense.away.headline)
    expect(defaultTitles('defenseAway', d).headline).not.toBe(defaultTitles('defense', d).headline)
  })
  it('your wording wins, and blank or spaces fall back to the default', () => {
    const ov = { arsenal: { headline: 'Rasmussen has four ways to get you out', kicker: '   ' } }
    const r = resolveTitles('arsenal', d, ov)
    expect(r.headline).toBe('Rasmussen has four ways to get you out')
    expect(r.kicker).toBe('Rays · Drew Rasmussen')
    expect(resolveTitles('tunnel', d, ov).headline).toBe('Same tunnel. Different pitch.')
  })
  it('the bullpen closing line can be changed, and the last-3-days view has no closing line', () => {
    expect(defaultTitles('bullpen', d).extra).toMatch(/^Matz: 31 pitches/)
    expect(resolveTitles('bullpen', d, { bullpen: { extra: 'Matz did the heavy lifting.' } }).extra).toBe('Matz did the heavy lifting.')
    expect(defaultTitles('bullpen', d, { bullpenMode: 'last3' }).extraLabel).toBeNull()
  })
})
