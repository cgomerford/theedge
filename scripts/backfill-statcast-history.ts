import { getPlayerStatcastHistory } from '../src/lib/player-statcast-history'
import { getTeamRoster, LEAGUE_BY_TEAM_ID } from '../src/lib/lab'

const TEAM_IDS = Object.keys(LEAGUE_BY_TEAM_ID).map(Number)
const CONCURRENCY = 4 // modest — each "player" here can mean up to 11 seasons of Savant CSV pulls

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function main() {
  const allPlayers: { id: number; subject: 'batter' | 'pitcher' }[] = []

  for (const teamId of TEAM_IDS) {
    const roster = await getTeamRoster(teamId)
    for (const p of roster) {
      allPlayers.push({ id: p.id, subject: p.primaryPosition === 'P' ? 'pitcher' : 'batter' })
    }
  }

  console.log(`${allPlayers.length} rostered players to backfill.`)

  let done = 0
  await mapWithConcurrency(allPlayers, CONCURRENCY, async (p) => {
    try {
      const history = await getPlayerStatcastHistory(p.id, p.subject)
      done++
      if (done % 25 === 0) console.log(`${done}/${allPlayers.length} done`)
    } catch (err) {
      console.error(`Failed for player ${p.id}:`, err)
    }
  })

  console.log('Backfill complete.')
}

main()