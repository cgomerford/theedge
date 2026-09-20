// src/components/scout/ClubHeader.tsx — logo + name row that titles a club's column.

import { teamLogoUrl } from '@/lib/mlb'
import type { ScoutClub } from './types'

export default function ClubHeader({ club, side, children }: { club: ScoutClub; side: 'away' | 'home'; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 pb-2.5 mb-3 border-b border-stone-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={teamLogoUrl(club.id)} alt="" className="w-6 h-6 object-contain shrink-0" />
      <div className="min-w-0">
        <p className="text-[13px] font-sans font-bold text-stone-900 leading-tight truncate">{club.name}</p>
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400">{side === 'away' ? 'Away' : 'Home'}</p>
      </div>
      {children && <div className="ml-auto flex items-center gap-1.5 shrink-0">{children}</div>}
    </div>
  )
}
