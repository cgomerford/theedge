// Series tab (open to all): status chips, a line score per played game, team totals, top performers, pitching usage and what changed.
import { TeamMark } from '@/components/home/Logo'
import { getSeriesData, type PlayedGame, type TeamTotals } from '@/lib/game-tabs/series'
import { ipText } from '@/lib/game-tabs/pitchers'
import type { CockpitCtx } from '@/components/game-cockpit/GameTabs'
import { Card, MUTE, LINE, num } from './ui'

const cap: React.CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTE }
const chip: React.CSSProperties = { display: 'inline-block', border: `1px solid ${LINE}`, background: '#fff', borderRadius: 4, padding: '5px 10px', fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' }
const dayText = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '').toUpperCase()

function Line({ p }: { p: PlayedGame }) {
  const th: React.CSSProperties = { padding: '4px 6px', textAlign: 'center', color: MUTE, fontSize: 12 }
  const td: React.CSSProperties = { padding: '6px', textAlign: 'center' }
  const rows = [{ abbr: p.g.awayAbbr, id: p.g.awayId, side: 'away' as const }, { abbr: p.g.homeAbbr, id: p.g.homeId, side: 'home' as const }]
  const awayWon = (p.g.awayScore ?? 0) > (p.g.homeScore ?? 0)
  return (
    <Card>
      <div style={cap}>G{p.no} · {dayText(p.g.date)} · {p.g.venue} · Final</div>
      <div style={{ fontSize: 20, fontWeight: 800, margin: '8px 0', ...num }}>{awayWon ? `${p.g.awayAbbr} ${p.g.awayScore}, ${p.g.homeAbbr} ${p.g.homeScore}` : `${p.g.homeAbbr} ${p.g.homeScore}, ${p.g.awayAbbr} ${p.g.awayScore}`}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, ...num }}>
          <thead><tr><th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: '#fff' }}>Team</th>{p.innings.map(i => <th key={i.num} style={th}>{i.num}</th>)}<th style={th}>R</th><th style={th}>H</th><th style={th}>E</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.side} style={{ borderTop: `1px solid ${LINE}` }}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 800, position: 'sticky', left: 0, background: '#fff' }}>{r.abbr}</td>
              {p.innings.map(i => <td key={i.num} style={td}>{i[r.side] == null ? (r.side === 'home' && i.num === 9 ? 'x' : '') : i[r.side]}</td>)}
              <td style={{ ...td, fontWeight: 800 }}>{p.totals[r.side].r}</td><td style={td}>{p.totals[r.side].h}</td><td style={td}>{p.totals[r.side].e}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>{[p.decisions.w && `W: ${p.decisions.w}`, p.decisions.l && `L: ${p.decisions.l}`, p.decisions.s && `S: ${p.decisions.s}`].filter(Boolean).join(' · ')}</div>
      <div style={cap}><div style={{ marginTop: 12 }}>Starters</div></div>
      <div style={{ fontSize: 13, color: '#57534E' }}>
        {rows.map(r => { const s = p.starters[r.side]; return s ? <div key={r.side}>{r.abbr}: {s.name} {s.ip} IP, {s.er} ER, {s.k} K, {s.pit} pitches</div> : null })}
      </div>
    </Card>
  )
}

const STATS: [string, keyof TeamTotals][] = [['R', 'r'], ['H', 'h'], ['2B', 'd'], ['HR', 'hr'], ['BB', 'bb'], ['K', 'k'], ['SB', 'sb'], ['LOB', 'lob']]

