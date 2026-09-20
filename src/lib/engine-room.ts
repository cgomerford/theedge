// src/lib/engine-room.ts
//
// "Engine Room" — who's actually building this team's value right now, not
// a lifetime WAR leaderboard. True WAR isn't something this app can show
// honestly: it needs defensive runs and baserunning runs this app has no
// real source for, and the free MLB feed's own WAR field is unreliable /
// null for most players (see src/lib/player-stats.ts). Rather than fake
// it, this computes a narrower, fully transparent, fully real value score:
//
//   - Batting value = actual Basic Runs Created (Bill James' public
//     formula: RC = (H+BB) x TB / (AB+BB)) minus what a league-average
//     hitter would have created in that many real plate appearances, using
//     THIS season's real league-wide totals as the baseline — same
//     bulk-stats-over-per-team pattern as league-standard-stats.ts.
//   - Pitching value = (league ERA − this pitcher's ERA) x IP / 9 — real
//     runs saved vs. a real league-average pitcher.
//
// Both land in the same unit (runs), so batters and pitchers rank on one
// list without a fabricated runs-to-wins conversion.
//
// Role tags (regular / call-up / trade / signing) come from this season's
// real transactions (season-shape.ts's getTeamSeasonTransactions, shared
// with the river and leverage board). This is a simplification of "deadline
// addition" vs "IL replacement" — this app can tell a trade from a
// call-up, but not reliably *why* a call-up happened, so it doesn't guess.

import { getTeamSeasonTransactions } from './season-shape'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type PlayerRole = 'regular' | 'callup' | 'trade' | 'signing'

export type EngineRoomPlayer = {
  personId: number
  name: string
  headshot: string
  group: 'Batting' | 'Pitching'
  role: PlayerRole
  value: number // real runs above/below a real league-average baseline
  line: string
}

type Split = { stat: Record<string, string | number | undefined> }

async function getLeagueBaselines(season: number): Promise<{ leagueRCPerPA: number; leagueERA: number }> {
  const [hitRes, pitRes] = await Promise.all([
    fetch(`${MLB_API}/teams/stats?stats=season&group=hitting&sportId=1&season=${season}`),
    fetch(`${MLB_API}/teams/stats?stats=season&group=pitching&sportId=1&season=${season}`),
  ])
  if (!hitRes.ok || !pitRes.ok) return { leagueRCPerPA: 0, leagueERA: 4.0 }
  const [hitData, pitData] = await Promise.all([hitRes.json(), pitRes.json()])
  const hitSplits: Split[] = hitData.stats?.[0]?.splits ?? []
  const pitSplits: Split[] = pitData.stats?.[0]?.splits ?? []

  let totalAB = 0, totalH = 0, totalBB = 0, totalTB = 0, totalPA = 0
  for (const s of hitSplits) {
    totalAB += Number(s.stat.atBats ?? 0)
    totalH += Number(s.stat.hits ?? 0)
    totalBB += Number(s.stat.baseOnBalls ?? 0)
    totalTB += Number(s.stat.totalBases ?? 0)
    totalPA += Number(s.stat.plateAppearances ?? 0)
  }
  const leagueRC = (totalH + totalBB) * totalTB / Math.max(1, totalAB + totalBB)
  const leagueRCPerPA = totalPA > 0 ? leagueRC / totalPA : 0

  let totalIP = 0, totalER = 0
  for (const s of pitSplits) {
    totalIP += parseFloat(String(s.stat.inningsPitched ?? '0'))
    totalER += Number(s.stat.earnedRuns ?? 0)
  }
  const leagueERA = totalIP > 0 ? (totalER * 9) / totalIP : 4.0

  return { leagueRCPerPA, leagueERA }
}

type StatBlock = { group?: { displayName?: string }; splits?: { stat?: Record<string, string | number | undefined> }[] }
type RosterEntry = { person: { id: number; fullName: string; stats?: StatBlock[] } }

function classifyRoles(transactions: Awaited<ReturnType<typeof getTeamSeasonTransactions>>, teamId: number): Map<number, PlayerRole> {
  const roles = new Map<number, PlayerRole>()
  // Sorted oldest-first so a player's role reflects how they FIRST joined
  // this season (a trade acquisition later optioned/recalled is still a
  // trade acquisition, not a call-up).
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
  for (const t of sorted) {
    const pid = t.person?.id
    if (!pid || t.toTeam?.id !== teamId || roles.has(pid)) continue
    if (t.typeCode === 'TR') roles.set(pid, 'trade')
    else if (t.typeCode === 'SGN') roles.set(pid, 'signing')
    else if (t.typeCode === 'CU') roles.set(pid, 'callup')
  }
  return roles
}

export async function getEngineRoom(teamId: number, season: number): Promise<EngineRoomPlayer[]> {
  const hydrate = encodeURIComponent(`person(stats(group=[hitting,pitching],type=season,season=${season}))`)
  const [{ leagueRCPerPA, leagueERA }, rosterRes, transactions] = await Promise.all([
    getLeagueBaselines(season),
    fetch(`${MLB_API}/teams/${teamId}/roster?rosterType=fullSeason&season=${season}&hydrate=${hydrate}`),
    getTeamSeasonTransactions(teamId, season),
  ])
  if (!rosterRes.ok) return []
  const data = await rosterRes.json()
  const roster: RosterEntry[] = data.roster ?? []
  const roleByPerson = classifyRoles(transactions, teamId)

  const players: EngineRoomPlayer[] = []
  for (const r of roster) {
    const p = r.person
    const headshot = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${p.id}/headshot/67/current`
    const role = roleByPerson.get(p.id) ?? 'regular'
    const hit = p.stats?.find(s => s.group?.displayName === 'hitting')?.splits?.[0]?.stat
    const pit = p.stats?.find(s => s.group?.displayName === 'pitching')?.splits?.[0]?.stat

    if (hit) {
      const pa = Number(hit.plateAppearances ?? 0)
      const ab = Number(hit.atBats ?? 0)
      const h = Number(hit.hits ?? 0)
      const bb = Number(hit.baseOnBalls ?? 0)
      const tb = Number(hit.totalBases ?? 0)
      if (pa >= 20) {
        const rc = (h + bb) * tb / Math.max(1, ab + bb)
        const expected = leagueRCPerPA * pa
        players.push({
          personId: p.id, name: p.fullName, headshot, group: 'Batting', role,
          value: Math.round((rc - expected) * 10) / 10,
          line: `${pa} PA · ${String(hit.avg ?? '.000')} avg`,
        })
      }
    }
    if (pit) {
      const ip = parseFloat(String(pit.inningsPitched ?? '0'))
      const era = parseFloat(String(pit.era ?? '0'))
      if (ip >= 5) {
        players.push({
          personId: p.id, name: p.fullName, headshot, group: 'Pitching', role,
          value: Math.round(((leagueERA - era) * ip / 9) * 10) / 10,
          line: `${ip.toFixed(1)} IP · ${era.toFixed(2)} ERA`,
        })
      }
    }
  }

  return players.sort((a, b) => b.value - a.value)
}
