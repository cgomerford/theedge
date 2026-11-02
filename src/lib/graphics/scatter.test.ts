import { describe, it, expect } from 'vitest'
import { joinDataset, autoHighlights, checkScatter, decimalsFor, displayName, fmt, layoutLabels, mergeColumn, nameKey, niceTicks, parsePasted, pickHighlights, type ScatterDataset } from './scatter'

describe('names', () => {
  it('flips Last, First and ignores accents, hyphens, punctuation and suffixes', () => {
    expect(displayName('Crow-Armstrong, Pete')).toBe('Pete Crow-Armstrong')
    expect(nameKey('Crow-Armstrong, Pete')).toBe(nameKey('Pete Crow Armstrong'))
    expect(nameKey('José Ramírez')).toBe('jose ramirez')
    expect(nameKey('Bobby Witt Jr.')).toBe('bobby witt')
    expect(nameKey('Witt Jr., Bobby')).toBe('bobby witt')
    expect(nameKey("Ke'Bryan Hayes")).toBe('kebryan hayes')
  })
})

describe('pasted columns', () => {
  it('reads tab or comma data with a name column first', () => {
    const t = parsePasted('Name\tDRS\tUZR\nPete Crow-Armstrong\t+16\t5.1\nJJ Wetherholt\t12\t−2.0\nBlank\t\t\n')
    expect(t.error).toBeUndefined()
    expect(t.columns.map(c => c.label)).toEqual(['DRS', 'UZR'])
    expect(t.columns[0].values.get(nameKey('Pete Crow-Armstrong'))).toBe(16)
    expect(t.columns[1].values.get(nameKey('JJ Wetherholt'))).toBe(-2)
    expect(parsePasted('Player,DRS\n"Witt Jr., Bobby",8').columns[0].values.get('bobby witt')).toBe(8)
  })
  it('finds the Name column wherever it is and skips duplicates', () => {
    const t = parsePasted('Rk\tName\tTeam\tDRS\n1\tPete Crow-Armstrong\tCHC\t16\n2\tPete Crow-Armstrong\tCHC\t99\n3\tJJ Wetherholt\tSTL\t12\n')
    expect(t.columns.map(c => c.label)).toEqual(['Rk', 'DRS'])
    expect(t.columns[1].values.get('pete crow armstrong')).toBe(16)
  })
  it('explains a paste it cannot use', () => {
    expect(parsePasted('only one line').error).toMatch(/header/)
    expect(parsePasted('Name,Note\nA,hello').error).toMatch(/numbers/)
  })
  it('joins onto a dataset by name and reports the leftovers', () => {
    const ds: ScatterDataset = { id: 'd', label: 'd', columns: [{ key: 'frv', label: 'FRV', decimals: 1 }], cats: [], rows: [
      { id: 1, name: 'Pete Crow-Armstrong', v: { frv: 26.3 }, c: {} }, { id: 2, name: 'Taylor Walls', v: { frv: -1.9 }, c: {} } ] }
    const p = parsePasted('Name,DRS\n"Crow-Armstrong, Pete",16\nSomeone Else,3\n')
    const r = mergeColumn(ds, p.columns[0])
    expect(r.matched).toBe(1)
    expect(r.unmatched).toEqual(['someone else'])
    expect(r.dataset.rows[0].v.p1).toBe(16)
    expect(r.dataset.rows[1].v.p1).toBeNull()
    expect(r.dataset.columns.map(c => c.key)).toEqual(['frv', 'p1'])
  })
})

describe('numbers', () => {
  it('formats signed values with a real minus and rates without a leading zero', () => {
    expect(fmt(26.26, 1, true)).toBe('+26.3'); expect(fmt(-4.7, 1, true)).toBe('−4.7'); expect(fmt(0, 1, true)).toBe('0')
    expect(fmt(0.254, 3, false)).toBe('.254'); expect(fmt(-0.004, 1, true)).toBe('0')
  })
  it('chooses decimals by size', () => { expect(decimalsFor([1, 2, 3])).toBe(0); expect(decimalsFor([0.1, 0.3])).toBe(3); expect(decimalsFor([4.1, 7.3])).toBe(2); expect(decimalsFor([20.5, 3.2])).toBe(1) })
  it('makes round ticks that cover the data', () => {
    const t = niceTicks(-19.2, 28.4, 6)
    expect(t.lo).toBeLessThanOrEqual(-19.2); expect(t.hi).toBeGreaterThanOrEqual(28.4)
    expect(t.ticks.every(v => Math.abs(v % 10) < 1e-9 || Math.abs(v % 5) < 1e-9)).toBe(true)
    expect(niceTicks(3, 3).ticks.length).toBe(3)
  })
})

