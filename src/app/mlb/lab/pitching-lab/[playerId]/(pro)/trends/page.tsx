'use client'

// src/app/mlb/lab/pitching-lab/[playerId]/trends/page.tsx
//
// Pitching Lab → Trends: the main trends plus a builder for your own (signed-in and Pro viewers; the tab is behind the account gate), in TrendLab.
// (The older start-by-start run prevention charts, TrendsCharts.tsx and /api/mlb/start-trends, are no longer used here.)

import TrendLab from '@/components/pitching-lab/TrendLab'
import { usePitchingLabData } from '@/lib/pitching-lab-context'

export default function TrendsPage() {
  const { data, failed } = usePitchingLabData()

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this pitcher&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  return <TrendLab pitcherId={data.id} />
}
