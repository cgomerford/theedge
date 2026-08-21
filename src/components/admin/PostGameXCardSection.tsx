// src/components/admin/PostGameXCardSection.tsx
'use client'

import { useState, useEffect } from 'react'
import type { PitcherGameLine, BatterGameLine, PitchRecord, BattedBallRecord } from '@/types/postgame'
import type { GameInfo } from '@/lib/postgame'
import PostGameXCardPitcher from './PostGameXCardPitcher'
import PostGameXCardBatter from './PostGameXCardBatter'

export type FinishedGameOption = {
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
  games: FinishedGameOption[]
  gradeLookup: Map<string, string> // key: `${playerName}|${teamAbbr}` -> grade
}

export default function PostGameXCardSection({ games, gradeLookup }: Props) {
  const [selectedGamePk, setSelectedGamePk] = useState<number | null>(games[0]?.gamePk ?? null)
  const [data, setData] = useState<GraphicData | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'pitcher' | 'batter'>('pitcher')
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null)

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

  if (games.length === 0) {
    return <div className="text-sm font-mono text-stone-400 italic">No finished games yet for a post-game graphic.</div>
  }

  const pitcherOptions = data ? data.pitchers.filter(p => data.pitchLog.some(pl => pl.pitcherId === p.pitcherId)) : []
  const batterOptions = data ? [...data.batters.away, ...data.batters.home].filter(b => b.plateAppearances > 0) : []

  return (
    <div>
      <div className="flex gap-3 mb-3 flex-wrap">
        <select
          value={selectedGamePk ?? ''}
          onChange={e => setSelectedGamePk(Number(e.target.value))}
          className="font-mono text-xs border border-stone-300 rounded px-2 py-1.5 bg-white"
        >
          {games.map(g => <option key={g.gamePk} value={g.gamePk}>{g.matchup}</option>)}
        </select>

        <div className="flex rounded overflow-hidden border border-stone-300">
          {(['pitcher', 'batter'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setSelectedPlayerId(null) }}
              className={`px-3 py-1.5 text-xs font-mono uppercase ${mode === m ? 'bg-stone-900 text-white' : 'bg-white text-stone-600'}`}
            >
              {m}
            </button>
          ))}
        </div>

        {data && (
          <select
            value={selectedPlayerId ?? ''}
            onChange={e => setSelectedPlayerId(Number(e.target.value))}
            className="font-mono text-xs border border-stone-300 rounded px-2 py-1.5 bg-white min-w-[180px]"
          >
            <option value="">— select {mode} —</option>
            {mode === 'pitcher'
              ? pitcherOptions.map(p => <option key={p.pitcherId} value={p.pitcherId}>{p.pitcherName}</option>)
              : batterOptions.map(b => <option key={b.batterId} value={b.batterId}>{b.batterName}</option>)
            }
          </select>
        )}
      </div>

      {loading && <p className="font-mono text-xs text-stone-400">Loading game data...</p>}

       {data && mode === 'pitcher' && selectedPlayerId && (() => {
        const pitcher = pitcherOptions.find(p => p.pitcherId === selectedPlayerId)
        if (!pitcher) return null
        const teamAbbr = pitcher.teamId === data.awayTeamId ? data.awayAbbr : data.homeAbbr
        const grade = gradeLookup.get(`${pitcher.pitcherName}|${teamAbbr}`) ?? null
        return (
          <PostGameXCardPitcher
            pitcher={pitcher}
            pitches={data.pitchLog.filter(p => p.pitcherId === pitcher.pitcherId)}
            teamColor={teamAbbr === data.awayAbbr ? data.awayColor : data.homeColor}
            teamAbbr={teamAbbr}
            opponentAbbr={teamAbbr === data.awayAbbr ? data.homeAbbr : data.awayAbbr}
            grade={grade}
            gameInfo={data.gameInfo}
          />
        )
      })()}

      {data && mode === 'batter' && selectedPlayerId && (() => {
        const isAway = data.batters.away.some(b => b.batterId === selectedPlayerId)
        const batter = isAway ? data.batters.away.find(b => b.batterId === selectedPlayerId) : data.batters.home.find(b => b.batterId === selectedPlayerId)
        if (!batter) return null
        const teamAbbr = isAway ? data.awayAbbr : data.homeAbbr
        const grade = gradeLookup.get(`${batter.batterName}|${teamAbbr}`) ?? null
        return (
          <PostGameXCardBatter
            batter={batter}
            battedBalls={data.battedBalls}
            pitchLog={data.pitchLog}
            teamColor={isAway ? data.awayColor : data.homeColor}
            teamAbbr={teamAbbr}
            opponentAbbr={isAway ? data.homeAbbr : data.awayAbbr}
            grade={grade}
            gameInfo={data.gameInfo}
          />
        )
      })()}
    </div>
  )
}