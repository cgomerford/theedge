'use client'

// src/lib/use-visible-interval.ts
//
// setInterval for live refreshes that only runs while it is wanted AND the tab is on screen. A hidden tab stops polling (every poll is a
// function call on Vercel); coming back runs the callback once straight away, then the timer resumes. `enabled` false means no timer at all.

import { useEffect, useRef } from 'react'

export function useVisibleInterval(fn: () => void, ms: number, enabled: boolean) {
  const latest = useRef(fn)
  useEffect(() => { latest.current = fn })
  useEffect(() => {
    if (!enabled) return
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => { if (id == null) id = setInterval(() => latest.current(), ms) }
    const stop = () => { if (id != null) { clearInterval(id); id = null } }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop()
      else { latest.current(); start() }
    }
    if (document.visibilityState !== 'hidden') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [ms, enabled])
}
