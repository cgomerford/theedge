'use client'

// src/components/admin/GamePreviewTeaser.tsx
//
// Thin wrapper around the 9:16 story in ./story/. Game pills pick the game;
// buildStory() normalizes it (pure) and StoryPlayer plays/exports it.
//
// Slide picker: { order, on } persisted in localStorage ('edge.story.v3.selection').
// Hook and close are pinned first/last; everything else can be switched on/off and
// moved up/down. Toggling or reordering never restarts playback (see rebaseT).
// Desk data (scout cards, bullpen grid) loads by server action when a game is selected.

import { useEffect, useMemo, useState } from 'react'
import { buildStory } from './story/buildStory'
import { loadBullpenGrid } from './story/bullpenGrid'
import type { PenTeam } from './story/bullpenModel'
import { loadScoutExtras } from './story/scoutExtras'
import { MAX_PART_S, splitStory, total as totalOf } from './story/split'
import StoryPlayer from './story/StoryPlayer'
import { DEFAULT_ON, SEGMENT_LIST, type ScoutExtras, type SegmentId, type StoryExtras, type StoryInputGame } from './story/types'

type Props = {
  games: StoryInputGame[]
  slateDate: string
  storyExtras: Record<number, StoryExtras>
  /** dev only: render one segment still at full size (?storyStill=<id>) */
  storyStill?: string | null
  /** dev only: run the layout check for every available slide (?storyCheck=1) */
  storyCheck?: boolean
  /** dev only: draw the safe-zone bands on a still (?storySafe=1) */
  storySafe?: boolean
}

const NO_EXTRAS: StoryExtras = { slug: null, venueName: '', firstPitch: '', lineupsConfirmed: false }
const LS_KEY = 'edge.story.v3.selection'
const CANON = SEGMENT_LIST.map(s => s.id)
const PINNED = new Set<SegmentId>(['hook', 'close'])

type Selection = { order: SegmentId[]; on: SegmentId[] }
const DEFAULT_SEL: Selection = { order: CANON, on: DEFAULT_ON }

/** Validate stored data: drop unknown ids, append new ids (off), keep hook/close pinned and on. */
export function normalizeSelection(raw: unknown): Selection {
  const o = (raw ?? {}) as { order?: unknown; on?: unknown }
  const isId = (x: unknown): x is SegmentId => typeof x === 'string' && (CANON as string[]).includes(x)
  const stored = Array.isArray(o.order) ? o.order.filter(isId) : []
  const middle = stored.filter(id => !PINNED.has(id))
  for (const id of CANON) if (!PINNED.has(id) && !middle.includes(id)) middle.push(id)   // new ids appended, off
  const on = Array.isArray(o.on) ? o.on.filter(isId) : DEFAULT_ON
  return { order: ['hook', ...middle, 'close'], on: [...new Set<SegmentId>([...on, 'hook', 'close'])] }
}

const PRESETS: { label: string; ids: SegmentId[] | 'all' }[] = [
  { label: 'Quick (≤30s)', ids: ['hook', 'sp', 'bullpen-avail', 'streaks', 'close'] },
  { label: 'Pitching', ids: ['hook', 'sp', 'sp-arsenal', 'sp-tto', 'bullpen-avail', 'close'] },
  { label: 'Defense & run game', ids: ['hook', 'run-game', 'abs', 'defense-away', 'defense-home', 'close'] },
  { label: 'Full scout', ids: 'all' },
]

