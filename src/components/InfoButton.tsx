'use client'

// src/components/InfoButton.tsx
//
// A small, reusable "what is this and why does it matter" disclosure —
// native <details>/<summary> so it needs no click-outside-to-close state
// management, keyboard-focusable and toggleable for free. Used throughout
// the MLB deep-dive charts next to titles/axis labels for readers new to
// a stat. Lives in its own file (rather than inside MlbDeepDives.tsx,
// where it originated) so sibling chart files — AbsRadarSection,
// BatSpeedRadarSection — can import it without creating a circular
// dependency back into MlbDeepDives.tsx, which itself renders those
// sections inside its own cards' expand modals.

export function InfoButton({ title, children, align = 'right' }: { title: string; children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <details className="relative inline-block shrink-0">
      <summary
        className="list-none cursor-pointer w-[15px] h-[15px] rounded-full border border-[#C9C4B6] text-[9px] leading-[13px] text-center text-[#8A8577] hover:border-[#1A1A1A] hover:text-[#1A1A1A] hover:bg-white select-none [&::-webkit-details-marker]:hidden"
        aria-label={`About ${title}`}
      >
        i
      </summary>
      <div
        className={`absolute z-20 top-[19px] ${align === 'right' ? 'right-0' : 'left-0'} w-60 bg-white border border-[#E8E4DC] rounded-lg shadow-lg p-2.5 text-[10px] text-[#57534E] leading-relaxed normal-case font-normal`}
      >
        <div className="font-bold text-[#1A1A1A] mb-1">{title}</div>
        {children}
      </div>
    </details>
  )
}
