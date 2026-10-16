'use client'

// src/components/admin/PostgameReel.tsx
//
// Dashboard section: pick a finished game for a date, tick the slides, play / export the 9:16
// postgame reel. Same player, timeline and MP4 exporter as the Pitcher Reel; slides in story/postgame/.

import { useEffect, useMemo, useState } from 'react'
import StoryPlayer from './story/StoryPlayer'
import { MAX_PART_S, total as totalOf } from './story/split'
import { availablePostgameSlides, buildPostgameSegments } from './story/postgame/build'
import { listReelGames, loadPostgameReel, type ReelGameOption } from './story/postgame/load'
import { postgameRenderer } from './story/postgame/render'
import { POSTGAME_SEGMENT_LIST, type PostgameReelData, type PostgameSegmentId } from './story/postgame/types'
import { chipClass, Chips, Msg, ReelDateBar, SlidePicker } from './story/reel/ReelParts'

const DEFAULT_ON: PostgameSegmentId[] = ['pg-flow', 'pg-plays', 'pg-hitters', 'pg-pitching', 'pg-spray']

export default function PostgameReel({ slateDate }: { slateDate: string }) {
  const [date, setDate] = useState(slateDate)
  const [seenSlate, setSeenSlate] = useState(slateDate)
  if (seenSlate !== slateDate) { setSeenSlate(slateDate); setDate(slateDate) }
  const [games, setGames] = useState<ReelGameOption[] | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  const [data, setData] = useState<PostgameReelData | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [on, setOn] = useState<PostgameSegmentId[]>(DEFAULT_ON)

  useEffect(() => {
    let live = true
    setGames(null); setPick(null); setData(null)
    listReelGames(date)
      .then(g => { if (live) setGames(g) })
      .catch(err => { console.error('[PostgameReel] listReelGames failed:', err); if (live) setGames([]) })
    return () => { live = false }
  }, [date])

  useEffect(() => {
    if (pick == null) return
    let live = true
    setLoading(true); setFailed(false); setData(null)
    loadPostgameReel(pick)
      .then(r => { if (live) { setData(r); setFailed(!r) } })
      .catch(err => { console.error('[PostgameReel] loadPostgameReel failed:', err); if (live) setFailed(true) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [pick])

  const segments = useMemo(() => (data ? buildPostgameSegments(data, on) : []), [data, on])
  const render = useMemo(() => (data ? postgameRenderer(data) : null), [data])
  const available = useMemo(() => (data ? availablePostgameSlides(data) : []), [data])
  const toggle = (id: PostgameSegmentId) => setOn(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))

  const dateBar = <ReelDateBar date={date} setDate={setDate} slateDate={slateDate} label="Postgame reel game date" />
  if (games === null) return <div className="flex flex-col gap-4">{dateBar}<Msg>Loading finished games…</Msg></div>
  if (games.length === 0) return <div className="flex flex-col gap-4">{dateBar}<Msg>No finished games on {date}. Pick another date.</Msg></div>

  return (
    <div className="flex flex-col gap-4">
      {dateBar}
      <Chips>
        {games.map(g => (
          <button key={g.gamePk} onClick={() => setPick(g.gamePk)} className={chipClass(pick === g.gamePk)}>
            {g.awayAbbr} {g.awayScore} @ {g.homeAbbr} {g.homeScore}
          </button>
        ))}
      </Chips>
      {pick == null && <Msg>Pick a game to build the reel.</Msg>}
      {pick != null && loading && <Msg>Loading game…</Msg>}
      {pick != null && failed && !loading && <Msg error>Could not load this game&apos;s feed. Check the server log for [loadPostgameReel].</Msg>}
      {data && render && (
        <>
          <SlidePicker list={POSTGAME_SEGMENT_LIST} available={available} on={on} segments={segments} toggle={toggle} totalS={totalOf(segments)} maxS={MAX_PART_S} notes={data.notes} unavailable="no data for this game" />
          <StoryPlayer key={data.gamePk} render={render} playerIds={data.hitters.map(h => h.id)} fileStem={`the-edge-postgame-${data.gamePk}-${data.slateDate}`} segments={segments} allSegments={segments} />
        </>
      )}
    </div>
  )
}
