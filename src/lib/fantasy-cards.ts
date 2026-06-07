/**
 * src/lib/fantasy-cards.ts
 *
 * Generates per-player fantasy ratings for the Fantasy tab on game pages.
 * Called from /api/cron/log-predictions alongside generateNarrative().
 * Output stored as `fantasy_cards` JSONB on the edge_predictions row.
 *
 * One LLM call per game. Haiku model. System prompt cached.
 * Cost: ~$0.002/game, ~$0.03/day for a full slate.
 */

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-haiku-4-5-20251001'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FantasyVerdict = 'START' | 'SIT' | 'AVOID' | 'BENCH'

export type FantasyPitcherCard = {
  name: string
  team: string
  role: 'SP'
  rating: number          // 1–5
  verdict: FantasyVerdict
  rationale: string       // ≤ 25 words — cites real stats
  contrarian: string      // ≤ 20 words — the bear case
  proj: {
    ip: number
    k: number
    er: number
    bb: number
  }
  top_pitch: string | null // e.g. "Slider (34% whiff)"
}

export type FantasyBatterCard = {
  name: string
  team: string
  position: string
  batting_order: number | null
  rating: number
  verdict: FantasyVerdict
  rationale: string
  contrarian: string
  proj: {
    h: number
    hr: number
    rbi: number
    sb: number
  }
}

export type FantasyStackPick = {
  team: string
  players: string[]   // 2–3 names
  rationale: string   // ≤ 35 words
}

export type FantasyCards = {
  generated_at: string
  lineups_used: boolean
  pitchers: FantasyPitcherCard[]
  batters: FantasyBatterCard[]
  stack_pick: FantasyStackPick | null
}

// ─── Input shape ──────────────────────────────────────────────────────────────

export type ArsenalPitch = {
  pitch_name: string
  percentage: number
  whiff_percent: number | null
  avg_velocity: number | null
}

export type LineupBatter = {
  order: number
  name: string
  position: string
  avg?: number | null
  ops?: number | null
}

export type FantasyCardsInput = {
  home_team: string
  away_team: string
  home_abbr: string
  away_abbr: string
  edge_score: number
  confidence_tier: string
  predicted_winner: 'home' | 'away'
  venue_name: string
  lineups_confirmed: boolean
  components_raw: {
    home_pitcher?: {
      player_name?: string
      era?: number | null
      fip?: number | null
      k_per_9?: number | null
      whip?: number | null
      innings_pitched?: number | null
      last_3_era?: number | null
    } | null
    away_pitcher?: {
      player_name?: string
      era?: number | null
      fip?: number | null
      k_per_9?: number | null
      whip?: number | null
      innings_pitched?: number | null
      last_3_era?: number | null
    } | null
    home_team?: {
      bullpen_era?: number | null
      bullpen_innings_yesterday?: number | null
      closer_available?: boolean | null
      runs_per_game_l30?: number | null
      ops_l30?: number | null
    } | null
    away_team?: {
      bullpen_era?: number | null
      bullpen_innings_yesterday?: number | null
      closer_available?: boolean | null
      runs_per_game_l30?: number | null
      ops_l30?: number | null
    } | null
    park?: {
      hr_factor?: number | null
      run_factor?: number | null
      is_dome?: boolean | null
    } | null
  }
  home_arsenal?: ArsenalPitch[]
  away_arsenal?: ArsenalPitch[]
  home_lineup?: LineupBatter[]
  away_lineup?: LineupBatter[]
}

// ─── System prompt (cached) ───────────────────────────────────────────────────

