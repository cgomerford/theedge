// src/components/dashboard/PlayerCompareView.tsx
'use client'

// Player vs Player compare mode for the Dashboard (/lab). Replaces the old
// single-player "Customise Graphs" panel in LabDashboard.tsx — same search
// pattern (debounced hit against /api/lab/search) but now supports a
// second player and feeds PlayerRadarChart + HotZoneGrid + a fixed
// (marker-dot, non-smoothed) rolling line chart.
//
// Reuses /api/lab/rolling as-is for the trend line. Adds one new endpoint,
// /api/dashboard/compare-profile, for the radar + hot-zone data.
//
// Deliberately self-contained: doesn't import anything unexported from
// LabDashboard.tsx, so it can be dropped in without knowing that file's
// full internals.

import { useState, useEffect, useCallback } from 'react'
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import PlayerRadarChart from './PlayerRadarChart'
import HotZoneGrid from './HotZoneGrid'
import type { PlayerCompareProfile, SubjectType } from '@/lib/playerCompare'

type Person = { id: number; fullName: string; primaryPosition: string }
type RollingPoint = { date: string; opponent: string; value: number | null }

const BATTER_METRICS: { key: string; label: string; format: (v: number) => string }[] = [
  { key: 'ops', label: 'OPS', format: v => v.toFixed(3) },
  { key: 'slg', label: 'SLG', format: v => v.toFixed(3) },
  { key: 'obp', label: 'OBP', format: v => v.toFixed(3) },
]

const PITCHER_METRICS: { key: string; label: string; format: (v: number) => string }[] = [
  { key: 'era', label: 'ERA', format: v => v.toFixed(2) },
  { key: 'fip', label: 'FIP', format: v => v.toFixed(2) },
  { key: 'whip', label: 'WHIP', format: v => v.toFixed(2) },
  { key: 'k9', label: 'K/9', format: v => v.toFixed(1) },
]

function inferSubjectType(primaryPosition: string): SubjectType {
  return primaryPosition === 'P' ? 'pitcher' : 'batter'
}

