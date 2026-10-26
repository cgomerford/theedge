// Bullpen & park tab (open to all): pitches by series game, leverage arms, the park index, and the game conditions.
import { TeamMark, Headshot } from '@/components/home/Logo'
import { pitchColor, pitchLabel } from '@/lib/lab/pitch-meta'
import { getBullpenParkData, type BullpenCard, type Leverage } from '@/lib/game-tabs/bullpen-park'
import { getSeriesList } from '@/lib/game-tabs/common'
import { ipText } from '@/lib/game-tabs/pitchers'
import type { CockpitCtx } from '@/components/game-cockpit/GameTabs'
import { Card, Label, Tile, Pending, MUTE, LINE, num, ops3 } from './ui'

const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000)

function Bullpen({ c, gameDate }: { c: BullpenCard; gameDate: string }) {
  const th: React.CSSProperties = { padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap' }
  const win = `${c.dates[0]?.label.replace(/ G\d+/, '') ?? ''}–${c.dates[c.dates.length - 1]?.label.replace(/ G\d+/, '') ?? ''}`
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TeamMark id={c.teamId} abbr={c.abbr} size={22} /><span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTE }}>{c.abbr} bullpen · pitches thrown, {win}</span></div>
      <div style={{ fontSize: 17, fontWeight: 800, margin: '10px 0 6px', ...num }}>{c.total} relief pitches by {c.rows.length} arms</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, ...num }}>
          <thead><tr style={{ color: MUTE, fontSize: 12 }}>
            <th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: '#fff' }}>Reliever</th>
            {c.dates.map(d => <th key={d.date} style={th}>{d.label}</th>)}
            <th style={th}>Total</th><th style={th}>Games</th><th style={th}>Days since</th>
          </tr></thead>
          <tbody>{c.rows.map(r => (
            <tr key={r.id} style={{ borderTop: `1px solid ${LINE}`, textAlign: 'right' }}>
              <td style={{ textAlign: 'left', padding: '6px', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#fff' }}>{r.name}</td>
              {c.dates.map(d => <td key={d.date} style={{ padding: 6, color: d.played ? undefined : MUTE }}>{!d.played ? 'off' : r.byDate[d.date] ?? '—'}</td>)}
              <td style={{ padding: 6, fontWeight: 800 }}>{r.total}</td><td style={{ padding: 6 }}>{r.games} of {c.games}</td><td style={{ padding: 6 }}>{daysBetween(r.lastDate, gameDate)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>Days since last appearance, counted to {new Date(`${gameDate}T12:00:00`).getDate()} {new Date(`${gameDate}T12:00:00`).toLocaleString('en-US', { month: 'short' })}. Information only: no availability call is made. Starters excluded.</div>
    </Card>
  )
}

function Arm({ a }: { a: Leverage }) {
  const l = a.line
  const eraPost = a.post && a.post.outs > 0 ? ((a.post.er * 27) / a.post.outs).toFixed(2) : null
  return (
    <Card style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Headshot id={a.id} name={a.name} size={44} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', gap: 6 }}>{a.name}</div>
          <div style={{ fontSize: 13, color: '#57534E', ...num }}>{a.hand ? `${a.hand}HP` : ''}{l ? ` · ${l.era} ERA · ${l.ip} IP · ${l.k} K · ${l.sv} SV · ${l.hld} HLD` : ''}</div>
        </div>
      </div>
      {a.mix.length ? (
        <>
          <div aria-hidden style={{ display: 'flex', height: 8, margin: '10px 0 4px', overflow: 'hidden' }}>{a.mix.map(m => <span key={m.code} style={{ width: `${m.pct}%`, background: pitchColor(m.code) }} />)}</div>
          <div style={{ fontSize: 12, color: MUTE, ...num }}>{a.mix.slice(0, 3).map(m => `${pitchLabel(m.code)} ${Math.round(m.pct)}%${m.mph ? `, ${m.mph.toFixed(1)} mph` : ''}`).join(' · ')}</div>
        </>
      ) : <div style={{ marginTop: 8 }}><Pending /></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 10 }}>
        <Tile rule="#6CB4E8" label="xwOBA v LHB" value={a.xwLHB ? ops3(a.xwLHB.v) : <Pending />} title={a.xwLHB ? `n ${a.xwLHB.n} balls in play` : undefined} />
        <Tile rule="#FF5722" label="xwOBA v RHB" value={a.xwRHB ? ops3(a.xwRHB.v) : <Pending />} title={a.xwRHB ? `n ${a.xwRHB.n} balls in play` : undefined} />
        <Tile rule="#1D9E75" label="Postseason" value={a.post ? `${ipText(a.post.outs)} IP` : <Pending />} sub={a.post ? `${a.post.g} G · ${eraPost} ERA · ${a.post.k} K` : ''} />
      </div>
    </Card>
  )
}

function Gauge({ index }: { index: number }) {
  const t = Math.max(0, Math.min(1, (index - 80) / 40))   // 80 to 120 across the half circle
  const r = 52, cx = 60, cy = 60
  const pt = (f: number) => [cx - r * Math.cos(Math.PI * f), cy - r * Math.sin(Math.PI * f)]
  const [x1, y1] = pt(0), [x2, y2] = pt(1), [xv, yv] = pt(t)
  return (
    <svg width="130" height="80" viewBox="0 0 120 76" style={{ flex: '0 0 130px' }} role="img" aria-label={`Park index ${index}`}>
      <path d={`M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}`} fill="none" stroke="#e7e2d8" strokeWidth="10" strokeLinecap="round" />
      <path d={`M${x1},${y1} A${r},${r} 0 0 1 ${xv},${yv}`} fill="none" stroke="#FF5722" strokeWidth="10" strokeLinecap="round" />
      <text x="60" y="58" textAnchor="middle" fontSize="24" fontWeight="800">{index}</text>
      <text x="8" y="74" fontSize="11" fill={MUTE}>80</text><text x="112" y="74" textAnchor="end" fontSize="11" fill={MUTE}>120</text>
    </svg>
  )
}

export async function BullpenParkTab({ ctx }: { ctx: CockpitCtx }) {
  const series = await getSeriesList(ctx.away.id, ctx.home.id, ctx.gameDate, ctx.gamePk)
  const d = await getBullpenParkData(ctx, series)
  const c = d.conditions
  const row = (k: string, v: React.ReactNode) => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '8px 0', borderTop: `1px solid ${LINE}`, fontSize: 15 }}><span>{k}</span><span style={{ textAlign: 'right' }}>{v}</span></div>
  return (
    <div style={{ marginTop: 16 }}>
      <style>{`.gb-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;align-items:start}.gb-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.gb-park{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:20px;align-items:start}@media(max-width:900px){.gb-two,.gb-three,.gb-park{grid-template-columns:minmax(0,1fr)}}`}</style>
      <div className="gb-two"><Bullpen c={d.away} gameDate={ctx.gameDate} /><Bullpen c={d.home} gameDate={ctx.gameDate} /></div>
      <Label>Leverage arms · {ctx.season} all games</Label>
      <div className="gb-three">{[...d.arms.away, ...d.arms.home].map(a => <Arm key={a.id} a={a} />)}</div>
      <Label>Park and conditions</Label>
      <div className="gb-park">
        <Card>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTE }}>x9Lab park index · {ctx.venueName}</div>
          {d.park ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
              <Gauge index={d.park.index} />
              <div style={{ fontSize: 14, ...num }}>
                <b>Runs per game (both teams)</b>
                <div>Home games here: {d.park.homeRpg.toFixed(2)} ({d.park.homeGames} games)</div>
                <div>Road games: {d.park.roadRpg.toFixed(2)} ({d.park.roadGames} games)</div>
                <div style={{ fontSize: 12, color: MUTE }}>Index = home ÷ road × 100, {d.park.seasons}. 100 is average.</div>
              </div>
            </div>
          ) : <div style={{ marginTop: 10 }}><Pending /></div>}
          {/* [Kit: park index method] The index is read from park_index via getParkIndex(venueId), the same function the Game Preview park card uses. */}
        </Card>
        <Card>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTE }}>Game conditions</div>
          <div style={{ marginTop: 6 }}>
            {row('Roof', c.roof ? `${c.roof}${c.temp ? ` · ${c.temp}°F (MLB feed)` : ''}` : <Pending />)}
            {row('Wind', c.domed ? 'None (indoors)' : c.wind ?? <Pending />)}
            {row('Home plate umpire', c.plate ?? <Pending />)}
            {row('Crew', c.crew.length ? c.crew.map(x => `${x.name} (${x.pos})`).join(' · ') : <Pending />)}
            {row('Umpire zone tendencies', <Pending />)}
          </div>
          {c.domed ? <div style={{ fontSize: 12, color: MUTE, marginTop: 8 }}>Weather module is cut for domed parks; shows the roof line only.</div> : null}
        </Card>
      </div>
    </div>
  )
}
