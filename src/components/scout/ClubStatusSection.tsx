// src/components/scout/ClubStatusSection.tsx
//
// §1 Club status desk — the whole organisation, one tab per level: MLB, Triple-A,
// Double-A. Each club's roster is a grid of headshot tiles coloured by status
// (Available / Questionable / Out — never colour alone: every tile carries a
// symbol and its reason in the tooltip), each showing when the player last played
// and his line. Below the grid: why anyone is not fully available, and (MLB) the
// last 7 days of roster moves. The minor-league tabs stream in on their own so a
// slow affiliate fetch never holds up the MLB view.
// Tiles also carry who the player is: ★ drafted by this club, a birth-country flag, and
// an EXP marker when his contract ends this season (only when contract data is loaded —
// MLB doesn't publish it). Below the grids, a "Roster makeup" block breaks the active
// roster down by handedness, hitter type (power / balanced / small ball), age, origin.

import { Suspense } from 'react'
import { getClubStatus, type AvailStatus, type ClubPlayer, type ClubStatus } from '@/lib/scout/club-status'
import { getAffiliateStatus, MINOR_LEVELS, type AffiliateStatus, type MinorPlayer } from '@/lib/scout/affiliates'
import { AGE_BUCKETS, flagFor, getRosterProfiles, makeup, MIN_TYPE_PA, POWER_ISO, SMALL_ISO, SMALL_K, SMALL_SB, type PlayerProfile, type RosterProfiles } from '@/lib/scout/roster-profile'
import { playerHeadshotUrl, teamLogoUrl } from '@/lib/mlb'
import { NEUTRAL, ShareBar } from './charts/Atoms'
import { CHART_BLUE, CHART_ORANGE } from './charts/LineChart'
import ClubHeader from './ClubHeader'
import Headshot from './Headshot'
import Tabs from './Tabs'
import type { ScoutClub, ScoutContext } from './types'

