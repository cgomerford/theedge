// src/lib/team-profile/season.ts
//
// "Where is this team in its season" — everything derived from ONE MLB
// schedule call for the club (all ~162 games with final scores; curl-verified
// shape: dates[].games[] with teams.{away,home}.{team,score,isWinner},
// officialDate, dayNight, status.abstractGameState, doubleHeader).
//
// Derived here (all real, from box-score results — nothing modelled):
//   • game-by-game timeline: games over .500, rolling-10 win%, rolling-10
//     runs scored / allowed, cumulative run differential
//   • month-by-month record and run differential
//   • best / worst 10-game stretch, longest win / loss streak
//   • what's left: games remaining, home/road, divisional, and the average
//     win% of the remaining opponents (from the league table)
//
// Errors: returns null + a prefixed log; the page shows an empty state.

import { MLB_TEAMS } from '@/lib/teams'
import type { LeagueTables } from './league'

const MLB = 'https://statsapi.mlb.com/api/v1'

export type PlayedGame = {
  n: number               // 1-based game number
  date: string            // YYYY-MM-DD
  oppId: number
  oppAbbr: string
  isHome: boolean
  rs: number
  ra: number
  win: boolean
}

export type TimelinePoint = {
  n: number
  date: string
  label: string           // "@ BOS 5–3 W"
  w: number
  l: number
  over500: number         // wins − losses after this game
  win: boolean
  rollPct: number | null  // rolling-10 win% (null until 10 games)
  rollRs: number | null   // rolling-10 runs scored per game
  rollRa: number | null
  cumDiff: number
}

export type MonthRow = { key: string; label: string; w: number; l: number; rs: number; ra: number; diff: number }

export type Stretch = { record: string; from: string; to: string }

export type UpcomingGame = { date: string; oppId: number; oppAbbr: string; isHome: boolean; oppPct: number | null }

export type RemainingSchedule = {
  games: number
  home: number
  away: number
  divisional: number
  vsWinningClubs: number          // opponents currently at/above .500
  avgOppPct: number | null        // mean win% of remaining opponents (with repeats)
  leagueAvgOppPct: number | null  // mean of every club's own (opponent-weighted) figure would need all schedules; use .500 baseline instead
  upcoming: UpcomingGame[]
}

export type Bucket = { label: string; w: number; l: number }

export type SeasonAdvanced = {
  margins: Bucket[]        // wins/losses by margin of the result: 1, 2, 3, 4, 5+ runs
  runsScored: Bucket[]     // record by how many runs THEY scored: 0–2, 3–4, 5–6, 7+
  vsTier: { label: string; w: number; l: number; rs: number; ra: number }[]   // vs clubs at/above .500 today vs below
  series: { total: number; won: number; lost: number; split: number; sweeps: number; swept: number }
}

