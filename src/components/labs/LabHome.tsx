// Home screens of the Batting Lab and the Pitching Lab, laid out like the build guide's lab mockups:
// eyebrow, big "Pick a ..." heading, one search field, then a panel for the next game ("Playing next" lineups / "Starting next" pitchers).
// Server components; data comes from the schedule (getHomeSlate) and the same stored tables the game page uses.
import Link from 'next/link'
import type { ReactNode } from 'react'
import PlayerSearch from '@/components/PlayerSearch'
import { Headshot, TeamMark } from '@/components/home/Logo'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import ThroughDate, { formatThrough } from '@/components/data/ThroughDate'
import PendingBlock from '@/components/data/PendingBlock'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { pitchColor, pitchLabel } from '@/lib/lab/pitch-meta'
import { getHomeSlate, type HomeSlate } from '@/lib/mlb-homepage'
import { getTeamLineup, getStarterBlock, type StarterBlock } from '@/lib/game-cockpit'

const MUTE = '#8a8275', LINE = '#e7e2d8'
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }
const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, minWidth: 0 }
const kicker: React.CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: MUTE, margin: '0 0 8px' }
const ops3 = (v: number | null) => (v == null ? '' : v.toFixed(3).replace(/^0/, ''))
const Star = () => <span title="Small sample size" style={{ color: '#FF5722', fontWeight: 800 }}>*</span>
const ROUND: Record<string, string> = { 'World Series': 'WS', 'League Championship Series': 'LCS', 'Division Series': 'DS', 'Wild Card Series': 'WC' }

function Shell({ eyebrow, heading, placeholder, inside, children }: { eyebrow: string; heading: string; placeholder: string; inside: string; children: ReactNode }) {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 80px' }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722' }}>{eyebrow}</div>
      <h1 style={{ margin: '4px 0 16px', fontSize: 'clamp(34px, 6vw, 56px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.02 }}>{heading}</h1>
      <PlayerSearch header sport="MLB" placeholder={placeholder} labLinks />
      <div style={{ fontSize: 14, color: '#57534E', margin: '12px 0 22px' }}>{inside}</div>
      {children}
    </div>
  )
}

function gameLabel(slate: HomeSlate): string {
  const g = slate.game
  const r = g.seriesDescription ? (ROUND[g.seriesDescription] ?? g.seriesDescription) : null
  return r && g.seriesGameNumber ? `${r} G${g.seriesGameNumber}` : `${g.teams.away.team.abbreviation ?? ''} at ${g.teams.home.team.abbreviation ?? ''}`
}
const whenText = (s: HomeSlate) => (s.mode === 'last' ? `last game, ${formatThrough(s.date)}` : s.isToday ? 'today' : formatThrough(s.date))

