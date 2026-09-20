// src/components/team/ProModules.tsx
//
// The Pro "expand" layer of the team page. Each panel extends a concept that
// is already on the page for everyone:
//
//   Season     → SeasonPro     how the record is really built (margins, run
//                              buckets, opponent tier, series results)
//   Identity   → IdentityPro   where all 30 clubs sit on each headline metric
//                              + the three clubs most like this one
//   Staff      → StaffPro      K–BB%, ERA-vs-FIP, rotation FIP table, recent
//                              bullpen workload (pitch quality by pitch type
//                              lives in PitchMixPanel)
//   Offense    → OffensePro    OPS by count / baserunners / score / inning,
//                              ranked, + deeper hitter rates
//   Defense    → DefensePro    who challenges & when (ABS), steal attempts by
//                              count and base
//   Roster     → RosterPro     age vs production for hitters and pitchers
//
// Gating: every panel takes a REQUIRED `isPro`. For non-Pro, the panel is the
// locked card and NO Pro data is fetched — async bodies exist only inside the
// `isPro ? … : null` branch. Server components; Recharts pieces are in charts.tsx.

import { Suspense } from 'react'
import Link from 'next/link'
import type { Team } from '@/lib/teams'
import { getTeamAbs, type TeamProfile, type Metric, type PitcherLine } from '@/lib/team-profile'
import { getSituational } from '@/lib/team-profile/situational'
import { getSbSituations } from '@/lib/scout/situations'
import { getLast7DaysPitcherWorkloadFromDB } from '@/lib/pitcher-workload'
import { CountGrid } from '@/components/scout/SituationViews'
import PitcherWorkloadCard from '@/components/PitcherWorkloadCard'
import ProPanel from '@/components/profile/ProPanel'
import { Card, Empty, Foot, RankBars, RankChip, Tile, C, MONO, SANS } from './ui'
import { AgeScatter } from './charts'

const f3 = (v: number | null) => (v == null ? '—' : v.toFixed(3).replace(/^0/, ''))
const pct1 = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const Loading = ({ what }: { what: string }) => <Empty>Loading {what}…</Empty>

// ── shared: two-sided W/L bars ───────────────────────────────────────────
function WLBars({ rows, color }: { rows: { label: string; w: number; l: number }[]; color: string }) {
  const max = Math.max(1, ...rows.flatMap(r => [r.w, r.l]))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '78px minmax(0,1fr) 62px', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#5b5347' }}>{r.label}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ height: 7, background: C.soft, borderRadius: 4 }}><div style={{ width: `${(r.w / max) * 100}%`, height: '100%', background: color, borderRadius: 4 }} /></div>
            <div style={{ height: 7, background: C.soft, borderRadius: 4 }}><div style={{ width: `${(r.l / max) * 100}%`, height: '100%', background: '#cfc8b8', borderRadius: 4 }} /></div>
          </div>
          <span style={{ fontFamily: MONO, fontSize: 11, textAlign: 'right' }}>{r.w}–{r.l}</span>
        </div>
      ))}
      <div style={{ fontFamily: MONO, fontSize: 9, color: C.faint }}>Top bar = wins · bottom bar = losses</div>
    </div>
  )
}

// ── Season ───────────────────────────────────────────────────────────────
export function SeasonPro({ team, profile: p, isPro }: { team: Team; profile: TeamProfile; isPro: boolean }) {
  const a = p.story?.advanced
  return (
    <ProPanel
      isPro={isPro} title="How the record is really built"
      blurb="Margins, run totals, opposition quality and series results behind the win–loss line."
      features={['Wins and losses by margin: how many are one-run games', 'Record by how many runs they score', 'Record vs .500+ clubs and vs sub-.500 clubs', 'Series won, lost, split, swept']}
    >
      {!a ? <Empty>Season detail unavailable.</Empty> : (
        <>
          <div className="tp-grid-2">
            <Card title="By margin of the result"><WLBars rows={a.margins} color={team.primary_color} /></Card>
            <Card title="By runs they score"><WLBars rows={a.runsScored} color={team.primary_color} /></Card>
          </div>
          <div className="tp-tiles" style={{ marginTop: 14 }}>
            {a.vsTier.map(t => (
              <Tile key={t.label} label={t.label} value={`${t.w}–${t.l}`} sub={`${t.w + t.l > 0 ? f3(t.w / (t.w + t.l)) : '—'} · ${t.rs - t.ra > 0 ? '+' : ''}${t.rs - t.ra} run diff`} tone={t.w >= t.l ? 'good' : 'bad'} />
            ))}
            <Tile label="Series won" value={`${a.series.won}`} sub={`of ${a.series.total}`} tone="good" />
            <Tile label="Series lost" value={`${a.series.lost}`} sub={`${a.series.split} split`} tone="bad" />
            <Tile label="Sweeps" value={`${a.series.sweeps}`} sub={`${a.series.swept} times swept`} />
          </div>
          <Foot>.500+ / sub-.500 uses each opponent&apos;s record today, not their record when you played them. A series = consecutive games vs the same club at the same park.</Foot>
        </>
      )}
    </ProPanel>
  )
}