const STATUS_STYLE: Record<AvailStatus, { symbol: string; word: string; tile: string; chip: string }> = {
  available: { symbol: '●', word: 'Available', tile: 'bg-emerald-50 border-emerald-200 text-emerald-900', chip: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  questionable: { symbol: '▲', word: 'Questionable', tile: 'bg-amber-50 border-amber-300 text-amber-900', chip: 'bg-amber-50 text-amber-800 border-amber-300' },
  out: { symbol: '✕', word: 'Out', tile: 'bg-stone-100 border-stone-300 text-stone-500', chip: 'bg-stone-100 text-stone-600 border-stone-300' },
}

const CATEGORY_LABEL: Record<string, string> = {
  IL: 'Placed on IL', ACTIVATION: 'Activated', CALLUP: 'Called up', OPTION: 'Optioned', DFA: 'Designated for assignment',
  RELEASE: 'Released', OUTRIGHTED: 'Outrighted', TRADE: 'Traded', SIGNING: 'Signed', SUSPENSION: 'Suspended',
}

function surname(full: string): string {
  const parts = full.trim().split(/\s+/)
  const last = parts[parts.length - 1]
  return /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(last) && parts.length > 2 ? `${parts[parts.length - 2]} ${last}` : last
}

const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

function lastPlayedText(p: ClubPlayer): string {
  if (p.status === 'out') return p.outSince ? `Out since ${shortDate(p.outSince)}` : p.lastPlayed ? `Last played ${shortDate(p.lastPlayed)}` : 'Out'
  if (!p.lastPlayed) return 'No game in 7 days'
  const verb = p.group === 'pitcher' ? 'Pitched' : 'Played'
  return `${verb} ${shortDate(p.lastPlayed)}${p.restDays ? ` · ${p.restDays}d rest` : ''}`
}

type Who = { prof: PlayerProfile | undefined; clubAbbr: string; season: number }

function Tile({ p, logo, who }: { p: ClubPlayer & Partial<MinorPlayer>; logo: string; who?: Who }) {
  const st = STATUS_STYLE[p.status]
  const prof = who?.prof, flag = flagFor(prof?.country ?? null)
  const expiring = !!prof && prof.contractThrough === who?.season
  const detail = [lastPlayedText(p), p.lastLine, p.seasonLine].filter(Boolean).join('\n')
  return (
    <div title={`${p.name} — ${st.word}${p.reason ? `: ${p.reason}` : ''}\n${detail}${prof ? `\n${[prof.age != null ? `Age ${prof.age}` : null, prof.country, prof.draftedByClub ? `Drafted by ${who!.clubAbbr}${prof.draftYear ? ` in ${prof.draftYear}` : ''}${prof.draftRound ? ` (round ${prof.draftRound})` : ''}` : null, expiring ? `Contract ends after ${who!.season}` : null].filter(Boolean).join(' · ')}` : ''}`}
      className={`flex items-center gap-2 rounded-lg border px-1.5 py-1.5 leading-tight min-w-0 ${st.tile}`}>
      <Headshot src={playerHeadshotUrl(p.id, 96)} fallback={logo} size={30} dim={p.status === 'out'} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-sans font-semibold truncate">
          <span aria-hidden className="mr-1 text-[9px]">{st.symbol}</span><span className="sr-only">{st.word}: </span>{surname(p.name)}
          {prof?.draftedByClub && <span className="ml-1 text-[10px] text-amber-500" title={`Drafted by ${who!.clubAbbr}`}>★<span className="sr-only"> drafted by {who!.clubAbbr}</span></span>}
          {flag && <span className="ml-1 text-[10px]" title={prof?.country ?? ''} role="img" aria-label={prof?.country ?? ''}>{flag}</span>}
          {expiring && <span className="ml-1 text-[8px] font-mono font-semibold text-orange-700 bg-orange-50 border border-orange-300 rounded px-0.5" title={`Contract ends after ${who!.season}`}>EXP</span>}
          {p.on40Man && <span className="ml-1 text-[8px] font-mono font-normal border border-current rounded px-0.5 opacity-70" title="On the MLB 40-man roster">40</span>}
        </p>
        <p className="text-[9px] font-mono opacity-75 truncate"><span className="font-semibold">{p.tag ?? p.pos}</span> · {lastPlayedText(p)}</p>
        {p.lastLine && p.status !== 'out' && <p className="text-[9px] font-mono opacity-60 truncate">{p.lastLine}</p>}
      </div>
    </div>
  )
}

function Group({ title, players, logo, who }: { title: string; players: (ClubPlayer & Partial<MinorPlayer>)[]; logo: string; who?: { profiles: RosterProfiles | null; clubAbbr: string; season: number } }) {
  if (players.length === 0) return null
  const order: Record<AvailStatus, number> = { out: 0, questionable: 1, available: 2 }
  const sorted = [...players].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name))
  return (
    <div>
      <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-semibold mb-1.5">{title} · {players.length}</p>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-1.5">{sorted.map((p) => <Tile key={p.id} p={p} logo={logo} who={who ? { prof: who.profiles?.byId.get(p.id), clubAbbr: who.clubAbbr, season: who.season } : undefined} />)}</div>
    </div>
  )
}

