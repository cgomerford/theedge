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
  story_lead: string        // keep for backwards compat — set to summary
  narrative: string
  home_stories: StoryItem[]
  away_stories: StoryItem[]
  contrarian: string
  pro_takeaways: ProTakeaway[]
  cost_usd: number
}

export type StoryItem = {
  stat: string     // e.g. "5.14 ERA"
  text: string     // e.g. "Nola's struggling, 5.63 over his last 3 starts"
}
 
export type ProTakeaway = {
  stat: string     // e.g. "40% GB rate"
  text: string     // e.g. "Luzardo's ground-ball rate meets Pittsburgh's 3rd-highest GB hit rate"
  edge: 'home' | 'away' | 'neutral'
}
const SYSTEM_PROMPT = `You are a writer for The Edge, a daily 5-minute pre-game brief for analytically-minded MLB fans.
 
VOICE:
- Smart friend, not a robot. Conversational but informed.
- Use specific numbers. Real stats over abstract claims.
- Confident but never preachy. Surface insight, don't lecture.
- Never use betting language or recommend wagers. Information only.
- Never use these phrases: "lock", "play", "value", "edge to bet", "smash", "hammer", "fade".
 
FORMAT RULES:
Output exactly SIX parts using these XML tags, in this order:
 
<summary>...</summary>
<narrative>...</narrative>
<home_stories>...</home_stories>
<away_stories>...</away_stories>
<contrarian>...</contrarian>
<pro_takeaways>...</pro_takeaways>
 
---
 
SUMMARY (max 110 characters):
One sentence identifying the 1-2 biggest factors driving the edge. This appears as a quote inside the Edge Indicator hero panel.
 
---
 
NARRATIVE (max 600 characters, EXACTLY 4 sentences):
The analytical deep-read for engaged fans. Target 450 chars, hard max 600.
- Sentence 1: Headline matchup or biggest factor with a specific stat.
- Sentence 2: Supporting factor with a specific number.
- Sentence 3: A counter-factor or secondary insight.
- Sentence 4: Concise close naming the favored team or toss-up status.
Use team names naturally. Don't start every sentence with team names.
If a stat is null or unavailable, do not invent it. Work with what's provided.
For toss-up confidence: be honest about it being close.
 
---
 
HOME_STORIES (JSON array of exactly 3 objects):
Three key storylines for the HOME team tonight. Each object has:
- "stat": a short stat label (max 12 chars, e.g. "2.77 ERA", ".348 L5", "22-18")
- "text": one sentence of context (max 80 chars)
 
RULES FOR HOME_STORIES:
- Story 1 MUST be about the home team's record or recent form (e.g. "22-18 — On a 7-game home win streak, best in the NL")
- Story 2: the most impactful player storyline (hot bat, pitcher form, slump)
- Story 3: a tactical edge or concern (bullpen fatigue, lineup change, park factor)
- Every story must include a real number from the data provided
- Do NOT invent stats. If data is thin, use what's available.
 
---
 
AWAY_STORIES (JSON array of exactly 3 objects):
Same format as home_stories but for the AWAY team.
 
RULES FOR AWAY_STORIES:
- Story 1 MUST be about the away team's record or recent form (e.g. "18-22 — Lost 4 of last 5 on the road")
- Story 2: the most impactful player storyline
- Story 3: a tactical edge or concern
- Same rules as home_stories
 
---
 
CONTRARIAN (max 300 characters, 2-3 sentences):
"Why we might be wrong" — a genuine counter-argument to the Edge prediction.
- Identify the strongest case AGAINST the predicted winner
- Use specific stats that cut the other way (e.g. FIP vs ERA gap, home/away splits, sample size)
- Be honest, not dramatic. This builds trust.
- For toss-ups: explain why one factor could tip it either way.
 
---
 
PRO_TAKEAWAYS (JSON array of exactly 3 objects):
Three stat-driven matchup insights for fantasy/DFS players. Each object has:
- "stat": a short stat label (max 15 chars, e.g. "40% GB rate", "32% whiff", ".412 xwOBA")
- "text": one sentence explaining why this stat matters TONIGHT against THIS opponent (max 100 chars)
- "edge": who this favors — "home", "away", or "neutral"
 
RULES FOR PRO_TAKEAWAYS:
- These must connect a pitcher's profile to the opposing lineup or vice versa
- Think: "Pitcher X has trait Y, and tonight's opponent is ranked Z at exploiting/struggling against Y"
- Examples of good takeaways:
  * {"stat": "40% GB rate", "text": "Luzardo's ground-ball approach meets Pittsburgh's 3rd-highest GB rate — helps him", "edge": "home"}
  * {"stat": ".189 vs SL", "text": "Cubs lineup hits .189 against sliders — Wheeler's slider has 35% whiff rate", "edge": "away"}
  * {"stat": "4.2 R/G vs LHP", "text": "Cardinals average 4.2 R/G vs lefties this year — Mikolas being a righty neutralizes that", "edge": "neutral"}
- Do NOT just restate stats from the summary. These must be UNIQUE matchup-specific insights.
- If limited data is available, focus on the pitcher's strongest pitch vs the lineup's known weaknesses.
 
---
 
EXAMPLE OUTPUT:
 
<summary>Ashcraft's 2.77 ERA and Pirates' hot bats overwhelm struggling Nola at PNC.</summary>
<narrative>Ashcraft's elite run (2.77 ERA, 1.05 WHIP) is the primary driver — he's been Pittsburgh's most consistent arm across 8 starts. Nola's 5.14 ERA masks even worse recent form at 5.63 over his last three. Pirates' bats are scorching with Cruz (.348 L5) and Gonzales (.350 L5) anchoring the middle. Moderate edge to Pittsburgh at home.</narrative>
<home_stories>[{"stat": "22-18", "text": "7-3 in last 10, riding a 4-game home win streak"},{"stat": "2.77 ERA", "text": "Ashcraft's been elite — 1.05 WHIP across 8 starts this season"},{"stat": ".348 L5", "text": "Oneil Cruz's bat is scorching, 3 HR in the last week"}]</home_stories>
<away_stories>[{"stat": "18-22", "text": "Lost 4 of last 5 on the road, 3-7 in last 10 away"},{"stat": "5.14 ERA", "text": "Nola's struggling — 5.63 over his last 3 starts"},{"stat": "3 IP yesterday", "text": "Bullpen is rested, closer and both setup arms available"}]</away_stories>
<contrarian>Nola's peripherals (3.42 FIP vs 5.14 ERA) suggest he's been deeply unlucky — his hard-hit rate is still elite. If the regression kicks in tonight, this edge evaporates fast.</contrarian>
<pro_takeaways>[{"stat": "9.43 K/9", "text": "Nola's strikeout rate is still elite despite ERA — Pirates strike out 4th-most in NL", "edge": "away"},{"stat": "1.05 WHIP", "text": "Ashcraft's low walk rate limits free baserunners that Philly's power bats need", "edge": "home"},{"stat": ".720 OPS vs R", "text": "Phillies hit .720 OPS vs righties — Ashcraft being RHP is a slight vulnerability", "edge": "away"}]</pro_takeaways>
 
ADDITIONAL DATA — STREAKS:
When the user prompt includes "RECENT FORM & STREAKS" data, use it to make the writing feel current and specific. Reference at most 1-2 streak details.
 
Don't reference streaks that don't exist. If no streaks are notable, focus on season stats.
 
Bad output to avoid:
- "Take the Brewers tonight, this is a lock!" (advice + betting language)
- "The advanced metrics suggest a probabilistic advantage." (robotic)
- "An exciting matchup awaits." (filler)
- Inventing stats not present in the data
- Generic statements without specific numbers`
// ============================================================
// REPLACE these two constants in src/lib/narrative.ts
// ============================================================
 
