'use client'

// src/components/lab/PlayersPanel.tsx
//
// Lab: player level for the clubs picked in the dashboard. Four tools over the
// same roster data: streaks (pick a streak, see who is on one), on this day
// (every hitter's line for a chosen date), head-to-head (the whole lineup
// against one pitcher) and a roster builder that swaps hitters in and out and
// shows how the team numbers and the spread between players would change.
// Hitters only for now; pitcher make-up lives in the charts above.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { C, SANS } from '@/components/team/ui'
import Headshot from '@/components/scout/Headshot'
import { playerHeadshotUrl } from '@/lib/mlb'
import { MLB_TEAMS } from '@/lib/teams'
import { STREAKS, STREAK_BY_KEY, lineText, streakOf, type GameLine, type H2HLine, type History, type PlayerLog, type TeamPlayers } from '@/lib/lab/player-streaks'
import { loadH2H, loadHistory, loadTeamPlayers } from '@/lib/lab/load-team-players.server-fetch-allowed'

type Tab = 'streaks' | 'day' | 'h2h' | 'build'
const TABS: { key: Tab; label: string }[] = [
  { key: 'streaks', label: 'Streaks' }, { key: 'day', label: 'On this day' },
  { key: 'h2h', label: 'Head-to-head' }, { key: 'build', label: 'Roster builder' },
]
const chip = (on: boolean): React.CSSProperties => ({
  fontFamily: SANS, fontWeight: 700, fontSize: 12, padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
  border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : '#5b5347',
})
const th: React.CSSProperties = { fontFamily: SANS, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: C.mute, textAlign: 'right', padding: '6px 8px', fontWeight: 400, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { fontFamily: SANS, fontSize: 12, textAlign: 'right', padding: '6px 8px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }
const sel: React.CSSProperties = { fontFamily: SANS, fontSize: 13, padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff' }

const teamName = (id: number) => MLB_TEAMS.find(t => t.id === id)?.short ?? '—'
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const f3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3).replace(/^0/, '') : '—')

function Face({ p, size = 34 }: { p: { id: number; name: string }; size?: number }) {
  const src = playerHeadshotUrl(p.id, size * 3)
  return <Headshot src={src} fallback={src} size={size} />
}
const NameCell = ({ p, sub }: { p: PlayerLog; sub?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
    <Face p={p} />
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap' }}>{p.name}</div>
      <div style={{ fontFamily: SANS, fontSize: 10, color: C.faint }}>{p.pos}{p.bats ? ` · bats ${p.bats}` : ''}{sub ? ` · ${sub}` : ''}</div>
    </div>
  </div>
)

// ---- season maths over a set of hitters ---------------------------------
type Tot = { g: number; pa: number; ab: number; h: number; tb: number; hr: number; r: number; rbi: number; bb: number; hbp: number; k: number; sb: number }
const sum = (games: GameLine[]): Tot => games.reduce<Tot>((t, g) => ({
  g: t.g + (g.pa > 0 ? 1 : 0), pa: t.pa + g.pa, ab: t.ab + g.ab, h: t.h + g.h, tb: t.tb + g.h + g.d2 + 2 * g.d3 + 3 * g.hr,
  hr: t.hr + g.hr, r: t.r + g.r, rbi: t.rbi + g.rbi, bb: t.bb + g.bb, hbp: t.hbp + g.hbp, k: t.k + g.k, sb: t.sb + g.sb,
}), { g: 0, pa: 0, ab: 0, h: 0, tb: 0, hr: 0, r: 0, rbi: 0, bb: 0, hbp: 0, k: 0, sb: 0 })
const addTot = (a: Tot, b: Tot): Tot => ({ g: a.g + b.g, pa: a.pa + b.pa, ab: a.ab + b.ab, h: a.h + b.h, tb: a.tb + b.tb, hr: a.hr + b.hr, r: a.r + b.r, rbi: a.rbi + b.rbi, bb: a.bb + b.bb, hbp: a.hbp + b.hbp, k: a.k + b.k, sb: a.sb + b.sb })
const rates = (t: Tot) => {
  const obp = t.ab + t.bb + t.hbp ? (t.h + t.bb + t.hbp) / (t.ab + t.bb + t.hbp) : NaN
  const slg = t.ab ? t.tb / t.ab : NaN
  return { avg: t.ab ? t.h / t.ab : NaN, obp, slg, ops: obp + slg, kPct: t.pa ? (100 * t.k) / t.pa : NaN, bbPct: t.pa ? (100 * t.bb) / t.pa : NaN }
}

type Store = { get: (id: number) => TeamPlayers | undefined; ensure: (id: number) => void; loading: (id: number) => boolean; failed: (id: number) => boolean }
function useStore(season: number): Store {
  const [data, setData] = useState<Record<number, TeamPlayers>>({})
  const [busy, setBusy] = useState<Record<number, boolean>>({})
  const [bad, setBad] = useState<Record<number, boolean>>({})
  const started = useRef(new Set<number>())
  const ensure = useCallback((id: number) => {
    if (started.current.has(id)) return
    started.current.add(id)
    setBusy(b => ({ ...b, [id]: true }))
    loadTeamPlayers(id, season)
      .then(d => setData(x => ({ ...x, [id]: d })))
      .catch(() => { setBad(b => ({ ...b, [id]: true })); started.current.delete(id) })
      .finally(() => setBusy(b => ({ ...b, [id]: false })))
  }, [season])
  return useMemo(() => ({ get: id => data[id], ensure, loading: id => !!busy[id], failed: id => !!bad[id] }), [data, ensure, busy, bad])
}

export default function PlayersPanel({ teamIds, season }: { teamIds: number[]; season: number }) {
  const store = useStore(season)
  const [teamId, setTeamId] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('streaks')
  const active = teamId && teamIds.includes(teamId) ? teamId : teamIds[0] ?? null
  useEffect(() => { if (active) store.ensure(active) }, [active, store])

  const box: React.CSSProperties = { marginTop: 28, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 }
  if (!active) {
    return (
      <section style={box}>
        <Kicker>⊕ Players</Kicker>
        <p style={{ fontFamily: SANS, color: C.mute, fontSize: 14, margin: '6px 0 0' }}>Choose a team above (or click one in any visual) to see its players, streaks, head-to-head lines and to build a roster.</p>
      </section>
    )
  }
  const data = store.get(active)
  return (
    <section style={box}>
      <Kicker>⊕ Players</Kicker>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {teamIds.map(id => <button key={id} style={chip(id === active)} onClick={() => setTeamId(id)}>{teamName(id)}</button>)}
        <span style={{ width: 1, height: 20, background: C.line, margin: '0 6px' }} />
        {TABS.map(t => <button key={t.key} style={{ ...chip(tab === t.key), ...(tab === t.key ? { background: C.orange, borderColor: C.orange } : {}) }} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>
      {!data ? (
        <p style={{ fontFamily: SANS, fontSize: 11, color: C.faint }}>
          {store.failed(active) ? <>Couldn&apos;t load {teamName(active)}. <button style={chip(false)} onClick={() => store.ensure(active)}>Try again</button></> : `Loading ${teamName(active)} players…`}
        </p>
      ) : data.hitters.length === 0 ? (
        <p style={{ fontFamily: SANS, color: C.mute }}>No hitters returned for {teamName(active)}.</p>
      ) : tab === 'streaks' ? <Streaks data={data} />
        : tab === 'day' ? <OnThisDay data={data} />
        : tab === 'h2h' ? <HeadToHead data={data} store={store} />
        : <RosterBuilder data={data} store={store} />}
      <p style={{ fontFamily: SANS, fontSize: 9.5, color: C.faint, lineHeight: 1.6, marginTop: 14 }}>
        MLB Stats API, {season} regular season, active roster. Streaks can include postseason games; the roster builder uses the regular season only. Games with no chance to qualify (no at-bat) are skipped, not counted as a break. On-base % leaves out sacrifice flies.
      </p>
    </section>
  )
}

const Kicker = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange, marginBottom: 10 }}>{children}</div>
)

// ---- shared game table ------------------------------------------------------
function GameTable({ games }: { games: GameLine[] }) {
  const heads = ['Date', 'Opponent', 'Line', 'HR', '2B', 'RBI', 'R', 'BB', 'K', 'SB']
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
        <thead><tr>{heads.map((h, i) => <th key={h} style={{ ...th, textAlign: i < 2 ? 'left' : 'right' }}>{h}</th>)}</tr></thead>
        <tbody>{games.map(g => (
          <tr key={g.d + g.o} style={{ borderTop: `1px solid ${C.soft}` }}>
            <td style={{ ...td, textAlign: 'left' }}>{day(g.d)}, {g.d.slice(0, 4)}{g.ps && <span style={{ marginLeft: 6, fontFamily: SANS, fontWeight: 800, fontSize: 9.5, color: C.orange }}>POSTSEASON</span>}</td>
            <td style={{ ...td, textAlign: 'left', fontFamily: SANS, fontWeight: 600 }}>{g.home ? 'vs' : '@'} {teamName(g.o)}</td>
            <td style={{ ...td, fontFamily: SANS, fontWeight: 700 }}>{g.h}-{g.ab}</td>
            {[g.hr, g.d2, g.rbi, g.r, g.bb, g.k, g.sb].map((v, i) => <td key={i} style={{ ...td, color: v ? C.ink : C.faint }}>{v}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}
const rowOpen: React.CSSProperties = { background: '#fff6f1' }
const detailCell = (cols: number, children: React.ReactNode) => (
  <tr><td colSpan={cols} style={{ padding: '4px 8px 14px 52px', background: '#fffaf7' }}>{children}</td></tr>
)

// ---- Streaks -------------------------------------------------------------
function Streaks({ data }: { data: TeamPlayers }) {
  const [key, setKey] = useState('hit')
  const [open, setOpen] = useState<number | null>(null)
  const [which, setWhich] = useState<'current' | 'best'>('current')
  const [post, setPost] = useState(true)
  const def = STREAK_BY_KEY.get(key)!
  const rows = useMemo(() => data.hitters.filter(p => p.games.length > 0)
    .map(p => ({ p, s: streakOf(post ? p.games : p.games.filter(g => !g.ps), def) }))
    .sort((a, b) => b.s.current - a.s.current || b.s.longest - a.s.longest), [data, def, post])
  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {STREAKS.map(s => <button key={s.key} style={chip(key === s.key)} onClick={() => { setKey(s.key); setOpen(null) }}>{s.label}</button>)}
        <label style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: '#5b5347', display: 'inline-flex', gap: 5, alignItems: 'center', marginLeft: 8 }}>
          <input type="checkbox" checked={post} onChange={e => setPost(e.target.checked)} /> Include postseason
        </label>
      </div>
      <p style={{ fontFamily: SANS, fontSize: 13, color: '#5b5347', margin: '0 0 10px' }}>{def.blurb}. Sorted by the active run. Click a player to see every game in the streak with its stats.</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
          <thead><tr><th style={{ ...th, textAlign: 'left' }}>Player</th><th style={th}>Active</th><th style={th}>Since</th><th style={th}>Best this year</th><th style={th}>Best run</th></tr></thead>
          <tbody>
            {rows.map(({ p, s }) => {
              const isOpen = open === p.id
              const games = which === 'current' ? s.currentGames : s.longestGames
              return [
                <tr key={p.id} onClick={() => setOpen(isOpen ? null : p.id)} style={{ cursor: 'pointer', borderTop: `1px solid ${C.soft}`, ...(isOpen ? rowOpen : {}) }}>
                  <td style={{ padding: '5px 8px' }}><NameCell p={p} sub={isOpen ? 'tap to close' : undefined} /></td>
                  <td style={{ ...td, fontFamily: SANS, fontWeight: 800, fontSize: 16, color: s.current >= 5 ? C.orange : C.ink }}>{s.current || '—'}</td>
                  <td style={td}>{s.currentFrom ? day(s.currentFrom) : '—'}</td>
                  <td style={{ ...td, fontFamily: SANS, fontWeight: 700 }}>{s.longest || '—'}</td>
                  <td style={td}>{s.longestFrom && s.longestTo ? `${day(s.longestFrom)} – ${day(s.longestTo)}` : '—'}</td>
                </tr>,
                isOpen && detailCell(5, (
                  <>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '6px 0 8px', flexWrap: 'wrap' }}>
                      <button style={chip(which === 'current')} onClick={() => setWhich('current')}>Active run ({s.current})</button>
                      <button style={chip(which === 'best')} onClick={() => setWhich('best')}>Best run ({s.longest})</button>
                      {games.length > 0 && <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.mute }}>
                        {(() => { const t = sum(games); return `${games.length} games · ${t.h}-${t.ab}, ${t.hr} HR, ${t.rbi} RBI, ${t.r} R` })()}
                      </span>}
                    </div>
                    {games.length === 0 ? <p style={{ fontFamily: SANS, color: C.mute, margin: 0 }}>No active {def.label.toLowerCase()} right now.</p> : <GameTable games={games} />}
                  </>
                )),
              ]
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ---- On this day ----------------------------------------------------------
const YEARS_BACK = 5
const pad = (n: number) => String(n).padStart(2, '0')
function shiftDay(md: string, delta: number): string {
  const d = new Date(Date.UTC(2024, Number(md.slice(0, 2)) - 1, Number(md.slice(3)) + delta)) // 2024 = leap year, so 02-29 exists
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function OnThisDay({ data }: { data: TeamPlayers }) {
  const season = data.season
  const [hist, setHist] = useState<Record<number, History | 'error'>>({})
  const asked = useRef(new Set<string>())
  useEffect(() => {
    for (let y = season - 1; y >= season - YEARS_BACK; y--) {
      const k = `${data.teamId}:${y}`
      if (asked.current.has(k)) continue
      asked.current.add(k)
      loadHistory(data.teamId, season, y)
        .then(h => setHist(x => ({ ...x, [y]: h })))
        .catch(() => { asked.current.delete(k); setHist(x => ({ ...x, [y]: 'error' })) })
    }
  }, [data.teamId, season])

  const latest = useMemo(() => data.hitters.flatMap(p => p.games.map(g => g.d)).sort().pop() ?? `${season}-07-04`, [data, season])
  const [md, setMd] = useState(latest.slice(5))
  const [open, setOpen] = useState<number | null>(null)
  const years = Array.from({ length: YEARS_BACK + 1 }, (_, i) => season - i)
  const loading = years.filter(y => y !== season && hist[y] === undefined).length

  const gamesOn = (p: PlayerLog, y: number): GameLine[] => {
    const src = y === season ? p.games : (() => { const h = hist[y]; return h && h !== 'error' ? h[p.id] ?? [] : [] })()
    return src.filter(g => g.d.slice(5) === md && g.pa > 0)
  }
  const rows = data.hitters.map(p => {
    const byYear = years.map(y => gamesOn(p, y))
    const all = byYear.flat().sort((a, b) => b.d.localeCompare(a.d))
    return { p, byYear, all, t: sum(all) }
  }).filter(r => r.all.length > 0).sort((a, b) => b.t.h + b.t.hr * 2 + b.t.rbi - (a.t.h + a.t.hr * 2 + a.t.rbi))
  const failedYears = years.filter(y => hist[y] === 'error')

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <button style={chip(false)} onClick={() => setMd(shiftDay(md, -1))}>◀ Day before</button>
        <input type="date" value={`${season}-${md}`} min={`${season}-01-01`} max={`${season}-12-31`} onChange={e => e.target.value && setMd(e.target.value.slice(5))} style={sel} />
        <button style={chip(false)} onClick={() => setMd(shiftDay(md, 1))}>Day after ▶</button>
        <button style={chip(false)} onClick={() => setMd(latest.slice(5))}>Latest game day</button>
        <span style={{ fontFamily: SANS, fontSize: 11, color: C.mute }}>
          {loading > 0 ? `Loading ${loading} past season${loading > 1 ? 's' : ''}…` : `${rows.length} hitters have played on ${day(`${season}-${md}`)} in the last ${YEARS_BACK + 1} seasons`}
        </span>
        {failedYears.length > 0 && <button style={chip(false)} onClick={() => { failedYears.forEach(y => asked.current.delete(`${data.teamId}:${y}`)); setHist(h => { const n = { ...h }; failedYears.forEach(y => delete n[y]); return n }) }}>Retry {failedYears.join(', ')}</button>}
      </div>
      <p style={{ fontFamily: SANS, fontSize: 13, color: '#5b5347', margin: '0 0 10px' }}>Every hitter&apos;s line on this calendar date, season by season. Click a player for each game with opponent and full stats.</p>
      {rows.length === 0 && loading === 0 ? <p style={{ fontFamily: SANS, color: C.mute }}>Nobody on this roster played on {day(`${season}-${md}`)} in these seasons. Try another date.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}>Player</th>{years.map(y => <th key={y} style={th}>{y}</th>)}<th style={th}>All</th></tr></thead>
            <tbody>
              {rows.map(({ p, byYear, all, t }) => {
                const isOpen = open === p.id
                return [
                  <tr key={p.id} onClick={() => setOpen(isOpen ? null : p.id)} style={{ cursor: 'pointer', borderTop: `1px solid ${C.soft}`, ...(isOpen ? rowOpen : {}) }}>
                    <td style={{ padding: '5px 8px' }}><NameCell p={p} /></td>
                    {byYear.map((gs, i) => <td key={i} style={{ ...td, color: gs.length ? C.ink : C.faint, fontWeight: gs.some(g => g.hr) ? 700 : 400 }}>{gs.length ? gs.map(lineText).join(' / ') : '—'}</td>)}
                    <td style={{ ...td, fontFamily: SANS, fontWeight: 800 }}>{t.h}-{t.ab}{t.hr ? `, ${t.hr} HR` : ''}</td>
                  </tr>,
                  isOpen && detailCell(years.length + 2, <><div style={{ fontFamily: SANS, fontSize: 10.5, color: C.mute, margin: '6px 0 8px' }}>{all.length} game{all.length > 1 ? 's' : ''} on {day(`${season}-${md}`)} · {t.h}-{t.ab}, {t.hr} HR, {t.rbi} RBI</div><GameTable games={all} /></>),
                ]
              })}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontFamily: SANS, fontSize: 9.5, color: C.faint, marginTop: 8 }}>Past seasons show today&apos;s active hitters only, including games they played for other clubs. Doubleheaders show both games.</p>
    </>
  )
}

// ---- Head to head ---------------------------------------------------------
function HeadToHead({ data, store }: { data: TeamPlayers; store: Store }) {
  const others = [...MLB_TEAMS].filter(t => t.id !== data.teamId).sort((a, b) => a.name.localeCompare(b.name))
  const [oppId, setOppId] = useState(others[0].id)
  const [pitcher, setPitcher] = useState<number | null>(null)
  const [res, setRes] = useState<Record<number, H2HLine | null> | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [showAll, setShowAll] = useState(false)
  useEffect(() => { store.ensure(oppId) }, [oppId, store])
  const opp = store.get(oppId)
  useEffect(() => { setPitcher(null); setRes(null) }, [oppId, data.teamId])
  const chosen = opp?.pitchers.find(p => p.id === pitcher)
  const run = () => {
    if (!pitcher) return
    setState('loading')
    loadH2H(pitcher, data.hitters.map(h => h.id)).then(r => { setRes(r); setState('idle') }).catch(() => setState('error'))
  }
  const rows = res ? data.hitters.map(p => ({ p, l: res[p.id] ?? null })).filter(r => showAll || r.l).sort((a, b) => (b.l?.pa ?? 0) - (a.l?.pa ?? 0)) : []
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontFamily: SANS, fontSize: 13, color: '#5b5347' }}>{teamName(data.teamId)} hitters against</span>
        <select value={oppId} onChange={e => setOppId(Number(e.target.value))} style={sel}>{others.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <select value={pitcher ?? ''} onChange={e => { setPitcher(Number(e.target.value) || null); setRes(null) }} style={sel} disabled={!opp}>
          <option value="">{opp ? 'Choose a pitcher' : 'Loading pitchers…'}</option>
          {opp?.pitchers.map(p => <option key={p.id} value={p.id}>{p.name}{p.hand ? ` (${p.hand}HP)` : ''}</option>)}
        </select>
        <button style={{ ...chip(true), background: C.orange, borderColor: C.orange, opacity: pitcher ? 1 : 0.4 }} disabled={!pitcher || state === 'loading'} onClick={run}>{state === 'loading' ? 'Loading…' : 'Show head-to-head'}</button>
        {res && <label style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: '#5b5347' }}><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Include hitters who never faced him</label>}
      </div>
      {state === 'error' && <p style={{ fontFamily: SANS, fontSize: 11, color: C.bad }}>Couldn&apos;t load that matchup. Try again.</p>}
      {res && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            {chosen && <Face p={chosen} size={52} />}
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 15 }}>{chosen?.name}<span style={{ fontFamily: SANS, fontWeight: 400, fontSize: 10, color: C.faint }}> · career, regular season + all years</span></div>
          </div>
          {rows.length === 0 ? <p style={{ fontFamily: SANS, color: C.mute }}>None of these hitters has faced {chosen?.name}. Empty, not zero.</p> : (
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
              <thead><tr><th style={{ ...th, textAlign: 'left' }}>Hitter</th>{['PA', 'AB', 'H', 'HR', 'RBI', 'BB', 'K', 'AVG', 'OPS'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{rows.map(({ p, l }) => (
                <tr key={p.id} style={{ borderTop: `1px solid ${C.soft}` }}>
                  <td style={{ padding: '5px 8px' }}><NameCell p={p} /></td>
                  {l ? [l.pa, l.ab, l.h, l.hr, l.rbi, l.bb, l.k, l.avg, l.ops].map((v, i) => <td key={i} style={td}>{v}</td>) : <td colSpan={9} style={{ ...td, color: C.faint }}>no plate appearances</td>}
                </tr>))}</tbody>
            </table>
          )}
          <p style={{ fontFamily: SANS, fontSize: 9.5, color: C.faint, marginTop: 8 }}>Small samples swing wildly. Read the PA column before the average.</p>
        </div>
      )}
    </>
  )
}

