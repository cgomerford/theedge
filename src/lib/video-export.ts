// src/lib/video-export.ts
//
// Canvas-based video engine for the /admin/yesterday-stats "export as MP4"
// feature. Two things live here: (1) frame-drawing functions for a single-
// stat reveal and a multi-stat reel, both hand-animated on a raw 2D canvas
// (no DOM screenshotting per frame — far too slow to hit real-time), and
// (2) the record → transcode pipeline.
//
// FONT NAMES: canvas ctx.font needs the LITERAL font-family name, not a CSS
// custom property — `var(--font-fraunces)` does nothing in canvas. FONTS
// below assumes next/font resolves to family names 'Fraunces', 'Bebas Neue',
// 'JetBrains Mono', 'Inter' (matching what's used elsewhere in admin
// components). If your next/font config aliases them to something else,
// fix the FONTS constants below — nothing else needs to change.
//
// Install:
//   npm install @ffmpeg/ffmpeg @ffmpeg/util
//
// NO COOP/COEP HEADERS NEEDED: uses the single-threaded ffmpeg-core build,
// loaded from unpkg on demand. The multi-threaded build is faster but
// requires SharedArrayBuffer, which means cross-origin-isolation headers
// on your whole app — deliberately avoided here since this is one admin
// tool, not worth the risk of breaking other cross-origin content site-wide.

import { playerHeadshotUrl, teamLogoUrlPng } from '@/lib/mlb'
import type { Top3Entry } from '@/types/live-tracker'

export interface VideoStatItem extends Top3Entry {
  categoryLabel: string
}

const COLORS = {
  cream: '#FAF8F3',
  orange: '#FF5722',
  stone: '#1A1A1A',
  gray: '#A3A3A3',
} as const

const FONTS = {
  display: 'Fraunces',
  big: 'Bebas Neue',
  mono: 'JetBrains Mono',
  body: 'Inter',
} as const

const CANVAS = { w: 1080, h: 1920 }

// ── Easing ────────────────────────────────────────────────────────────

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}
function easeOutBack(t: number): number {
  const c1 = 1.70158, c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t))
}
/** Maps elapsed ms into a 0-1 progress for a [start,end] window, eased. */
function windowProgress(elapsedMs: number, startMs: number, endMs: number, ease = easeOutCubic): number {
  if (elapsedMs <= startMs) return 0
  if (elapsedMs >= endMs) return 1
  return ease(clamp01((elapsedMs - startMs) / (endMs - startMs)))
}

/** Splits "101.4 mph" into { num: 101.4, suffix: " mph" } for count-up
 *  animation. Non-numeric values (rare) just render statically. */
function parseNumericValue(value: string): { num: number | null; prefix: string; suffix: string } {
  const m = value.match(/^([+-]?)(\d+(?:\.\d+)?)(.*)$/)
  if (!m) return { num: null, prefix: '', suffix: value }
  return { num: parseFloat(m[2]) * (m[1] === '-' ? -1 : 1), prefix: m[1], suffix: m[3] }
}

// ── Image preloading (with graceful fallback — never fabricate a photo) ──

export interface LoadedItemImage {
  img: HTMLImageElement | null   // null = fell back to initials/blank badge
  isTeam: boolean                // true = draw as square logo, false = circular headshot
  initials: string
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function initialsOf(name: string | null): string {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
}

export async function preloadItemImage(item: VideoStatItem): Promise<LoadedItemImage> {
  if (item.playerId != null) {
    const img = await loadImg(playerHeadshotUrl(item.playerId, 300))
    return { img, isTeam: false, initials: initialsOf(item.playerName) }
  }
  if (item.teamId != null) {
    const img = await loadImg(teamLogoUrlPng(item.teamId, 240))
    return { img, isTeam: true, initials: item.teamAbbr ?? '?' }
  }
  return { img: null, isTeam: false, initials: initialsOf(item.playerName) }
}

/** Await this before recording — canvas text needs the specific weights
 *  actually loaded, document.fonts.ready alone doesn't guarantee it. */
export async function preloadFonts(): Promise<void> {
  const specs = [
    `700 96px "${FONTS.display}"`,
    `400 40px "${FONTS.big}"`,
    `700 28px "${FONTS.mono}"`,
    `600 44px "${FONTS.body}"`,
  ]
  await Promise.all(specs.map(s => document.fonts.load(s)))
  await document.fonts.ready
}

// ── Drawing primitives ───────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = COLORS.cream
  ctx.fillRect(0, 0, CANVAS.w, CANVAS.h)
}

