'use client'

// src/components/admin/InGameXCardSection.tsx
//
// Builder for the live-game X graphics — same control-panel shape and
// scaled-preview pattern as ScoutGraphicBuilder/GamePreviewBuilder (0.5x
// preview of the true 1080x1350 card, "Export PNG (3240x4050)" button).
// Fetches game data from the same /api/admin/postgame-graphic-data route
// used by the postgame cards (already game-state-agnostic — box score +
// live feed, no Final-status requirement), plus a per-pitcher arm-angle
// fetch (a genuinely different upstream, Savant CSV not the live feed).

import { useEffect, useState, useRef } from 'react'
import type { PitcherGameLine, BatterGameLine, PitchRecord, BattedBallRecord } from '@/types/postgame'
import type { GameInfo } from '@/lib/postgame'
import type { PitcherGameArmAngle } from '@/lib/pitcher-game-arm-angle'
import type { BatterSeasonStats, BatterStatcast } from '@/lib/batter-stats'
import InGamePitcherCard from './InGamePitcherCard'
import InGameBatterCard from './InGameBatterCard'

export type LiveGameOption = {
  gamePk: number
  matchup: string
}

type GraphicData = {
  awayAbbr: string
  homeAbbr: string
  awayTeamId: number
  homeTeamId: number
  awayColor: string
  homeColor: string
  gameInfo: GameInfo
  pitchers: PitcherGameLine[]
  pitchLog: PitchRecord[]
  batters: { away: BatterGameLine[]; home: BatterGameLine[] }
  battedBalls: BattedBallRecord[]
}

type Props = {
  games: LiveGameOption[]
}

const selectCls = 'font-mono text-xs border border-stone-300 rounded px-2 py-1.5 bg-white min-w-[160px] disabled:opacity-50'
const labelCls = 'block font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-1'

