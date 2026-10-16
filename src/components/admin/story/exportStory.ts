// src/components/admin/story/exportStory.ts
//
// MP4 exporter for the 1080x1920 story. The canvas is a pure function of t, so
// export = render t → capture → repeat, no screen recording. Frames inside a
// hold are identical, so a hold is captured ONCE and shown for its whole
// length (concat-demuxer durations) — most of the 32s costs one capture.
//
// Pipeline: toJpeg per distinct frame → ffmpeg.wasm FS (written as we go, no
// dataURLs kept) → concat demuxer → H.264 yuv420p, faststart, 30fps, no audio.
// Reuses loadFFmpegInstance (single-threaded wasm core) from video-export.ts.

import { getFontEmbedCSS, toJpeg } from 'html-to-image'
import { loadFFmpegInstance } from '@/lib/video-export'
import { STORY_FPS, holdKey, type Timeline } from './timeline'

export type ExportOptions = {
  /** the unscaled 1080x1920 node (outer element of StoryCanvas) */
  node: () => HTMLElement | null
  /** render the canvas at time t and resolve once React has committed it */
  setT: (t: number) => Promise<void>
  tl: Timeline
  /** frames per second for moving parts (30 = smooth, 15 = fast fallback); holds are always deduped */
  motionFps?: 30 | 15
  onProgress?: (pct: number, label: string) => void
}

export type ExportReport = { captures: number; frames: number; storySeconds: number; encodedFrames: number; captureSeconds: number; encodeSeconds: number; bytes: number }

const raf = () => new Promise<void>(r => requestAnimationFrame(() => r()))

export async function exportStoryMp4(o: ExportOptions): Promise<{ blob: Blob; report: ExportReport }> {
  const { tl } = o
  const step = o.motionFps === 15 ? 2 : 1                       // capture every 2nd 30fps frame, hold it 2/30
  const totalFrames = Math.ceil(tl.total * STORY_FPS)
  const el = () => { const n = o.node(); if (!n) throw new Error('Story canvas not mounted'); return n }

  const { ffmpeg, fetchFile } = await loadFFmpegInstance()
  const fontEmbedCSS = await getFontEmbedCSS(el())              // once; makes each frame much cheaper
  const t0 = performance.now()

  // frame list: [{ name, frames }] where frames = how many 30fps ticks the image is shown
  const clips: { name: string; frames: number }[] = []
  let lastHold: number | null = null
  let f = 0
  while (f < totalFrames) {
    const t = Math.min(f / STORY_FPS, tl.total - 1e-6)
    const key = holdKey(tl, t)
    if (key !== null && key === lastHold && clips.length) {
      clips[clips.length - 1].frames += 1                       // same hold: extend, no capture
      f += 1
      continue
    }
    lastHold = key
    await o.setT(t)
    await raf(); await raf()
    const url = await toJpeg(el(), { quality: 0.92, width: 1080, height: 1920, pixelRatio: 1, style: { transform: 'none' }, fontEmbedCSS })
    const name = `f${String(clips.length).padStart(5, '0')}.jpg`
    await ffmpeg.writeFile(name, await fetchFile(url))
    const span = key === null ? Math.min(step, totalFrames - f) : 1
    clips.push({ name, frames: span })
    f += span
    o.onProgress?.(Math.min(70, (f / totalFrames) * 70), 'Capturing frames')
  }
  const captureSeconds = (performance.now() - t0) / 1000

  // concat manifest: per-image duration; last file repeated (demuxer quirk)
  const lines: string[] = []
  for (const c of clips) lines.push(`file '${c.name}'`, `duration ${(c.frames / STORY_FPS).toFixed(5)}`)
  lines.push(`file '${clips[clips.length - 1].name}'`)
  await ffmpeg.writeFile('list.txt', new TextEncoder().encode(lines.join('\n')))

  const t1 = performance.now()
  ffmpeg.on('progress', ({ progress }) => o.onProgress?.(70 + Math.min(1, Math.max(0, progress)) * 30, 'Encoding MP4'))
  await ffmpeg.exec([
    '-f', 'concat', '-safe', '0', '-i', 'list.txt',
    '-vf', `fps=${STORY_FPS}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
    'out.mp4',
  ])
  const encodeSeconds = (performance.now() - t1) / 1000
  const data = (await ffmpeg.readFile('out.mp4')) as Uint8Array
  const buf = new ArrayBuffer(data.byteLength)
  new Uint8Array(buf).set(data)
  o.onProgress?.(100, 'Done')
  const encodedFrames = clips.reduce((s, c) => s + c.frames, 0)
  if (encodedFrames !== totalFrames) console.warn('[exportStoryMp4] frame count mismatch', { encodedFrames, totalFrames })
  const report: ExportReport = { captures: clips.length, frames: totalFrames, storySeconds: tl.total, encodedFrames, captureSeconds, encodeSeconds, bytes: data.byteLength }
  console.info('[exportStoryMp4]', report)
  return { blob: new Blob([buf], { type: 'video/mp4' }), report }
}
