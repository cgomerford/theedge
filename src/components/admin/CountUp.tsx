'use client'

// src/components/admin/CountUp.tsx
//
// Animates a number counting up from 0 (or from a lower value) to its
// target over a fixed duration, using requestAnimationFrame. Used for the
// "numbers animate as they populate" effect in GamePreviewTeaser.
//
// CAPTURE NOTE: story-video.ts's captureStoryToMp4 takes ONE screenshot per
// slide after a fixed settleMs delay. That means whatever this component is
// displaying AT that exact millisecond is what ends up baked into the
// exported video frame — there is no continuous recording. If durationMs
// here is longer than the settleMs the caller waits before screenshotting,
// the exported video will show a mid-count, not-yet-finished number, which
// looks like a rendering bug rather than an intentional animation.
//
// GamePreviewTeaser sets settleMs to comfortably exceed this component's
// default duration (900ms) specifically so the export always lands on the
// finished value. The live on-screen preview (someone watching in the
// dashboard before exporting) still sees the real count-up motion — this
// constraint only affects what the final MP4 freeze-frames on.

import { useEffect, useRef, useState } from 'react'

type Props = {
  value: number
  decimals?: number
  durationMs?: number
  prefix?: string
  suffix?: string
  className?: string
  style?: React.CSSProperties
}

export default function CountUp({
  value, decimals = 0, durationMs = 900, prefix = '', suffix = '', className, style,
}: Props) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const start = performance.now()
    const from = 0
    function tick(now: number) {
      const elapsed = now - start
      const t = Math.min(1, elapsed / durationMs)
      // ease-out cubic — fast start, settles gently into the final value
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (value - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, durationMs])

  return (
    <span className={className} style={style}>
      {prefix}{display.toFixed(decimals)}{suffix}
    </span>
  )
}