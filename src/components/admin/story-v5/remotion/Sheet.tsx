// src/components/admin/story-v5/remotion/Sheet.tsx
//
// Contact sheet: one tile per slide, each the video shown at the moment that slide's animations have finished (a few frames before it cuts).
// One still of this composition is the contact-sheet PNG. Uses the same Preview component, so it can never disagree with the video.

import { Sequence } from 'remotion'
import { Preview, type PreviewProps } from './Preview'
import { DEFAULT_SCENES, layout } from './config'

export const SHEET_COLS = 4
export const TILE_W = 540, TILE_H = 675
/** The frame to show for a slide: its animations are done and it has not cut yet. */
export const settledFrame = (from: number, length: number) => from + length - 8

export function sheetSize(n: number) { const rows = Math.ceil(Math.max(1, n) / SHEET_COLS); return { width: Math.min(n, SHEET_COLS) * TILE_W || TILE_W, height: rows * TILE_H } }

export function Sheet(props: PreviewProps) {
  const lay = layout(props.scenes ?? DEFAULT_SCENES)
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexWrap: 'wrap', background: '#e7e2d8' }}>
      {lay.scenes.map((s, i) => (
        <div key={`${s.id}${i}`} style={{ width: TILE_W, height: TILE_H, position: 'relative', overflow: 'hidden' }}>
          <div style={{ width: 1080, height: 1350, transform: 'scale(0.5)', transformOrigin: 'top left', position: 'absolute', left: 0, top: 0 }}>
            {/* a negative `from` shifts the whole video back, so at frame 0 of this one-frame sheet the video is at the settled frame */}
            <Sequence from={-settledFrame(s.from, s.length)} durationInFrames={lay.total} layout="none"><Preview {...props} /></Sequence>
          </div>
        </div>
      ))}
    </div>
  )
}
