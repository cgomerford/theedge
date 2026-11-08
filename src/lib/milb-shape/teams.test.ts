import { describe, it, expect } from 'vitest'
import { MILB_TEAMS, teamLogoUrl, teamOf } from './teams'

describe('minor-league clubs', () => {
  it('has all 30 Triple-A clubs and the 10 Florida State League clubs, each with a parent club', () => {
    expect(MILB_TEAMS.aaa).toHaveLength(30); expect(MILB_TEAMS.fsl).toHaveLength(10)
    for (const t of [...MILB_TEAMS.aaa, ...MILB_TEAMS.fsl]) expect(t.parentId).not.toBeNull()
    expect(new Set(MILB_TEAMS.aaa.map(t => t.abbr)).size).toBe(30)
  })
  it('an abbreviation means the club at that level: COL is Columbus at Triple-A and Colorado in MLB', () => {
    expect(teamOf('aaa', 'COL')?.name).toMatch(/Columbus/)
    expect(teamOf('mlb', 'COL')?.name).toMatch(/Colorado/)
    expect(teamOf('fsl', 'DBT')?.name).toMatch(/Daytona/)
    expect(teamOf('mlb', 'AZ')?.name).toMatch(/Arizona/)   // Savant's AZ
  })
  it('an unknown club has no logo rather than a wrong one', () => {
    expect(teamLogoUrl('aaa', 'ZZZ')).toBeNull(); expect(teamLogoUrl('aaa', null)).toBeNull()
    expect(teamLogoUrl('aaa', 'DUR')).toBe('https://www.mlbstatic.com/team-logos/234.svg')
  })
})
