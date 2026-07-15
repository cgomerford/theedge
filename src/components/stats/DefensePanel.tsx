'use client';

import type { FieldingStats, OutsAboveAverage } from '@/lib/batter-fielding';

export default function DefensePanel({
  fielding,
  oaa,
}: {
  fielding: FieldingStats | null;
  oaa: OutsAboveAverage | null;
}) {
  if (!fielding && !oaa) {
    return (
      <p className="text-xs font-serif italic text-stone-400 py-6 text-center">
        No defensive data on record yet.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* OAA Section */}
      {oaa && (
        <div className="bg-white rounded-xl border border-stone-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[1px] text-orange-600 font-bold">
                OUTS ABOVE AVERAGE
              </p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span
                  className={`text-4xl font-mono font-bold tabular-nums ${
                    oaa.outsAboveAverage > 0
                      ? 'text-green-600'
                      : oaa.outsAboveAverage < 0
                      ? 'text-red-500'
                      : 'text-stone-400'
                  }`}
                >
                  {oaa.outsAboveAverage > 0 ? '+' : ''}
                  {oaa.outsAboveAverage}
                </span>
                <span className="text-xs text-stone-500 font-medium">OAA</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">
                RUNS PREVENTED
              </div>
              <div
                className={`text-xl font-mono font-bold tabular-nums ${
                  oaa.fieldingRunsPrevented > 0 ? 'text-green-600' : 'text-stone-900'
                }`}
              >
                {oaa.fieldingRunsPrevented > 0 ? '+' : ''}
                {oaa.fieldingRunsPrevented}
              </div>
            </div>
          </div>

          {/* Success Rates */}
          <div className="grid grid-cols-2 gap-4 mb-5 text-center border-t border-b border-stone-100 py-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-1">
                ACTUAL SUCCESS
              </div>
              <div className="text-2xl font-mono font-semibold text-stone-900 tabular-nums">
                {oaa.actualSuccessRate}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-1">
                EXPECTED SUCCESS
              </div>
              <div className="text-2xl font-mono font-semibold text-stone-400 tabular-nums">
                {oaa.estimatedSuccessRate}
              </div>
            </div>
          </div>

          {/* Directional Breakdown */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-1">IN FRONT</div>
              <div className="font-mono text-sm font-semibold text-stone-700 tabular-nums">
                {oaa.oaaInFront > 0 ? '+' : ''}
                {oaa.oaaInFront}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-1">
                LATERAL
              </div>
              <div className="font-mono text-sm font-semibold text-stone-700 tabular-nums">
                {oaa.oaaLateralToward3B > 0 ? '+' : ''}
                {oaa.oaaLateralToward3B} /{' '}
                {oaa.oaaLateralToward1B > 0 ? '+' : ''}
                {oaa.oaaLateralToward1B}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-1">BEHIND</div>
              <div className="font-mono text-sm font-semibold text-stone-700 tabular-nums">
                {oaa.oaaBehind > 0 ? '+' : ''}
                {oaa.oaaBehind}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Traditional Fielding */}
      {fielding && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[1px] text-stone-400 mb-4 flex items-center gap-2">
            TRADITIONAL FIELDING
            <span className="text-xs text-stone-500">• {fielding.position}</span>
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-5">
            {[
              { label: 'Fielding %', value: fielding.fieldingPct },
              { label: 'Games', value: fielding.gamesPlayed },
              { label: 'Assists', value: fielding.assists },
              { label: 'Put Outs', value: fielding.putOuts },
              { label: 'Errors', value: fielding.errors },
              { label: 'Double Plays', value: fielding.doublePlays },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between sm:block">
                <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">
                  {label}
                </div>
                <div className="font-mono text-lg font-semibold text-stone-900 tabular-nums">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}