'use client'

import ReactionWindow from '@/components/batting-lab/ReactionWindow'

export default function ReactionWindowPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-1">Reaction Window</p>
        <p className="text-[13px] text-[#57534E]">How little time a hitter actually has to judge a pitch — real physics, real distances, widely-cited reference reaction/swing times, all shown, not hidden.</p>
      </div>
      <ReactionWindow />
    </div>
  )
}
