// src/components/team/OffenseSection.tsx
//
// § 04 "The offense": how the club scores (ranked), how it is hitting lately
// vs its season line, the batted-ball shape, platoon and pull tendencies, and
// the hitters behind the numbers. Recent-form rows use ONLY explicitly-windowed
// columns (L30 / L14) from team_stats — see lib/team-profile/precomputed.ts.

import Link from 'next/link'
import type { Team } from '@/lib/teams'
import type { TeamProfile } from '@/lib/team-profile'
import { Card, Empty, Foot, RankBars, RankChip, Section, Tile, VersusBars, C, MONO, SANS } from './ui'
import { Donut } from './charts'
import { OffensePro } from './ProModules'

const rate3 = (v: number | null) => (v == null ? '—' : v.toFixed(3).replace(/^0/, ''))
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

export default function OffenseSection({ team, profile: p, isPro, season }: { team: Team; profile: TeamProfile; isPro: boolean; season: number }) {
  const hitters = (p.roster?.hitters ?? []).filter(h => h.pa >= 100).sort((a, b) => (b.ops ?? 0) - (a.ops ?? 0))
  const all = p.roster?.hitters ?? []
  const maxOps = Math.max(0.001, ...hitters.map(h => h.ops ?? 0))
  const lead = (label: string, pick: (h: (typeof all)[number]) => number, fmt: (v: number) => string) => {
    const top = [...all].sort((a, b) => pick(b) - pick(a))[0]
    return top && pick(top) > 0 ? <Tile key={label} label={`${label} leader`} value={fmt(pick(top))} sub={top.name} /> : null
  }
  const bats = { L: all.filter(h => h.bats === 'L').length, R: all.filter(h => h.bats === 'R').length, S: all.filter(h => h.bats === 'S').length }
  const ageH = avg(all.map(h => h.age))
  const fmtForm = (v: number | null, kind: 'rate3' | 'dec2') => (v == null ? '—' : kind === 'rate3' ? rate3(v) : v.toFixed(2))
  const offForm = p.form.filter(f => !f.label.startsWith('Bullpen'))
  const pl = p.platoon

  return (
    <Section
      id="offense" num="04" title="The offense"
      sub="How they score, how they are hitting right now compared with their own season line, and who is driving it."
    >
      <div className="tp-grid-2">
        <Card title="How they score" note="rank among 30"><RankBars metrics={p.ranks.offense} /></Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Right now vs the season" note="recent window vs full season">
            {offForm.length === 0 ? <Empty>Recent-form numbers unavailable.</Empty> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {offForm.map(f => {
                  const d = f.recent != null && f.season != null ? f.recent - f.season : null
                  const better = d == null ? null : f.higherIsBetter ? d > 0 : d < 0
                  return (
                    <div key={f.label} style={{ display: 'grid', gridTemplateColumns: '92px 1fr auto', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 11, color: '#5b5347' }}>{f.label}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12 }}>
                        <b>{fmtForm(f.recent, f.fmt)}</b> <span style={{ color: C.faint, fontSize: 10 }}>{f.recentLabel} · season {fmtForm(f.season, f.fmt)}</span>
                      </span>
                      <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 11, fontWeight: 700, color: better == null ? C.faint : better ? C.good : C.bad }}>
                        {d == null ? '' : `${better ? '▲' : '▼'} ${Math.abs(d).toFixed(f.fmt === 'rate3' ? 3 : 2).replace(/^0/, '')}`}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            <Foot>L30 = last 30 days, from the team-stats refresh. Green = better than their season line.</Foot>
          </Card>

          <Card title="Platoon & pull" note="vs LHP / RHP">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[pl.vsLhp, pl.vsRhp, pl.risp].map(m => (
                <div key={m.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto 44px', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#5b5347' }}>{m.label} <span style={{ color: C.faint, fontFamily: MONO, fontSize: 9 }}>(MLB {m.leagueDisplay})</span></span>
                  <b style={{ fontFamily: MONO, fontSize: 12 }}>{m.display}</b><RankChip m={m} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.soft}` }}>
              <VersusBars
                color={team.primary_color} unit="%" decimals={1}
                rows={[{ label: 'Pull % · lefties', team: pl.pullLhb.team, league: pl.pullLhb.league }, { label: 'Pull % · righties', team: pl.pullRhb.team, league: pl.pullRhb.league }]}
              />
            </div>
          </Card>
        </div>
      </div>

      <div className="tp-grid-2" style={{ marginTop: 16 }}>
        <Card title="Batted-ball shape" note="share of balls in play">
          {p.battedBall.length === 0 ? <Empty>Batted-ball profile unavailable.</Empty> : (
            <>
              <VersusBars color={team.primary_color} rows={p.battedBall} />
              <Foot>Ground-ball heavy lineups turn contact into outs on the infield; fly-ball heavy ones lean on power. Source: Baseball Savant batted-ball types, team level.</Foot>
            </>
          )}
        </Card>
        <Card title="Lineup make-up" note="active roster hitters">
          {all.length === 0 ? <Empty>Roster unavailable.</Empty> : (
            <>
              <Donut height={130} center={`${all.length}`} slices={[{ label: 'Right', value: bats.R, color: team.primary_color }, { label: 'Left', value: bats.L, color: C.yellow }, { label: 'Switch', value: bats.S, color: '#8a8275' }]} />
              <div className="tp-tiles-2" style={{ marginTop: 10 }}>
                <Tile label="Avg age" value={ageH != null ? ageH.toFixed(1) : '—'} />
                <Tile label="Bats" value={`${bats.R}R · ${bats.L}L · ${bats.S}S`} />
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="tp-tiles" style={{ marginTop: 16 }}>
        {lead('HR', h => h.hr, v => String(v))}
        {lead('OPS', h => (h.pa >= 200 ? h.ops ?? 0 : 0), v => rate3(v))}
        {lead('RBI', h => h.rbi, v => String(v))}
        {lead('SB', h => h.sb, v => String(v))}
      </div>

      <Card title="The hitters" note="active roster · 100+ PA · click a name for the full stats page" style={{ marginTop: 16 }}>
        {hitters.length === 0 ? <Empty>No hitters with 100+ plate appearances on the active roster yet.</Empty> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11, minWidth: 560 }}>
              <thead>
                <tr style={{ color: C.faint, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', fontWeight: 400, padding: '4px 0' }}>Hitter</th>
                  {['PA', 'AVG', 'OBP', 'SLG', 'OPS', 'HR', 'SB'].map(h => <th key={h} style={{ fontWeight: 400, padding: '4px 6px' }}>{h}</th>)}
                  <th style={{ fontWeight: 400, textAlign: 'left', padding: '4px 0 4px 10px', width: 110 }}>OPS</th>
                </tr>
              </thead>
              <tbody>
                {hitters.map(h => (
                  <tr key={h.id} style={{ textAlign: 'right', borderTop: `1px solid ${C.soft}` }}>
                    <td style={{ textAlign: 'left', padding: '6px 0' }}>
                      <Link href={`/mlb/players/${h.id}`} style={{ color: C.ink, textDecoration: 'none', fontWeight: 600, fontFamily: SANS }}>{h.name}</Link>
                      <span style={{ color: C.faint, fontSize: 9 }}> {h.pos}{h.bats ? ` · ${h.bats}` : ''}{h.age ? ` · ${h.age}` : ''}</span>
                    </td>
                    <td style={{ padding: '6px' }}>{h.pa}</td><td>{rate3(h.avg)}</td><td>{rate3(h.obp)}</td><td>{rate3(h.slg)}</td>
                    <td style={{ fontWeight: 700, padding: '6px' }}>{rate3(h.ops)}</td><td style={{ padding: '6px' }}>{h.hr}</td><td style={{ padding: '6px' }}>{h.sb}</td>
                    <td style={{ padding: '6px 0 6px 10px' }}>
                      <div style={{ height: 6, background: C.soft, borderRadius: 3 }}><div style={{ width: `${((h.ops ?? 0) / maxOps) * 100}%`, height: '100%', background: team.primary_color, borderRadius: 3 }} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Foot>Want pitch-by-pitch detail on any of them? Every player page links to the Batting Lab.</Foot>
      </Card>
      <div style={{ marginTop: 16 }}><OffensePro team={team} profile={p} isPro={isPro} season={season} /></div>
    </Section>
  )
}
