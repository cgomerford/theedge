// src/components/game-preview/LabFunnelLink.tsx
//
// "For more info, see X in Batting/Pitching Lab": a plain link. The labs decide what each visitor can open.

export default function LabFunnelLink({ href, label }: { href: string; label: string; isPro?: boolean }) {
  return (
    <a href={href} className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-orange-600 hover:text-orange-700 transition">
      {label} →
    </a>
  )
}
