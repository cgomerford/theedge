// src/components/fantasy/FantasySectionLabel.tsx
//
// Shared § section header used across all fantasy pages. Extracted from
// FantasyHub's inline version so every page speaks the same visual language.

export default function FantasySectionLabel({
  children,
  accent = '#FF5722',
}: {
  children: React.ReactNode
  accent?: string
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span
        className="font-mono text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
        style={{ color: accent }}
      >
        § {children}
      </span>
      <div className="flex-1 h-px bg-stone-200" />
    </div>
  )
}
