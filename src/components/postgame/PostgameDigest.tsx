// src/components/postgame/PostgameDigest.tsx
//
// The "A4 printout" version — one dense page, meant to be readable at a
// glance or printed/exported to PDF via the browser's native print dialog.
// Sits alongside <PostgameReport /> (the deep multi-section version), not
// instead of it — see ReportModeToggle.tsx for the in-app switch, and
// src/app/mlb/[slug]/print/page.tsx for a standalone print-only route.
//
// Print sizing: an A4 page at 96dpi CSS pixels is 794×1123px. This
// component targets that as its natural size and relies on @media print
// rules (below) to strip everything but itself when actually printed —
// the surrounding site chrome (nav, footer) should already be outside
// this component's boundary, not hidden by it.

import type { PostgameReport as PostgameReportData } from '@/types/postgame'
import { RadarChart } from './RadarChart'
import { PieChart } from './PieChart'

const ORANGE = '#FF5722'
const INK = '#1A1A1A'

function outsToIP(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`
}

function formatCount(c: { balls: number; strikes: number }): string {
  return `${c.balls}-${c.strikes}`
}

export function PostgameDigest({ report }: { report: PostgameReportData }) {
  const { away, home, finalAwayScore, finalHomeScore, superlatives, keyPitches, keyPlays, battedBallMix, teamProfiles, pitchers } = report
  const homeWon = finalHomeScore > finalAwayScore
  const starter = (teamId: number) =>
    [...pitchers].filter(p => p.teamId === teamId).sort((a, b) => b.outsRecorded - a.outsRecorded)[0]

  return (
    <div
      className="bg-white text-[#1A1A1A] mx-auto shadow-sm print:shadow-none"
      style={{ width: '794px', minHeight: '1123px', padding: '32px 36px', fontFamily: "'Inter', sans-serif" }}
    >
      {/* header */}
      <div className="flex items-baseline justify-between border-b-[3px] pb-3 mb-4" style={{ borderColor: INK }}>
        <div className="font-serif font-extrabold text-lg">
          <span style={{ color: ORANGE }}>⊕</span> THE EDGE <span className="font-normal text-stone-500 text-sm">postgame digest</span>
        </div>
        <div className="font-mono text-[9px] uppercase tracking-widest text-stone-500">
          {report.gameDate}{report.gameNumber > 1 ? ` · Game ${report.gameNumber}` : ''}
        </div>
      </div>

      {/* score */}
      <div className="flex items-center justify-center gap-6 mb-5">
        <span className={`font-serif font-extrabold text-2xl ${!homeWon ? 'text-[#FF5722]' : ''}`}>{away.abbreviation}</span>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif" }} className="text-5xl leading-none">
          {finalAwayScore} <span className="text-stone-300 text-2xl">–</span> {finalHomeScore}
        </span>
        <span className={`font-serif font-extrabold text-2xl ${homeWon ? 'text-[#FF5722]' : ''}`}>{home.abbreviation}</span>
      </div>

    {/* win probability sparkline */}
      {report.winProbability.length > 1 && (
        <div className="mb-5">
          <div className="font-mono text-[7.5px] uppercase tracking-widest text-stone-500 mb-1">§ Win Probability</div>
          <svg viewBox="0 0 760 40" style={{ width: '100%', display: 'block' }}>
            {(() => {
              const pts = report.winProbability
              const n = pts.length
              const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * 760)
              const y = (pct: number) => 40 - (pct / 100) * 40
              const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.homeWinPct)}`).join(' ')
              return (
                <>
                  <line x1={0} y1={20} x2={760} y2={20} stroke="#E7E5E4" strokeDasharray="3,3" />
                  <path d={line} fill="none" stroke={ORANGE} strokeWidth={1.5} />
                </>
              )
            })()}
          </svg>
          <div className="font-mono text-[7px] text-stone-400 mt-0.5">
            {home.abbreviation} win probability &middot; dashed line = 50/50
          </div>
        </div>
      )}

      {/* superlative strip */}
      <div className="grid grid-cols-4 gap-1.5 mb-5">
        {[
          { l: 'Fastest', v: superlatives.fastestPitch ? `${superlatives.fastestPitch.speed}mph` : '—', n: superlatives.fastestPitch?.pitcherName },
          { l: 'Slowest', v: superlatives.slowestPitch ? `${superlatives.slowestPitch.speed}mph` : '—', n: superlatives.slowestPitch?.pitcherName },
          { l: 'Most break', v: superlatives.mostBreak ? `${superlatives.mostBreak.breakLength}"` : '—', n: superlatives.mostBreak?.pitcherName },
          { l: 'Top spin', v: superlatives.highestSpin ? `${superlatives.highestSpin.spinRate}rpm` : '—', n: superlatives.highestSpin?.pitcherName },
          { l: 'Hardest hit', v: superlatives.hardestHit ? `${superlatives.hardestHit.exitVelo}mph` : '—', n: superlatives.hardestHit?.batterName },
          { l: 'Longest hit', v: superlatives.longestHit ? `${superlatives.longestHit.distance}ft` : '—', n: superlatives.longestHit?.batterName },
          { l: 'Most patient', v: superlatives.mostPatientBatter ? `${superlatives.mostPatientBatter.pitchesSeen}p` : '—', n: superlatives.mostPatientBatter?.batterName },
          { l: 'Longest AB', v: superlatives.longestAtBat ? `${superlatives.longestAtBat.pitches}p` : '—', n: superlatives.longestAtBat?.batterName },
        ].map(item => (
          <div key={item.l} className="border border-stone-200 text-center py-1.5 px-1">
            <div className="font-mono text-[7.5px] uppercase tracking-wide text-stone-500">{item.l}</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif" }} className="text-lg leading-none mt-0.5">{item.v}</div>
            <div className="font-mono text-[7px] text-stone-400 mt-0.5 truncate">{item.n ?? '—'}</div>
          </div>
        ))}
      </div>

      {/* biggest inning + most impactful at-bat */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        {report.superlatives.biggestInning && (
          <div className="border border-stone-200 px-3 py-2">
            <div className="font-mono text-[7.5px] uppercase tracking-widest text-stone-500 mb-1">§ Biggest Inning</div>
            <div className="font-serif text-[12px]">
              {report.superlatives.biggestInning.teamAbbreviation} scored {report.superlatives.biggestInning.runs} in the {report.superlatives.biggestInning.inning === 1 ? '1st' : `${report.superlatives.biggestInning.inning}th`}
            </div>
          </div>
        )}
        {report.mostImpactfulAtBat && (
          <div className="col-span-2 border border-stone-200 bg-[#1A1A1A] text-white px-3 py-2">
            <div className="font-mono text-[7.5px] uppercase tracking-widest mb-1" style={{ color: '#FDE047' }}>§ Most Impactful At-Bat</div>
            <div className="font-serif text-[11.5px] italic">{report.mostImpactfulAtBat.description}</div>
          </div>
        )}
      </div>

      {/* radar + pies row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="border border-stone-200 p-2.5">
          <div className="font-mono text-[8px] uppercase tracking-widest text-stone-500 mb-1">§ Game Profile</div>
          <RadarChart
            size={190}
            axisLabels={['Power', 'Discipline', 'Contact', 'Hard Contact', 'Speed']}
            series={[
              { name: away.abbreviation, color: '#1A1A1A', values: [teamProfiles.away.power, teamProfiles.away.discipline, teamProfiles.away.contact, teamProfiles.away.hardContact, teamProfiles.away.speed] },
              { name: home.abbreviation, color: ORANGE, values: [teamProfiles.home.power, teamProfiles.home.discipline, teamProfiles.home.contact, teamProfiles.home.hardContact, teamProfiles.home.speed] },
            ]}
          />
        </div>
        <div className="border border-stone-200 p-2.5">
          <div className="font-mono text-[8px] uppercase tracking-widest text-stone-500 mb-1">§ {away.abbreviation} Contact</div>
          <PieChart size={110} slices={[
            { label: 'Ground ball', value: battedBallMix.away.groundBallPct, color: '#1A1A1A' },
            { label: 'Fly ball', value: battedBallMix.away.flyBallPct, color: ORANGE },
            { label: 'Line drive', value: battedBallMix.away.lineDrivePct, color: '#FDE047' },
            { label: 'Pop up', value: battedBallMix.away.popUpPct, color: '#A8A29E' },
          ]} />
        </div>
        <div className="border border-stone-200 p-2.5">
          <div className="font-mono text-[8px] uppercase tracking-widest text-stone-500 mb-1">§ {home.abbreviation} Contact</div>
          <PieChart size={110} slices={[
            { label: 'Ground ball', value: battedBallMix.home.groundBallPct, color: '#1A1A1A' },
            { label: 'Fly ball', value: battedBallMix.home.flyBallPct, color: ORANGE },
            { label: 'Line drive', value: battedBallMix.home.lineDrivePct, color: '#FDE047' },
            { label: 'Pop up', value: battedBallMix.home.popUpPct, color: '#A8A29E' },
          ]} />
        </div>
      </div>

      {/* starters */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {[away, home].map(team => {
          const p = starter(team.teamId)
          if (!p) return null
          return (
            <div key={team.teamId} className="border border-stone-200 p-2.5">
              <div className="font-mono text-[8px] uppercase tracking-widest text-stone-500 mb-1">§ {team.name} Starter</div>
              <div className="font-serif font-bold text-[13px]">{p.pitcherName}</div>
              <div className="font-mono text-[10px] text-stone-600 mt-0.5">
                {outsToIP(p.outsRecorded)} IP · {p.strikeouts} K · {p.walks} BB · {p.earnedRunsAllowed} ER
              </div>
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {p.arsenal.slice(0, 3).map(a => (
                  <span key={a.typeCode} className="font-mono text-[8.5px] text-stone-500">
                    {a.typeDescription} {a.avgVelo ?? '—'}mph ({a.usagePct}%)
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* key pitches */}
      <div className="mb-5">
        <div className="font-mono text-[8px] uppercase tracking-widest text-stone-500 border-b border-stone-200 pb-1 mb-2">§ Key Pitches</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {keyPitches.slice(0, 8).map((kp, i) => (
            <div key={i} className="flex items-baseline gap-1.5 font-mono text-[9px] text-stone-600">
              <span className="text-stone-400 whitespace-nowrap">I{kp.inning}</span>
              <span className="font-semibold text-[#1A1A1A]">{kp.pitcherName}</span>
              <span>{kp.typeDescription}{kp.velo ? ` ${kp.velo}mph` : ''}</span>
              <span className="text-stone-400 whitespace-nowrap ml-auto">{formatCount(kp.countAfter)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* key plays */}
      <div>
        <div className="font-mono text-[8px] uppercase tracking-widest text-stone-500 border-b border-stone-200 pb-1 mb-2">§ Key Plays</div>
        {keyPlays.slice(0, 6).map((kp, i) => (
          <div key={i} className="flex gap-2 font-mono text-[9.5px] py-0.5">
            <span className="text-stone-400 whitespace-nowrap">{kp.halfInning === 'top' ? '▲' : '▼'}{kp.inning}</span>
            <span className="font-sans text-[10px] text-stone-700 flex-1">{kp.description}</span>
            <span className="font-bold whitespace-nowrap">{kp.awayScore}–{kp.homeScore}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-2 border-t border-stone-200 font-mono text-[7.5px] text-stone-400">
        ⊕ MLB Stats API live feed · edgereportdaily.com/mlb/{report.slug}
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  )
}