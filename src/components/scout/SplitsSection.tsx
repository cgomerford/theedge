// src/components/scout/SplitsSection.tsx
//
// §7 Platoon · home/road · day/night — the full cut for tonight's lineup and
// starter on each side, three tabs (Platoon / Home-Road / Day-Night). Each tab is
// a bar chart of the lineup's PA-weighted OPS in the two splits, the hitter-by-
// hitter table, and the starter's line in the same splits. The split that
// applies TONIGHT is marked (the opposing starter's hand; this club's home/road;
// the game's day/night session). Cells under the sample minimum are faded.
// Park factors for the game's session sit beside the day/night tab.

import { getClubSplits, MIN_SPLIT_BF, MIN_SPLIT_PA, type ClubSplits, type HitterSplits, type SplitKey } from '@/lib/scout/splits'
import { getParkDeep } from '@/lib/scout/park-deep'
import { CHART_BLUE, CHART_ORANGE } from './charts/LineChart'
import ClubHeader from './ClubHeader'
import Tabs from './Tabs'
import type { ScoutClub, ScoutContext } from './types'

type View = { id: string; label: string; a: SplitKey; b: SplitKey; aLabel: string; bLabel: string }
export const VIEWS: View[] = [
  { id: 'platoon', label: 'Platoon', a: 'vl', b: 'vr', aLabel: 'vs LHP', bLabel: 'vs RHP' },
  { id: 'homeroad', label: 'Home / road', a: 'h', b: 'a', aLabel: 'Home', bLabel: 'Road' },
  { id: 'daynight', label: 'Day / night', a: 'd', b: 'n', aLabel: 'Day', bLabel: 'Night' },
]

const ops = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(3).replace(/^0/, ''))

export function tonightKeys(ctx: ScoutContext, isHome: boolean, oppHand: 'L' | 'R' | null): Record<string, SplitKey | null> {
  return {
    platoon: oppHand === 'L' ? 'vl' : oppHand === 'R' ? 'vr' : null,
    homeroad: isHome ? 'h' : 'a',
    daynight: ctx.dayNight === 'day' ? 'd' : ctx.dayNight === 'night' ? 'n' : null,
  }
}

function TwoBars({ view, ops: o, tonight, unit }: { view: View; ops: ClubSplits['lineupOps']; tonight: SplitKey | null; unit: string }) {
  const rows = [{ key: view.a, label: view.aLabel, color: CHART_BLUE }, { key: view.b, label: view.bLabel, color: CHART_ORANGE }]
  const max = Math.max(0.5, ...rows.map((r) => o[r.key]?.ops ?? 0))
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const v = o[r.key]
        return (
          <li key={r.key}>
            <div className="flex items-baseline justify-between text-[11px] font-sans text-stone-700">
              <span className={tonight === r.key ? 'font-semibold text-stone-900' : ''}>{r.label}{tonight === r.key && <span className="ml-1.5 text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200 align-middle">tonight</span>}</span>
              <span className="font-mono text-[10px] text-stone-500">{ops(v?.ops)} OPS · {v?.pa ?? 0} {unit}</span>
            </div>
            <div className="h-2 mt-0.5 rounded-[3px] bg-stone-100 overflow-hidden"><div className="h-full rounded-[3px]" style={{ width: `${v ? (v.ops / max) * 100 : 0}%`, background: r.color }} /></div>
          </li>
        )
      })}
    </ul>
  )
}

