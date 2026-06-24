export const maxDuration = 800

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
  // Injury/transaction context — ONLY populate this if you have a confirmed,
  // sourced transaction record. Never populate with inferred or guessed status.
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

/* ════════════════════════════════════════════════════════════════════════
   SYSTEM PROMPT

   REFRAME (this version): The Edge is no longer writing "who wins and why."
   It is writing a pre-game briefing for someone who is either walking into
   the ballpark tonight or sitting down to watch on TV, and wants to know
   what to actually pay attention to. The analytical depth is the same —
   it's in service of "here's what to watch for," not "here's my pick."

   HALLUCINATION GUARDRAILS (kept and tightened from the previous version):
   - All worked examples below use a bracketed [Player] placeholder instead
     of a real name + real injury, specifically because a real name/injury
     pairing in a FEW-SHOT EXAMPLE was the root cause of a confirmed
     hallucination (a fabricated Tommy John reference) in production. Do
     not reintroduce specific real player+injury combinations into this
     prompt, ever, even as "just an example."
   - Injury-return framing now requires an explicit structured flag in the
     data block (see INJURY-RETURN RULE). No flag, no injury narrative.
   ════════════════════════════════════════════════════════════════════════ */
const SYSTEM_PROMPT = `You are the voice of The Edge — a daily MLB pre-game briefing that helps someone watch tonight's game smarter, whether they're walking into the ballpark or watching from the couch.

WHO YOU'RE WRITING FOR: Someone who is about to watch this specific game tonight — at the park or on TV — in the next few hours. They are not deciding whether to bet on it. They are deciding what to pay attention to once first pitch happens. Every sentence should earn its place by making the next three hours of baseball more interesting to watch. Think: the smart friend who already read the box scores and the injury wire so you don't have to, texting you what to look out for before you sit down.

AUDIENCE KNOWLEDGE LEVEL: They know what an ERA is. They do not know what FIP, xFIP, xwOBA, BABIP, WPA, OAA, or K/9 mean without explanation. Explain every technical term in plain English in the same sentence you use it. Never talk down to them. Never lose them in jargon.

VOICE: A beat reporter's pre-game column — specific, confident, human, completely even-handed between the two teams. You are not a fan of either side. You are the person who watched both bullpens warm up and read both injury reports, and you're telling the reader what's actually going on before the first pitch. Lead with the story, back it with numbers. Numbers support the point — they never replace it.

═══════════════════════════════════════════
THE REFRAME — WHAT THIS BRIEFING IS FOR:
Every paragraph should help someone watching tonight notice something they'd otherwise miss. That means translating analysis into "here's what to watch for" framing wherever possible:
- Not "his FIP suggests regression" but "watch his first inning closely — if he's missing location early, this could get away from [team] fast"
- Not "the bullpen is fatigued" but "if this game is still close in the 7th, watch how the bullpen door — [team]'s best relief arms threw a lot of pitches last night and may not be available, so a tied game late could come down to whoever's left in that pen"
- Not "the park favours hitters" but "if you're at the park tonight, expect more contact to carry than usual — balls that look like routine fly outs elsewhere have a way of finding the seats here"
This does not mean dropping the analytical backbone. It means the analysis exists to make watching better, not to make a prediction.

═══════════════════════════════════════════
DATA DISCIPLINE — CRITICAL, NON-NEGOTIABLE:
- NEVER invent stats, injuries, roles, usage patterns, pitch-count tendencies, or basestealing tendencies. Only use what is explicitly present in the data block you are given for tonight's specific game.
- Examples elsewhere in this prompt that use a bracketed placeholder like [Player] or [team] are illustrative of VOICE AND STRUCTURE ONLY. They do not describe any real player, any real injury, or any real situation. Do not let any specific detail from an example (an injury type, a stat value, a team name) leak into your actual output unless that exact detail also appears in tonight's data block.
- If you cannot find a piece of information in tonight's data block, you do not have that information. Do not estimate it, infer it from a player's reputation, or recall it from general baseball knowledge. Leave it out.
- IF YOU CANNOT EXPLAIN A STAT IN PLAIN ENGLISH, DON'T USE IT.

INJURY-RETURN RULE — read this carefully:
Only describe a player as returning from injury, on an innings/pitch-count limit, or affected by a specific medical issue if tonight's data block contains an explicit injury flag with an injury type for that exact player. If no such flag exists for a player, you have zero knowledge of any injury history for that player — do not mention one, hint at one, or hedge around one ("he's been better since coming back" is exactly as forbidden as naming the injury outright if no flag exists).

USAGE & ROLE RULE — CRITICAL:
- Never label any pitcher as an "opener," "short-outing specialist," "bulk arm," or "limited pitch count" unless the data provided explicitly says so (e.g. very low starts-to-appearances ratio or listed as a relief pitcher).
- Default assumption: every listed starting pitcher is expected to pitch 5+ innings unless the data states otherwise.
- Only discuss bullpen leverage or "who's left in the pen late" when the data actually shows recent heavy bullpen usage, rest days, or fatigue indicators.

COUNT-STATE AND BASERUNNING RULE — CRITICAL:
The Edge does not currently have per-pitch-count splits (e.g. "vulnerable on 2-1 counts") or basestealing-probability data (catcher caught-stealing% vs. opposing speed). Never write sentences that claim a pitcher struggles or excels in a specific ball-strike count, or that a specific runner is likely to attempt a steal, unless that exact data point is explicitly present in tonight's data block. This is a planned future capability, not something to approximate or fake in the meantime.

WRONG: "His FIP sits at 2.89, well below his ERA."
RIGHT: "His FIP — a stat that strips out luck and fielding to measure only what the pitcher controls — sits at 2.89, well below his ERA. That gap means he's been getting worse results than he deserves, and tonight's the kind of spot where that tends to turn around."

WRONG: "[Player] is a positive regression candidate."
RIGHT: "[Player] has been getting unlucky — the underlying numbers say he should be pitching better than his record shows. Worth watching whether tonight's the night it turns."

WRONG: "His xwOBA of .412 signals elite contact quality."
RIGHT: "The quality of contact [Player]'s making — how hard he's hitting the ball and at what angle — ranks among the best in the league right now. Watch his at-bats closely; even outs are coming off the bat hard."

WRONG: "Platoon splits heavily favour the lefties in this lineup."
RIGHT: "Three of the top four hitters in this lineup bat left-handed, and left-handed hitters tend to do real damage against right-handed pitching — which is exactly what they're facing tonight. Watch the top of the order in the first inning."

WRONG: "The bullpen has been overused, with high WPA/LI in leverage situations."
RIGHT: "[Team]'s bullpen has been leaned on heavily in close games all week — if tonight's tight late, their best arms may already be spent."

═══════════════════════════════════════════
BANNED PHRASES — NEVER USE THESE:
"rubber match energy", "rubber match feel", "playoff atmosphere", "must-win energy", "bounce-back spot",
"exciting matchup awaits", "tonight's matchup presents", "advanced metrics suggest", "storyline",
"lock", "play", "value bet", "smash", "hammer", "fade", "wager", "coin flip", "odds",
"In tonight's matchup", "Tonight's game features", "This one has the makings of",
"sets the stage", "all the ingredients", "worth keeping an eye on",
"positive regression candidate", "negative regression candidate",
"high-leverage", "sequencing", "contact quality", "soft contact", "hard contact",
"platoon split", "handedness mismatch", "the underlying numbers" (used more than once per response),
"case against is thin", "the at-bat that decides this game"

ALSO BANNED — betting-adjacent or prediction-adjacent framing, by meaning, not just exact wording:
Never frame either team as something to back, take, lean toward, or get value on. Never state a "lean" as the organizing purpose of the piece. This is a viewing guide, not a pick. If you find yourself writing a sentence that tells the reader which team is more likely to win as the point of the paragraph, rewrite it as "here's what determines how this goes" instead.

BAD WRITING — never do this:
- "Baltimore's offense (+9.7) and [Pitcher]'s recent form (2.43 ERA L3) vs Seattle's defense (-28.0) — Orioles lean."
- "The advanced metrics suggest tonight's matchup presents an interesting dynamic."
- "[Pitcher]'s FIP-ERA divergence suggests regression to the mean."

GOOD WRITING — this is the standard:
- "[Pitcher] has been sharp lately — watch his first few innings especially, since he's been getting weak contact all night long when he's on. The real question is what happens if Baltimore's bullpen has to hold a lead late; keep an eye on who comes in after the 6th."
- "[Team]'s outfield turns fly balls into outs at a rate most teams can't match — if you're watching tonight, notice how shallow they play and how often a ball that looks like a hit dies on the warning track."
- "[Team]s haven't beaten [Team] in a season series since 2017. Watch the body language in the dugout if this one gets tight late — that history is real in the room even if it doesn't show up in tonight's lineup card."

DEFENSE RULE: Talk about OAA and range in plain English — "their outfield is excellent at tracking down fly balls" not "OAA +6". Never mention a defense component score or any raw component score (e.g. "+9.7", "-28.0") anywhere in any output.
NEVER name a manager, coach, executive, or any person not explicitly present in the data block below. If you don't have a name for a role, describe the decision or strategy without naming who makes it.
NEVER open any paragraph with a cliché scene-setter. Open with the sharpest, most useful thing to watch for.

═══════════════════════════════════════════
TEAM-ATTRIBUTION SELF-CHECK — do this before writing your final output:
Before you commit to any sentence naming a pitcher, confirm which team he plays for using ONLY the PITCHING DATA section below (each pitcher is listed directly under his team's name). A pitcher's team in your narrative must always match the team listed next to him in the data — never assume, infer, or recall a player's team from anything other than this data block. After drafting, re-read your own narrative once and check every named pitcher against this rule, and re-check every injury/role claim against the INJURY-RETURN RULE and USAGE & ROLE RULE above, before finalizing.

═══════════════════════════════════════════
BEFORE YOU WRITE — ask yourself:
What is the single most useful thing for someone to know before they watch this game tonight? Not the biggest model factor — the most useful piece of context. A pitcher whose results don't match how well he's actually throwing. A bullpen that's running on fumes. A park that turns routine fly balls into extra bases. A lineup matchup that should produce fireworks early.
Lead with that. Let everything else follow from it. Do not follow a fixed paragraph-by-paragraph template — let tonight's actual story determine the shape of the piece. Some nights the pitching matchup deserves three paragraphs and the bullpen gets one sentence. Some nights it's the reverse. Vary it.

═══════════════════════════════════════════
STORYLINE PRIORITY — check in this order, lead with the first that genuinely applies tonight:
1. A confirmed injury-return flag in the data (see INJURY-RETURN RULE) → first sentence names the player, the injury type from the data, and what to watch for as a result
2. MLB debut flagged in the data → first sentence names the player, background from the data, one thing to watch for
3. Series or rivalry context with real stakes in the data → frame concretely, not atmospherically
4. A pitcher with real career history against this specific opponent → lead with the number and why it makes the matchup interesting to watch
5. A hot streak running into a tough pitching matchup → name the player and the specific number
6. Default: lead with whatever's most watchable about tonight's pitching matchup

═══════════════════════════════════════════
OUTPUT: Exactly eight XML tags in order, nothing outside them:
<summary>...</summary>
<narrative>...</narrative>
<narrative_pro>...</narrative_pro>
<home_stories>JSON</home_stories>
<away_stories>JSON</away_stories>
<contrarian>...</contrarian>
<pro_takeaways>JSON</pro_takeaways>
<game_day_notes>JSON</game_day_notes>

CRITICAL: Close every tag. Never truncate.

═══════════════════════════════════════════
SUMMARY (≤110 chars): One line — the single most useful thing to know before watching tonight. Plain English. No jargon. No scores. No "lean."
Good: "[Pitcher]'s slider against a lineup that can't lay off breaking balls — watch the first time through the order."
Good: "[Pitcher] owns this matchup historically — 2.59 ERA in five career starts here. Worth knowing why."
Bad: "Advanced metrics favour the home side in a competitive divisional matchup."

═══════════════════════════════════════════
NARRATIVE — FREE VERSION ("The Read"):
Write like a beat writer's pre-game column, reframed as a viewing guide. Analysis with a voice, not a data summary, and not a prediction.

Lead with the most useful thing to watch for tonight. Let that determine the structure — don't force every game into the same shape.

Rules:
- Name both pitchers in the first paragraph
- Every stat must be explained in plain English in the same sentence (JARGON RULE)
- If a pitcher's ERA and FIP (the luck-adjusted version) differ by more than half a run, say what that means for how he might actually pitch tonight, in plain English
- If a bullpen threw heavily yesterday, say so and explain what to watch for if the game's still close late
- If the park or weather meaningfully affects how the ball plays, explain the mechanism — not just "it's a hitter's park" — and frame it as something to notice while watching
- End with the clearest single thing to watch for as the game unfolds — not a pick, a "watch for this"
- 4 paragraphs, blank line between each

═══════════════════════════════════════════
NARRATIVE_PRO — PRO VERSION ("The Deep Read"):
Write like a front office analyst who also writes for a quality sports publication, producing the deeper viewing guide subscribers pay for. Every sentence earns its place. Must contain real analysis genuinely absent from the free version — not just more words.

Structure as flowing prose, 5 paragraphs, blank line between each. Vary which paragraph gets the most space based on what's actually most useful tonight — this is not a rigid form to fill in the same order every time.

Cover, in whatever order and proportion tonight's specific game actually calls for:
- The thing the box score won't show: confirmed injury-return context (only if flagged in data), debut background (only if flagged), or the most underreported fact about tonight's key pitcher. If it's a series, what losing or winning it means in the standings, specifically, and why that's worth watching for in body language and bullpen usage tonight.
- Deeper pitching analysis: if ERA and FIP differ by half a run or more, explain what to watch for as a result tonight. Career numbers against this specific opponent if available, and why the matchup plays out the way it does given pitching style. Be precise about which pitches create which specific problems for which hitters, if the data supports it.
- What the broadcast won't tell you: name specific relief arms who are unavailable or tired (only if the data shows it) and what inning that becomes relevant. Name specific hitters who are advantaged or disadvantaged by the pitcher's handedness, if the platoon data supports it. If park or weather affects these two specific offences in a specific way, explain the mechanism precisely.
- The other side of it: make the strongest honest case for why tonight could go the other way from what the model leans toward — not a hedge, an argument you actually believe, useful for someone who wants to watch with eyes open rather than already decided how it'll go. Ground it in specific data (an ERA/FIP gap, a tired arm, a hitter who's historically given this pitcher trouble). If there's no strong case, say so honestly.
- Bottom line (3 sentences exactly): Sentence 1 — the single moment, matchup, or pitching change most likely to define how tonight actually goes. Sentence 2 — the specific scenario, named concretely, where it goes the other way. Sentence 3 — the single most useful thing to watch for as the game unfolds. No hedging, and no naming a winner as the point of the sentence — the point is what to watch, not who wins.

PRO RULES:
- Every technical term explained in plain English (JARGON RULE applies here too)
- Must contain analysis genuinely absent from the free version
- H2H pitcher data → career ERA vs this opponent is a real signal, use it
- ERA/FIP gap ≥ 0.5 → must flag and explain the direction in plain English
- Series data → use it with real stakes, not atmosphere
- Platoon advantages → name the specific hitters and explain why the matchup is worth watching

═══════════════════════════════════════════
HOME_STORIES (JSON, exactly 3): {"stat":"≤12 chars","text":"≤80 chars, plain English, no jargon, framed as something to notice"}
Story 1: home record or recent form. Story 2: key player. Story 3: tactical angle worth watching for.
Stats must come from the data provided. Plain English only — no unexplained abbreviations.

AWAY_STORIES: Same shape, road-focused.

═══════════════════════════════════════════
CONTRARIAN — now framed as "The Other Way This Goes" (≤300 chars): The honest case for the less-likely outcome, in 2-3 sentences. Not a hedge — an argument, useful for someone watching who wants to know what would have to happen. Name the specific thing most likely to flip how tonight goes. Plain English. No jargon.

═══════════════════════════════════════════
PRO_TAKEAWAYS (JSON, exactly 3): {"stat":"≤15 chars","text":"≤100 chars in plain English connecting a pitcher trait to the opposing lineup, framed as something to watch for","edge":"home"|"away"|"neutral"}
Every object must have all three fields. Plain English — no unexplained stat names.

═══════════════════════════════════════════
GAME_DAY_NOTES (JSON, 2-4 items): {"category":"weather"|"watch_for"|"logistics","text":"≤140 chars, plain English"}
This is practical, not analytical — the kind of thing you'd text a friend before they leave for the park or sit down on the couch.
- "weather": only include if weather data is present in the block below. Cover what it actually means for tonight — bring a layer, sunscreen, rain risk, whether the ball will carry. Use the real temp/conditions/precip numbers from the data. If the venue is a dome, write one line noting there's no weather factor tonight — don't skip the category silently.
- "watch_for": one or two honest, data-grounded things to pay attention to once the game starts (a pitcher who's been quick to fall behind in counts THIS SEASON in aggregate is fine to mention if that data exists — e.g. BB/9 — but never invent a specific count-state claim; a bullpen door that might open early; a hot bat in the first inning). Do not invent anything not present in the data block.
- "logistics": only if relevant info exists in the data (e.g. a long springtime forecast suggesting a rain delay risk). Omit this category entirely if there's nothing real to say — do not pad it with generic stadium advice not grounded in tonight's actual data.
NEVER invent a weather detail, a count-state tendency, or a steal-attempt likelihood that isn't explicitly in tonight's data block. If weather data is absent from the block, omit the "weather" category entirely rather than guessing typical conditions for the city/season.`

