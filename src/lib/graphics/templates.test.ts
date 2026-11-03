import { describe, it, expect } from 'vitest'
import { TEMPLATES } from './templates'
import { cleanSit, splitExtra, SIT_DEFAULT } from './situations'
import { CHART_TYPES } from './chart-model'
import { DATASET_CHOICES } from './scatter'

describe('chart templates', () => {
  it('uses real tables, chart types and situation options', () => {
    for (const t of TEMPLATES) {
      expect(DATASET_CHOICES.some(d => d.id === t.patch.datasetId), `${t.id} table`).toBe(true)
      expect(CHART_TYPES.some(c => c.id === t.patch.chart), `${t.id} chart`).toBe(true)
      if (t.patch.sit) expect(cleanSit(t.patch.sit), `${t.id} situation`).toEqual({ ...SIT_DEFAULT, ...t.patch.sit })
      for (const e of t.patch.extra ?? []) { const x = splitExtra(e); expect(DATASET_CHOICES.some(d => d.id === x.dataset), `${t.id} extra`).toBe(true); expect(x.sit).not.toBeNull() }
    }
  })
  it('has unique ids, a headline and a subtitle on each, and a joined stat key that matches its extra', () => {
    expect(new Set(TEMPLATES.map(t => t.id)).size).toBe(TEMPLATES.length)
    for (const t of TEMPLATES) { expect(t.patch.title.length).toBeGreaterThan(10); expect(t.patch.subtitle.length).toBeGreaterThan(10) }
    for (const t of TEMPLATES.filter(x => x.patch.extra?.length)) expect(t.patch.yKey?.startsWith(`${t.patch.extra![0]}__`)).toBe(true)
  })
  it('keeps prediction wording out of headlines', () => {
    for (const t of TEMPLATES) expect(`${t.patch.title} ${t.patch.subtitle}`).not.toMatch(/\b(will|likely|expect to|should|predict)\b/i)
  })
})
describe('joined situations', () => {
  it('reads a situation out of a joined table id', () => {
    expect(splitExtra('tsit-bat')).toEqual({ dataset: 'tsit-bat', sit: null })
    expect(splitExtra('tsit-bat@count=2k;pitch=brk')).toEqual({ dataset: 'tsit-bat', sit: { ...SIT_DEFAULT, count: '2k', pitch: 'brk' } })
    expect(splitExtra('tsit-bat@count=junk').sit).toEqual(SIT_DEFAULT)
  })
})
