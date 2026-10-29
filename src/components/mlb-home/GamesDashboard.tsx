'use client'

import OffseasonCalendar from './OffseasonCalendar'
import type { CalItem } from '@/lib/mlb-offseason'
import Link from 'next/link'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import { useEffect, useMemo, useState } from 'react'
import { TeamMark, Headshot } from '@/components/home/Logo'
import { pitchColor } from '@/lib/lab/pitch-meta'
import { MLB_TEAMS } from '@/lib/teams'
import { MIN_SAMPLE } from '@/lib/min-sample'
import SmallSample from '@/components/data/SmallSample'
import type { DashGame, DashStarter, GameGroup, SeasonState } from '@/lib/mlb-home-dashboard'

// The state line (h1 "MLB" + one sentence) and today's games as full-width cockpit cards grouped Live / Upcoming / Final.
// The server renders from cached data; this island polls /api/mlb/live every 30 seconds ONLY while a game is live or within
// 15 minutes of first pitch, and stops when every game is final, postponed or suspended (never in the off-season).

const MUTED = '#8a8275'
const colorOf = (id: number) => MLB_TEAMS.find(t => t.id === id)?.primary_color ?? '#1A1A1A'
const fmtTime = (iso: string, tz: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: tz === 'America/New_York' ? 'numeric' : '2-digit', minute: '2-digit', hour12: tz === 'America/New_York', timeZone: tz })
const ukDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' })

type Live = { gamePk: number; group: GameGroup; state: string; awayScore: number | null; homeScore: number | null }

function useLive(initial: DashGame[], date: string) {
  const [live, setLive] = useState<Record<number, Live>>({})
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false
    const soon = (g: DashGame) => g.group === 'upcoming' && new Date(g.startUtc).getTime() - Date.now() < 15 * 60 * 1000
    const needs = () => initial.some(g => g.group === 'live' || soon(g))
    async function tick() {
      if (cancelled) return
      try {
        const r = await fetch(`/api/mlb/live?date=${date}`, { cache: 'no-store' })
        if (r.ok) {
          const j = (await r.json()) as { games: Live[] }
          if (!cancelled) setLive(Object.fromEntries(j.games.map(g => [g.gamePk, g])))
          // Stop once nothing is live or about to start.
          if (!j.games.some(g => g.group === 'live' || (g.group === 'upcoming' && new Date((g as unknown as { startUtc: string }).startUtc).getTime() - Date.now() < 15 * 60 * 1000))) return
        }
      } catch { /* keep the cached picture */ }
      timer = setTimeout(tick, 30_000)
    }
    if (needs()) tick()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [initial, date])
  return live
}

