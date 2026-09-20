'use client'

// src/components/batting-lab/ReactionWindow.tsx
//
// "How much time does a hitter actually have?" — real applied physics:
//   - Mound-to-plate distance: 60 feet 6 inches — official, fixed.
//   - Release extension: real Statcast field (release_extension) — how
//     many feet closer than the rubber the pitcher actually releases.
//   - time = (60.5 - extension) / velocity — real distance, real speed.
//
// Select a real pitcher and this pulls his REAL per-pitch-type average
// velocity and release extension (same raw log — src/lib/
// pitcher-pitch-log.ts — everything else in the Pitching Lab uses), not
// a generic slider guess. Savant also carries a second real field,
// `effective_speed` — its own "how it plays" number, accounting for
// extension — shown alongside as a disclosed cross-check, not silently
// substituted in, since this app can't independently verify its exact
// formula the way it can verify plain distance/speed.
//
// The ~150ms swing and ~200ms reaction figures are widely-cited
// sports-science averages, not a Statcast field — disclosed as such, not
// fabricated as real per-pitch data.
//
// The animation runs the real computed flight time in two real phases:
// release -> the real human-reaction-time mark (paused, with the real
// remaining distance shown), then reaction -> plate.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PitcherPitchLog } from '@/lib/pitcher-pitch-log'

const PLATE_DISTANCE_FT = 60.5
const DEFAULT_EXTENSION_FT = 6.3
const SWING_MS = 150
const REACTION_MS = 200
const PRESETS = [88, 92.5, 97.5, 103]
const SEASON = new Date().getFullYear()

type PlayerResult = { id: number; fullName: string; primaryPosition: string }
type PitchOption = { pitchType: string; name: string; avgVelo: number; avgExtension: number | null; avgEffectiveSpeed: number | null; count: number }

function mlbHeadshot(id: number | string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}
function ftPerSec(mph: number): number { return mph * (5280 / 3600) }
function computeWindow(veloMph: number, extensionFt: number) {
  const distanceFt = Math.max(0, PLATE_DISTANCE_FT - extensionFt)
  const flightMs = (distanceFt / ftPerSec(veloMph)) * 1000
  const decisionMs = Math.max(0, flightMs - SWING_MS - REACTION_MS)
  return { distanceFt, flightMs, decisionMs }
}

type Phase = 'idle' | 'toReaction' | 'paused' | 'toPlate' | 'done'