const FREE_SYSTEM_PROMPT = `You are a writer for The Edge, a daily 5-minute pre-game brief for analytically-minded MLB fans.
 
VOICE:
- Smart friend, not a robot. Conversational but informed.
- Use specific numbers. Real stats over abstract claims.
- Confident but never preachy. Never use betting language or recommend wagers.
- Never use: "lock", "play", "value", "edge to bet", "smash", "hammer", "fade".
- If a stat is null or unavailable, do not invent it. Omit it.
 
OUTPUT FORMAT — output exactly three XML tags, nothing else. No markdown, no backticks, no preamble.
 
<summary>ONE sentence. HARD LIMIT: 100 characters. Count before writing. If over 100 chars, rewrite shorter.</summary>
<story_lead>2-3 sentences. HARD LIMIT: 320 characters total. Lead with one specific fact — a name, a number, a streak. Em-dashes and contractions welcome. No jargon.</story_lead>
<narrative>EXACTLY 4 sentences. HARD LIMIT: 500 characters total. S1: biggest factor + stat. S2: supporting factor + number. S3: counter or secondary insight. S4: close naming favoured team or toss-up.</narrative>
 
CHARACTER LIMITS ARE HARD STOPS. Before outputting, count the characters in each field. If any field exceeds its limit, rewrite it shorter. Do not exceed the limits under any circumstances.
 
GOOD SUMMARY (under 100 chars):
✓ "Cole's 1.44 ERA last 3 starts and a gassed Red Sox pen tilt this Yankees' way." (79 chars)
 
BAD SUMMARY (too long):
✗ "Minnesota's offensive edge collides with Miami's dominant bullpen in a classic tossup, but Zebby Matthews' scoreless streak makes the Twins the lean." (150 chars — WAY too long)`
 
