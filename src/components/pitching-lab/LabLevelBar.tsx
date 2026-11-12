'use client'

// src/components/pitching-lab/LabLevelBar.tsx
//
// The level selector for the Pitching Lab: MLB, Triple-A or the Florida State League, only the levels this pitcher threw at this season (from the MLB Stats API game log), with his
// games and pitches at each. It drives the shared level (?level= in the address, the same store the Pitch Shape Lab uses), so the Location Lab, Sequencing and the level comparison all
// read the same level. Arrow keys move and select; only the chosen option is in the tab order. A pitcher with one level shows no selector.

import { useEffect, useRef, useState } from 'react'
import { C, SANS } from '@/components/team/ui'
import { LEVEL_LABEL, type Level } from '@/lib/milb-shape/levels'
import { levelAfterKey } from '@/lib/milb-shape/url'
import { setShapeLevel, useShapeView } from '@/components/pitch-shape/shapeLevel'
import { log } from '@/lib/log'

type Use = { level: Level; games: number; pitches: number }
const cache = new Map<string, Use[] | null>()

/** The levels he played at this season. `role` picks the lookup: a pitcher's games and pitches, or a hitter's games and plate appearances. */
export function useLevelUse(playerId: number, role: 'pitcher' | 'batter' = 'pitcher'): Use[] | null | undefined {
  const key = `${role}:${playerId}`
  const [got, setGot] = useState<{ id: number; v: Use[] | null } | null>(null)
  useEffect(() => {
    if (cache.has(key)) return
    let live = true
    fetch(`/api/mlb/${role === 'batter' ? 'batting' : 'pitching'}-lab-levels?playerId=${playerId}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { levels: Use[] }) => { cache.set(key, j.levels); if (live) setGot({ id: playerId, v: j.levels }) })
      .catch(e => { log.error('LabLevelBar', 'levels fetch failed', e instanceof Error ? e.message : e); cache.set(key, null); if (live) setGot({ id: playerId, v: null }) })
    return () => { live = false }
  }, [playerId, role, key])
  if (cache.has(key)) return cache.get(key)
  return got?.id === playerId ? got.v : undefined
}

export default function LabLevelBar({ playerId, role = 'pitcher' }: { playerId: number; role?: 'pitcher' | 'batter' }) {
  const use = useLevelUse(playerId, role)
  const view = useShapeView()
  const refs = useRef<Partial<Record<Level, HTMLButtonElement | null>>>({})
  // A pitcher who never threw at MLB has no MLB log to show: with a single level there is no selector, so pick that level for the Location Lab, Sequencing and Levels, which read the shared level.
  const only = use && use.length > 0 && !use.some(u => u.level === view.level) ? use[0].level : null
  useEffect(() => { if (only) setShapeLevel(only) }, [only])
  if (!use || use.length < 2) return null   // one level (or unknown): nothing to choose between
  const levels = use.map(u => u.level)
  const current = levels.includes(view.level) ? view.level : levels[0]
  const onKey = (e: React.KeyboardEvent) => {
    const next = levelAfterKey(levels, current, e.key)
    if (!next) return
    e.preventDefault(); setShapeLevel(next); refs.current[next]?.focus()
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', alignItems: 'center', margin: '0 0 16px', fontFamily: SANS }}>
      <span id="pl-level-label" style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: '#B83A0E', textTransform: 'uppercase' }}>Level</span>
      <div role="radiogroup" aria-labelledby="pl-level-label" onKeyDown={onKey} style={{ display: 'inline-flex', flexWrap: 'wrap' }}>
        {use.map((u, i) => {
          const on = u.level === current
          return (
            <button key={u.level} ref={el => { refs.current[u.level] = el }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => setShapeLevel(u.level)}
              style={{ minHeight: 44, padding: '0 16px', border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? C.cream : C.ink, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', marginLeft: i ? -1 : 0, borderRadius: i === 0 ? '4px 0 0 4px' : i === use.length - 1 ? '0 4px 4px 0' : 0 }}>
              {LEVEL_LABEL[u.level]} <span style={{ fontWeight: 600, opacity: 0.75, fontSize: 12 }}>{u.games} g · {u.pitches.toLocaleString()} p</span>
            </button>
          )
        })}
      </div>
      <span style={{ fontSize: 12.5, color: '#5b5347' }}>{role === 'batter' ? 'The pitches he has seen at the level you choose' : 'His pitches at the level you choose'}, from Baseball Savant, for the Location Lab, Sequencing{role === 'batter' ? '' : ' and the level comparison'}.</span>
    </div>
  )
}
