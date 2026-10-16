// src/components/admin/story/storyCheck.ts
//
// Dev-only layout check (`?storyCheck=1`). jsdom can't lay out text, so this
// runs in the real browser: it renders every available segment unscaled at
// t = buildEnd + 0.01, measures every text node against SAFE ±1px, checks the
// mound is circular, and scans rendered text for banned words.

import { SAFE } from './layout'
import { buildTimeline, type Timeline } from './timeline'
import type { AnySegmentId as SegmentId, Segment } from './types'

export const BANNED = /\b(lean|leans|tilt|factor|factors|prediction|predictions|picks|odds|bet|bets|betting|lock|parlay|units|sharp)\b|toss-up|edge score/i

export type Violation = { segment: SegmentId; kind: 'safe' | 'mound' | 'banned' | 'moving-hold' | 'overlap'; text?: string; rect?: { l: number; t: number; r: number; b: number }; detail?: string }
export type CheckResult = { ok: boolean; violations: Violation[]; checked: SegmentId[] }

const TOL = 1

function textRects(canvas: HTMLElement) {
  const base = canvas.getBoundingClientRect()
  const out: { text: string; l: number; t: number; r: number; b: number }[] = []
  const walker = document.createTreeWalker(canvas, NodeFilter.SHOW_TEXT)
  let n: Node | null
  while ((n = walker.nextNode())) {
    const txt = (n.textContent ?? '').trim()
    if (!txt) continue
    const range = document.createRange()
    range.selectNodeContents(n)
    for (const r of Array.from(range.getClientRects())) {
      if (r.width === 0 || r.height === 0) continue
      out.push({ text: txt, l: r.left - base.left, t: r.top - base.top, r: r.right - base.left, b: r.bottom - base.top })
    }
  }
  return out
}

/** `show(t)` must render the canvas at t and resolve once committed (flushSync). */
export async function runStoryCheck(o: { segments: Segment[]; node: () => HTMLElement | null; show: (tl: Timeline, t: number) => Promise<void> }): Promise<CheckResult> {
  const violations: Violation[] = []
  const checked: SegmentId[] = []
  await document.fonts.ready
  for (const seg of o.segments) {
    const tl = buildTimeline([seg])
    const e = tl.entries[0]
    await o.show(tl, e.buildEnd + 0.01)
    await new Promise<void>(r => requestAnimationFrame(() => r()))
    const canvas = o.node()
    if (!canvas) continue
    checked.push(seg.id)
    for (const r of textRects(canvas)) {
      if (r.l < SAFE.left - TOL || r.r > SAFE.right + TOL || r.t < SAFE.top - TOL || r.b > SAFE.bottom + TOL) {
        // the progress bar carries no text; everything else must sit inside SAFE
        violations.push({ segment: seg.id, kind: 'safe', text: r.text.slice(0, 40), rect: { l: Math.round(r.l), t: Math.round(r.t), r: Math.round(r.r), b: Math.round(r.b) } })
      }
      if (BANNED.test(r.text)) violations.push({ segment: seg.id, kind: 'banned', text: r.text.slice(0, 60) })
    }
    // nothing may move during a hold: the DOM at buildEnd must equal the DOM later in the same hold
    const before = canvas.innerHTML
    await o.show(tl, Math.min(e.buildEnd + 0.6, e.duration - 0.05))
    await new Promise<void>(r => requestAnimationFrame(() => r()))
    const later = o.node()
    if (later && later.innerHTML !== before) violations.push({ segment: seg.id, kind: 'moving-hold', detail: 'content still changing after buildEnd' })
    // overspill: no two text runs may sit on top of each other (a foot colliding with the last row, wrapped tags, …)
    const rects = textRects(canvas)
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j]
        if (a.text === b.text) continue
        // shrink each box vertically 14% (line boxes of tight type legitimately touch)
        const ah = (a.b - a.t) * 0.14, bh = (b.b - b.t) * 0.14
        const w = Math.min(a.r, b.r) - Math.max(a.l, b.l)
        const h = Math.min(a.b - ah, b.b - bh) - Math.max(a.t + ah, b.t + bh)
        if (w > 4 && h > 4) {
          const inter = w * h
          const small = Math.min((a.r - a.l) * (a.b - a.t - 2 * ah), (b.r - b.l) * (b.b - b.t - 2 * bh))
          if (inter > small * 0.2) violations.push({ segment: seg.id, kind: 'overlap', text: `${a.text.slice(0, 22)} ⟂ ${b.text.slice(0, 22)}` })
        }
      }
    }
    const mound = canvas.querySelector('[data-mound]')
    if (mound) {
      const b = mound.getBoundingClientRect()
      if (Math.abs(b.width - b.height) > TOL) violations.push({ segment: seg.id, kind: 'mound', detail: `${b.width.toFixed(1)}×${b.height.toFixed(1)}` })
    }
  }
  const result = { ok: violations.length === 0, violations, checked }
  ;(window as unknown as { __storyCheck?: CheckResult }).__storyCheck = result
  console.table(violations.map(v => ({ segment: v.segment, kind: v.kind, text: v.text ?? v.detail ?? '', rect: v.rect ? JSON.stringify(v.rect) : '' })))
  return result
}
