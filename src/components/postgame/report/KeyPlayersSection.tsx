// src/components/postgame/report/KeyPlayersSection.tsx
//
// §12 Key players scorecard — the Preview's key players for each club (frozen at first pitch),
// each with what the Preview said and what happened: Showed up / Stayed quiet / Missed / Didn't
// play, with the game line. Verdict rules are fixed and listed underneath (lib/postgame/keyplayers.ts).
// "Preview read" is the game page's own wording (Favourable / Neutral / Tough), never a score.

import { getPostData } from '@/lib/postgame/data'
import { getKeyPlayersNight, type KeyPlayerRow, type KeyVerdict } from '@/lib/postgame/keyplayers'
import { playerHeadshotUrl, teamLogoUrl } from '@/lib/mlb'
import Headshot from '@/components/scout/Headshot'
import ClubHeader from '@/components/scout/ClubHeader'
import { Empty, Foot } from './ui'
import type { PostgameContext } from './types'

const VERDICT: Record<KeyVerdict, string> = {
  'Showed up': 'bg-orange-500 text-white border-orange-600',
  'Stayed quiet': 'bg-stone-100 text-stone-500 border-stone-200',
  Missed: 'bg-stone-900 text-yellow-300 border-stone-900',
  "Didn't play": 'bg-white text-stone-400 border-stone-300 border-dashed',
}

function Card({ r, ctx }: { r: KeyPlayerRow; ctx: PostgameContext }) {
  const club = ctx[r.side]
  return (
    <li className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
      <Headshot src={playerHeadshotUrl(r.id, 96)} fallback={teamLogoUrl(club.id)} size={44} dim={r.verdict === "Didn't play"} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-sans font-bold text-stone-900 leading-tight truncate">{r.name} <span className="font-mono font-normal text-[9px] text-stone-400">{r.type === 'pitcher' ? 'SP/RP' : 'BAT'} · #{r.rank}</span></p>
        <p className="text-[11px] font-sans text-stone-500 leading-snug mt-0.5"><span className="font-mono text-[9px] uppercase tracking-wider text-stone-400">Preview: {r.preview}</span>{r.why ? ` — ${r.why}` : ''}</p>
        <p className="text-[12px] font-mono text-stone-800 mt-1">{r.line ?? 'Did not appear in the game'}</p>
      </div>
      <span className={`shrink-0 text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-1 border ${VERDICT[r.verdict]}`}>{r.verdict}</span>
    </li>
  )
}

export default async function KeyPlayersSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  const rows = data ? await getKeyPlayersNight(data) : []
  if (rows.length === 0) return <Empty>No key players were recorded in the Preview for this game.</Empty>
  return (
    <div className="space-y-3">
      <div className="grid gap-6 lg:grid-cols-2">
        {(['away', 'home'] as const).map((side) => {
          const list = rows.filter((r) => r.side === side)
          return (
            <div key={side}>
              <ClubHeader club={{ ...ctx[side], probableId: null, probableName: null }} side={side} />
              {list.length ? <ul className="space-y-2">{list.map((r) => <Card key={r.id} r={r} ctx={ctx} />)}</ul> : <p className="text-[12px] font-sans italic text-stone-400">No key players recorded for {ctx[side].abbr}.</p>}
            </div>
          )
        })}
      </div>
      <Foot>Batters — Showed up: 2+ hits, 4+ total bases, on base 3+ times, or +6 win probability; Missed: 4+ plate appearances without reaching base, or −6 win probability. Pitchers — Showed up: 5+ IP with 2 or fewer ER, or +6 win probability; Missed: 4+ ER or −6. Everything else is Stayed quiet. Win probability added is the MLB feed&apos;s per-play figure summed over the game.</Foot>
    </div>
  )
}
