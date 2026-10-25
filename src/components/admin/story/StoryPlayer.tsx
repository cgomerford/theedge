'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { MONO } from '@/components/team/ui'
import { assertFontsLoaded } from './fonts'
import { exportStoryMp4 } from './exportStory'
import { cachedPhotos, preloadHeadshots, type PhotoMap } from './headshot'
import { storyPlayerIds } from './photos'
import { runStoryCheck, type CheckResult } from './storyCheck'
import { MAX_PART_S, splitStory, total as totalOf } from './split'
import StoryCanvas, { STORY_H, STORY_W, gameRenderer, type RenderSegment } from './StoryCanvas'
import { buildTimeline, type Timeline } from './timeline'
import { useStoryClock } from './useStoryClock'
import type { AnySegmentId, Segment, StoryGame } from './types'

const PREVIEW_W = 360
const SCALE = PREVIEW_W / STORY_W
const IS_DEV = process.env.NODE_ENV !== 'production'

type Props = {
  /** Game Preview story. The Pitcher Reel passes `render` + `playerIds` + `fileStem` instead. */
  game?: StoryGame
  render?: RenderSegment
  playerIds?: number[]
  fileStem?: string
  segments: Segment[]
  /** every available segment, canonical order — used only by the dev layout check */
  allSegments: Segment[]
  still?: AnySegmentId | null
  stillSafe?: boolean
  autoCheck?: boolean
}

