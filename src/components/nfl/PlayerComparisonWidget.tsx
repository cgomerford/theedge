// src/components/nfl/PlayerComparisonWidget.tsx

'use client'

import { useEffect, useState } from 'react'

interface PlayerPick {
  id: string
  name: string
  position: string
  teamId: string
  headshotUrl: string | null
  dials: { key: string; value: number; percentile: number; sampleSize: number }[]
}

const MONO = "'JetBrains Mono', monospace"

function MiniPicker({ season, onPick }: { season: number; onPick: (p: PlayerPick) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nfl/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults((data.results ?? []).filter((r: any) => r.type === 'player'))
        setOpen(true)
      } catch {
        setResults([])
      }
    }, 250)
    return () => clearTimeout(id)
  }, [query])

  async function pick(id: string, name: string) {
    setOpen(false)
    setQuery(name)
    try {
      const res = await fetch(`/api/nfl/player-percentiles?id=${id}&season=${season}`)
      const data = await res.json()
      onPick({ id, name: data.name, position: data.position, teamId: data.teamId, headshotUrl: data.headshotUrl, dials: data.dials ?? [] })
    } catch {
      // leave the field as-is on failure -- no partial/broken pick state
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Pick a player..."
        style={{ width: '100%', padding: '8px 10px', border: '1px solid rgba(26,26,26,0.15)', fontFamily: 'Inter, sans-serif', fontSize: 12, boxSizing: 'border-box' }}
      />
      {open && results.length > 0 ? (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid rgba(26,26,26,0.1)', zIndex: 10, maxHeight: 200, overflowY: 'auto' }}>
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => pick(r.id, r.label)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, fontFamily: 'Inter, sans-serif' }}
            >
              {r.label} <span style={{ color: '#A3A3A3', fontSize: 10 }}>{r.sublabel}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function dotColor(pct: number): string {
  if (pct >= 67) return '#16A34A'
  if (pct >= 34) return '#D97706'
  return '#DC2626'
}

export function PlayerComparisonWidget({ season }: { season: number }) {
  const [a, setA] = useState<PlayerPick | null>(null)
  const [b, setB] = useState<PlayerPick | null>(null)

  const keys = a && b ? Array.from(new Set([...a.dials.map((d) => d.key), ...b.dials.map((d) => d.key)])) : []

  return (
    <div className="panel">
      <div className="panel-head"><h3>Player Comparison</h3></div>
      <p className="panel-note">Percentile vs. same-position peers, Savant style. Only meaningful comparing same-position players.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <MiniPicker season={season} onPick={setA} />
        <MiniPicker season={season} onPick={setB} />
      </div>
      {!a || !b ? (
        <p className="nh-empty tight">Pick two players to compare.</p>
      ) : keys.length === 0 ? (
        <p className="nh-empty tight">Not enough overlapping stats to compare these two.</p>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 10, fontWeight: 700, marginBottom: 8 }}>
            <span>{a.name}</span>
            <span>{b.name}</span>
          </div>
          {keys.map((k) => {
            const da = a.dials.find((d) => d.key === k)
            const db = b.dials.find((d) => d.key === k)
            return (
              <div key={k} style={{ marginBottom: 8 }}>
                <p style={{ fontFamily: MONO, fontSize: 9, color: '#78716C', textAlign: 'center', margin: '0 0 3px' }}>{k}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ flex: 1, height: 6, background: '#EFECE6', position: 'relative' }}>
                    {da ? <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: `${da.percentile}%`, background: dotColor(da.percentile) }} /> : null}
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 9, width: 22, textAlign: 'center' }}>{da?.percentile ?? '—'}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, width: 22, textAlign: 'center' }}>{db?.percentile ?? '—'}</span>
                  <div style={{ flex: 1, height: 6, background: '#EFECE6' }}>
                    {db ? <div style={{ height: '100%', width: `${db.percentile}%`, background: dotColor(db.percentile) }} /> : null}
                  </div>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}