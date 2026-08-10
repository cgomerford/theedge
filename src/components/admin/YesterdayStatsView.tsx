// src/components/admin/YesterdayStatsView.tsx
'use client'

import { useState } from 'react'
import type { YesterdayStatsPayload, StatNugget } from '@/types/live-tracker'

const CATEGORY_LABEL: Record<StatNugget['category'], string> = {
  'fastest-pitch': 'Fastest Pitch',
  'hardest-hit': 'Hardest Hit',
  'longest-hit': 'Longest Hit',
  'strikeouts': 'Strikeouts',
  'swinging-strike-pct': 'Swinging Strike %',
  'multi-hr': 'Multi-HR',
  'best-pitching-line': 'Best Pitching Line',
  'longest-at-bat': 'Longest At-Bat',
  'most-patient': 'Most Patient',
  'biggest-inning': 'Biggest Inning',
  'blowout-margin': 'Blowout Margin',
}

export function YesterdayStatsView({ payload }: { payload: YesterdayStatsPayload }) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function copy(nugget: StatNugget) {
    navigator.clipboard.writeText(nugget.headline)
    setCopiedId(nugget.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className="ys-wrap">
      <div className="ys-header">
        <div className="ys-title"><span className="ys-glyph">⊕</span> YESTERDAY'S STATS</div>
        <div className="ys-meta">
          {payload.date} · {payload.gamesIncluded} games{payload.gamesMissing > 0 ? ` · ${payload.gamesMissing} unavailable` : ''} · {payload.nuggets.length} nuggets
        </div>
      </div>

      {payload.nuggets.length === 0 && (
        <div className="ys-empty">Nothing compiled — either no games finished yesterday or the feed's unavailable right now.</div>
      )}

      <div className="ys-list">
        {payload.nuggets.map(n => (
          <div key={n.id} className="ys-card">
            <div className="ys-card-top">
              <span className="ys-cat">{CATEGORY_LABEL[n.category]} #{n.rank}</span>
              <button className="ys-copy" onClick={() => copy(n)}>
                {copiedId === n.id ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="ys-headline">{n.headline}</div>
            <div className="ys-value">{n.value}</div>
          </div>
        ))}
      </div>

      <style>{`
        .ys-wrap { font-family: 'Inter', sans-serif; color: #1A1A1A; background: #FAF8F3; padding: 24px; max-width: 1100px; margin: 0 auto; }
        .ys-header { border-bottom: 3px solid #1A1A1A; padding-bottom: 12px; margin-bottom: 20px; }
        .ys-title { font-family: 'Fraunces', serif; font-weight: 800; font-size: 20px; letter-spacing: -0.3px; }
        .ys-glyph { color: #FF5722; margin-right: 4px; }
        .ys-meta { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #6b6b66; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
        .ys-empty { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #6b6b66; padding: 30px 0; }
        .ys-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
        .ys-card { background: #fff; border: 1px solid #E8E4DA; border-left: 3px solid #FF5722; padding: 12px 14px; }
        .ys-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .ys-cat { font-family: 'JetBrains Mono', monospace; font-size: 8.5px; text-transform: uppercase; letter-spacing: 1.2px; color: #FF5722; }
        .ys-copy { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; padding: 3px 8px; border: 1px solid #1A1A1A; background: #FAF8F3; cursor: pointer; border-radius: 0; }
        .ys-headline { font-family: Georgia, serif; font-size: 13.5px; line-height: 1.4; margin-bottom: 6px; }
        .ys-value { font-family: 'Bebas Neue', sans-serif; font-size: 20px; color: #1A1A1A; }
      `}</style>
    </div>
  )
}
