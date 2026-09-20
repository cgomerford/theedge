// src/components/postgame/ScorecardSection.tsx
//
// Postgame §5 The scorecard — the hand-scored card for both clubs, collapsed, each with a download button.
// Server component; the shell wraps it in the section card. Renders a plain note (and logs)
// when the feed is unavailable — never a fabricated card.

import { getScorecard } from '@/lib/postgame/scorecard'
import { ScorecardSheet } from './ScorecardSheet'
import SheetFrame from './SheetFrame'

// Print view for the "Download PDF" button: SheetFrame clones one sheet into #pg-print-root and sets
// body[data-printing]; everything else is hidden and the sheet is zoomed to fit one portrait page.
const PRINT_CSS = `
#pg-print-root{display:none}
@media print{
  @page{size:portrait;margin:6mm}
  body[data-printing]>*:not(#pg-print-root){display:none !important}
  body[data-printing] #pg-print-root{display:block !important}
  body[data-printing]{background:#FAF8F3 !important}
  #pg-print-root>div{zoom:.56;width:fit-content}
  #pg-print-root,#pg-print-root *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`

export default async function ScorecardSection({ gamePk }: { gamePk: number }) {
  const sc = await getScorecard(gamePk)
  if (!sc) return <p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">The scorecard isn&apos;t available right now.</p>
  return (
    <div className="space-y-5">
      <style>{PRINT_CSS}</style>
      <p className="text-[12.5px] font-sans text-stone-600 max-w-3xl leading-relaxed">The whole game as a scorekeeper would have written it. Download either club&apos;s completed scorecard (in the print window choose “Save as PDF”), or open it here.</p>
      <SheetFrame title={`${sc.away.name} batting`}><ScorecardSheet sc={sc} team={sc.away} opp={sc.home} visitor /></SheetFrame>
      <SheetFrame title={`${sc.home.name} batting`}><ScorecardSheet sc={sc} team={sc.home} opp={sc.away} visitor={false} /></SheetFrame>
    </div>
  )
}
