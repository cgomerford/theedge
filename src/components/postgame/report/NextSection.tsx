// src/components/postgame/report/NextSection.tsx
//
// §13 Next up — each club's next game (opponent, first pitch, series game N of M), its probable
// starter, and a count × pitch teaser for that starter (what he throws first pitch and with two
// strikes) with links to that game's Preview and Scout Report for the full map. Series state for
// THIS game is the header line. Probable starters that haven't been announced say so.

import Link from 'next/link'
import { getPostData } from '@/lib/postgame/data'
import { getNextUp, type NextGame } from '@/lib/postgame/next'
import { playerHeadshotUrl, teamLogoUrl } from '@/lib/mlb'
import Headshot from '@/components/scout/Headshot'
import { Empty, Foot, SIDE_COLOR } from './ui'
import type { PostgameContext } from './types'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'

function Tile({ g, ctx }: { g: NextGame; ctx: PostgameContext }) {
  const club = ctx[g.side]
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3.5">
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={teamLogoUrl(g.opp.id)} alt="" className="w-8 h-8 object-contain shrink-0" />
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-widest font-bold" style={{ color: SIDE_COLOR[g.side] }}>{club.abbr} next</p>
          <p className="text-[14px] font-sans font-bold text-stone-900 leading-tight">{g.atHome ? 'vs' : 'at'} {g.opp.name}</p>
          <p className="text-[10.5px] font-mono text-stone-500 mt-0.5">{when(g.firstPitch)}{g.seriesGame ? ` · ${g.sameSeries ? 'game' : 'opens series, game'} ${g.seriesGame.n} of ${g.seriesGame.of}` : ''}</p>
        </div>
      </div>
      <div className="mt-3 border-t border-stone-100 pt-3">
        <p className="text-[9px] font-mono uppercase tracking-wider text-stone-400 mb-1.5">{g.final ? 'Started' : 'Probable starter'}</p>
        {g.starter ? (
          <div className="flex items-center gap-2.5">
            <Headshot src={playerHeadshotUrl(g.starter.id, 96)} fallback={teamLogoUrl(club.id)} size={36} />
            <div className="min-w-0">
              <p className="text-[12.5px] font-sans font-bold text-stone-900 leading-tight">{g.starter.name}</p>
              {g.teaser ? (
                <p className="text-[11px] font-mono text-stone-600 mt-0.5">
                  {g.teaser.firstPitch && <>First pitch: <b>{g.teaser.firstPitch.name}</b> {g.teaser.firstPitch.pct.toFixed(0)}%</>}
                  {g.teaser.firstPitch && g.teaser.twoStrike && <span className="text-stone-300"> · </span>}
                  {g.teaser.twoStrike && <>Two strikes: <b>{g.teaser.twoStrike.name}</b> {g.teaser.twoStrike.pct.toFixed(0)}%</>}
                </p>
              ) : <p className="text-[10.5px] font-sans italic text-stone-400 mt-0.5">No count-by-pitch data on file yet.</p>}
            </div>
          </div>
        ) : <p className="text-[12px] font-sans italic text-stone-400">Not announced yet.</p>}
      </div>
      <div className="flex gap-4 mt-3">
        <Link href={`/mlb/${g.slug}`} className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-semibold hover:text-orange-700">{g.final ? 'Game page →' : 'Preview →'}</Link>
        <Link href={g.final ? `/mlb/${g.slug}/postgame` : `/mlb/${g.slug}/scout-report`} className="text-[10px] font-mono uppercase tracking-widest text-stone-500 hover:text-orange-600">{g.final ? 'Postgame →' : 'Scout Report →'}</Link>
      </div>
    </div>
  )
}

export default async function NextSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  const start = data?.feed.gameData.datetime?.dateTime
  const next = data && start ? await getNextUp(data, ctx.gameDate, start) : []
  return (
    <div className="space-y-4">
      {data?.series && <p className="text-[12.5px] font-sans text-stone-700"><span className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mr-2">Series</span><b>{data.series.result}</b>{data.series.gameNumber && data.series.totalGames ? <span className="text-stone-500"> · game {data.series.gameNumber} of {data.series.totalGames}</span> : null}</p>}
      {next.length ? <div className="grid gap-4 md:grid-cols-2">{next.map((g) => <Tile key={g.side} g={g} ctx={ctx} />)}</div> : <Empty>No upcoming game was found on either club&apos;s schedule.</Empty>}
      <Foot>Count × pitch = the share of the starter&apos;s pitches that were his most-used type on the first pitch (0-0) and with two strikes (0-2, 1-2, 2-2), from his season data. The full count map is in that game&apos;s Scout Report.</Foot>
    </div>
  )
}
