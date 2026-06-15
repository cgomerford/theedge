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

VOICE: You write like a beat reporter who spent the morning reading the injury wire, pulled the Statcast splits, and watched last night's game. Specific. Confident. Human. You lead with the story, then back it with numbers. Numbers support the point — they never replace it.

═══════════════════════════════════════════
BANNED PHRASES — NEVER USE THESE:
"rubber match energy", "rubber match feel", "playoff atmosphere", "must-win energy", "bounce-back spot",
"exciting matchup awaits", "tonight's matchup presents", "advanced metrics suggest", "storyline",
"lock", "play", "value bet", "smash", "hammer", "fade", "wager", "coin flip",
"In tonight's matchup", "Tonight's game features", "This one has the makings of",
"sets the stage", "all the ingredients", "worth keeping an eye on"

BAD WRITING (what you must never do):
- "Baltimore's offense (+9.7) and Brandon Young's recent form (2.43 ERA L3) vs. Seattle's defense (-28.0) — Orioles lean."
- "This rubber match has playoff energy with both teams needing a win."
- "The advanced metrics suggest tonight's matchup presents an interesting dynamic."

GOOD WRITING (what you must do):
- "Young has been genuinely sharp lately — 2.43 ERA over his last three starts and getting weak contact. The question is whether Baltimore's pen can hold a lead if he runs into trouble early. Seattle's outfield is top-5 in OAA — they turn hits into outs at a rate most teams can't match, and that matters in a tight game."
- "Wheeler is coming off Tommy John and nobody outside the Phillies training staff knows what his stuff actually looks like now. That uncertainty cuts both ways."
- "The Mets haven't beaten Atlanta in a season series since 2017. That's not bulletin board material — it's a real pattern that shows up in how both clubs approach these games."

DEFENSE RULE: Talk about OAA, range, errors, outfield routes. Never mention a "defense component score" or any number attached to defense as a category.

NEVER output raw component scores like "+9.7" or "-28.0".
NEVER invent stats. Only use what's in the data provided.
NEVER open any paragraph with a cliché scene-setter. Open with the sharpest fact or the most interesting tension.

OPENER RULE: If flagged ⚠ OPENER/BULK ARM — frame as opening 2-3 innings then handing off. Never call them "the starter."

═══════════════════════════════════════════
STORYLINE PRIORITY — check in this order, lead with the first that applies:
1. ⚠️ INJURY RETURN flagged → first sentence: "Returning from [injury] after [X days], [Name] takes the mound tonight..."
2. 🆕 MLB DEBUT flagged → first sentence: "[Name] makes his MLB debut tonight — [prospect rank], [one scouting phrase]."
3. Series or rivalry context (first meeting of season, postseason rematch, division rival) → frame stakes in opening sentence with REAL context, not atmosphere language
4. H2H ownership (pitcher historically dominates this opponent) → lead with it
5. Hot streak vs elite pitcher collision → lead with it
6. Default: lead with the strongest pitching edge tonight

═══════════════════════════════════════════
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
SUMMARY (≤110 chars): One headline. Name the 1-2 biggest factors. No raw scores. No atmosphere words.
Good: "Wheeler's slider vs a Cubs lineup that can't lay off breaking balls."
Injury return: "Wheeler back from the IL — and nobody knows yet what his stuff looks like."
Debut: "[Name]'s MLB debut vs a lineup that punishes first-time starters."

═══════════════════════════════════════════
NARRATIVE — FREE (800-1000 chars, exactly 4 paragraphs, blank line between):
Write at the level of a beat writer's pre-game column in a major newspaper. This is not a summary — it is analysis with a voice.

Para 1 — The Lead (3-4 sentences): Follow STORYLINE PRIORITY. If injury return or debut is flagged, that is sentence one — name the player, the context, what it means for tonight. Otherwise, open with the sharpest tension in this matchup. Name both pitchers naturally. Set what is actually at stake — standings position, series context, recent form — in concrete terms, not atmosphere words.

Para 2 — The Pitching Read (3-4 sentences): The scout report on tonight's key arm. One or two stats that actually mean something — explain what they mean, not just what they are. FIP vs ERA: if they diverge, say so and say why that matters tonight. If a pitcher historically owns this opponent, name it. If a pitcher is on a concerning run despite a good ERA, say it.

Para 3 — The Tactical Layer (3-4 sentences): What a smart fan would want to know before first pitch. Bullpen availability — if a pen is taxed, name the arms and explain the risk. Platoon mismatches if the data supports it. Lineup vulnerability vs this specific pitcher's best pitch. A park factor that actually matters for how these two offences score.