export default function InGameXCardSection({ games }: Props) {
  const [selectedGamePk, setSelectedGamePk] = useState<number | null>(games[0]?.gamePk ?? null)
  const [data, setData] = useState<GraphicData | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'pitcher' | 'batter'>('pitcher')
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null)
  const [armAngle, setArmAngle] = useState<PitcherGameArmAngle | null>(null)
  const [armAngleLoading, setArmAngleLoading] = useState(false)
  const [batterSeason, setBatterSeason] = useState<{ seasonStats: BatterSeasonStats | null; statcast: BatterStatcast | null } | null>(null)
  const [batterSeasonLoading, setBatterSeasonLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedGamePk) return
    setLoading(true)
    setData(null)
    setSelectedPlayerId(null)
    fetch(`/api/admin/postgame-graphic-data?gamePk=${selectedGamePk}`)
      .then(r => r.json())
      .then(json => { if (!json.error) setData(json) })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [selectedGamePk])

  useEffect(() => {
    if (mode !== 'pitcher' || !selectedPlayerId || !selectedGamePk) { setArmAngle(null); return }
    setArmAngle(null)
    setArmAngleLoading(true)
    fetch(`/api/admin/pitcher-game-arm-angle?pitcherId=${selectedPlayerId}&gamePk=${selectedGamePk}`)
      .then(r => r.json())
      .then(json => { if (!json.error) setArmAngle(json) })
      .catch(() => setArmAngle(null))
      .finally(() => setArmAngleLoading(false))
  }, [mode, selectedPlayerId, selectedGamePk])

  useEffect(() => {
    if (mode !== 'batter' || !selectedPlayerId) { setBatterSeason(null); return }
    setBatterSeason(null)
    setBatterSeasonLoading(true)
    fetch(`/api/admin/batter-game-vs-season?playerId=${selectedPlayerId}`)
      .then(r => r.json())
      .then(json => setBatterSeason(json))
      .catch(() => setBatterSeason(null))
      .finally(() => setBatterSeasonLoading(false))
  }, [mode, selectedPlayerId])

  if (games.length === 0) {
    return <div className="text-sm font-mono text-stone-400 italic">No live games right now for an in-game graphic.</div>
  }

  const pitcherOptions = data ? data.pitchers.filter(p => data.pitchLog.some(pl => pl.pitcherId === p.pitcherId)) : []
  const batterOptions = data ? [...data.batters.away, ...data.batters.home].filter(b => b.plateAppearances > 0) : []

  const pitcher = mode === 'pitcher' && data ? pitcherOptions.find(p => p.pitcherId === selectedPlayerId) ?? null : null
  const pitcherTeamAbbr = pitcher && data ? (pitcher.teamId === data.awayTeamId ? data.awayAbbr : data.homeAbbr) : ''

  const isAwayBatter = mode === 'batter' && data ? data.batters.away.some(b => b.batterId === selectedPlayerId) : false
  const batter = mode === 'batter' && data
    ? (isAwayBatter ? data.batters.away : data.batters.home).find(b => b.batterId === selectedPlayerId) ?? null
    : null
  const batterTeamAbbr = batter && data ? (isAwayBatter ? data.awayAbbr : data.homeAbbr) : ''

  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  const handleExport = async () => {
    if (!cardRef.current || isExporting) return
    setIsExporting(true)
    setExportError(null)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(cardRef.current, { cacheBust: true, backgroundColor: '#FAF8F3', pixelRatio: 3 })
      const link = document.createElement('a')
      const who = pitcher?.pitcherName ?? batter?.batterName ?? 'ingame'
      link.download = `ingame-${who}`.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() + '.png'
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('[InGameXCardSection] export failed:', err)
      setExportError('Export failed — check the console.')
    } finally {
      setIsExporting(false)
    }
  }

  const hasCard = !!(pitcher || batter)

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-end mb-3">
        <div>
          <label className={labelCls}>Game</label>
          <select
            value={selectedGamePk ?? ''}
            onChange={e => setSelectedGamePk(Number(e.target.value))}
            className={selectCls}
          >
            {games.map(g => <option key={g.gamePk} value={g.gamePk}>{g.matchup}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Card type</label>
          <div className="flex rounded overflow-hidden border border-stone-300">
            {(['pitcher', 'batter'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setSelectedPlayerId(null) }}
                className={`px-3 py-1.5 text-xs font-mono uppercase ${mode === m ? 'bg-stone-900 text-white' : 'bg-white text-stone-600'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Player</label>
          <select
            value={selectedPlayerId ?? ''}
            onChange={e => setSelectedPlayerId(e.target.value ? Number(e.target.value) : null)}
            className={selectCls}
            disabled={!data}
          >
            <option value="">— select {mode} —</option>
            {mode === 'pitcher'
              ? pitcherOptions.map(p => <option key={p.pitcherId} value={p.pitcherId}>{p.pitcherName}</option>)
              : batterOptions.map(b => <option key={b.batterId} value={b.batterId}>{b.batterName}</option>)
            }
          </select>
          {loading && <span className="ml-2 text-[10px] font-mono text-stone-400">loading…</span>}
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting || !hasCard}
          className="ml-auto px-3 py-1.5 text-xs font-mono rounded bg-stone-900 text-white hover:bg-stone-700 transition disabled:opacity-50"
        >
          {isExporting ? 'Generating…' : 'Export PNG (3240×4050)'}
        </button>
      </div>

      {exportError && <p className="text-[11px] font-mono text-red-600 mb-2">{exportError}</p>}

      {!hasCard ? (
        <p className="text-sm font-mono text-stone-400 italic">{loading ? 'Loading game data…' : `Select a ${mode} to preview the card.`}</p>
      ) : (
        <div style={{ width: 540, height: 675, overflow: 'hidden', border: '1px solid #e7e2d8', borderRadius: 8 }}>
          <div style={{ transform: 'scale(0.5)', transformOrigin: 'top left', width: 1080, height: 1350 }}>
            {pitcher && data && (
              <InGamePitcherCard
                ref={cardRef}
                dateLabel={dateLabel}
                awayTeamId={data.awayTeamId}
                homeTeamId={data.homeTeamId}
                pitcher={pitcher}
                pitches={data.pitchLog.filter(p => p.pitcherId === pitcher.pitcherId)}
                gamePk={selectedGamePk!}
                teamColor={pitcherTeamAbbr === data.awayAbbr ? data.awayColor : data.homeColor}
                teamAbbr={pitcherTeamAbbr}
                opponentAbbr={pitcherTeamAbbr === data.awayAbbr ? data.homeAbbr : data.awayAbbr}
                gameInfo={data.gameInfo}
                armAngle={armAngle}
                armAngleLoading={armAngleLoading}
              />
            )}
            {batter && data && (
              <InGameBatterCard
                ref={cardRef}
                dateLabel={dateLabel}
                awayTeamId={data.awayTeamId}
                homeTeamId={data.homeTeamId}
                batter={batter}
                battedBalls={data.battedBalls}
                pitchLog={data.pitchLog}
                teamColor={isAwayBatter ? data.awayColor : data.homeColor}
                teamAbbr={batterTeamAbbr}
                opponentAbbr={isAwayBatter ? data.homeAbbr : data.awayAbbr}
                gameInfo={data.gameInfo}
                seasonStats={batterSeason?.seasonStats ?? null}
                statcast={batterSeason?.statcast ?? null}
                seasonLoading={batterSeasonLoading}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
