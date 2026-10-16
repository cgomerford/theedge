import { describe, expect, it } from 'vitest'
import { formTitle, fromSentence, selectFormPlayers } from '../selectFormPlayers'
import { bauers, chourio, machado, turang } from './fixtures'

describe('selectFormPlayers', () => {
  it('Brewers: validated cooling beats lesser cooling; trending heating is still picked', () => {
    const sel = selectFormPlayers([bauers, chourio, turang])
    expect(sel.heating?.player_name).toBe('Brice Turang')
    expect(sel.cooling?.player_name).toBe('Jake Bauers')
    expect(sel.title).toBe('HEATING UP / COOLING OFF')
    expect(fromSentence(bauers)).toBe('15-game peak .964 → .745 now')
    expect(fromSentence(turang)).toBe('vs .264 typical 15-game AVG → .377 now')
  })
  it('Padres: heating only', () => {
    const sel = selectFormPlayers([machado])
    expect(sel.heating?.player_name).toBe('Manny Machado')
    expect(sel.cooling).toBeNull()
    expect(sel.title).toBe('HEATING UP')
    expect(fromSentence(machado)).toBe('15-game low .458 → .610 now')
  })
  it('empty input', () => {
    expect(selectFormPlayers([])).toEqual({ heating: null, cooling: null, title: null })
    expect(formTitle([])).toBeNull()
  })
  it('validated outranks trending even with a smaller scaled magnitude', () => {
    const weakValidated = { ...turang, signal_quality: 'validated' as const, magnitude: 0.04 }
    const strongTrending = { ...turang, player_id: 9, player_name: 'Trend Guy', magnitude: 0.2 }
    expect(selectFormPlayers([strongTrending, weakValidated]).heating?.player_id).toBe(weakValidated.player_id)
  })
  it('ignores rows with an unknown metric', () => {
    expect(selectFormPlayers([{ ...bauers, metric: 'era' }]).cooling).toBeNull()
  })
  it('all cooling → COOLING OFF', () => {
    expect(formTitle([{ signal: 'cooling' }])).toBe('COOLING OFF')
  })
})
