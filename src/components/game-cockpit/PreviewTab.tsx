// Game Preview tab, laid out like the build guide's round-3 mockup (08): status chips, away starter | bullpen + park | home starter, then the two bats-vs-starter tables.
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Headshot, TeamMark } from '@/components/home/Logo'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import ThroughDate, { formatThrough } from '@/components/data/ThroughDate'
import PendingBlock from '@/components/data/PendingBlock'
import SignupAsk from '@/components/signup/SignupAsk'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { pitchColor, pitchLabel } from '@/lib/lab/pitch-meta'
import { getBullpenRecent, type StarterBlock, type TeamLineup, type LineupRow, type BullpenRow } from '@/lib/game-cockpit'
import { getPitcherTabData, type PitcherTabData } from '@/lib/game-tabs/pitchers'
import { getParkIndex, getParkHitSummary, type ParkIndex } from '@/lib/park-index'
import ParkHitTable from './ParkHitTable'
import { cockpitData, type CockpitCtx } from './GameTabs'

const MUTE = '#8a8275'
const LINE = '#e7e2d8'
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }
const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, minWidth: 0 }
const kicker: React.CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: MUTE, margin: '0 0 8px' }
const ops3 = (v: number | null) => (v == null ? '' : v.toFixed(3).replace(/^0/, ''))

const Star = () => <span title="Small sample size" style={{ color: '#FF5722', fontWeight: 800 }}>*</span>
const SMALL_NOTE = `* Small sample size: under ${MIN_SAMPLE.arsenalPitchesPerType} pitches of a type, ${MIN_SAMPLE.whiffSwings} swings, ${MIN_SAMPLE.h2hPA} head-to-head PA, or ${MIN_SAMPLE.batterPercentilePA} batters faced / plate appearances. Read with caution.`
const Note = () => <div style={{ fontSize: 12, color: MUTE, marginTop: 8 }}>{SMALL_NOTE}</div>

