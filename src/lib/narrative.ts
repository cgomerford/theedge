import Anthropic from '@anthropic-ai/sdk'
import type { PitcherSeasonStats, PitchType, GameWeather, TeamForm } from '@/lib/mlb'
import type { EdgeScoreResult } from './edge'

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
  series_game_number?: number | null
  series_games_total?: number | null
  away_series_wins?: number | null
  home_series_wins?: number | null
  series_runs_so_far?: string | null
  away_pitcher_vs_opponent_era?: string | null
  away_pitcher_vs_opponent_record?: string | null
  home_pitcher_vs_opponent_era?: string | null
  home_pitcher_vs_opponent_record?: string | null
  away_vs_lhp_record?: string | null
  away_vs_rhp_record?: string | null
  home_vs_lhp_record?: string | null
  home_vs_rhp_record?: string | null
  away_pitcher_last_start?: string | null
  home_pitcher_last_start?: string | null
}

export type NarrativeResult = {
  summary: string
  story_lead: string
  narrative: string
  narrative_pro: string
  home_stories: StoryItem[]
  away_stories: StoryItem[]
  contrarian: string
  pro_takeaways: ProTakeaway[]
  cost_usd: number
}

export type StoryItem = { stat: string; text: string }
export type ProTakeaway = { stat: string; text: string; edge: 'home' | 'away' | 'neutral' }

function detectOpener(pitcher: any): boolean {
  if (!pitcher) return false
  const starts = pitcher.starts ?? 0
  const gamesPlayed = pitcher.games_played ?? 1
  const ip = pitcher.innings_pitched ?? 0
  return starts <= 2 || (gamesPlayed >= 5 && starts / gamesPlayed < 0.4) || (gamesPlayed >= 5 && ip / gamesPlayed < 2.0)
}

function openerLabel(pitcher: any): string {
  const ip = pitcher.innings_pitched ?? 0
  const games = pitcher.games_played ?? 1
  return `⚠ OPENER/BULK ARM (${pitcher.starts ?? 0} starts in ${games} apps, ${(ip / games).toFixed(1)} IP/game). Frame as short-stint arm handing off; bullpen is the real pitching story.`
}

// ── Converts raw component score to a descriptive label ─────────────────────
// Prevents raw numbers like "+9.7" or "-28.0" leaking into narratives
function componentLabel(key: string, value: number, homeTeam: string, awayTeam: string): string {
  const abs = Math.abs(value)
  const favours = value >= 0 ? homeTeam : awayTeam
  const strength = abs >= 30 ? 'clear' : abs >= 15 ? 'meaningful' : abs >= 5 ? 'slight' : 'even'

  switch (key) {
    case 'starting_pitcher':
      return abs < 5 ? `Starting pitcher matchup roughly even` : `Starting pitcher edge to ${favours} (${strength})`
    case 'bullpen':
      return abs < 5 ? `Bullpen situation roughly even` : `Bullpen edge to ${favours} (${strength})`
    case 'offense':
      return abs < 5 ? `Offensive output roughly even L30` : `Offensive edge to ${favours} over L30 (${strength})`
    case 'defense':
      // Never expose score — describe using real defensive concepts
      return abs < 5 ? `Defensive metrics roughly even` : `Defensive edge to ${favours} based on range/OAA metrics (${strength})`
    case 'matchup':
      return abs < 5 ? `Arsenal vs lineup matchup roughly neutral` : `Pitch-type matchup edge to ${favours} (${strength})`
    case 'park':
      return abs < 5 ? `Park factor neutral` : `Park factor favours ${favours} (${strength})`
    case 'weather':
      return abs < 5 ? `Weather conditions neutral` : `Weather favours ${favours} (${strength})`
    case 'rest':
      return abs < 5 ? `Rest and travel even` : `Rest/travel edge to ${favours} (${strength})`
    default:
      return `${formatComponentName(key)}: edge to ${favours} (${strength})`
  }
}