const PRO_SYSTEM_PROMPT = `You are The Edge Pro — a GM's pre-game briefing for serious analysts and fantasy players.
 
VOICE: Authoritative. Specific. Actionable. Front office analyst briefing the manager.
Never use "utilize" or "leverage". No bullet points. Pure prose.
Never use betting language. Never say "lock", "play", "value", "smash", "hammer", "fade".
If a stat is null or unavailable, do not invent it. Omit it.
Flag ERA/FIP divergence over 1.0 — name the pitcher.
 
OUTPUT FORMAT — output exactly three XML tags, nothing else. No markdown, no backticks, no preamble.
 
<summary>ONE sentence. HARD LIMIT: 110 characters. Name a specific player or edge. Count before writing. Rewrite if over 110 chars.</summary>
<story_lead>2-3 sentences. HARD LIMIT: 350 characters total. The GM headline — name players, state the actionable angle. Count before writing. Rewrite if over 350 chars.</story_lead>
<narrative>3-4 sentences. HARD LIMIT: 600 characters total. Structure: (1) key model driver + stat, (2) specific player to target or fade, (3) realistic underdog scenario, (4) one "watch for" — a specific in-game signal. Count before writing. Rewrite if over 600 chars.</narrative>
 
CHARACTER LIMITS ARE HARD STOPS. Count the characters in each field before outputting. If any field exceeds its limit, rewrite it shorter. This is non-negotiable.
 
GOOD SUMMARY (under 110 chars):
✓ "Cole's regression risk is real — fade him if his first-inning velo sits below 95." (83 chars)
 
BAD SUMMARY (too long):
✗ "Michael McGreevy's dominant L3 stretch creates a -70.7 pitcher edge — target McGreevy for strikeouts and fade Saggese's ice-cold bat while monitoring Oakland's Nick Kurtz." (172 chars — WAY too long, rewrite)`

