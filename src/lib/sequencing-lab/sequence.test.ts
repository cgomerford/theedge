import { describe, expect, it } from 'vitest'
import { buildSequence, resultOf, type EventRow } from './sequence'

const row = (ab: number, pn: number, t: string, description: string, events: string | null = null, zone = 5): EventRow => ({ game_pk: 1, at_bat_number: ab, pitch_number: pn, pitch_type: t, description, events, zone })

describe('buildSequence', () => {
  it('rebuilds the count before each pitch and links the pitch before and after inside an at-bat', () => {
    const s = buildSequence([row(1, 1, 'FF', 'ball'), row(1, 2, 'SL', 'called_strike', null, 14), row(1, 3, 'SL', 'foul'), row(1, 4, 'CH', 'foul'), row(1, 5, 'FF', 'hit_into_play', 'single'), row(2, 1, 'FF', 'swinging_strike')])
    expect(s.map(x => `${x.b}-${x.s}`)).toEqual(['0-0', '1-0', '1-1', '1-2', '1-2', '0-0'])   // a foul with two strikes does not add a strike
    expect(s[0]).toMatchObject({ t: 'FF', p: '', n: 'SL', nr: 'C', r: 'B' })
    expect(s[4]).toMatchObject({ r: 'XH', p: 'CH', n: '' })
    expect(s[5]).toMatchObject({ p: '', n: '' })                                                  // a new at-bat starts fresh
  })
  it('puts the pitches in their thrown order even when the rows arrive shuffled', () => {
    const s = buildSequence([row(1, 3, 'CH', 'ball'), row(1, 1, 'FF', 'called_strike'), row(1, 2, 'SL', 'foul')])
    expect(s.map(x => x.t)).toEqual(['FF', 'SL', 'CH'])
  })
  it('classes results', () => {
    expect(resultOf('swinging_strike_blocked', null)).toBe('W')
    expect(resultOf('hit_into_play', 'field_out')).toBe('XO')
    expect(resultOf('hit_into_play_score', 'home_run')).toBe('XH')
    expect(resultOf('something_new', null)).toBeNull()
  })
})
