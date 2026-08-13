// src/lib/scout-video.ts
//
// Canvas frame-drawing for the Scout Report MP4 export — reuses the
// record → transcode pipeline from video-export.ts (recordToWebm,
// transcodeWebmToMp4, preloadFonts, CANVAS) rather than duplicating it;
// only the DRAWING is different here, because ScoutRow content is a full
// sentence, not a short stat value.
//
// PUBLIC-SAFETY NOTE: ScoutRow.leanLabel (e.g. "PHI +") is never drawn
// verbatim — it reads too close to spread/pick notation for a public
// video. Everything here goes through leanPhrase() below, which renders
// "Leans PHI" or "Worth watching" instead. ScoutRow.weight (the internal
// ranking score) is never drawn at all. Nothing here touches the Edge
// Score — ScoutRow doesn't carry it.
//
// Only pitching rows have a real subsectionPlayerId (a specific pitcher).
// Batting/bullpen/moves rows get a team logo based on row.lean; neutral
// rows (weather, park, series context) get no team attribution at all —
// they're facts about the game, not either side.

import { playerHeadshotUrl, teamLogoUrlPng } from '@/lib/mlb'
import { CANVAS, preloadFonts, recordToWebm, transcodeWebmToMp4 } from '@/lib/video-export'
import type { ScoutRow, ScoutSection } from '@/lib/scout'

export { CANVAS, preloadFonts, recordToWebm, transcodeWebmToMp4 }

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

const SECTION_LABEL: Record<ScoutSection, string> = {
  pitching: 'Pitching',
  batting: 'Batting',
  offense: 'Offense',
  bullpen: 'Bullpen',
  moves: 'Roster Move',
  situation: 'Situation',
}

export interface ScoutVideoContext {
  gameSlug: string
  awayAbbr: string
  homeAbbr: string
  awayTeamId: number
  homeTeamId: number
}

// ── Easing / progress (same shape as video-export.ts, kept local so this
// file has no hidden coupling to that module's internals) ───────────────

function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3) }
function easeOutBack(t: number): number {
  const c1 = 1.70158, c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
function clamp01(t: number): number { return Math.max(0, Math.min(1, t)) }
function windowProgress(elapsedMs: number, startMs: number, endMs: number, ease = easeOutCubic): number {
  if (elapsedMs <= startMs) return 0
  if (elapsedMs >= endMs) return 1
  return ease(clamp01((elapsedMs - startMs) / (endMs - startMs)))
}

// ── Plain-English lean, never the raw leanLabel token ────────────────────

function leanPhrase(row: ScoutRow, awayAbbr: string, homeAbbr: string): string {
  if (row.lean === 'neutral') return 'Worth watching'
  return `Leans ${row.lean === 'home' ? homeAbbr : awayAbbr}`
}

// ── Image preload (headshot for pitching rows, team logo otherwise, ⊕ for
// neutral rows — never fabricated, always a graceful fallback) ──────────

export interface ScoutImage {
  img: HTMLImageElement | null
  isTeam: boolean
  initials: string   // used as fallback badge content
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

function initialsOf(name: string | null | undefined): string {
  if (!name) return '⊕'
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
}

export async function preloadScoutRowImage(row: ScoutRow, ctx: ScoutVideoContext): Promise<ScoutImage> {
  if (row.subsectionPlayerId != null) {
    const img = await loadImg(playerHeadshotUrl(row.subsectionPlayerId, 300))
    const nameGuess = row.subsection?.split('·')[0]?.trim()
    return { img, isTeam: false, initials: initialsOf(nameGuess) }
  }
  if (row.lean === 'home' || row.lean === 'away') {
    const teamId = row.lean === 'home' ? ctx.homeTeamId : ctx.awayTeamId
    const abbr = row.lean === 'home' ? ctx.homeAbbr : ctx.awayAbbr
    const img = await loadImg(teamLogoUrlPng(teamId, 240))
    return { img, isTeam: true, initials: abbr }
  }
  return { img: null, isTeam: false, initials: '⊕' }
}

// ── Drawing primitives ───────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = COLORS.cream
  ctx.fillRect(0, 0, CANVAS.w, CANVAS.h)
}

function drawBrandBar(ctx: CanvasRenderingContext2D, revealT: number) {
  ctx.save()
  ctx.globalAlpha = revealT
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COLORS.orange
  ctx.font = `700 44px "${FONTS.display}"`
  ctx.fillText('⊕', 60, 110)
  ctx.fillStyle = COLORS.stone
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
  ctx.font = `700 ${Math.round(r * 0.6 * scale)}px "${FONTS.mono}"`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initials, cx, cy + 4)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Word-wraps to maxWidth, capped at 5 lines — ScoutRow.line is normally
 *  one or two sentences (well under this), but a long line gets cut
 *  rather than overflowing the frame. If you're seeing truncated lines
 *  often, that's a signal to raise the cap or shrink the font, not a bug. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    const test = current ? `${current} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current)
      current = w
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 5)
}

// ── Single scout row frame ───────────────────────────────────────────────

