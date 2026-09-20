'use client'

// src/components/pitching-lab/NextStartScouting.tsx
//
// "What's the plan for the next start?" — this pitcher's next CONFIRMED
// MLB start (real probable-pitcher schedule data; most starts aren't
// announced more than ~5 days out, so this is honestly empty a lot of the
// time rather than guessed at from a rotation pattern — see
// src/lib/pitcher-next-start.ts), then the opponent lineup:
//   confirmed  = official 9 from that game's boxscore battingOrder
//   projected  = last completed game's real starting 9, until the card drops
//
// For every batter in that lineup, real career (Statcast-era) numbers
// against THIS pitcher specifically, plus what pitches he's actually
// thrown that batter and how each one has done — same per-pitch log and
// AB/HIT event vocabulary as TopBattersFaced.tsx and SequenceExplorer.tsx.

import { useEffect, useMemo, useState } from 'react'
import { pitchColor } from '@/lib/mlb'
import type { PitcherPitchLog } from '@/lib/pitcher-pitch-log'
import LineupH2HShareCard, { type ShareLineupBatter } from '@/components/pitching-lab/LineupH2HShareCard'

const SEASON = new Date().getFullYear()
const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])
const AB_EVENTS = new Set([
  'single', 'double', 'triple', 'home_run',
  'strikeout', 'strikeout_double_play',
  'field_out', 'force_out', 'grounded_into_double_play',
  'double_play', 'triple_play', 'fielders_choice',
  'fielders_choice_out', 'other_out',
])
const TOTAL_BASES: Record<string, number> = { single: 1, double: 2, triple: 3, home_run: 4 }

type NextStart = { gamePk: number; date: string; opponentTeamId: number; opponentName: string; isHome: boolean }
type LineupBatter = { id: number; name: string; order: number }
type LineupSource = 'confirmed' | 'projected' | 'unavailable'

