'use client'

import Link from 'next/link'
import { playerHeadshotUrl } from '@/lib/mlb'
import { findTeamByName } from '@/lib/teams'
import type { TeamTransaction } from '@/lib/team-transactions'
import type { AffiliateStandout } from '@/lib/team-minors'

function TeamBlock({
  teamName, abbr, injuries, callups, standouts,
}: {
  teamName: string
  abbr: string
  injuries: TeamTransaction[]
  callups: TeamTransaction[]
  standouts: AffiliateStandout[]
}) {
  const slug = findTeamByName(teamName)?.slug
  const watchList = standouts.flatMap(s => s.youngPerformers.map(p => ({ ...p, level: s.level }))).slice(0, 3)

  return (
    <div className="p-5 bg-white border border-stone-200 rounded-xl">
      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-4">{abbr}</div>

      <div className="mb-5">
        <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-2">Injuries</p>
        {injuries.length === 0 ? (
          <p className="text-xs font-serif italic text-stone-400">No IL placements on record.</p>
        ) : (
          <div className="space-y-2">
            {injuries.slice(0, 5).map(t => (
              <div key={t.transaction_id} className="flex items-start justify-between gap-2 text-xs">
                <span className="font-serif text-stone-900">{t.player_name}</span>
                <span className="font-mono text-[10px] text-stone-400 text-right shrink-0">
                  {t.il_days ? `${t.il_days}-day IL` : 'IL'}{t.injury_reason ? ` · ${t.injury_reason}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-5">
        <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-2">Call-ups</p>
        {callups.length === 0 ? (
          <p className="text-xs font-serif italic text-stone-400">No recent call-ups.</p>
        ) : (
          <div className="space-y-2">
            {callups.slice(0, 5).map(t => (
              <div key={t.transaction_id} className="flex items-start justify-between gap-2 text-xs">
                <span className="font-serif text-stone-900">{t.player_name}</span>
                <span className="font-mono text-[10px] text-stone-400 shrink-0">{t.from_affiliate_level ?? 'MiLB'} → MLB</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-2">Players to watch — minors</p>
        {watchList.length === 0 ? (
          <p className="text-xs font-serif italic text-stone-400">No qualifying young performers this window.</p>
        ) : (
          <div className="flex gap-3">
            {watchList.map(p => (
              <div key={p.personId} className="flex flex-col items-center text-center w-16">
                <img
                  src={playerHeadshotUrl(p.personId, 60)}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover border border-stone-200"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
                <span className="text-[10px] font-serif text-stone-900 mt-1 truncate w-full">{p.name.split(' ').slice(-1)[0]}</span>
                <span className="text-[9px] font-mono text-stone-400">{p.level} · {p.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {slug && (
        <Link href={`/mlb/teams/${slug}`} className="block text-[10px] font-mono uppercase tracking-widest text-orange-600 mt-4 pt-3 border-t border-stone-100 hover:text-orange-700">
          Full team page →
        </Link>
      )}
    </div>
  )
}

export default function TeamIntelExtras({
  awayTeamName, homeTeamName, awayAbbr, homeAbbr,
  awayInjuries, homeInjuries, awayCallups, homeCallups, awayStandouts, homeStandouts,
}: {
  awayTeamName: string
  homeTeamName: string
  awayAbbr: string
  homeAbbr: string
  awayInjuries: TeamTransaction[]
  homeInjuries: TeamTransaction[]
  awayCallups: TeamTransaction[]
  homeCallups: TeamTransaction[]
  awayStandouts: AffiliateStandout[]
  homeStandouts: AffiliateStandout[]
}) {
  return (
    <section>
      <h3 className="text-xs font-mono uppercase tracking-widest font-bold mb-5 text-orange-600">§ Team Intel</h3>
      <div className="grid md:grid-cols-2 gap-4">
        <TeamBlock teamName={awayTeamName} abbr={awayAbbr} injuries={awayInjuries} callups={awayCallups} standouts={awayStandouts} />
        <TeamBlock teamName={homeTeamName} abbr={homeAbbr} injuries={homeInjuries} callups={homeCallups} standouts={homeStandouts} />
      </div>
    </section>
  )
}