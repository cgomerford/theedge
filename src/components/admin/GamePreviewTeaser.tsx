'use client'

// src/components/admin/GamePreviewTeaser.tsx
//
// "Mini scout report" preview video — now styled to match TrendingReelSlideshow
// (white card, dark text, orange accents, same progress bars + fadeUp).
// TTO slides dropped.
//
// Slide order:
//   Header -> SP Matchup -> Bullpen (away/home) ->
//   Fielding Alignment (away/home) -> Streak Watch (away/home) ->
//   Hot Player (away/home) -> Close
//
// CAPTURE: reuses captureStoryToMp4. settleMs = 1000 so CountUp (900ms)
// and any CSS bar/entrance animations finish before each frame is shot.
// Cross-fade transitions are driven via setTransitionState for smooth MP4.

import { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react'
import { captureStoryToMp4 } from '@/lib/story-video'
import CountUp from './CountUp'
import FieldingAlignmentDiamond from '@/components/FieldingAlignmentDiamond'
import type { StreakWithZones } from '@/components/BatterStreakBoard'
import BullpenBarsSlide from './BullpenBarSlide'
import type { GameWithReport } from './AllGamesStorySlideshow'

type Props = {
  games: GameWithReport[]
  slateDate: string
}

const SLIDE_MS = 2000
const SETTLE_MS = 1000 // > CountUp's 900ms so counts + bar anims finish before screenshot

export interface TeaserSlideshowHandle {
  getFrameElement: () => HTMLDivElement | null
  setActiveGame: (index: number) => void
  setSlideIndex: (index: number) => void
  pause: () => void
  resume: () => void
  gameCount: number
}

function MiniSparkline({ data, color, w = 280, h = 40 }: {
  data: number[]; color: string; w?: number; h?: number
}) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data)
  const range = (max - min) || 1
  const pad = 3
  const step = (w - pad * 2) / (data.length - 1)
  const path = data.map((v, i) => {
    const x = pad + i * step
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
    </svg>
  )
}