// Half-circle gauge: the fill runs left to right by PERCENTILE, so 100th percentile is the far right end and 0 is the far left.
function Gauge({ pct, text, color, star }: { pct: number | null; text: string; color: string; star?: boolean }) {
  const r = 52, cx = 60, cy = 60
  const pt = (f: number) => [cx - r * Math.cos(Math.PI * f), cy - r * Math.sin(Math.PI * f)]
  const t = pct == null ? 0 : Math.max(0, Math.min(1, pct / 100))
  const [x1, y1] = pt(0), [x2, y2] = pt(1), [xv, yv] = pt(t)
  return (
    <svg width="120" height="78" viewBox="0 0 120 78" style={{ flex: '0 0 120px' }} role="img" aria-label={`${text}${pct != null ? `, ${pct}th percentile` : ''}`}>
      <path d={`M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}`} fill="none" stroke="#e7e2d8" strokeWidth="10" strokeLinecap="round" />
      {pct != null && t > 0 ? <path d={`M${x1},${y1} A${r},${r} 0 0 1 ${xv},${yv}`} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" /> : null}
      <text x="60" y="58" textAnchor="middle" fontSize="22" fontWeight="800">{text}{star ? '*' : ''}</text>
      <text x="8" y="75" fontSize="12" fill={MUTE}>0</text>
      <text x="112" y="75" textAnchor="end" fontSize="12" fill={MUTE}>100</text>
    </svg>
  )
}

function StarterCard({ s, label, teamName, teamId, teamAbbr, lookHref, extra, vsLine }: { s: StarterBlock; label: string; teamName: string; teamId: number; teamAbbr: string; lookHref: string; extra: PitcherTabData | null; vsLine: { abbr: string; lines: { code: string; xwoba: number | null; pa: number }[] } }) {
  const line = [s.wins != null && s.losses != null ? `${s.wins}-${s.losses}` : null, s.era != null ? `${s.era.toFixed(2)} ERA` : null, s.ip ? `${s.ip} IP` : null].filter(Boolean).join(' · ')
  return (
    <section style={card}>
      <p style={kicker}>{label} starter{s.hand ? ` · ${s.hand}HP` : ''}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {s.id ? <Headshot id={s.id} name={s.name ?? ''} size={56} /> : <TeamMark id={teamId} abbr={teamAbbr} size={36} />}
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 8 }}>
            {s.name ?? 'Starter not announced yet'}{s.opener ? <span style={{ fontSize: 12, color: '#FF5722' }}>Opener</span> : null}
            <TeamMark id={teamId} abbr={teamAbbr} size={22} />
          </div>
          <div style={{ fontSize: 14, color: MUTE, ...num }}>{s.status === 'ok' ? line : teamName}</div>
        </div>
      </div>
      {s.status === 'first_start' ? <p style={{ margin: '14px 0 0', fontSize: 14 }}>First MLB start, no pitch data yet</p> : null}
      {s.status === 'ok' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '14px 0 4px' }}>
            {s.xwoba != null ? <Gauge pct={s.xwobaPct} text={ops3(s.xwoba)} color="#FF5722" star={s.bf < MIN_SAMPLE.pitcherPercentileBF} /> : <span style={{ fontSize: 13, color: MUTE }}>No xwOBA yet</span>}
            <div style={{ fontSize: 13, color: MUTE }}>
              Contact allowed (xwOBA). Far right = 100th percentile, the weakest contact allowed among pitchers with 30+ IP.{s.xwobaPct != null ? ` He sits at the ${s.xwobaPct}th.` : ''}
              <div style={num}>n {s.bf.toLocaleString('en-US')} batters faced</div>
              <ThroughDate date={s.throughDate} />
            </div>
          </div>
          <p style={{ ...kicker, margin: '14px 0 6px' }}>Pitch mix · swing and miss</p>
          {s.hasPitchData ? (
            <>
              <div style={{ display: 'flex', height: 12, borderRadius: 3, overflow: 'hidden' }} aria-hidden>
                {s.mix.filter(m => m.usagePct != null).map(m => <span key={m.code} style={{ width: `${m.usagePct}%`, background: pitchColor(m.code) }} />)}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 6, ...num }}>
                <tbody>
                  {s.mix.map(m => (
                    <tr key={m.code} style={{ borderTop: `1px solid ${LINE}` }}>
                      <td style={{ padding: '5px 0', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><SpinBall code={m.code} spin={s.spin[m.code]} /><b>{pitchLabel(m.code)}</b>{m.pitches < MIN_SAMPLE.arsenalPitchesPerType ? <Star /> : null}</span>
                      </td>
                      <td style={{ padding: 5, textAlign: 'right' }}>{m.usagePct == null ? '' : `${m.usagePct.toFixed(1)}%`}</td>
                      <td style={{ padding: 5, textAlign: 'right' }}>{m.velo == null ? '' : `${m.velo.toFixed(1)} mph`}</td>
                      <td style={{ padding: 5, textAlign: 'right', whiteSpace: 'nowrap' }}>{m.whiffPct == null ? '' : <><b>{m.whiffPct.toFixed(1)}% miss</b>{m.swings < MIN_SAMPLE.whiffSwings || m.pitches < MIN_SAMPLE.arsenalPitchesPerType ? <Star /> : null}</>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <SpinBallStyles />
            </>
          ) : <PendingBlock label="Team pitching numbers" />}
          {s.lastStart ? (
            <p style={{ margin: '12px 0 0', fontSize: 14, ...num }}>
              <b>Most recent outing</b>{s.lastStart.stage ? ` (${s.lastStart.stage})` : ''} {formatThrough(s.lastStart.date) ?? s.lastStart.date}{s.lastStart.opponent ? ` vs ${s.lastStart.opponent}` : ''}: {s.lastStart.ip} IP, {s.lastStart.h} H, {s.lastStart.r} R, {s.lastStart.k} K{s.lastStart.pitches != null ? `, ${s.lastStart.pitches} pitches` : ''}
            </p>
          ) : null}
          {s.bf < MIN_SAMPLE.pitcherPercentileBF || s.mix.some(m => m.pitches < MIN_SAMPLE.arsenalPitchesPerType || m.swings < MIN_SAMPLE.whiffSwings) ? <Note /> : null}
          {extra ? <StarterExtras e={extra} vs={vsLine} /> : null}
          <p style={{ margin: '12px 0 0', fontSize: 14 }}><Link href={lookHref} style={{ color: '#FF5722', fontWeight: 800 }}>Attack zones and per-pitch detail</Link></p>
        </>
      )}
      {s.status === 'not_announced' ? <p style={{ margin: '14px 0 0', fontSize: 14 }}>Starter not announced yet</p> : null}
    </section>
  )
}

