/**
 * src/lib/fantasy-narrative.ts
 *
 * Deterministic "why" builder that reads the deltas from
 * PlayerSignalContext and writes a plain-English explanation. This is
 * the fantasy site's differentiator: everywhere else lists numbers,
 * The Edge tells you what they mean.
 *
 * Deterministic-first, LLM-later:
 *   - Ship this as pure computed text so it's cheap, cached-forever,
 *     never hallucinates a stat, and works offline
 *   - When Pro tier is ready, swap in a Claude call that reads the
 *     same PlayerSignalContext and writes a richer 5-sentence take.
 *     Signature stays the same so the deep-dive page needs no change.
 *
 * The output shape (paragraph + bullet drivers) matches the rest of
 * the app's editorial tone: sharp, specific, no "the numbers show".
 */

import type { PlayerSignalContext, SignalDirection } from './fantasy-player'

export type PlayerNarrative = {
  headline: string           // one sentence
  paragraph: string          // 2-3 sentences
  drivers: string[]          // 2-4 bullet points, most-important first
  direction: SignalDirection
  confidence: 'high' | 'medium' | 'low'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null, digits = 3): string {
  if (n == null) return '—'
  return n.toFixed(digits)
}

function fmtPct(n: number | null, digits = 1): string {
  if (n == null) return '—'
  return `${n.toFixed(digits)}%`
}

