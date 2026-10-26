// The player page body, rendered on the server: latest game, last 5, season line + career, arsenal / vs pitch type, zones (the one gate),
// percentiles, what changed + splits. Plain divider rows and tables; no cards inside cards, no tabs.
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Headshot, TeamMark } from '@/components/home/Logo'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import PendingBlock from '@/components/data/PendingBlock'
import ThroughDate, { formatThrough } from '@/components/data/ThroughDate'
import { findTeamByName } from '@/lib/teams'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { pitchColor, pitchLabel } from '@/lib/lab/pitch-meta'
import type { PlayerPageData } from '@/lib/player-page'
import type { PlayerOverview, GameLine } from '@/lib/player-overview'

const MUTE = '#8a8275', LINE = '#e7e2d8'
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }
const Star = () => <span title="Small sample size" style={{ color: '#FF5722', fontWeight: 800 }}>*</span>
const Note = ({ text }: { text: string }) => <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>* Small sample size: {text}. Read with caution.</div>

export function Section({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>{title}</h2>
      {sub ? <div style={{ fontSize: 13, color: MUTE, marginTop: 2 }}>{sub}</div> : null}
      <div style={{ marginTop: 10 }}>{children}</div>
    </section>
  )
}

const S = (g: GameLine, k: string) => (g.stat[k] == null ? '' : String(g.stat[k]))
const rate = (v: unknown) => (v == null || v === '' ? '' : String(v))
const dateShort = (d: string) => formatThrough(d)?.replace(/ \d{4}$/, '') ?? d

function gameText(g: GameLine, pitcher: boolean) {
  return pitcher
    ? `${S(g, 'inningsPitched')} IP, ${S(g, 'hits')} H, ${S(g, 'earnedRuns')} ER, ${S(g, 'strikeOuts')} K, ${S(g, 'baseOnBalls')} BB${g.stat.numberOfPitches ? `, ${S(g, 'numberOfPitches')} pitches` : ''}`
    : `${S(g, 'hits')}-for-${S(g, 'atBats')}${Number(g.stat.homeRuns) ? `, ${S(g, 'homeRuns')} HR` : ''}${Number(g.stat.rbi) ? `, ${S(g, 'rbi')} RBI` : ''}${Number(g.stat.baseOnBalls) ? `, ${S(g, 'baseOnBalls')} BB` : ''}${Number(g.stat.strikeOuts) ? `, ${S(g, 'strikeOuts')} K` : ''}`
}