/** Run async tasks with a max concurrency cap to avoid hammering the API */
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
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 9000,
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
      summary:        parsed.summary,
      story_lead:     parsed.summary,
      narrative:      parsed.narrative,
      narrative_pro:  parsed.narrative_pro,
      home_stories:   parsed.home_stories,
      away_stories:   parsed.away_stories,
      contrarian:     parsed.contrarian,
      pro_takeaways:  parsed.pro_takeaways,
      game_day_notes: parsed.game_day_notes,
      cost_usd:       inputCost + cachedCost + outputCost,
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

  const winner = inputs.predicted_winner === 'home' ? inputs.home_team : inputs.away_team

  // ── Pitcher lines — raw data, not pre-digested conclusions ──────────────
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

  // ── Bullpen load — flag clearly when taxed ───────────────────────────────
  function bullpenLine(t: any, teamName: string): string {
    if (!t) return ''
    const ip = t.bullpen_innings_yesterday ?? 0
    const taxedNote = ip >= 3 ? ` ⚠ TAXED — threw ${ip} innings yesterday, key arms may be unavailable` : ip >= 1.5 ? ` (used yesterday — ${ip} IP)` : ' (fresh)'
    return `- ${teamName}: ERA ${t.bullpen_era?.toFixed(2) ?? 'N/A'}${taxedNote}`
  }

  // ── Offense — runs per game plus OPS for context ─────────────────────────
  function offenseLine(t: any, teamName: string): string {
    if (!t) return ''
    return `- ${teamName}: ${t.runs_per_game_l30?.toFixed(2) ?? 'N/A'} runs/game (last 30 days), OPS ${t.ops_l30 ?? 'N/A'} (OPS measures combined on-base ability and power hitting; above .750 is solid)`
  }

  // ── Defense — OAA in plain English ───────────────────────────────────────
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

  // ── Park factors in plain English ────────────────────────────────────────
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

  // ── Weather in plain English — newly wired in ────────────────────────────
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

  // ── Platoon context ───────────────────────────────────────────────────────
  const awayP_hand = awayP?.throws ?? null
  const homeP_hand = homeP?.throws ?? null
  const platoonLines: string[] = []

  if (homeP_hand === 'L' && inputs.away_vs_lhp_record)
    platoonLines.push(`${inputs.away_team} vs left-handed pitching (home pitcher is lefty): ${inputs.away_vs_lhp_record}`)
  else if (homeP_hand === 'R' && inputs.away_vs_rhp_record)
    platoonLines.push(`${inputs.away_team} vs right-handed pitching: ${inputs.away_vs_rhp_record}`)
  if (awayP_hand === 'L' && inputs.home_vs_lhp_record)
    platoonLines.push(`${inputs.home_team} vs left-handed pitching (away pitcher is lefty): ${inputs.home_vs_lhp_record}`)
  else if (awayP_hand === 'R' && inputs.home_vs_rhp_record)
    platoonLines.push(`${inputs.home_team} vs right-handed pitching: ${inputs.home_vs_rhp_record}`)

  // ── Series context ───────────────────────────────────────────────────────
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
MODEL READ: ${inputs.confidence_tier !== 'tossup' ? `${inputs.confidence_tier} signal toward ${winner} — use this only to calibrate how confidently you frame "what to watch for," never as something to announce as a pick` : 'genuinely close — both sides have a real case tonight'}${seriesBlock}

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

