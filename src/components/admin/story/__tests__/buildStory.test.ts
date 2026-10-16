/* eslint-disable @typescript-eslint/no-explicit-any -- the scout bundle is loosely typed (any[]) by design */
import { describe, expect, it } from 'vitest'
import { buildStory } from '../buildStory'
import { CANON_ALL } from './fixtures'
import { emptyGame, extras, fullGame, fullScout, penGridFixture } from './fixtures'

const SLATE = '2026-10-07'
const ids = (g = fullGame(), o = {}) => buildStory(g, extras, SLATE, { scout: fullScout(), bullpenGrid: penGridFixture(), ...o }).segments.map(s => s.id)

describe('buildStory', () => {
  it('default selection: hook, sp, who\'s available, both defenses (need OAA), streaks, form, close', () => {
    expect(ids()).toEqual(['hook', 'sp', 'bullpen-avail', 'defense-away', 'defense-home', 'streaks', 'form', 'close'])
  })
  it('Full scout selection includes every available slide in canonical order', () => {
    const out = ids(fullGame(), { on: CANON_ALL })
    expect(out[0]).toBe('hook'); expect(out.at(-1)).toBe('close')
    expect(out).not.toContain('bullpen'); expect(out).toContain('sp-tto'); expect(out).toContain('lineup-away')
  })
  it('an empty game keeps only HOOK and CLOSE', () => {
    expect(ids(emptyGame(), { bullpenGrid: null })).toEqual(['hook', 'close'])
  })
  it('any middle slide can be switched off; hook and close are pinned and always on', () => {
    const out = ids(fullGame(), { on: ['streaks'] })       // nothing else selected
    expect(out).toEqual(['hook', 'streaks', 'close'])
  })
  it('reordering moves slides but keeps hook first and close last', () => {
    const out = ids(fullGame(), { on: ['streaks', 'form', 'sp'], order: ['close', 'form', 'streaks', 'hook', 'sp'] })
    expect(out).toEqual(['hook', 'form', 'streaks', 'sp', 'close'])
  })
  it('an unavailable slide stays out even when selected', () => {
    expect(ids(emptyGame(), { on: CANON_ALL, bullpenGrid: null, scout: null })).toEqual(['hook', 'close'])
  })
  it('TBD starters with null stats drop the duel; one real SP keeps it', () => {
    const g = fullGame(); g.awayPitcherName = 'TBD'; g.homePitcherName = 'TBD'; g.awayPitcherStats = null; g.homePitcherStats = null
    expect(ids(g)).not.toContain('sp')
    const one = fullGame(); one.awayPitcherStats = null
    expect(ids(one)).toContain('sp')
  })
  it('density durations', () => {
    const { segments } = buildStory(fullGame(), extras, SLATE)
    const dur = (id: string) => segments.find(s => s.id === id)!.duration
    expect(dur('streaks')).toBe(3.35) // three cards: 3.0 + 1 × 0.35
    const g = fullGame()
    g.awayLiteralBatters!.pop()
    expect(buildStory(g, extras, SLATE).segments.find(s => s.id === 'streaks')!.duration).toBe(3.0) // two cards
    const one = fullGame(); one.awayHotStreaks = [bauersOnly()]; one.homeHotStreaks = []
    expect(buildStory(one, extras, SLATE).segments.find(s => s.id === 'form')!.duration).toBe(3.5) // one pick
  })
  it('bullpen: window is the 3 dates before the slate; SP and 60+ pitch arms are dropped; rested listed', () => {
    const { game } = buildStory(fullGame(), extras, SLATE)
    expect(game.bullpen?.dateRange).toBe('Oct 4–6')
    expect(game.bullpen?.away?.arms.length).toBeLessThanOrEqual(5)
    expect(game.bullpen?.away?.rested).toContain('R. Guy')
    const g = fullGame()
    g.awayWorkload.pitchers[0].byDate = { '2026-10-04': 75 }
    const names = buildStory(g, extras, SLATE).game.bullpen!.away!.arms.map(a => a.name)
    expect(names).not.toContain('Trevor Megill')
  })
  it('defense: OAA only, no general "No OAA data" note; a fielder with null OAA keeps his tag', () => {
    const sc = fullScout()
    delete sc.defdesk.away!.oaaById[102]
    const d = buildStory(fullGame(), extras, SLATE, { scout: sc }).game.defense.away!
    expect(d.fielders.find(f => f.position === 'RF')?.oaa).toBeNull()
    expect(d.fielders.find(f => f.position === 'RF')?.name).not.toBe('')
    expect('note' in d).toBe(false)
    expect(buildStory(fullGame(), extras, SLATE).game.defense.away).toBeNull() // no OAA loaded → skipped, nothing substituted
  })
  it('streaks: top 3 by length, season row only when the batter is in the lineup', () => {
    const { game } = buildStory(fullGame(), extras, SLATE)
    expect(game.streaks.map(s => s.n)).toEqual([9, 8, 7])
    expect(game.streaks[1].season?.ops).toBe(0.81)
    expect(game.streaks[0].season).toBeNull()
  })
  it('form: heating first, capped at 4, title follows direction', () => {
    const { game } = buildStory(fullGame(), extras, SLATE)
    expect(game.form.map(p => p.short)).toEqual(['B. Turang', 'M. Machado', 'J. Bauers'])
    expect(game.formTitle).toBe('HEATING UP / COOLING OFF')
  })
})

function bauersOnly() {
  return { player_id: 1, player_name: 'Jake Bauers', player_type: 'batter', signal: 'cooling', signal_quality: 'validated', metric: 'ops', current_value: 0.7451, extreme_value: 0.9644, magnitude: 0.2193, games: 15 } as any
}
