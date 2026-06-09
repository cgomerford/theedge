import Anthropic from '@anthropic-ai/sdk'
import type { PitcherSeasonStats, PitchType, GameWeather, TeamForm } from '@/lib/mlb'
import type { EdgeScoreResult } from './edge'

// ============================================================
// V1: RULE-BASED GAMELINE + EDGE INDICATOR (unchanged)
// ============================================================
// [Keep your existing V1 code as-is — generateGameline, calculateEdge, etc.]
// ↓ I'm just replacing the V2 LLM section below ↓

// ============================================================
// V2: CONSOLIDATED LLM NARRATIVE — ONE call, free + pro output
// ============================================================

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-haiku-4-5-20251001'

import type { GameStreaks } from './streaks'

export type NarrativeInputs = {
  home_team: string
  away_team: string
  edge_score: number
  predicted_winner: 'home' | 'away'
  confidence_tier: 'strong' | 'moderate' | 'slight' | 'tossup'
  components: EdgeScoreResult['components']
  components_raw: EdgeScoreResult['components_raw']
  venue_name: string
  game_time?: string
  streaks?: GameStreaks | null

  // ── Series context (available Day 3 — null gracefully until then) ──
  series_game_number?: number | null
  series_games_total?: number | null
  away_series_wins?: number | null
  home_series_wins?: number | null
  series_runs_so_far?: string | null     // e.g. "23 combined runs in first two games"

  // ── H2H pitcher history (available Day 2) ──
  away_pitcher_vs_opponent_era?: string | null    // career ERA vs today's home team
  away_pitcher_vs_opponent_record?: string | null // e.g. "2-0"
  home_pitcher_vs_opponent_era?: string | null
  home_pitcher_vs_opponent_record?: string | null

  // ── Platoon splits (available Day 2) ──
  away_vs_lhp_record?: string | null   // e.g. "8-15" — relevant if home pitcher is LHP
  away_vs_rhp_record?: string | null
  home_vs_lhp_record?: string | null
  home_vs_rhp_record?: string | null

  // ── Last start detail (available Day 1) ──
  away_pitcher_last_start?: string | null  // e.g. "5 IP, 2 ER vs San Diego"
  home_pitcher_last_start?: string | null
}

export type NarrativeResult = {
  summary: string
  story_lead: string
  narrative: string         // FREE — short
  narrative_pro: string     // PRO — long, deeper
  home_stories: StoryItem[]
  away_stories: StoryItem[]
  contrarian: string
  pro_takeaways: ProTakeaway[]
  cost_usd: number
}

export type StoryItem = {
  stat: string
  text: string
}

export type ProTakeaway = {
  stat: string
  text: string
  edge: 'home' | 'away' | 'neutral'
}

function detectOpener(pitcher: any): boolean {
  if (!pitcher) return false
  const starts = pitcher.starts ?? 0
  const gamesPlayed = pitcher.games_played ?? 1
  const ip = pitcher.innings_pitched ?? 0
  return (
    starts <= 2 ||
    (gamesPlayed >= 5 && starts / gamesPlayed < 0.4) ||
    (gamesPlayed >= 5 && ip / gamesPlayed < 2.0)
  )
}

function openerLabel(pitcher: any): string {
  const ip = pitcher.innings_pitched ?? 0
  const games = pitcher.games_played ?? 1
  return `⚠ OPENER/BULK ARM (${pitcher.starts ?? 0} starts in ${games} apps, ${(ip / games).toFixed(1)} IP/game). Frame as short-stint arm handing off; bullpen is the real pitching story.`
}

