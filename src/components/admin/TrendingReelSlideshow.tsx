'use client'

// src/components/admin/TrendingReelSlideshow.tsx
//
// Animated reel for the Trending Players feature — one MP4 per league.
// Structurally mirrors AllGamesStorySlideshow: a 9:16 phone-frame,
// autoplay with a progress bar per slide, tap-left/right navigation, and
// export via the SAME captureStoryToMp4 pipeline (frameElRef +
// setSlideIndex + slideCount + slideMs + onProgress) — reused exactly
// as-is, just pointed at a different frame. Each "slide" here is one
// trending player's card rather than one report section, and "game" ->
// "level" (MLB/AAA/AA pills instead of game pills).
//
// White card theme (was dark stage) — text/lines flipped to dark-on-
// white, stat numbers moved to a 2x2 grid (was 4x1) so they could
// actually get bigger without wrapping/overflowing the 340px frame, and
// each stat now has an animated fill bar underneath. Bar length is
// visual context, not a literal stat — normalized against a plausible
// ceiling for a 14-game hot stretch (see BAR_MAX below), clamped to
// 100%, not a season projection.

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import type { TrendingBatter, Level } from '@/lib/trending-players'
import { teamLogoUrl, teamLogoUrlPng } from '@/lib/mlb'
import { captureStoryToMp4 } from '@/lib/story-video'

type Props = {
  trending: Record<Level, TrendingBatter[]>
}

const SLIDE_MS = 6000
const LEVEL_ORDER: Level[] = ['mlb', 'aaa', 'aa']
const LEVEL_LABEL: Record<Level, string> = { mlb: 'MLB', aaa: 'AAA', aa: 'AA' }

// Visual scale references for the animated bars — a plausible "very hot"
// ceiling over a 14-game window, NOT a season max or a projection.
// Clamped to 100% so an outlier can't blow the bar off the track.
const BAR_MAX = { avg: 0.6, ops: 1.8, rbi: 20, r: 20 } as const

export interface TrendingReelHandle {
  getFrameElement: () => HTMLDivElement | null
  pause: () => void
  resume: () => void
}

function fmtRate(n: number): string {
  return n.toFixed(3).replace(/^0/, '')
}

function barPct(value: number, max: number): number {
  return Math.max(4, Math.min(100, (value / max) * 100))
}

// Same PNG -> SVG -> monogram fallback chain as TrendingGraphicCard,
// re-implemented locally at reel-frame scale. Backing behind the logo
// switched from dark to white now that the card itself is white.
function ReelTeamBadge({
  teamId, teamAbbr, teamName, size,
}: {
  teamId: number | null; teamAbbr: string; teamName: string; size: number
}) {
  const [stage, setStage] = useState<'png' | 'svg' | 'fallback'>('png')

  if (teamId == null || stage === 'fallback') {
    return (
      <div
        aria-label={teamName}
        style={{
          width: size, height: size, borderRadius: '50%', flexShrink: 0,
          background: '#FF5722', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: size * 0.32,
          border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.1)',
        }}
      >
        {teamAbbr}
      </div>
    )
  }

  const src = stage === 'png' ? teamLogoUrlPng(teamId, 120) : teamLogoUrl(teamId)
  return (
    <img
      key={stage}
      src={src}
      alt={teamName}
      crossOrigin="anonymous"
      onError={() => setStage((s) => (s === 'png' ? 'svg' : 'fallback'))}
      style={{
        width: size, height: size, objectFit: 'contain', background: '#fff', borderRadius: '50%',
        padding: 4, boxSizing: 'border-box', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.1)',
      }}
    />
  )
}

