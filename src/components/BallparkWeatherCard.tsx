'use client'

// src/components/BallparkWeatherCard.tsx
//
// Replaces the old plain WeatherCard stub in ScoutReportTab.tsx. Shows:
//   - temp/feels-like, wind speed+direction, conditions (all real,
//     Open-Meteo hourly data picked at game time — lib/mlb.ts getGameWeather)
//   - wind impact — reuses the EXISTING describeWindImpact() from
//     lib/venues.ts (computed server-side, passed in as a plain string),
//     not a new invented HR-distance model. This is the same categorical
//     signal computeWeatherEdge() in lib/edge.ts already scores the game
//     on — deliberately not a second, competing calculation.
//   - hourly rain outlook — real precip-probability-by-hour from
//     lib/mlb.ts getGameRainOutlook(). The "estimated inning" next to
//     each hour is explicitly an ESTIMATE (see caveat below and in
//     mlb.ts) — not measured, not this game's actual pace.
//
// No invented ball-flight-distance numbers anywhere on this card — MLB
// doesn't publish an official hc-unit-to-feet conversion (see
// LineupSprayChart.tsx's own caveats on that same problem) and nothing
// in this codebase has a verified HR-carry-per-degree/mph model, so this
// card stays within what's actually known: temp, wind, and the
// qualitative in/out/cross read already used to score games.

import WeatherIcon from './WeatherIcon'
import type { GameWeather, RainOutlook } from '@/lib/mlb'

type Props = {
  venueName: string | null
  isIndoor: boolean
  weather: GameWeather | null
  windImpact: string | null
  rainOutlook: RainOutlook | null
}

export default function BallparkWeatherCard({ venueName, isIndoor, weather, windImpact, rainOutlook }: Props) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-100">
        <span className="font-mono text-[9px] uppercase tracking-widest text-stone-500">
          {venueName ?? 'Ballpark'} · Weather
        </span>
      </div>

      <div className="p-4">
        {isIndoor ? (
          <p className="font-serif text-sm text-stone-700 text-center py-3">Roof closed / retractable — no weather factor tonight</p>
        ) : !weather ? (
          <p className="font-serif italic text-xs text-stone-400 text-center py-3">Weather not yet available</p>
        ) : (
          <>
            {/* Current conditions */}
            <div className="flex items-center gap-3 mb-3">
              <WeatherIcon conditions={weather.conditions} size={36} />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-lg font-bold text-stone-900 leading-none">
                  {weather.temp_f}°F
                  <span className="text-xs font-normal text-stone-400 ml-1.5">feels {weather.feels_like_f}°</span>
                </p>
                <p className="font-serif text-xs text-stone-600 mt-0.5">{weather.conditions}</p>
              </div>
            </div>

            {/* Wind + HR impact */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-stone-50 rounded-lg px-2.5 py-2">
                <p className="font-mono text-[8px] uppercase tracking-wider text-stone-400">Wind</p>
                <p className="font-mono text-sm font-bold text-stone-900">
                  {weather.wind_mph} mph {weather.wind_direction_text}
                </p>
              </div>
              <div className="bg-stone-50 rounded-lg px-2.5 py-2">
                <p className="font-mono text-[8px] uppercase tracking-wider text-stone-400">Precip now</p>
                <p className="font-mono text-sm font-bold text-stone-900">{weather.precipitation_chance}%</p>
              </div>
            </div>

            {windImpact && (
              <div className="rounded-lg px-3 py-2 mb-3 border border-orange-200 bg-orange-50">
                <p className="font-mono text-[8px] uppercase tracking-wider text-orange-600 mb-0.5">Impact</p>
                <p className="font-serif text-xs text-stone-800 font-semibold">{windImpact}</p>
              </div>
            )}

            {/* Rain outlook */}
            {rainOutlook && rainOutlook.hours.length > 0 && (
              <div>
                <p className="font-mono text-[8px] uppercase tracking-wider text-stone-400 mb-1.5">
                  {rainOutlook.rainLikely && rainOutlook.firstRainHour
                    ? `Rain likely by ~inning ${rainOutlook.firstRainHour.estimatedInning}`
                    : 'Rain outlook'}
                </p>
                <div className="flex gap-1">
                  {rainOutlook.hours.map((h, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-md px-1.5 py-1.5 text-center ${
                        h.precipChance >= 50 ? 'bg-blue-100 border border-blue-300' : 'bg-stone-50 border border-stone-200'
                      }`}
                    >
                      <p className="font-mono text-[7px] text-stone-500">{h.clockTime}</p>
                      <p className={`font-mono text-[11px] font-bold ${h.precipChance >= 50 ? 'text-blue-700' : 'text-stone-700'}`}>
                        {h.precipChance}%
                      </p>
                      {h.estimatedInning != null && (
                        <p className="font-mono text-[6px] text-stone-400">~inn {h.estimatedInning}</p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[7px] font-mono text-stone-400 mt-1.5 leading-relaxed">
                  Clock times and rain % are real (hourly forecast); inning numbers are an estimate based on average game pace (~3 innings/hour), not this game's actual pace.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
