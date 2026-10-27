'use client'

// src/app/mlb/lab/batting-lab/[playerId]/trends/page.tsx
//
// Batting Lab → Trends: the main trends plus a builder for your own (exit speed, launch angle, bat speed, whiffs, chase, xwOBA and more, by
// pitch type faced, pitcher hand, game or month, one to five seasons), in the same TrendLab the Pitching Lab uses. Needs an account (see the (pro) layout).

import TrendLab from '@/components/pitching-lab/TrendLab'
import { useBattingLabData } from '@/lib/batting-lab-context'

export default function BattingTrendsPage() {
  const { data, failed } = useBattingLabData()

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this batter&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  return <TrendLab id={data.id} role="batter" />
}
