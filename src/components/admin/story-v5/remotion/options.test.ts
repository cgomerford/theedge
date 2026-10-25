import { describe, expect, it } from 'vitest'
import sample from '../__fixtures__/preview-849802.json'
import { ALL_SCENES, DEFAULT_SCENES, layout } from './config'
import { SLIDE_OPTIONS, getOpt, optNum } from './options'
import { defaultTitles } from './titles'
import type { PreviewData } from '../types'

const d = sample as unknown as PreviewData

describe('slide options', () => {
  it('every option belongs to a real slide and has a default that is one of its own choices', () => {
    for (const [id, defs] of Object.entries(SLIDE_OPTIONS)) {
      expect(ALL_SCENES).toContain(id)
      const keys = (defs ?? []).map(x => x.key)
      expect(new Set(keys).size).toBe(keys.length)
      for (const x of defs ?? []) if (x.type === 'select') expect(x.choices.map(c => c.value)).toContain(x.default)
    }
  })
  it('an untouched option is its default, a set one wins, and a bad stored value falls back', () => {
    expect(getOpt(undefined, 'arsenal', 'showLine')).toBe(true)
    expect(optNum(undefined, 'arsenal', 'maxPitches')).toBe(4)
    expect(getOpt({ arsenal: { showLine: false } }, 'arsenal', 'showLine')).toBe(false)
    expect(optNum({ bullpen: { maxRows: '5' } }, 'bullpen', 'maxRows')).toBe(5)
    expect(getOpt({ bullpen: { maxRows: '99' } }, 'bullpen', 'maxRows')).toBe('8')
    expect(getOpt({ arsenal: { showLine: 'yes' } }, 'arsenal', 'showLine')).toBe(true)
  })
})

describe('matchup slide', () => {
  it('is optional, so the default video is unchanged, and its words come from the data', () => {
    expect(DEFAULT_SCENES).not.toContain('matchup')
    expect(layout(['hook', 'matchup', 'outro']).total).toBe(100 + 110 + 60)
    expect(defaultTitles('matchup', d)).toMatchObject({ kicker: 'WORLD SERIES · GAME 2', headline: 'Rays at Brewers', extra: 'MIL leads 1-0' })
  })
})