const FANTASY_SYSTEM_PROMPT = `You are a fantasy baseball analyst for The Edge — a data-driven MLB brief.

VOICE: Direct, specific, no filler. Reference real stats. Short punchy sentences.
Never use betting language. Never invent stats not provided. Honest ratings — a good pitcher in a bad spot can still be SIT.

OUTPUT: Return a single XML tag with valid JSON inside. No other text.

<fantasy_cards>
{
  "pitchers": [PITCHER_OBJECT, ...],
  "batters": [BATTER_OBJECT, ...],
  "stack_pick": STACK_OBJECT or null
}
</fantasy_cards>

PITCHER OBJECT schema:
{
  "name": "Full Name",
  "team": "ABBR",
  "role": "SP",
  "rating": 1-5,
  "verdict": "START" | "SIT" | "AVOID",
  "rationale": "max 25 words citing ERA/FIP/K9/matchup/park",
  "contrarian": "max 20 words — the case against",
  "proj": { "ip": 5.2, "k": 6, "er": 2, "bb": 2 },
  "top_pitch": "Slider (31% whiff)" or null
}

BATTER OBJECT schema (top 4-5 per team when lineups provided):
{
  "name": "Full Name",
  "team": "ABBR",
  "position": "3B",
  "batting_order": 3 or null,
  "rating": 1-5,
  "verdict": "START" | "SIT" | "BENCH",
  "rationale": "max 25 words citing matchup/park/form/splits",
  "contrarian": "max 20 words — the case against",
  "proj": { "h": 1.2, "hr": 0.4, "rbi": 0.9, "sb": 0.1 }
}

STACK PICK (2-3 batters from same team to correlate in DFS):
{
  "team": "ABBR",
  "players": ["Name1", "Name2", "Name3"],
  "rationale": "max 35 words"
}

RATING SCALE:
5 = elite spot, start everywhere
4 = strong start, minor concerns
3 = viable in deeper leagues only
2 = risky, bench if alternatives exist
1 = avoid / stream elsewhere

RULES:
- IF LINEUP DATA IS PROVIDED: generate 4-5 batter cards for each team (8-10 batters total). DO NOT return empty batters array. ALSO generate a stack_pick.
- If NO lineup data: return empty batters array and null stack_pick
- Assess park factors honestly — hitter-friendly parks hurt pitchers
- Bullpen exhaustion lowers a team's save/hold upside
- K/9 matters more than ERA for SP fantasy
- Never copy exact wording between rationale and contrarian`

// ─── User prompt builder ──────────────────────────────────────────────────────

