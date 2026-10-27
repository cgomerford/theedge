// src/components/scout/OnePager.tsx
//
// The Scout Report's Overview: one page for the game. For each club: where it stands, what it is good at and where it struggles (its league ranks),
// tonight's starter, the lineup, the bench and the bullpen. Every block has an "open the detailed view" link into the tab that goes deeper (Starters,
// Lineups, Bullpen & late game, Run game, defense & park). Server component, free for everyone; descriptions of what has happened, not predictions.
// Data: lib/scout/one-pager.ts. A part with no data says so instead of guessing.

import Link from 'next/link'
import { Headshot, TeamMark } from '@/components/home/Logo'
import { C, SANS } from '@/components/team/ui'
import { ordinal } from '@/lib/ordinal'
import { MLB_TEAMS } from '@/lib/teams'
import { getClubOnePager, type ClubOnePager, type RankItem } from '@/lib/scout/one-pager'
import PrintButton from './PrintButton'
import type { ScoutContext } from './types'

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, fontFamily: SANS }
const kick: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.14em', color: C.orange, textTransform: 'uppercase' }
const more: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: C.orange, textDecoration: 'none', whiteSpace: 'nowrap' }
const f3 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.'))
const f2 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2))

function RankRow({ it, good }: { it: RankItem; good: boolean }) {
  const pct = ((it.of - it.rank) / (it.of - 1)) * 100
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 62px 86px', alignItems: 'center', gap: 8, fontSize: 13, padding: '5px 0', borderTop: `1px solid ${C.soft}` }}>
      <span><b>{it.label}</b> <span style={{ color: C.faint, fontSize: 11 }}>{it.group}</span></span>
      <span style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontWeight: 800 }} title={`League ${it.leagueDisplay}`}>{it.display}</span>
      <span title={`${ordinal(it.rank)} of ${it.of}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ flex: 1, height: 8, background: C.soft, borderRadius: 4, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${pct}%`, background: good ? '#1D9E75' : '#D4533B' }} /></span>
        <span style={{ fontSize: 11, color: C.mute, width: 28, textAlign: 'right' }}>{ordinal(it.rank)}</span>
      </span>
    </div>
  )
}

