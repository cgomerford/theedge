// Small shared pieces for the game page tabs. Plain rows and dividers, no cards inside cards.
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Headshot, TeamMark } from '@/components/home/Logo'
import SmallSample from '@/components/data/SmallSample'
import ThroughDate from '@/components/data/ThroughDate'
import PendingBlock from '@/components/data/PendingBlock'
import { MIN_SAMPLE, meetsMin } from '@/lib/min-sample'
import { pitchColor } from '@/lib/lab/pitch-meta'
import type { StarterBlock, TeamLineup, LineupRow, BullpenRow } from '@/lib/game-cockpit'
import type { ParkIndex } from '@/lib/park-index'

const FIRST_START = 'First MLB start, no pitch data yet'
const PROJECTED = 'Projected lineup, not yet confirmed'
const MUTE = '#8a8275'
const LINE = '#e7e2d8'
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ margin: '28px 0 10px' }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>{children}</h2>
      {sub ? <div style={{ fontSize: 13, color: MUTE, marginTop: 2 }}>{sub}</div> : null}
    </div>
  )
}

const fmt = (v: number | null, d: number) => (v == null ? '' : v.toFixed(d))
const ops3 = (v: number | null) => (v == null ? '' : v.toFixed(3).replace(/^0/, ''))

function Stat({ label, value, n, min }: { label: string; value: string; n: number; min?: number }) {
  const small = min != null && n < min
  return (
    <div style={{ minWidth: 76 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: MUTE }}>{label}</div>
      {small || !value ? <SmallSample n={n} /> : (
        <>
          <div style={{ fontSize: 18, fontWeight: 800, ...num }}>{value}</div>
          <div style={{ fontSize: 12, color: MUTE, ...num }}>n {n.toLocaleString('en-US')}</div>
        </>
      )}
    </div>
  )
}

export function MixLine({ s }: { s: StarterBlock }) {
  const rows = s.mix.filter(m => m.usagePct != null).slice(0, 4)
  if (!rows.length) return null
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 14, fontWeight: 700 }}>
        {rows.map(m => (
          <span key={m.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: pitchColor(m.code) }} />
            {m.code} <span style={num}>{Math.round(m.usagePct as number)}%</span>
          </span>
        ))}
      </div>
      <div style={{ fontSize: 12, color: MUTE, ...num }}>n {s.mixPitches.toLocaleString('en-US')} pitches</div>
    </div>
  )
}

export function StarterRow({ s, teamName, teamAbbr, teamId }: { s: StarterBlock; teamName: string; teamAbbr: string; teamId: number }) {
  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {s.id ? <Headshot id={s.id} name={s.name ?? ''} size={52} /> : <TeamMark id={teamId} abbr={teamAbbr} size={36} />}
      <div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>
          {s.name ?? 'Starter not announced yet'}
          {s.opener ? <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 800, color: '#FF5722' }}>Opener</span> : null}
        </div>
        <div style={{ fontSize: 13, color: MUTE }}>{teamName}{s.hand ? ` · ${s.hand === 'L' ? 'Left' : 'Right'}-handed` : ''}</div>
      </div>
    </div>
  )
  let body: ReactNode
  if (s.status === 'not_announced') body = <div style={{ marginTop: 10, fontSize: 14 }}>Starter not announced yet</div>
  else if (s.status === 'first_start') body = <div style={{ marginTop: 10, fontSize: 14 }}>{FIRST_START}</div>
  else {
    body = (
      <>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 22px', marginTop: 12 }}>
          <Stat label="ERA" value={fmt(s.era, 2)} n={s.bf} min={MIN_SAMPLE.pitcherPercentileBF} />
          <Stat label="K%" value={s.kPct == null ? '' : `${s.kPct.toFixed(1)}%`} n={s.bf} min={MIN_SAMPLE.pitcherPercentileBF} />
          <Stat label="BB%" value={s.bbPct == null ? '' : `${s.bbPct.toFixed(1)}%`} n={s.bf} min={MIN_SAMPLE.pitcherPercentileBF} />
          <Stat label="xwOBA against" value={ops3(s.xwoba)} n={s.bf} min={MIN_SAMPLE.pitcherPercentileBF} />
        </div>
        {s.hasPitchData ? <MixLine s={s} /> : <div style={{ marginTop: 10 }}><PendingBlock label="Team pitching numbers" /></div>}
        {s.lastStart ? (
          <div style={{ marginTop: 10, fontSize: 14, ...num }}>
            <span style={{ fontWeight: 700 }}>Most recent outing</span> {s.lastStart.date}{s.lastStart.opponent ? ` vs ${s.lastStart.opponent}` : ''}: {s.lastStart.ip} IP, {s.lastStart.h} H, {s.lastStart.r} R, {s.lastStart.k} K{s.lastStart.pitches != null ? `, ${s.lastStart.pitches} pitches` : ''}
          </div>
        ) : null}
        <ThroughDate date={s.throughDate} />
      </>
    )
  }
  return <div style={{ padding: '14px 0', borderTop: `1px solid ${LINE}` }}>{head}{body}</div>
}