function fmtDelta(n: number | null, digits = 3): string {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(digits)}`
}

function opsQuality(ops: number | null): 'elite' | 'strong' | 'average' | 'below' | 'unknown' {
  if (ops == null) return 'unknown'
  if (ops >= 0.900) return 'elite'
  if (ops >= 0.800) return 'strong'
  if (ops >= 0.700) return 'average'
  return 'below'
}

// ─── Main builder ────────────────────────────────────────────────────────────

export function buildPlayerNarrative(ctx: PlayerSignalContext): PlayerNarrative {
  const { meta, season, l14, l7, opsDeltaL14, barrelDeltaL14, hardHitDeltaL14, direction } = ctx
  const name = meta.fullName.split(' ').slice(-1)[0]  // last name for concision

  const drivers: string[] = []

  // Confidence — how much data do we actually have?
  const dataPoints = [season.ops, l14.ops, ctx.statcastSeason.barrel_pct, ctx.statcastL14.barrel_pct]
    .filter(v => v != null).length
  const confidence: 'high' | 'medium' | 'low' =
    dataPoints >= 4 ? 'high' : dataPoints >= 2 ? 'medium' : 'low'

  // If we can't even tell direction, hand back a graceful placeholder
  if (direction === 'neutral' && opsDeltaL14 == null) {
    return {
      headline: `Not enough recent data to call a trend on ${meta.fullName}.`,
      paragraph:
        `We need at least ~14 days of games to compare recent form to the season baseline. ` +
        `Once ${name} has that on the board, this page fills in with the real read.`,
      drivers: [],
      direction: 'neutral',
      confidence: 'low',
    }
  }

  // ── Heating up ──────────────────────────────────────────────────────
  if (direction === 'heating') {
    const l14Quality = opsQuality(l14.ops)
    const seasonQuality = opsQuality(season.ops)

    let headline: string
    if (l14Quality === 'elite' && seasonQuality !== 'elite') {
      headline = `${name} has punched into elite territory over the last 14 games.`
    } else if (opsDeltaL14 != null && opsDeltaL14 > 0.200) {
      headline = `${name} is on a real heater — L14 OPS is up ${fmtDelta(opsDeltaL14)} on the season number.`
    } else {
      headline = `${name} is trending up over the last two weeks.`
    }

    // Drivers — pick the sharpest 2-3 from what we have
    if (l14.ops != null && season.ops != null) {
      drivers.push(
        `L14 OPS **${fmt(l14.ops)}** (season **${fmt(season.ops)}**, delta ${fmtDelta(opsDeltaL14)})`
      )
    }
    if (l7.ops != null && l14.ops != null && l7.ops > l14.ops) {
      drivers.push(`Getting hotter — L7 OPS **${fmt(l7.ops)}** ahead of the L14 number, streak still building`)
    }
    if (barrelDeltaL14 != null && barrelDeltaL14 > 2) {
      drivers.push(`Barrel% up **${fmtDelta(barrelDeltaL14, 1)}** points L14 — quality of contact, not just BABIP luck`)
    }
    if (hardHitDeltaL14 != null && hardHitDeltaL14 > 3) {
      drivers.push(`Hard-hit rate **${fmtDelta(hardHitDeltaL14, 1)}** — the bat is genuinely faster right now`)
    }
    if (l14.hr != null && l14.hr >= 3) {
      drivers.push(`${l14.hr} home runs in the L14 — power showing up in games, not just exit velo`)
    }

    const paragraph =
      barrelDeltaL14 != null && barrelDeltaL14 > 2
        ? `The Statcast metrics back up the surface line — barrel% and hard-hit% are both up meaningfully over the last fortnight, which means this isn't a hollow hot streak on soft contact. ` +
          `If ${name} is available in your league, this is the window to move.`
        : `Recent form is comfortably ahead of the season baseline. ` +
          `Watch the Statcast column below — if barrel% and hard-hit% aren't following the surface line, the OPS spike may soften back to reality.`

    return { headline, paragraph, drivers: drivers.slice(0, 4), direction, confidence }
  }

  // ── Cooling off ─────────────────────────────────────────────────────
  if (direction === 'cooling') {
    let headline: string
    if (opsDeltaL14 != null && opsDeltaL14 < -0.250) {
      headline = `${name} is in a real slump — L14 OPS off ${fmtDelta(opsDeltaL14)} from the season line.`
    } else {
      headline = `${name} has cooled off over the last two weeks.`
    }

    if (l14.ops != null && season.ops != null) {
      drivers.push(
        `L14 OPS **${fmt(l14.ops)}** (season **${fmt(season.ops)}**, delta ${fmtDelta(opsDeltaL14)})`
      )
    }
    if (l7.ops != null && l14.ops != null && l7.ops < l14.ops) {
      drivers.push(`Not turning yet — L7 OPS **${fmt(l7.ops)}** still trailing the L14 number`)
    }
    if (barrelDeltaL14 != null && barrelDeltaL14 < -2) {
      drivers.push(`Barrel% down **${fmtDelta(barrelDeltaL14, 1)}** points L14 — quality of contact has slipped, not just bad batted-ball luck`)
    }
    if (hardHitDeltaL14 != null && hardHitDeltaL14 < -3) {
      drivers.push(`Hard-hit rate off **${fmtDelta(hardHitDeltaL14, 1)}** — the underlying bat speed is the real story`)
    }
    if (l14.k_rate != null && season.k_rate != null && l14.k_rate - season.k_rate > 4) {
      drivers.push(`K% up to **${fmtPct(l14.k_rate)}** (season **${fmtPct(season.k_rate)}**) — approach has slipped`)
    }

    // Interpretation
    const barrelHolding = barrelDeltaL14 == null || Math.abs(barrelDeltaL14) < 2
    const paragraph =
      barrelHolding
        ? `The concerning part: batted-ball quality is holding roughly steady, so this looks more like a batted-ball luck correction than a genuine skill drop. ` +
          `If a leaguemate is buying the slump narrative, this is your buy-low window.`
        : `The Statcast column is telling the same story as the surface line — this isn't just BABIP unwinding, the quality of contact is genuinely down. ` +
          `Not a buy-low unless the price is deeply discounted.`

    return { headline, paragraph, drivers: drivers.slice(0, 4), direction, confidence }
  }

  // ── Neutral ─────────────────────────────────────────────────────────
  const headline = `${name} is roughly on baseline — no meaningful trend to flag.`
  const paragraph =
    `Recent form is inside a normal range around the season number. ` +
    `Nothing here is a start/sit signal on its own — check matchup context on the game page.`
  if (l14.ops != null && season.ops != null) {
    drivers.push(`L14 OPS **${fmt(l14.ops)}** vs season **${fmt(season.ops)}** — inside the noise band`)
  }
  return { headline, paragraph, drivers, direction, confidence }
}
