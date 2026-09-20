'use client'

import { useEffect, useState } from 'react'
import HotZoneOverlay from '@/components/pitching-lab/HotZoneOverlay'
import { usePitchingLabData } from '@/lib/pitching-lab-context'

export default function OverlayPage() {
  const { data, failed } = usePitchingLabData()
  const [pitchHand, setPitchHand] = useState<'L' | 'R' | null>(null)

  const playerId = data?.id ?? null

  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    fetch(`/api/mlb/pitcher-bio?playerId=${playerId}`)
      .then(r => r.json())
      .then(json => { if (!cancelled && !json.error) setPitchHand(json.identity?.pitchHand ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [playerId])

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this pitcher&apos;s data right now.</div>
  if (data === null || playerId === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  return <HotZoneOverlay pitcherId={playerId} pitcherThrows={pitchHand} />
}
