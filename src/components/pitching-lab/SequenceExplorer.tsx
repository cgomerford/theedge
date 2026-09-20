'use client'

// src/components/pitching-lab/SequenceExplorer.tsx
//
// "Select the count — 0-0 shows the pitch and location used most often
// (and the alternatives). At 1-0, pick what the previous pitch was (type
// + location) and see what's thrown next." Real prev→next pitch+zone
// transitions, built from the same raw per-pitch log used elsewhere
// (src/lib/pitcher-pitch-log.ts) — each pitch already carries game_pk,
// at_bat_number, and pitch_number, which is exactly what's needed to
// reconstruct the TRUE thrown order within every at-bat (Statcast's own
// CSV order isn't guaranteed to be sequential). Optional batter filter:
// same real per-pitch batter id, no new data source.
//
// This is a different, richer question than pitcher_pitch_sequencing
// (the existing weekly-cron table behind PitchSequencingCard /
// PitchPredictorTool) — that table only tracks pitch-TYPE transitions,
// no location and no count context. This tab answers "type AND location,
// in this exact count, after this exact previous pitch."
//
// Zone and pitch-type pickers are mutually filtering, not sequential —
// click either one first and the other narrows to only real remaining
// combinations (only resetting the other pick if the exact combo chosen
// would have zero real matches). No fabricated minimum sample size
// anywhere in this tab — every real count is shown as-is; only a true
// zero-match combination gets an empty state.

import { useEffect, useMemo, useState } from 'react'
import { pitchColor } from '@/lib/mlb'
import { ZONE_LABELS } from '@/lib/hot-zones'
import { CORE_KEYS, CHASE_KEYS, CHASE_SET } from '@/components/pitching-lab/ZoneGrid'
import type { PitcherPitchLog } from '@/lib/pitcher-pitch-log'

const SEASON = new Date().getFullYear()
const COUNTS: [number, number][] = [
  [0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [0, 2],
  [2, 1], [1, 2], [3, 0], [3, 1], [2, 2], [3, 2],
]
const CHASE_ALIGN: Record<string, string> = {
  '11': 'items-start justify-start pt-2 pl-2',
  '12': 'items-end justify-start pt-2 pr-2',
  '13': 'items-start justify-end pb-2 pl-2',
  '14': 'items-end justify-end pb-2 pr-2',
}

// Real AB-ending events — same set as TopBattersFaced.tsx, for consistent
// AVG/SLG across the Pitching Lab.
const AB_EVENTS = new Set([
  'single', 'double', 'triple', 'home_run', 'strikeout', 'strikeout_double_play',
  'field_out', 'force_out', 'grounded_into_double_play', 'double_play', 'triple_play',
  'fielders_choice', 'fielders_choice_out', 'other_out',
])
const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])
const TOTAL_BASES: Record<string, number> = { single: 1, double: 2, triple: 3, home_run: 4 }

function fmtRate(v: number | null): string {
  return v == null ? '—' : v.toFixed(3).replace(/^0\./, '.')
}

// Real per-pitch call, from Statcast's `description` column (always
// present, even on a pitch that also ended the PA) — this is what makes
// it possible to show "how many were balls / called strikes / whiffs /
// fouls" even for buckets too small to have a natural AB-ending pitch.
type PitchCall = 'ball' | 'called_strike' | 'whiff' | 'foul' | 'hbp' | 'in_play' | 'other'
function classifyCall(description: string | null): PitchCall {
  switch (description) {
    case 'ball': case 'blocked_ball': case 'pitchout': return 'ball'
    case 'called_strike': return 'called_strike'
    case 'swinging_strike': case 'swinging_strike_blocked': case 'missed_bunt': return 'whiff'
    case 'foul': case 'foul_tip': case 'foul_bunt': return 'foul'
    case 'hit_by_pitch': return 'hbp'
    case 'hit_into_play': return 'in_play'
    default: return 'other'
  }
}

type SeqPitch = {
  pitchType: string
  zone: string | null
  balls: number
  strikes: number
  prevType: string | null
  prevZone: string | null
  batterId: number | null
  result: string | null // real events value if this pitch ended the PA, else a pitch description — see pitcher-pitch-log.ts
  description: string | null // real Statcast description — always the pitch-level call, independent of whether the PA ended
}

type PlayerResult = { id: number; fullName: string; primaryPosition: string }

function mlbHeadshot(id: number | string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}