export default function ReactionWindow() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerResult[]>([])
  const [pitcher, setPitcher] = useState<PlayerResult | null>(null)
  const [log, setLog] = useState<PitcherPitchLog | null | 'error'>(null)
  const [pitchType, setPitchType] = useState<string | null>(null)

  const [manualVelo, setManualVelo] = useState(97.5)
  const [manualExtension, setManualExtension] = useState(DEFAULT_EXTENSION_FT)

  const [phase, setPhase] = useState<Phase>('idle')
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const q = query.trim()
    if (!q) return // visibleResults already hides stale results when query/pitcher makes them irrelevant
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
    if (!pitcher) return // effectiveLog derives null from pitcher below, no reset needed here
    let cancelled = false
    fetch(`/api/mlb/pitch-log?playerId=${pitcher.id}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setLog(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setLog('error') })
    return () => { cancelled = true }
  }, [pitcher])
  // Guards against showing a stale previous pitcher's pitch options while
  // the new fetch is still in flight (log.pitcherId won't match yet).
  const effectiveLog = !pitcher ? null : log === 'error' ? 'error' : log && log.pitcherId === pitcher.id ? log : null

  const pitchOptions = useMemo<PitchOption[]>(() => {
    if (!effectiveLog || effectiveLog === 'error') return []
    const byType = new Map<string, { velo: number[]; ext: number[]; eff: number[] }>()
    for (const p of effectiveLog.pitches) {
      if (!byType.has(p.pitchType)) byType.set(p.pitchType, { velo: [], ext: [], eff: [] })
      const b = byType.get(p.pitchType)!
      if (p.velo != null) b.velo.push(p.velo)
      if (p.extension != null) b.ext.push(p.extension)
      if (p.effectiveSpeed != null) b.eff.push(p.effectiveSpeed)
    }
    const avg = (a: number[]) => a.length > 0 ? a.reduce((s, v) => s + v, 0) / a.length : null
    return [...byType.entries()]
      .map(([pt, b]) => ({ pitchType: pt, name: effectiveLog.pitchNames[pt] ?? pt, avgVelo: avg(b.velo) ?? 0, avgExtension: avg(b.ext), avgEffectiveSpeed: avg(b.eff), count: b.velo.length }))
      .filter(p => p.avgVelo > 0)
      .sort((a, b) => b.count - a.count)
  }, [effectiveLog])

  // Derived, not stateful: falls back to the top real pitch type whenever
  // the current selection isn't (or is no longer) one of this pitcher's
  // real options, without an effect resetting state on every render.
  const effectivePitchType = pitchType && pitchOptions.some(p => p.pitchType === pitchType) ? pitchType : pitchOptions[0]?.pitchType ?? null

  const selectedPitch = pitchOptions.find(p => p.pitchType === effectivePitchType) ?? null
  const activeVelo = selectedPitch ? selectedPitch.avgVelo : manualVelo
  const activeExtension = selectedPitch ? (selectedPitch.avgExtension ?? DEFAULT_EXTENSION_FT) : manualExtension

  const { distanceFt, flightMs, decisionMs } = computeWindow(activeVelo, activeExtension)
  const reactionPct = Math.min(100, (REACTION_MS / flightMs) * 100)
  const decisionPct = Math.min(100, (decisionMs / flightMs) * 100)
  const swingPct = Math.max(0, 100 - reactionPct - decisionPct)
  const ballPct = phase === 'idle' ? 0 : phase === 'toReaction' || phase === 'paused' ? reactionPct : 100
  const ballDuration = phase === 'toReaction' ? REACTION_MS : phase === 'toPlate' ? Math.max(0, flightMs - REACTION_MS) : 0
  const remainingFt = distanceFt * (1 - reactionPct / 100)

  function play() {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setPhase('idle')
    const t0 = setTimeout(() => setPhase('toReaction'), 30)
    const t1 = setTimeout(() => setPhase('paused'), 30 + REACTION_MS)
    const t2 = setTimeout(() => setPhase('toPlate'), 30 + REACTION_MS + 700)
    const t3 = setTimeout(() => setPhase('done'), 30 + REACTION_MS + 700 + Math.max(0, flightMs - REACTION_MS))
    timers.current = [t0, t1, t2, t3]
  }
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">How much time does a hitter actually have?</p>
      <p className="text-[10px] font-mono text-stone-400 mb-4 max-w-2xl">
        Real physics: {PLATE_DISTANCE_FT}ft mound-to-plate (official, fixed), minus real release extension, divided by real velocity. Select a real pitcher for his real per-pitch-type numbers, or use the manual sliders. The ~{REACTION_MS}ms reaction and ~{SWING_MS}ms swing figures are widely-cited sports-science averages, not a Statcast field — disclosed, not fabricated.
      </p>

      <div className="relative max-w-sm mb-4">
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); if (pitcher) { setPitcher(null); setPitchType(null) } }}
          placeholder="Search any real MLB pitcher (optional)…"
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
        {pitcher && (
          <button onClick={() => { setPitcher(null); setQuery(''); setPitchType(null) }} className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-mono text-stone-400 hover:text-stone-700">✕</button>
        )}
      </div>

      {pitcher && log === null && <p className="text-[11px] font-serif italic text-stone-400 mb-4">Pulling {pitcher.fullName}&apos;s real pitch-by-pitch data…</p>}
      {pitcher && log === 'error' && <p className="text-[11px] font-serif italic text-stone-400 mb-4">Couldn&apos;t load real data for {pitcher.fullName} right now.</p>}

      {pitcher && pitchOptions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {pitchOptions.map(p => (
            <button
              key={p.pitchType}
              onClick={() => setPitchType(p.pitchType)}
              className={`font-mono rounded-full border px-3 py-1.5 text-[11px] transition ${effectivePitchType === p.pitchType ? 'border-[#FF5722] text-[#FF5722] bg-orange-50 font-bold' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
            >
              {p.name} <span className="text-stone-400">({p.avgVelo.toFixed(1)} mph)</span>
            </button>
          ))}
        </div>
      ) : !pitcher ? (
        <>
          <div className="flex flex-wrap gap-1.5 mb-5">
            {PRESETS.map(v => (
              <button
                key={v}
                onClick={() => setManualVelo(v)}
                className={`font-mono rounded-full border px-3 py-1.5 text-[11px] transition ${manualVelo === v ? 'border-[#FF5722] text-[#FF5722] bg-orange-50 font-bold' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
              >
                {v} mph
              </button>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-5 mb-5">
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <label className="text-[9px] font-mono uppercase tracking-widest text-stone-400">Pitch velocity (manual)</label>
                <span className="text-[13px] font-mono font-bold text-stone-900">{manualVelo.toFixed(1)} mph</span>
              </div>
              <input type="range" min={70} max={105} step={0.5} value={manualVelo} onChange={e => setManualVelo(Number(e.target.value))} className="w-full accent-[#FF5722]" />
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <label className="text-[9px] font-mono uppercase tracking-widest text-stone-400">Release extension (manual)</label>
                <span className="text-[13px] font-mono font-bold text-stone-900">{manualExtension.toFixed(1)} ft</span>
              </div>
              <input type="range" min={5} max={7.6} step={0.1} value={manualExtension} onChange={e => setManualExtension(Number(e.target.value))} className="w-full accent-[#FF5722]" />
            </div>
          </div>
        </>
      ) : null}

      {selectedPitch && (
        <p className="text-[9px] font-mono text-stone-400 mb-4">
          Real extension: {selectedPitch.avgExtension != null ? `${selectedPitch.avgExtension.toFixed(2)} ft` : '—'} · Savant&apos;s own effective speed (real, for reference): {selectedPitch.avgEffectiveSpeed != null ? `${selectedPitch.avgEffectiveSpeed.toFixed(1)} mph` : '—'}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">Real distance</div>
          <div className="text-[22px] font-black text-stone-900">{distanceFt.toFixed(1)}<span className="text-[12px] font-mono text-stone-400 ml-1">ft</span></div>
        </div>
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">Time to plate</div>
          <div className="text-[22px] font-black text-stone-900">{flightMs.toFixed(0)}<span className="text-[12px] font-mono text-stone-400 ml-1">ms</span></div>
        </div>
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">Left to actually decide</div>
          <div className="text-[22px] font-black" style={{ color: decisionMs < 50 ? '#DC2626' : decisionMs < 120 ? '#D97706' : '#059669' }}>
            {decisionMs.toFixed(0)}<span className="text-[12px] font-mono text-stone-400 ml-1">ms</span>
          </div>
        </div>
      </div>

      {/* Animation track */}
      <div className="mb-2">
        <div className="relative h-14 rounded-md bg-gradient-to-r from-stone-100 to-stone-50 border border-stone-200 overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-stone-400" title="Mound" />
          <div className="absolute right-0 top-0 bottom-0 w-[3px] bg-stone-700" title="Plate" />
          <div
            className="absolute top-1/2 w-4 h-4 rounded-full bg-[#FF5722] shadow"
            style={{
              left: `calc(${ballPct}% - 8px)`,
              transform: 'translateY(-50%)',
              transition: ballDuration > 0 ? `left ${ballDuration}ms linear` : 'none',
            }}
          />
          {(phase === 'paused' || phase === 'toPlate' || phase === 'done') && (
            <div className="absolute top-0 bottom-0" style={{ left: `${reactionPct}%` }}>
              <div className="w-px h-full bg-red-500/50" />
            </div>
          )}
        </div>
        <div className="flex justify-between text-[9px] font-mono text-stone-400 mt-1">
          <span>Mound (ball leaves the hand)</span>
          <span>Plate</span>
        </div>
      </div>

      <button
        onClick={play}
        className="font-mono text-[11px] uppercase tracking-widest border border-[#FF5722] text-[#FF5722] rounded-full px-4 py-2 hover:bg-orange-50 transition mb-4"
      >
        {phase === 'idle' || phase === 'done' ? '▶ Play' : '↻ Replaying…'}
      </button>

      {(phase === 'paused' || phase === 'toPlate' || phase === 'done') && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 mb-4">
          <p className="text-[12px] font-serif italic text-stone-700">
            At the real average human reaction time (~{REACTION_MS}ms), the ball is still <b>{remainingFt.toFixed(1)}ft</b> from the plate — everything after this point is swing mechanics, not new information.
          </p>
        </div>
      )}

      {/* Timeline bar */}
      <div className="mb-1 flex h-8 rounded-md overflow-hidden border border-stone-200">
        <div className="flex items-center justify-center text-[9px] font-mono font-bold text-white" style={{ width: `${reactionPct}%`, background: '#A8300F' }}>{reactionPct > 12 ? 'Reaction' : ''}</div>
        <div className="flex items-center justify-center text-[9px] font-mono font-bold text-white" style={{ width: `${decisionPct}%`, background: decisionMs < 50 ? '#DC2626' : '#D97706' }}>{decisionPct > 10 ? 'Decide' : ''}</div>
        <div className="flex items-center justify-center text-[9px] font-mono font-bold text-white" style={{ width: `${swingPct}%`, background: '#065F46' }}>{swingPct > 12 ? 'Swing' : ''}</div>
      </div>
      <div className="flex justify-between text-[9px] font-mono text-stone-400">
        <span>Ball leaves the hand</span>
        <span>Ball crosses the plate</span>
      </div>

      {decisionMs < 50 && (
        <p className="text-[11px] font-serif italic text-stone-500 mt-4">
          At {activeVelo.toFixed(1)} mph, after the ~{REACTION_MS}ms it takes just to react and the ~{SWING_MS}ms the swing itself takes, there&apos;s barely any real time left to judge location and spin — the decision is made almost entirely on anticipation, not in-flight reading.
        </p>
      )}
    </div>
  )
}
