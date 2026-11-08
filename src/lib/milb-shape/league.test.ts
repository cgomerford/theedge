import { describe, it, expect } from 'vitest'
import { addGames, buildTeams, filterRows, makeRegistry, MlbMasqueradeError } from './league'
import { CAL, CAR, FSL, GAMES_A, GAMES_AAA, TEAMS_A, TEAMS_AAA, row } from './test-fixtures'

const registry = () => { const r = makeRegistry(TEAMS_AAA, TEAMS_A); addGames(r, GAMES_AAA); addGames(r, GAMES_A); return r }

describe('league identity comes from the API, never a guess', () => {
  it('finds the Florida State League by name inside Single-A and keeps Carolina and California out of it', () => {
    const t = buildTeams(TEAMS_AAA, TEAMS_A)
    expect(t.leagues.fsl).toEqual([FSL.id])
    expect(t.leagues.aaa).toEqual([112, 117])
    expect(t.leagues.fsl).not.toContain(CAR.id)
    expect(t.leagues.fsl).not.toContain(CAL.id)
  })
  it('uses the id the API gives even if it is not the one expected, and says so', () => {
    const moved = TEAMS_A.map(t => (t.league?.id === FSL.id ? { ...t, league: { id: 999, name: FSL.name } } : t))
    const t = buildTeams(TEAMS_AAA, moved)
    expect(t.leagues.fsl).toEqual([999])
    expect(t.notes.join(' ')).toMatch(/999/)
  })
  it('fails when the Florida State League is not in the Single-A list', () => {
    expect(() => buildTeams(TEAMS_AAA, TEAMS_A.filter(t => t.league?.id !== FSL.id))).toThrow(/Florida State League/)
  })
  it('never treats sport 14 as a whole as the FSL: a Carolina League game gets no level', () => {
    const g = registry().games
    expect(g.get(2001)!.level).toBe('fsl')
    expect(g.get(2002)!.level).toBeNull()
    expect(g.get(1001)!.level).toBe('aaa')
  })
})

describe('filterRows', () => {
  it('keeps only the level asked for and counts non-FSL Single-A rows by league', () => {
    const reg = registry()
    const rows = [row({ game: 2001, ab: 1, pn: 1 }), row({ game: 2001, ab: 1, pn: 2 }), row({ game: 2002, ab: 1, pn: 1 }), row({ game: 2003, ab: 1, pn: 1 })]
    const f = filterRows(rows, reg, 'fsl')
    expect(f.rows).toHaveLength(3)
    expect(f.rejects.kept.fsl).toBe(3)
    expect(f.rejects.otherLeague).toEqual({ [CAR.name]: 1 })
  })
  it('does not put a Triple-A row in the FSL set', () => {
    const f = filterRows([row({ game: 1001, ab: 1, pn: 1 }), row({ game: 2001, ab: 1, pn: 1 })], registry(), 'fsl')
    expect(f.rows).toHaveLength(1)
    expect(Object.values(f.rejects.otherLeague).reduce((a, b) => a + b, 0)).toBe(1)
  })
  it('quarantines a row whose game the schedule does not know, with a count', () => {
    const rows = [...Array.from({ length: 8 }, (_, i) => row({ game: 1001, ab: 1, pn: i + 1 })), row({ game: 1002, ab: 1, pn: 1 }), row({ game: 1003, ab: 1, pn: 1 }), row({ game: 1004, ab: 1, pn: 1, home_team: 'DUR' }), row({ game: 1005, ab: 1, pn: 1, home_team: 'DUR' }), row({ game: 1001, ab: 2, pn: 1 })]
    const reg = registry()
    addGames(reg, [1004, 1005].map(gamePk => ({ gamePk, gameType: 'R', officialDate: '2026-08-04', teams: { home: { team: { id: 234 } }, away: { team: { id: 431 } } } })))
    reg.games.delete(1003)
    const f = filterRows(rows, reg, 'aaa')
    expect(f.rejects.unresolved).toBe(1)
    expect(f.rejects.quarantinedGames).toEqual([1003])
    expect(f.rows).toHaveLength(rows.length - 1)
  })
  it('quarantines a row whose home club disagrees with the schedule', () => {
    const f = filterRows([row({ game: 1001, ab: 1, pn: 1, home_team: 'GWN' }), row({ game: 1001, ab: 1, pn: 2 })], registry(), 'aaa')
    expect(f.rejects.mismatch).toBe(1)
    expect(f.rows).toHaveLength(1)
  })
  it('FAILS CLOSED on a response that is really MLB: major-league home clubs and games the minor-league schedule does not know', () => {
    const mlb = Array.from({ length: 20 }, (_, i) => row({ game: 700000 + (i % 3), ab: 1, pn: i + 1, home_team: i % 2 ? 'NYY' : 'LAD', away_team: 'BOS' }))
    expect(() => filterRows(mlb, registry(), 'aaa')).toThrow(MlbMasqueradeError)
  })
  it('fails closed when a third or more of the games are unknown, even without major-league abbreviations', () => {
    const rows = [row({ game: 1001, ab: 1, pn: 1 }), row({ game: 555001, ab: 1, pn: 1, home_team: 'ZZZ' }), row({ game: 555002, ab: 1, pn: 1, home_team: 'ZZZ' })]
    expect(() => filterRows(rows, registry(), 'aaa')).toThrow(MlbMasqueradeError)
  })
})
