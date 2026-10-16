'use client'

import type { ReactNode } from 'react'
import { FRAME, PROGRESS, SAFE } from './layout'
import { push } from './motion'
import { PhotoContext } from './parts/PhotoContext'
import type { PhotoMap } from './headshot'
import Abs from './segments/Abs'
import BullpenAvail from './segments/BullpenAvail'
import PartHook from './segments/PartHook'
import ClubStatus from './segments/ClubStatus'
import Late from './segments/Late'
import Lineup from './segments/Lineup'
import RunGame from './segments/RunGame'
import SpArsenal from './segments/SpArsenal'
import SpTto from './segments/SpTto'
import Close from './segments/Close'
import Defense from './segments/Defense'
import Form from './segments/Form'
import Hook from './segments/Hook'
import SpDuel from './segments/SpDuel'
import Streaks from './segments/Streaks'
import { segmentAt, type Timeline, type TimelineEntry } from './timeline'
import type { AnySegmentId, SegmentId, StoryGame } from './types'

export const STORY_W = FRAME.w
export const STORY_H = FRAME.h

export type RenderSegment = (id: AnySegmentId, localT: number, dur: number) => ReactNode

/** The Game Preview story's slides. The Pitcher Reel passes its own RenderSegment. */
export function gameRenderer(game: StoryGame): RenderSegment {
  return (id, localT, dur) => renderSegment(id as SegmentId, game, localT, dur)
}

function renderSegment(id: SegmentId, game: StoryGame, localT: number, dur: number): ReactNode {
  const p = { game, localT, dur }
  switch (id) {
    case 'hook': return <Hook {...p} />
    case 'part-hook': return <PartHook {...p} />
    case 'bullpen-avail': return <BullpenAvail {...p} />
    case 'sp': return <SpDuel {...p} />
    case 'sp-arsenal': return <SpArsenal {...p} />
    case 'sp-tto': return <SpTto {...p} />
    case 'lineup-away': return <Lineup {...p} side="away" />
    case 'lineup-home': return <Lineup {...p} side="home" />
    case 'late': return <Late {...p} />
    case 'run-game': return <RunGame {...p} />
    case 'abs': return <Abs {...p} />
    case 'club-status': return <ClubStatus {...p} />
    case 'defense-away': return <Defense {...p} side="away" />
    case 'defense-home': return <Defense {...p} side="home" />
    case 'streaks': return <Streaks {...p} />
    case 'form': return <Form {...p} />
    case 'close': return <Close {...p} />
  }
}

function ProgressBar({ tl, index, localT }: { tl: Timeline; index: number; localT: number }) {
  const n = tl.entries.length
  const gap = 8
  const w = ((SAFE.right - SAFE.left) - gap * (n - 1)) / n
  return (
    <div style={{ position: 'absolute', left: SAFE.left, top: PROGRESS.y, width: SAFE.right - SAFE.left, height: PROGRESS.h, display: 'flex', gap }}>
      {tl.entries.map(e => {
        const fill = e.index < index ? 1 : e.index === index ? Math.min(1, localT / Math.max(e.duration * e.buildFrac, 0.001)) : 0
        return (
          <div key={e.id} style={{ width: w, height: PROGRESS.h, borderRadius: 4, background: 'rgba(250,248,243,.25)', overflow: 'hidden' }}>
            <div style={{ width: `${fill * 100}%`, height: '100%', background: '#FF5722' }} />
          </div>
        )
      })}
    </div>
  )
}

function SafeOverlay() {
  const red = 'rgba(255,0,0,.22)'
  return (
    <>
      <div style={{ position: 'absolute', left: 0, top: 0, width: STORY_W, height: SAFE.top, background: red }} />
      <div style={{ position: 'absolute', left: 0, top: SAFE.bottom, width: STORY_W, height: STORY_H - SAFE.bottom, background: red }} />
      <div style={{ position: 'absolute', left: 0, top: SAFE.top, width: SAFE.left, height: SAFE.bottom - SAFE.top, background: red }} />
      <div style={{ position: 'absolute', left: SAFE.right, top: SAFE.top, width: STORY_W - SAFE.right, height: SAFE.bottom - SAFE.top, background: red }} />
    </>
  )
}

/** The 1080x1920 frame. A pure function of (game, timeline, t). */
export default function StoryCanvas({ render, tl, t, photos, showSafe = false }: {
  render: RenderSegment; tl: Timeline; t: number; photos: PhotoMap; showSafe?: boolean
}) {
  const { entry, localT, pushing } = segmentAt(tl, t)
  const layer = (e: TimelineEntry, lt: number, x: number) => (
    <div key={e.id} style={{ position: 'absolute', inset: 0, transform: `translateX(${x}px)` }}>
      {render(e.id, lt, e.duration)}
    </div>
  )
  let layers: ReactNode
  if (pushing) {
    const k = push(pushing.p)
    const inX = STORY_W * (1 - k)
    layers = (
      <>
        {layer(pushing.from, pushing.from.duration, -STORY_W * k)}
        {layer(entry, localT, inX)}
        <div style={{ position: 'absolute', top: 0, height: STORY_H, width: 24, left: inX - 24, background: '#FF5722' }} />
      </>
    )
  } else layers = layer(entry, localT, 0)

  return (
    <PhotoContext.Provider value={photos}>
      <div data-story-canvas style={{ position: 'relative', width: STORY_W, height: STORY_H, background: '#1A1A1A', overflow: 'hidden' }}>
        {layers}
        <ProgressBar tl={tl} index={entry.index} localT={localT} />
        {showSafe && <SafeOverlay />}
      </div>
    </PhotoContext.Provider>
  )
}
