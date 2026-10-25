import { describe, expect, it } from 'vitest'
import { MLB_TEAMS } from '@/lib/teams'
import { EDGE_NEUTRALS, checkPost, draftPost, defaultGradient, gradientCss, headlineFor, hittingFields, luminance, pitchingFields, shade, teamPalette, textOn, toGameLine } from '../logic'
import { SITE_HOST } from '@/lib/site'

describe('stat-line logic', () => {
  it('palette: official colours first, shades derived, brand colours last, all valid hex', () => {
    const nyy = MLB_TEAMS.find(t => t.abbrev === 'NYY')!
    const p = teamPalette(nyy)
    expect(p[0].hex).toBe(nyy.primary_color)
    expect(p[1].hex).toBe(nyy.secondary_color)
    expect(p.length).toBe(7)
    for (const s of p) expect(s.hex).toMatch(/^#[0-9A-F]{6}$/i)
    expect(luminance(p[3].hex)).toBeLessThan(luminance(p[0].hex))
    expect(luminance(p[4].hex)).toBeGreaterThan(luminance(p[0].hex))
  })
  it('each club\'s palette is unique and contains no shared neutrals', () => {
    const keys = MLB_TEAMS.map(t => teamPalette(t).map(s => s.hex).join(','))
    expect(new Set(keys).size).toBe(MLB_TEAMS.length)
    const neutral = new Set(EDGE_NEUTRALS.map(n => n.hex.toUpperCase()))
    for (const t of MLB_TEAMS) for (const s of teamPalette(t)) expect(neutral.has(s.hex.toUpperCase()) && s.name.includes('Edge')).toBe(false)
  })
  it('every club has two valid colours (so every palette builds)', () => {
    for (const t of MLB_TEAMS) { expect(t.primary_color).toMatch(/^#[0-9A-F]{6}$/i); expect(t.secondary_color).toMatch(/^#[0-9A-F]{6}$/i) }
  })
  it('gradient css + readable text', () => {
    const g = defaultGradient({ primary_color: '#0C2340', secondary_color: '#C4CED4' })
    expect(gradientCss(g)).toBe('linear-gradient(135deg, #0C2340 0%, #C4CED4 100%)')
    expect(gradientCss({ ...g, style: 'radial' })).toContain('radial-gradient')
    expect(textOn({ from: '#0C2340', to: '#0C2340' })).toBe('#FAF8F3')
    expect(textOn({ from: '#FFFFFF', to: '#EEEEEE' })).toBe('#1A1A1A')
    expect(shade('#000000', 0.5)).toBe('#808080')
  })
  it('hitting line from a real game-log shape', () => {
    const stat = { hits: 3, atBats: 4, homeRuns: 1, rbi: 3, runs: 2, baseOnBalls: 1, strikeOuts: 0, doubles: 1, stolenBases: 0 }
    expect(headlineFor('hitting', stat)).toBe('3-FOR-4')
    expect(hittingFields(stat).map(f => `${f.label}${f.value}`)).toEqual(['H3', 'HR1', 'RBI3', 'R2', 'BB1', 'K0', '2B1'])
  })
  it('pitching line keeps the IP string as published', () => {
    const stat = { inningsPitched: '5.2', strikeOuts: 8, baseOnBalls: 3, hits: 3, earnedRuns: 2, runs: 2, numberOfPitches: 105 }
    expect(headlineFor('pitching', stat)).toBe('5.2 IP')
    expect(pitchingFields(stat).map(f => f.label)).toEqual(['IP', 'K', 'BB', 'H', 'ER', 'R', 'PIT'])
  })
  it('toGameLine drops rows without stats and carries opponent / home', () => {
    expect(toGameLine('hitting', { date: '2026-09-27' })).toBeNull()
    const l = toGameLine('hitting', { date: '2026-09-27', isHome: false, opponent: { name: 'Washington Nationals' }, stat: { hits: 0, atBats: 5 } })!
    expect(l.headline).toBe('0-FOR-5'); expect(l.home).toBe(false); expect(l.opponent).toBe('Washington Nationals')
  })

  it('post check: counts characters, flags links and banned words, passes the sample thread', () => {
    const sample = 'The Guardians lost Games 1 and 2 at home.\n\n35 teams have done that in a best-of-five. Only 3 came back to win the series:\n\n2001 Yankees\n2012 Giants\n2015 Blue Jays\n\n#Guardians #WhiteSox #ALDS'
    const ok = checkPost(sample)
    expect(ok.over).toBe(false); expect(ok.hasLink).toBe(false); expect(ok.banned).toEqual([])
    expect(checkPost(`Read more at ${SITE_HOST}/mlb`).hasLink).toBe(true)
    expect(checkPost('Our lock of the night, great odds').banned.sort()).toEqual(['lock', 'odds'])
    expect(checkPost('x'.repeat(281)).over).toBe(true)
  })
  it('draft skips zero stats and pitch counts', () => {
    const d = draftPost({ name: 'Cody Bellinger', teamAbbr: 'NYY', context: 'Sep 25 · vs BAL', headline: '2-FOR-4', fields: [{ label: 'H', value: '2' }, { label: 'HR', value: '0' }, { label: 'RBI', value: '1' }, { label: 'PIT', value: '20' }] })
    expect(d).toBe('Cody Bellinger (NYY): 2-FOR-4\n2 H · 1 RBI\nSep 25 · vs BAL')
  })
})