// ── One player's search + card ──────────────────────────────────────────
function PlayerSlot({
  label,
  color,
  person,
  profile,
  loading,
  error,
  onPick,
  onClear,
}: {
  label: string
  color: string
  person: Person | null
  profile: PlayerCompareProfile | null
  loading: boolean
  error: string | null
  onPick: (p: Person) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Person[]>([])

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/lab/search?q=${encodeURIComponent(query)}`)
      const json = await res.json()
      setResults(json.people ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  if (!person) {
    return (
      <div className="border border-stone-200 bg-white p-4 min-h-[120px]">
        <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color }}>{label}</div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search a player…"
          className="w-full border border-stone-200 px-3 py-2 text-sm font-serif focus:outline-none focus:border-stone-400"
        />
        {results.length > 0 && (
          <div className="mt-1 border border-stone-200 bg-white divide-y divide-stone-50 max-h-48 overflow-y-auto">
            {results.map(p => (
              <button
                key={p.id}
                onClick={() => { onPick(p); setQuery(''); setResults([]) }}
                className="w-full text-left px-3 py-2 text-sm font-serif hover:bg-stone-50 flex justify-between"
              >
                <span>{p.fullName}</span>
                <span className="text-[9px] font-mono text-stone-400 uppercase">{p.primaryPosition}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color }}>{label}</div>
        <button onClick={onClear} className="text-[10px] font-mono text-stone-400 hover:text-stone-900">✕ change</button>
      </div>
      <div className="mb-3">
        <div className="font-serif text-lg font-bold text-stone-900 leading-tight">{person.fullName}</div>
        {profile && <div className="text-[10px] font-mono text-stone-400">{profile.team ?? '—'} · {profile.position ?? '—'}</div>}
      </div>

      {loading && <div className="text-xs font-mono text-stone-400 py-4">Loading…</div>}
      {error && <div className="text-xs font-mono text-red-500 py-4">{error}</div>}

      {profile && (
        <div className="grid grid-cols-3 gap-2">
          {profile.seasonLine.map(s => (
            <div key={s.label} className="border border-stone-100 px-2 py-1.5 text-center">
              <div className="text-[8px] font-mono uppercase tracking-wider text-stone-400">{s.label}</div>
              <div className="text-sm font-mono font-bold text-stone-900">{s.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Rolling chart, fixed to show real markers (no smoothing) ────────────
function CompareChartCard({ label, points, format, color }: {
  label: string; points: RollingPoint[]; format: (v: number) => string; color: string
}) {
  return (
    <div className="border border-stone-200 bg-white p-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">Rolling {label}</div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={points}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e2d6" />
          <XAxis dataKey="date" tick={{ fontSize: 9, fontFamily: 'monospace' }} />
          <YAxis tick={{ fontSize: 9, fontFamily: 'monospace' }} domain={['auto', 'auto']} />
          <Tooltip
            formatter={(v) => (typeof v === 'number' ? format(v) : String(v ?? ''))}
            labelFormatter={(lbl, payload) => `${lbl} vs ${payload?.[0]?.payload?.opponent ?? ''}`}
          />
          {/* type="linear" + visible dots — no smoothing, real points marked */}
          <Line type="linear" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────
export default function PlayerCompareView() {
  const [personA, setPersonA] = useState<Person | null>(null)
  const [personB, setPersonB] = useState<Person | null>(null)
  const [profileA, setProfileA] = useState<PlayerCompareProfile | null>(null)
  const [profileB, setProfileB] = useState<PlayerCompareProfile | null>(null)
  const [loadingA, setLoadingA] = useState(false)
  const [loadingB, setLoadingB] = useState(false)
  const [errorA, setErrorA] = useState<string | null>(null)
  const [errorB, setErrorB] = useState<string | null>(null)
  const [rollingA, setRollingA] = useState<Record<string, RollingPoint[]>>({})
  const [rollingB, setRollingB] = useState<Record<string, RollingPoint[]>>({})

  const loadProfile = useCallback(async (
    person: Person,
    setProfile: (p: PlayerCompareProfile | null) => void,
    setLoading: (b: boolean) => void,
    setError: (e: string | null) => void,
    setRolling: (r: Record<string, RollingPoint[]>) => void,
  ) => {
    setLoading(true); setError(null)
    try {
      const subjectType = inferSubjectType(person.primaryPosition)
      const res = await fetch(`/api/dashboard/compare-profile?id=${person.id}&subjectType=${subjectType}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || json.error || 'Request failed')
      setProfile(json.profile)

      const metrics = subjectType === 'pitcher' ? PITCHER_METRICS : BATTER_METRICS
      const entries = await Promise.all(metrics.map(async m => {
        const r = await fetch(`/api/lab/rolling?subjectType=${subjectType}&id=${person.id}&metric=${m.key}&window=10`)
        const j = await r.json()
        return [m.key, j.points ?? []] as const
      }))
      setRolling(Object.fromEntries(entries))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load that player — try again.")
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (personA) loadProfile(personA, setProfileA, setLoadingA, setErrorA, setRollingA) }, [personA, loadProfile])
  useEffect(() => { if (personB) loadProfile(personB, setProfileB, setLoadingB, setErrorB, setRollingB) }, [personB, loadProfile])

  const sameType = profileA && profileB && profileA.subjectType === profileB.subjectType
  const metrics = profileA?.subjectType === 'pitcher' ? PITCHER_METRICS : BATTER_METRICS

  return (
    <div className="space-y-6">
      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">
        ⊕ Compare — search two players, batter-vs-batter or pitcher-vs-pitcher
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <PlayerSlot label="Player A" color="#FF5722" person={personA} profile={profileA} loading={loadingA} error={errorA}
          onPick={setPersonA} onClear={() => { setPersonA(null); setProfileA(null); setRollingA({}) }} />
        <PlayerSlot label="Player B" color="#1A1A1A" person={personB} profile={profileB} loading={loadingB} error={errorB}
          onPick={setPersonB} onClear={() => { setPersonB(null); setProfileB(null); setRollingB({}) }} />
      </div>

      {profileA && profileB && !sameType && (
        <div className="border border-stone-200 bg-stone-50 p-4 text-xs font-serif italic text-stone-500 text-center">
          Radar and hot zones compare like-for-like — pick two batters or two pitchers to overlay them. Season lines above still work either way.
        </div>
      )}

      {profileA && (
        <PlayerRadarChart
          playerA={{ name: profileA.name, radar: profileA.radar }}
          playerB={sameType && profileB ? { name: profileB.name, radar: profileB.radar } : undefined}
        />
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {profileA && (
          <HotZoneGrid title={`${profileA.name} — Hot Zones`} cells={profileA.hotZones} note={profileA.hotZoneSampleNote} />
        )}
        {profileB && (
          <HotZoneGrid title={`${profileB.name} — Hot Zones`} cells={profileB.hotZones} note={profileB.hotZoneSampleNote} />
        )}
      </div>

      {profileA && (
        <div className="grid sm:grid-cols-2 gap-4">
          {metrics.map(m => {
            const pointsA = rollingA[m.key]
            if (!pointsA) return null
            return <CompareChartCard key={m.key} label={`${m.label} · ${profileA.name}`} points={pointsA} format={m.format} color="#FF5722" />
          })}
          {profileB && sameType && metrics.map(m => {
            const pointsB = rollingB[m.key]
            if (!pointsB) return null
            return <CompareChartCard key={`b-${m.key}`} label={`${m.label} · ${profileB.name}`} points={pointsB} format={m.format} color="#1A1A1A" />
          })}
        </div>
      )}
    </div>
  )
}