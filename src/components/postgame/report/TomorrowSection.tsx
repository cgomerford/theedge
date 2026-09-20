// src/components/postgame/report/TomorrowSection.tsx
//
// Pro §22 Into tomorrow — Scout teaser. Per club: the arms this game leaves with a heavy recent load (workload
// facts: consecutive days, or 30+ pitches in three days), and tomorrow's probable starter with his season pitch
// mix and count teaser. It hands off to that game's Scout Report for the full read.

import Link from 'next/link'
import { getPostData } from '@/lib/postgame/data'
import { getTomorrow, HEAVY, type TomorrowSide } from '@/lib/postgame/tomorrow'
import { pitchColor, playerHeadshotUrl, teamLogoUrl } from '@/lib/mlb'
import Headshot from '@/components/scout/Headshot'
import { Empty, Eyebrow, Foot, SIDE_COLOR } from './ui'
import type { PostgameContext } from './types'

function Tile({ t, ctx }: { t: TomorrowSide; ctx: PostgameContext }) {
  const club = ctx[t.side], g = t.next
  if (!g) return <div className="rounded-xl border border-stone-200 bg-white p-3.5"><p className="text-[13px] font-sans font-bold" style={{ color: SIDE_COLOR[t.side] }}>{club.abbr}</p><Empty>No upcoming game found.</Empty></div>
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3.5 space-y-3">
      <p className="text-[13.5px] font-sans font-bold text-stone-900"><span style={{ color: SIDE_COLOR[t.side] }}>{club.abbr}</span> · {g.atHome ? 'vs' : 'at'} {g.opp.name}</p>
      <div>
        <Eyebrow>Arms to watch</Eyebrow>
        {t.arms.length ? (
          <ul className="space-y-1">{t.arms.map((a) => <li key={a.id} className="flex items-baseline justify-between gap-2 text-[12px] font-sans text-stone-800"><b>{a.name}</b><span className="font-mono text-[10.5px] text-stone-500">{a.why} · {a.line.pitches} tonight</span></li>)}</ul>
        ) : <p className="text-[12px] font-sans italic text-stone-400">{t.used === 0 ? 'No relievers were used.' : `None of the ${t.used} relievers used carries a heavy recent load.`}</p>}
      </div>
      <div>
        <Eyebrow>{g.final ? 'Starter' : 'Probable starter'}</Eyebrow>
        {g.starter ? (
          <div className="flex items-start gap-2.5">
            <Headshot src={playerHeadshotUrl(g.starter.id, 96)} fallback={teamLogoUrl(club.id)} size={38} />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-sans font-bold text-stone-900">{g.starter.name}</p>
              {t.mix.length ? (
                <>
                  <div className="flex h-3 overflow-hidden bg-stone-100 mt-1">{t.mix.map((m) => <div key={m.code} style={{ width: `${m.pct}%`, background: pitchColor(m.code) }} title={`${m.name} ${m.pct.toFixed(0)}%`} />)}</div>
                  <p className="text-[10.5px] font-mono text-stone-600 mt-1">{t.mix.map((m) => `${m.name} ${m.pct.toFixed(0)}%`).join(' · ')}</p>
                </>
              ) : <p className="text-[10.5px] font-sans italic text-stone-400 mt-0.5">No season pitch mix on file.</p>}
              {g.teaser && <p className="text-[10.5px] font-mono text-stone-600 mt-0.5">{g.teaser.firstPitch && <>First pitch: <b>{g.teaser.firstPitch.name}</b> {g.teaser.firstPitch.pct.toFixed(0)}%</>}{g.teaser.firstPitch && g.teaser.twoStrike && ' · '}{g.teaser.twoStrike && <>Two strikes: <b>{g.teaser.twoStrike.name}</b> {g.teaser.twoStrike.pct.toFixed(0)}%</>}</p>}
            </div>
          </div>
        ) : <p className="text-[12px] font-sans italic text-stone-400">Not announced yet.</p>}
      </div>
      <Link href={g.final ? `/mlb/${g.slug}/postgame` : `/mlb/${g.slug}/scout-report`} className="inline-block text-[10px] font-mono uppercase tracking-widest text-orange-600 font-semibold hover:text-orange-700">{g.final ? 'Postgame report →' : 'Full Scout Report →'}</Link>
    </div>
  )
}

export default async function TomorrowSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  const start = data?.feed.gameData.datetime?.dateTime
  const tm = data && start ? await getTomorrow(data, ctx.gameDate, start) : []
  if (tm.length === 0) return <Empty>Tomorrow&apos;s game couldn&apos;t be looked up.</Empty>
  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-2">{tm.map((t) => <Tile key={t.side} t={t} ctx={ctx} />)}</div>
      <Foot>Arms to watch = relievers who pitched on consecutive days or threw {HEAVY}+ pitches over the last three days including tonight. It is a workload record, not a forecast of who will or won&apos;t pitch. The starter&apos;s mix is his season usage; the full matchup work lives in the Scout Report.</Foot>
    </div>
  )
}
