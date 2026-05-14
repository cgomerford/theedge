import Anthropic from '@anthropic-ai/sdk'
import type { PitcherSeasonStats, PitchType, GameWeather, TeamForm } from '@/lib/mlb'
import type { EdgeScoreResult } from './edge'

// ============================================================
// V1: RULE-BASED GAMELINE + EDGE INDICATOR
// Used by src/app/mlb/[slug]/page.tsx
// ============================================================

type GameContext = {
  awayShort: string
  homeShort: string
  awayPitcherName: string | null
  homePitcherName: string | null
  awaySeasonStats: PitcherSeasonStats | null
  homeSeasonStats: PitcherSeasonStats | null
  awayPitchMix: PitchType[]
  homePitchMix: PitchType[]
  awayForm: TeamForm | null
  homeForm: TeamForm | null
  weather: GameWeather | null
  windImpact: string | null
  isIndoor: boolean
}

type Fact = {
  text: string
  weight: number
}

// Build a list of candidate facts, then pick the top 1-2
export function generateGameline(ctx: GameContext): string {
  const facts: Fact[] = []

  const allPitchers = [
    { name: ctx.awayPitcherName, stats: ctx.awaySeasonStats, mix: ctx.awayPitchMix },
    { name: ctx.homePitcherName, stats: ctx.homeSeasonStats, mix: ctx.homePitchMix },
  ]

  for (const p of allPitchers) {
    if (!p.name || !p.stats) continue

    const era = parseFloat(p.stats.era)
    const k9 = parseFloat(p.stats.k_per_9)

    if (!isNaN(era) && era < 2.5 && parseFloat(p.stats.innings) > 20) {
      facts.push({
        text: `${p.name} carries a sub-2.50 ERA into tonight`,
        weight: 9,
      })
    }
    if (!isNaN(k9) && k9 >= 11) {
      facts.push({
        text: `${p.name} is striking out ${k9.toFixed(1)} per nine this season`,
        weight: 8,
      })
    }
    if (p.mix.length > 0) {
      const top = p.mix[0]
      if (top.whiff_percent !== null && top.whiff_percent >= 35) {
        facts.push({
          text: `${p.name}'s ${top.pitch_name.toLowerCase()} is generating ${top.whiff_percent.toFixed(0)}% whiffs`,
          weight: 9,
        })
      }
      if (top.percentage >= 45) {
        facts.push({
          text: `${p.name} leans heavily on the ${top.pitch_name.toLowerCase()} (${top.percentage.toFixed(0)}% usage)`,
          weight: 6,
        })
      }
    }
  }

  for (const { form, name } of [
    { form: ctx.awayForm, name: ctx.awayShort },
    { form: ctx.homeForm, name: ctx.homeShort },
  ]) {
    if (!form) continue

    if (form.streak_type === 'W' && form.streak_count >= 5) {
      facts.push({
        text: `${name} ride a ${form.streak_count}-game win streak in`,
        weight: 8,
      })
    }
    if (form.streak_type === 'L' && form.streak_count >= 4) {
      facts.push({
        text: `${name} have dropped ${form.streak_count} straight`,
        weight: 7,
      })
    }
    if (form.last_10_wins >= 8) {
      facts.push({
        text: `${name} are ${form.last_10_wins}-${form.last_10_losses} in their last ten`,
        weight: 7,
      })
    }
    if (form.run_diff_l10 >= 3) {
      facts.push({
        text: `${name} are outscoring opponents by ${form.run_diff_l10.toFixed(1)} per game`,
        weight: 6,
      })
    }
  }

  if (!ctx.isIndoor && ctx.weather) {
    if (ctx.weather.precipitation_chance >= 60) {
      facts.push({
        text: `Rain risk ${ctx.weather.precipitation_chance}% at first pitch`,
        weight: 7,
      })
    }
    if (ctx.windImpact && ctx.weather.wind_mph >= 12) {
      facts.push({
        text: ctx.windImpact.toLowerCase(),
        weight: 6,
      })
    }
    if (ctx.weather.temp_f >= 92) {
      facts.push({
        text: `${ctx.weather.temp_f}°F at first pitch — ball flies in heat`,
        weight: 5,
      })
    }
    if (ctx.weather.temp_f <= 45) {
      facts.push({
        text: `Cold start: ${ctx.weather.temp_f}°F, suppresses hitting`,
        weight: 5,
      })
    }
  }

  facts.sort((a, b) => b.weight - a.weight)

  if (facts.length === 0) {
    return `${ctx.awayShort} face ${ctx.homeShort} tonight. Full data below.`
  }

  if (facts.length === 1) {
    return capitalize(facts[0].text) + '.'
  }

  const a = facts[0].text
  const b = facts[1].text
  return `${capitalize(a)}. ${capitalize(b)}.`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// =====================================================
// V1 EDGE INDICATOR — minimal MVP (kept for page.tsx)
// =====================================================

export type EdgeCategory = {
  label: string
  awayScore: number
  homeScore: number
  winner: 'away' | 'home' | 'even'
  detail: string
}

export type EdgeReport = {
  pitching: EdgeCategory | null
  form: EdgeCategory | null
}

export function calculateEdge(ctx: GameContext): EdgeReport {
  return {
    pitching: pitchingEdge(ctx),
    form: formEdge(ctx),
  }
}

function pitchingEdge(ctx: GameContext): EdgeCategory | null {
  const aw = ctx.awaySeasonStats
  const hm = ctx.homeSeasonStats
  if (!aw || !hm) return null

  const score = (era: string) => {
    const e = parseFloat(era)
    if (isNaN(e)) return 50
    return Math.max(0, Math.min(100, 100 - e * 10))
  }

  const awayScore = Math.round(score(aw.era))
  const homeScore = Math.round(score(hm.era))
  const diff = Math.abs(awayScore - homeScore)

  let winner: 'away' | 'home' | 'even' = 'even'
  if (diff >= 8) winner = awayScore > homeScore ? 'away' : 'home'

  return {
    label: 'Pitching',
    awayScore,
    homeScore,
    winner,
    detail: `ERA ${aw.era} vs ${hm.era}`,
  }
}

function formEdge(ctx: GameContext): EdgeCategory | null {
  if (!ctx.awayForm || !ctx.homeForm) return null

  const score = (wins: number, diff: number) => {
    const winsScore = (wins / 10) * 70
    const diffScore = Math.max(-15, Math.min(30, diff * 5))
    return Math.max(0, Math.min(100, winsScore + diffScore))
  }

  const awayScore = Math.round(score(ctx.awayForm.last_10_wins, ctx.awayForm.run_diff_l10))
  const homeScore = Math.round(score(ctx.homeForm.last_10_wins, ctx.homeForm.run_diff_l10))
  const diff = Math.abs(awayScore - homeScore)

  let winner: 'away' | 'home' | 'even' = 'even'
  if (diff >= 10) winner = awayScore > homeScore ? 'away' : 'home'

  return {
    label: 'Form',
    awayScore,
    homeScore,
    winner,
    detail: `${ctx.awayForm.last_10_wins}-${ctx.awayForm.last_10_losses} vs ${ctx.homeForm.last_10_wins}-${ctx.homeForm.last_10_losses} L10`,
  }
}

// ============================================================
// V2: LLM NARRATIVE GENERATOR
// Used by src/app/api/cron/log-predictions/route.ts
// ============================================================

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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
  streaks?: GameStreaks | null  // NEW
  is_pro?: boolean 
}