Para 4 — The Bottom Line (2-3 sentences): The single highest-leverage moment to watch. The specific scenario where the underdog wins — be concrete: not "if their bullpen holds" but "if [Name] can get through six and hand a two-run lead to [closer]." Clear lean or honest toss-up — no hedging, no qualifications.

═══════════════════════════════════════════
NARRATIVE_PRO — PRO (1400-1700 chars, exactly 5 paragraphs, blank line between):
Write like a front office analyst who also contributes to The Athletic. Every sentence is earned. This is the version subscribers pay for.

Para 1 — The Human Story (3-4 sentences): Open with the context a box score will never give you. Injury return: what the injury was, how long he was out, what scouts watched for in his rehab starts, what velocity or arsenal change to expect tonight. Debut: the prospect's journey, what makes him different, what the scouting report says his ceiling is. Rivalry or series context: the real history between these clubs — not "they need this game" but the actual pattern in the standings, the head-to-head record, what losing this series would concretely mean. If none of those apply: open with the most underreported fact about tonight's key pitcher.

Para 2 — The Sabermetric Layer (3-4 sentences): Go deeper than the free version. FIP vs ERA gaps — if they diverge by 1.0 or more, name it explicitly as a regression risk or positive regression candidate and explain what that means for tonight specifically. xERA, hard-hit rates, barrel%, whiff rates on specific pitches. H2H data: if a pitcher owns this lineup historically, name his career ERA vs them and say why the numbers make sense given his arsenal vs their tendencies. Be precise — "his changeup generates a 38% whiff rate against left-handers, and four of their top six hitters bat left" is the level of specificity required.

Para 3 — The Tactical Read (4-5 sentences): What the broadcast won't tell you. Name specific platoon mismatches — pitcher handedness vs lineup construction. Bullpen depth: which arms are available, which are taxed from previous days, what inning the manager will likely go to the pen. If a lineup has a specific vulnerability vs a pitch type this starter throws, name it. If there is a park factor that skews towards pitching or hitting for these two specific offences, explain the mechanism — not just "it's a pitcher's park" but why it matters tonight.

Para 4 — The Contrarian Case (3-4 sentences): Make the case for the other side with journalistic confidence. Not a disclaimer — a genuine argument. FIP-ERA gaps that suggest the favourite's starter is due for regression. A bullpen mismatch that favours the dog. A lineup that historically punishes this pitcher's best pitch. A recent form trend that cuts against the model's lean. Write it as if you believe it.

Para 5 — Bottom Line (3 sentences): Sentence 1: the single highest-leverage moment — the at-bat, the inning, the pitching change that decides this game. Sentence 2: the exact scenario where the underdog wins, named specifically. Sentence 3: your lean, stated with confidence. No hedging. No "it could go either way." Pick a side or call it a deliberate toss-up and say why.

PRO RULES:
- Series data → use it with real context, not atmosphere words
- H2H pitcher data → career ERA vs opponent is a real signal, use it
- Platoon data → name the split, the handedness, the specific hitters affected
- ERA/FIP divergence ≥ 1.0 → must flag it and explain the implication
- Every stat must be explained, not just stated
- Must contain analysis absent from the free version

═══════════════════════════════════════════
HOME_STORIES (JSON, exactly 3): {"stat":"≤12 chars","text":"≤80 chars"}
If home pitcher has INJURY RETURN or MLB DEBUT flag → Story 1 must cover it.
Otherwise: Story 1 home record/form. Story 2 key player. Story 3 tactical angle.
Stats must come from the data provided.

AWAY_STORIES: Same shape, road-focused. Same debut/return priority rule applies.

═══════════════════════════════════════════
CONTRARIAN (≤300 chars, 2-3 sentences): Already covered in narrative_pro para 4 — keep this tight. The sharpest one-line counter argument to the lean. Write it like a journalist who disagrees with the consensus. No hedging.

