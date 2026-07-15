'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { BatterGame, PitcherGame } from '@/lib/stats-gamelog'
import { aggregateBatting, aggregatePitching } from '@/lib/stats-gamelog'

type ChartType = 'line' | 'bar'

const STAT_OPTIONS: Record<string, { key: string; label: string; decimals: number }[]> = {
  rate_batter: [
    { key: 'avg', label: 'AVG', decimals: 3 },
    { key: 'obp', label: 'OBP', decimals: 3 },
    { key: 'slg', label: 'SLG', decimals: 3 },
    { key: 'ops', label: 'OPS', decimals: 3 },
  ],
  power: [
    { key: 'hrPerG', label: 'HR/G', decimals: 2 },
  ],
  discipline: [
    { key: 'bbPerG', label: 'BB/G', decimals: 2 },
    { key: 'soPerG', label: 'K/G', decimals: 2 },
  ],
  rate_pitcher: [
    { key: 'era', label: 'ERA', decimals: 2 },
    { key: 'whip', label: 'WHIP', decimals: 2 },
  ],
  strikeouts: [
    { key: 'k9', label: 'K/9', decimals: 1 },
    { key: 'bb9', label: 'BB/9', decimals: 1 },
  ],
}

function computeSeries(games: (BatterGame | PitcherGame)[], statKey: string, window: number, isPitcher: boolean) {
  const out: { g: number; v: number | null }[] = []
  for (let i = 0; i < games.length; i++) {
    if (i < window - 1) { out.push({ g: i + 1, v: null }); continue }
    const slice = games.slice(i - window + 1, i + 1)
    const agg: any = isPitcher
      ? aggregatePitching(slice as PitcherGame[])
      : computeBatterExtras(aggregateBatting(slice as BatterGame[]), slice as BatterGame[])
    out.push({ g: i + 1, v: typeof agg[statKey] === 'number' ? agg[statKey] : null })
  }
  return out
}

// hrPerG/bbPerG/soPerG aren't in the base aggregate — derive per-game rates here
function computeBatterExtras(agg: any, games: BatterGame[]) {
  const g = games.length || 1
  return {
    ...agg,
    hrPerG: agg.hr / g,
    bbPerG: agg.bb / g,
    soPerG: agg.so / g,
  }
}

