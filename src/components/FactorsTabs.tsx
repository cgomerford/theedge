'use client'

import { useState } from 'react'

type SportKey = 'mlb' | 'nfl' | 'nhl' | 'epl'

const SPORTS: { key: SportKey; label: string; status: string }[] = [
  { key: 'mlb', label: 'MLB', status: 'Live now' },
  { key: 'nfl', label: 'NFL', status: 'Sept 9' },
  { key: 'nhl', label: 'NHL', status: 'Coming next' },
  { key: 'epl', label: 'EPL', status: 'Coming later' },
]

// Each sport maps onto the same 8-factor shape as the MLB model:
// [starter] [bench/freshness] [offence] [defence] [matchup] [venue] [weather] [rest & travel]
const FACTORS: Record<SportKey, { name: string; body: string }[]> = {
  mlb: [
    { name: 'Starting pitching', body: 'xFIP-, ERA, K/9 and last-3-starts form for both starters.' },
    { name: 'Bullpen', body: 'Pen ERA, plus how fresh it is after the last few days of work.' },
    { name: 'Offence', body: 'Runs per game, OPS and wRC+ over the last 30 days.' },
    { name: 'Defence', body: 'Defensive runs saved and outs above average.' },
    { name: 'Matchup', body: "Pitcher's arsenal against the lineup's known weaknesses." },
    { name: 'Park factor', body: 'How much this ballpark helps hitters or pitchers.' },
    { name: 'Weather', body: 'Temperature, wind and precipitation at first pitch.' },
    { name: 'Rest & travel', body: 'Days off, travel distance and time zones crossed.' },
  ],
  nfl: [
    { name: 'Quarterback play', body: 'Passer rating, EPA per play and recent form for both starters.' },
    { name: 'Pass rush & pressure', body: 'Pressure rate and pass-rush win rate for the front seven.' },
    { name: 'Offensive efficiency', body: 'Yards and EPA per play over the last few games.' },
    { name: 'Defensive ranks', body: 'Yards and points allowed, adjusted for opponent strength.' },
    { name: 'Matchup', body: 'Specific unit-vs-unit edges — receiver vs. corner, line vs. line.' },
    { name: 'Venue factor', body: 'Dome vs. outdoor, altitude and crowd-noise effects.' },
    { name: 'Weather', body: 'Wind and cold — the two that move passing and kicking games.' },
    { name: 'Rest & travel', body: 'Bye weeks, short weeks and cross-country travel.' },
  ],
  nhl: [
    { name: 'Starting goalie', body: 'Save percentage and recent form for the confirmed starter.' },
    { name: 'Special teams', body: 'Power-play and penalty-kill efficiency for both sides.' },
    { name: '5-on-5 offence', body: 'Goals and expected goals created at even strength.' },
    { name: '5-on-5 defence', body: 'Goals and expected goals allowed, shot suppression.' },
    { name: 'Matchup', body: 'Line matchups and puck-possession tendencies.' },
    { name: 'Home ice', body: 'Last-change advantage and home/road scoring splits.' },
    { name: 'Schedule fatigue', body: 'Back-to-backs and games-in-X-nights stretches.' },
    { name: 'Travel', body: 'Distance covered and time zones crossed since the last game.' },
  ],
  epl: [
    { name: 'Starting XI strength', body: 'Quality of the named lineup, weighted for key absences.' },
    { name: 'Squad rotation', body: 'Fixture congestion from Europe and cup competitions.' },
    { name: 'Attacking form', body: 'Expected goals created over the last five matches.' },
    { name: 'Defensive form', body: 'Expected goals conceded over the last five matches.' },
    { name: 'Tactical matchup', body: 'Style clashes — high press vs. build-up, pace vs. low block.' },
    { name: 'Home advantage', body: 'Ground-specific home form and travelling-support effects.' },
    { name: 'Weather & pitch', body: 'Conditions that change passing tempo and pitch surface.' },
    { name: 'Fixture congestion', body: 'Days of rest since the last match for both sides.' },
  ],
}

export default function FactorsTabs() {
  const [active, setActive] = useState<SportKey>('mlb')
  const factors = FACTORS[active]
  const activeSport = SPORTS.find(s => s.key === active)!

  return (
    <div className="mt-12">
      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">
        § The 8 factors, by sport
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {SPORTS.map(sport => (
          <button
            key={sport.key}
            type="button"
            onClick={() => setActive(sport.key)}
            aria-pressed={active === sport.key}
            className={`px-4 py-2 font-mono text-xs uppercase tracking-widest border transition ${
              active === sport.key
                ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]'
                : 'bg-white text-stone-500 border-stone-300 hover:border-stone-900 hover:text-stone-900'
            }`}
          >
            {sport.label}
            <span className={`ml-2 ${active === sport.key ? 'text-[#FDE047]' : 'text-stone-400'}`}>
              {sport.status}
            </span>
          </button>
        ))}
      </div>

      {active !== 'mlb' && (
        <p className="text-[11px] font-mono text-stone-400 italic mb-4">
          {activeSport.label} hasn&apos;t launched yet — this is the factor model we&apos;re building it on, not a live score.
        </p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-stone-200 border border-stone-200">
        {factors.map(f => (
          <div key={f.name} className="bg-white p-4">
            <span className="text-[#FF5722] font-mono text-xs">⊕</span>
            <h4 className="font-serif font-semibold text-stone-900 text-sm mt-1.5 mb-1.5">{f.name}</h4>
            <p className="text-[11px] font-mono text-stone-500 leading-relaxed">{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
