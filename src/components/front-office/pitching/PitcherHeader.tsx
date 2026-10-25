// Pitcher header: who is loaded into every tool, plus the headline numbers a fan reads first.
// Server component (the hover popovers are the client <Tip>). K−BB% carries a Signal Meter (BB% is the slower of the
// two rates to settle, so its threshold from stat_stabilisation is the one shown); CSW% and xERA have no cited
// threshold, so no meter is drawn for them. Stuff Grade is "—" until x9Lab's own model ships. A window with no
// appearances says so; nothing is invented. Hover a number for the league average for his role and the sample behind it.

import SignalMeter from '@/components/front-office/SignalMeter'
import { C, DISPLAY, MONO, SANS } from '@/components/team/ui'
import type { Stabilisation } from '@/lib/front-office/signal'
import { WIN_LABEL, type StaffRow, type Win } from '@/lib/front-office/pitching'
import { Headshot, TeamBadge } from './Avatar'
import { dash, fx, ipDisplay, type LeagueStat } from './format'
import Tip, { TipBody } from './Tip'

function Kpi({ label, value, foot, tip, children }: { label: string; value: string; foot?: string; tip: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Tip block content={tip}>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 14px', minWidth: 0, height: '100%' }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.mute }}>{label}</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 26, lineHeight: 1.1, color: value === dash ? C.faint : C.ink, marginTop: 3 }}>{value}</div>
        <div style={{ minHeight: 18, marginTop: 4 }}>{children}</div>
        {foot && <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, marginTop: 2 }}>{foot}</div>}
      </div>
    </Tip>
  )
}

/** "1.9 SD better than the league SP average (13.7%)" or null when the league figure is missing. */
function vsLeague(v: number | null, st: LeagueStat | undefined, higherIsBetter: boolean, role: string, d: number, unit: string): [string, string][] {
  if (v == null || !st || st.mean == null || st.sd == null || !(st.sd > 0)) return []
  const z = ((v - st.mean) / st.sd) * (higherIsBetter ? 1 : -1)
  return [[`League ${role} average`, `${st.mean.toFixed(d)}${unit}`], ['Against the league', `${Math.abs(z).toFixed(1)} SD ${z >= 0 ? 'better' : 'worse'}`]]
}

export default function PitcherHeader({ playerId, teamId, name, row, win, stab, league, color, onText }: {
  playerId: number; teamId: number; name: string; row: StaffRow | null; win: Win; stab: Record<string, Stabilisation>
  league: Record<string, LeagueStat> | null; color: string; onText: string
}) {
  const role = row?.role ?? 'SP'
  const bbStab = stab['bb_pct']
  return (
    <div style={{ margin: '14px 0 4px' }}>
      <div style={{ background: color, color: onText, borderRadius: 14, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <Headshot id={playerId} size={76} ring="rgba(255,255,255,.85)" />
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 28, letterSpacing: '-.01em', margin: 0, lineHeight: 1.1 }}>{name}</h3>
            <div style={{ fontFamily: MONO, fontSize: 10.5, opacity: .85, marginTop: 4, letterSpacing: '.06em' }}>
              {row
                ? `${row.throws ?? '?'}HP · ${row.role ?? '—'} · Age ${row.age ?? dash} · ${ipDisplay(row.ip)} IP · ${row.bf ?? 0} batters faced · ${WIN_LABEL[win]}`
                : `${WIN_LABEL[win]}`}
            </div>
          </div>
        </div>
        <TeamBadge id={teamId} size={52} />
      </div>
      {!row ? (
        <p style={{ fontFamily: SANS, fontSize: 13, color: C.faint, fontStyle: 'italic', margin: '12px 2px 0' }}>
          No appearances in this window. Switch the window to Season to load his full line.
        </p>
      ) : (
        <div className="pd-kpis" style={{ marginTop: 10 }}>
          <Kpi label="K−BB%" value={row.kbbPct == null ? dash : `${fx(row.kbbPct)}%`}
            tip={<TipBody title="K−BB%" lines={[['K%', row.kPct == null ? dash : `${fx(row.kPct)}%`], ['BB%', row.bbPct == null ? dash : `${fx(row.bbPct)}%`], ['Batters faced', String(row.bf ?? dash)], ...vsLeague(row.kbbPct, league?.kbb, true, role, 1, '%')]}
              note={`Strikeouts minus walks per batter faced.${bbStab ? ` Walk rate needs about ${bbStab.threshold} batters faced to settle; strikeout rate settles sooner.` : ''}`} />}>
            {row.bf != null && <SignalMeter sample={row.bf} stab={bbStab} />}
          </Kpi>
          <Kpi label="CSW%" value={row.cswPct == null ? dash : `${fx(row.cswPct)}%`} foot="called strikes + whiffs per pitch"
            tip={<TipBody title="CSW%" lines={[['Whiff%', row.whiffPct == null ? dash : `${fx(row.whiffPct)}%`], ...vsLeague(row.cswPct, league?.csw, true, role, 1, '%')]} note="Called strikes plus whiffs, per pitch." />} />
          <Kpi label="xERA" value={row.xera == null ? dash : fx(row.xera, 2)} foot={row.xera == null ? 'Savant season figure; choose Season' : `ERA ${fx(row.era, 2)}`}
            tip={<TipBody title="xERA" lines={[['ERA', fx(row.era, 2)], ['FIP', fx(row.fip, 2)], ['xFIP', fx(row.xfip, 2)], ['SIERA', fx(row.siera, 2)], ...vsLeague(row.xera, league?.xera, false, role, 2, '')]}
              note="The ERA his contact quality, strikeouts and walks deserved. A season-long figure." />} />
          <Kpi label="Stuff Grade" value={row.stuffGrade == null ? dash : String(Math.round(row.stuffGrade))} foot="x9Lab's own model: coming"
            tip={<TipBody title="Stuff Grade" note="x9Lab's own pitch model, on the 20-80 scouting scale (50 = league average). It shows a dash until the model ships." />} />
        </div>
      )}
    </div>
  )
}