export async function BattingHome() {
  const slate = await getHomeSlate().catch(() => null)
  const side = async (which: 'away' | 'home') => {
    if (!slate) return null
    const t = slate.game.teams[which].team
    const lu = await getTeamLineup(t.id, slate.date, slate.game.gamePk, { id: null, hand: null })
    return { t, lu }
  }
  const [away, home] = slate ? await Promise.all([side('away'), side('home')]) : [null, null]
  const through = [away, home].map(s => s?.lu.splitsThrough).filter(Boolean).sort().pop() ?? null
  const anySmall = [away, home].some(s => s?.lu.rows.some(r => r.contact && r.contact.pa < MIN_SAMPLE.batterPercentilePA))
  return (
    <Shell eyebrow="Batting Lab" heading="Pick a batter" placeholder="Search any batter" inside="Open any batter for hot zones, spray, vs pitch type, head to head, location, sequencing and trends.">
      {!slate ? <PendingBlock label="Next game" /> : (
        <section style={card}>
          <p style={kicker}>Playing next · {gameLabel(slate)} · {whenText(slate)}</p>
          {[away, home].map(s => s && (
            <div key={s.t.id} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}><TeamMark id={s.t.id} abbr={s.t.abbreviation ?? ''} size={22} /><b>{s.t.name}</b><span style={{ fontSize: 12, color: MUTE }}>{s.lu.source === 'confirmed' ? 'Confirmed lineup' : 'Projected lineup, not yet confirmed'}</span></div>
              {s.lu.rows.length === 0 ? <div style={{ fontSize: 14, color: MUTE }}>Lineup not available yet</div> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, ...num }}>
                    <thead><tr style={{ borderBottom: '1px solid #1A1A1A', color: MUTE, fontSize: 12 }}>
                      <th style={{ textAlign: 'left', padding: '6px 0', position: 'sticky', left: 0, background: '#fff' }}>Batter</th><th style={{ textAlign: 'right', padding: 6 }}>Season OPS</th><th style={{ textAlign: 'right', padding: 6 }}>Contact (xwOBA)</th>
                    </tr></thead>
                    <tbody>{s.lu.rows.map(r => (
                      <tr key={r.id} style={{ borderTop: `1px solid ${LINE}` }}>
                        <td style={{ padding: '6px 0', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#fff' }}>
                          <Link href={`/mlb/lab/batting-lab/${r.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'inherit', textDecoration: 'none' }}>
                            <Headshot id={r.id} name={r.name} size={34} /><b>{r.name}</b><span style={{ color: MUTE, fontSize: 12 }}>{r.hand ?? ''}</span>
                          </Link>
                        </td>
                        <td style={{ padding: 6, textAlign: 'right' }}>{ops3(r.ops)}{r.pa != null && r.pa < MIN_SAMPLE.batterPercentilePA ? <Star /> : null} <span style={{ fontSize: 12, color: MUTE }}>{r.pa != null ? `n ${r.pa}` : ''}</span></td>
                        <td style={{ padding: 6, textAlign: 'right' }}>{r.contact ? <><b>{ops3(r.contact.xwoba)}</b>{r.contact.pa < MIN_SAMPLE.batterPercentilePA ? <Star /> : null} <span style={{ fontSize: 12, color: MUTE }}>n {Math.round(r.contact.pa)}</span></> : ''}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          <ThroughDate date={through} />
          {anySmall ? <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>* Small sample size: under {MIN_SAMPLE.batterPercentilePA} plate appearances. Read with caution.</div> : null}
        </section>
      )}
    </Shell>
  )
}

function Mix({ s }: { s: StarterBlock }) {
  if (!s.hasPitchData) return <span style={{ fontSize: 13, color: MUTE }}>Pending: Team pitching numbers</span>
  return (
    <div>
      <div style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden', maxWidth: 360 }} aria-hidden>
        {s.mix.filter(m => m.usagePct != null).map(m => <span key={m.code} style={{ width: `${m.usagePct}%`, background: pitchColor(m.code) }} />)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 6, fontSize: 13 }}>
        {s.mix.slice(0, 4).map(m => (
          <span key={m.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <SpinBall code={m.code} spin={s.spin[m.code]} /><b>{pitchLabel(m.code)}</b> <span style={num}>{m.usagePct == null ? '' : `${Math.round(m.usagePct)}%`}</span>{m.pitches < MIN_SAMPLE.arsenalPitchesPerType ? <Star /> : null}
          </span>
        ))}
      </div>
    </div>
  )
}

export async function PitchingHome() {
  const slate = await getHomeSlate().catch(() => null)
  const sides = slate ? await Promise.all((['away', 'home'] as const).map(async w => {
    const side = slate.game.teams[w]
    const s = await getStarterBlock(side.probablePitcher?.id, side.probablePitcher?.fullName, new Date(slate.date).getFullYear())
    return { w, team: side.team, s }
  })) : []
  const through = sides.map(x => x.s.throughDate).filter(Boolean).sort().pop() ?? null
  const anySmall = sides.some(x => x.s.bf > 0 && x.s.bf < MIN_SAMPLE.pitcherPercentileBF)
  return (
    <Shell eyebrow="Pitching Lab" heading="Pick a pitcher" placeholder="Search any pitcher" inside="Open any pitcher for arsenal, stuff, location, sequencing, head to head, trends and the hot zone overlay.">
      {!slate ? <PendingBlock label="Next game" /> : (
        <section style={card}>
          <SpinBallStyles />
          <p style={kicker}>Starting next · {gameLabel(slate)} · {whenText(slate)}</p>
          {sides.map(({ w, team, s }) => (
            <div key={w} style={{ display: 'grid', gridTemplateColumns: 'minmax(210px, 1fr) 90px 150px minmax(240px, 2fr)', gap: '10px 18px', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${LINE}` }}>
              {s.id ? (
                <Link href={`/mlb/lab/pitching-lab/${s.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'inherit', textDecoration: 'none', minWidth: 0 }}>
                  <Headshot id={s.id} name={s.name ?? ''} size={48} />
                  <span><b style={{ fontSize: 17 }}>{s.name}</b> <span style={{ color: MUTE, fontSize: 13 }}>{s.hand ? `${s.hand}HP` : ''}</span><br /><span style={{ fontSize: 13, color: MUTE, display: 'inline-flex', alignItems: 'center', gap: 6 }}><TeamMark id={team.id} abbr={team.abbreviation ?? ''} size={18} />{team.name}</span></span>
                </Link>
              ) : <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><TeamMark id={team.id} abbr={team.abbreviation ?? ''} size={32} /><span>{team.name}: starter not announced yet</span></div>}
              <div style={num}><div style={{ fontSize: 12, color: MUTE, fontWeight: 800 }}>ERA</div><b style={{ fontSize: 18 }}>{s.era != null ? s.era.toFixed(2) : ''}</b>{s.bf > 0 && s.bf < MIN_SAMPLE.pitcherPercentileBF ? <Star /> : null}</div>
              <div style={num}><div style={{ fontSize: 12, color: MUTE, fontWeight: 800 }}>Contact allowed (xwOBA)</div><b style={{ fontSize: 18 }}>{ops3(s.xwoba)}</b>{s.bf > 0 ? <span style={{ fontSize: 12, color: MUTE }}> n {s.bf.toLocaleString('en-US')} BF</span> : null}</div>
              <Mix s={s} />
            </div>
          ))}
          <ThroughDate date={through} />
          {anySmall ? <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>* Small sample size: under {MIN_SAMPLE.pitcherPercentileBF} batters faced or {MIN_SAMPLE.arsenalPitchesPerType} pitches of a type. Read with caution.</div> : null}
        </section>
      )}
    </Shell>
  )
}
