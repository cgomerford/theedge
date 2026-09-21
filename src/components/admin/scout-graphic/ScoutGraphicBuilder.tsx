'use client'

// src/components/admin/scout-graphic/ScoutGraphicBuilder.tsx
//
// Admin builder for the Scout Report Graphic (replaces ScoutReportGraphicSection).
// Default state = the starting pitcher only. Pick a batter and the key-matchup
// section appears with his zone overlay against a chosen pitch; H2H and the
// career record at the game's ballpark are optional toggles.
//
// Data flow: the dashboard server page hands in per-game pitcher data + opposing
// rosters (one server pass). Picking a batter calls /api/admin/scout-matchup
// (season line, handedness, H2H, park record, zone-by-pitch) — a server route
// because the zone table needs the service-role Supabase client.
//
// "The read" is auto-drafted from the numbers on the card and editable; an
// edit is kept only while the pitcher/batter/pitch/metric stay the same, so a
// stale sentence can never sit under a different matchup.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RichArsenalPitch } from '@/components/PitchLocationCard'
import type { PitcherHotZones } from '@/lib/hot-zones'
import type { PitcherGameLog } from '@/lib/mlb'
import type { ScoutMatchup } from '@/lib/scout-matchup'
import ScoutGraphicCard, { type CardPitcher } from './ScoutGraphicCard'
import { METRIC_LABELS, draftRead, effectiveStands, splitForPitcher, type ZoneMetric } from './zone-utils'

export type BuilderRosterBatter = { id: number; name: string }

export type BuilderPitcherSide = {
  id: number | null
  name: string
  throws: 'L' | 'R'
  stats: CardPitcher['stats']
  last3: PitcherGameLog[]
  arsenal: RichArsenalPitch[]
  hotZones: Record<string, PitcherHotZones>
  /** Set when the numbers are minor-league (pitcher has no 2026 MLB rows); null = MLB data. */
  levelLabel: string | null
}

export type BuilderGame = {
  gamePk: number
  matchup: string
  awayAbbr: string
  homeAbbr: string
  awayTeamId: number | null
  homeTeamId: number | null
  awayColor: string
  homeColor: string
  venueId: number | null
  venueName: string
  firstPitch: string   // e.g. '7:05 PM ET' ('' when the schedule has no time)
  away: BuilderPitcherSide
  home: BuilderPitcherSide
  awayRoster: BuilderRosterBatter[]
  homeRoster: BuilderRosterBatter[]
}

type Side = 'away' | 'home'
const METRICS: ZoneMetric[] = ['slg', 'ba', 'xwoba', 'whiff_pct']

const selectCls = 'font-mono text-xs border border-stone-300 rounded px-2 py-1.5 bg-white min-w-[160px] disabled:opacity-50'
const labelCls = 'block font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-1'

function Toggle({ on, disabled, note, onClick, children }: { on: boolean; disabled?: boolean; note?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`font-mono text-[10px] uppercase tracking-wider rounded-full border px-3 py-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed ${
        on && !disabled ? 'bg-stone-900 border-stone-900 text-white' : 'bg-white border-stone-300 text-stone-500'
      }`}
    >
      {children}{note ? ` · ${note}` : ''}
    </button>
  )
}

