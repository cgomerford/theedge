'use client'

// src/components/game-preview/PerformerCardModal.tsx
//
// Expanded, downloadable version of a SeriesTopPerformers chip — same
// export mechanism as the admin dashboard's PostGameXCardBatter/Pitcher
// (html-to-image, falling back to html2canvas, same as that component
// uses), and the same "The Edge · edgereportdaily.com" watermark footer
// those admin cards already carry, so a downloaded PNG is traceable back
// to the site if it gets shared around.

import { useState, useRef } from 'react'
import type { BatterPerformance, PitcherPerformance, Grade } from '@/lib/mlb-recap'
import type { SeriesBatterLine, SeriesPitcherLine } from '@/lib/series-stats'
import DetailModal from './DetailModal'

function gradeColor(g: Grade): string {
  if (g.startsWith('A')) return '#15803d'
  if (g.startsWith('B')) return '#1A1A1A'
  if (g.startsWith('C')) return '#FF5722'
  return '#DC2626'
}

type Performer =
  | { kind: 'batter'; data: BatterPerformance; seriesLine: SeriesBatterLine | null }
  | { kind: 'pitcher'; data: PitcherPerformance; seriesLine: SeriesPitcherLine | null }

function seasonStatRows(p: Performer): [string, string][] {
  if (p.kind === 'batter') {
    const { seasonAVG, seasonOPS, seasonHR, seasonRBI } = p.data
    return [
      ['AVG', seasonAVG ?? '—'],
      ['OPS', seasonOPS ?? '—'],
      ['HR', seasonHR != null ? String(seasonHR) : '—'],
      ['RBI', seasonRBI != null ? String(seasonRBI) : '—'],
    ]
  }
  const { seasonERA, seasonWHIP, seasonK } = p.data
  return [
    ['ERA', seasonERA ?? '—'],
    ['WHIP', seasonWHIP ?? '—'],
    ['K', seasonK != null ? String(seasonK) : '—'],
  ]
}

// Series totals come from a separately-fetched aggregate (SeriesBatterLine/
// SeriesPitcherLine), not this performance object — a player can rack up
// this series' totals across MULTIPLE games, while `data.line` below is
// just the one game this card is actually about.
function seriesStatRows(p: Performer): [string, string][] | null {
  if (p.kind === 'batter') {
    if (!p.seriesLine) return null
    const { avg, ab, hits, home_runs, rbi } = p.seriesLine
    return [
      ['AVG', avg],
      ['AB', String(ab)],
      ['H', String(hits)],
      ['HR', String(home_runs)],
      ['RBI', String(rbi)],
    ]
  }
  if (!p.seriesLine) return null
  const { ip, earnedRuns, strikeouts, walks } = p.seriesLine
  return [
    ['IP', ip],
    ['ER', String(earnedRuns)],
    ['K', String(strikeouts)],
    ['BB', String(walks)],
  ]
}

export default function PerformerCardModal({ performer, onClose }: { performer: Performer; onClose: () => void }) {
  const [isExporting, setIsExporting] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const { name, teamAbbr, headshot, line, grade, gameNumber } = performer.data
  const c = gradeColor(grade)
  const seasonRows = seasonStatRows(performer)
  const seriesRows = seriesStatRows(performer)
  const gamesInSeries = performer.kind === 'batter' ? performer.seriesLine?.gamesPlayed ?? null : performer.seriesLine?.gamesPitched ?? null

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
      link.download = `series-performer-${teamAbbr}-${name.replace(/\s+/g, '-')}.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Performer card export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <DetailModal eyebrow={performer.kind === 'batter' ? 'Top batter — this series' : 'Top pitcher — this series'} title={name} onClose={onClose}>
      <div className="flex justify-end mb-3">
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="px-3 py-1.5 text-xs font-mono rounded-lg bg-stone-900 text-white hover:bg-stone-700 transition disabled:opacity-50"
        >
          {isExporting ? 'Generating…' : 'Download PNG'}
        </button>
      </div>

      <div ref={cardRef} className="bg-white p-5 rounded-2xl border border-stone-200">
        <div className="flex items-center gap-4 mb-4">
          <div
            className="rounded-full flex items-center justify-center shrink-0 font-sans font-bold"
            style={{ fontSize: 22, lineHeight: 1, color: c, border: `3px solid ${c}`, width: 56, height: 56 }}
          >
            {grade}
          </div>
          <img src={headshot} alt="" className="w-16 h-16 rounded-full object-cover bg-stone-200 border-2 border-stone-100 shrink-0" />
          <div className="min-w-0">
            <h3 className="font-sans font-bold text-lg text-stone-900 leading-tight truncate">{name}</h3>
            <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mt-0.5">{teamAbbr} · This series</p>
          </div>
        </div>

        <div className="bg-stone-50 rounded-xl border border-stone-200 p-3 mb-4">
          <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-1">
            {gameNumber != null ? `Game ${gameNumber}` : 'This game'}
          </p>
          <p className="font-mono text-base font-bold text-stone-900">{line}</p>
        </div>

        {seriesRows && (
          <div className="mb-4">
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-1.5">
              Series totals{gamesInSeries != null ? ` · ${gamesInSeries} G` : ''}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {seriesRows.map(([label, value]) => (
                <div key={label} className="bg-stone-50 rounded-lg p-2 text-center border border-stone-100">
                  <div className="font-mono text-sm font-bold text-stone-900">{value}</div>
                  <div className="font-mono text-[8px] uppercase text-stone-400 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4">
          <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-1.5">This season</p>
          <div className="grid grid-cols-4 gap-2">
            {seasonRows.map(([label, value]) => (
              <div key={label} className="bg-stone-50 rounded-lg p-2 text-center border border-stone-100">
                <div className="font-mono text-sm font-bold text-stone-900">{value}</div>
                <div className="font-mono text-[8px] uppercase text-stone-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center pt-3 border-t border-stone-100">
          <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400">The Edge · edgereportdaily.com</span>
        </div>
      </div>
    </DetailModal>
  )
}
