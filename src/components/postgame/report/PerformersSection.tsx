// src/components/postgame/report/PerformersSection.tsx
//
// §3 Top performers — this game only. The three batters and three pitchers who added the most
// win probability, as chips: Decisive / Solid / Quiet (fixed thresholds, see lib/postgame/recap)
// with the actual game line. Season grades are deliberately absent.

import { getPostData } from '@/lib/postgame/data'
import { buildPerformers, DECISIVE, SOLID, type Chip } from '@/lib/postgame/recap'
import { playerHeadshotUrl, teamLogoUrl } from '@/lib/mlb'
import Headshot from '@/components/scout/Headshot'
import type { PostgameContext } from './types'

const LABEL_STYLE: Record<Chip['label'], string> = {
  Decisive: 'bg-orange-500 text-white border-orange-600',
  Solid: 'bg-yellow-200 text-stone-900 border-yellow-400',
  Quiet: 'bg-stone-100 text-stone-500 border-stone-200',
}

function ChipCard({ c, ctx }: { c: Chip; ctx: PostgameContext }) {
  const club = ctx[c.side]
  return (
    <li title={`${c.name} — ${c.wpa >= 0 ? '+' : ''}${c.wpa.toFixed(0)} points of win probability this game`} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
      <Headshot src={playerHeadshotUrl(c.id, 96)} fallback={teamLogoUrl(club.id)} size={44} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-sans font-bold text-stone-900 leading-tight truncate">{c.name} <span className="font-mono font-normal text-[9px] text-stone-400">{club.abbr}</span></p>
        <p className="text-[12px] font-mono text-stone-600 mt-0.5">{c.line}</p>
      </div>
      <span className={`shrink-0 text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-1 border ${LABEL_STYLE[c.label]}`}>{c.label}</span>
    </li>
  )
}

export default async function PerformersSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  const p = data ? buildPerformers(data) : null
  if (!p) return <p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">Win probability isn&apos;t available for this game, so top performers can&apos;t be ranked.</p>
  return (
    <div className="space-y-4">
      <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-stone-100">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-2">Batters</p>
          <ul className="space-y-2">{p.batters.map((c) => <ChipCard key={c.id} c={c} ctx={ctx} />)}</ul>
        </div>
        <div className="lg:pl-6">
          <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-2">Pitchers</p>
          <ul className="space-y-2">{p.pitchers.map((c) => <ChipCard key={c.id} c={c} ctx={ctx} />)}</ul>
        </div>
      </div>
      <p className="text-[9.5px] font-mono text-stone-400 leading-relaxed">Ranked by win probability added in this game (the MLB feed&apos;s per-play figure, summed for each player). Decisive = {DECISIVE}+ points, Solid = {SOLID}+, Quiet = under {SOLID}. Lines are this game only, not season numbers.</p>
    </div>
  )
}
