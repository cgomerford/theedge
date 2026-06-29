export const maxDuration = 800
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import type { GameWeather, TeamForm } from '@/lib/mlb'
import type { EdgeScoreResult } from './edge'
import type { GameStreaks } from './streaks'

// Initialize the Gemini Client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const MODEL = 'gemini-2.5-flash'

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
  weather?: GameWeather | null
  is_dome?: boolean
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
  away_pitcher_injury_return?: { injury_type: string; starts_since_return: number } | null
  home_pitcher_injury_return?: { injury_type: string; starts_since_return: number } | null
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
  game_day_notes: GameDayNote[]
  cost_usd: number
}

export type StoryItem = { stat: string; text: string }
export type ProTakeaway = { stat: string; text: string; edge: 'home' | 'away' | 'neutral' }
export type GameDayNote = { category: 'weather' | 'watch_for' | 'logistics'; text: string }

const narrativeSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { 
      type: SchemaType.STRING, 
      description: "One line (≤110 chars) — the single most useful thing to know before watching tonight. Plain English, no jargon, no scores." 
    },
    narrative: { 
      type: SchemaType.STRING, 
      description: "Free version narrative. Must use clean Markdown structure with scannable headers (###) and bulleted stats. 4 paragraphs total." 
    },
    narrative_pro: { 
      type: SchemaType.STRING, 
      description: "Pro version narrative. High-level front-office analyst style using clean Markdown structure, headers, and bold elements. 5 paragraphs total." 
    },
    contrarian: { 
      type: SchemaType.STRING, 
      description: "The honest case for the less-likely outcome in 2-3 sentences (≤300 chars)." 
    },
    home_stories: { 
      type: SchemaType.ARRAY, 
      items: { 
        type: SchemaType.OBJECT, 
        properties: { 
          stat: { type: SchemaType.STRING, description: "≤12 chars" }, 
          text: { type: SchemaType.STRING, description: "≤80 chars" } 
        },
        required: ["stat", "text"]
      } 
    },
    away_stories: { 
      type: SchemaType.ARRAY, 
      items: { 
        type: SchemaType.OBJECT, 
        properties: { 
          stat: { type: SchemaType.STRING, description: "≤12 chars" }, 
          text: { type: SchemaType.STRING, description: "≤80 chars" } 
        },
        required: ["stat", "text"]
      } 
    },
    pro_takeaways: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          stat: { type: SchemaType.STRING, description: "≤15 chars" },
          text: { type: SchemaType.STRING, description: "≤100 chars linking trait to opposing lineup" },
          edge: { type: SchemaType.STRING, enum: ["home", "away", "neutral"] }
        },
        required: ["stat", "text", "edge"]
      }
    },
    game_day_notes: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          category: { type: SchemaType.STRING, enum: ["weather", "watch_for", "logistics"] },
          text: { type: SchemaType.STRING, description: "≤140 chars practical tip" }
        },
        required: ["category", "text"]
      }
    }
  },
required: [
    "summary", 
    "narrative", 
    "narrative_pro", 
    "contrarian", 
    "home_stories", 
    "away_stories", 
    "pro_takeaways", 
    "game_day_notes"
  ]
};

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
  return `⚠ OPENER/BULK ARM (${pitcher.starts ?? 0} starts in ${games} apps, ${(ip / games).toFixed(1)} IP/game). Frame as short-stint arm handing off to the bullpen; the pen is the real pitching story here.`
}

