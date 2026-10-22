'use client'

// src/components/stats/LiveSituations.tsx
//
// The /mlb/stats/live sub page. Two jobs, kept deliberately simple:
//   1. SEE what is happening now — every game in progress with its situation (inning, outs, runners,
//      score, count, batter vs pitcher, the pitches of the current at-bat).
//   2. ASK "when did this last happen?" — click a game to copy its situation (or build one by hand),
//      then choose the year(s), postseason / regular season, a club and / or a player.
//
// Everything here is Pro (it runs on plate-appearance data). `isPro` is a required prop and the APIs
// re-check the session themselves.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { C, SANS, MONO } from '@/components/team/ui'
import { Chip, Field, Hint, Panel, ProLockBar, QUERY_CSS, SegBar, selectStyle } from '@/components/stats/queryUi'
import { RecentList } from '@/components/stats/queryDrill'
import { WhoFilter } from '@/components/stats/queryWho'
import { HitMatchPanel, refText, type HitSearch } from '@/components/stats/queryHit'
import { LiveHelp } from '@/components/stats/queryHelp'
import type { LiveGame, LiveResult, Moment } from '@/lib/stats-live'
import type { QueryResult } from '@/lib/stats-query'
import {
  BASE_CHIP, CURRENT_SEASON, eventKeyFromMlb, FIRST_SEASON, GAME_TYPES, deepGroupLabel, describeDeep, gameTypeForSearch,
  type DeepFilters, type HitRef, type Who,
} from '@/lib/stats-query-catalog'

