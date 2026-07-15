'use client'

import Link from 'next/link'
import type { PlayerIdentity } from '@/lib/player-page'
import { MLB_TEAMS } from '@/lib/teams'

function playerHeadshotUrl(id: number, size = 180) {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_${size * 2},q_100/v1/people/${id}/headshot/67/current`
}

function formatBirthplace(i: PlayerIdentity): string {
  const parts = [i.birthCity, i.birthStateProvince, i.birthCountry].filter(Boolean)
  return parts.join(', ')
}

function formatDebutServiceTime(debut: string | null): string | null {
  if (!debut) return null
  const debutDate = new Date(debut)
  const now = new Date()
  const years = now.getFullYear() - debutDate.getFullYear()
  const months = now.getMonth() - debutDate.getMonth()
  const adjYears = months < 0 ? years - 1 : years
  const adjMonths = months < 0 ? months + 12 : months
  return `${adjYears}y ${adjMonths}m in MLB`
}

function handednessLabel(bat: string | null, throwHand: string | null, isPitcher: boolean): string {
  if (isPitcher) {
    const t = throwHand ?? '?'
    return `${t}HP`
  }
  const b = bat ?? '?'
  const t = throwHand ?? '?'
  return `${b}/${t}`
}

export default function IdentityStrip({ identity }: { identity: PlayerIdentity }) {
  const teamColor = identity.currentTeam?.primaryColor ?? '#1A1A1A'
 const teamSlug = identity.currentTeam
  ? MLB_TEAMS.find(t => t.name === identity.currentTeam!.name)?.slug ?? null
  : null

  const birthplace = formatBirthplace(identity)
  const serviceTime = formatDebutServiceTime(identity.mlbDebutDate)

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {/* Team accent bar */}
      <div className="h-1" style={{ background: teamColor }} />

      <div className="px-5 sm:px-6 py-5">
        <div className="flex items-start gap-4 sm:gap-5">
          {/* Headshot */}
          <div
            className="rounded-full shrink-0 flex items-center justify-center"
            style={{ width: 88, height: 88, background: teamColor, padding: 4 }}
          >
            <img
              src={playerHeadshotUrl(identity.id)}
              alt={identity.fullName}
              className="w-full h-full rounded-full object-cover"
              style={{ background: '#FAF8F3' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>

          {/* Name + team + jersey */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 leading-tight">
                {identity.fullName}
              </h1>
              {identity.nickName && (
                <span className="font-serif italic text-stone-500 text-lg">
                  &ldquo;{identity.nickName}&rdquo;
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 flex-wrap text-sm">
              {identity.currentTeam && teamSlug && (
                <Link
                  href={`/mlb/teams/${teamSlug}`}
                  className="font-mono text-xs uppercase tracking-widest hover:text-[#FF5722] transition-colors"
                  style={{ color: teamColor }}
                >
                  {identity.currentTeam.abbr}
                </Link>
              )}
              <span className="text-stone-300">·</span>
              <span className="font-mono text-xs uppercase tracking-widest text-stone-600">
                {identity.primaryPosition.abbreviation}
              </span>
              {identity.primaryNumber && (
                <>
                  <span className="text-stone-300">·</span>
                  <span className="font-mono text-xs uppercase tracking-widest text-stone-600">
                    #{identity.primaryNumber}
                  </span>
                </>
              )}
              <span className="text-stone-300">·</span>
              <span className="font-mono text-xs uppercase tracking-widest text-stone-600">
                {handednessLabel(identity.batSide, identity.pitchHand, identity.isPitcher)}
              </span>
              {!identity.active && (
                <>
                  <span className="text-stone-300">·</span>
                  <span className="font-mono text-xs uppercase tracking-widest text-red-600">
                    Inactive
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Meta grid */}
        <div className="mt-5 pt-5 border-t border-stone-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetaCell label="Age" value={identity.currentAge ? `${identity.currentAge}` : '—'} />
          <MetaCell
            label="H / W"
            value={
              identity.height && identity.weight
                ? `${identity.height}, ${identity.weight} lb`
                : identity.height || (identity.weight ? `${identity.weight} lb` : '—')
            }
          />
          <MetaCell label="Born" value={identity.birthDate ? formatBornLine(identity) : '—'} />
          <MetaCell label="Debut" value={serviceTime ?? '—'} />
        </div>

        {birthplace && (
          <div className="mt-3 text-xs font-serif italic text-stone-500">
            From {birthplace}
          </div>
        )}
      </div>
    </div>
  )
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-1">{label}</div>
      <div className="text-sm font-mono font-semibold text-stone-900">{value}</div>
    </div>
  )
}

function formatBornLine(i: PlayerIdentity): string {
  if (!i.birthDate) return '—'
  const d = new Date(i.birthDate)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}