'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { StorySlide } from '@/lib/story-slides'
import { STORY_ICONS } from '@/components/StoryIcons'

const SLIDE_MS = 6000

export default function StoryOverlay({
  slides, index, onIndexChange, onClose,
}: {
  slides: StorySlide[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
}) {
  const [progress, setProgress] = useState(0)
  const startRef = useRef<number>(Date.now())

  useEffect(() => {
    startRef.current = Date.now()
    setProgress(0)
    const tick = setInterval(() => {
      const elapsed = Date.now() - startRef.current
      const pct = Math.min(100, (elapsed / SLIDE_MS) * 100)
      setProgress(pct)
      if (pct >= 100) {
        if (index < slides.length - 1) onIndexChange(index + 1)
        else onClose()
      }
    }, 50)
    return () => clearInterval(tick)
  }, [index, slides.length, onIndexChange, onClose])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') index < slides.length - 1 ? onIndexChange(index + 1) : onClose()
      if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, slides.length, onIndexChange, onClose])

  const slide = slides[index]
  if (!slide) return null

  function handleTap(e: MouseEvent<HTMLDivElement>) {
    const { left, width } = e.currentTarget.getBoundingClientRect()
    const tapX = e.clientX - left
    if (tapX < width / 2) {
      if (index > 0) onIndexChange(index - 1)
    } else {
      if (index < slides.length - 1) onIndexChange(index + 1)
      else onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <button
        onClick={() => index > 0 && onIndexChange(index - 1)}
        disabled={index === 0}
        className="hidden md:flex items-center justify-center shrink-0"
        style={{ width: 40, height: 40, color: 'rgba(250,248,243,0.6)', background: 'transparent', border: 'none', cursor: index > 0 ? 'pointer' : 'default', fontSize: 24 }}
      >‹</button>

      <div
        onClick={handleTap}
        className="relative w-full md:w-[380px] md:rounded-2xl overflow-hidden"
        style={{ background: '#1A1A1A', height: '100dvh', maxHeight: 'min(100dvh, 720px)' }}
      >
        <div className="flex gap-1 px-4 pt-3" onClick={e => e.stopPropagation()}>
          {slides.map((s, i) => (
            <div key={s.key} className="flex-1 rounded-full overflow-hidden" style={{ height: 2, background: 'rgba(250,248,243,0.2)' }}>
              <div style={{
                height: '100%', background: '#FF5722',
                width: i < index ? '100%' : i === index ? `${progress}%` : '0%',
                transition: i === index ? 'none' : 'width 0.2s',
              }} />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-4 py-3" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2">
           <span className="flex items-center justify-center rounded-full" style={{ width: 24, height: 24, background: '#FF5722', color: '#1A1A1A' }}>
              {STORY_ICONS[slide.iconKey]}
            </span>
            <span className="font-mono uppercase" style={{ fontSize: 10, letterSpacing: '0.05em', color: '#FAF8F3' }}>{slide.circleLabel}</span>
          </div>
          <button onClick={onClose} style={{ color: 'rgba(250,248,243,0.55)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        <div className="px-5 pb-6" style={{ pointerEvents: 'none' }}>
          <p className="font-mono uppercase" style={{ fontSize: 10, color: '#FF5722', letterSpacing: '0.08em', margin: '0 0 6px' }}>{slide.sectionLabel}</p>
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: 19, color: '#FAF8F3', lineHeight: 1.35, margin: '0 0 16px' }}>{slide.heading}</p>
          {slide.chips?.map((c, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg" style={{ background: c.emphasis ? 'rgba(255,87,34,0.12)' : 'rgba(250,248,243,0.05)', padding: '8px 12px', marginBottom: 8 }}>
              <span className="font-mono" style={{ fontSize: 11, color: '#FAF8F3' }}>{c.label}</span>
              <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, color: c.emphasis ? '#FF5722' : 'rgba(250,248,243,0.55)' }}>{c.value}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => index < slides.length - 1 ? onIndexChange(index + 1) : onClose()}
        className="hidden md:flex items-center justify-center shrink-0"
        style={{ width: 40, height: 40, color: '#FAF8F3', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 24 }}
      >›</button>
    </div>
  )
}