export const maxDuration = 800
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import type { GameWeather, TeamForm } from '@/lib/mlb'
import type { EdgeScoreResult } from './edge'
import type { GameStreaks } from './streaks'

// Initialize the Gemini Client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const MODEL = 'gemini-3.5-flash'

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
  // Enhanced fields for full analyst breakdown
  key_matchups?: { matchup: string; insight: string }[]
  game_flow?: string
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
      description: "Free version narrative — exactly 5 flowing prose paragraphs, fully developed (4-6 sentences each), separated by a single blank line, following the story arc defined in the system prompt (Hook → Pitching Matchup → Lineups & Hitters to Watch → Bullpen & Game Management → At the Ballpark). PLAIN TEXT ONLY: no markdown headers, no **bold**, no bullet points, no asterisks of any kind. Do not organize paragraphs by data category in the order given — see STRUCTURE in the system prompt. This is a preview of the whole game, not a pitching report." 
    },
    narrative_pro: { 
      type: SchemaType.STRING, 
      description: "Pro version narrative — exactly 6 flowing prose paragraphs, same plain-text rule and story arc as 'narrative', with one added paragraph (after the pitching matchup) of front-office-level depth — FIP/ERA gaps, OAA, leverage, platoon-split numbers — woven into prose, not a labeled breakdown." 
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
          text: { type: SchemaType.STRING, description: "≤90 chars" } 
        },
        required: ["stat", "text"]
      },
      description: "Exactly 3 items — three distinct key stats for the home team, shown as bullets in the UI separately from the prose. Do not repeat a fact already used as the lead in paragraph 1. Spread across different areas (pitching, offense, bullpen, defense) rather than three angles on the same player."
    },
    away_stories: { 
      type: SchemaType.ARRAY, 
      items: { 
        type: SchemaType.OBJECT, 
        properties: { 
          stat: { type: SchemaType.STRING, description: "≤12 chars" }, 
          text: { type: SchemaType.STRING, description: "≤90 chars" } 
        },
        required: ["stat", "text"]
      },
      description: "Exactly 3 items — three distinct key stats for the away team, shown as bullets in the UI separately from the prose. Do not repeat a fact already used as the lead in paragraph 1. Spread across different areas (pitching, offense, bullpen, defense) rather than three angles on the same player."
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
          text: { type: SchemaType.STRING, description: "≤140 chars practical tip. For 'weather', include what it will actually feel like at the ballpark (temperature, wind, rain risk) and anything a fan attending in person should consider, e.g. dress warm, bring a rain layer." }
        },
        required: ["category", "text"]
      }
    },
    // New fields for full analyst breakdown
    key_matchups: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          matchup: { type: SchemaType.STRING, description: "Short description e.g. 'Star RF vs LHP sinker'" },
          insight: { type: SchemaType.STRING, description: "≤110 chars specific, watchable takeaway" }
        },
        required: ["matchup", "insight"]
      }
    },
    game_flow: {
      type: SchemaType.STRING,
      description: "2-4 sentences describing likely game shape (early scoring, middle-inning bullpen bridge, late leverage) based only on provided data."
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

const SYSTEM_PROMPT = `You are the lead beat reporter for The Edge — a premium, daily MLB pre-game briefing. Your job is to help fans watch tonight's game smarter, whether they are in the stands or on the couch.

WHO YOU'RE WRITING FOR: A baseball fan who wants the inside scoop before first pitch. Every sentence must earn its place by making the next three hours of baseball more interesting to watch. 

VOICE & TONE (CRITICAL): Write like a human journalist, not a robot reading a spreadsheet. 
- BAD (Robotic): "The [Away Team] will deploy [Pitcher A]. His 5.24 ERA and 5.32 FIP suggest his performance aligns with his results. Conversely, [Pitcher B] enters with a 1.57 ERA."
- GOOD (Journalistic): "[Pitcher A] takes the mound for [Away Team] tonight, though don't expect him to pitch deep into the evening. He's been operating as a short-stint bulk arm, which puts immediate pressure on a [Away Team] bullpen that was heavily taxed yesterday. On the other side, keep an eye on [Home Team]'s [Pitcher B] — he has been virtually untouchable over his last three starts, striking out more than a batter per inning."
- Tell the story first, and let the numbers support the story. Provide the "so what?" for every stat. Use pitch arsenal data when available to explain why a pitcher might succeed or struggle against this lineup.

═══════════════════════════════════════════
PROSE STYLE — NO MARKDOWN, EVER:
Write narrative and narrative_pro as continuous newspaper prose, the kind a reader scrolls through rather than scans.
- NO markdown headers — no #, ##, or ###, not even conversational ones.
- NO bold text — no **asterisks** around names, stats, or anything else.
- NO bullet points or numbered lists inside narrative or narrative_pro. (The 3-stat bullets live in home_stories/away_stories, a separate field — never duplicate them verbatim inside the prose.)
- Paragraphs are separated by a single blank line. That is the only structure.
- Model the rhythm of real MLB beat writing: stats arrive as evidence inside a sentence — "his FIP sits nearly a full run below his ERA, the kind of gap that usually closes" — never as a labeled stat line sitting on its own.

═══════════════════════════════════════════
STRUCTURE — A FULL GAME PREVIEW, NOT A PITCHING REPORT:
You will be handed data in labeled blocks (pitching, bullpen, offense, defense, park, weather, recent form). Do NOT mirror that order in your output.

For narrative (exactly 5 fully developed paragraphs, 4-6 sentences each):
1. THE HOOK — Open with whatever ranks highest in STORYLINE PRIORITY below. Set a scene or stake before you explain anything. No stats in the first sentence.
2. THE PITCHING MATCHUP — The starters: their form, the story behind their numbers, any real head-to-head history, and how their arsenal matches up against the opposing lineup.
3. LINEUPS & HITTERS TO WATCH — Who on each side is hot, cold, or facing a platoon disadvantage right now, and why it matters against tonight's starter. This paragraph must always exist.
4. BULLPEN & GAME MANAGEMENT — How recent bullpen workload on either side could shape the middle and late innings tonight.
5. AT THE BALLPARK — Fold together park factors and weather into what it will actually feel like to be there or to watch tonight. Close on a specific, forward-looking moment worth tracking once the game starts.

For narrative_pro (exactly 6 paragraphs): the same arc, with one additional paragraph inserted after paragraph 2 — front-office-level depth (FIP/ERA gaps, OAA, leverage, platoon-split numbers) woven as analysis in prose.

home_stories and away_stories: exactly 3 entries per team, shown as bullets in the UI separately from the prose. Each must be a genuinely distinct fact — spread across pitching, offense, bullpen, or defense.

═══════════════════════════════════════════
DATA DISCIPLINE — CRITICAL, NON-NEGOTIABLE:
- NEVER invent stats, injuries, roles, usage patterns, pitch-count tendencies, basestealing tendencies, or batter-vs-pitcher history. Only use what is explicitly present in the data block.
- NEVER invent quotes or attributed remarks.
- IF YOU CANNOT EXPLAIN A STAT IN PLAIN ENGLISH, DON'T USE IT.

INJURY & USAGE RULES:
- Only describe a player as returning from injury if an explicit injury flag exists.
- Default assumption is every listed starter goes 5+ innings unless opener profile is flagged.
- If a bullpen threw heavily yesterday, explicitly state how that impacts later innings.

═══════════════════════════════════════════
BANNED PHRASES:
"Conversely", "The [Team] will deploy", "enters tonight in dominant form", "rubber match energy", "must-win energy", "advanced metrics suggest", "positive regression candidate", "negative regression candidate", "the underlying numbers", "is a critical watch point", "what to watch for". 
Never frame either team as something to back, take, lean toward, or get value on. This is a viewing guide, not a betting pick.

═══════════════════════════════════════════
STORYLINE PRIORITY: Lead with the first that genuinely applies:
1. Confirmed injury-return flag 
2. MLB debut flagged 
3. Series or rivalry context with real stakes 
4. Pitcher with real career history against this specific opponent 
5. A hitter on a notable hot or cold streak running into a relevant pitching matchup 
6. Significant bullpen fatigue on one side
7. Default: lead with whatever's most watchable about tonight's pitching matchup`

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
    
    const modelInstance = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: narrativeSchema as any,
        temperature: 0.2
      }
    })

    const result = await modelInstance.generateContent(userPrompt)
    const responseText = result.response.text()

    const parsed = JSON.parse(responseText)
    
    const promptTokens = result.response.usageMetadata?.promptTokenCount ?? 0
    const outputTokens = result.response.usageMetadata?.candidatesTokenCount ?? 0
    