// Clickable 13-zone board for picking "where was the previous pitch" —
// only real zones with n>=1 for the current scope are clickable; empty
// zones are shown (so the board reads the same shape everywhere) but
// disabled. Clicking the already-selected zone deselects it (back to
// "any location").
function PrevZoneBoard({ zoneCounts, selected, onSelect }: { zoneCounts: Map<string, number>; selected: string | null; onSelect: (z: string | null) => void }) {
  const cellSize = 40, gap = 4, chaseBand = 32
  const core = cellSize * 3 + gap * 2
  const total = core + chaseBand * 2

  function Cell({ z }: { z: string }) {
    const n = zoneCounts.get(z) ?? 0
    const isSelected = selected === z
    const isChase = CHASE_SET.has(z)
    const disabled = n === 0
    return (
      <button
        disabled={disabled}
        onClick={() => onSelect(isSelected ? null : z)}
        title={ZONE_LABELS[z]}
        className={`zone-cell flex flex-col ${isChase ? CHASE_ALIGN[z] : 'items-center justify-center'} ${
          disabled ? 'bg-stone-50 cursor-default' : isSelected ? 'bg-[#FF5722]' : 'bg-orange-100 hover:bg-orange-200 cursor-pointer'
        } ${isChase ? 'border border-white/40' : 'rounded-md border border-white/60'}`}
      >
        <span className={`font-mono font-bold text-[10px] ${isSelected ? 'text-white' : disabled ? 'text-stone-300' : 'text-stone-800'}`}>{disabled ? '—' : `n=${n}`}</span>
      </button>
    )
  }

  return (
    <div className="relative" style={{ width: total, height: total }}>
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 overflow-hidden rounded-md">
        {CHASE_KEYS.map(z => <Cell key={z} z={z} />)}
      </div>
      <div
        className="absolute grid"
        style={{ top: chaseBand, left: chaseBand, width: core, height: core, gridTemplateColumns: `repeat(3, ${cellSize}px)`, gridTemplateRows: `repeat(3, ${cellSize}px)`, gap }}
      >
        {CORE_KEYS.map(z => <Cell key={z} z={z} />)}
      </div>
    </div>
  )
}

// Small static zone diagram for the results list — shows WHERE a result's
// zone is at a glance instead of a text label (hover still shows the real
// zone name).
function MiniZone({ zone }: { zone: string }) {
  const cellSize = 9, gap = 1, chaseBand = 8
  const core = cellSize * 3 + gap * 2
  const total = core + chaseBand * 2

  function Cell({ z }: { z: string }) {
    const active = z === zone
    const isChase = CHASE_SET.has(z)
    return (
      <div
        className={isChase ? 'border border-white/50' : 'rounded-[1px] border border-white/60'}
        style={{ background: active ? '#FF5722' : '#EDE8DD' }}
      />
    )
  }

  return (
    <div className="relative shrink-0" style={{ width: total, height: total }} title={ZONE_LABELS[zone] ?? zone}>
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 overflow-hidden rounded-[2px]">
        {CHASE_KEYS.map(z => <Cell key={z} z={z} />)}
      </div>
      <div
        className="absolute grid"
        style={{ top: chaseBand, left: chaseBand, width: core, height: core, gridTemplateColumns: `repeat(3, ${cellSize}px)`, gridTemplateRows: `repeat(3, ${cellSize}px)`, gap }}
      >
        {CORE_KEYS.map(z => <Cell key={z} z={z} />)}
      </div>
    </div>
  )
}