const SYSTEM_PROMPT = `You are the voice of The Edge — a daily MLB pre-game briefing that helps someone watch tonight's game smarter.

WHO YOU'RE WRITING FOR: Someone who is about to watch this specific game tonight. Every sentence should earn its place by making the next three hours of baseball more interesting to watch. 

AUDIENCE KNOWLEDGE LEVEL: They know what an ERA is. They do not know what FIP, xFIP, xwOBA, BABIP, WPA, OAA, or K/9 mean without explanation. Explain every technical term in plain English in the same sentence you use it. 

VOICE & HIGH-VISIBILITY FORMATTING (GOOGLE AI OVERVIEW STYLE):
- Break text up visually. Never output dense, multi-sentence block paragraphs. 
- Use Markdown headers (###) to map out key storylines (e.g., ### The Pitching Equation, ### Bullpen Alert).
- **Bold** player names, team names, and vital statistics the first time they appear to anchor the reader's eye.
- Use bulleted lists where it makes the data punchier or easier to read at a glance.
- Lead with the story, back it with numbers. Numbers support the point — they never replace it.

═══════════════════════════════════════════
THE REFRAME — WHAT THIS BRIEFING IS FOR:
Every paragraph should help someone watching tonight notice something they'd otherwise miss. Translate analysis into "here's what to watch for" framing:
- Not "his FIP suggests regression" but "watch his first inning closely — if he's missing location early, this could get away from [team] fast"
- Not "the park favours hitters" but "if you're at the park tonight, expect more contact to carry than usual — balls that look like routine fly outs elsewhere have a way of finding the seats here"

═══════════════════════════════════════════
DATA DISCIPLINE — CRITICAL, NON-NEGOTIABLE:
- NEVER invent stats, injuries, roles, usage patterns, pitch-count tendencies, or basestealing tendencies. Only use what is explicitly present in the data block you are given for tonight's specific game.
- If you cannot find a piece of information in tonight's data block, you do not have that information. Do not estimate or infer it. Leave it out.
- IF YOU CANNOT EXPLAIN A STAT IN PLAIN ENGLISH, DON'T USE IT.

INJURY-RETURN RULE: Only describe a player as returning from injury if tonight's data block contains an explicit injury flag.
USAGE & ROLE RULE: Default assumption is every listed starter goes 5+ innings unless data dictates an opener profile.
COUNT-STATE AND BASERUNNING RULE: Never write sentences claiming a pitcher struggles or excels in a specific ball-strike count, or that a specific runner is likely to attempt a steal, unless explicitly present in tonight's data block.

═══════════════════════════════════════════
BANNED PHRASES:
"rubber match energy", "rubber match feel", "playoff atmosphere", "must-win energy", "bounce-back spot", "exciting matchup awaits", "tonight's matchup presents", "advanced metrics suggest", "storyline", "lock", "play", "value bet", "smash", "hammer", "fade", "wager", "coin flip", "odds", "In tonight's matchup", "Tonight's game features", "This one has the makings of", "sets the stage", "all the ingredients", "worth keeping an eye on", "positive regression candidate", "negative regression candidate", "high-leverage", "sequencing", "contact quality", "soft contact", "hard contact", "platoon split", "handedness mismatch", "the underlying numbers" (used more than once per response), "case against is thin", "the at-bat that decides this game"

Never frame either team as something to back, take, lean toward, or get value on. This is a viewing guide, not a pick.

DEFENSE RULE: Talk about OAA and range in plain English — "their outfield is excellent at tracking down fly balls" not "OAA +6". Never mention a defense component score or any raw component score (e.g. "+9.7", "-28.0").
NEVER name a manager, coach, executive, or any person not explicitly present in the data block below. 
NEVER open any paragraph with a cliché scene-setter. Open with the sharpest, most useful thing to watch for.

═══════════════════════════════════════════
TEAM-ATTRIBUTION SELF-CHECK: Confirm which team a pitcher plays for using ONLY the PITCHING DATA section.

═══════════════════════════════════════════
STORYLINE PRIORITY: Lead with the first that genuinely applies:
1. Confirmed injury-return flag 
2. MLB debut flagged 
3. Series or rivalry context with real stakes 
4. Pitcher with real career history against this specific opponent 
5. A hot streak running into a tough pitching matchup 
6. Default: lead with whatever's most watchable about tonight's pitching matchup`

export async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let index = 0

  async function worker() {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker)
  await Promise.all(workers)
  return results
}

