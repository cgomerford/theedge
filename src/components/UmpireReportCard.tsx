'use client'

// src/components/UmpireReportCard.tsx
//
// Home plate umpire (and other officials), a written accuracy summary, a
// strike-zone scatter chart of every missed call, a ranked written list
// of the most significant ones, and — best-effort — any ABS challenge
// events found on the feed.

import type { UmpireReport } from '@/lib/postgame'
import UmpireCallChart from './UmpireCallChart'

export default function UmpireReportCard({ report }: { report: UmpireReport }) {
  const hp = report.officials.find(o => o.role.toLowerCase().includes('home plate')) ?? report.officials[0]

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-500">Umpire report</span>
      </div>

      <div className="px-3 py-2.5 border-b border-stone-100">
        {hp ? (
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] text-stone-800 font-semibold">{hp.name}</span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-stone-400">Home Plate</span>
          </div>
        ) : (
          <p className="font-mono text-[10px] text-stone-400">Umpire assignment not available for this game</p>
        )}
        {report.officials.length > 1 && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {report.officials.filter(o => o !== hp).map(o => (
              <span key={o.name} className="font-mono text-[9px] text-stone-400">{o.role}: {o.name}</span>
            ))}
          </div>
        )}
        {report.totalTakes > 0 && (
          <p className="text-[11.5px] text-stone-600 leading-snug mt-2">
            {hp?.name ?? 'The plate umpire'} got <strong className="text-stone-900">{report.totalTakes - report.totalMissed} of {report.totalTakes}</strong> ball/strike
            calls right tonight — <strong className="text-stone-900">{report.accuracyPct}%</strong> accuracy, with {report.totalMissed} missed call{report.totalMissed === 1 ? '' : 's'}.
          </p>
        )}
      </div>

      <div className="px-3 py-3 border-b border-stone-100">
        <UmpireCallChart missedCalls={report.missedCallsChartData} />
      </div>

      <div>
        <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400">Most missed calls</span>
          <span className="font-mono text-[9px] text-stone-400">{report.totalMissed} found</span>
        </div>
        {report.missedCalls.length > 0 ? (
          report.missedCalls.slice(0, 8).map((m, i) => (
            <div key={i} className="px-3 py-1.5 flex items-center justify-between border-b border-stone-50 last:border-0">
              <div className="min-w-0">
                <span className="text-[11.5px] text-stone-700">{m.batterName} <span className="text-stone-400">vs</span> {m.pitcherName}</span>
                <div className="font-mono text-[9px] text-stone-400">
                  Inn {m.inning}{m.half === 'top' ? '▲' : '▼'} · called {m.call === 'called_strike' ? 'a strike' : 'a ball'}
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold text-stone-900 flex-shrink-0">{m.distanceInches}&quot;</span>
            </div>
          ))
        ) : (
          <div className="px-3 py-3 text-center font-mono text-[10px] text-stone-400">No pitch-tracking data available to grade calls</div>
        )}
      </div>

      {report.challengeEvents.length > 0 && (
        <div className="border-t border-stone-100">
          <div className="px-3 pt-2.5 pb-1">
            <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400">ABS challenges</span>
          </div>
          {report.challengeEvents.map((c, i) => (
            <div key={i} className="px-3 py-1.5 border-b border-stone-50 last:border-0">
              <span className="text-[11.5px] text-stone-700">{c.batterName} vs {c.pitcherName} — Inn {c.inning}</span>
              <div className="font-mono text-[9px] text-stone-400">
                {c.overturned == null ? 'Outcome unclear' : c.overturned ? 'Overturned' : 'Call upheld'}
                {c.challengingTeam ? ` · challenged by ${c.challengingTeam}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="px-3 py-2 border-t border-stone-100">
        <p className="font-mono text-[8px] text-stone-300">
          Missed calls are computed from pitch-tracking zone data (not an official ruling). A pitch is only flagged as missed if it's clearly on the wrong side of the zone, with a small grace margin — third-party scorecard sites (e.g. Umpire Scorecards) use a probabilistic per-umpire fitted zone instead of a fixed rulebook rectangle, so exact missed-call counts won't match theirs 1:1; total-takes count should match closely, missed-call count may run a bit lower here by design. ABS challenge detection is best-effort — the field schema for this new system isn&apos;t independently verified.
        </p>
      </div>
    </div>
  )
}