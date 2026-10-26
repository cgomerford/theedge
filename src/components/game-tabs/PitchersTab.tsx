// Pitchers tab: both starters side by side. Zone maps and count plans are the gated part (one deep look per game, feature 'scout_report').
import { Fragment } from 'react'
import { TeamMark, Headshot } from '@/components/home/Logo'
import { ProGateRow } from '@/components/pro/ProGateView'
import { resolveViewer } from '@/lib/gate'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { pitchColor, pitchLabel } from '@/lib/lab/pitch-meta'
import { getPitcherTabData, ipText, type PitcherTabData } from '@/lib/game-tabs/pitchers'
import type { CockpitCtx } from '@/components/game-cockpit/GameTabs'
import ZoneMaps from './ZoneMaps'
import { Card, Label, Tile, Pending, Star, SMALL, MUTE, LINE, num, ops3, GhostBlock } from './ui'

const pct0 = (v: number | null) => (v == null ? '' : `${Math.round(v)}%`)

function Starter({ p, label, gated, teamId }: { p: PitcherTabData; label: string; gated: boolean; teamId: number }) {
  if (!p.id) return <Card><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', color: MUTE }}>{label}</div><div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}><TeamMark id={teamId} abbr={p.teamAbbr} size={28} />Starter not announced yet</div></Card>
  const l = p.line
  const postEra = p.post && p.post.outs > 0 ? ((p.post.er * 27) / p.post.outs).toFixed(2) : null
  return (
    <Card>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', color: MUTE }}>{label}{p.hand ? ` · ${p.hand}HP` : ''}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 14px' }}>
        <Headshot id={p.id} name={p.name ?? ''} size={52} />
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>{p.name}<TeamMark id={teamId} abbr={p.teamAbbr} size={22} /></div>
          <div style={{ fontSize: 14, color: '#57534E', ...num }}>{l ? `${l.w ?? ''}-${l.l ?? ''} · ${l.era?.toFixed(2) ?? ''} ERA · ${l.ip} IP · ${l.k} K · ${l.bb} BB · ${l.whip?.toFixed(2) ?? ''} WHIP (regular season)` : 'Season line pending'}</div>
        </div>
      </div>

      <div className="gt-tiles">
        <Tile rule="#6CABDD" label="xwOBA v LHB" value={p.xwLHB ? ops3(p.xwLHB.v) : <Pending />} title={p.xwLHB ? `n ${p.xwLHB.n} balls in play` : undefined} />
        <Tile rule="#FF5722" label="xwOBA v RHB" value={p.xwRHB ? ops3(p.xwRHB.v) : <Pending />} title={p.xwRHB ? `n ${p.xwRHB.n} balls in play` : undefined} />
        <Tile rule="#8A5A2B" label="Postseason" value={p.post ? `${ipText(p.post.outs)} IP` : <Pending />} sub={p.post ? `${p.post.g} G · ${postEra ?? ''} ERA · ${p.post.k} K` : ''} />
      </div>

      <Label>Full arsenal · {new Date().getFullYear()} incl. postseason · n {p.totalPitches.toLocaleString('en-US')} pitches</Label>
      <div aria-hidden style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
        {p.arsenal.map(r => <span key={r.code} style={{ width: `${r.use}%`, background: pitchColor(r.code) }} />)}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, ...num }}>
          <thead><tr style={{ color: MUTE, fontSize: 12, textAlign: 'right' }}>
            {['Pitch', 'Use', 'v L', 'v R', 'mph', 'IVB in', 'HB in', 'Spin', 'Whiff', 'xwOBA'].map((h, i) => <th key={h} style={{ padding: '4px 6px', textAlign: i ? 'right' : 'left', position: i ? undefined : 'sticky', left: i ? undefined : 0, background: '#fff' }}>{h}</th>)}
          </tr></thead>
          <tbody>{p.arsenal.map(r => {
            const small = r.swings < MIN_SAMPLE.whiffSwings || r.bbe < 10
            return (
              <tr key={r.code} style={{ borderTop: `1px solid ${LINE}`, textAlign: 'right' }}>
                <td style={{ textAlign: 'left', padding: '5px 6px', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#fff' }}><span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: pitchColor(r.code), marginRight: 7 }} />{pitchLabel(r.code)}</td>
                <td style={{ padding: '5px 6px' }}>{r.use == null ? '' : `${r.use.toFixed(1)}%`}</td><td style={{ padding: '5px 6px' }}>{pct0(r.vL)}</td><td style={{ padding: '5px 6px' }}>{pct0(r.vR)}</td>
                <td style={{ padding: '5px 6px' }}>{r.mph?.toFixed(1) ?? ''}</td><td style={{ padding: '5px 6px' }}>{r.ivb?.toFixed(1) ?? ''}</td><td style={{ padding: '5px 6px' }}>{r.hb == null ? '' : `${r.hb > 0 ? '+' : ''}${r.hb.toFixed(1)}`}</td>
                <td style={{ padding: '5px 6px' }}>{r.spin == null ? '' : Math.round(r.spin)}</td>
                <td style={{ padding: '5px 6px' }}>{r.whiff == null ? '' : `${r.whiff.toFixed(1)}%`}{r.swings < MIN_SAMPLE.whiffSwings ? <Star /> : null}</td>
                <td style={{ padding: '5px 6px' }}>{ops3(r.xwoba)}{small && r.xwoba != null ? <Star /> : null}</td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: MUTE, marginTop: 4 }}>HB is shown arm side as +, glove side as −. Pitches under 1% hidden. xwOBA is on contact (n = balls in play).</div>

      <Label>Times through the order · {new Date().getFullYear()}</Label>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, ...num }}>
        <thead><tr style={{ color: MUTE, fontSize: 12, textAlign: 'right' }}><th style={{ textAlign: 'left', padding: 4 }}>Time</th><th style={{ padding: 4 }}>PA</th><th style={{ padding: 4 }}>wOBA</th><th style={{ width: '48%' }} /></tr></thead>
        <tbody>{p.tto.map(t => (
          <tr key={t.label} style={{ borderTop: `1px solid ${LINE}`, textAlign: 'right' }}>
            <td style={{ textAlign: 'left', padding: '5px 4px', fontWeight: 700 }}>{t.label}</td><td style={{ padding: 4 }}>{t.pa ?? ''}</td><td style={{ padding: 4 }}>{ops3(t.woba)}{t.pa != null && t.pa < 10 ? <Star /> : null}</td><td style={{ padding: '4px 4px 4px 12px' }}>{t.woba != null ? <span style={{ display: 'block', background: '#f1eee6', height: 8, borderRadius: 4 }}><span style={{ display: 'block', height: 8, borderRadius: 4, background: '#FF5722', width: `${Math.min(100, (t.woba / 0.5) * 100)}%` }} /></span> : null}</td>
          </tr>
        ))}</tbody>
      </table>

      {gated ? (
        <>
          <Label>Where he locates · share of pitches by zone, {new Date().getFullYear()}</Label>
          {p.zones && (p.zones.lhb || p.zones.rhb) ? (
            <ZoneMaps modes={['share', 'ba', 'slg', 'xwoba']} defaultMode="share" minN={15}
              maps={[p.zones.lhb && { title: 'v LHB', sub: `n ${p.zones.lhb.n.toLocaleString('en-US')} pitches`, cells: p.zones.lhb.cells }, p.zones.rhb && { title: 'v RHB', sub: `n ${p.zones.rhb.n.toLocaleString('en-US')} pitches`, cells: p.zones.rhb.cells }].filter((m): m is NonNullable<typeof m> => !!m)}
              footnote="All 13 zones, catcher's view: the 3x3 strike zone in the middle and the four chase zones in the corners. * under 15 pitches in that zone (left uncoloured)." />
          ) : <Pending />}
          <Label>How he attacks counts · top pitches by count</Label>
          {p.counts && p.counts.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, ...num }}>
              <tbody>{p.counts.map(c => (
                <tr key={c.label} style={{ borderTop: `1px solid ${LINE}` }}>
                  <td style={{ padding: '5px 4px', fontWeight: 700, whiteSpace: 'nowrap' }}>{c.label}</td>
                  <td style={{ padding: 4, width: 120 }}><span aria-hidden style={{ display: 'flex', height: 8, overflow: 'hidden' }}>{c.mix.map(m => <span key={m.code} style={{ width: `${m.pct}%`, background: pitchColor(m.code) }} />)}</span></td>
                  <td style={{ padding: 4 }}>{c.mix.slice(0, 2).map(m => `${pitchLabel(m.code)} ${Math.round(m.pct)}%`).join(' · ')}</td>
                  <td style={{ padding: 4, textAlign: 'right', color: MUTE }}>n {c.n.toLocaleString('en-US')}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <Pending />}
          <div style={{ fontSize: 12, color: MUTE, marginTop: 4 }}></div>
        </>
      ) : (
        <GhostBlock title="Zone maps and count plans are a deep look" detail="Create a free account to open one full look a day." />
      )}

      <Label>Recent outings</Label>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, ...num }}>
          <thead><tr style={{ color: MUTE, fontSize: 12, textAlign: 'right' }}>{['Date', 'Game', 'IP', 'H', 'ER', 'BB', 'K', 'HR', 'Pit'].map((h, i) => <th key={h} style={{ padding: 4, textAlign: i < 2 ? 'left' : 'right', position: i ? undefined : 'sticky', left: i ? undefined : 0, background: '#fff' }}>{h}</th>)}</tr></thead>
          <tbody>{p.recent.map((r, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${LINE}`, textAlign: 'right' }}>
              <td style={{ textAlign: 'left', padding: '5px 4px', position: 'sticky', left: 0, background: '#fff' }}>{r.date}</td><td style={{ textAlign: 'left', padding: 4, whiteSpace: 'nowrap' }}>{r.game}</td>
              <td style={{ padding: 4 }}>{r.ip}</td><td style={{ padding: 4 }}>{r.h}</td><td style={{ padding: 4 }}>{r.er}</td><td style={{ padding: 4 }}>{r.bb}</td><td style={{ padding: 4 }}>{r.k}</td><td style={{ padding: 4 }}>{r.hr}</td><td style={{ padding: 4 }}>{r.pit ?? ''}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Card>
  )
}

export async function PitchersTab({ ctx }: { ctx: CockpitCtx }) {
  const gate = await resolveViewer('scout_report', String(ctx.gamePk))
  const open = gate.tier === 'pro'
  const [away, home] = await Promise.all([
    getPitcherTabData(ctx.away.pitcherId, ctx.away.pitcherName, ctx.away.abbr, ctx.season, open),
    getPitcherTabData(ctx.home.pitcherId, ctx.home.pitcherName, ctx.home.abbr, ctx.season, open),
  ])
  return (
    <div style={{ marginTop: 16 }}>
      <style>{`.gt-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;align-items:start}.gt-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}@media(max-width:900px){.gt-two{grid-template-columns:minmax(0,1fr)}}`}</style>
      <div className="gt-two">
        <Starter p={away} label="Away starter" gated={open} teamId={ctx.away.id} />
        <Starter p={home} label="Home starter" gated={open} teamId={ctx.home.id} />
      </div>
      {!open ? <ProGateRow tier={gate.tier === 'member' ? 'member' : 'anon'} source="game_pitchers" openable={gate.state === 'look_left' ? { feature: 'scout_report', entityId: String(ctx.gamePk) } : undefined} noButton={gate.state === 'unavailable'} /> : null}
      <div style={{ fontSize: 12, color: MUTE, margin: '12px 0' }}>Savant data through the latest date stored for each pitcher; season line is regular season, postseason from the MLB game logs. {SMALL} IVB and HB in inches.</div>
    </div>
  )
}
