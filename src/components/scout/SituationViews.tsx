// src/components/scout/SituationViews.tsx
//
// Shared views for count / situation breakdowns (Scout §4 ABS challenges and §5
// stolen bases): a ball-strike count grid and grouped situation rows (outs, inning,
// score margin, base). Each shows the club's SHARE of its attempts in that spot
// beside how often they worked, against the league. Cells under MIN_SITUATION_N
// are faded — never read into.

import { MARGIN_KEYS, MARGIN_LABEL, MIN_SITUATION_N, pct, type Situations, type Tally } from '@/lib/scout/situations'
import { CHART_BLUE } from './charts/LineChart'

const f0 = (v: number | null) => (v == null ? '—' : `${v.toFixed(0)}%`)

export function SituationsNotLoaded({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-5 text-center">
      <p className="text-[12px] font-sans font-semibold text-stone-600">{what} are loading</p>
      <p className="text-[11px] font-sans text-stone-500 mt-1 leading-relaxed">These breakdowns come from the game-by-game feed (count, outs, score and base state at the moment). They appear as soon as that feed has been loaded into the log.</p>
      <p className="text-[9.5px] font-mono text-stone-400 mt-1.5">scripts/sql/add_game_situations.sql → scripts/fetch_game_situations.py</p>
    </div>
  )
}

/** 4 × 3 grid: rows = balls 0–3, columns = strikes 0–2. */
export function CountGrid({ club, league, okLabel, unit }: { club: Situations; league: Situations; okLabel: string; unit: string }) {
  const keys = Array.from({ length: 12 }, (_, i) => `${Math.floor(i / 3)}-${i % 3}`)
  const clubTotal = keys.reduce((a, k) => a + club.byCount[k].n, 0)
  const lgTotal = keys.reduce((a, k) => a + league.byCount[k].n, 0)
  const max = Math.max(0.0001, ...keys.map((k) => (clubTotal > 0 ? club.byCount[k].n / clubTotal : 0)))
  return (
    <div>
      <div className="grid grid-cols-[1.4rem_repeat(3,minmax(0,1fr))] gap-1 text-center">
        <span />
        {[0, 1, 2].map((s) => <span key={s} className="text-[9px] font-mono uppercase tracking-wider text-stone-400">{s} strike{s === 1 ? '' : 's'}</span>)}
        {[0, 1, 2, 3].map((b) => (
          <div key={b} className="contents">
            <span className="text-[9px] font-mono text-stone-400 self-center">{b}b</span>
            {[0, 1, 2].map((s) => {
              const k = `${b}-${s}`, t = club.byCount[k], lg = league.byCount[k]
              const share = clubTotal > 0 ? (t.n / clubTotal) * 100 : 0, lgShare = lgTotal > 0 ? (lg.n / lgTotal) * 100 : 0
              const thin = t.n < MIN_SITUATION_N
              const a = clubTotal > 0 ? 0.08 + 0.8 * (t.n / clubTotal / max) : 0
              return (
                <div key={k} title={`${b}-${s} count · ${t.n} ${unit} (${share.toFixed(0)}% of the club's; league ${lgShare.toFixed(0)}%) · ${t.n > 0 ? `${((t.ok / t.n) * 100).toFixed(0)}% ${okLabel}` : 'none'}`}
                  className="rounded-md px-1 py-1.5 leading-tight" style={{ background: `rgba(42,120,214,${a.toFixed(2)})`, color: a > 0.5 ? '#fff' : '#292524' }}>
                  <p className="text-[12px] font-mono font-bold">{share.toFixed(0)}%</p>
                  <p className={`text-[9px] font-mono ${thin ? 'opacity-40' : 'opacity-80'}`}>{t.n > 0 ? `${((t.ok / t.n) * 100).toFixed(0)}% ${okLabel}` : '—'} · n={t.n}</p>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <p className="text-[9.5px] font-mono text-stone-400 mt-1.5">Big number = share of the club&apos;s {unit} in that count; small = how often it {okLabel === 'safe' ? 'succeeded' : 'was overturned'} · n. Hover for the league share. Faded under {MIN_SITUATION_N}.</p>
    </div>
  )
}

type Row = { label: string; club: Tally; league: Tally }

export function SituationTable({ title, rows, clubTotal, leagueTotal, okLabel }: { title: string; rows: Row[]; clubTotal: number; leagueTotal: number; okLabel: string }) {
  const maxShare = Math.max(0.0001, ...rows.map((r) => (clubTotal > 0 ? r.club.n / clubTotal : 0)), ...rows.map((r) => (leagueTotal > 0 ? r.league.n / leagueTotal : 0)))
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-1.5">{title}</p>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200">
            <th className="text-left font-semibold py-1">Spot</th><th className="font-semibold text-left pl-2">Share of club&apos;s</th><th className="font-semibold">{okLabel}</th><th className="font-semibold">League share</th><th className="font-semibold">League {okLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const share = pct(r.club.n, clubTotal), lgShare = pct(r.league.n, leagueTotal)
            const thin = r.club.n < MIN_SITUATION_N
            return (
              <tr key={r.label} className={`border-b border-stone-100 last:border-0 text-right ${thin ? 'text-stone-300' : 'text-stone-700'}`}>
                <td className="text-left py-1 font-sans font-semibold">{r.label}</td>
                <td className="pl-2">
                  <div className="flex items-center gap-1.5"><div className="h-2 rounded-[3px] bg-stone-100 flex-1 min-w-[40px] overflow-hidden"><div className="h-full rounded-[3px]" style={{ width: `${((share ?? 0) / 100 / maxShare) * 100}%`, background: CHART_BLUE, opacity: thin ? 0.35 : 1 }} /></div><span className="font-mono w-8 text-right">{f0(share)}</span></div>
                </td>
                <td className="font-mono" title={`n=${r.club.n}`}>{f0(pct(r.club.ok, r.club.n))} <span className="text-[9px] text-stone-400">{r.club.n}</span></td>
                <td className="font-mono text-stone-500">{f0(lgShare)}</td>
                <td className="font-mono text-stone-500">{f0(pct(r.league.ok, r.league.n))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function situationTables(club: Situations, league: Situations, okLabel: string, kind?: { title: string; order: { key: string; label: string }[] }) {
  const cTot = club.withSituation, lTot = league.withSituation
  return (
    <div className="space-y-5">
      <SituationTable title="By outs" okLabel={okLabel} clubTotal={cTot} leagueTotal={lTot}
        rows={[0, 1, 2].map((o) => ({ label: `${o} out${o === 1 ? '' : 's'}`, club: club.byOuts[o], league: league.byOuts[o] }))} />
      <SituationTable title="By score margin" okLabel={okLabel} clubTotal={cTot} leagueTotal={lTot}
        rows={MARGIN_KEYS.map((k) => ({ label: MARGIN_LABEL[k], club: club.byMargin[k], league: league.byMargin[k] }))} />
      {kind && <SituationTable title={kind.title} okLabel={okLabel} clubTotal={cTot} leagueTotal={lTot}
        rows={kind.order.map((k) => ({ label: k.label, club: club.byKind[k.key] ?? { n: 0, ok: 0 }, league: league.byKind[k.key] ?? { n: 0, ok: 0 } }))} />}
    </div>
  )
}
