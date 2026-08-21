// src/components/admin/PostGameXCardPitcher.tsx
'use client'

// Post-game X/social card for a starting pitcher — 4:5 ratio (900w x
// ~1125h natural, matching ScoutReportGraphicCard's width:900/pixelRatio:3
// export convention). Reuses buildArsenalCard/computeStrikePct/
// computeOverallWhiffPct from pitcher-arsenal-card.ts (same functions
// powering PostGamePitcherArsenalCard) rather than re-deriving arsenal
// math — this is a condensed STATIC rendering of the same numbers, not a
// new data source.

import { useState, useRef } from 'react'
import type { PitcherGameLine, PitchRecord } from '@/types/postgame'
import type { GameInfo } from '@/lib/postgame'
import { buildArsenalCard, computeStrikePct, computeOverallWhiffPct } from '@/lib/pitcher-arsenal-card'

type Props = {
  pitcher: PitcherGameLine
  pitches: PitchRecord[]
  teamColor: string
  teamAbbr: string
  opponentAbbr: string
  grade?: string | null
  gameInfo: GameInfo
}

function mlbHeadshot(pitcherId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${pitcherId}/headshot/silo/current`
}
function outsToIP(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`
}

// Most-used count+pitch — same "headline fact" logic that used to live
// in the now-deleted postgame-pitch-sequence.ts, rebuilt small and local
// here rather than re-adding a whole file for one summary line.
function mostUsedCountPitch(pitches: PitchRecord[]): string | null {
  const counts = new Map<string, number>()
  for (const p of pitches) {
    if (!p.typeDescription) continue
    const key = `${p.countAfter.balls}-${p.countAfter.strikes}|${p.typeDescription}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let best: { key: string; n: number } | null = null
  for (const [key, n] of counts) {
    if (!best || n > best.n) best = { key, n }
  }
  if (!best) return null
  const [count, pitchName] = best.key.split('|')
  return `${pitchName} on ${count} (${best.n}x)`
}

function mostUsedZone(pitches: PitchRecord[]): number | null {
  const counts = new Map<number, number>()
  for (const p of pitches) {
    if (p.zone == null) continue
    counts.set(p.zone, (counts.get(p.zone) ?? 0) + 1)
  }
  let best: { zone: number; n: number } | null = null
  for (const [zone, n] of counts) {
    if (!best || n > best.n) best = { zone, n }
  }
  return best?.zone ?? null
}

export default function PostGameXCardPitcher({ pitcher, pitches, teamColor, teamAbbr, opponentAbbr, grade, gameInfo }: Props) {
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
      link.download = `postgame-${teamAbbr}-${pitcher.pitcherName.replace(/\s+/g, '-')}.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Pitcher X card export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  const { types } = buildArsenalCard(pitches)
  const strikePct = computeStrikePct(pitches)
  const whiffPct = computeOverallWhiffPct(pitches)
  const sequenceHeadline = mostUsedCountPitch(pitches)
  const zoneMode = mostUsedZone(pitches)

  const velos = types.map(t => t.avgVelo).filter((v): v is number => v != null)
  const minVelo = velos.length > 0 ? Math.min(...velos) : null
  const maxVelo = velos.length > 0 ? Math.max(...velos) : null

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
            <img src={mlbHeadshot(pitcher.pitcherId)} alt="" className="w-16 h-16 rounded-full object-cover border-2" style={{ borderColor: teamColor }} />
            <div>
              <h3 className="font-serif font-bold text-lg text-stone-900 leading-tight">{pitcher.pitcherName}</h3>
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

        {/* Row 2: Arsenal split bars | Box score mini */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-white rounded-xl border border-stone-200 p-3">
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-2">Arsenal usage</p>
            {types.slice(0, 5).map(t => (
              <div key={t.typeCode} className="flex items-center gap-2 mb-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />
                <span className="font-serif text-xs text-stone-800 w-20 shrink-0 truncate">{t.typeName}</span>
                <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${t.usagePct}%`, background: t.color }} />
                </div>
                <span className="font-mono text-[10px] text-stone-600 w-8 text-right">{t.usagePct}%</span>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-stone-200 p-3">
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-2">Box score</p>
            <div className="grid grid-cols-3 gap-1.5">
              {[['IP', outsToIP(pitcher.outsRecorded)], ['H', pitcher.hitsAllowed], ['R', pitcher.runsAllowed], ['ER', pitcher.earnedRunsAllowed], ['BB', pitcher.walks], ['K', pitcher.strikeouts]].map(([l, v]) => (
                <div key={l as string} className="bg-stone-50 rounded p-1.5 text-center">
                  <div className="font-mono text-sm font-bold text-stone-900">{v}</div>
                  <div className="font-mono text-[8px] uppercase text-stone-400">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 3: Sequencing mini */}
        <div className="bg-stone-50 rounded-xl border border-stone-200 p-3 mb-3">
          <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-1">Pitch sequencing</p>
          <p className="font-serif italic text-sm text-stone-800">
            {sequenceHeadline ? `Went to the ${sequenceHeadline}` : 'No dominant count/pitch pattern.'}
            {zoneMode != null && ` · most-thrown zone: ${zoneMode}`}
          </p>
        </div>

        {/* Row 4: Arsenal summary row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[['Min velo', minVelo != null ? minVelo.toFixed(1) : '—'], ['Max velo', maxVelo != null ? maxVelo.toFixed(1) : '—'], ['Whiff%', whiffPct != null ? `${whiffPct}%` : '—']].map(([l, v]) => (
            <div key={l as string} className="bg-white rounded-xl border border-stone-200 p-2.5 text-center">
              <div className="font-mono text-base font-bold text-stone-900">{v}</div>
              <div className="font-mono text-[8px] uppercase text-stone-400">{l}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[['Strike%', strikePct != null ? `${strikePct}%` : '—'], ['Pitches', pitches.length]].map(([l, v]) => (
            <div key={l as string} className="bg-white rounded-xl border border-stone-200 p-2.5 text-center">
              <div className="font-mono text-base font-bold text-stone-900">{v}</div>
              <div className="font-mono text-[8px] uppercase text-stone-400">{l}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center pt-2 border-t border-stone-100">
          <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400">The Edge · edgereportdaily.com</span>
        </div>
      </div>
    </div>
  )
}