export type SeasonStory = {
  timeline: TimelinePoint[]
  monthly: MonthRow[]
  bestStretch: Stretch | null
  worstStretch: Stretch | null
  longestWin: number
  longestLoss: number
  remaining: RemainingSchedule
  advanced: SeasonAdvanced
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function short(date: string): string {
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`
}

export async function getSeasonStory(teamId: number, season: number, tables: LeagueTables | null): Promise<SeasonStory | null> {
  try {
    const res = await fetch(`${MLB}/schedule?sportId=1&teamId=${teamId}&season=${season}&gameType=R&hydrate=team`, {
      next: { revalidate: 900 }, signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      console.error('[getSeasonStory] MLB schedule error:', res.status)
      return null
    }
    const json = await res.json()
    const raw: any[] = (json.dates ?? []).flatMap((d: any) => d.games ?? [])

    const myMeta = MLB_TEAMS.find(t => t.id === teamId)
    const pctById = new Map((tables?.rows ?? []).map(r => [r.id, r.st.pct]))

    const played: PlayedGame[] = []
    const upcomingRaw: any[] = []
    for (const g of raw) {
      const isHome = g.teams?.home?.team?.id === teamId
      const me = isHome ? g.teams.home : g.teams.away
      const opp = isHome ? g.teams.away : g.teams.home
      const detailed = String(g.status?.detailedState ?? '')
      if (/postponed|cancel/i.test(detailed) && g.status?.abstractGameState !== 'Live') continue
      const done = g.status?.abstractGameState === 'Final' && me?.score != null && opp?.score != null
      if (done) {
        played.push({
          n: played.length + 1,
          date: g.officialDate ?? String(g.gameDate).slice(0, 10),
          oppId: opp.team.id,
          oppAbbr: MLB_TEAMS.find(t => t.id === opp.team.id)?.abbrev ?? opp.team.abbreviation ?? '',
          isHome, rs: Number(me.score), ra: Number(opp.score), win: Number(me.score) > Number(opp.score),
        })
      } else if (g.status?.abstractGameState !== 'Final') {
        upcomingRaw.push({ g, isHome, opp })
      }
    }
    if (played.length === 0) return null

    // ── timeline ──
    let w = 0, l = 0, cum = 0
    const timeline: TimelinePoint[] = played.map((p, i) => {
      if (p.win) w++; else l++
      cum += p.rs - p.ra
      const win10 = i >= 9 ? played.slice(i - 9, i + 1) : null
      return {
        n: p.n, date: p.date,
        label: `${p.isHome ? 'vs' : '@'} ${p.oppAbbr} ${p.rs}–${p.ra} ${p.win ? 'W' : 'L'}`,
        w, l, over500: w - l, win: p.win,
        rollPct: win10 ? win10.filter(x => x.win).length / 10 : null,
        rollRs: win10 ? win10.reduce((a, x) => a + x.rs, 0) / 10 : null,
        rollRa: win10 ? win10.reduce((a, x) => a + x.ra, 0) / 10 : null,
        cumDiff: cum,
      }
    })

    // ── months ──
    const monthMap = new Map<string, MonthRow>()
    for (const p of played) {
      const key = p.date.slice(0, 7)
      const row = monthMap.get(key) ?? { key, label: MONTHS[Number(key.slice(5)) - 1], w: 0, l: 0, rs: 0, ra: 0, diff: 0 }
      if (p.win) row.w++; else row.l++
      row.rs += p.rs; row.ra += p.ra; row.diff = row.rs - row.ra
      monthMap.set(key, row)
    }
    const monthly = [...monthMap.values()].sort((a, b) => a.key.localeCompare(b.key))

    // ── stretches + streaks ──
    let best: { wins: number; i: number } | null = null
    let worst: { wins: number; i: number } | null = null
    for (let i = 0; i + 10 <= played.length; i++) {
      const wins = played.slice(i, i + 10).filter(x => x.win).length
      if (!best || wins > best.wins) best = { wins, i }
      if (!worst || wins < worst.wins) worst = { wins, i }
    }
    const stretch = (s: { wins: number; i: number } | null): Stretch | null =>
      s ? { record: `${s.wins}–${10 - s.wins}`, from: short(played[s.i].date), to: short(played[s.i + 9].date) } : null

    let longestWin = 0, longestLoss = 0, run = 0, runWin: boolean | null = null
    for (const p of played) {
      if (runWin === p.win) run++; else { run = 1; runWin = p.win }
      if (p.win) longestWin = Math.max(longestWin, run); else longestLoss = Math.max(longestLoss, run)
    }

    // ── what's left ──
    const upcoming: UpcomingGame[] = upcomingRaw.map(({ g, isHome, opp }) => ({
      date: g.officialDate ?? String(g.gameDate).slice(0, 10),
      oppId: opp.team.id,
      oppAbbr: MLB_TEAMS.find(t => t.id === opp.team.id)?.abbrev ?? '',
      isHome, oppPct: pctById.get(opp.team.id) ?? null,
    }))
    const known = upcoming.filter(u => u.oppPct != null)
    const remaining: RemainingSchedule = {
      games: upcoming.length,
      home: upcoming.filter(u => u.isHome).length,
      away: upcoming.filter(u => !u.isHome).length,
      divisional: upcoming.filter(u => {
        const o = MLB_TEAMS.find(t => t.id === u.oppId)
        return !!o && !!myMeta && o.league === myMeta.league && o.division === myMeta.division
      }).length,
      vsWinningClubs: known.filter(u => (u.oppPct as number) >= 0.5).length,
      avgOppPct: known.length > 0 ? known.reduce((a, u) => a + (u.oppPct as number), 0) / known.length : null,
      leagueAvgOppPct: 0.5,
      upcoming: upcoming.slice(0, 12),
    }

    // ── Pro layer: derived from the same results ──
    const mk = (labels: string[]): Bucket[] => labels.map(label => ({ label, w: 0, l: 0 }))
    const margins = mk(['1 run', '2 runs', '3 runs', '4 runs', '5+ runs'])
    const runsScored = mk(['0–2 runs', '3–4 runs', '5–6 runs', '7+ runs'])
    const tiers = [
      { label: 'vs .500+ clubs', w: 0, l: 0, rs: 0, ra: 0 },
      { label: 'vs sub-.500 clubs', w: 0, l: 0, rs: 0, ra: 0 },
    ]
    for (const p of played) {
      const m = margins[Math.min(Math.abs(p.rs - p.ra), 5) - 1]
      if (p.win) m.w++; else m.l++
      const r = runsScored[p.rs <= 2 ? 0 : p.rs <= 4 ? 1 : p.rs <= 6 ? 2 : 3]
      if (p.win) r.w++; else r.l++
      const opct = pctById.get(p.oppId)
      if (opct != null) {
        const t = tiers[opct >= 0.5 ? 0 : 1]
        if (p.win) t.w++; else t.l++
        t.rs += p.rs; t.ra += p.ra
      }
    }
    // Series = consecutive games vs the same club at the same park, ≤ 2 days apart.
    const seriesList: { w: number; l: number }[] = []
    let prev: PlayedGame | null = null
    for (const p of played) {
      const gap = prev ? (new Date(p.date).getTime() - new Date(prev.date).getTime()) / 86400000 : 0
      if (!prev || prev.oppId !== p.oppId || prev.isHome !== p.isHome || gap > 2) seriesList.push({ w: 0, l: 0 })
      const cur = seriesList[seriesList.length - 1]
      if (p.win) cur.w++; else cur.l++
      prev = p
    }
    const series = {
      total: seriesList.length,
      won: seriesList.filter(s => s.w > s.l).length,
      lost: seriesList.filter(s => s.l > s.w).length,
      split: seriesList.filter(s => s.w === s.l).length,
      sweeps: seriesList.filter(s => s.l === 0 && s.w >= 2).length,
      swept: seriesList.filter(s => s.w === 0 && s.l >= 2).length,
    }

    return {
      timeline, monthly, bestStretch: stretch(best), worstStretch: stretch(worst), longestWin, longestLoss, remaining,
      advanced: { margins, runsScored, vsTier: tables ? tiers : [], series },
    }
  } catch (err) {
    console.error('[getSeasonStory]', err instanceof Error ? err.message : err)
    return null
  }
}