function mlbHeadshot(id: number | string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}
function fmtRate(v: number | null): string {
  return v == null ? '—' : v.toFixed(3).replace(/^0\./, '.')
}
function fmtDate(d: string): string {
  const dt = new Date(`${d}T12:00:00`)
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function NextStartScouting({ pitcherId, pitcherName, pitcherTeamId }: { pitcherId: number; pitcherName: string; pitcherTeamId: number }) {
  const [meta, setMeta] = useState<{
    nextStart: NextStart | null
    lineup: LineupBatter[]
    lineupAsOf: string | null
    lineupSource?: LineupSource
  } | null | 'error'>(null)
  const [careerLog, setCareerLog] = useState<PitcherPitchLog | null | 'error'>(null)
  const [showShare, setShowShare] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/next-start?playerId=${pitcherId}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setMeta(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setMeta('error') })
    return () => { cancelled = true }
  }, [pitcherId])

  useEffect(() => {
    if (!meta || meta === 'error' || !meta.nextStart) return
    let cancelled = false
    fetch(`/api/mlb/pitch-log?playerId=${pitcherId}&season=${SEASON}&range=career`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setCareerLog(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setCareerLog('error') })
    return () => { cancelled = true }
  }, [pitcherId, meta])

  const batterBreakdowns = useMemo(() => {
    if (!meta || meta === 'error' || !careerLog || careerLog === 'error') return null
    const out = new Map<number, {
      pitches: number; ab: number; h: number; hr: number; bb: number; k: number; hbp: number
      byType: Map<string, { count: number; ab: number; h: number; tb: number }>
    }>()
    for (const p of careerLog.pitches) {
      if (p.batterId == null || !meta.lineup.some(b => b.id === p.batterId)) continue
      if (!out.has(p.batterId)) out.set(p.batterId, { pitches: 0, ab: 0, h: 0, hr: 0, bb: 0, k: 0, hbp: 0, byType: new Map() })
      const b = out.get(p.batterId)!
      b.pitches++
      const r = p.result ?? ''
      if (AB_EVENTS.has(r)) { b.ab++; if (HIT_EVENTS.has(r)) b.h++; if (r === 'home_run') b.hr++ }
      if (r === 'strikeout' || r === 'strikeout_double_play') b.k++
      if (r === 'walk') b.bb++
      if (r === 'hit_by_pitch') b.hbp++

      if (!b.byType.has(p.pitchType)) b.byType.set(p.pitchType, { count: 0, ab: 0, h: 0, tb: 0 })
      const t = b.byType.get(p.pitchType)!
      t.count++
      if (AB_EVENTS.has(r)) {
        t.ab++
        if (HIT_EVENTS.has(r)) { t.h++; t.tb += TOTAL_BASES[r] ?? 0 }
      }
    }
    return out
  }, [meta, careerLog])

  const shareBatters = useMemo<ShareLineupBatter[]>(() => {
    if (!meta || meta === 'error' || !careerLog || careerLog === 'error' || !batterBreakdowns) return []
    return meta.lineup.map(batter => {
      const b = batterBreakdowns.get(batter.id)
      const topType = b ? [...b.byType.entries()].sort((a, c) => c[1].count - a[1].count)[0] : null
      return {
        id: batter.id, name: batter.name, order: batter.order,
        pitches: b?.pitches ?? 0, ab: b?.ab ?? 0, h: b?.h ?? 0, hr: b?.hr ?? 0, bb: b?.bb ?? 0, k: b?.k ?? 0,
        topPitch: topType ? careerLog.pitchNames[topType[0]] ?? topType[0] : null,
      }
    })
  }, [meta, careerLog, batterBreakdowns])

  if (meta === 'error') return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Couldn&apos;t load the next-start data right now.</div>
  if (meta === null) return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Checking the schedule…</div>

  if (!meta.nextStart) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-10 text-center">
        <p className="text-[12px] font-serif italic text-stone-400">No confirmed next start yet — MLB hasn&apos;t announced a probable pitcher for this team&apos;s upcoming games. Most teams only announce starters about 5 days out.</p>
      </div>
    )
  }

  const { nextStart, lineup, lineupAsOf, lineupSource } = meta
  const source: LineupSource = lineupSource ?? (lineup.length > 0 ? 'projected' : 'unavailable')
  const confirmed = source === 'confirmed'

  return (
    <div className="space-y-5">
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Next start</p>
            <p className="text-[15px] font-bold text-stone-900">{fmtDate(nextStart.date)} — {nextStart.isHome ? 'vs' : '@'} {nextStart.opponentName}</p>
          </div>
          {lineup.length > 0 && (
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <span
                className="font-mono text-[9px] uppercase tracking-widest font-bold px-2 py-1"
                style={confirmed
                  ? { background: 'rgba(21,128,61,0.12)', color: '#15803D' }
                  : { background: 'rgba(217,119,6,0.12)', color: '#D97706' }}
              >
                {confirmed ? 'Confirmed lineup' : 'Projected lineup'}
              </span>
              <button
                onClick={() => setShowShare(v => !v)}
                className="font-mono uppercase tracking-wider rounded-full border px-3 py-1.5 text-[10px] transition border-stone-200 text-stone-500 hover:border-[#FF5722] hover:text-[#FF5722]"
              >
                {showShare ? 'Hide share graphic' : 'Share this matchup ↗'}
              </button>
            </div>
          )}
        </div>
        <p className="text-[10px] font-mono text-stone-400 mt-1">
          {confirmed
            ? `Official ${nextStart.opponentName} batting order for this game — posted on the MLB boxscore.`
            : lineup.length > 0
              ? `Projected from ${nextStart.opponentName}'s last completed game (${lineupAsOf ? fmtDate(lineupAsOf) : 'recent'}). Switches to the confirmed 9 once MLB posts the card.`
              : `No recent completed game found yet to project a lineup from, and MLB hasn't posted tonight's card.`}
        </p>
      </div>

      {showShare && lineup.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-3">Shareable graphic</p>
          <LineupH2HShareCard
            pitcherId={pitcherId}
            pitcherName={pitcherName}
            pitcherTeamId={pitcherTeamId}
            opponentName={nextStart.opponentName}
            opponentTeamId={nextStart.opponentTeamId}
            startDate={fmtDate(nextStart.date)}
            lineupAsOf={lineupAsOf ? fmtDate(lineupAsOf) : null}
            lineupSource={source}
            isHome={nextStart.isHome}
            batters={shareBatters}
          />
        </div>
      )}

      {lineup.length > 0 && (
        <div className="space-y-3">
          {lineup.map(batter => {
            const b = batterBreakdowns?.get(batter.id)
            const types = b ? [...b.byType.entries()].sort((a, c) => c[1].count - a[1].count) : []
            return (
              <div key={batter.id} className="bg-white border border-stone-200 rounded-xl p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="w-5 text-[11px] font-mono text-stone-400 text-right shrink-0">{batter.order}</span>
                  <img src={mlbHeadshot(batter.id)} alt="" width={28} height={28} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                  <span className="text-[13px] font-bold text-stone-900">{batter.name}</span>
                  {!careerLog || careerLog === null ? (
                    <span className="ml-auto text-[11px] font-mono text-stone-300 italic">Loading matchup history…</span>
                  ) : b && b.pitches > 0 ? (
                    <span className="ml-auto text-[11px] font-mono text-stone-600">
                      {b.pitches} pitches · {b.ab}-AB, {b.h}-H, {b.hr}-HR, {b.bb}-BB, {b.k}-K · AVG <b className="text-stone-900">{fmtRate(b.ab > 0 ? b.h / b.ab : null)}</b>
                    </span>
                  ) : (
                    <span className="ml-auto text-[11px] font-mono text-stone-400 italic">Never faced (Statcast era)</span>
                  )}
                </div>
                {types.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 pl-8">
                    {types.map(([pt, t]) => (
                      <span key={pt} className="inline-flex items-center gap-1.5 text-[10px] font-mono bg-stone-50 border border-stone-100 rounded-full px-2.5 py-1">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: pitchColor(pt) }} />
                        <span className="font-bold text-stone-800">{careerLog && careerLog !== 'error' ? careerLog.pitchNames[pt] ?? pt : pt}</span>
                        <span className="text-stone-400">n={t.count}</span>
                        {t.ab > 0 && <span className="text-stone-500">· {t.h}-for-{t.ab} ({fmtRate(t.h / t.ab)})</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