function StarterExtras({ e, vs }: { e: PitcherTabData; vs: { abbr: string; lines: { code: string; xwoba: number | null; pa: number }[] } }) {
  const starts = e.recent.filter(r => r.gs && r.pit != null).slice(0, 5).reverse()   // oldest to newest
  const maxP = Math.max(100, ...starts.map(r => r.pit as number))
  const W = 150, H = 38
  const pts = starts.map((r, i) => [starts.length > 1 ? (i / (starts.length - 1)) * (W - 12) + 6 : W / 2, H - 4 - ((r.pit as number) / maxP) * (H - 10)] as const)
  const tile = (label: string, v: { v: number; n: number } | null, rule: string) => (
    <div style={{ background: '#f0ece1', borderLeft: `4px solid ${rule}`, padding: '6px 10px', minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: MUTE }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, ...num, lineHeight: 1.15 }}>{v ? ops3(v.v) : <span style={{ fontSize: 13, color: MUTE, fontWeight: 400 }}>pending</span>}</div>
      <div style={{ fontSize: 12, color: MUTE, ...num }}>{v ? `n ${v.n} balls in play` : ''}</div>
    </div>
  )
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{tile('xwOBA v LHB', e.xwLHB, '#6CABDD')}{tile('xwOBA v RHB', e.xwRHB, '#FF5722')}</div>

      <p style={{ ...kicker, margin: '14px 0 6px' }}>Times through the order · wOBA</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {e.tto.map(t => (
          <div key={t.label} style={num}>
            <div style={{ fontSize: 12, color: MUTE }}>{t.label}{t.pa != null ? ` · n ${t.pa} PA` : ''}</div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{t.woba != null ? ops3(t.woba) : <span style={{ fontSize: 13, color: MUTE, fontWeight: 400 }}>pending</span>}{t.pa != null && t.pa < 10 ? <Star /> : null}</div>
            {t.woba != null ? <span style={{ display: 'block', background: '#f1eee6', height: 8, borderRadius: 4, marginTop: 3 }}><span style={{ display: 'block', height: 8, borderRadius: 4, background: '#FF5722', width: `${Math.min(100, (t.woba / 0.5) * 100)}%` }} /></span> : null}
          </div>
        ))}
      </div>

      <p style={{ ...kicker, margin: '14px 0 4px' }}>Last five starts · pitches</p>
      {starts.length >= 2 ? (
        <div style={{ ...num }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Pitches in his last ${starts.length} starts: ${starts.map(r => r.pit).join(', ')}`}>
            <polyline points={pts.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#1A1A1A" strokeWidth="2" />
            {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill="#FF5722" />)}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: W, fontSize: 12, color: MUTE }}>{starts.map((r, i) => <span key={i} style={{ width: 28, textAlign: 'center' }}>{r.pit}<br />{r.ip}</span>)}</div>
          <div style={{ fontSize: 12, color: MUTE }}>Pitches over innings pitched, oldest to newest.</div>
        </div>
      ) : <span style={{ fontSize: 13, color: MUTE }}>pending</span>}

      <p style={{ ...kicker, margin: '14px 0 4px' }}>This lineup v his top two pitches</p>
      <div style={{ display: 'grid', gap: 3, fontSize: 14, ...num }}>
        {vs.lines.map(l => (
          <Link key={l.code} href="?tab=batters" style={{ color: 'inherit', textDecoration: 'none' }}>
            <b>{vs.abbr} hitters v {pitchLabel(l.code).toLowerCase()}s</b>: {l.xwoba != null ? `${ops3(l.xwoba)} xwOBA` : 'pending'}{l.pa < 10 ? <Star /> : null} <span style={{ fontSize: 12, color: MUTE }}>n {l.pa} PA</span> <span style={{ color: '#FF5722', fontWeight: 800 }}>Batters tab</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function BullpenBars({ team, abbr, id, rows }: { team: string; abbr: string; id: number; rows: BullpenRow[] }) {
  const max = Math.max(1, ...rows.map(r => r.total))
  const total = rows.reduce((n, r) => n + r.total, 0)
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800 }}><TeamMark id={id} abbr={abbr} size={22} />{team}</span>
        <span style={{ fontWeight: 800, ...num }}>{total} pitches <span style={{ fontSize: 12, color: MUTE, fontWeight: 500 }}>n {rows.length} relievers</span></span>
      </div>
      {rows.length === 0 ? <div style={{ fontSize: 14, color: MUTE, padding: '6px 0' }}>No relief pitches recorded in this window</div> : rows.map(r => (
        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 32px', gap: 8, alignItems: 'center', fontSize: 14, padding: '2px 0', ...num }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
          <span style={{ background: '#f1eee6', height: 8, borderRadius: 4 }}><span style={{ display: 'block', height: 8, borderRadius: 4, background: '#1A1A1A', width: `${(r.total / max) * 100}%` }} /></span>
          <b style={{ textAlign: 'right' }}>{r.total}</b>
        </div>
      ))}
    </div>
  )
}

async function ParkCard({ park, venue, venueId }: { park: ParkIndex | null; venue: string; venueId: number | null }) {
  const hits = await getParkHitSummary(venueId)
  return (
    <section style={card}>
      <p style={kicker}>x9Lab park index · {venue}</p>
      {!park ? <PendingBlock label="Park index" /> : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Gauge pct={park.pct} text={String(park.index)} color="#1A1A1A" />
          <div style={{ fontSize: 13, color: MUTE, ...num }}>
            Runs per game in home games vs road games. Far right = 100th percentile, the highest-scoring park in the league{park.pct != null ? `; this one sits at the ${park.pct}th` : ''}.
            <div>n = {park.homeGames.toLocaleString('en-US')} home / {park.roadGames.toLocaleString('en-US')} road games, {park.seasons}</div>
            <div>Index 100 = average. Under 100 = fewer runs here.</div>
          </div>
        </div>
      )}
      {hits ? <ParkHitTable s={hits} venue={venue} /> : <div style={{ marginTop: 12 }}><PendingBlock label="Park hit rankings" /></div>}
    </section>
  )
}

function h2h(r: LineupRow) {
  if (!r.h2h) return ''
  if (r.h2h.pa === 0) return <b>Never faced</b>
  // PA · H · HR · K, always shown; a small sample gets an asterisk (explained in the note under the table).
  return <span title={`n ${r.h2h.pa} PA`}><b>{r.h2h.pa} · {r.h2h.h} · {r.h2h.hr} · {r.h2h.k}</b>{r.h2h.pa < MIN_SAMPLE.h2hPA ? <Star /> : null}</span>
}

function BatsTable({ title, lineup, pitcher, through }: { title: string; lineup: TeamLineup; pitcher: StarterBlock; through: string | null }) {
  const codes = pitcher.mix.slice(0, 2).map(m => m.code)
  const th: React.CSSProperties = { padding: '6px 8px', fontSize: 12, color: MUTE, fontWeight: 800, textAlign: 'right', whiteSpace: 'nowrap' }
  return (
    <section style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
        <p style={kicker}>{title}</p>
        <span style={{ fontSize: 12, fontWeight: 800 }}>{lineup.source === 'confirmed' ? 'Confirmed lineup' : 'Projected lineup, not yet confirmed'}</span>
      </div>
      {lineup.rows.length === 0 ? <div style={{ fontSize: 14, color: MUTE }}>Lineup not available yet</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, ...num }}>
            <thead><tr style={{ borderBottom: '1px solid #1A1A1A' }}>
              <th style={{ ...th, textAlign: 'left', paddingLeft: 0, position: 'sticky', left: 0, background: '#fff' }}>Batter</th>
              <th style={th}>Contact (xwOBA)</th>
              <th style={th}>vs {pitcher.name?.split(' ').slice(-1)[0] ?? 'starter'} (PA · H · HR · K)</th>
              {codes.map(c => <th key={c} style={th}>vs {pitchLabel(c)}</th>)}
            </tr></thead>
            <tbody>
              {lineup.rows.map(r => (
                <tr key={r.id} style={{ borderTop: `1px solid ${LINE}` }}>
                  <td style={{ padding: '6px 8px 6px 0', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#fff' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: MUTE, width: 12 }}>{r.order}</span>
                      <Headshot id={r.id} name={r.name} size={34} />
                      <Link href={`/mlb/players/${r.id}`} style={{ color: 'inherit', fontWeight: 800, textDecoration: 'none' }}>{r.name}</Link>
                      <span style={{ color: MUTE, fontSize: 12 }}>bats {r.hand ?? ''}</span>
                    </span>
                  </td>
                  <td style={{ padding: 8, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {!r.contact ? '' : <><b>{ops3(r.contact.xwoba)}</b>{r.contact.pa < MIN_SAMPLE.batterPercentilePA ? <Star /> : null} <span style={{ fontSize: 12, color: MUTE }}>n {Math.round(r.contact.pa).toLocaleString('en-US')}</span></>}
                  </td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{h2h(r)}</td>
                  {r.vsPitch.map(v => (
                    <td key={v.code} style={{ padding: 8, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {v.xwoba == null ? '' : <span title={`n ${v.pa} PA`}><b>{ops3(v.xwoba)}</b>{v.pa < MIN_SAMPLE.batterPercentilePA ? <Star /> : null}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>
        {formatThrough(through) ? `Through ${formatThrough(through)} · regular season. ` : ''}Head-to-head is shown even when small; under {MIN_SAMPLE.h2hPA} PA it carries an asterisk. The pitch columns are xwOBA against that pitch from any pitcher; hover for the number of PA.
      </div>
      <Note />
    </section>
  )
}

function Chip({ children, tone = '#8a8275' }: { children: ReactNode; tone?: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${LINE}`, background: '#fff', borderRadius: 4, padding: '4px 10px', fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' }}><span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: tone }} />{children}</span>
}

export async function PreviewTab({ ctx, seriesLabel }: { ctx: CockpitCtx; seriesLabel: string | null }) {
  const [{ away, home, s }, bpA, bpH, park, exAway, exHome] = await Promise.all([
    cockpitData(ctx),
    getBullpenRecent(ctx.away.id, [ctx.away.pitcherId ?? 0], ctx.gameDate, 3),
    getBullpenRecent(ctx.home.id, [ctx.home.pitcherId ?? 0], ctx.gameDate, 3),
    getParkIndex(ctx.venueId),
    getPitcherTabData(ctx.away.pitcherId, ctx.away.pitcherName, ctx.away.abbr, ctx.season, false),
    getPitcherTabData(ctx.home.pitcherId, ctx.home.pitcherName, ctx.home.abbr, ctx.season, false),
  ])
  // The opposing lineup against each starter's top two pitches (PA-weighted xwOBA across the nine).
  const vsLines = (lu: typeof home) => {
    const codes = lu.rows[0]?.vsPitch.map(v => v.code) ?? []
    return codes.map(code => {
      let w = 0, pa = 0
      for (const r of lu.rows) { const v = r.vsPitch.find(x => x.code === code); if (v && v.xwoba != null && v.pa > 0) { w += v.xwoba * v.pa; pa += v.pa } }
      return { code, xwoba: pa > 0 ? w / pa : null, pa }
    })
  }
  const GREEN = '#1D9E75'
  const neverA = home.rows.filter(r => r.h2h?.pa === 0).length  // home batters who never faced the away starter
  const neverB = away.rows.filter(r => r.h2h?.pa === 0).length
  const confirmed = away.source === 'confirmed' && home.source === 'confirmed'
  const announced = Boolean(ctx.away.pitcherId && ctx.home.pitcherId)
  const through = away.splitsThrough ?? home.splitsThrough
  const lookHref = '?tab=pitchers'
  return (
    <div style={{ marginTop: 16 }}>
      <style>{`.gp-grid{display:grid;grid-template-columns:1fr 1.05fr 1fr;gap:20px;align-items:start}.gp-mid{display:grid;gap:20px}@media(max-width:1000px){.gp-grid{grid-template-columns:1fr}}`}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <Chip tone={confirmed ? GREEN : MUTE}>{confirmed ? 'Lineups confirmed' : 'Lineups not yet posted'}</Chip>
        <Chip tone={announced ? GREEN : MUTE}>{announced ? 'Starters announced' : 'Starter not announced yet'}</Chip>
        {s.home.name && neverA > 0 ? <Chip tone="#FDE047">{neverA} {ctx.home.abbr} hitters never faced {s.away.name?.split(' ').slice(-1)[0]}</Chip> : null}
        {s.away.name && neverB > 0 ? <Chip tone="#FDE047">{neverB} {ctx.away.abbr} hitters never faced {s.home.name?.split(' ').slice(-1)[0]}</Chip> : null}
        {seriesLabel ? <Chip>{seriesLabel}</Chip> : null}
      </div>
      <div className="gp-grid">
        <StarterCard s={s.away} label="Away" teamName={ctx.away.name} teamId={ctx.away.id} teamAbbr={ctx.away.abbr} lookHref={lookHref} extra={exAway} vsLine={{ abbr: ctx.home.abbr, lines: vsLines(home) }} />
        <div className="gp-mid">
          <section style={card}>
            <p style={kicker}>Bullpen · pitches thrown, last 3 days</p>
            <BullpenBars team={ctx.away.name} abbr={ctx.away.abbr} id={ctx.away.id} rows={bpA.rows} />
            <div style={{ height: 12 }} />
            <BullpenBars team={ctx.home.name} abbr={ctx.home.abbr} id={ctx.home.id} rows={bpH.rows} />
          </section>
          <ParkCard park={park} venue={ctx.venueName} venueId={ctx.venueId} />
        </div>
        <StarterCard s={s.home} label="Home" teamName={ctx.home.name} teamId={ctx.home.id} teamAbbr={ctx.home.abbr} lookHref={lookHref} extra={exHome} vsLine={{ abbr: ctx.away.abbr, lines: vsLines(away) }} />
      </div>
      <div style={{ margin: '18px 0' }}><SignupAsk source="preview_inline" /></div>
      <div style={{ display: 'grid', gap: 20 }}>
        <BatsTable title={`${ctx.away.name} bats vs ${s.home.name ?? 'starter'}`} lineup={away} pitcher={s.home} through={through} />
        <BatsTable title={`${ctx.home.name} bats vs ${s.away.name ?? 'starter'}`} lineup={home} pitcher={s.away} through={through} />
      </div>
    </div>
  )
}
