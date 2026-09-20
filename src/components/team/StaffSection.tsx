// src/components/team/StaffSection.tsx
//
// § 03 "The pitching staff": rotation vs bullpen ranked side by side, how the
// innings are split, who is in each group, the make-up of the staff, and (via
// <PitchMixPanel>, streamed separately) what they throw.
//
// Ranks: rotation = the club's STARTERS only, bullpen = RELIEVERS only, both
// from MLB's own sp / rp situation splits (curl-verified) — so "bullpen ERA"
// here is real relief ERA, not the whole staff.

import { Suspense } from 'react'
import Link from 'next/link'
import type { Team } from '@/lib/teams'
import { ordinal, type TeamProfile, type PitcherLine } from '@/lib/team-profile'
import { Card, Empty, Foot, RankBars, Section, StackedBar, Tile, C, MONO, headshot, SANS, DISPLAY } from './ui'
import { Donut } from './charts'
import PitchMixPanel from './PitchMixPanel'
import { StaffPro } from './ProModules'

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

function RotationCards({ starters, color }: { starters: PitcherLine[]; color: string }) {
  if (starters.length === 0) return <Empty>No starters on the active roster have logged a start.</Empty>
  return (
    <div className="tp-cards">
      {starters.map(p => (
        <Link key={p.id} href={`/mlb/players/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderTop: `3px solid ${color}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={headshot(p.id)} alt="" referrerPolicy="no-referrer" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', background: C.soft }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, lineHeight: 1.2 }}>{p.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.faint }}>{p.hand ? `${p.hand}HP` : 'P'}{p.age ? ` · ${p.age}` : ''}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 10 }}>
              <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34, lineHeight: 1, color: C.ink }}>{p.era != null ? p.era.toFixed(2) : '—'}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.faint }}>ERA · {p.gs} GS · {p.ip.toFixed(0)} IP</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 8, fontFamily: MONO, fontSize: 10 }}>
              <div><div style={{ color: C.faint, fontSize: 8 }}>K/9</div><b>{p.k9 != null ? p.k9.toFixed(1) : '—'}</b></div>
              <div><div style={{ color: C.faint, fontSize: 8 }}>BB/9</div><b>{p.bb9 != null ? p.bb9.toFixed(1) : '—'}</b></div>
              <div><div style={{ color: C.faint, fontSize: 8 }}>WHIP</div><b>{p.whip != null ? p.whip.toFixed(2) : '—'}</b></div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