// ── SYSTEM PROMPT — single, cached, ~3000 chars (tighter than before) ─────
const SYSTEM_PROMPT = `You are a writer for The Edge — a daily 5-minute MLB brief for analytical fans.

VOICE: Smart friend who watches every game. Conversational, specific, confident. Use real numbers; never invent.
NEVER use these words: lock, play, value bet, smash, hammer, fade, wager, can't be counted out, coin flip.

OPENER RULE: If a pitcher is flagged ⚠ OPENER/BULK ARM — don't call them "the starter" or lead with their ERA. Frame as opening 2-3 innings then handing off; the bullpen is the real story.

OUTPUT: Exactly eight XML tags, in order, nothing outside them:
<summary>...</summary>
<narrative>...</narrative>
<narrative_pro>...</narrative_pro>
<home_stories>JSON</home_stories>
<away_stories>JSON</away_stories>
<contrarian>...</contrarian>
<pro_takeaways>JSON</pro_takeaways>

CRITICAL: Close every tag. Never truncate.

═══════════════════════════════════════════
SUMMARY (≤110 chars): One headline-style pull-quote. Name the 1-2 biggest factors.
Good: "Wheeler's filthy slider vs a Cubs lineup that can't lay off breaking balls."

═══════════════════════════════════════════
NARRATIVE — FREE TIER (target 300-400 chars, EXACTLY 2 paragraphs separated by blank line):
The "5-minute read" version. Conversational, accessible.

Paragraph 1 (2-3 sentences): The matchup story. Lead with the biggest factor. Name pitcher + key stat. One supporting fact.
Paragraph 2 (2-3 sentences): What to watch. Bullpen situation, key player, or platoon angle. Close with the lean or honest toss-up.

═══════════════════════════════════════════
NARRATIVE_PRO — PRO TIER (target 900-1100 chars, EXACTLY 4 paragraphs separated by blank lines):
The GM scout report. Lead with context, go deep where free can't.

Paragraph 1 — The Scene (3-4 sentences): Set the stakes. If this is a rubber match, say so and what it means. Use series record and series run totals if provided. Name both pitchers and their roles — don't repeat what's in the free version, expand on it.

Paragraph 2 — The Sabermetric Layer (3-4 sentences): FIP vs ERA gaps, xERA, hard-hit rates, regression flags. Use H2H pitcher career stats vs today's opponent if provided — a pitcher who owns a team historically is a real signal. Reference exact splits when in the data.

Paragraph 3 — The Tactical Read (3-4 sentences): What a GM's analytics dept would flag. If platoon data is provided, name the specific mismatch (e.g. "Phillies are 8-15 vs lefties — and Gilbert opens from the left side"). Bullpen leverage, lineup vulnerabilities, park quirks. Be specific, not generic.

Paragraph 4 — The Bottom Line (2-3 sentences): The single highest-leverage moment to watch. What needs to happen for the underdog to win. Close with the honest lean or toss-up.

PRO NARRATIVE RULES:
- If SERIES data is provided — use it. Rubber matches, run totals, series momentum are all real signals.
- If H2H PITCHER data is provided — use it. Career ERA vs a specific opponent is meaningful.
- If PLATOON data is provided — build a storyline around it. Name the split and the pitcher's handedness.
- Must contain analysis NOT in the free version
- Specific stats only — never invent
- For openers: paragraphs 2-3 focus on bullpen depth and matchup specifics

═══════════════════════════════════════════
HOME_STORIES (JSON array of exactly 3): {"stat": "≤12 chars", "text": "≤80 chars"}
Story 1: home team record/form. Story 2: key player. Story 3: tactical angle (bullpen, platoon, park).
Every stat must come from the data provided.

AWAY_STORIES: Same shape, road-focused for story 1.

═══════════════════════════════════════════
CONTRARIAN (≤300 chars, 2-3 sentences): Honest counter-case to the predicted lean. FIP-ERA gaps, splits, sample-size warnings. Credible, not dramatic.

═══════════════════════════════════════════
PRO_TAKEAWAYS (JSON array of exactly 3): {"stat":"≤15 chars","text":"≤100 chars connecting pitcher trait → opposing lineup","edge":"home"|"away"|"neutral"}
Every object MUST have all three fields. Never output {"edge":"x"} alone.
Connect specific pitcher profile to specific opposing lineup weakness/strength.

═══════════════════════════════════════════
NEVER WRITE: "lock", "take X tonight", "advanced metrics suggest", "tonight's matchup", "exciting matchup awaits". Any stat not in the data.`

export async function generateNarrative(inputs: NarrativeInputs): Promise<NarrativeResult | null> {
   if (process.env.DRY_RUN === 'true') {
    console.log('DRY_RUN: skipping narrative LLM call')
    return null
  }
  try {
    const userPrompt = buildUserPrompt(inputs)

   const message = await client.messages.create({
      model: MODEL,
      max_tokens: 7000,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: '<summary>' },
      ],
    })

    const rawText = message.content[0].type === 'text' ? message.content[0].text : ''
    const text = '<summary>' + rawText

    console.log(
      `LLM CALL: in=${message.usage.input_tokens}, ` +
      `cached_read=${message.usage.cache_read_input_tokens ?? 0}, ` +
      `cached_write=${message.usage.cache_creation_input_tokens ?? 0}, ` +
      `out=${message.usage.output_tokens}`
    )

    const parsed = parseOutput(text)
    if (!parsed) {
      console.error('Failed to parse LLM output:', text.substring(0, 500))
      return null
    }

    const inputCost  = message.usage.input_tokens * 0.0000008
    const cachedCost = (message.usage.cache_read_input_tokens ?? 0) * 0.00000008
    const outputCost = message.usage.output_tokens * 0.000004
    const totalCost  = inputCost + cachedCost + outputCost

    return {
      summary:       parsed.summary,
      story_lead:    parsed.summary,
      narrative:     parsed.narrative,
      narrative_pro: parsed.narrative_pro,
      home_stories:  parsed.home_stories,
      away_stories:  parsed.away_stories,
      contrarian:    parsed.contrarian,
      pro_takeaways: parsed.pro_takeaways,
      cost_usd:      totalCost,
    }
  } catch (err) {
    console.error('LLM narrative generation failed:', err)
    return null
  }
}

