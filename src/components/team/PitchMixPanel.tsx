// src/components/team/PitchMixPanel.tsx
//
// "What they throw": the current staff's pitch mix vs the league, whiff and
// velocity by pitch type, and each starter's own arsenal. Async server
// component — streamed in via <Suspense> because the league baseline is a
// paginated Supabase read (see lib/team-profile/roster.ts for the caveats,
// which are repeated in the footnote here so the numbers are never oversold).

import type { Team } from '@/lib/teams'
import ProPanel from '@/components/profile/ProPanel'
import { getTeamArsenal, type PitcherLine } from '@/lib/team-profile'
import { PITCH_NAMES } from '@/lib/team-profile/roster'
import { Card, Empty, Foot, StackedBar, C, MONO, SANS } from './ui'

const PITCH_COLOR: Record<string, string> = {
  FF: '#D4533B', SI: '#EF9F27', FC: '#B8860B', SL: '#378ADD', ST: '#7F77DD', CU: '#1D9E75', SV: '#5DCAA5', CH: '#8a8275', FS: '#D4537E', KN: '#444444',
}
const GROUP_COLOR = { Fastball: '#D4533B', Breaking: '#378ADD', Offspeed: '#8a8275' } as const

export default async function PitchMixPanel({ team, season, pitchers, starters, isPro }: { team: Team; season: number; pitchers: PitcherLine[]; starters: PitcherLine[]; isPro: boolean }) {
  const a = await getTeamArsenal(pitchers.map(p => p.id), season)
  if (!a) {
    return <Card title="What they throw"><Empty>Pitch-mix data isn&apos;t available for this staff yet.</Empty></Card>
  }
  const maxPct = Math.max(1, ...a.types.flatMap(t => [t.teamPct, t.leaguePct]))
  const fb = a.groups.find(g => g.group === 'Fastball')

  const fx = (v: number | null, d = 3) => (v == null ? '—' : v.toFixed(d).replace(/^0/, ''))
  const f1 = (v: number | null) => (v == null ? '—' : v.toFixed(1))
  const better = (a: number | null, b: number | null, lowerBetter: boolean) => (a == null || b == null || a === b ? C.ink : (lowerBetter ? a < b : a > b) ? C.good : C.bad)

  return (
    <>
    <div className="tp-grid-2">
      <Card title="What they throw" note={`${a.pitchesSampled.toLocaleString()} pitches · ${a.pitchersCovered} pitchers`} style={{ gridColumn: 'span 2' }}>
        <div className="tp-grid-2" style={{ gap: 24 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.mute, marginBottom: 6 }}>{team.abbrev} pitch families</div>
            <StackedBar height={26} segments={a.groups.map(g => ({ label: g.group, value: g.teamPct, color: GROUP_COLOR[g.group] }))} />
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.mute, margin: '12px 0 6px' }}>MLB pitch families</div>
            <StackedBar height={26} segments={a.groups.map(g => ({ label: g.group, value: g.leaguePct, color: GROUP_COLOR[g.group] }))} />
            <div style={{ display: 'flex', gap: 14, marginTop: 10, fontFamily: MONO, fontSize: 10, color: '#5b5347' }}>
              {(Object.keys(GROUP_COLOR) as (keyof typeof GROUP_COLOR)[]).map(k => (
                <span key={k}><span style={{ display: 'inline-block', width: 9, height: 9, background: GROUP_COLOR[k], borderRadius: 2, marginRight: 5 }} />{k}</span>
              ))}
            </div>
            {fb && (
              <p style={{ fontFamily: SANS, fontSize: 14, color: '#3a352c', lineHeight: 1.5, marginTop: 14 }}>
                Fastballs are {fb.teamPct.toFixed(0)}% of what this staff throws
                {Math.abs(fb.teamPct - fb.leaguePct) >= 3
                  ? `, ${fb.teamPct > fb.leaguePct ? 'more' : 'less'} than the MLB rate of ${fb.leaguePct.toFixed(0)}%.`
                  : `, right around the MLB rate of ${fb.leaguePct.toFixed(0)}%.`}
              </p>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11, minWidth: 380 }}>
              <thead>
                <tr style={{ color: C.faint, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', fontWeight: 400, padding: '3px 0' }}>Pitch</th>
                  <th style={{ fontWeight: 400, textAlign: 'left', padding: '3px 8px' }}>Usage · team vs MLB</th>
                  <th style={{ fontWeight: 400 }}>Whiff%</th><th style={{ fontWeight: 400, padding: '3px 0 3px 8px' }}>Velo</th>
                </tr>
              </thead>
              <tbody>
                {a.types.filter(t => t.teamPct >= 0.5 || t.leaguePct >= 1).map(t => (
                  <tr key={t.type} style={{ borderTop: `1px solid ${C.soft}` }}>
                    <td style={{ padding: '6px 0' }}><span style={{ display: 'inline-block', width: 8, height: 8, background: PITCH_COLOR[t.type] ?? '#888', borderRadius: 2, marginRight: 6 }} />{t.name}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: `${(t.teamPct / maxPct) * 100}%`, minWidth: 2, height: 6, background: PITCH_COLOR[t.type] ?? '#888', borderRadius: 3 }} /><span style={{ fontSize: 9 }}>{t.teamPct.toFixed(1)}%</span></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: `${(t.leaguePct / maxPct) * 100}%`, minWidth: 2, height: 4, background: '#d9d3c4', borderRadius: 2 }} /><span style={{ fontSize: 9, color: C.faint }}>{t.leaguePct.toFixed(1)}%</span></div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {t.whiff != null ? <b>{t.whiff.toFixed(1)}</b> : '—'}
                      {t.leagueWhiff != null && <div style={{ fontSize: 9, color: C.faint }}>{t.leagueWhiff.toFixed(1)}</div>}
                    </td>
                    <td style={{ textAlign: 'right', padding: '0 0 0 8px' }}>
                      {t.velo != null ? <b>{t.velo.toFixed(1)}</b> : '—'}
                      {t.leagueVelo != null && <div style={{ fontSize: 9, color: C.faint }}>{t.leagueVelo.toFixed(1)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {starters.length > 0 && (
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${C.soft}` }}>
            <div style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange, fontWeight: 700, marginBottom: 10 }}>Each starter&apos;s arsenal</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {starters.map(sp => {
                const mix = a.byPitcher[sp.id]
                return (
                  <div key={sp.id} style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr)', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{sp.name}</span>
                    {mix && mix.length > 0 ? (
                      <div>
                        <StackedBar height={18} segments={mix.map(m => ({ label: m.name, value: m.pct, color: PITCH_COLOR[m.type] ?? '#888' }))} />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 3, fontFamily: MONO, fontSize: 9, color: '#5b5347' }}>
                          {mix.filter(m => m.pct >= 4).map(m => (
                            <span key={m.type}><span style={{ display: 'inline-block', width: 7, height: 7, background: PITCH_COLOR[m.type] ?? '#888', borderRadius: 2, marginRight: 4 }} />{PITCH_NAMES[m.type] ?? m.type} {m.pct.toFixed(0)}%{m.velo != null ? ` · ${m.velo.toFixed(1)}` : ''}</span>
                          ))}
                        </div>
                      </div>
                    ) : <span style={{ fontSize: 11, color: C.faint, fontStyle: 'italic' }}>no pitch data yet</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <Foot>
          Mix covers the current active-roster pitchers only, weighted by pitches thrown this season. League figures are every pitcher in the pitch-arsenal table. Whiff% is weighted by pitches (swing counts aren&apos;t stored), so treat it as a comparison, not Savant&apos;s official team number. Velocity averages only the pitcher-pitches that have one on file. Small numbers under each team figure are the MLB average.
        </Foot>
      </Card>
    </div>

    <div style={{ marginTop: 16 }}>
      <ProPanel
        isPro={isPro} title="Pitch quality by type"
        blurb="How hard each pitch type gets hit and how often it finishes at-bats — vs MLB."
        features={['xwOBA against, hard-hit % and put-away % for every pitch type', 'Strikeout rate and batting average against by pitch', 'Average horizontal and vertical break vs the league', 'Each starter\'s best and worst pitch by xwOBA']}
        labHref={`/mlb/pitching-lab`} labLabel="Go pitch-by-pitch in the Pitching Lab"
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11, minWidth: 560 }}>
            <thead>
              <tr style={{ color: C.faint, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', textAlign: 'right' }}>
                <th style={{ textAlign: 'left', fontWeight: 400, padding: '4px 0' }}>Pitch</th>
                {['xwOBA vs', 'Hard-hit %', 'Put-away %', 'K %', 'BA vs', 'H-break', 'V-break'].map(h => <th key={h} style={{ fontWeight: 400, padding: '4px 6px' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {a.types.filter(t => t.teamPct >= 1).map(t => (
                <tr key={t.type} style={{ textAlign: 'right', borderTop: `1px solid ${C.soft}` }}>
                  <td style={{ textAlign: 'left', padding: '6px 0', fontFamily: SANS, fontWeight: 600 }}><span style={{ display: 'inline-block', width: 8, height: 8, background: PITCH_COLOR[t.type] ?? '#888', borderRadius: 2, marginRight: 6 }} />{t.name}</td>
                  {([
                    [t.quality.xwoba, t.leagueQuality.xwoba, true, (v: number | null) => fx(v)],
                    [t.quality.hardHit, t.leagueQuality.hardHit, true, f1],
                    [t.quality.putAway, t.leagueQuality.putAway, false, f1],
                    [t.quality.kPct, t.leagueQuality.kPct, false, f1],
                    [t.quality.ba, t.leagueQuality.ba, true, (v: number | null) => fx(v)],
                  ] as [number | null, number | null, boolean, (v: number | null) => string][]).map(([v, lg, low, fm], i) => (
                    <td key={i} style={{ padding: '6px' }}>
                      <b style={{ color: better(v, lg, low) }}>{fm(v)}</b>
                      <div style={{ fontSize: 9, color: C.faint }}>{fm(lg)}</div>
                    </td>
                  ))}
                  <td style={{ padding: '6px' }}>{f1(t.quality.hBreak)}<div style={{ fontSize: 9, color: C.faint }}>{f1(t.leagueQuality.hBreak)}</div></td>
                  <td style={{ padding: '6px' }}>{f1(t.quality.vBreak)}<div style={{ fontSize: 9, color: C.faint }}>{f1(t.leagueQuality.vBreak)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Foot>Bold = this staff, small = MLB. Green = better for the pitchers (lower xwOBA / hard-hit / BA against, higher put-away / K%). Pitch-weighted averages of each pitcher&apos;s per-pitch numbers from the pitch-arsenal table — a comparison aid, not Savant&apos;s official team figure. Break is in inches.</Foot>
      </ProPanel>
    </div>
    </>
  )
}
