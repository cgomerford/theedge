'use client'

import type { StorySlide } from '@/lib/story-slides'

// Was a row of circles (one per slide, plus locked/coming-soon ones).
// Replaced with a single button per feedback (2026-07-13) — a row of
// circles needing a legend is more UI than the content justifies right
// now, and it silently showed nothing when storySlides was empty (no
// story_lead this session, since narratives are paused) rather than
// making that gap obvious. Locked/coming-soon slides dropped from the
// rail entirely for now; they can come back once there's real content
// behind more than one of them.

export default function StoryRail({
  slides, onOpen,
}: {
  slides: StorySlide[]
  onOpen: (index: number) => void
}) {
  if (slides.length === 0) return null

  return (
    <div className="max-w-6xl mx-auto px-4 py-3" style={{ borderTop: '1px solid rgba(250,248,243,0.06)' }}>
      <button
        onClick={() => onOpen(0)}
        className="flex items-center gap-2 rounded-full px-4 py-2"
        style={{ background: 'rgba(255,87,34,0.12)', border: '1px solid rgba(255,87,34,0.4)', cursor: 'pointer' }}
      >
        <span style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '8px solid #FF5722' }} />
        <span className="font-mono uppercase" style={{ fontSize: 11, letterSpacing: '0.06em', color: '#FF5722', fontWeight: 700 }}>
          Tonight's story{slides.length > 1 ? ` · ${slides.length}` : ''}
        </span>
      </button>
    </div>
  )
}