export type NarrativeResult = {
  summary: string
  story_lead: string
  narrative: string
  cost_usd: number
}

const SYSTEM_PROMPT = `You are a writer for The Edge, a daily 5-minute pre-game brief for analytically-minded MLB fans.

VOICE:
- Smart friend, not a robot. Conversational but informed.
- Use specific numbers. Real stats over abstract claims.
- Confident but never preachy. Surface insight, don't lecture.
- Never use betting language or recommend wagers. Information only.
- Never use these phrases: "lock", "play", "value", "edge to bet", "smash", "hammer", "fade".

FORMAT RULES:
Output exactly THREE parts using these XML tags:
<summary>...</summary><story_lead>...</story_lead><narrative>...</narrative>

SUMMARY (max 110 characters):
One sentence identifying the 1-2 biggest factors driving the edge.

STORY_LEAD (max 350 characters, 2-3 sentences):
This is the most important writing on the page. It's the FIRST thing a reader sees.
Write like you're texting a curious friend before the game starts.
- LEAD with one specific, compelling fact (a number, a name, a streak)
- Use real names of players when possible — not "the starting pitcher"
- Use em-dashes (—) and contractions naturally
- NO jargon, NO "matchup analytics," NO "favorable conditions"
- Confident but not pushy
- 2-3 sentences MAX

GOOD STORY_LEAD examples:
✓ "Wheeler's been ridiculous lately — three straight under 2 ERA. The Mets bullpen is gassed after last night's marathon. Real edge here."
✓ "Two pitchers having career years collide tonight. Skenes leads MLB in K/9, but Holton's been just as nasty in his last five. Toss-up."
✓ "The Yankees' bats are quiet — just 3.2 runs per game over the last week. Glasnow's velocity is back to 99 mph. Rangers have a sneaky edge."

BAD STORY_LEAD examples (do not write like these):
✗ "The Phillies face the Mets tonight in a matchup that favors the home team." (no voice, no facts)
✗ "Several factors point to a Phillies edge including pitching, bullpen, and recent form." (list-form, anonymous)
✗ "Wheeler is good, the Mets pen is tired." (too short, no specifics)

NARRATIVE (max 600 characters, EXACTLY 4 sentences):
The analytical deep-read for engaged fans. Target 450 chars, hard max 600.
Be concise — every word must earn its place.
- Sentence 1: Headline matchup or biggest factor with a specific stat.
- Sentence 2: Supporting factor with a specific number.
- Sentence 3: A counter-factor or secondary insight.
- Sentence 4: Concise close naming the favored team or toss-up status.

If your narrative exceeds 450 characters, you must shorten it.
Use team names naturally. Don't start every sentence with team names.
If a stat is null, missing, or unavailable, do not invent it. Work with what's provided.
For toss-up confidence: be honest about it being close. Don't manufacture an edge.

ADDITIONAL DATA — STREAKS:
When the user prompt includes "RECENT FORM & STREAKS" data, use it to make the writing feel current and specific. Reference at most 1-2 streak details. Examples:
- "Yesavage is rolling with a 0.99 ERA over his last 3 starts"
- "Schanuel rides a 7-game hit streak in"
- "Bohm's 0-for-24 stretch puts pressure on the rest of the lineup"

Don't reference streaks that don't exist. If no streaks are notable, focus on season stats.

EXAMPLE OUTPUT FORMAT:

<summary>Peralta's 2.41 FIP and a tired Cardinals bullpen tilt this Brewers' way.</summary>
<story_lead>Peralta's been the best version of himself — 2.41 FIP, 11.2 K/9 over four starts. The Cardinals pen is burned out after 6 innings the last two nights. Brewers have a real edge tonight.</story_lead>
<narrative>Peralta has been the best version of himself: 2.41 FIP, 11.2 K/9 over four starts. Cardinals counter with Mikolas (4.18 FIP) and a bullpen burned for 6 innings across the last two days. Wrigley's tailwind helps both lineups, but the pitching gap is too wide to ignore. Slight edge to Milwaukee.</narrative>

Bad output to avoid:
- "Take the Brewers tonight, this is a lock!" (advice + betting language)
- "The advanced metrics suggest a probabilistic advantage." (robotic)
- "An exciting matchup awaits." (filler)`

