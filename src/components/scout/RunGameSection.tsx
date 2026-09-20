// src/components/scout/RunGameSection.tsx
//
// §5 Run game vs catcher / pitcher — two matchups side by side: each club's
// RUNNERS against the other club's BATTERY (catcher + probable starter).
//   · Catcher tools as strips against the qualified-catcher field: pop time to 2B,
//     exchange, arm strength (Savant)
//   · What actually happened to runners against him: SB / CS charged to the
//     catcher and to the starter, with the attempts behind each rate
//   · The offense: attempts per game and success rate vs the league, and the
//     lineup's runners with attempts and sprint speed
// No steal "odds" are computed — nothing here is a prediction. A success rate is
// only shown with at least MIN_ATTEMPTS attempts behind it; time-to-home is not
// published, so it is left out.

import { getRunGame, MIN_ATTEMPTS, type RunGame } from '@/lib/scout/run-game'
import { getSbSituations, MIN_SITUATION_N, MIN_OPPS, pct as pctSit, type AtBatView, type SbSituations } from '@/lib/scout/situations'
import { PercentileStrip } from './charts/Atoms'
import { Scatter } from './charts/Scatter'
import { CountGrid, SituationsNotLoaded, situationTables } from './SituationViews'
import Tabs from './Tabs'
import { CHART_BLUE, CHART_ORANGE } from './charts/LineChart'
import ClubHeader from './ClubHeader'
import type { ScoutClub, ScoutContext } from './types'

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null)
const f0 = (v: number | null) => (v == null ? '—' : `${v.toFixed(0)}%`)

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-1.5">{children}</p>
}

function Bars({ rows }: { rows: { label: string; value: number | null; text: string; color: string; thin?: boolean }[] }) {
  const max = Math.max(0.0001, ...rows.map((r) => r.value ?? 0))
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className={r.thin ? 'opacity-40' : ''}>
          <div className="flex items-baseline justify-between gap-2 text-[11px] font-sans text-stone-700"><span>{r.label}</span><span className="font-mono text-[10px] text-stone-500">{r.text}</span></div>
          <div className="h-2 mt-0.5 rounded-[3px] bg-stone-100 overflow-hidden"><div className="h-full rounded-[3px]" style={{ width: `${r.value != null ? Math.max(2, (r.value / max) * 100) : 0}%`, background: r.color }} /></div>
        </li>
      ))}
    </ul>
  )
}