export async function generateNarrative(inputs: NarrativeInputs): Promise<NarrativeResult | null> {
  try {
    const userPrompt = buildUserPrompt(inputs)
 
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1800,
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
console.log(`RAW LLM OUTPUT (${inputs.is_pro ? 'PRO' : 'FREE'}):`, JSON.stringify(text))

const parsed = parseOutput(text)

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
   story_lead: parsed.summary,  // backwards compat — same as summary
   narrative: parsed.narrative,
   home_stories: parsed.home_stories,
  away_stories: parsed.away_stories,
     contrarian: parsed.contrarian,
     pro_takeaways: parsed.pro_takeaways,
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

TEAM RECORDS:
- ${inputs.home_team} (home): ${homeT?.wins ?? '?'}-${homeT?.losses ?? '?'} overall
- ${inputs.away_team} (away): ${awayT?.wins ?? '?'}-${awayT?.losses ?? '?'} overall

PITCHER ARSENAL (for pro_takeaways — connect these to the opposing lineup):
${homeP ? `- ${homeP.player_name}: ${homeP.pitch_types ?? 'N/A'}` : '- Home pitcher arsenal: unavailable'}
${awayP ? `- ${awayP.player_name}: ${awayP.pitch_types ?? 'N/A'}` : '- Away pitcher arsenal: unavailable'}
${streakSection}
Write all six tags now: <summary>, <narrative>, <home_stories>, <away_stories>, <contrarian>, <pro_takeaways>.`
}
function parseOutput(text: string): {
  summary: string
  narrative: string
  home_stories: StoryItem[]
  away_stories: StoryItem[]
  contrarian: string
  pro_takeaways: ProTakeaway[]
} | null {
  // Required tags
  const summaryMatch = text.match(/<summary>([\s\S]*?)<\/summary>/i)
  const narrativeMatch = text.match(/<narrative>([\s\S]*?)<\/narrative>/i)
  const homeStoriesMatch = text.match(/<home_stories>([\s\S]*?)<\/home_stories>/i)
  const awayStoriesMatch = text.match(/<away_stories>([\s\S]*?)<\/away_stories>/i)
  const contrarianMatch = text.match(/<contrarian>([\s\S]*?)<\/contrarian>/i)
  const proTakeawaysMatch = text.match(/<pro_takeaways>([\s\S]*?)<\/pro_takeaways>/i)
 
  if (!summaryMatch || !narrativeMatch || !homeStoriesMatch || !awayStoriesMatch || !contrarianMatch || !proTakeawaysMatch) {
    console.error('Failed to parse LLM output (missing tags):', text.substring(0, 500))
    return null
  }
 
  const summary = summaryMatch[1].trim()
  const narrative = narrativeMatch[1].trim()
  const contrarian = contrarianMatch[1].trim()
 
  // Validate lengths
  if (!summary || summary.length > 250) {
    console.error(`Failed: summary empty or too long (${summary?.length})`)
    return null
  }
  if (!narrative || narrative.length > 900) {
    console.error(`Failed: narrative empty or too long (${narrative?.length})`)
    return null
  }
  if (!contrarian || contrarian.length > 500) {
    console.error(`Failed: contrarian empty or too long (${contrarian?.length})`)
    return null
  }
 
  // Parse JSON arrays — be lenient with LLM formatting
  let home_stories: StoryItem[] = []
  let away_stories: StoryItem[] = []
  let pro_takeaways: ProTakeaway[] = []
 
  try {
    home_stories = JSON.parse(homeStoriesMatch[1].trim())
    if (!Array.isArray(home_stories) || home_stories.length !== 3) {
      console.error('home_stories not array of 3')
      return null
    }
  } catch {
    console.error('Failed to parse home_stories JSON:', homeStoriesMatch[1].substring(0, 200))
    return null
  }
 
  try {
    away_stories = JSON.parse(awayStoriesMatch[1].trim())
    if (!Array.isArray(away_stories) || away_stories.length !== 3) {
      console.error('away_stories not array of 3')
      return null
    }
  } catch {
    console.error('Failed to parse away_stories JSON:', awayStoriesMatch[1].substring(0, 200))
    return null
  }
 
  try {
    pro_takeaways = JSON.parse(proTakeawaysMatch[1].trim())
    if (!Array.isArray(pro_takeaways) || pro_takeaways.length !== 3) {
      console.error('pro_takeaways not array of 3')
      return null
    }
  } catch {
    console.error('Failed to parse pro_takeaways JSON:', proTakeawaysMatch[1].substring(0, 200))
    return null
  }
 
  return { summary, narrative, home_stories, away_stories, contrarian, pro_takeaways }
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