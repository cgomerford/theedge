// src/lib/scout/recent-work.ts
//
// What a club's pitchers have thrown lately, read straight from the box scores of the games themselves, so it covers every kind of game.
// The nightly workload table (pitcher_workload_daily, scripts/compute-pitcher-workload.ts) only reads regular-season games, so for a postseason
// game it knows nothing about the postseason. This reads:
//   · the last 7 days of ALL the club's games ending the day before this one: a postseason game early in a series is judged on the last regular-season
//     days and the postseason games together; later on the window is postseason only (whatever games fall inside the 7 days);
//   · every postseason game the club has played this season before this date, for postseason totals per pitcher.
// Per pitcher and game: pitches, outs, earned runs and batters faced (box score). Both fetches cache for 30 minutes; finished games do not change.

const MLB = 'https://statsapi.mlb.com/api/v1'
const POST_TYPES = 'F,D,L,W'

export type PitcherWork = {
  name: string
  byDate: Record<string, number>       // pitches per date inside the 7-day window
  outs: number; er: number; bf: number // the same window
  postApps: number; postPitches: number; postOuts: number; postEr: number // every postseason game this season before this one
  started: boolean                      // started any game in the window or the postseason
}
export type RecentWork = {
  dates: string[]                       // the 7 dates, oldest to newest, ending the day before the game
  players: Map<number, PitcherWork>
  windowKinds: { regular: number; postseason: number }  // how many of the club's games in the window were each kind
  postGames: number                     // postseason games the club has already played this season
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const outsOf = (ip: string | undefined): number => { if (!ip) return 0; const [w, f] = ip.split('.'); return Number(w) * 3 + Number(f ?? 0) }

type Game = { pk: number; date: string; type: string }
async function schedule(url: string): Promise<Game[]> {
  try {
    const r = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(10000) })
    if (!r.ok) return []
    const j = await r.json()
    return (j.dates ?? []).flatMap((d: { games?: { gamePk: number; officialDate?: string; gameType: string; status?: { abstractGameState?: string } }[] }) =>
      (d.games ?? []).filter(g => g.status?.abstractGameState === 'Final').map(g => ({ pk: g.gamePk, date: g.officialDate ?? '', type: g.gameType })))
  } catch (e) { console.error('[recentWork] schedule failed:', (e as Error).message); return [] }
}

type Line = { pid: number; name: string; pitches: number; outs: number; er: number; bf: number; started: boolean }
async function box(pk: number, teamId: number): Promise<Line[]> {
  try {
    const r = await fetch(`${MLB}/game/${pk}/boxscore`, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(10000) })
    if (!r.ok) return []
    const j = await r.json()
    const side = j.teams?.home?.team?.id === teamId ? j.teams.home : j.teams?.away?.team?.id === teamId ? j.teams.away : null
    if (!side) return []
    return (side.pitchers as number[] ?? []).flatMap((pid, i) => {
      const p = side.players?.[`ID${pid}`]
      const s = p?.stats?.pitching
      if (!p || !s) return []
      return [{ pid, name: p.person?.fullName ?? `#${pid}`, pitches: Number(s.numberOfPitches ?? 0), outs: Number(s.outs ?? outsOf(s.inningsPitched)), er: Number(s.earnedRuns ?? 0), bf: Number(s.battersFaced ?? 0), started: i === 0 }]
    })
  } catch (e) { console.error('[recentWork] boxscore failed:', pk, (e as Error).message); return [] }
}

export async function getRecentWork(teamId: number, gameDate: string): Promise<RecentWork> {
  const yesterday = shift(gameDate, -1)
  const dates = Array.from({ length: 7 }, (_, i) => shift(yesterday, i - 6))
  const season = gameDate.slice(0, 4)
  const [windowGames, postGames] = await Promise.all([
    schedule(`${MLB}/schedule?sportId=1&teamId=${teamId}&startDate=${dates[0]}&endDate=${yesterday}`),
    schedule(`${MLB}/schedule?sportId=1&teamId=${teamId}&season=${season}&gameType=${POST_TYPES}`),
  ])
  const postBefore = postGames.filter(g => g.date < gameDate)
  const need = new Map<number, Game>()
  for (const g of [...windowGames, ...postBefore]) need.set(g.pk, g)
  const lines = new Map<number, Line[]>()
  const list = [...need.values()]
  for (let i = 0; i < list.length; i += 6) {
    const got = await Promise.all(list.slice(i, i + 6).map(async g => [g.pk, await box(g.pk, teamId)] as const))
    for (const [pk, l] of got) lines.set(pk, l)
  }

  const players = new Map<number, PitcherWork>()
  const get = (pid: number, name: string) => {
    let e = players.get(pid)
    if (!e) { e = { name, byDate: {}, outs: 0, er: 0, bf: 0, postApps: 0, postPitches: 0, postOuts: 0, postEr: 0, started: false }; players.set(pid, e) }
    return e
  }
  for (const g of windowGames) for (const l of lines.get(g.pk) ?? []) {
    const e = get(l.pid, l.name)
    e.byDate[g.date] = (e.byDate[g.date] ?? 0) + l.pitches
    e.outs += l.outs; e.er += l.er; e.bf += l.bf
    if (l.started) e.started = true
  }
  for (const g of postBefore) for (const l of lines.get(g.pk) ?? []) {
    const e = get(l.pid, l.name)
    e.postApps += 1; e.postPitches += l.pitches; e.postOuts += l.outs; e.postEr += l.er
    if (l.started) e.started = true
  }
  return {
    dates, players,
    windowKinds: { regular: windowGames.filter(g => g.type === 'R').length, postseason: windowGames.filter(g => POST_TYPES.split(',').includes(g.type)).length },
    postGames: postBefore.length,
  }
}