function buildPrompt(input: FantasyCardsInput): string {
  const { components_raw: cr } = input
  const homeP = cr.home_pitcher
  const awayP = cr.away_pitcher
  const homeT = cr.home_team
  const awayT = cr.away_team
  const park  = cr.park

  const fmt = (v: number | null | undefined, d = 2) =>
    v !== null && v !== undefined ? v.toFixed(d) : 'N/A'

  const pitcherLine = (
    p: typeof homeP,
    abbr: string,
    arsenal: ArsenalPitch[] | undefined
  ) => {
    if (!p?.player_name) return `${abbr}: SP not confirmed`
    const topPitch = arsenal?.[0]
      ? `${arsenal[0].pitch_name} (${fmt(arsenal[0].percentage, 0)}% usage, ${fmt(arsenal[0].whiff_percent, 0)}% whiff, ${fmt(arsenal[0].avg_velocity, 1)} mph)`
      : 'arsenal data unavailable'
    const l3 = p.last_3_era !== null && p.last_3_era !== undefined
      ? `, L3 ERA ${fmt(p.last_3_era)}`
      : ''
    return `${p.player_name} (${abbr}) — ERA ${fmt(p.era)}, FIP ${fmt(p.fip)}, K/9 ${fmt(p.k_per_9)}, WHIP ${fmt(p.whip)}${l3} | Top pitch: ${topPitch}`
  }

  const teamLine = (t: typeof homeT, name: string) => {
    if (!t) return `${name}: No data`
    const fatigue = (t.bullpen_innings_yesterday ?? 0) >= 3
      ? 'TAXED' : (t.bullpen_innings_yesterday ?? 0) >= 1 ? 'used' : 'fresh'
    return `${name} — Off: ${fmt(t.runs_per_game_l30, 1)} R/G, ${fmt(t.ops_l30, 3)} OPS | Pen ERA: ${fmt(t.bullpen_era)}, ${fmt(t.bullpen_innings_yesterday, 1)} IP yesterday (${fatigue}), closer available: ${t.closer_available ?? 'unknown'}`
  }

  const lineupLines = (lineup: LineupBatter[] | undefined, name: string) => {
    if (!lineup?.length) return `${name}: lineup not confirmed`
    return lineup.slice(0, 5).map(b => {
      const stats = [
        b.avg !== null && b.avg !== undefined ? `.${String(Math.round(b.avg * 1000)).padStart(3, '0')} AVG` : null,
        b.ops !== null && b.ops !== undefined ? `${b.ops.toFixed(3)} OPS` : null,
      ].filter(Boolean).join(', ')
      return `  ${b.order}. ${b.name} (${b.position})${stats ? ` — ${stats}` : ''}`
    }).join('\n')
  }

  return `Generate fantasy ratings for this game.

GAME: ${input.away_team} @ ${input.home_team} · ${input.venue_name}${park?.is_dome ? ' (dome)' : ''}
EDGE: ${input.edge_score >= 0 ? '+' : ''}${input.edge_score} ${input.confidence_tier} lean to ${input.predicted_winner === 'home' ? input.home_team : input.away_team}
PARK FACTORS: HR factor ${fmt(park?.hr_factor)}, Run factor ${fmt(park?.run_factor)}

STARTING PITCHERS:
${pitcherLine(awayP, input.away_abbr, input.away_arsenal)}
${pitcherLine(homeP, input.home_abbr, input.home_arsenal)}

TEAMS & BULLPENS:
${teamLine(awayT, input.away_team)}
${teamLine(homeT, input.home_team)}

LINEUPS (confirmed: ${input.lineups_confirmed}):
${input.away_team}:
${lineupLines(input.away_lineup, input.away_team)}

${input.home_team}:
${lineupLines(input.home_lineup, input.home_team)}

Return the <fantasy_cards> JSON now.`
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateFantasyCards(
  input: FantasyCardsInput
): Promise<FantasyCards | null> {
   if (process.env.DRY_RUN === 'true') {
    console.log('DRY_RUN: skipping fantasy cards LLM call')
    return null
  }

  try {
   const message = await client.messages.create({
  model: MODEL,
  max_tokens: 3500,
      system: [
        {
          type: 'text',
          text: FANTASY_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: buildPrompt(input) },
        // Prefill forces correct opening tag — same pattern as narrative.ts
        { role: 'assistant', content: '<fantasy_cards>' },
      ],
    })

    const rawText =
      message.content[0].type === 'text' ? message.content[0].text : ''
    const text = '<fantasy_cards>' + rawText

    const match = text.match(/<fantasy_cards>([\s\S]*?)<\/fantasy_cards>/)
    if (!match) {
      console.error('Fantasy cards: no XML tag in output:', text.slice(0, 300))
      return null
    }

    let parsed: { pitchers?: unknown[]; batters?: unknown[]; stack_pick?: unknown }
    try {
      parsed = JSON.parse(match[1].trim())
    } catch (parseErr) {
      console.error('Fantasy cards: JSON parse failed:', match[1].slice(0, 300))
      return null
    }


// ADD THESE TWO LINES
console.log(`Fantasy cards parsed — pitchers: ${(parsed.pitchers as any[])?.length}, batters: ${(parsed.batters as any[])?.length}`)
console.log(`Fantasy cards batters:`, JSON.stringify(parsed.batters))

return {
      generated_at: new Date().toISOString(),
      lineups_used: input.lineups_confirmed,
      pitchers: (parsed.pitchers ?? []) as FantasyPitcherCard[],
      batters:  (parsed.batters  ?? []) as FantasyBatterCard[],
      stack_pick: (parsed.stack_pick ?? null) as FantasyStackPick | null,
    }
  } catch (err) {
    console.error('generateFantasyCards error:', err)
    return null
  }
}