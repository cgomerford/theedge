// src/components/game-preview/LabFunnelLink.tsx
//
// "For more info, see X in Batting/Pitching Lab" — same funnel pattern
// ScoutReportTab.tsx's own (unexported) LabFunnelLink already uses, pro-
// gated here per George: free users see a locked teaser pointing at
// /pricing instead of the real Lab link.

export default function LabFunnelLink({ href, label, isPro }: { href: string; label: string; isPro: boolean }) {
  if (!isPro) {
    return (
      <a href="/pricing" className="flex items-center justify-between gap-2 bg-stone-900 rounded-lg px-3 py-2 hover:bg-stone-800 transition">
        <span className="text-[10px] text-stone-300">⊕ {label} is a Pro feature</span>
        <span className="text-[9.5px] font-bold px-2 py-1 bg-amber-300 text-stone-900 rounded whitespace-nowrap shrink-0">Unlock →</span>
      </a>
    )
  }
  return (
    <a href={href} className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-orange-600 hover:text-orange-700 transition">
      {label} →
    </a>
  )
}
