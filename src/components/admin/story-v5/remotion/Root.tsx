// src/components/admin/story-v5/remotion/Root.tsx
//
// Remotion entry (used by the renderer bundle). Default props are a saved real build (WS Game 2) so the composition always has data to draw;
// the render job passes the real PreviewData as inputProps.

import { Composition } from 'remotion'
import sample from '../__fixtures__/preview-849802.json'
import { DEFAULT_SCENES, FPS, HEIGHT, WIDTH, layout } from './config'
import { Preview, type PreviewProps } from './Preview'
import { Sheet, sheetSize } from './Sheet'
import type { PreviewData } from '../types'

export function RemotionRoot() {
  const sheetN = DEFAULT_SCENES.length
  return (
    <>
    <Composition
      id="Preview"
      component={Preview as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={layout(DEFAULT_SCENES).total}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, layout((props as unknown as PreviewProps).scenes ?? DEFAULT_SCENES).total) })}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ data: sample as unknown as PreviewData, scenes: DEFAULT_SCENES, theme: 'paper' } satisfies Partial<PreviewProps> as Record<string, unknown>}
    />
    <Composition
      id="Sheet"
      component={Sheet as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={1}
      fps={FPS}
      width={sheetSize(sheetN).width}
      height={sheetSize(sheetN).height}
      calculateMetadata={({ props }) => { const n = layout((props as unknown as PreviewProps).scenes ?? DEFAULT_SCENES).scenes.length; return { ...sheetSize(n), durationInFrames: 1 } }}
      defaultProps={{ data: sample as unknown as PreviewData, scenes: DEFAULT_SCENES, theme: 'paper' } satisfies Partial<PreviewProps> as Record<string, unknown>}
    />
    </>
  )
}
