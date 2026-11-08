'use client'

// src/components/pitch-shape/InfoTip.tsx
//
// The small "i" beside a stat label. Hover, keyboard focus or a tap opens a card with what the stat is, how to read it and one caution (text from src/lib/pitch-shape/stat-info.ts).
// Escape or tapping elsewhere closes it. The card is positioned in the viewport so it never runs off the screen or gets clipped by a scrolling table.

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { C } from '@/components/team/ui'
import { STAT_INFO, type StatInfo, type StatKey } from '@/lib/pitch-shape/stat-info'

/** The hover for a stat from the shared definitions. */
export default function InfoTip({ k }: { k: StatKey }) { return <Tip info={STAT_INFO[k] as StatInfo} /> }

/** The hover for any definition (other labs pass their own text). */
export function Tip({ info }: { info: StatInfo }) {
  const id = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null)
  const [pinned, setPinned] = useState(false)

  const show = () => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const w = Math.min(320, window.innerWidth - 24)
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2))
    const above = r.bottom > window.innerHeight * 0.6
    setPos({ left, top: above ? r.top - 8 : r.bottom + 8, above })
  }
  const hide = () => { setPos(null); setPinned(false) }

  useEffect(() => {
    if (!pos) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') hide() }
    const away = (e: Event) => { if (pinned && !btn.current?.contains(e.target as Node)) hide() }
    const move = () => hide()
    document.addEventListener('keydown', esc); document.addEventListener('pointerdown', away); window.addEventListener('scroll', move, true)
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('pointerdown', away); window.removeEventListener('scroll', move, true) }
  }, [pos, pinned])

  return (
    <>
      <button ref={btn} type="button" aria-label={`What is ${info.title}?`} aria-describedby={pos ? id : undefined} aria-expanded={!!pos}
        onMouseEnter={show} onMouseLeave={() => { if (!pinned) setPos(null) }} onFocus={show} onBlur={() => { if (!pinned) setPos(null) }}
        onClick={e => { e.preventDefault(); e.stopPropagation(); if (pos && pinned) hide(); else { show(); setPinned(true) } }}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, minWidth: 16, marginLeft: 5, padding: 0, borderRadius: 8, border: `1px solid ${C.faint}`, background: '#fff', color: '#5b5347', fontSize: 10, fontWeight: 800, fontFamily: 'inherit', fontStyle: 'normal', lineHeight: 1, cursor: 'help', verticalAlign: 'middle', textTransform: 'none', letterSpacing: 0 }}>i</button>
      {pos && typeof document !== 'undefined' && createPortal(
        <div id={id} role="tooltip" style={{ position: 'fixed', left: pos.left, top: pos.top, transform: pos.above ? 'translateY(-100%)' : undefined, width: Math.min(320, window.innerWidth - 24), zIndex: 1000, background: '#fff', border: `1px solid ${C.ink}`, borderRadius: 6, padding: '10px 12px', boxShadow: '0 6px 20px rgba(0,0,0,.18)', fontSize: 12.5, lineHeight: 1.5, color: '#3a352c', textTransform: 'none', letterSpacing: 0, fontWeight: 500, textAlign: 'left', pointerEvents: 'none' }}>
          <b style={{ display: 'block', color: C.ink, fontSize: 13, marginBottom: 3 }}>{info.title}</b>
          <span style={{ display: 'block' }}>{info.what}</span>
          {info.read && <span style={{ display: 'block', marginTop: 4 }}><b>Reading it:</b> {info.read}</span>}
          {info.caution && <span style={{ display: 'block', marginTop: 4, color: '#5b5347' }}><b>Keep in mind:</b> {info.caution}</span>}
        </div>, document.body)}
    </>
  )
}

/** A label with its info hover: `<L k="woba">wOBA against</L>`. */
export function L({ k, children }: { k: StatKey; children: React.ReactNode }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>{children}<InfoTip k={k} /></span>
}

/** Label text that is a known stat gets its info hover; any other text is shown as it is. */
const LABEL_KEYS: Record<string, StatKey> = {
  'Velocity': 'velo', 'Ride': 'ride', 'Run': 'run', 'Arm angle': 'armSlot', 'Arm': 'armSlot',
  'Ride variation (SD)': 'variation', 'Run variation (SD)': 'variation',
  'Whiffs / swing': 'whiff', 'Whiffs per swing': 'whiff', 'Zone': 'zone', 'Chase': 'chase',
  'Runs saved / 100': 'runsSaved', 'Runs saved': 'runsSaved', 'Shape runs saved / 100': 'runsSaved', 'His runs saved / 100': 'runsSaved',
  'Runs allowed per 100': 'runs100', 'wOBA': 'woba', 'wOBA against': 'woba', 'xwOBA': 'xwoba', 'xwOBA against': 'xwoba',
  'Batting average': 'avg', 'Average against': 'avg', 'Slugging': 'slg', 'Slugging against': 'slg',
  'wOBA: shape · his': 'woba', 'xwOBA: shape · his': 'xwoba', 'Whiff': 'whiff', 'Use': 'share', 'Shape Score': 'shapeScore', 'Pitches': 'pitches', 'Share': 'share', 'Gap': 'gap', 'Level': 'level',
  'ERA': 'era', 'xERA': 'xera', 'FIP': 'fip', 'WHIP': 'whip', 'K%': 'kPct', 'BB%': 'bbPct',
}
export function Lab({ t }: { t: string }) {
  const k = LABEL_KEYS[t]
  return k ? <L k={k}>{t}</L> : <>{t}</>
}
