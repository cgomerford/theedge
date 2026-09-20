// src/components/scout/LeverageSection.tsx
//
// §11 Leverage & late tendencies — three tabs, both clubs side by side:
//   Late & close   — offense OPS (late & close, RISP, RISP with two outs, 7th+) and
//                    opponents' OPS against the club, each vs its own season, with the
//                    PA behind them; one-run and extra-inning records
//   Bullpen in high leverage — saves / holds / blown saves per reliever (the public
//                    marker for entering with the tying or go-ahead run in play),
//                    inherited runners scored, games finished, and the pen's save rate
//   Late aggression — how much of the club's ABS challenging and stealing happens in
//                    the 7th or later, and in late-and-close games once the situation
//                    feed is loaded
//   Late innings   — runs by inning from the 7th on, who the bullpen actually uses there,
//                    and what each club has done against tonight's opponent this season
//                    (with the relationship and meeting count, since a division rival is a
//                    bigger sample than an opposite-league club)
// Entry leverage index isn't published, so save/hold situations stand in and are
// labelled that way.

import { getLeverage, MIN_LEV_PA, type Leverage, type SplitLine } from '@/lib/scout/leverage'
import { MIN_SITUATION_N } from '@/lib/scout/situations'
import { getLateInnings, LATE_LABELS, MIN_LATE_APPS, SMALL_SAMPLE_GAMES, type LateArm, type LateInnings, type Relation, type Scoring } from '@/lib/scout/late-innings'
import { CHART_BLUE, CHART_ORANGE } from './charts/LineChart'
import ClubHeader from './ClubHeader'
import Tabs from './Tabs'
import type { ScoutClub, ScoutContext } from './types'

const ops = (v: number | null) => (v == null ? '—' : v.toFixed(3).replace(/^0/, ''))
const f0 = (v: number | null) => (v == null ? '—' : `${v.toFixed(0)}%`)

function Empty({ club, side }: { club: ScoutClub; side: 'away' | 'home' }) {
  return <div><ClubHeader club={club} side={side} /><p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">Leverage data is unavailable for {club.abbr} right now.</p></div>
}
function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-1.5">{children}</p>
}
function Cols({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-stone-100"><div>{left}</div><div className="lg:pl-6">{right}</div></div>
}

type OpsRow = { label: string; line: SplitLine; base: SplitLine; better: 'high' | 'low' }
function OpsBars({ rows }: { rows: OpsRow[] }) {
  const max = Math.max(0.5, ...rows.map((r) => r.line.ops ?? 0))
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const v = r.line.ops, b = r.base.ops, thin = r.line.pa < MIN_LEV_PA
        const d = v != null && b != null ? v - b : null
        return (
          <li key={r.label} className={thin ? 'opacity-40' : ''}>
            <div className="flex items-baseline justify-between gap-2 text-[11px] font-sans text-stone-700">
              <span>{r.label}</span>
              <span className="font-mono text-[10px] text-stone-500">{ops(v)} OPS{d != null && r.label !== 'Season' ? ` · ${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(3).replace(/^0/, '')} vs season` : ''} · {r.line.pa} PA{thin ? ' (thin)' : ''}</span>
            </div>
            <div className="h-2 mt-0.5 rounded-[3px] bg-stone-100 overflow-hidden"><div className="h-full rounded-[3px]" style={{ width: `${v != null ? (v / max) * 100 : 0}%`, background: r.label === 'Season' ? '#a8a29e' : r.better === 'high' ? CHART_BLUE : CHART_ORANGE }} /></div>
          </li>
        )
      })}
    </ul>
  )
}

