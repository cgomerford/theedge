// Batters tab: both lineups against the opposing starter. The tables are open to all; only the hot-zone grids are gated (per-game deep look).
import Link from 'next/link'
import { TeamMark, Headshot } from '@/components/home/Logo'
import { ProGateRow } from '@/components/pro/ProGateView'
import { resolveViewer } from '@/lib/gate'
import { pitchLabel } from '@/lib/lab/pitch-meta'
import { getBattersData, type TeamBatters } from '@/lib/game-tabs/batters'
import { getSeriesList } from '@/lib/game-tabs/common'
import type { CockpitCtx } from '@/components/game-cockpit/GameTabs'
import ZoneMaps from './ZoneMaps'
import { Card, Star, MUTE, LINE, num, ops3, GhostBlock, Pending } from './ui'

function Table({ t }: { t: TeamBatters }) {
  const hand = t.vs.hand
  const th: React.CSSProperties = { padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap' }
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <TeamMark id={t.teamId} abbr={t.abbr} size={24} />
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTE }}>{t.teamName} bats v {t.vs.name ?? 'starter'}{hand ? ` (${hand}HP)` : ''} · {t.source === 'confirmed' ? 'Confirmed lineup' : 'Projected lineup, not yet confirmed'}</span>
      </div>
      {t.rows.length === 0 ? <div style={{ fontSize: 14, color: MUTE, padding: '10px 0' }}>Lineup not available yet</div> : (
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, ...num }}>
            <thead><tr style={{ color: MUTE, fontSize: 12 }}>
              <th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: '#fff' }}>Batter</th>
              <th style={th}>v {hand ?? 'RHP'}HP</th><th style={th}>v {hand === 'L' ? 'RHP' : 'LHP'}</th>
              {t.pitchCodes.map(c => <th key={c} style={th}>v {pitchLabel(c)}</th>)}
              <th style={th}>Post H-AB</th><th style={th}>HR</th><th style={th}>BB</th><th style={th}>K</th><th style={th}>Post xwOBA</th><th style={th}>WS H/PA</th>
            </tr></thead>
            <tbody>{t.rows.map(r => (
              <tr key={r.id} style={{ borderTop: `1px solid ${LINE}`, textAlign: 'right' }}>
                <td style={{ textAlign: 'left', padding: '6px 6px', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#fff' }}>
                  <span style={{ color: MUTE, marginRight: 6 }}>{r.order}</span>
                  <Link href={`/mlb/players/${r.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none' }}><Headshot id={r.id} name={r.name} size={30} /><b>{r.name}</b></Link>
                  <span style={{ color: MUTE, fontSize: 12 }}> {r.pos} · {r.hand ?? ''}</span>
                </td>
                <td title={r.vSame ? `n ${r.vSame.n} PA` : undefined} style={{ padding: '6px 6px' }}>{r.vSame?.v != null ? <>{ops3(r.vSame.v)}{r.vSame.n < 50 ? <Star /> : null}</> : <Pending />}</td>
                <td title={r.vOther ? `n ${r.vOther.n} PA` : undefined} style={{ padding: '6px 6px' }}>{r.vOther?.v != null ? <>{ops3(r.vOther.v)}{r.vOther.n < 50 ? <Star /> : null}</> : <Pending />}</td>
                {r.pitches.map(p => <td key={p.code} title={`n ${p.pa} PA`} style={{ padding: '6px 6px' }}>{p.xwoba != null ? <>{ops3(p.xwoba)}{p.pa < 10 ? <Star /> : null} <span style={{ fontSize: 12, color: MUTE }}>{p.whiff != null ? `${Math.round(p.whiff)}%` : ''}</span></> : <Pending />}</td>)}
                <td style={{ padding: '6px 6px' }}>{r.post ? `${r.post.h}-${r.post.ab}` : <Pending />}</td>
                <td style={{ padding: '6px 6px' }}>{r.post?.hr ?? ''}</td><td style={{ padding: '6px 6px' }}>{r.post?.bb ?? ''}</td><td style={{ padding: '6px 6px' }}>{r.post?.k ?? ''}</td>
                <td style={{ padding: '6px 6px' }}><Pending /></td>
                <td style={{ padding: '6px 6px' }}>{r.post ? `${r.post.wsH}/${r.post.wsPa}` : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>xwOBA, {new Date().getFullYear()} regular season; hover a number for its sample. &quot;v pitch&quot; columns: xwOBA against that pitch from any pitcher, then his whiff rate. Postseason lines from the MLB game logs. * under 50 PA v a hand, or 10 PA v a pitch.</div>
    </Card>
  )
}

function Zones({ t, open }: { t: TeamBatters; open: boolean }) {
  if (!t.rows.length) return null
  const hand = t.vs.hand ?? 'R'
  return (
    <Card>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTE }}>{t.teamName} hot zones v {hand}HP · all 13 zones, catcher&apos;s view, {new Date().getFullYear()} all games</div>
      {open ? (
        <>
          <div style={{ marginTop: 10 }}>
            <ZoneMaps modes={['xwoba', 'ba', 'slg']} defaultMode="xwoba" minN={5} nLabel="at-bats ending in the zone"
              maps={t.rows.filter(r => r.zones).map(r => ({ title: r.name.split(' ').slice(-1)[0], sub: `v ${hand}HP`, cells: r.zones! }))}
              footnote="All 13 zones, catcher's view: the 3x3 strike zone in the middle and the four chase zones in the corners. * under 5 PA ending in that zone (left uncoloured)." />
          </div>
        </>
      ) : <GhostBlock title="Hot zones are a deep look" detail="Create a free account to open one full look a day." />}
    </Card>
  )
}

export async function BattersTab({ ctx }: { ctx: CockpitCtx }) {
  const gate = await resolveViewer('scout_report', String(ctx.gamePk))
  const open = gate.tier === 'pro'
  const series = await getSeriesList(ctx.away.id, ctx.home.id, ctx.gameDate, ctx.gamePk)
  const d = await getBattersData(ctx, series, open)
  const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${LINE}`, background: '#fff', borderRadius: 4, padding: '5px 10px', fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' }
  return (
    <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <span style={chip}><span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: d.chips.confirmed ? '#1D9E75' : MUTE }} />{d.chips.confirmed ? 'Lineups confirmed (MLB feed)' : 'Lineups pending'}</span>
        {d.chips.changes.map(c => <span key={c} style={chip}>{c}</span>)}
      </div>
      <Table t={d.away} />
      <Zones t={d.away} open={open} />
      <Table t={d.home} />
      <Zones t={d.home} open={open} />
      {!open ? <ProGateRow tier={gate.tier === 'member' ? 'member' : 'anon'} source="game_batters" openable={gate.state === 'look_left' ? { feature: 'scout_report', entityId: String(ctx.gamePk) } : undefined} noButton={gate.state === 'unavailable'} /> : null}
      <div style={{ fontSize: 12, color: MUTE }}>Head-to-head v this starter is on Game Preview and not repeated here.</div>
    </div>
  )
}
