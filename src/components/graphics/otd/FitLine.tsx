'use client'

// One line of text that shrinks to fit its box instead of overflowing. It measures after layout and again once the font has loaded
// (the fallback font is a different width), steps the size down from `max` to `min`, and reports whether it still did not fit.

import { useLayoutEffect, useRef, type CSSProperties } from 'react'

export type FitInfo = { shrunk: boolean; clipped: boolean; size: number }

export default function FitLine({ text, max, min, style, onFit }: { text: string; max: number; min: number; style?: CSSProperties; onFit?: (i: FitInfo) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const report = useRef(onFit)
  report.current = onFit
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let live = true
    const fit = () => {
      if (!live) return
      let s = max
      el.style.fontSize = `${s}px`
      while (el.scrollWidth > el.clientWidth + 0.5 && s > min) { s -= 1; el.style.fontSize = `${s}px` }
      report.current?.({ shrunk: s < max, clipped: el.scrollWidth > el.clientWidth + 0.5, size: s })
    }
    fit()
    void document.fonts?.ready.then(fit)
    return () => { live = false }
  }, [text, max, min])
  return <div ref={ref} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, ...style, fontSize: max }}>{text}</div>
}
