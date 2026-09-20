// src/components/scout/BullpenPanels.tsx
//
// §3 deep panels, both per club:
//   RestPanel  — "days before vs runs after": three splits of how the pen
//                performed depending on the load that preceded the outing —
//                bullpen innings in the prior 3 days, the arm's days of rest,
//                and the pitch count of the arm's previous outing.
//   UsagePanel — how each arm is used: outings, innings and pitches per outing,
//                multi-inning share, strike/walk/K rates, inherited runners
//                scored, finishes/holds/saves/blown saves, and the last 6
//                outings as a bar strip (orange = an earned run scored).
// Splits under MIN_SPLIT_N are drawn faded and labelled thin — never read into.

import { MIN_SPLIT_N, type ArmUsage, type BullpenTrends, type SplitBucket } from '@/lib/scout/bullpen-trends'
import type { BullpenArm, BullpenDesk } from '@/lib/scout/bullpen-desk'
import { CHART_BLUE, CHART_ORANGE } from './charts/LineChart'
import ClubHeader from './ClubHeader'
import type { ScoutClub } from './types'

const er9 = (b: SplitBucket) => (b.outs > 0 ? (b.er * 27) / b.outs : null)
const ipText = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`

function SplitBars({ title, unit, note, rows }: { title: string; unit: 'game' | 'outing'; note: string; rows: SplitBucket[] }) {
  const values = rows.map(er9)
  const max = Math.max(1, ...values.filter((v): v is number => v != null))
  const [first, last] = [rows[0], rows[rows.length - 1]]
  const enough = first && last && first.n >= MIN_SPLIT_N && last.n >= MIN_SPLIT_N && er9(first) != null && er9(last) != null
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold">{title}</p>
      <p className="text-[10.5px] font-sans text-stone-400 mb-2">{note}</p>
      <ul className="space-y-1.5">
        {rows.map((b, i) => {
          const v = values[i]
          const thin = b.n < MIN_SPLIT_N
          return (
            <li key={b.label} className={thin ? 'opacity-40' : ''}>
              <div className="flex items-baseline justify-between gap-2 text-[11px] font-sans text-stone-700">
                <span className="truncate">{b.label}</span>
                <span className="font-mono text-[10px] text-stone-500 shrink-0">
                  {v != null ? `${v.toFixed(2)} ER/9` : '—'} · {(b.r / Math.max(1, b.n)).toFixed(2)} R/{unit} · n={b.n}{thin ? ' (thin)' : ''}
                </span>
              </div>
              <div className="h-2 mt-0.5 rounded-[3px] bg-stone-100 overflow-hidden">
                <div className="h-full rounded-[3px]" style={{ width: `${v != null ? Math.max(3, (v / max) * 100) : 0}%`, background: CHART_BLUE }} />
              </div>
            </li>
          )
        })}
      </ul>
      {enough && (
        <p className="text-[10.5px] font-sans text-stone-500 mt-1.5">
          {last.label.split(' · ')[0].split(' (')[0]} vs {first.label.split(' · ')[0].split(' (')[0]}: {(er9(last) as number) - (er9(first) as number) >= 0 ? '+' : '−'}{Math.abs((er9(last) as number) - (er9(first) as number)).toFixed(2)} ER/9.
        </p>
      )}
    </div>
  )
}

export function RestPanel({ club, side, trends }: { club: ScoutClub; side: 'away' | 'home'; trends: BullpenTrends | null }) {
  if (!trends) {
    return <div><ClubHeader club={club} side={side} /><p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">Not enough relief game logs for {club.abbr} yet.</p></div>
  }
  return (
    <div className="space-y-5">
      <ClubHeader club={club} side={side} />
      {trends.loadVsRuns.length > 0 && (
        <SplitBars title="Pen innings in the 3 days before → runs allowed in the game" unit="game"
          note="Each game grouped by how many innings the bullpen had thrown over the previous 3 days." rows={trends.loadVsRuns} />
      )}
      <SplitBars title="Days of rest → the next outing" unit="outing"
        note="Every relief outing grouped by days since that same arm last pitched." rows={trends.byRest} />
      <SplitBars title="Previous outing's pitch count → the next outing" unit="outing"
        note="Every relief outing grouped by how many pitches the arm threw the time before." rows={trends.byPrevLoad} />
    </div>
  )
}

function RecentStrip({ arm }: { arm: ArmUsage }) {
  const H = 22
  const list = arm.recent
  return (
    <svg width={list.length * 12 || 12} height={H} role="img" aria-label={`Last ${list.length} outings, pitches thrown`}>
      {list.map((a, i) => {
        const h = Math.max(3, (Math.min(a.pitches, 40) / 40) * H)
        return (
          <rect key={a.pk} x={i * 12} y={H - h} width={10} height={h} rx={2} fill={a.er > 0 ? CHART_ORANGE : CHART_BLUE}>
            <title>{`${a.date.slice(5).replace('-', '/')}: ${ipText(a.outs)} IP, ${a.pitches} pitches, ${a.er} ER`}</title>
          </rect>
        )
      })}
    </svg>
  )
}

const pct = (v: number | null) => (v == null ? '—' : `${v.toFixed(0)}%`)

export function UsagePanel({ club, side, trends, desk }: { club: ScoutClub; side: 'away' | 'home'; trends: BullpenTrends | null; desk: BullpenDesk | null }) {
  if (!trends || !desk) {
    return <div><ClubHeader club={club} side={side} /><p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">Not enough relief game logs for {club.abbr} yet.</p></div>
  }
  const rows = desk.arms.map((a: BullpenArm) => ({ arm: a, u: trends.arms.get(a.id) })).filter((r): r is { arm: BullpenArm; u: ArmUsage } => !!r.u)
  const t = trends.team
  const chips: [string, string][] = [
    ['Innings / game', t.ipPerGame != null ? t.ipPerGame.toFixed(1) : '—'],
    ['Pitches / outing', t.pitchesPerApp != null ? t.pitchesPerApp.toFixed(1) : '—'],
    ['Multi-inning outings', pct(t.multiInningPct)],
    ['Enter with runners on', pct(t.enterWithRunnersPct)],
  ]
  return (
    <div className="space-y-4">
      <ClubHeader club={club} side={side} />
      <div className="grid grid-cols-2 gap-2">
        {chips.map(([label, v]) => (
          <div key={label} className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5">
            <p className="text-[9px] font-mono uppercase tracking-wider text-stone-400">{label}</p>
            <p className="text-[15px] font-mono font-bold text-stone-900 leading-tight">{v}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10.5px] whitespace-nowrap">
          <thead>
            <tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200">
              <th className="text-left font-semibold py-1 pr-2">Arm</th>
              <th className="font-semibold px-1.5">G</th><th className="font-semibold px-1.5">IP/G</th><th className="font-semibold px-1.5">P/G</th><th className="font-semibold px-1.5">Multi</th>
              <th className="font-semibold px-1.5">Str%</th><th className="font-semibold px-1.5">BB%</th><th className="font-semibold px-1.5">K%</th>
              <th className="font-semibold px-1.5" title="Inherited runners scored / inherited">IRS</th>
              <th className="font-semibold px-1.5" title="Games finished / holds / saves / blown saves">GF·H·SV·BS</th>
              <th className="font-semibold pl-1.5 text-left">Last 6</th>
            </tr>
          </thead>
          <tbody className="font-mono text-stone-700">
            {rows.map(({ arm, u }) => (
              <tr key={arm.id} className="border-b border-stone-100 last:border-0 text-right">
                <td className="text-left py-1.5 pr-2 font-sans"><span className="font-semibold text-stone-800">{arm.name}</span> <span className="text-[9px] text-stone-400">{arm.role}</span></td>
                <td className="px-1.5">{u.apps}</td>
                <td className="px-1.5">{(u.outs / 3 / Math.max(1, u.apps)).toFixed(1)}</td>
                <td className="px-1.5">{u.pitchesPerApp != null ? u.pitchesPerApp.toFixed(0) : '—'}</td>
                <td className="px-1.5">{pct(u.multiInningPct)}</td>
                <td className="px-1.5">{u.strikePct != null ? u.strikePct.toFixed(0) : '—'}</td>
                <td className="px-1.5">{u.bbPct != null ? u.bbPct.toFixed(1) : '—'}</td>
                <td className="px-1.5">{u.kPct != null ? u.kPct.toFixed(1) : '—'}</td>
                <td className="px-1.5" title={u.inhR < MIN_SPLIT_N ? `Only ${u.inhR} inherited runners — thin` : undefined}>
                  <span className={u.inhR < MIN_SPLIT_N ? 'text-stone-300' : ''}>{u.inhRS}/{u.inhR}</span>
                </td>
                <td className="px-1.5 text-stone-500">{u.gf}·{u.hold}·{u.save}·{u.bs}</td>
                <td className="pl-1.5"><RecentStrip arm={u} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[9px] font-mono text-stone-300 leading-relaxed">
        G = relief outings this season for {club.abbr} · P/G = pitches per outing · Multi = share of outings of 4+ outs · IRS = inherited runners scored / inherited (faded under {MIN_SPLIT_N}) · last 6 bars = pitches per outing, orange = an earned run scored.
      </p>
    </div>
  )
}
