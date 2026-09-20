// src/components/scout/ABSSection.tsx
//
// §4 ABS challenge desk — both clubs side by side across four tabs:
//   Rate & success — a plain read, challenges per game and overturn rate for the
//                    season, the last 15 games and the league, plus rolling trends
//   Who challenges — batter- vs catcher/pitcher-initiated split and the players
//                    who actually call for the review
//   When           — by inning group (1–3 / 4–6 / 7+): how much of the volume and
//                    how often it works late. Leverage is not published, so inning
//                    group stands in and is labelled that way.
//   Watch-fors     — the same read as sentences. Information, not advice.
// Source: MLB's game feed per-pitch challenge log (the data behind Savant's ABS
// boards). Every rate carries its n; thin cells are faded.

import { getAbsDesk, MIN_ABS_N, MIN_RANK_CHALLENGES, type AbsClub, type Bucket, type ChallengerLine } from '@/lib/scout/abs-desk'
import { MIN_SITUATION_N } from '@/lib/scout/situations'
import Leaderboard from './Leaderboard'
import { CountGrid, SituationTable, SituationsNotLoaded, situationTables } from './SituationViews'
import LineChart, { CHART_BLUE, CHART_ORANGE } from './charts/LineChart'
import ClubHeader from './ClubHeader'
import Tabs from './Tabs'
import type { ScoutClub, ScoutContext } from './types'

const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null)
const LEAGUE = '#a8a29e'

function Empty({ club, side }: { club: ScoutClub; side: 'away' | 'home' }) {
  return <div><ClubHeader club={club} side={side} /><p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">No ABS challenge log is available for {club.abbr} yet.</p></div>
}