const FREE_SYSTEM_PROMPT = `You are a writer for The Edge, a daily 5-minute pre-game brief for analytically-minded MLB fans.

VOICE:
- Smart friend, not a robot. Conversational but informed.
- Use specific numbers. Real stats over abstract claims.
- Confident but never preachy. Surface insight, don't lecture.
- Never use betting language or recommend wagers. Information only.
- Never use these phrases: "lock", "play", "value", "edge to bet", "smash", "hammer", "fade".

FORMAT RULES:
Output exactly THREE parts using these XML tags:
<summary>...</summary><story_lead>...</story_lead><narrative>...</narrative>

SUMMARY (max 110 characters):
One sentence identifying the 1-2 biggest factors driving the edge.

STORY_LEAD (max 350 characters, 2-3 sentences):
This is the most important writing on the page. It's the FIRST thing a reader sees.
Write like you're texting a curious friend before the game starts.
- LEAD with one specific, compelling fact (a number, a name, a streak)
- Use real names of players when possible — not "the starting pitcher"
- Use em-dashes (—) and contractions naturally
- NO jargon, NO "matchup analytics," NO "favorable conditions"
- Confident but not pushy
- 2-3 sentences MAX

GOOD STORY_LEAD examples:
✓ "Wheeler's been ridiculous lately — three straight under 2 ERA. The Mets bullpen is gassed after last night's marathon. Real edge here."
✓ "Two pitchers having career years collide tonight. Skenes leads MLB in K/9, but Holton's been just as nasty in his last five. Toss-up."
✓ "The Yankees' bats are quiet — just 3.2 runs per game over the last week. Glasnow's velocity is back to 99 mph. Rangers have a sneaky edge."

BAD STORY_LEAD examples (do not write like these):
✗ "The Phillies face the Mets tonight in a matchup that favors the home team." (no voice, no facts)
✗ "Several factors point to a Phillies edge including pitching, bullpen, and recent form." (list-form, anonymous)
✗ "Wheeler is good, the Mets pen is tired." (too short, no specifics)

NARRATIVE (max 600 characters, EXACTLY 4 sentences):
The analytical deep-read for engaged fans. Target 450 chars, hard max 600.
- Sentence 1: Headline matchup or biggest factor with a specific stat.
- Sentence 2: Supporting factor with a specific number.
- Sentence 3: A counter-factor or secondary insight.
- Sentence 4: Concise close naming the favored team or toss-up status.

If your narrative exceeds 450 characters, you must shorten it.
Use team names naturally. Don't start every sentence with team names.
If a stat is null or unavailable, do not invent it.
For toss-up confidence: be honest about it being close.

When RECENT FORM & STREAKS data is provided, reference at most 1-2 streak details naturally.
Don't reference streaks that don't exist. If none are notable, focus on season stats.`

