'use client'

// src/components/stats/queryWho.tsx
//
// "Who" filters for plate-appearance searches: a club (batting, pitching or either) and / or a player
// (as batter, pitcher or either). The player box is a type-ahead on /api/stats/player-search.

import { useEffect, useState } from 'react'
import { C, SANS } from '@/components/team/ui'
import { Field, SegBar, selectStyle } from '@/components/stats/queryUi'
import { MLB_TEAMS } from '@/lib/teams'
import { extractMatchup, type Who } from '@/lib/stats-query-catalog'

type Hit = { id: number; name: string; pos: string; team: string; active: boolean }

const TEAMS = [...MLB_TEAMS].sort((a, b) => a.name.localeCompare(b.name))

export function WhoFilter({ who, onChange }: { who: Who | undefined; onChange: (w: Who | undefined) => void }) {
  const w = who ?? {}
  const set = (patch: Partial<Who>) => {
    const next = { ...w, ...patch }
    onChange(next.team || next.playerId ? next : undefined)
  }
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        const r = await fetch(`/api/stats/player-search?q=${encodeURIComponent(q.trim())}`)
        const j = await r.json()
        if (!cancelled) setHits(r.ok ? (j.players as Hit[]) : [])
      } catch { if (!cancelled) setHits([]) } finally { if (!cancelled) setBusy(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q])

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Field label="Club" hint="Limit the search to one club. Choose whether it was batting, pitching, or either — “batting” means the club's hitters came to the plate.">
        <div style={{ display: 'grid', gap: 8 }}>
          <select style={selectStyle} value={w.team ?? ''} onChange={e => set(e.target.value ? { team: e.target.value, teamRole: w.teamRole ?? 'any' } : { team: undefined, teamRole: undefined })}>
            <option value="">Any club</option>
            {TEAMS.map(t => <option key={t.abbrev} value={t.abbrev}>{t.name}</option>)}
          </select>
          {w.team && (
            <SegBar<'any' | 'bat' | 'field'> dense value={w.teamRole ?? 'any'} onChange={v => set({ teamRole: v })}
              options={[{ key: 'any', label: 'Either' }, { key: 'bat', label: 'Batting' }, { key: 'field', label: 'Pitching' }]} />
          )}
        </div>
      </Field>

      <Field label="Player" hint="Type at least two letters of a name, then choose the player. You can look at them as the batter, the pitcher, or either.">
        {w.playerId ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: `1px solid ${C.line}`, borderRadius: 5, background: '#fff', fontFamily: SANS, fontWeight: 700, fontSize: 14 }}>
              <span style={{ flex: 1 }}>{w.playerName ?? `Player ${w.playerId}`}</span>
              <button type="button" aria-label="Remove player" onClick={() => set({ playerId: undefined, playerName: undefined, playerRole: undefined })}
                style={{ all: 'unset', cursor: 'pointer', color: C.mute, fontSize: 13 }}>✕</button>
            </div>
            <SegBar<'any' | 'bat' | 'pitch'> dense value={w.playerRole ?? 'any'} onChange={v => set({ playerRole: v })}
              options={[{ key: 'any', label: 'Either' }, { key: 'bat', label: 'As batter' }, { key: 'pitch', label: 'As pitcher' }]} />
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a player…" aria-label="Search a player" style={selectStyle} />
            {(hits.length > 0 || busy) && (
              <div style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: 'calc(100% + 4px)', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, boxShadow: '0 8px 20px rgba(0,0,0,.12)', overflow: 'hidden' }}>
                {busy && hits.length === 0 && <div style={{ padding: 8, fontFamily: SANS, fontSize: 12, color: C.faint }}>Searching…</div>}
                {hits.map(h => (
                  <button key={h.id} type="button" onClick={() => { set({ playerId: h.id, playerName: h.name, playerRole: 'any' }); setQ(''); setHits([]) }}
                    style={{ all: 'unset', display: 'flex', gap: 8, width: 'calc(100% - 20px)', padding: '7px 10px', cursor: 'pointer', fontFamily: SANS, fontSize: 13, borderTop: `1px solid ${C.soft}` }}>
                    <b>{h.name}</b><span style={{ color: C.mute }}>{[h.pos, h.team].filter(Boolean).join(' · ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Field>
    </div>
  )
}

const FILLER = new Set(['how', 'does', 'do', 'did', 'has', 'have', 'what', 'whats', "what's", 'is', 'are', 'show', 'me', 'the', 'a', 'stats', 'stat', 'numbers', 'results', 'career', 'hit', 'hits', 'hitting', 'batting', 'against'])
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

async function findPlayer(name: string): Promise<Hit | null> {
  try {
    const r = await fetch(`/api/stats/player-search?q=${encodeURIComponent(name)}`)
    if (!r.ok) return null
    const hits = ((await r.json()).players ?? []) as Hit[]
    const want = plain(name).split(/\s+/)
    // only trust a result whose full name contains every word that was typed — never a loose guess
    return hits.find(h => want.every(w => plain(h.name).includes(w))) ?? null
  } catch { return null }
}

export type ResolvedMatchup = { who?: Who; rest: string; notes: string[] }

/**
 * "Bryce Harper vs San Diego" → { who: { playerId, playerRole: 'bat', team: 'SD', teamRole: 'field' } }.
 * The club is read from the text; the player is looked up by name. Returns null when the text isn't a "X vs Y"
 * phrase or no real player is found (nothing is guessed — the search then runs as ordinary text).
 */
export async function resolveMatchup(text: string): Promise<ResolvedMatchup | null> {
  const mu = extractMatchup(text)
  if (!mu) return null
  if (mu.ambiguous) return { rest: mu.rest, notes: [`“${mu.ambiguous}” has two clubs — say Yankees, Mets, Cubs, White Sox, Dodgers or Angels`] }
  if (!mu.team) return null
  const words = mu.before.split(/\s+/).filter(Boolean).filter(w => !FILLER.has(w.toLowerCase()))
  const windows: string[] = []
  for (const n of [2, 3, 1]) {
    if (words.length >= n) { windows.push(words.slice(0, n).join(' ')); if (words.length > n) windows.push(words.slice(-n).join(' ')) }
  }
  for (const w of [...new Set(windows)]) {
    if (w.split(/\s+/).length < 2 && w.length < 4) continue
    const hit = await findPlayer(w)
    if (!hit) continue
    const rest = mu.rest.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ').replace(/\s+/g, ' ').trim()
    // a pitcher listed as a P is read as pitching against the club's hitters; everyone else as the batter
    const pitcher = hit.pos === 'P'
    return {
      rest,
      who: { playerId: hit.id, playerName: hit.name, playerRole: pitcher ? 'pitch' : 'bat', team: mu.team, teamRole: pitcher ? 'bat' : 'field' },
      notes: [],
    }
  }
  return null
}
