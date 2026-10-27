// Data for the team page: record, run differential, division place, leaders (50 PA / 50 BF minimums), next game with probables,
// park, and the staff's pitch mix. MLB Stats API (cached 5 minutes) plus the stored arsenal table.
import { mlb } from '@/lib/mlb-cockpit.server-fetch-allowed'
import { createAdminClient } from '@/lib/supabase'
import { getParkIndex, type ParkIndex } from '@/lib/park-index'
import { slugifyGame } from '@/lib/mlb'
import { PITCH_NAME } from '@/lib/lab/pitch-meta'

const N = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export type TeamBits = {
  record: { w: number; l: number; rs: number; ra: number; diff: number; divRank: number; gb: string; division: string; lastTen: string | null; home: string | null; road: string | null; games: number } | null
  batters: { id: number; name: string; ops: number; hr: number; pa: number }[]
  pitchers: { id: number; name: string; era: number; kpct: number; ip: string; bf: number }[]
  next: { gamePk: number; slug: string; opp: string; home: boolean; whenUtc: string; venue: string; away: { name: string | null }; homeP: { name: string | null }; awayTeam: string; homeTeam: string } | null
  park: ParkIndex | null
  mix: { code: string; name: string; pct: number }[]; mixPitches: number
}

type Standings = { records?: { division?: { name?: string }; teamRecords: { team: { id: number }; wins: number; losses: number; runsScored: number; runsAllowed: number; runDifferential: number; divisionRank: string; gamesBack: string; records?: { splitRecords?: { type: string; wins: number; losses: number }[] } }[] }[] }
type Players = { stats?: { splits: { player: { id: number; fullName: string }; stat: Record<string, string | number> }[] }[] }
type Sched = { dates?: { games: { gamePk: number; gameDate: string; officialDate?: string; status?: { abstractGameState?: string }; venue?: { id?: number; name?: string }; teams: { away: { team: { id: number; name: string }; probablePitcher?: { fullName: string } }; home: { team: { id: number; name: string }; probablePitcher?: { fullName: string } } } }[] }[] }

export async function getTeamBits(teamId: number, season: number, venueId: number | null): Promise<TeamBits> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const end = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10)
  const [stand, hit, pit, sched, park] = await Promise.all([
    mlb<Standings>(`/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason&hydrate=division`),
    mlb<Players>(`/stats?stats=season&group=hitting&sportId=1&season=${season}&teamId=${teamId}&playerPool=ALL&limit=60`),
    mlb<Players>(`/stats?stats=season&group=pitching&sportId=1&season=${season}&teamId=${teamId}&playerPool=ALL&limit=60`),
    mlb<Sched>(`/schedule?sportId=1&teamId=${teamId}&startDate=${today}&endDate=${end}&hydrate=probablePitcher,team,venue`),
    getParkIndex(venueId),
  ])
  let record: TeamBits['record'] = null
  for (const d of stand?.records ?? []) for (const t of d.teamRecords) if (t.team.id === teamId) {
    const sp = t.records?.splitRecords ?? [], pick = (k: string) => { const r = sp.find(x => x.type === k); return r ? `${r.wins}-${r.losses}` : null }
    record = { w: t.wins, l: t.losses, rs: t.runsScored, ra: t.runsAllowed, diff: t.runDifferential, divRank: Number(t.divisionRank), gb: t.gamesBack, division: d.division?.name ?? '', lastTen: pick('lastTen'), home: pick('home'), road: pick('away'), games: t.wins + t.losses }
  }
  const batters = (hit?.stats?.[0]?.splits ?? []).map(s => ({ id: s.player.id, name: s.player.fullName, ops: N(s.stat.ops), hr: Number(s.stat.homeRuns ?? 0), pa: Number(s.stat.plateAppearances ?? 0) }))
    .filter((b): b is { id: number; name: string; ops: number; hr: number; pa: number } => b.ops != null && b.pa >= 50)
  const pitchers = (pit?.stats?.[0]?.splits ?? []).map(s => { const bf = Number(s.stat.battersFaced ?? 0); return { id: s.player.id, name: s.player.fullName, era: N(s.stat.era), kpct: bf > 0 ? (Number(s.stat.strikeOuts ?? 0) / bf) * 100 : null, ip: String(s.stat.inningsPitched ?? ''), bf } })
    .filter((p): p is { id: number; name: string; era: number; kpct: number; ip: string; bf: number } => p.era != null && p.kpct != null && p.bf >= 50)

  const g = (sched?.dates ?? []).flatMap(d => d.games).find(x => x.status?.abstractGameState !== 'Final')
  const next = g ? {
    gamePk: g.gamePk, slug: slugifyGame({ gamePk: g.gamePk, gameDate: g.gameDate, officialDate: g.officialDate, status: { detailedState: '', abstractGameState: '' }, teams: { away: { team: g.teams.away.team }, home: { team: g.teams.home.team } }, venue: { name: '' } }),
    opp: g.teams.home.team.id === teamId ? g.teams.away.team.name : g.teams.home.team.name, home: g.teams.home.team.id === teamId, whenUtc: g.gameDate, venue: g.venue?.name ?? '',
    away: { name: g.teams.away.probablePitcher?.fullName ?? null }, homeP: { name: g.teams.home.probablePitcher?.fullName ?? null }, awayTeam: g.teams.away.team.name, homeTeam: g.teams.home.team.name,
  } : null

  // Staff pitch mix: each pitcher's usage weighted by his pitches. The arsenal table's team_id is empty, so the club's pitchers come from its roster stats.
  const ids = (pit?.stats?.[0]?.splits ?? []).map(s => s.player.id)
  const arsenal = ids.length ? await createAdminClient().from('pitcher_zone_arsenal').select('total_pitches, arsenal').in('player_id', ids).eq('season', season).eq('split', 'all') : { data: [] as unknown[] }
  const tot = new Map<string, number>(); let all = 0
  for (const row of (arsenal.data ?? []) as { total_pitches: number | string; arsenal: Record<string, { usage_pct: number | null }> }[]) {
    const n = Number(row.total_pitches ?? 0)
    for (const [code, p] of Object.entries(row.arsenal ?? {})) { const c = (Number(p.usage_pct ?? 0) / 100) * n; tot.set(code, (tot.get(code) ?? 0) + c) }
    all += n
  }
  const mix = [...tot.entries()].map(([code, c]) => ({ code, name: PITCH_NAME[code] ?? code, pct: all ? (c / all) * 100 : 0 })).filter(m => m.pct >= 1).sort((a, b) => b.pct - a.pct)

  return { record, batters: batters.sort((a, b) => b.ops - a.ops).slice(0, 5), pitchers: pitchers.sort((a, b) => a.era - b.era).slice(0, 5), next, park, mix, mixPitches: all }
}
