'use client'

// Horizontal scrolling stat strip — same marquee technique LiveTicker.tsx
// already uses (CSS keyframe translateX, duplicated content for a seamless
// loop, pause on hover), applied to one player's key numbers instead of a
// list of games.

const ANIMATION_STYLES = `
@keyframes playerTickerScroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.player-ticker-track {
  animation: playerTickerScroll 22s linear infinite;
  will-change: transform;
}
.player-ticker-track:hover {
  animation-play-state: paused;
}
`

export type TickerStat = { label: string; value: string }

export default function PlayerStatsTicker({ stats }: { stats: TickerStat[] }) {
  if (stats.length === 0) return null
  const doubled = [...stats, ...stats]

  return (
    <div className="bg-[#1A1A1A] rounded-lg overflow-hidden mb-6">
      <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />
      <div className="flex player-ticker-track py-2.5 whitespace-nowrap">
        {doubled.map((s, i) => (
          <span key={i} className="inline-flex items-baseline gap-1.5 px-5 shrink-0">
            <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400">{s.label}</span>
            <span className="font-mono text-sm font-bold text-[#FAF8F3]">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  )
}