'use client'

// src/components/pitch-shape/LevelBar.tsx
//
// The level selector for the Pitch Shape Lab (MLB, Triple-A, Florida State League) and the coverage badge that says what the current view contains. One shared level
// (shapeLevel.ts) drives the map, filters, pitcher panel and sandbox, so this is the only place it is changed. The selector is a radio group: arrow keys move and select,
// Home and End jump, and only the chosen option is in the tab order.

import { useEffect, useRef, useState } from 'react'
import { C } from '@/components/team/ui'
import type { Capabilities } from '@/lib/milb-shape/capability'
import { LEVELS, LEVEL_LABEL, type Level } from '@/lib/milb-shape/levels'
import { levelAfterKey } from '@/lib/milb-shape/url'
import { log } from '@/lib/log'
import { setShapeLevel, useShapeView } from './shapeLevel'

const ORANGE_TEXT = '#B83A0E'
const capsCache = new Map<string, Capabilities>()

/** What a level and season can show. undefined while loading; null if the request failed. MLB answers without a request. */
export function useLevelCaps(level: Level, season: number | null): Capabilities | null | undefined {
  const key = `${level}|${season ?? ''}`
  const [got, setGot] = useState<{ key: string; v: Capabilities | null } | null>(() => { const c = capsCache.get(key); return c ? { key, v: c } : null })
  useEffect(() => {
    if (capsCache.has(key)) return
    let live = true
    fetch(`/api/mlb/pitch-shape/capabilities?level=${level}${season != null ? `&season=${season}` : ''}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { capabilities: Capabilities }) => { capsCache.set(key, j.capabilities); if (live) setGot({ key, v: j.capabilities }) })
      .catch(e => { log.error('LevelBar', 'capabilities fetch failed', e instanceof Error ? e.message : e); if (live) setGot({ key, v: null }) })
    return () => { live = false }
  }, [key, level, season])
  const hit = capsCache.get(key)
  if (hit) return hit
  return got?.key === key ? got.v : undefined
}

const md = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '')

export function CoverageBadge({ level, caps, compact = false }: { level: Level; caps: Capabilities | null | undefined; compact?: boolean }) {
  const label = LEVEL_LABEL[level]
  let text: string
  let tone: 'ok' | 'warn' | 'none' = 'ok'
  if (level === 'mlb') text = `${label} · regular season pitches, 2024 on`
  else if (caps === undefined) text = `${label} · checking coverage…`
  else if (caps === null) { text = `${label} · coverage unavailable`; tone = 'none' }
  else if (caps.coverage === 'none') { text = `${label} · nothing loaded for ${caps.season} yet`; tone = 'none' }
  else {
    const span = caps.firstDate && caps.lastDate ? `${md(caps.firstDate)} to ${md(caps.lastDate)}` : ''
    text = `${label} · ${caps.season} · ${caps.coverage === 'full' ? 'full coverage' : 'partial coverage'}${span ? ` · ${span}` : ''}${compact ? '' : ` · ${caps.usable.toLocaleString()} tracked pitches`}`
    tone = caps.coverage === 'full' ? 'ok' : 'warn'
  }
  const bg = tone === 'ok' ? '#fff' : tone === 'warn' ? '#FFF6DD' : C.soft
  return (
    <span role="status" aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: C.ink, background: bg, border: `1px solid ${tone === 'warn' ? '#e8d28a' : C.line}`, borderRadius: 999, padding: '5px 12px' }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: tone === 'ok' ? '#1D9E75' : tone === 'warn' ? '#D9A21B' : C.faint }} />
      {text}
    </span>
  )
}

export default function LevelBar() {
  const view = useShapeView()
  const caps = useLevelCaps(view.level, view.season)
  const refs = useRef<Partial<Record<Level, HTMLButtonElement | null>>>({})
  const onKey = (e: React.KeyboardEvent) => {
    const next = levelAfterKey(LEVELS, view.level, e.key)
    if (!next) return
    e.preventDefault()
    setShapeLevel(next)
    refs.current[next]?.focus()
  }
  const minor = view.level !== 'mlb'
  return (
    <div className="pf2-levelbar" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center', margin: '0 0 12px' }}>
      <span id="pf2-level-label" className="pv-k" style={{ color: ORANGE_TEXT }}>Level</span>
      <div role="radiogroup" aria-labelledby="pf2-level-label" onKeyDown={onKey} style={{ display: 'inline-flex', flexWrap: 'wrap' }}>
        {LEVELS.map((l, i) => {
          const on = view.level === l
          return (
            <button key={l} ref={el => { refs.current[l] = el }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => setShapeLevel(l)}
              style={{ minHeight: 44, padding: '0 16px', border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? C.cream : C.ink, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', marginLeft: i ? -1 : 0, borderRadius: i === 0 ? '4px 0 0 4px' : i === LEVELS.length - 1 ? '0 4px 4px 0' : 0 }}>
              {LEVEL_LABEL[l]}
            </button>
          )
        })}
      </div>
      <CoverageBadge level={view.level} caps={caps} />
      {minor && <span style={{ fontSize: 12.5, color: '#5b5347', flexBasis: '100%', lineHeight: 1.5 }}>
        Results here are measured at {LEVEL_LABEL[view.level]} only. Runs per 100, wOBA, xwOBA, ahead-or-behind-his-shape verdicts and the shape rank are worked out from {LEVEL_LABEL[view.level]} pitches, so they are not on the MLB scale. ESPN ownership, the MLB season line and the roster filters stay on MLB.
      </span>}
    </div>
  )
}