function Cols({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-stone-100">
      <div>{left}</div><div className="lg:pl-6">{right}</div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-1.5">{children}</p>
}

function Freshness({ abs }: { abs: AbsClub }) {
  if (abs.uncountedGames === 0) return null
  return <p className="text-[10.5px] font-sans text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">Challenge log runs through {shortDate(abs.coveredThrough)} — {abs.uncountedGames} newer game{abs.uncountedGames === 1 ? '' : 's'} not counted yet.</p>
}

// ─── Bars ────────────────────────────────────────────────────────────────

type BarRow = { label: string; value: number | null; text: string; n?: number; league?: boolean }

function BarGroup({ title, rows }: { title: string; rows: BarRow[] }) {
  const max = Math.max(0.0001, ...rows.map((r) => r.value ?? 0))
  return (
    <div>
      <Label>{title}</Label>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const thin = r.n != null && r.n < MIN_ABS_N
          return (
            <li key={r.label} className={thin ? 'opacity-40' : ''}>
              <div className="flex items-baseline justify-between gap-2 text-[11px] font-sans text-stone-700">
                <span>{r.label}</span>
                <span className="font-mono text-[10px] text-stone-500">{r.text}{r.n != null ? ` · n=${r.n}` : ''}{thin ? ' (thin)' : ''}</span>
              </div>
              <div className="h-2 mt-0.5 rounded-[3px] bg-stone-100 overflow-hidden">
                <div className="h-full rounded-[3px]" style={{ width: `${r.value != null ? Math.max(2, (r.value / max) * 100) : 0}%`, background: r.league ? LEAGUE : CHART_BLUE }} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const perGame = (b: Bucket) => (b.games > 0 ? b.all.n / b.games : null)
const ovPct = (t: { n: number; ov: number }) => pct(t.ov, t.n)

export function RatePanel({ club, side, abs }: { club: ScoutClub; side: 'away' | 'home'; abs: AbsClub | null }) {
  if (!abs) return <Empty club={club} side={side} />
  const lgRate = perGame(abs.league) ?? 0
  const lgOv = ovPct(abs.league.all)
  const rollC = rolling(abs, 10, 'rate'), rollO = rolling(abs, 15, 'overturn')
  return (
    <div className="space-y-5">
      <ClubHeader club={club} side={side} />
      <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
        <p className="text-[12px] font-sans font-bold text-stone-900">{abs.profile.label}</p>
        <p className="text-[11px] font-sans text-stone-600 leading-snug mt-0.5">{abs.profile.summary}</p>
      </div>
      <Freshness abs={abs} />
      <BarGroup title="Challenges per game" rows={[
        { label: 'Season', value: perGame(abs.season), text: (perGame(abs.season) ?? 0).toFixed(2), n: abs.season.all.n },
        { label: `Last ${abs.recent.games} games`, value: perGame(abs.recent), text: (perGame(abs.recent) ?? 0).toFixed(2), n: abs.recent.all.n },
        { label: 'League', value: lgRate, text: lgRate.toFixed(2), league: true },
      ]} />
      <BarGroup title="Overturn rate — how often a challenge succeeds" rows={[
        { label: 'Season', value: ovPct(abs.season.all), text: fmtPct(ovPct(abs.season.all)), n: abs.season.all.n },
        { label: `Last ${abs.recent.games} games`, value: ovPct(abs.recent.all), text: fmtPct(ovPct(abs.recent.all)), n: abs.recent.all.n },
        { label: 'League', value: lgOv, text: fmtPct(lgOv), league: true },
      ]} />
      <div>
        <Label>Challenges per game · rolling 10 games</Label>
        <LineChart labels={rollC.labels} series={[{ key: 'r', label: `${club.abbr} challenges / game`, color: CHART_BLUE, values: rollC.values }]}
          baseline={{ value: lgRate, label: 'League' }} format={(v) => v.toFixed(2)} height={130} ariaLabel={`${club.abbr} rolling challenges per game`} />
      </div>
      <div>
        <Label>Overturn rate · rolling 15 games</Label>
        <LineChart labels={rollO.labels} series={[{ key: 'o', label: `${club.abbr} overturn rate`, color: CHART_ORANGE, values: rollO.values }]}
          baseline={{ value: lgOv, label: 'League' }} format={(v) => `${v.toFixed(0)}%`} height={130} ariaLabel={`${club.abbr} rolling overturn rate`} />
        <p className="text-[9.5px] font-mono text-stone-300 mt-0.5">A point needs {MIN_ABS_N}+ challenges in its window; windows with fewer are left blank.</p>
      </div>
    </div>
  )
}

const fmtPct = (v: number | null) => (v == null ? '—' : `${v.toFixed(0)}%`)

function rolling(abs: AbsClub, w: number, kind: 'rate' | 'overturn') {
  const g = abs.perGame
  const pts = g.map((_, i) => {
    if (i < w - 1) return null
    const win = g.slice(i - w + 1, i + 1)
    const ch = win.reduce((a, x) => a + x.challenges, 0), ov = win.reduce((a, x) => a + x.overturns, 0)
    return kind === 'rate' ? ch / w : ch >= MIN_ABS_N ? (ov / ch) * 100 : null
  })
  const first = w - 1
  return { labels: g.slice(first).map((x) => shortDate(x.date)), values: pts.slice(first) }
}

// ─── Who challenges ──────────────────────────────────────────────────────

function SplitBar({ label, b, sharedN }: { label: string; b: Bucket; sharedN?: number }) {
  const total = b.batter.n + b.catcher.n
  const bShare = total > 0 ? (b.batter.n / total) * 100 : 0
  return (
    <div className={total < MIN_ABS_N ? 'opacity-40' : ''}>
      <div className="flex items-baseline justify-between text-[11px] font-sans text-stone-700"><span>{label}</span><span className="font-mono text-[10px] text-stone-500">n={sharedN ?? total}</span></div>
      <div className="flex gap-[2px] h-3.5 mt-0.5" role="img" aria-label={`${label}: ${Math.round(bShare)}% batter-initiated`}>
        <div className="rounded-l-[3px] flex items-center justify-center text-[9px] font-mono text-white" style={{ width: `${bShare}%`, background: CHART_BLUE, minWidth: bShare > 0 ? 2 : 0 }}>{bShare >= 14 ? `${Math.round(bShare)}%` : ''}</div>
        <div className="rounded-r-[3px] flex items-center justify-center text-[9px] font-mono text-white" style={{ width: `${100 - bShare}%`, background: CHART_ORANGE, minWidth: bShare < 100 ? 2 : 0 }}>{100 - bShare >= 14 ? `${Math.round(100 - bShare)}%` : ''}</div>
      </div>
    </div>
  )
}

function ChallengerTable({ title, rows }: { title: string; rows: ChallengerLine[] }) {
  return (
    <div>
      <Label>{title}</Label>
      {rows.length === 0 ? <p className="text-[11.5px] font-sans italic text-stone-400">None logged.</p> : (
        <table className="w-full text-[11px]">
          <thead><tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200"><th className="text-left font-semibold py-1">Player</th><th className="font-semibold">Challenges</th><th className="font-semibold">Overturned</th><th className="font-semibold">Rate</th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const thin = p.n < MIN_ABS_N
              return (
                <tr key={p.id} className={`border-b border-stone-100 last:border-0 text-right ${thin ? 'text-stone-300' : 'text-stone-700'}`}>
                  <td className="text-left py-1 font-sans font-semibold">{p.name}</td>
                  <td className="font-mono">{p.n}{thin ? '*' : ''}</td><td className="font-mono">{p.ov}</td><td className="font-mono">{fmtPct(pct(p.ov, p.n))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function WhoPanel({ club, side, abs }: { club: ScoutClub; side: 'away' | 'home'; abs: AbsClub | null }) {
  if (!abs) return <Empty club={club} side={side} />
  const batters = abs.challengers.filter((c) => c.side === 'batting').slice(0, 6)
  const catchers = abs.challengers.filter((c) => c.side === 'fielding').slice(0, 6)
  return (
    <div className="space-y-5">
      <ClubHeader club={club} side={side} />
      <div className="space-y-2">
        <Label>Who starts the challenge</Label>
        <SplitBar label="Season" b={abs.season} />
        <SplitBar label={`Last ${abs.recent.games} games`} b={abs.recent} />
        <SplitBar label="League" b={abs.league} />
        <p className="text-[10px] font-mono text-stone-500 flex gap-4">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CHART_BLUE }} />Batter (called strike)</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CHART_ORANGE }} />Catcher / pitcher (called ball)</span>
        </p>
      </div>
      <BarGroup title="Overturn rate by who challenges (season)" rows={[
        { label: 'Batters', value: ovPct(abs.season.batter), text: fmtPct(ovPct(abs.season.batter)), n: abs.season.batter.n },
        { label: 'Catcher / pitcher', value: ovPct(abs.season.catcher), text: fmtPct(ovPct(abs.season.catcher)), n: abs.season.catcher.n },
        { label: 'League — batters', value: ovPct(abs.league.batter), text: fmtPct(ovPct(abs.league.batter)), league: true },
        { label: 'League — catcher / pitcher', value: ovPct(abs.league.catcher), text: fmtPct(ovPct(abs.league.catcher)), league: true },
      ]} />
      <ChallengerTable title="Catchers & pitchers who challenge" rows={catchers} />
      <ChallengerTable title="Batters who challenge" rows={batters} />
      <p className="text-[9.5px] font-mono text-stone-300">* under {MIN_ABS_N} challenges — too few to read a rate from.</p>
    </div>
  )
}

// ─── Innings ─────────────────────────────────────────────────────────────

export function InningsPanel({ club, side, abs }: { club: ScoutClub; side: 'away' | 'home'; abs: AbsClub | null }) {
  if (!abs) return <Empty club={club} side={side} />
  const rows = abs.innings.club.byInning.map((t, i) => ({ label: i === 8 ? '9th+' : `${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'}`, club: t, league: abs.innings.league.byInning[i] }))
  const groups = [
    { label: 'Innings 1–3', pick: (b: Bucket) => b.early },
    { label: 'Innings 4–6', pick: (b: Bucket) => b.mid },
    { label: 'Innings 7+', pick: (b: Bucket) => b.late },
  ]
  return (
    <div className="space-y-5">
      <ClubHeader club={club} side={side} />
      <SituationTable title="Challenges by inning" okLabel="overturned" clubTotal={abs.innings.club.total.n} leagueTotal={abs.innings.league.total.n} rows={rows} />
      <BarGroup title="Late-game tendency — inning groups" rows={groups.flatMap((g) => [
        { label: `${g.label} — ${club.abbr}`, value: pct(g.pick(abs.season).n, abs.season.all.n), text: `${fmtPct(pct(g.pick(abs.season).n, abs.season.all.n))} of its challenges · ${fmtPct(ovPct(g.pick(abs.season)))} overturned`, n: g.pick(abs.season).n },
        { label: `${g.label} — league`, value: pct(g.pick(abs.league).n, abs.league.all.n), text: `${fmtPct(pct(g.pick(abs.league).n, abs.league.all.n))} · ${fmtPct(ovPct(g.pick(abs.league)))} overturned`, league: true },
      ])} />
      <p className="text-[10px] font-sans text-stone-400 leading-relaxed">&ldquo;Share&rdquo; is the slice of the club&apos;s own challenges that came in that inning. Leverage index isn&apos;t published for challenges, so inning stands in for a late-game tendency.</p>
    </div>
  )
}

// ─── Counts & situations ─────────────────────────────────────────────────

export function SituationsPanel({ club, side, abs }: { club: ScoutClub; side: 'away' | 'home'; abs: AbsClub | null }) {
  if (!abs) return <Empty club={club} side={side} />
  const s = abs.situations
  return (
    <div className="space-y-5">
      <ClubHeader club={club} side={side} />
      {!s ? <SituationsNotLoaded what="Count and situation breakdowns" /> : (
        <>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-1.5">By ball-strike count</p>
            <CountGrid club={s.club} league={s.league} okLabel="overturned" unit="challenges" />
          </div>
          {situationTables(s.club, s.league, 'overturned', {
            title: 'By base state at the start of the at-bat',
            order: [{ key: 'empty', label: 'Bases empty' }, { key: 'on', label: 'Runner(s) on, none in scoring position' }, { key: 'risp', label: 'Runner in scoring position' }],
          })}
          <p className="text-[9.5px] font-mono text-stone-400 leading-relaxed">
            Count = the count before the challenged pitch. Score margin is from the challenging club&apos;s side. Covers {s.coverage.withSituation} of {s.coverage.total} logged challenges (rows loaded before the situation feed have no count). Rows under {MIN_SITUATION_N} are faded.
          </p>
        </>
      )}
    </div>
  )
}

// ─── Watch-fors ──────────────────────────────────────────────────────────

export function WatchPanel({ club, side, abs }: { club: ScoutClub; side: 'away' | 'home'; abs: AbsClub | null }) {
  if (!abs) return <Empty club={club} side={side} />
  return (
    <div className="space-y-3">
      <ClubHeader club={club} side={side} />
      <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
        <p className="text-[12px] font-sans font-bold text-stone-900">{abs.profile.label}</p>
      </div>
      <ul className="space-y-2">
        {abs.profile.lines.map((l) => (
          <li key={l} className="flex gap-2 text-[11.5px] font-sans text-stone-700 leading-snug"><span aria-hidden className="text-orange-400 shrink-0">◎</span>{l}</li>
        ))}
      </ul>
      <Freshness abs={abs} />
    </div>
  )
}

function BoardPanel({ abs, ctx }: { abs: AbsClub | null; ctx: ScoutContext }) {
  if (!abs) return <p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">No ABS challenge log is available yet.</p>
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-sans text-stone-600">Every club&apos;s challenge record this season. Click a column to sort; tonight&apos;s two clubs are highlighted.</p>
      <Leaderboard rows={abs.leaderboard} highlight={[ctx.away.id, ctx.home.id]} minRank={MIN_RANK_CHALLENGES} />
      <p className="text-[9.5px] font-mono text-stone-400">Overturned / batter-started / 7th+ shares are faded for clubs under {MIN_RANK_CHALLENGES} challenges. Games through {abs ? shortDate(abs.coveredThrough) : ''}.</p>
    </div>
  )
}

export default async function ABSSection({ ctx }: { ctx: ScoutContext }) {
  const [away, home] = await Promise.all([
    getAbsDesk(ctx.away.id, ctx.away.abbr, ctx.gameDate),
    getAbsDesk(ctx.home.id, ctx.home.abbr, ctx.gameDate),
  ])
  const two = (Panel: typeof RatePanel) => <Cols left={<Panel club={ctx.away} side="away" abs={away} />} right={<Panel club={ctx.home} side="home" abs={home} />} />
  return (
    <div className="space-y-4">
      <Tabs tabs={[
        { id: 'rate', label: 'Rate & success', content: two(RatePanel) },
        { id: 'board', label: 'Team leaderboard', content: <BoardPanel abs={away ?? home} ctx={ctx} /> },
        { id: 'who', label: 'Who challenges', content: two(WhoPanel) },
        { id: 'innings', label: 'Innings', content: two(InningsPanel) },
        { id: 'situations', label: 'Counts & situations', content: two(SituationsPanel) },
        { id: 'watch', label: 'Watch-fors', content: two(WatchPanel) },
      ]} />
      <p className="text-[10px] font-mono text-stone-400 leading-relaxed">
        Source: MLB&apos;s game-feed challenge log — the same ABS challenge data Baseball Savant&apos;s boards are built on — for the 2026 regular season. Rates are per game played, so games with no challenges count. This is a description of how each club has used its challenges, not a recommendation.
      </p>
    </div>
  )
}