export async function generateNarrative(inputs: NarrativeInputs): Promise<NarrativeResult | null> {
  if (process.env.DRY_RUN === 'true') {
    console.log('DRY_RUN: skipping narrative LLM call')
    return null
  }
  try {
    const userPrompt = buildUserPrompt(inputs)
    
    // Configure Gemini model execution with native JSON schema constraints
const modelInstance = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: narrativeSchema as any, // <--- Add "as any" here
        temperature: 0.2
      }
    })

    const result = await modelInstance.generateContent(userPrompt)
    const responseText = result.response.text()

    // Safely parse guaranteed JSON structure
    const parsed = JSON.parse(responseText)
    
    // Calculate 1.5 Flash costs accurately based on usage metadata
    const promptTokens = result.response.usageMetadata?.promptTokenCount ?? 0
    const outputTokens = result.response.usageMetadata?.candidatesTokenCount ?? 0
    
    const inputCost  = promptTokens * 0.000000075
    const outputCost = outputTokens * 0.00000030

    return {
      summary:        parsed.summary,
      story_lead:     parsed.summary,
      narrative:      parsed.narrative,
      narrative_pro:  parsed.narrative_pro,
      home_stories:   parsed.home_stories,
      away_stories:   parsed.away_stories,
      contrarian:     parsed.contrarian,
      pro_takeaways:  parsed.pro_takeaways,
      game_day_notes: parsed.game_day_notes,
      cost_usd:       inputCost + outputCost,
    }
  } catch (err) {
    console.error('Gemini narrative generation failed:', err)
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

  const winner = inputs.predicted_winner === 'home' ? inputs.home_team : inputs.away_team

  function pitcherAnalysis(p: any, teamName: string, side: string): string {
    if (!p) return `- ${teamName} (${side}): pitcher TBD`
    const era = p.era ?? null
    const fip = p.fip ?? null
    const gap = era !== null && fip !== null ? Math.abs(era - fip).toFixed(2) : null
    const gapNote = gap && parseFloat(gap) >= 0.5
      ? ` | ERA vs FIP gap: ${gap} — ERA is ${era > fip ? 'HIGHER than FIP (getting unlucky, watch for him to pitch better than the ERA suggests)' : 'LOWER than FIP (results better than process so far, watch for it to even out)'}`
      : ''
    const h2h = side === 'away' && inputs.away_pitcher_vs_opponent_record && inputs.away_pitcher_vs_opponent_era
      ? ` | Career vs ${inputs.home_team.split(' ').pop()}: ${inputs.away_pitcher_vs_opponent_record}, ${inputs.away_pitcher_vs_opponent_era} ERA`
      : side === 'home' && inputs.home_pitcher_vs_opponent_record && inputs.home_pitcher_vs_opponent_era
      ? ` | Career vs ${inputs.away_team.split(' ').pop()}: ${inputs.home_pitcher_vs_opponent_record}, ${inputs.home_pitcher_vs_opponent_era} ERA`
      : ''
    const lastStart = side === 'away' && inputs.away_pitcher_last_start
      ? ` | Last start: ${inputs.away_pitcher_last_start}`
      : side === 'home' && inputs.home_pitcher_last_start
      ? ` | Last start: ${inputs.home_pitcher_last_start}`
      : ''
    const openerNote = (side === 'away' ? awayIsOpener : homeIsOpener) ? `\n  ${openerLabel(p)}` : ''
    const injuryFlag = side === 'away' ? inputs.away_pitcher_injury_return : inputs.home_pitcher_injury_return
    const injuryNote = injuryFlag
      ? `\n  ⚠ CONFIRMED INJURY RETURN: ${injuryFlag.injury_type}, ${injuryFlag.starts_since_return} start(s) since return. This is the ONLY injury information you have for this pitcher — do not add detail beyond this.`
      : ''

    return `- ${teamName} (${side}): ${p.player_name}
  ERA: ${era ?? 'N/A'} | FIP (luck-adjusted): ${fip ?? 'N/A'} | K/9: ${p.k_per_9 ?? 'N/A'} | BB/9: ${p.bb_per_9 ?? 'N/A'} | IP: ${p.innings_pitched ?? 0} in ${p.games_played ?? '?'} apps${gapNote}${h2h}${lastStart}${openerNote}${injuryNote}`
  }

  function bullpenLine(t: any, teamName: string): string {
    if (!t) return ''
    const ip = t.bullpen_innings_yesterday ?? 0
    const taxedNote = ip >= 3 ? ` ⚠ TAXED — threw ${ip} innings yesterday, key arms may be unavailable` : ip >= 1.5 ? ` (used yesterday — ${ip} IP)` : ' (fresh)'
    return `- ${teamName}: ERA ${t.bullpen_era?.toFixed(2) ?? 'N/A'}${taxedNote}`
  }

  function offenseLine(t: any, teamName: string): string {
    if (!t) return ''
    return `- ${teamName}: ${t.runs_per_game_l30?.toFixed(2) ?? 'N/A'} runs/game (last 30 days), OPS ${t.ops_l30 ?? 'N/A'} (OPS measures combined on-base ability and power hitting; above .750 is solid)`
  }

  function defenseLine(t: any, teamName: string): string {
    if (!t) return `- ${teamName}: no fielding data`
    if (t.oaa != null) {
      const oaa = t.oaa
      const desc = oaa >= 8 ? 'elite at converting batted balls into outs'
        : oaa >= 3 ? 'above average in the field'
        : oaa >= -2 ? 'about average defensively'
        : oaa >= -6 ? 'below average — gives up more hits than most teams'
        : 'poor defensively — balls that should be outs tend to fall in'
      return `- ${teamName}: ${desc} (${oaa > 0 ? '+' : ''}${oaa} outs above average vs league)`
    }
    if (t.errors_l30 != null) return `- ${teamName}: ${t.errors_l30} errors in last 30 days`
    return `- ${teamName}: no fielding data`
  }

  function parkDescription(): string {
    if (!park) return 'No park data'
    const hr = park.hr_factor ?? 1.0
    const run = park.run_factor ?? 1.0
    if (park.is_dome) return 'Dome — no weather impact, neutral conditions'
    const hrDesc = hr >= 1.15 ? 'very home-run friendly (balls carry well here)'
      : hr >= 1.05 ? 'slightly favours home runs'
      : hr <= 0.85 ? 'suppresses home runs significantly'
      : hr <= 0.95 ? 'slightly suppresses home runs'
      : 'neutral for home runs'
    const runDesc = run >= 1.10 ? ', high-scoring park overall'
      : run <= 0.90 ? ', pitcher-friendly park overall'
      : ''
    return `${inputs.venue_name}: ${hrDesc}${runDesc} (HR factor ${hr.toFixed(2)}, Run factor ${run.toFixed(2)})`
  }

  function weatherDescription(): string {
    if (inputs.is_dome || park?.is_dome) return 'Dome — no weather factor tonight.'
    const w = inputs.weather
    if (!w) return 'No weather data available for tonight — omit the weather category from game_day_notes.'
    const bits: string[] = []
    bits.push(`Temp: ${w.temp_f}°F (feels like ${w.feels_like_f}°F)`)
    bits.push(`Conditions: ${w.conditions}`)
    if (w.wind_mph != null) bits.push(`Wind: ${w.wind_mph} mph from ${w.wind_direction_text ?? ''}`)
    if (w.precipitation_chance != null) bits.push(`Precipitation chance: ${w.precipitation_chance}%`)
    if (w.cloud_cover != null) bits.push(`Cloud cover: ${w.cloud_cover}%`)
    return bits.join(' | ')
  }

  const homeP_hand = homeP?.throws ?? null
  const awayP_hand = awayP?.throws ?? null
  const platoonLines: string[] = []

  if (homeP_hand === 'L' && inputs.away_vs_lhp_record)
    platoonLines.push(`${inputs.away_team} vs left-handed pitching (home pitcher is lefty): ${inputs.away_vs_lhp_record}`)
  else if (homeP_hand === 'R' && inputs.away_vs_rhp_record)
    platoonLines.push(`${inputs.away_team} vs right-handed pitching: ${inputs.away_vs_rhp_record}`)
  if (awayP_hand === 'L' && inputs.home_vs_lhp_record)
    platoonLines.push(`${inputs.home_team} vs left-handed pitching (away pitcher is lefty): ${inputs.home_vs_lhp_record}`)
  else if (awayP_hand === 'R' && inputs.home_vs_rhp_record)
    platoonLines.push(`${inputs.home_team} vs right-handed pitching: ${inputs.home_vs_rhp_record}`)

  let seriesBlock = ''
  if (inputs.series_game_number && inputs.series_games_total) {
    const awayW = inputs.away_series_wins ?? 0
    const homeW = inputs.home_series_wins ?? 0
    const isRubber = inputs.series_game_number === inputs.series_games_total && awayW === homeW
    seriesBlock = `\nSERIES CONTEXT: ${isRubber
      ? `Deciding game — series tied ${awayW}-${homeW}`
      : `Game ${inputs.series_game_number} of ${inputs.series_games_total} — ${awayW > homeW ? inputs.away_team : inputs.home_team} leads ${Math.max(awayW, homeW)}-${Math.min(awayW, homeW)}`}${inputs.series_runs_so_far ? ` | Scoring so far: ${inputs.series_runs_so_far}` : ''}`
  }

  const streakSection = inputs.streaks ? buildStreakSection(inputs.streaks, inputs.home_team, inputs.away_team) : ''

  return `GAME: ${inputs.away_team} @ ${inputs.home_team}
VENUE: ${inputs.venue_name}${park?.is_dome ? ' (dome)' : ''}
MODEL READ: ${inputs.confidence_tier !== 'tossup' ? `${inputs.confidence_tier} signal toward ${winner}` : 'genuinely close'} ${seriesBlock}

═══ PITCHING DATA ═══
${pitcherAnalysis(awayP, inputs.away_team, 'away')}
${pitcherAnalysis(homeP, inputs.home_team, 'home')}

═══ BULLPEN ═══
${bullpenLine(awayT, inputs.away_team)}
${bullpenLine(homeT, inputs.home_team)}

═══ OFFENCE (last 30 days) ═══
${offenseLine(awayT, inputs.away_team)}
${offenseLine(homeT, inputs.home_team)}

═══ DEFENCE ═══
${defenseLine(awayT, inputs.away_team)}
${defenseLine(homeT, inputs.home_team)}

═══ PARK ═══
${parkDescription()}

═══ WEATHER ═══
${weatherDescription()}

═══ RECORDS ═══
- ${inputs.away_team}: ${awayT?.wins ?? '?'}-${awayT?.losses ?? '?'}
- ${inputs.home_team}: ${homeT?.wins ?? '?'}-${homeT?.losses ?? '?'}

═══ PITCH ARSENAL ═══
${homeP ? `- ${homeP.player_name}: ${homeP.pitch_types ?? 'N/A'}` : ''}
${awayP ? `- ${awayP.player_name}: ${awayP.pitch_types ?? 'N/A'}` : ''}
${platoonLines.length > 0 ? `\n═══ LINEUP MATCHUPS ═══\n${platoonLines.join('\n')}` : ''}
${streakSection}`
}