const inputCost  = promptTokens * 0.0000015
const outputCost = outputTokens * 0.000009

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
      key_matchups:   parsed.key_matchups,
      game_flow:      parsed.game_flow,
      cost_usd:       inputCost + outputCost,
    }
  } catch (err) {
    console.error('Gemini narrative generation failed:', err)
    return null
  }
}

function buildKeyAngles(inputs: NarrativeInputs, awayIsOpener: boolean, homeIsOpener: boolean): string[] {
  const angles: string[] = []
  const awayP = inputs.components_raw?.away_pitcher
  const homeP = inputs.components_raw?.home_pitcher
  
  if (awayIsOpener || homeIsOpener) {
    angles.push("Opener/bulk situation active — bullpen management will decide the middle innings")
  }
  
  const injuryAway = inputs.away_pitcher_injury_return
  const injuryHome = inputs.home_pitcher_injury_return
  if (injuryAway) angles.push(`Away pitcher returning from ${injuryAway.injury_type} — only ${injuryAway.starts_since_return} start(s) back`)
  if (injuryHome) angles.push(`Home pitcher returning from ${injuryHome.injury_type} — only ${injuryHome.starts_since_return} start(s) back`)
  
  if (inputs.away_pitcher_vs_opponent_record) {
    angles.push(`Away starter has documented history vs home lineup: ${inputs.away_pitcher_vs_opponent_record}`)
  }
  if (inputs.home_pitcher_vs_opponent_record) {
    angles.push(`Home starter has documented history vs away lineup: ${inputs.home_pitcher_vs_opponent_record}`)
  }
  
  if ((inputs.streaks?.home_hot_batters?.length ?? 0) > 0) {
    angles.push(`Home has multiple hot hitters: ${inputs.streaks!.home_hot_batters.slice(0, 2).map(b => b.player_name).join(', ')}`)
  }
  if ((inputs.streaks?.away_hot_batters?.length ?? 0) > 0) {
    angles.push(`Away has multiple hot hitters: ${inputs.streaks!.away_hot_batters.slice(0, 2).map(b => b.player_name).join(', ')}`)
  }
  
  return angles
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
  const keyAngles = buildKeyAngles(inputs, awayIsOpener, homeIsOpener)
  const anglesBlock = keyAngles.length > 0 
    ? `\n═══ KEY STORYLINES & WATCHABLE ANGLES ═══\n${keyAngles.map(a => `- ${a}`).join('\n')}\n` 
    : ''

  return `GAME: ${inputs.away_team} @ ${inputs.home_team}
VENUE: ${inputs.venue_name}${park?.is_dome ? ' (dome)' : ''}
MODEL READ: ${inputs.confidence_tier !== 'tossup' ? `${inputs.confidence_tier} signal toward ${winner}` : 'genuinely close'} ${seriesBlock}${anglesBlock}

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