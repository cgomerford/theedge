'use client'

import { useState } from 'react'
import { type MLBTeam } from '@/lib/teams'

type Props = {
  teams: MLBTeam[]
  followedTeams: string[]
  isPro: boolean
}

export default function TeamPicker({ teams, followedTeams, isPro }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(followedTeams))
  const limit = isPro ? Infinity : 3
  const atLimit = !isPro && selected.size >= 3

  const toggle = (slug: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(slug)) {
        next.delete(slug)
      } else {
        if (!isPro && next.size >= 3) return prev // hard stop
        next.add(slug)
      }
      return next
    })
  }

  return (
    <>
      {atLimit && (
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 text-sm font-serif text-orange-800">
          Free tier limit reached (3 teams). <a href="/pricing" className="underline font-semibold">Upgrade to Pro</a> for unlimited follows.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {teams.map(team => {
          const isChecked = selected.has(team.slug)
          const isDisabled = !isChecked && atLimit

          return (
            <label
              key={team.slug}
              className={`relative flex items-center gap-3 p-3 border cursor-pointer transition-colors ${
                isChecked
                  ? 'border-orange-600 bg-orange-50'
                  : isDisabled
                  ? 'border-stone-100 bg-stone-50 opacity-40 cursor-not-allowed'
                  : 'border-stone-200 bg-white hover:border-stone-400'
              }`}
            >
              <input
                type="checkbox"
                name="teams"
                value={team.slug}
                checked={isChecked}
                disabled={isDisabled}
                onChange={() => toggle(team.slug)}
                className="w-4 h-4 accent-orange-600"
              />
              <div>
                <div className="font-mono text-xs text-stone-500">{team.abbrev}</div>
                <div className="font-serif font-semibold text-sm">{team.short}</div>
              </div>
            </label>
          )
        })}
      </div>

      {/* Hidden inputs to ensure unchecked state is sent */}
      <input type="hidden" name="_teamCount" value={selected.size} />
    </>
  )
}