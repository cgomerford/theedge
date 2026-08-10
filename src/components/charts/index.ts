// src/components/charts/index.ts
//
// Barrel export for the chart primitives library. Everything imports from
// '@/components/charts' so we can move files around later without breaking
// consumers.

export { default as ActualVsExpectedChart } from './ActualVsExpectedChart'
export { default as AAAvsMLBOverlay } from './AAAvsMLBOverlay'
export { default as TrendOverlayChart } from './TrendOverlayChart'
export { default as SavantPercentileBar } from './SavantPercentileBar'
export { default as SplitBarChart } from './SplitBarChart'
export { default as RegressionDial, RegressionBadge } from './RegressionDial'

export type {
  RegressionRow,
  RegressionSignal,
  RollingPoint,
  RollingSeries,
  PercentileRow,
  SplitPair,
} from './types'

export { CHART_COLORS, CHART_FONTS } from './types'
