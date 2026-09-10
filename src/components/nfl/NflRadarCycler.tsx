// src/components/nfl/NflRadarCycler.tsx
//
// Auto-cycling radar for the Dashboard's QB ROOM / WR ROOM panels.
// Consumes QbRadarProfile or WrRadarProfile interchangeably -- both
// share the same { axes: { key, label, value, percentile, higherIsBetter }[] }
// shape (see getQbRadarProfile / getWrRadarProfile in src/lib/nfl/queries.ts),
// so this component doesn't need to know which sport it's showing.
//
// Cycles through up to 5 profiles on a timer, pauses on hover so a reader
// mid-look doesn't get cut off, and shows dot indicators (click to jump).
//
// Uses recharts -- same library PlayerRadarChart.tsx already uses
// elsewhere in the app, no new dependency.

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from 'recharts'

export type CyclerAxis = {
  key: string
  label: string
  value: number
  percentile: number
  higherIsBetter: boolean
  unit: '%' | 'yds' | ''
}

export type CyclerEntry = {
  name: string
  teamAbbr?: string
  volumeLabel?: string // e.g. "312 att" or "87 tgt" -- caller formats, this component doesn't guess units
  axes: CyclerAxis[]
}

const DEFAULT_INTERVAL_MS = 4500

function formatRaw(value: number, unit: '%' | 'yds' | ''): string {
  if (!Number.isFinite(value)) return '—'
  if (unit === '%') return `${value.toFixed(1)}%`
  if (unit === 'yds') return `${value.toFixed(1)} yds`
  return value.toFixed(2) // EPA-style rate stats -- small floats, 2 decimals reads better than 1
}

export default function NflRadarCycler({
  title,
  entries,
  accentColor = '#FF5722',
  intervalMs = DEFAULT_INTERVAL_MS,
}: {
  title: string
  entries: CyclerEntry[]
  accentColor?: string
  intervalMs?: number
}) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (paused || entries.length <= 1) return
    timerRef.current = setInterval(() => {
      setIndex(i => (i + 1) % entries.length)
    }, intervalMs)
    return clearTimer
  }, [paused, entries.length, intervalMs, clearTimer])

  // If the entries array changes (e.g. season swap) and the current index
  // is now out of range, snap back to 0 rather than rendering undefined.
  useEffect(() => {
    if (index >= entries.length) setIndex(0)
  }, [entries.length, index])

  if (entries.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 28, textAlign: 'center' }}>
        <div className="s" style={{ fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>
          Not enough qualified players yet this season.
        </div>
      </div>
    )
  }

  const current = entries[index]
    const chartData = current.axes.map(a => ({
    label: a.label,
    percentile: a.percentile,
    raw: a.value,
    unit: a.unit,
    key: a.key,
  }))

  return (
    <div
      style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 20 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <div className="m" style={{ fontSize: 10, fontWeight: 700, color: '#78716C', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {title}
        </div>
        <div className="m" style={{ fontSize: 9, color: '#A3A3A3', letterSpacing: '0.04em' }}>
          vs qualified field, {'\u2022'} percentile
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <div className="s" style={{ fontSize: 18, fontWeight: 700, color: '#1A1A1A' }}>{current.name}</div>
        {current.teamAbbr && (
          <div className="m" style={{ fontSize: 11, color: '#78716C' }}>{current.teamAbbr}</div>
        )}
        {current.volumeLabel && (
          <div className="m" style={{ fontSize: 11, color: '#A3A3A3', marginLeft: 'auto' }}>{current.volumeLabel}</div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={500}>
        <RadarChart data={chartData} outerRadius="70%">
          <PolarGrid stroke="rgba(26,26,26,0.1)" />
          <PolarAngleAxis dataKey="label" tick={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", fill: '#78716C' }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar dataKey="percentile" stroke={accentColor} fill={accentColor} fillOpacity={0.18} strokeWidth={2} />
           <Tooltip
            formatter={(value: unknown, _name: unknown, props: any) => {
              const raw = props?.payload?.raw
              const unit = props?.payload?.unit ?? ''
              return [`${value}th pctile (${formatRaw(raw, unit)})`, props?.payload?.label ?? '']
            }}
          />
        </RadarChart>
      </ResponsiveContainer>

      {entries.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 4 }}>
          {entries.map((e, i) => (
            <button
              key={e.name + i}
              onClick={() => setIndex(i)}
              aria-label={`Show ${e.name}`}
              style={{
                width: 6, height: 6, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer',
                background: i === index ? accentColor : 'rgba(26,26,26,0.15)',
                transition: 'background 0.15s',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}