// src/components/StatsSearchPage.tsx
//
// /mlb/stats — search any real stat this app has access to, instantly.
// The catalog (STAT_CATALOG) is static data bundled client-side so
// filtering-as-you-type is instant with zero network calls; picking a
// stat then hits /api/mlb/stats-search once for its real leaderboard
// (MLB Stats API for box-score/fielding stats, Baseball Savant's bulk
// leaderboards for the site's Statcast metrics — see src/lib/stats-search.ts).
//
// Typing a player's name instead ("Bryce Harper") switches into player
// mode: pick a real stat + count situation + pitch type and see that
// player's real number for exactly that slice ("2-strike hits off
// sliders"), computed from their real season pitch log
// (src/lib/pitch-splits.ts) — not a league leaderboard.

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { STAT_CATALOG, searchStats, PITCH_TYPES, type StatEntry, type LeaderboardRow, type PitchTypeCode } from '@/lib/stats-search'
import {
  COUNT_SITUATIONS, SITUATIONS, INNING_RANGES, RBI_OPTIONS, BATTER_SPLIT_STATS,
  type CountSituationKey, type SituationKey, type InningKey, type RbiKey, type SplitStatKey,
} from '@/lib/pitch-splits'

const ORANGE = '#FF5722'
const GROUP_ORDER: StatEntry['group'][] = ['Batting', 'Pitching', 'Fielding', 'Baserunning']

const POPULAR_KEYS = ['avg', 'hr', 'era', 'kPitching', 'xwoba', 'batSpeed', 'barrelRate', 'sprintSpeed', 'oaa', 'whip']

type PlayerResult = { id: number; fullName: string; primaryPosition: string }

function mlbHeadshot(id: number | string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}

// Best-effort read of the typed query so picking "Bryce Harper" out of
// "Bryce Harper 2 Strike hits" also carries the "2 strike" + "hits" intent
// into the split explorer instead of dropping it on the floor.
// MLB's real /people/search endpoint matches names well but returns
// nothing for a whole sentence (curl-verified: "Bryce Harper 2 Strike
// hits" → 0 results, "Bryce Harper" → 1) — so a query that carries
// situational words after a real name needs the name PEELED OFF first.
// Stops at the first number or recognized situational/stat word, on the
// reasonable bet that a real player's name doesn't contain either.
const QUERY_STOPWORDS = new Set([
  'strike', 'strikes', 'ball', 'balls', 'pitch', 'pitches', 'count', 'hit', 'hits',
  'home', 'run', 'runs', 'walk', 'walks', 'whiff', 'whiffs', 'strikeout', 'strikeouts',
  'vs', 'against', 'off', 'with', 'in', 'on', 'first', 'full', 'ahead', 'behind', 'even',
  'changeup', 'slider', 'curveball', 'fastball', 'sinker', 'cutter', 'splitter', 'sweeper', 'slurve',
  'avg', 'era', 'obp', 'slg', 'ops', 'whip',
])
function extractNameCandidate(query: string): string {
  const words = query.trim().split(/\s+/)
  const nameWords: string[] = []
  for (const w of words) {
    if (/\d/.test(w) || QUERY_STOPWORDS.has(w.toLowerCase())) break
    nameWords.push(w)
  }
  return nameWords.join(' ')
}

