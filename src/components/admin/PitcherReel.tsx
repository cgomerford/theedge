'use client'

// src/components/admin/PitcherReel.tsx
//
// Dashboard section: pick a finished game's pitcher for the slate date, tick the
// slides, play / export the 9:16 reel. Same player, timeline, fonts and MP4 exporter
// as the Game Preview Teaser; only the slides and data differ (story/pitcher/).

import { useEffect, useMemo, useState } from 'react'
import StoryPlayer from './story/StoryPlayer'
import { MAX_PART_S, total as totalOf } from './story/split'
import { availableSlides, buildReelSegments } from './story/pitcher/build'
import { listReelPitchers, loadPitcherReel, type ReelPitcherOption } from './story/pitcher/load'
import { reelRenderer } from './story/pitcher/render'
import { REEL_SEGMENT_LIST, type PitcherReelData, type ReelSegmentId } from './story/pitcher/types'

const DEFAULT_ON: ReelSegmentId[] = ['pr-arsenal', 'pr-counts', 'pr-arm', 'pr-hits', 'pr-tto', 'pr-season', 'pr-next']

const shiftDay = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export default function PitcherReel({ slateDate }: { slateDate: string }) {
  // The reel has its own date so a past game can be picked without moving the whole dashboard.
  // It follows the dashboard's slate date whenever that changes.
  const [date, setDate] = useState(slateDate)
  const [seenSlate, setSeenSlate] = useState(slateDate)
  if (seenSlate !== slateDate) { setSeenSlate(slateDate); setDate(slateDate) }
  const [options, setOptions] = useState<ReelPitcherOption[] | null>(null)
  const [showRelievers, setShowRelievers] = useState(false)
  const [pick, setPick] = useState<ReelPitcherOption | null>(null)
  const [data, setData] = useState<PitcherReelData | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [on, setOn] = useState<ReelSegmentId[]>(DEFAULT_ON)

  useEffect(() => {
    let live = true
    setOptions(null); setPick(null); setData(null)
    listReelPitchers(date)
      .then(o => { if (live) setOptions(o) })
      .catch(err => { console.error('[PitcherReel] listReelPitchers failed:', err); if (live) setOptions([]) })
    return () => { live = false }
  }, [date])

  useEffect(() => {
    if (!pick) return
    let live = true
    setLoading(true); setFailed(false); setData(null)
    loadPitcherReel(pick.gamePk, pick.pitcherId)
      .then(r => { if (live) { setData(r); setFailed(!r) } })
      .catch(err => { console.error('[PitcherReel] loadPitcherReel failed:', err); if (live) setFailed(true) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [pick])

  const segments = useMemo(() => (data ? buildReelSegments(data, on) : []), [data, on])
  const render = useMemo(() => (data ? reelRenderer(data) : null), [data])
  const available = useMemo(() => (data ? availableSlides(data) : []), [data])

  const shown = (options ?? []).filter(o => showRelievers || o.role === 'SP')
  const totalS = totalOf(segments)
  const toggle = (id: ReelSegmentId) => setOn(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))

  const dateBar = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[11px] uppercase tracking-widest text-stone-500">Game date</span>
      <button onClick={() => setDate(shiftDay(date, -1))} className="rounded border border-stone-300 px-2 py-1 font-mono text-xs" aria-label="Previous day">←</button>
      <input type="date" value={date} onChange={e => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && setDate(e.target.value)} className="rounded border border-stone-300 px-2 py-1 font-mono text-xs" aria-label="Pitcher reel game date" />
      <button onClick={() => setDate(shiftDay(date, 1))} className="rounded border border-stone-300 px-2 py-1 font-mono text-xs" aria-label="Next day">→</button>
      <button onClick={() => setDate(shiftDay(slateDate, -1))} className="rounded-sm border border-stone-300 px-3 py-1 font-mono text-[11px] text-stone-700 hover:bg-stone-100">Yesterday</button>
      {date !== slateDate && <button onClick={() => setDate(slateDate)} className="rounded-sm border border-stone-300 px-3 py-1 font-mono text-[11px] text-stone-500 hover:bg-stone-100">Back to slate</button>}
    </div>
  )

  if (options === null) return <div className="flex flex-col gap-4">{dateBar}<div className="p-10 text-center text-stone-500 font-mono text-xs">Loading finished games…</div></div>
  if (options.length === 0) return <div className="flex flex-col gap-4">{dateBar}<div className="p-10 text-center text-stone-500 font-mono text-xs">No finished games on {date}. Pick another date.</div></div>

  return (
    <div className="flex flex-col gap-4">
      {dateBar}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2 overflow-x-auto pb-2 flex-1">
          {shown.map(o => (
            <button key={`${o.gamePk}-${o.pitcherId}`} onClick={() => setPick(o)}
              className={`px-3 py-1.5 rounded-sm text-xs font-mono whitespace-nowrap transition-colors ${pick?.pitcherId === o.pitcherId && pick?.gamePk === o.gamePk ? 'bg-[#FF5722] text-white font-bold' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'}`}>
              {o.name} · {o.teamAbbr} vs {o.oppAbbr} · {o.ip} IP
            </button>
          ))}
        </div>
        <label className="font-mono text-[11px] text-stone-500"><input type="checkbox" checked={showRelievers} onChange={e => setShowRelievers(e.target.checked)} /> include relievers (3+ outs)</label>
      </div>

      {!pick && <div className="p-6 text-center text-stone-500 font-mono text-xs">Pick a pitcher to build the reel.</div>}
      {pick && loading && <div className="p-6 text-center text-stone-500 font-mono text-xs">Loading {pick.name}…</div>}
      {pick && failed && !loading && <div className="p-6 text-center text-red-600 font-mono text-xs">Could not load this game&apos;s feed. Check the server log for [loadPitcherReel].</div>}

      {data && render && (
        <>
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[11px] uppercase tracking-widest text-stone-500">Slides</p>
              <p className={`font-mono text-[11px] ${totalS > MAX_PART_S ? 'text-red-600 font-bold' : 'text-stone-500'}`}>{totalS.toFixed(1)}s total</p>
            </div>
            <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {REEL_SEGMENT_LIST.map(m => {
                const ready = available.includes(m.id)
                const pinned = !!m.pinned
                const seg = segments.find(s => s.id === m.id)
                return (
                  <label key={m.id} className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 ${ready ? 'border-stone-200' : 'border-stone-100 opacity-50'}`}>
                    <input type="checkbox" className="mt-1" checked={pinned ? true : on.includes(m.id) && ready} disabled={!ready || pinned} onChange={() => toggle(m.id)} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold text-stone-900">{m.label}{seg ? <span className="font-mono text-[10px] font-normal text-stone-500"> · {seg.duration.toFixed(1)}s</span> : null}</span>
                      <span className="block text-[11px] text-stone-500 leading-snug">{ready ? m.blurb : 'no data for this start'}</span>
                    </span>
                  </label>
                )
              })}
            </div>
            {data.notes.length > 0 && <p className="mt-2 font-mono text-[10px] text-stone-400">{data.notes.join(' · ')}</p>}
          </div>
          <StoryPlayer key={`${data.gamePk}-${data.pitcher.id}`} render={render} playerIds={[data.pitcher.id]} fileStem={`the-edge-pitcher-${data.pitcher.id}-${data.slateDate}`} segments={segments} allSegments={segments} />
        </>
      )}
    </div>
  )
}