function SPCard({ name, abbr, color, pid, stats }: {
  name: string; abbr: string; color: string; pid: number | null
  stats: { era: number | null; whip: number | null; k_per_9: number | null; bb_per_9: number | null; l3_era: number | null } | null | undefined
}) {
  const rows: Array<[string, number | null, number]> = [
    ['ERA', stats?.era ?? null, 2],
    ['FIP', (stats as any)?.fip ?? null, 2],
    ['L3 ERA', stats?.l3_era ?? null, 2],
    ['WHIP', stats?.whip ?? null, 2],
    ['K/9', stats?.k_per_9 ?? null, 1],
    ['BB/9', stats?.bb_per_9 ?? null, 1],
  ]
  return (
    <div className="bg-stone-50 rounded-xl p-2.5 border border-stone-200">
      <div className="flex flex-col items-center text-center mb-2">
        <img
          src={headshotUrl(pid) ?? ''}
          alt=""
          crossOrigin="anonymous"
          className="w-14 h-14 rounded-full object-cover border-2 mb-1.5 bg-stone-100"
          style={{ borderColor: color || '#FF5722' }}
        />
        <p className="text-stone-900 font-bold text-[13px] leading-tight">{name}</p>
        <p className="font-mono text-[8px] text-stone-500 mt-0.5">{abbr}</p>
      </div>
      <div className="space-y-1">
        {rows.map(([label, value, decimals]) => (
          <div key={label} className="flex items-baseline justify-between border-t border-stone-200 pt-1">
            <span className="font-mono text-[8px] uppercase tracking-wider text-stone-500">{label}</span>
            {value != null ? (
              <CountUp value={value} decimals={decimals} className="font-mono text-sm font-bold text-stone-900" />
            ) : (
              <span className="font-mono text-sm font-bold text-stone-300">—</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SlideFrame({ kicker, title, children }: {
  kicker: string; title: string; children: React.ReactNode
}) {
  return (
    <div className="h-full flex flex-col bg-white">
      <div className="px-1 pt-1 pb-3 shrink-0">
        <p className="font-mono text-[10px] tracking-[0.25em] text-stone-500 uppercase">{kicker}</p>
        <h2
          className="text-stone-900 font-bold uppercase leading-none mt-0.5"
          style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.6rem' }}
        >
          {title}
        </h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  )
}

function StatBig({ label, value, decimals = 2, color = '#1A1A1A' }: {
  label: string; value: number | null; decimals?: number; color?: string
}) {
  return (
    <div className="bg-stone-50 rounded-xl px-3 py-2.5 border border-stone-200">
      <p className="font-mono text-[8px] uppercase tracking-widest text-stone-500">{label}</p>
      {value != null ? (
        <CountUp value={value} decimals={decimals} className="font-mono text-2xl font-bold" style={{ color }} />
      ) : (
        <span className="font-mono text-2xl font-bold text-stone-300">—</span>
      )}
    </div>
  )
}

function headshotUrl(playerId: number | null | undefined): string | null {
  if (!playerId) return null
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,d_people:generic:headshot:silo:current.png,q_auto:best,f_auto/v1/people/${playerId}/headshot/silo/current`
}

const GamePreviewTeaser = forwardRef<TeaserSlideshowHandle, Props>(function GamePreviewTeaser(
  { games, slateDate },
  ref,
) {
  const [active, setActive] = useState(0)
  const [slide, setSlide] = useState(0)
  const [playing, setPlaying] = useState(true)
  // Only set during export — renders both slides overlaid at the given
  // opacity mix so captureStoryToMp4 can screenshot smooth blend frames.
  const [transition, setTransition] = useState<{ from: number; to: number; progress: number } | null>(null)
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

  const [awayAbbr = 'AWAY', homeAbbr = 'HOME'] = useMemo(() => {
    if (!current?.matchup) return ['AWAY', 'HOME']
    const parts = current.matchup.split(/@|vs/i).map(s => s.trim())
    return [current.awayAbbr || parts[0] || 'AWAY', current.homeAbbr || parts[1] || 'HOME']
  }, [current])
  // ── Hot player xBA/xwOBA — client-side Savant fetch, admin-tool only ──
  // fetchStatcastClientSide downloads two full-league CSVs per call, so
  // this only runs for the CURRENT game's hot batters (not all 15 games
  // on the slate). Triggers when `active` changes or the underlying
  // hot-streak IDs change. Result is stored keyed by playerId so we
  // don't refetch when the user toggles back to a previously-viewed
  // slide within the same game.
  const [xstatsByPlayerId, setXstatsByPlayerId] = useState<Record<number, { xba: number | null; xwoba: number | null } | null>>({})
  useEffect(() => {
    if (!current) return
    const awayTop = (current.awayHotStreaks ?? []).filter(s => s.player_type === 'batter').sort((a, b) => b.magnitude - a.magnitude)[0]
    const homeTop = (current.homeHotStreaks ?? []).filter(s => s.player_type === 'batter').sort((a, b) => b.magnitude - a.magnitude)[0]
    const ids = [awayTop?.player_id, homeTop?.player_id].filter((id): id is number => typeof id === 'number' && !(id in xstatsByPlayerId))
    if (ids.length === 0) return

    let cancelled = false
    ;(async () => {
      const { fetchStatcastClientSide } = await import('@/lib/batter-statcast')
      const results = await Promise.all(ids.map(id => fetchStatcastClientSide(id).then(s => [id, s ? { xba: s.xba, xwoba: s.xwoba } : null] as const)))
      if (!cancelled) {
        setXstatsByPlayerId(prev => {
          const next = { ...prev }
          for (const [id, val] of results) next[id] = val
          return next
        })
      }
    })()
    return () => { cancelled = true }
  }, [active, current, xstatsByPlayerId])
  const slides = useMemo(() => {
    if (!current) {
      return [{ id: 'empty', content: <div className="h-full flex items-center justify-center bg-white"><p className="text-stone-400 font-mono text-xs">No game selected</p></div> }]
    }

    const awayColor = current.awayColor || '#FF5722'
    const homeColor = current.homeColor || '#1A1A1A'
    const awayPid = current.awayPitcherId ?? null
    const homePid = current.homePitcherId ?? null

    const bullpenSlide = (abbr: string, color: string, workload: any, excludeIds: number[]) => (
      <SlideFrame kicker={`${abbr} · Bullpen`} title="Workload · L3">
        <BullpenBarsSlide
          workload={workload}
          teamColor={color || '#FF5722'}
          excludePlayerIds={excludeIds}
          resetKey={`${abbr}-bullpen`}
        />
      </SlideFrame>
    )

    const fieldingSlide = (abbr: string, name: string, color: string, fielders: any[] | undefined) => (
      <SlideFrame kicker={`${abbr} · Defense`} title="Alignment">
        <div className="px-1">
          <FieldingAlignmentDiamond teamAbbr={abbr} teamName={name} teamColor={color || '#FF5722'} fielders={fielders ?? []} />
        </div>
      </SlideFrame>
    )

    // Build a lookup of L15 rolling AVG per player, from the hot-streaks
    // data (player_form_signals cron). Free — same source the hot-player
    // slide already reads. Batters not present in that table (form signal
    // didn't fire for them) show no AVG rather than a fabricated 0.
    const awayFormLookup = new Map(
      (current.awayHotStreaks ?? []).filter(s => s.player_type === 'batter' && s.avg != null).map(s => [s.player_id, s]),
    )
    const homeFormLookup = new Map(
      (current.homeHotStreaks ?? []).filter(s => s.player_type === 'batter' && s.avg != null).map(s => [s.player_id, s]),
    )

    // Season slash-line + RBI lookup, from lineups.ts (already enriched
    // by enrichBattersWithStats). Free — zero new fetches, all four
    // fields are pulled from the same MLB stats API call already made.
    const awaySeasonLookup = new Map(
      (current.awayLineupBatters ?? []).map(b => [b.player_id, b]),
    )
    const homeSeasonLookup = new Map(
      (current.homeLineupBatters ?? []).map(b => [b.player_id, b]),
    )

        const streakSlide = (
      abbr: string, color: string,
      batters: any[] | undefined,
      pitcher: any,
      formLookup: Map<number, any>,
      seasonLookup: Map<number, import('@/lib/lineups').LineupBatter>,
    ) => {
         const items: Array<{
        playerId: number; playerName: string; streakLabel: string;
        season?: { avg: number | null; slg: number | null; ops: number | null; rbi: number | null }
      }> = []
      for (const b of (batters ?? [])) {
        const s = seasonLookup.get(b.player_id)
        const season = s ? { avg: s.season_avg, slg: s.season_slg, ops: s.season_ops, rbi: s.season_rbi } : undefined
        if (b.on_base_streak >= 6) {
          items.push({
            playerId: b.player_id, playerName: b.player_name,
            streakLabel: `On base in ${b.on_base_streak} straight`,
            season,
          })
        } else if (b.hit_streak >= 4) {
          items.push({
            playerId: b.player_id, playerName: b.player_name,
            streakLabel: `Hit in ${b.hit_streak} straight`,
            season,
          })
        }
      }
      if (pitcher && pitcher.current_scoreless_innings >= 6) {
        items.push({
          playerId: pitcher.player_id, playerName: pitcher.player_name,
          streakLabel: `${pitcher.current_scoreless_innings.toFixed(1)}-inning scoreless streak`,
        })
      }

      return (
        <SlideFrame kicker={`${abbr} · Notable`} title="Streak Watch">
          {items.length === 0 ? (
            <p className="text-stone-400 font-mono text-xs italic px-1">No active streaks tonight.</p>
          ) : (
            <div className="space-y-2 px-1">
                            {items.slice(0, 4).map(item => {
                const fmt3 = (n: number | null | undefined) =>
                  n == null ? '—' : n.toFixed(3).replace(/^0/, '')
                return (
                               <div key={item.playerId} className="flex flex-col gap-1.5 bg-stone-50 rounded-lg px-2.5 py-2 border border-stone-200">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={headshotUrl(item.playerId) ?? ''}
                        alt=""
                        crossOrigin="anonymous"
                        className="w-10 h-10 rounded-full object-cover border border-stone-200 bg-stone-100 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-stone-900 font-bold text-[13px] leading-tight truncate">{item.playerName}</p>
                        <p className="text-stone-600 font-mono text-[10px] mt-0.5 leading-tight">{item.streakLabel}</p>
                      </div>
                    </div>
                    {item.season && (
                      <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-stone-200">
                        {(['AVG', 'SLG', 'OPS', 'RBI'] as const).map(k => {
                          const raw =
                            k === 'AVG' ? item.season!.avg :
                            k === 'SLG' ? item.season!.slg :
                            k === 'OPS' ? item.season!.ops :
                            item.season!.rbi
                          const display = k === 'RBI'
                            ? (raw == null ? '—' : String(Math.round(raw)))
                            : fmt3(raw)
                          return (
                            <div key={k} className="text-center">
                              <p className="font-mono text-[7px] uppercase tracking-widest text-stone-500 leading-none">{k}</p>
                              <p className="font-mono text-[11px] font-bold text-stone-900 leading-none mt-0.5">{display}</p>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </SlideFrame>
      )
    }

    const hotPlayerSlide = (abbr: string, name: string, color: string, hotStreaks: any[] | undefined) => {
      const top: StreakWithZones | undefined = (hotStreaks ?? [])
        .filter(s => s.player_type === 'batter')
        .sort((a, b) => b.magnitude - a.magnitude)[0]
      return (
        <SlideFrame kicker={`${abbr} · Form`} title="Hot Player">
          {!top ? (
            <p className="text-stone-400 font-mono text-xs italic px-1">No standout form signal tonight.</p>
          ) : (
            <div className="px-1">
              <div className="flex items-center gap-3 mb-3 px-1">
                <img
                  src={headshotUrl(top.player_id) ?? ''}
                  alt=""
                  crossOrigin="anonymous"
                  className="w-14 h-14 rounded-full object-cover border-2 border-[#FF5722] bg-stone-100 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-stone-900 font-bold text-lg leading-tight truncate" style={{ fontFamily: "'Fraunces', serif" }}>
                    {top.player_name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded text-white"
                      style={{ background: top.signal === 'heating' ? '#15803D' : '#B91C1C' }}
                    >
                      {top.signal === 'heating' ? '▲ HOT' : '▼ COLD'}
                    </span>
                    {top.extreme_value != null && (
                      <span className="font-mono text-[9px] text-stone-500">
                        from {top.extreme_value.toFixed(3).replace(/^0/, '')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

                           {/* Explicit window label — moved above the primary stats
                  so it's clear these numbers are OVER that stretch */}
              <p className="font-mono text-[9px] uppercase tracking-widest text-stone-500 mb-1.5 px-1">
                Stretch: Last {top.games ?? '—'} games
              </p>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <StatBig
                  label="Rolling OPS"
                  value={top.current_value}
                  decimals={3}
                  color={top.signal === 'heating' ? '#15803D' : '#B91C1C'}
                />
                {top.avg != null && <StatBig label="AVG" value={top.avg} decimals={3} />}
                {top.rbi != null && <StatBig label="RBI" value={top.rbi} decimals={0} />}
                {top.runs != null && <StatBig label="Runs" value={top.runs} decimals={0} />}
              </div>

              {/* xBA / xwOBA — season-long from Savant, client-fetched.
                  Rendered separately from the rolling stats above because
                  they're a different WINDOW (season, not L15). Populates
                  ~1-2s after the slide first renders. */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                {(() => {
                  const x = xstatsByPlayerId[top.player_id]
                  return (
                    <>
                      <StatBig label="xBA (season)" value={x?.xba ?? null} decimals={3} />
                      <StatBig label="xwOBA (season)" value={x?.xwoba ?? null} decimals={3} />
                    </>
                  )
                })()}
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                {top.walks != null && (
                  <div className="bg-stone-50 rounded-xl px-2.5 py-1.5 border border-stone-200">
                    <p className="font-mono text-[8px] uppercase tracking-widest text-stone-500">BB</p>
                    <CountUp value={top.walks} decimals={0} className="font-mono text-lg font-bold text-stone-900" />
                  </div>
                )}
                {top.games != null && (
                  <div className="bg-stone-50 rounded-xl px-2.5 py-1.5 border border-stone-200">
                    <p className="font-mono text-[8px] uppercase tracking-widest text-stone-500">Games</p>
                    <span className="font-mono text-lg font-bold text-stone-900">L{top.games}</span>
                  </div>
                )}
              </div>

              {top.recentGameLog && top.recentGameLog.length >= 3 && (
                <div className="bg-stone-50 rounded-xl px-2.5 py-2 mt-1 border border-stone-200">
                  <p className="font-mono text-[8px] uppercase tracking-widest text-stone-500 mb-1">Per-game trend</p>
                  <MiniSparkline
                    data={top.recentGameLog}
                    color={top.signal === 'heating' ? '#15803D' : '#B91C1C'}
                  />
                </div>
              )}
            </div>
          )}
        </SlideFrame>
      )
    }

    return [
      {
        id: 'header',
        content: (
          <SlideFrame kicker="The Edge · Game Preview" title={current.matchup}>
            <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-2">
              <div className="px-4 py-1.5 rounded-full bg-[#FF5722] text-white font-mono text-xs font-bold tracking-wider">
                {current.factor_count}/8 LEAN · {current.lean_team}
              </div>
              {current.dominant_factor && (
                <p className="text-stone-500 text-xs font-mono">Led by {current.dominant_factor}</p>
              )}
            </div>
          </SlideFrame>
        ),
      },
      {
        id: 'sp-matchup',
        content: (
          <SlideFrame kicker="Probable Pitchers" title="SP Matchup">
            <div className="grid grid-cols-2 gap-2 px-1">
              <SPCard
                name={current.awayPitcherName ?? 'TBD'}
                abbr={awayAbbr}
                color={awayColor}
                pid={awayPid}
                stats={current.awayPitcherStats}
              />
              <SPCard
                name={current.homePitcherName ?? 'TBD'}
                abbr={homeAbbr}
                color={homeColor}
                pid={homePid}
                stats={current.homePitcherStats}
              />
            </div>
          </SlideFrame>
        ),
      },
     { id: 'bullpen-away', content: bullpenSlide(awayAbbr, awayColor, current.awayWorkload, [awayPid].filter(Boolean) as number[]) },
{ id: 'bullpen-home', content: bullpenSlide(homeAbbr, homeColor, current.homeWorkload, [homePid].filter(Boolean) as number[]) },
      { id: 'fielding-away', content: fieldingSlide(awayAbbr, current.awayName ?? awayAbbr, awayColor, current.awayFieldingAlignment) },
      { id: 'fielding-home', content: fieldingSlide(homeAbbr, current.homeName ?? homeAbbr, homeColor, current.homeFieldingAlignment) },
            { id: 'streak-away', content: streakSlide(awayAbbr, awayColor, current.awayLiteralBatters, current.awayPitcherTrend, awayFormLookup, awaySeasonLookup) },
      { id: 'streak-home', content: streakSlide(homeAbbr, homeColor, current.homeLiteralBatters, current.homePitcherTrend, homeFormLookup, homeSeasonLookup) },
      { id: 'hot-away', content: hotPlayerSlide(awayAbbr, current.awayName ?? awayAbbr, awayColor, current.awayHotStreaks) },
      { id: 'hot-home', content: hotPlayerSlide(homeAbbr, current.homeName ?? homeAbbr, homeColor, current.homeHotStreaks) },
      {
        id: 'close',
        content: (
          <SlideFrame kicker="Edge Lean" title="The Read">
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-2">
              <div
                className="text-3xl font-bold uppercase text-stone-900"
                style={{ fontFamily: 'Bebas Neue, sans-serif' }}
              >
                {current.lean_team}
              </div>
              <p className="text-stone-500 text-sm font-mono">{current.factor_count}/8 factors</p>
              <p className="text-xs text-[#FF5722] mt-4 font-mono tracking-widest font-bold">THE EDGE READS</p>
            </div>
          </SlideFrame>
        ),
      },
    ]
  }, [current, awayAbbr, homeAbbr])

  const SLIDE_COUNT = slides.length

  useEffect(() => { setSlide(0) }, [active])

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
        slideCount: SLIDE_COUNT,
        slideMs: SLIDE_MS,
        settleMs: SETTLE_MS,
        onProgress: setExportProgress,
        // Cross-fade between every slide in the exported MP4
        setTransitionState: setTransition,
                transitionMs: 700,
        transitionFrames: 21,
        transitionSettleMs: 50,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `the-edge-preview-${current?.game_pk ?? 'game'}-${slateDate}.mp4`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Teaser export failed:', err)
      setExportError(
        err instanceof Error && /tainted|cross-origin|CORS/i.test(err.message)
          ? 'A headshot/logo image blocked capture (CORS).'
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

           <div className="flex justify-center relative">
        <div
          ref={frameRef}
          className="relative bg-white rounded-[28px] overflow-hidden shadow-2xl cursor-pointer select-none border border-stone-200"
          style={{ width: 340, height: 604 }}
          onClick={(e) => {
            if (exporting) return
            const rect = e.currentTarget.getBoundingClientRect()
            const x = e.clientX - rect.left
            if (x < 120) {
              if (slide === 0) setActive(a => (a - 1 + games.length) % games.length)
              else setSlide(s => s - 1)
            } else {
              if (slide >= slides.length - 1) setActive(a => (a + 1) % games.length)
              else setSlide(s => s + 1)
            }
          }}
        >
          {/* Progress bars — identical language to TrendingReelSlideshow */}
          <div className="absolute top-4 left-4 right-4 z-20 flex gap-1.5">
            {slides.map((_, i) => (
              <div key={i} className="h-[3px] flex-1 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,.1)' }}>
                <div
                  className="h-full rounded-full origin-left"
                  style={{
                    background: '#FF5722',
                    transform: `scaleX(${i < slide ? 1 : i === slide ? 1 : 0})`,
                    transition: i === slide && playing ? `transform ${SLIDE_MS}ms linear` : 'none',
                  }}
                />
              </div>
            ))}
          </div>

          <div className="absolute inset-0 pt-10 pb-4 px-4">
                       {transition ? (
              // Export-time only: both slides overlaid for cross-fade frames.
              // Keys force remount so CountUp / bar grow re-run on each slide.
              <div className="relative h-full">
                <div className="absolute inset-0" style={{ opacity: 1 - transition.progress }}>
                  <div key={`from-${transition.from}`} className="h-full">
                    {slides[transition.from]?.content}
                  </div>
                </div>
                <div className="absolute inset-0" style={{ opacity: transition.progress }}>
                  <div key={`to-${transition.to}`} className="h-full">
                    {slides[transition.to]?.content}
                  </div>
                </div>
              </div>
            ) : (
              <div key={`${active}-${slide}-${slides[slide]?.id}`} className="h-full animate-in">
                {slides[slide]?.content}
              </div>
            )}
          </div>

                  </div>

        {exporting && (
          <div className="absolute inset-0 z-30 bg-black/60 flex flex-col items-center justify-center gap-2 rounded-[28px] pointer-events-none">
            <span className="font-mono text-xs text-white">Exporting… {Math.round(exportProgress)}%</span>
          </div>
        )}
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

export default GamePreviewTeaser