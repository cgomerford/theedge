/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles for the loosely typed bundle */
import { describe, expect, it } from 'vitest'
import { buildStory } from '../buildStory'
import { teamNickname } from '../hook'
import { seriesOf } from '../series'
import { emptyGame, extras, fullGame, fullScout } from './fixtures'

const SLATE = '2026-10-07'
const BANNED = /\b(picks?|odds|locks?|bets?|betting|parlay|value|fade|hammer|leans?|factors?|tilts?|favou?rites?|predictions?)\b|toss-up|edge score|start\/sit|sit\/start/i

describe('hook', () => {
  it('a: 20-game on-base streak names the player with the suffix kept', () => {
    const g = fullGame()
    g.homeLiteralBatters = [{ player_id: 21, player_name: 'Fernando Tatis Jr.', position: 'RF', on_base_streak: 20, hit_streak: 3 }]
    const { game } = buildStory(g, extras, SLATE)
    expect(game.hook.rule).toBe('a')
    expect(game.hook.text).toBe('F. Tatis Jr.: on base in 20 straight · Regular season')
  })
  it('b: FIP gap when no long streak', () => {
    const { game } = buildStory(fullGame(), extras, SLATE)
    expect(game.hook.rule).toBe('b')
    expect(game.hook.text).toBe('F. Peralta 3.63 FIP vs D. Cease 2.19 · 2026 reg. season')
  })
  it('c: bullpen gap when FIP is close', () => {
    const g = fullGame()
    g.awayPitcherStats.fip = 3.0; g.homePitcherStats.fip = 3.1
    const { game } = buildStory(g, extras, SLATE)
    expect(game.hook.rule).toBe('c')
    expect(game.hook.text).toMatch(/^MIL pen threw \d+ pitches Oct 4–6; SD \d+$/)
  })
  it('d: fallback when there is no data', () => {
    const { game } = buildStory(emptyGame(), extras, SLATE)
    expect(game.hook.rule).toBe('d')
    expect(game.hook.text).toBe("Pitchers, bullpens, defense and form, tonight's scout report")
  })
  it('nicknames', () => {
    expect(teamNickname('Chicago White Sox')).toBe('White Sox')
    expect(teamNickname('San Diego Padres')).toBe('Padres')
    expect(teamNickname('Toronto Blue Jays')).toBe('Blue Jays')
    expect(teamNickname('MIL')).toBe('MIL')
  })
  it('generated notes never use banned vocabulary', () => {
    const variants = [fullGame(), emptyGame()]
    for (const g of variants) expect(buildStory(g, extras, SLATE).game.hook.text).not.toMatch(BANNED)
  })

  describe('postseason', () => {
    const ids = { gamePk: 1, awayTeamId: 114, homeTeamId: 145, awayPitcherId: null, homePitcherId: null }
    const build = (state: any, ex: any = {}) => buildStory(fullGame(), { ...extras, ids, series: { label: 'ALDS', game: 3, of: 5 }, ...ex }, SLATE, { scout: { ...fullScout(), series: state } }).game
    it('the series state leads the note and names the team facing elimination', () => {
      const g = build({ leaderId: 145, wins: 2, losses: 0, tied: false, over: false })    // fixture is MIL (away) @ SD (home); 114 = away, 145 = home
      expect(g.hook.rule).toBe('p')
      expect(g.hook.text).toBe('ALDS: SD lead 2-0 · MIL facing elimination')
    })
    it('tied series and a 1-0 lead read plainly', () => {
      expect(build({ leaderId: null, wins: 1, losses: 1, tied: true, over: false }).hook.text).toBe('ALDS: series tied 1-1 · Game 3 of 5')
      expect(build({ leaderId: 114, wins: 1, losses: 0, tied: false, over: false }).hook.text).toBe('ALDS: MIL lead 1-0')
    })
    it('without a series state the normal scout-note rules apply', () => {
      expect(build(null).hook.rule).not.toBe('p')
    })
    it('regular-season games never get a series note', () => {
      expect(buildStory(fullGame(), { ...extras, ids, series: null }, SLATE, { scout: { ...fullScout(), series: { leaderId: 145, wins: 2, losses: 0, tied: false, over: false } } }).game.hook.rule).not.toBe('p')
    })
    it('seriesOf maps the live schedule fields', () => {
      expect(seriesOf({ gameType: 'D', seriesDescription: 'AL Division Series', seriesGameNumber: 3, gamesInSeries: 5 })).toEqual({ label: 'ALDS', game: 3, of: 5 })
      expect(seriesOf({ gameType: 'W', seriesDescription: 'World Series', seriesGameNumber: 7, gamesInSeries: 7 })).toEqual({ label: 'World Series', game: 7, of: 7 })
      expect(seriesOf({ gameType: 'F', seriesDescription: 'NL Wild Card Series', seriesGameNumber: 2, gamesInSeries: 3 })?.label).toBe('NL Wild Card')
      expect(seriesOf({ gameType: 'R', seriesDescription: 'Regular Season' })).toBeNull()
      expect(seriesOf(undefined)).toBeNull()
    })
    it('the note and pill copy stay free of banned vocabulary', () => {
      const BANNED = /\b(lean|leans|tilt|factor|factors|prediction|predictions|picks|odds|bet|bets|betting|lock|parlay|units|sharp)\b|toss-up|edge score/i
      expect(build({ leaderId: 145, wins: 2, losses: 0, tied: false, over: false }).hook.text).not.toMatch(BANNED)
    })
  })
})