export function PlayerHeader({ data, follow }: { data: PlayerPageData; follow: ReactNode }) {
  const { identity: p } = data
  const bt = `${p.batSide ?? '-'}/${p.pitchHand ?? '-'}`
  return (
    <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px 18px', padding: '8px 0 14px' }}>
      <Headshot id={p.id} name={p.fullName} size={84} />
      <div style={{ flex: '1 1 280px', minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(30px, 5vw, 48px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05 }}>{p.fullName}</h1>
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', fontSize: 14, color: '#5b5347', ...num }}>
          {p.currentTeam ? <Link href={`/mlb/teams/${findTeamByName(p.currentTeam.name)?.slug ?? ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', fontWeight: 800, textDecoration: 'none' }}><TeamMark id={p.currentTeam.id} abbr={p.currentTeam.abbr} size={22} /></Link> : null}
          <span>{p.primaryPosition.abbreviation}</span>
          <span>B/T {bt}</span>
          <span>Age {p.currentAge}</span>
        </div>
      </div>
      <div>{follow}</div>
    </header>
  )
}

function Table({ head, rows, firstPinned = true, leftSecond = false }: { head: string[]; rows: ReactNode[][]; firstPinned?: boolean; leftSecond?: boolean }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, ...num }}>
        <thead><tr style={{ color: MUTE, fontSize: 12, textAlign: 'right' }}>
          {head.map((h, i) => <th key={h} style={{ padding: '6px 8px', textAlign: i === 0 || (leftSecond && i === 1) ? 'left' : 'right', whiteSpace: 'nowrap', ...(i === 0 && firstPinned ? { position: 'sticky', left: 0, background: '#FAF8F3' } : {}) }}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map((r, ri) => (
          <tr key={ri} style={{ borderTop: `1px solid ${LINE}` }}>
            {r.map((c, i) => <td key={i} style={{ padding: '6px 8px', textAlign: i === 0 || (leftSecond && i === 1) ? 'left' : 'right', whiteSpace: 'nowrap', ...(i === 0 && firstPinned ? { position: 'sticky', left: 0, background: '#FAF8F3', fontWeight: 700 } : {}) }}>{c}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

export function LatestGame({ o }: { o: PlayerOverview }) {
  const g = o.latest
  if (!g) return null
  return (
    <div style={{ padding: '10px 0', borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, ...num }}>
      <span style={{ fontWeight: 800 }}>Latest game</span>{g.stage ? ` (${g.stage})` : ''}: {formatThrough(g.date)} {g.home ? 'vs' : 'at'} {g.opp}. {gameText(g, o.isPitcher)}.{' '}
      {g.slug ? <Link href={`/mlb/${g.slug}`} style={{ color: '#FF5722', fontWeight: 800 }}>Open the game</Link> : null}
    </div>
  )
}

export function LastFive({ o }: { o: PlayerOverview }) {
  if (!o.recent.length) return <PendingBlock label="Game log" />
  const head = o.isPitcher ? ['Date', 'Opp', 'IP', 'H', 'ER', 'K', 'BB', 'Pitches'] : ['Date', 'Opp', 'AB', 'H', 'HR', 'RBI', 'BB', 'K']
  const rows = o.recent.map(g => [
    dateShort(g.date), `${g.home ? 'vs' : 'at'} ${g.opp}${g.stage ? ` (${g.stage})` : ''}`,
    ...(o.isPitcher ? [S(g, 'inningsPitched'), S(g, 'hits'), S(g, 'earnedRuns'), S(g, 'strikeOuts'), S(g, 'baseOnBalls'), S(g, 'numberOfPitches')] : [S(g, 'atBats'), S(g, 'hits'), S(g, 'homeRuns'), S(g, 'rbi'), S(g, 'baseOnBalls'), S(g, 'strikeOuts')]),
  ])
  return <Table head={head} rows={rows} leftSecond />
}

function seasonItems(o: PlayerOverview) {
  const l = o.line
  return o.isPitcher
    ? [['ERA', rate(l?.era)], ['WHIP', rate(l?.whip)], ['K/9', rate(l?.strikeoutsPer9Inn)], ['IP', rate(l?.inningsPitched)]]
    : [['AVG', rate(l?.avg)], ['OBP', rate(l?.obp)], ['SLG', rate(l?.slg)], ['OPS', rate(l?.ops)]]
}

export function SeasonReadout({ o }: { o: PlayerOverview }) {
  const small = o.lineN < MIN_SAMPLE.batterPercentilePA
  if (!o.line) return <PendingBlock label="Season line" />
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
        {seasonItems(o).map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 12, fontWeight: 800, color: MUTE }}>{k}</div>
            <div style={{ fontSize: 28, fontWeight: 800, ...num }}>{v}{small ? <Star /> : null}</div>
            <div style={{ fontSize: 12, color: MUTE, ...num }}>n {o.lineN.toLocaleString('en-US')} {o.isPitcher ? 'BF' : 'PA'}</div>
          </div>
        ))}
      </div>
      {small ? <Note text={`under ${MIN_SAMPLE.batterPercentilePA} ${o.isPitcher ? 'batters faced' : 'plate appearances'}`} /> : null}
    </>
  )
}

export function CareerTable({ o, data }: { o: PlayerOverview; data: PlayerPageData }) {
  const careerRows = (o.isPitcher ? data.yearByYearPitching : data.yearByYearHitting)
  const head = o.isPitcher ? ['Season', 'Team', 'W', 'L', 'ERA', 'IP', 'K', 'BB', 'WHIP'] : ['Season', 'Team', 'G', 'AVG', 'OBP', 'SLG', 'OPS', 'HR', 'RBI']
  const rows = careerRows.map(r => [String(r.season), r.team ?? '', ...(o.isPitcher
    ? [r.stat.wins, r.stat.losses, r.stat.era, r.stat.inningsPitched, r.stat.strikeOuts, r.stat.baseOnBalls, r.stat.whip]
    : [r.stat.gamesPlayed, r.stat.avg, r.stat.obp, r.stat.slg, r.stat.ops, r.stat.homeRuns, r.stat.rbi]).map(v => (v == null ? '' : String(v)))])
  return rows.length === 0 ? <div style={{ fontSize: 14, color: MUTE }}>No prior MLB seasons</div> : <Table head={head} rows={rows} leftSecond />
}

export function Arsenal({ o }: { o: PlayerOverview }) {
  const through = o.latest?.date ?? null
  if (o.isPitcher) {
    if (!o.mix.length) return <PendingBlock label="Arsenal" />
    return (
      <>
        <div style={{ display: 'flex', height: 12, borderRadius: 3, overflow: 'hidden' }} aria-hidden>
          {o.mix.filter(m => m.usagePct != null).map(m => <span key={m.code} style={{ width: `${m.usagePct}%`, background: pitchColor(m.code) }} />)}
        </div>
        <SpinBallStyles />
        <Table head={['Pitch', 'Usage', 'Velo', 'Whiff%', 'n pitches']} rows={o.mix.map(m => [
          <span key={m.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><SpinBall code={m.code} spin={o.spin[m.code]} />{pitchLabel(m.code)}{m.pitches < MIN_SAMPLE.arsenalPitchesPerType ? <Star /> : null}</span>,
          m.usagePct == null ? '' : `${m.usagePct.toFixed(1)}%`, m.velo == null ? '' : `${m.velo.toFixed(1)} mph`,
          m.whiffPct == null ? '' : <span key="w">{m.whiffPct.toFixed(1)}%{m.swings < MIN_SAMPLE.whiffSwings ? <Star /> : null} <span style={{ fontSize: 12, color: MUTE }}>n {m.swings} swings</span></span>,
          m.pitches.toLocaleString('en-US'),
        ])} />
        <ThroughDate date={through} />
        {o.mix.some(m => m.pitches < MIN_SAMPLE.arsenalPitchesPerType || m.swings < MIN_SAMPLE.whiffSwings) ? <Note text={`under ${MIN_SAMPLE.arsenalPitchesPerType} pitches of a type or ${MIN_SAMPLE.whiffSwings} swings`} /> : null}
      </>
    )
  }
  if (!o.vsPitch.length) return <PendingBlock label="vs pitch type" />
  return (
    <>
      <Table head={['Pitch', 'Whiff%', 'xwOBA', 'n PA']} rows={o.vsPitch.map(r => [
        <span key={r.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span aria-hidden style={{ width: 10, height: 10, background: pitchColor(r.code), display: 'inline-block' }} />{pitchLabel(r.code)}{r.pa < MIN_SAMPLE.vsPitchTypeSeen ? <Star /> : null}</span>,
        r.whiffPct == null ? '' : `${r.whiffPct.toFixed(1)}%`, r.xwoba == null ? '' : r.xwoba.toFixed(3).replace(/^0/, ''), r.pa.toLocaleString('en-US'),
      ])} />
      <ThroughDate date={o.vsPitchThrough} />
      <Note text={`under ${MIN_SAMPLE.vsPitchTypeSeen} plate appearances against that pitch`} />
    </>
  )
}

/** Labels only, no values: the preview a viewer sees when the zones are locked. */
export function ZonesShell() {
  const labels = ['Up and in', 'Up', 'Up and away', 'Middle in', 'Middle', 'Middle away', 'Down and in', 'Down', 'Down and away']
  return (
    <div style={{ maxWidth: 420 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {labels.map(l => <div key={l} style={{ border: `1px dashed ${LINE}`, minHeight: 54, padding: 6, fontSize: 12, color: MUTE }}>{l}</div>)}
      </div>
    </div>
  )
}

export function Percentiles({ o }: { o: PlayerOverview }) {
  if (!o.isPitcher) return <PendingBlock label="Batter percentiles" />
  const p = o.percentiles
  if (!p || !p.qualified) return <PendingBlock label="Percentile ranks" />
  const small = o.lineN < MIN_SAMPLE.pitcherPercentileBF
  return (
    <>
      <div style={{ display: 'grid', gap: 6 }}>
        {p.stats.filter(s => s.percentile != null).map(s => (
          <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 92px', alignItems: 'center', gap: 10, fontSize: 14, ...num }}>
            <span style={{ fontWeight: 700 }}>{s.label}</span>
            <span style={{ background: '#f1eee6', height: 10, borderRadius: 5 }}><span style={{ display: 'block', height: 10, borderRadius: 5, background: '#1A1A1A', width: `${s.percentile}%` }} /></span>
            <span style={{ textAlign: 'right' }}><b>{s.value}</b>{small ? <Star /> : null} <span style={{ fontSize: 12, color: MUTE }}>{s.percentile}th</span></span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>Far right = 100th percentile (best). n {o.lineN.toLocaleString('en-US')} batters faced, among pitchers in the league pool.</div>
      {small ? <Note text={`under ${MIN_SAMPLE.pitcherPercentileBF} batters faced`} /> : null}
    </>
  )
}

export function WhatChanged({ o }: { o: PlayerOverview }) {
  const l = o.last30, s = o.line
  const need = o.isPitcher ? MIN_SAMPLE.whatChangedBF : MIN_SAMPLE.whatChangedPA
  if (!l || !s) return <div style={{ fontSize: 14, color: MUTE }}>Needs at least {need} {o.isPitcher ? 'batters faced' : 'plate appearances'} in the last 30 days to compare.</div>
  const cols: [string, string][] = o.isPitcher ? [['ERA', 'era'], ['WHIP', 'whip'], ['K/9', 'strikeoutsPer9Inn']] : [['AVG', 'avg'], ['OPS', 'ops'], ['HR', 'homeRuns']]
  return (
    <Table head={['', 'Last 30 days', 'Season']} rows={cols.map(([lab, k]) => [lab, <span key="a">{rate(l.stat[k])} <span style={{ fontSize: 12, color: MUTE }}>n {l.n}</span></span>, <span key="b">{rate(s[k])} <span style={{ fontSize: 12, color: MUTE }}>n {o.lineN}</span></span>])} />
  )
}

export function Splits({ o }: { o: PlayerOverview }) {
  if (!o.splits.length) return <PendingBlock label="Splits" />
  const cols: [string, string][] = o.isPitcher ? [['ERA', 'era'], ['OPS against', 'ops']] : [['AVG', 'avg'], ['OPS', 'ops'], ['HR', 'homeRuns']]
  return (
    <>
      <Table head={['Split', ...cols.map(c => c[0]), o.isPitcher ? 'n BF' : 'n PA']} rows={o.splits.map(r => [
        r.label, ...cols.map(([, k]) => <span key={k}>{rate(r.stat[k])}{r.n < MIN_SAMPLE.splitPA ? <Star /> : null}</span>), r.n.toLocaleString('en-US'),
      ])} />
      {o.splits.some(r => r.n < MIN_SAMPLE.splitPA) ? <Note text={`under ${MIN_SAMPLE.splitPA} ${o.isPitcher ? 'batters faced' : 'plate appearances'}`} /> : null}
    </>
  )
}
