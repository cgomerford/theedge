'use client'

// src/components/games/GamesBoard.tsx
//
// The Games scoreboard on The Stats: every game on a date, like the out-of-town board. Pick any date to see
// past games. Today's board refreshes itself every 15 seconds. Each card opens the full game explorer.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { C, SANS } from '@/components/team/ui'
import { teamLogoUrl } from '@/lib/mlb'
import type { BoardGame } from '@/lib/game-explorer'
import { Diamond, GAMES_CSS, Outs } from '@/components/games/gamesUi'

type Filter = 'all' | 'Live' | 'Final' | 'Preview'
const POST = new Set(['F', 'D', 'L', 'W'])

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const nice = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

function Card({ g }: { g: BoardGame }) {
  const live = g.state === 'Live', fin = g.state === 'Final'
  const awayLose = fin && (g.awayRuns ?? 0) < (g.homeRuns ?? 0), homeLose = fin && (g.homeRuns ?? 0) < (g.awayRuns ?? 0)
  const status = live ? <span style={{ color: C.orange }}><i className="gm-live" />LIVE · {g.half === 'Top' ? 'Top' : 'Bot'} {g.inning}</span>
    : fin ? 'FINAL' : new Date(g.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'
  const innings = Math.max(9, g.innings.length)
  const cols = Array.from({ length: innings }, (_, i) => i)
  const cell = (v: number | null | undefined) => (v == null ? '' : v)
  const team = (t: BoardGame['away'], runs: number | null, lose: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, opacity: lose ? 0.6 : 1 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={teamLogoUrl(t.id)} alt="" width={30} height={30} style={{ objectFit: 'contain' }} />
      <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{t.name}</span>
      <span style={{ fontWeight: 800, fontSize: 26, lineHeight: 1 }}>{g.state === 'Preview' ? '–' : runs ?? 0}</span>
    </div>
  )
  return (
    <Link href={`/mlb/stats/games/${g.gamePk}`} className="gm-card" aria-label={`Open ${g.away.name} at ${g.home.name}`} style={{ fontFamily: SANS }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: C.mute }}>
        <span>{status}</span><span>{POST.has(g.gameType) ? 'Postseason' : ''}</span>
      </div>
      {team(g.away, g.awayRuns, awayLose)}
      {team(g.home, g.homeRuns, homeLose)}
      {g.state !== 'Preview' && g.innings.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginTop: 10 }}>
          <thead><tr style={{ color: C.faint }}><th style={{ textAlign: 'left', padding: '1px 3px' }} />{cols.map(i => <th key={i} style={{ padding: '1px 3px', fontWeight: 700 }}>{i + 1}</th>)}<th style={{ padding: '1px 3px' }}>R</th><th style={{ padding: '1px 3px' }}>H</th><th style={{ padding: '1px 3px' }}>E</th></tr></thead>
          <tbody>
            {[[g.away, 'away', g.awayRuns, g.awayHits, g.awayErrors], [g.home, 'home', g.homeRuns, g.homeHits, g.homeErrors]].map(([t, side, r, h, e]) => (
              <tr key={side as string} style={{ textAlign: 'center', fontWeight: 600 }}>
                <td style={{ textAlign: 'left', padding: '1px 3px' }}>{(t as BoardGame['away']).abbr}</td>
                {cols.map(i => <td key={i} style={{ padding: '1px 3px' }}>{cell(g.innings[i]?.[side as 'away' | 'home'])}</td>)}
                <td style={{ fontWeight: 800, padding: '1px 3px' }}>{r as number}</td><td style={{ padding: '1px 3px' }}>{h as number}</td><td style={{ padding: '1px 3px' }}>{e as number}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {live && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.soft}` }}>
          <Diamond mask={g.baseState} size={60} />
          <div style={{ fontSize: 12, color: '#5b5347', lineHeight: 1.4 }}>
            <b style={{ color: C.ink }}>{g.balls}-{g.strikes}</b> count · {g.outs} out <Outs n={g.outs} /><br />
            {g.batter} vs {g.pitcher}
          </div>
        </div>
      )}
      {fin && (g.winner || g.loser) && (
        <div style={{ fontSize: 12, color: C.mute, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.soft}` }}>
          {g.winner && <>W <b style={{ color: C.ink }}>{g.winner}</b></>}{g.winner && g.loser && ' · '}{g.loser && <>L <b style={{ color: C.ink }}>{g.loser}</b></>}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: C.orange, marginTop: 10 }}>
        <span>{live ? 'Follow this game' : fin ? 'Open the full game' : 'Open game'}</span><span aria-hidden>→</span>
      </div>
    </Link>
  )
}

