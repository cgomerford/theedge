'use client'

// src/components/batting-lab/BatterSequenceExplorer.tsx
//
// The converse of the Pitching Lab's Sequencing tab: instead of "what
// does THIS pitcher throw next," this is "what have PITCHERS, in
// aggregate, actually thrown THIS BATTER" — real prev-pitch-type +
// prev-zone -> next-pitch-type + zone transitions, at a real count,
// reconstructed from every real at-bat this season (game_pk +
// at_bat_number + pitch_number, same technique as SequenceExplorer.tsx).
// Self-filtering zone/pitch pickers, same pattern: click either first,
// the other narrows to real remaining combinations.
//
// Real vs LHP/RHP split available since pitcherThrows is already on the
// raw log — no separate fetch needed.

import { useEffect, useMemo, useState } from 'react'
import { pitchColor } from '@/lib/mlb'
import { ZONE_LABELS } from '@/lib/hot-zones'
import { CORE_KEYS, CHASE_KEYS, CHASE_SET } from '@/components/pitching-lab/ZoneGrid'
import type { BatterPitchLog } from '@/lib/batter-pitch-log'
import BatterCountBreakdownShareCard, { type ShareCountRow } from '@/components/batting-lab/BatterCountBreakdownShareCard'

const SEASON = new Date().getFullYear()
const COUNTS: [number, number][] = [
  [0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [0, 2],
  [2, 1], [1, 2], [3, 0], [3, 1], [2, 2], [3, 2],
]
// "Important counts" for the shareable put-away breakdown — the real
// 2-strike counts, i.e. every count one strike from a real strikeout.
// A categorization choice (not a fetched fact), same convention as the
// Situation bucketing in pitcher/batter-situational-zones.ts, chosen
// because it's the standard, real put-away framing this app already
// uses elsewhere (Put-Away% on the arsenal table).
const IMPORTANT_COUNTS: [number, number][] = [[0, 2], [1, 2], [2, 2], [3, 2]]
const CHASE_ALIGN: Record<string, string> = {
  '11': 'items-start justify-start pt-2 pl-2',
  '12': 'items-end justify-start pt-2 pr-2',
  '13': 'items-start justify-end pb-2 pl-2',
  '14': 'items-end justify-end pb-2 pr-2',
}
const AB_EVENTS = new Set([
  'single', 'double', 'triple', 'home_run', 'strikeout', 'strikeout_double_play',
  'field_out', 'force_out', 'grounded_into_double_play', 'double_play', 'triple_play',
  'fielders_choice', 'fielders_choice_out', 'other_out',
])
const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])
const TOTAL_BASES: Record<string, number> = { single: 1, double: 2, triple: 3, home_run: 4 }

