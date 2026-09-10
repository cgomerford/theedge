// src/lib/story-video.ts
//
// Screenshot-per-slide capture pipeline, now with cross-slide TRANSITION
// FRAMES so the exported MP4 reads as a video rather than a hard-cut
// slideshow. Within-slide content still freezes on its final rendered
// state — count-ups/bar fills don't animate in the exported file, that's
// inherent to the still-image capture approach. See the older header
// version in git for why real-time canvas.captureStream doesn't apply
// (real DOM/recharts/SVG, nothing to hand to MediaRecorder directly).
//
// TRANSITION MECHANICS: between each pair of adjacent slides, we capture
// N intermediate opacity-blended frames. The caller controls this via a
// new setTransitionState({from, to, progress}) callback that renders BOTH
// slides at once with a CSS opacity mix. We screenshot the frame at each
// progress step (0→1), then move to the next slide's static hold.
//
// Frame budget at 30fps output:
//   still hold: (slideMs - transitionMs) × 30 / 1000 frames per slide
//   transition: transitionFrames frames blended in over transitionMs
// A 5000ms slideMs + 500ms/15-frame transition ⇒ 135 static frames
// followed by 15 blend frames for each slide.
//
// BACKWARD COMPATIBLE: if the caller doesn't pass setTransitionState or
// transitionMs, this behaves exactly like the old version (hard cuts,
// still per slide). No caller has to change to keep working — only
// GamePreviewTeaser opts into the new path.

import { toPng } from 'html-to-image'
import { loadFFmpegInstance } from '@/lib/video-export'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export interface TransitionState {
  from: number
  to: number
  progress: number // 0..1
}

export interface CaptureStoryOptions {
  frameElRef: React.RefObject<HTMLDivElement | null>
  setSlideIndex: (i: number) => void
  slideCount: number
  slideMs: number
  onProgress?: (pct: number) => void
  /** Delay after setSlideIndex before screenshotting a still, letting
   *  CSS/chart re-render settle. Default 550ms — comfortably past the
   *  320ms fadeUp animation, with margin for a recharts re-render. */
  settleMs?: number

  // ── NEW: transition support ────────────────────────────────────────
  /** If provided along with `transitionMs`, capture blended frames
   *  between each pair of adjacent slides. Caller is responsible for
   *  rendering BOTH slides overlaid with the correct opacity mix — this
   *  driver just calls the setter and screenshots. Omit both to fall
   *  back to the legacy hard-cut behavior. */
  setTransitionState?: (state: TransitionState | null) => void
  /** Total duration of each transition in the output video. Default 0
   *  (no transitions — legacy behavior). Try 500ms as a starting point. */
  transitionMs?: number
  /** Number of intermediate frames to capture per transition. Default 15
   *  (roughly 30fps for a 500ms transition). Higher = smoother but
   *  proportionally slower to capture. */
  transitionFrames?: number
  /** Wait between raising each transition frame's progress step and
   *  screenshotting, so the DOM has time to re-render the new opacity
   *  mix. Default 40ms — enough for a repaint on typical machines. */
  transitionSettleMs?: number
}

interface CapturedFrame {
  dataUrl: string
  holdMs: number // how long to hold this frame in the output video
}

