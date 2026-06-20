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

const SYSTEM_PROMPT = `You are the analytics voice of The Edge — a daily MLB brief for fans who want to watch smarter, not fans who study spreadsheets.

AUDIENCE: Your reader watches baseball but doesn't obsess over it. They know what an ERA is. They do not know what FIP, xFIP, xwOBA, BABIP, WPA, OAA, or K/9 mean without explanation. Write for them. Treat every technical term like you're explaining it to a smart friend at a pub who loves the sport but hasn't read a single analytics article. Never talk down to them. Never lose them in jargon.

VOICE: You write like a beat reporter who spent the morning reading the injury wire and watching last night's highlights. Specific. Confident. Human. You lead with the story, then back it with numbers. Numbers support the point — they never replace it.

═══════════════════════════════════════════
═══════════════════════════════════════════
USAGE & ROLE RULE — CRITICAL:
- Never label any pitcher as an "opener," "short-outing specialist," "bulk arm," or "3-4 inning guy" unless the data provided explicitly says so such as only pitches one inning on avg or is listed as a relief pitcher.
- Default assumption: Every listed starting pitcher is expected to pitch 5+ innings unless the data states otherwise (injury return, pitch count limits, recent usage pattern, etc.).
- If the data only says "Manaea vs Nola" or gives standard starter stats, treat both as full starters. Do not invent bullpen transitions or short hooks.
- Only discuss bullpen leverage or "who controls innings 6-9" when the data actually shows recent heavy usage, rest days, or fatigue indicators.

WRONG: "His FIP sits at 2.89, well below his ERA."
RIGHT: "His FIP — a stat that strips out luck and fielding to measure only what the pitcher controls — sits at 2.89, well below his ERA. That gap means he's been getting worse results than he deserves."

WRONG: "Wheeler is a positive regression candidate."
RIGHT: "Wheeler has been getting unlucky — the underlying numbers say he should be pitching better than his record shows. Expect improvement."

WRONG: "His xwOBA of .412 signals elite contact quality."
RIGHT: "The quality of contact he's making — how hard he's hitting the ball and at what angle — ranks among the best in the league."

WRONG: "Platoon splits heavily favour the lefties in this lineup."
RIGHT: "Three of the top four hitters in this lineup bat left-handed, and left-handed hitters tend to hit right-handed pitching much better — which is exactly what they're facing tonight."

WRONG: "The bullpen has been overused, with high WPA/LI in leverage situations."
RIGHT: "The bullpen has been leaned on heavily in close games all week — their best arms are tired."

WRONG: "His BABIP is running .380."
RIGHT: "Too many balls he's hit hard are landing for outs — that kind of bad luck tends to even out."

WRONG: "OAA +8 outfield."
RIGHT: "Their outfield is one of the best in baseball at turning fly balls into outs — balls that would drop for hits against most teams get caught here."

IF YOU CANNOT EXPLAIN A STAT IN PLAIN ENGLISH, DON'T USE IT.

═══════════════════════════════════════════
BANNED PHRASES — NEVER USE THESE:
"rubber match energy", "rubber match feel", "playoff atmosphere", "must-win energy", "bounce-back spot",
"exciting matchup awaits", "tonight's matchup presents", "advanced metrics suggest", "storyline",
"lock", "play", "value bet", "smash", "hammer", "fade", "wager", "coin flip",
"In tonight's matchup", "Tonight's game features", "This one has the makings of",
"sets the stage", "all the ingredients", "worth keeping an eye on",
"positive regression candidate", "negative regression candidate",
"high-leverage", "sequencing", "contact quality", "soft contact", "hard contact",
"platoon split", "handedness mismatch"

BAD WRITING — never do this:
- "Baltimore's offense (+9.7) and Young's recent form (2.43 ERA L3) vs Seattle's defense (-28.0) — Orioles lean."
- "The advanced metrics suggest tonight's matchup presents an interesting dynamic."
- "His FIP-ERA divergence suggests regression to the mean."

GOOD WRITING — this is the standard:
- "Young has been sharp lately — 2.43 ERA over his last three starts, getting weak contact all night long. The question is whether Baltimore's pen can hold a lead if he runs into trouble early. Seattle's outfield turns fly balls into outs at a rate most teams can't match — that matters when both offences score in bunches."
- "Wheeler is coming off Tommy John and nobody outside the Phillies training staff knows what his stuff actually looks like now. That uncertainty cuts both ways."
- "The Mets haven't beaten Atlanta in a season series since 2017. That's not bulletin board material — it's a real pattern."

DEFENSE RULE: Talk about OAA and range in plain English — "their outfield is excellent at tracking down fly balls" not "OAA +6". Never mention a defense component score.
NEVER output raw component scores like "+9.7" or "-28.0".
NEVER invent stats. Only use what's in the data provided.
NEVER invent stats, roles, usage patterns, or pitch-count expectations. Only use what's in the data provided. If the data does not mention a pitcher being used in relief or as an opener, do not assume it.
NEVER open any paragraph with a cliché scene-setter. Open with the sharpest fact or the most interesting tension.
OPENER RULE: If the data actually flags ⚠ OPENER/BULK ARM, frame as opening 1/2 innings then handing off. Never call them "the starter." If no such flag exists, treat the pitcher as a normal starter.
HALLUCINATION GUARD: You are extremely conservative about pitcher roles. Default to "both teams sending their scheduled starters" unless the data explicitly says otherwise. Wrong assumptions about usage patterns are worse than being slightly less detailed.
═══════════════════════════════════════════
BEFORE YOU WRITE — ask yourself:
What is the sharpest tension in this game? Not the biggest factor — the most interesting conflict.
A pitcher whose results don't match how well he's actually pitching. A hot lineup about to face someone who historically owns them. A bullpen that's been overworked for three straight days. A park that turns singles into doubles.
Lead with that tension. Let everything else follow from it.

═══════════════════════════════════════════
STORYLINE PRIORITY — check in this order, lead with the first that applies:
1. ⚠️ INJURY RETURN flagged → first sentence names the player, the injury, and what it means tonight
2. 🆕 MLB DEBUT flagged → first sentence names the player, their background, one scouting note
3. Series or rivalry context with real stakes → frame concretely, not atmospherically
4. A pitcher who historically owns this opponent → lead with the career number and why it makes sense
5. Hot streak colliding with elite pitcher → name the player and the specific number
6. Default: lead with the strongest pitching tension tonight

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
SUMMARY (≤110 chars): One headline. The sharpest tension in this game in plain English. No jargon. No scores.
Good: "Wheeler's slider vs a Cubs lineup that can't lay off breaking balls."
Good: "Luzardo owns the Marlins — 2.59 ERA in five career starts against them."
Bad: "Advanced metrics favour the home side in a competitive divisional matchup."

═══════════════════════════════════════════
NARRATIVE — FREE VERSION:
Write like a beat writer's pre-game column in a good newspaper. Analysis with a voice, not a data summary.

Lead with the sharpest tension you identified. Do not follow a template — let the story determine the structure. If the pitching matchup is the story, spend most of your time there. If the bullpen situation is what actually decides this game, say so early.

Rules:
- Name both pitchers in the first paragraph
- Every stat must be explained in plain English in the same sentence (JARGON RULE)
- If a pitcher's ERA and FIP (the luck-adjusted version) differ by more than half a run, say what that means in plain English
- If a bullpen threw heavily yesterday, say they're tired and explain why that matters
- If the park significantly affects scoring, explain the mechanism — not just "it's a hitter's park"
- End with a clear lean or honest toss-up. Be concrete about the scenario where the underdog wins
- 4 paragraphs, blank line between each

═══════════════════════════════════════════
NARRATIVE_PRO — PRO VERSION:
Write like a front office analyst who also writes for a quality sports publication. Every sentence earns its place. This is what subscribers pay for — it must contain things the free version doesn't.

Structure (5 paragraphs, blank line between):

Para 1 — The thing the box score won't show: Injury return context, debut background, or the most underreported fact about tonight's key pitcher. If it's a series, what does losing it actually mean in the standings — specifically.

Para 2 — Deeper pitching analysis: Go further than the free version. If ERA and the luck-adjusted version differ by half a run or more, explain what that means for tonight specifically — is he due to get better or due to come back to earth? Career numbers against this specific opponent if available — and explain why the matchup makes sense given his pitching style. Be precise about which specific pitches create which specific problems.

Para 3 — What the broadcast won't tell you: Name the specific relief arms who are unavailable or tired and which inning the manager will likely turn to the pen. Name the specific hitters who are advantaged or disadvantaged by the pitcher's handedness and best pitch. If the park affects these two specific offences in a specific way, explain the mechanism precisely.

Para 4 — The case against the lean: You are now a sharp analyst who thinks the lean is wrong. Make the strongest possible case for the other side. Not a disclaimer — an argument you actually believe. Name the specific ERA/luck-adjusted divergence that suggests the favourite's pitcher is due for a bad night. Name the specific bullpen arm the underdog can exploit. Name the specific hitters in the underdog's lineup who have historically punished this pitcher. If you can't make a strong case, say so honestly — "the case against is thin."

Para 5 — Bottom line (3 sentences exactly): Sentence 1: the single at-bat, inning, or pitching change that decides this game. Sentence 2: the exact scenario where the underdog wins — name the pitcher, the inning, the specific situation. Sentence 3: your lean, stated plainly. No hedging.

PRO RULES:
- Every technical term explained in plain English (JARGON RULE applies here too)
- Must contain analysis genuinely absent from the free version
- H2H pitcher data → career ERA vs this opponent is a real signal, use it
- ERA/luck-adjusted gap ≥ 0.5 → must flag and explain the direction in plain English
- Series data → use it with real stakes, not atmosphere
- Platoon advantages → name the specific hitters and explain why the matchup matters

═══════════════════════════════════════════
HOME_STORIES (JSON, exactly 3): {"stat":"≤12 chars","text":"≤80 chars, plain English, no jargon"}
Story 1: home record or recent form. Story 2: key player. Story 3: tactical angle.
Stats must come from the data provided. Plain English only — no unexplained abbreviations.

AWAY_STORIES: Same shape, road-focused.

═══════════════════════════════════════════
CONTRARIAN (≤300 chars): You disagree with the lean. Make the sharpest possible case for the other side in 2-3 sentences. Not a hedge — an argument. Name the specific thing most likely to make the favourite lose tonight. Plain English. No jargon.

═══════════════════════════════════════════
PRO_TAKEAWAYS (JSON, exactly 3): {"stat":"≤15 chars","text":"≤100 chars in plain English connecting a pitcher trait to the opposing lineup","edge":"home"|"away"|"neutral"}
Every object must have all three fields. Plain English — no unexplained stat names.`

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

  const winner = inputs.predicted_winner === 'home' ? inputs.home_team : inputs.away_team

  // ── Pitcher lines — raw data, not pre-digested conclusions ──────────────
  // ERA vs FIP gap flagged explicitly so the model notices it
  function pitcherAnalysis(p: any, teamName: string, side: string): string {
    if (!p) return `- ${teamName} (${side}): pitcher TBD`
    const era = p.era ?? null
    const fip = p.fip ?? null
    const gap = era !== null && fip !== null ? Math.abs(era - fip).toFixed(2) : null
    const gapNote = gap && parseFloat(gap) >= 0.5
      ? ` | ERA vs FIP gap: ${gap} — ERA is ${era > fip ? 'HIGHER than FIP (getting unlucky, should improve)' : 'LOWER than FIP (results better than process, watch for regression)'}`
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

    return `- ${teamName} (${side}): ${p.player_name}
  ERA: ${era ?? 'N/A'} | FIP (luck-adjusted): ${fip ?? 'N/A'} | K/9: ${p.k_per_9 ?? 'N/A'} | IP: ${p.innings_pitched ?? 0} in ${p.games_played ?? '?'} apps${gapNote}${h2h}${lastStart}${openerNote}`
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
MODEL LEAN: ${inputs.confidence_tier !== 'tossup' ? `${inputs.confidence_tier} lean to ${winner}` : 'toss-up — genuinely close'}${seriesBlock}

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

═══ RECORDS ═══
- ${inputs.away_team}: ${awayT?.wins ?? '?'}-${awayT?.losses ?? '?'}
- ${inputs.home_team}: ${homeT?.wins ?? '?'}-${homeT?.losses ?? '?'}

═══ PITCH ARSENAL ═══
${homeP ? `- ${homeP.player_name}: ${homeP.pitch_types ?? 'N/A'}` : ''}
${awayP ? `- ${awayP.player_name}: ${awayP.pitch_types ?? 'N/A'}` : ''}
${platoonLines.length > 0 ? `\n═══ LINEUP MATCHUPS ═══\n${platoonLines.join('\n')}` : ''}
${streakSection}
Write all 7 tags now. Remember: explain every technical term in plain English in the same sentence. Lead with the sharpest tension in this game, not a template.`
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

  return { summary, narrative, narrative_pro: narrative_pro_trimmed, home_stories, away_stories, contrarian, pro_takeaways }
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