const SYSTEM_PROMPT = `You are the analytics voice of The Edge — a daily MLB brief for fans who want to watch smarter.

VOICE: You're a GM talking to a smart friend before the game. Like a scout who watched film last night. Specific, confident, conversational — not a stat dump. You lead with the story, not the numbers. Numbers support the point; they don't replace it.

BAD EXAMPLE:
"Baltimore's offense (+9.7) and Brandon Young's recent form (2.43 ERA L3) vs. Seattle's defense (-28.0) — Orioles lean."

GOOD EXAMPLE:
"Young has been genuinely sharp lately — 2.43 ERA over his last three starts and getting weak contact. The question is whether Baltimore's pen can hold a lead if he runs into trouble early. Seattle's defence is elite in the outfield, which matters in a tight game, but their pen threw a lot of innings yesterday and that's the vulnerability worth watching."

BAD: "The defense component favours Seattle (-28.0)."
GOOD: "Seattle's outfield is top-5 in OAA this season — they turn hits into outs at a rate most teams can't match."

DEFENSE RULE: Talk about OAA, range, errors, outfield routes. Never mention a "defense component score" or any number attached to defense as a category.

NEVER USE: lock, play, value bet, smash, hammer, fade, wager, coin flip, exciting matchup awaits, advanced metrics suggest, tonight's matchup presents.
NEVER output raw component scores like "+9.7" or "-28.0".
NEVER invent stats. Only use what's in the data provided.

OPENER RULE: If flagged ⚠ OPENER/BULK ARM — frame as opening 2-3 innings then handing off. Never call them "the starter."

OUTPUT: Exactly seven XML tags in order, nothing outside them:
<summary>...</summary>
<narrative>...</narrative>
<narrative_pro>...</narrative_pro>
<home_stories>JSON</home_stories>
<away_stories>JSON</away_stories>
<contrarian>...</contrarian>
<pro_takeaways>JSON</pro_takeaways>

CRITICAL: Close every tag. Never truncate.

═══════════════════════════════════════════
SUMMARY (≤110 chars): One headline pull-quote. Name the 1-2 biggest factors. No raw scores.
Good: "Wheeler's slider vs a Cubs lineup that can't lay off breaking balls."

═══════════════════════════════════════════
NARRATIVE — FREE (300-400 chars, exactly 2 paragraphs, blank line between):

Para 1 (2-3 sentences): The matchup story. Lead with the biggest edge. Name the pitcher and one key stat that tells the story — not a list of stats, one stat that means something tonight.
Para 2 (2-3 sentences): What to watch. Bullpen situation, key at-bat, or platoon angle. Sound like you're texting a smart friend before first pitch. Close with the lean or honest toss-up.

═══════════════════════════════════════════
NARRATIVE_PRO — PRO (900-1100 chars, exactly 4 paragraphs, blank line between):
The scout report. Like a pre-game briefing from your analytics department.

Para 1 — The Setup (3-4 sentences): Frame the game. If it's a rubber match say what's at stake. Name both pitchers — the story of this specific game, not generic matchup language.

Para 2 — The Sabermetric Layer (3-4 sentences): Go where the free version can't. FIP vs ERA gaps. xERA. Hard-hit rates. If H2H pitcher data is provided use it — a pitcher who owns a team historically is a real signal. Say what the numbers actually mean for tonight.

Para 3 — The Tactical Read (3-4 sentences): What a smart GM would flag. If platoon data is provided name the mismatch specifically. Bullpen availability. Lineup vulnerabilities. Park quirks that matter for these two offences. Say things the broadcast won't.

Para 4 — Bottom Line (2-3 sentences): The single highest-leverage moment to watch. What has to happen for the underdog. Clear lean or honest toss-up — no hedging.

PRO RULES:
- Series data → use it. Rubber matches and run totals are real signals.
- H2H pitcher data → use it. Career ERA vs a specific opponent matters.
- Platoon data → build a storyline. Name the split and the pitcher's handedness.
- Must contain analysis not in the free version.
- Specific stats only — never invent.

═══════════════════════════════════════════
HOME_STORIES (JSON, exactly 3): {"stat":"≤12 chars","text":"≤80 chars"}
Story 1: home record/form. Story 2: key player. Story 3: tactical angle.
Stats must come from the data provided.

AWAY_STORIES: Same shape, road-focused for story 1.

═══════════════════════════════════════════
CONTRARIAN (≤300 chars, 2-3 sentences): Honest counter to the predicted lean. FIP-ERA gaps, splits, sample warnings. Credible, not dramatic.

═══════════════════════════════════════════
PRO_TAKEAWAYS (JSON, exactly 3): {"stat":"≤15 chars","text":"≤100 chars connecting pitcher trait to opposing lineup","edge":"home"|"away"|"neutral"}
Every object must have all three fields.`

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
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
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

    return {
      summary:       parsed.summary,
      story_lead:    parsed.summary,
      narrative:     parsed.narrative,
      narrative_pro: parsed.narrative_pro,
      home_stories:  parsed.home_stories,
      away_stories:  parsed.away_stories,
      contrarian:    parsed.contrarian,
      pro_takeaways: parsed.pro_takeaways,
      cost_usd:      inputCost + cachedCost + outputCost,
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

  // Top factors as descriptive labels — no raw scores
  const sortedComponents = Object.entries(inputs.components)
    .map(([key, value]) => ({ key, value, abs: Math.abs(value) }))
    .sort((a, b) => b.abs - a.abs)
    .slice(0, 4)

  const winner = inputs.predicted_winner === 'home' ? inputs.home_team : inputs.away_team

  const awayH2H = inputs.away_pitcher_vs_opponent_record && inputs.away_pitcher_vs_opponent_era
    ? ` | vs ${inputs.home_team.split(' ').pop()}: ${inputs.away_pitcher_vs_opponent_record}, ${inputs.away_pitcher_vs_opponent_era} ERA career` : ''
  const homeH2H = inputs.home_pitcher_vs_opponent_record && inputs.home_pitcher_vs_opponent_era
    ? ` | vs ${inputs.away_team.split(' ').pop()}: ${inputs.home_pitcher_vs_opponent_record}, ${inputs.home_pitcher_vs_opponent_era} ERA career` : ''
  const awayLastStart = inputs.away_pitcher_last_start ? ` | Last start: ${inputs.away_pitcher_last_start}` : ''
  const homeLastStart = inputs.home_pitcher_last_start ? ` | Last start: ${inputs.home_pitcher_last_start}` : ''

  const awayPitcherLine = awayP
    ? `- ${inputs.away_team} (away): ${awayP.player_name} — ERA ${awayP.era ?? 'N/A'}, FIP ${awayP.fip ?? 'N/A'}, K/9 ${awayP.k_per_9 ?? 'N/A'}, ${awayP.innings_pitched ?? 0} IP in ${awayP.games_played ?? '?'} apps${awayH2H}${awayLastStart}${awayIsOpener ? `\n  ${openerLabel(awayP)}` : ''}`
    : `- ${inputs.away_team} (away): pitcher TBD`

  const homePitcherLine = homeP
    ? `- ${inputs.home_team} (home): ${homeP.player_name} — ERA ${homeP.era ?? 'N/A'}, FIP ${homeP.fip ?? 'N/A'}, K/9 ${homeP.k_per_9 ?? 'N/A'}, ${homeP.innings_pitched ?? 0} IP in ${homeP.games_played ?? '?'} apps${homeH2H}${homeLastStart}${homeIsOpener ? `\n  ${openerLabel(homeP)}` : ''}`
    : `- ${inputs.home_team} (home): pitcher TBD`

  // Defense: pass real metrics only, never the component score
  const awayDefense = awayT?.oaa != null
    ? `OAA ${awayT.oaa > 0 ? '+' : ''}${awayT.oaa}`
    : awayT?.errors_l30 != null ? `${awayT.errors_l30} errors L30` : 'no data'
  const homeDefense = homeT?.oaa != null
    ? `OAA ${homeT.oaa > 0 ? '+' : ''}${homeT.oaa}`
    : homeT?.errors_l30 != null ? `${homeT.errors_l30} errors L30` : 'no data'

  // Series context
  let seriesBlock = ''
  if (inputs.series_game_number && inputs.series_games_total) {
    const awayW = inputs.away_series_wins ?? 0
    const homeW = inputs.home_series_wins ?? 0
    const isRubber = inputs.series_game_number === inputs.series_games_total && awayW === homeW
    seriesBlock = `\nSERIES: ${isRubber ? `RUBBER MATCH — tied ${awayW}-${homeW}` : `Game ${inputs.series_game_number} of ${inputs.series_games_total} (${inputs.away_team} leads ${awayW}-${homeW})`}${inputs.series_runs_so_far ? `\nSERIES SCORING: ${inputs.series_runs_so_far}` : ''}`
  }

  // Platoon block
  const awayP_hand = awayP?.throws ?? null
  const homeP_hand = homeP?.throws ?? null
  let platoonBlock = ''
  if (homeP_hand === 'L' && inputs.away_vs_lhp_record) platoonBlock = `\nPLATOON: ${inputs.away_team} is ${inputs.away_vs_lhp_record} vs LHP (home pitcher is lefty)`
  else if (homeP_hand === 'R' && inputs.away_vs_rhp_record) platoonBlock = `\nPLATOON: ${inputs.away_team} is ${inputs.away_vs_rhp_record} vs RHP`
  if (awayP_hand === 'L' && inputs.home_vs_lhp_record) platoonBlock += `\nPLATOON: ${inputs.home_team} is ${inputs.home_vs_lhp_record} vs LHP (away pitcher is lefty)`
  else if (awayP_hand === 'R' && inputs.home_vs_rhp_record) platoonBlock += `\nPLATOON: ${inputs.home_team} is ${inputs.home_vs_rhp_record} vs RHP`

  const streakSection = inputs.streaks ? buildStreakSection(inputs.streaks, inputs.home_team, inputs.away_team) : ''

  return `GAME: ${inputs.away_team} @ ${inputs.home_team}
VENUE: ${inputs.venue_name}${park?.is_dome ? ' (dome)' : ''}
LEAN: ${inputs.confidence_tier !== 'tossup' ? `${inputs.confidence_tier} lean to ${winner}` : 'toss-up'}${seriesBlock}${platoonBlock}

KEY FACTORS (use these to shape your narrative — do not output the labels verbatim or include any numeric scores):
${sortedComponents.map((c, i) => `${i + 1}. ${componentLabel(c.key, c.value, inputs.home_team, inputs.away_team)}`).join('\n')}

PITCHING:
${awayPitcherLine}
${homePitcherLine}

OFFENSE (L30):
${awayT ? `- ${inputs.away_team}: ${awayT.runs_per_game_l30?.toFixed(2) ?? 'N/A'} R/G, OPS ${awayT.ops_l30 ?? 'N/A'}` : ''}
${homeT ? `- ${inputs.home_team}: ${homeT.runs_per_game_l30?.toFixed(2) ?? 'N/A'} R/G, OPS ${homeT.ops_l30 ?? 'N/A'}` : ''}

DEFENSE:
- ${inputs.away_team}: ${awayDefense}
- ${inputs.home_team}: ${homeDefense}

BULLPEN:
${awayT ? `- ${inputs.away_team}: ERA ${awayT.bullpen_era?.toFixed(2) ?? 'N/A'}, ${awayT.bullpen_innings_yesterday ?? 0} IP yesterday` : ''}
${homeT ? `- ${inputs.home_team}: ERA ${homeT.bullpen_era?.toFixed(2) ?? 'N/A'}, ${homeT.bullpen_innings_yesterday ?? 0} IP yesterday` : ''}

PARK: HR factor ${park?.hr_factor ?? 1.0}, Run factor ${park?.run_factor ?? 1.0}${park?.is_dome ? ', dome' : ''}

RECORDS:
- ${inputs.home_team}: ${homeT?.wins ?? '?'}-${homeT?.losses ?? '?'}
- ${inputs.away_team}: ${awayT?.wins ?? '?'}-${awayT?.losses ?? '?'}

ARSENAL:
${homeP ? `- ${homeP.player_name}: ${homeP.pitch_types ?? 'N/A'}` : ''}
${awayP ? `- ${awayP.player_name}: ${awayP.pitch_types ?? 'N/A'}` : ''}
${streakSection}
Write all 7 tags now.`
}

