'use client'

// src/components/admin/ScoutReportGraphicCard.tsx
//
// 2026-08-20 (later): two additions.
//   1. "Last 3 starts" strip — the wireframe's "Last 3 start form" box,
//      using lib/mlb.ts's existing getPitcherRecentStarts (was unused
//      until now, no new fetch logic needed).
//   2. Lineup now accepts an isFallback flag — when today's lineup isn't
//      posted, the admin page falls back to the team's most recent
//      completed game's batting order instead of showing nothing. Only
//      when EVEN THAT is unavailable does this show a genuine CTA
//      pointing to edgereportdaily.com instead of a dead "not confirmed"
//      message.

import { useState, useRef } from 'react'
import PitcherArsenalBars from '@/components/admin/PitcherArsenalBars'
import type { RichArsenalPitch } from '@/components/PitchLocationCard'
import BatterAttackPlanCard from '@/components/BatterAttackPlanCard'
import type { PitcherHotZones } from '@/lib/hot-zones'
import type { PitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import type { BatterZoneArsenal } from '@/lib/batter-zone-arsenal'
import type { PitcherGameLog } from '@/lib/mlb'
import { playerHeadshotUrl } from '@/lib/mlb'

type TeamRollingSnapshot = {
  sp_era: number | null
  sp_fip?: number | null
  bullpen_era: number | null
  ops_l30: number | null
  risp_avg: number | null
}
type LineupBatterSnapshot = {
  playerId: number
  playerName: string
  avg: number | null
}

type TrendingBatter = {
  playerId: number
  playerName: string
  note: string
}

type Props = {
  awayAbbr: string
  homeAbbr: string
  awayTeamId: number
  homeTeamId: number
  awayColor: string
  homeColor: string

  awayRolling: TeamRollingSnapshot | null
  homeRolling: TeamRollingSnapshot | null

  awayPitcherId: number
  awayPitcherName: string
  awayPitcherHotZones: Record<string, PitcherHotZones>
  awayPitcherArsenalZones: Record<string, PitcherZoneArsenal>
  awayPitcherRichArsenal: RichArsenalPitch[]
  awayPitcherLast3: PitcherGameLog[]

  homePitcherId: number
  homePitcherName: string
  homePitcherHotZones: Record<string, PitcherHotZones>
  homePitcherArsenalZones: Record<string, PitcherZoneArsenal>
  homePitcherRichArsenal: RichArsenalPitch[]
  homePitcherLast3: PitcherGameLog[]

  awayHighlightBatterName: string
  awayHighlightBatterZoneArsenal: Record<string, BatterZoneArsenal>
  homeHighlightBatterName: string
  homeHighlightBatterZoneArsenal: Record<string, BatterZoneArsenal>

  awayLineup: LineupBatterSnapshot[]
  homeLineup: LineupBatterSnapshot[]
  awayLineupIsFallback?: boolean
  homeLineupIsFallback?: boolean

  trendingBatters: TrendingBatter[]
  fullReportUrl: string
}

function fmt3(v: number | null): string {
  return v != null ? v.toFixed(3).replace(/^0/, '') : '—'
}
function fmt2(v: number | null): string {
  return v != null ? v.toFixed(2) : '—'
}

function RollingNumbersBox({ abbr, teamId, color, rolling }: { abbr: string; teamId: number; color: string; rolling: TeamRollingSnapshot | null }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
      <div className="px-3 py-2 border-b border-stone-100 flex items-center gap-2">
        <img src={`https://www.mlbstatic.com/team-logos/${teamId}.svg`} alt={abbr} className="w-4 h-4 object-contain" />
        <span className="font-mono text-[8px] uppercase tracking-widest text-stone-500">{abbr} · Rolling numbers</span>
      </div>
      <div className="p-2.5 grid grid-cols-2 gap-1.5">
        <div className="bg-stone-50 rounded px-2 py-1.5">
          <p className="font-mono text-[7px] uppercase text-stone-400">SP ERA</p>
          <p className="font-mono text-xs font-bold text-stone-900">{fmt2(rolling?.sp_era ?? null)}</p>
        </div>
        <div className="bg-stone-50 rounded px-2 py-1.5">
          <p className="font-mono text-[7px] uppercase text-stone-400">Bullpen ERA</p>
          <p className="font-mono text-xs font-bold text-stone-900">{fmt2(rolling?.bullpen_era ?? null)}</p>
        </div>
        <div className="bg-stone-50 rounded px-2 py-1.5">
          <p className="font-mono text-[7px] uppercase text-stone-400">OPS L30</p>
          <p className="font-mono text-xs font-bold text-stone-900">{fmt3(rolling?.ops_l30 ?? null)}</p>
        </div>
        <div className="bg-stone-50 rounded px-2 py-1.5">
          <p className="font-mono text-[7px] uppercase text-stone-400">RISP AVG</p>
          <p className="font-mono text-xs font-bold text-stone-900">{fmt3(rolling?.risp_avg ?? null)}</p>
        </div>
      </div>
    </div>
  )
}

function Last3StartsStrip({ starts }: { starts: PitcherGameLog[] }) {
  if (!starts || starts.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-stone-200 px-2.5 py-1.5 mb-1.5 text-center">
        <p className="font-mono text-[9px] italic text-stone-400">L3: no data</p>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-lg border border-stone-200 px-2.5 py-1.5 mb-1.5 flex items-center justify-center gap-2.5">
      <span className="font-mono text-[8px] uppercase tracking-wider text-stone-400">L3:</span>
      {starts.slice(0, 3).map((s, i) => (
        <span key={i} className="flex items-baseline gap-0.5">
          <span
            className="font-mono text-[9px] font-bold"
            style={{ color: s.result === 'W' ? '#15803d' : s.result === 'L' ? '#dc2626' : '#78716c' }}
          >
            {s.result}
          </span>
          <span className="font-mono text-[10px] font-bold text-stone-800">{s.era}</span>
        </span>
      ))}
    </div>
  )
}

