// src/components/nfl-edge/home/LeagueDesk.tsx
//
// The "league" half of the NFL homepage, mirroring the MLB homepage's boards and charts:
//   § Leaders          top-5 player boards (yards, touchdowns) with headshots
//   § Team quality     every club on offence-vs-defence axes + best-offence / best-defence bars
//   § Coverage desk    man / zone mix, blitz and shell usage per defence
// Server-rendered except the scatter (LeagueCharts.tsx). Every board states its sample; missing data is an empty state.

import type { NflTeam } from '@/lib/nfl-edge/teams'
import type { CoverageDesk, TeamBoardRow } from '@/lib/nfl-edge/league'
import { C, DISPLAY, MONO, SANS, Card, Chip, Empty, Foot, TeamLogo, fmtEpa } from '../ui'
import { Sec } from './HomeClient'
import { TeamQualityScatter, type QualityPoint } from './LeagueCharts'

/** MLB-homepage section: a small orange `§` label with a hairline, then the content. */
function HomeSection({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div id={id} className="nh-section">
      <Sec>{title}</Sec>
      {sub && <div style={{ fontFamily: 'var(--font-outfit), system-ui, sans-serif', fontSize: 10.5, color: '#8A8577', margin: '-6px 0 12px' }}>{sub}</div>}
      {children}
    </div>
  )
}

function BarList({ rows, color, fmt, max }: { rows: { id: string; v: number }[]; color: (id: string) => string; fmt: (v: number) => string; max: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r, i) => (
        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '18px 34px minmax(0,1fr) 52px', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{i + 1}</span>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 14 }}>{r.id}</span>
          <div style={{ height: 9, background: C.soft, borderRadius: 5 }}><div style={{ width: `${Math.max(4, (Math.abs(r.v) / max) * 100)}%`, height: '100%', background: color(r.id), borderRadius: 5 }} /></div>
          <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{fmt(r.v)}</span>
        </div>
      ))}
    </div>
  )
}

export function TeamQualitySection({ board, teams }: { board: TeamBoardRow[]; teams: Map<string, NflTeam> }) {
  const rated = board.filter(b => b.offEpa != null && b.defEpa != null)
  const pts: QualityPoint[] = rated.flatMap(b => {
    const t = teams.get(b.id)
    return t ? [{ id: b.id, name: t.name, logo: t.logo, color: t.color, off: b.offEpa as number, def: -(b.defEpa as number), plays: Math.round(b.plays) }] : []
  })
  const color = (id: string) => teams.get(id)?.color ?? C.orange
  const topO = [...rated].sort((a, b) => (b.offEpa as number) - (a.offEpa as number)).slice(0, 8).map(b => ({ id: b.id, v: b.offEpa as number }))
  const topD = [...rated].sort((a, b) => (a.defEpa as number) - (b.defEpa as number)).slice(0, 8).map(b => ({ id: b.id, v: b.defEpa as number }))
  const early = board.some(b => b.usesPrior)
  const games = board.length ? Math.max(...board.map(b => b.games)) : 0
  const max = Math.max(0.05, ...topO.map(x => Math.abs(x.v)), ...topD.map(x => Math.abs(x.v)))
  return (
    <HomeSection id="quality" title="Team quality map" sub="Expected points added per play: how each club moves the ball and how it stops the other side.">
      <div className="tp-grid-2" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)' }}>
        <Card title="Offense vs defense" note="EPA per play">
          <TeamQualityScatter points={pts} />
          <Foot>Right = better offense, up = better defense. Top-right clubs are strong on both sides.{early ? ` Early season (${games} game${games === 1 ? '' : 's'} in), so last season is blended in at a fading weight.` : ''}</Foot>
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Best offenses" note="EPA / play">
            {topO.length ? <BarList rows={topO} color={color} fmt={fmtEpa} max={max} /> : <Empty>No sample yet.</Empty>}
          </Card>
          <Card title="Best defenses" note="EPA allowed / play">
            {topD.length ? <BarList rows={topD} color={color} fmt={fmtEpa} max={max} /> : <Empty>No sample yet.</Empty>}
          </Card>
        </div>
      </div>
    </HomeSection>
  )
}

