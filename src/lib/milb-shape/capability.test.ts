import { describe, it, expect } from 'vitest'
import { capabilitiesFrom, MLB_CAPS, NO_CAPS } from './capability'
import { Aggregator } from './aggregate'
import { row } from './test-fixtures'

const summaryOf = (rows: ReturnType<typeof row>[]) => { const a = new Aggregator('aaa', 2026); rows.forEach(r => a.add(r)); return a.summary }

describe('capabilities: which measurements a level can show', () => {
  it('reports every axis when the data carries them', () => {
    const c = capabilitiesFrom('aaa', 2026, summaryOf(Array.from({ length: 40 }, (_, i) => row({ game: 1001, ab: i + 1, pn: 1 }))), true, '2026-08-01', '2026-08-05', 'now')
    expect(c.axes).toEqual({ velo: true, ride: true, run: true, armAngle: true })
    expect(c.coverage).toBe('full'); expect(c.pending.armAngle).toBeNull(); expect(c.types.FF).toEqual({ pitches: 40, armAngle: true })
  })
  it('arm angle is pending, with a reason in words, when under 90% of pitches carry it; velocity, ride and run stay', () => {
    const rows = Array.from({ length: 40 }, (_, i) => row({ game: 1001, ab: i + 1, pn: 1, arm_angle: i < 30 ? '' : 40 }))
    const c = capabilitiesFrom('fsl', 2026, summaryOf(rows), true, null, null, null)
    expect(c.axes.armAngle).toBe(false)
    expect(c.axes.ride && c.axes.run && c.axes.velo).toBe(true)
    expect(c.pending.armAngle).toMatch(/25%/)
    expect(c.types.FF.armAngle).toBe(false)
  })
  it('judges arm angle per pitch type: a type that has it keeps it', () => {
    const rows = [...Array.from({ length: 30 }, (_, i) => row({ game: 1001, ab: i + 1, pn: 1 })), ...Array.from({ length: 30 }, (_, i) => row({ game: 1001, ab: i + 100, pn: 1, pitch_type: 'SL', arm_angle: '' }))]
    const c = capabilitiesFrom('aaa', 2026, summaryOf(rows), true, null, null, null)
    expect(c.types.FF.armAngle).toBe(true); expect(c.types.SL.armAngle).toBe(false)
  })
  it('contact-quality outcomes need balls in play with the data; otherwise pending with a reason', () => {
    const bip = (i: number, has: boolean) => row({ game: 1001, ab: i + 1, pn: 1, description: 'hit_into_play', estimated_woba_using_speedangle: has ? 0.3 : '', launch_speed: has ? 95 : '', bb_type: has ? 'line_drive' : '' })
    const rich = capabilitiesFrom('aaa', 2026, summaryOf(Array.from({ length: 120 }, (_, i) => bip(i, true))), true, null, null, null)
    expect(rich.outcomes.contact).toBe(true)
    const poor = capabilitiesFrom('aaa', 2026, summaryOf(Array.from({ length: 120 }, (_, i) => bip(i, false))), true, null, null, null)
    expect(poor.outcomes.contact).toBe(false); expect(poor.pending.contact).toBeTruthy()
  })
  it('an incomplete run is labelled partial; nothing loaded is "none", never a number', () => {
    const s = summaryOf(Array.from({ length: 10 }, (_, i) => row({ game: 1001, ab: i + 1, pn: 1 })))
    expect(capabilitiesFrom('aaa', 2026, s, false, null, null, null).coverage).toBe('partial')
    const none = capabilitiesFrom('aaa', 2026, summaryOf([]), true, null, null, null)
    expect(none.coverage).toBe('none'); expect(none.usable).toBe(0); expect(none.axes.armAngle).toBe(false)
    expect(NO_CAPS('fsl', 2026).axes).toEqual({ velo: false, ride: false, run: false, armAngle: false })
  })
  it('MLB is always full and has every axis, with nothing pending', () => {
    expect(MLB_CAPS(2026)).toMatchObject({ level: 'mlb', coverage: 'full', axes: { armAngle: true }, pending: { armAngle: null, contact: null } })
  })
  it('there is no extension axis (the sandbox has none)', () => { expect(Object.keys(MLB_CAPS(2026).axes)).toEqual(['velo', 'ride', 'run', 'armAngle']) })
})