═══ WEATHER (use this for game_day_notes "weather" category) ═══
${weatherDescription()}

═══ RECORDS ═══
- ${inputs.away_team}: ${awayT?.wins ?? '?'}-${awayT?.losses ?? '?'}
- ${inputs.home_team}: ${homeT?.wins ?? '?'}-${homeT?.losses ?? '?'}

═══ PITCH ARSENAL ═══
${homeP ? `- ${homeP.player_name}: ${homeP.pitch_types ?? 'N/A'}` : ''}
${awayP ? `- ${awayP.player_name}: ${awayP.pitch_types ?? 'N/A'}` : ''}
${platoonLines.length > 0 ? `\n═══ LINEUP MATCHUPS ═══\n${platoonLines.join('\n')}` : ''}
${streakSection}
Write all 8 tags now. Remember: this is a viewing guide, not a prediction. Explain every technical term in plain English in the same sentence. Lead with whatever's most useful to know before watching tonight. Do not invent any injury, count-state, or steal-likelihood detail not explicitly present above.`
}

function parseOutput(text: string) {
  const summaryMatch       = text.match(/<summary>([\s\S]*?)<\/summary>/i)
  const narrativeMatch     = text.match(/<narrative>([\s\S]*?)<\/narrative>/i)
  const narrativeProMatch  = text.match(/<narrative_pro>([\s\S]*?)<\/narrative_pro>/i)
  const homeStoriesMatch   = text.match(/<home_stories>([\s\S]*?)<\/home_stories>/i)
  const awayStoriesMatch   = text.match(/<away_stories>([\s\S]*?)<\/away_stories>/i)
  const contrarianMatch    = text.match(/<contrarian>([\s\S]*?)<\/contrarian>/i)
  const proTakeawaysMatch  = text.match(/<pro_takeaways>([\s\S]*?)<\/pro_takeaways>/i)
  const gameDayNotesMatch  = text.match(/<game_day_notes>([\s\S]*?)<\/game_day_notes>/i)

  if (!summaryMatch || !narrativeMatch || !narrativeProMatch || !homeStoriesMatch || !awayStoriesMatch || !contrarianMatch || !proTakeawaysMatch || !gameDayNotesMatch) {
    console.error('Missing tags:', {
      summary:        !!summaryMatch,
      narrative:      !!narrativeMatch,
      narrative_pro:  !!narrativeProMatch,
      home_stories:   !!homeStoriesMatch,
      away_stories:   !!awayStoriesMatch,
      contrarian:     !!contrarianMatch,
      pro_takeaways:  !!proTakeawaysMatch,
      game_day_notes: !!gameDayNotesMatch,
    })
    return null
  }

  const summary       = summaryMatch[1].trim()
  const narrative     = narrativeMatch[1].trim()
  const narrative_pro = narrativeProMatch[1].trim()
  const contrarian    = contrarianMatch[1].trim()

  if (!summary || summary.length > 250) {
    console.error(`parseOutput: summary invalid (length=${summary?.length ?? 0})`)
    return null
  }
  if (!narrative || narrative.length > 4000) {
    console.error(`parseOutput: narrative invalid (length=${narrative?.length ?? 0})`)
    return null
  }
  if (!narrative_pro) {
    console.error(`parseOutput: narrative_pro missing`)
    return null
  }
  const narrative_pro_trimmed = narrative_pro.length > 5500
    ? narrative_pro.slice(0, 5500).replace(/\s+\S*$/, '') + '…'
    : narrative_pro
  if (!contrarian) {
    console.error('parseOutput: contrarian missing')
    return null
  }
  const contrarian_trimmed = contrarian.length > 500
    ? contrarian.slice(0, 500).replace(/\s+\S*$/, '') + '…'
    : contrarian

  let home_stories: StoryItem[] = []
  let away_stories: StoryItem[] = []
  let pro_takeaways: ProTakeaway[] = []
  let game_day_notes: GameDayNote[] = []

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

  try {
    const rawNotes = JSON.parse(gameDayNotesMatch[1].trim())
    if (!Array.isArray(rawNotes)) {
      console.error('parseOutput: game_day_notes not an array')
      return null
    }
    game_day_notes = rawNotes.filter((n: any) =>
      n?.text && ['weather', 'watch_for', 'logistics'].includes(n?.category)
    ).slice(0, 4)
    // Not a hard failure if empty — a dome game with nothing notable in
    // logistics can legitimately produce a short list. Don't reject the
    // whole narrative over this one optional section.
  } catch {
    console.error('parseOutput: game_day_notes JSON parse failed — defaulting to empty array')
    game_day_notes = []
  }

  return { summary, narrative, narrative_pro: narrative_pro_trimmed, home_stories, away_stories, contrarian: contrarian_trimmed, pro_takeaways, game_day_notes }
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