export function CoverageSection({ desk, board, teams, currentSeason }: { desk: CoverageDesk | null; board: TeamBoardRow[]; teams: Map<string, NflTeam>; currentSeason: number }) {
  const blitz = board.filter(b => b.blitz != null).sort((a, b) => (b.blitz as number) - (a.blitz as number))
  const early = board.some(b => b.usesPrior)
  const rows = desk ? [...desk.rows].filter(r => r.man != null && r.zone != null).sort((a, b) => (b.man as number) - (a.man as number)) : []
  const avg = (pick: (r: (typeof rows)[number]) => number | null) => {
    const v = rows.map(pick).filter((x): x is number => x != null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  const shells: [string, number | null][] = [['Cover 3', avg(r => r.cover3)], ['Cover 1', avg(r => r.cover1)], ['Cover 2', avg(r => r.cover2)], ['Cover 4', avg(r => r.cover4)], ['Cover 6', avg(r => r.cover6)]]
  return (
    <HomeSection id="coverage" title="Coverage desk" sub="How defenses line up against the pass: man vs zone, the shells they lean on, and how often they send extra rushers.">
      <div className="tp-grid-2" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        <Card title="Man vs zone" note={desk ? `${desk.season} season` : undefined}>
          {rows.length ? (
            <>
              <div style={{ maxHeight: 430, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
                {rows.map(r => {
                  const t = teams.get(r.id)
                  return (
                    <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '24px 36px minmax(0,1fr) 150px', gap: 8, alignItems: 'center' }}>
                      {t ? <TeamLogo team={t} size={20} /> : <span />}
                      <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 13 }}>{r.id}</span>
                      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: C.soft }} title={`Man ${(r.man as number).toFixed(0)}% · Zone ${(r.zone as number).toFixed(0)}%`}>
                        <div style={{ width: `${r.man}%`, background: t?.color ?? C.orange }} />
                        <div style={{ width: `${r.zone}%`, background: '#cfc8b8' }} />
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: 9.5, color: '#5b5347', textAlign: 'right', whiteSpace: 'nowrap' }}>{(r.man as number).toFixed(0)}% man · {(r.zone as number).toFixed(0)}% zone</span>
                    </div>
                  )
                })}
              </div>
              <Foot>Colour = man coverage, grey = zone; sorted by man share. Only about 55–65% of plays carry a charted coverage type. {desk && desk.season < currentSeason ? `${desk.season} data shown: nflverse has not published 2026 coverage charting yet, so nothing here is estimated for this season.` : ''}</Foot>
            </>
          ) : <Empty>Coverage charting is not available yet.</Empty>}
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="League shell usage" note={desk ? `${desk.season} average` : undefined}>
            {shells.some(s => s[1] != null) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {shells.map(([l, v]) => v != null && (
                  <div key={l} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) 44px', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#5b5347' }}>{l}</span>
                    <div style={{ height: 9, background: C.soft, borderRadius: 5 }}><div style={{ width: `${Math.min(100, (v / 45) * 100)}%`, height: '100%', background: C.orange, borderRadius: 5 }} /></div>
                    <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{v.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            ) : <Empty>No shell data yet.</Empty>}
          </Card>
          <Card title="Who blitzes most" note="FTN charting · this season">
            {blitz.length ? (
              <BarList rows={blitz.slice(0, 6).map(b => ({ id: b.id, v: b.blitz as number }))} color={id => teams.get(id)?.color ?? C.orange} fmt={v => `${(v * 100).toFixed(0)}%`} max={Math.max(0.01, blitz[0].blitz as number)} />
            ) : <Empty>No blitz sample yet.</Empty>}
            <Foot>Share of opposing dropbacks with at least one extra rusher.{early ? ' Includes last season while the sample is small.' : ''} FTN Data via nflverse.</Foot>
          </Card>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Chip tone="plain">Coverage is charted by FTN</Chip></div>
        </div>
      </div>
    </HomeSection>
  )
}
