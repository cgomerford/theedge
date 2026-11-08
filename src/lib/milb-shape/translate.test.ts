import { describe, it, expect } from 'vitest'
import { translate, type TranslationInput } from './translate'

const base: TranslationInput = {
  levelLabel: 'Triple-A',
  level: { saved: 0.9, whiff: 0.24, pitches: 800 }, levelAvgWhiff: 0.19,
  mlb: { saved: -0.4, whiff: 0.15, pitches: 6000 }, mlbAvgWhiff: 0.187,
}

describe('translate: does a shape that works in the minors carry to MLB?', () => {
  it('flags a shape that works at his level but has not worked in MLB', () => {
    const t = translate(base)
    expect(t.status).toBe('minors-only')
    expect(t.headline).toMatch(/works at Triple-A, but pitches with this movement have not worked in MLB/)
    expect(t.reasons[0]).toMatch(/\+0\.90 runs per 100 at Triple-A; MLB pitches with that movement have saved −0\.40/)
    expect(t.reasons[1]).toMatch(/\+5\.0 pts at Triple-A, −3\.7 pts in MLB/)
  })
  it('flags it too when MLB is only average, with softer wording', () => {
    const t = translate({ ...base, mlb: { saved: 0.0, whiff: 0.187, pitches: 6000 } })
    expect(t.status).toBe('minors-only'); expect(t.headline).toMatch(/only been average in MLB/)
  })
  it('says it holds when both levels pass', () => {
    expect(translate({ ...base, mlb: { saved: 0.5, whiff: 0.21, pitches: 6000 } }).status).toBe('holds')
  })
  it('the reverse: not above average at his level but working in MLB', () => {
    expect(translate({ ...base, level: { saved: 0, whiff: 0.19, pitches: 800 }, mlb: { saved: 0.5, whiff: 0.21, pitches: 6000 } }).status).toBe('mlb-better')
  })
  it('no flag when it works at neither', () => {
    expect(translate({ ...base, level: { saved: -0.1, whiff: 0.18, pitches: 800 } }).status).toBe('neither')
  })
  it('does not guess without a sample on either side', () => {
    expect(translate({ ...base, level: { saved: null, whiff: null, pitches: 10 } }).status).toBe('unclear')
    expect(translate({ ...base, mlb: null }).status).toBe('unclear')
    expect(translate({ ...base, mlb: { saved: null, whiff: null, pitches: 3 } }).status).toBe('unclear')
  })
  it('works from whiffs alone when run value is missing', () => {
    expect(translate({ ...base, level: { saved: null, whiff: 0.24, pitches: 800 }, mlb: { saved: null, whiff: 0.15, pitches: 6000 } }).status).toBe('minors-only')
  })
  it('adds speed: slower than MLB pitches with this movement, and what MLB pitches at his speed do', () => {
    const t = translate({ ...base, speed: { veloDiff: -2.4, atSpeedWhiff: 0.12, allWhiff: 0.15, swings: 4000 } })
    expect(t.headline).toMatch(/His speed is part of it/)
    expect(t.reasons.join(' ')).toMatch(/2\.4 mph slower than MLB pitches with this movement/)
    expect(t.reasons.join(' ')).toMatch(/at his speed whiff 12\.0% per swing against 15\.0% at every speed/)
    // a small speed gap is not a reason
    expect(translate({ ...base, speed: { veloDiff: -0.6, atSpeedWhiff: 0.12, allWhiff: 0.15, swings: 4000 } }).reasons).toHaveLength(2)
  })
  it('wording describes what has happened, never what will', () => {
    const text = JSON.stringify([translate(base), translate({ ...base, mlb: { saved: 0.5, whiff: 0.21, pitches: 6000 } }), translate({ ...base, level: { saved: 0, whiff: 0.19, pitches: 800 }, mlb: { saved: 0.5, whiff: 0.21, pitches: 6000 } })])
    expect(text).not.toMatch(/\bwill\b|\bshould\b|\bexpect|\bproject|\bpredict/i)
  })
})
