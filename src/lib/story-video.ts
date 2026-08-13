// src/lib/story-video.ts
//
// Captures AllGamesStorySlideshow as a sequence of stills (one per slide,
// via html-to-image) and assembles them into an MP4 via ffmpeg.wasm's
// image2 demuxer — NOT a real-time recording. Real-time canvas.captureStream
// (the approach in video-export.ts / scout-video.ts) doesn't apply here:
// the slideshow renders real DOM (recharts, SVG hot zones, CSS keyframe
// animations), not a canvas, so there's nothing to hand to MediaRecorder
// directly. Screenshot-per-slide + still-image encode is the reliable path
// for content this complex.
//
// Each slide is held for `slideMs` (matches the on-screen SLIDE_MS) in the
// output video via ffmpeg's -framerate flag on the input image sequence.

import { toPng } from 'html-to-image'
import { loadFFmpegInstance } from '@/lib/video-export'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export interface CaptureStoryOptions {
  frameElRef: React.RefObject<HTMLDivElement | null>
  setSlideIndex: (i: number) => void
  slideCount: number
  slideMs: number
  onProgress?: (pct: number) => void
  /** Delay after setSlideIndex before screenshotting, to let the slide's
   *  0.32s fadeUp animation (and any chart re-render) settle. Default 550ms
   *  — comfortably past the 320ms CSS animation, with margin for a recharts
   *  re-render on slower machines. If exported frames show a slide
   *  mid-fade-in, raise this first before touching anything else. */
  settleMs?: number
}

/** Screenshots every slide in sequence, then assembles them into an MP4.
 *  Caller is responsible for pausing autoplay before calling this and
 *  resuming after — this function only drives setSlideIndex, it doesn't
 *  touch the play/pause state itself. */
export async function captureStoryToMp4(opts: CaptureStoryOptions): Promise<Blob> {
  const settleMs = opts.settleMs ?? 550
  const frameDataUrls: string[] = []

  for (let i = 0; i < opts.slideCount; i++) {
    opts.setSlideIndex(i)
    await sleep(settleMs)

    const el = opts.frameElRef.current
    if (!el) throw new Error('Story frame element not mounted')

    const dataUrl = await toPng(el, { cacheBust: true, pixelRatio: 2 })
    frameDataUrls.push(dataUrl)

    // Screenshot phase is the first half of the progress bar; encode is the second half.
    opts.onProgress?.(((i + 1) / opts.slideCount) * 50)
  }

  const { ffmpeg, fetchFile } = await loadFFmpegInstance()

  ffmpeg.on('progress', ({ progress }) => {
    opts.onProgress?.(50 + Math.min(100, Math.round(progress * 100)) * 0.5)
  })

  for (let i = 0; i < frameDataUrls.length; i++) {
    const bytes = await fetchFile(frameDataUrls[i])
    await ffmpeg.writeFile(`frame${String(i).padStart(4, '0')}.png`, bytes)
  }

  // Each input frame held for slideMs; -r 30 on the output gives standard
  // smooth playback (ffmpeg duplicates frames to hit 30fps from the slow
  // input rate) rather than a literal 1-frame-per-6-seconds video, which
  // some players/platforms handle poorly.
  const inputFramerate = 1 / (opts.slideMs / 1000)
  await ffmpeg.exec([
    '-framerate', String(inputFramerate),
    '-i', 'frame%04d.png',
    '-r', '30',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    'output.mp4',
  ])

  const data = await ffmpeg.readFile('output.mp4')
  opts.onProgress?.(100)
  return new Blob([data as Uint8Array], { type: 'video/mp4' })
}