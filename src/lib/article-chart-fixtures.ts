// src/lib/article-chart-fixtures.ts
//
// The four charts for "Trevor Rogers Had Baseball's Second-Worst Changeup..." (slug trevor-rogers-changeup-sweeper-free-agency), with the caption, alt text and unit each one was written with. A draft's
// [CHART: ...] marker usually carries only the data, so when a converted chart's title matches one of these, the missing unit, caption and alt text are filled from here. Nothing is overwritten that the marker set.

import type { ChartBlock } from './article-chart'
import data from './data/rogers-charts.json'

/** The four charts as written for the article (the content lives in src/lib/data/rogers-charts.json: it is article copy, not interface text). */
export const ROGERS_CHARTS: ChartBlock[] = data.charts as ChartBlock[]
export const ROGERS_MARKERS: string[] = data.markers

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Fills a chart's blank unit, caption and alt text from a fixture with the same title. Values already on the chart are never changed. */
export function fillFromFixtures(b: ChartBlock): ChartBlock {
  const f = ROGERS_CHARTS.find(x => norm(x.title) === norm(b.title))
  if (!f) return b
  return { ...b, yUnit: b.yUnit || f.yUnit, caption: b.caption || f.caption, alt: b.alt || f.alt }
}