export default function ChartBuilderModal({
  playerId, isPitcher, category, onClose,
}: {
  playerId: number
  isPitcher: boolean
  category: string
  onClose: () => void
}) {
  const optionsKey = category === 'rate' ? (isPitcher ? 'rate_pitcher' : 'rate_batter') : category
  const options = STAT_OPTIONS[optionsKey] ?? []

  const [games, setGames] = useState<(BatterGame | PitcherGame)[]>([])
  const [loading, setLoading] = useState(true)
  const [statKey, setStatKey] = useState(options[0]?.key ?? '')
 const [windowSize, setWindowSize] = useState(isPitcher ? 5 : 15)

  const [chartType, setChartType] = useState<ChartType>('line')
  const [saving, setSaving] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({
      subject: isPitcher ? 'pitcher' : 'batter',
      playerId: String(playerId),
      season: String(new Date().getFullYear()),
    })
    fetch(`/api/stats/gamelog?${params}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!cancelled) setGames(j.games ?? []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [playerId, isPitcher])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stat = options.find(s => s.key === statKey) ?? options[0]
  const series = useMemo(
  () => (stat ? computeSeries(games, stat.key, windowSize, isPitcher) : []),
  [games, stat, windowSize, isPitcher]
)

  async function saveAsPng() {
    if (!chartRef.current) return
    setSaving(true)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(chartRef.current, { pixelRatio: 2, backgroundColor: '#FAF8F3' })
      const link = document.createElement('a')
link.download = `player-${playerId}-${stat.key}-${windowSize}game-chart.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('[ChartBuilderModal] PNG export failed:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold">
              ⊕ Chart Lab
            </div>
            <h3 className="text-xl font-serif font-bold text-stone-900 mt-0.5">Build a chart</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-900 transition"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Stat picker */}
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2">Stat</div>
            <div className="flex flex-wrap gap-1.5">
              {options.map(o => (
                <button
                  key={o.key}
                  onClick={() => setStatKey(o.key)}
                  className={`font-mono text-[10.5px] uppercase tracking-widest px-3.5 py-2 rounded-full border transition ${
                    statKey === o.key
                      ? 'bg-[#1A1A1A] text-yellow-300 border-[#1A1A1A]'
                      : 'bg-white text-stone-500 border-stone-300 hover:border-stone-900'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chart type + window */}
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2">Chart type</div>
              <div className="flex bg-stone-100 p-1 rounded-full w-fit">
                {(['line', 'bar'] as ChartType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setChartType(t)}
                    className={`font-mono text-[10.5px] uppercase px-3.5 py-1.5 rounded-full transition ${
                      chartType === t ? 'bg-[#1A1A1A] text-yellow-300' : 'text-stone-500 hover:text-stone-900'
                    }`}
                  >
                    {t === 'line' ? 'Line' : 'Bar'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2">Window</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setWindowSize(w => Math.max(3, w - 1))} className="w-7 h-7 flex items-center justify-center border border-stone-300 rounded-full font-mono text-xs hover:border-stone-900">‹</button>
<span className="font-mono text-sm w-16 text-center">{windowSize} games</span>
<button onClick={() => setWindowSize(w => Math.min(games.length || w, w + 1))} className="w-7 h-7 flex items-center justify-center border border-stone-300 rounded-full font-mono text-xs hover:border-stone-900">›</button>
                </div>
            </div>
          </div>

          {/* Chart preview — this div is what gets exported to PNG */}
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2">Preview</div>
            <div
              ref={chartRef}
              className="bg-[#FAF8F3] border border-stone-200 rounded-xl p-5"
            >
              <div className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] mb-1">
                ⊕ The Edge · Rolling {windowSize}-game {stat?.label ?? ''}
              </div>
              {loading ? (
                <p className="text-xs font-serif italic text-stone-400 py-16 text-center">Loading…</p>
              ) : games.length < windowSize ? (
                <p className="text-xs font-serif italic text-stone-400 py-16 text-center">
                  Need at least {windowSize } games — {games.length} played.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  {chartType === 'line' ? (
                    <LineChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                      <XAxis dataKey="g" tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} />
                      <YAxis tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} width={44} domain={['auto', 'auto']} />
                      <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(stat?.decimals ?? 2) : '—')} labelFormatter={l => `Game ${l}`} />
                      <Line type="monotone" dataKey="v" stroke="#FF5722" strokeWidth={2.5} dot={false} connectNulls={false} />
                    </LineChart>
                  ) : (
                    <BarChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                      <XAxis dataKey="g" tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} />
                      <YAxis tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} width={44} domain={['auto', 'auto']} />
                      <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(stat?.decimals ?? 2) : '—')} labelFormatter={l => `Game ${l}`} />
                      <Bar dataKey="v" fill="#FF5722" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              )}
              <div className="mt-2 pt-2 border-t border-stone-200 flex justify-between items-center">
                <span className="font-mono text-[8px] text-stone-400 tracking-wide">edgereportdaily.com</span>
                <span className="font-mono text-[8px] text-stone-400">⊕</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-stone-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-900 px-4 py-2.5 transition"
          >
            Close
          </button>
          <button
            onClick={saveAsPng}
            disabled={saving || loading || games.length < windowSize}
            className="font-mono text-[10px] uppercase tracking-widest bg-[#1A1A1A] text-[#FAF8F3] px-5 py-2.5 rounded-lg hover:bg-[#FF5722] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save as PNG →'}
          </button>
        </div>
      </div>
    </div>
  )
}