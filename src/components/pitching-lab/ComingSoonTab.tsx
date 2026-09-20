'use client'

// src/components/pitching-lab/ComingSoonTab.tsx
//
// Honest placeholder for Pitching Lab tabs that don't have real data
// wired up yet (Arsenal deep-dive, Stuff & Movement, Sequencing,
// Platoon & Matchup, Trends) — this app doesn't fabricate stats, so
// these tabs say so plainly instead of showing fake charts.

export default function ComingSoonTab({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#DEDACE] bg-white/50 p-10 text-center">
      <p className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-2">{title} — coming soon</p>
      <p className="text-[13px] text-[#57534E] max-w-[520px] mx-auto">{blurb}</p>
    </div>
  )
}