function parseOutput(text: string) {
  const summaryMatch      = text.match(/<summary>([\s\S]*?)<\/summary>/i)
  const narrativeMatch    = text.match(/<narrative>([\s\S]*?)<\/narrative>/i)
  const narrativeProMatch = text.match(/<narrative_pro>([\s\S]*?)<\/narrative_pro>/i)
  const homeStoriesMatch  = text.match(/<home_stories>([\s\S]*?)<\/home_stories>/i)
  const awayStoriesMatch  = text.match(/<away_stories>([\s\S]*?)<\/away_stories>/i)
  const contrarianMatch   = text.match(/<contrarian>([\s\S]*?)<\/contrarian>/i)
  const proTakeawaysMatch = text.match(/<pro_takeaways>([\s\S]*?)<\/pro_takeaways>/i)

  if (!summaryMatch || !narrativeMatch || !narrativeProMatch || !homeStoriesMatch || !awayStoriesMatch || !contrarianMatch || !proTakeawaysMatch) {
    console.error('Missing tags:', { summary: !!summaryMatch, narrative: !!narrativeMatch, narrative_pro: !!narrativeProMatch, home_stories: !!homeStoriesMatch, away_stories: !!awayStoriesMatch, contrarian: !!contrarianMatch, pro_takeaways: !!proTakeawaysMatch })
    return null
  }

  const summary       = summaryMatch[1].trim()
  const narrative     = narrativeMatch[1].trim()
  const narrative_pro = narrativeProMatch[1].trim()
  const contrarian    = contrarianMatch[1].trim()

  if (!summary || summary.length > 250)        return null
  if (!narrative || narrative.length > 1500)   return null
  if (!narrative_pro || narrative_pro.length > 3000) return null
  if (!contrarian || contrarian.length > 500)  return null

  let home_stories: StoryItem[] = []
  let away_stories: StoryItem[] = []
  let pro_takeaways: ProTakeaway[] = []

  try { home_stories = JSON.parse(homeStoriesMatch[1].trim()); if (!Array.isArray(home_stories) || home_stories.length !== 3) return null } catch { return null }
  try { away_stories = JSON.parse(awayStoriesMatch[1].trim()); if (!Array.isArray(away_stories) || away_stories.length !== 3) return null } catch { return null }

  try {
    const rawTakeaways = JSON.parse(proTakeawaysMatch[1].trim())
    if (!Array.isArray(rawTakeaways)) return null
    const merged: any[] = []
    for (const item of rawTakeaways) {
      if (item.stat && item.text) { merged.push({ ...item }) }
      else if (item.edge && merged.length > 0) { const prev = merged[merged.length - 1]; if (!prev.edge) prev.edge = item.edge }
    }
    pro_takeaways = merged.filter((t: any) => t?.stat && t?.text && t?.edge)
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
  if (streaks.home_hot_batters.length > 0) lines.push(`- ${homeTeam} hot: ${streaks.home_hot_batters.slice(0, 2).map(b => `${b.player_name} (${b.streak_label})`).join(', ')}`)
  if (streaks.away_hot_batters.length > 0) lines.push(`- ${awayTeam} hot: ${streaks.away_hot_batters.slice(0, 2).map(b => `${b.player_name} (${b.streak_label})`).join(', ')}`)
  return lines.length > 1 ? lines.join('\n') : ''
}

function formatComponentName(key: string): string {
  const map: Record<string, string> = { starting_pitcher: 'Starting Pitcher', bullpen: 'Bullpen', offense: 'Offense', defense: 'Defense', matchup: 'Matchup', park: 'Park', weather: 'Weather', rest: 'Rest' }
  return map[key] ?? key
}