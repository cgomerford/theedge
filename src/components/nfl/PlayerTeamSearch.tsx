// src/components/nfl/PlayerTeamSearch.tsx

'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface SearchResult {
  type: 'player' | 'team'
  id: string
  label: string
  sublabel: string
  imageUrl: string | null
  href: string
}

export function PlayerTeamSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    setLoading(true)
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nfl/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(data.results ?? [])
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(id)
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        placeholder="Search players or teams..."
        style={{
          width: '100%',
          background: '#fff',
          border: '1px solid rgba(26,26,26,0.15)',
          padding: '10px 14px',
          fontFamily: 'Inter, sans-serif',
          fontSize: 13,
          color: '#1A1A1A',
          boxSizing: 'border-box',
        }}
      />
      {open ? (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: '#fff',
            border: '1px solid rgba(26,26,26,0.1)',
            maxHeight: 320,
            overflowY: 'auto',
            zIndex: 20,
          }}
        >
          {loading ? (
            <p style={{ padding: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#A3A3A3', margin: 0 }}>Searching…</p>
          ) : results.length === 0 ? (
            <p style={{ padding: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#A3A3A3', margin: 0 }}>No matches.</p>
          ) : (
            results.map((r) => (
              <Link
                key={`${r.type}-${r.id}`}
                href={r.href}
                onClick={() => setOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  textDecoration: 'none',
                  color: 'inherit',
                  borderBottom: '1px solid rgba(26,26,26,0.05)',
                }}
              >
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.imageUrl}
                    alt=""
                    loading="lazy"
                    style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: r.type === 'player' ? '50%' : 0, background: '#EEE' }}
                  />
                ) : (
                  <div style={{ width: 28, height: 28, background: '#EEE', borderRadius: r.type === 'player' ? '50%' : 0 }} />
                )}
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 13, margin: 0 }}>{r.label}</p>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#A3A3A3', margin: '1px 0 0', textTransform: 'uppercase' }}>
                    {r.type} · {r.sublabel}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}