function buildStreakSection(streaks: GameStreaks, homeTeam: string, awayTeam: string): string {
  const lines: string[] = ['', '═══ RECENT FORM ═══']
  if (streaks.home_pitcher) {
    const p = streaks.home_pitcher
    const bits = []
    if (p.last_3_era !== null) bits.push(`${p.last_3_era} ERA last 3 starts`)
    if (p.last_3_k_per_9 !== null) bits.push(`${p.last_3_k_per_9} strikeouts per 9 innings last 3`)
    if (p.current_scoreless_innings >= 6) bits.push(`${p.current_scoreless_innings} consecutive scoreless innings`)
    if (bits.length > 0) lines.push(`- ${homeTeam} ${p.player_name}: ${bits.join(', ')}`)
  }
  if (streaks.away_pitcher) {
    const p = streaks.away_pitcher
    const bits = []
    if (p.last_3_era !== null) bits.push(`${p.last_3_era} ERA last 3 starts`)
    if (p.last_3_k_per_9 !== null) bits.push(`${p.last_3_k_per_9} strikeouts per 9 innings last 3`)
    if (p.current_scoreless_innings >= 6) bits.push(`${p.current_scoreless_innings} consecutive scoreless innings`)
    if (bits.length > 0) lines.push(`- ${awayTeam} ${p.player_name}: ${bits.join(', ')}`)
  }
  if (streaks.home_hot_batters.length > 0)
    lines.push(`- ${homeTeam} hot batters: ${streaks.home_hot_batters.slice(0, 2).map(b => `${b.player_name} (${b.streak_label})`).join(', ')}`)
  if (streaks.away_hot_batters.length > 0)
    lines.push(`- ${awayTeam} hot batters: ${streaks.away_hot_batters.slice(0, 2).map(b => `${b.player_name} (${b.streak_label})`).join(', ')}`)
  return lines.length > 1 ? lines.join('\n') : ''
}