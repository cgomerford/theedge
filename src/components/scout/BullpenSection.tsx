// src/components/scout/BullpenSection.tsx
//
// §3 Bullpen intelligence — per club:
//   · Workload chart: pitches per day for the last 7 days for every arm (bar per
//     day, fixed scale so arms compare), L3 / L7 totals, and a flag.
//   · Usage map: which innings each arm has actually pitched this season (heat),
//     grouped by role — Closer / High-leverage / Bridge.
//   · Left arms vs the opponent's bench bats: this club's left-handed relievers
//     next to the OTHER club's bench bats and their season OPS vs LHP (with PA).
// Flag rules are printed under the columns; every graded number carries its n.

import { getBullpenTrends, PEN_STATS, PEN_TILES, type BullpenTrends } from '@/lib/scout/bullpen-trends'
import { teamLogoUrl } from '@/lib/mlb'
import StatExplorer from './StatExplorer'
import Tabs from './Tabs'
import { RestPanel, UsagePanel } from './BullpenPanels'
import { getBullpenDesk, getBenchBatsVsLefties, FLAG_RULES, type ArmFlag, type BenchBat, type BullpenArm, type BullpenDesk } from '@/lib/scout/bullpen-desk'
import { WORKLOAD_RULES } from '@/lib/scout/workload'
import { CHART_BLUE } from './charts/LineChart'
import ClubHeader from './ClubHeader'
import type { ScoutClub, ScoutContext } from './types'

const BAR_MAX = 40 // fixed pitch scale so bars compare across arms
const INNING_COLS = [5, 6, 7, 8, 9]