function buildUserPrompt(inputs: NarrativeInputs): string {
  const { components_raw } = inputs
  const homeP = components_raw?.home_pitcher ?? null
  const awayP = components_raw?.away_pitcher ?? null
  const homeT = components_raw.home_team
  const awayT = components_raw.away_team
  const park  = components_raw.park

  const awayIsOpener = detectOpener(awayP)
  const homeIsOpener = detectOpener(homeP)

  const sortedComponents = Object.entries(inputs.components)
    .map(([key, value]) => ({ key, value, abs: Math.abs(value) }))
    .sort((a, b) => b.abs - a.abs)
    .slice(0, 4)

  const winner = inputs.predicted_winner === 'home' ? inputs.home_team : inputs.away_team
  const streakSection = inputs.streaks
    ? buildStreakSection(inputs.streaks, inputs.home_team, inputs.away_team)
    : ''

const awayH2H = inputs.away_pitcher_vs_opponent_record && inputs.away_pitcher_vs_opponent_era
    ? ` | vs ${inputs.home_team.split(' ').pop()}: ${inputs.away_pitcher_vs_opponent_record}, ${inputs.away_pitcher_vs_opponent_era} ERA career`
    : ''
  const homeH2H = inputs.home_pitcher_vs_opponent_record && inputs.home_pitcher_vs_opponent_era
    ? ` | vs ${inputs.away_team.split(' ').pop()}: ${inputs.home_pitcher_vs_opponent_record}, ${inputs.home_pitcher_vs_opponent_era} ERA career`
    : ''
  const awayLastStart = inputs.away_pitcher_last_start
    ? ` | Last start: ${inputs.away_pitcher_last_start}`
    : ''
  const homeLastStart = inputs.home_pitcher_last_start
    ? ` | Last start: ${inputs.home_pitcher_last_start}`
    : ''

  const awayPitcherLine = awayP
    ? `- ${inputs.away_team} (away): ${awayP.player_name} — ERA ${awayP.era ?? 'N/A'}, FIP ${awayP.fip ?? 'N/A'}, K/9 ${awayP.k_per_9 ?? 'N/A'}, ${awayP.innings_pitched ?? 0} IP in ${awayP.games_played ?? '?'} apps${awayH2H}${awayLastStart}${awayIsOpener ? `\n  ${openerLabel(awayP)}` : ''}`
    : `- ${inputs.away_team} (away): pitcher TBD`

  const homePitcherLine = homeP
    ? `- ${inputs.home_team} (home): ${homeP.player_name} — ERA ${homeP.era ?? 'N/A'}, FIP ${homeP.fip ?? 'N/A'}, K/9 ${homeP.k_per_9 ?? 'N/A'}, ${homeP.innings_pitched ?? 0} IP in ${homeP.games_played ?? '?'} apps${homeH2H}${homeLastStart}${homeIsOpener ? `\n  ${openerLabel(homeP)}` : ''}`
    : `- ${inputs.home_team} (home): pitcher TBD`

// ── Series context block ──
  let seriesBlock = ''
  if (inputs.series_game_number && inputs.series_games_total) {
    const awayW = inputs.away_series_wins ?? 0
    const homeW = inputs.home_series_wins ?? 0
    const isRubber = inputs.series_game_number === inputs.series_games_total && awayW === homeW
    const seriesStatus = isRubber
      ? `RUBBER MATCH — series tied ${awayW}-${homeW}`
      : `Game ${inputs.series_game_number} of ${inputs.series_games_total} (${inputs.away_team} leads ${awayW}-${homeW})`
    seriesBlock = `\nSERIES: ${seriesStatus}${inputs.series_runs_so_far ? `\nSERIES SCORING: ${inputs.series_runs_so_far}` : ''}`
  }

  // ── Platoon block ──
  const awayP_hand = awayP?.throws ?? null
  const homeP_hand = homeP?.throws ?? null
  let platoonBlock = ''
  if (homeP_hand === 'L' && inputs.away_vs_lhp_record) {
    platoonBlock = `\nPLATOON: ${inputs.away_team} is ${inputs.away_vs_lhp_record} vs LHP this season (home pitcher is lefty)`
  } else if (homeP_hand === 'R' && inputs.away_vs_rhp_record) {
    platoonBlock = `\nPLATOON: ${inputs.away_team} is ${inputs.away_vs_rhp_record} vs RHP this season`
  }
  if (awayP_hand === 'L' && inputs.home_vs_lhp_record) {
    platoonBlock += `\nPLATOON: ${inputs.home_team} is ${inputs.home_vs_lhp_record} vs LHP this season (away pitcher is lefty)`
  } else if (awayP_hand === 'R' && inputs.home_vs_rhp_record) {
    platoonBlock += `\nPLATOON: ${inputs.home_team} is ${inputs.home_vs_rhp_record} vs RHP this season`
  }

  return `GAME: ${inputs.away_team} @ ${inputs.home_team}
VENUE: ${inputs.venue_name}${park?.is_dome ? ' (dome)' : ''}
EDGE: ${inputs.edge_score >= 0 ? '+' : ''}${inputs.edge_score} (${inputs.confidence_tier}${inputs.confidence_tier !== 'tossup' ? ` to ${winner}` : ''})${seriesBlock}${platoonBlock}

TOP FACTORS:
${sortedComponents.map((c, i) => `${i + 1}. ${formatComponentName(c.key)}: ${c.value >= 0 ? '+' : ''}${c.value.toFixed(1)} ${c.value >= 0 ? `(${inputs.home_team})` : `(${inputs.away_team})`}`).join('\n')}

PITCHING:
${awayPitcherLine}
${homePitcherLine}

OFFENSE (L30):
${awayT ? `- ${inputs.away_team}: ${awayT.runs_per_game_l30?.toFixed(2) ?? 'N/A'} R/G, OPS ${awayT.ops_l30 ?? 'N/A'}` : ''}
${homeT ? `- ${inputs.home_team}: ${homeT.runs_per_game_l30?.toFixed(2) ?? 'N/A'} R/G, OPS ${homeT.ops_l30 ?? 'N/A'}` : ''}

BULLPEN:
${awayT ? `- ${inputs.away_team}: ERA ${awayT.bullpen_era?.toFixed(2) ?? 'N/A'}, ${awayT.bullpen_innings_yesterday ?? 0} IP yesterday` : ''}
${homeT ? `- ${inputs.home_team}: ERA ${homeT.bullpen_era?.toFixed(2) ?? 'N/A'}, ${homeT.bullpen_innings_yesterday ?? 0} IP yesterday` : ''}

PARK: HR factor ${park?.hr_factor ?? 1.0}, Run factor ${park?.run_factor ?? 1.0}${park?.is_dome ? ', dome' : ''}

RECORDS:
- ${inputs.home_team} (home): ${homeT?.wins ?? '?'}-${homeT?.losses ?? '?'}
- ${inputs.away_team} (away): ${awayT?.wins ?? '?'}-${awayT?.losses ?? '?'}

ARSENAL:
${homeP ? `- ${homeP.player_name}: ${homeP.pitch_types ?? 'N/A'}` : ''}
${awayP ? `- ${awayP.player_name}: ${awayP.pitch_types ?? 'N/A'}` : ''}
${streakSection}
Write all 8 tags now.`
}