describe('highlights', () => {
  const pts = [{ name: 'A', x: 0, y: 0 }, { name: 'B', x: 10, y: 30 }, { name: 'C', x: 28, y: 5 }, { name: 'D', x: 5, y: 6 }]
  it('ranks by distance from the diagonal or by an axis', () => {
    expect(autoHighlights(pts, 'gap', 2).map(p => p.name)).toEqual(['C', 'B'])
    expect(autoHighlights(pts, 'top-y', 1)[0].name).toBe('B'); expect(autoHighlights(pts, 'bottom-x', 1)[0].name).toBe('A')
    expect(autoHighlights(pts, 'none', 3)).toEqual([])
  })
  it('skips players clicked off and fills the place with the next one', () => {
    const r = pickHighlights(pts, 'gap', 2, [], ['c'])
    expect(r.picked.map(p => p.name)).toEqual(['B', 'D'])
  })
  it('adds typed names once and reports the ones that match nobody', () => {
    const r = pickHighlights(pts, 'gap', 1, ['b', 'd', 'Nobody'])
    expect(r.picked.map(p => p.name)).toEqual(['C', 'B', 'D']); expect(r.missing).toEqual(['Nobody'])
  })
})

describe('label layout', () => {
  it('keeps labels apart and inside the plot', () => {
    const items = [{ px: 300, py: 100, text: 'Pete Crow-Armstrong (+16, +26.3)' }, { px: 320, py: 108, text: 'JJ Wetherholt (+12, +23.4)' }, { px: 20, py: 50, text: 'Bryson Stott (−10, +6.0)' }]
    const bounds = { x0: 0, y0: 0, x1: 700, y1: 400 }
    const out = layoutLabels(items, bounds, 14)
    const box = (l: typeof out[number]) => ({ x0: l.anchor === 'start' ? l.x : l.x - l.w, x1: l.anchor === 'start' ? l.x + l.w : l.x, y0: l.y - l.h * 0.78, y1: l.y + l.h * 0.28 })
    for (let i = 0; i < out.length; i++) {
      const b = box(out[i]); expect(b.x0).toBeGreaterThanOrEqual(0); expect(b.x1).toBeLessThanOrEqual(700)
      for (let j = i + 1; j < out.length; j++) { const c = box(out[j]); expect(b.x0 < c.x1 && b.x1 > c.x0 && b.y0 < c.y1 && b.y1 > c.y0).toBe(false) }
    }
  })
})

describe('checks', () => {
  it('warns about a thin or unfinished chart', () => {
    expect(checkScatter({ title: '', subtitle: '', xKey: 'a', yKey: 'a', points: 4, missing: ['X'], unmatched: ['y'] }).length).toBe(5)
    expect(checkScatter({ title: 'T', subtitle: '', xKey: 'a', yKey: 'b', points: 200, missing: [], unmatched: [] })).toEqual([])
  })
})

describe('joining another table', () => {
  const mk = (id: string, rows: [string, number][]): ScatterDataset => ({ id, label: id, columns: [{ key: 'x', label: 'X', decimals: 1 }], cats: [], rows: rows.map(([n, x]) => ({ id: null, name: n, v: { x }, c: {} })) })
  it('adds the other table\'s stats by name, with a tag, and counts matches', () => {
    const a = mk('frv', [['Pete Crow-Armstrong', 26.3], ['Taylor Walls', -1.9]])
    const b = mk('bat', [['Crow-Armstrong, Pete', 0.35]])
    const r = joinDataset(a, b, 'Hitting')
    expect(r.matched).toBe(1)
    expect(r.dataset.columns.map(c => [c.key, c.label])).toEqual([['x', 'X'], ['bat__x', 'Hitting: X']])
    expect(r.dataset.rows[0].v.bat__x).toBe(0.35); expect(r.dataset.rows[1].v.bat__x).toBeNull()
    expect(joinDataset(r.dataset, b, 'Hitting').dataset.columns.length).toBe(2)
  })
})