function ClubPage({ d }: { d: ClubOnePager }) {
  const { club, profile: p, lineup, desk } = d
  const st = p?.row.st
  const last10 = st?.splits?.lastTen
  const flagWord: Record<string, string> = { overworked: 'Heavy use', sharp: 'Effective', shaky: 'Shaky', rested: 'Rested', steady: 'Steady' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <TeamMark id={club.id} abbr={club.abbr} size={36} />
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>{club.name}</h2>
          <Link href={`/mlb/teams/${MLB_TEAMS.find(t => t.id === club.id)?.slug ?? ''}`} style={{ ...more, marginLeft: 'auto' }}>Team page →</Link>
        </div>
        {st ? (
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(80px,1fr))', gap: '10px 8px', margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
            {([['Record', `${st.w}-${st.l}`], ['Run diff', `${st.diff > 0 ? '+' : ''}${st.diff}`], ['Streak', st.streak || '—'], ['Last 10', last10 ? `${last10.w}-${last10.l}` : '—'], ['Division', ordinal(st.divRank)]] as [string, string][]).map(([k, v]) => (
              <div key={k}><dt style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }}>{k}</dt><dd style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{v}</dd></div>
            ))}
          </dl>
        ) : <p style={{ margin: '10px 0 0', fontSize: 13, color: C.mute }}>Standings are not available right now.</p>}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><div style={kick}>Strengths and weaknesses</div><span style={{ fontSize: 11, color: C.mute }}>league rank, 1st is best</span></div>
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: '#1D9E75' }}>Where it is strongest</div>
        {d.strengths.length ? d.strengths.map(i => <RankRow key={i.label + i.group} it={i} good />) : <p style={{ margin: '4px 0 0', fontSize: 13, color: C.mute }}>Nothing in the top third of the league.</p>}
        <div style={{ marginTop: 12, fontSize: 12, fontWeight: 800, color: '#D4533B' }}>Where it struggles</div>
        {d.weaknesses.length ? d.weaknesses.map(i => <RankRow key={i.label + i.group} it={i} good={false} />) : <p style={{ margin: '4px 0 0', fontSize: 13, color: C.mute }}>Nothing in the bottom third of the league.</p>}
        <div style={{ marginTop: 10 }}><Link href="?tab=field" style={more}>Run game, defense and park, in detail →</Link></div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><div style={kick}>Probable starter</div><Link href="?tab=starters" style={more}>Open the detailed view →</Link></div>
        {club.probableId != null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <Headshot id={club.probableId} name={club.probableName ?? ''} size={44} />
            <div style={{ minWidth: 0 }}>
              <b style={{ fontSize: 18, fontWeight: 800 }}>{club.probableName}</b>
              <div style={{ fontSize: 13, color: C.mute }}>{d.starter ? `${d.starter.hand === 'L' ? 'Left' : d.starter.hand === 'R' ? 'Right' : ''}${d.starter.hand ? '-handed · ' : ''}${d.starter.ip.toFixed(1)} IP · ${f2(d.starter.era)} ERA · ${f2(d.starter.whip)} WHIP${d.starter.kPct != null ? ` · ${(d.starter.kPct * 100).toFixed(1)}% K` : ''}` : 'No season line on record.'}</div>
            </div>
          </div>
        ) : <p style={{ margin: '8px 0 0', fontSize: 13, color: C.mute }}>The starter has not been announced yet.</p>}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={kick}>Lineup · {lineup?.source === 'confirmed' ? 'confirmed' : lineup && lineup.batters.length ? 'taken from the last game' : 'not available'}</div>
          <Link href="?tab=lineups" style={more}>Open the detailed view →</Link>
        </div>
        {lineup && lineup.batters.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            <thead><tr style={{ color: C.faint, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}><th style={{ textAlign: 'left', padding: '4px 0' }}>#</th><th style={{ textAlign: 'left' }}>Hitter</th><th>Bats</th><th>AVG</th><th>OPS</th></tr></thead>
            <tbody>
              {lineup.batters.map(b => (
                <tr key={b.player_id} style={{ borderTop: `1px solid ${C.soft}` }}>
                  <td style={{ padding: '5px 0', color: C.mute }}>{b.batting_order}</td>
                  <td><Link href={`/mlb/lab/batting-lab/${b.player_id}`} style={{ color: C.ink, textDecoration: 'none', fontWeight: 800 }}>{b.player_name}</Link> <span style={{ color: C.faint, fontSize: 11 }}>{b.position}</span></td>
                  <td style={{ textAlign: 'center' }}>{b.switch_hitter ? 'S' : b.bat_side ?? '—'}</td>
                  <td style={{ textAlign: 'center' }}>{f3(b.season_avg)}</td><td style={{ textAlign: 'center' }}>{f3(b.season_ops)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p style={{ margin: '8px 0 0', fontSize: 13, color: C.mute }}>No lineup is available yet.</p>}
      </div>

      <div style={card}>
        <div style={kick}>Reserves</div>
        {d.bench.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {d.bench.map(h => (
              <Link key={h.id} href={`/mlb/lab/batting-lab/${h.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${C.line}`, borderRadius: 999, padding: '3px 10px 3px 4px', textDecoration: 'none', color: C.ink, fontSize: 12, fontWeight: 800 }}>
                <Headshot id={h.id} name={h.name} size={24} />{h.name} <span style={{ color: C.faint, fontWeight: 600 }}>{h.pos} · {f3(h.ops)} OPS · {h.pa} PA</span>
              </Link>
            ))}
          </div>
        ) : <p style={{ margin: '8px 0 0', fontSize: 13, color: C.mute }}>No reserve hitters with enough plate appearances.</p>}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><div style={kick}>Bullpen</div><Link href="?tab=bullpen" style={more}>Open the detailed view →</Link></div>
        {p?.ranks.bullpen.length ? (
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#5b5347' }}>
            {p.ranks.bullpen.filter(m => m.rank != null).slice(0, 3).map(m => `${m.label} ${m.display} (${ordinal(m.rank as number)} of ${m.of})`).join(' · ')}
          </p>
        ) : null}
        {desk && desk.arms.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            <thead><tr style={{ color: C.faint, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}><th style={{ textAlign: 'left', padding: '4px 0' }}>Arm</th><th>Role</th><th>ERA</th><th>Last 3 days</th><th>Status</th></tr></thead>
            <tbody>
              {desk.arms.slice(0, 7).map(a => (
                <tr key={a.id} style={{ borderTop: `1px solid ${C.soft}` }}>
                  <td style={{ padding: '5px 0', fontWeight: 800 }}>{a.name} <span style={{ color: C.faint, fontSize: 11, fontWeight: 600 }}>{a.hand ?? ''}</span></td>
                  <td style={{ textAlign: 'center', color: C.mute }}>{a.role}</td>
                  <td style={{ textAlign: 'center' }}>{f2(a.seasonEra)}</td>
                  <td style={{ textAlign: 'center' }}>{a.p3} pitches</td>
                  <td style={{ textAlign: 'center', fontWeight: 800, color: a.flag === 'overworked' || a.flag === 'shaky' ? '#D4533B' : a.flag === 'sharp' || a.flag === 'rested' ? '#1D9E75' : C.mute }} title={a.flagReason}>{flagWord[a.flag] ?? a.flag}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : d.relievers.length ? (
          <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', fontSize: 13 }}>
            {d.relievers.map(r => <li key={r.id} style={{ padding: '4px 0', borderTop: `1px solid ${C.soft}` }}><b>{r.name}</b> <span style={{ color: C.mute }}>{r.hand ?? ''} · {r.ip.toFixed(1)} IP · {f2(r.era)} ERA · {r.saves} SV · {r.holds} HLD</span></li>)}
          </ul>
        ) : <p style={{ margin: '8px 0 0', fontSize: 13, color: C.mute }}>No bullpen data is available right now.</p>}
      </div>
    </div>
  )
}

export default async function OnePager({ ctx }: { ctx: ScoutContext }) {
  const [away, home] = await Promise.all([getClubOnePager(ctx.away, ctx), getClubOnePager(ctx.home, ctx)])
  return (
    <div style={{ fontFamily: SANS }}>
      <style>{`.op-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;align-items:start}@media (max-width:900px){.op-grid{grid-template-columns:minmax(0,1fr)}}@media print{.op-hide{display:none!important}.op-grid{gap:10px}}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>{ctx.away.abbr} at {ctx.home.abbr}: the one-page overview</h2>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#5b5347' }}>{ctx.away.probableName ?? 'TBD'} against {ctx.home.probableName ?? 'TBD'} at {ctx.venueName}. Each block opens a detailed view in the other tabs.</p>
        </div>
        <span className="op-hide" style={{ marginLeft: 'auto' }}><PrintButton label="Print this page" /></span>
      </div>
      <div className="op-grid">
        <ClubPage d={away} />
        <ClubPage d={home} />
      </div>
      <p style={{ margin: '14px 0 0', fontSize: 11, color: C.faint, textAlign: 'center' }}>League ranks are among the clubs that have the number. Descriptions of what has happened this season, not predictions.</p>
    </div>
  )
}
