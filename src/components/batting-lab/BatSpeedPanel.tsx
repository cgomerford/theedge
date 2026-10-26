'use client'

// Bat speed & contact quality: real per-swing Statcast fields from the Batting Lab data (Pro or the viewer's deep look only; empty otherwise).
import { useBattingLabData } from '@/lib/batting-lab-context'

function fmtRate(v: number | null): string {
  return v == null ? '—' : v.toFixed(3).replace(/^0\./, '.')
}

export default function BatSpeedPanel() {
  const { data } = useBattingLabData()
  if (!data) return null
  const { batSpeed } = data
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Bat speed &amp; contact quality</p>
        <p className="text-[10px] text-stone-400 mb-4">Real per-swing Statcast fields — bat speed, exit velo, and whether the results match the contact quality.</p>

        {batSpeed === null ? (
          <p className="text-[12px] text-stone-400 text-center py-6">No bat-speed data on record yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
              <div>
                <div className="text-[9px] text-stone-400">Avg bat speed</div>
                <div className="text-[20px] font-black text-stone-900">{batSpeed.avgBatSpeed != null ? `${batSpeed.avgBatSpeed.toFixed(1)}` : '—'}<span className="text-[11px] text-stone-400 ml-1">mph</span></div>
              </div>
              <div>
                <div className="text-[9px] text-stone-400">Avg exit velo</div>
                <div className="text-[20px] font-black text-stone-900">{batSpeed.avgExitVelo != null ? `${batSpeed.avgExitVelo.toFixed(1)}` : '—'}<span className="text-[11px] text-stone-400 ml-1">mph</span></div>
              </div>
              <div>
                <div className="text-[9px] text-stone-400">xwOBA</div>
                <div className="text-[20px] font-black text-stone-900">{fmtRate(batSpeed.avgXwoba)}</div>
              </div>
              <div>
                <div className="text-[9px] text-stone-400">xwOBA − wOBA</div>
                <div className="text-[20px] font-black" style={{ color: (batSpeed.xwobaMinusWoba ?? 0) > 0 ? '#059669' : '#DC2626' }}>
                  {batSpeed.xwobaMinusWoba != null ? (batSpeed.xwobaMinusWoba > 0 ? '+' : '') + fmtRate(batSpeed.xwobaMinusWoba) : '—'}
                </div>
              </div>
            </div>
            <p className="text-[9px] text-stone-400 mb-3">Positive xwOBA − wOBA means the contact quality says he should be producing more than the results show — &quot;loud outs.&quot; Negative means results are outrunning the quality of contact.</p>

            {batSpeed.missByPitchSeason.length > 0 && (
              <div className="pt-4 border-t border-stone-100">
                <p className="text-[9px] uppercase tracking-widest text-stone-400 mb-2">Miss distance by pitch type — real, on his own swinging strikes</p>
                <div className="space-y-1.5">
                  {batSpeed.missByPitchSeason.slice(0, 6).map(m => (
                    <div key={m.pitchType} className="flex items-center gap-3 text-[11px]">
                      <span className="w-28 shrink-0 text-stone-700 font-bold truncate">{m.pitchName}</span>
                      <span className="text-stone-400">n={m.whiffs}</span>
                      <span className="ml-auto text-stone-600">{m.avgMissDistanceIn != null ? `${m.avgMissDistanceIn.toFixed(1)}in miss` : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
  )
}
