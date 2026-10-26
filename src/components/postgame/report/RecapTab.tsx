// Postgame Recap: linescore, decisions, every pitcher's line, starters' pitch mix this game v season, key plate appearances, and links back.
// Plain divider rows and tables; server-rendered from the game feed (lib/game-tabs/recap.ts).
import Link from 'next/link'
import { TeamMark } from '@/components/home/Logo'
import PendingBlock from '@/components/data/PendingBlock'
import { pitchColor, pitchLabel } from '@/lib/lab/pitch-meta'
import { getRecap, type PitchLine } from '@/lib/game-tabs/recap'
import type { PostgameContext } from './types'

const MUTE = '#8a8275', LINE = '#e7e2d8'
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }
const H = ({ children }: { children: React.ReactNode }) => <h2 style={{ margin: '34px 0 8px', fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>{children}</h2>
const th: React.CSSProperties = { padding: '6px 8px', textAlign: 'right', fontSize: 12, color: MUTE, whiteSpace: 'nowrap' }
const pin: React.CSSProperties = { position: 'sticky', left: 0, background: '#FAF8F3' }

function PitchTable({ ctx, rows, side }: { ctx: PostgameContext; rows: PitchLine[]; side: 'away' | 'home' }) {
  const t = ctx[side]
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 2px' }}><TeamMark id={t.id} abbr={t.abbr} size={22} /><b>{t.name}</b></div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, ...num }}>
          <thead><tr><th style={{ ...th, textAlign: 'left', ...pin }}>Pitcher</th>{['IP', 'H', 'R', 'ER', 'BB', 'K', 'Pitches-strikes'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(p => (
            <tr key={p.id} style={{ borderTop: `1px solid ${LINE}`, textAlign: 'right' }}>
              <td style={{ textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap', ...pin }}><b>{p.name}</b>{p.tag ? ` (${p.tag})` : ''}</td>
              <td style={{ padding: 6 }}>{p.ip}</td><td style={{ padding: 6 }}>{p.h}</td><td style={{ padding: 6 }}>{p.r}</td><td style={{ padding: 6 }}>{p.er}</td><td style={{ padding: 6 }}>{p.bb}</td><td style={{ padding: 6 }}>{p.k}</td><td style={{ padding: 6 }}>{p.pit}-{p.strikes}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

export default async function RecapTab({ ctx }: { ctx: PostgameContext }) {
  const r = await getRecap(ctx)
  if (!r) return <PendingBlock label="Game feed" />
  const sides = [{ s: 'away' as const, t: ctx.away }, { s: 'home' as const, t: ctx.home }]
  return (
    <div>
      <style>{`.pg-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px}@media(max-width:900px){.pg-two{grid-template-columns:minmax(0,1fr)}}`}</style>

      <H>Linescore</H>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 16, ...num }}>
          <thead><tr><th style={{ ...th, textAlign: 'left', ...pin }}>Team</th>{r.innings.map(i => <th key={i.num} style={{ ...th, textAlign: 'center' }}>{i.num}</th>)}<th style={th}>R</th><th style={th}>H</th><th style={th}>E</th></tr></thead>
          <tbody>{sides.map(({ s, t }) => (
            <tr key={s} style={{ borderTop: `1px solid ${LINE}`, textAlign: 'center' }}>
              <td style={{ textAlign: 'left', padding: '8px', whiteSpace: 'nowrap', ...pin }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><TeamMark id={t.id} abbr={t.abbr} size={24} /></span></td>
              {r.innings.map(i => <td key={i.num} style={{ padding: 8 }}>{i[s] ?? (s === 'home' && i.num === r.innings.length ? 'x' : '')}</td>)}
              <td style={{ padding: 8, fontWeight: 800, textAlign: 'right' }}>{r.totals[s].r}</td><td style={{ padding: 8, textAlign: 'right' }}>{r.totals[s].h}</td><td style={{ padding: 8, textAlign: 'right' }}>{r.totals[s].e}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <H>Pitcher decisions</H>
      {r.decisions ? (
        <div style={{ fontSize: 16 }}>{[r.decisions.w && <span key="w"><b>W</b> {r.decisions.w}</span>, r.decisions.l && <span key="l"><b>L</b> {r.decisions.l}</span>, r.decisions.s && <span key="s"><b>SV</b> {r.decisions.s}</span>].filter(Boolean).map((x, i) => <span key={i} style={{ marginRight: 22 }}>{x}</span>)}</div>
      ) : <PendingBlock label="Decisions" />}

      <H>Pitching lines</H>
      <div className="pg-two">
        <PitchTable ctx={ctx} rows={r.lines.filter(l => l.side === 'away')} side="away" />
        <PitchTable ctx={ctx} rows={r.lines.filter(l => l.side === 'home')} side="home" />
      </div>

      <H>Starters&apos; pitch mix: this game v the season</H>
      {r.mix.length === 0 ? <PendingBlock label="Pitch mix" /> : (
        <div className="pg-two">
          {r.mix.map(m => {
            const codes = Array.from(new Set([...m.game.map(g => g.code), ...m.season.map(s => s.code)])).sort((a, b) => (m.game.find(g => g.code === b)?.pct ?? 0) - (m.game.find(g => g.code === a)?.pct ?? 0))
            const bar = (items: { code: string; pct: number }[]) => <span aria-hidden style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden' }}>{items.map(i => <span key={i.code} style={{ width: `${i.pct}%`, background: pitchColor(i.code) }} />)}</span>
            return (
              <div key={m.id} style={{ minWidth: 0 }}>
                <b>{m.name}</b>
                <div style={{ fontSize: 12, color: MUTE, margin: '6px 0 2px' }}>This game ({m.gamePitches} pitches)</div>{bar(m.game)}
                <div style={{ fontSize: 12, color: MUTE, margin: '8px 0 2px' }}>Season ({m.seasonPitches.toLocaleString('en-US')} pitches)</div>{bar(m.season.map(x => ({ code: x.code, pct: x.usagePct ?? 0 })))}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 8, ...num }}>
                  <thead><tr><th style={{ ...th, textAlign: 'left' }}>Pitch</th><th style={th}>Game</th><th style={th}>Season</th></tr></thead>
                  <tbody>{codes.map(c => (
                    <tr key={c} style={{ borderTop: `1px solid ${LINE}`, textAlign: 'right' }}>
                      <td style={{ textAlign: 'left', padding: '5px 8px' }}><span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: pitchColor(c), marginRight: 7 }} />{pitchLabel(c)}</td>
                      <td style={{ padding: 6 }}>{(m.game.find(g => g.code === c)?.pct ?? 0).toFixed(1)}%</td>
                      <td style={{ padding: 6 }}>{m.season.find(s => s.code === c)?.usagePct != null ? `${(m.season.find(s => s.code === c)!.usagePct as number).toFixed(1)}%` : ''}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      <H>Key plate appearances</H>
      {r.keyPas.length === 0 ? <PendingBlock label="Key plate appearances" /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, ...num }}>
            <thead><tr><th style={{ ...th, textAlign: 'left', ...pin }}>Inning</th><th style={{ ...th, textAlign: 'left' }}>Batter v pitcher</th><th style={{ ...th, textAlign: 'left' }}>Result</th><th style={th}>Exit velocity</th></tr></thead>
            <tbody>{r.keyPas.map((k, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${LINE}` }}>
                <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', ...pin }}>{k.inning}</td>
                <td style={{ padding: 6 }}><b>{k.batter}</b> v {k.pitcher}</td>
                <td style={{ padding: 6 }}>{k.result}{k.scoring ? ', scoring play' : ''}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{k.ev != null ? `${k.ev.toFixed(1)} mph` : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>Plate appearances are ranked by how much the moment mattered in the MLB game feed. Exit velocity is shown where the ball was put in play.</div>

      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', margin: '34px 0 0', padding: '12px 0', borderTop: `1px solid ${LINE}` }}>
        <Link href={`/mlb/${ctx.slug}/scout-report`} style={{ color: '#FF5722', fontWeight: 800 }}>Scout report →</Link>
        <Link href={`/mlb/${ctx.slug}`} style={{ color: '#FF5722', fontWeight: 800 }}>Game preview →</Link>
      </div>
    </div>
  )
}
