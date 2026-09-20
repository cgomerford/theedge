// src/components/game-preview/ShellPlaceholder.tsx
//
// Marks a box in the new game-preview wireframe that's structurally
// placed but not built out yet — real content (radar stats, arsenal
// hover, hot zones, etc.) lands in a later iteration. Keep this visually
// quiet (dashed border) so it reads as "not done" rather than "broken."

export default function ShellPlaceholder({
  title, note, className = '',
}: {
  title: string
  note: string
  className?: string
}) {
  return (
    <div className={`rounded-lg border border-dashed border-stone-300 bg-stone-50 p-3 flex flex-col ${className}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-orange-400 text-[10px]">◎</span>
        <span className="text-[9px] font-mono uppercase tracking-widest font-bold text-stone-500">{title}</span>
      </div>
      <p className="text-[10.5px] text-stone-400 font-sans italic leading-snug">{note}</p>
    </div>
  )
}
