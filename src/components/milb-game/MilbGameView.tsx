// The minor-league game page body, rendered on the server: score header, line score, box score, scoring plays.
// Same plain divider-and-table style as the player page (Section / tabular numbers / MUTE rules). Everything comes from lib/milb-game.ts; a missing part shows an empty state.
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Section } from '@/components/player-page/PlayerOverviewView'
import { formatThrough } from '@/components/data/ThroughDate'
import type { MilbGame, MilbSide } from '@/lib/milb-game'

const MUTE = '#8a8275', LINE = '#e7e2d8'
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }

function Table({ head, rows, left = 1 }: { head: string[]; rows: ReactNode[][]; left?: number }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, ...num }}>
        <thead><tr style={{ color: MUTE, fontSize: 12 }}>
          {head.map((h, i) => <th key={`${h}-${i}`} style={{ padding: '6px 8px', textAlign: i < left ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map((r, ri) => (
          <tr key={ri} style={{ borderTop: `1px solid ${LINE}` }}>
            {r.map((c, i) => <td key={i} style={{ padding: '6px 8px', textAlign: i < left ? 'left' : 'right', whiteSpace: 'nowrap', ...(i === 0 ? { fontWeight: 700 } : {}) }}>{c}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

const Player = ({ id, name }: { id: number; name: string }) => <Link href={`/mlb/players/${id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{name}</Link>

function ScoreRow({ s, level }: { s: MilbSide; level: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, padding: '6px 0' }}>
      <span style={{ fontSize: 'clamp(20px, 3.4vw, 30px)', fontWeight: s.winner ? 800 : 600, color: s.winner ? '#1A1A1A' : '#5b5347' }}>
        {s.name}{level ? <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: MUTE }}>{level}</span> : null}
      </span>
      <span style={{ fontSize: 'clamp(26px, 4.4vw, 40px)', fontWeight: 800, ...num }}>{s.score ?? ''}</span>
    </div>
  )
}

export function MilbGameView({ g }: { g: MilbGame }) {
  const cols = Math.max(9, g.innings.length)
  const inn = (side: 'away' | 'home') => Array.from({ length: cols }, (_, i) => { const x = g.innings.find(n => n.num === i + 1); return x ? (x[side] ?? '-') : '' })
  const short = (s: MilbSide) => s.abbr || s.name.split(' ').pop() || ''
  const dec = g.decisions
  return (
    <>
      <header style={{ padding: '8px 0 14px', borderBottom: `1px solid ${LINE}` }}>
        <div style={{ fontSize: 13, color: MUTE, ...num }}>
          {g.level ? <span style={{ padding: '1px 9px', border: '1px solid #FF5722', color: '#FF5722', borderRadius: 999, fontWeight: 700, marginRight: 8 }}>{g.level.name}</span> : null}
          {formatThrough(g.date)}{g.venue ? ` · ${g.venue}` : ''} · {g.status}
        </div>
        <ScoreRow s={g.away} level={null} />
        <ScoreRow s={g.home} level={null} />
        {(dec.winner || dec.loser || dec.save) ? (
          <div style={{ marginTop: 6, fontSize: 14, color: '#5b5347' }}>
            {dec.winner ? <span><b>W</b> {dec.winner}</span> : null}{dec.loser ? <span style={{ marginLeft: 14 }}><b>L</b> {dec.loser}</span> : null}{dec.save ? <span style={{ marginLeft: 14 }}><b>S</b> {dec.save}</span> : null}
          </div>
        ) : null}
      </header>

      <Section title="Line score">
        {g.innings.length === 0 ? <Empty>The line score has not been posted.</Empty> : (
          <Table head={['', ...Array.from({ length: cols }, (_, i) => String(i + 1)), 'R', 'H', 'E']} rows={(['away', 'home'] as const).map(k => [
            short(g[k]), ...inn(k), g.totals[k]?.r ?? '', g.totals[k]?.h ?? '', g.totals[k]?.e ?? '',
          ])} />
        )}
      </Section>

      <Section title="Scoring plays">
        {g.scoring.length === 0 ? <Empty>No scoring plays were recorded.</Empty> : (
          <div>
            {g.scoring.map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 96px', gap: 12, padding: '8px 0', borderTop: `1px solid ${LINE}`, fontSize: 14, ...num }}>
                <span style={{ fontWeight: 800 }}>{p.half === 'Top' ? 'Top' : 'Bot'} {p.inning}</span>
                <span>{p.text}</span>
                <span style={{ textAlign: 'right', color: MUTE }}>{short(g.away)} {p.awayScore}, {short(g.home)} {p.homeScore}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <style>{`.mg-box{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 40px}@media (max-width:1000px){.mg-box{grid-template-columns:minmax(0,1fr)}}`}</style>
      <Section title="Box score">
        <div className="mg-box">
          {(['away', 'home'] as const).map(k => (
            <div key={k} style={{ minWidth: 0, marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 16, margin: '4px 0' }}>{g[k].name}</div>
              {g.batting[k].length === 0 ? <Empty>No batting lines.</Empty> : (
                <Table head={['Batter', 'AB', 'R', 'H', 'RBI', 'BB', 'K']} rows={g.batting[k].map(b => [
                  <span key="n"><Player id={b.id} name={b.name} /> <span style={{ fontWeight: 400, color: MUTE, fontSize: 12 }}>{b.pos}</span></span>, b.ab, b.r, b.h, b.rbi, b.bb, b.k,
                ])} />
              )}
              <div style={{ height: 14 }} />
              {g.pitching[k].length === 0 ? <Empty>No pitching lines.</Empty> : (
                <Table head={['Pitcher', 'IP', 'H', 'R', 'ER', 'BB', 'K', 'P']} rows={g.pitching[k].map(p => [
                  <span key="n"><Player id={p.id} name={p.name} />{p.decision ? <span style={{ fontWeight: 400, color: MUTE, fontSize: 12 }}> ({p.decision})</span> : null}</span>, p.ip, p.h, p.r, p.er, p.bb, p.k, p.pitches ?? '',
                ])} />
              )}
            </div>
          ))}
        </div>
      </Section>
      <div style={{ fontSize: 12, color: MUTE, marginTop: 8 }}>Source: MLB Stats API box score and play-by-play. Statcast pitch data is not tracked at this level.</div>
    </>
  )
}

const Empty = ({ children }: { children: ReactNode }) => <div style={{ padding: '10px 0', fontSize: 13, color: MUTE, borderTop: `1px solid ${LINE}` }}>{children}</div>
