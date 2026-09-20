'use client'

// src/components/batting-lab/BatterHotZoneOverlay.tsx
//
// Batter-side mirror of the Pitching Lab's Hot Zone Overlay: this
// batter's real hot zones (same Supabase-cached batter_hot_zones table
// the rest of the site already reads via /api/batter-zones), with a real
// opponent pitcher's real hot zones (pitcher_hot_zones table, new
// /api/pitcher-zones route) overlaid to show who wins each zone
// (netTilt(), the same real distance score already built for the
// Pitching Lab's matchup card — unchanged, just fed from the batter's
// own tab this time). Defaults to the next scheduled opponent's real
// confirmed probable starter when one exists; manual pitcher search
// overrides it.

import { useEffect, useState } from 'react'
import { CORE_KEYS, CHASE_KEYS, CHASE_SET } from '@/components/pitching-lab/ZoneGrid'
import { ZONE_LABELS, colorForBatterMetric, formatMetric, type BatterHotZones, type PitcherHotZones, type ZoneCell } from '@/lib/hot-zones'
import { netTilt } from '@/lib/pitcher-arsenal'
import { SITUATIONS, SITUATION_LABELS, type Situation, type BatterSituationalZones } from '@/lib/batter-situational-zones'

type CountFilter = 'season' | Situation

const OVERLAY_MIN_SAMPLE = 8

type BatterMetric = 'xwoba' | 'slg' | 'ba'
const BATTER_METRICS: { key: BatterMetric; label: string }[] = [
  { key: 'xwoba', label: 'xwOBA' },
  { key: 'slg', label: 'SLG' },
  { key: 'ba', label: 'BA' },
]

type PlayerResult = { id: number; fullName: string; primaryPosition: string }

function mlbHeadshot(id: number | string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}

function tiltColor(tilt: number): string {
  if (tilt >= 0.5) return 'bg-blue-400'
  if (tilt >= 0.2) return 'bg-blue-300'
  if (tilt >= 0.06) return 'bg-blue-200'
  if (tilt >= -0.06) return 'bg-stone-200'
  if (tilt >= -0.2) return 'bg-orange-300'
  if (tilt >= -0.5) return 'bg-orange-400'
  return 'bg-red-500'
}

const CHASE_ALIGN: Record<string, string> = {
  '11': 'items-start justify-start pt-2.5 pl-2.5',
  '12': 'items-end justify-start pt-2.5 pr-2.5',
  '13': 'items-start justify-end pb-2.5 pl-2.5',
  '14': 'items-end justify-end pb-2.5 pr-2.5',
}

function BatterZoneCellView({ z, zones, metric }: { z: string; zones: Record<string, ZoneCell>; metric: BatterMetric }) {
  const cell = zones[z]
  const value = cell?.[metric] ?? null
  const sample = cell?.ab ?? 0
  const noSample = !cell || sample === 0
  const lowSample = sample > 0 && sample < OVERLAY_MIN_SAMPLE
  const isChase = CHASE_SET.has(z)
  return (
    <div
      className={`zone-cell flex flex-col ${isChase ? CHASE_ALIGN[z] : 'items-center justify-center'} ${
        noSample ? 'bg-stone-50' : lowSample ? 'bg-stone-100' : colorForBatterMetric(value, metric)
      } ${isChase ? 'border border-white/25' : 'rounded-md border border-white/40'} ${lowSample ? 'opacity-50' : ''}`}
      title={`${ZONE_LABELS[z]}${noSample ? ' · no pitches here' : lowSample ? ` · sample too small (n<${OVERLAY_MIN_SAMPLE})` : ''}`}
    >
      <span className="font-mono font-bold text-stone-900/80 text-[12px]">{noSample ? '—' : formatMetric(value, metric)}</span>
      <span className="font-mono text-stone-900/50 text-[9px]">n={sample}</span>
    </div>
  )
}