export function CloseLate({ club, side, lv }: { club: ScoutClub; side: 'away' | 'home'; lv: Leverage | null }) {
  if (!lv) return <Empty club={club} side={side} />
  const o = lv.offense, p = lv.pitching, r = lv.records
  const rec = (x: { w: number; l: number } | null) => (x ? `${x.w}–${x.l}` : '—')
  return (
    <div className="space-y-5">
      <ClubHeader club={club} side={side} />
      <div className="grid grid-cols-2 gap-2">
        {[['One-run games', rec(r.oneRun)], ['Extra innings', rec(r.extra)]].map(([l, v]) => (
          <div key={l} className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5"><p className="text-[9px] font-mono uppercase tracking-wider text-stone-400">{l}</p><p className="text-[15px] font-mono font-bold text-stone-900 leading-tight">{v}</p></div>
        ))}
      </div>
      <div>
        <Label>{club.abbr} offense — OPS by situation</Label>
        <OpsBars rows={[
          { label: 'Season', line: o.season, base: o.season, better: 'high' }, { label: 'Late & close (7th+, within 1 run)', line: o.lc, base: o.season, better: 'high' },
          { label: 'Runners in scoring position', line: o.risp, base: o.season, better: 'high' }, { label: 'RISP, two outs', line: o.risp2, base: o.season, better: 'high' },
          { label: '7th inning or later', line: o.late, base: o.season, better: 'high' },
        ]} />
      </div>
      <div>
        <Label>Opponents vs {club.abbr} pitching — OPS against</Label>
        <OpsBars rows={[
          { label: 'Season', line: p.season, base: p.season, better: 'low' }, { label: 'Late & close (7th+, within 1 run)', line: p.lc, base: p.season, better: 'low' }, { label: '7th inning or later', line: p.late, base: p.season, better: 'low' },
        ]} />
        <p className="text-[9.5px] font-mono text-stone-300 mt-1">Late &amp; close = 7th inning or later with the batting club tied, ahead by one, or the tying run on deck. Rows under {MIN_LEV_PA} PA are faded.</p>
      </div>
    </div>
  )
}