function LineupColumn({ abbr, color, lineup, isFallback, fullReportUrl }: {
  abbr: string; color: string; lineup: LineupBatterSnapshot[]; isFallback?: boolean; fullReportUrl: string
}) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-100">
        <span className="font-mono text-[8px] uppercase tracking-widest text-stone-500">{abbr} · Lineup</span>
      </div>
      <div className="p-2 space-y-1.5">
        {lineup.length > 0 ? (
          <>
            {lineup.slice(0, 9).map(b => (
              <div key={b.playerId} className="flex items-center gap-2">
                <img
                  src={playerHeadshotUrl(b.playerId, 60)}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover border border-stone-200 flex-shrink-0"
                />
                <span className="text-[10px] font-serif text-stone-800 flex-1 truncate">{b.playerName}</span>
                <span className="text-[10px] font-mono font-bold" style={{ color }}>{fmt3(b.avg)}</span>
              </div>
            ))}
            {isFallback && (
              <p className="text-[7px] font-mono text-stone-400 text-center pt-1">Most recent game — today's lineup not posted yet</p>
            )}
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-[10px] font-serif italic text-stone-400">Lineup not confirmed yet</p>
            <p className="text-[9px] font-mono text-orange-600 mt-1.5">
              See live lineups at<br />edgereportdaily.com
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ScoutReportGraphicCard(props: Props) {
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
      link.download = `scout-report-${props.awayAbbr}-vs-${props.homeAbbr}.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Scout report graphic export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

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

      <div ref={cardRef} className="bg-stone-50 p-4 rounded-2xl" style={{ width: 900 }}>
        {/* Header — Edge logo + team logos */}
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-stone-900">The Edge</span>
          <div className="flex items-center gap-3">
            <img src={`https://www.mlbstatic.com/team-logos/${props.awayTeamId}.svg`} alt={props.awayAbbr} className="w-8 h-8 object-contain" />
            <span className="font-mono text-[10px] text-stone-400">@</span>
            <img src={`https://www.mlbstatic.com/team-logos/${props.homeTeamId}.svg`} alt={props.homeAbbr} className="w-8 h-8 object-contain" />
          </div>
        </div>

        {/* Row 1: Team Rolling Numbers */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <RollingNumbersBox abbr={props.awayAbbr} teamId={props.awayTeamId} color={props.awayColor} rolling={props.awayRolling} />
          <RollingNumbersBox abbr={props.homeAbbr} teamId={props.homeTeamId} color={props.homeColor} rolling={props.homeRolling} />
        </div>

        {/* Row 2: Last 3 starts + Starting Pitcher arsenal (bar chart, not the zone grid) */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <Last3StartsStrip starts={props.awayPitcherLast3} />
            <PitcherArsenalBars
              pitcherName={props.awayPitcherName} abbr={props.awayAbbr} color={props.awayColor}
              hotZones={props.awayPitcherHotZones} richArsenal={props.awayPitcherRichArsenal}
            />
          </div>
          <div>
            <Last3StartsStrip starts={props.homePitcherLast3} />
            <PitcherArsenalBars
              pitcherName={props.homePitcherName} abbr={props.homeAbbr} color={props.homeColor}
              hotZones={props.homePitcherHotZones} richArsenal={props.homePitcherRichArsenal}
            />
          </div>
        </div>

        {/* Row 3: Highlighted Player Zone vs opposing pitcher's arsenal */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <BatterAttackPlanCard
            batterName={props.awayHighlightBatterName} color={props.awayColor}
            batterZoneArsenal={props.awayHighlightBatterZoneArsenal}
            pitcherArsenal={props.homePitcherArsenalZones}
            pitcherThrows="R"
          />
          <BatterAttackPlanCard
            batterName={props.homeHighlightBatterName} color={props.homeColor}
            batterZoneArsenal={props.homeHighlightBatterZoneArsenal}
            pitcherArsenal={props.awayPitcherArsenalZones}
            pitcherThrows="R"
          />
        </div>

        {/* Row 4: Away lineup / Home lineup / Trending + CTA */}
        <div className="grid grid-cols-3 gap-2">
          <LineupColumn abbr={props.awayAbbr} color={props.awayColor} lineup={props.awayLineup} isFallback={props.awayLineupIsFallback} fullReportUrl={props.fullReportUrl} />
          <LineupColumn abbr={props.homeAbbr} color={props.homeColor} lineup={props.homeLineup} isFallback={props.homeLineupIsFallback} fullReportUrl={props.fullReportUrl} />
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-stone-100">
              <span className="font-mono text-[8px] uppercase tracking-widest text-stone-500">Trending</span>
            </div>
            <div className="p-2.5 space-y-2 flex-1">
              {props.trendingBatters.slice(0, 3).map(t => (
                <div key={t.playerId} className="text-[10px]">
                  <p className="font-serif font-semibold text-stone-800">{t.playerName}</p>
                  <p className="font-mono text-stone-500 text-[9px]">{t.note}</p>
                </div>
              ))}
              {props.trendingBatters.length === 0 && (
                <p className="text-[10px] font-serif italic text-stone-400 text-center py-3">No trending players yet</p>
              )}
            </div>
            <div className="px-3 py-2 border-t border-stone-100">
              <p className="font-mono text-[8px] uppercase tracking-wider text-orange-600 text-center">
                Full report →<br />{props.fullReportUrl}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}