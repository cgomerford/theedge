import type { PitcherSeasonStats, PitchType, GameWeather } from '@/lib/mlb'
import type { TeamForm } from '@/lib/mlb'

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
  weight: number  // higher = more interesting
}

// Build a list of candidate facts, then pick the top 1-2
export function generateGameline(ctx: GameContext): string {
  const facts: Fact[] = []

  // PITCHING facts
  const allPitchers = [
    { name: ctx.awayPitcherName, stats: ctx.awaySeasonStats, mix: ctx.awayPitchMix },
    { name: ctx.homePitcherName, stats: ctx.homeSeasonStats, mix: ctx.homePitchMix },
  ]

  for (const p of allPitchers) {
    if (!p.name || !p.stats) continue

    const era = parseFloat(p.stats.era)
    const k9 = parseFloat(p.stats.k_per_9)

    // Elite ERA
    if (!isNaN(era) && era < 2.5 && parseFloat(p.stats.innings) > 20) {
      facts.push({
        text: `${p.name} carries a sub-2.50 ERA into tonight`,
        weight: 9,
      })
    }
    // High K rate
    if (!isNaN(k9) && k9 >= 11) {
      facts.push({
        text: `${p.name} is striking out ${k9.toFixed(1)} per nine this season`,
        weight: 8,
      })
    }
    // Best pitch standout (high whiff rate on top usage)
    if (p.mix.length > 0) {
      const top = p.mix[0]
      if (top.whiff_percent !== null && top.whiff_percent >= 35) {
        facts.push({
          text: `${p.name}'s ${top.pitch_name.toLowerCase()} is generating ${top.whiff_percent.toFixed(0)}% whiffs`,
          weight: 9,
        })
      }
      // Heavy reliance on one pitch
      if (top.percentage >= 45) {
        facts.push({
          text: `${p.name} leans heavily on the ${top.pitch_name.toLowerCase()} (${top.percentage.toFixed(0)}% usage)`,
          weight: 6,
        })
      }
    }
  }

  // FORM facts
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

  // WEATHER facts
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

  // Pick top 2 by weight, blend into a sentence
  facts.sort((a, b) => b.weight - a.weight)

  if (facts.length === 0) {
    // Generic fallback
    return `${ctx.awayShort} face ${ctx.homeShort} tonight. Full data below.`
  }

  if (facts.length === 1) {
    return capitalize(facts[0].text) + '.'
  }

  // Combine top 2
  const a = facts[0].text
  const b = facts[1].text
  return `${capitalize(a)}. ${capitalize(b)}.`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// =====================================================
// EDGE INDICATOR — minimal MVP, refine May 8
// =====================================================

export type EdgeCategory = {
  label: string
  awayScore: number  // 0-100
  homeScore: number  // 0-100
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

  // Score = 100 - (era*10) capped 0-100
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

  // Score from L10 wins (0-100)
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