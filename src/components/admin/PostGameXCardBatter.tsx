// src/components/admin/PostGameXCardBatter.tsx
'use client'

// Batter equivalent of PostGameXCardPitcher — same export pattern, same
// 4:5 dimensions. Reuses batterExitVeloSummary/buildZonesForBatter from
// postgame-batter-adapt.ts, same functions powering the interactive
// BatterBoxScoreSelector.

import { useState, useRef } from 'react'
import type { BatterGameLine, BattedBallRecord, PitchRecord } from '@/types/postgame'
import type { GameInfo } from '@/lib/postgame'
import { batterExitVeloSummary, buildZonesForBatter } from '@/lib/postgame-batter-adapt'

type Props = {
  batter: BatterGameLine
  battedBalls: BattedBallRecord[]
  pitchLog: PitchRecord[]
  teamColor: string
  teamAbbr: string
  opponentAbbr: string
  grade?: string | null
  gameInfo: GameInfo
}

function mlbHeadshot(batterId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${batterId}/headshot/silo/current`
}

export default function PostGameXCardBatter({ batter, battedBalls, pitchLog, teamColor, teamAbbr, opponentAbbr, grade, gameInfo }: Props) {
  const [isExporting, setIsExporting] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const handleExport = async () => {
    if (!cardRef.current || isExporting) return
    setIsExporting(true)
    try {
      let dataUrl = ''
      try {
        const { toPng } = await import('html-to-image')
        dataUrl = await toPng(cardRef.current, { cacheBust: true, backgroundColor: '#ffffff', pixelRatio: 3 })
      } catch {
        const html2canvas = (await import('html2canvas')).default
        const canvas = await html2canvas(cardRef.current, { backgroundColor: '#ffffff', scale: 3, useCORS: true })
        dataUrl = canvas.toDataURL('image/png')
      }
      const link = document.createElement('a')
      link.download = `postgame-${teamAbbr}-${batter.batterName.replace(/\s+/g, '-')}.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Batter X card export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  const evSummary = batterExitVeloSummary(battedBalls, batter.batterId)
  const zones = buildZonesForBatter(pitchLog, battedBalls, batter.batterId, batter.batterName, teamAbbr)

  return (
    <div>
      <div className="flex justify-end mb-2">
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="px-3 py-1.5 text-xs font-mono rounded bg-stone-900 text-white hover:bg-stone-700 transition disabled:opacity-50"
        >
          {isExporting ? 'Generating...' : 'Export PNG'}
        </button>
      </div>

      <div ref={cardRef} className="bg-white p-4" style={{ width: 900 }}>
        {/* Row 1: Headshot + grade | Game meta */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-white rounded-xl border-2 p-4 flex items-center gap-3" style={{ borderColor: teamColor }}>
            <img src={mlbHeadshot(batter.batterId)} alt="" className="w-16 h-16 rounded-full object-cover border-2" style={{ borderColor: teamColor }} />
            <div>
              <h3 className="font-serif font-bold text-lg text-stone-900 leading-tight">{batter.batterName}</h3>
              <p className="font-mono text-[10px] uppercase tracking-widest text-stone-500 mt-0.5">{teamAbbr}</p>
              {grade && (
                <span className="inline-block mt-1.5 px-2 py-0.5 rounded font-mono text-xs font-bold" style={{ background: `${teamColor}22`, color: teamColor }}>
                  Grade {grade}
                </span>
              )}
            </div>
          </div>
          <div className="bg-stone-50 rounded-xl border border-stone-200 p-4 flex flex-col justify-center">
            <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400">{teamAbbr} vs {opponentAbbr}</p>
            <p className="font-mono text-[10px] text-stone-500 mt-1">
              {gameInfo.venue ?? '—'}{gameInfo.attendance ? ` · ${gameInfo.attendance.toLocaleString()} att.` : ''}
            </p>
            <p className="font-mono text-[10px] text-stone-500 mt-0.5">
              {gameInfo.weatherCondition ?? ''}{gameInfo.tempF ? ` · ${gameInfo.tempF}°F` : ''}
            </p>
          </div>
        </div>

        {/* Row 2: Line | EV summary */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-white rounded-xl border border-stone-200 p-3">
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-2">Box score</p>
            <div className="grid grid-cols-4 gap-1.5">
              {[['AB', batter.atBats], ['H', batter.hits], ['R', batter.runsScored], ['RBI', batter.rbi], ['HR', batter.homeRuns], ['BB', batter.walks], ['K', batter.strikeouts], ['P', batter.pitchesSeen]].map(([l, v]) => (
                <div key={l as string} className="bg-stone-50 rounded p-1.5 text-center">
                  <div className="font-mono text-sm font-bold text-stone-900">{v}</div>
                  <div className="font-mono text-[8px] uppercase text-stone-400">{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-stone-200 p-3">
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-2">Exit velo</p>
            <div className="grid grid-cols-3 gap-1.5">
              {[['Min', evSummary.min], ['Max', evSummary.max], ['Avg', evSummary.avg]].map(([l, v]) => (
                <div key={l as string} className="bg-stone-50 rounded p-1.5 text-center">
                  <div className="font-mono text-sm font-bold text-stone-900">{v != null ? (v as number).toFixed(1) : '—'}</div>
                  <div className="font-mono text-[8px] uppercase text-stone-400">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 3: Compact pitch map */}
        <div className="bg-white rounded-xl border border-stone-200 p-3 mb-3">
          <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-2">Pitch map</p>
          {zones.pitches.filter(p => p.pX != null && p.pZ != null).length > 0 ? (
            <svg viewBox="0 0 260 260" className="w-40 h-40 mx-auto block">
              <rect x={78} y={65} width={104} height={130} fill="none" stroke="#78716c60" strokeWidth={1.5} />
              {zones.pitches.filter(p => p.pX != null && p.pZ != null).map((p, i) => {
                const x = 130 + (p.pX! / 2.5) * 110
                const y = 260 - (((p.pZ! - 0.5) / 4) * 260)
                const color = p.outcome === 'home_run' ? '#9333ea' : p.outcome === 'in_play_out' ? '#57534e'
                  : ['single', 'double', 'triple'].includes(p.outcome) ? '#22c55e'
                  : p.outcome === 'swinging_strike' ? '#dc2626' : p.outcome === 'called_strike' ? '#0ea5e9'
                  : p.outcome === 'foul' ? '#93c5fd' : '#a8a29e'
                return <circle key={i} cx={x} cy={y} r={4} fill={color} fillOpacity={0.8} stroke="#fff" strokeWidth={0.75} />
              })}
            </svg>
          ) : (
            <p className="text-center font-serif italic text-xs text-stone-400 py-6">No pitch location data.</p>
          )}
        </div>

        {/* Footer */}
        <div className="text-center pt-2 border-t border-stone-100">
          <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400">The Edge · edgereportdaily.com</span>
        </div>
      </div>
    </div>
  )
}