const PRO_SYSTEM_PROMPT = `You are The Edge Pro — a GM's pre-game briefing tool for serious analysts and fantasy players.
Write with strategic precision. Every sentence should answer: "what does this mean for my decisions?"
Your job: 3-4 sentences covering (1) the key model driver, (2) a specific player to target or fade, (3) the scenario where the underdog wins.
Always name specific players. Flag regression risk if ERA and FIP diverge significantly (>1.0 gap).
End with one "watch for" — a specific in-game signal that confirms or challenges the Edge Score.
Voice: Authoritative. Specific. Actionable. Front office analyst briefing the manager.
Never use "utilize" or "leverage". No bullet points. Pure narrative prose.

Respond in this exact XML format:
<summary>One sentence. The sharpest strategic take — name a player or specific edge.</summary>
<story_lead>2-3 sentences. The GM's headline. What's the actionable angle tonight.</story_lead>
<narrative>3-4 sentences. The full briefing. Model driver → player to target/fade → underdog scenario → watch for.</narrative>`

export async function generateNarrative(inputs: NarrativeInputs): Promise<NarrativeResult | null> {
  try {
    const userPrompt = buildUserPrompt(inputs)
 
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 900,
      system: [
        {
          type: 'text',
          text: inputs.is_pro ? PRO_SYSTEM_PROMPT : FREE_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    })
 
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
 
    // Pro narratives are longer by design — give them a higher ceiling
    const narrativeLimit = inputs.is_pro ? 1200 : 900
    const parsed = parseOutput(text, narrativeLimit)
 
    if (!parsed) {
      console.error(`Failed to parse ${inputs.is_pro ? 'PRO' : 'FREE'} LLM output:`, text)
      return null
    }
 
    const inputCost = (message.usage.input_tokens * 0.0000008)
    const cachedCost = ((message.usage.cache_read_input_tokens ?? 0) * 0.00000008)
    const outputCost = (message.usage.output_tokens * 0.000004)
    const totalCost = inputCost + cachedCost + outputCost
 
    return {
      summary: parsed.summary,
      story_lead: parsed.story_lead,
      narrative: parsed.narrative,
      cost_usd: totalCost,
    }
  } catch (err) {
    console.error('LLM narrative generation failed:', err)
    return null
  }
}