export default function ScoutGraphicBuilder({ games, slateDate }: { games: BuilderGame[]; slateDate: string }) {
  const [gameIdx, setGameIdx] = useState(0)
  const [side, setSide] = useState<Side>('away')
  const [batterId, setBatterId] = useState<number | null>(null)
  const [pitchCode, setPitchCode] = useState<string | null>(null)
  const [metric, setMetric] = useState<ZoneMetric>('slg')
  const [showH2h, setShowH2h] = useState(false)
  const [showPark, setShowPark] = useState(false)
  const [showArsenal, setShowArsenal] = useState(true)
  const [showForm, setShowForm] = useState(true)
  const [readEdit, setReadEdit] = useState<{ key: string; text: string } | null>(null)

  const [matchup, setMatchup] = useState<ScoutMatchup | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const game = games[Math.min(gameIdx, Math.max(games.length - 1, 0))]

  const pitcherSide = game ? (side === 'away' ? game.away : game.home) : null
  const roster = game ? (side === 'away' ? game.homeRoster : game.awayRoster) : []
  const battingAbbr = game ? (side === 'away' ? game.homeAbbr : game.awayAbbr) : ''
  const battingColor = game ? (side === 'away' ? game.homeColor : game.awayColor) : '#1A1A1A'
  const pitcherAbbr = game ? (side === 'away' ? game.awayAbbr : game.homeAbbr) : ''
  const pitcherColor = game ? (side === 'away' ? game.awayColor : game.homeColor) : '#1A1A1A'
  const pitcherId = pitcherSide?.id ?? null
  const gamePk = game?.gamePk ?? 0
  const venueId = game?.venueId ?? null

  // Changing the game or which side is pitching invalidates the chosen batter.
  useEffect(() => { setBatterId(null); setPitchCode(null); setMatchup(null) }, [gamePk, side])

  useEffect(() => {
    if (!batterId) { setMatchup(null); setFetchError(null); return }
    let cancelled = false
    setLoading(true)
    setMatchup(null)
    setFetchError(null)
    const qs = new URLSearchParams({ batterId: String(batterId) })
    if (pitcherId) qs.set('pitcherId', String(pitcherId))
    if (venueId) qs.set('venueId', String(venueId))
    fetch(`/api/admin/scout-matchup?${qs}`)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then((data: ScoutMatchup) => { if (!cancelled) setMatchup(data) })
      .catch(err => {
        console.error('[ScoutGraphicBuilder] matchup fetch failed:', err)
        if (!cancelled) setFetchError('Could not load matchup data — try re-selecting the batter.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [batterId, pitcherId, venueId])

  const batterName = roster.find(b => b.id === batterId)?.name ?? ''

  // Zone data for the split that matches the pitcher's hand, falling back to 'all'
  // (same rule BatterAttackPlanCard uses).
  const splitKey = pitcherSide ? splitForPitcher(pitcherSide.throws) : 'all'
  const zoneData = matchup ? matchup.zoneArsenal[splitKey] ?? matchup.zoneArsenal['all'] ?? null : null
  const splitLabel = zoneData ? (zoneData.split === 'all' ? 'all pitchers' : zoneData.split === 'vs_lhp' ? 'vs LHP' : 'vs RHP') : ''

  const pitchOptions = useMemo(() => {
    if (!zoneData || !pitcherSide) return []
    const usage = new Map(pitcherSide.arsenal.map(p => [p.pitch_type, p.percentage]))
    return Object.entries(zoneData.arsenal)
      .map(([code, p]) => ({ code, name: p.pitch_name, usage: usage.get(code) ?? null, total: p.total_pitches }))
      .sort((a, b) => (b.usage ?? -1) - (a.usage ?? -1) || b.total - a.total)
  }, [zoneData, pitcherSide])

  const activeCode = pitchOptions.find(o => o.code === pitchCode)?.code ?? pitchOptions[0]?.code ?? null
  const activePitch = activeCode && zoneData ? zoneData.arsenal[activeCode] ?? null : null
  const activeOption = pitchOptions.find(o => o.code === activeCode) ?? null

  const stands = pitcherSide ? effectiveStands(matchup?.batSide ?? null, pitcherSide.throws) : null
  const readKey = `${gamePk}|${side}|${batterId}|${activeCode}|${metric}`
  const drafted = useMemo(() => (
    batterId && pitcherSide && activePitch
      ? draftRead({ batterName, pitcherName: pitcherSide.name, pitchName: activePitch.pitch_name, pitcherUsagePct: activeOption?.usage ?? null, pitch: activePitch, metric, stands })
      : ''
  ), [batterId, batterName, pitcherSide, activePitch, activeOption, metric, stands])
  const read = readEdit && readEdit.key === readKey ? readEdit.text : drafted

  if (!game || !pitcherSide) {
    return <div className="text-sm font-mono text-stone-400 italic">No games with report data for this slate yet.</div>
  }

  const pitcherKnown = pitcherId != null
  const noH2h = matchup != null && matchup.h2h == null
  const noPark = venueId == null || (matchup != null && matchup.venue == null)
  const batterPicked = batterId != null

  const cardPitcher: CardPitcher = {
    id: pitcherId ?? 0,
    name: pitcherSide.name,
    abbr: pitcherAbbr,
    oppAbbr: battingAbbr,
    color: pitcherColor,
    throws: pitcherSide.throws,
    stats: pitcherSide.stats,
    last3: pitcherSide.last3,
    arsenal: pitcherSide.arsenal,
    hotZones: pitcherSide.hotZones,
    levelLabel: pitcherSide.levelLabel,
  }

  const handleExport = async () => {
    if (!cardRef.current || isExporting) return
    setIsExporting(true)
    setExportError(null)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(cardRef.current, { cacheBust: true, backgroundColor: '#FAF8F3', pixelRatio: 3 })
      const link = document.createElement('a')
      const who = batterName ? `${pitcherSide.name}-vs-${batterName}` : pitcherSide.name
      link.download = `scout-${who}`.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() + '.png'
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('[ScoutGraphicBuilder] export failed:', err)
      setExportError('Export failed — check the console.')
    } finally {
      setIsExporting(false)
    }
  }

  const dateLabel = new Date(`${slateDate}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-end mb-3">
        <div>
          <label className={labelCls}>Game</label>
          <select value={gameIdx} onChange={e => setGameIdx(Number(e.target.value))} className={selectCls}>
            {games.map((g, i) => <option key={g.gamePk} value={i}>{g.matchup}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>On the mound</label>
          <select value={side} onChange={e => setSide(e.target.value as Side)} className={selectCls}>
            <option value="away">{game.awayAbbr} · {game.away.name}</option>
            <option value="home">{game.homeAbbr} · {game.home.name}</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Key matchup batter</label>
          <select
            value={batterId ?? ''}
            onChange={e => { setBatterId(e.target.value ? Number(e.target.value) : null); setPitchCode(null) }}
            className={selectCls}
            disabled={!pitcherKnown}
          >
            <option value="">— none (pitcher only) —</option>
            {[...roster].sort((a, b) => a.name.localeCompare(b.name)).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {loading && <span className="ml-2 text-[10px] font-mono text-stone-400">loading…</span>}
        </div>
        <div>
          <label className={labelCls}>Overlay pitch</label>
          <select value={activeCode ?? ''} onChange={e => setPitchCode(e.target.value)} className={selectCls} disabled={pitchOptions.length === 0}>
            {pitchOptions.length === 0 && <option value="">{batterPicked && !loading ? 'no zone data' : '—'}</option>}
            {pitchOptions.map(o => <option key={o.code} value={o.code}>{o.name}{o.usage != null ? ` (${Math.round(o.usage)}%)` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Overlay metric</label>
          <select value={metric} onChange={e => setMetric(e.target.value as ZoneMetric)} className={selectCls}>
            {METRICS.map(m => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-3">
        <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mr-1">Modules</span>
        <Toggle on={showArsenal} onClick={() => setShowArsenal(v => !v)}>Arsenal bars</Toggle>
        <Toggle on={showForm} onClick={() => setShowForm(v => !v)}>L3 form</Toggle>
        <Toggle on={showH2h} disabled={!batterPicked || noH2h} note={batterPicked && noH2h ? 'no data' : undefined} onClick={() => setShowH2h(v => !v)}>H2H record</Toggle>
        <Toggle on={showPark} disabled={!batterPicked || noPark} note={batterPicked && noPark ? 'no data' : undefined} onClick={() => setShowPark(v => !v)}>Record at {game.venueName || 'park'}</Toggle>
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting || !pitcherKnown}
          className="ml-auto px-3 py-1.5 text-xs font-mono rounded bg-stone-900 text-white hover:bg-stone-700 transition disabled:opacity-50"
        >
          {isExporting ? 'Generating…' : 'Export PNG (3240×4050)'}
        </button>
      </div>

      {!pitcherKnown && (
        <p className="text-[11px] font-mono text-orange-600 mb-2">⚠ No probable pitcher announced for {side === 'away' ? game.awayAbbr : game.homeAbbr} — choose the other side or check back later.</p>
      )}
      {pitcherKnown && pitcherSide.stats == null && pitcherSide.arsenal.length === 0 && (
        <p className="text-[11px] font-mono text-orange-600 mb-2">⚠ No season stats or arsenal on file for {pitcherSide.name} yet — the graphic will be mostly empty states.</p>
      )}
      {(game.awayTeamId == null || game.homeTeamId == null) && (
        <p className="text-[11px] font-mono text-orange-600 mb-2">⚠ Team ID lookup failed for this game — logos will be missing.</p>
      )}
      {fetchError && <p className="text-[11px] font-mono text-red-600 mb-2">{fetchError}</p>}
      {exportError && <p className="text-[11px] font-mono text-red-600 mb-2">{exportError}</p>}

      <div className="flex flex-wrap gap-6 items-start">
        {/* Preview at 50%; the ref'd node inside is the true 1080x1350 that gets exported. */}
        <div style={{ width: 540, height: 675, flex: '0 0 540px', overflow: 'hidden', border: '1px solid #e7e2d8', borderRadius: 8 }}>
          <div style={{ transform: 'scale(0.5)', transformOrigin: 'top left', width: 1080, height: 1350 }}>
            <ScoutGraphicCard
              ref={cardRef}
              dateLabel={dateLabel}
              awayTeamId={game.awayTeamId ?? 0}
              homeTeamId={game.homeTeamId ?? 0}
              awayAbbr={game.awayAbbr}
              homeAbbr={game.homeAbbr}
              venueName={game.venueName}
              pitcher={cardPitcher}
              batter={batterPicked ? {
                id: batterId!, name: batterName, abbr: battingAbbr, color: battingColor,
                batSide: matchup?.batSide ?? null, position: matchup?.position ?? null, season: matchup?.season ?? null,
              } : null}
              overlay={batterPicked && matchup ? {
                pitchName: activePitch?.pitch_name ?? activeOption?.name ?? 'pitch',
                metric,
                pitch: activePitch,
                splitLabel,
                stands,
              } : null}
              read={read}
              showArsenal={showArsenal}
              showForm={showForm}
              h2h={showH2h ? matchup?.h2h ?? null : null}
              venue={showPark ? matchup?.venue ?? null : null}
            />
          </div>
        </div>

        <div className="flex-1 min-w-[280px] max-w-[520px]">
          <label className={labelCls}>The read {batterPicked ? '(editable — **bold** supported)' : ''}</label>
          <textarea
            value={read}
            onChange={e => setReadEdit({ key: readKey, text: e.target.value })}
            disabled={!batterPicked}
            rows={7}
            placeholder={batterPicked ? 'No zone clears the 5-AB floor yet — write your own read, or leave blank.' : 'Select a batter to draft a read from the numbers on the card.'}
            className="w-full font-mono text-xs border border-stone-300 rounded p-2 bg-white disabled:opacity-50"
          />
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={() => setReadEdit(null)}
              disabled={!readEdit || readEdit.key !== readKey}
              className="font-mono text-[10px] uppercase tracking-wider text-stone-500 underline disabled:opacity-40 disabled:no-underline"
            >
              Reset to draft
            </button>
          </div>
          <p className="font-mono text-[10px] text-stone-400 mt-3 leading-relaxed">
            Draft is built only from the zone numbers on the card (best and quietest spot with 5+ AB/swings, and how often the pitcher throws the pitch).
            H2H and park record appear on the card only when a real sample exists. Reads describe what has happened — no picks or predictions.
          </p>
        </div>
      </div>
    </div>
  )
}