const ord = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`)
const SEASONS = Array.from({ length: CURRENT_SEASON - FIRST_SEASON + 1 }, (_, i) => CURRENT_SEASON - i)
const COUNTS = [0, 1, 2, 3].flatMap(b => [0, 1, 2].map(s => `${b}-${s}`))

/** What the person has chosen for each part of the situation; null = "any". */
type Sel = {
  outs: number | null; base: number | null; inning: number | null; orLater: boolean
  score: 'ahead' | 'behind' | 'tied' | null; count: string | null
  stand: 'L' | 'R' | null; throws: 'L' | 'R' | null; pitchesMin: number | null
}
const ANY: Sel = { outs: null, base: null, inning: null, orLater: false, score: null, count: null, stand: null, throws: null, pitchesMin: null }

function toDeep(sel: Sel, who: Who | undefined): DeepFilters {
  const stack: string[] = []
  if (sel.outs != null) stack.push(`o${sel.outs}`)
  if (sel.base != null) stack.push(BASE_CHIP[sel.base])
  if (sel.score) stack.push(sel.score === 'ahead' ? 'sah' : sel.score === 'behind' ? 'sbh' : 'sti')
  if (sel.count) stack.push(`c${sel.count.replace('-', '')}`)
  if (sel.stand) stack.push(sel.stand === 'L' ? 'l' : 'r')
  if (sel.throws) stack.push(sel.throws === 'L' ? 'vl' : 'vr')
  const d: DeepFilters = { stack, who }
  if (sel.inning != null) { d.inningFrom = sel.inning; if (!sel.orLater) d.inningTo = sel.inning }
  if (sel.pitchesMin != null) d.pitchesMin = sel.pitchesMin
  return d
}

/** The moment the quick-fill chips read from: the game's current at-bat, or a past one picked from the dropdown. */
type Source = { hit?: HitRef; label: string; inning: number; half: 'Top' | 'Bot'; scoreDiff: number; balls: number; strikes: number; stand: string; throws: string; pitches: number }
const scoreWord = (d: number) => (d === 0 ? 'tied' : d > 0 ? `batting team up ${d}` : `batting team down ${-d}`)
const momentLabel = (m: Moment) =>
  `${m.outs} out · ${deepGroupLabel('base_state', String(m.baseState))} · ${scoreWord(m.scoreDiff)} — ${m.batter} (${m.event}${m.ev != null ? ` · ${m.ev.toFixed(1)} mph` : ''})`

const anyChosen = (sel: Sel, who: Who | undefined) => Object.values(sel).some(v => v !== null && v !== false) || !!who

export default function LiveSituations({ isPro }: { isPro: boolean }) {
  const [live, setLive] = useState<LiveResult | null>(null)
  const [liveErr, setLiveErr] = useState<string | null>(null)
  const [auto, setAuto] = useState(true)
  const [picked, setPicked] = useState<number | null>(null)
  const [source, setSource] = useState<Source | null>(null)

  const [sel, setSel] = useState<Sel>(ANY)
  const [who, setWho] = useState<Who | undefined>(undefined)
  const [gameType, setGameType] = useState('P')
  const [from, setFrom] = useState(CURRENT_SEASON - 2)
  const [to, setTo] = useState(CURRENT_SEASON)

  const [result, setResult] = useState<QueryResult | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)
  const [lastDeep, setLastDeep] = useState<DeepFilters | null>(null)
  const [hitRef, setHitRef] = useState<{ ref: HitRef; who: string } | null>(null)
  const hitRef0 = useRef<HTMLDivElement>(null)
  const runId = useRef(0)
  const resultsRef = useRef<HTMLDivElement>(null)

  // ── live games ──────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/stats/live?group=hitting')
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? `Request failed (${r.status})`)
      setLive(j as LiveResult); setLiveErr(null)
    } catch (e) { setLiveErr((e as Error).message) }
  }, [])
  useEffect(() => {
    if (!isPro) return
    refresh()
    if (!auto) return
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [isPro, auto, refresh])

  const game: LiveGame | null = useMemo(() => live?.games.find(g => g.gamePk === picked) ?? null, [live, picked])

  /** Copy a live game's situation into the builder (outs + runners by default; the rest via the quick-fill chips). */
  const useGame = (g: LiveGame) => {
    setPicked(g.gamePk)
    setSel({ ...ANY, outs: Math.min(2, g.outs), base: g.baseState })
    setGameType(gameTypeForSearch(g.gameType))
    setSource({ label: 'right now', inning: g.inning, half: g.half, scoreDiff: g.scoreDiff, balls: g.balls, strikes: g.strikes, stand: g.stand, throws: g.throws, pitches: g.pitches })
  }
  /** Copy a situation that already happened earlier in this game (from the dropdown). */
  const useMoment = (g: LiveGame, m: Moment) => {
    setPicked(g.gamePk)
    setSel({ ...ANY, outs: m.outs, base: m.baseState })
    setGameType(gameTypeForSearch(g.gameType))
    setSource({ hit: m.ev != null ? { ev: m.ev, la: m.la, dist: m.dist, bbType: m.bbType, event: eventKeyFromMlb(m.event) } : undefined, label: `${m.half === 'Top' ? '▲' : '▼'} ${ord(m.inning)} · ${m.batter}`, inning: m.inning, half: m.half, scoreDiff: m.scoreDiff, balls: m.balls, strikes: m.strikes, stand: m.stand, throws: m.throws, pitches: m.pitches })
  }
  const fill = (patch: Partial<Sel>) => setSel(s => ({ ...s, ...patch }))

  // ── the search: "when did this last happen?" ────────────────────────
  const find = useCallback(async (override?: DeepFilters) => {
    const id = ++runId.current
    const deep = override ?? toDeep(sel, who)
    setLastDeep(deep); setSearching(true); setSearchErr(null); setResult(null); setProgress(null)
    const lo = Math.min(from, to), hi = Math.max(from, to)
    const url = `/api/stats/query?group=hitting&gameType=${gameType}&from=${lo}&to=${hi}&view=recent&deep=${encodeURIComponent(JSON.stringify(deep))}`
    try {
      // Savant days are pulled in batches: keep asking until the whole range is in.
      for (let i = 0; i < 400; i++) {
        const r = await fetch(url)
        const j = await r.json()
        if (id !== runId.current) return
        if (!r.ok) throw new Error(j?.error ?? `Request failed (${r.status})`)
        if (j.loading) { setProgress(j.loading); continue }
        setProgress(null); setResult(j as QueryResult)
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
        return
      }
      throw new Error('That range is taking too long to load — try fewer seasons.')
    } catch (e) {
      if (id === runId.current) setSearchErr((e as Error).message)
    } finally {
      if (id === runId.current) setSearching(false)
    }
  }, [sel, who, gameType, from, to])

  // ── pieces ──────────────────────────────────────────────────────────
  const typeLabel = GAME_TYPES.find(g => g.key === gameType)?.label ?? gameType
  const summary = lastDeep ? describeDeep(lastDeep).join(' + ') || 'any situation' : ''
  const wide = (o: React.CSSProperties = {}): React.CSSProperties => ({ ...selectStyle, ...o })

  if (!isPro) {
    return (
      <div style={{ display: 'grid', gap: 14, maxWidth: 760 }}>
        <style>{QUERY_CSS}</style>
        <div style={{ fontFamily: SANS, fontSize: 15, color: '#3a352c', lineHeight: 1.55 }}>
          See every game in progress with its situation, then ask <b>“when did this last happen?”</b> — filtered by year, postseason or regular season, club and player — and open any result down to the pitches.
        </div>
        <ProLockBar features={['Live games & their situations', 'Last-time finder', 'Filter by year, club and player', 'Pitch-by-pitch detail']} />
      </div>
    )
  }

  return (
    <div style={{ fontFamily: SANS, color: C.ink }}>
      <style>{QUERY_CSS}{`.ql-live{display:grid;gap:18px;grid-template-columns:minmax(0,1fr) minmax(320px,420px);align-items:start}@media (max-width:1000px){.ql-live{grid-template-columns:minmax(0,1fr)}}`}</style>

      <div className="ql-live">
        {/* ── left: what is happening now ── */}
        <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
          <Panel step="1" title="Live now" hint="Every MLB game in progress, with the exact moment it is in. Click a game to copy its situation into the search on the right." right={
            <>
              <button type="button" onClick={refresh} style={{ fontFamily: SANS, fontSize: 11, border: 'none', background: 'transparent', color: C.mute, cursor: 'pointer', textDecoration: 'underline' }}>Refresh</button>
              <Chip on={auto} solid onClick={() => setAuto(a => !a)} title="Update every 30 seconds">Auto · 30s</Chip>
            </>
          }>
            {liveErr && <div style={{ color: C.bad, fontSize: 13 }}>{liveErr}</div>}
            {!live && !liveErr && <div style={{ color: C.faint, fontSize: 13 }}>Checking for live games…</div>}
            {live && live.games.length === 0 && (
              <div style={{ fontSize: 14, color: C.mute, lineHeight: 1.5 }}>
                No MLB games are in progress right now. You can still build a situation by hand on the right and look it up.
              </div>
            )}
            <div style={{ display: 'grid', gap: 8 }}>
              {live?.games.map(g => {
                const on = g.gamePk === picked
                return (
                  <div key={g.gamePk} style={{ border: `1.5px solid ${on ? C.orange : C.line}`, background: on ? '#fff1ec' : '#fff', borderRadius: 8 }}>
                  <button type="button" onClick={() => useGame(g)} aria-pressed={on}
                    style={{ all: 'unset', cursor: 'pointer', display: 'block', padding: '10px 12px', width: 'calc(100% - 24px)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: 16 }}>{g.away} {g.awayRuns} – {g.homeRuns} {g.home}</span>
                      <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{gameTypeForSearch(g.gameType) === 'P' ? 'POSTSEASON' : 'REGULAR SEASON'}</span>
                    </div>
                    <div style={{ fontSize: 13.5, color: '#3a352c', marginTop: 2 }}>
                      <b>{g.half === 'Top' ? '▲ Top' : '▼ Bottom'} {ord(g.inning)}</b> · {g.outs} out{g.outs === 1 ? '' : 's'} · {g.runners} · count {g.balls}-{g.strikes}
                    </div>
                    <div style={{ fontSize: 12.5, color: C.mute, marginTop: 2 }}>{g.batter} ({g.stand}) vs {g.pitcher} ({g.throws}) · {g.pitches} pitch{g.pitches === 1 ? '' : 'es'} this at-bat</div>
                    {g.sequence.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                        {g.sequence.map(p => (
                          <span key={p.no} title={`${p.type} · ${p.call}`} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 3, background: C.soft, fontVariantNumeric: 'tabular-nums' }}>
                            {p.no}. {p.type.replace('Four-Seam Fastball', '4-Seam').replace('Fastball', 'FB')} {p.speed != null ? p.speed.toFixed(0) : ''} · {p.call}{p.ev != null ? ` · ${p.ev.toFixed(1)} mph EV` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: on ? C.orange : C.mute }}>
                      {on ? '✓ Situation copied →' : 'Use this situation →'}
                    </div>
                  </button>
                  <div style={{ padding: '0 12px 6px', textAlign: 'right' }}>
                    <a href={g.link} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: C.orange, textDecoration: 'none' }}>Gameday ↗</a>
                  </div>
                  <div style={{ padding: '0 12px 10px' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: C.mute, marginBottom: 4 }}>
                      Every situation so far in this game ({g.history.length})
                    </label>
                    <select aria-label={`Situations so far in ${g.away} at ${g.home}`} style={wide({ fontSize: 13 })} value=""
                      onChange={e => { const m = g.history.find(h => h.atBat === Number(e.target.value)); if (m) useMoment(g, m) }}>
                      <option value="">{g.history.length ? 'Choose one to look it up…' : 'No plate appearances yet'}</option>
                      {Array.from(new Set(g.history.map(h => `${h.half}|${h.inning}`))).map(key => {
                        const [half, inn] = key.split('|')
                        return (
                          <optgroup key={key} label={`${half === 'Top' ? '▲ Top' : '▼ Bottom'} ${ord(Number(inn))}`}>
                            {g.history.filter(h => `${h.half}|${h.inning}` === key).map(h => <option key={h.atBat} value={h.atBat}>{momentLabel(h)}</option>)}
                          </optgroup>
                        )
                      })}
                    </select>
                  </div>
                  </div>
                )
              })}
            </div>
          </Panel>
          <LiveHelp />
        </div>

        {/* ── right: ask when it last happened ── */}
        <div style={{ display: 'grid', gap: 12, position: 'sticky', top: 16, minWidth: 0 }}>
          <Panel step="2" title="The situation" hint="Each box is optional — leave it on “Any” to ignore it. The more you set, the rarer the moment you are looking for.">
            {game && source && (
              <div style={{ marginBottom: 12, padding: 8, background: C.soft, borderRadius: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: C.orange, marginBottom: 5 }}>Also take from {game.away} @ {game.home} — {source.label}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  <Chip on={sel.inning === source.inning} onClick={() => fill({ inning: sel.inning === source.inning ? null : source.inning })}>{ord(source.inning)} inning</Chip>
                  <Chip on={sel.score !== null} onClick={() => fill({ score: sel.score ? null : source.scoreDiff > 0 ? 'ahead' : source.scoreDiff < 0 ? 'behind' : 'tied' })}>{source.scoreDiff === 0 ? 'Tied' : source.scoreDiff > 0 ? 'Batting team ahead' : 'Batting team behind'}</Chip>
                  <Chip on={sel.count === `${source.balls}-${source.strikes}`} onClick={() => fill({ count: sel.count ? null : `${source.balls}-${source.strikes}` })}>{source.balls}-{source.strikes} count</Chip>
                  <Chip on={sel.stand === source.stand} onClick={() => fill({ stand: sel.stand ? null : (source.stand as 'L' | 'R') })}>{source.stand === 'L' ? 'Left' : 'Right'}-handed batter</Chip>
                  <Chip on={sel.throws === source.throws} onClick={() => fill({ throws: sel.throws ? null : (source.throws as 'L' | 'R') })}>{source.throws === 'L' ? 'Left' : 'Right'}-handed pitcher</Chip>
                  {source.hit && <Chip on={false} onClick={() => { setHitRef({ ref: source.hit as HitRef, who: source.label.split(' · ')[1] ?? game.batter }); setTimeout(() => hitRef0.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) }}>⚾ Find hits like this one ({refText(source.hit)})</Chip>}
                  {source.pitches > 0 && <Chip on={sel.pitchesMin === source.pitches} onClick={() => fill({ pitchesMin: sel.pitchesMin ? null : source.pitches })}>{source.pitches}+ pitch at-bat</Chip>}
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Outs">
                <select style={wide()} value={sel.outs ?? ''} onChange={e => fill({ outs: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">Any</option><option value={0}>No outs</option><option value={1}>1 out</option><option value={2}>2 outs</option>
                </select>
              </Field>
              <Field label="Runners">
                <select style={wide()} value={sel.base ?? ''} onChange={e => fill({ base: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">Any</option>
                  {[0, 1, 2, 4, 3, 5, 6, 7].map(b => <option key={b} value={b}>{deepGroupLabel('base_state', String(b))}</option>)}
                </select>
              </Field>
              <Field label="Inning">
                <select style={wide()} value={sel.inning ?? ''} onChange={e => fill({ inning: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">Any</option>{Array.from({ length: 12 }, (_, i) => i + 1).map(i => <option key={i} value={i}>{ord(i)}</option>)}
                </select>
              </Field>
              <Field label="…and later?" hint="Tick to include every inning from the one you picked onward (for example the 7th or later).">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 0' }}>
                  <input type="checkbox" checked={sel.orLater} disabled={sel.inning == null} onChange={e => fill({ orLater: e.target.checked })} /> or later
                </label>
              </Field>
              <Field label="Score" hint="From the batting team's point of view when the at-bat began.">
                <select style={wide()} value={sel.score ?? ''} onChange={e => fill({ score: (e.target.value || null) as Sel['score'] })}>
                  <option value="">Any</option><option value="tied">Tied</option><option value="ahead">Batting team ahead</option><option value="behind">Batting team behind</option>
                </select>
              </Field>
              <Field label="Count" hint="Balls-strikes when the at-bat ended.">
                <select style={wide()} value={sel.count ?? ''} onChange={e => fill({ count: e.target.value || null })}>
                  <option value="">Any</option>{COUNTS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Batter">
                <select style={wide()} value={sel.stand ?? ''} onChange={e => fill({ stand: (e.target.value || null) as Sel['stand'] })}>
                  <option value="">Any</option><option value="L">Left-handed</option><option value="R">Right-handed</option>
                </select>
              </Field>
              <Field label="Pitcher">
                <select style={wide()} value={sel.throws ?? ''} onChange={e => fill({ throws: (e.target.value || null) as Sel['throws'] })}>
                  <option value="">Any</option><option value="L">Left-handed</option><option value="R">Right-handed</option>
                </select>
              </Field>
              <Field label="At-bat length" hint="The plate appearance took at least this many pitches.">
                <input type="number" min={1} max={30} placeholder="any" style={wide()} value={sel.pitchesMin ?? ''} onChange={e => fill({ pitchesMin: e.target.value === '' ? null : Math.max(1, Math.min(30, Number(e.target.value))) })} />
              </Field>
            </div>
            <button type="button" onClick={() => { setSel(ANY); setPicked(null); setSource(null) }}
              style={{ marginTop: 8, fontFamily: SANS, fontSize: 12, border: 'none', background: 'transparent', color: C.mute, cursor: 'pointer', textDecoration: 'underline' }}>Clear the situation</button>
          </Panel>

          <Panel step="3" title="Where & when" hint="Which seasons and kind of games to search. The first search of a season pulls Baseball Savant and takes a little while; after that it is instant.">
            <div style={{ display: 'grid', gap: 12 }}>
              <Field label="Games">
                <select style={wide()} value={gameType} onChange={e => setGameType(e.target.value)}>
                  {GAME_TYPES.filter(g => g.key !== 'R').map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
                  <option value="R">Regular season</option>
                </select>
              </Field>
              <Field label="Years">
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <select aria-label="From year" style={wide()} value={from} onChange={e => setFrom(Number(e.target.value))}>{SEASONS.map(y => <option key={y} value={y}>{y}</option>)}</select>
                    <select aria-label="To year" style={wide()} value={to} onChange={e => setTo(Number(e.target.value))}>{SEASONS.map(y => <option key={y} value={y}>{y}</option>)}</select>
                  </div>
                  <SegBar<string> dense value={`${to - from + 1}`} onChange={v => { setTo(CURRENT_SEASON); setFrom(v === 'all' ? 2015 : CURRENT_SEASON - Number(v) + 1) }}
                    options={[{ key: '1', label: 'This year' }, { key: '3', label: 'Last 3' }, { key: '5', label: 'Last 5' }, { key: 'all', label: 'Since 2015' }]} />
                </div>
              </Field>
              <WhoFilter who={who} onChange={setWho} />
            </div>
          </Panel>

          <button type="button" onClick={() => find()} disabled={searching}
            style={{ fontFamily: SANS, fontWeight: 800, fontSize: 15, padding: '13px 18px', borderRadius: 6, border: 'none', background: searching ? C.line : C.orange, color: '#fff', cursor: searching ? 'default' : 'pointer' }}>
            {searching ? 'Searching…' : 'Find the last time this happened'}
          </button>
          {!anyChosen(sel, who) && <div style={{ fontSize: 12, color: C.faint }}>Nothing is set — this would list the latest plate appearances of any kind. Set at least one thing for a useful answer.</div>}
        </div>
      </div>

      {/* ── results ── */}
      {hitRef && (
        <div ref={hitRef0} style={{ marginTop: 22, maxWidth: 900 }}>
          <HitMatchPanel hitRef={hitRef.ref} who={hitRef.who} busy={searching} onClose={() => setHitRef(null)}
            onRun={({ hit, events }: HitSearch) => { setHitRef(null); find({ stack: [], hit, events, who }) }} />
        </div>
      )}

      <div ref={resultsRef} style={{ marginTop: 22 }}>
        {progress && (
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: 16, maxWidth: 760 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Pulling Baseball Savant — {progress.done} of {progress.total} game days</div>
            <div style={{ height: 8, background: C.soft, borderRadius: 4, margin: '10px 0', overflow: 'hidden' }}>
              <div style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`, height: '100%', background: C.orange, transition: 'width .3s' }} />
            </div>
            <div style={{ fontSize: 12, color: C.mute }}>First time for these seasons only — finished days are kept, so the next search is instant.</div>
          </div>
        )}
        {searchErr && <div style={{ color: C.bad, fontSize: 14 }}>{searchErr}</div>}
        {result && lastDeep && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.01em' }}>
              {summary} <span style={{ fontWeight: 500, color: C.mute, fontSize: 15 }}>· {typeLabel} · {Math.min(from, to)}{from !== to ? `–${Math.max(from, to)}` : ''}</span>
            </div>
            <RecentList rows={result.recent ?? []} total={result.recentTotal} deep hitRef={lastDeep.hit?.ref}
              onFindSimilar={r => { setHitRef({ ref: { ev: r.ev as number, la: r.la, dist: r.dist, bbType: r.bbType, event: r.event }, who: r.batter }); setTimeout(() => hitRef0.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) }} />
          </div>
        )}
      </div>
    </div>
  )
}