// Non-interactive 13-zone board for the First Pitch Profile — sequential
// single-hue intensity (light→dark orange) scaled to the real % of first
// pitches landing in that zone, per the dataviz convention used elsewhere
// in this app (one hue, light→dark, never a diverging scale for a single
// real quantity like this).
function FirstPitchZoneGrid({ zonePct }: { zonePct: Map<string, { n: number; pct: number }> }) {
  const cellSize = 44, gap = 4, chaseBand = 34
  const core = cellSize * 3 + gap * 2
  const total = core + chaseBand * 2
  const maxPct = Math.max(1, ...[...zonePct.values()].map(v => v.pct))

  function Cell({ z }: { z: string }) {
    const v = zonePct.get(z)
    const pct = v?.pct ?? 0
    const isChase = CHASE_SET.has(z)
    const intensity = pct / maxPct // 0..1, relative to this pitcher's own hottest zone
    return (
      <div
        className={`flex flex-col ${isChase ? CHASE_ALIGN[z] : 'items-center justify-center'} ${isChase ? 'border border-white/40' : 'rounded-md border border-white/60'}`}
        style={{ background: v ? `rgba(255, 87, 34, ${0.08 + intensity * 0.72})` : '#FAFAF9' }}
        title={ZONE_LABELS[z]}
      >
        <span className={`font-mono font-bold text-[10px] ${intensity > 0.5 ? 'text-white' : 'text-stone-700'}`}>{v ? `${pct.toFixed(0)}%` : '—'}</span>
        {v && <span className={`font-mono text-[8px] ${intensity > 0.5 ? 'text-white/80' : 'text-stone-400'}`}>n={v.n}</span>}
      </div>
    )
  }

  return (
    <div className="relative mx-auto" style={{ width: total, height: total }}>
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 overflow-hidden rounded-md">
        {CHASE_KEYS.map(z => <Cell key={z} z={z} />)}
      </div>
      <div
        className="absolute grid"
        style={{ top: chaseBand, left: chaseBand, width: core, height: core, gridTemplateColumns: `repeat(3, ${cellSize}px)`, gridTemplateRows: `repeat(3, ${cellSize}px)`, gap }}
      >
        {CORE_KEYS.map(z => <Cell key={z} z={z} />)}
      </div>
    </div>
  )
}

