'use client'

// src/components/admin/AdminDataRoomSection.tsx
//
// Sits in the dashboard, takes the already-fetched `reads` list (no extra
// server work), and lazily fetches ONE game's Data Room bundle on selection
// via /api/admin/data-room/[gamePk]. Defaults to the top-ranked read.
//
// This mirrors the lazy-fetch API route pattern already used in Behind the
// Plate (/api/zone-arsenal, /api/batter-zones) — slow per-game fan-out
// stays off the server render entirely.

import { useEffect, useState } from 'react'
import DataRoomClient from './DataRoomClient'
import type { GamePregameInfo, TeamPregameStats, PlayerWatchItem } from '@/lib/pregame-stats'
import type { Take } from '@/lib/pregame-takes'

type ReadRow = { game_pk: number; matchup: string }
type Side = { stats: TeamPregameStats; watchlist: PlayerWatchItem[]; takes: Take[] }
type Bundle = { info: GamePregameInfo; home: Side; away: Side }

export default function AdminDataRoomSection({ reads }: { reads: ReadRow[] }) {
  const [gamePk, setGamePk] = useState<number | null>(reads[0]?.game_pk ?? null)
  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gamePk) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setBundle(null)

    fetch(`/api/admin/data-room/${gamePk}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then((data: Bundle) => { if (!cancelled) setBundle(data) })
      .catch(() => { if (!cancelled) setError('Could not load the Data Room for this game.') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [gamePk])

  if (!reads.length) {
    return <div className="empty">No games on the slate to inspect yet.</div>
  }

  return (
    <div>
      <style>{`
        .droom-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
        .droom-tab{font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:.3px;background:#fff;border:1px solid #1A1A1A1a;color:#6b6b66;padding:6px 11px;cursor:pointer}
        .droom-tab.on{background:#1A1A1A;color:#FAF8F3;border-color:#1A1A1A}
      `}</style>

      <div className="droom-tabs">
        {reads.map((r) => (
          <button
            key={r.game_pk}
            className={`droom-tab${r.game_pk === gamePk ? ' on' : ''}`}
            onClick={() => setGamePk(r.game_pk)}
          >
            {r.matchup}
          </button>
        ))}
      </div>

      {loading && <div className="empty">Loading rolling stats from MLB Stats API…</div>}
      {error && <div className="empty">{error}</div>}
      {!loading && !error && bundle && (
        <DataRoomClient info={bundle.info} home={bundle.home} away={bundle.away} />
      )}
    </div>
  )
}