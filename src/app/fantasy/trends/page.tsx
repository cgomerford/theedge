// src/app/fantasy/trends/page.tsx

import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import FantasySubNav from '@/components/fantasy/FantasySubNav'
import { getCurrentSubscriber } from '@/lib/auth'
import { getBatterFormSignals, getPitcherFormSignals, type FormSignalRow } from '@/lib/player-form'

export const revalidate = 3600
export const metadata = {
  title: 'Trends · The Fantasy Desk · The Edge',
  description: 'Batters and pitchers whose recent form just peaked or bottomed out — a real, backtested signal, not a guess.',
}

const playerHeadshotUrl = (id: number) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`

function fmtValue(v: number, playerType: 'batter' | 'pitcher'): string {
  return playerType === 'pitcher' ? v.toFixed(2) : v.toFixed(3).replace(/^0/, '')
}

export default async function TrendsPage() {
  const [batting, pitching, subscriber] = await Promise.all([
    getBatterFormSignals(),
    getPitcherFormSignals(),
    getCurrentSubscriber(),
  ])
  const isPro = subscriber?.is_pro ?? false

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-stone-900 overflow-x-hidden">
      <SiteHeader variant="page" />
      <FantasySubNav active="trends" isPro={isPro} />

      <div className="border-b-2 border-stone-900 bg-stone-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-orange-700 mb-2">
            § Trends
          </div>
          <h1 className="font-serif font-light text-5xl sm:text-7xl tracking-tight leading-none">
            Peaked or bottomed<span className="text-orange-600">.</span>
          </h1>
          <p className="text-stone-500 font-serif italic mt-3 text-base sm:text-lg max-w-2xl">
            Real local peaks and troughs in rolling form — backtested, not a raw last-N-games average.
            Regression to the mean cuts both ways: a hot streak tends to give some back, a cold one tends to bounce.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-10">
        {isPro ? (
          <>
            <TrendSection title="Batting — cooling off (rolling OPS peaked recently)" tone="cooling" rows={batting.cooling} playerType="batter" />
            <TrendSection title="Batting — heating up (rolling OPS bottomed recently)" tone="heating" rows={batting.heating} playerType="batter" />
            <TrendSection title="Pitching — cooling off (rolling ERA bottomed recently)" tone="cooling" rows={pitching.cooling} playerType="pitcher" />
            <TrendSection title="Pitching — heating up (rolling ERA peaked recently)" tone="heating" rows={pitching.heating} playerType="pitcher" />

            {batting.cooling.length + batting.heating.length + pitching.cooling.length + pitching.heating.length === 0 && (
              <div className="border border-dashed border-stone-300 rounded-lg bg-stone-50 p-6 text-sm text-stone-500 font-serif italic text-center">
                No signals flagged today — this runs once daily and only fires on ~15-20% of the tracked pool by design, not every player every day.
              </div>
            )}
          </>
        ) : (
          <>
            <TrendSection title="Batting — heating up" tone="heating" rows={batting.heating.slice(0, 2)} playerType="batter" />
            <section className="bg-stone-900 rounded-lg p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-yellow-300 font-bold mb-2">
                    ⊕ Pro Tier · £4/mo · Founding 100
                  </div>
                  <h3 className="font-serif font-light text-2xl text-white leading-tight mb-2">
                    See every trending batter and pitcher.
                  </h3>
                  <p className="text-sm text-stone-400 font-serif">
                    Free shows the top 2. Pro sees the full board — both directions, both subjects.
                  </p>
                </div>
                <Link href="/pricing" className="shrink-0 text-xs font-mono uppercase tracking-widest bg-yellow-300 text-stone-900 px-6 py-3 hover:bg-yellow-200 transition whitespace-nowrap rounded">
                  See Pro →
                </Link>
              </div>
            </section>
          </>
        )}
      </div>

      <footer className="border-t border-stone-200 mt-8 px-4 sm:px-6 py-8 text-[11px] font-mono text-stone-400 bg-stone-50">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/fantasy" className="hover:text-stone-600 transition">Fantasy Desk</Link>
            <Link href="/fantasy/streamers" className="hover:text-stone-600 transition">Streamers</Link>
            <Link href="/fantasy/two-start" className="hover:text-stone-600 transition">Two-Start</Link>
          </div>
          <div className="text-stone-300 uppercase tracking-wider">Information only · Not gambling advice</div>
        </div>
      </footer>
    </main>
  )
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * 64,
    2 + 12 - ((v - min) / range) * 12,
  ] as [number, number])
  let d = `M ${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]
    d += ` Q ${x0},${y0} ${(x0 + x1) / 2},${(y0 + y1) / 2}`
  }
  d += ` L ${pts[pts.length - 1][0]},${pts[pts.length - 1][1]}`
  return (
    <svg width={64} height={16} viewBox="0 0 64 16" className="shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth={1.25} strokeLinecap="round" opacity={0.8} />
    </svg>
  )
}

function TrendSection({
  title, tone, rows, playerType,
}: { title: string; tone: 'heating' | 'cooling'; rows: FormSignalRow[]; playerType: 'batter' | 'pitcher' }) {
  if (rows.length === 0) return null
  const color = tone === 'heating' ? '#059669' : '#DC2626'

  return (
    <section>
      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3 pb-2 border-b border-stone-200">
        {title}
      </div>
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {rows.map(r => (
          <Link
            key={r.playerId}
            href={`/stats/player/${r.playerId}?subject=${playerType}&name=${encodeURIComponent(r.playerName)}&team=${encodeURIComponent(r.teamName ?? '')}`}
            className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 last:border-b-0 hover:bg-stone-50/70 transition-colors"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- external CDN, small fixed size */}
            <img src={playerHeadshotUrl(r.playerId)} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 bg-stone-100" />
            <div className="flex-1 min-w-0">
              <div className="font-serif text-sm font-semibold text-stone-900 truncate">{r.playerName}</div>
              <div className="font-mono text-[10px] text-stone-400">{r.teamName ?? '—'}</div>
            </div>
            <Sparkline values={r.trend} color={color} />
            <div className="text-right shrink-0 w-20">
              <div className="font-mono text-xs font-bold text-stone-900">{fmtValue(r.currentValue, playerType)}</div>
              <div className="font-mono text-[10px]" style={{ color }}>
                {tone === 'heating' ? '▲' : '▼'} {r.magnitude.toFixed(playerType === 'pitcher' ? 2 : 3)}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}