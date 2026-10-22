'use client'

import { useEffect, useState } from 'react'
import BatterH2H from '@/components/batting-lab/BatterH2H'
import { useBattingLabData } from '@/lib/batting-lab-context'
import type { BatterPitchLog } from '@/lib/batter-pitch-log'
import { MLB_TEAMS } from '@/lib/teams'

const SEASON = new Date().getFullYear()

export default function BattingH2HPage() {
  const { data, failed } = useBattingLabData()
  const [log, setLog] = useState<BatterPitchLog | null | 'error'>(null)

  useEffect(() => {
    if (!data) return
    let cancelled = false
    fetch(`/api/mlb/batter-pitch-log?batterId=${data.id}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setLog(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setLog('error') })
    return () => { cancelled = true }
  }, [data])

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this batter&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  const batterTeamId = MLB_TEAMS.find(t => t.abbrev === data.abbr)?.id ?? 0

  return <BatterH2H batterId={data.id} batterName={data.name} batterTeamId={batterTeamId} batterLog={log} />
}
