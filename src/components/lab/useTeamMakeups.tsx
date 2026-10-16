'use client'

// Loads every club's make-up from /api/admin/lab/team-makeup, 3 at a time, so
// pages fill in as clubs arrive (cached clubs are instant; a cold one takes
// ~10-30 s). Shared by the make-up page and the chart builder.

import { useEffect, useRef, useState } from 'react'
import { MLB_TEAMS } from '@/lib/teams'
import { loadTeamMakeup } from '@/lib/lab/load-team-makeup.server-fetch-allowed'
import type { TeamMakeup } from '@/lib/lab/team-pitch-makeup.server-fetch-allowed'

const CONCURRENCY = 3

export function useTeamMakeups(season: number) {
  const [loaded, setLoaded] = useState<Record<number, TeamMakeup>>({})
  const [failed, setFailed] = useState<number[]>([])
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return           // React strict mode double-invokes effects in dev
    started.current = true
    const queue = MLB_TEAMS.map(t => t.id)
    const worker = async () => {
      for (let id = queue.shift(); id != null; id = queue.shift()) {
        let ok = false
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {    // a cold club can time out once; the retry usually lands (the pull is then partly warm)
          try {
            const data = await loadTeamMakeup(id, season)
            setLoaded(prev => ({ ...prev, [id]: data }))
            ok = true
          } catch (e) {
            if (attempt === 1) {
              console.error('[useTeamMakeups] club failed', id, e)
              setFailed(prev => [...prev, id])
            }
          }
        }
      }
    }
    for (let i = 0; i < CONCURRENCY; i++) void worker()
  }, [season])

  return { loaded, failed, done: Object.keys(loaded).length, total: MLB_TEAMS.length }
}

export function LoadBar({ done, total, failed, season }: { done: number; total: number; failed: number; season: number }) {
  return (
    <div style={{ margin: '14px 0 0', maxWidth: 520 }}>
      <div style={{ fontFamily: 'var(--font-outfit), system-ui, sans-serif', fontSize: 10, color: '#a89e8c', marginBottom: 4 }}>
        {season} regular season · {done} of {total} clubs loaded{failed ? ` · ${failed} failed (see console)` : ''}
        {done + failed < total ? ' · first load pulls from Savant, repeat loads are cached' : ''}
      </div>
      <div style={{ height: 4, background: '#f1eee6', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${(done / total) * 100}%`, background: '#FF5722', borderRadius: 2, transition: 'width .3s' }} />
      </div>
    </div>
  )
}