export default function StoryPlayer({ game, render: renderProp, playerIds, fileStem, segments, allSegments, still, stillSafe, autoCheck }: Props) {
  const tl = useMemo(() => buildTimeline(segments), [segments])
  const clock = useStoryClock(tl)
  const render = useMemo<RenderSegment>(() => renderProp ?? gameRenderer(game as StoryGame), [renderProp, game])
  const ids = useMemo(() => playerIds ?? (game ? storyPlayerIds(game) : []), [playerIds, game])
  const [photos, setPhotos] = useState<PhotoMap>(() => cachedPhotos(ids))
  const [showSafe, setShowSafe] = useState(false)
  const [exportTl, setExportTl] = useState<Timeline | null>(null)     // non-null while exporting: drives the off-screen canvas
  const [exportT, setExportT] = useState(0)
  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(null)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [quality, setQuality] = useState<'30' | '15'>('30')
  const [check, setCheck] = useState<CheckResult | null>(null)
  const [checkTl, setCheckTl] = useState<Timeline | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const checkRef = useRef<HTMLDivElement>(null)
  const lastUrl = useRef<string | null>(null)
  const exporting = exportTl !== null

  // Only ids missing from the module cache are fetched; the rest are already in `photos`.
  useEffect(() => {
    let live = true
    preloadHeadshots(ids).then(m => { if (live) setPhotos(m) })
    return () => { live = false }
  }, [ids])

  const totalS = totalOf(segments)
  const over = totalS > MAX_PART_S
  const split = useMemo(() => (over ? splitStory(segments) : null), [over, segments])

  async function exportOne(segs: Segment[], suffix: string) {
    const etl = buildTimeline(segs)
    flushSync(() => { setExportTl(etl); setExportT(0) })
    const node = () => exportRef.current?.querySelector<HTMLElement>('[data-story-canvas]') ?? null
    const canvas = node()
    if (!canvas) throw new Error('Story canvas not mounted')
    await assertFontsLoaded(canvas)                                   // throws → export aborted, never fallback fonts
    const { blob, report } = await exportStoryMp4({
      node, setT: async t => { flushSync(() => setExportT(t)) },
      tl: etl, motionFps: quality === '15' ? 15 : 30,
      onProgress: (pct, label) => setProgress({ pct, label: suffix ? `${suffix.replace('-', '')} · ${label}` : label }),
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${fileStem ?? `the-edge-story-${game?.gamePk}-${game?.slateDate}`}${suffix}.mp4`; a.click()
    if (lastUrl.current) URL.revokeObjectURL(lastUrl.current)
    lastUrl.current = url
    return `${suffix || 'MP4'}: ${(report.bytes / 1e6).toFixed(1)} MB · ${report.captures} captures ${report.captureSeconds.toFixed(0)}s + ${report.encodeSeconds.toFixed(0)}s encode · ${report.storySeconds.toFixed(1)}s`
  }

  async function exportMp4(parts: Segment[][]) {
    clock.pause()
    setExportMsg(null); setProgress({ pct: 0, label: 'Preparing' })
    try {
      const all = await preloadHeadshots(ids, photos)                 // every headshot as a data URL first
      setPhotos(all)
      const lines: string[] = []
      for (let i = 0; i < parts.length; i++) lines.push(await exportOne(parts[i], parts.length > 1 ? `-part${i + 1}` : ''))
      setExportMsg(`Exported · fonts verified · ${lines.join(' | ')}`)
    } catch (err) {
      console.error('[StoryPlayer] export failed:', err)
      setExportMsg(err instanceof Error ? err.message : 'Export failed — see the console.')
    } finally {
      flushSync(() => setExportTl(null)); setProgress(null)
    }
  }

  async function runCheck() {
    // headshots must be in before measuring, otherwise a late image swap reads as a "moving hold"
    const loaded = await preloadHeadshots(ids, photos)
    flushSync(() => setPhotos(loaded))
    const res = await runStoryCheck({
      segments: allSegments,
      node: () => checkRef.current?.querySelector<HTMLElement>('[data-story-canvas]') ?? null,
      show: async (ctl, t) => { flushSync(() => { setCheckTl(ctl); setExportT(t) }) },
    })
    flushSync(() => { setCheck(res); setCheckTl(null) })
  }

  const autoRan = useRef(false)
  useEffect(() => {
    if (!autoCheck || autoRan.current || allSegments.length < 2) return
    autoRan.current = true
    void runCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per mount, after the data is ready
  }, [autoCheck, allSegments])

  // ?storyStill=<id>: the segment at the end of its build, full size, unscaled.
  if (still) {
    const e = tl.entries.find(x => x.id === still) ?? tl.entries[0]
    return (
      <div id="story-still" style={{ position: 'fixed', left: 0, top: 0, zIndex: 99999, width: STORY_W, height: STORY_H, background: '#1A1A1A' }}>
        <StoryCanvas render={render} tl={tl} t={e.buildEnd + 0.01} photos={photos} showSafe={!!stillSafe} />
      </div>
    )
  }

  const disabledReason = over ? `Over ${MAX_PART_S}s (${totalS.toFixed(1)}s) — remove slides or export as 2 parts` : ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <div
        style={{ width: PREVIEW_W, height: STORY_H * SCALE, position: 'relative', borderRadius: 18, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,.25)', cursor: 'pointer' }}
        onClick={e => {
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left
          if (x < PREVIEW_W / 3) clock.prev()
          else if (x > (PREVIEW_W * 2) / 3) clock.next()
          else clock.toggle()
        }}
      >
        <div style={{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width: STORY_W, height: STORY_H }}>
          <StoryCanvas render={render} tl={tl} t={clock.t} photos={photos} showSafe={IS_DEV && showSafe} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', fontFamily: MONO, fontSize: 12 }}>
        <button onClick={clock.toggle} className="px-4 py-1.5 rounded-sm bg-stone-200 hover:bg-stone-300 text-stone-800">{clock.playing ? 'Pause' : 'Play'}</button>
        <span className="text-stone-500">{clock.t.toFixed(1)}s / {tl.total.toFixed(1)}s</span>
        <select value={quality} onChange={e => setQuality(e.target.value as '30' | '15')} disabled={exporting} className="rounded border border-stone-300 bg-white px-2 py-1">
          <option value="30">Smooth · 30fps</option><option value="15">Fast · 15fps motion</option>
        </select>
        <button onClick={() => exportMp4([segments])} disabled={exporting || over} title={disabledReason} className="px-4 py-1.5 rounded-sm bg-[#FF5722] font-bold text-white disabled:opacity-40">
          {progress ? `${progress.label}… ${Math.round(progress.pct)}%` : 'Export MP4'}
        </button>
        {over && split && <button onClick={() => exportMp4(split)} disabled={exporting} className="px-4 py-1.5 rounded-sm bg-stone-800 font-bold text-white disabled:opacity-40">Export as 2 parts</button>}
        {IS_DEV && (
          <>
            <label className="text-stone-500"><input type="checkbox" checked={showSafe} onChange={e => setShowSafe(e.target.checked)} /> Show safe zones</label>
            <button onClick={() => void runCheck()} className="px-3 py-1 rounded-sm border border-stone-300 text-stone-700">Check layout</button>
          </>
        )}
      </div>
      {over && <p className="max-w-md text-center font-mono text-[11px] font-bold text-[#FF5722]">{disabledReason}{!split ? ' · Too long for 2 parts — remove slides' : ''}</p>}
      {split && over && <p className="max-w-md text-center font-mono text-[11px] text-stone-500">2 parts: {totalOf(split[0]).toFixed(1)}s + {totalOf(split[1]).toFixed(1)}s (part 2 opens with a 1.5s bumper)</p>}
      {exportMsg && <p className="max-w-md text-center font-mono text-[11px] text-stone-600">{exportMsg}</p>}
      {check && (
        <div className="max-w-md font-mono text-[11px]" data-story-check>
          <p className={check.ok ? 'font-bold text-green-700' : 'font-bold text-red-600'}>Layout check: {check.ok ? 'ok' : `${check.violations.length} violation(s)`} · {check.checked.length} slides</p>
          <ul>{check.violations.slice(0, 40).map((v, i) => <li key={i}>{v.segment} · {v.kind} · {v.text ?? v.detail} {v.rect ? JSON.stringify(v.rect) : ''}</li>)}</ul>
        </div>
      )}
      {exportTl && (
        <div ref={exportRef} aria-hidden style={{ position: 'fixed', left: -20000, top: 0, width: STORY_W, height: STORY_H, pointerEvents: 'none' }}>
          <StoryCanvas render={render} tl={exportTl} t={exportT} photos={photos} showSafe={false} />
        </div>
      )}
      {checkTl && (
        <div ref={checkRef} aria-hidden style={{ position: 'fixed', left: -20000, top: 0, width: STORY_W, height: STORY_H, pointerEvents: 'none' }}>
          <StoryCanvas render={render} tl={checkTl} t={exportT} photos={photos} showSafe={false} />
        </div>
      )}
    </div>
  )
}
