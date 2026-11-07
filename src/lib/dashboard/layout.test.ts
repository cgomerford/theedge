import { describe, it, expect } from 'vitest'
import { parseLayout, starterLayout, FREE_WIDGET_LIMIT, PRO_WIDGET_LIMIT, type Layout } from './layout'
import { kpi, ranked, sliced, scatterPoints, type LeagueRow } from './compute'
import { fmtStat, statDef } from './stats'

const row = (id: number, name: string, team: string, s: Record<string, number>): LeagueRow => ({ id, name, team, pos: null, s })
const rows = [
  row(1, 'A Hitter', 'NYY', { home_run: 40, pa: 600, batting_avg: 0.3 }), row(2, 'B Hitter', 'BOS', { home_run: 20, pa: 500, batting_avg: 0.25 }),
  row(3, 'C Hitter', 'NYY', { home_run: 5, pa: 90, batting_avg: 0.35 }), row(4, 'D Hitter', 'LAD', { pa: 400 }),
]

describe('parseLayout', () => {
  it('rejects junk', () => { expect(parseLayout(null, true)).toBeNull(); expect(parseLayout({ widgets: 1 }, true)).toBeNull(); expect(parseLayout({ widgets: [], slicers: [] }, true)).toBeNull() })
  it('keeps well formed widgets and drops unknown stats', () => {
    const l = parseLayout({ widgets: [
      { id: 'a', kind: 'kpi', size: 'S', role: 'batter', stat: 'home_run', agg: 'leader' },
      { id: 'b', kind: 'kpi', size: 'S', role: 'batter', stat: 'not_a_stat', agg: 'leader' },
      { id: 'c', kind: 'leaders', size: 'M', role: 'pitcher', stat: 'p_era', n: 99, dir: 'best' },
    ], slicers: [] }, true) as Layout
    expect(l.widgets.map(w => w.id)).toEqual(['a', 'c'])
    expect(l.widgets[1]).toMatchObject({ n: 10 })   // clamped
  })
  it('keeps free accounts to free stats and six widgets', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, kind: 'kpi', size: 'S', role: 'batter', stat: 'home_run', agg: 'total' }))
    const l = parseLayout({ widgets: [...many, { id: 'pro', kind: 'kpi', size: 'S', role: 'batter', stat: 'barrel_batted_rate', agg: 'leader' }], slicers: [] }, false) as Layout
    expect(l.widgets).toHaveLength(FREE_WIDGET_LIMIT)
    expect(l.widgets.find(w => w.id === 'pro')).toBeUndefined()
    const pro = parseLayout({ widgets: [{ id: 'pro', kind: 'kpi', size: 'S', role: 'batter', stat: 'barrel_batted_rate', agg: 'leader' }], slicers: [] }, true) as Layout
    expect(pro.widgets).toHaveLength(1)
  })
  it('caps Pro at its limit and ignores duplicate ids', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `w${i}`, kind: 'myPlayers', size: 'M' }))
    expect((parseLayout({ widgets: many, slicers: [] }, true) as Layout).widgets).toHaveLength(PRO_WIDGET_LIMIT)
    expect((parseLayout({ widgets: [{ id: 'x', kind: 'myTeams', size: 'S' }, { id: 'x', kind: 'myTeams', size: 'S' }], slicers: [] }, true) as Layout).widgets).toHaveLength(1)
  })
  it('validates slicers', () => {
    const l = parseLayout({ widgets: [], slicers: [{ id: 's1', kind: 'team', team: 'NYY' }, { id: 's2', kind: 'team', team: '<script>' }, { id: 's3', kind: 'range', role: 'batter', stat: 'pa', lo: 100, hi: null }, { id: 's4', kind: 'range', role: 'batter', stat: 'nope', lo: 1, hi: 2 }] }, true) as Layout
    expect(l.slicers.map(s => s.id)).toEqual(['s1', 's2', 's3'])
    expect(l.slicers[1]).toMatchObject({ team: '' })
  })
  it('the starter layout passes its own validation for both plans', () => {
    for (const pro of [true, false]) { const s = starterLayout(pro); expect(parseLayout(s, pro)?.widgets.length).toBe(s.widgets.length) }
    expect(starterLayout(false).widgets).toHaveLength(FREE_WIDGET_LIMIT)
  })
})

describe('compute', () => {
  it('slicers filter by role and team, and a missing stat does not pass a closed slicer', () => {
    expect(sliced(rows, 'batter', [{ id: 's', kind: 'range', role: 'batter', stat: 'pa', lo: 100, hi: null }]).map(r => r.id)).toEqual([1, 2, 4])
    expect(sliced(rows, 'batter', [{ id: 's', kind: 'range', role: 'pitcher', stat: 'p_ip', lo: 30, hi: null }])).toHaveLength(4)   // a pitcher slicer does not touch batters
    expect(sliced(rows, 'batter', [{ id: 't', kind: 'team', team: 'NYY' }]).map(r => r.id)).toEqual([1, 3])
    expect(sliced(rows, 'batter', [{ id: 's', kind: 'range', role: 'batter', stat: 'home_run', lo: 1, hi: null }]).map(r => r.id)).toEqual([1, 2, 3])
  })
  it('ranks best first the way each stat is good, and leaves out players without the stat', () => {
    expect(ranked(rows, 'batter', 'home_run', 'best').map(r => r.id)).toEqual([1, 2, 3])
    expect(ranked(rows, 'batter', 'home_run', 'worst').map(r => r.id)).toEqual([3, 2, 1])
    const pit = [row(1, 'X', 'A', { p_era: 4 }), row(2, 'Y', 'B', { p_era: 2 })]
    expect(ranked(pit, 'pitcher', 'p_era', 'best').map(r => r.id)).toEqual([2, 1])   // lowest ERA is best
  })
  it('kpi: leader, average, median, total, and empty', () => {
    expect(kpi(rows, 'batter', 'home_run', 'leader')).toMatchObject({ value: 40, who: 'A Hitter · NYY', n: 3 })
    expect(kpi(rows, 'batter', 'home_run', 'total').value).toBe(65)
    expect(kpi(rows, 'batter', 'home_run', 'median').value).toBe(20)
    expect(kpi(rows, 'batter', 'home_run', 'average').value).toBeCloseTo(21.667, 2)
    expect(kpi([], 'batter', 'home_run', 'leader')).toEqual({ value: null, who: null, n: 0 })
  })
  it('scatter drops players missing either stat', () => { expect(scatterPoints(rows, 'home_run', 'batting_avg')).toHaveLength(3) })
})

describe('fmtStat', () => {
  it('formats rates, percents and counts', () => {
    expect(fmtStat(statDef('batter', 'batting_avg')!, 0.28)).toBe('.280')
    expect(fmtStat(statDef('batter', 'k_percent')!, 25.84)).toBe('25.8%')
    expect(fmtStat(statDef('batter', 'home_run')!, 45)).toBe('45')
    expect(fmtStat(statDef('pitcher', 'p_era')!, null)).toBe('—')
  })
})
