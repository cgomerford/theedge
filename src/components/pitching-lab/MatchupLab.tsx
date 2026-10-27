'use client'

// src/components/pitching-lab/MatchupLab.tsx
//
// Pitching Lab → H2H. One pitcher against one hitter, every time they have met in the Statcast era (2015 on, regular season), from the
// pitcher's career per-pitch log: the totals, how each pitch type has done, where the pitches went, and every plate appearance with
// the pitches in it (type, speed, zone, count, result, exit speed), filterable by season, runners and result.
// Pick an opponent on the left, then a hitter from that club's 40-man roster (hitters this pitcher has faced come first, with the plate
// appearances), or search any player, or take one of the hitters he has faced most.
//
// Data: /api/mlb/pitch-log?summary=matchups (one compact row per game and hitter, for team, ballpark and who-he-has-faced), ...&batterId= (the
// pitches to one hitter), /api/mlb/game-teams (club and ballpark of each game), /api/mlb/team-roster, /api/lab/search. A season / career switch
// sets the range for all of them. Counting uses src/lib/zone-stats.ts. Nothing is estimated; a hitter he has not faced says so.

import { useEffect, useMemo, useState } from 'react'
import { Headshot, TeamMark } from '@/components/home/Logo'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import { C, SANS } from '@/components/team/ui'
import { pitchColor } from '@/lib/mlb'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { MLB_TEAMS } from '@/lib/teams'
import type { PitcherPitchLog, RawPitch } from '@/lib/pitcher-pitch-log'
import { aggregate, arrToAgg, merge, metric, type Agg } from '@/lib/zone-stats'
import { batterAsPitchLog, type LabRole } from '@/lib/lab-log'
import type { BatterPitchLog } from '@/lib/batter-pitch-log'
import { SmoothHeatmap } from './ArsenalExtras'
import { Pills, kick, note, star, tile } from './LocationExplorer'

type Person = { id: number; name: string }
type Row = { g: number; d: string; tb: 'T' | 'B' | null; b: number; a: number[]; k: number; bb: number; hr: number }
type GameInfo = { away: number; home: number; venueId: number | null; venue: string }
type Tot = { agg: Agg; k: number; bb: number; hr: number; games: Set<number> }
const newTot = (): Tot => ({ agg: merge([]), k: 0, bb: 0, hr: 0, games: new Set() })
function addRow(t: Tot, r: Row) { t.agg = merge([t.agg, arrToAgg(r.a)]); t.k += r.k; t.bb += r.bb; t.hr += r.hr; t.games.add(r.g) }
type Scope = 'season' | 'career'
type RosterRow = { id: number; name: string; pos: string }
type PA = { key: string; date: string; inning: number | null; runners: string; pitches: RawPitch[]; event: string | null; kind: 'hit' | 'hr' | 'k' | 'bb' | 'out' | 'open'; text: string }

