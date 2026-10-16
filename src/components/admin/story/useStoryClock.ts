'use client'

// The only requestAnimationFrame in story/ (besides exportStory's frame waits).
import { useCallback, useEffect, useRef, useState } from 'react'
import { rebaseT, type Timeline } from './timeline'

export function useStoryClock(tl: Timeline) {
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  // Timeline changed (slides toggled / reordered): keep the playhead on the same slide. Derived during render,
  // so there is no flash of the wrong frame and play/pause state is untouched.
  const [prevTl, setPrevTl] = useState(tl)
  if (prevTl !== tl) { setPrevTl(tl); setT(prev => rebaseT(prevTl, tl, prev)) }
  const raf = useRef<number | null>(null)
  const last = useRef(0)
  const tlRef = useRef(tl)
  useEffect(() => { tlRef.current = tl }, [tl])

  useEffect(() => {
    if (!playing) return
    last.current = performance.now()
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000
      last.current = now
      let stop = false
      setT(prev => {
        const next = prev + dt
        if (next >= tlRef.current.total) { stop = true; return tlRef.current.total }
        return next
      })
      if (stop) setPlaying(false)
      else raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current != null) cancelAnimationFrame(raf.current) }
  }, [playing])

  const play = useCallback(() => { setT(p => (p >= tlRef.current.total ? 0 : p)); setPlaying(true) }, [])
  const pause = useCallback(() => setPlaying(false), [])
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, play, pause])
  const seek = useCallback((s: number) => setT(Math.min(Math.max(s, 0), tlRef.current.total)), [])
  const next = useCallback(() => setT(p => {
    const e = tlRef.current.entries.find(x => x.start > p + 1e-6)
    return e ? e.start : tlRef.current.total
  }), [])
  const prev = useCallback(() => setT(p => {
    const es = tlRef.current.entries
    const cur = [...es].reverse().find(x => x.start <= p) ?? es[0]
    // within the first second of a segment, go to the previous one
    return p - cur.start > 1 ? cur.start : (es[Math.max(cur.index - 1, 0)].start)
  }), [])
  return { t, playing, play, pause, toggle, seek, next, prev }
}
