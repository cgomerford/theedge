// src/components/BattingLabExplorer.tsx
//
// Search/entry point for the standalone Batting Lab — same real MLB
// /people/search typeahead used everywhere else (src/lib/lab.ts's
// searchPeople via /api/lab/search), jumping to /mlb/batting-lab/[id].
// Mirrors PitchingLabExplorer.tsx exactly, batter side.

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type PlayerResult = { id: number; fullName: string; primaryPosition: string }

function mlbHeadshot(id: number | string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}

export default function BattingLabExplorer() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerResult[]>([])
  const gen = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) return
    const myGen = ++gen.current
    const t = setTimeout(() => {
      fetch(`/api/lab/search?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(data => { if (myGen === gen.current) setResults((data.people ?? []).slice(0, 6)) })
        .catch(() => { if (myGen === gen.current) setResults([]) })
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const visibleResults = useMemo(() => (query.trim().length >= 3 ? results : []), [query, results])

  function goToBatter(id: number) {
    router.push(`/mlb/batting-lab/${id}`)
  }

  return (
    <div>
      <div className="relative mb-6 max-w-lg">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && visibleResults[0]) goToBatter(visibleResults[0].id) }}
          placeholder="Search any MLB batter… try “Yordan Alvarez”"
          className="w-full text-[14px] bg-white border border-[#DEDACE] rounded-full px-5 py-3.5 outline-none focus:border-[#FF5722] transition"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8A8577] text-[13px] hover:text-[#1A1A1A]"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {visibleResults.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {visibleResults.map((p, i) => (
            <button
              key={p.id}
              onClick={() => goToBatter(p.id)}
              className="flex items-center gap-2 text-left rounded-full border px-3 py-1.5 transition hover:border-[#FF5722]"
              style={{ borderColor: i === 0 ? '#FF5722' : '#E8E4DC', background: i === 0 ? 'rgba(255,87,34,0.05)' : '#fff' }}
            >
              <img src={mlbHeadshot(p.id)} alt="" width={20} height={20} style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
              <span className="text-[11.5px] font-bold text-[#1A1A1A]">{p.fullName}</span>
              <span className="text-[9px] font-mono uppercase tracking-widest text-[#8A8577]">{p.primaryPosition}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[#DEDACE] p-10 text-center text-[12px] text-[#8A8577]">
          Search any batter to open their Batting Lab — real season stats and percentiles, zone-by-pitch-type breakdown, bat speed and contact quality, and the real reaction-window physics graphic.
        </div>
      )}
    </div>
  )
}
