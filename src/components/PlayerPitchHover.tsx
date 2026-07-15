'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PitchLocationChart from './PitchLocationChart'
import type { PitchRecord } from '@/lib/series-pitches'

const DEBOUNCE_MS = 300
const cache = new Map<string, PitchRecord[]>() // module-level — persists across hovers in the same session, not re-fetched on repeat hover

export default function PlayerPitchHover({
  playerId, playerName, seriesStart, seriesEnd, children,
}: {
  playerId: number
  playerName: string
  seriesStart: string
  seriesEnd: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pitches, setPitches] = useState<PitchRecord[] | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cacheKey = `${playerId}-${seriesStart}-${seriesEnd}`

  function handleEnter(e: React.MouseEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    setPos({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 220) })

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setOpen(true)
      if (cache.has(cacheKey)) {
        setPitches(cache.get(cacheKey)!)
        return
      }
      setLoading(true)
      try {
        const res = await fetch(`/api/series-pitches?batterId=${playerId}&start=${seriesStart}&end=${seriesEnd}`)
        const json = await res.json()
        const rows: PitchRecord[] = json.pitches ?? []
        cache.set(cacheKey, rows)
        setPitches(rows)
      } catch {
        setPitches([])
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)
  }

  function handleLeave() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setOpen(false)
  }

  return (
    <span onMouseEnter={handleEnter} onMouseLeave={handleLeave} className="inline-block">
      {children}
      {open && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 200 }}
          className="bg-white border border-stone-200 rounded-xl shadow-lg p-3"
        >
          <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-2">{playerName} · this series</p>
          {loading ? (
            <p className="text-xs font-mono text-stone-400 py-8 text-center w-[180px]">Loading…</p>
          ) : (
            <PitchLocationChart pitches={pitches ?? []} />
          )}
        </div>,
        document.body
      )}
    </span>
  )
}