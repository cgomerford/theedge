// Data for the game page's Series tab (open to all): status chips, a line-score card per played game, team totals, top performers,
// pitching usage across the series, and plain facts about what changed since the last game. Everything comes from the schedule and the game feeds.
import { mlb } from '@/lib/mlb-cockpit.server-fetch-allowed'
import { getSeriesList, getFeed, type SeriesGame, type BoxTeam, type Feed } from '@/lib/game-tabs/common'
import { getBattersData } from '@/lib/game-tabs/batters'
import { outsOf } from '@/lib/game-tabs/pitchers'
import type { CockpitCtx } from '@/components/game-cockpit/GameTabs'

type Splits = { date?: string; stat: Record<string, string | number> }[]
const N = (v: unknown) => Number(v ?? 0)

export type PlayedGame = {
  g: SeriesGame; no: number; innings: { num: number; away: number | null; home: number | null }[]
  totals: { away: { r: number; h: number; e: number }; home: { r: number; h: number; e: number } }
  decisions: { w?: string; l?: string; s?: string }
  starters: { away: { name: string; ip: string; er: number; k: number; pit: number } | null; home: { name: string; ip: string; er: number; k: number; pit: number } | null }
}
export type TeamTotals = { r: number; h: number; d: number; hr: number; bb: number; k: number; sb: number; lob: number }
export type Performer = { name: string; abbr: string; h: number; ab: number; hr: number; rbi: number; bb: number; tb: number }
export type Usage = { abbr: string; startOuts: number; startPit: number; reliefOuts: number; reliefPit: number; used: string[] }
export type SeriesData = {
  statusChip: string; nextChip: string | null; remainChip: string | null
  played: PlayedGame[]; totals: { away: TeamTotals; home: TeamTotals }; performers: Performer[]; usage: { away: Usage; home: Usage }; changed: string[]
}
const emptyTotals = (): TeamTotals => ({ r: 0, h: 0, d: 0, hr: 0, bb: 0, k: 0, sb: 0, lob: 0 })
const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '').toUpperCase()
const etTime = (utc: string) => new Date(utc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'

export async function getSeriesData(ctx: CockpitCtx): Promise<SeriesData> {
  const series = await getSeriesList(ctx.away.id, ctx.home.id, ctx.gameDate, ctx.gamePk)
  const finals = series.filter(g => g.final)
  const feeds = await Promise.all(finals.map(g => getFeed(g.gamePk)))
  const sideOf = (f: Feed | null, id: number): 'away' | 'home' | null => (f?.liveData?.boxscore?.teams?.away?.team?.id === id ? 'away' : f?.liveData?.boxscore?.teams?.home?.team?.id === id ? 'home' : null)

  const totals = { away: emptyTotals(), home: emptyTotals() }   // keyed by THIS game's away / home club (the same two clubs all series)
  const perf = new Map<number, Performer>()
  const usage: Record<'away' | 'home', Usage> = { away: { abbr: ctx.away.abbr, startOuts: 0, startPit: 0, reliefOuts: 0, reliefPit: 0, used: [] }, home: { abbr: ctx.home.abbr, startOuts: 0, startPit: 0, reliefOuts: 0, reliefPit: 0, used: [] } }
  const apps = new Map<string, { name: string; n: number }>()
  const played: PlayedGame[] = []

  finals.forEach((g, i) => {
    const f = feeds[i]; if (!f) return
    const box = f.liveData?.boxscore?.teams
    const ls = f.liveData?.linescore
    played.push({
      g, no: series.indexOf(g) + 1,
      innings: Array.from({ length: Math.max(9, ls?.innings?.length ?? 9) }, (_, k) => { const inn = ls?.innings?.[k]; return { num: k + 1, away: inn?.away?.runs ?? null, home: inn?.home?.runs ?? null } }),
      totals: { away: { r: N(ls?.teams?.away?.runs), h: N(ls?.teams?.away?.hits), e: N(ls?.teams?.away?.errors) }, home: { r: N(ls?.teams?.home?.runs), h: N(ls?.teams?.home?.hits), e: N(ls?.teams?.home?.errors) } },
      decisions: { w: f.liveData?.decisions?.winner?.fullName, l: f.liveData?.decisions?.loser?.fullName, s: f.liveData?.decisions?.save?.fullName },
      starters: (['away', 'home'] as const).reduce((acc, s) => {
        const t = box?.[s]; const id = t?.pitchers?.[0]; const p = id ? t?.players?.[`ID${id}`] : undefined
        const pit = p?.stats?.pitching
        return { ...acc, [s]: p ? { name: p.person?.fullName ?? '', ip: String(pit?.inningsPitched ?? ''), er: N(pit?.earnedRuns), k: N(pit?.strikeOuts), pit: N(pit?.numberOfPitches) } : null }
      }, { away: null, home: null } as PlayedGame['starters']),
    })
    // The two clubs: map this game's box side to the page's away / home club by team id.
    for (const club of ['away', 'home'] as const) {
      const id = ctx[club].id
      const side = sideOf(f, id); if (!side) continue
      const t: BoxTeam | undefined = box?.[side]
      const tb = t?.teamStats?.batting ?? {}
      const tt = totals[club]
      tt.r += N(tb.runs); tt.h += N(tb.hits); tt.d += N(tb.doubles); tt.hr += N(tb.homeRuns); tt.bb += N(tb.baseOnBalls); tt.k += N(tb.strikeOuts); tt.sb += N(tb.stolenBases); tt.lob += N(tb.leftOnBase)
      for (const [key, pl] of Object.entries(t?.players ?? {})) {
        const b = pl.stats?.batting
        if (b && N(b.atBats) + N(b.baseOnBalls) > 0) {
          const pid = Number(key.replace('ID', ''))
          const cur = perf.get(pid) ?? { name: pl.person?.fullName ?? '', abbr: ctx[club].abbr, h: 0, ab: 0, hr: 0, rbi: 0, bb: 0, tb: 0 }
          cur.h += N(b.hits); cur.ab += N(b.atBats); cur.hr += N(b.homeRuns); cur.rbi += N(b.rbi); cur.bb += N(b.baseOnBalls)
          cur.tb += N(b.hits) + N(b.doubles) + 2 * N(b.triples) + 3 * N(b.homeRuns)
          perf.set(pid, cur)
        }
      }
      ;(t?.pitchers ?? []).forEach((pid, idx) => {
        const pl = t?.players?.[`ID${pid}`]; const pit = pl?.stats?.pitching; if (!pit) return
        const u = usage[club]
        if (idx === 0) { u.startOuts += outsOf(pit.inningsPitched); u.startPit += N(pit.numberOfPitches) }
        else {
          u.reliefOuts += outsOf(pit.inningsPitched); u.reliefPit += N(pit.numberOfPitches)
          const k = `${club}-${pid}`; const a = apps.get(k) ?? { name: (pl.person?.fullName ?? '').split(' ').slice(-1)[0], n: 0 }; a.n += 1; apps.set(k, a)
        }
      })
    }
  })
  for (const club of ['away', 'home'] as const) usage[club].used = [...apps.entries()].filter(([k]) => k.startsWith(club)).map(([, v]) => v.n > 1 ? `${v.name} ${v.n === 2 ? 'twice' : `${v.n} times`}` : v.name)

  // Records and chips
  const wins = { away: 0, home: 0 }
  for (const p of played) { const a = N(p.g.awayScore), h = N(p.g.homeScore); const awayClub = p.g.awayId === ctx.away.id ? 'away' : 'home'; const winnerAway = a > h; const w = (winnerAway ? p.g.awayId : p.g.homeId) === ctx.away.id ? 'away' : 'home'; void awayClub; wins[w] += 1 }
  const round = series[0]?.seriesDescription ?? 'Series'
  const lead = wins.away === wins.home ? `Series tied ${wins.away}-${wins.home}` : `${wins.away > wins.home ? ctx.away.abbr : ctx.home.abbr} lead ${Math.max(wins.away, wins.home)}-${Math.min(wins.away, wins.home)}`
  const upcoming = series.filter(g => !g.final)
  const next = upcoming.find(g => g.gamePk === ctx.gamePk) ?? upcoming[0]
  const rest = upcoming.filter(g => g !== next)

  // What changed since the last played game
  const changed: string[] = []
  const prev = finals[finals.length - 1]
  if (prev && next && prev.venue && next.venue && prev.venue !== next.venue) changed.push(`Venue moves to ${next.venue}. G${series.indexOf(prev) + 1} was at ${prev.venue}.`)
  if (prev && next) {
    const b = await getBattersData(ctx, series, false)
    changed.push(...b.chips.changes.map(c => c.replace(/ \(vs G\d+\)$/, '') + '.'))
    const dayBefore = new Date(new Date(`${ctx.gameDate}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)
    if (!series.some(g => g.date === dayBefore)) changed.push(`Both bullpens had ${new Date(`${dayBefore}T12:00:00`).getDate()} ${new Date(`${dayBefore}T12:00:00`).toLocaleString('en-US', { month: 'short' })} off.`)
    const sp = [ctx.away, ctx.home].filter(t => t.pitcherId)
    const last = await Promise.all(sp.map(async t => {
      const r = await mlb<{ stats?: { splits: Splits }[] }>(`/people/${t.pitcherId}/stats?stats=gameLog&group=pitching&season=${ctx.season}&gameType=R,F,D,L,W`)
      const d = (r?.stats?.[0]?.splits ?? []).map(x => x.date ?? '').filter(Boolean).sort().pop()
      return { name: (t.pitcherName ?? '').split(' ').slice(-1)[0], d }
    }))
    const newToSeries = sp.every(t => !finals.some((_, i) => (feeds[i]?.liveData?.boxscore?.teams?.away?.pitchers?.[0] === t.pitcherId || feeds[i]?.liveData?.boxscore?.teams?.home?.pitchers?.[0] === t.pitcherId)))
    if (newToSeries && last.every(l => l.d)) changed.push(`Both starters are new to the series: ${last.map(l => `${l.name} last pitched ${new Date(`${l.d}T12:00:00`).getDate()} ${new Date(`${l.d}T12:00:00`).toLocaleString('en-US', { month: 'short' })}`).join(', ')}.`)
  }

  return {
    statusChip: `${round} · ${lead}`,
    nextChip: next ? `Next: G${series.indexOf(next) + 1} ${dayLabel(next.date)} ${etTime(next.gameDateUtc)}` : null,
    remainChip: rest.length ? rest.map(g => `G${series.indexOf(g) + 1} ${dayLabel(g.date)}${g.ifNecessary ? ' (if necessary)' : ''}`).join(' · ') + (rest.every(g => g.venue === rest[0].venue) ? `, ${rest.length > 1 ? 'both' : 'at'} ${rest[0].venue}` : '') : null,
    played, totals, performers: [...perf.values()].sort((a, b) => b.h - a.h || b.tb - a.tb).slice(0, 8), usage, changed,
  }
}