function BullpenBoard({ relievers }: { relievers: PitcherLine[] }) {
  if (relievers.length === 0) return <Empty>No relievers on the active roster have pitched.</Empty>
  const closerId = [...relievers].sort((a, b) => b.saves - a.saves)[0]
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11, minWidth: 460 }}>
        <thead>
          <tr style={{ color: C.faint, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', textAlign: 'right' }}>
            <th style={{ textAlign: 'left', fontWeight: 400, padding: '4px 0' }}>Reliever</th>
            {['G', 'IP', 'ERA', 'WHIP', 'K/9', 'SV', 'HLD'].map(h => <th key={h} style={{ fontWeight: 400, padding: '4px 6px' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {relievers.map(p => {
            const role = p.id === closerId.id && p.saves >= 5 ? 'CL' : p.holds >= 10 ? 'SU' : null
            return (
              <tr key={p.id} style={{ textAlign: 'right', borderTop: `1px solid ${C.soft}` }}>
                <td style={{ textAlign: 'left', padding: '6px 0', fontFamily: 'inherit' }}>
                  <Link href={`/mlb/players/${p.id}`} style={{ color: C.ink, textDecoration: 'none', fontWeight: 600, fontFamily: SANS }}>{p.name}</Link>
                  <span style={{ color: C.faint, fontSize: 9 }}> {p.hand ?? ''}</span>
                  {role && <span style={{ marginLeft: 6, fontSize: 8, fontWeight: 700, background: role === 'CL' ? C.yellow : '#E6F1FB', color: '#1A1A1A', padding: '1px 5px', borderRadius: 4 }}>{role === 'CL' ? 'CLOSER' : 'SETUP'}</span>}
                </td>
                <td style={{ padding: '6px' }}>{p.g}</td><td style={{ padding: '6px' }}>{p.ip.toFixed(0)}</td>
                <td style={{ padding: '6px', fontWeight: 700 }}>{p.era != null ? p.era.toFixed(2) : '—'}</td>
                <td style={{ padding: '6px' }}>{p.whip != null ? p.whip.toFixed(2) : '—'}</td>
                <td style={{ padding: '6px' }}>{p.k9 != null ? p.k9.toFixed(1) : '—'}</td>
                <td style={{ padding: '6px' }}>{p.saves}</td><td style={{ padding: '6px' }}>{p.holds}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function StaffSection({ team, profile: p, season, isPro }: { team: Team; profile: TeamProfile; season: number; isPro: boolean }) {
  const row = p.row
  const pitchers = p.roster?.pitchers ?? []
  const starters = pitchers.filter(x => x.role === 'SP').sort((a, b) => b.gs - a.gs || b.ip - a.ip).slice(0, 6)
  const relievers = pitchers.filter(x => x.role === 'RP' && x.ip >= 5).sort((a, b) => (b.saves * 3 + b.holds + b.ip / 10) - (a.saves * 3 + a.holds + a.ip / 10)).slice(0, 10)

  const spIp = row.sp?.ip ?? 0, rpIp = row.rp?.ip ?? 0
  const rpShare = spIp + rpIp > 0 ? (rpIp / (spIp + rpIp)) * 100 : null
  const lhp = pitchers.filter(x => x.hand === 'L').length, rhp = pitchers.filter(x => x.hand === 'R').length
  const ageSp = avg(pitchers.filter(x => x.role === 'SP').map(x => x.age)), ageRp = avg(pitchers.filter(x => x.role === 'RP').map(x => x.age))
  const bpForm = p.form.filter(f => f.label.startsWith('Bullpen'))
  const ipStart = p.ranks.rotation[6]

  return (
    <Section
      id="pitching" num="03" title="The pitching staff"
      sub="Starters and relievers are ranked separately against the other 29 clubs — a great rotation can hide a shaky bullpen and vice versa."
    >
      <div className="tp-grid-2">
        <Card title="Rotation" note="starters only · rank among 30"><RankBars metrics={p.ranks.rotation} /></Card>
        <Card title="Bullpen" note="relievers only · rank among 30"><RankBars metrics={p.ranks.bullpen} /></Card>
      </div>

      <div className="tp-grid-3" style={{ marginTop: 16 }}>
        <Card title="Who carries the innings">
          {rpShare == null ? <Empty>Innings split unavailable.</Empty> : (
            <>
              <Donut
                height={140} center={`${(100 - rpShare).toFixed(0)}%`}
                slices={[{ label: 'Starters (IP)', value: Math.round(spIp), color: team.primary_color }, { label: 'Bullpen (IP)', value: Math.round(rpIp), color: '#cfc8b8' }]}
              />
              <div style={{ marginTop: 10 }}>
                <StackedBar segments={[{ label: 'Starters', value: spIp, color: team.primary_color }, { label: 'Bullpen', value: rpIp, color: '#cfc8b8' }]} height={16} />
              </div>
              <Foot>Starters cover {(100 - rpShare).toFixed(0)}% of innings{ipStart.rank != null ? ` — ${ipStart.display} innings per start, ${ordinal(ipStart.rank)} in MLB` : ''}.</Foot>
            </>
          )}
        </Card>

        <Card title="Staff make-up" note="active roster">
          {pitchers.length === 0 ? <Empty>Roster unavailable.</Empty> : (
            <>
              <Donut
                height={140} center={`${pitchers.length}`}
                slices={[{ label: 'Right-handed', value: rhp, color: team.primary_color }, { label: 'Left-handed', value: lhp, color: C.yellow }]}
              />
              <div className="tp-tiles-2" style={{ marginTop: 10 }}>
                <Tile label="Avg age · SP" value={ageSp != null ? ageSp.toFixed(1) : '—'} />
                <Tile label="Avg age · RP" value={ageRp != null ? ageRp.toFixed(1) : '—'} />
              </div>
            </>
          )}
        </Card>

        <Card title="Whole staff" note="all pitchers · rank among 30"><RankBars metrics={p.ranks.staff} /></Card>
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange, fontWeight: 700, marginBottom: 10 }}>The rotation</div>
        <RotationCards starters={starters} color={team.primary_color} />
      </div>

      <div className="tp-grid-2" style={{ marginTop: 20 }}>
        <Card title="The bullpen" note="top arms by role and workload" style={{ gridColumn: 'span 2' }}>
          <BullpenBoard relievers={relievers} />
          {bpForm.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 22px', marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.soft}`, fontFamily: MONO, fontSize: 11 }}>
              <span style={{ color: C.faint, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase' }}>Lately (last 14 days)</span>
              {bpForm.map(f => {
                const d = f.recent != null && f.season != null ? f.recent - f.season : null
                const better = d == null ? null : f.higherIsBetter ? d > 0 : d < 0
                return (
                  <span key={f.label}>
                    {f.label.replace('Bullpen ', '')} <b>{f.recent != null ? f.recent.toFixed(2) : '—'}</b>{' '}
                    <span style={{ color: better == null ? C.faint : better ? C.good : C.bad }}>vs {f.season != null ? f.season.toFixed(2) : '—'} season</span>
                  </span>
                )
              })}
            </div>
          )}
          <Foot>Closer = most saves (5+); setup = 10+ holds. Only active-roster relievers with 5+ IP. Season lines are MLB totals, including time with other clubs.</Foot>
        </Card>
      </div>

      <div style={{ marginTop: 20 }}>
        <Suspense fallback={<Card title="What they throw"><Empty>Loading the staff&apos;s pitch mix…</Empty></Card>}>
          <PitchMixPanel team={team} season={season} pitchers={pitchers} starters={starters} isPro={isPro} />
        </Suspense>
      </div>
      <div style={{ marginTop: 16 }}><StaffPro team={team} profile={p} isPro={isPro} /></div>
    </Section>
  )
}