export default function GamesBoard({ date, today, initialGames }: { date: string; today: string; initialGames: BoardGame[] }) {
  const router = useRouter()
  const [games, setGames] = useState(initialGames)
  const [filter, setFilter] = useState<Filter>('all')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (date < today) return                  // a past day is settled; nothing to refresh
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/stats/scoreboard?date=${date}`)
        const j = await r.json()
        if (!r.ok) throw new Error(j?.error ?? `Request failed (${r.status})`)
        setGames(j.games as BoardGame[]); setErr(null)
      } catch (e) { setErr((e as Error).message) }
    }, 15_000)
    return () => clearInterval(id)
  }, [date, today])

  const go = (d: string) => router.push(`/mlb/stats/games?date=${d}`)
  const count = (s: Filter) => (s === 'all' ? games.length : games.filter(g => g.state === s).length)
  const order = { Live: 0, Preview: 1, Final: 2 } as const
  const shown = games.filter(g => filter === 'all' || g.state === filter).sort((a, b) => order[a.state] - order[b.state] || a.startTime.localeCompare(b.startTime))
  const chip = (on: boolean): React.CSSProperties => ({ fontFamily: SANS, fontWeight: 600, fontSize: 13, padding: '6px 13px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : C.ink })

  return (
    <div style={{ fontFamily: SANS, color: C.ink }}>
      <style>{GAMES_CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button type="button" style={chip(false)} onClick={() => go(addDays(date, -1))} aria-label="Previous day">← Prev</button>
        <input type="date" value={date} max={addDays(today, 1)} aria-label="Choose a date" onChange={e => e.target.value && go(e.target.value)}
          style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff' }} />
        <button type="button" style={chip(false)} onClick={() => go(addDays(date, 1))} aria-label="Next day">Next →</button>
        {date !== today && <button type="button" style={chip(false)} onClick={() => go(today)}>Today</button>}
        <span style={{ fontSize: 15, color: '#5b5347', marginLeft: 6 }}>{nice(date)}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {([['all', 'All'], ['Live', 'Live'], ['Final', 'Final'], ['Preview', 'Upcoming']] as [Filter, string][]).map(([k, l]) => (
          <button key={k} type="button" style={chip(filter === k)} onClick={() => setFilter(k)}>{l} <span style={{ opacity: 0.7, fontWeight: 500 }}>{count(k)}</span></button>
        ))}
      </div>
      {err && <div style={{ color: C.bad, fontSize: 13, marginBottom: 10 }}>Refresh failed: {err}</div>}
      {shown.length === 0 ? (
        <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 14, padding: 28, textAlign: 'center', color: C.mute }}>
          <b style={{ color: C.ink, display: 'block' }}>{games.length === 0 ? 'No games on this date' : 'No games match this filter'}</b>
          {games.length === 0 ? 'Choose another day — the off-season and off-days have no games.' : 'Try “All”.'}
        </div>
      ) : (
        <div className="gm-board">{shown.map(g => <Card key={g.gamePk} g={g} />)}</div>
      )}
      <div style={{ fontSize: 9.5, color: C.faint, marginTop: 12 }}>Source: MLB Stats API. Today&apos;s games refresh every 15 seconds. Click a game to open every pitch and plate appearance.</div>
    </div>
  )
}
