'use client'

// src/components/lab/TeamMakeupLab.tsx
//
// The whole "Team make-up: pitching" lab page body. Calls
// /api/admin/lab/team-makeup once per club (3 at a time) so the league
// sections fill in as clubs arrive — cached clubs come back instantly, a cold
// one takes ~10-30 s. Runs allowed arrive as a prop (one cheap MLB Stats API
// call made by the server page).

import { useMemo, useState } from 'react'
import { C, Card, Empty, Foot, SANS, Section } from '@/components/team/ui'
import { SpreadVsRuns, TeamExplorer } from '@/components/lab/TeamMakeupClient'
import { LoadBar, useTeamMakeups } from '@/components/lab/useTeamMakeups'
import { PITCH_COLOR, PITCH_NAME } from '@/lib/lab/pitch-meta'
import { MLB_TEAMS } from '@/lib/teams'
import { ROLE_LABEL, summarize, type TeamSummary } from '@/lib/lab/team-summary'
import type { Role, TeamRunsByRole } from '@/lib/lab/team-pitch-makeup.server-fetch-allowed'

const MIX_COLS = ['FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'CH', 'FS']

export default function TeamMakeupLab({ season, runs }: { season: number; runs: Record<number, TeamRunsByRole> }) {
  const { loaded, failed, done } = useTeamMakeups(season)
  const [role, setRole] = useState<Role>('all')

  const teams: TeamSummary[] = useMemo(
    () => MLB_TEAMS.flatMap(t => (loaded[t.id] ? [summarize(t, loaded[t.id], role, runs[t.id])] : [])),
    [loaded, role, runs],
  )

  const byName = [...teams].sort((a, b) => a.name.localeCompare(b.name))
  const withArms = teams
    .filter(t => t.armAngleLow != null && t.armAngleHigh != null && t.pitcherArms.length > 0)
    .sort((a, b) => (b.armAngleHigh! - b.armAngleLow!) - (a.armAngleHigh! - a.armAngleLow!))
  const allAngles = withArms.flatMap(t => t.pitcherArms.map(p => p.armAngle))
  const aMin = Math.floor((Math.min(...allAngles, 90) - 2) / 5) * 5
  const aMax = Math.ceil((Math.max(...allAngles, 0) + 2) / 5) * 5
  const apos = (v: number) => `${((v - aMin) / (aMax - aMin)) * 100}%`
  const withSpread = teams.filter(t => t.releaseSpreadIn != null).sort((a, b) => a.releaseSpreadIn! - b.releaseSpreadIn!)
  const spreadMax = Math.max(...withSpread.map(t => t.releaseSpreadIn!), 1)

  return (
    <>
      <LoadBar done={done} total={MLB_TEAMS.length} failed={failed.length} season={season} />

      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: C.cream, padding: '12px 0', marginTop: 8 }}>
        <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: C.soft, borderRadius: 999 }}>
          {(['all', 'sp', 'rp'] as Role[]).map(r => (
            <button key={r} onClick={() => setRole(r)} style={{
              fontFamily: SANS, fontWeight: 700, fontSize: 13, padding: '6px 16px', borderRadius: 999, cursor: 'pointer', border: 'none',
              background: r === role ? C.ink : 'transparent', color: r === role ? '#fff' : '#5b5347',
            }}>{ROLE_LABEL[r]}</button>
          ))}
        </div>
        <span style={{ fontFamily: SANS, fontSize: 10, color: C.faint, marginLeft: 12 }}>
          Starters = the pitcher who threw the club&apos;s first pitch of that game; bullpen = everyone after.
        </span>
      </div>

      <Section id="mix" num="01" title="What they throw" sub="Share of each club's pitches by type, and how wide the four-seam velocity range runs (middle 80% of pitches).">
        <Card>
          {teams.length === 0 ? <Empty>Loading clubs…</Empty> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                <thead>
                  <tr style={{ fontFamily: SANS, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.mute }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 400 }}>Team</th>
                    {MIX_COLS.map(c => <th key={c} style={{ padding: '4px 6px', fontWeight: 400, color: PITCH_COLOR[c] }}>{PITCH_NAME[c]}</th>)}
                    <th style={{ padding: '4px 8px', fontWeight: 400, textAlign: 'right' }}>4-seam velo range</th>
                  </tr>
                </thead>
                <tbody>
                  {byName.map(t => {
                    const ff = t.rows.find(r => r.pitchType === 'FF')
                    return (
                      <tr key={t.teamId} style={{ borderTop: `1px solid ${C.soft}` }}>
                        <td style={{ padding: '5px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>{t.short}</td>
                        {MIX_COLS.map(c => {
                          const u = t.rows.find(r => r.pitchType === c)?.usagePct
                          return (
                            <td key={c} style={{ padding: '5px 6px', textAlign: 'center', background: u == null ? 'transparent' : `${PITCH_COLOR[c]}${Math.round((Math.min(u, 40) / 40) * 0.55 * 255).toString(16).padStart(2, '0')}` }}>
                              {u == null ? <span style={{ color: C.faint }}>–</span> : u.toFixed(1)}
                            </td>
                          )
                        })}
                        <td style={{ padding: '5px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {ff?.veloP10 != null && ff.veloP90 != null
                            ? <><b>{ff.veloP10.toFixed(1)}–{ff.veloP90.toFixed(1)}</b> <span style={{ color: C.faint, fontFamily: SANS, fontSize: 10 }}>({(ff.veloP90 - ff.veloP10).toFixed(1)} wide)</span></>
                            : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Foot>Usage % of all tracked pitches; darker = a bigger share. Other pitch types are in the explorer below. Source: Baseball Savant, release_speed.</Foot>
        </Card>
      </Section>

      <Section id="explorer" num="02" title="One club, pitch by pitch" sub="Choose a team to see its mix, velocity range, how each pitch moves, and where each pitch is released.">
        <TeamExplorer teams={teams} />
      </Section>

      <Section id="arm" num="03" title="Arm-angle variation" sub="Every pitcher with 100+ pitches is a dot. Clubs are ordered from the widest variation of arm slots (top) to the tightest (bottom).">
        <Card title="Pitcher arm angles by club" note="0° = sidearm · 90° = straight overhead">
          {withArms.length === 0 ? <Empty>Loading clubs…</Empty> : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {withArms.map(t => (
                  <div key={t.teamId} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) 62px', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: SANS, fontSize: 11, color: '#5b5347' }}>{t.abbrev}</span>
                    <div style={{ position: 'relative', height: 18 }}>
                      <div style={{ position: 'absolute', top: 8, left: apos(t.armAngleLow!), width: `calc(${apos(t.armAngleHigh!)} - ${apos(t.armAngleLow!)})`, height: 2, background: t.color, opacity: 0.35 }} />
                      {t.pitcherArms.map(p => (
                        <div key={p.id} title={`${p.name} (${p.throws}HP) · ${p.armAngle.toFixed(1)}° · ${p.pitches} pitches`}
                          style={{ position: 'absolute', top: 3, left: `calc(${apos(p.armAngle)} - 6px)`, width: 12, height: 12, borderRadius: '50%', background: t.color, opacity: 0.8, border: '1px solid #fff' }} />
                      ))}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(t.armAngleHigh! - t.armAngleLow!).toFixed(0)}° wide</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) 62px', gap: 8, fontFamily: SANS, fontSize: 9, color: C.faint, marginTop: 6 }}>
                <span /><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{aMin}° (more sidearm)</span><span>{aMax}° (more overhead)</span></div><span />
              </div>
            </>
          )}
          <Foot>Width = highest minus lowest pitcher-average arm angle on the club, so one unusual arm can stretch it; the scatter in § 04 uses the all-pitch standard deviation instead. Hover a dot for the pitcher. Source: Baseball Savant arm_angle.</Foot>
        </Card>
      </Section>

      <Section id="release" num="04" title="Release points and runs allowed" sub="How tightly each club's pitchers release the same pitch from the same spot, and how that lines up with runs allowed.">
        <div className="lab-grid-2">
          <Card title="Release-point variation by club" note="inches · tightest at top">
            {withSpread.length === 0 ? <Empty>Loading clubs…</Empty> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {withSpread.map(t => (
                  <div key={t.teamId} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) 46px 62px', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: SANS, fontSize: 11, color: '#5b5347' }}>{t.abbrev}</span>
                    <div style={{ height: 8, background: C.soft, borderRadius: 4 }}>
                      <div style={{ width: `${(t.releaseSpreadIn! / spreadMax) * 100}%`, height: '100%', background: t.color, borderRadius: 4, opacity: 0.85 }} />
                    </div>
                    <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{t.releaseSpreadIn!.toFixed(1)}″</span>
                    <span style={{ fontFamily: SANS, fontSize: 10, color: C.faint, textAlign: 'right' }}>{t.ra9 == null ? '—' : `${t.ra9.toFixed(2)} RA/9`}</span>
                  </div>
                ))}
              </div>
            )}
            <Foot>Variation = standard deviation of release side and height for the same pitch type, combined and weighted by how often each type is thrown (types with 150+ pitches).</Foot>
          </Card>
          <SpreadVsRuns teams={teams} season={season} roleLabel={ROLE_LABEL[role]} />
        </div>
      </Section>
    </>
  )
}