function BatterZoneGrid({ zones, metric }: { zones: Record<string, ZoneCell>; metric: BatterMetric }) {
  const cellSize = 56, gap = 5, chaseBand = 46
  const core = cellSize * 3 + gap * 2
  const total = core + chaseBand * 2
  return (
    <div className="mx-auto relative" style={{ width: total, height: total }}>
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 overflow-hidden rounded-md">
        {CHASE_KEYS.map(z => <BatterZoneCellView key={z} z={z} zones={zones} metric={metric} />)}
      </div>
      <div className="absolute grid" style={{ top: chaseBand, left: chaseBand, width: core, height: core, gridTemplateColumns: `repeat(3, ${cellSize}px)`, gridTemplateRows: `repeat(3, ${cellSize}px)`, gap }}>
        {CORE_KEYS.map(z => <BatterZoneCellView key={z} z={z} zones={zones} metric={metric} />)}
      </div>
    </div>
  )
}

function TiltGrid({ batterZones, pitcherZones }: { batterZones: Record<string, ZoneCell>; pitcherZones: Record<string, ZoneCell> }) {
  const cellSize = 56, gap = 5, chaseBand = 46
  const core = cellSize * 3 + gap * 2
  const total = core + chaseBand * 2
  function tiltFor(z: string): number {
    const b = batterZones[z], p = pitcherZones[z]
    return netTilt(b?.xwoba, p?.ba_against, p?.usage_pct, p?.whiff_pct)
  }
  return (
    <div className="mx-auto relative" style={{ width: total, height: total }}>
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 overflow-hidden rounded-md">
        {CHASE_KEYS.map(z => {
          const tilt = tiltFor(z)
          return (
            <div key={z} className={`flex flex-col ${CHASE_ALIGN[z]} ${tiltColor(tilt)} border border-white/25`} title={ZONE_LABELS[z]}>
              <span className="font-mono font-bold text-stone-900/80 text-[11px]">{tilt > 0 ? '+' : ''}{tilt.toFixed(2)}</span>
            </div>
          )
        })}
      </div>
      <div className="absolute grid" style={{ top: chaseBand, left: chaseBand, width: core, height: core, gridTemplateColumns: `repeat(3, ${cellSize}px)`, gridTemplateRows: `repeat(3, ${cellSize}px)`, gap }}>
        {CORE_KEYS.map(z => {
          const tilt = tiltFor(z)
          return (
            <div key={z} className={`flex items-center justify-center rounded-md border border-white/40 ${tiltColor(tilt)}`} title={ZONE_LABELS[z]}>
              <span className="font-mono font-bold text-stone-900/80 text-[12px]">{tilt > 0 ? '+' : ''}{tilt.toFixed(2)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function BatterHotZoneOverlay({ batterId, bats }: { batterId: number; bats: string | null }) {
  const [split, setSplit] = useState<'all' | 'vs_lhp' | 'vs_rhp'>('all')
  const [metric, setMetric] = useState<BatterMetric>('xwoba')
  const [batterZones, setBatterZones] = useState<Record<string, BatterHotZones> | null | 'error'>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/batter-zones?playerId=${batterId}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setBatterZones(json.zones && Object.keys(json.zones).length > 0 ? json.zones : 'error') })
      .catch(() => { if (!cancelled) setBatterZones('error') })
    return () => { cancelled = true }
  }, [batterId])

  // Real per-count-situation zones (first pitch/even/2-strike/3-ball) —
  // separate live pull from the season-wide Supabase-cached table above,
  // fetched once and switched between client-side.
  const [situation, setSituation] = useState<CountFilter>('season')
  const [situational, setSituational] = useState<BatterSituationalZones | null | 'error'>(null)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/batter-situational-zones?playerId=${batterId}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setSituational(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setSituational('error') })
    return () => { cancelled = true }
  }, [batterId])

  // Opponent pitcher — real confirmed next-series starter by default,
  // manual search as an override.
  const [defaultPitcher, setDefaultPitcher] = useState<PlayerResult | 'none' | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerResult[]>([])
  const [manualPitcher, setManualPitcher] = useState<PlayerResult | null>(null)
  const [pitcherZonesState, setPitcherZonesState] = useState<{ id: number; zones: Record<string, PitcherHotZones> } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/batter-next-series?batterId=${batterId}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        const g = (json?.series?.games ?? []).find((g: { probablePitcherId: number | null }) => g.probablePitcherId != null)
        setDefaultPitcher(g ? { id: g.probablePitcherId, fullName: g.probablePitcherName, primaryPosition: 'P' } : 'none')
      })
      .catch(() => { if (!cancelled) setDefaultPitcher('none') })
    return () => { cancelled = true }
  }, [batterId])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) return
    const t = setTimeout(() => {
      fetch(`/api/lab/search?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(d => setResults((d.people ?? []).filter((p: PlayerResult) => p.primaryPosition === 'P').slice(0, 6)))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query])
  const visibleResults = query.trim().length >= 3 && !manualPitcher ? results : []

  const activePitcher = manualPitcher ?? (defaultPitcher && defaultPitcher !== 'none' ? defaultPitcher : null)
  const usingDefault = !manualPitcher && defaultPitcher && defaultPitcher !== 'none'

  useEffect(() => {
    if (!activePitcher) return
    let cancelled = false
    fetch(`/api/pitcher-zones?playerId=${activePitcher.id}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setPitcherZonesState({ id: activePitcher.id, zones: json.zones ?? {} }) })
      .catch(() => { if (!cancelled) setPitcherZonesState({ id: activePitcher.id, zones: {} }) })
    return () => { cancelled = true }
  }, [activePitcher])

  // Derived instead of reset-in-effect: stale zones from a previous
  // pitcher never leak through if the id doesn't match the current one.
  const pitcherZones = activePitcher && pitcherZonesState?.id === activePitcher.id ? pitcherZonesState.zones : null
  const pitcherSplit = bats === 'Left' ? 'vs_lhb' : bats === 'Right' ? 'vs_rhb' : 'all'
  const activePitcherZones = pitcherZones?.[pitcherSplit]?.zones ?? pitcherZones?.['all']?.zones ?? null

  if (batterZones === 'error') return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">No real hot-zone data on record for him yet.</div>
  if (batterZones === null) return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Pulling his real hot zones…</div>

  const zones = situation === 'season'
    ? (batterZones[split]?.zones ?? {})
    : (situational && situational !== 'error' ? situational.bySituation[situation][split] : {})
  const totalPitchesShown = situation === 'season'
    ? (batterZones[split]?.total_pitches ?? 0)
    : Object.values(zones).reduce((s, c) => s + (c.pitches ?? 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-1">Hot Zone Overlay</p>
        <p className="text-[13px] text-[#57534E]">
          His real hot zones ({totalPitchesShown} pitches{situation === 'season' ? ' this season' : `, ${SITUATION_LABELS[situation].toLowerCase()}`}) — overlaid with a real opponent pitcher to see who wins each zone.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSituation('season')}
          className={`font-mono uppercase tracking-wider rounded-full border px-3 py-1.5 text-[10px] transition ${situation === 'season' ? 'border-[#FF5722] text-[#FF5722] bg-orange-50' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
        >
          Season (all counts)
        </button>
        {SITUATIONS.map(s => (
          <button
            key={s}
            onClick={() => setSituation(s)}
            disabled={situational === 'error'}
            className={`font-mono uppercase tracking-wider rounded-full border px-3 py-1.5 text-[10px] transition ${situation === s ? 'border-[#FF5722] text-[#FF5722] bg-orange-50' : 'border-stone-200 text-stone-500 hover:border-stone-300'} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {SITUATION_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-3">Overlay a pitcher</p>
        {usingDefault && activePitcher && (
          <div className="flex items-center gap-2 mb-3 bg-orange-50 border border-orange-200 rounded-full px-3 py-1.5 w-fit">
            <span className="text-[9px] font-mono uppercase tracking-wide text-orange-700 font-bold">Next scheduled opponent</span>
            <img src={mlbHeadshot(activePitcher.id)} alt="" width={20} height={20} style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
            <span className="text-[12px] font-bold text-stone-900">{activePitcher.fullName}</span>
          </div>
        )}
        {defaultPitcher === 'none' && !manualPitcher && (
          <p className="text-[11px] font-mono text-stone-400 mb-3">No real confirmed starter for his next series yet — search any real pitcher below.</p>
        )}
        <div className="relative max-w-sm">
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); if (manualPitcher) setManualPitcher(null) }}
            placeholder="Search any real MLB pitcher…"
            className="w-full text-[13px] bg-white border border-[#DEDACE] rounded-full px-4 py-2.5 outline-none focus:border-[#FF5722] transition"
          />
          {visibleResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg z-10 overflow-hidden">
              {visibleResults.map(p => (
                <button key={p.id} onClick={() => { setManualPitcher(p); setQuery(p.fullName); setResults([]) }} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-50">
                  <img src={mlbHeadshot(p.id)} alt="" width={22} height={22} style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                  <span className="text-[12px] font-semibold text-stone-800">{p.fullName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {manualPitcher && (
          <div className="mt-3 flex items-center gap-2">
            <img src={mlbHeadshot(manualPitcher.id)} alt="" width={26} height={26} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
            <span className="text-[13px] font-bold text-stone-900">{manualPitcher.fullName}</span>
            <button onClick={() => { setManualPitcher(null); setQuery('') }} className="text-[10px] font-mono text-stone-400 hover:text-stone-700 ml-2">✕ clear (back to next opponent)</button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
          {(['all', 'vs_lhp', 'vs_rhp'] as const).map(s => (
            <button key={s} onClick={() => setSplit(s)} className={`font-mono uppercase tracking-wider rounded-md px-2.5 py-1 text-[10px] transition ${split === s ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>
              {s === 'all' ? 'All' : s === 'vs_lhp' ? 'vs LHP' : 'vs RHP'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {BATTER_METRICS.map(m => (
            <button key={m.key} onClick={() => setMetric(m.key)} className={`font-mono uppercase tracking-wider rounded border px-2 py-1 text-[9px] transition ${metric === m.key ? 'border-[#FF5722] text-[#FF5722] bg-orange-50' : 'border-stone-200 text-stone-400 hover:border-stone-300'}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid ${activePitcherZones ? 'md:grid-cols-2' : ''} gap-8`}>
        <div className="text-center">
          <p className="font-mono uppercase tracking-widest text-[10px] text-stone-500 mb-2">His zones — {split === 'all' ? 'all pitchers' : split === 'vs_lhp' ? 'vs LHP' : 'vs RHP'}</p>
          {situation !== 'season' && situational === null ? (
            <p className="text-[12px] font-serif italic text-stone-400 py-10">Pulling his real per-count zones…</p>
          ) : situation !== 'season' && situational === 'error' ? (
            <p className="text-[12px] font-serif italic text-stone-400 py-10">Couldn&apos;t load per-count zones right now.</p>
          ) : Object.keys(zones).length > 0 ? (
            <BatterZoneGrid zones={zones} metric={metric} />
          ) : (
            <p className="text-[12px] font-serif italic text-stone-400 py-10">Not enough pitches in this split yet.</p>
          )}
        </div>
        {activePitcherZones && (
          <div className="text-center">
            <p className="font-mono uppercase tracking-widest text-[10px] text-stone-500 mb-2">
              Matchup overlay — {activePitcher?.fullName} ({pitcherSplit === 'vs_lhb' ? 'vs LHB' : pitcherSplit === 'vs_rhb' ? 'vs RHB' : 'all'})
            </p>
            <TiltGrid batterZones={zones} pitcherZones={activePitcherZones} />
            <p className="text-[9px] font-mono text-stone-400 mt-2">Blue = pitcher favored, red = batter favored. Real distance score (netTilt), not a raw stat.</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[9px] font-mono text-stone-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" /> Better for him</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-stone-200 inline-block" /> League-average</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Worse for him</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-stone-100 opacity-50 inline-block" /> Real value, sample too small (n&lt;{OVERLAY_MIN_SAMPLE})</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-stone-50 border border-stone-200 inline-block" /> No pitches there</span>
      </div>
    </div>
  )
}