function parseOutput(text: string): {
  summary: string
  narrative: string
  narrative_pro: string
  home_stories: StoryItem[]
  away_stories: StoryItem[]
  contrarian: string
  pro_takeaways: ProTakeaway[]
} | null {
  const summaryMatch       = text.match(/<summary>([\s\S]*?)<\/summary>/i)
  const narrativeMatch     = text.match(/<narrative>([\s\S]*?)<\/narrative>/i)
  const narrativeProMatch  = text.match(/<narrative_pro>([\s\S]*?)<\/narrative_pro>/i)
  const homeStoriesMatch   = text.match(/<home_stories>([\s\S]*?)<\/home_stories>/i)
  const awayStoriesMatch   = text.match(/<away_stories>([\s\S]*?)<\/away_stories>/i)
  const contrarianMatch    = text.match(/<contrarian>([\s\S]*?)<\/contrarian>/i)
  const proTakeawaysMatch  = text.match(/<pro_takeaways>([\s\S]*?)<\/pro_takeaways>/i)

 if (!summaryMatch || !narrativeMatch || !narrativeProMatch || !homeStoriesMatch || !awayStoriesMatch || !contrarianMatch || !proTakeawaysMatch) {
    console.error('FULL OUTPUT:\n', text)
    console.error('Missing tags — present:', {
      summary: !!summaryMatch,
      narrative: !!narrativeMatch,
      narrative_pro: !!narrativeProMatch,
      home_stories: !!homeStoriesMatch,
      away_stories: !!awayStoriesMatch,
      contrarian: !!contrarianMatch,
      pro_takeaways: !!proTakeawaysMatch,
    })
    return null
  }

  const summary       = summaryMatch[1].trim()
  const narrative     = narrativeMatch[1].trim()
  const narrative_pro = narrativeProMatch[1].trim()
  const contrarian    = contrarianMatch[1].trim()

  if (!summary || summary.length > 250) return null
 if (!narrative || narrative.length > 1500) return null
  if (!narrative_pro || narrative_pro.length > 3000) return null
  if (!contrarian || contrarian.length > 500) return null

  let home_stories: StoryItem[] = []
  let away_stories: StoryItem[] = []
  let pro_takeaways: ProTakeaway[] = []

  try {
    home_stories = JSON.parse(homeStoriesMatch[1].trim())
    if (!Array.isArray(home_stories) || home_stories.length !== 3) return null
  } catch { return null }

  try {
    away_stories = JSON.parse(awayStoriesMatch[1].trim())
    if (!Array.isArray(away_stories) || away_stories.length !== 3) return null
  } catch { return null }

  try {
    const rawTakeaways = JSON.parse(proTakeawaysMatch[1].trim())
    if (!Array.isArray(rawTakeaways)) return null

    // Merge orphan {"edge":"x"} objects into previous entry
    const merged: any[] = []
    for (const item of rawTakeaways) {
      if (item.stat && item.text) {
        merged.push({ ...item })
      } else if (item.edge && merged.length > 0) {
        const prev = merged[merged.length - 1]
        if (!prev.edge) prev.edge = item.edge
      }
    }

    pro_takeaways = merged.filter((t: any) => t && t.stat && t.text && t.edge)
    if (pro_takeaways.length !== 3) return null
  } catch { return null }

  return { summary, narrative, narrative_pro, home_stories, away_stories, contrarian, pro_takeaways }
}

