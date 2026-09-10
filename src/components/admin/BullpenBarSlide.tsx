'use client'

// src/components/admin/BullpenBarsSlide.tsx
//
// Vertical per-reliever bars. Headshot on top, animated colored bar
// proportional to L3 pitch total, value inside the bar, name + L3 label.
// SP is excluded (filtered out via __isStarter).

import { useState, useEffect } from 'react'
import type { Last7DaysWorkload } from '@/lib/pitcher-workload'

const MAX_VISIBLE = 8
const BAR_HEIGHT_PX = 220

function headshotUrl(personId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${personId}/headshot/67/current`
}

function lastName(fullName: string): string {
  const parts = fullName.trim().split(' ')
  return parts.length > 1 ? parts[parts.length - 1] : fullName
}

/** Sum pitches over the most recent 3 dates in the workload window. */
function pitchesLast3(p: { byDate: Record<string, number> }, dates: string[]): number {
  const last3 = dates.slice(-3) // workload.dates is ascending (oldest → newest)
  return last3.reduce((sum, d) => sum + (p.byDate[d] ?? 0), 0)
}

export default function BullpenBarsSlide({
  workload,
  teamColor,
  excludePlayerIds = [],
  resetKey = 0,
}: {
  workload: Last7DaysWorkload | null | undefined
  teamColor: string
  /** Tonight's SP (and any other known starters) — never shown as bullpen */
  excludePlayerIds?: number[]
  /** Change this when the slide is shown again so bars re-animate */
  resetKey?: number | string
}) {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    setGrown(false)
    const id = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(id)
  }, [resetKey, workload])

 const exclude = new Set(excludePlayerIds.filter(Boolean))

  // Relievers only:
  //  1. drop tagged SP (__isStarter)
  //  2. drop explicit starter IDs (tonight's probable)
  //  3. drop anyone who had a single-day load ≥ 60 pitches
  //     (true rotation SPs; modern RPs almost never hit that)
  const dates = workload?.dates ?? []
  const relievers = (workload?.pitchers ?? [])
    .filter((p: any) => {
      if (p.__isStarter === true) return false
      if (exclude.has(p.playerId)) return false
      const maxDay = Math.max(0, ...Object.values(p.byDate ?? {}).map(Number))
      if (maxDay >= 60) return false // SP outing in the window
      return true
    })
    .map(p => ({
      ...p,
      l3Pitches: pitchesLast3(p, dates),
    }))
    .sort((a, b) => b.l3Pitches - a.l3Pitches)
    .slice(0, MAX_VISIBLE)

  if (relievers.length === 0) {
    return (
      <p className="text-stone-400 font-mono text-xs italic px-1">
        No bullpen workload in the last 3 days.
      </p>
    )
  }

  const maxPitches = Math.max(...relievers.map(p => p.l3Pitches), 1)

  return (
    <div className="flex items-end justify-around gap-1 pt-4 pb-2 px-1 overflow-hidden">
      {relievers.map((p, i) => {
        const isRested = p.l3Pitches === 0
        const barPct = isRested ? 0.04 : Math.max(0.1, p.l3Pitches / maxPitches)
        const filledHeight = Math.round(BAR_HEIGHT_PX * barPct)

        return (
          <div key={p.playerId} className="flex flex-col items-center flex-1 min-w-0">
            <img
              src={headshotUrl(p.playerId)}
              alt=""
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              style={{ width: 28, height: 28 }}
              className="rounded-full object-cover bg-stone-100 border border-stone-200 mb-1.5 flex-shrink-0"
            />

            <div
              className="relative w-full flex items-end justify-center rounded-sm overflow-hidden"
              style={{ height: BAR_HEIGHT_PX, background: 'rgba(0,0,0,0.06)' }}
            >
              <div
                className="relative w-full rounded-sm flex items-end justify-center"
                style={{
                  height: grown ? filledHeight : 0,
                  background: isRested ? 'rgba(0,0,0,0.08)' : (teamColor || '#FF5722'),
                  transition: `height 700ms cubic-bezier(.22,1,.36,1) ${i * 40}ms`,
                }}
              >
                {grown && filledHeight > 22 && (
                  <span
                    className="font-mono text-[11px] font-bold leading-none pb-1.5"
                    style={{ color: isRested ? '#A3A3A3' : '#fff' }}
                  >
                    {p.l3Pitches}
                  </span>
                )}
              </div>

              {grown && filledHeight <= 22 && (
                <span
                  className="absolute top-1 left-0 right-0 text-center font-mono text-[10px] font-bold"
                  style={{ color: '#A3A3A3' }}
                >
                  {p.l3Pitches}
                </span>
              )}
            </div>

            <p className="text-stone-900 font-mono text-[9px] font-semibold mt-1.5 text-center leading-tight truncate w-full">
              {lastName(p.playerName)}
            </p>
            <p className="font-mono text-[7px] uppercase tracking-wide text-stone-400">
              {isRested ? 'rested' : 'L3'}
            </p>
          </div>
        )
      })}
    </div>
  )
}