export default function SequenceExplorer({ pitcherId }: { pitcherId: number }) {
  const [log, setLog] = useState<PitcherPitchLog | null | 'error'>(null)
  const [balls, setBalls] = useState(0)
  const [strikes, setStrikes] = useState(0)
  // null = "any" for both. Either can be picked first — picking one only
  // resets the other if the resulting combo would have zero real matches.
  const [prevZone, setPrevZone] = useState<string | null>(null)
  const [prevType, setPrevType] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerResult[]>([])
  const [batter, setBatter] = useState<PlayerResult | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/pitch-log?playerId=${pitcherId}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setLog(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setLog('error') })
    return () => { cancelled = true }
  }, [pitcherId])

  useEffect(() => {
    const q = query.trim()
    if (!q) return // visibleResults already hides stale results when query is empty
    const t = setTimeout(() => {
      fetch(`/api/lab/search?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(d => setResults((d.people ?? []).slice(0, 6)))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query])
  const visibleResults = query.trim().length > 0 ? results : []

  // Real sequential order, built once from the raw log — game_pk +
  // at_bat_number groups each plate appearance, pitch_number orders the
  // pitches within it. Independent of every filter below.
  const seqPitches = useMemo<SeqPitch[]>(() => {
    if (!log || log === 'error') return []
    const byAtBat = new Map<string, typeof log.pitches>()
    for (const p of log.pitches) {
      if (p.gamePk == null || p.atBatNumber == null || p.pitchNumber == null) continue
      const key = `${p.gamePk}-${p.atBatNumber}`
      if (!byAtBat.has(key)) byAtBat.set(key, [])
      byAtBat.get(key)!.push(p)
    }
    const out: SeqPitch[] = []
    for (const pitches of byAtBat.values()) {
      const ordered = [...pitches].sort((a, b) => (a.pitchNumber ?? 0) - (b.pitchNumber ?? 0))
      ordered.forEach((p, i) => {
        const prev = i > 0 ? ordered[i - 1] : null
        out.push({
          pitchType: p.pitchType,
          zone: p.zone,
          balls: p.balls ?? 0,
          strikes: p.strikes ?? 0,
          prevType: prev?.pitchType ?? null,
          prevZone: prev?.zone ?? null,
          batterId: p.batterId,
          result: p.result,
          description: p.description,
        })
      })
    }
    return out
  }, [log])

  const isFirstPitch = balls === 0 && strikes === 0

  // First Pitch Profile (right column) — a fixed reference card, always
  // 0-0, always every batter faced. Deliberately independent of the count
  // picker and batter-overlay filter on the left so it always answers
  // "how does he usually start hitters off" regardless of what the left
  // panel is currently drilled into.
  const firstPitches = useMemo(() => seqPitches.filter(p => p.balls === 0 && p.strikes === 0), [seqPitches])

  const firstPitchTypeBreakdown = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of firstPitches) counts.set(p.pitchType, (counts.get(p.pitchType) ?? 0) + 1)
    const total = firstPitches.length
    return [...counts.entries()]
      .map(([pitchType, n]) => ({ pitchType, n, pct: total > 0 ? (n / total) * 100 : 0 }))
      .sort((a, b) => b.n - a.n)
  }, [firstPitches])

  const firstPitchZoneBreakdown = useMemo(() => {
    const counts = new Map<string, number>()
    let total = 0
    for (const p of firstPitches) {
      if (!p.zone) continue
      counts.set(p.zone, (counts.get(p.zone) ?? 0) + 1)
      total++
    }
    const map = new Map<string, { n: number; pct: number }>()
    for (const [zone, n] of counts) map.set(zone, { n, pct: total > 0 ? (n / total) * 100 : 0 })
    return map
  }, [firstPitches])

  // Every real prev-pitch at this exact count (+ optional batter), before
  // the zone/type pickers narrow anything further.
  const candidatesAtCount = useMemo(() => {
    let list = seqPitches.filter(p => p.balls === balls && p.strikes === strikes)
    if (batter) list = list.filter(p => p.batterId === batter.id)
    return list
  }, [seqPitches, balls, strikes, batter])

  // Zones he's actually thrown a previous pitch to at this count, scoped
  // to the chosen pitch type if any — real counts, sorted most-seen first.
  const zoneOptions = useMemo(() => {
    const scoped = prevType ? candidatesAtCount.filter(p => p.prevType === prevType) : candidatesAtCount
    const counts = new Map<string, number>()
    for (const p of scoped) {
      if (!p.prevZone) continue
      counts.set(p.prevZone, (counts.get(p.prevZone) ?? 0) + 1)
    }
    return counts
  }, [candidatesAtCount, prevType])

  // Pitch types thrown to the chosen zone (or all zones if none chosen
  // yet) at this count — mirrors zoneOptions so either picker can go first.
  const pitchTypeOptions = useMemo(() => {
    const scoped = prevZone ? candidatesAtCount.filter(p => p.prevZone === prevZone) : candidatesAtCount
    const counts = new Map<string, number>()
    for (const p of scoped) {
      if (!p.prevType) continue
      counts.set(p.prevType, (counts.get(p.prevType) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [candidatesAtCount, prevZone])

  const filtered = useMemo(() => {
    let list = candidatesAtCount
    if (!isFirstPitch) {
      if (prevZone) list = list.filter(p => p.prevZone === prevZone)
      if (prevType) list = list.filter(p => p.prevType === prevType)
    }
    return list
  }, [candidatesAtCount, isFirstPitch, prevZone, prevType])

  function selectCount(b: number, s: number) {
    setBalls(b); setStrikes(s)
    setPrevZone(null); setPrevType(null) // a new count invalidates the old zone/type picks
  }

  // Either picker can be used first. Selecting one only clears the other
  // if the exact combination it would form has zero real matches —
  // otherwise both stay selected and each board's own counts reflect the
  // other's current scope (so the choice always "reduces" the other side).
  function selectZone(z: string | null) {
    const newZone = prevZone === z ? null : z
    setPrevZone(newZone)
    if (newZone && prevType) {
      const stillValid = candidatesAtCount.some(p => p.prevZone === newZone && p.prevType === prevType)
      if (!stillValid) setPrevType(null)
    }
  }
  function selectType(t: string | null) {
    const newType = prevType === t ? null : t
    setPrevType(newType)
    if (newType && prevZone) {
      const stillValid = candidatesAtCount.some(p => p.prevType === newType && p.prevZone === prevZone)
      if (!stillValid) setPrevZone(null)
    }
  }

  const ranked = useMemo(() => {
    const tally = new Map<string, {
      pitchType: string; zone: string; count: number; ab: number; h: number; tb: number; hr: number
      ball: number; calledStrike: number; whiff: number; foul: number; hbp: number; bipHit: number; bipOut: number
    }>()
    for (const p of filtered) {
      if (!p.zone) continue
      const key = `${p.pitchType}|${p.zone}`
      if (!tally.has(key)) tally.set(key, { pitchType: p.pitchType, zone: p.zone, count: 0, ab: 0, h: 0, tb: 0, hr: 0, ball: 0, calledStrike: 0, whiff: 0, foul: 0, hbp: 0, bipHit: 0, bipOut: 0 })
      const row = tally.get(key)!
      row.count++

      // Full disposition of THIS exact pitch — real Statcast description,
      // always present (unlike the AB-ending events below, which only
      // exist on the one pitch per PA that ended it).
      const call = classifyCall(p.description)
      if (call === 'ball') row.ball++
      else if (call === 'called_strike') row.calledStrike++
      else if (call === 'whiff') row.whiff++
      else if (call === 'foul') row.foul++
      else if (call === 'hbp') row.hbp++
      else if (call === 'in_play') {
        if (p.result && HIT_EVENTS.has(p.result)) row.bipHit++
        else row.bipOut++
      }

      // AVG/SLG on THIS pitch specifically — only counts when this exact
      // pitch ended the plate appearance (real events value).
      if (p.result && (AB_EVENTS.has(p.result) || HIT_EVENTS.has(p.result))) {
        row.ab++
        if (HIT_EVENTS.has(p.result)) {
          row.h++
          row.tb += TOTAL_BASES[p.result] ?? 0
          if (p.result === 'home_run') row.hr++
        }
      }
    }
    const total = filtered.length
    return [...tally.values()]
      .sort((a, b) => b.count - a.count)
      .map(r => ({
        ...r,
        pct: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
        avg: r.ab > 0 ? r.h / r.ab : null,
        slg: r.ab > 0 ? r.tb / r.ab : null,
      }))
  }, [filtered])

  if (log === 'error') {
    return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Couldn&apos;t load sequencing data right now.</div>
  }
  if (log === null) {
    return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Reconstructing every at-bat&apos;s real pitch order…</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-1">Sequencing</p>
        <p className="text-[13px] text-[#57534E]">Pick a count. At 0-0 it&apos;s just his most-used pitch and location. Any later count, add what the previous pitch was to see what comes next — real prev→next transitions, reconstructed pitch-by-pitch from every real at-bat this season.</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
      <div className="space-y-6 min-w-0">
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-3">Overlay a batter (optional)</p>
        <div className="relative max-w-sm">
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); if (batter) setBatter(null) }}
            placeholder="Search any MLB batter…"
            className="w-full text-[13px] bg-white border border-[#DEDACE] rounded-full px-4 py-2.5 outline-none focus:border-[#FF5722] transition"
          />
          {visibleResults.length > 0 && !batter && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg z-10 overflow-hidden">
              {visibleResults.map(p => (
                <button key={p.id} onClick={() => { setBatter(p); setQuery(p.fullName); setResults([]) }} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-50">
                  <img src={mlbHeadshot(p.id)} alt="" width={22} height={22} style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                  <span className="text-[12px] font-semibold text-stone-800">{p.fullName}</span>
                  <span className="text-[9px] font-mono text-stone-400 ml-auto">{p.primaryPosition}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {batter && (
          <div className="mt-3 flex items-center gap-2">
            <img src={mlbHeadshot(batter.id)} alt="" width={26} height={26} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
            <span className="text-[13px] font-bold text-stone-900">{batter.fullName}</span>
            <button onClick={() => { setBatter(null); setQuery('') }} className="text-[10px] font-mono text-stone-400 hover:text-stone-700 ml-2">✕ clear</button>
          </div>
        )}
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-3">Count</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {COUNTS.map(([b, s]) => (
            <button
              key={`${b}-${s}`}
              onClick={() => selectCount(b, s)}
              className={`font-mono rounded-full border px-3 py-1.5 text-[11px] transition ${balls === b && strikes === s ? 'border-[#FF5722] text-[#FF5722] bg-orange-50 font-bold' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
            >
              {b}-{s}
            </button>
          ))}
        </div>

        {!isFirstPitch && (
          <div className="pt-4 border-t border-stone-100 grid md:grid-cols-[auto_1fr] gap-6 items-start">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-2">
                Where the previous pitch was{prevType ? ` — only where he's thrown ${log.pitchNames[prevType] ?? prevType}` : ''}
              </p>
              <PrevZoneBoard
                zoneCounts={zoneOptions}
                selected={prevZone}
                onSelect={selectZone}
              />
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-2">
                Which pitch{prevZone ? ` — only what he's thrown to ${ZONE_LABELS[prevZone]}` : ''}
              </p>
              {pitchTypeOptions.length === 0 ? (
                <p className="text-[12px] font-serif italic text-stone-400">No real previous pitches on record for this selection.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => selectType(null)}
                    className={`font-mono rounded-full border px-3 py-1.5 text-[11px] transition ${prevType === null ? 'border-[#FF5722] text-[#FF5722] bg-orange-50 font-bold' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
                  >
                    Any pitch
                  </button>
                  {pitchTypeOptions.map(([pt, count]) => (
                    <button
                      key={pt}
                      onClick={() => selectType(pt)}
                      className={`font-mono rounded-full border px-3 py-1.5 text-[11px] transition flex items-center gap-1.5 ${prevType === pt ? 'border-[#FF5722] text-[#FF5722] bg-orange-50 font-bold' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: pitchColor(pt) }} />
                      {log.pitchNames[pt] ?? pt} <span className="text-stone-400">(n={count})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">
          {isFirstPitch ? 'Most-used pitch & location, first pitch' : `What comes next at ${balls}-${strikes}`}
          {batter ? ` vs ${batter.fullName}` : ''}
        </p>
        <p className="text-[10px] font-mono text-stone-400 mb-4">{filtered.length} real matching pitches this season. Every pitch is counted by its real call below (ball/strike/whiff/foul/in-play); AVG/SLG/HR only count the one pitch per plate appearance that actually ended it.</p>

        {filtered.length === 0 ? (
          <p className="text-center text-[12px] font-serif italic text-stone-400 py-10">No real pitches on record for this exact combination.</p>
        ) : (
          <div className="space-y-1">
            {ranked.map((r, i) => (
              <div key={`${r.pitchType}-${r.zone}`} className="py-2.5 border-b border-stone-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="w-5 text-[11px] font-mono text-stone-400 text-right shrink-0">{i + 1}</span>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: pitchColor(r.pitchType) }} />
                  <MiniZone zone={r.zone} />
                  <div className="flex-1 min-w-0">
                    <span className="text-[12px] font-bold text-stone-900 truncate block">{log.pitchNames[r.pitchType] ?? r.pitchType}</span>
                    <div className="h-2 bg-stone-50 rounded-sm overflow-hidden mt-1">
                      <div className="h-full rounded-sm" style={{ width: `${r.pct}%`, background: pitchColor(r.pitchType), opacity: 0.7 }} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[11px] font-mono text-stone-600">{r.pct.toFixed(1)}% <span className="text-stone-400">(n={r.count})</span></div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 pl-16 text-[9px] font-mono text-stone-500">
                  <span>Ball <b className="text-stone-800">{r.ball}</b></span>
                  <span>Called strike <b className="text-stone-800">{r.calledStrike}</b></span>
                  <span>Whiff <b className="text-stone-800">{r.whiff}</b></span>
                  <span>Foul <b className="text-stone-800">{r.foul}</b></span>
                  <span>In play, hit <b className="text-emerald-600">{r.bipHit}</b></span>
                  <span>In play, out <b className="text-stone-800">{r.bipOut}</b></span>
                  {r.hbp > 0 && <span>HBP <b className="text-stone-800">{r.hbp}</b></span>}
                  <span className="text-stone-200">|</span>
                  {r.ab > 0 ? (
                    // Lead with the raw H-for-AB fraction so a rate built
                    // from a tiny sample (e.g. 1-for-1 = "AVG 1.000") reads
                    // as what it is, not as a stabilized real average.
                    <span><b className="text-stone-800">{r.h}-for-{r.ab}</b> here → AVG <b className="text-stone-800">{fmtRate(r.avg)}</b> · SLG <b className="text-stone-800">{fmtRate(r.slg)}</b>{r.hr > 0 && <> · HR <b className="text-stone-800">{r.hr}</b></>}</span>
                  ) : (
                    <span className="text-stone-400">No AB-ending pitch in this bucket yet</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-5 lg:sticky lg:top-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">First pitch profile</p>
        <p className="text-[10px] font-mono text-stone-400 mb-4">
          Every 0-0 pitch this season, every batter faced ({firstPitches.length} real pitches) — a fixed reference, independent of the count and batter picked on the left.
        </p>

        {firstPitches.length === 0 ? (
          <p className="text-center text-[12px] font-serif italic text-stone-400 py-8">No real first-pitch data on record yet.</p>
        ) : (
          <>
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-2">Pitch type</p>
            <div className="space-y-1.5 mb-6">
              {firstPitchTypeBreakdown.map(r => (
                <div key={r.pitchType} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: pitchColor(r.pitchType) }} />
                  <span className="text-[11px] font-semibold text-stone-800 truncate flex-1 min-w-0">{log.pitchNames[r.pitchType] ?? r.pitchType}</span>
                  <div className="w-16 h-1.5 bg-stone-50 rounded-sm overflow-hidden shrink-0">
                    <div className="h-full rounded-sm" style={{ width: `${r.pct}%`, background: pitchColor(r.pitchType), opacity: 0.7 }} />
                  </div>
                  <span className="text-[10px] font-mono text-stone-600 w-14 text-right shrink-0">{r.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>

            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-2">Zone location</p>
            <FirstPitchZoneGrid zonePct={firstPitchZoneBreakdown} />
          </>
        )}
      </div>
      </div>
    </div>
  )
}
