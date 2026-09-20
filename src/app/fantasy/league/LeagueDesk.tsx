'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import PlayerHeadshot from '@/components/fantasy/PlayerHeadshot'
import type {
  ActionKind,
  EspnImportedTeam,
  GradeResult,
  GradedPlayer,
  LeagueAction,
  LeaguePlatform,
  PlayerOutlook,
  RosterEntryIn,
} from '@/lib/fantasy-league'

const STORAGE_KEY = 'edge-fantasy-league-v1'
const PLATFORMS: LeaguePlatform[] = ['ESPN', 'Yahoo', 'Sleeper', 'CBS', 'DraftKings']

const ACTION_META: Record<ActionKind, { label: string; color: string; hint: string }> = {
  START:      { label: 'Start',      color: '#15803D', hint: 'Confirmed volume this week.' },
  SIT:        { label: 'Sit',        color: '#DC2626', hint: 'No start, or cooling vs baseline.' },
  PICKUP:     { label: 'Pick up',    color: '#D97706', hint: 'Signal ≥ 55 and under 40% ESPN owned — not on your roster.' },
  TRADE_HIGH: { label: 'Trade high', color: '#2563EB', hint: 'Risers already on your roster.' },
  BUY_LOW:    { label: 'Buy low',    color: '#7C3AED', hint: 'Cooling/falling and still ≥ 40% owned — someone in the league has them.' },
}

type StoredLeague = {
  name?: string
  platform: LeaguePlatform
  players: RosterEntryIn[]
  savedAt: string
}

type SearchHit = { id: number; fullName: string; primaryPosition: string }

function loadStored(): StoredLeague | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredLeague
    if (!parsed || !Array.isArray(parsed.players)) return null
    return parsed
  } catch {
    return null
  }
}

function saveStored(league: StoredLeague) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(league))
  } catch { /* quota */ }
}

const EMPTY_LEAGUE: StoredLeague = { platform: 'ESPN', players: [], savedAt: '' }
let snapshotRaw: string | null = null
let snapshot: StoredLeague = EMPTY_LEAGUE

function subscribeLeague(cb: () => void) {
  window.addEventListener('storage', cb)
  window.addEventListener('edge-fantasy-league', cb)
  return () => {
    window.removeEventListener('storage', cb)
    window.removeEventListener('edge-fantasy-league', cb)
  }
}

function getLeagueSnapshot(): StoredLeague {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === snapshotRaw) return snapshot
  snapshotRaw = raw
  snapshot = loadStored() ?? EMPTY_LEAGUE
  return snapshot
}