function h2hCell(r: LineupRow, handWord: string) {
  if (!r.h2h) return ''
  if (r.h2h.pa === 0) return 'Never faced'
  const line = `${r.h2h.pa} · ${r.h2h.h} · ${r.h2h.hr} · ${r.h2h.k}`
  if (r.h2h.pa >= MIN_SAMPLE.h2hPA) return line
  // 1 to 9 PA: show the n, then the batter's numbers against this pitcher's hand
  const split = r.vsHand && meetsMin('splitPA', r.vsHand.pa) ? `${ops3(r.vsHand.ops)} OPS vs ${handWord} (n ${r.vsHand.pa} PA)` : r.vsHand ? `Small sample (n = ${r.vsHand.pa})` : ''
  return `n ${r.h2h.pa} PA${split ? ` · ${split}` : ''}`
}

export function LineupTable({ team, teamName, lineup, full, oppHand }: { team: { id: number; abbr: string }; teamName: string; lineup: TeamLineup; full?: boolean; oppHand: 'L' | 'R' | null }) {
  const handWord = oppHand === 'L' ? 'lefties' : oppHand === 'R' ? 'righties' : 'this hand'
  if (!lineup.rows.length) return <div style={{ padding: '10px 0', fontSize: 14, color: MUTE }}>Lineup not available yet</div>
  const label = lineup.source === 'confirmed' ? 'Confirmed lineup' : PROJECTED
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px' }}>
        <TeamMark id={team.id} abbr={team.abbr} size={22} />
        <span style={{ fontWeight: 800 }}>{teamName}</span>
        <span style={{ fontSize: 12, color: MUTE }}>{label}{lineup.source !== 'confirmed' && lineup.dateUsed ? ` (last lineup, ${lineup.dateUsed})` : ''}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, ...num }}>
          <thead>
            <tr style={{ textAlign: 'left', color: MUTE, fontSize: 12 }}>
              <th style={{ padding: '6px 8px 6px 0', position: 'sticky', left: 0, background: '#FAF8F3' }}>Batter</th>
              <th style={{ padding: 6 }}>Bats</th>
              <th style={{ padding: 6 }}>Season OPS</th>
              <th style={{ padding: 6 }}>vs starter (PA · H · HR · K)</th>
              {full ? <th style={{ padding: 6 }}>OPS vs this hand</th> : null}
            </tr>
          </thead>
          <tbody>
            {lineup.rows.map(r => (
              <tr key={r.id} style={{ borderTop: `1px solid ${LINE}` }}>
                <td style={{ padding: '6px 8px 6px 0', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#FAF8F3' }}>
                  <span style={{ color: MUTE, marginRight: 6 }}>{r.order}</span>
                  <Link href={`/mlb/players/${r.id}`} style={{ color: 'inherit', fontWeight: 700, textDecoration: 'none' }}>{r.name}</Link>
                </td>
                <td style={{ padding: 6 }}>{r.hand ?? ''}</td>
                <td style={{ padding: 6, whiteSpace: 'nowrap' }}>
                  {r.pa != null && r.pa < MIN_SAMPLE.batterPercentilePA ? <SmallSample n={r.pa} /> : r.ops != null ? <>{ops3(r.ops)} <span style={{ fontSize: 12, color: MUTE }}>n {r.pa ?? '?'} PA</span></> : ''}
                </td>
                <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{h2hCell(r, handWord)}</td>
                {full ? (
                  <td style={{ padding: 6, whiteSpace: 'nowrap' }}>
                    {!r.vsHand ? '' : r.vsHand.pa < MIN_SAMPLE.splitPA ? <SmallSample n={r.vsHand.pa} /> : <>{ops3(r.vsHand.ops)} <span style={{ fontSize: 12, color: MUTE }}>n {r.vsHand.pa} PA</span></>}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function BullpenTable({ teamName, abbr, id, dates, rows }: { teamName: string; abbr: string; id: number; dates: string[]; rows: BullpenRow[] }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <TeamMark id={id} abbr={abbr} size={22} /><span style={{ fontWeight: 800 }}>{teamName}</span>
      </div>
      {rows.length === 0 ? <div style={{ fontSize: 14, color: MUTE, padding: '8px 0' }}>No relief pitches recorded in this window</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, ...num }}>
            <thead><tr style={{ textAlign: 'left', color: MUTE, fontSize: 12 }}>
              <th style={{ padding: '6px 8px 6px 0', position: 'sticky', left: 0, background: '#FAF8F3' }}>Reliever</th>
              {dates.map(d => <th key={d} style={{ padding: 6 }}>{d.slice(5)}</th>)}
              <th style={{ padding: 6 }}>Pitches</th>
            </tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id} style={{ borderTop: `1px solid ${LINE}` }}>
                <td style={{ padding: '6px 8px 6px 0', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#FAF8F3' }}>{r.name}</td>
                {dates.map(d => <td key={d} style={{ padding: 6 }}>{r.byDate[d] ? r.byDate[d] : ''}</td>)}
                <td style={{ padding: 6, fontWeight: 800 }}>{r.total}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function ParkLine({ park }: { park: ParkIndex | null }) {
  if (!park) return <PendingBlock label="Park index" />
  return (
    <div style={{ padding: '10px 0', borderTop: `1px solid ${LINE}`, fontSize: 15, ...num }}>
      <b>x9Lab park index {park.index}</b> <span style={{ color: MUTE }}>(n = {park.homeGames.toLocaleString('en-US')} home / {park.roadGames.toLocaleString('en-US')} road games, {park.seasons})</span>
      <div style={{ fontSize: 13, color: MUTE }}>{park.homeRpg.toFixed(2)} runs per game at home, {park.roadRpg.toFixed(2)} on the road, both teams combined. 100 is neutral.</div>
    </div>
  )
}