function HitterTable({ hitters, view, tonight }: { hitters: HitterSplits[]; view: View; tonight: SplitKey | null }) {
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200">
          <th className="text-left font-semibold py-1">Hitter</th>
          {[view.a, view.b].map((k) => <th key={k} className={`font-semibold ${tonight === k ? 'text-orange-600' : ''}`}>{k === view.a ? view.aLabel : view.bLabel}{tonight === k ? ' ★' : ''}</th>)}
          <th className="font-semibold">Gap</th>
        </tr>
      </thead>
      <tbody>
        {hitters.map((h) => {
          const a = h.splits[view.a], b = h.splits[view.b]
          const gap = a?.ops != null && b?.ops != null ? a.ops - b.ops : null
          const cell = (s: typeof a, k: SplitKey) => {
            const thin = !s || s.pa < MIN_SPLIT_PA
            return <td className={`font-mono ${thin ? 'text-stone-300' : tonight === k ? 'text-stone-900 font-bold' : 'text-stone-700'}`} title={thin ? `Only ${s?.pa ?? 0} PA — too few to read` : undefined}>{ops(s?.ops)} <span className="text-[9px] text-stone-400">{s?.pa ?? 0}</span></td>
          }
          const both = a && b && a.pa >= MIN_SPLIT_PA && b.pa >= MIN_SPLIT_PA
          return (
            <tr key={h.id} className="border-b border-stone-100 last:border-0 text-right">
              <td className="text-left py-1 font-sans font-semibold text-stone-800">{h.order}. {h.name.split(' ').slice(-1)[0]} <span className="font-mono font-normal text-[9px] text-stone-400">{h.bats ?? ''}</span></td>
              {cell(a, view.a)}{cell(b, view.b)}
              <td className={`font-mono ${both ? 'text-stone-600' : 'text-stone-300'}`}>{gap != null ? `${gap >= 0 ? '+' : '−'}${Math.abs(gap).toFixed(3).replace(/^0/, '')}` : '—'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function PitcherLine({ splits, view, tonight }: { splits: ClubSplits; view: View; tonight: SplitKey | null }) {
  const p = splits.pitcher
  if (!p) return <p className="text-[11.5px] font-sans italic text-stone-400">No probable starter is listed yet.</p>
  // pitcher splits are vs LHB/RHB for vl/vr — relabel
  const labels: Record<string, string> = { vl: 'vs LHB', vr: 'vs RHB', h: 'Home', a: 'Road', d: 'Day', n: 'Night' }
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-1.5">{p.name} <span className="normal-case text-stone-400">({p.throws ?? '?'}HP)</span> · OPS against</p>
      <table className="w-full text-[11px]">
        <thead><tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200"><th className="text-left font-semibold py-1">Split</th><th className="font-semibold">OPS against</th><th className="font-semibold">IP</th><th className="font-semibold">BF</th></tr></thead>
        <tbody>
          {[view.a, view.b].map((k) => {
            const s = p.splits[k]; const thin = !s || s.bf < MIN_SPLIT_BF
            return (
              <tr key={k} className={`border-b border-stone-100 last:border-0 text-right ${thin ? 'text-stone-300' : 'text-stone-700'}`}>
                <td className="text-left py-1 font-sans font-semibold">{labels[k]}{tonight === k ? <span className="ml-1.5 text-[8px] font-mono uppercase text-orange-600">★ tonight</span> : ''}</td>
                <td className="font-mono">{ops(s?.ops)}</td><td className="font-mono">{s?.ip ?? '—'}</td><td className="font-mono">{s?.bf ?? 0}{thin ? '*' : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function Column({ club, side, splits, view, tonight, opp }: { club: ScoutClub; side: 'away' | 'home'; splits: ClubSplits | null; view: View; tonight: SplitKey | null; opp: ScoutClub }) {
  if (!splits || splits.lineup.length === 0) {
    return <div><ClubHeader club={club} side={side} /><p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">{club.abbr} lineup isn&apos;t available yet.</p></div>
  }
  return (
    <div className="space-y-4">
      <ClubHeader club={club} side={side}><span className="text-[10px] font-mono text-stone-400">{splits.lineupSource === 'confirmed' ? 'confirmed lineup' : 'projected lineup'}</span></ClubHeader>
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-1.5">Lineup OPS · PA-weighted</p>
        <TwoBars view={view} ops={splits.lineupOps} tonight={tonight} unit="PA" />
      </div>
      <HitterTable hitters={splits.lineup} view={view} tonight={tonight} />
      <PitcherLine splits={splits} view={view} tonight={view.id === 'platoon' ? null : tonight} />
      <p className="sr-only">Facing {opp.abbr}.</p>
    </div>
  )
}

export default async function SplitsSection({ ctx }: { ctx: ScoutContext }) {
  const [away, home, park] = await Promise.all([
    getClubSplits(ctx.away.id, ctx.gameDate, ctx.gamePk, ctx.away.probableId).catch(() => null),
    getClubSplits(ctx.home.id, ctx.gameDate, ctx.gamePk, ctx.home.probableId).catch(() => null),
    getParkDeep(ctx.venueId, ctx.venueName).catch(() => null),
  ])
  const awayTonight = tonightKeys(ctx, false, home?.pitcher?.throws ?? null)   // away lineup faces the HOME starter
  const homeTonight = tonightKeys(ctx, true, away?.pitcher?.throws ?? null)

  const tabs = VIEWS.map((v) => ({
    id: v.id, label: v.label,
    content: (
      <div className="space-y-4">
        {v.id === 'daynight' && park && (
          <p className="text-[11px] font-sans text-stone-600 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
            {park.venueName} on Statcast Park Factors — day: runs {park.bySession.Day?.runs ?? '—'} · wOBA {park.bySession.Day?.woba ?? '—'}; night: runs {park.bySession.Night?.runs ?? '—'} · wOBA {park.bySession.Night?.woba ?? '—'} (100 = average).
            {ctx.dayNight ? ` Tonight is a ${ctx.dayNight} game.` : ''}
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-stone-100">
          <Column club={ctx.away} side="away" splits={away} view={v} tonight={awayTonight[v.id]} opp={ctx.home} />
          <div className="lg:pl-6"><Column club={ctx.home} side="home" splits={home} view={v} tonight={homeTonight[v.id]} opp={ctx.away} /></div>
        </div>
      </div>
    ),
  }))

  return (
    <div className="space-y-4">
      <Tabs tabs={tabs} />
      <p className="text-[10px] font-mono text-stone-400 leading-relaxed">
        Season splits from the MLB Stats API for tonight&apos;s {away?.lineupSource === 'confirmed' && home?.lineupSource === 'confirmed' ? 'confirmed' : 'confirmed or projected'} lineups. ★ marks the split that applies tonight. Small numbers beside each OPS are plate appearances (batters faced for pitchers); cells under {MIN_SPLIT_PA} PA / {MIN_SPLIT_BF} BF are faded and not read into. A pitcher&apos;s &ldquo;vs LHB / RHB&rdquo; rows use the same split codes as the hitters&apos; &ldquo;vs LHP / RHP&rdquo;.
      </p>
    </div>
  )
}
