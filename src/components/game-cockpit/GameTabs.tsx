// Server-rendered content for the game page tabs (Cockpit, Pitchers, Batters, Bullpen & park).
import { cache } from 'react'
import SignupAsk from '@/components/signup/SignupAsk'
import SmallSample from '@/components/data/SmallSample'
import ThroughDate from '@/components/data/ThroughDate'
import PendingBlock from '@/components/data/PendingBlock'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { pitchColor, pitchLabel } from '@/lib/lab/pitch-meta'
import { getStarterBlock, getTeamLineup, getBullpenRecent, type StarterBlock } from '@/lib/game-cockpit'
import { getParkIndex } from '@/lib/park-index'
import { LineupTable, BullpenTable, ParkLine, SectionTitle, StarterRow } from './parts'

export type CockpitCtx = {
  gamePk: number; season: number; gameDate: string; venueId: number | null; venueName: string
  home: { id: number; name: string; abbr: string; pitcherId?: number; pitcherName?: string }
  away: { id: number; name: string; abbr: string; pitcherId?: number; pitcherName?: string }
}

const loadStarter = cache(getStarterBlock)
const two = (cols: React.ReactNode, key: string) => (
  <>
    <style>{`.${key}{display:grid;grid-template-columns:1fr 1fr;gap:24px}@media(max-width:820px){.${key}{grid-template-columns:1fr}}`}</style>
    <div className={key}>{cols}</div>
  </>
)

async function starters(ctx: CockpitCtx) {
  const [away, home] = await Promise.all([
    loadStarter(ctx.away.pitcherId, ctx.away.pitcherName, ctx.season),
    loadStarter(ctx.home.pitcherId, ctx.home.pitcherName, ctx.season),
  ])
  return { away, home }
}
const lineups = cache(async (ctx: CockpitCtx) => {
  const s = await starters(ctx)
  const codes = (b: StarterBlock) => b.mix.slice(0, 2).map(m => m.code)
  const [away, home] = await Promise.all([
    getTeamLineup(ctx.away.id, ctx.gameDate, ctx.gamePk, { id: s.home.id, hand: s.home.hand, pitchCodes: codes(s.home) }),
    getTeamLineup(ctx.home.id, ctx.gameDate, ctx.gamePk, { id: s.away.id, hand: s.away.hand, pitchCodes: codes(s.away) }),
  ])
  return { away, home, s }
})
export const cockpitData = lineups

export async function CockpitTab({ ctx }: { ctx: CockpitCtx }) {
  const [{ away, home, s }, bpA, bpH, park] = await Promise.all([
    lineups(ctx),
    getBullpenRecent(ctx.away.id, [ctx.away.pitcherId ?? 0], ctx.gameDate, 3),
    getBullpenRecent(ctx.home.id, [ctx.home.pitcherId ?? 0], ctx.gameDate, 3),
    getParkIndex(ctx.venueId),
  ])
  return (
    <div>
      <SectionTitle>Starters</SectionTitle>
      {two(<>
        <StarterRow s={s.away} teamName={ctx.away.name} teamAbbr={ctx.away.abbr} teamId={ctx.away.id} />
        <StarterRow s={s.home} teamName={ctx.home.name} teamAbbr={ctx.home.abbr} teamId={ctx.home.id} />
      </>, 'gc-starters')}
      <div style={{ margin: '18px 0' }}><SignupAsk source="preview_inline" /></div>
      <SectionTitle>Lineups</SectionTitle>
      {two(<>
        <LineupTable team={ctx.away} teamName={ctx.away.name} lineup={away} oppHand={s.home.hand} />
        <LineupTable team={ctx.home} teamName={ctx.home.name} lineup={home} oppHand={s.away.hand} />
      </>, 'gc-lineups')}
      <SectionTitle sub="Pitches thrown by relievers, last 3 days">Bullpen</SectionTitle>
      {two(<>
        <BullpenTable id={ctx.away.id} abbr={ctx.away.abbr} teamName={ctx.away.name} {...bpA} />
        <BullpenTable id={ctx.home.id} abbr={ctx.home.abbr} teamName={ctx.home.name} {...bpH} />
      </>, 'gc-bullpen')}
      <SectionTitle>Park</SectionTitle>
      <ParkLine park={park} />
    </div>
  )
}

