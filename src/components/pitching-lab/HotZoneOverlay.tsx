'use client'

// src/components/pitching-lab/HotZoneOverlay.tsx
//
// New tab: every real zone, broken out by count situation (first pitch /
// even / 2-strike / 3-ball — src/lib/pitcher-situational-zones.ts, one
// live Savant CSV pull, no new pipeline), with an optional real batter
// overlaid on top (src/lib/hot-zones.ts's getBatterHotZones, via the
// existing /api/batter-zones route) to show who wins each zone
// (netTilt(), already built for the Scout Report matchup card). Below
// that: a "catcher's wristband" — one real, scored (pitch, zone)
// recommendation per situation (src/lib/game-plan.ts).

import { useEffect, useMemo, useRef, useState } from 'react'
import ZoneGrid, { METRICS, ZoneColorLegend, TiltBoard, CHASE_ALIGN } from '@/components/pitching-lab/ZoneGrid'

// Situational data (one count bucket × one split) is naturally much
// thinner than a season-wide grid — 30 (Location Lab's threshold) would
// greyed-out almost every cell here, which reads as "no colors are
// working" rather than what it actually is (an honest small-sample
// guard at the wrong threshold for this narrower slice). Matches
// game-plan.ts's own MIN_SAMPLE for the same situational data.
const OVERLAY_MIN_SAMPLE = 8
// 2026-09-16: the count/baserunner/pitch-type manipulation controls slice
// the same season into much finer buckets than the original 4-situation
// view (12 exact counts × 9 baserunner states × ~7 pitch types) — at
// OVERLAY_MIN_SAMPLE=8 nearly every cell in a "specific" selection reads
// as grayed-out "sample too small," which is the same "no colors are
// working" problem the comment above already flagged once, one level
// deeper. Real per-pitch data still backs every one of these cells (the
// n= label is always the true count, never hidden); this only lowers how
// many real pitches it takes before that data gets a real color instead
// of gray, for the finer views where a stricter floor would gray out
// almost everything.
const GRANULAR_MIN_SAMPLE = 3
import { ZONE_LABELS, type PitcherZoneMetric, type BatterHotZones } from '@/lib/hot-zones'
import { netTilt } from '@/lib/pitcher-arsenal'
import { pitchColor } from '@/lib/mlb'
import type { BatterZoneArsenal } from '@/lib/batter-zone-arsenal'
import {
  SITUATIONS, SITUATION_LABELS, SITUATION_TO_COUNTS,
  EXACT_COUNTS, BASE_STATES, BASE_STATE_LABELS, RISP_STATES,
  rollUpZones, rollUpByPitchZones,
  type PitcherSituationalZones, type Situation, type Split, type ExactCount, type BaseState,
} from '@/lib/pitcher-situational-zones'
import { buildGamePlan, type GamePlanEntry } from '@/lib/game-plan'

const SEASON = new Date().getFullYear()
const SPLIT_LABELS: Record<Split, string> = { all: 'All', vs_lhb: 'vs LHB', vs_rhb: 'vs RHB' }
type CountMode = 'situation' | 'exact'
type BaseStateFilter = 'any' | 'risp' | BaseState

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

// Cell content only now — the real 13-zone geometry (chase-quadrant
// positioning, core 3x3 sizing) lives in ZoneGrid.tsx's shared TiltBoard,
// same component Top3KeyPlayersTab's matchup grid now uses too.
function TiltGrid({ pitcherZones, batterZones }: { pitcherZones: Record<string, { ba_against?: number | null; usage_pct?: number | null; whiff_pct?: number | null }>; batterZones: BatterHotZones }) {
  function tiltFor(z: string): number {
    const p = pitcherZones[z]
    const b = batterZones.zones[z]
    return netTilt(b?.xwoba, p?.ba_against, p?.usage_pct, p?.whiff_pct)
  }

  return (
    <TiltBoard
      renderZone={(z, isChase) => {
        const tilt = tiltFor(z)
        return (
          <div
            className={`flex w-full h-full rounded-md border ${isChase ? `flex-col ${CHASE_ALIGN[z]} border-white/25` : 'items-center justify-center border-white/40'} ${tiltColor(tilt)}`}
            title={ZONE_LABELS[z]}
          >
            <span className={`font-mono font-bold text-stone-900/80 ${isChase ? 'text-[11px]' : 'text-[12px]'}`}>{tilt > 0 ? '+' : ''}{tilt.toFixed(2)}</span>
          </div>
        )
      }}
    />
  )
}