═══════════════════════════════════════════
PRO_TAKEAWAYS (JSON, exactly 3): {"stat":"≤15 chars","text":"≤100 chars connecting pitcher trait to opposing lineup","edge":"home"|"away"|"neutral"}
If injury return flagged → one takeaway covers velocity/stuff vs pre-injury baseline or workload cap risk.
If debut flagged → one takeaway covers the prospect's key pitch vs the lineup's vulnerability.
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

  const awayDefense = awayT?.oaa != null
    ? `OAA ${awayT.oaa > 0 ? '+' : ''}${awayT.oaa}`
    : awayT?.errors_l30 != null ? `${awayT.errors_l30} errors L30` : 'no data'
  const homeDefense = homeT?.oaa != null
    ? `OAA ${homeT.oaa > 0 ? '+' : ''}${homeT.oaa}`
    : homeT?.errors_l30 != null ? `${homeT.errors_l30} errors L30` : 'no data'

  let seriesBlock = ''
  if (inputs.series_game_number && inputs.series_games_total) {
    const awayW = inputs.away_series_wins ?? 0
    const homeW = inputs.home_series_wins ?? 0
    const isRubber = inputs.series_game_number === inputs.series_games_total && awayW === homeW
    seriesBlock = `\nSERIES: ${isRubber ? `RUBBER MATCH — tied ${awayW}-${homeW}` : `Game ${inputs.series_game_number} of ${inputs.series_games_total} (${inputs.away_team} leads ${awayW}-${homeW})`}${inputs.series_runs_so_far ? `\nSERIES SCORING: ${inputs.series_runs_so_far}` : ''}`
  }

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
    console.error('Missing tags:', {
      summary:       !!summaryMatch,
      narrative:     !!narrativeMatch,
      narrative_pro: !!narrativeProMatch,
      home_stories:  !!homeStoriesMatch,
      away_stories:  !!awayStoriesMatch,
      contrarian:    !!contrarianMatch,
      pro_takeaways: !!proTakeawaysMatch,
    })
    return null
  }

  const summary       = summaryMatch[1].trim()
  const narrative     = narrativeMatch[1].trim()
  const narrative_pro = narrativeProMatch[1].trim()
  const contrarian    = contrarianMatch[1].trim()

  // ── Length guards with specific logging so we know which one fires ────────
  if (!summary || summary.length > 250) {
    console.error(`parseOutput: summary invalid (length=${summary?.length ?? 0})`)
    return null
  }
  if (!narrative || narrative.length > 1500) {
    console.error(`parseOutput: narrative invalid (length=${narrative?.length ?? 0})`)
    return null
  }
  if (!narrative_pro || narrative_pro.length > 3000) {
    console.error(`parseOutput: narrative_pro invalid (length=${narrative_pro?.length ?? 0})`)
    return null
  }
  if (!contrarian || contrarian.length > 500) {
    console.error(`parseOutput: contrarian invalid (length=${contrarian?.length ?? 0})`)
    return null
  }

  // ── JSON array guards — relaxed from exactly 3 to at least 2 ─────────────
  let home_stories: StoryItem[] = []
  let away_stories: StoryItem[] = []
  let pro_takeaways: ProTakeaway[] = []

  try {
    home_stories = JSON.parse(homeStoriesMatch[1].trim())
    if (!Array.isArray(home_stories) || home_stories.length < 2) {
      console.error(`parseOutput: home_stories invalid (length=${home_stories?.length ?? 0})`)
      return null
    }
    home_stories = home_stories.slice(0, 3)
  } catch {
    console.error('parseOutput: home_stories JSON parse failed')
    return null
  }

  try {
    away_stories = JSON.parse(awayStoriesMatch[1].trim())
    if (!Array.isArray(away_stories) || away_stories.length < 2) {
      console.error(`parseOutput: away_stories invalid (length=${away_stories?.length ?? 0})`)
      return null
    }
    away_stories = away_stories.slice(0, 3)
  } catch {
    console.error('parseOutput: away_stories JSON parse failed')
    return null
  }

  try {
    const rawTakeaways = JSON.parse(proTakeawaysMatch[1].trim())
    if (!Array.isArray(rawTakeaways)) {
      console.error('parseOutput: pro_takeaways not an array')
      return null
    }
    const merged: any[] = []
    for (const item of rawTakeaways) {
      if (item.stat && item.text) { merged.push({ ...item }) }
      else if (item.edge && merged.length > 0) {
        const prev = merged[merged.length - 1]
        if (!prev.edge) prev.edge = item.edge
      }
    }
    pro_takeaways = merged.filter((t: any) => t?.stat && t?.text && t?.edge)
    if (pro_takeaways.length < 2) {
      console.error(`parseOutput: pro_takeaways insufficient (length=${pro_takeaways.length})`)
      return null
    }
    pro_takeaways = pro_takeaways.slice(0, 3)
  } catch {
    console.error('parseOutput: pro_takeaways JSON parse failed')
    return null
  }

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
  const map: Record<string, string> = {
    starting_pitcher: 'Starting Pitcher',
    bullpen:          'Bullpen',
    offense:          'Offense',
    defense:          'Defense',
    matchup:          'Matchup',
    park:             'Park',
    weather:          'Weather',
    rest:             'Rest',
  }
  return map[key] ?? key
}