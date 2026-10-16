'use client'

// src/components/admin/BatterReel.tsx
//
// Dashboard section: pick a finished game, then one of its hitters, tick the slides, play / export
// the 9:16 batter reel. Same player, timeline and MP4 exporter as the Pitcher Reel; slides in story/batter/.

import { useEffect, useMemo, useState } from 'react'
import StoryPlayer from './story/StoryPlayer'
import { MAX_PART_S, total as totalOf } from './story/split'
import { availableBatterSlides, buildBatterSegments } from './story/batter/build'
import { listGameBatters, loadBatterReel, type ReelBatterOption } from './story/batter/load'
import { batterRenderer } from './story/batter/render'
import { BATTER_SEGMENT_LIST, type BatterReelData, type BatterSegmentId } from './story/batter/types'
import { listReelGames, type ReelGameOption } from './story/postgame/load'
import { chipClass, Chips, Msg, ReelDateBar, SlidePicker } from './story/reel/ReelParts'

const DEFAULT_ON: BatterSegmentId[] = ['br-pas', 'br-spray', 'br-contact', 'br-zone']

export default function BatterReel({ slateDate }: { slateDate: string }) {
  const [date, setDate] = useState(slateDate)
  const [seenSlate, setSeenSlate] = useState(slateDate)
  if (seenSlate !== slateDate) { setSeenSlate(slateDate); setDate(slateDate) }
  const [games, setGames] = useState<ReelGameOption[] | null>(null)
  const [game, setGame] = useState<number | null>(null)
  const [batters, setBatters] = useState<ReelBatterOption[] | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  const [data, setData] = useState<BatterReelData | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [on, setOn] = useState<BatterSegmentId[]>(DEFAULT_ON)

  useEffect(() => {
    let live = true
    setGames(null); setGame(null); setBatters(null); setPick(null); setData(null)
    listReelGames(date)
      .then(g => { if (live) setGames(g) })
      .catch(err => { console.error('[BatterReel] listReelGames failed:', err); if (live) setGames([]) })
    return () => { live = false }
  }, [date])

  useEffect(() => {
    if (game == null) return
    let live = true
    setBatters(null); setPick(null); setData(null)
    listGameBatters(game)
      .then(b => { if (live) setBatters(b) })
      .catch(err => { console.error('[BatterReel] listGameBatters failed:', err); if (live) setBatters([]) })
    return () => { live = false }
  }, [game])

  useEffect(() => {
    if (game == null || pick == null) return
    let live = true
    setLoading(true); setFailed(false); setData(null)
    loadBatterReel(game, pick)
      .then(r => { if (live) { setData(r); setFailed(!r) } })
      .catch(err => { console.error('[BatterReel] loadBatterReel failed:', err); if (live) setFailed(true) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [game, pick])

  const segments = useMemo(() => (data ? buildBatterSegments(data, on) : []), [data, on])
  const render = useMemo(() => (data ? batterRenderer(data) : null), [data])
  const available = useMemo(() => (data ? availableBatterSlides(data) : []), [data])
  const toggle = (id: BatterSegmentId) => setOn(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))

  const dateBar = <ReelDateBar date={date} setDate={setDate} slateDate={slateDate} label="Batter reel game date" />
  if (games === null) return <div className="flex flex-col gap-4">{dateBar}<Msg>Loading finished games…</Msg></div>
  if (games.length === 0) return <div className="flex flex-col gap-4">{dateBar}<Msg>No finished games on {date}. Pick another date.</Msg></div>

  return (
    <div className="flex flex-col gap-4">
      {dateBar}
      <Chips>
        {games.map(g => (
          <button key={g.gamePk} onClick={() => setGame(g.gamePk)} className={chipClass(game === g.gamePk)}>
            {g.awayAbbr} {g.awayScore} @ {g.homeAbbr} {g.homeScore}
          </button>
        ))}
      </Chips>
      {game == null && <Msg>Pick a game, then a hitter.</Msg>}
      {game != null && batters === null && <Msg>Loading hitters…</Msg>}
      {batters && batters.length === 0 && <Msg error>No hitters found. Check the server log for [listGameBatters].</Msg>}
      {batters && batters.length > 0 && (
        <Chips>
          {batters.map(b => (
            <button key={b.batterId} onClick={() => setPick(b.batterId)} className={chipClass(pick === b.batterId)}>
              {b.name} · {b.teamAbbr} · {b.line}
            </button>
          ))}
        </Chips>
      )}
      {pick != null && loading && <Msg>Loading hitter…</Msg>}
      {pick != null && failed && !loading && <Msg error>Could not load this hitter&apos;s game. Check the server log for [loadBatterReel].</Msg>}
      {data && render && (
        <>
          <SlidePicker list={BATTER_SEGMENT_LIST} available={available} on={on} segments={segments} toggle={toggle} totalS={totalOf(segments)} maxS={MAX_PART_S} notes={data.notes} unavailable="no data for this game" />
          <StoryPlayer key={`${data.gamePk}-${data.batter.id}`} render={render} playerIds={[data.batter.id]} fileStem={`the-edge-batter-${data.batter.id}-${data.slateDate}`} segments={segments} allSegments={segments} />
        </>
      )}
    </div>
  )
}