export function drawScoutRowFrame(
  ctx: CanvasRenderingContext2D,
  row: ScoutRow,
  image: ScoutImage,
  vidCtx: ScoutVideoContext,
  elapsedMs: number,
) {
  drawBackground(ctx)
  drawBrandBar(ctx, windowProgress(elapsedMs, 0, 400))

  const cx = CANVAS.w / 2

  // Badge (headshot / team logo / ⊕ mark)
  const badgeCy = 500
  const badgeR = 160
  const badgeScale = 0.6 + 0.4 * windowProgress(elapsedMs, 200, 900, easeOutBack)
  ctx.save()
  ctx.globalAlpha = windowProgress(elapsedMs, 200, 700)
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

  // Section chip
  ctx.save()
  ctx.globalAlpha = windowProgress(elapsedMs, 700, 1000)
  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.orange
  ctx.font = `700 30px "${FONTS.mono}"`
  const teamTag = row.subsection?.split('·')[1]?.trim() ?? row.subsection?.split('·')[0]?.trim() ?? ''
  ctx.fillText(`${SECTION_LABEL[row.section].toUpperCase()}${teamTag ? ' · ' + teamTag.toUpperCase() : ''}`, cx, 750)
  ctx.restore()

  let nextY = 830

  // Highlight (short punchy phrase, if present)
  if (row.highlight) {
    ctx.save()
    ctx.globalAlpha = windowProgress(elapsedMs, 900, 1300)
    ctx.fillStyle = COLORS.stone
    ctx.font = `400 110px "${FONTS.big}"`
    ctx.textAlign = 'center'
    ctx.fillText(row.highlight, cx, nextY + 90)
    ctx.restore()
    nextY += 170
  }

  // Full sentence, wrapped
  ctx.save()
  ctx.globalAlpha = windowProgress(elapsedMs, 1300, 1800)
  ctx.fillStyle = COLORS.stone
  ctx.font = `600 44px "${FONTS.body}"`
  ctx.textAlign = 'center'
  const wrapped = wrapText(ctx, row.line, 860)
  let ly = nextY + 60
  for (const l of wrapped) { ctx.fillText(l, cx, ly); ly += 56 }
  ctx.restore()

  // Lean pill
  const phrase = leanPhrase(row, vidCtx.awayAbbr, vidCtx.homeAbbr).toUpperCase()
  ctx.save()
  ctx.globalAlpha = windowProgress(elapsedMs, 1900, 2300)
  ctx.font = `700 30px "${FONTS.mono}"`
  const pillW = ctx.measureText(phrase).width + 56
  const pillY = ly + 30
  ctx.fillStyle = COLORS.orange
  roundRectPath(ctx, cx - pillW / 2, pillY, pillW, 58, 29)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(phrase, cx, pillY + 30)
  ctx.textBaseline = 'alphabetic'
  ctx.restore()

  // Sample tag
  ctx.save()
  ctx.globalAlpha = windowProgress(elapsedMs, 1900, 2300)
  ctx.fillStyle = COLORS.gray
  ctx.font = `400 24px "${FONTS.mono}"`
  ctx.textAlign = 'center'
  ctx.fillText(row.sampleTag.toUpperCase(), cx, pillY + 100)
  ctx.restore()

  // CTA + watermark
  ctx.save()
  ctx.globalAlpha = windowProgress(elapsedMs, 2400, 2800)
  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.stone
  ctx.font = `700 28px "${FONTS.mono}"`
  ctx.fillText('FULL SCOUT REPORT →', cx, CANVAS.h - 130)
  ctx.fillStyle = COLORS.orange
  ctx.font = `700 28px "${FONTS.mono}"`
  ctx.fillText('edgereportdaily.com', cx, CANVAS.h - 90)
  ctx.restore()
  ctx.textAlign = 'left'
}

// ── Multi-row reel — same slot/cross-fade pattern as the Top3 reel ──────

export interface ScoutReelConfig {
  rows: ScoutRow[]
  images: ScoutImage[]   // parallel to rows
  context: ScoutVideoContext
  slotMs: number          // longer than the stat reel — there's a sentence to read; 4500 is a reasonable default
  crossfadeMs: number
}

export function scoutReelDurationMs(cfg: ScoutReelConfig): number {
  return cfg.rows.length * cfg.slotMs
}

export function drawScoutReelFrame(ctx: CanvasRenderingContext2D, cfg: ScoutReelConfig, elapsedMs: number) {
  const idx = Math.min(cfg.rows.length - 1, Math.floor(elapsedMs / cfg.slotMs))
  const localMs = elapsedMs - idx * cfg.slotMs

  drawScoutRowFrame(ctx, cfg.rows[idx], cfg.images[idx], cfg.context, Math.min(localMs, cfg.slotMs - cfg.crossfadeMs))

  const fadeStart = cfg.slotMs - cfg.crossfadeMs
  if (localMs > fadeStart && idx + 1 < cfg.rows.length) {
    const fadeT = clamp01((localMs - fadeStart) / cfg.crossfadeMs)
    ctx.save()
    ctx.globalAlpha = fadeT
    drawScoutRowFrame(ctx, cfg.rows[idx + 1], cfg.images[idx + 1], cfg.context, 1800)
    ctx.restore()
  }

  // Progress dots
  ctx.save()
  const dotY = 140
  const totalW = cfg.rows.length * 24
  const startX = CANVAS.w / 2 - totalW / 2
  for (let i = 0; i < cfg.rows.length; i++) {
    ctx.fillStyle = i === idx ? COLORS.orange : `${COLORS.gray}66`
    ctx.beginPath()
    ctx.arc(startX + i * 24 + 8, dotY, i === idx ? 7 : 5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}