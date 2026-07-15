import type { StatColumn } from './stats-columns'
import type { StatsRow } from './stats-data'

export type PercentileMap = Map<number, Map<string, number>>

export function computeGroupedPercentiles(
  rows: StatsRow[],
  cols: StatColumn[],
  groupBy: (row: StatsRow) => string,
): PercentileMap {
  const map: PercentileMap = new Map()
  const groups = new Map<string, StatsRow[]>()
  for (const r of rows) {
    const key = groupBy(r)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r)
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    for (const col of cols) {
      const vals = group.map(r => r.stats[col.key]).filter((v): v is number => v !== null && v !== undefined)
      if (vals.length < 2) continue
      const sorted = [...vals].sort((a, b) => a - b)
      for (const row of group) {
        const v = row.stats[col.key]
        if (v === null || v === undefined) continue
        let rank = sorted.filter(x => x <= v).length / sorted.length
        if (col.higherIsBetter === false) rank = 1 - rank
        const pct = Math.round(rank * 100)
        if (!map.has(row.id)) map.set(row.id, new Map())
        map.get(row.id)!.set(col.key, pct)
      }
    }
  }
  return map
}