// ── Identity ─────────────────────────────────────────────────────────────
function DistStrip({ group, m, color }: { group: string; m: Metric; color: string }) {
  if (m.value == null || m.dist.length < 2) return null
  const min = m.dist[0], max = m.dist[m.dist.length - 1]
  const pos = (v: number) => (max === min ? 50 : ((v - min) / (max - min)) * 100)
  const at = (v: number) => (m.higherIsBetter ? pos(v) : 100 - pos(v))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '74px minmax(90px,120px) minmax(0,1fr) 56px 40px', gap: 10, alignItems: 'center' }}>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.faint }}>{group}</span>
      <span style={{ fontSize: 12, color: '#3a352c' }}>{m.label}</span>
      <div style={{ position: 'relative', height: 22 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 10, height: 2, background: C.soft }} />
        {m.dist.map((v, i) => <span key={i} style={{ position: 'absolute', left: `${at(v)}%`, top: 6, width: 9, height: 9, marginLeft: -4.5, borderRadius: '50%', background: '#d9d3c4' }} />)}
        <span style={{ position: 'absolute', left: `${at(m.value)}%`, top: 2, width: 17, height: 17, marginLeft: -8.5, borderRadius: '50%', background: color, border: '2px solid #fff', boxShadow: '0 0 0 1.5px #1A1A1A' }} />
      </div>
      <b style={{ fontFamily: MONO, fontSize: 12, textAlign: 'right' }}>{m.display}</b>
      <RankChip m={m} />
    </div>
  )
}