type PitchCall = 'ball' | 'strike' | 'whiff' | 'foul' | 'inPlay'
function classifyCall(description: string | null): PitchCall | null {
  switch (description) {
    case 'ball': case 'blocked_ball': case 'pitchout': return 'ball'
    case 'called_strike': return 'strike'
    case 'swinging_strike': case 'swinging_strike_blocked': case 'missed_bunt': return 'whiff'
    case 'foul': case 'foul_tip': case 'foul_bunt': return 'foul'
    case 'hit_into_play': return 'inPlay'
    default: return null
  }
}
function fmtRate(v: number | null): string {
  return v == null ? '—' : v.toFixed(3).replace(/^0\./, '.')
}
function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`
}

type SeqPitch = {
  pitchType: string
  zone: string | null
  balls: number
  strikes: number
  prevType: string | null
  prevZone: string | null
  pitcherThrows: 'L' | 'R' | null
  description: string | null
  result: string | null
}

type TallyRow = {
  pitchType: string; zone: string; count: number; ab: number; h: number; tb: number; hr: number
  singles: number; doubles: number; triples: number; so: number; outInPlay: number
  ball: number; strike: number; whiff: number; foul: number; inPlay: number
  pct: number; avg: number | null; slg: number | null
}

// Real (pitchType, zone) tally — ranked by real count seen, with a real
// hit-type breakdown and ball/strike/whiff/foul/inPlay counts. Shared by
// the interactive `ranked` list (scoped to whatever count/prev-pitch
// filters are selected) and the shareable "important counts" graphic
// (scoped to a fixed count, ignoring the prev-pitch filters).
function tallyPitches(pitches: SeqPitch[]): TallyRow[] {
  const tally = new Map<string, Omit<TallyRow, 'pct' | 'avg' | 'slg'>>()
  for (const p of pitches) {
    if (!p.zone) continue
    const key = `${p.pitchType}|${p.zone}`
    if (!tally.has(key)) tally.set(key, {
      pitchType: p.pitchType, zone: p.zone, count: 0, ab: 0, h: 0, tb: 0, hr: 0,
      singles: 0, doubles: 0, triples: 0, so: 0, outInPlay: 0,
      ball: 0, strike: 0, whiff: 0, foul: 0, inPlay: 0,
    })
    const row = tally.get(key)!
    row.count++
    const call = classifyCall(p.description)
    if (call) row[call]++
    if (p.result && AB_EVENTS.has(p.result)) {
      row.ab++
      if (HIT_EVENTS.has(p.result)) {
        row.h++; row.tb += TOTAL_BASES[p.result] ?? 0
        if (p.result === 'single') row.singles++
        else if (p.result === 'double') row.doubles++
        else if (p.result === 'triple') row.triples++
        else if (p.result === 'home_run') row.hr++
      } else if (p.result === 'strikeout' || p.result === 'strikeout_double_play') {
        row.so++
      } else {
        row.outInPlay++
      }
    }
  }
  const total = pitches.length
  return [...tally.values()]
    .sort((a, b) => b.count - a.count)
    .map(r => ({ ...r, pct: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0, avg: r.ab > 0 ? r.h / r.ab : null, slg: r.ab > 0 ? r.tb / r.ab : null }))
}

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
      <div className="absolute grid" style={{ top: chaseBand, left: chaseBand, width: core, height: core, gridTemplateColumns: `repeat(3, ${cellSize}px)`, gridTemplateRows: `repeat(3, ${cellSize}px)`, gap }}>
        {CORE_KEYS.map(z => <Cell key={z} z={z} />)}
      </div>
    </div>
  )
}

function MiniZone({ zone }: { zone: string }) {
  const cellSize = 9, gap = 1, chaseBand = 8
  const core = cellSize * 3 + gap * 2
  const total = core + chaseBand * 2
  function Cell({ z }: { z: string }) {
    const active = z === zone
    const isChase = CHASE_SET.has(z)
    return <div className={isChase ? 'border border-white/50' : 'rounded-[1px] border border-white/60'} style={{ background: active ? '#FF5722' : '#EDE8DD' }} />
  }
  return (
    <div className="relative shrink-0" style={{ width: total, height: total }} title={ZONE_LABELS[zone] ?? zone}>
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 overflow-hidden rounded-[2px]">{CHASE_KEYS.map(z => <Cell key={z} z={z} />)}</div>
      <div className="absolute grid" style={{ top: chaseBand, left: chaseBand, width: core, height: core, gridTemplateColumns: `repeat(3, ${cellSize}px)`, gridTemplateRows: `repeat(3, ${cellSize}px)`, gap }}>{CORE_KEYS.map(z => <Cell key={z} z={z} />)}</div>
    </div>
  )
}

export default function BatterSequenceExplorer({ batterId, batterName, batterTeamId }: { batterId: number; batterName: string; batterTeamId: number }) {
  const [log, setLog] = useState<BatterPitchLog | null | 'error'>(null)
  const [balls, setBalls] = useState(0)
  const [strikes, setStrikes] = useState(0)
  const [prevZone, setPrevZone] = useState<string | null>(null)
  const [prevType, setPrevType] = useState<string | null>(null)
  const [throwsFilter, setThrowsFilter] = useState<'all' | 'L' | 'R'>('all')
  const [showShare, setShowShare] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/batter-pitch-log?batterId=${batterId}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setLog(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setLog('error') })
    return () => { cancelled = true }
  }, [batterId])

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
          pitchType: p.pitchType, zone: p.zone, balls: p.balls ?? 0, strikes: p.strikes ?? 0,
          prevType: prev?.pitchType ?? null, prevZone: prev?.zone ?? null,
          pitcherThrows: p.pitcherThrows, description: p.description, result: p.result,
        })
      })
    }
    return out
  }, [log])

  const isFirstPitch = balls === 0 && strikes === 0

  const candidatesAtCount = useMemo(() => {
    let list = seqPitches.filter(p => p.balls === balls && p.strikes === strikes)
    if (throwsFilter !== 'all') list = list.filter(p => p.pitcherThrows === throwsFilter)
    return list
  }, [seqPitches, balls, strikes, throwsFilter])

  const zoneOptions = useMemo(() => {
    const scoped = prevType ? candidatesAtCount.filter(p => p.prevType === prevType) : candidatesAtCount
    const counts = new Map<string, number>()
    for (const p of scoped) { if (p.prevZone) counts.set(p.prevZone, (counts.get(p.prevZone) ?? 0) + 1) }
    return counts
  }, [candidatesAtCount, prevType])

  const pitchTypeOptions = useMemo(() => {
    const scoped = prevZone ? candidatesAtCount.filter(p => p.prevZone === prevZone) : candidatesAtCount
    const counts = new Map<string, number>()
    for (const p of scoped) { if (p.prevType) counts.set(p.prevType, (counts.get(p.prevType) ?? 0) + 1) }
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
    setPrevZone(null); setPrevType(null)
  }
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

  const ranked = useMemo(() => tallyPitches(filtered), [filtered])

  // Real top pitch+zone at each "important" (2-strike) count, computed
  // from every real pitch at that count this season — not scoped to the
  // interactively-selected prev-zone/prev-type filters above, since this
  // feeds the shareable overview graphic, not the exploratory picker.
  const importantCountsBreakdown = useMemo<ShareCountRow[]>(() => {
    if (!log || log === 'error') return []
    return IMPORTANT_COUNTS.map(([b, s]) => {
      const atCount = seqPitches.filter(p => p.balls === b && p.strikes === s)
      const top = tallyPitches(atCount)[0] ?? null
      return {
        balls: b, strikes: s,
        pitchType: top?.pitchType ?? null,
        pitchName: top ? (log.pitchNames[top.pitchType] ?? top.pitchType) : null,
        zone: top?.zone ?? null,
        sampleCount: atCount.length,
        topCount: top?.count ?? 0,
        ball: top?.ball ?? 0, strike: top?.strike ?? 0, whiff: top?.whiff ?? 0, foul: top?.foul ?? 0, inPlay: top?.inPlay ?? 0,
        ab: top?.ab ?? 0, singles: top?.singles ?? 0, doubles: top?.doubles ?? 0, triples: top?.triples ?? 0, hr: top?.hr ?? 0,
        so: top?.so ?? 0, outInPlay: top?.outInPlay ?? 0, avg: top?.avg ?? null, slg: top?.slg ?? null,
      }
    })
  }, [seqPitches, log])

  if (log === 'error') return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Couldn&apos;t load sequencing data right now.</div>
  if (log === null) return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Reconstructing every real at-bat&apos;s pitch order…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-1">Sequencing — how pitchers attack him</p>
          <p className="text-[13px] text-[#57534E]">The converse of the pitcher-side view: real prev→next pitch+zone transitions from every pitcher he&apos;s actually faced this season, reconstructed pitch-by-pitch from every real at-bat.</p>
        </div>
        <button
          onClick={() => setShowShare(v => !v)}
          className="font-mono uppercase tracking-wider rounded-full border px-3 py-1.5 text-[10px] transition border-stone-200 text-stone-500 hover:border-[#FF5722] hover:text-[#FF5722] shrink-0"
        >
          {showShare ? 'Hide share graphic' : 'Share put-away counts ↗'}
        </button>
      </div>

      {showShare && (
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-3">Shareable graphic</p>
          <BatterCountBreakdownShareCard
            batterId={batterId}
            batterName={batterName}
            batterTeamId={batterTeamId}
            rows={importantCountsBreakdown}
          />
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold">Count</p>
          <div className="flex gap-1">
            {(['all', 'R', 'L'] as const).map(t => (
              <button key={t} onClick={() => setThrowsFilter(t)} className={`font-mono rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-wide transition ${throwsFilter === t ? 'border-[#FF5722] text-[#FF5722] bg-orange-50 font-bold' : 'border-stone-200 text-stone-400 hover:border-stone-300'}`}>
                {t === 'all' ? 'All pitchers' : t === 'R' ? 'vs RHP' : 'vs LHP'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {COUNTS.map(([b, s]) => (
            <button key={`${b}-${s}`} onClick={() => selectCount(b, s)} className={`font-mono rounded-full border px-3 py-1.5 text-[11px] transition ${balls === b && strikes === s ? 'border-[#FF5722] text-[#FF5722] bg-orange-50 font-bold' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}>
              {b}-{s}
            </button>
          ))}
        </div>

        {!isFirstPitch && (
          <div className="pt-4 border-t border-stone-100 grid md:grid-cols-[auto_1fr] gap-6 items-start">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-2">
                Where the previous pitch was{prevType ? ` — only where he&apos;s seen ${log.pitchNames[prevType] ?? prevType}` : ''}
              </p>
              <PrevZoneBoard zoneCounts={zoneOptions} selected={prevZone} onSelect={selectZone} />
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-2">
                Which pitch{prevZone ? ` — only what he&apos;s seen at ${ZONE_LABELS[prevZone]}` : ''}
              </p>
              {pitchTypeOptions.length === 0 ? (
                <p className="text-[12px] font-serif italic text-stone-400">No real previous pitches on record for this selection.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => selectType(null)} className={`font-mono rounded-full border px-3 py-1.5 text-[11px] transition ${prevType === null ? 'border-[#FF5722] text-[#FF5722] bg-orange-50 font-bold' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}>Any pitch</button>
                  {pitchTypeOptions.map(([pt, count]) => (
                    <button key={pt} onClick={() => selectType(pt)} className={`font-mono rounded-full border px-3 py-1.5 text-[11px] transition flex items-center gap-1.5 ${prevType === pt ? 'border-[#FF5722] text-[#FF5722] bg-orange-50 font-bold' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}>
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
          {isFirstPitch ? 'Most-seen pitch & location, first pitch' : `What he sees next at ${balls}-${strikes}`}
        </p>
        <p className="text-[10px] font-mono text-stone-400 mb-4">{filtered.length} real matching pitches this season.</p>

        {filtered.length === 0 ? (
          <p className="text-center text-[12px] font-serif italic text-stone-400 py-10">No real pitches on record for this exact combination.</p>
        ) : (
          <div className="space-y-1">
            {ranked.slice(0, 8).map((r, i) => (
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
                  <span>Strike <b className="text-stone-800">{r.strike}</b></span>
                  <span>Whiff <b className="text-stone-800">{r.whiff}</b></span>
                  <span>Foul <b className="text-stone-800">{r.foul}</b></span>
                  <span>In play <b className="text-stone-800">{r.inPlay}</b></span>
                  <span className="text-stone-200">|</span>
                  {r.ab > 0 ? (
                    <span>
                      <b className="text-stone-800">{pluralize(r.ab, 'AB-ending pitch', 'AB-ending pitches')}</b> here: {[
                        r.singles > 0 && pluralize(r.singles, 'single'),
                        r.doubles > 0 && pluralize(r.doubles, 'double'),
                        r.triples > 0 && pluralize(r.triples, 'triple'),
                        r.hr > 0 && pluralize(r.hr, 'home run'),
                        r.so > 0 && pluralize(r.so, 'strikeout'),
                        r.outInPlay > 0 && pluralize(r.outInPlay, 'out in play', 'outs in play'),
                      ].filter(Boolean).map((s, j, arr) => (
                        <span key={j}><b className="text-stone-800">{s}</b>{j < arr.length - 1 ? ', ' : ''}</span>
                      ))} — AVG <b className="text-stone-800">{fmtRate(r.avg)}</b> · SLG <b className="text-stone-800">{fmtRate(r.slg)}</b>
                    </span>
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
  )
}