export function BullpenLeverage({ club, side, lv }: { club: ScoutClub; side: 'away' | 'home'; lv: Leverage | null }) {
  if (!lv || lv.arms.length === 0) return <Empty club={club} side={side} />
  const arms = [...lv.arms].sort((a, b) => (b.u.save + b.u.hold + b.u.bs) - (a.u.save + a.u.hold + a.u.bs)).slice(0, 10)
  const max = Math.max(1, ...arms.map((a) => a.u.save + a.u.hold + a.u.bs))
  const conv = lv.saves.sv + lv.saves.bs > 0 ? (lv.saves.sv / (lv.saves.sv + lv.saves.bs)) * 100 : null
  return (
    <div className="space-y-4">
      <ClubHeader club={club} side={side} />
      <div className="grid grid-cols-3 gap-2">
        {[['Saves', String(lv.saves.sv)], ['Holds', String(lv.saves.hold)], ['Blown saves', String(lv.saves.bs)]].map(([l, v]) => (
          <div key={l} className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5"><p className="text-[9px] font-mono uppercase tracking-wider text-stone-400">{l}</p><p className="text-[15px] font-mono font-bold text-stone-900 leading-tight">{v}</p></div>
        ))}
      </div>
      <p className="text-[11px] font-sans text-stone-600">Save conversion {f0(conv)} ({lv.saves.sv} of {lv.saves.sv + lv.saves.bs} chances) across the arms on today&apos;s bullpen list.</p>
      <div>
        <Label>Who pitches with the game on the line</Label>
        <ul className="space-y-1.5">
          {arms.map(({ arm, u }) => {
            const tot = u.save + u.hold + u.bs, w = (n: number) => `${(n / max) * 100}%`
            return (
              <li key={arm.id} className="grid grid-cols-[minmax(0,7.5rem)_1fr_4.5rem] items-center gap-2 text-[11px] font-sans text-stone-700">
                <span className="truncate"><span className="font-semibold">{arm.name.split(' ').slice(-1)[0]}</span> <span className="font-mono text-[9px] text-stone-400">{arm.role === 'High-leverage' ? 'HL' : arm.role === 'Closer' ? 'CL' : 'BR'}</span></span>
                <span className="flex h-2 gap-[2px] rounded-[3px] bg-stone-100 overflow-hidden" title={`${u.save} saves · ${u.hold} holds · ${u.bs} blown saves`}>
                  <span style={{ width: w(u.save), background: CHART_BLUE }} /><span style={{ width: w(u.hold), background: '#a8a29e' }} /><span style={{ width: w(u.bs), background: CHART_ORANGE }} />
                </span>
                <span className="font-mono text-[10px] text-right text-stone-500" title={`${u.save} saves · ${u.hold} holds · ${u.bs} blown saves`}>{tot > 0 ? `${u.save}·${u.hold}·${u.bs}` : '—'}</span>
              </li>
            )
          })}
        </ul>
        <p className="text-[9.5px] font-mono text-stone-500 flex flex-wrap gap-x-4 gap-y-1 mt-1.5"><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CHART_BLUE }} />Saves</span><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#a8a29e' }} />Holds</span><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CHART_ORANGE }} />Blown saves</span><span>label = sv · hld · bs</span></p>
      </div>
      <table className="w-full text-[11px]">
        <thead><tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200"><th className="text-left font-semibold py-1">Arm</th><th className="font-semibold">Inherited</th><th className="font-semibold">Scored</th><th className="font-semibold">Score%</th><th className="font-semibold">GF</th></tr></thead>
        <tbody>
          {arms.map(({ arm, u }) => {
            const thin = u.inhR < MIN_SITUATION_N
            return (
              <tr key={arm.id} className={`border-b border-stone-100 last:border-0 text-right ${thin ? 'text-stone-300' : 'text-stone-700'}`}>
                <td className="text-left py-1 font-sans font-semibold">{arm.name.split(' ').slice(-1)[0]}</td>
                <td className="font-mono">{u.inhR}</td><td className="font-mono">{u.inhRS}</td><td className="font-mono">{u.inhR > 0 ? f0((u.inhRS / u.inhR) * 100) : '—'}</td><td className="font-mono text-stone-400">{u.gf}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-[9.5px] font-mono text-stone-300 leading-relaxed">Entry leverage isn&apos;t published, so saves, holds and blown saves stand in for entering with the tying or go-ahead run in play. Inherited-runner rows under {MIN_SITUATION_N} are faded. Counts are for the arms on today&apos;s bullpen list.</p>
    </div>
  )
}

export function Aggression({ club, side, lv }: { club: ScoutClub; side: 'away' | 'home'; lv: Leverage | null }) {
  if (!lv) return <Empty club={club} side={side} />
  const a = lv.aggression
  const bar = (label: string, club_: number | null, lg: number | null, n: number) => (
    <li key={label}>
      <div className="flex items-baseline justify-between text-[11px] font-sans text-stone-700"><span>{label}</span><span className="font-mono text-[10px] text-stone-500">{club.abbr} {f0(club_)} · league {f0(lg)} · n={n}</span></div>
      <div className="relative h-2 mt-0.5 rounded-[3px] bg-stone-100 overflow-hidden"><div className="h-full rounded-[3px]" style={{ width: `${club_ ?? 0}%`, background: CHART_BLUE }} /><div className="absolute top-0 bottom-0 w-0.5 bg-stone-500" style={{ left: `${lg ?? 0}%` }} title={`League ${f0(lg)}`} /></div>
    </li>
  )
  return (
    <div className="space-y-4">
      <ClubHeader club={club} side={side} />
      <div>
        <Label>Share of the club&apos;s activity that comes in the 7th or later</Label>
        <ul className="space-y-2">
          {bar('ABS challenges', a.absLateShare.club, a.absLateShare.league, a.absLateShare.n)}
          {a.sbLate ? bar('Steal attempts', a.sbLate.club, a.sbLate.league, a.sbLate.n) : null}
        </ul>
        <p className="text-[9.5px] font-mono text-stone-300 mt-1">Bar = the club · tick = league.</p>
      </div>
      <div>
        <Label>Late &amp; close (7th+, within one run)</Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-stone-200 bg-white px-2.5 py-2">
            <p className="text-[9px] font-mono uppercase tracking-wider text-stone-400">ABS challenges</p>
            {a.absLateClose ? <><p className="text-[15px] font-mono font-bold text-stone-900 leading-tight">{a.absLateClose.n}</p><p className={`text-[10px] font-mono ${a.absLateClose.n < MIN_SITUATION_N ? 'text-stone-300' : 'text-stone-500'}`}>{a.absLateClose.n > 0 ? f0((a.absLateClose.ov / a.absLateClose.n) * 100) : '—'} overturned</p></> : <p className="text-[11px] font-sans text-stone-400 italic mt-1">loading</p>}
          </div>
          <div className="rounded-lg border border-stone-200 bg-white px-2.5 py-2">
            <p className="text-[9px] font-mono uppercase tracking-wider text-stone-400">Steal attempts</p>
            {a.sbLateClose ? <><p className="text-[15px] font-mono font-bold text-stone-900 leading-tight">{a.sbLateClose.n}</p><p className={`text-[10px] font-mono ${a.sbLateClose.n < MIN_SITUATION_N ? 'text-stone-300' : 'text-stone-500'}`}>{a.sbLateClose.n > 0 ? f0((a.sbLateClose.ok / a.sbLateClose.n) * 100) : '—'} safe</p></> : <p className="text-[11px] font-sans text-stone-400 italic mt-1">loading</p>}
          </div>
        </div>
        <p className="text-[9.5px] font-mono text-stone-300 mt-1">Counts under {MIN_SITUATION_N} are faded — too few to read a rate. Late-and-close figures come from the game-situation feed.</p>
      </div>
    </div>
  )
}

// ─── Late innings: scoring, who pitches, and the head-to-head ────────────

const RELATION_COPY: Record<Relation, string> = {
  division: 'Division rivals — the clubs meet about 13 times a year, so this is the biggest head-to-head sample there is.',
  league: 'Same league, different division — about 6–7 meetings a year, a modest sample.',
  interleague: 'Opposite league — usually only 3–4 meetings a year, so the head-to-head is thin. Lean on the season-long picture.',
}
const ip = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`
const r9 = (runs: number, outs: number) => (outs > 0 ? ((runs * 27) / outs).toFixed(1) : '—')
const perGame = (n: number, g: number) => (g > 0 ? n / g : 0)

function LateScoringBars({ title, s, max, opp }: { title: string; s: Scoring; max: number; opp?: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-1.5">{title} · {s.games} game{s.games === 1 ? '' : 's'}{s.games > 0 ? ` · ${s.w}–${s.l}` : ''}</p>
      {s.games === 0 ? <p className="text-[11.5px] font-sans italic text-stone-400">{opp ? `The clubs haven’t met this season yet.` : 'No games yet.'}</p> : (
        <ul className="space-y-1.5">
          {LATE_LABELS.map((l, i) => (
            <li key={l} className="grid grid-cols-[2.6rem_1fr_5.6rem] items-center gap-2 text-[11px] font-sans text-stone-700">
              <span>{l}</span>
              <span className="space-y-[2px]">
                <span className="block h-1.5 rounded-[2px] bg-stone-100 overflow-hidden"><span className="block h-full" style={{ width: `${Math.max(1, (perGame(s.scored[i], s.games) / max) * 100)}%`, background: CHART_BLUE }} /></span>
                <span className="block h-1.5 rounded-[2px] bg-stone-100 overflow-hidden"><span className="block h-full" style={{ width: `${Math.max(1, (perGame(s.allowed[i], s.games) / max) * 100)}%`, background: CHART_ORANGE }} /></span>
              </span>
              <span className="font-mono text-[10px] text-stone-500 text-right" title={`${s.scored[i]} runs scored, ${s.allowed[i]} allowed in ${s.games} games`}>{s.scored[i]} – {s.allowed[i]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function InningCells({ a }: { a: LateArm }) {
  return <>{a.inn.map((n, i) => {
    const f = a.apps > 0 ? n / a.apps : 0
    return <td key={i} className="text-center"><span className="inline-block w-7 rounded-[3px] font-mono text-[10px] py-0.5" style={{ background: n > 0 ? `rgba(42,120,214,${(0.1 + f * 0.75).toFixed(2)})` : '#f5f5f4', color: f > 0.55 ? '#fff' : '#57534e' }} title={`${n} of ${a.apps} appearances included the ${LATE_LABELS[i].toLowerCase()}`}>{n || ''}</span></td>
  })}</>
}

export function LateInningsPanel({ club, opp, side, li }: { club: ScoutClub; opp: ScoutClub; side: 'away' | 'home'; li: LateInnings | null }) {
  if (!li) return <Empty club={club} side={side} />
  const max = Math.max(0.05, ...[li.season, li.vsOpp].flatMap((s) => s.games > 0 ? [...s.scored, ...s.allowed].map((n) => perGame(n, s.games)) : [0]))
  const small = li.vsOpp.games < SMALL_SAMPLE_GAMES
  return (
    <div className="space-y-5">
      <ClubHeader club={club} side={side}><span className="text-[10px] font-mono text-stone-500">7th inning on</span></ClubHeader>

      <div className={`rounded-lg border px-3 py-2 text-[11px] font-sans leading-snug ${small ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-stone-200 bg-stone-50 text-stone-600'}`}>
        <span className="font-semibold">{li.vsOpp.games} meeting{li.vsOpp.games === 1 ? '' : 's'} with {opp.abbr} so far.</span> {RELATION_COPY[li.relation]}{small && li.vsOpp.games > 0 ? ' Treat the head-to-head lines below as colour, not a trend.' : ''}
      </div>

      <div className="space-y-4">
        <LateScoringBars title={`${club.abbr} runs by inning — all season`} s={li.season} max={max} />
        <LateScoringBars title={`${club.abbr} runs by inning — vs ${opp.abbr}`} s={li.vsOpp} max={max} opp={opp.abbr} />
        <p className="text-[10px] font-mono text-stone-500 flex gap-4"><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CHART_BLUE }} />runs scored per game</span><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CHART_ORANGE }} />runs allowed per game</span><span>label = scored – allowed (totals)</span></p>
      </div>

      <div>
        <Label>Who pitches from the 7th on — {club.abbr} bullpen, all season</Label>
        {!li.arms ? <p className="text-[11.5px] font-sans italic text-stone-400">The late-inning reliever log isn&apos;t loaded yet — it appears once the game-situation feed has been re-run.</p> : (
          <>
            <table className="w-full text-[11px]">
              <thead><tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200">
                <th className="text-left font-semibold py-1">Arm</th>{LATE_LABELS.map((l) => <th key={l} className="font-semibold text-center">{l.replace('Extras', 'Ext')}</th>)}<th className="font-semibold">Apps</th><th className="font-semibold" title="Came in with his club ahead by 1–3 runs">Lead</th><th className="font-semibold">IP</th><th className="font-semibold" title="Runs while on the mound per 9 innings, 7th on">R/9</th>
              </tr></thead>
              <tbody>
                {li.arms.map((a) => {
                  const thin = a.outs < 30
                  return (
                    <tr key={a.id} className="border-b border-stone-100 last:border-0 text-right text-stone-700">
                      <td className="text-left py-1 font-sans font-semibold">{a.name.split(' ').slice(-1)[0]}</td>
                      <InningCells a={a} />
                      <td className="font-mono">{a.apps}</td>
                      <td className="font-mono text-stone-500" title={`${a.lead} of ${a.apps} entries with a 1–3 run lead · ${a.tied} tied · ${a.behind} behind`}>{a.lead}</td>
                      <td className="font-mono text-stone-400">{ip(a.outs)}</td>
                      <td className={`font-mono ${thin ? 'text-stone-300' : ''}`} title={thin ? 'Under 10 late innings — too few to read' : undefined}>{r9(a.runs, a.outs)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="text-[9.5px] font-mono text-stone-300 mt-1 leading-relaxed">Cells = appearances that included that inning (darker = a bigger share of his late outings). Lead = games he came in with his club ahead by 1–3. R/9 counts runs while he was on the mound, inherited runners included; faded under 10 late innings. Arms with fewer than {MIN_LATE_APPS} late appearances are left out.{li.loggedThrough ? ` Through ${li.loggedThrough.slice(5).replace('-', '/')}.` : ''}</p>
          </>
        )}
      </div>

      <div>
        <Label>{club.abbr} relievers against {opp.abbr}, 7th on</Label>
        {!li.armsVsOpp ? <p className="text-[11.5px] font-sans italic text-stone-400">Not loaded yet.</p>
          : li.armsVsOpp.length === 0 ? <p className="text-[11.5px] font-sans italic text-stone-400">No {club.abbr} reliever has faced {opp.abbr} from the 7th on this season.</p> : (
            <>
              <table className="w-full text-[11px]">
                <thead><tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200">
                  <th className="text-left font-semibold py-1">Arm</th><th className="font-semibold">G</th><th className="font-semibold">IP</th><th className="font-semibold">H</th><th className="font-semibold">BB</th><th className="font-semibold">K</th><th className="font-semibold" title="Runs while on the mound">R</th><th className="font-semibold text-left pl-2">Came in</th>
                </tr></thead>
                <tbody>
                  {li.armsVsOpp.map((a) => (
                    <tr key={a.id} className={`border-b border-stone-100 last:border-0 text-right ${a.outs < 6 ? 'text-stone-400' : 'text-stone-700'}`}>
                      <td className="text-left py-1 font-sans font-semibold">{a.name.split(' ').slice(-1)[0]}</td>
                      <td className="font-mono">{a.apps}</td><td className="font-mono">{ip(a.outs)}</td><td className="font-mono">{a.hits}</td><td className="font-mono">{a.bb}</td><td className="font-mono">{a.k}</td><td className="font-mono">{a.runs}</td>
                      <td className="text-left pl-2 font-mono text-[10px] text-stone-500">{a.lead ? `${a.lead} ahead` : ''}{a.lead && (a.tied || a.behind) ? ' · ' : ''}{a.tied ? `${a.tied} tied` : ''}{a.tied && a.behind ? ' · ' : ''}{a.behind ? `${a.behind} behind` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[9.5px] font-mono text-stone-300 mt-1 leading-relaxed">Only innings from the 7th on, in this season&apos;s games against {opp.abbr}. Lines under 2 innings are faded — a handful of batters isn&apos;t a pattern.</p>
            </>
          )}
      </div>
    </div>
  )
}

export default async function LeverageSection({ ctx }: { ctx: ScoutContext }) {
  const [away, home, awayLate, homeLate] = await Promise.all([
    getLeverage(ctx.away.id, ctx.gameDate), getLeverage(ctx.home.id, ctx.gameDate),
    getLateInnings(ctx.away.id, ctx.home.id, ctx.gameDate).catch(() => null), getLateInnings(ctx.home.id, ctx.away.id, ctx.gameDate).catch(() => null),
  ])
  const two = (P: typeof CloseLate) => <Cols left={<P club={ctx.away} side="away" lv={away} />} right={<P club={ctx.home} side="home" lv={home} />} />
  return (
    <div className="space-y-4">
      <Tabs tabs={[
        { id: 'close', label: 'Late & close', content: two(CloseLate) },
        { id: 'pen', label: 'Bullpen in high leverage', content: two(BullpenLeverage) },
        { id: 'aggr', label: 'Late aggression', content: two(Aggression) },
        { id: 'late', label: 'Late innings & this matchup', content: <Cols left={<LateInningsPanel club={ctx.away} opp={ctx.home} side="away" li={awayLate} />} right={<LateInningsPanel club={ctx.home} opp={ctx.away} side="home" li={homeLate} />} /> },
      ]} />
      <p className="text-[10px] font-mono text-stone-400 leading-relaxed">
        Situational splits are from the MLB Stats API (season to date); bullpen save/hold/blown-save and inherited-runner counts come from each reliever&apos;s game log; challenge and steal timing comes from the game-by-game feed. Every figure shows its sample. This describes tendencies — it isn&apos;t a prediction.
      </p>
    </div>
  )
}
