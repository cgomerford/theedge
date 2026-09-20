// src/components/scout/FormTrendsSection.tsx
//
// §2 Form vs skill trends — a plain-language read on each club's last 15 games
// against its season, an L7/L15/L30 table with the plate appearances behind each
// window, then the StatExplorer: pick any offensive stat (contact quality,
// results, plate discipline) and a rolling window and both clubs chart side by
// side. The three headline tiles under each chart expand in place.

import { getTeamTrend, OFFENSE_STATS, OFFENSE_TILES, type TeamTrend, type TrendVerdict, type TrendWindow } from '@/lib/scout/team-trends'
import { teamLogoUrl } from '@/lib/mlb'
import StatExplorer from './StatExplorer'
import type { ScoutClub, ScoutContext } from './types'

const fmt3 = (v: number) => v.toFixed(3).replace(/^0/, '')

const VERDICT_MARK: Record<TrendVerdict['tone'], { glyph: string; box: string }> = {
  up: { glyph: '▲', box: 'bg-stone-900 text-white border-stone-900' },
  down: { glyph: '▼', box: 'bg-stone-900 text-white border-stone-900' },
  lucky: { glyph: '!', box: 'bg-amber-50 text-amber-900 border-amber-300' },
  unlucky: { glyph: '!', box: 'bg-amber-50 text-amber-900 border-amber-300' },
  even: { glyph: '=', box: 'bg-stone-50 text-stone-700 border-stone-200' },
  thin: { glyph: '…', box: 'bg-stone-50 text-stone-500 border-stone-200' },
}

function WindowTable({ trend }: { trend: TeamTrend }) {
  const rows: [string, TrendWindow][] = [['L7', trend.l7], ['L15', trend.l15], ['L30', trend.l30]]
  return (
    <table className="w-full text-[11px] font-mono">
      <thead>
        <tr className="text-[9px] uppercase tracking-wider text-stone-400 text-right">
          <th className="text-left font-semibold py-1">Window</th><th className="font-semibold">xwOBA</th><th className="font-semibold">wOBA</th><th className="font-semibold">PA</th>
        </tr>
      </thead>
      <tbody className="text-right text-stone-700">
        {rows.map(([label, w]) => (
          <tr key={label} className="border-t border-stone-100">
            <td className="text-left py-1 font-semibold">{label} <span className="text-stone-400 font-normal">· {w.games}g</span></td>
            <td>{w.xwoba != null ? fmt3(w.xwoba) : '—'}</td><td>{w.woba != null ? fmt3(w.woba) : '—'}</td><td className="text-stone-500">{w.pa}</td>
          </tr>
        ))}
        <tr className="border-t border-stone-200 text-stone-500">
          <td className="text-left py-1 font-semibold">Season</td>
          <td>{trend.seasonXwoba != null ? fmt3(trend.seasonXwoba) : '—'}</td><td>{trend.seasonWoba != null ? fmt3(trend.seasonWoba) : '—'}</td><td>—</td>
        </tr>
      </tbody>
    </table>
  )
}

export function Summary({ club, side, trend }: { club: ScoutClub; side: string; trend: TeamTrend | null }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={teamLogoUrl(club.id)} alt="" className="w-6 h-6 object-contain shrink-0" />
        <p className="text-[13px] font-sans font-bold text-stone-900 leading-tight">{club.name} <span className="font-mono font-normal text-[9px] uppercase tracking-widest text-stone-400 ml-1">{side}</span></p>
      </div>
      {trend ? (
        <>
          <div className={`rounded-xl border px-3 py-2.5 ${VERDICT_MARK[trend.verdict.tone].box}`}>
            <p className="text-[12px] font-sans font-bold"><span aria-hidden className="mr-1.5 font-mono">{VERDICT_MARK[trend.verdict.tone].glyph}</span>{trend.verdict.label}</p>
            <p className="text-[11px] font-sans opacity-80 leading-snug mt-0.5">{trend.verdict.detail}</p>
          </div>
          <WindowTable trend={trend} />
        </>
      ) : (
        <p className="text-[12px] font-sans italic text-stone-400 py-4 text-center">Statcast trend data is unavailable for {club.abbr} right now.</p>
      )}
    </div>
  )
}

export default async function FormTrendsSection({ ctx }: { ctx: ScoutContext }) {
  const [away, home] = await Promise.all([
    getTeamTrend(ctx.away.id, ctx.away.abbr, ctx.gameDate, ctx.away.name),
    getTeamTrend(ctx.home.id, ctx.home.abbr, ctx.gameDate, ctx.home.name),
  ])
  return (
    <div className="space-y-5">
      <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-stone-100">
        <Summary club={ctx.away} side="Away" trend={away} />
        <div className="lg:pl-6"><Summary club={ctx.home} side="Home" trend={home} /></div>
      </div>

      <StatExplorer
        stats={OFFENSE_STATS}
        clubs={[away?.explorer ?? null, home?.explorer ?? null]}
        meta={[
          { name: ctx.away.name, abbr: ctx.away.abbr, side: 'Away', logo: teamLogoUrl(ctx.away.id) },
          { name: ctx.home.name, abbr: ctx.home.abbr, side: 'Home', logo: teamLogoUrl(ctx.home.id) },
        ]}
        tiles={OFFENSE_TILES}
        defaultStat="xwoba"
        defaultWindow={7}
        sampleUnit="PA"
        gameUnit="games"
        isPro={ctx.isPro}
        flagPrompt="Pick a player or a starter faced…"
      />

      <p className="text-[10px] font-mono text-stone-400 leading-relaxed">
        Built from Baseball Savant pitch data and the MLB Stats API, regular season. xwOBA is expected wOBA on contact (actual outcomes on walks and strikeouts). The dashed line is the season figure where one is published; otherwise it&apos;s the average of the games shown, and the chart says so. Every window shows the sample behind it.
      </p>
    </div>
  )
}
