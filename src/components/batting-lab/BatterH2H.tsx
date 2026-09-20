'use client'

// src/components/batting-lab/BatterH2H.tsx
//
// H2H, rebuilt around the batter's real team's next series: the real
// next scheduled series (consecutive real games vs the same opponent),
// real career H2H vs every real confirmed probable starter in it, real
// H2H vs every other real pitcher on the opponent's active roster who
// this batter has actually faced before, a "faced most" flag, and real
// career batting splits vs every opponent team he's ever faced. Manual
// pitcher search (the original v1 flow) stays available below as a
// secondary option for anyone not in the confirmed series.

import { useEffect, useMemo, useState } from 'react'
import { pitchColor } from '@/lib/mlb'
import { MLB_TEAMS } from '@/lib/teams'
import type { BatterPitchLog } from '@/lib/batter-pitch-log'
import type { NextSeries } from '@/lib/batter-next-series'
import type { BatterVsPitcher } from '@/lib/batter-stats'
import type { BatterTeamRecordRow } from '@/lib/batter-team-record'
import type { BatterVenueRecordRow } from '@/lib/batter-venue-record'
import BatterSeriesH2HShareCard, { type ShareSeriesStarter } from '@/components/batting-lab/BatterSeriesH2HShareCard'

const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])
const AB_EVENTS = new Set([
  'single', 'double', 'triple', 'home_run', 'strikeout', 'strikeout_double_play',
  'field_out', 'force_out', 'grounded_into_double_play', 'double_play', 'triple_play',
  'fielders_choice', 'fielders_choice_out', 'other_out',
])

type PlayerResult = { id: number; fullName: string; primaryPosition: string }
type PitcherVs = { id: number; name: string; vs: BatterVsPitcher | null }
type SeriesPayload = {
  series: NextSeries | null
  starters: PitcherVs[]
  bullpen: PitcherVs[]
  mostFaced: { id: number; name: string; ab: number } | null
}

