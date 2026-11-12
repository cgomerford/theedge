// src/components/pitch-shape/heatPaint.ts
//
// Draws a league shape heat map as crisp square blocks: one flat-coloured box per sample, no blur and no stretching. The canvas is exactly one pixel per sample and the page shows it with
// `image-rendering: pixelated`, so every box keeps a hard edge at any size. A sample under the swing minimum is left as the background, never coloured.
import { heatRgb } from './heatGrid'

export const BACKGROUND: [number, number, number] = [241, 238, 230]

/** paint an n x n block map; colour(i) gives the box at index i (row 0 = lowest ride, column 0 = lowest run) or null for blank. Up on screen = more ride. */
export function paintBlocks(cv: HTMLCanvasElement, n: number, colour: (i: number) => ArrayLike<number> | null) {
  cv.width = n; cv.height = n
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const img = ctx.createImageData(n, n)
  for (let yy = 0; yy < n; yy++) {
    for (let xx = 0; xx < n; xx++) {
      const rgb = colour(yy * n + xx) ?? BACKGROUND
      const o = ((n - 1 - yy) * n + xx) * 4
      img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** the block colour for a whiffs-per-swing rate, or blank when there is none */
export const rateColour = (rate: number | null) => (rate == null ? null : heatRgb(rate))