function buildStreakSection(streaks: GameStreaks, homeTeam: string, awayTeam: string): string {
  const lines: string[] = ['', 'STREAKS:']

  if (streaks.home_pitcher) {
    const p = streaks.home_pitcher
    const bits = []
    if (p.last_3_era !== null) bits.push(`${p.last_3_era} ERA L3`)
    if (p.last_3_k_per_9 !== null) bits.push(`${p.last_3_k_per_9} K/9 L3`)
    if (p.current_scoreless_innings >= 6) bits.push(`${p.current_scoreless_innings} scoreless`)
    if (bits.length > 0) lines.push(`- ${homeTeam} ${p.player_name}: ${bits.join(', ')}`)
  }
  if (streaks.away_pitcher) {
    const p = streaks.away_pitcher
    const bits = []
    if (p.last_3_era !== null) bits.push(`${p.last_3_era} ERA L3`)
    if (p.last_3_k_per_9 !== null) bits.push(`${p.last_3_k_per_9} K/9 L3`)
    if (p.current_scoreless_innings >= 6) bits.push(`${p.current_scoreless_innings} scoreless`)
    if (bits.length > 0) lines.push(`- ${awayTeam} ${p.player_name}: ${bits.join(', ')}`)
  }

  if (streaks.home_hot_batters.length > 0) {
    lines.push(`- ${homeTeam} hot: ${streaks.home_hot_batters.slice(0, 2).map(b => `${b.player_name} (${b.streak_label})`).join(', ')}`)
  }
  if (streaks.away_hot_batters.length > 0) {
    lines.push(`- ${awayTeam} hot: ${streaks.away_hot_batters.slice(0, 2).map(b => `${b.player_name} (${b.streak_label})`).join(', ')}`)
  }

  return lines.length > 1 ? lines.join('\n') : ''
}

function formatComponentName(key: string): string {
  const map: Record<string, string> = {
    starting_pitcher: 'Starting Pitcher',
    bullpen: 'Bullpen',
    offense: 'Offense',
    defense: 'Defense',
    matchup: 'Matchup',
    park: 'Park',
    weather: 'Weather',
    rest: 'Rest',
  }
  return map[key] ?? key
}