function CountChips({ counts }: { counts: Record<AvailStatus, number> }) {
  return (
    <>
      {(['available', 'questionable', 'out'] as AvailStatus[]).map((s) => (
        <span key={s} className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md border ${STATUS_STYLE[s].chip}`}>
          <span aria-hidden>{STATUS_STYLE[s].symbol}</span> {counts[s]}<span className="sr-only"> {STATUS_STYLE[s].word}</span>
        </span>
      ))}
    </>
  )
}

function NotFullyAvailable({ players }: { players: (ClubPlayer & Partial<MinorPlayer>)[] }) {
  const flagged = players.filter((p) => p.status !== 'available').sort((a, b) => (a.status === b.status ? 0 : a.status === 'out' ? -1 : 1))
  if (flagged.length === 0) return null
  return (
    <div>
      <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-semibold mb-1.5">Not fully available</p>
      <ul className="divide-y divide-stone-100 border border-stone-100 rounded-lg overflow-hidden">
        {flagged.map((p) => (
          <li key={p.id} className="flex items-baseline gap-2 px-2.5 py-1.5 text-[11.5px] font-sans bg-white">
            <span aria-hidden className={`text-[9px] ${p.status === 'out' ? 'text-stone-500' : 'text-amber-600'}`}>{STATUS_STYLE[p.status].symbol}</span>
            <span className="font-semibold text-stone-800 shrink-0">{p.name} <span className="font-mono font-normal text-[9px] text-stone-400">{p.pos}</span></span>
            <span className="text-stone-500 truncate" title={p.reason ?? ''}>{p.reason}{p.outSince ? ` · since ${shortDate(p.outSince)}` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Roster makeup ───────────────────────────────────────────────────────

function Sub({ children }: { children: React.ReactNode }) {
  return <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-semibold mb-1">{children}</p>
}

function RosterMakeup({ club, status, profiles, season }: { club: ScoutClub; status: ClubStatus; profiles: RosterProfiles; season: number }) {
  const m = makeup(status.active, profiles.byId, season)
  if (m.hitters + m.pitchers === 0) return null
  const maxAge = Math.max(1, ...m.ages.map((a) => a.n))
  const typed = (['power', 'balanced', 'smallball'] as const).map((k) => ({ k, ...m.types[k] }))
  const names = (k: 'power' | 'smallball') => m.types[k].names.map(surname).join(', ')
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-3 space-y-3.5">
      <p className="text-[9px] font-mono uppercase tracking-widest text-stone-500 font-semibold">Roster makeup · {m.hitters} hitters, {m.pitchers} pitchers on the active roster</p>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="space-y-2.5">
          <Sub>Lefties vs righties</Sub>
          <ShareBar label="Hitters — bat" n={m.hitters} parts={[{ label: 'Left', value: m.bats.L, color: CHART_BLUE }, { label: 'Switch', value: m.bats.S, color: NEUTRAL }, { label: 'Right', value: m.bats.R, color: CHART_ORANGE }]} />
          <ShareBar label="Pitchers — throw" n={m.pitchers} parts={[{ label: 'Left', value: m.throws.L, color: CHART_BLUE }, { label: 'Right', value: m.throws.R, color: CHART_ORANGE }]} />
          <p className="text-[9.5px] font-mono text-stone-400 flex gap-3"><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: CHART_BLUE }} />L {m.bats.L + m.throws.L}</span><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: NEUTRAL }} />switch {m.bats.S}</span><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: CHART_ORANGE }} />R {m.bats.R + m.throws.R}</span></p>
        </div>

        <div className="space-y-2">
          <Sub>Power vs small ball (hitters)</Sub>
          <ShareBar label="Hitter type" n={m.hitters - m.types.few.n} parts={[{ label: 'Power', value: typed[0].n, color: CHART_BLUE }, { label: 'Balanced', value: typed[1].n, color: NEUTRAL }, { label: 'Small ball', value: typed[2].n, color: CHART_ORANGE }]} />
          <p className="text-[10px] font-sans text-stone-600 leading-snug">
            <span className="font-semibold" style={{ color: CHART_BLUE }}>Power {typed[0].n}</span>{typed[0].n > 0 ? `: ${names('power')}` : ''}
            <br /><span className="font-semibold" style={{ color: CHART_ORANGE }}>Small ball {typed[2].n}</span>{typed[2].n > 0 ? `: ${names('smallball')}` : ''}
            {m.types.few.n > 0 && <><br /><span className="text-stone-400">{m.types.few.n} with under {MIN_TYPE_PA} PA aren&apos;t typed.</span></>}
          </p>
        </div>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <div>
          <Sub>Age · hitters {m.avgAge.hitters != null ? m.avgAge.hitters.toFixed(1) : '—'} · pitchers {m.avgAge.pitchers != null ? m.avgAge.pitchers.toFixed(1) : '—'} avg</Sub>
          <ul className="space-y-1">
            {m.ages.map((a, i) => (
              <li key={AGE_BUCKETS[i].label} className="grid grid-cols-[2.6rem_1fr_1.4rem] items-center gap-2 text-[10.5px] font-mono text-stone-600">
                <span>{a.label}</span>
                <span className="h-2 rounded-[3px] bg-stone-100 overflow-hidden"><span className="block h-full rounded-[3px]" style={{ width: `${a.n > 0 ? Math.max(4, (a.n / maxAge) * 100) : 0}%`, background: CHART_BLUE }} /></span>
                <span className="text-right text-stone-500">{a.n}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <Sub>Where they come from</Sub>
          <p className="text-[11px] font-sans text-stone-700 leading-snug"><span className="text-amber-500">★</span> <span className="font-mono font-bold">{m.drafted}</span> drafted by {club.abbr} · <span className="font-mono font-bold">{m.foreign}</span> born outside the U.S.</p>
          <Sub>Contracts ending this season</Sub>
          {!profiles.contractsLoaded
            ? <p className="text-[10.5px] font-sans italic text-stone-400 leading-snug">Contract data isn&apos;t loaded — MLB doesn&apos;t publish it, so no expiring deals are flagged yet.</p>
            : m.expiring.length === 0 ? <p className="text-[11px] font-sans text-stone-500">None flagged on the active roster.</p>
            : <p className="text-[11px] font-sans text-stone-700"><span className="text-[8px] font-mono font-semibold text-orange-700 bg-orange-50 border border-orange-300 rounded px-0.5 mr-1">EXP</span>{m.expiring.map((e) => surname(e.name)).join(', ')}</p>}
        </div>
      </div>

      <p className="text-[9.5px] font-mono text-stone-400 leading-relaxed">
        Hitter type is from his season line, needs {MIN_TYPE_PA}+ PA: power = isolated power (SLG − AVG) of {POWER_ISO.toFixed(3).slice(1)} or better; small ball = under {SMALL_ISO.toFixed(3).slice(1)} with {SMALL_SB}+ steals or a strikeout rate of {SMALL_K}% or lower; balanced = the rest. ★ = the club that signed him in the draft he came out of (international signings and undrafted players have none).
      </p>
    </div>
  )
}

// ─── MLB tab ─────────────────────────────────────────────────────────────

export function MlbColumn({ club, side, status, profiles, season }: { club: ScoutClub; side: 'away' | 'home'; status: ClubStatus | null; profiles: RosterProfiles | null; season: number }) {
  if (!status || status.players.length === 0) {
    return <div><ClubHeader club={club} side={side} /><p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">Roster status is unavailable right now.</p></div>
  }
  return (
    <div className="space-y-4">
      <ClubHeader club={club} side={side}><CountChips counts={status.counts} /></ClubHeader>
      <Group title="Position players" players={status.players.filter((p) => p.group === 'hitter')} logo={teamLogoUrl(club.id)} who={{ profiles, clubAbbr: club.abbr, season }} />
      <Group title="Pitchers — probable starter + bullpen" players={status.players.filter((p) => p.group === 'pitcher')} logo={teamLogoUrl(club.id)} who={{ profiles, clubAbbr: club.abbr, season }} />
      {profiles && <RosterMakeup club={club} status={status} profiles={profiles} season={season} />}
      <NotFullyAvailable players={status.players} />
      <div>
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-semibold mb-1.5">Roster moves · last 7 days</p>
        {status.transactions.length === 0 ? (
          <p className="text-[11.5px] font-sans italic text-stone-400">No roster moves in the last 7 days.</p>
        ) : (
          <ul className="space-y-1">
            {status.transactions.slice(0, 8).map((t) => (
              <li key={t.transaction_id} className="flex items-baseline gap-2 text-[11.5px] font-sans">
                <span className="font-mono text-[10px] text-stone-400 w-9 shrink-0">{shortDate(t.transaction_date)}</span>
                <span aria-hidden className="text-[10px] text-stone-400">{t.effect === 'added' ? '↑' : t.effect === 'removed' ? '↓' : '·'}</span>
                <span className="text-stone-700"><span className="font-semibold">{t.player_name}</span> — {CATEGORY_LABEL[t.category] ?? t.category}{t.injury_reason ? ` (${t.injury_reason})` : ''}</span>
              </li>
            ))}
          </ul>
        )}
        {status.omittedStarters > 0 && <p className="text-[10px] font-mono text-stone-400 mt-2">{status.omittedStarters} other starters not shown — not available tonight.</p>}
      </div>
    </div>
  )
}

// ─── Minor-league tabs ───────────────────────────────────────────────────

function MinorColumn({ club, side, aff, levelLabel }: { club: ScoutClub; side: 'away' | 'home'; aff: AffiliateStatus | null; levelLabel: string }) {
  if (!aff) {
    return <div><ClubHeader club={club} side={side} /><p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">No {levelLabel} roster is available for {club.abbr}.</p></div>
  }
  return (
    <div className="space-y-4">
      <ClubHeader club={club} side={side}><CountChips counts={aff.counts} /></ClubHeader>
      <p className="text-[11px] font-sans text-stone-600 -mt-1">
        <span className="font-semibold text-stone-800">{aff.name}</span>
        <span className="font-mono text-[10px] text-stone-400"> · {levelLabel} · {aff.lastGameDate ? `last game ${shortDate(aff.lastGameDate)}` : 'no recent games'}</span>
      </p>
      <Group title="Position players" players={aff.players.filter((p) => p.group === 'hitter')} logo={teamLogoUrl(club.id)} />
      <Group title="Pitchers" players={aff.players.filter((p) => p.group === 'pitcher')} logo={teamLogoUrl(club.id)} />
      <NotFullyAvailable players={aff.players} />
    </div>
  )
}

async function MinorLevelTab({ ctx, sportId, label, on40 }: { ctx: ScoutContext; sportId: number; label: string; on40: { away: Set<number>; home: Set<number> } }) {
  const [away, home] = await Promise.all([
    getAffiliateStatus(ctx.away.id, sportId, ctx.gameDate, on40.away).catch(() => null),
    getAffiliateStatus(ctx.home.id, sportId, ctx.gameDate, on40.home).catch(() => null),
  ])
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-stone-100">
      <MinorColumn club={ctx.away} side="away" aff={away} levelLabel={label} />
      <div className="lg:pl-6"><MinorColumn club={ctx.home} side="home" aff={home} levelLabel={label} /></div>
    </div>
  )
}

function TabSkeleton() {
  return <div className="animate-pulse grid gap-6 lg:grid-cols-2" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-48 rounded-xl bg-stone-50" />)}</div>
}

export default async function ClubStatusSection({ ctx }: { ctx: ScoutContext }) {
  const [away, home] = await Promise.all([
    getClubStatus(ctx.away.id, ctx.gameDate, ctx.gamePk, ctx.away.probableId).catch(() => null),
    getClubStatus(ctx.home.id, ctx.gameDate, ctx.gamePk, ctx.home.probableId).catch(() => null),
  ])
  const on40 = { away: new Set(away?.roster40Ids ?? []), home: new Set(home?.roster40Ids ?? []) }
  // who they are (draft club, birth country, age, hands, hitter type) — one batched call per club
  const season = Number(ctx.gameDate.slice(0, 4))
  const [awayProf, homeProf] = await Promise.all([
    away ? getRosterProfiles(ctx.away.id, away.roster40Ids, ctx.gameDate).catch(() => null) : Promise.resolve(null),
    home ? getRosterProfiles(ctx.home.id, home.roster40Ids, ctx.gameDate).catch(() => null) : Promise.resolve(null),
  ])

  const tabs = [
    {
      id: 'mlb', label: 'MLB club',
      content: (
        <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-stone-100">
          <MlbColumn club={ctx.away} side="away" status={away} profiles={awayProf} season={season} />
          <div className="lg:pl-6"><MlbColumn club={ctx.home} side="home" status={home} profiles={homeProf} season={season} /></div>
        </div>
      ),
    },
    ...MINOR_LEVELS.map((lvl) => ({
      id: `level-${lvl.sportId}`, label: lvl.label,
      content: <Suspense fallback={<TabSkeleton />}><MinorLevelTab ctx={ctx} sportId={lvl.sportId} label={lvl.label} on40={on40} /></Suspense>,
    })),
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-stone-500">
        {(['available', 'questionable', 'out'] as AvailStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5"><span aria-hidden>{STATUS_STYLE[s].symbol}</span>{STATUS_STYLE[s].word}</span>
        ))}
        <span className="text-stone-400">· each tile shows when the player last played and his line · 40 = on the MLB 40-man roster · <span className="text-amber-500">★</span> drafted by the club · flag = birth country · EXP = contract ends this season</span>
      </div>
      <Tabs tabs={tabs} />
      <p className="text-[10px] font-mono text-stone-400 leading-relaxed">
        Out = injured list, development list or suspended per the MLB roster. Questionable is derived, not reported: back from the IL within 5 days, a regular (5+ of the last 7 starts) missing from a posted lineup, an arm with a heavy recent workload, or an MLB player on a rehab assignment. Last-played dates cover the last 7 games.
      </p>
    </div>
  )
}
