'use client'

import { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react'
import type { ScoutReport, ScoutRow } from '@/lib/scout'
import PitchLocationCard from '@/components/PitchLocationCard'
import LineupSprayChart from '@/components/LineupSprayChart'
import TeamHotZoneCard, { type LineupZoneEntry } from '@/components/TeamHotZoneCard'
import TTOFatigueChart from '@/components/TTOFatigueChart'
import type { BatterSpray } from '@/lib/batter-spray'
import type { PitcherHotZones } from '@/lib/hot-zones'
import type { PitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import { captureStoryToMp4 } from '@/lib/story-video'

export type GameWithReport = {
  game_pk: number
  matchup: string
  lean_team: string
  factor_count: number
  dominant_factor: string
  near_split?: boolean
  lineups_confirmed?: boolean
  report: ScoutReport | null

  awayAbbr?: string
  homeAbbr?: string
  awayName?: string
  homeName?: string
  awayColor?: string
  homeColor?: string
  awayPitcherName?: string
  homePitcherName?: string
  awayPitcherHotZones?: Record<string, PitcherHotZones>
  homePitcherHotZones?: Record<string, PitcherHotZones>
  awayPitcherArsenalZones?: Record<string, PitcherZoneArsenal>
  homePitcherArsenalZones?: Record<string, PitcherZoneArsenal>
  awayLineupZones?: LineupZoneEntry[]
  homeLineupZones?: LineupZoneEntry[]
  awayLineupSpray?: BatterSpray[]
  homeLineupSpray?: BatterSpray[]
  awayPitcherTTO?: any
  homePitcherTTO?: any
  awayPitcherThrows?: 'L' | 'R'
  homePitcherThrows?: 'L' | 'R'
  awayLineupSize?: number
  homeLineupSize?: number
}

type Props = {
  games: GameWithReport[]
  slateDate: string
}

const SLIDE_MS = 6000
export const STORY_SLIDE_COUNT = 7 // header, hotzones, pitch-locations, spray-charts, pitching-notes, key-edges, close — fixed regardless of game

/** Imperative capture handle — used only by the MP4 export driver in
 *  story-video.ts. Doesn't change normal playback/click behavior at all;
 *  goToSlide pauses autoplay (capture needs deterministic state, not a
 *  race against the 6s timer) and the caller is responsible for resuming
 *  via resume() when done. */
export interface StorySlideshowHandle {
  getFrameElement: () => HTMLDivElement | null
  setActiveGame: (index: number) => void
  setSlideIndex: (index: number) => void
  pause: () => void
  resume: () => void
  gameCount: number
}

const AllGamesStorySlideshow = forwardRef<StorySlideshowHandle, Props>(function AllGamesStorySlideshow(
  { games, slateDate },
  ref,
) {
  const [active, setActive] = useState(0)
  const [slide, setSlide] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportError, setExportError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    getFrameElement: () => frameRef.current,
    setActiveGame: (index: number) => setActive(index),
    setSlideIndex: (index: number) => setSlide(index),
    pause: () => setPlaying(false),
    resume: () => setPlaying(true),
    gameCount: games.length,
  }), [games.length])

  const current = games[active]
  const report = current?.report

  const [awayAbbr = 'AWAY', homeAbbr = 'HOME'] = useMemo(() => {
    if (!current?.matchup) return ['AWAY', 'HOME']
    const parts = current.matchup.split(/@|vs/i).map(s => s.trim())
    return [current.awayAbbr || parts[0] || 'AWAY', current.homeAbbr || parts[1] || 'HOME']
  }, [current])

  const slides = useMemo(() => {
    if (!current) {
      return [
        {
          id: 'empty',
          title: '',
          content: <p className="text-stone-500 text-center mt-20 font-mono text-xs">No game selected</p>
        }
      ]
    }

    const rows = report?.rows || []

    const getCategory = (r: ScoutRow) => (r.section || (r as any).category || '').toLowerCase()
    const pitchingNotes = rows.filter(r => getCategory(r) === 'pitching').sort((a, b) => b.weight - a.weight).slice(0, 4)
    const keyNotes = rows.filter(r => !['situation', 'moves', 'weather'].includes(getCategory(r))).sort((a, b) => b.weight - a.weight).slice(0, 4)

    const listOrFallback = (list: ScoutRow[]) => list.length > 0 ? list : rows.slice(0, 4)

    return [
      {
        id: 'header',
        title: 'SCOUTING REPORT',
        content: (
          <div className="flex flex-col items-center justify-center h-full text-center gap-5">
            <p className="font-mono text-[11px] tracking-[0.3em] text-stone-400">THE EDGE</p>
            <h1 className="text-3xl font-bold leading-tight uppercase" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              {current.matchup}
            </h1>
            <div className="px-4 py-1.5 rounded-full bg-[#FF5722] text-white font-mono text-xs font-bold tracking-wider">
              {current.factor_count}/8 LEAN · {current.lean_team}
            </div>
            {current.dominant_factor && (
              <p className="text-stone-400 text-xs font-mono">Led by {current.dominant_factor}</p>
            )}
          </div>
        ),
      },
      {
        id: 'hotzones',
        title: 'LINEUP HOT ZONES',
        content: (
          <div className="flex flex-col gap-2.5 h-full overflow-y-auto pr-1">
            <TeamHotZoneCard
              teamAbbr={awayAbbr}
              teamName={current.awayName || awayAbbr}
              color={current.awayColor || '#FF5722'}
              entries={current.awayLineupZones || []}
              opposingThrows={current.homePitcherThrows || 'R'}
              compact
            />
            <TeamHotZoneCard
              teamAbbr={homeAbbr}
              teamName={current.homeName || homeAbbr}
              color={current.homeColor || '#1A1A1A'}
              entries={current.homeLineupZones || []}
              opposingThrows={current.awayPitcherThrows || 'R'}
              compact
            />
          </div>
        ),
      },
      {
        id: 'pitch-locations',
        title: 'PITCH LOCATIONS',
        content: (
          <div className="flex flex-col gap-2.5 h-full overflow-y-auto pr-1">
            <PitchLocationCard
              pitcherName={current.awayPitcherName || `${awayAbbr} SP`}
              abbr={awayAbbr}
              color={current.awayColor || '#FF5722'}
              hotZones={current.awayPitcherHotZones || {}}
              arsenal={current.awayPitcherArsenalZones || {}}
              compact
            />
            <PitchLocationCard
              pitcherName={current.homePitcherName || `${homeAbbr} SP`}
              abbr={homeAbbr}
              color={current.homeColor || '#1A1A1A'}
              hotZones={current.homePitcherHotZones || {}}
              arsenal={current.homePitcherArsenalZones || {}}
              compact
            />
          </div>
        ),
      },
      {
        id: 'spray-charts',
        title: 'SPRAY CHARTS',
        content: (
          <div className="flex flex-col gap-3 h-full overflow-y-auto pr-1">
            <LineupSprayChart
              teamAbbr={awayAbbr}
              teamName={current.awayName || awayAbbr}
              color={current.awayColor || '#FF5722'}
              batters={current.awayLineupSpray || []}
              lineupSize={current.awayLineupSize || 0}
            />
            <LineupSprayChart
              teamAbbr={homeAbbr}
              teamName={current.homeName || homeAbbr}
              color={current.homeColor || '#1A1A1A'}
              batters={current.homeLineupSpray || []}
              lineupSize={current.homeLineupSize || 0}
            />
          </div>
        ),
      },
      {
        id: 'pitching-notes',
        title: 'PITCHING & FATIGUE',
        content: (
          <div className="flex flex-col gap-3 h-full overflow-y-auto pr-1">
            {current.awayPitcherTTO && (
              <TTOFatigueChart
                pitcherName={current.awayPitcherName || `${awayAbbr} SP`}
                abbr={awayAbbr}
                tto={current.awayPitcherTTO}
              />
            )}
            {current.homePitcherTTO && (
              <TTOFatigueChart
                pitcherName={current.homePitcherName || `${homeAbbr} SP`}
                abbr={homeAbbr}
                tto={current.homePitcherTTO}
              />
            )}
            <NotesList rows={listOrFallback(pitchingNotes)} empty="No pitching notes available" />
          </div>
        ),
      },
      {
        id: 'key-edges',
        title: 'KEY EDGES',
        content: <NotesList rows={listOrFallback(keyNotes)} empty="No key edges identified" />,
      },
      {
        id: 'close',
        title: '',
        content: (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <p className="font-mono text-[11px] tracking-widest text-stone-400">SLATE RANK</p>
            <div className="text-6xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              #{active + 1}
            </div>
            <p className="text-stone-400 text-sm">of {games.length} games on slate</p>
            <p className="text-xs text-[#FF5722] mt-6 font-mono tracking-widest font-bold">THE EDGE READS</p>
          </div>
        ),
      },
    ]
  }, [report, current, active, games.length, awayAbbr, homeAbbr])

  useEffect(() => {
    setSlide(0)
  }, [active])

  useEffect(() => {
    if (!playing || slides.length === 0) return
    timer.current = setTimeout(() => {
      setSlide(s => {
        if (s >= slides.length - 1) {
          setActive(a => (a + 1) % games.length)
          return 0
        }
        return s + 1
      })
    }, SLIDE_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [slide, active, playing, slides.length, games.length])

  async function handleExport() {
    setExportError(null)
    setExportProgress(0)
    setExporting(true)
    const wasPlaying = playing
    setPlaying(false)
    try {
      const blob = await captureStoryToMp4({
        frameElRef: frameRef,
        setSlideIndex: (i) => setSlide(i),
        slideCount: STORY_SLIDE_COUNT,
        slideMs: SLIDE_MS,
        onProgress: setExportProgress,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `the-edge-scout-story-${current?.game_pk ?? 'game'}-${slateDate}.mp4`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Story export failed:', err)
      setExportError(
        err instanceof Error && /tainted|cross-origin|CORS/i.test(err.message)
          ? 'A logo or headshot image in one of the chart cards blocked capture (CORS). Check crossOrigin on <img> tags in PitchLocationCard/TeamHotZoneCard/LineupSprayChart/TTOFatigueChart.'
          : 'Export failed — check the console for details.'
      )
    } finally {
      setExporting(false)
      setPlaying(wasPlaying)
    }
  }

  if (!games || games.length === 0) {
    return <div className="p-10 text-center text-stone-500 font-mono text-xs">No games available</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {games.map((g, i) => (
          <button
            key={g.game_pk}
            onClick={() => { setActive(i); setSlide(0) }}
            className={`px-3 py-1.5 rounded-full text-xs font-mono whitespace-nowrap transition-colors ${
              i === active ? 'bg-[#FF5722] text-white font-bold' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            }`}
          >
            {g.matchup}
          </button>
        ))}
      </div>

      <div className="flex justify-center">
        <div
          ref={frameRef}
          className="relative bg-[#0c0c0c] rounded-[28px] overflow-hidden shadow-2xl cursor-pointer select-none border border-stone-800"
          style={{ width: 340, height: 604 }}
          onClick={(e) => {
            if (exporting) return
            const rect = e.currentTarget.getBoundingClientRect()
            const x = e.clientX - rect.left
            if (x < 120) {
              if (slide === 0) {
                setActive(a => (a - 1 + games.length) % games.length)
              } else {
                setSlide(s => s - 1)
              }
            } else {
              if (slide >= slides.length - 1) {
                setActive(a => (a + 1) % games.length)
              } else {
                setSlide(0)
              }
            }
          }}
        >
          <div className="absolute top-4 left-4 right-4 z-20 flex gap-1.5">
            {slides.map((_, i) => (
              <div key={i} className="h-[3px] flex-1 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full origin-left"
                  style={{
                    transform: `scaleX(${i < slide ? 1 : i === slide ? 1 : 0})`,
                    transition: i === slide && playing ? `transform ${SLIDE_MS}ms linear` : 'none',
                  }}
                />
              </div>
            ))}
          </div>

          <div className="absolute inset-0 pt-12 pb-6 px-4 text-white">
            <div key={`${active}-${slide}-${slides[slide]?.id}`} className="h-full animate-in flex flex-col">
              {slides[slide]?.title && (
                <div className="mb-3 shrink-0">
                  <div className="h-1 w-8 bg-[#FF5722] rounded-full mb-1.5" />
                  <p className="font-mono text-[10px] tracking-[0.2em] text-stone-400 uppercase">
                    {slides[slide].title}
                  </p>
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                {slides[slide]?.content}
              </div>
            </div>
          </div>

          {exporting && (
            <div className="absolute inset-0 z-30 bg-black/60 flex flex-col items-center justify-center gap-2">
              <span className="font-mono text-xs text-white">Exporting… {Math.round(exportProgress)}%</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-center items-center gap-4 text-sm flex-wrap">
        <button
          onClick={() => setPlaying(p => !p)}
          disabled={exporting}
          className="px-4 py-1.5 rounded-full bg-stone-200 hover:bg-stone-300 font-mono text-xs text-stone-800 transition-colors disabled:opacity-50"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <span className="text-stone-500 font-mono text-xs">
          Game {active + 1}/{games.length} · Slide {slide + 1}/{slides.length}
        </span>
        <button
          onClick={handleExport}
          disabled={exporting || !current}
          className="px-4 py-1.5 rounded-full bg-[#FF5722] hover:bg-[#e64a19] font-mono text-xs text-white font-bold transition-colors disabled:opacity-50"
        >
          {exporting ? `Exporting… ${Math.round(exportProgress)}%` : 'Export MP4'}
        </button>
      </div>
      {exportError && (
        <p className="text-center font-mono text-[10px] text-[#FF5722] max-w-md mx-auto">{exportError}</p>
      )}

      <style jsx>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-in {
          animation: fadeUp 0.32s cubic-bezier(.22,1,.36,1) forwards;
        }
      `}</style>
    </div>
  )
})

export default AllGamesStorySlideshow

function NotesList({ rows, empty }: { rows: ScoutRow[]; empty: string }) {
  if (!rows || rows.length === 0) {
    return <p className="text-stone-500 text-xs mt-8 text-center font-mono">{empty}</p>
  }
  return (
    <div className="space-y-3 overflow-y-auto max-h-[460px] pr-1">
      {rows.map((r, i) => (
        <div key={r.id || i} className="flex gap-2.5 items-start note-row" style={{ animationDelay: `${i * 60}ms` }}>
          <div className="w-1.5 h-1.5 rounded-full bg-[#FF5722] mt-1.5 flex-shrink-0" />
          <p className="text-[13px] leading-snug text-stone-200 font-sans">
            {r.line}
          </p>
        </div>
      ))}
      <style jsx>{`
        @keyframes noteIn {
          from { opacity: 0; transform: translateX(-6px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .note-row { animation: noteIn 320ms ease-out both; }
      `}</style>
    </div>
  )
}