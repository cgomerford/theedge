// src/components/nfl/NflInfoButton.tsx
//
// Small "i" icon that shows a plain-English explainer on click.
// Click-to-toggle rather than hover, so it works on mobile too.

'use client'

import { useState, useRef, useEffect } from 'react'

export default function NflInfoButton({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        aria-label={label ? `About ${label}` : 'More info'}
        style={{
          width: 14, height: 14, borderRadius: '50%', border: '1px solid #A3A3A3', background: 'transparent',
          color: '#A3A3A3', fontSize: 9, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
          cursor: 'pointer', padding: 0, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          verticalAlign: 'middle', marginLeft: 4,
        }}
      >
        i
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', zIndex: 40, top: '140%', left: 0, width: 220,
            background: '#1A1A1A', color: '#fff', borderRadius: 6, padding: '10px 12px',
            fontFamily: "'Fraunces', serif", fontSize: 12, lineHeight: 1.5,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          }}
        >
          {label && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: '#FF5722', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>}
          {text}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Explainer content — plain English, no jargon-on-jargon.
// ---------------------------------------------------------------------

export const EPA_EXPLAINER =
  "EPA (Expected Points Added) measures how much a single play changed a team's chance of scoring, given the down, distance, field position, and time left. Every situation has a historical 'expected points' value from thousands of similar plays — a 15-yard gain on 3rd-and-20 barely helps, but the same gain on 3rd-and-12 converts the drive and is worth far more. EPA captures that difference, so it reflects what actually matters (scoring) instead of raw yards. On these pages, EPA allowed per play is how we measure real weakness — not how often a defense plays a coverage, but how much it actually costs them when they do."
 
export const SUSCEPTIBLE_EXPLAINER =
  "This is the coverage shell that's allowed the highest EPA per play when this defense has called it — in plain terms, the coverage that's actually gotten them beaten the most this season, not just the one they play the least."

export const COVERAGE_EXPLAINERS: Record<string, string> = {
  'COVER 0': "No deep safety at all — everyone plays tight man coverage, often paired with a blitz. Highest risk, highest reward: no help over the top if a receiver wins.",
  'COVER 1': "One deep safety in the middle of the field, man coverage everywhere else. The standard man-to-man defense in the NFL.",
  'COVER 2': "Two safeties split the deep field in half. Corners play the shorter, underneath zones and funnel receivers toward the safety help.",
  'COVER 3': "Both corners and one safety split the deep field into thirds. Four defenders underneath cover the shorter zones. The most common zone shell in football.",
  'COVER 4': "Also called Quarters — four defenders split the deep field into quarters. Very conservative against anything deep, more vulnerable underneath.",
  'COVER 6': "A split-field coverage: one side of the field plays Cover 2, the other plays Cover 4 (Quarters). Lets a defense match its coverage to the offense's strength on each side.",
  'COVER 9': "A pattern-matching version of Quarters — looks like Cover 4 before the snap, but the coverage rules can convert defenders into man coverage based on the routes receivers actually run.",
  '2-MAN': "Two deep safeties, like Cover 2, but everyone underneath plays tight man coverage instead of zone.",
  COMBO: "A mixed defense — part of the field plays man, part plays zone, on the same play. Used to disguise coverage or match specific personnel.",
  PREVENT: "Everyone drops extremely deep to take away anything downfield, giving up short completions on purpose. Used to protect a lead or run out the clock, not as a base defense.",
}