// ---- Roster builder -------------------------------------------------------
type Summary = { n: number; tot: Tot; r: ReturnType<typeof rates>; sdOps: number; top3: number; L: number; R: number; S: number }
function summarise(ps: PlayerLog[]): Summary {
  const per = ps.map(p => ({ p, t: sum(p.games.filter(g => !g.ps)) }))
  const tot = per.reduce((a, x) => addTot(a, x.t), sum([]))
  const ops = per.filter(x => x.t.pa >= 50).map(x => rates(x.t).ops).filter(Number.isFinite)
  const mean = ops.reduce((a, b) => a + b, 0) / (ops.length || 1)
  const sd = ops.length > 1 ? Math.sqrt(ops.reduce((a, b) => a + (b - mean) ** 2, 0) / (ops.length - 1)) : NaN
  const tb = per.map(x => x.t.tb).sort((a, b) => b - a)
  return {
    n: ps.length, tot, r: rates(tot), sdOps: sd, top3: tot.tb ? (100 * tb.slice(0, 3).reduce((a, b) => a + b, 0)) / tot.tb : NaN,
    L: ps.filter(p => p.bats === 'L').length, R: ps.filter(p => p.bats === 'R').length, S: ps.filter(p => p.bats === 'S').length,
  }
}

function RosterBuilder({ data, store }: { data: TeamPlayers; store: Store }) {
  const base = data.hitters.filter(p => p.games.length > 0)
  const [built, setBuilt] = useState<PlayerLog[]>(base)
  const [fromId, setFromId] = useState(data.teamId)
  useEffect(() => { setBuilt(base); setFromId(data.teamId) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [data.teamId])
  useEffect(() => { store.ensure(fromId) }, [fromId, store])
  const pool = store.get(fromId)?.hitters.filter(p => p.games.length > 0 && !built.some(b => b.id === p.id)) ?? []
  const a = useMemo(() => summarise(base), [base])
  const b = useMemo(() => summarise(built), [built])
  const same = built.length === base.length && built.every(p => base.some(q => q.id === p.id))

  const metrics: { label: string; a: number; b: number; fmt: (v: number) => string; better?: 'hi' | 'lo'; unit?: string }[] = [
    { label: 'Hitters', a: a.n, b: b.n, fmt: v => String(v) },
    { label: 'AVG', a: a.r.avg, b: b.r.avg, fmt: f3, better: 'hi' },
    { label: 'OBP', a: a.r.obp, b: b.r.obp, fmt: f3, better: 'hi' },
    { label: 'SLG', a: a.r.slg, b: b.r.slg, fmt: f3, better: 'hi' },
    { label: 'OPS', a: a.r.ops, b: b.r.ops, fmt: f3, better: 'hi' },
    { label: 'K %', a: a.r.kPct, b: b.r.kPct, fmt: v => v.toFixed(1), better: 'lo' },
    { label: 'BB %', a: a.r.bbPct, b: b.r.bbPct, fmt: v => v.toFixed(1), better: 'hi' },
    { label: 'Home runs', a: a.tot.hr, b: b.tot.hr, fmt: v => String(v), better: 'hi' },
    { label: 'RBI', a: a.tot.rbi, b: b.tot.rbi, fmt: v => String(v), better: 'hi' },
    { label: 'Runs', a: a.tot.r, b: b.tot.r, fmt: v => String(v), better: 'hi' },
    { label: 'Steals', a: a.tot.sb, b: b.tot.sb, fmt: v => String(v), better: 'hi' },
    { label: 'Variation: OPS std dev', a: a.sdOps, b: b.sdOps, fmt: f3 },
    { label: 'Top 3 share of total bases %', a: a.top3, b: b.top3, fmt: v => v.toFixed(1) },
    { label: 'Left-handed bats', a: a.L, b: b.L, fmt: v => String(v) },
    { label: 'Right-handed bats', a: a.R, b: b.R, fmt: v => String(v) },
    { label: 'Switch hitters', a: a.S, b: b.S, fmt: v => String(v) },
  ]
  return (
    <>
      <p style={{ fontFamily: SANS, fontSize: 13, color: '#5b5347', margin: '0 0 10px' }}>
        Swap hitters in and out of the {teamName(data.teamId)} active roster to see how the team line and the variation between players move. Each player brings his own {data.season} numbers, so this describes the group, not a forecast.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18 }} className="rb-grid">
        <style>{`@media (max-width: 800px){ .rb-grid { grid-template-columns: minmax(0,1fr) !important } }`}</style>
        <div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 13 }}>Your roster ({built.length})</span>
            <button style={chip(false)} onClick={() => setBuilt(base)} disabled={same}>Reset to current</button>
            <button style={chip(false)} onClick={() => setBuilt([])} disabled={built.length === 0}>Clear</button>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto', border: `1px solid ${C.line}`, borderRadius: 10 }}>
            {built.length === 0 && <p style={{ fontFamily: SANS, color: C.faint, padding: 14, margin: 0 }}>Empty. Bring in hitters from any club.</p>}
            {built.map(p => {
              const t = sum(p.games.filter(g => !g.ps)), r = rates(t)
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderTop: `1px solid ${C.soft}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}><NameCell p={p} sub={`${f3(r.ops)} OPS`} /></div>
                  {!base.some(q => q.id === p.id) && <span style={{ fontFamily: SANS, fontSize: 9, color: C.orange }}>NEW</span>}
                  <button aria-label={`Remove ${p.name}`} style={{ ...chip(false), padding: '2px 9px' }} onClick={() => setBuilt(x => x.filter(q => q.id !== p.id))}>✕</button>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0 6px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 13 }}>Bring in from</span>
            <select value={fromId} onChange={e => setFromId(Number(e.target.value))} style={sel}>
              {[...MLB_TEAMS].sort((x, y) => x.name.localeCompare(y.name)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto', border: `1px solid ${C.line}`, borderRadius: 10 }}>
            {!store.get(fromId) && <p style={{ fontFamily: SANS, fontSize: 11, color: C.faint, padding: 12, margin: 0 }}>{store.failed(fromId) ? 'Could not load this club.' : 'Loading…'}</p>}
            {pool.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderTop: `1px solid ${C.soft}` }}>
                <div style={{ flex: 1, minWidth: 0 }}><NameCell p={p} sub={`${f3(rates(sum(p.games.filter(g => !g.ps))).ops)} OPS`} /></div>
                <button style={{ ...chip(true), background: C.orange, borderColor: C.orange, padding: '3px 10px' }} onClick={() => setBuilt(x => [...x, p])}>+ New</button>
              </div>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}>Team line</th><th style={th}>Current</th><th style={th}>Yours</th><th style={th}>Change</th></tr></thead>
            <tbody>{metrics.map(m => {
              const d = m.b - m.a
              const show = Number.isFinite(d)
              const good = m.better && show && d !== 0 ? ((d > 0) === (m.better === 'hi')) : null
              return (
                <tr key={m.label} style={{ borderTop: `1px solid ${C.soft}` }}>
                  <td style={{ ...td, textAlign: 'left', fontFamily: SANS, fontWeight: 600 }}>{m.label}</td>
                  <td style={td}>{Number.isFinite(m.a) ? m.fmt(m.a) : '—'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{Number.isFinite(m.b) ? m.fmt(m.b) : '—'}</td>
                  <td style={{ ...td, color: good === null ? C.mute : good ? C.good : C.bad }}>{show ? `${d > 0 ? '+' : d < 0 ? '−' : ''}${m.fmt(Math.abs(d))}` : '—'}</td>
                </tr>
              )
            })}</tbody>
          </table>
          <p style={{ fontFamily: SANS, fontSize: 9.5, color: C.faint, lineHeight: 1.6, marginTop: 8 }}>
            Rates are pooled over every plate appearance in the group; counting stats are totals for the players chosen. Variation = standard deviation of OPS across hitters with 50+ PA: lower means production is more evenly shared. Top 3 share = how much of the group&apos;s total bases come from its three best.
          </p>
        </div>
      </div>
    </>
  )
}
