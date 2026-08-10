'use client'

// src/components/GameInfoStrip.tsx
//
// Small strip of contextual game facts: venue, weather, start/end time,
// attendance. Sits below the score header in PostGameReportTab. Any
// field that came back null (see the data-source note in lib/postgame.ts
// -> parseGameInfo) is just omitted rather than shown as a broken "—" —
// a thin strip of 2 facts looks intentional, a thin strip padded with
// dashes looks broken.

import type { GameInfo } from '@/lib/postgame'

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center px-3">
      <span className="font-mono text-[8px] uppercase tracking-widest text-stone-400">{label}</span>
      <span className="font-mono text-[11px] text-stone-700 mt-0.5">{value}</span>
    </div>
  )
}

export default function GameInfoStrip({ info }: { info: GameInfo }) {
  const facts: { label: string; value: string }[] = []

  // Timing first (first pitch → last pitch → duration / delays)
  if (info.startTime) facts.push({ label: 'First pitch', value: info.startTime })
  if (info.endTime) facts.push({ label: 'Last pitch', value: info.endTime })

  if (info.durationMinutes != null) {
    const h = Math.floor(info.durationMinutes / 60)
    const m = info.durationMinutes % 60
    facts.push({ label: 'Duration', value: `${h}h ${m}m` })
  }

  // Optional richer duration breakdown if your GameInfo / parseGameInfo
  // exposes these (common MLB Stats API fields):
  // if (info.gameDurationMinutes != null) { ... }          // pure game time
  // if (info.delayDurationMinutes != null && info.delayDurationMinutes > 0) {
  //   facts.push({ label: 'Delays', value: `${info.delayDurationMinutes}m` })
  // }
  // if (info.totalMinutes != null) { ... }                 // wall-clock total

  // Everything else
  if (info.venue) facts.push({ label: 'Venue', value: info.venue })
  if (info.weatherCondition || info.tempF != null) {
    const weatherStr = [info.tempF != null ? `${info.tempF}°F` : null, info.weatherCondition]
      .filter(Boolean)
      .join(', ')
    facts.push({ label: 'Weather', value: weatherStr })
  }
  if (info.wind) facts.push({ label: 'Wind', value: info.wind })
  if (info.attendance != null) {
    facts.push({ label: 'Attendance', value: info.attendance.toLocaleString() })
  }

  if (facts.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-stone-200 px-3 py-3 flex flex-wrap items-center justify-center gap-x-1 gap-y-3">
      {facts.map(f => (
        <Fact key={f.label} label={f.label} value={f.value} />
      ))}
    </div>
  )
}