const FLAG_STYLE: Record<ArmFlag, { symbol: string; label: string; cls: string } | null> = {
  overworked: { symbol: '▲', label: 'Overworked', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
  sharp: { symbol: '●', label: 'Sharp', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  shaky: { symbol: '▼', label: 'Shaky', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
  rested: { symbol: '○', label: 'Rested', cls: 'bg-stone-50 text-stone-600 border-stone-200' },
  steady: null,
}

const dow = (iso: string) => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${iso}T12:00:00Z`).getUTCDay()]
const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
const surname = (full: string) => full.trim().split(/\s+/).slice(-1)[0]
const fmtOps = (v: number) => v.toFixed(3).replace(/^0/, '')

function FlagChip({ arm }: { arm: BullpenArm }) {
  const f = FLAG_STYLE[arm.flag]
  if (!f) return <span className="text-[9px] font-mono text-stone-300" title={arm.flagReason}>—</span>
  return (
    <span title={arm.flagReason} className={`inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded-md border whitespace-nowrap ${f.cls}`}>
      <span aria-hidden>{f.symbol}</span>{f.label}
    </span>
  )
}

function DayBars({ arm, dates }: { arm: BullpenArm; dates: string[] }) {
  const H = 22
  return (
    <svg width={84} height={H} viewBox={`0 0 84 ${H}`} role="img" aria-label={`${arm.name} pitches per day, last 7 days: ${arm.byDate.join(', ')}`}>
      {arm.byDate.map((p, i) => {
        const h = p > 0 ? Math.max(3, (Math.min(p, BAR_MAX) / BAR_MAX) * H) : 1.5
        return (
          <rect key={i} x={i * 12} y={H - h} width={10} height={h} rx={p > 0 ? 2 : 0} fill={p > 0 ? CHART_BLUE : '#e7e5e4'}>
            <title>{`${shortDate(dates[i])}: ${p > 0 ? `${p} pitches` : 'did not pitch'}`}</title>
          </rect>
        )
      })}
    </svg>
  )
}

function WorkloadChart({ desk }: { desk: BullpenDesk }) {
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_84px_2rem_2rem_5.5rem] items-end gap-x-2 pb-1 border-b border-stone-200 text-[9px] font-mono uppercase tracking-wider text-stone-400">
        <span>Arm</span>
        <span className="flex gap-[2px]">{desk.dates.map((d) => <span key={d} className="w-[10px] text-center" title={shortDate(d)}>{dow(d)}</span>)}</span>
        <span className="text-right">L3</span><span className="text-right">L7</span><span />
      </div>
      <ul>
        {desk.arms.map((a) => (
          <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_84px_2rem_2rem_5.5rem] items-center gap-x-2 py-1.5 border-b border-stone-100 last:border-0">
            <span className="min-w-0 text-[11.5px] font-sans text-stone-800 truncate">
              <span className="font-semibold">{a.name}</span>
              <span className="ml-1.5 font-mono text-[9px] text-stone-400">{a.hand ?? ''}{a.hand ? 'HP' : ''}</span>
            </span>
            <DayBars arm={a} dates={desk.dates} />
            <span className="text-right text-[11px] font-mono text-stone-700">{a.p3}</span>
            <span className="text-right text-[11px] font-mono text-stone-500">{a.p7}</span>
            <span className="justify-self-end"><FlagChip arm={a} /></span>
          </li>
        ))}
      </ul>
      <p className="text-[9px] font-mono text-stone-300 mt-1.5">Bars = pitches per day, oldest → yesterday (letter = weekday) · scale 0–{BAR_MAX}</p>
    </div>
  )
}

function UsageMap({ desk }: { desk: BullpenDesk }) {
  const withUsage = desk.arms.filter((a) => Object.values(a.innings).some((n) => n > 0))
  if (withUsage.length === 0) return <p className="text-[11.5px] font-sans italic text-stone-400">No inning-usage history logged for these arms yet.</p>
  const max = Math.max(1, ...withUsage.flatMap((a) => INNING_COLS.map((i) => a.innings[i] ?? 0)))
  const groups: BullpenArm['role'][] = ['Closer', 'High-leverage', 'Bridge']
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_repeat(5,1.75rem)] items-end gap-x-1 pb-1 border-b border-stone-200 text-[9px] font-mono uppercase tracking-wider text-stone-400">
        <span>Role · arm</span>
        {INNING_COLS.map((i) => <span key={i} className="text-center">{i === 9 ? '9+' : i}</span>)}
      </div>
      {groups.map((role) => {
        const arms = withUsage.filter((a) => a.role === role)
        if (arms.length === 0) return null
        return (
          <div key={role}>
            <p className="text-[9px] font-mono uppercase tracking-widest text-stone-500 font-semibold pt-2 pb-1">{role}</p>
            {arms.map((a) => (
              <div key={a.id} className="grid grid-cols-[minmax(0,1fr)_repeat(5,1.75rem)] items-center gap-x-1 py-0.5">
                <span className="text-[11px] font-sans text-stone-700 truncate">{surname(a.name)}</span>
                {INNING_COLS.map((i) => {
                  const n = a.innings[i] ?? 0
                  return (
                    <span key={i} title={`${a.name}: ${n} appearances in the ${i === 9 ? '9th or later' : `${i}th`} this season`}
                      className="h-5 rounded-[4px] text-[9px] font-mono flex items-center justify-center"
                      style={{ background: n > 0 ? `rgba(42,120,214,${(0.12 + 0.75 * (n / max)).toFixed(2)})` : '#f5f5f4', color: n / max > 0.55 ? '#fff' : '#57534e' }}>
                      {n > 0 ? n : ''}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        )
      })}
      <p className="text-[9px] font-mono text-stone-300 mt-1.5">Season appearances by the inning the arm entered · role from the club&apos;s bullpen log</p>
    </div>
  )
}

function LeftArmBlock({ club, opp, desk, bench }: { club: ScoutClub; opp: ScoutClub; desk: BullpenDesk | null; bench: BenchBat[] }) {
  const lefties = (desk?.arms ?? []).filter((a) => a.hand === 'L')
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-1.5">{club.abbr} left arms vs {opp.abbr} bench bats</p>
      {lefties.length === 0 ? (
        <p className="text-[11.5px] font-sans italic text-stone-400">{club.abbr} has no left-handed reliever in the bullpen log.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5 mb-2.5">
          {lefties.map((a) => (
            <li key={a.id} className="inline-flex items-center gap-1.5 text-[11px] font-sans rounded-lg border border-stone-200 bg-white px-2 py-1">
              <span className="font-semibold text-stone-800">{a.name}</span><FlagChip arm={a} />
            </li>
          ))}
        </ul>
      )}
      {bench.length === 0 ? (
        <p className="text-[11.5px] font-sans italic text-stone-400">{opp.abbr} bench isn&apos;t available until a lineup is posted.</p>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200">
              <th className="text-left font-semibold py-1">{opp.abbr} bench bat</th><th className="font-semibold">Bats</th><th className="font-semibold">OPS vs LHP</th><th className="font-semibold">PA</th>
            </tr>
          </thead>
          <tbody>
            {bench.slice(0, 8).map((b) => {
              const thin = b.paVsL < FLAG_RULES.minBenchPa
              const threat = !thin && b.opsVsL != null && b.opsVsL >= FLAG_RULES.threatOps
              return (
                <tr key={b.id} className={`border-b border-stone-100 last:border-0 text-right ${thin ? 'text-stone-300' : 'text-stone-700'}`}>
                  <td className="text-left py-1 font-sans font-semibold">{b.name}{threat && <span className="ml-1.5 text-[9px] font-mono font-normal text-amber-700 border border-amber-300 bg-amber-50 rounded px-1">▲ threat</span>}</td>
                  <td className="font-mono">{b.bats ?? '—'}</td>
                  <td className="font-mono">{b.opsVsL != null ? fmtOps(b.opsVsL) : '—'}</td>
                  <td className="font-mono" title={thin ? `Fewer than ${FLAG_RULES.minBenchPa} PA — too small to trust` : undefined}>{b.paVsL}{thin ? '*' : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function AvailabilityColumn({ club, side, desk }: { club: ScoutClub; side: 'away' | 'home'; desk: BullpenDesk | null }) {
  if (!desk || desk.arms.length === 0) {
    return (
      <div>
        <ClubHeader club={club} side={side} />
        <p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">No bullpen log for {club.abbr} yet today.</p>
      </div>
    )
  }
  const idle = desk.arms.every((a) => a.p7 === 0)
  return (
    <div className="space-y-5">
      <ClubHeader club={club} side={side}>
        <span className="text-[10px] font-mono text-stone-500">{desk.arms.length} arms</span>
      </ClubHeader>
      {idle && <p className="text-[11.5px] font-sans italic text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">No bullpen work in the last 7 days — every arm is fully rested.</p>}
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-1.5">Workload · last 7 days</p>
        <WorkloadChart desk={desk} />
      </div>
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-1.5">Role map · where each arm pitches</p>
        <UsageMap desk={desk} />
      </div>
    </div>
  )
}

function Cols({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-stone-100">
      <div>{left}</div>
      <div className="lg:pl-6">{right}</div>
    </div>
  )
}

export default async function BullpenSection({ ctx }: { ctx: ScoutContext }) {
  const [awayDesk, homeDesk, awayBench, homeBench] = await Promise.all([
    getBullpenDesk(ctx.away.id, ctx.gameDate).catch(() => null),
    getBullpenDesk(ctx.home.id, ctx.gameDate).catch(() => null),
    getBenchBatsVsLefties(ctx.away.id, ctx.gameDate, ctx.gamePk),  // away bench faces HOME left arms
    getBenchBatsVsLefties(ctx.home.id, ctx.gameDate, ctx.gamePk),  // home bench faces AWAY left arms
  ])
  const [awayTrends, homeTrends]: (BullpenTrends | null)[] = await Promise.all([
    getBullpenTrends(ctx.away.id, ctx.away.abbr, ctx.away.name, (awayDesk?.arms ?? []).map((a) => a.id), ctx.gameDate).catch(() => null),
    getBullpenTrends(ctx.home.id, ctx.home.abbr, ctx.home.name, (homeDesk?.arms ?? []).map((a) => a.id), ctx.gameDate).catch(() => null),
  ])

  const tabs = [
    {
      id: 'availability', label: 'Availability & roles',
      content: <Cols left={<AvailabilityColumn club={ctx.away} side="away" desk={awayDesk} />} right={<AvailabilityColumn club={ctx.home} side="home" desk={homeDesk} />} />,
    },
    {
      id: 'trends', label: 'Trends',
      content: (
        <StatExplorer
          stats={PEN_STATS}
          clubs={[awayTrends?.explorer ?? null, homeTrends?.explorer ?? null]}
          meta={[
            { name: ctx.away.name, abbr: ctx.away.abbr, side: 'Away', logo: teamLogoUrl(ctx.away.id) },
            { name: ctx.home.name, abbr: ctx.home.abbr, side: 'Home', logo: teamLogoUrl(ctx.home.id) },
          ]}
          tiles={PEN_TILES} defaultStat="kbbPct" defaultWindow={7} sampleUnit="batters faced" gameUnit="games" isPro={ctx.isPro} flagPrompt="Pick a starting pitcher…"
        />
      ),
    },
    {
      id: 'rest', label: 'Rest & fatigue',
      content: <Cols left={<RestPanel club={ctx.away} side="away" trends={awayTrends} />} right={<RestPanel club={ctx.home} side="home" trends={homeTrends} />} />,
    },
    {
      id: 'usage', label: 'Usage by arm',
      content: <Cols left={<UsagePanel club={ctx.away} side="away" trends={awayTrends} desk={awayDesk} />} right={<UsagePanel club={ctx.home} side="home" trends={homeTrends} desk={homeDesk} />} />,
    },
    {
      id: 'matchups', label: 'Left arms vs bench',
      content: <Cols
        left={<div><ClubHeader club={ctx.away} side="away" /><LeftArmBlock club={ctx.away} opp={ctx.home} desk={awayDesk} bench={homeBench} /></div>}
        right={<div><ClubHeader club={ctx.home} side="home" /><LeftArmBlock club={ctx.home} opp={ctx.away} desk={homeDesk} bench={awayBench} /></div>} />,
    },
  ]

  return (
    <div className="space-y-4">
      <Tabs tabs={tabs} />
      <div className="text-[10px] font-mono text-stone-400 leading-relaxed space-y-0.5">
        <p><span className="text-amber-700">▲ Overworked</span> = {WORKLOAD_RULES.yesterdayPitches}+ pitches yesterday, {WORKLOAD_RULES.last3Pitches}+ over 3 days, back-to-back days with {WORKLOAD_RULES.backToBackPlusLast3}+ in 3, or {WORKLOAD_RULES.appearsInLast4} of the last 4 days.</p>
        <p><span className="text-emerald-700">● Sharp</span> / <span className="text-rose-700">▼ Shaky</span> = L7 ERA ≤ {FLAG_RULES.sharpEra.toFixed(2)} / ≥ {FLAG_RULES.shakyEra.toFixed(2)}, only once the arm has faced {FLAG_RULES.minBf}+ batters in the window (IP and BF shown on hover). <span>○ Rested</span> = no pitches in the last 3 days.</p>
        <p>Trends, rest splits and usage cover the bullpen as it stands today — relief outings for the club by the arms currently on its bullpen list. Splits under a small sample are shown faded, never read into. * Bench bat with fewer than {FLAG_RULES.minBenchPa} PA vs LHP is not graded; ▲ threat = {FLAG_RULES.threatOps.toFixed(3).replace(/^0/, '')}+ OPS vs LHP on {FLAG_RULES.minBenchPa}+ PA.</p>
      </div>
    </div>
  )
}
