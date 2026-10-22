'use client'

import { useEffect, useState } from 'react'
import TrendsCharts from '@/components/pitching-lab/TrendsCharts'
import { usePitchingLabData } from '@/lib/pitching-lab-context'
import type { PitcherStartTrends } from '@/lib/pitcher-start-trends'

const SEASON = new Date().getFullYear()

export default function TrendsPage() {
  const { data, failed } = usePitchingLabData()
  const [trends, setTrends] = useState<PitcherStartTrends | null>(null)

  const playerId = data?.id ?? null

  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    fetch(`/api/mlb/start-trends?playerId=${playerId}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setTrends(json) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [playerId])

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this pitcher&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-1">Trends</p>
        <p className="text-[13px] text-[#57534E]">Is this the same pitcher as April? Real per-start data — official box score merged with a live Statcast pull.</p>
      </div>
      {trends ? <TrendsCharts trends={trends} /> : (
        <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Pulling every start this season…</div>
      )}
    </div>
  )
}
