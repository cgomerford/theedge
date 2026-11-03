// src/lib/graphics/templates.ts
//
// Ready-made charts for the admin chart builder: one click sets the table, situation, chart type, stats, headline, subtitle and reference lines.
// Each is a patch over the builder's settings. Headlines say what the chart shows, never what will happen; subtitles describe the measure.

import type { ChartType } from './chart-model'
import type { SitFilters } from './situations'

export type TemplatePatch = {
  datasetId: string; chart: ChartType; title: string; subtitle: string
  sit?: Partial<SitFilters>; xKey?: string; yKey?: string; valueKey?: string; dir?: 'desc' | 'asc'; topN?: number; colorBy?: string
  xLabel?: string; yLabel?: string; diagonal?: boolean; diagLabel?: string; equal?: boolean; refAvg?: boolean; refMedian?: boolean
  mode?: 'gap' | 'top-y' | 'bottom-y' | 'top-x' | 'bottom-x' | 'none'; count?: number; extra?: string[]; size?: 'landscape' | 'square' | 'portrait'
}
export type Template = { id: string; group: string; label: string; blurb: string; patch: TemplatePatch }

export const TEMPLATES: Template[] = [
  { id: 'bat-2k-woba', group: 'Team situations', label: 'Team wOBA with two strikes', blurb: 'All 30 lineups ranked', patch: { datasetId: 'tsit-bat', chart: 'bar', sit: { count: '2k' }, valueKey: 'woba', dir: 'desc', topN: 30, colorBy: 'league', refAvg: true,
    title: 'Which lineups do the most damage with two strikes', subtitle: 'wOBA on plate appearances that ended with two strikes, all 30 clubs. Dashed line: league average.' } },
  { id: 'bat-2k-xwoba', group: 'Team situations', label: 'Two-strike wOBA vs expected', blurb: 'Who beat or missed their contact quality', patch: { datasetId: 'tsit-bat', chart: 'scatter', sit: { count: '2k' }, xKey: 'xwoba', yKey: 'woba', xLabel: 'xwOBA with two strikes', yLabel: 'wOBA with two strikes', diagonal: true, equal: true, diagLabel: 'wOBA = xwOBA', mode: 'gap', count: 10, refAvg: false,
    title: 'Two-strike results against the contact behind them', subtitle: 'Above the line: results beat the quality of contact. Below: they fell short of it. All 30 clubs, plate appearances ending with two strikes.' } },
  { id: 'bat-2k-k', group: 'Team situations', label: 'Two-strike strikeout rate', blurb: 'Who strikes out most once at two strikes', patch: { datasetId: 'tsit-bat', chart: 'bar', sit: { count: '2k' }, valueKey: 'k_percent', dir: 'desc', topN: 30, colorBy: 'league', refAvg: true,
    title: 'Which lineups strike out most once they reach two strikes', subtitle: 'Strikeouts per plate appearance that ended with two strikes. Dashed line: league average.' } },
  { id: 'bat-2k-whiff-k', group: 'Team situations', label: 'Two-strike whiffs and strikeouts', blurb: 'Whiff rate against K%', patch: { datasetId: 'tsit-bat', chart: 'scatter', sit: { count: '2k' }, xKey: 'whiff_rate', yKey: 'k_percent', xLabel: 'Whiff% with two strikes', yLabel: 'K% with two strikes', diagonal: false, mode: 'gap', count: 8, refAvg: true,
    title: 'Missing bats and striking out with two strikes', subtitle: 'Whiffs per swing against strikeouts per plate appearance, both measured with two strikes. Lines: league average.' } },
  { id: 'pit-2k-woba', group: 'Team situations', label: 'Staffs with two strikes', blurb: 'wOBA allowed, best staff first', patch: { datasetId: 'tsit-pit', chart: 'bar', sit: { count: '2k' }, valueKey: 'woba', dir: 'asc', topN: 30, colorBy: 'league', refAvg: true,
    title: 'Which pitching staffs finish the job with two strikes', subtitle: 'wOBA allowed on plate appearances that ended with two strikes. Lowest is best. Dashed line: league average.' } },
  { id: 'bat-risp-woba', group: 'Team situations', label: 'Team wOBA, runners in scoring position', blurb: 'All 30 lineups ranked', patch: { datasetId: 'tsit-bat', chart: 'bar', sit: { runners: 'risp' }, valueKey: 'woba', dir: 'desc', topN: 30, colorBy: 'league', refAvg: true,
    title: 'Which lineups hit best with runners in scoring position', subtitle: 'wOBA on plate appearances that ended with a runner on second or third. Dashed line: league average.' } },
  { id: 'bat-late-woba', group: 'Team situations', label: 'Team wOBA in the 7th to 9th', blurb: 'Late-inning lineups', patch: { datasetId: 'tsit-bat', chart: 'bar', sit: { inn: 'late' }, valueKey: 'woba', dir: 'desc', topN: 30, colorBy: 'league', refAvg: true,
    title: 'Which lineups hit best late in games', subtitle: 'wOBA on plate appearances that ended in the 7th inning or later. Dashed line: league average.' } },
  { id: 'bat-ahead-vs-2k', group: 'Team situations', label: 'Hitter ahead vs two strikes', blurb: 'The same lineup in two counts', patch: { datasetId: 'tsit-bat', chart: 'scatter', sit: { count: 'ahead' }, extra: ['tsit-bat@count=2k'], xKey: 'woba', yKey: 'tsit-bat@count=2k__woba', xLabel: 'wOBA when the hitter is ahead in the count', yLabel: 'wOBA with two strikes', diagonal: false, mode: 'gap', count: 8, refAvg: true,
    title: 'Hitting ahead in the count against hitting with two strikes', subtitle: 'Each dot is a club. Right: more damage when ahead. Up: more damage with two strikes. Lines: league average.' } },
  { id: 'bat-fast-vs-brk', group: 'Team situations', label: 'Fastballs vs breaking balls', blurb: 'Which lineups handle spin better', patch: { datasetId: 'tsit-bat', chart: 'scatter', sit: { pitch: 'fast' }, extra: ['tsit-bat@pitch=brk'], xKey: 'woba', yKey: 'tsit-bat@pitch=brk__woba', xLabel: 'wOBA against fastballs', yLabel: 'wOBA against breaking balls', diagonal: true, equal: true, diagLabel: 'same against both', mode: 'gap', count: 8, refAvg: false,
    title: 'Fastball lineups and breaking-ball lineups', subtitle: 'Above the line: a club does more damage against breaking balls than fastballs. Below: the other way round.' } },
  { id: 'bat-home-vs-road', group: 'Team situations', label: 'Home vs road wOBA', blurb: 'Who hits better at home', patch: { datasetId: 'tsit-bat', chart: 'scatter', sit: { venue: 'Home' }, extra: ['tsit-bat@venue=Road'], xKey: 'woba', yKey: 'tsit-bat@venue=Road__woba', xLabel: 'wOBA at home', yLabel: 'wOBA on the road', diagonal: true, equal: true, diagLabel: 'same home and road', mode: 'gap', count: 8, refAvg: false,
    title: 'Home hitting against road hitting', subtitle: 'Above the line: better on the road. Below: better at home. All 30 clubs, wOBA on every plate appearance.' } },
]
export const TEMPLATE_GROUPS = [...new Set(TEMPLATES.map(t => t.group))]