function guessStatFromQuery(q: string): SplitStatKey {
  const s = q.toLowerCase()
  if (/home ?run|\bhr\b/.test(s)) return 'homeRuns'
  if (/strikeout|\bk'?s?\b/.test(s)) return 'strikeouts'
  if (/walk|\bbb\b/.test(s)) return 'walks'
  if (/whiff|swing.?and.?miss/.test(s)) return 'whiffs'
  if (/hard.?hit/.test(s)) return 'hardHitBalls'
  return 'hits'
}
function guessCountFromQuery(q: string): CountSituationKey {
  const s = q.toLowerCase()
  if (/\b0-2\b/.test(s)) return 'oh2'
  if (/\b1-2\b/.test(s)) return 'one2'
  if (/full count|\b3-2\b/.test(s)) return 'full'
  if (/2 ?strike/.test(s)) return 'twoStrikes'
  if (/3 ?ball/.test(s)) return 'threeBalls'
  if (/first pitch|0-0/.test(s)) return 'firstPitch'
  if (/ahead/.test(s)) return 'ahead'
  if (/behind/.test(s)) return 'behind'
  return 'any'
}

function GroupBadge({ group }: { group: StatEntry['group'] }) {
  const colors: Record<StatEntry['group'], string> = {
    Batting: '#185FA5', Pitching: ORANGE, Fielding: '#8B5CF6', Baserunning: '#059669',
  }
  return (
    <span
      className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0"
      style={{ color: '#fff', background: colors[group] }}
    >
      {group}
    </span>
  )
}

function StatCard({ entry, onClick, active }: { entry: StatEntry; onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-lg border px-3 py-2.5 transition hover:border-[#FF5722] w-full"
      style={{ borderColor: active ? '#FF5722' : '#E8E4DC', background: active ? 'rgba(255,87,34,0.05)' : '#fff' }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[12.5px] font-bold text-[#1A1A1A]">{entry.fullLabel}</span>
        {entry.tag === 'Statcast' && (
          <span className="text-[7.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 bg-[#1A1A1A] text-white">Statcast</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <GroupBadge group={entry.group} />
        <span className="text-[9.5px] font-mono text-[#8A8577]">{entry.label}</span>
        {entry.pitchSplit && <span className="text-[8px] text-[#B5B0A3]">· refinable by pitch</span>}
      </div>
    </button>
  )
}

function PlayerCard({ p, onClick, active }: { p: PlayerResult; onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-lg border px-3 py-2.5 transition hover:border-[#FF5722] w-full flex items-center gap-2.5"
      style={{ borderColor: active ? '#FF5722' : '#E8E4DC', background: active ? 'rgba(255,87,34,0.05)' : '#fff' }}
    >
      <img src={mlbHeadshot(p.id)} alt="" width={28} height={28} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      <div className="min-w-0">
        <div className="text-[12.5px] font-bold text-[#1A1A1A] truncate">{p.fullName}</div>
        <div className="text-[9.5px] font-mono text-[#8A8577]">{p.primaryPosition || 'MLB'} · situational splits</div>
      </div>
    </button>
  )
}

function PitchTypeRefine({ value, onChange }: { value: PitchTypeCode | 'all'; onChange: (v: PitchTypeCode | 'all') => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-[#F0EFEC]">
      <button
        onClick={() => onChange('all')}
        className="text-[9.5px] font-bold px-2 py-1 rounded-full border transition"
        style={{ borderColor: value === 'all' ? '#1A1A1A' : '#DEDACE', background: value === 'all' ? '#1A1A1A' : '#fff', color: value === 'all' ? '#fff' : '#1A1A1A' }}
      >
        All pitches
      </button>
      {PITCH_TYPES.map(pt => (
        <button
          key={pt.code}
          onClick={() => onChange(pt.code)}
          className="text-[9.5px] font-bold px-2 py-1 rounded-full border transition"
          style={{ borderColor: value === pt.code ? '#1A1A1A' : '#DEDACE', background: value === pt.code ? '#1A1A1A' : '#fff', color: value === pt.code ? '#fff' : '#1A1A1A' }}
        >
          {pt.label}
        </button>
      ))}
    </div>
  )
}

function LeaderboardResults({ entry, pitchType }: { entry: StatEntry; pitchType: PitchTypeCode | 'all' }) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const pt = pitchType !== 'all' ? `&pitchType=${pitchType}` : ''
    fetch(`/api/mlb/stats-search?key=${encodeURIComponent(entry.key)}&limit=15${pt}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setRows(data.rows ?? []) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [entry.key, pitchType])

  if (failed) return <div className="text-[11px] text-[#8A8577] text-center py-10">Couldn&apos;t load this leaderboard right now.</div>
  if (rows === null) return <div className="text-[11px] text-[#8A8577] text-center py-10">Loading real leaderboard…</div>
  if (rows.length === 0) return <div className="text-[11px] text-[#8A8577] text-center py-10">No qualifying players yet this season.</div>

  return (
    <div>
      {rows.map(r => (
        <div key={r.personId} className="flex items-center gap-3 py-2 border-b border-[#F0EFEC] last:border-0">
          <span className="text-[11px] font-mono text-[#B5B0A3] w-5 text-right tabular-nums shrink-0">{r.rank}</span>
          <img src={r.headshot} alt="" width={26} height={26} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] font-bold text-[#1A1A1A] truncate">{r.name}</div>
            {r.teamAbbr && <div className="text-[9px] text-[#8A8577] uppercase tracking-wide">{r.teamAbbr}</div>}
          </div>
          <span className="text-[13px] font-bold tabular-nums shrink-0" style={{ color: ORANGE }}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

function LeaderboardPanel({ entry }: { entry: StatEntry }) {
  const [pitchType, setPitchType] = useState<PitchTypeCode | 'all'>('all')

  return (
    <div className="rounded-lg border border-[#E8E4DC] bg-white p-4">
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="text-[15px] font-serif font-bold text-[#1A1A1A]">{entry.fullLabel}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <GroupBadge group={entry.group} />
            <span className="text-[9.5px] font-mono text-[#8A8577] uppercase tracking-wide">{entry.tag} · {entry.sortDesc ? 'Highest first' : 'Lowest first'}</span>
          </div>
        </div>
      </div>

      {entry.pitchSplit && <PitchTypeRefine value={pitchType} onChange={setPitchType} />}

      <div className="mt-3">
        {/* Keyed by pitch type so switching the refine chip remounts fresh
            (rows reset to the loading state naturally) instead of reusing
            the instance and resetting state imperatively in an effect. */}
        <LeaderboardResults key={pitchType} entry={entry} pitchType={pitchType} />
      </div>
    </div>
  )
}

type Filters = { stat: SplitStatKey; count: CountSituationKey; situation: SituationKey; inning: InningKey; pitchType: PitchTypeCode | 'all'; rbi: RbiKey }

function filterParams(f: Filters): string {
  const params = new URLSearchParams({ stat: f.stat, count: f.count, situation: f.situation, inning: f.inning, rbi: f.rbi })
  if (f.pitchType !== 'all') params.set('pitchType', f.pitchType)
  return params.toString()
}

function describeFilters(f: Filters): string {
  const parts = [
    COUNT_SITUATIONS.find(c => c.key === f.count)?.label,
    SITUATIONS.find(s => s.key === f.situation)?.label,
    INNING_RANGES.find(i => i.key === f.inning)?.label,
    RBI_OPTIONS.find(r => r.key === f.rbi)?.label,
    f.pitchType === 'all' ? null : PITCH_TYPES.find(p => p.code === f.pitchType)?.label,
  ].filter((p): p is string => !!p && p !== 'Any count' && p !== 'Any situation' && p !== 'Any inning' && p !== 'Any play')
  return parts.length > 0 ? parts.join(', ').toLowerCase() : 'any situation'
}

function FilterSelectors({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
      <select value={filters.stat} onChange={e => onChange({ ...filters, stat: e.target.value as SplitStatKey })} className="text-[11.5px] font-bold text-[#1A1A1A] bg-white border border-[#DEDACE] rounded-full px-3 py-2 cursor-pointer">
        {BATTER_SPLIT_STATS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <select value={filters.pitchType} onChange={e => onChange({ ...filters, pitchType: e.target.value as PitchTypeCode | 'all' })} className="text-[11.5px] font-bold text-[#1A1A1A] bg-white border border-[#DEDACE] rounded-full px-3 py-2 cursor-pointer">
        <option value="all">Any pitch type</option>
        {PITCH_TYPES.map(pt => <option key={pt.code} value={pt.code}>{pt.label}</option>)}
      </select>
      <select value={filters.count} onChange={e => onChange({ ...filters, count: e.target.value as CountSituationKey })} className="text-[11.5px] font-bold text-[#1A1A1A] bg-white border border-[#DEDACE] rounded-full px-3 py-2 cursor-pointer">
        {COUNT_SITUATIONS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      <select value={filters.situation} onChange={e => onChange({ ...filters, situation: e.target.value as SituationKey })} className="text-[11.5px] font-bold text-[#1A1A1A] bg-white border border-[#DEDACE] rounded-full px-3 py-2 cursor-pointer">
        {SITUATIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <select value={filters.inning} onChange={e => onChange({ ...filters, inning: e.target.value as InningKey })} className="text-[11.5px] font-bold text-[#1A1A1A] bg-white border border-[#DEDACE] rounded-full px-3 py-2 cursor-pointer">
        {INNING_RANGES.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
      </select>
      <select value={filters.rbi} onChange={e => onChange({ ...filters, rbi: e.target.value as RbiKey })} className="text-[11.5px] font-bold text-[#1A1A1A] bg-white border border-[#DEDACE] rounded-full px-3 py-2 cursor-pointer">
        {RBI_OPTIONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
      </select>
    </div>
  )
}

function ResultBox({ playerId, mode, filters, label }: { playerId: number; mode: 'player' | 'team'; filters: Filters; label?: string }) {
  const [result, setResult] = useState<{ value: number; sampleSize: number } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams(filterParams(filters))
    params.set('playerId', String(playerId))
    if (mode === 'team') params.set('mode', 'team')
    fetch(`/api/mlb/pitch-splits?${params}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setResult(mode === 'team' ? data.team : data) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [playerId, mode, filters])

  const statLabel = BATTER_SPLIT_STATS.find(s => s.key === filters.stat)?.label ?? filters.stat

  if (failed) return <div className="text-[11px] text-[#8A8577] py-4">Couldn&apos;t load this right now.</div>
  if (result === null) return <div className="text-[11px] text-[#8A8577] py-4">Loading…</div>

  return (
    <>
      {label && <div className="text-[9px] font-bold uppercase tracking-wide text-[#8A8577] mb-1">{label}</div>}
      <div className="text-[32px] font-black leading-none" style={{ color: ORANGE }}>{result.value}</div>
      <div className="text-[10px] text-[#8A8577] mt-1.5 leading-snug">{statLabel} — {describeFilters(filters)}</div>
      <div className="text-[8.5px] font-mono text-[#B5B0A3] mt-1 uppercase tracking-wide">{result.sampleSize} qualifying pitches</div>
    </>
  )
}

type TeamPlayerSplit = { batterId: number; batterName: string; value: number; sampleSize: number }

function TeamBreakdownBox({ playerId, filters }: { playerId: number; filters: Filters }) {
  const [data, setData] = useState<{ team: { value: number; sampleSize: number }; players: TeamPlayerSplit[]; teamName?: string } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams(filterParams(filters))
    params.set('playerId', String(playerId))
    params.set('mode', 'team')
    fetch(`/api/mlb/pitch-splits?${params}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [playerId, filters])

  const statLabel = BATTER_SPLIT_STATS.find(s => s.key === filters.stat)?.label ?? filters.stat

  if (failed) return <div className="text-[11px] text-[#8A8577] py-6 text-center">Couldn&apos;t load the team breakdown right now.</div>
  if (data === null) return <div className="text-[11px] text-[#8A8577] py-6 text-center">Loading real team-wide pitch log…</div>

  return (
    <div>
      <div className="rounded-lg bg-[#FAF8F3] p-4 text-center mb-3">
        <div className="text-[9px] font-bold uppercase tracking-wide text-[#8A8577] mb-1">{data.teamName ?? 'Team'} total</div>
        <div className="text-[32px] font-black leading-none" style={{ color: ORANGE }}>{data.team.value}</div>
        <div className="text-[10px] text-[#8A8577] mt-1.5 leading-snug">{statLabel} — {describeFilters(filters)}</div>
        <div className="text-[8.5px] font-mono text-[#B5B0A3] mt-1 uppercase tracking-wide">{data.team.sampleSize} qualifying pitches</div>
      </div>
      {data.players.length === 0 ? (
        <div className="text-[11px] text-[#8A8577] py-4 text-center">No qualifying players for this slice.</div>
      ) : (
        <div>
          {data.players.map((p, i) => (
            <div key={p.batterId} className="flex items-center gap-3 py-1.5 border-b border-[#F0EFEC] last:border-0">
              <span className="text-[10px] font-mono text-[#B5B0A3] w-4 text-right tabular-nums shrink-0">{i + 1}</span>
              <img src={mlbHeadshot(p.batterId)} alt="" width={22} height={22} style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              <div className="min-w-0 flex-1 text-[11px] font-bold text-[#1A1A1A] truncate">{p.batterName}</div>
              <span className="text-[9px] font-mono text-[#B5B0A3] shrink-0">{p.sampleSize}p</span>
              <span className="text-[12px] font-bold tabular-nums shrink-0 w-6 text-right" style={{ color: ORANGE }}>{p.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type CompareMode = 'none' | 'team' | 'player'

// Fuzzy match auto-loads the top result the moment it arrives — no click
// required, matching the main search box's behavior. The result list stays
// visible underneath so a different candidate is still one click away, and
// once a player is active a small "change" control resets the search.
function ComparePlayerPicker({ onPick }: { onPick: (p: PlayerResult | null) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PlayerResult[]>([])
  const [manualPickId, setManualPickId] = useState<number | null>(null)
  const gen = useRef(0)

  useEffect(() => {
    const query = q.trim()
    if (query.length < 3) return
    const myGen = ++gen.current
    const t = setTimeout(() => {
      fetch(`/api/lab/search?q=${encodeURIComponent(query)}`)
        .then(r => r.json())
        .then(data => { if (myGen === gen.current) setResults((data.people ?? []).slice(0, 4)) })
        .catch(() => { if (myGen === gen.current) setResults([]) })
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const visibleResults = q.trim().length >= 3 ? results : []
  const effective = manualPickId != null ? (visibleResults.find(p => p.id === manualPickId) ?? visibleResults[0] ?? null) : (visibleResults[0] ?? null)

  useEffect(() => {
    onPick(effective)
    // onPick is a stable setter from the parent, not itself reactive state
    // this effect should re-run on — including it would refire every
    // render for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective])

  if (effective) {
    return (
      <div className="mb-3 flex items-center gap-2">
        <img src={mlbHeadshot(effective.id)} alt="" width={18} height={18} style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />
        <span className="text-[11px] font-bold text-[#1A1A1A]">{effective.fullName}</span>
        <button
          onClick={() => { setQ(''); setResults([]); setManualPickId(null) }}
          className="text-[9.5px] text-[#8A8577] hover:text-[#1A1A1A] underline"
        >
          change
        </button>
      </div>
    )
  }

  return (
    <div className="mb-3">
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search a player to compare…"
        className="w-full text-[11.5px] bg-white border border-[#DEDACE] rounded-full px-3 py-2 outline-none focus:border-[#FF5722]"
      />
      {visibleResults.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1">
          {visibleResults.map(p => (
            <button key={p.id} onClick={() => setManualPickId(p.id)} className="text-left text-[11px] font-bold text-[#1A1A1A] px-2.5 py-1.5 rounded-lg hover:bg-[#FAF8F3] flex items-center gap-2">
              <img src={mlbHeadshot(p.id)} alt="" width={18} height={18} style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />
              {p.fullName}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PlayerSplitExplorer({ player, initialStat, initialCount }: { player: PlayerResult; initialStat: SplitStatKey; initialCount: CountSituationKey }) {
  const [filters, setFilters] = useState<Filters>({ stat: initialStat, count: initialCount, situation: 'any', inning: 'any', pitchType: 'all', rbi: 'any' })
  const [view, setView] = useState<'player' | 'team'>('player')
  const [compareMode, setCompareMode] = useState<CompareMode>('none')
  const [comparePlayer, setComparePlayer] = useState<PlayerResult | null>(null)

  const filterKey = `${filters.stat}-${filters.count}-${filters.situation}-${filters.inning}-${filters.pitchType}-${filters.rbi}`

  return (
    <div className="rounded-lg border border-[#E8E4DC] bg-white p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <img src={mlbHeadshot(player.id)} alt="" width={36} height={36} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        <div>
          <div className="text-[15px] font-serif font-bold text-[#1A1A1A]">{player.fullName}</div>
          <div className="text-[9.5px] font-mono text-[#8A8577] uppercase tracking-wide">{player.primaryPosition || 'MLB'} · real per-pitch splits</div>
        </div>
      </div>

      <div className="flex items-center border border-[#DEDACE] rounded-full overflow-hidden mb-3 w-fit">
        {(['player', 'team'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="text-[10.5px] font-bold px-3 py-1.5"
            style={{ background: view === v ? '#1A1A1A' : '#fff', color: view === v ? '#fff' : '#8A8577', border: 'none', cursor: 'pointer' }}
          >
            {v === 'player' ? 'This player' : 'Whole team'}
          </button>
        ))}
      </div>

      <FilterSelectors filters={filters} onChange={setFilters} />

      {view === 'player' ? (
        <>
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-wide text-[#8A8577] mr-1">Compare:</span>
            {(['none', 'team', 'player'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setCompareMode(m); if (m !== 'player') setComparePlayer(null) }}
                className="text-[9.5px] font-bold px-2 py-1 rounded-full border transition"
                style={{ borderColor: compareMode === m ? '#1A1A1A' : '#DEDACE', background: compareMode === m ? '#1A1A1A' : '#fff', color: compareMode === m ? '#fff' : '#1A1A1A' }}
              >
                {m === 'none' ? 'None' : m === 'team' ? 'Team average' : 'Another player'}
              </button>
            ))}
          </div>

          {compareMode === 'player' && <ComparePlayerPicker onPick={setComparePlayer} />}

          <div className={`grid gap-3 ${compareMode !== 'none' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className="rounded-lg bg-[#FAF8F3] p-4 text-center">
              {/* Keyed by the exact selection so switching any dropdown
                  remounts fresh instead of reusing the instance and
                  resetting state imperatively in an effect. */}
              <ResultBox key={filterKey} playerId={player.id} mode="player" filters={filters} label={compareMode !== 'none' ? player.fullName : undefined} />
            </div>
            {compareMode === 'team' && (
              <div className="rounded-lg bg-[#FAF8F3] p-4 text-center">
                <ResultBox key={filterKey} playerId={player.id} mode="team" filters={filters} label="Team total" />
              </div>
            )}
            {compareMode === 'player' && comparePlayer && (
              <div className="rounded-lg bg-[#FAF8F3] p-4 text-center">
                <ResultBox key={`${filterKey}-${comparePlayer.id}`} playerId={comparePlayer.id} mode="player" filters={filters} label={comparePlayer.fullName} />
              </div>
            )}
          </div>
          {compareMode === 'team' && (
            <div className="text-[9px] text-[#B5B0A3] mt-2 leading-snug">
              &quot;Team average&quot; is a real team total for this exact slice, not a league-wide position group — Statcast&apos;s public search doesn&apos;t reliably filter by roster position, so this is the honest real-data comparison available.
            </div>
          )}
        </>
      ) : (
        <TeamBreakdownBox key={filterKey} playerId={player.id} filters={filters} />
      )}
    </div>
  )
}

export default function StatsSearchPage() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<StatEntry | null>(null)
  // The active player is DERIVED (below), not stored directly — a fuzzy
  // name match auto-loads into the filter panel the moment results arrive,
  // with no click required (manualPickId just overrides which of the
  // *current* results wins, so clicking a different card still works).
  const [manualPickId, setManualPickId] = useState<number | null>(null)
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const searchGen = useRef(0)

  const statResults = useMemo(() => (query.trim() ? searchStats(query) : []), [query])
  // Guards against showing stale player matches left over from a longer
  // query after the user deletes back down below the 3-char search floor,
  // without needing to clear state synchronously inside the search effect.
  const nameCandidate = useMemo(() => extractNameCandidate(query), [query])
  const visiblePlayerResults = useMemo(() => (nameCandidate.length >= 3 ? playerResults : []), [nameCandidate, playerResults])
  const effectivePlayer = useMemo(() => {
    if (manualPickId != null) {
      const found = visiblePlayerResults.find(p => p.id === manualPickId)
      if (found) return found
    }
    return visiblePlayerResults[0] ?? null
  }, [manualPickId, visiblePlayerResults])

  useEffect(() => {
    const q = nameCandidate
    if (q.length < 3) return
    const gen = ++searchGen.current
    const t = setTimeout(() => {
      fetch(`/api/lab/search?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(data => {
          if (gen !== searchGen.current) return
          setPlayerResults((data.people ?? []).slice(0, 4))
        })
        .catch(() => { if (gen === searchGen.current) setPlayerResults([]) })
    }, 250)
    return () => clearTimeout(t)
  }, [nameCandidate])

  const popular = useMemo(
    () => POPULAR_KEYS.map(k => STAT_CATALOG.find(e => e.key === k)).filter((e): e is StatEntry => !!e),
    []
  )

  const grouped = useMemo(() => {
    const m = new Map<StatEntry['group'], StatEntry[]>()
    for (const g of GROUP_ORDER) m.set(g, [])
    for (const e of STAT_CATALOG) m.get(e.group)?.push(e)
    return m
  }, [])

  function pickPlayer(p: PlayerResult) {
    setManualPickId(p.id)
    setSelected(null)
  }
  function pickStat(e: StatEntry) {
    setSelected(e)
  }

  return (
    <div className="mlb-stats-search-page" style={{ background: '#FAF8F3', minHeight: '60vh' }}>
      <style>{`.mlb-stats-search-page, .mlb-stats-search-page * { font-family: 'Outfit', sans-serif; }`}</style>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-10">
        <div className="mb-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-2">— Stats Search</div>
          <h1 className="text-[28px] md:text-[34px] font-serif font-bold text-[#1A1A1A] mb-2">Search any stat</h1>
          <p className="text-[13px] text-[#8A8577] max-w-[600px]">
            {STAT_CATALOG.length} real metrics — box-score standards, fielding, and the site&apos;s own Statcast leaderboards. Refine most by pitch type, or search a player&apos;s name for their own real count &amp; pitch-type splits — try &quot;Bryce Harper 2 strike hits&quot;.
          </p>
        </div>

        <div className="relative mb-6">
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search a stat or a player… try “barrel rate” or “Bryce Harper 2 strike hits”"
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

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          <div>
            {query.trim() ? (
              <>
                {visiblePlayerResults.length > 0 && (
                  <div className="mb-5">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[#8A8577] mb-2">Players</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {visiblePlayerResults.map(p => (
                        <PlayerCard key={p.id} p={p} active={effectivePlayer?.id === p.id} onClick={() => pickPlayer(p)} />
                      ))}
                    </div>
                  </div>
                )}
                {statResults.length === 0 ? (
                  visiblePlayerResults.length === 0 && (
                    <div className="text-[12px] text-[#8A8577] py-8 text-center border border-dashed border-[#DEDACE] rounded-lg">
                      No stat or player matches &quot;{query}&quot; — try a shorter term like &quot;speed&quot; or &quot;rate&quot;.
                    </div>
                  )
                ) : (
                  <>
                    {visiblePlayerResults.length > 0 && <div className="text-[10px] font-bold uppercase tracking-widest text-[#8A8577] mb-2">Stats</div>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {statResults.map(e => (
                        <StatCard key={e.key} entry={e} active={selected?.key === e.key} onClick={() => pickStat(e)} />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div>
                <div className="mb-6">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#8A8577] mb-2">Popular</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {popular.map(e => (
                      <StatCard key={e.key} entry={e} active={selected?.key === e.key} onClick={() => pickStat(e)} />
                    ))}
                  </div>
                </div>
                {GROUP_ORDER.map(g => (
                  <div key={g} className="mb-6">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[#8A8577] mb-2">{g} ({grouped.get(g)?.length ?? 0})</div>
                    <div className="flex flex-wrap gap-1.5">
                      {grouped.get(g)?.map(e => (
                        <button
                          key={e.key}
                          onClick={() => pickStat(e)}
                          className="text-[10.5px] font-semibold px-2.5 py-1.5 rounded-full border transition hover:border-[#FF5722]"
                          style={{
                            borderColor: selected?.key === e.key ? '#FF5722' : '#DEDACE',
                            background: selected?.key === e.key ? 'rgba(255,87,34,0.06)' : '#fff',
                            color: '#1A1A1A',
                          }}
                        >
                          {e.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            {selected ? (
              // Keyed by stat so switching stats remounts fresh (rows
              // reset to the loading state naturally) instead of reusing
              // the instance and resetting state imperatively in an effect.
              // An explicit stat click always wins over an auto-loaded
              // player match.
              <LeaderboardPanel key={selected.key} entry={selected} />
            ) : effectivePlayer ? (
              // Keyed by player so re-picking a different player (or a
              // fresh fuzzy match auto-loading) remounts fresh instead of
              // reusing state from the last one.
              <PlayerSplitExplorer
                key={effectivePlayer.id}
                player={effectivePlayer}
                initialStat={guessStatFromQuery(query)}
                initialCount={guessCountFromQuery(query)}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-[#DEDACE] p-8 text-center text-[12px] text-[#8A8577]">
                Pick a stat for its live leaderboard, or a player for their real situational splits.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