function buildUserPrompt(inputs: NarrativeInputs): string {
  const { components_raw } = inputs
  const homeP = components_raw.home_pitcher
  const awayP = components_raw.away_pitcher
  const homeT = components_raw.home_team
  const awayT = components_raw.away_team
  const park = components_raw.park

  const sortedComponents = Object.entries(inputs.components)
    .map(([key, value]) => ({ key, value, abs: Math.abs(value) }))
    .sort((a, b) => b.abs - a.abs)
    .slice(0, 4)

  const winner = inputs.predicted_winner === 'home' ? inputs.home_team : inputs.away_team
const streakSection = inputs.streaks ? buildStreakSection(inputs.streaks, inputs.home_team, inputs.away_team) : ''

return `Generate a summary and narrative for tonight's MLB game.

GAME: ${inputs.away_team} @ ${inputs.home_team}
VENUE: ${inputs.venue_name}${park?.is_dome ? ' (dome)' : ''}

EDGE SCORE: ${inputs.edge_score >= 0 ? '+' : ''}${inputs.edge_score} (${inputs.confidence_tier} edge${inputs.confidence_tier !== 'tossup' ? ` to ${winner}` : ''})

TOP CONTRIBUTING FACTORS (sorted by impact):
${sortedComponents.map((c, i) => `${i + 1}. ${formatComponentName(c.key)}: ${c.value >= 0 ? '+' : ''}${c.value.toFixed(1)} ${c.value >= 0 ? `(favors ${inputs.home_team})` : `(favors ${inputs.away_team})`}`).join('\n')}

PITCHING:
${awayP ? `- ${inputs.away_team} (away): ${awayP.player_name} — ERA ${awayP.era ?? 'N/A'}, FIP ${awayP.fip ?? 'N/A'}, K/9 ${awayP.k_per_9 ?? 'N/A'}, ${awayP.innings_pitched ?? 0} IP this season` : `- ${inputs.away_team} (away): pitcher data unavailable`}
${homeP ? `- ${inputs.home_team} (home): ${homeP.player_name} — ERA ${homeP.era ?? 'N/A'}, FIP ${homeP.fip ?? 'N/A'}, K/9 ${homeP.k_per_9 ?? 'N/A'}, ${homeP.innings_pitched ?? 0} IP this season` : `- ${inputs.home_team} (home): pitcher data unavailable`}

OFFENSE (last 30 days):
${awayT ? `- ${inputs.away_team}: ${awayT.runs_per_game_l30?.toFixed(2) ?? 'N/A'} R/G, OPS ${awayT.ops_l30 ?? 'N/A'}` : ''}
${homeT ? `- ${inputs.home_team}: ${homeT.runs_per_game_l30?.toFixed(2) ?? 'N/A'} R/G, OPS ${homeT.ops_l30 ?? 'N/A'}` : ''}

BULLPEN:
${awayT ? `- ${inputs.away_team}: ERA ${awayT.bullpen_era?.toFixed(2) ?? 'N/A'}, ${awayT.bullpen_innings_yesterday ?? 0} IP yesterday` : ''}
${homeT ? `- ${inputs.home_team}: ERA ${homeT.bullpen_era?.toFixed(2) ?? 'N/A'}, ${homeT.bullpen_innings_yesterday ?? 0} IP yesterday` : ''}

PARK FACTORS:
- ${park?.venue_name ?? inputs.venue_name}: HR factor ${park?.hr_factor ?? 1.0}, Run factor ${park?.run_factor ?? 1.0}${park?.is_dome ? ', dome' : ''}
${streakSection}
Write the summary, story_lead, and narrative now using the format <summary>...</summary><story_lead>...</story_lead><narrative>...</narrative>.`
}