export function IdentityPro({ team, profile: p, isPro }: { team: Team; profile: TeamProfile; isPro: boolean }) {
  return (
    <ProPanel
      isPro={isPro} title="All 30 clubs, side by side"
      blurb="Where every club sits on the headline metrics, and the three teams that play most like this one."
      features={['A dot for every MLB club on 12 headline metrics, this club highlighted', 'See the spread — a rank of 5th can be a huge or a tiny gap', 'The three closest style matches by rank profile']}
    >
      <div className="tp-grid-2">
        <Card title="Where the league sits" note="dot = a club · right = better" style={{ gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {p.distMetrics.map(d => <DistStrip key={`${d.group}-${d.metric.label}`} group={d.group} m={d.metric} color={team.primary_color} />)}
          </div>
          <Foot>Left = the league&apos;s worst value, right = its best (lower-is-better stats are flipped so right is always good). Sourced from the same league table as every rank on the page.</Foot>
        </Card>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange, fontWeight: 700, marginBottom: 8 }}>Closest style matches</div>
        <div className="tp-cards">
          {p.twins.map(t => (
            <Link key={t.id} href={`/mlb/teams/${t.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 }}>
                <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 26, lineHeight: 1, color: C.ink }}>{t.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 4 }}>{t.w}–{t.l} · {t.similarity}% similar profile</div>
                {t.shares && <div style={{ fontFamily: SANS, fontSize: 12, color: '#5b5347', marginTop: 6 }}>Both rank high in <b>{t.shares.toLowerCase()}</b>.</div>}
              </div>
            </Link>
          ))}
        </div>
        <Foot>Similarity compares the 12 radar ranks club by club (100% = identical profile). It describes style, not results.</Foot>
      </div>
    </ProPanel>
  )
}

// ── Staff ────────────────────────────────────────────────────────────────
function AdvTable({ rows, title }: { rows: PitcherLine[]; title: string }) {
  if (rows.length === 0) return null
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.mute, marginBottom: 6 }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11, minWidth: 460 }}>
        <thead>
          <tr style={{ color: C.faint, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', textAlign: 'right' }}>
            <th style={{ textAlign: 'left', fontWeight: 400, padding: '4px 0' }}>Pitcher</th>
            {['IP', 'ERA', 'FIP', 'ERA–FIP', 'K–BB%', 'HR/9', 'WHIP'].map(h => <th key={h} style={{ fontWeight: 400, padding: '4px 6px' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(p => {
            const gap = p.era != null && p.fip != null ? p.era - p.fip : null
            return (
              <tr key={p.id} style={{ textAlign: 'right', borderTop: `1px solid ${C.soft}` }}>
                <td style={{ textAlign: 'left', padding: '6px 0' }}><Link href={`/mlb/players/${p.id}`} style={{ color: C.ink, textDecoration: 'none', fontWeight: 600, fontFamily: SANS }}>{p.name}</Link></td>
                <td style={{ padding: '6px' }}>{p.ip.toFixed(0)}</td>
                <td style={{ padding: '6px' }}>{p.era != null ? p.era.toFixed(2) : '—'}</td>
                <td style={{ padding: '6px' }}>{p.fip != null ? p.fip.toFixed(2) : '—'}</td>
                <td style={{ padding: '6px', color: gap == null ? C.faint : gap <= 0 ? C.good : C.bad, fontWeight: 700 }}>{gap == null ? '—' : `${gap > 0 ? '+' : ''}${gap.toFixed(2)}`}</td>
                <td style={{ padding: '6px' }}>{pct1(p.kbbPct)}</td>
                <td style={{ padding: '6px' }}>{p.ip > 0 ? ((p.hr * 9) / p.ip).toFixed(2) : '—'}</td>
                <td style={{ padding: '6px' }}>{p.whip != null ? p.whip.toFixed(2) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

async function WorkloadBody({ team, ids }: { team: Team; ids: number[] }) {
  const w = await getLast7DaysPitcherWorkloadFromDB(team.id, new Set(ids)).catch((e) => { console.error('[WorkloadBody]', e instanceof Error ? e.message : e); return null })
  if (!w || w.pitchers.length === 0) return <Empty>No pitcher workload has been logged for the last 7 days.</Empty>
  return <PitcherWorkloadCard workload={w} teamColor={team.primary_color} teamAbbr={team.abbrev} />
}

export function StaffPro({ team, profile: p, isPro }: { team: Team; profile: TeamProfile; isPro: boolean }) {
  const pitchers = p.roster?.pitchers ?? []
  const sp = pitchers.filter(x => x.role === 'SP' && x.ip >= 20).sort((a, b) => b.ip - a.ip).slice(0, 7)
  const rp = pitchers.filter(x => x.role === 'RP' && x.ip >= 15).sort((a, b) => b.ip - a.ip).slice(0, 8)
  return (
    <ProPanel
      isPro={isPro} title="Pitching, under the hood"
      blurb="Strikeouts minus walks, ERA vs FIP, per-arm detail and the last week's bullpen workload."
      features={['K–BB% and ERA-minus-FIP for rotation and bullpen, ranked', 'Every starter and reliever: ERA, FIP, K–BB%, HR/9', 'Day-by-day pitch counts for the last 7 days', 'Pitch quality by type (xwOBA, hard-hit, put-away) in the pitch-mix panel below']}
    >
      <div className="tp-grid-2">
        <Card title="Rotation" note="rank among 30"><RankBars metrics={p.staffAdv.rotation} /></Card>
        <Card title="Bullpen" note="rank among 30"><RankBars metrics={p.staffAdv.bullpen} /></Card>
      </div>
      <Foot>ERA minus FIP: negative = run prevention is beating what the strikeouts, walks and homers alone would predict (often good defense or sequencing luck); positive = the reverse. It is a description of the gap, not a forecast.</Foot>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <AdvTable rows={sp} title="Starters (20+ IP)" />
        <AdvTable rows={rp} title="Relievers (15+ IP)" />
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.mute, marginBottom: 8 }}>Pitch counts, last 7 days</div>
        <Suspense fallback={<Loading what="workload" />}><WorkloadBody team={team} ids={pitchers.map(x => x.id)} /></Suspense>
      </div>
    </ProPanel>
  )
}

// ── Offense ──────────────────────────────────────────────────────────────
async function SituationalBody({ team, profile: p, season }: { team: Team; profile: TeamProfile; season: number }) {
  const sit = await getSituational(team.id, season)
  const hitters = (p.roster?.hitters ?? []).filter(h => h.pa >= 100).sort((a, b) => (b.ops ?? 0) - (a.ops ?? 0))
  return (
    <>
      {!sit ? <Empty>Situational splits are unavailable right now.</Empty> : (
        <div className="tp-grid-2">
          <Card title="OPS by count" note="team · MLB average below">
            <div style={{ display: 'grid', gridTemplateColumns: '28px repeat(3, minmax(0,1fr))', gap: 4, textAlign: 'center' }}>
              <span />
              {[0, 1, 2].map(s => <span key={s} style={{ fontFamily: MONO, fontSize: 9, color: C.faint }}>{s} strike{s === 1 ? '' : 's'}</span>)}
              {[0, 1, 2, 3].map(b => (
                <div key={b} style={{ display: 'contents' }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.faint, alignSelf: 'center' }}>{b} balls</span>
                  {[0, 1, 2].map(s => {
                    const c = sit.counts.find(x => x.balls === b && x.strikes === s)
                    const d = c && c.ops != null && c.leagueOps != null ? c.ops - c.leagueOps : null
                    const a = d == null ? 0 : Math.min(Math.abs(d) / 0.15, 1) * 0.55
                    const bg = d == null ? C.soft : d >= 0 ? `rgba(29,158,117,${a + 0.06})` : `rgba(212,83,59,${a + 0.06})`
                    return (
                      <div key={s} title={`${b}-${s} · ${c?.pa ?? 0} PA`} style={{ background: bg, borderRadius: 8, padding: '7px 2px' }}>
                        <div style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 700, color: C.ink }}>{f3(c?.ops ?? null)}</div>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: '#5b5347' }}>{f3(c?.leagueOps ?? null)}</div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            <Foot>Results of plate appearances that reached each count (MLB&apos;s count situation splits). Green = above the league average for that count, red = below. Hover a cell for the plate-appearance total.</Foot>
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sit.groups.map(g => <Card key={g.title} title={g.title} note="OPS · rank among 30"><RankBars metrics={g.metrics} /></Card>)}
          </div>
        </div>
      )}
      <Card title="Hitter rates" note="100+ PA · beyond the basic table" style={{ marginTop: 14 }}>
        {hitters.length === 0 ? <Empty>No hitters with 100+ PA yet.</Empty> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11, minWidth: 480 }}>
              <thead>
                <tr style={{ color: C.faint, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', fontWeight: 400, padding: '4px 0' }}>Hitter</th>
                  {['ISO', 'BB%', 'K%', 'BB/K', 'HR/600', 'SB'].map(h => <th key={h} style={{ fontWeight: 400, padding: '4px 6px' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {hitters.map(h => (
                  <tr key={h.id} style={{ textAlign: 'right', borderTop: `1px solid ${C.soft}` }}>
                    <td style={{ textAlign: 'left', padding: '6px 0' }}><Link href={`/mlb/players/${h.id}`} style={{ color: C.ink, textDecoration: 'none', fontWeight: 600, fontFamily: SANS }}>{h.name}</Link></td>
                    <td style={{ padding: '6px' }}>{f3(h.iso)}</td>
                    <td style={{ padding: '6px' }}>{h.pa > 0 ? pct1(h.bb / h.pa) : '—'}</td>
                    <td style={{ padding: '6px' }}>{h.pa > 0 ? pct1(h.so / h.pa) : '—'}</td>
                    <td style={{ padding: '6px' }}>{h.so > 0 ? (h.bb / h.so).toFixed(2) : '—'}</td>
                    <td style={{ padding: '6px' }}>{h.pa > 0 ? ((h.hr / h.pa) * 600).toFixed(0) : '—'}</td>
                    <td style={{ padding: '6px' }}>{h.sb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}

export function OffensePro({ team, profile, isPro, season }: { team: Team; profile: TeamProfile; isPro: boolean; season: number }) {
  return (
    <ProPanel
      isPro={isPro} title="Hitting in every situation"
      blurb="OPS by count, baserunners, score and inning — each ranked against the league."
      features={['A 4×3 heat grid of OPS in every ball–strike count', 'Bases empty vs runners on vs RISP with two outs', 'Ahead, tied and behind; early vs late innings', 'ISO, walk and strikeout rates, HR per 600 PA for every hitter']}
    >
      {isPro ? <Suspense fallback={<Loading what="situational splits" />}><SituationalBody team={team} profile={profile} season={season} /></Suspense> : null}
    </ProPanel>
  )
}

// ── Defense / ABS / running ──────────────────────────────────────────────
async function DefenseProBody({ team, todayET }: { team: Team; todayET: string }) {
  const [abs, sb] = await Promise.all([getTeamAbs(team.id, todayET), getSbSituations(team.id).catch(() => null)])
  const ov = (t: { n: number; ok?: number; ov?: number }) => (t.n > 0 ? ((t.ov ?? t.ok ?? 0) / t.n) * 100 : null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="tp-grid-2">
        <Card title="ABS: who challenges" note="players · min 1">
          {!abs || abs.challengers.length === 0 ? <Empty>No challenger detail is logged yet.</Empty> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11 }}>
              <thead><tr style={{ color: C.faint, fontSize: 9, textTransform: 'uppercase', textAlign: 'right' }}><th style={{ textAlign: 'left', fontWeight: 400 }}>Player</th><th style={{ fontWeight: 400 }}>Role</th><th style={{ fontWeight: 400 }}>Chal.</th><th style={{ fontWeight: 400 }}>Won</th></tr></thead>
              <tbody>
                {abs.challengers.slice(0, 10).map(c => (
                  <tr key={`${c.id}-${c.side}`} style={{ textAlign: 'right', borderTop: `1px solid ${C.soft}` }}>
                    <td style={{ textAlign: 'left', padding: '5px 0', fontFamily: SANS, fontWeight: 600 }}>{c.name}</td>
                    <td style={{ color: C.faint }}>{c.side === 'batting' ? 'batter' : 'catcher/P'}</td>
                    <td>{c.n}</td><td style={{ fontWeight: 700 }}>{c.ov} <span style={{ color: C.faint, fontWeight: 400 }}>({c.n > 0 ? Math.round((c.ov / c.n) * 100) : 0}%)</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="ABS: by inning" note="share of challenges · overturned %">
          {!abs ? <Empty>ABS log unavailable.</Empty> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {abs.innings.club.byInning.map((t, i) => {
                const share = abs.innings.club.total.n > 0 ? (t.n / abs.innings.club.total.n) * 100 : 0
                const lg = abs.innings.league.total.n > 0 ? (abs.innings.league.byInning[i].n / abs.innings.league.total.n) * 100 : 0
                const o = ov(t)
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) 78px', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.mute }}>{i === 8 ? '9+' : i + 1}</span>
                    <div style={{ position: 'relative', height: 9, background: C.soft, borderRadius: 5 }}>
                      <div style={{ width: `${Math.min(share * 3, 100)}%`, height: '100%', background: team.primary_color, borderRadius: 5 }} />
                      <div title={`MLB ${lg.toFixed(0)}%`} style={{ position: 'absolute', left: `${Math.min(lg * 3, 100)}%`, top: -2, bottom: -2, width: 2, background: '#1A1A1A', opacity: 0.5 }} />
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 10, textAlign: 'right' }}>{share.toFixed(0)}% · {o == null || t.n < 3 ? '—' : `${o.toFixed(0)}%`}</span>
                  </div>
                )
              })}
              <Foot>Line = MLB share for that inning. Overturned % is blank under 3 challenges.</Foot>
            </div>
          )}
        </Card>
      </div>
      <div className="tp-grid-2">
        <Card title="ABS: trend" note={abs ? `last ${abs.recent.games} games vs season` : undefined}>
          {!abs ? <Empty>ABS log unavailable.</Empty> : (
            <>
              <div className="tp-tiles-2">
                <Tile label="Recent rate" value={abs.recent.games > 0 ? (abs.recent.all.n / abs.recent.games).toFixed(2) : '—'} sub="challenges / game" />
                <Tile label="Season rate" value={abs.season.games > 0 ? (abs.season.all.n / abs.season.games).toFixed(2) : '—'} sub="challenges / game" />
              </div>
              {(() => {
                const recent = abs.perGame.slice(-40)
                const maxN = Math.max(1, ...recent.map(g => g.challenges))
                return (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 64, marginTop: 12 }}>
                    {recent.map((g, i) => (
                      <div key={i} title={`${g.date}: ${g.overturns}/${g.challenges} overturned`} style={{ flex: 1, height: `${Math.max((g.challenges / maxN) * 100, 5)}%`, background: g.overturns > 0 ? team.primary_color : '#d9d3c4', borderRadius: 2 }} />
                    ))}
                  </div>
                )
              })()}
              <Foot>Each bar is a game (last 40): height = challenges, colored if at least one was overturned.</Foot>
            </>
          )}
        </Card>
        <Card title="Steal attempts by count" note={sb ? `${sb.running.total.n} attempts` : undefined}>
          {!sb ? <Empty>Steal-attempt log unavailable.</Empty> : (
            <>
              <CountGrid club={sb.running} league={sb.league} okLabel="safe" unit="attempts" />
              {sb.topRunners.length > 0 && (
                <p style={{ fontFamily: SANS, fontSize: 12, color: '#5b5347', margin: '10px 0 0' }}>
                  Most attempts: {sb.topRunners.map(t => `${t.name} ${t.ok}/${t.n}`).join(' · ')}
                </p>
              )}
            </>
          )}
        </Card>
      </div>
      <Foot>ABS source: MLB&apos;s game-feed challenge log. Steals: the game-by-game feed, with the count before the pitch the runner went on. These describe what happened — not steal odds.</Foot>
    </div>
  )
}

export function DefensePro({ team, isPro, todayET }: { team: Team; isPro: boolean; todayET: string }) {
  return (
    <ProPanel
      isPro={isPro} title="ABS and running-game detail"
      blurb="Who challenges and when, and how the club steals — by count."
      features={['The players who challenge most and how often they win', 'Challenges by inning vs the league', 'Challenge trend over the last 40 games', 'A count-by-count map of steal attempts and success']}
    >
      {isPro ? <Suspense fallback={<Loading what="ABS and steal detail" />}><DefenseProBody team={team} todayET={todayET} /></Suspense> : null}
    </ProPanel>
  )
}

// ── Roster ───────────────────────────────────────────────────────────────
export function RosterPro({ team, profile: p, isPro }: { team: Team; profile: TeamProfile; isPro: boolean }) {
  const hit = (p.roster?.hitters ?? []).filter(h => h.age != null && h.ops != null && h.pa >= 100).map(h => ({ name: h.name, x: h.age as number, y: h.ops as number, z: h.pa }))
  const pit = (p.roster?.pitchers ?? []).filter(x => x.age != null && x.fip != null && x.ip >= 20).map(x => ({ name: x.name, x: x.age as number, y: x.fip as number, z: x.ip }))
  return (
    <ProPanel
      isPro={isPro} title="Age vs production"
      blurb="Where the club's production comes from, by age."
      features={['Every regular hitter: age vs OPS, sized by playing time', 'Every arm: age vs FIP, sized by innings', 'Spot whether the production is young, prime or veteran']}
    >
      <div className="tp-grid-2">
        <Card title="Hitters" note="age vs OPS · size = PA"><AgeScatter points={hit} color={team.primary_color} yLabel="OPS" yKind="rate3" /></Card>
        <Card title="Pitchers" note="age vs FIP · size = IP · lower is better"><AgeScatter points={pit} color={team.primary_color} yLabel="FIP" yKind="dec2" reverseY /></Card>
      </div>
      <Foot>Active-roster players only (100+ PA / 20+ IP). Season lines are MLB totals.</Foot>
    </ProPanel>
  )
}