function ArsenalTable({ s, teamName }: { s: StarterBlock; teamName: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>{s.name ?? 'Starter not announced yet'} <span style={{ fontWeight: 500, color: '#8a8275' }}>{teamName}</span></div>
      {!s.hasPitchData ? <PendingBlock label="Team pitching numbers" /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
            <thead><tr style={{ textAlign: 'left', color: '#8a8275', fontSize: 12 }}>
              <th style={{ padding: '6px 8px 6px 0', position: 'sticky', left: 0, background: '#FAF8F3' }}>Pitch</th><th style={{ padding: 6 }}>Usage</th><th style={{ padding: 6 }}>Velo</th><th style={{ padding: 6 }}>Whiff%</th>
            </tr></thead>
            <tbody>{s.mix.map(m => (
              <tr key={m.code} style={{ borderTop: '1px solid #e7e2d8' }}>
                <td style={{ padding: '6px 8px 6px 0', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#FAF8F3' }}>
                  <span aria-hidden style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: pitchColor(m.code), marginRight: 6 }} />
                  <b>{pitchLabel(m.code)}</b>
                </td>
                {m.pitches < MIN_SAMPLE.arsenalPitchesPerType ? (
                  <td colSpan={3} style={{ padding: 6 }}><SmallSample n={m.pitches} /></td>
                ) : (<>
                  <td style={{ padding: 6 }}>{m.usagePct == null ? '' : `${m.usagePct.toFixed(1)}%`} <span style={{ fontSize: 12, color: '#8a8275' }}>n {m.pitches.toLocaleString('en-US')}</span></td>
                  <td style={{ padding: 6 }}>{m.velo == null ? '' : `${m.velo.toFixed(1)} mph`}</td>
                  <td style={{ padding: 6 }}>{m.swings < MIN_SAMPLE.whiffSwings ? <SmallSample n={m.swings} /> : <>{m.whiffPct?.toFixed(1)}% <span style={{ fontSize: 12, color: '#8a8275' }}>n {m.swings} swings</span></>}</td>
                </>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <ThroughDate date={s.throughDate} />
    </div>
  )
}

export async function PitchersTab({ ctx, zones }: { ctx: CockpitCtx; zones: React.ReactNode }) {
  const s = await starters(ctx)
  return (
    <div>
      <SectionTitle>Arsenals</SectionTitle>
      {two(<><ArsenalTable s={s.away} teamName={ctx.away.name} /><ArsenalTable s={s.home} teamName={ctx.home.name} /></>, 'gc-arsenal')}
      <SectionTitle>Zone heatmaps</SectionTitle>
      {zones}
    </div>
  )
}

export async function BattersTab({ ctx, zones }: { ctx: CockpitCtx; zones: React.ReactNode }) {
  const { away, home, s } = await lineups(ctx)
  return (
    <div>
      <SectionTitle>Lineups and splits</SectionTitle>
      {two(<>
        <LineupTable full team={ctx.away} teamName={ctx.away.name} lineup={away} oppHand={s.home.hand} />
        <LineupTable full team={ctx.home} teamName={ctx.home.name} lineup={home} oppHand={s.away.hand} />
      </>, 'gc-lineups')}
      <SectionTitle>Zones and hot spots</SectionTitle>
      {zones}
    </div>
  )
}

export async function BullpenParkTab({ ctx }: { ctx: CockpitCtx }) {
  const [a, h, park] = await Promise.all([
    getBullpenRecent(ctx.away.id, [ctx.away.pitcherId ?? 0], ctx.gameDate, 7),
    getBullpenRecent(ctx.home.id, [ctx.home.pitcherId ?? 0], ctx.gameDate, 7),
    getParkIndex(ctx.venueId),
  ])
  return (
    <div>
      <SectionTitle sub="Pitches thrown by relievers, last 7 days">Bullpen usage</SectionTitle>
      {two(<><BullpenTable id={ctx.away.id} abbr={ctx.away.abbr} teamName={ctx.away.name} {...a} /><BullpenTable id={ctx.home.id} abbr={ctx.home.abbr} teamName={ctx.home.name} {...h} /></>, 'gc-bullpen')}
      <SectionTitle sub={ctx.venueName}>Park index</SectionTitle>
      <ParkLine park={park} />
    </div>
  )
}
