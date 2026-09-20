'use client'

// src/components/PlayerSearch.tsx
//
// Unified homepage typeahead across MLB + NFL. Queries the two existing
// search routes in parallel and merges:
//   - MLB: GET /api/lab/search?q=  → { people: [{ id, fullName, primaryPosition }] }
//          href built as /mlb/players/[id]; headshot built from the MLB id.
//   - NFL: GET /api/nfl/search?q=  → { results: [{ type,id,label,sublabel,imageUrl,href }] }
//          already unified — used as-is.
//
// Promise.allSettled so one endpoint failing doesn't blank the other. A
// request-id guard drops stale responses (typeahead race protection).
//
// maintenance=true → result clicks don't navigate (every player route is
// behind the proxy wall this week); instead an inline "reopens Sept 18"
// prompt appears. Flip maintenance=false on Sept 18 and the same rows
// navigate to the real player pages with no code change.

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import Link from 'next/link'

type Sport = 'MLB' | 'NFL'
type Result = {
  sport: Sport
  type: 'player' | 'team'
  id: string
  label: string
  sublabel: string
  imageUrl: string | null
  href: string
}

const mlbHeadshot = (id: string | number) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`

export default function PlayerSearch({
  maintenance = false,
  sport = 'ALL',
  rounded = false,
}: {
  maintenance?: boolean
  sport?: 'ALL' | 'MLB'
  rounded?: boolean
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [locked, setLocked] = useState<Result | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const latest = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setOpen(false)
      setLoading(false)
      return
    }
    setLoading(true)
    const reqId = ++latest.current
    const t = setTimeout(async () => {
      const [mlb, nfl] = await Promise.allSettled([
        fetch(`/api/lab/search?q=${encodeURIComponent(q)}`).then(r => r.json()),
        // MLB-only pages (e.g. /mlb) skip the NFL fetch entirely rather
        // than fetching and discarding it — one real request instead of two.
        sport === 'MLB' ? Promise.resolve({ results: [] }) : fetch(`/api/nfl/search?q=${encodeURIComponent(q)}`).then(r => r.json()),
      ])
      if (reqId !== latest.current) return // stale response — ignore

      const mlbResults: Result[] =
        mlb.status === 'fulfilled'
          ? (mlb.value?.people ?? []).slice(0, 5).map((p: any) => ({
              sport: 'MLB' as const,
              type: 'player' as const,
              id: String(p.id),
              label: p.fullName ?? '—',
              sublabel: p.primaryPosition ? `${p.primaryPosition} · MLB` : 'MLB',
              imageUrl: mlbHeadshot(p.id),
              href: `/mlb/players/${p.id}`,
            }))
          : []

      const nflResults: Result[] =
        sport === 'MLB' || nfl.status !== 'fulfilled'
          ? []
          : (nfl.value?.results ?? []).slice(0, 5).map((r: any) => ({
              sport: 'NFL' as const,
              type: r.type === 'team' ? ('team' as const) : ('player' as const),
              id: String(r.id),
              label: r.label ?? '—',
              sublabel: r.sublabel ? `${r.sublabel} · NFL` : 'NFL',
              imageUrl: r.imageUrl ?? null,
              href: r.href ?? '#',
            }))

      setResults([...mlbResults, ...nflResults])
      setOpen(true)
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [query, sport])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function onResultClick(e: ReactMouseEvent, r: Result) {
    if (maintenance) {
      e.preventDefault()
      setLocked(r)
      setOpen(false)
    }
  }

  const showDropdown = open && query.trim().length >= 2

  return (
    <div ref={containerRef} className="relative w-full max-w-md mx-auto">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setLocked(null) }}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        placeholder={sport === 'MLB' ? 'Search any MLB player…' : 'Search any MLB or NFL player…'}
        aria-label="Search players"
        className={`w-full bg-[#FAF8F3] text-[#1A1A1A] border border-[#1A1A1A] px-4 py-3 font-mono text-[13px] outline-none placeholder:text-[#8A8577] ${rounded ? 'rounded-full' : ''}`}
      />

      {showDropdown && (
        <div className={`absolute top-full left-0 right-0 mt-1 bg-white border border-[#1A1A1A] max-h-80 overflow-y-auto z-30 text-left ${rounded ? 'rounded-2xl' : ''}`}>
          {loading ? (
            <p className="p-3 font-mono text-[11px] text-[#8A8577]">Searching…</p>
          ) : results.length > 0 ? (
            results.map((r) => (
              <Link
                key={`${r.sport}-${r.id}`}
                href={r.href}
                onClick={(e) => onResultClick(e, r)}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#F4F1EA] border-b border-[#F4F1EA] last:border-b-0"
              >
                <span className="shrink-0 w-8 h-8 rounded-full overflow-hidden bg-[#F4F1EA] border border-[#DEDACE]">
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e: React.SyntheticEvent<HTMLImageElement>) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                    />
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="block font-serif text-sm text-[#1A1A1A] truncate">{r.label}</span>
                  <span className="block font-mono text-[10px] uppercase tracking-widest text-[#8A8577]">{r.sublabel}</span>
                </span>
                <span className={`ml-auto font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${r.sport === 'MLB' ? 'border-[#FF5722] text-[#FF5722]' : 'border-[#1A1A1A] text-[#1A1A1A]'}`}>
                  {r.sport}
                </span>
              </Link>
            ))
          ) : (
            <p className="p-3 font-mono text-[11px] text-[#8A8577]">No matches.</p>
          )}
        </div>
      )}

      {locked && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1A1A1A] text-[#FAF8F3] border border-[#1A1A1A] p-4 z-30 text-left">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#FDE047] mb-1">Reopens Sept 18</div>
          <p className="font-serif text-sm leading-snug">
            {locked.label}&apos;s full profile is part of the rebuild — sign up above to get in first.
          </p>
        </div>
      )}
    </div>
  )
}