function mlbHeadshot(id: number | string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}
function mlbTeamLogo(teamId: number): string {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`
}
function fmtRate(v: number | null): string {
  return v == null ? '—' : v.toFixed(3).replace(/^0\./, '.')
}
function fmtDate(d: string): string {
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function VsLine({ vs }: { vs: BatterVsPitcher | null }) {
  if (vs === null) return <p className="text-[10px] font-mono text-stone-400 italic">Loading real career H2H…</p>
  if (!vs.ab) return <p className="text-[10px] font-mono text-stone-400 italic">No real career at-bats on record.</p>
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono">
      <span className="text-stone-600">AB <b className="text-stone-900">{vs.ab}</b></span>
      <span className="text-stone-600">H <b className="text-stone-900">{vs.hits}</b></span>
      <span className="text-stone-600">HR <b className="text-stone-900">{vs.home_runs}</b></span>
      <span className="text-stone-600">BB <b className="text-stone-900">{vs.walks}</b></span>
      <span className="text-stone-600">K <b className="text-stone-900">{vs.strikeouts}</b></span>
      <span className="text-stone-600">AVG <b className="text-stone-900">{vs.avg}</b></span>
      <span className="text-stone-600">OPS <b className="text-stone-900">{vs.ops}</b></span>
    </div>
  )
}

function PitcherRow({ p, badge }: { p: PitcherVs; badge?: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-stone-50 last:border-0">
      <img src={mlbHeadshot(p.id)} alt="" width={32} height={32} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', background: '#F4F1EA' }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-bold text-stone-900">{p.name}</span>
          {badge && <span className="text-[8px] font-mono uppercase tracking-wide bg-[#FF5722] text-white rounded-full px-1.5 py-0.5">{badge}</span>}
        </div>
        <VsLine vs={p.vs} />
      </div>
    </div>
  )
}

export default function BatterH2H({ batterId, batterName, batterTeamId, batterLog }: { batterId: number; batterName: string; batterTeamId: number; batterLog: BatterPitchLog | null | 'error' }) {
  const [showSeriesShare, setShowSeriesShare] = useState(false)
  const [payload, setPayload] = useState<SeriesPayload | null | 'error'>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/batter-next-series?batterId=${batterId}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setPayload(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setPayload('error') })
    return () => { cancelled = true }
  }, [batterId])

  const [teamRange, setTeamRange] = useState<'season' | 'career'>('season')
  const [teamRowsState, setTeamRowsState] = useState<{ range: 'season' | 'career'; rows: BatterTeamRecordRow[] } | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/batter-team-record?playerId=${batterId}&range=${teamRange}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setTeamRowsState({ range: teamRange, rows: json.rows ?? [] }) })
      .catch(() => { if (!cancelled) setTeamRowsState({ range: teamRange, rows: [] }) })
    return () => { cancelled = true }
  }, [batterId, teamRange])
  const teamRows = teamRowsState?.range === teamRange ? teamRowsState.rows : null

  const [venueRange, setVenueRange] = useState<'season' | 'career'>('season')
  const [venueRowsState, setVenueRowsState] = useState<{ range: 'season' | 'career'; rows: BatterVenueRecordRow[] } | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/batter-venue-record?playerId=${batterId}&range=${venueRange}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setVenueRowsState({ range: venueRange, rows: json.rows ?? [] }) })
      .catch(() => { if (!cancelled) setVenueRowsState({ range: venueRange, rows: [] }) })
    return () => { cancelled = true }
  }, [batterId, venueRange])
  const venueRows = venueRowsState?.range === venueRange ? venueRowsState.rows : null

  // Manual search — secondary option, kept for anyone outside the
  // confirmed series (a division rival's ace not on this series, a
  // pitcher from a different team entirely, etc).
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerResult[]>([])
  const [pitcher, setPitcher] = useState<PlayerResult | null>(null)
  const [vs, setVs] = useState<BatterVsPitcher | null | 'error'>(null)

  useEffect(() => {
    const q = query.trim()
    if (!q) return
    const t = setTimeout(() => {
      fetch(`/api/lab/search?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(d => setResults((d.people ?? []).filter((p: PlayerResult) => p.primaryPosition === 'P').slice(0, 6)))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query])
  const visibleResults = query.trim().length > 0 && !pitcher ? results : []

  useEffect(() => {
    if (!pitcher) return
    let cancelled = false
    fetch(`/api/mlb/batter-vs-pitcher?batterId=${batterId}&pitcherId=${pitcher.id}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setVs(json ?? 'error') })
      .catch(() => { if (!cancelled) setVs('error') })
    return () => { cancelled = true }
  }, [batterId, pitcher])

  const pitchMix = useMemo(() => {
    if (!pitcher || !batterLog || batterLog === 'error') return []
    const byType = new Map<string, { count: number; ab: number; h: number; tb: number; hr: number; k: number; bb: number }>()
    for (const p of batterLog.pitches) {
      if (p.pitcherId !== pitcher.id) continue
      if (!byType.has(p.pitchType)) byType.set(p.pitchType, { count: 0, ab: 0, h: 0, tb: 0, hr: 0, k: 0, bb: 0 })
      const b = byType.get(p.pitchType)!
      b.count++
      const r = p.result ?? ''
      if (AB_EVENTS.has(r)) {
        b.ab++
        if (HIT_EVENTS.has(r)) { b.h++; b.tb += { single: 1, double: 2, triple: 3, home_run: 4 }[r] ?? 0; if (r === 'home_run') b.hr++ }
        if (r === 'strikeout' || r === 'strikeout_double_play') b.k++
      }
      if (r === 'walk') b.bb++
    }
    return [...byType.entries()]
      .map(([pt, b]) => ({ pitchType: pt, name: batterLog.pitchNames[pt] ?? pt, ...b, avg: b.ab > 0 ? b.h / b.ab : null, slg: b.ab > 0 ? b.tb / b.ab : null }))
      .sort((a, b) => b.count - a.count)
  }, [pitcher, batterLog])

  const teamById = (id: number | null) => id != null ? MLB_TEAMS.find(t => t.id === id) : undefined

  const shareStarters = useMemo<ShareSeriesStarter[]>(() => {
    if (!payload || payload === 'error' || !payload.series) return []
    const dateByPitcherId = new Map(payload.series.games.filter(g => g.probablePitcherId != null).map(g => [g.probablePitcherId as number, g.date]))
    return payload.starters.map(p => ({
      id: p.id, name: p.name,
      gameDate: dateByPitcherId.has(p.id) ? fmtDate(dateByPitcherId.get(p.id)!) : null,
      ab: p.vs?.ab ?? 0, hits: p.vs?.hits ?? 0, homeRuns: p.vs?.home_runs ?? 0, walks: p.vs?.walks ?? 0, strikeouts: p.vs?.strikeouts ?? 0,
      avg: p.vs?.avg ?? '—', ops: p.vs?.ops ?? '—',
      facedMost: payload.mostFaced?.id === p.id,
    }))
  }, [payload])

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-1">H2H</p>
        <p className="text-[13px] text-[#57534E]">His real next series — real confirmed starters, real bullpen arms he&apos;s actually faced, and his real career record vs every team.</p>
      </div>

      {payload === null && (
        <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Finding the real next series…</div>
      )}
      {payload === 'error' && (
        <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Couldn&apos;t load the next series right now.</div>
      )}

      {payload && payload !== 'error' && (
        <>
          {payload.series === null && (
            <div className="bg-white border border-stone-200 rounded-xl p-6 text-center text-[12px] font-serif italic text-stone-400">
              No real upcoming series found in the next 21 days on the official schedule.
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-5">
          {payload.series !== null && (
            <div className="bg-white border border-stone-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <img src={mlbTeamLogo(payload.series.opponentTeamId)} alt="" className="w-8 h-8 object-contain" />
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold">Next series</p>
                  <p className="text-[15px] font-black text-stone-900">vs {payload.series.opponentName}</p>
                </div>
                <span className="ml-auto text-[10px] font-mono text-stone-400">{payload.series.games.length} game{payload.series.games.length === 1 ? '' : 's'} · {fmtDate(payload.series.games[0].date)}{payload.series.games.length > 1 ? `–${fmtDate(payload.series.games[payload.series.games.length - 1].date)}` : ''}</span>
                {payload.starters.length > 0 && (
                  <button
                    onClick={() => setShowSeriesShare(v => !v)}
                    className="w-full font-mono uppercase tracking-wider rounded-full border px-3 py-1.5 text-[10px] transition border-stone-200 text-stone-500 hover:border-[#FF5722] hover:text-[#FF5722]"
                  >
                    {showSeriesShare ? 'Hide share graphic' : 'Share this matchup ↗'}
                  </button>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-x-6 mb-1">
                <p className="font-mono text-[10px] uppercase tracking-widest text-stone-500 mb-1 sm:col-span-2">Real confirmed starters</p>
              </div>
              {payload.starters.length === 0 ? (
                <p className="text-[12px] font-serif italic text-stone-400 py-3">No starters confirmed yet — most aren&apos;t announced more than ~5 days out.</p>
              ) : (
                <div>
                  {payload.starters.map(p => (
                    <PitcherRow key={p.id} p={p} badge={payload.mostFaced?.id === p.id ? `Faced most · ${payload.mostFaced.ab} AB` : undefined} />
                  ))}
                </div>
              )}
            </div>
          )}

          {payload.bullpen.length > 0 && (
            <div className="bg-white border border-stone-200 rounded-xl p-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Bullpen arms he&apos;s actually faced</p>
              <p className="text-[10px] font-mono text-stone-400 mb-3">Every other real pitcher on {payload.series?.opponentName}&apos;s active roster with real at-bats on record against him — sorted by real AB.</p>
              <div>
                {payload.bullpen.map(p => (
                  <PitcherRow key={p.id} p={p} badge={payload.mostFaced?.id === p.id ? `Faced most · ${payload.mostFaced.ab} AB` : undefined} />
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between flex-wrap gap-2 px-5 pt-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold">Real record vs each team</p>
              <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
                {(['season', 'career'] as const).map(rg => (
                  <button key={rg} onClick={() => setTeamRange(rg)} className={`font-mono uppercase tracking-wider rounded-md px-2.5 py-1 text-[10px] transition ${teamRange === rg ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>
                    {rg === 'season' ? 'This season' : 'Career'}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] font-mono text-stone-400 px-5 mt-1 mb-3">Real batting line by opponent, {teamRange === 'season' ? 'this season' : 'his real career'}.</p>
            {teamRows === null ? (
              <p className="text-center text-[12px] font-serif italic text-stone-400 py-6">Loading…</p>
            ) : teamRows.length === 0 ? (
              <p className="text-center text-[12px] font-serif italic text-stone-400 py-6">No real games on record yet.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] font-mono min-w-[600px]">
                    <thead>
                      <tr className="text-stone-400 uppercase text-[9px] tracking-wider">
                        <th className="text-left px-5 py-2">Opponent</th>
                        <th className="text-right px-2 py-2">G</th>
                        <th className="text-right px-2 py-2">AB</th>
                        <th className="text-right px-2 py-2">H</th>
                        <th className="text-right px-2 py-2">HR</th>
                        <th className="text-right px-2 py-2">BB</th>
                        <th className="text-right px-2 py-2">K</th>
                        <th className="text-right px-5 py-2">AVG / OPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamRows.map(r => {
                        const team = teamById(r.opponentId)
                        return (
                          <tr key={r.opponentId ?? r.opponent} className="border-t border-stone-50">
                            <td className="px-5 py-2 text-stone-800 font-semibold whitespace-nowrap">
                              <span className="flex items-center gap-2">
                                {r.opponentId != null && <img src={mlbTeamLogo(r.opponentId)} alt="" className="w-4 h-4 object-contain shrink-0" />}
                                {team ? `${team.abbrev} · ${team.name}` : r.opponent}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right text-stone-600">{r.games}</td>
                            <td className="px-2 py-2 text-right text-stone-600">{r.ab}</td>
                            <td className="px-2 py-2 text-right text-stone-600">{r.hits}</td>
                            <td className="px-2 py-2 text-right text-stone-600">{r.hr}</td>
                            <td className="px-2 py-2 text-right text-stone-600">{r.bb}</td>
                            <td className="px-2 py-2 text-right text-stone-600">{r.so}</td>
                            <td className="px-5 py-2 text-right font-bold text-stone-900">{r.avg} / {r.ops}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="h-4" />
              </>
            )}
          </div>

          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between flex-wrap gap-2 px-5 pt-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold">Real record by ballpark</p>
              <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
                {(['season', 'career'] as const).map(rg => (
                  <button key={rg} onClick={() => setVenueRange(rg)} className={`font-mono uppercase tracking-wider rounded-md px-2.5 py-1 text-[10px] transition ${venueRange === rg ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>
                    {rg === 'season' ? 'This season' : 'Career'}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] font-mono text-stone-400 px-5 mt-1 mb-3">Real batting line by real venue, {venueRange === 'season' ? 'this season' : 'his real career'}.</p>
            {venueRows === null ? (
              <p className="text-center text-[12px] font-serif italic text-stone-400 py-6">Loading…</p>
            ) : venueRows.length === 0 ? (
              <p className="text-center text-[12px] font-serif italic text-stone-400 py-6">No real games on record yet.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] font-mono min-w-[600px]">
                    <thead>
                      <tr className="text-stone-400 uppercase text-[9px] tracking-wider">
                        <th className="text-left px-5 py-2">Ballpark</th>
                        <th className="text-right px-2 py-2">G</th>
                        <th className="text-right px-2 py-2">AB</th>
                        <th className="text-right px-2 py-2">H</th>
                        <th className="text-right px-2 py-2">HR</th>
                        <th className="text-right px-2 py-2">BB</th>
                        <th className="text-right px-2 py-2">K</th>
                        <th className="text-right px-5 py-2">AVG / OPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {venueRows.map(r => (
                        <tr key={r.venueId ?? r.venue} className="border-t border-stone-50">
                          <td className="px-5 py-2 text-stone-800 font-semibold whitespace-nowrap">{r.venue}</td>
                          <td className="px-2 py-2 text-right text-stone-600">{r.games}</td>
                          <td className="px-2 py-2 text-right text-stone-600">{r.ab}</td>
                          <td className="px-2 py-2 text-right text-stone-600">{r.hits}</td>
                          <td className="px-2 py-2 text-right text-stone-600">{r.hr}</td>
                          <td className="px-2 py-2 text-right text-stone-600">{r.bb}</td>
                          <td className="px-2 py-2 text-right text-stone-600">{r.so}</td>
                          <td className="px-5 py-2 text-right font-bold text-stone-900">{r.avg} / {r.ops}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="h-4" />
              </>
            )}
          </div>
          </div>

          {showSeriesShare && payload.series !== null && payload.starters.length > 0 && (
            <div className="bg-white border border-stone-200 rounded-xl p-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-3">Shareable graphic</p>
              <BatterSeriesH2HShareCard
                batterId={batterId}
                batterName={batterName}
                batterTeamId={batterTeamId}
                opponentName={payload.series.opponentName}
                opponentTeamId={payload.series.opponentTeamId}
                seriesLabel={`${payload.series.games.length} game${payload.series.games.length === 1 ? '' : 's'} · ${fmtDate(payload.series.games[0].date)}${payload.series.games.length > 1 ? `-${fmtDate(payload.series.games[payload.series.games.length - 1].date)}` : ''}`}
                starters={shareStarters}
              />
            </div>
          )}
        </>
      )}

      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Search any other real pitcher</p>
        <p className="text-[10px] font-mono text-stone-400 mb-3">For anyone outside the confirmed next series.</p>
        <div className="relative max-w-sm">
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); if (pitcher) { setPitcher(null); setVs(null) } }}
            placeholder="Search any real MLB pitcher…"
            className="w-full text-[13px] bg-white border border-[#DEDACE] rounded-full px-4 py-2.5 outline-none focus:border-[#FF5722] transition"
          />
          {visibleResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg z-10 overflow-hidden">
              {visibleResults.map(p => (
                <button key={p.id} onClick={() => { setPitcher(p); setQuery(p.fullName); setResults([]) }} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-50">
                  <img src={mlbHeadshot(p.id)} alt="" width={22} height={22} style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                  <span className="text-[12px] font-semibold text-stone-800">{p.fullName}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {pitcher && (
          <div className="mt-4 flex items-center gap-2">
            <img src={mlbHeadshot(pitcher.id)} alt="" width={26} height={26} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
            <span className="text-[13px] font-bold text-stone-900">{pitcher.fullName}</span>
            <button onClick={() => { setPitcher(null); setQuery(''); setVs(null) }} className="text-[10px] font-mono text-stone-400 hover:text-stone-700 ml-2">✕ clear</button>
          </div>
        )}
      </div>

      {pitcher && (
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Career vs {pitcher.fullName}</p>
          <p className="text-[10px] font-mono text-stone-400 mb-4">Real career totals — MLB&apos;s own vsPlayerTotal stat, not scoped to this season.</p>
          {vs === null ? (
            <p className="text-[12px] font-serif italic text-stone-400">Loading…</p>
          ) : vs === 'error' || !vs.ab ? (
            <p className="text-[12px] font-serif italic text-stone-400">No real career at-bats on record vs this pitcher.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
              <div><div className="text-[9px] font-mono text-stone-400">AB</div><div className="text-[16px] font-black text-stone-900">{vs.ab}</div></div>
              <div><div className="text-[9px] font-mono text-stone-400">H</div><div className="text-[16px] font-black text-stone-900">{vs.hits}</div></div>
              <div><div className="text-[9px] font-mono text-stone-400">HR</div><div className="text-[16px] font-black text-stone-900">{vs.home_runs}</div></div>
              <div><div className="text-[9px] font-mono text-stone-400">BB</div><div className="text-[16px] font-black text-stone-900">{vs.walks}</div></div>
              <div><div className="text-[9px] font-mono text-stone-400">K</div><div className="text-[16px] font-black text-stone-900">{vs.strikeouts}</div></div>
              <div><div className="text-[9px] font-mono text-stone-400">AVG</div><div className="text-[16px] font-black text-stone-900">{vs.avg}</div></div>
              <div><div className="text-[9px] font-mono text-stone-400">OPS</div><div className="text-[16px] font-black text-stone-900">{vs.ops}</div></div>
            </div>
          )}
        </div>
      )}

      {pitcher && pitchMix.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold px-5 pt-5">This season&apos;s real pitch mix vs {pitcher.fullName}</p>
          <p className="text-[10px] font-mono text-stone-400 px-5 mt-1 mb-3">Real per-pitch-type breakdown, this season only (Statcast per-pitch data — the career line above is separate, MLB&apos;s own career stat).</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono min-w-[500px]">
              <thead>
                <tr className="text-stone-400 uppercase text-[9px] tracking-wider">
                  <th className="text-left px-5 py-2">Pitch</th>
                  <th className="text-right px-2 py-2">Seen</th>
                  <th className="text-right px-2 py-2">AB</th>
                  <th className="text-right px-2 py-2">H</th>
                  <th className="text-right px-2 py-2">HR</th>
                  <th className="text-right px-2 py-2">K</th>
                  <th className="text-right px-2 py-2">BB</th>
                  <th className="text-right px-5 py-2">AVG / SLG</th>
                </tr>
              </thead>
              <tbody>
                {pitchMix.map(r => (
                  <tr key={r.pitchType} className="border-t border-stone-50">
                    <td className="px-5 py-2 text-stone-800 font-semibold whitespace-nowrap flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: pitchColor(r.pitchType) }} />
                      {r.name}
                    </td>
                    <td className="px-2 py-2 text-right text-stone-600">{r.count}</td>
                    <td className="px-2 py-2 text-right text-stone-600">{r.ab}</td>
                    <td className="px-2 py-2 text-right text-stone-600">{r.h}</td>
                    <td className="px-2 py-2 text-right text-stone-600">{r.hr}</td>
                    <td className="px-2 py-2 text-right text-stone-600">{r.k}</td>
                    <td className="px-2 py-2 text-right text-stone-600">{r.bb}</td>
                    <td className="px-5 py-2 text-right font-bold text-stone-900">{fmtRate(r.avg)} / {fmtRate(r.slg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="h-4" />
        </div>
      )}
    </div>
  )
}