function writeLeague(next: StoredLeague) {
  saveStored(next)
  snapshotRaw = null
  window.dispatchEvent(new Event('edge-fantasy-league'))
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function ownLabel(n: number | null | undefined): string {
  return n == null ? '—' : `${Math.round(n)}%`
}

function ptsLabel(n: number | null | undefined): string {
  return n == null ? '—' : n.toFixed(1)
}

export default function LeagueDesk({ isPro }: { isPro: boolean }) {
  const stored = useSyncExternalStore(subscribeLeague, getLeagueSnapshot, () => EMPTY_LEAGUE)
  const platform = stored.platform
  const players = stored.players
  const setPlatform = (next: LeaguePlatform) => {
    writeLeague({ ...stored, platform: next, savedAt: new Date().toISOString() })
  }
  const setPlayers = (next: RosterEntryIn[] | ((prev: RosterEntryIn[]) => RosterEntryIn[])) => {
    const playersNext = typeof next === 'function' ? next(stored.players) : next
    writeLeague({ ...stored, players: playersNext, savedAt: new Date().toISOString() })
  }
  const [paste, setPaste] = useState('')
  const [espnId, setEspnId] = useState('')
  const [espnTeams, setEspnTeams] = useState<EspnImportedTeam[] | null>(null)
  const [espnError, setEspnError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [grade, setGrade] = useState<GradeResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [espnLoading, setEspnLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<ActionKind>('START')
  const [openId, setOpenId] = useState<number | null>(null)
  const [outlook, setOutlook] = useState<PlayerOutlook | null>(null)
  const [outlookLoading, setOutlookLoading] = useState(false)
  const gradeSeq = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lab/search?q=${encodeURIComponent(q)}`)
        const json = await res.json() as { people?: SearchHit[] }
        setHits((json.people ?? []).slice(0, 8))
      } catch {
        setHits([])
      }
    }, 220)
    return () => clearTimeout(t)
  }, [query])

  function addPlayer(entry: RosterEntryIn) {
    setPlayers(prev => {
      if (entry.mlbId && prev.some(p => p.mlbId === entry.mlbId)) return prev
      if (prev.some(p => p.name.toLowerCase() === entry.name.toLowerCase())) return prev
      if (prev.length >= 40) return prev
      return [...prev, entry]
    })
    setQuery('')
    setHits([])
  }

  function removePlayer(idx: number) {
    setPlayers(prev => prev.filter((_, i) => i !== idx))
  }

  const runGrade = useCallback(async (roster = players, plat = platform) => {
    if (roster.length === 0) return
    const seq = ++gradeSeq.current
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/mlb/fantasy-league', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: roster, platform: plat }),
      })
      const json = await res.json()
      if (seq !== gradeSeq.current) return
      if (!res.ok) {
        setError(json.error ?? 'Grade failed')
        return
      }
      setGrade(json as GradeResult)
    } catch {
      if (seq === gradeSeq.current) setError('Network error grading the roster.')
    } finally {
      if (seq === gradeSeq.current) setLoading(false)
    }
  }, [players, platform])

  useEffect(() => {
    if (players.length === 0) return
    const t = setTimeout(() => { void runGrade() }, 400)
    return () => clearTimeout(t)
  }, [players, platform, runGrade])

  const applyPaste = () => {
    if (!paste.trim()) return
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/mlb/fantasy-league', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: paste, platform }),
        })
        const json = await res.json()
        if (!res.ok) {
          setError(json.error ?? 'Could not read that paste')
          return
        }
        const result = json as GradeResult
        setGrade(result)
        setPlayers(result.players.map(p => ({ name: p.name, mlbId: p.mlbId, slot: p.slot })))
        setPaste('')
      } catch {
        setError('Network error reading the paste.')
      } finally {
        setLoading(false)
      }
    })()
  }

  const importEspn = () => {
    const id = Number(espnId.replace(/[^\d]/g, ''))
    if (!id) {
      setEspnError('Paste the numeric league ID from the ESPN league URL.')
      return
    }
    setEspnLoading(true)
    setEspnError(null)
    setEspnTeams(null)
    void (async () => {
      try {
        const res = await fetch(`/api/mlb/fantasy-league/espn?leagueId=${id}`)
        const json = await res.json()
        if (!res.ok) {
          setEspnError(json.error ?? 'ESPN import failed')
          return
        }
        setEspnTeams(json.teams as EspnImportedTeam[])
      } catch {
        setEspnError('Network error talking to ESPN.')
      } finally {
        setEspnLoading(false)
      }
    })()
  }

  const pickEspnTeam = (team: EspnImportedTeam) => {
    setPlayers(team.players.map(p => ({ name: p.name, mlbId: p.mlbId, slot: p.slot })))
    setEspnTeams(null)
  }

  const openOutlook = (mlbId: number) => {
    if (openId === mlbId) {
      setOpenId(null)
      return
    }
    setOpenId(mlbId)
    if (!isPro) return
    setOutlook(null)
    setOutlookLoading(true)
    void (async () => {
      try {
        const res = await fetch(`/api/mlb/fantasy-league/outlook?playerId=${mlbId}`)
        const json = await res.json()
        if (res.ok) setOutlook(json as PlayerOutlook)
      } finally {
        setOutlookLoading(false)
      }
    })()
  }

  const g = grade?.grade
  const actionList: LeagueAction[] = grade?.actions[tab] ?? []

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6">
        <div className="text-[#FF5722] text-[10px] font-mono uppercase tracking-widest font-bold mb-1">
          ⊕ The Edge · My League
          {isPro && <span className="ml-2 text-emerald-700">· Pro</span>}
        </div>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h1
            className="text-4xl sm:text-5xl font-black tracking-tight leading-none"
            style={{ fontFamily: 'Fraunces, serif' }}
          >
            Grade your team<span className="text-[#FF5722]">.</span>
          </h1>
          <p className="font-serif italic text-stone-500 text-[13px] max-w-md">
            Paste a roster or a public ESPN league. Every number is real season rate × remaining scheduled games — not a made-up projection.
          </p>
        </div>
      </div>

      {/* Import */}
      <div className="grid lg:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-stone-200 p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#FF5722] font-bold mb-2">1. Paste roster</div>
          <textarea
            value={paste}
            onChange={e => setPaste(e.target.value)}
            placeholder={'Aaron Judge\nShohei Ohtani\nYoshinobu Yamamoto\n…'}
            className="w-full h-28 text-[13px] font-mono border border-stone-200 p-2 bg-[#FAF8F3] outline-none focus:border-stone-900 resize-none"
          />
          <button
            type="button"
            onClick={applyPaste}
            disabled={!paste.trim() || loading}
            className="mt-2 font-mono text-[10px] uppercase tracking-widest bg-[#1A1A1A] text-white px-3 py-2 hover:bg-stone-800 disabled:opacity-40"
          >
            Read paste →
          </button>
        </div>

        <div className="bg-white border border-stone-200 p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#FF5722] font-bold mb-2">2. Search & add</div>
          <input
            value={query}
            onChange={e => {
              const v = e.target.value
              setQuery(v)
              if (v.trim().length < 2) setHits([])
            }}
            placeholder="Type a player…"
            className="w-full text-[13px] border border-stone-200 px-2 py-2 bg-[#FAF8F3] outline-none focus:border-stone-900 font-serif"
          />
          {hits.length > 0 && (
            <ul className="mt-2 border border-stone-200 divide-y divide-stone-100 max-h-40 overflow-auto">
              {hits.map(h => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => addPlayer({ name: h.fullName, mlbId: h.id, slot: h.primaryPosition })}
                    className="w-full text-left px-2 py-1.5 hover:bg-[#F5F1E8] flex items-center justify-between gap-2"
                  >
                    <span className="font-serif text-[13px]">{h.fullName}</span>
                    <span className="font-mono text-[10px] text-stone-400">{h.primaryPosition}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 font-serif italic text-[11px] text-stone-400">
            Roster lives in this browser until you clear it.
          </p>
        </div>

        <div className="bg-white border border-stone-200 p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#FF5722] font-bold mb-2">3. ESPN league ID</div>
          <div className="flex gap-2">
            <input
              value={espnId}
              onChange={e => setEspnId(e.target.value)}
              placeholder="e.g. 12345678"
              className="flex-1 text-[13px] border border-stone-200 px-2 py-2 bg-[#FAF8F3] outline-none focus:border-stone-900 font-mono"
            />
            <button
              type="button"
              onClick={importEspn}
              disabled={espnLoading}
              className="font-mono text-[10px] uppercase tracking-widest bg-[#1A1A1A] text-white px-3 py-2 hover:bg-stone-800 disabled:opacity-40"
            >
              {espnLoading ? '…' : 'Fetch'}
            </button>
          </div>
          <p className="mt-2 font-serif italic text-[11px] text-stone-400 leading-snug">
            Public ESPN leagues only. Private leagues 401 — paste the roster instead. Yahoo/Sleeper: paste.
          </p>
          {espnError && <p className="mt-2 text-[12px] text-red-700 font-serif">{espnError}</p>}
          {espnTeams && (
            <ul className="mt-2 border border-stone-200 divide-y divide-stone-100 max-h-40 overflow-auto">
              {espnTeams.map(t => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => pickEspnTeam(t)}
                    className="w-full text-left px-2 py-1.5 hover:bg-[#F5F1E8] flex items-center justify-between"
                  >
                    <span className="font-serif text-[13px]">{t.name}</span>
                    <span className="font-mono text-[10px] text-stone-400">{t.players.length}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Platform + roster chips */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="font-mono text-[10px] uppercase tracking-widest text-stone-400">Scoring</span>
        {PLATFORMS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            className={`font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 border ${
              platform === p ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'border-stone-300 text-stone-500 hover:border-stone-900'
            }`}
          >
            {p}
          </button>
        ))}
        <span className="ml-auto font-mono text-[10px] text-stone-400">
          {players.length}/40 rostered
        </span>
        {players.length > 0 && (
          <button
            type="button"
            onClick={() => { setPlayers([]); setGrade(null); setError(null) }}
            className="font-mono text-[10px] uppercase tracking-widest text-red-700 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {players.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {players.map((p, i) => (
            <button
              key={`${p.mlbId ?? p.name}-${i}`}
              type="button"
              onClick={() => removePlayer(i)}
              className="font-mono text-[10px] px-2 py-1 bg-white border border-stone-200 hover:border-red-400 hover:text-red-700"
              title="Remove"
            >
              {p.name} ×
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 border border-red-200 bg-red-50 px-3 py-2 font-serif text-[13px] text-red-800">{error}</div>
      )}

      {players.length === 0 && (
        <div className="border border-dashed border-stone-300 bg-white px-6 py-16 text-center mb-8">
          <div className="font-serif text-xl mb-2">No roster yet</div>
          <p className="font-serif italic text-stone-500 text-[14px] max-w-lg mx-auto">
            Upload the league, then we grade it against real ESPN ownership, remaining scheduled games, and today&apos;s Edge start/sit slate.
          </p>
        </div>
      )}

      {loading && players.length > 0 && !grade && (
        <div className="font-mono text-[11px] uppercase tracking-widest text-stone-400 mb-6">Grading roster…</div>
      )}

      {g && grade && players.length > 0 && (
        <>
          {/* Grade hero */}
          <div className="grid md:grid-cols-[160px_1fr] border border-stone-900 mb-6 bg-[#1A1A1A] text-white">
            <div className="p-5 border-b md:border-b-0 md:border-r border-white/10 flex flex-col justify-center">
              <div className="font-mono text-[9px] uppercase tracking-widest text-white/50">Team grade</div>
              <div className="font-black text-[64px] leading-none text-[#FDE047]" style={{ fontFamily: 'Fraunces, serif' }}>
                {g.letter}
              </div>
              <div className="font-mono text-[11px] text-white/60 mt-1">{g.score}/100</div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <Stat label="Week pts" value={ptsLabel(g.weekPoints)} sub={`${fmtDate(grade.weekStart)}–${fmtDate(grade.weekEnd)}`} />
                <Stat
                  label="ROS pts"
                  value={isPro ? ptsLabel(g.rosPoints) : 'Pro'}
                  sub={isPro ? (grade.rosThrough ? `through ${fmtDate(grade.rosThrough)}` : 'no remaining games') : 'Unlock rest-of-season'}
                  muted={!isPro}
                />
                <Stat label="ESPN own" value={ownLabel(g.meanOwnership)} sub="mean of matched players" />
                <Stat label="Matched" value={String(g.nRostered)} sub={g.nUnmatched ? `${g.nUnmatched} unmatched` : 'all names hit'} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Meter label="Production" value={g.production} hint="Avg expected week pts / 12" />
                <Meter label="Volume" value={g.volume} hint="% of roster with real games/starts this week" />
                <Meter label="Value" value={g.value} hint="Mean signal − ownership on today's slate" />
              </div>
            </div>
          </div>

          <p className="font-serif italic text-[12px] text-stone-500 mb-6 max-w-3xl">{grade.methodology}</p>

          {grade.unmatched.length > 0 && (
            <div className="mb-6 border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-amber-800 font-bold mb-1">Unmatched — not guessed</div>
              <p className="font-serif text-[13px] text-amber-900">
                {grade.unmatched.map(u => u.name).join(' · ')}. Search and add the right MLB player.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="mb-8">
            <div className="font-mono text-[10px] uppercase tracking-widest text-[#FF5722] font-bold mb-3">§ This week&apos;s calls</div>
            <div className="flex flex-wrap gap-0 border-b border-stone-200 mb-3">
              {(Object.keys(ACTION_META) as ActionKind[]).map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={`relative px-3 py-2 font-mono text-[10px] uppercase tracking-widest ${
                    tab === k ? 'text-stone-900 font-bold' : 'text-stone-400 hover:text-stone-700'
                  }`}
                >
                  {ACTION_META[k].label}
                  <span className="ml-1 tabular-nums">{grade.actions[k].length}</span>
                  {tab === k && <span className="absolute bottom-0 left-3 right-3 h-[2px]" style={{ background: ACTION_META[k].color }} />}
                </button>
              ))}
            </div>
            <p className="font-serif italic text-[12px] text-stone-500 mb-3">{ACTION_META[tab].hint}</p>
            {actionList.length === 0 ? (
              <div className="border border-dashed border-stone-300 px-4 py-6 text-center font-serif italic text-stone-400 text-[13px]">
                Nothing in this bucket for this roster and today&apos;s slate.
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {actionList.map(a => (
                  <div key={`${a.kind}-${a.mlbId ?? a.name}`} className="bg-white border border-stone-200 p-3 flex gap-3">
                    {a.mlbId ? <PlayerHeadshot playerId={a.mlbId} size={40} className="w-10 h-10 object-cover shrink-0" /> : <div className="w-10 h-10 bg-stone-100 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-serif font-bold text-[14px] truncate">
                          {a.mlbId ? <Link href={`/mlb/players/${a.mlbId}`} className="hover:text-[#FF5722]">{a.name}</Link> : a.name}
                        </div>
                        <span className="font-mono text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5" style={{ color: ACTION_META[a.kind].color, background: ACTION_META[a.kind].color + '18' }}>
                          {ACTION_META[a.kind].label}
                        </span>
                      </div>
                      <p className="font-serif italic text-[12px] text-stone-600 leading-snug">{a.reason}</p>
                      <div className="font-mono text-[10px] text-stone-400 mt-1">
                        Own {ownLabel(a.ownership)}
                        {a.signal != null && ` · Signal ${Math.round(a.signal)}`}
                        {a.weekPoints != null && ` · ${a.weekPoints.toFixed(1)} wk pts`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Roster table */}
          <div className="mb-8">
            <div className="font-mono text-[10px] uppercase tracking-widest text-[#FF5722] font-bold mb-3">§ Roster · expected score</div>
            <div className="overflow-x-auto border border-stone-200 bg-white">
              <table className="w-full text-left">
                <thead>
                  <tr className="font-mono text-[9px] uppercase tracking-widest text-stone-400 border-b border-stone-200">
                    <th className="px-3 py-2 font-medium">Player</th>
                    <th className="px-3 py-2 font-medium">Pos</th>
                    <th className="px-3 py-2 font-medium text-right">Own</th>
                    <th className="px-3 py-2 font-medium text-right">Week</th>
                    <th className="px-3 py-2 font-medium text-right">ROS</th>
                    <th className="px-3 py-2 font-medium text-right">G / GS</th>
                    <th className="px-3 py-2 font-medium">Call</th>
                    <th className="px-3 py-2 font-medium">Next</th>
                  </tr>
                </thead>
                <tbody>
                  {grade.players.map(p => (
                    <PlayerRow
                      key={p.mlbId}
                      player={p}
                      isPro={isPro}
                      open={openId === p.mlbId}
                      outlook={openId === p.mlbId ? outlook : null}
                      outlookLoading={openId === p.mlbId && outlookLoading}
                      onToggle={() => openOutlook(p.mlbId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pro upsell */}
          {!isPro && (
            <section className="bg-[#1A1A1A] p-6 sm:p-8">
              <div className="font-mono text-[10px] uppercase tracking-widest text-[#FDE047] font-bold mb-2">
                ⊕ Pro · rest-of-season, parks, announced pitchers
              </div>
              <h2 className="font-serif text-2xl text-white mb-3">What you&apos;re looking at is this week. Pro opens the rest of the season.</h2>
              <ul className="grid sm:grid-cols-2 gap-3 text-[13px] font-serif text-stone-300 mb-5">
                <li className="border border-white/10 p-3">
                  <div className="text-[#FDE047] font-mono text-[9px] uppercase tracking-widest mb-1">Rest of season</div>
                  Remaining regular-season games × real 2026 rates. Starters only where they&apos;re the announced probable.
                </li>
                <li className="border border-white/10 p-3">
                  <div className="text-[#FDE047] font-mono text-[9px] uppercase tracking-widest mb-1">Where they hit / pitch</div>
                  Real season park splits at the remaining scheduled venues — expand any row.
                </li>
                <li className="border border-white/10 p-3">
                  <div className="text-[#FDE047] font-mono text-[9px] uppercase tracking-widest mb-1">Vs announced pitchers</div>
                  Career H2H against this week&apos;s confirmed probables. Blank if they&apos;ve never met — we don&apos;t fake a sample.
                </li>
                <li className="border border-white/10 p-3">
                  <div className="text-[#FDE047] font-mono text-[9px] uppercase tracking-widest mb-1">Keeper / contracts</div>
                  Not live. MLB does not publish free-agent year on the Stats API. We will not invent expiry years.
                </li>
              </ul>
              <Link
                href="/pricing"
                className="inline-block font-mono text-[11px] uppercase tracking-widest bg-[#FDE047] text-stone-900 px-5 py-3 font-bold hover:bg-yellow-200"
              >
                Unlock Pro · £4/mo →
              </Link>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, sub, muted }: { label: string; value: string; sub: string; muted?: boolean }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-widest text-white/45">{label}</div>
      <div className={`font-mono text-2xl font-bold tabular-nums leading-none mt-1 ${muted ? 'text-[#FDE047]' : 'text-white'}`}>{value}</div>
      <div className="font-serif italic text-[11px] text-white/40 mt-1">{sub}</div>
    </div>
  )
}

function Meter({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  const v = value
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[9px] uppercase tracking-widest text-white/50">{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-white/80">{v == null ? '—' : v}</span>
      </div>
      <div className="h-1.5 bg-white/10">
        {v != null && <div className="h-full bg-[#FF5722]" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />}
      </div>
      <div className="font-serif italic text-[10px] text-white/35 mt-1">{hint}</div>
    </div>
  )
}

function PlayerRow({
  player: p,
  isPro,
  open,
  outlook,
  outlookLoading,
  onToggle,
}: {
  player: GradedPlayer
  isPro: boolean
  open: boolean
  outlook: PlayerOutlook | null
  outlookLoading: boolean
  onToggle: () => void
}) {
  const callColor = p.action ? ACTION_META[p.action].color : '#78716C'
  return (
    <>
      <tr className="border-b border-stone-100 hover:bg-[#FAF8F3]">
        <td className="px-3 py-2">
          <button type="button" onClick={onToggle} className="flex items-center gap-2 text-left">
            <PlayerHeadshot playerId={p.mlbId} size={32} className="w-8 h-8 object-cover shrink-0" />
            <span>
              <span className="block font-serif font-bold text-[13px] leading-tight">{p.name}</span>
              <span className="block font-mono text-[10px] text-stone-400">{p.teamAbbr ?? '—'}</span>
            </span>
          </button>
        </td>
        <td className="px-3 py-2 font-mono text-[11px]">{p.slot || p.mlbPos}</td>
        <td className="px-3 py-2 font-mono text-[12px] tabular-nums text-right">{ownLabel(p.ownership)}</td>
        <td className="px-3 py-2 font-mono text-[12px] tabular-nums text-right font-bold">{ptsLabel(p.weekPoints)}</td>
        <td className="px-3 py-2 font-mono text-[12px] tabular-nums text-right">
          {isPro ? ptsLabel(p.rosPoints) : <Link href="/pricing" className="text-[#D97706]">Pro</Link>}
        </td>
        <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-right text-stone-500">
          {p.role === 'pitcher' ? `${p.confirmedStartsWeek} gs` : `${p.weekGames} g`}
        </td>
        <td className="px-3 py-2">
          {p.action && (
            <span className="font-mono text-[9px] uppercase tracking-widest font-bold" style={{ color: callColor }}>
              {ACTION_META[p.action].label}
            </span>
          )}
        </td>
        <td className="px-3 py-2 font-serif italic text-[12px] text-stone-600 max-w-[180px] truncate">
          {p.role === 'pitcher'
            ? (p.nextOpponent ? p.nextOpponent : '—')
            : p.nextProbablePitcher
              ? `vs ${p.nextProbablePitcher}`
              : p.nextOpponent
                ? `vs ${p.nextOpponent}`
                : '—'}
        </td>
      </tr>
      {open && (
        <tr className="bg-[#F5F1E8]">
          <td colSpan={8} className="px-4 py-4">
            {!isPro ? (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <p className="font-serif text-[13px] text-stone-600">
                  Parks, announced-pitcher H2H, and rest-of-season volume are Pro.
                </p>
                <Link href="/pricing" className="font-mono text-[10px] uppercase tracking-widest bg-[#1A1A1A] text-white px-3 py-2">
                  Unlock Pro →
                </Link>
              </div>
            ) : outlookLoading ? (
              <div className="font-mono text-[10px] uppercase tracking-widest text-stone-400">Loading remaining slate…</div>
            ) : outlook ? (
              <OutlookBlock outlook={outlook} />
            ) : (
              <div className="font-serif italic text-stone-400 text-[13px]">No remaining regular-season games on the schedule.</div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function OutlookBlock({ outlook }: { outlook: PlayerOutlook }) {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div>
        <div className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] font-bold mb-2">Remaining parks</div>
        {outlook.parks.length === 0 ? (
          <p className="font-serif italic text-[12px] text-stone-500">No remaining venues.</p>
        ) : (
          <ul className="space-y-1.5">
            {outlook.parks.map(p => (
              <li key={`${p.venueId}-${p.venueName}`} className="text-[12px]">
                <div className="font-serif font-bold">{p.venueName} · {p.remaining}</div>
                <div className="font-mono text-[10px] text-stone-500">{p.note}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] font-bold mb-2">
          {outlook.role === 'pitcher' ? 'Announced starts' : 'Vs announced pitchers'}
        </div>
        {outlook.role === 'pitcher' ? (
          outlook.confirmedStarts.length === 0 ? (
            <p className="font-serif italic text-[12px] text-stone-500">No confirmed probable starts remaining — rotation not guessed.</p>
          ) : (
            <ul className="space-y-1.5">
              {outlook.confirmedStarts.map(g => (
                <li key={g.gamePk} className="text-[12px] font-serif">
                  {fmtDate(g.date)} {g.isHome ? 'vs' : '@'} {g.opponentName}
                </li>
              ))}
            </ul>
          )
        ) : outlook.vsAnnouncedPitchers.length === 0 ? (
          <p className="font-serif italic text-[12px] text-stone-500">No probable pitchers announced yet for remaining games.</p>
        ) : (
          <ul className="space-y-1.5">
            {outlook.vsAnnouncedPitchers.map(v => (
              <li key={v.pitcherId} className="text-[12px]">
                <div className="font-serif font-bold">{v.pitcherName} · {fmtDate(v.date)}</div>
                <div className="font-mono text-[10px] text-stone-500">
                  {v.sample === 'none' || !v.h2h
                    ? 'No career meetings'
                    : `${v.h2h.ab} AB · ${v.h2h.avg}/${v.h2h.obp}/${v.h2h.slg}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] font-bold mb-2">Contracts / keepers</div>
        <p className="font-serif italic text-[12px] text-stone-600 leading-snug">{outlook.contractNote}</p>
        {outlook.vsAnnouncedOpponents.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {outlook.vsAnnouncedOpponents.map(o => (
              <li key={o.opponentId} className="text-[12px]">
                <div className="font-serif font-bold">{o.opponentName}</div>
                <div className="font-mono text-[10px] text-stone-500">
                  {o.record
                    ? `${o.record.wins}-${o.record.losses} (${o.record.starts} GS)${o.record.era != null ? ` · ${o.record.era.toFixed(2)} ERA` : ''}`
                    : 'No season starts vs this club'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
