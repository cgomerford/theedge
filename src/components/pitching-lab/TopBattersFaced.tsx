'use client'

// src/components/pitching-lab/TopBattersFaced.tsx
//
// H2H vs the batters this pitcher has actually faced most — real per-batter
// AB/H/HR/BB/K/AVG, computed from the same raw per-pitch log used elsewhere
// (src/lib/pitcher-pitch-log.ts: real events per batter id, batter names +
// real MLB `active` roster flag already resolved via the same bulk MLB
// lookup that log already does). No new data source.
//
// Three real scopes, toggled: "This season" (current-year pitch log, as
// before), and two Statcast-era career views (2015-present, the real floor
// of pitch-level tracking) split by the batter's real current MLB `active`
// flag — active opponents (who this pitcher might actually face again) vs
// retired/inactive ones. Career pulls are fetched lazily, once, the first
// time either career scope is selected.

import { useEffect, useMemo, useState } from 'react'
import type { PitcherPitchLog } from '@/lib/pitcher-pitch-log'

const SEASON = new Date().getFullYear()
const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])
// Same AB vocabulary as the rest of this codebase's zone-aggregation
// scripts (fetch_pitcher_hot_zones.py) — walks/HBP/sac plays don't count.
const AB_EVENTS = new Set([
  'single', 'double', 'triple', 'home_run',
  'strikeout', 'strikeout_double_play',
  'field_out', 'force_out', 'grounded_into_double_play',
  'double_play', 'triple_play', 'fielders_choice',
  'fielders_choice_out', 'other_out',
])

type Scope = 'active' | 'inactive' | 'current'
const SCOPES: { key: Scope; label: string }[] = [
  { key: 'active', label: 'All-time · Active' },
  { key: 'inactive', label: 'All-time · Retired' },
  { key: 'current', label: 'This season' },
]

function mlbHeadshot(id: number | string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}

export default function TopBattersFaced({ pitcherId }: { pitcherId: number }) {
  const [seasonLog, setSeasonLog] = useState<PitcherPitchLog | null | 'error'>(null)
  const [careerLog, setCareerLog] = useState<PitcherPitchLog | null | 'error'>(null)
  const [scope, setScope] = useState<Scope>('active')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/pitch-log?playerId=${pitcherId}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setSeasonLog(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setSeasonLog('error') })
    return () => { cancelled = true }
  }, [pitcherId])

  // Career log is heavy (Statcast-era, every season this pitcher's
  // thrown) — only pulled once, lazily, the first time it's needed.
  useEffect(() => {
    if (scope === 'current' || careerLog !== null) return
    let cancelled = false
    fetch(`/api/mlb/pitch-log?playerId=${pitcherId}&season=${SEASON}&range=career`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setCareerLog(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setCareerLog('error') })
    return () => { cancelled = true }
  }, [scope, pitcherId, careerLog])

  const activeLog = scope === 'current' ? seasonLog : careerLog

  const rows = useMemo(() => {
    if (!activeLog || activeLog === 'error') return []
    const byBatter = new Map<number, { pitches: number; ab: number; h: number; hr: number; bb: number; k: number; hbp: number }>()
    for (const p of activeLog.pitches) {
      if (p.batterId == null) continue
      if (!byBatter.has(p.batterId)) byBatter.set(p.batterId, { pitches: 0, ab: 0, h: 0, hr: 0, bb: 0, k: 0, hbp: 0 })
      const b = byBatter.get(p.batterId)!
      b.pitches++
      const r = p.result ?? ''
      if (AB_EVENTS.has(r)) { b.ab++; if (HIT_EVENTS.has(r)) b.h++; if (r === 'home_run') b.hr++ }
      if (r === 'strikeout' || r === 'strikeout_double_play') b.k++
      if (r === 'walk') b.bb++
      if (r === 'hit_by_pitch') b.hbp++
    }
    let list = [...byBatter.entries()].map(([id, b]) => ({
      id, name: activeLog.batterNames[id] ?? `#${id}`,
      pitches: b.pitches, ab: b.ab, h: b.h, hr: b.hr, bb: b.bb, k: b.k, hbp: b.hbp,
      avg: b.ab > 0 ? b.h / b.ab : null,
      pa: b.ab + b.bb + b.hbp,
    }))
    if (scope !== 'current') {
      const wantActive = scope === 'active'
      list = list.filter(r => (activeLog.batterActive[r.id] === true) === wantActive)
    }
    return list.sort((a, b) => b.pitches - a.pitches).slice(0, 10)
  }, [activeLog, scope])

  const subtitle = scope === 'current'
    ? 'this season'
    : scope === 'active'
      ? 'Statcast era (2015–present), active MLB players only'
      : 'Statcast era (2015–present), retired/inactive players'

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold">H2H — most-faced batters</p>
        <div className="flex gap-1">
          {SCOPES.map(s => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={`font-mono rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-wide transition ${scope === s.key ? 'border-[#FF5722] text-[#FF5722] bg-orange-50 font-bold' : 'border-stone-200 text-stone-400 hover:border-stone-300'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[10px] font-mono text-stone-400 mb-4">Real per-batter line, {subtitle}, ranked by pitches seen.</p>

      {activeLog === 'error' ? (
        <p className="text-center text-[12px] text-stone-400 py-8">Couldn&apos;t load this scope right now.</p>
      ) : activeLog === null ? (
        <p className="text-center text-[12px] text-stone-400 py-8">{scope === 'current' ? 'Loading most-faced batters…' : 'Pulling the full Statcast-era career log…'}</p>
      ) : rows.length === 0 ? (
        <p className="text-center text-[12px] font-serif italic text-stone-400 py-8">No real matches for this scope yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="text-stone-400 uppercase text-[9px] tracking-wider">
                <th className="text-left px-2 py-1.5">Batter</th>
                <th className="text-right px-2 py-1.5">PA</th>
                <th className="text-right px-2 py-1.5">AB</th>
                <th className="text-right px-2 py-1.5">H</th>
                <th className="text-right px-2 py-1.5">HR</th>
                <th className="text-right px-2 py-1.5">BB</th>
                <th className="text-right px-2 py-1.5">K</th>
                <th className="text-right px-2 py-1.5">AVG</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-stone-50">
                  <td className="px-2 py-1.5 text-stone-800 font-semibold whitespace-nowrap flex items-center gap-2">
                    <img src={mlbHeadshot(r.id)} alt="" width={20} height={20} style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
                    {r.name}
                  </td>
                  <td className="px-2 py-1.5 text-right text-stone-600">{r.pa}</td>
                  <td className="px-2 py-1.5 text-right text-stone-600">{r.ab}</td>
                  <td className="px-2 py-1.5 text-right text-stone-600">{r.h}</td>
                  <td className="px-2 py-1.5 text-right text-stone-600">{r.hr}</td>
                  <td className="px-2 py-1.5 text-right text-stone-600">{r.bb}</td>
                  <td className="px-2 py-1.5 text-right text-stone-600">{r.k}</td>
                  <td className="px-2 py-1.5 text-right font-bold text-stone-900">{r.avg != null ? r.avg.toFixed(3).replace(/^0/, '') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