function Mix({ s, animated }: { s: NonNullable<DashStarter>; animated: boolean }) {
  const shown = s.mix.filter(m => m.pct >= 5)
  if (shown.length === 0) return null
  return (
    <div>
      <div aria-hidden="true" style={{ display: 'flex', height: 8, overflow: 'hidden', background: '#e7e2d8' }}>
        {s.mix.map(m => <span key={m.code} style={{ width: `${m.pct}%`, background: pitchColor(m.code) }} />)}
      </div>
      <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 12 }}>
        {shown.map(m => (
          <li key={m.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {animated ? <SpinBall code={m.code} spin={s.spin?.[m.code]} /> : <span aria-hidden="true" style={{ width: 8, height: 8, background: pitchColor(m.code), display: 'inline-block' }} />}
            {m.code} {m.label} <span style={{ fontVariantNumeric: 'tabular-nums', color: MUTED }}>{Math.round(m.pct)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Starter({ s, compact }: { s: DashStarter; compact: boolean }) {
  if (!s) return <div style={{ fontSize: 14, color: MUTED }}>Starter: TBD</div>
  const big = compact ? 22 : 30
  const bfSmall = s.bf != null && s.bf < MIN_SAMPLE.pitcherPercentileBF
  return (
    <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Headshot id={s.id} name={s.name} size={compact ? 28 : 34} />
        <Link href={`/mlb/players/${s.id}`} style={{ fontWeight: 800, fontSize: 15, color: '#1A1A1A', textDecoration: 'none' }}>{s.name}</Link>
        {s.hand && <span style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>{s.hand}HP</span>}
      </div>
      <div style={{ display: 'flex', gap: 22, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: big, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.era != null ? s.era.toFixed(2) : '—'}</div>
          <div style={{ fontSize: 12, color: MUTED }}>ERA{s.postseason ? ' (postseason)' : ''} · {s.w ?? 0}-{s.l ?? 0}{s.ip ? ` · ${s.ip} IP` : ''}</div>
        </div>
        <div>
          <div style={{ fontSize: big, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.xwoba != null && !bfSmall ? s.xwoba.toFixed(3).replace(/^0/, '') : '—'}</div>
          <div style={{ fontSize: 12, color: MUTED }}>xwOBA allowed</div>
        </div>
      </div>
      <Mix s={s} animated={!compact} />
      <div style={{ fontSize: 12, color: MUTED }}>
        {s.through ? `Through ${new Date(`${s.through}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''}{s.bf != null ? ` · n = ${s.bf.toLocaleString('en-US')} BF` : ''}
        {bfSmall && <> · <SmallSample n={s.bf} /></>}
      </div>
    </div>
  )
}

function Card({ g, compact, live }: { g: DashGame; compact: boolean; live: Live | undefined }) {
  const group = live?.group ?? g.group
  const state = live?.state ?? g.state
  const aS = live ? live.awayScore : g.away.score, hS = live ? live.homeScore : g.home.score
  const showScore = group !== 'upcoming' && !/postponed|cancelled/i.test(state)
  const time = g.startsAfterGame1 ? 'Starts after Game 1' : `${fmtTime(g.startUtc, 'Europe/London')} UK (${fmtTime(g.startUtc, 'America/New_York')} ET)`
  const ac = colorOf(g.away.id), hc = colorOf(g.home.id)
  const ws = g.series?.label === 'World Series'   // gold background marks a World Series game
  return (
    <article style={{ display: 'grid', gridTemplateColumns: '6px minmax(0,1fr)', background: ws ? 'linear-gradient(165deg, #F0E0AE 0%, #F7EDCC 40%, #ffffff 90%)' : '#fff', border: `1px solid ${ws ? '#D9BE6C' : '#e7e2d8'}`, borderRadius: 2 }}>
      <div aria-hidden="true" style={{ background: `linear-gradient(180deg, ${ac} 50%, ${hc} 50%)` }} />
      <div style={{ padding: compact ? '10px 14px 12px' : '14px 18px 16px', display: 'grid', gap: compact ? 8 : 12, minWidth: 0 }}>
        <header className="dc-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <TeamMark id={g.away.id} abbr={g.away.abbr} size={compact ? 22 : 28} />
            <span style={{ fontSize: compact ? 24 : 32, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{showScore ? (aS ?? 0) : ''}</span>
            <span style={{ color: MUTED, fontWeight: 700 }}>{showScore ? '–' : '@'}</span>
            <span style={{ fontSize: compact ? 24 : 32, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{showScore ? (hS ?? 0) : ''}</span>
            <TeamMark id={g.home.id} abbr={g.home.abbr} size={compact ? 22 : 28} />
          </div>
          <div style={{ fontSize: 13, color: '#3a352c', textAlign: 'right' }}>
            <div style={{ fontWeight: 800, color: group === 'live' ? '#FF5722' : '#1A1A1A' }}>
              {group === 'upcoming' ? time : state}{g.doubleHeader ? ` · Game ${g.gameNumber}` : ''}
            </div>
            <div style={{ color: MUTED }}>{g.series?.label ? `${g.series.label}${g.series.gameNumber ? `, Game ${g.series.gameNumber}` : ''} · ` : ''}{g.venue}</div>
            {g.series?.result && <div style={{ color: MUTED }}>{g.series.result}</div>}
          </div>
        </header>
        <div style={{ borderTop: '1px solid #e7e2d8' }} />
        <div className="dc-starters">
          <Starter s={g.awayStarter} compact={compact} />
          <Starter s={g.homeStarter} compact={compact} />
        </div>
        <div style={{ borderTop: '1px solid #e7e2d8', paddingTop: 10, display: 'flex', gap: 18, fontSize: 14, fontWeight: 800 }}>
          <Link href={`/mlb/${g.slug}`} style={{ color: '#FF5722' }}>Game preview →</Link>
          <Link href={`/mlb/${g.slug}/${group === 'final' ? 'postgame' : 'scout-report'}`} style={{ color: '#FF5722' }}>{group === 'final' ? 'Postgame report →' : 'Scout report →'}</Link>
        </div>
      </div>
    </article>
  )
}

function Group({ title, games, compact, live, collapse }: { title: string; games: DashGame[]; compact: boolean; live: Record<number, Live>; collapse?: boolean }) {
  const [open, setOpen] = useState(false)
  if (games.length === 0) return null
  return (
    <section style={{ marginTop: 22 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
        {title}
        <span style={{ background: '#1A1A1A', color: '#FAF8F3', fontSize: 12, padding: '1px 8px', borderRadius: 10 }}>{games.length}</span>
        {collapse && <button type="button" className="dc-toggle" onClick={() => setOpen(o => !o)} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #1A1A1A', padding: '4px 10px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>{open ? 'Hide finals' : `Show ${games.length} finals`}</button>}
      </h2>
      <div className={collapse ? 'dc-collapsible' : undefined} data-open={open ? 'true' : 'false'} style={{ display: 'grid', gap: 10 }}>
        {games.map(g => <Card key={g.gamePk} g={g} compact={compact} live={live[g.gamePk]} />)}
      </div>
    </section>
  )
}

export default function GamesDashboard({ season, date, games, tightest, next, calendar = [] }: {
  season: SeasonState; date: string; games: DashGame[]
  calendar?: CalItem[]
  tightest: string | null
  next: { label: string; startUtc: string; venue: string } | null
}) {
  const live = useLive(games, date)
  const merged = useMemo(() => games.map(g => ({ ...g, group: live[g.gamePk]?.group ?? g.group })), [games, live])
  const liveCount = merged.filter(g => g.group === 'live').length
  const compact = games.length >= 12
  const by = (grp: GameGroup) => merged.filter(g => g.group === grp)

  // The state line
  let line: React.ReactNode = null
  let sub: React.ReactNode = null
  if (season.state === 'offseason' || season.state === 'preseason') {
    const f = season.lastFinal
    line = `Off-season${season.nextStart ? ` · ${season.nextStart ? season.nextStart.slice(0, 4) : season.year + 1} season starts ${new Date(`${season.nextStart}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''}`
    if (f) sub = `Last game: ${f.away} ${f.awayScore}, ${f.home} ${f.homeScore}${f.note ? ` (${f.note})` : ''}, ${new Date(`${f.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
  } else if (games.length === 0 && next) {
    line = `No games today · next: ${next.label}`
    sub = `${ukDay(next.startUtc)}, ${fmtTime(next.startUtc, 'Europe/London')} UK (${fmtTime(next.startUtc, 'America/New_York')} ET) · ${next.venue}`
  } else if (season.state === 'postseason' && games.length > 0) {
    const g = merged.find(x => x.group === 'live') ?? merged.find(x => x.group === 'upcoming') ?? merged[0]
    const lv = live[g.gamePk]
    const sc = (lv ? lv.awayScore : g.away.score) != null ? `${g.away.abbr} ${lv ? lv.awayScore : g.away.score}, ${g.home.abbr} ${lv ? lv.homeScore : g.home.score}` : null
    line = `${g.series?.label ?? 'Postseason'}${g.series?.gameNumber ? ` Game ${g.series.gameNumber}` : ''} ${g.group === 'live' ? 'live' : g.group === 'final' ? 'final' : 'tonight'}${g.series?.result ? ` · ${g.series.result}` : ''}`
    sub = g.group === 'upcoming' ? `First pitch ${ukDay(g.startUtc)}, ${fmtTime(g.startUtc, 'Europe/London')} UK (${fmtTime(g.startUtc, 'America/New_York')} ET) · ${g.venue}` : `${sc ?? ''} · ${live[g.gamePk]?.state ?? g.state}`
  } else {
    line = `${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}: ${games.length} game${games.length === 1 ? '' : 's'}, ${liveCount} live`
    sub = tightest
  }

  return (
    <section aria-label="Today's games">
      <SpinBallStyles />
      <style>{`
        .dc-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
        .dc-starters{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px 28px}
        .dc-toggle{display:none}
        @media (max-width:600px){
          .dc-starters{grid-template-columns:minmax(0,1fr)}
          .dc-head{display:grid}
          .dc-head > div:last-child{text-align:left !important}
          .dc-toggle{display:inline-block}
          .dc-collapsible[data-open="false"]{display:none !important}
        }
      `}</style>
      <h1 style={{ margin: 0, fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>MLB</h1>
      <p style={{ margin: '8px 0 0', fontSize: 18, fontWeight: 700 }}>{line}</p>
      {sub && <p style={{ margin: '4px 0 0', fontSize: 15, color: '#5b5347' }}>{sub}</p>}
      {(season.state === 'offseason' || season.state === 'preseason') && <OffseasonCalendar items={calendar} today={season.today} />}
      <Group title="Live" games={by('live')} compact={compact} live={live} />
      <Group title="Upcoming" games={by('upcoming')} compact={compact} live={live} />
      <Group title="Final" games={by('final')} compact={compact} live={live} collapse />
    </section>
  )
}