function parseOutput(
  text: string,
  narrativeLimit: number = 900
): { summary: string; story_lead: string; narrative: string } | null {
  const summaryMatch = text.match(/<summary>([\s\S]*?)<\/summary>/i)
  const storyLeadMatch = text.match(/<story_lead>([\s\S]*?)<\/story_lead>/i)
  const narrativeMatch = text.match(/<narrative>([\s\S]*?)<\/narrative>/i)
 
  if (!summaryMatch || !storyLeadMatch || !narrativeMatch) {
    console.error('Failed to parse LLM output (missing tags):', text.substring(0, 300))
    return null
  }
 
  const summary = summaryMatch[1].trim()
  const story_lead = storyLeadMatch[1].trim()
  const narrative = narrativeMatch[1].trim()
 
  if (!summary || !story_lead || !narrative) {
    console.error('Failed to parse: empty values')
    return null
  }
 
  if (summary.length > 250) {
    console.error(`Failed to parse: summary too long (${summary.length} chars)`)
    return null
  }
 
  if (story_lead.length > 400) {
    console.error(`Failed to parse: story_lead too long (${story_lead.length} chars)`)
    return null
  }
 
  if (narrative.length > narrativeLimit) {
    console.error(`Failed to parse: narrative too long (${narrative.length} chars, limit ${narrativeLimit})`)
    return null
  }
 
  return { summary, story_lead, narrative }
}

function buildStreakSection(streaks: GameStreaks, homeTeam: string, awayTeam: string): string {
  const lines: string[] = ['', 'RECENT FORM & STREAKS:']

  // Pitcher trends
  if (streaks.home_pitcher) {
    const p = streaks.home_pitcher
    const trendBits = []
    if (p.last_3_era !== null) trendBits.push(`${p.last_3_era} ERA L3 starts`)
    if (p.last_3_k_per_9 !== null) trendBits.push(`${p.last_3_k_per_9} K/9 L3`)
    if (p.current_scoreless_innings >= 6) trendBits.push(`${p.current_scoreless_innings} consecutive scoreless innings`)
    if (p.trend_label) trendBits.push(`(${p.trend_label})`)
    if (trendBits.length > 0) {
      lines.push(`- ${homeTeam} starter ${p.player_name}: ${trendBits.join(', ')}`)
    }
  }
  if (streaks.away_pitcher) {
    const p = streaks.away_pitcher
    const trendBits = []
    if (p.last_3_era !== null) trendBits.push(`${p.last_3_era} ERA L3 starts`)
    if (p.last_3_k_per_9 !== null) trendBits.push(`${p.last_3_k_per_9} K/9 L3`)
    if (p.current_scoreless_innings >= 6) trendBits.push(`${p.current_scoreless_innings} consecutive scoreless innings`)
    if (p.trend_label) trendBits.push(`(${p.trend_label})`)
    if (trendBits.length > 0) {
      lines.push(`- ${awayTeam} starter ${p.player_name}: ${trendBits.join(', ')}`)
    }
  }

  // Hot batters
  if (streaks.home_hot_batters.length > 0) {
    lines.push(`- ${homeTeam} hot bats:`)
    streaks.home_hot_batters.slice(0, 2).forEach(b => {
      lines.push(`    * ${b.player_name}${b.streak_label ? ` — ${b.streak_label}` : ''}`)
    })
  }
  if (streaks.away_hot_batters.length > 0) {
    lines.push(`- ${awayTeam} hot bats:`)
    streaks.away_hot_batters.slice(0, 2).forEach(b => {
      lines.push(`    * ${b.player_name}${b.streak_label ? ` — ${b.streak_label}` : ''}`)
    })
  }

  // Cold batters (only most extreme)
  if (streaks.home_cold_batters.length > 0) {
    const worst = streaks.home_cold_batters[0]
    lines.push(`- ${homeTeam} cold: ${worst.player_name}${worst.streak_label ? ` — ${worst.streak_label}` : ''}`)
  }
  if (streaks.away_cold_batters.length > 0) {
    const worst = streaks.away_cold_batters[0]
    lines.push(`- ${awayTeam} cold: ${worst.player_name}${worst.streak_label ? ` — ${worst.streak_label}` : ''}`)
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
    rest: 'Rest & Travel',
  }
  return map[key] ?? key
}