export default function HotZoneOverlay({ pitcherId, pitcherThrows }: { pitcherId: number; pitcherThrows: 'L' | 'R' | null }) {
  const [situational, setSituational] = useState<PitcherSituationalZones | null | 'error'>(null)
  const [situation, setSituation] = useState<Situation>('even')
  const [split, setSplit] = useState<Split>('all')
  const [metric, setMetric] = useState<PitcherZoneMetric>('usage_pct')
  const [countMode, setCountMode] = useState<CountMode>('situation')
  const [exactCount, setExactCount] = useState<ExactCount>('0-0')
  const [baseStateFilter, setBaseStateFilter] = useState<BaseStateFilter>('any')
  const [pitchTypeFilter, setPitchTypeFilter] = useState<string | 'all'>('all')

  // Batter search + overlay
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerResult[]>([])
  const [batter, setBatter] = useState<PlayerResult | null>(null)
  const [batterZones, setBatterZones] = useState<Record<string, BatterHotZones> | null>(null)
  const [batterArsenal, setBatterArsenal] = useState<Record<string, BatterZoneArsenal> | null>(null)
  const gen = useRef(0)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/situational-zones?playerId=${pitcherId}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setSituational(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setSituational('error') })
    return () => { cancelled = true }
  }, [pitcherId])

  useEffect(() => {
    const q = query.trim()
    // Below 3 chars: leave `results` untouched — visibleResults below
    // already derives [] for short queries, so no setState is needed here.
    if (q.length < 3) return
    const myGen = ++gen.current
    const t = setTimeout(() => {
      fetch(`/api/lab/search?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(d => { if (myGen === gen.current) setResults((d.people ?? []).slice(0, 6)) })
        .catch(() => { if (myGen === gen.current) setResults([]) })
    }, 250)
    return () => clearTimeout(t)
  }, [query])
  const visibleResults = query.trim().length >= 3 ? results : []

  useEffect(() => {
    // No batter selected — nothing to fetch. `batterZones` may still hold
    // a PREVIOUS batter's data here; every read below is gated on `batter`
    // being non-null (see effectiveBatterZones), so a stale value in state
    // never reaches the UI.
    if (!batter) return
    let cancelled = false
    fetch(`/api/batter-zones?playerId=${batter.id}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setBatterZones(json.zones ?? {}) })
      .catch(() => { if (!cancelled) setBatterZones({}) })
    return () => { cancelled = true }
  }, [batter])

  useEffect(() => {
    // Same real batter_zone_arsenal table the Batting Lab's "Vs Pitch
    // Types" tab already reads — real BA/SLG/xwOBA/whiff PER PITCH TYPE
    // per zone, what makes the game plan and the "most-used combos" block
    // below pitch-type-aware instead of zone-only.
    if (!batter) return
    let cancelled = false
    fetch(`/api/mlb/batter-zone-arsenal?playerId=${batter.id}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setBatterArsenal(json.arsenal ?? {}) })
      .catch(() => { if (!cancelled) setBatterArsenal({}) })
    return () => { cancelled = true }
  }, [batter])

  const effectiveBatterZones = batter ? batterZones : null
  const effectiveBatterArsenal = batter ? batterArsenal : null

  // Pitcher-only zone grid — the precomputed bySituation/byPitchSituation
  // lookups cover today's default (Situation mode, no baserunner filter,
  // no pitch-type filter) exactly as before; any real manipulation (Exact
  // count mode, a baserunner filter, or a pitch-type filter) routes
  // through the fine-grained roll-up instead, since that's the only
  // structure that can combine all three dimensions freely.
  const zones = useMemo(() => {
    if (!situational || situational === 'error') return {}
    if (countMode === 'situation' && baseStateFilter === 'any') {
      return pitchTypeFilter === 'all'
        ? situational.bySituation[situation][split]
        : (situational.byPitchSituation[situation][pitchTypeFilter] ?? {})
    }
    // Real base-state filter — RISP is a union of the scoring-position
    // states, not a 9th stored bucket (see pitcher-situational-zones.ts).
    const baseStates: BaseState[] | 'any' = baseStateFilter === 'any' ? 'any' : baseStateFilter === 'risp' ? RISP_STATES : [baseStateFilter]
    const counts: ExactCount[] = countMode === 'exact' ? [exactCount] : SITUATION_TO_COUNTS[situation]
    if (pitchTypeFilter === 'all') return rollUpZones(situational.fine, { counts, baseStates, split })
    return rollUpByPitchZones(situational.fine, { counts, baseStates, split })[pitchTypeFilter] ?? {}
  }, [situational, situation, split, countMode, exactCount, baseStateFilter, pitchTypeFilter])

  // Game-plan wristband: unchanged (still every real situation at once)
  // when no baserunner filter is active — that's today's exact behavior.
  // With a baserunner filter, each situation's real (pitch,zone) cells are
  // rebuilt from the fine-grained data scoped to that situation's exact
  // counts + the chosen baserunner state, so the wristband reflects the
  // same real filter as the zone grid above it.
  const situationalForPlan = useMemo(() => {
    if (!situational || situational === 'error') return null
    if (baseStateFilter === 'any') return situational
    const baseStates: BaseState[] | 'any' = baseStateFilter === 'risp' ? RISP_STATES : [baseStateFilter]
    const rolled: PitcherSituationalZones['byPitchSituation'] = { first_pitch: {}, even: {}, '2strike': {}, '3ball': {} }
    for (const s of SITUATIONS) {
      rolled[s] = rollUpByPitchZones(situational.fine, { counts: SITUATION_TO_COUNTS[s], baseStates, split: 'all' })
    }
    return { ...situational, byPitchSituation: rolled }
  }, [situational, baseStateFilter])

  const gamePlan: GamePlanEntry[] = useMemo(() => {
    if (!situationalForPlan) return []
    return buildGamePlan(situationalForPlan, effectiveBatterZones, pitcherThrows, effectiveBatterArsenal)
  }, [situationalForPlan, effectiveBatterZones, effectiveBatterArsenal, pitcherThrows])

  const batterSplit = pitcherThrows === 'L' ? 'vs_lhp' : pitcherThrows === 'R' ? 'vs_rhp' : 'all'
  const activeBatterZones = effectiveBatterZones?.[batterSplit] ?? effectiveBatterZones?.['all'] ?? null
  const activeBatterArsenal = effectiveBatterArsenal?.[batterSplit] ?? effectiveBatterArsenal?.['all'] ?? null

  // Any manipulation away from the default broad situation view (an exact
  // count, a baserunner filter, or a pitch-type filter) slices real pitches
  // much finer — drop the sample floor so real color still shows instead
  // of graying out almost every cell.
  const isGranularView = countMode === 'exact' || baseStateFilter !== 'any' || pitchTypeFilter !== 'all'
  const effectiveMinSample = isGranularView ? GRANULAR_MIN_SAMPLE : OVERLAY_MIN_SAMPLE

  // Batter's real most-used (pitch, zone) combos — ranked by real pitches
  // seen, with each pitch's best real zone (highest xwOBA, excluding any
  // cell flagged low_sample) surfaced alongside it.
  const batterArsenalRows = useMemo(() => {
    if (!activeBatterArsenal) return []
    return Object.entries(activeBatterArsenal.arsenal)
      .map(([pitchType, p]) => {
        let bestZone: string | null = null
        let bestZoneXwoba: number | null = null
        for (const [zone, cell] of Object.entries(p.zones)) {
          if (cell.low_sample || cell.xwoba == null) continue
          if (bestZoneXwoba == null || cell.xwoba > bestZoneXwoba) { bestZoneXwoba = cell.xwoba; bestZone = zone }
        }
        return { pitchType, pitchName: p.pitch_name, totalPitches: p.total_pitches, ba: p.ba, slg: p.slg, xwoba: p.xwoba, whiffPct: p.whiff_pct, bestZone, bestZoneXwoba }
      })
      .sort((a, b) => b.totalPitches - a.totalPitches)
  }, [activeBatterArsenal])

  if (situational === 'error') {
    return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Couldn&apos;t load situational zone data for this pitcher right now — try again shortly.</div>
  }
  if (situational === null) {
    return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Pulling every pitch this season to build situational zones…</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-1">Hot Zone Overlay</p>
        <p className="text-[13px] text-[#57534E]">
          Real zones for every count situation ({situational.totalPitches} pitches this season) — overlay a real batter to see who wins each zone, then check the game plan below.
        </p>
      </div>

      {/* Batter search */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-3">Overlay a batter</p>
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
                <button
                  key={p.id}
                  onClick={() => { setBatter(p); setQuery(p.fullName); setResults([]) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-50"
                >
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
            <img src={mlbHeadshot(batter.id)} alt="" width={28} height={28} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
            <span className="text-[13px] font-bold text-stone-900">{batter.fullName}</span>
            <button onClick={() => { setBatter(null); setQuery('') }} className="text-[10px] font-mono text-stone-400 hover:text-stone-700 ml-2">✕ clear</button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5 shrink-0">
            {([['situation', 'Situation'], ['exact', 'Exact count']] as [CountMode, string][]).map(([m, label]) => (
              <button key={m} onClick={() => setCountMode(m)} className={`font-mono uppercase tracking-wider rounded-md px-2.5 py-1 text-[10px] transition ${countMode === m ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>
                {label}
              </button>
            ))}
          </div>
          {countMode === 'situation' ? (
            <div className="flex flex-wrap gap-1.5">
              {SITUATIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setSituation(s)}
                  className={`font-mono uppercase tracking-wider rounded-full border px-3 py-1.5 text-[10px] transition ${
                    situation === s ? 'border-[#FF5722] text-[#FF5722] bg-orange-50' : 'border-stone-200 text-stone-500 hover:border-stone-300'
                  }`}
                >
                  {SITUATION_LABELS[s]}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {EXACT_COUNTS.map(c => (
                <button
                  key={c}
                  onClick={() => setExactCount(c)}
                  className={`font-mono rounded-full border px-3 py-1.5 text-[11px] transition ${
                    exactCount === c ? 'border-[#FF5722] text-[#FF5722] bg-orange-50 font-bold' : 'border-stone-200 text-stone-500 hover:border-stone-300'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-1.5">Baserunners</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setBaseStateFilter('any')}
              className={`font-mono uppercase tracking-wider rounded-full border px-3 py-1.5 text-[10px] transition ${baseStateFilter === 'any' ? 'border-[#FF5722] text-[#FF5722] bg-orange-50' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
            >
              Any
            </button>
            <button
              onClick={() => setBaseStateFilter('risp')}
              className={`font-mono uppercase tracking-wider rounded-full border px-3 py-1.5 text-[10px] transition ${baseStateFilter === 'risp' ? 'border-[#FF5722] text-[#FF5722] bg-orange-50' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
            >
              RISP
            </button>
            {BASE_STATES.map(bs => (
              <button
                key={bs}
                onClick={() => setBaseStateFilter(bs)}
                className={`font-mono uppercase tracking-wider rounded-full border px-3 py-1.5 text-[10px] transition ${baseStateFilter === bs ? 'border-[#FF5722] text-[#FF5722] bg-orange-50' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
              >
                {BASE_STATE_LABELS[bs]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-1.5">Pitch type</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setPitchTypeFilter('all')}
              className={`font-mono uppercase tracking-wider rounded-full border px-3 py-1.5 text-[10px] transition ${pitchTypeFilter === 'all' ? 'border-[#FF5722] text-[#FF5722] bg-orange-50' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
            >
              All pitches
            </button>
            {Object.entries(situational.pitchNames).map(([pt, name]) => (
              <button
                key={pt}
                onClick={() => setPitchTypeFilter(pt)}
                className={`font-mono rounded-full border px-3 py-1.5 text-[10px] transition flex items-center gap-1.5 ${pitchTypeFilter === pt ? 'border-[#FF5722] text-[#FF5722] bg-orange-50 font-bold' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: pitchColor(pt) }} />
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
            {(['all', 'vs_lhb', 'vs_rhb'] as Split[]).map(s => (
              <button key={s} onClick={() => setSplit(s)} className={`font-mono uppercase tracking-wider rounded-md px-2.5 py-1 text-[10px] transition ${split === s ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>
                {SPLIT_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {METRICS.map(m => (
              <button key={m.key} onClick={() => setMetric(m.key)} className={`font-mono uppercase tracking-wider rounded border px-2 py-1 text-[9px] transition ${metric === m.key ? 'border-[#FF5722] text-[#FF5722] bg-orange-50' : 'border-stone-200 text-stone-400 hover:border-stone-300'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grids */}
      <div className={`grid ${activeBatterZones ? 'md:grid-cols-2' : ''} gap-8`}>
        <div className="text-center">
          <p className="font-mono uppercase tracking-widest text-[10px] text-stone-500 mb-2">
            Pitcher — {countMode === 'exact' ? exactCount : SITUATION_LABELS[situation]}{baseStateFilter !== 'any' ? ` · ${baseStateFilter === 'risp' ? 'RISP' : BASE_STATE_LABELS[baseStateFilter]}` : ''}{pitchTypeFilter !== 'all' ? ` · ${situational.pitchNames[pitchTypeFilter] ?? pitchTypeFilter}` : ''}
          </p>
          {Object.keys(zones).length > 0 ? (
            <ZoneGrid zones={zones} metric={metric} view="catcher" minSample={effectiveMinSample} />
          ) : (
            <p className="text-[12px] font-serif italic text-stone-400 py-10">Not enough pitches in this situation/split yet.</p>
          )}
        </div>
        {activeBatterZones && (
          <div className="text-center">
            <p className="font-mono uppercase tracking-widest text-[10px] text-stone-500 mb-2">
              Matchup overlay — {batter?.fullName} ({batterSplit === 'vs_lhp' ? 'vs LHP' : batterSplit === 'vs_rhp' ? 'vs RHP' : 'all'})
            </p>
            <TiltGrid pitcherZones={zones} batterZones={activeBatterZones} />
            <p className="text-[9px] font-mono text-stone-400 mt-2">Blue = pitcher favored, red = batter favored. Real distance score (netTilt), not a raw stat.</p>
          </div>
        )}
      </div>
      <ZoneColorLegend metric={metric} minSample={effectiveMinSample} />

      {/* Batter's real most-used pitch/zone combos — same batter_zone_arsenal
          table used to feed the game plan below, shown directly so it's
          clear WHY the plan calls what it calls. */}
      {batter && (
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">
            {batter.fullName} — most-seen pitches ({batterSplit === 'vs_lhp' ? 'vs LHP' : batterSplit === 'vs_rhp' ? 'vs RHP' : 'all'})
          </p>
          <p className="text-[10px] font-mono text-stone-400 mb-4">Real BA/SLG/xwOBA/whiff per pitch type this season, plus his best real zone against it (excludes any zone flagged low-sample).</p>
          {batterArsenalRows.length === 0 ? (
            <p className="text-[12px] font-serif italic text-stone-400 py-6 text-center">Not enough real batter_zone_arsenal data for this batter yet.</p>
          ) : (
            <div className="space-y-1">
              {batterArsenalRows.map(r => (
                <div key={r.pitchType} className="flex items-center gap-3 py-2 border-b border-stone-50 last:border-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: pitchColor(r.pitchType) }} />
                  <span className="text-[12px] font-bold text-stone-900 w-32 shrink-0 truncate">{r.pitchName}</span>
                  <span className="text-[10px] font-mono text-stone-500 shrink-0">n={r.totalPitches}</span>
                  <span className="text-[10px] font-mono text-stone-600 flex-1">
                    {r.ba != null && <>BA <b className="text-stone-900">{r.ba.toFixed(3).replace(/^0/, '')}</b> · </>}
                    {r.slg != null && <>SLG <b className="text-stone-900">{r.slg.toFixed(3).replace(/^0/, '')}</b> · </>}
                    {r.xwoba != null && <>xwOBA <b className="text-stone-900">{r.xwoba.toFixed(3).replace(/^0/, '')}</b> · </>}
                    {r.whiffPct != null && <>Whiff <b className="text-stone-900">{r.whiffPct.toFixed(0)}%</b></>}
                  </span>
                  {r.bestZone && (
                    <span className="text-[9px] font-mono text-stone-400 shrink-0">Best zone: <b className="text-stone-600">{ZONE_LABELS[r.bestZone] ?? r.bestZone}</b></span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Game plan wristband */}
      <div className="bg-[#1A1A1A] rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#FF5722] font-bold mb-1">Game plan{batter ? ` vs ${batter.fullName}` : ''}</p>
        <p className="text-[10px] font-mono text-stone-400 mb-4">Ranked from every real (pitch, zone) combo seen enough to trust in that count (n≥8) — a primary call, a real change-up, and the one spot not to miss into.</p>
        {gamePlan.length === 0 ? (
          <p className="text-[12px] font-serif italic text-stone-400 py-6 text-center">Not enough situational data yet to build a game plan.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {gamePlan.map(entry => (
              <div key={entry.situation} className="bg-[#242424] rounded-lg p-4 border border-white/10">
                <p className="text-[9px] font-mono uppercase tracking-widest text-[#FF5722] mb-2">{entry.situationLabel} · {entry.candidateCount} options seen</p>

                <p className="text-[8px] font-mono uppercase tracking-widest text-green-400 mb-0.5">Call this</p>
                <p className="text-[15px] font-bold text-white leading-tight">{entry.primary.pitchName}</p>
                <p className="text-[12px] font-mono text-stone-300 mb-1.5">{entry.primary.zoneLabel}</p>
                <p className="text-[10px] text-stone-400 leading-snug mb-3">{entry.primary.rationale}</p>

                {entry.alternate && (
                  <div className="mb-3 pt-3 border-t border-white/10">
                    <p className="text-[8px] font-mono uppercase tracking-widest text-stone-400 mb-0.5">If that&apos;s been seen — change up</p>
                    <p className="text-[12px] font-bold text-stone-200 leading-tight">{entry.alternate.pitchName} <span className="font-mono font-normal text-stone-400">· {entry.alternate.zoneLabel}</span></p>
                    <p className="text-[9px] text-stone-500 leading-snug">{entry.alternate.rationale}</p>
                  </div>
                )}

                {entry.avoid && (
                  <div className="pt-3 border-t border-white/10">
                    <p className="text-[8px] font-mono uppercase tracking-widest text-red-400 mb-0.5">Do not miss here</p>
                    <p className="text-[12px] font-bold text-red-300 leading-tight">{entry.avoid.pitchName} <span className="font-mono font-normal text-stone-400">· {entry.avoid.zoneLabel}</span></p>
                    <p className="text-[9px] text-stone-500 leading-snug">{entry.avoid.rationale}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