export default function GamePreviewTeaser({ games, slateDate, storyExtras, storyStill, storyCheck, storySafe }: Props) {
  const [active, setActive] = useState(0)
  const [sel, setSel] = useState<Selection>(DEFAULT_SEL)
  const [hydrated, setHydrated] = useState(false)
  const [scout, setScout] = useState<{ pk: number; data: ScoutExtras | null; done: boolean } | null>(null)
  const [pens, setPens] = useState<{ pk: number; data: { away: PenTeam | null; home: PenTeam | null } | null; done: boolean } | null>(null)
  const current = games[active]
  const extras = current ? storyExtras?.[current.game_pk] ?? NO_EXTRAS : NO_EXTRAS

  // Restore the saved selection once on mount (deferred a tick so it is not a synchronous setState in an effect).
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const raw = window.localStorage.getItem(LS_KEY)
        if (raw) setSel(normalizeSelection(JSON.parse(raw)))
      } catch { /* private window / blocked storage: keep defaults */ }
      setHydrated(true)
    })
  }, [])
  useEffect(() => {
    if (!hydrated) return
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(sel)) } catch { /* storage unavailable */ }
  }, [sel, hydrated])

  // Desk data for the selected game, both server actions in parallel.
  useEffect(() => {
    if (!current || !extras.ids) return
    let live = true
    const ids = extras.ids
    const parts = current.matchup.split(/@|vs/i).map(s => s.trim())
    loadScoutExtras({
      gamePk: ids.gamePk, gameDate: slateDate,
      awayTeamId: ids.awayTeamId, homeTeamId: ids.homeTeamId,
      awayAbbr: current.awayAbbr || parts[0] || 'AWAY', homeAbbr: current.homeAbbr || parts[1] || 'HOME',
      awayPitcherId: ids.awayPitcherId, homePitcherId: ids.homePitcherId,
    })
      .then(data => { if (live) setScout({ pk: current.game_pk, data, done: true }) })
      .catch(err => { console.error('[GamePreviewTeaser] loadScoutExtras failed:', err); if (live) setScout({ pk: current.game_pk, data: null, done: true }) })
    loadBullpenGrid({ slateDate, awayTeamId: ids.awayTeamId, homeTeamId: ids.homeTeamId, awayPitcherId: ids.awayPitcherId, homePitcherId: ids.homePitcherId })
      .then(data => { if (live) setPens({ pk: current.game_pk, data, done: true }) })
      .catch(err => { console.error('[GamePreviewTeaser] loadBullpenGrid failed:', err); if (live) setPens({ pk: current.game_pk, data: null, done: true }) })
    return () => { live = false }
  }, [current, extras.ids, slateDate])

  const scoutForGame = scout && current && scout.pk === current.game_pk ? scout : null
  const pensForGame = pens && current && pens.pk === current.game_pk ? pens : null
  const still = process.env.NODE_ENV !== 'production' && storyStill ? (storyStill as SegmentId) : null
  const isCheck = process.env.NODE_ENV !== 'production' && !!storyCheck
  // A still / layout check of any slide needs that slide switched on.
  const effOn = useMemo(() => (still || isCheck ? CANON : sel.on), [still, isCheck, sel.on])

  const built = useMemo(
    () => (current ? buildStory(current, extras, slateDate, { order: sel.order, on: effOn, scout: scoutForGame?.data ?? null, bullpenGrid: pensForGame?.data ?? null }) : null),
    [current, extras, slateDate, sel.order, effOn, scoutForGame, pensForGame],
  )
  const presetTotals = useMemo(() => PRESETS.map(p => {
    if (!current) return 0
    const b = buildStory(current, extras, slateDate, { order: sel.order, on: p.ids === 'all' ? CANON : p.ids, scout: scoutForGame?.data ?? null, bullpenGrid: pensForGame?.data ?? null })
    return totalOf(b.segments)
  }), [current, extras, slateDate, sel.order, scoutForGame, pensForGame])

  if (!games || games.length === 0 || !built) {
    return <div className="p-10 text-center text-stone-500 font-mono text-xs">No games available</div>
  }

  const total = totalOf(built.segments)
  const loading = !!extras.ids && (!scoutForGame?.done || !pensForGame?.done)
  const toggle = (id: SegmentId) => setSel(s => ({ ...s, on: s.on.includes(id) ? s.on.filter(x => x !== id) : [...s.on, id] }))
  const move = (id: SegmentId, dir: -1 | 1) => setSel(s => {
    const mid = s.order.filter(x => !PINNED.has(x))
    const i = mid.indexOf(id), j = i + dir
    if (i < 0 || j < 0 || j >= mid.length) return s
    ;[mid[i], mid[j]] = [mid[j], mid[i]]
    return { ...s, order: ['hook', ...mid, 'close'] }
  })
  const applyPreset = (ids: SegmentId[] | 'all') => setSel(s => ({ ...s, on: ids === 'all' ? [...CANON] : [...new Set<SegmentId>([...ids, 'hook', 'close'])] }))
  const resetOrder = () => setSel(s => ({ ...s, order: CANON }))
  const label = (id: SegmentId) => SEGMENT_LIST.find(x => x.id === id)
  const splitInfo = total > MAX_PART_S ? splitStory(built.segments) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {games.map((g, i) => (
          <button
            key={g.game_pk}
            onClick={() => setActive(i)}
            className={`px-3 py-1.5 rounded-sm text-xs font-mono whitespace-nowrap transition-colors ${
              i === active ? 'bg-[#FF5722] text-white font-bold' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            }`}
          >
            {g.matchup}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[11px] uppercase tracking-widest text-stone-500">Slides · tick, reorder, or pick a preset</p>
          <p className={`font-mono text-[11px] ${total > MAX_PART_S ? 'text-red-600 font-bold' : total > 30 ? 'text-[#FF5722] font-bold' : 'text-stone-500'}`}>
            {total.toFixed(1)}s total{total > MAX_PART_S ? ` · over ${MAX_PART_S}s` : ''}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((p, i) => (
            <button key={p.label} onClick={() => applyPreset(p.ids)} className="rounded-sm border border-stone-300 px-3 py-1 font-mono text-[11px] text-stone-700 hover:bg-stone-100">
              {p.label} · {presetTotals[i].toFixed(1)}s
            </button>
          ))}
          <button onClick={resetOrder} className="rounded-sm border border-stone-300 px-3 py-1 font-mono text-[11px] text-stone-500 hover:bg-stone-100">Reset order</button>
        </div>
        <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {sel.order.map(id => {
            const meta = label(id)
            if (!meta) return null
            const pinned = PINNED.has(id)
            const ready = built.available.includes(id)
            const seg = built.segments.find(s => s.id === id)
            const on = pinned || (sel.on.includes(id) && ready)
            const mid = sel.order.filter(x => !PINNED.has(x))
            return (
              <div key={id} className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 ${ready ? 'border-stone-200' : 'border-stone-100 opacity-50'}`}>
                <input type="checkbox" className="mt-1" checked={on} disabled={!ready || pinned} onChange={() => toggle(id)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-stone-900">{meta.label}{seg ? <span className="font-mono text-[10px] font-normal text-stone-500"> · {seg.duration.toFixed(1)}s</span> : null}{pinned ? <span className="font-mono text-[10px] font-normal text-stone-400"> · pinned</span> : null}</span>
                  <span className="block text-[11px] text-stone-500 leading-snug">{ready ? meta.blurb : loading ? 'loading data…' : 'no data for this game'}</span>
                </span>
                {!pinned && (
                  <span className="flex flex-col">
                    <button className="px-1 text-[11px] leading-none text-stone-500 disabled:opacity-30" disabled={mid.indexOf(id) === 0} onClick={() => move(id, -1)} aria-label="Move up">▲</button>
                    <button className="px-1 text-[11px] leading-none text-stone-500 disabled:opacity-30" disabled={mid.indexOf(id) === mid.length - 1} onClick={() => move(id, 1)} aria-label="Move down">▼</button>
                  </span>
                )}
              </div>
            )
          })}
        </div>
        {total > MAX_PART_S && !splitInfo && <p className="mt-2 font-mono text-[11px] font-bold text-red-600">Too long for 2 parts — remove slides</p>}
      </div>

      <StoryPlayer key={current.game_pk} game={built.game} segments={built.segments} allSegments={built.segments} still={still} stillSafe={!!storySafe && process.env.NODE_ENV !== 'production'} autoCheck={isCheck && !loading && !!scoutForGame?.data} />
    </div>
  )
}