const f3 = (v: number | null) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.'))
const pc = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`)
const label = (e: string) => e.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())

const avgOf = (a: Agg) => (a.ab > 0 ? a.hits / a.ab : null)
const slgOf = (a: Agg) => (a.ab > 0 ? a.bases / a.ab : null)
function TotRow({ t }: { t: Tot }) {
  const a = t.agg
  const pa = a.den
  return <>
    <td>{t.games.size}</td><td>{pa}</td><td>{a.ab}</td><td>{a.hits}</td><td>{t.hr}</td><td>{t.bb}</td><td>{t.k}</td>
    <td>{f3(avgOf(a))}</td><td>{f3(slgOf(a))}</td><td>{f3(metric(a, 'xwoba', 0).v)}</td>
  </>
}
const TOT_HEAD = <><th>Games</th><th>PA</th><th>AB</th><th>H</th><th>HR</th><th>BB</th><th>K</th><th>AVG</th><th>SLG</th><th>xwOBA</th></>

function resCode(d: string | null): string {
  switch (d) {
    case 'ball': case 'blocked_ball': case 'intent_ball': case 'pitchout': case 'automatic_ball': return 'B'
    case 'called_strike': case 'automatic_strike': return 'CS'
    case 'swinging_strike': case 'swinging_strike_blocked': case 'missed_bunt': case 'foul_tip': return 'SS'
    case 'foul': case 'foul_bunt': return 'F'
    case 'hit_into_play': return 'IP'
    case 'hit_by_pitch': return 'HBP'
    default: return ''
  }
}
const resWord: Record<string, string> = { B: 'Ball', CS: 'Called strike', SS: 'Swinging strike', F: 'Foul', IP: 'In play', HBP: 'Hit by pitch' }

function buildPAs(pitches: RawPitch[]): PA[] {
  const by = new Map<string, RawPitch[]>()
  for (const p of pitches) {
    if (p.gamePk == null || p.atBatNumber == null) continue
    const k = `${p.gamePk}-${p.atBatNumber}`
    if (!by.has(k)) by.set(k, [])
    by.get(k)!.push(p)
  }
  const out: PA[] = []
  for (const [key, ps] of by) {
    ps.sort((a, b) => (a.pitchNumber ?? 0) - (b.pitchNumber ?? 0))
    const first = ps[0], last = ps[ps.length - 1]
    const ended = last.wobaDen != null && last.wobaDen > 0
    const ev = ended ? last.result ?? '' : ''
    let kind: PA['kind'] = 'open', text = 'No result recorded'
    if (ended) {
      if (ev === 'home_run') { kind = 'hr'; text = 'Home run' }
      else if (last.isHit) { kind = 'hit'; text = label(ev) }
      else if (ev.startsWith('strikeout')) { kind = 'k'; text = `Strikeout ${last.description === 'called_strike' ? 'looking' : 'swinging'}` }
      else if (ev === 'walk' || ev === 'intent_walk' || ev === 'hit_by_pitch') { kind = 'bb'; text = label(ev) }
      else { kind = 'out'; text = label(ev || 'Out') }
    }
    const r = [first.onBase.first ? '1B' : '', first.onBase.second ? '2B' : '', first.onBase.third ? '3B' : ''].filter(Boolean).join(' ')
    out.push({ key, date: first.date, inning: first.inning, runners: r || 'Bases empty', pitches: ps, event: ev || null, kind, text })
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.key < b.key ? 1 : -1))
}

export default function MatchupLab({ id: pitcherId, name: pitcherName, role = 'pitcher' }: { id: number; name: string; role?: LabRole }) {
  const opp = role === 'batter' ? 'pitcher' : 'hitter'   // the other side of every matchup on this tab
  const season = new Date().getFullYear()
  const [scope, setScope] = useState<Scope>('career')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [names, setNames] = useState<Record<number, string>>({})
  const [games, setGames] = useState<Record<number, GameInfo>>({})
  const [park, setPark] = useState('any')
  const [teamId, setTeamId] = useState<number | null>(null)
  const [roster, setRoster] = useState<RosterRow[] | null>(null)
  const [batter, setBatter] = useState<Person | null>(null)
  const [log, setLog] = useState<PitcherPitchLog | null | 'error'>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: number; fullName: string }[]>([])
  const [yr, setYr] = useState('all')
  const [runners, setRunners] = useState<'any' | 'on' | 'empty'>('any')
  const [kind, setKind] = useState<PA['kind'] | 'all'>('all')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let off = false
    const url = role === 'pitcher' ? `/api/mlb/pitch-log?playerId=${pitcherId}&season=${season}&range=${scope}&summary=matchups` : `/api/mlb/batter-pitch-log?batterId=${pitcherId}&season=${season}&range=${scope}&summary=matchups`
    fetch(url).then(r => r.json()).then(j => {
      if (off) return
      if (j.error) { setRows([]); return }
      // In a hitter's rows the opponent is the pitcher (`p`); keep it under `b`, the opponent id, so the rest of this file is the same for both.
      const rs = (j.rows as (Row & { p?: number })[]).map(r => (role === 'batter' ? { ...r, b: r.p as number } : r)) as Row[]
      setRows(rs); setNames(j.names as Record<number, string>)
      const ids = [...new Set(rs.map(r => r.g))]
      if (ids.length) fetch(`/api/mlb/game-teams?gamePks=${ids.slice(0, 400).join(',')}`).then(x => x.json()).then(g => { if (!off && g.games) setGames(prev => ({ ...prev, ...g.games })) }).catch(() => {})
    }).catch(() => { if (!off) setRows([]) })
    return () => { off = true }
  }, [role, pitcherId, season, scope])

  useEffect(() => {
    if (teamId == null) return
    let off = false
    fetch(`/api/mlb/team-roster?teamId=${teamId}${role === 'batter' ? '&pos=pitchers' : ''}`).then(r => r.json()).then(j => { if (!off) setRoster(j.error ? [] : (j.players as RosterRow[])) }).catch(() => { if (!off) setRoster([]) })
    return () => { off = true }
  }, [teamId])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) return
    const t = setTimeout(() => {
      fetch(`/api/lab/search?q=${encodeURIComponent(q)}`).then(r => r.json()).then(d => setResults((d.people ?? []).slice(0, 6))).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!batter) return
    let off = false
    const url = role === 'pitcher' ? `/api/mlb/pitch-log?playerId=${pitcherId}&season=${season}&range=${scope}&batterId=${batter.id}` : `/api/mlb/batter-pitch-log?batterId=${pitcherId}&season=${season}&range=${scope}&pitcherId=${batter.id}`
    fetch(url).then(r => r.json()).then(j => { if (!off) setLog(j.error ? 'error' : role === 'pitcher' ? j : batterAsPitchLog(j as BatterPitchLog)) }).catch(() => { if (!off) setLog('error') })
    return () => { off = true }
  }, [role, pitcherId, season, batter, scope])

  // The opponent's club in that game: a hitter's club is the away side when the top of the inning is being played; a pitcher's is the home side.
  const batterTeam = (r: Row): number | null => { const g = games[r.g]; if (!g || !r.tb) return null; const away = r.tb === 'T'; return (role === 'pitcher') === away ? g.away : g.home }
  const facedMap = useMemo(() => {
    const m = new Map<number, { id: number; name: string; pa: number }>()
    for (const r of rows ?? []) { const e = m.get(r.b) ?? { id: r.b, name: names[r.b] ?? `#${r.b}`, pa: 0 }; e.pa += arrToAgg(r.a).den; m.set(r.b, e) }
    return m
  }, [rows, names])
  const faced = useMemo(() => [...facedMap.values()].sort((a, b) => b.pa - a.pa), [facedMap])
  const byTeam = useMemo(() => {
    const m = new Map<number, Tot>()
    for (const r of rows ?? []) { const t = batterTeam(r); if (t == null) continue; if (!m.has(t)) m.set(t, newTot()); addRow(m.get(t)!, r) }
    return m
  }, [rows, games]) // eslint-disable-line react-hooks/exhaustive-deps
  const byPark = useMemo(() => {
    const m = new Map<string, Tot & { name: string }>()
    for (const r of rows ?? []) { const g = games[r.g]; if (!g) continue; const k = String(g.venueId ?? g.venue); if (!m.has(k)) m.set(k, { ...newTot(), name: g.venue }); addRow(m.get(k)!, r) }
    return [...m.entries()].sort((a, b) => b[1].agg.den - a[1].agg.den)
  }, [rows, games])
  const teamHitters = useMemo(() => {
    const m = new Map<number, Tot>()
    if (teamId == null) return []
    for (const r of rows ?? []) if (batterTeam(r) === teamId) { if (!m.has(r.b)) m.set(r.b, newTot()); addRow(m.get(r.b)!, r) }
    return [...m.entries()].sort((a, b) => b[1].agg.den - a[1].agg.den)
  }, [rows, games, teamId]) // eslint-disable-line react-hooks/exhaustive-deps
  const pas = useMemo(() => (log && log !== 'error' ? buildPAs(log.pitches) : []), [log])
  const years = useMemo(() => [...new Set(pas.map(p => p.date.slice(0, 4)))].sort().reverse(), [pas])
  const shown = useMemo(() => pas.filter(p => (yr === 'all' || p.date.startsWith(yr)) && (park === 'any' || String(games[Number(p.key.split('-')[0])]?.venueId) === park) && (runners === 'any' || (runners === 'empty') === (p.runners === 'Bases empty')) && (kind === 'all' || p.kind === kind)), [pas, yr, runners, kind, park, games])
  const shownPitches = useMemo(() => shown.flatMap(p => p.pitches), [shown])
  const agg = useMemo(() => aggregate(shownPitches), [shownPitches])
  const typeRows = useMemo(() => {
    const by = new Map<string, RawPitch[]>()
    for (const p of shownPitches) { if (!by.has(p.pitchType)) by.set(p.pitchType, []); by.get(p.pitchType)!.push(p) }
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length).map(([t, ps]) => {
      const v = ps.filter(p => p.velo != null).map(p => p.velo as number)
      return { t, n: ps.length, velo: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, agg: aggregate(ps).all }
    })
  }, [shownPitches])

  const team = MLB_TEAMS.find(t => t.id === teamId) ?? null
  const rosterSorted = useMemo(() => (roster ?? []).slice().sort((a, b) => (facedMap.get(b.id)?.pa ?? 0) - (facedMap.get(a.id)?.pa ?? 0) || a.name.localeCompare(b.name)), [roster, facedMap])
  const choose = (p: Person) => { setBatter(p); setLog(null); setYr('all'); setPark('any'); setRunners('any'); setKind('all'); setOpen(null); setQuery(''); setResults([]) }
  const last = (n: string) => n.split(' ').slice(-1)[0]

  let K = 0, BB = 0, HR = 0
  for (const p of shown) { if (p.kind === 'k') K++; else if (p.kind === 'bb') BB++; if (p.kind === 'hr') HR++ }
  const pa = shown.filter(p => p.kind !== 'open').length

  return (
    <div className="h2-grid">
      <style>{`.h2-grid{display:grid;grid-template-columns:210px minmax(0,1fr);gap:24px;align-items:start}.h2-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px;max-height:calc(100vh - 80px);overflow-y:auto;padding-right:2px}.h2-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:7px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:13px;color:#1A1A1A;font-family:inherit;flex-shrink:0}.h2-btn.on{border-color:#FF5722;background:#fff1ea}.h2-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.h2-span2{grid-column:span 2}.h2-span3{grid-column:1 / -1}.h2-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.h2-tbl th{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a89e8c;text-align:right;padding:6px 8px;border-bottom:1px solid #e7e2d8}.h2-tbl th:first-child,.h2-tbl td:first-child{text-align:left}.h2-tbl td{text-align:right;padding:7px 8px;border-top:1px solid #f1eee6}.h2-pa{width:100%;text-align:left;background:#fff;border:1px solid #e7e2d8;border-radius:12px;padding:10px 12px;cursor:pointer;font-family:inherit}.h2-pa:hover{border-color:#FF5722}@media (max-width:1180px){.h2-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:860px){.h2-grid{grid-template-columns:minmax(0,1fr)}.h2-side{position:static;flex-direction:row;overflow-x:auto;max-height:none;padding-bottom:4px}.h2-btn{width:auto;white-space:nowrap}.h2-tiles{grid-template-columns:minmax(0,1fr)}.h2-span2{grid-column:auto}}`}</style>
      <SpinBallStyles />

      <nav className="h2-side" aria-label="Opponent">
        <div style={{ ...kick, margin: '0 2px 2px' }}>Opponent</div>
        {MLB_TEAMS.map(t => (
          <button key={t.id} type="button" className={`h2-btn${teamId === t.id ? ' on' : ''}`} onClick={() => { setTeamId(t.id); setRoster(null) }}>
            <TeamMark id={t.id} abbr={t.abbrev} size={22} />
            <span style={{ fontWeight: 600, color: C.mute, fontSize: 11, lineHeight: 1.25, marginLeft: 'auto', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {(() => { const x = byTeam.get(t.id); return x ? <>{x.agg.den} PA<br />{f3(avgOf(x.agg))} AVG</> : rows === null ? '' : 'no PA' })()}
            </span>
          </button>
        ))}
      </nav>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Pills items={[['season', `This season (${season})`], ['career', 'Career (2015 on)']] as [Scope, string][]} value={scope} onChange={v => { setScope(v); setRows(null); setLog(null) }} />
          <span style={{ fontSize: 12, color: C.mute }}>Applies to every number on this tab. Regular season, Statcast data.</span>
        </div>
        <div style={{ ...tile, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={kick}>{pitcherName} against…</div>
          {batter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Headshot id={batter.id} name={batter.name} size={52} />
              <div>
                <b style={{ fontSize: 24, fontWeight: 800 }}>{batter.name}</b>
                <div style={{ fontSize: 13, color: C.mute }}>{log === null ? 'Loading every meeting…' : log === 'error' ? 'Couldn’t load this matchup right now.' : pas.length === 0 ? 'They have not met in the regular-season Statcast data (2015 on).' : `${pas.filter(p => p.kind !== 'open').length} plate appearances since ${years[years.length - 1]}`}</div>
              </div>
              <button type="button" onClick={() => { setBatter(null); setLog(null) }} style={{ marginLeft: 'auto', fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.orange, background: 'none', border: 0, cursor: 'pointer' }}>{`Change ${opp}`}</button>
            </div>
          )}
          {!batter && (
            <>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search any ${opp}`} aria-label={`Search any ${opp}`} style={{ fontFamily: SANS, fontSize: 15, padding: '9px 12px', border: `1px solid ${C.line}`, borderRadius: 10, maxWidth: 360 }} />
              {query.trim().length >= 3 && results.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {results.map(r => <button key={r.id} type="button" onClick={() => choose({ id: r.id, name: r.fullName })} style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, borderRadius: 999, padding: '4px 12px', border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer' }}>{r.fullName}</button>)}
                </div>
              )}
              {team && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.mute, marginBottom: 6 }}>{team.name} {opp}s{roster === null ? ' (loading)' : ''}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {rosterSorted.map(r => {
                      const f = facedMap.get(r.id)
                      return (
                        <button key={r.id} type="button" onClick={() => choose({ id: r.id, name: r.name })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontSize: 13, fontWeight: 800, borderRadius: 999, padding: '4px 12px 4px 6px', border: `1px solid ${f ? C.orange : C.line}`, background: f ? '#fff1ea' : '#fff', color: f ? C.ink : C.mute, cursor: 'pointer' }}>
                          <Headshot id={r.id} name={r.name} size={24} />{r.name} <span style={{ fontWeight: 600, color: C.faint }}>{r.pos}{f ? ` · ${f.pa} PA` : ''}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {!team && <div style={{ fontSize: 13, color: C.mute }}>Choose an opponent on the left for its {opp}s, or search for any player. {opp === 'pitcher' ? 'Pitchers' : 'Hitters'} {pitcherName} has faced are marked with their plate appearances.</div>}
              {faced && faced.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.mute, marginBottom: 6 }}>Faced most</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {faced.slice(0, 12).map(f => <button key={f.id} type="button" onClick={() => choose({ id: f.id, name: f.name })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontSize: 13, fontWeight: 800, borderRadius: 999, padding: '4px 12px 4px 6px', border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer' }}><Headshot id={f.id} name={f.name} size={24} />{f.name} <span style={{ fontWeight: 600, color: C.faint }}>{f.pa} PA</span></button>)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>


        {!batter && (
          <div className="h2-tiles">
            {team && (() => {
              const t = byTeam.get(team.id)
              return (
                <div className="h2-span3" style={{ ...tile, overflowX: 'auto' }}>
                  <div style={kick}>{pitcherName} vs {team.name} · {scope === 'season' ? `${season}` : 'career'}</div>
                  {rows === null ? <p style={note}>Loading…</p> : !t ? <p style={note}>No plate appearances against {team.short} {scope === 'season' ? 'this season' : 'in the Statcast data'}.</p> : (
                    <>
                      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(86px,1fr))', gap: '12px 10px', margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                        {([
                          ['Games', String(t.games.size)], ['PA', String(t.agg.den)], ['H', String(t.agg.hits)], ['HR', String(t.hr)], ['BB', String(t.bb)], ['K', String(t.k)],
                          ['AVG', f3(avgOf(t.agg))], ['SLG', f3(slgOf(t.agg))], ['xwOBA', f3(metric(t.agg, 'xwoba', 0).v)],
                          ['K rate', t.agg.den ? pc(t.k / t.agg.den) : '—'], ['BB rate', t.agg.den ? pc(t.bb / t.agg.den) : '—'], ['Whiff', pc(metric(t.agg, 'whiff', 0).v)],
                        ] as [string, string][]).map(([k, v]) => <div key={k}><dt style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }}>{k}</dt><dd style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{v}</dd></div>)}
                      </dl>
                      <p style={note}>{t.agg.den < MIN_SAMPLE.h2hPA ? <>{star} Under {MIN_SAMPLE.h2hPA} plate appearances: a small sample. </> : ''}{opp === 'pitcher' ? 'Pitchers' : 'Hitters'} are counted for the club they were playing for in each game, so a player who has since moved is under the old club. Choose one below, or from the roster above.</p>
                      <table className="h2-tbl" style={{ marginTop: 8, minWidth: 620 }}>
                        <thead><tr><th>{opp === 'pitcher' ? 'Pitcher' : 'Hitter'}</th><th>PA</th><th>AB</th><th>H</th><th>HR</th><th>BB</th><th>K</th><th>AVG</th><th>SLG</th><th>xwOBA</th></tr></thead>
                        <tbody>
                          {teamHitters.map(([id, x]) => (
                            <tr key={id} style={{ cursor: 'pointer' }} onClick={() => choose({ id, name: names[id] ?? `#${id}` })}>
                              <td style={{ fontWeight: 800 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Headshot id={id} name={names[id] ?? ''} size={24} />{names[id] ?? `#${id}`}</span></td>
                              <td>{x.agg.den}{x.agg.den < MIN_SAMPLE.h2hPA && star}</td><td>{x.agg.ab}</td><td>{x.agg.hits}</td><td>{x.hr}</td><td>{x.bb}</td><td>{x.k}</td>
                              <td>{f3(avgOf(x.agg))}</td><td>{f3(slgOf(x.agg))}</td><td>{f3(metric(x.agg, 'xwoba', 0).v)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )
            })()}

            <div className="h2-span3" style={{ ...tile, overflowX: 'auto' }}>
              <div style={kick}>By ballpark · {scope === 'season' ? `${season}` : 'career'}</div>
              {rows === null ? <p style={note}>Loading…</p> : byPark.length === 0 ? <p style={note}>No games found.</p> : (
                <table className="h2-tbl" style={{ marginTop: 6, minWidth: 620 }}>
                  <thead><tr><th>Ballpark</th>{TOT_HEAD}</tr></thead>
                  <tbody>
                    {byPark.map(([k, x]) => <tr key={k}><td style={{ fontWeight: 800 }}>{x.name || 'Unknown'}</td><TotRow t={x} /></tr>)}
                  </tbody>
                </table>
              )}
              <p style={note}>Where the game was played, whichever club was at home. Ballpark names come from the MLB schedule; a park that has been renamed shows its name for that game.</p>
            </div>
          </div>
        )}

        {batter && log && log !== 'error' && pas.length > 0 && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center' }}>
              <Pills items={[['all', 'All seasons'], ...years.map(y => [y, y] as [string, string])]} value={yr} onChange={setYr} />
              <Pills items={[['any', 'Any runners'], ['on', 'Runners on'], ['empty', 'Bases empty']] as ['any' | 'on' | 'empty', string][]} value={runners} onChange={setRunners} />
              <select value={park} onChange={e => setPark(e.target.value)} aria-label="Ballpark" style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '4px 10px', border: `1px solid ${park === 'any' ? C.line : C.orange}`, background: '#fff', color: C.ink }}>
                <option value="any">Any ballpark</option>
                {[...new Map(pas.map(p => games[Number(p.key.split('-')[0])]).filter(Boolean).map(g => [String(g.venueId), g.venue])).entries()].map(([id, nm]) => <option key={id} value={id}>{nm}</option>)}
              </select>
              <Pills items={[['all', 'Any result'], ['hit', 'Hits'], ['hr', 'Home runs'], ['out', 'Outs'], ['k', 'Strikeouts'], ['bb', 'Walks']] as [PA['kind'] | 'all', string][]} value={kind} onChange={setKind} />
            </div>

            <div className="h2-tiles">
              <div className="h2-span2" style={tile}>
                <div style={kick}>{pitcherName} vs {batter.name} · the totals</div>
                <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(86px,1fr))', gap: '12px 10px', margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                  {([
                    ['PA', String(pa)], ['AB', String(agg.all.ab)], ['H', String(agg.all.hits)], ['HR', String(HR)], ['BB', String(BB)], ['K', String(K)],
                    ['AVG', f3(metric(agg.all, 'ba', 0).v)], ['SLG', f3(metric(agg.all, 'slg', 0).v)], ['xwOBA', f3(metric(agg.all, 'xwoba', 0).v)],
                    ['Whiff', pc(metric(agg.all, 'whiff', 0).v)], ['Hard-hit', pc(metric(agg.all, 'hard', 0).v)], ['Pitches', String(agg.all.n)],
                  ] as [string, string][]).map(([k, v]) => <div key={k}><dt style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }}>{k}</dt><dd style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{v}</dd></div>)}
                </dl>
                <p style={note}>{pa < MIN_SAMPLE.h2hPA ? <>{star} Under {MIN_SAMPLE.h2hPA} plate appearances: a small sample, so read it as a list of what happened, not a trend. </> : ''}Regular season, 2015 on. AVG, SLG, xwOBA, whiff and hard-hit are over the plate appearances and pitches in the filters above.</p>
              </div>

              <SmoothHeatmap pitches={shownPitches} title={`${last(batter.name)} · where it was thrown`} counts={false} />

              <div className="h2-span3" style={{ ...tile, overflowX: 'auto' }}>
                <div style={kick}>Each pitch type</div>
                <table className="h2-tbl" style={{ marginTop: 6, minWidth: 560 }}>
                  <thead><tr><th>Pitch</th><th>Thrown</th><th>Share</th><th>Velo</th><th>Whiff</th><th>AVG</th><th>SLG</th><th>xwOBA</th><th>Hard-hit</th></tr></thead>
                  <tbody>
                    {typeRows.map(r => (
                      <tr key={r.t}>
                        <td style={{ fontWeight: 800 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><SpinBall code={r.t} size={22} spin={null} />{log.pitchNames[r.t] ?? r.t}</span></td>
                        <td>{r.n}</td><td>{pc(r.n / agg.all.n)}</td><td>{r.velo != null ? `${r.velo.toFixed(1)} mph` : '—'}</td>
                        <td>{pc(metric(r.agg, 'whiff', 0).v)}</td><td>{f3(metric(r.agg, 'ba', 0).v)}</td><td>{f3(metric(r.agg, 'slg', 0).v)}</td><td>{f3(metric(r.agg, 'xwoba', 0).v)}</td><td>{pc(metric(r.agg, 'hard', 0).v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={note}>Rates on a few pitches swing a lot: the Thrown column is the count behind each row.</p>
              </div>

              <div className="h2-span3" style={tile}>
                <div style={kick}>Every plate appearance · {shown.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {shown.map(p => (
                    <div key={p.key}>
                      <button type="button" className="h2-pa" onClick={() => setOpen(open === p.key ? null : p.key)} aria-expanded={open === p.key}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ width: 92, fontWeight: 800, fontSize: 13 }}>{p.date}</span>
                          <span style={{ width: 70, fontSize: 12, color: C.mute }}>{p.inning != null ? `Inning ${p.inning}` : ''}</span>
                          <span style={{ width: 90, fontSize: 12, color: C.mute }}>{p.runners}</span>
                          <span style={{ width: 150, fontSize: 12, color: C.mute }}>{games[Number(p.key.split('-')[0])]?.venue ?? ''}</span>
                          <span style={{ display: 'inline-flex', gap: 4 }}>
                            {p.pitches.map((x, q) => <span key={q} title={`${log.pitchNames[x.pitchType] ?? x.pitchType} ${x.velo != null ? x.velo.toFixed(1) + ' mph' : ''} · ${x.balls}-${x.strikes} · ${resWord[resCode(x.description)] ?? x.description ?? ''}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 999, background: pitchColor(x.pitchType), color: '#fff', fontSize: 9, fontWeight: 800 }}>{resCode(x.description)}</span>)}
                          </span>
                          <b style={{ marginLeft: 'auto', fontSize: 14, color: p.kind === 'hit' || p.kind === 'hr' ? '#D4533B' : p.kind === 'k' ? '#1D2D5C' : C.ink }}>{p.text}</b>
                        </div>
                      </button>
                      {open === p.key && (
                        <div style={{ overflowX: 'auto', padding: '6px 4px 2px' }}>
                          <table className="h2-tbl" style={{ minWidth: 520 }}>
                            <thead><tr><th>#</th><th>Count</th><th>Pitch</th><th>Velo</th><th>Zone</th><th>Result</th><th>Exit speed</th></tr></thead>
                            <tbody>
                              {p.pitches.map((x, q) => (
                                <tr key={q}>
                                  <td>{q + 1}</td><td>{x.balls}-{x.strikes}</td>
                                  <td style={{ fontWeight: 800 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 999, background: pitchColor(x.pitchType) }} />{log.pitchNames[x.pitchType] ?? x.pitchType}</span></td>
                                  <td>{x.velo != null ? x.velo.toFixed(1) : '—'}</td>
                                  <td>{x.zone ? (Number(x.zone) <= 9 ? `Zone ${x.zone}` : `Corner ${x.zone}`) : '—'}</td>
                                  <td>{resWord[resCode(x.description)] ?? x.description ?? '—'}{q === p.pitches.length - 1 && p.event ? ` · ${label(p.event)}` : ''}</td>
                                  <td>{x.exitVelo != null ? `${x.exitVelo.toFixed(1)} mph` : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p style={note}>Each dot is a pitch, coloured by type and marked with how it turned out (B ball, CS called strike, SS swinging strike, F foul, IP in play). Click a plate appearance for the pitch-by-pitch.</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