function drawBrandBar(ctx: CanvasRenderingContext2D, revealT: number) {
  ctx.save()
  ctx.globalAlpha = revealT
  ctx.fillStyle = COLORS.orange
  ctx.font = `700 44px "${FONTS.display}"`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('⊕', 60, 110)
  ctx.fillStyle = COLORS.stone
  ctx.font = `700 44px "${FONTS.display}"`
  ctx.fillText('THE EDGE', 110, 110)
  ctx.restore()
}

function drawCircularImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, r: number, scale: number) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r * scale, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  ctx.drawImage(img, cx - r * scale, cy - r * scale, r * 2 * scale, r * 2 * scale)
  ctx.restore()
}

function drawFallbackBadge(ctx: CanvasRenderingContext2D, initials: string, cx: number, cy: number, r: number, scale: number, square: boolean) {
  ctx.save()
  ctx.fillStyle = COLORS.stone
  if (square) {
    ctx.fillRect(cx - r * scale, cy - r * scale, r * 2 * scale, r * 2 * scale)
  } else {
    ctx.beginPath()
    ctx.arc(cx, cy, r * scale, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = COLORS.cream
  ctx.font = `700 ${Math.round(r * 0.7 * scale)}px "${FONTS.mono}"`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initials, cx, cy + 4)
  ctx.textAlign = 'left'
  ctx.restore()
}

// ── Single-stat reveal (default ~5000ms) ────────────────────────────────

export function drawSingleStatFrame(
  ctx: CanvasRenderingContext2D,
  item: VideoStatItem,
  image: LoadedItemImage,
  elapsedMs: number,
) {
  drawBackground(ctx)
  drawBrandBar(ctx, windowProgress(elapsedMs, 0, 400))

  const cx = CANVAS.w / 2
  const badgeCy = 640
  const badgeR = 220

  const badgeScale = 0.6 + 0.4 * windowProgress(elapsedMs, 200, 900, easeOutBack)
  const badgeAlpha = windowProgress(elapsedMs, 200, 700)
  ctx.save()
  ctx.globalAlpha = badgeAlpha
  if (image.img) {
    if (image.isTeam) {
      const s = badgeR * 2 * badgeScale
      ctx.drawImage(image.img, cx - s / 2, badgeCy - s / 2, s, s)
    } else {
      drawCircularImage(ctx, image.img, cx, badgeCy, badgeR, badgeScale)
    }
  } else {
    drawFallbackBadge(ctx, image.initials, cx, badgeCy, badgeR, badgeScale, image.isTeam)
  }
  ctx.restore()

  const nameY = 1000
  const nameAlpha = windowProgress(elapsedMs, 700, 1100)
  const nameShift = 30 * (1 - windowProgress(elapsedMs, 700, 1100))
  ctx.save()
  ctx.globalAlpha = nameAlpha
  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.stone
  ctx.font = `700 56px "${FONTS.body}"`
  ctx.fillText(item.playerName ?? item.teamAbbr ?? '', cx, nameY + nameShift)
  ctx.fillStyle = COLORS.gray
  ctx.font = `700 26px "${FONTS.mono}"`
  const sub = [item.teamAbbr, item.opponentAbbr ? `vs ${item.opponentAbbr}` : null].filter(Boolean).join('  ·  ')
  ctx.fillText(sub.toUpperCase(), cx, nameY + 46 + nameShift)
  ctx.restore()

  // Big number count-up
  const { num, prefix, suffix } = parseNumericValue(item.value)
  const numT = windowProgress(elapsedMs, 1100, 2400)
  const displayValue = num != null
    ? `${prefix}${(num * numT).toFixed(num % 1 !== 0 ? 1 : 0)}${suffix}`
    : item.value
  ctx.save()
  ctx.globalAlpha = windowProgress(elapsedMs, 1100, 1500)
  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.orange
  ctx.font = `400 190px "${FONTS.big}"`
  ctx.fillText(displayValue, cx, 1300)
  ctx.restore()

  // Category label + detail
  const labelAlpha = windowProgress(elapsedMs, 1600, 2000)
  ctx.save()
  ctx.globalAlpha = labelAlpha
  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.stone
  ctx.font = `700 34px "${FONTS.mono}"`
  ctx.fillText(item.categoryLabel.toUpperCase(), cx, 1420)
  ctx.fillStyle = COLORS.gray
  ctx.font = `400 28px "${FONTS.body}"`
  ctx.fillText(item.detail, cx, 1470)
  ctx.restore()

  // Watermark
  ctx.save()
  ctx.globalAlpha = 0.7
  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.gray
  ctx.font = `600 24px "${FONTS.mono}"`
  ctx.fillText('edgereportdaily.com', cx, CANVAS.h - 60)
  ctx.restore()
  ctx.textAlign = 'left'
}

// ── Multi-stat reel — fixed slot per item, cross-fade at boundaries ─────

export interface ReelConfig {
  items: VideoStatItem[]
  images: LoadedItemImage[]      // parallel array, same order as items
  slotMs: number                 // duration per item, e.g. 3000
  crossfadeMs: number            // e.g. 300
}

export function reelDurationMs(cfg: ReelConfig): number {
  return cfg.items.length * cfg.slotMs
}

export function drawReelFrame(ctx: CanvasRenderingContext2D, cfg: ReelConfig, elapsedMs: number) {
  const idx = Math.min(cfg.items.length - 1, Math.floor(elapsedMs / cfg.slotMs))
  const localMs = elapsedMs - idx * cfg.slotMs

  drawSingleStatFrame(ctx, cfg.items[idx], cfg.images[idx], Math.min(localMs, cfg.slotMs - cfg.crossfadeMs))

  // Cross-fade the NEXT item in over the tail of this slot
  const fadeStart = cfg.slotMs - cfg.crossfadeMs
  if (localMs > fadeStart && idx + 1 < cfg.items.length) {
    const fadeT = clamp01((localMs - fadeStart) / cfg.crossfadeMs)
    ctx.save()
    ctx.globalAlpha = fadeT
    drawSingleStatFrame(ctx, cfg.items[idx + 1], cfg.images[idx + 1], 1600) // start next item already "settled"
    ctx.restore()
  }

  // Progress dots
  ctx.save()
  const dotY = 160
  const totalW = cfg.items.length * 24
  const startX = CANVAS.w / 2 - totalW / 2
  for (let i = 0; i < cfg.items.length; i++) {
    ctx.fillStyle = i === idx ? COLORS.orange : `${COLORS.gray}66`
    ctx.beginPath()
    ctx.arc(startX + i * 24 + 8, dotY, i === idx ? 7 : 5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// ── Record canvas → WebM ─────────────────────────────────────────────────

export interface RecordOptions {
  durationMs: number
  drawFrame: (ctx: CanvasRenderingContext2D, elapsedMs: number) => void
  fps?: number
  onProgress?: (pct: number) => void
  /** If given, frames are ALSO drawn to this visible canvas for live preview. */
  previewCanvas?: HTMLCanvasElement | null
}

export async function recordToWebm(opts: RecordOptions): Promise<Blob> {
  const fps = opts.fps ?? 30
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS.w
  canvas.height = CANVAS.h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  const ctx2d: CanvasRenderingContext2D = ctx   // <-- add this line

  const previewCtx = opts.previewCanvas?.getContext('2d') ?? null

  const stream = canvas.captureStream(fps)
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm;codecs=vp8'
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 10_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }

  const stopped = new Promise<Blob>(resolve => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
  })

  recorder.start()
  const start = performance.now()

  await new Promise<void>(resolve => {
    function tick() {
      const elapsed = performance.now() - start
      opts.drawFrame(ctx2d, elapsed)   // <-- use ctx2d, not ctx
      if (previewCtx && opts.previewCanvas) {
        previewCtx.clearRect(0, 0, opts.previewCanvas.width, opts.previewCanvas.height)
        previewCtx.drawImage(canvas, 0, 0, opts.previewCanvas.width, opts.previewCanvas.height)
      }
      opts.onProgress?.(Math.min(99, (elapsed / opts.durationMs) * 100))
      if (elapsed < opts.durationMs) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })

  recorder.stop()
  const blob = await stopped
  opts.onProgress?.(100)
  return blob
}

// ── Transcode WebM → MP4 via ffmpeg.wasm (single-threaded, no COOP/COEP) ─
// ── Add this new export, and replace the body of transcodeWebmToMp4 to use it ──
// ── Transcode WebM → MP4 via ffmpeg.wasm (single-threaded, no COOP/COEP) ─

/** Shared ffmpeg.wasm loader — single-threaded core, no COOP/COEP headers
 *  needed (see file header note above). Both transcodeWebmToMp4 here and
 *  story-video.ts's still-image encode call this instead of each loading
 *  their own copy, so there's one place to bump the core version. */
export async function loadFFmpegInstance() {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util')

  const ffmpeg = new FFmpeg()
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  })

  return { ffmpeg, fetchFile }
}

export async function transcodeWebmToMp4(webmBlob: Blob, onProgress?: (pct: number) => void): Promise<Blob> {
  const { ffmpeg, fetchFile } = await loadFFmpegInstance()
  if (onProgress) {
    ffmpeg.on('progress', ({ progress }) => onProgress(Math.min(100, Math.round(progress * 100))))
  }

 const data = await ffmpeg.readFile('output.mp4') as Uint8Array
const buf = new ArrayBuffer(data.byteLength)
new Uint8Array(buf).set(data)
return new Blob([buf], { type: 'video/mp4' })
}

export { CANVAS }