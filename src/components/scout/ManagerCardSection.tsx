// src/components/scout/ManagerCardSection.tsx
//
// §12 Manager card — the watch-fors for each club, written after the sections
// above and each pointing back to the section it came from. Information, not
// advice: every line describes what the numbers show, with its sample.
// Free Scout shows the first FREE_WATCH_FORS per club in full; the rest are
// placeholders (their text is never sent to the browser) with an upgrade prompt.
//
// Laid out as a game sheet: each row is a situation ("WHEN …") and what the numbers show
// for it, with the section it came from. A print view shows only this section, one club
// per page, with a ruled line under every row for handwritten notes.

import Link from 'next/link'
import { getManagerCards, type WatchFor } from '@/lib/scout/manager-card'
import { FREE_WATCH_FORS } from './sections'
import PrintButton from './PrintButton'
import ClubHeader from './ClubHeader'
import type { ScoutClub, ScoutContext } from './types'

function Item({ n, w }: { n: number; w: WatchFor }) {
  return (
    <li className="mc-row rounded-xl border border-stone-200 bg-white px-3.5 py-3">
      <div className="mc-grid">
        <div className="mc-when">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-stone-900 text-white text-[10px] font-mono font-bold flex items-center justify-center shrink-0">{n}</span>
            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-700 border border-orange-200">{w.tag}</span>
          </div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mt-2 mb-0.5">When</p>
          <p className="text-[12.5px] font-sans font-bold text-stone-900 leading-snug">{w.when}</p>
        </div>
        <div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-0.5">What the numbers show</p>
          <p className="text-[12px] font-sans text-stone-700 leading-relaxed">{w.body}</p>
          <p className="mt-1 mc-noprint"><a href={`#${w.section}`} className="text-[9.5px] font-mono uppercase tracking-widest text-stone-400 hover:text-orange-600">{w.sectionLabel} · see the charts →</a></p>
          <p className="mc-print-only text-[9px] font-mono text-stone-400">{w.sectionLabel} · {w.title}</p>
        </div>
      </div>
      <div className="mc-notes" aria-hidden />
    </li>
  )
}

function Locked({ n, tag }: { n: number; tag: string }) {
  return (
    <li className="rounded-xl border border-stone-200 bg-white px-3.5 py-3" aria-label="Locked watch-for">
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="w-5 h-5 rounded-full bg-stone-300 text-white text-[10px] font-mono font-bold flex items-center justify-center shrink-0">{n}</span>
        <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-500 border border-stone-200">{tag}</span>
        <span aria-hidden className="text-[11px]">🔒</span>
      </div>
      <div className="pl-7 space-y-1.5 blur-[3px] select-none" aria-hidden>
        <div className="h-2.5 rounded bg-stone-200 w-11/12" /><div className="h-2.5 rounded bg-stone-200 w-full" /><div className="h-2.5 rounded bg-stone-200 w-3/5" />
      </div>
    </li>
  )
}

export function Column({ club, side, items, isPro }: { club: ScoutClub; side: 'away' | 'home'; items: WatchFor[]; isPro: boolean }) {
  const shown = isPro ? items : items.slice(0, FREE_WATCH_FORS)
  const locked = isPro ? [] : items.slice(FREE_WATCH_FORS)
  return (
    <div className="mc-club space-y-3">
      <ClubHeader club={club} side={side}><span className="text-[10px] font-mono text-stone-500">{items.length} row{items.length === 1 ? '' : 's'} on the sheet</span></ClubHeader>
      {items.length === 0 ? <p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">Not enough data yet to fill in a sheet for {club.abbr}.</p> : (
        <ol className="space-y-2.5">
          {shown.map((w, i) => <Item key={w.id} n={i + 1} w={w} />)}
          {locked.map((w, i) => <Locked key={w.id} n={FREE_WATCH_FORS + i + 1} tag={w.tag} />)}
        </ol>
      )}
      {locked.length > 0 && (
        <div className="mc-noprint rounded-xl bg-stone-50 border border-stone-200 px-4 py-3 text-center">
          <p className="text-[12px] font-sans text-stone-600">{locked.length} more {club.abbr} row{locked.length === 1 ? '' : 's'} on the sheet in the Pro Scout Report.</p>
          <Link href="/pricing" className="inline-block mt-1 text-[10px] font-mono uppercase tracking-widest text-orange-600 font-semibold hover:text-orange-700">See Pro →</Link>
        </div>
      )}
    </div>
  )
}

export const CSS = `
.mc-grid{display:grid;gap:10px}
@media (min-width:640px){.mc-grid{grid-template-columns:10.5rem 1fr;gap:16px}}
.mc-print-only{display:none}
.mc-notes{display:none}
@media print{
  body *{visibility:hidden !important}
  #manager-card,#manager-card *{visibility:visible !important}
  #manager-card{position:absolute;left:0;top:0;width:100%;border:none !important;padding:0 !important}
  .mc-noprint{display:none !important}
  .mc-print-only{display:block !important}
  .mc-row{break-inside:avoid;border-color:#d6d3d1 !important}
  .mc-club{break-after:page}
  .mc-club:last-child{break-after:auto}
  .mc-notes{display:block !important;height:26px;border-bottom:1px dashed #a8a29e;margin-top:6px}
  .mc-grid{grid-template-columns:10.5rem 1fr !important;gap:14px !important}
  .mc-cols{display:block !important}
}
`

export default async function ManagerCardSection({ ctx }: { ctx: ScoutContext }) {
  const cards = await getManagerCards(ctx)
  return (
    <div className="space-y-4">
      <style>{CSS}</style>
      <div className="mc-noprint flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] font-sans text-stone-600 max-w-2xl">One row per situation: when it comes up, and what the numbers show for it. Print it for a sheet with room for notes under every row.</p>
        <PrintButton />
      </div>
      <div className="mc-cols grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-stone-100">
        <Column club={ctx.away} side="away" items={cards.away} isPro={ctx.isPro} />
        <div className="lg:pl-6"><Column club={ctx.home} side="home" items={cards.home} isPro={ctx.isPro} /></div>
      </div>
      <p className="text-[10px] font-mono text-stone-500 leading-relaxed border-t border-stone-100 pt-3">
        Information, not advice. Each row restates numbers from the sections above with the sample behind it; nothing here is a recommendation or a prediction. Rows are left out when their sample is too thin to say anything.
      </p>
    </div>
  )
}