export async function captureStoryToMp4(opts: CaptureStoryOptions): Promise<Blob> {
  const settleMs = opts.settleMs ?? 550
  const transitionMs = opts.transitionMs ?? 0
  const transitionFrames = opts.transitionFrames ?? 15
  const transitionSettleMs = opts.transitionSettleMs ?? 40
  const wantTransitions = transitionMs > 0 && !!opts.setTransitionState && opts.slideCount > 1

  const el = () => {
    const e = opts.frameElRef.current
    if (!e) throw new Error('Story frame element not mounted')
    return e
  }

  const captured: CapturedFrame[] = []
  const stillMs = wantTransitions ? Math.max(0, opts.slideMs - transitionMs) : opts.slideMs

  // Total "steps" for progress reporting = one per still + transitionFrames per transition + one for the encode phase.
      const animFrameCountForProgress = 8
  const totalSteps =
    opts.slideCount * animFrameCountForProgress +
    (wantTransitions ? (opts.slideCount - 1) * transitionFrames : 0)
  let stepsDone = 0
  const bumpProgress = () => {
    stepsDone++
    // Capture phase is the first 50% of the visible bar; encode is the rest.
    opts.onProgress?.((stepsDone / totalSteps) * 50)
  }
  // How many frames to sample while CountUp / bar grow run.
  // settleMs is the animation window (e.g. 1000ms); 15 frames ≈ 67ms steps.
  const animFrameCount = 8

  for (let i = 0; i < opts.slideCount; i++) {
    // Clear transition so only this slide is visible, then jump to it.
    if (wantTransitions) opts.setTransitionState?.(null)
    opts.setSlideIndex(i)

    // ── Animation samples (bars grow, CountUp ticks) ───────────────────
    // Capture several frames spaced across settleMs so the MP4 actually
    // shows the animation, not only the final settled state.
    const perAnimMs = settleMs / animFrameCount
    let lastAnimUrl = ''
    for (let f = 0; f < animFrameCount; f++) {
      await sleep(perAnimMs)
      lastAnimUrl = await toPng(el(), { cacheBust: true, pixelRatio: 2 })
      // All anim frames get a short hold except the last, which absorbs
      // the remaining still time so total slide length stays ~stillMs.
      const isLast = f === animFrameCount - 1
      const hold = isLast
        ? Math.max(perAnimMs, stillMs - (animFrameCount - 1) * perAnimMs)
        : perAnimMs
      captured.push({ dataUrl: lastAnimUrl, holdMs: hold })
      bumpProgress()
    }

    // ── Transition frames from slide i to slide i+1 ────────────────────
    if (wantTransitions && i < opts.slideCount - 1) {
      const perFrameMs = transitionMs / transitionFrames
            for (let f = 1; f <= transitionFrames; f++) {
        // Smoothstep so the blend eases in/out instead of a linear wipe
        const t = f / (transitionFrames + 1)
        const progress = t * t * (3 - 2 * t)
        opts.setTransitionState?.({ from: i, to: i + 1, progress })
        await sleep(transitionSettleMs)
        const transitionUrl = await toPng(el(), { cacheBust: true, pixelRatio: 2 })
        captured.push({ dataUrl: transitionUrl, holdMs: perFrameMs })
        bumpProgress()
      }
    }
  }
  // Reset UI state so the caller isn't left showing a partial transition
  if (wantTransitions) opts.setTransitionState?.(null)

  // ── Encode via ffmpeg's concat demuxer ─────────────────────────────
  // We can't use the simple -framerate approach anymore since different
  // frames have different hold durations (stills long, transition frames
  // short). Concat demuxer + per-file `duration` directives handles that.
  const { ffmpeg, fetchFile } = await loadFFmpegInstance()
  ffmpeg.on('progress', ({ progress }) => {
    opts.onProgress?.(50 + Math.min(100, Math.round(progress * 100)) * 0.5)
  })

  // Write frames to ffmpeg's virtual FS
  for (let idx = 0; idx < captured.length; idx++) {
    const bytes = await fetchFile(captured[idx].dataUrl)
    await ffmpeg.writeFile(`frame${String(idx).padStart(5, '0')}.png`, bytes)
  }

  // Build the concat manifest. Format:
  //   file 'frame00000.png'
  //   duration 4.5      # seconds — how long to hold this frame
  //   file 'frame00001.png'
  //   duration 0.033
  //   ...
  //   file 'frame00XXX.png'   # last file must be repeated with no duration,
  //                            # a quirk of the concat demuxer (otherwise
  //                            # the final frame gets dropped from output)
  const lastIdx = captured.length - 1
  const manifestLines: string[] = []
  for (let idx = 0; idx < captured.length; idx++) {
    const filename = `frame${String(idx).padStart(5, '0')}.png`
    manifestLines.push(`file '${filename}'`)
    manifestLines.push(`duration ${(captured[idx].holdMs / 1000).toFixed(4)}`)
  }
  // Concat-demuxer quirk: repeat the last file without a duration line
  manifestLines.push(`file 'frame${String(lastIdx).padStart(5, '0')}.png'`)
  const manifest = manifestLines.join('\n')
  await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(manifest))

  await ffmpeg.exec([
    '-f', 'concat',
    '-safe', '0',
    '-i', 'concat.txt',
    '-vsync', 'vfr',        // preserve variable per-frame durations from the manifest
    '-r', '30',             // output at 30fps — ffmpeg duplicates stills into 30fps frames
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    'output.mp4',
  ])

  const data = await ffmpeg.readFile('output.mp4') as Uint8Array
  const buf = new ArrayBuffer(data.byteLength)
  new Uint8Array(buf).set(data)
  opts.onProgress?.(100)
  return new Blob([buf], { type: 'video/mp4' })
}