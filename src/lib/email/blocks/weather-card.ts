// src/lib/email/blocks/weather-card.ts
//
// Conditions one-liner for the daily brief email.
// Indoor venues, outdoor weather, and graceful "no data" fallback.

import { COLORS, FONTS } from '../layout'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeatherInfo {
  temp_f: number
  wind_mph: number
  wind_direction_text: string
  conditions: string
  precipitation_chance: number
}

// ─── Main render ──────────────────────────────────────────────────────────────

/**
 * Renders a conditions block as a single <tr> row.
 * Returns empty string if there's nothing to show (no weather data + not indoor).
 */
export function weatherCardBlock({
  weather,
  windImpact,
  isIndoor,
}: {
  weather: WeatherInfo | null
  windImpact: string | null
  isIndoor: boolean
}): string {
  // Nothing to display
  if (!isIndoor && !weather) return ''

  let conditionLine: string
  let impactNote: string = ''

  if (isIndoor) {
    conditionLine = 'Retractable roof, climate-controlled.'
  } else if (weather) {
    const parts: string[] = []
    parts.push(`${weather.temp_f}°F`)
    if (weather.conditions) parts.push(weather.conditions.toLowerCase())
    parts.push(`wind ${weather.wind_mph}\u00A0mph from ${weather.wind_direction_text}`)
    if (weather.precipitation_chance > 0) {
      parts.push(`${weather.precipitation_chance}% precip`)
    }
    conditionLine = parts.join(', ') + '.'

    if (windImpact) {
      impactNote = `<span style="font-style:italic;color:${COLORS.body};">${escapeHtml(windImpact)}.</span>`
    }
  } else {
    return ''
  }

  return `
  <tr><td class="brief-pad" style="padding:32px 40px 0;">
    <div style="font-family:${FONTS.mono};font-size:11px;letter-spacing:0.16em;color:${COLORS.orange};text-transform:uppercase;margin-bottom:10px;">
      § Conditions
    </div>
    <p style="font-family:${FONTS.serif};font-size:16px;line-height:1.5;color:${COLORS.ink};margin:0;">
      ${escapeHtml(conditionLine)}${impactNote ? ` ${impactNote}` : ''}
    </p>
  </td></tr>`
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeHtml(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}