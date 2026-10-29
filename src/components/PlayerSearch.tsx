'use client'

// src/components/PlayerSearch.tsx
//
// Unified homepage typeahead across MLB + NFL. Queries the two existing
// search routes in parallel and merges:
//   - MLB: GET /api/lab/search?q=  → { people: [{ id, fullName, primaryPosition }] }
//          href built as /mlb/players/[id]; headshot built from the MLB id.
//   - NFL was removed from the site; the second slot always resolves empty.
//
// Promise.allSettled so one endpoint failing doesn't blank the other. A
// request-id guard drops stale responses (typeahead race protection).
//

import { useEffect, useRef, useState } from 'react'
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
  sport = 'ALL',
  rounded = false,
  labLinks = false,
  header = false,
  placeholder,
  autoFocus = false,
}: {
  sport?: 'ALL' | 'MLB' | 'NFL'
  rounded?: boolean
  /** MLB results open the player's lab (pitchers: Pitching Lab, everyone else: Batting Lab; two-way players get both) */
  labLinks?: boolean
  /** Site header style: 36px white field with a magnifier, full width of its container */
  header?: boolean
  placeholder?: string
  autoFocus?: boolean
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
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
        // NFL-only pages skip the MLB fetch, mirroring the MLB-only skip below.
        sport === 'NFL' ? Promise.resolve({ people: [] }) : fetch(`/api/lab/search?q=${encodeURIComponent(q)}`).then(r => r.json()),
        // MLB-only pages (e.g. /mlb) skip the NFL fetch entirely rather
        // than fetching and discarding it — one real request instead of two.
        Promise.resolve({ results: [] }),   // NFL search was removed with the NFL pages
      ])
      if (reqId !== latest.current) return // stale response — ignore

      const mlbResults: Result[] =
        mlb.status === 'fulfilled'
          ? (mlb.value?.people ?? []).slice(0, 5).flatMap((p: any): Result[] => {
              const base = { sport: 'MLB' as const, type: 'player' as const, id: String(p.id), label: p.fullName ?? '—', imageUrl: mlbHeadshot(p.id) }
              const pos = String(p.primaryPosition ?? '')
              if (!labLinks) return [{ ...base, sublabel: pos ? `${pos} · MLB` : 'MLB', href: `/mlb/players/${p.id}` }]
              const pitching = { ...base, sublabel: `${pos} · Pitching Lab`, href: `/mlb/lab/pitching-lab/${p.id}` }
              const batting = { ...base, sublabel: `${pos} · Batting Lab`, href: `/mlb/lab/batting-lab/${p.id}` }
              return pos === 'P' ? [pitching] : pos === 'TWP' || pos === 'Two-Way Player' ? [pitching, batting] : [batting]
            })
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
  }, [query, sport, labLinks])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const showDropdown = open && query.trim().length >= 2

  return (
    <div ref={containerRef} className={header ? 'relative w-full' : 'relative w-full max-w-md mx-auto'}>
      {header ? (
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none" style={{ position: 'absolute', left: 11, top: 10.5, pointerEvents: 'none' }}>
          <circle cx="8.5" cy="8.5" r="6" stroke="#8A8577" strokeWidth="2" /><path d="M13 13l5 5" stroke="#8A8577" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : null}
      <input
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => { setQuery(e.target.value) }}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        placeholder={placeholder ?? 'Search any MLB player…'}
        aria-label="Search players"
        className={header ? 'w-full bg-white text-[#1A1A1A] border border-[#E8E4DC] rounded-sm h-9 pl-8 pr-3 text-[13px] outline-none placeholder:text-[#8A8577]' : `w-full bg-[#FAF8F3] text-[#1A1A1A] border border-[#1A1A1A] px-4 py-3 text-[13px] outline-none placeholder:text-[#8A8577] ${rounded ? 'rounded-sm' : ''}`}
      />

      {showDropdown && (
        <div className={`absolute top-full left-0 right-0 mt-1 bg-white border border-[#1A1A1A] max-h-80 overflow-y-auto z-30 text-left ${rounded ? 'rounded-2xl' : ''}`}>
          {loading ? (
            <p className="p-3 text-[11px] text-[#8A8577]">Searching…</p>
          ) : results.length > 0 ? (
            results.map((r) => (
              <Link
                key={`${r.sport}-${r.id}-${r.href}`}
                href={r.href}
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
                  <span className="block text-sm text-[#1A1A1A] truncate">{r.label}</span>
                  <span className="block text-[10px] uppercase tracking-widest text-[#8A8577]">{r.sublabel}</span>
                </span>
                <span className={`ml-auto text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${r.sport === 'MLB' ? 'border-[#FF5722] text-[#FF5722]' : 'border-[#1A1A1A] text-[#1A1A1A]'}`}>
                  {r.sport}
                </span>
              </Link>
            ))
          ) : (
            <p className="p-3 text-[11px] text-[#8A8577]">No matches.</p>
          )}
        </div>
      )}

    </div>
  )
}
