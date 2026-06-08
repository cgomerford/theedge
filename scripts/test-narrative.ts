import { generateNarrative } from '../src/lib/narrative'

const testInputs = {
  home_team: 'Philadelphia Phillies',
  away_team: 'Chicago White Sox',
  edge_score: 18,
  predicted_winner: 'home' as const,
  confidence_tier: 'moderate' as const,
  venue_name: 'Citizens Bank Park',
  components: {
    starting_pitcher: 22,
    bullpen: -8,
    offense: 14,
    defense: 6,
    matchup: -12,
    park: 5,
    weather: 2,
    rest: -3,
  },
  components_raw: {
    home_pitcher: {
      player_name: 'Aaron Nola',
      era: '5.55',
      fip: '3.82',
      k_per_9: '9.4',
      whip: '1.10',
      innings_pitched: 62,
      games_played: 12,
      starts: 12,
      throws: 'R',
      pitch_types: 'Four-seam, Curveball, Changeup, Cutter',
    },
    away_pitcher: {
      player_name: 'Tyler Gilbert',
      era: '20.25',
      fip: '6.10',
      k_per_9: '6.8',
      whip: '1.31',
      innings_pitched: 4,
      games_played: 8,
      starts: 1,
      throws: 'L',
      pitch_types: 'Sinker, Slider, Changeup',
    },
    home_team: {
      wins: 34,
      losses: 30,
      runs_per_game_l30: 4.8,
      ops_l30: '0.812',
      bullpen_era: 4.28,
      bullpen_innings_yesterday: 7.7,
    },
    away_team: {
      wins: 34,
      losses: 30,
      runs_per_game_l30: 3.9,
      ops_l30: '0.721',
      bullpen_era: 3.75,
      bullpen_innings_yesterday: 4.3,
    },
    park: {
      hr_factor: 1.07,
      run_factor: 1.04,
      is_dome: false,
    },
  },

  // New V4 context fields
  series_game_number: 3,
  series_games_total: 3,
  away_series_wins: 1,
  home_series_wins: 1,
  series_runs_so_far: '23 combined runs over the first two games',

  home_pitcher_vs_opponent_era: '1.80',
  home_pitcher_vs_opponent_record: '2-0',
  away_pitcher_vs_opponent_era: null,
  away_pitcher_vs_opponent_record: null,

  away_vs_lhp_record: '8-15',
  home_vs_rhp_record: null,

  home_pitcher_last_start: '5 IP, 2 ER vs San Diego',
  away_pitcher_last_start: null,
}

async function run() {
  console.log('Calling narrative API...\n')
  const start = Date.now()
  const result = await generateNarrative(testInputs)
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  if (!result) {
    console.error('No result returned — check DRY_RUN env var and API key')
    process.exit(1)
  }

  console.log('═══ SUMMARY ═══════════════════════════════')
  console.log(result.summary)

  console.log('\n═══ FREE NARRATIVE ═════════════════════════')
  console.log(result.narrative)

  console.log('\n═══ PRO NARRATIVE ══════════════════════════')
  console.log(result.narrative_pro)

  console.log('\n═══ HOME STORIES ═══════════════════════════')
  console.table(result.home_stories)

  console.log('\n═══ AWAY STORIES ═══════════════════════════')
  console.table(result.away_stories)

  console.log('\n═══ CONTRARIAN ═════════════════════════════')
  console.log(result.contrarian)

  console.log('\n═══ PRO TAKEAWAYS ══════════════════════════')
  console.table(result.pro_takeaways)

  console.log('\n═══ COST ═══════════════════════════════════')
  console.log(`Cost: $${result.cost_usd.toFixed(5)} USD`)
  console.log(`Time: ${elapsed}s`)
  console.log(`Monthly est (200 games): $${(result.cost_usd * 200).toFixed(2)} USD`)
}

run().catch(console.error)
