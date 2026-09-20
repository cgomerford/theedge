// src/components/postgame/report/StartersSection.tsx
//
// §6 Starters: plan vs night — for each starter, his usual pitch mix (season, from the same
// arsenal table the Scout Report's pitcher-attack section reads) beside what he actually threw,
// pitch by pitch with velocity, and a one-sentence read written only from those numbers.
// No usual mix on file → the night's mix is shown alone and says so.

import Link from 'next/link'
import { getPostData } from '@/lib/postgame/data'
import { getStarterNights, type MixRow, type StarterNight } from '@/lib/postgame/starters'
import { playerHeadshotUrl, teamLogoUrl } from '@/lib/mlb'
import Headshot from '@/components/scout/Headshot'
import { Empty, Foot, SIDE_COLOR } from './ui'
import type { PostgameContext } from './types'

function MixBar({ m, color }: { m: MixRow; color: string }) {
  const dv = m.velo != null && m.usualVelo != null ? m.velo - m.usualVelo : null
  return (
    <li className="grid grid-cols-[92px_minmax(0,1fr)_92px] items-center gap-2.5" title={`${m.name}: ${m.tonightN} pitches tonight${m.usualPct != null ? `, ${m.usualPct.toFixed(0)}% of his season mix` : ''}${m.whiffs ? `, ${m.whiffs} swinging strikes` : ''}`}>
      <span className="text-[11px] font-sans font-semibold text-stone-800 truncate">{m.name}</span>
      <div className="space-y-0.5" aria-hidden="true">
        <div className="h-2 bg-stone-100"><div className="h-full" style={{ width: `${Math.min(100, m.tonightPct)}%`, background: color }} /></div>
        <div className="h-1.5 bg-stone-50">{m.usualPct != null && <div className="h-full bg-stone-400" style={{ width: `${Math.min(100, m.usualPct)}%` }} />}</div>
      </div>
      <span className="text-right font-mono text-[10.5px] leading-tight">
        <span className="font-bold text-stone-900">{m.tonightN > 0 ? `${m.tonightPct.toFixed(0)}%` : '—'}</span>
        <span className="text-stone-400"> / {m.usualPct != null ? `${m.usualPct.toFixed(0)}%` : '—'}</span>
        {m.velo != null && <span className="block text-[9.5px] text-stone-500">{m.velo.toFixed(1)} mph{dv != null && Math.abs(dv) >= 0.5 ? <span className={dv > 0 ? 'text-orange-600' : 'text-stone-500'}> {dv > 0 ? '+' : '−'}{Math.abs(dv).toFixed(1)}</span> : null}</span>}
      </span>
    </li>
  )
}

function Card({ s, ctx }: { s: StarterNight; ctx: PostgameContext }) {
  const club = ctx[s.side], color = SIDE_COLOR[s.side]
  const l = s.line
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3.5">
      <div className="flex items-center gap-3">
        <Headshot src={playerHeadshotUrl(s.id, 96)} fallback={teamLogoUrl(club.id)} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-sans font-bold text-stone-900 leading-tight truncate">{s.name} <span className="font-mono font-normal text-[9px] text-stone-400">{club.abbr}</span></p>
          <p className="text-[11.5px] font-mono text-stone-600 mt-0.5">{l.ip} IP, {l.h} H, {l.er} ER, {l.bb} BB, {l.k} K · {l.pitches} pitches ({l.strikes} strikes)</p>
        </div>
      </div>
      <p className="text-[12px] font-sans text-stone-700 leading-snug mt-3">{s.read}</p>
      <div className="flex items-center justify-between mt-3 mb-1.5">
        <p className="text-[9px] font-mono uppercase tracking-wider text-stone-400">Pitch · <span style={{ color }}>▬</span> tonight / <span className="text-stone-400">▬</span> usual</p>
      </div>
      <ul className="space-y-2">{s.mix.map((m) => <MixBar key={m.code} m={m} color={color} />)}</ul>
      <Link href={`/mlb/pitching-lab/${s.id}`} className="inline-block mt-3 text-[10px] font-mono uppercase tracking-widest text-orange-600 font-semibold hover:text-orange-700">Open {s.name.split(' ').slice(-1)[0]} in the Pitching Lab →</Link>
    </div>
  )
}

export default async function StartersSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  const starters = data ? await getStarterNights(data, ctx.gameDate) : []
  if (starters.length === 0) return <Empty>The starting pitchers couldn&apos;t be identified for this game.</Empty>
  return (
    <div className="space-y-3">
      <div className="grid gap-4 lg:grid-cols-2">{starters.map((s) => <Card key={s.id} s={s} ctx={ctx} />)}</div>
      <Foot>Usual = each pitcher&apos;s season pitch mix and average velocity on file (refreshed weekly, so it may not include this game); tonight = every pitch he threw in this game, from the game feed. Reads appear only when a pitch&apos;s share moved 8+ points, or a fastball&apos;s velocity moved 1+ mph, on at least 8–10 pitches. A dash means no season figure exists for that pitch.</Foot>
    </div>
  )
}
