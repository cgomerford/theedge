// src/components/player/StatcastHistoryPanel.tsx
//
// Wraps PitchesSeenYearOnYear + BarrelsYearOnYear in ONE shared fetch to
// /api/player/statcast-history — confirmed ~20s cold-cache latency, so
// this fires client-side on mount, non-blocking, with a skeleton. Cached
// server-side after first view per player, so repeat visits are fast.

'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'

type SeasonStatcastRow = {
  season: number
  pitchesSeen: number
  battedBallEvents: number
  barrels: number
  barrelPct: number | null
  pitchTypeBreakdown: Record<string, number>
  isFinal: boolean
}

// Fixed palette so pitch-type colors stay stable across renders/seasons —
// not derived from data, same spirit as TEAM_COLORS being a static map.
const PITCH_COLORS: Record<string, string> = {
  FF: '#FF5722', SI: '#F97316', FC: '#EA580C', SL: '#2563EB', ST: '#3B82F6',
  SV: '#60A5FA', CU: '#059669', KC: '#10B981', CH: '#9333EA', FS: '#A855F7',
  KN: '#78716C', EP: '#A8A29E', FA: '#DC2626', CS: '#78716C',
}

function Skeleton({ label }: { label: string }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-4">{label}</p>
      <div className="h-52 flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          className="font-mono text-[10px] text-stone-300 uppercase tracking-widest"
        >
          Pulling season-by-season Statcast — first visit takes a moment…
        </motion.div>
      </div>
    </div>
  )
}

export default function StatcastHistoryPanel({
  playerId, subject, color,
}: {
  playerId: number
  subject: 'batter' | 'pitcher'
  color: string
}) {
  const [seasons, setSeasons] = useState<SeasonStatcastRow[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSeasons(null)
    setError(false)
    fetch(`/api/player/statcast-history/${playerId}?subject=${subject}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setSeasons(json.seasons ?? []) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [playerId, subject])

  if (subject === 'pitcher') {
    // Pitch-type breakdown makes sense for what a PITCHER throws, not what
    // a hitter sees — for pitchers this panel is arsenal-by-year instead.
    // Reusing the same fetch/shape; label just needs to be honest about
    // whose pitches these are.
  }

  const pitchTypesSeen = useMemoPitchTypes(seasons)

  return (
    <div className="grid md:grid-cols-2 gap-5">
      <AnimatePresence mode="wait">
        {seasons === null ? (
          <Skeleton key="skeleton-pitches" label={subject === 'pitcher' ? 'Arsenal · year on year' : 'Pitches seen · year on year'} />
        ) : error || seasons.length === 0 ? (
          <div key="empty-pitches" className="bg-white border border-stone-200 rounded-xl p-5">
            <p className="text-xs font-serif italic text-stone-400 text-center py-10">No Statcast history available yet.</p>
          </div>
        ) : (
          <motion.div
            key="chart-pitches"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="bg-white border border-stone-200 rounded-xl p-5"
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-1">
              {subject === 'pitcher' ? 'Arsenal · year on year' : 'Pitches seen · year on year'}
            </p>
            <p className="text-xs font-serif text-stone-400 italic mb-4">
              Pitch-type mix, {seasons[0]?.season}–{seasons[seasons.length - 1]?.season}
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={seasons.map(s => ({ season: s.season, ...s.pitchTypeBreakdown }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="season" tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} />
                <YAxis tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} width={36} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 9, fontFamily: 'monospace' }} />
                {pitchTypesSeen.map(pt => (
                  <Bar key={pt} dataKey={pt} stackId="pitches" fill={PITCH_COLORS[pt] ?? '#a8a29e'} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {seasons === null ? (
          <Skeleton key="skeleton-barrels" label="Barrels · year on year" />
        ) : error || seasons.length === 0 ? (
          <div key="empty-barrels" className="bg-white border border-stone-200 rounded-xl p-5">
            <p className="text-xs font-serif italic text-stone-400 text-center py-10">No barrel data available yet.</p>
          </div>
        ) : (
          <motion.div
            key="chart-barrels"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08 }}
            className="bg-white border border-stone-200 rounded-xl p-5"
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-1">Barrels · year on year</p>
            <p className="text-xs font-serif text-stone-400 italic mb-4">Barrel% of batted-ball events, by season</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={seasons.map(s => ({ season: s.season, barrelPct: s.barrelPct, barrels: s.barrels }))} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <XAxis dataKey="season" tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} />
                <YAxis tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} width={36} tickFormatter={v => `${v}%`} />
               <Tooltip formatter={(v: any, name: any): [string, string] => name === 'barrelPct' ? [`${v}%`, 'Barrel%'] : [`${v}`, 'Barrels']}/>
                <Line type="monotone" dataKey="barrelPct" stroke={color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function useMemoPitchTypes(seasons: SeasonStatcastRow[] | null): string[] {
  if (!seasons) return []
  const set = new Set<string>()
  for (const s of seasons) for (const pt of Object.keys(s.pitchTypeBreakdown)) set.add(pt)
  // Sort by total volume across all seasons so the stack order is
  // meaningful (most-thrown pitch at the bottom), not alphabetical noise.
  const totals: Record<string, number> = {}
  for (const s of seasons) for (const [pt, count] of Object.entries(s.pitchTypeBreakdown)) totals[pt] = (totals[pt] ?? 0) + count
  return Array.from(set).sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0))
}