// Animated fill bar: outer track is full width, middle wrapper is
// clipped to the target pct (static, no animation needed on the ratio
// itself), inner fill animates via scaleX(0 -> 1) so the same keyframe
// works regardless of what pct actually is.
function ReelStat({ v, l, pct, delayMs }: { v: string; l: string; pct: number; delayMs: number }) {
  return (
    <div className="text-center">
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 46, lineHeight: 1, color: '#1A1A1A' }}>{v}</div>
      <div style={{ fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700, marginTop: 6 }}>{l}</div>
      <div style={{ height: 5, background: 'rgba(0,0,0,.08)', borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', overflow: 'hidden' }}>
          <div
            className="reel-bar-fill"
            style={{ width: '100%', height: '100%', background: '#FF5722', borderRadius: 3, animationDelay: `${delayMs}ms` }}
          />
        </div>
      </div>
    </div>
  )
}

const TrendingReelSlideshow = forwardRef<TrendingReelHandle, Props>(function TrendingReelSlideshow(
  { trending },
  ref,
) {
  const [level, setLevel] = useState<Level>('mlb')
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportError, setExportError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  const players = trending[level] ?? []
  const current = players[index]

  useImperativeHandle(ref, () => ({
    getFrameElement: () => frameRef.current,
    pause: () => setPlaying(false),
    resume: () => setPlaying(true),
  }), [])

  useEffect(() => { setIndex(0) }, [level])

  useEffect(() => {
    if (!playing || players.length === 0) return
    timer.current = setTimeout(() => {
      setIndex((i) => (i + 1) % players.length)
    }, SLIDE_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [index, playing, players.length])

  async function handleExport() {
    if (players.length === 0) return
    setExportError(null)
    setExportProgress(0)
    setExporting(true)
    const wasPlaying = playing
    setPlaying(false)
    try {
      const blob = await captureStoryToMp4({
        frameElRef: frameRef,
        setSlideIndex: (i) => setIndex(i),
        slideCount: players.length,
        slideMs: SLIDE_MS,
        onProgress: setExportProgress,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `the-edge-trending-${level}-${new Date().toISOString().slice(0, 10)}.mp4`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Trending reel export failed:', err)
      setExportError(
        err instanceof Error && /tainted|cross-origin|CORS/i.test(err.message)
          ? 'A headshot or team logo blocked capture (CORS). crossOrigin is already set on both — check which specific image URL failed in the console.'
          : 'Export failed — check the console for details.'
      )
    } finally {
      setExporting(false)
      setPlaying(wasPlaying)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Level pills — same role as AllGamesStorySlideshow's game pills */}
      <div className="flex gap-2">
        {LEVEL_ORDER.map((lv) => (
          <button
            key={lv}
            onClick={() => setLevel(lv)}
            className={`px-3 py-1.5 rounded-full text-xs font-mono whitespace-nowrap transition-colors ${
              lv === level ? 'bg-[#FF5722] text-white font-bold' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            }`}
          >
            {LEVEL_LABEL[lv]} ({(trending[lv] ?? []).length})
          </button>
        ))}
      </div>

      {players.length === 0 || !current ? (
        <div className="p-10 text-center text-stone-500 font-mono text-xs">
          No qualifying {LEVEL_LABEL[level]} trending data right now.
        </div>
      ) : (
        <>
          <div className="flex justify-center">
            <div
              ref={frameRef}
              className="relative bg-white rounded-[28px] overflow-hidden shadow-2xl cursor-pointer select-none border border-stone-200"
              style={{ width: 340, height: 604 }}
              onClick={(e) => {
                if (exporting) return
                const rect = e.currentTarget.getBoundingClientRect()
                const x = e.clientX - rect.left
                if (x < 120) {
                  setIndex((i) => (i - 1 + players.length) % players.length)
                } else {
                  setIndex((i) => (i + 1) % players.length)
                }
              }}
            >
              <div className="absolute top-4 left-4 right-4 z-20 flex gap-1.5">
                {players.map((_, i) => (
                  <div key={i} className="h-[3px] flex-1 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,.1)' }}>
                    <div
                      className="h-full rounded-full origin-left"
                      style={{
                        background: '#FF5722',
                        transform: `scaleX(${i < index ? 1 : i === index ? 1 : 0})`,
                        transition: i === index && playing ? `transform ${SLIDE_MS}ms linear` : 'none',
                      }}
                    />
                  </div>
                ))}
              </div>

              <div
                key={`${level}-${index}`}
                className="absolute inset-0 pt-14 pb-8 px-7 flex flex-col items-center text-center animate-in"
                style={{ color: '#1A1A1A' }}
              >
                <p className="font-mono text-[10px] tracking-[0.3em] mb-1" style={{ color: '#8a8a85' }}>⊕ THE EDGE</p>
                <p className="font-mono text-[10px] tracking-[0.2em] font-bold mb-6" style={{ color: '#FF5722' }}>
                  {LEVEL_LABEL[level]} TRENDING · #{index + 1}
                </p>

                <div style={{ position: 'relative', width: 148, height: 148, marginBottom: 16 }}>
                  <img
                    src={current.headshot}
                    alt={current.name}
                    crossOrigin="anonymous"
                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '3px solid #FF5722', background: '#f0ebe0' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
                  />
                  <div style={{ position: 'absolute', bottom: -4, right: -4 }}>
                    <ReelTeamBadge teamId={current.teamId} teamAbbr={current.teamAbbr} teamName={current.teamName} size={44} />
                  </div>
                </div>

                <h1 className="text-2xl font-bold leading-tight" style={{ fontFamily: 'Fraunces, Georgia, serif', color: '#1A1A1A' }}>
                  {current.name}
                </h1>
                <p className="font-mono text-[11px] mt-1 mb-8" style={{ color: '#8a8a85' }}>
                  {current.teamAbbr} · last {current.gamesCounted} games
                </p>

                <div className="grid grid-cols-2 gap-x-8 gap-y-7 w-full mt-auto mb-2 pt-6" style={{ borderTop: '1px solid rgba(0,0,0,.1)' }}>
                  <ReelStat v={fmtRate(current.avg)} l="AVG" pct={barPct(current.avg, BAR_MAX.avg)} delayMs={0} />
                  <ReelStat v={fmtRate(current.ops)} l="OPS" pct={barPct(current.ops, BAR_MAX.ops)} delayMs={90} />
                  <ReelStat v={String(current.rbi)} l="RBI" pct={barPct(current.rbi, BAR_MAX.rbi)} delayMs={180} />
                  <ReelStat v={String(current.r)} l="R" pct={barPct(current.r, BAR_MAX.r)} delayMs={270} />
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
              onClick={() => setPlaying((p) => !p)}
              disabled={exporting}
              className="px-4 py-1.5 rounded-full bg-stone-200 hover:bg-stone-300 font-mono text-xs text-stone-800 transition-colors disabled:opacity-50"
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <span className="text-stone-500 font-mono text-xs">
              {LEVEL_LABEL[level]} · Player {index + 1}/{players.length}
            </span>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-4 py-1.5 rounded-full bg-[#FF5722] hover:bg-[#e64a19] font-mono text-xs text-white font-bold transition-colors disabled:opacity-50"
            >
              {exporting ? `Exporting… ${Math.round(exportProgress)}%` : `Export ${LEVEL_LABEL[level]} MP4`}
            </button>
          </div>
          {exportError && (
            <p className="text-center font-mono text-[10px] text-[#FF5722] max-w-md mx-auto">{exportError}</p>
          )}
        </>
      )}

      <style jsx>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-in {
          animation: fadeUp 0.32s cubic-bezier(.22,1,.36,1) forwards;
        }
        @keyframes growBar {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        :global(.reel-bar-fill) {
          transform-origin: left;
          animation: growBar 700ms cubic-bezier(.22,1,.36,1) both;
        }
      `}</style>
    </div>
  )
})

export default TrendingReelSlideshow