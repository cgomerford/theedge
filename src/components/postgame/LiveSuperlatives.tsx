// src/components/postgame/LiveSuperlatives.tsx
//
// Live "fastest pitch / hardest hit / most break" leaderboard, shown on the
// game page while status is Live. Polls a small server-side API route
// (src/app/api/games/[gamePk]/live-superlatives/route.ts) rather than
// fetching the full GUMBO feed client-side — the feed payload is large and
// this keeps it off the browser entirely.
//
// Stops polling automatically once the feed reports isFinal — at that point
// the page should swap this out for <PostgameReport /> (see wiring notes).

'use client'

import { useEffect, useState } from 'react'
import type { LiveSuperlativesPayload } from '@/types/postgame'

const POLL_MS = 45_000
const ORANGE = '#FF5722'

export function LiveSuperlatives({ gamePk, onFinal }: { gamePk: number; onFinal?: () => void }) {
  const [data, setData] = useState<LiveSuperlativesPayload | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function poll() {
      try {
        const res = await fetch(`/api/games/${gamePk}/live-superlatives`, { cache: 'no-store' })
        if (!res.ok) throw new Error('bad response')
        const json: LiveSuperlativesPayload = await res.json()
        if (cancelled) return
        setData(json)
        setError(false)
        if (json.isFinal) {
          onFinal?.()
          return // stop polling — game's done
        }
      } catch {
        if (!cancelled) setError(true)
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS)
    }

    poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [gamePk, onFinal])

  if (error && !data) {
    return <div className="font-mono text-[11px] text-stone-400">Live stats unavailable right now.</div>
  }
  if (!data) {
    return <div className="font-mono text-[11px] text-stone-400">Loading live stats…</div>
  }

  return (
    <div className="border border-stone-200 bg-white">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-stone-200">
        <span className="inline-block w-2 h-2 rounded-full bg-red-600 animate-pulse" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-stone-500">
          Live · through the {ordinal(data.asOfInning)}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-stone-100">
        <Cell label="Fastest pitch"
          value={data.fastestPitch ? `${data.fastestPitch.speed} mph` : '—'}
          sub={data.fastestPitch?.pitcherName} />
        <Cell label="Most break"
          value={data.mostBreak ? `${data.mostBreak.breakLength}"` : '—'}
          sub={data.mostBreak?.pitcherName} />
        <Cell label="Highest spin"
          value={data.highestSpin ? `${data.highestSpin.spinRate} rpm` : '—'}
          sub={data.highestSpin?.pitcherName} />
        <Cell label="Hardest hit"
          value={data.hardestHit ? `${data.hardestHit.exitVelo} mph` : '—'}
          sub={data.hardestHit?.batterName} accent />
        <Cell label="Longest hit"
          value={data.longestHit ? `${data.longestHit.distance} ft` : '—'}
          sub={data.longestHit?.batterName} accent />
      </div>
    </div>
  )
}

function Cell({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="px-3 py-3">
      <div className="font-mono text-[9px] uppercase tracking-wide text-stone-500 mb-1">{label}</div>
      <div className="font-mono text-xl leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif", color: accent ? ORANGE : '#1A1A1A' }}>
        {value}
      </div>
      {sub && <div className="font-mono text-[9.5px] text-stone-500 mt-1 truncate">{sub}</div>}
    </div>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
