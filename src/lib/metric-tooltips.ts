import type { MetricKey } from './lab'

export const METRIC_TOOLTIPS: Partial<Record<MetricKey, string>> = {
  era: 'Earned Run Average — earned runs allowed per 9 innings. Lower is better.',
  fip: 'Fielding Independent Pitching — estimates ERA using only the outcomes a pitcher controls directly (K, BB, HR). Strips out defense and luck. Lower is better.',
  whip: 'Walks + Hits per Inning Pitched — baserunners allowed per inning. Lower is better.',
  k9: 'Strikeouts per 9 innings — a pure swing-and-miss rate. Higher is better.',
  ops: 'On-base Plus Slugging — gets on base and hits for power combined into one number. Higher is better.',
  slg: 'Slugging Percentage — total bases per at-bat. Rewards extra-base hits. Higher is better.',
  obp: 'On-base Percentage — how often a batter reaches base by any means. Higher is better.',
}