export async function SeriesTab({ ctx }: { ctx: CockpitCtx }) {
  const d = await getSeriesData(ctx)
  return (
    <div style={{ marginTop: 16 }}>
      <style>{`.gs-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;align-items:start;margin-top:20px}@media(max-width:900px){.gs-two{grid-template-columns:minmax(0,1fr)}}`}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <span style={chip}>{d.statusChip}</span>{d.nextChip ? <span style={chip}>{d.nextChip}</span> : null}{d.remainChip ? <span style={chip}>{d.remainChip}</span> : null}
      </div>
      {d.played.length === 0 ? <div style={{ marginTop: 16, fontSize: 14, color: MUTE }}>No games played in this series yet.</div> : (
        <>
          <div className="gs-two">{d.played.map(p => <Line key={p.g.gamePk} p={p} />)}</div>
          <div className="gs-two">
            <Card>
              <div style={cap}>Team totals · {d.played.map(p => `G${p.no}`).join(' + ')}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, marginTop: 8, ...num }}>
                <thead><tr style={{ color: MUTE, fontSize: 12 }}><th style={{ textAlign: 'left', padding: 4 }}>Stat</th><th style={{ textAlign: 'right', padding: 4 }}>{ctx.away.abbr}</th><th style={{ padding: 4 }} /><th style={{ textAlign: 'right', padding: 4 }}>{ctx.home.abbr}</th></tr></thead>
                <tbody>{STATS.map(([lab, k]) => {
                  const a = d.totals.away[k], h = d.totals.home[k], tot = a + h || 1
                  return (
                    <tr key={lab} style={{ borderTop: `1px solid ${LINE}` }}>
                      <td style={{ padding: '6px 4px' }}>{lab}</td><td style={{ padding: 4, textAlign: 'right', fontWeight: 800 }}>{a}</td>
                      <td style={{ padding: '6px 10px', width: '46%' }}><span aria-hidden style={{ display: 'flex', height: 8 }}><span style={{ width: `${(a / tot) * 100}%`, background: '#1A1A1A' }} /><span style={{ width: `${(h / tot) * 100}%`, background: '#8a8275' }} /></span></td>
                      <td style={{ padding: 4, textAlign: 'right', fontWeight: 800 }}>{h}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </Card>
            <Card>
              <div style={cap}>Top performers · series</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 8, ...num }}>
                <thead><tr style={{ color: MUTE, fontSize: 12, textAlign: 'right' }}><th style={{ textAlign: 'left', padding: 4 }}>Batter</th><th style={{ padding: 4 }}>H-AB</th><th style={{ padding: 4 }}>HR</th><th style={{ padding: 4 }}>RBI</th><th style={{ padding: 4 }}>BB</th></tr></thead>
                <tbody>{d.performers.map(p => (
                  <tr key={p.name} style={{ borderTop: `1px solid ${LINE}`, textAlign: 'right' }}>
                    <td style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 700 }}>{p.name} <span style={{ color: MUTE, fontWeight: 400, fontSize: 12 }}>{p.abbr}</span></td><td style={{ padding: 4 }}>{p.h}-{p.ab}</td><td style={{ padding: 4 }}>{p.hr}</td><td style={{ padding: 4 }}>{p.rbi}</td><td style={{ padding: 4 }}>{p.bb}</td>
                  </tr>
                ))}</tbody>
              </table>
            </Card>
          </div>
          <div className="gs-two">
            <Card>
              <div style={cap}>Pitching usage across the series</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 8, ...num }}>
                  <thead><tr style={{ color: MUTE, fontSize: 12, textAlign: 'right' }}><th style={{ textAlign: 'left', padding: 4 }}>Team</th><th style={{ padding: 4 }}>Starters IP</th><th style={{ padding: 4 }}>Starter pitches</th><th style={{ padding: 4 }}>Relief IP</th><th style={{ padding: 4 }}>Relief pitches</th><th style={{ padding: 4, textAlign: 'left' }}>Relievers used</th></tr></thead>
                  <tbody>{(['away', 'home'] as const).map(s => { const u = d.usage[s]; return (
                    <tr key={s} style={{ borderTop: `1px solid ${LINE}`, textAlign: 'right' }}>
                      <td style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 800 }}>{u.abbr}</td><td style={{ padding: 4 }}>{ipText(u.startOuts)}</td><td style={{ padding: 4 }}>{u.startPit}</td><td style={{ padding: 4 }}>{ipText(u.reliefOuts)}</td><td style={{ padding: 4 }}>{u.reliefPit}</td>
                      <td style={{ padding: 4, textAlign: 'left' }}>{u.used.length} ({u.used.join(', ')})</td>
                    </tr>
                  ) })}</tbody>
                </table>
              </div>
            </Card>
            <Card>
              <div style={cap}>What changed since G{d.played.length}</div>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>{d.changed.length ? d.changed.map(c => <li key={c}>{c}</li>) : <li style={{ color: MUTE }}>No changes to report.</li>}</ul>
            </Card>
          </div>
        </>
      )}
      <TeamPair a={ctx.away} h={ctx.home} />
    </div>
  )
}

function TeamPair({ a, h }: { a: CockpitCtx['away']; h: CockpitCtx['home'] }) {
  return <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18, fontSize: 12, color: MUTE }}><TeamMark id={a.id} abbr={a.abbr} size={18} />{a.name} at <TeamMark id={h.id} abbr={h.abbr} size={18} />{h.name}. Totals and lines come from the game feeds.</div>
}