export function Matchup({ runners, defender, side, rg, defProbable }: { runners: ScoutClub; defender: ScoutClub; side: 'away' | 'home'; rg: RunGame | null; defProbable: string | null }) {
  if (!rg) return <div><ClubHeader club={runners} side={side} /><p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">Run-game data is unavailable for {runners.abbr} right now.</p></div>
  const { offense: o, catcher: c, pitcher: p } = rg
  const cAtt = c ? c.sb + c.cs : 0, pAtt = p ? p.sb + p.cs : 0
  return (
    <div className="space-y-5">
      <ClubHeader club={runners} side={side}><span className="text-[10px] font-mono text-stone-500">running on {defender.abbr}</span></ClubHeader>

      <section>
        <Label>{defender.abbr} catcher{c ? ` — ${c.name}` : ''}</Label>
        {!c ? <p className="text-[11.5px] font-sans italic text-stone-400">No catcher is listed in the {defender.abbr} lineup yet.</p>
          : c.strips.length === 0 ? <p className="text-[11.5px] font-sans italic text-stone-400">{c.name} isn&apos;t on Savant&apos;s pop-time board yet — no measured throws.</p>
          : <div className="space-y-3">{c.strips.map((s) => <PercentileStrip key={s.label} s={s} />)}
              {(() => {
                const me = c.field.find((f) => f.id === c.id)
                return me && c.field.length >= 10 ? (
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-0.5">Arm vs exchange — every qualified catcher</p>
                    <Scatter ariaLabel={`${c.name} exchange time against arm strength, compared with ${c.field.length} catchers`}
                      xLabel="Exchange (s) — lower is quicker" yLabel="Arm (mph)" xDecimals={2} yDecimals={0}
                      best={{ corner: 'tl', text: 'quick + strong ↖' }}
                      points={c.field.map((f) => ({ id: f.id, label: f.name, x: f.exchange, y: f.arm, highlight: f.id === c.id }))} />
                  </div>
                ) : null
              })()}
              <p className="text-[9.5px] font-mono text-stone-300">Pop time and exchange: {c.popAttempts} steal-attempt throws to 2B. Lower is faster. League field = catchers with 10+ throws. Dashed lines = field medians.</p></div>}
      </section>

      <section>
        <Label>What has happened to runners against them</Label>
        <Bars rows={[
          { label: c ? `${c.name} — caught stealing` : 'Catcher', value: pct(c?.cs ?? 0, cAtt), text: `${f0(pct(c?.cs ?? 0, cAtt))} · ${c?.cs ?? 0} CS of ${cAtt} attempts`, color: CHART_BLUE, thin: cAtt < MIN_ATTEMPTS },
          { label: p ? `${p.name} — caught stealing` : `${defender.abbr} starter`, value: pct(p?.cs ?? 0, pAtt), text: p ? `${f0(pct(p.cs, pAtt))} · ${p.cs} CS of ${pAtt} attempts` : (defProbable ? 'no data' : 'starter not listed'), color: CHART_BLUE, thin: pAtt < MIN_ATTEMPTS },
          { label: 'League — caught stealing', value: rg.leagueCatcherCsPct, text: f0(rg.leagueCatcherCsPct), color: '#a8a29e' },
        ]} />
        {p && <p className="text-[10.5px] font-sans text-stone-500 mt-1.5">{p.name} ({p.throws ?? '?'}HP): {p.sb} stolen bases allowed, {p.pickoffs} pickoffs over {p.ip.toFixed(0)} IP ({p.bf} batters faced).</p>}
        <p className="text-[9.5px] font-mono text-stone-300 mt-1">Rates under {MIN_ATTEMPTS} attempts are faded. Pitcher time-to-home is not published, so it is left out.</p>
      </section>

      <section>
        <Label>{runners.abbr} as a running club</Label>
        <Bars rows={[
          { label: 'Steal attempts per game', value: o.attemptsPerGame, text: `${(o.attemptsPerGame ?? 0).toFixed(2)} · ${o.rank.attempts}${ord(o.rank.attempts)} of ${o.rank.of}`, color: CHART_BLUE },
          { label: 'League — attempts per game', value: o.league.attemptsPerGame, text: o.league.attemptsPerGame.toFixed(2), color: '#a8a29e' },
          { label: 'Success rate', value: o.successPct, text: `${f0(o.successPct)} · ${o.sb} SB, ${o.cs} CS`, color: CHART_ORANGE, thin: o.sb + o.cs < MIN_ATTEMPTS },
          { label: 'League — success rate', value: o.league.successPct, text: f0(o.league.successPct), color: '#a8a29e' },
        ]} />
        <table className="w-full text-[11px] mt-3">
          <thead><tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200"><th className="text-left font-semibold py-1">Lineup runner</th><th className="font-semibold">Sprint</th><th className="font-semibold">SB</th><th className="font-semibold">CS</th><th className="font-semibold">Success</th></tr></thead>
          <tbody>
            {o.runners.map((r) => {
              const att = r.sb + r.cs, thin = att < MIN_ATTEMPTS
              return (
                <tr key={r.id} className="border-b border-stone-100 last:border-0 text-right text-stone-700">
                  <td className="text-left py-1 font-sans font-semibold">{r.name}</td>
                  <td className="font-mono">{r.sprint != null ? `${r.sprint.toFixed(1)} ft/s` : '—'}</td>
                  <td className="font-mono">{r.sb}</td><td className="font-mono">{r.cs}</td>
                  <td className={`font-mono ${thin ? 'text-stone-300' : ''}`} title={thin ? `${att} attempts — too few to read a rate` : undefined}>{att > 0 ? f0(pct(r.sb, att)) : '—'}{thin && att > 0 ? '*' : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="text-[9.5px] font-mono text-stone-300 mt-1">* fewer than {MIN_ATTEMPTS} attempts. Sprint speed is Savant&apos;s competitive-run average; league average is about 27 ft/s.</p>
      </section>
    </div>
  )
}

function ord(n: number): string { const v = n % 100; return v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th' }

const surname = (n: string) => n.trim().split(/\s+/).slice(-1)[0]

/** Who was at the plate when the club ran, next to how many chances each hitter gave them. */
function AtBatBlock({ club, ab }: { club: ScoutClub; ab: AtBatView | null }) {
  if (!ab) {
    return (
      <section>
        <Label>Who was at the plate when {club.abbr} ran</Label>
        <p className="text-[11.5px] font-sans italic text-stone-400">Batter-at-plate data isn&apos;t loaded yet — it appears once the stolen-base log has been re-run with the batter column.</p>
      </section>
    )
  }
  const rate = (r: { attempts2b: number; opps: number }) => (r.opps >= MIN_OPPS ? (r.attempts2b / r.opps) * 100 : null)
  const top = ab.rows.filter((r) => r.attempts > 0).slice(0, 6)
  const maxRate = Math.max(1, ...top.map((r) => rate(r) ?? 0), ab.clubRate2b ?? 0)
  const rarely = ab.clubRate2b == null ? [] : ab.rows
    .filter((r) => r.opps >= MIN_OPPS && (rate(r) as number) <= ab.clubRate2b! * 0.5)
    .sort((a, b) => (rate(a) as number) - (rate(b) as number) || b.opps - a.opps).slice(0, 3)
  return (
    <section>
      <Label>Who was at the plate when {club.abbr} ran · {ab.attemptsWithBatter} attempts</Label>
      {top.length === 0 ? <p className="text-[11.5px] font-sans italic text-stone-400">No attempts with a batter recorded yet.</p> : (
        <table className="w-full text-[11px]">
          <thead><tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200">
            <th className="text-left font-semibold py-1">Batter up</th><th className="font-semibold">Attempts</th><th className="font-semibold">Safe</th><th className="font-semibold" title="Plate appearances that began with a runner on first and second base open">Chances</th><th className="font-semibold text-left pl-3 w-[32%]">Tried 2B per chance</th>
          </tr></thead>
          <tbody>
            {top.map((r) => {
              const rt = rate(r), thin = r.opps < MIN_OPPS
              return (
                <tr key={r.id} className="border-b border-stone-100 last:border-0 text-right text-stone-700">
                  <td className="text-left py-1 font-sans font-semibold">{surname(r.name)}</td>
                  <td className="font-mono">{r.attempts}</td>
                  <td className="font-mono">{r.ok}</td>
                  <td className={`font-mono ${thin ? 'text-stone-300' : ''}`}>{r.opps}</td>
                  <td className="pl-3">
                    {rt == null ? <span className="font-mono text-[10px] text-stone-300 float-left" title={`${r.opps} chances — under ${MIN_OPPS}, too few to read a rate`}>—</span> : (
                      <span className="flex items-center gap-1.5" title={`${r.attempts2b} tries at second in ${r.opps} chances`}>
                        <span className="relative h-2 flex-1 rounded-[3px] bg-stone-100">
                          <span className="absolute top-0 bottom-0 left-0 rounded-[3px]" style={{ width: `${Math.max(2, (rt / maxRate) * 100)}%`, background: CHART_BLUE }} />
                          {ab.clubRate2b != null && <span className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-stone-500" style={{ left: `${(ab.clubRate2b / maxRate) * 100}%` }} title={`${club.abbr} overall ${ab.clubRate2b.toFixed(0)}%`} />}
                        </span>
                        <span className="font-mono text-[10px] text-stone-500 w-8 text-left">{rt.toFixed(0)}%</span>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {rarely.length > 0 && (
        <p className="text-[11px] font-sans text-stone-600 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 mt-2 leading-snug">
          Tends to sit still with these hitters up: {rarely.map((r, i) => <span key={r.id}>{i > 0 ? '; ' : ''}<span className="font-semibold">{surname(r.name)}</span> ({r.attempts2b} tries in {r.opps} chances, {(rate(r) as number).toFixed(0)}%)</span>)} — against {ab.clubRate2b!.toFixed(0)}% for the club as a whole.
        </p>
      )}
      <p className="text-[9.5px] font-mono text-stone-300 mt-1 leading-relaxed">
        A chance = a plate appearance that began with a runner on first and second base open. Tried 2B per chance = steals of second (safe or caught) ÷ chances while that hitter was up; the tick is the club&apos;s overall rate ({ab.clubRate2b != null ? `${ab.clubRate2b.toFixed(0)}%` : '—'} over {ab.clubOpps.toLocaleString()} chances). Hitters under {MIN_OPPS} chances show no rate. This describes who was up, not why — the runner on first and the pitcher matter as much as the hitter.
      </p>
    </section>
  )
}

export function SituationsColumn({ runners, defender, side, mine, theirs }: { runners: ScoutClub; defender: ScoutClub; side: 'away' | 'home'; mine: SbSituations | null; theirs: SbSituations | null }) {
  if (!mine || !theirs) {
    return <div><ClubHeader club={runners} side={side} /><SituationsNotLoaded what="Steal counts and situations" /></div>
  }
  const r = mine.running, d = theirs.against
  const okPct = (t: { n: number; ok: number }) => pctSit(t.ok, t.n)
  return (
    <div className="space-y-5">
      <ClubHeader club={runners} side={side}><span className="text-[10px] font-mono text-stone-500">running on {defender.abbr}</span></ClubHeader>

      <section>
        <Label>{runners.abbr} steal attempts by count · {r.total.n} attempts, {f0(okPct(r.total))} safe</Label>
        <CountGrid club={r} league={mine.league} okLabel="safe" unit="attempts" />
        {mine.topRunners.length > 0 && (
          <p className="text-[10.5px] font-sans text-stone-500 mt-1.5">Most attempts: {mine.topRunners.map((t) => `${t.name} ${t.ok}/${t.n}`).join(' · ')}</p>
        )}
      </section>

      <AtBatBlock club={runners} ab={mine.atBat} />

      <section>
        <Label>Attempts against {defender.abbr} by count · {d.total.n} attempts, {f0(okPct(d.total))} safe</Label>
        <CountGrid club={d} league={theirs.league} okLabel="safe" unit="attempts against them" />
      </section>

      <section>
        {situationTables(r, mine.league, 'safe', {
          title: 'By base stolen',
          order: [{ key: '2B', label: 'Second base' }, { key: '3B', label: 'Third base' }, { key: 'HOME', label: 'Home' }],
        })}
      </section>

      <p className="text-[9.5px] font-mono text-stone-400 leading-relaxed">
        Count = the count before the pitch the runner went on. Score margin is from the running club&apos;s side. Shares are of each club&apos;s own attempts; league figures are all logged attempts (through {theirs.coveredThrough.slice(5).replace('-', '/')}). Cells under {MIN_SITUATION_N} attempts are faded. These describe what happened — they are not steal odds.
      </p>
    </div>
  )
}

export default async function RunGameSection({ ctx }: { ctx: ScoutContext }) {
  const [awayRuns, homeRuns, awaySb, homeSb] = await Promise.all([
    getRunGame(ctx.away.id, ctx.home.id, ctx.gameDate, ctx.gamePk, ctx.home.probableId).catch(() => null),
    getRunGame(ctx.home.id, ctx.away.id, ctx.gameDate, ctx.gamePk, ctx.away.probableId).catch(() => null),
    getSbSituations(ctx.away.id).catch(() => null),
    getSbSituations(ctx.home.id).catch(() => null),
  ])
  const cols = (left: React.ReactNode, right: React.ReactNode) => (
    <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-stone-100"><div>{left}</div><div className="lg:pl-6">{right}</div></div>
  )
  return (
    <div className="space-y-4">
      <Tabs tabs={[
        { id: 'matchup', label: 'Runners vs battery', content: cols(
          <Matchup runners={ctx.away} defender={ctx.home} side="away" rg={awayRuns} defProbable={ctx.home.probableName} />,
          <Matchup runners={ctx.home} defender={ctx.away} side="home" rg={homeRuns} defProbable={ctx.away.probableName} />) },
        { id: 'situations', label: 'Counts & situations', content: cols(
          <SituationsColumn runners={ctx.away} defender={ctx.home} side="away" mine={awaySb} theirs={homeSb} />,
          <SituationsColumn runners={ctx.home} defender={ctx.away} side="home" mine={homeSb} theirs={awaySb} />) },
      ]} />
      <p className="text-[10px] font-mono text-stone-400 leading-relaxed">
        Sources: Baseball Savant catcher pop-time and sprint-speed leaderboards; MLB Stats API stolen-base and caught-stealing counts charged to the catcher and starter; the game-by-game feed for the count and situation of each attempt. These are descriptions of what has happened, with the attempts behind each — not steal odds.
      </p>
    </div>
  )
}
