'use client'

// src/components/admin/TrendingPlayersSection.tsx

import { useState } from 'react'
import type { TrendingBatter, TrendingPitcher, Level, LevelTrendingResult } from '@/lib/trending-players'
import TrendingGraphicCard from './TrendingGraphicCard'

type Props = {
  trending: Record<Level, LevelTrendingResult>
}

type RoleTab = 'batters' | 'starters' | 'relievers'

const LEVEL_ORDER: Level[] = ['mlb', 'aaa', 'aa']
const LEVEL_LABEL: Record<Level, string> = { mlb: 'MLB', aaa: 'AAA', aa: 'AA' }
const LEVEL_SUB: Record<Level, string> = {
  mlb: 'Major League',
  aaa: 'Triple-A',
  aa: 'Double-A',
}

const ROLE_TABS: { key: RoleTab; label: string }[] = [
  { key: 'batters', label: 'Batters' },
  { key: 'starters', label: 'Starting Pitchers' },
  { key: 'relievers', label: 'Relief Pitchers' },
]

function fmtRate(n: number): string {
  return n.toFixed(3).replace(/^0/, '')
}

function CopyTweetButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch (e) {
      console.error('[trending] clipboard write failed:', e)
    }
  }

  return (
    <button type="button" onClick={handleCopy} className="trend-copy-btn">
      {copied ? '✓ Copied' : 'Copy tweet'}
    </button>
  )
}

// ── Batter card ──────────────────────────────────────────────────────

function BatterCard({ b, rank }: { b: TrendingBatter; rank: number }) {
  const scoreColor = b.compositeScore >= 0 ? '#15803d' : '#FF5722'
  const [showGraphic, setShowGraphic] = useState(false)

  return (
    <div className="trend-card">
      <div className="trend-card-top">
        <div className="trend-rank">{rank}</div>
        <img
          src={b.headshot}
          alt={b.name}
          className="trend-headshot"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
        <div className="trend-id">
          <div className="trend-name">{b.name}</div>
          <div className="trend-meta">
            {b.teamAbbr} · last {b.gamesCounted}
          </div>
        </div>
      </div>

      <div className="trend-stats" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <div className="trend-stat"><div className="trend-stat-v">{fmtRate(b.avg)}</div><div className="trend-stat-l">AVG</div></div>
        <div className="trend-stat"><div className="trend-stat-v">{fmtRate(b.ops)}</div><div className="trend-stat-l">OPS</div></div>
        <div className="trend-stat"><div className="trend-stat-v">{fmtRate(b.obp)}</div><div className="trend-stat-l">OBP</div></div>
        <div className="trend-stat"><div className="trend-stat-v">{b.rbi}</div><div className="trend-stat-l">RBI</div></div>
        <div className="trend-stat"><div className="trend-stat-v">{b.r}</div><div className="trend-stat-l">R</div></div>
        <div className="trend-stat"><div className="trend-stat-v">{b.bb}</div><div className="trend-stat-l">BB</div></div>
      </div>

      <div className="trend-card-bottom">
        <div className="trend-score">
          <span className="trend-score-v" style={{ color: scoreColor }}>
            {b.compositeScore >= 0 ? '+' : ''}
            {b.compositeScore.toFixed(2)}
          </span>
          <span className="trend-score-l">composite</span>
        </div>
        <div className="trend-actions">
          <CopyTweetButton text={b.tweetText} />
          <button type="button" onClick={() => setShowGraphic((s) => !s)} className="trend-graphic-btn">
            {showGraphic ? 'Hide graphic' : 'Graphic'}
          </button>
        </div>
      </div>

      {showGraphic && (
        <div className="trend-graphic-reveal">
          <TrendingGraphicCard data={b} rank={rank} />
        </div>
      )}
    </div>
  )
}

// ── Pitcher card ─────────────────────────────────────────────────────

function PitcherCard({ p, rank }: { p: TrendingPitcher; rank: number }) {
  const scoreColor = p.compositeScore >= 0 ? '#15803d' : '#FF5722'
  const gamesLabel = p.role === 'starter' ? 'starts' : 'outings'
  const [showGraphic, setShowGraphic] = useState(false)

  return (
    <div className="trend-card">
      <div className="trend-card-top">
        <div className="trend-rank">{rank}</div>
        <img
          src={p.headshot}
          alt={p.name}
          className="trend-headshot"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
        <div className="trend-id">
          <div className="trend-name">{p.name}</div>
          <div className="trend-meta">
            {p.teamAbbr} · last {p.gamesCounted} {gamesLabel}
          </div>
        </div>
      </div>

      <div className="trend-stats" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="trend-stat"><div className="trend-stat-v">{p.era.toFixed(2)}</div><div className="trend-stat-l">ERA</div></div>
        <div className="trend-stat"><div className="trend-stat-v">{p.whip.toFixed(2)}</div><div className="trend-stat-l">WHIP</div></div>
        <div className="trend-stat"><div className="trend-stat-v">{p.k}</div><div className="trend-stat-l">K</div></div>
        <div className="trend-stat"><div className="trend-stat-v">{p.bb}</div><div className="trend-stat-l">BB</div></div>
        <div className="trend-stat"><div className="trend-stat-v">{p.ip}</div><div className="trend-stat-l">IP</div></div>
      </div>

      <div className="trend-card-bottom">
        <div className="trend-score">
          <span className="trend-score-v" style={{ color: scoreColor }}>
            {p.compositeScore >= 0 ? '+' : ''}
            {p.compositeScore.toFixed(2)}
          </span>
          <span className="trend-score-l">composite</span>
        </div>
        <div className="trend-actions">
          <CopyTweetButton text={p.tweetText} />
          <button type="button" onClick={() => setShowGraphic((s) => !s)} className="trend-graphic-btn">
            {showGraphic ? 'Hide graphic' : 'Graphic'}
          </button>
        </div>
      </div>

      {showGraphic && (
        <div className="trend-graphic-reveal">
          <TrendingGraphicCard data={p} rank={rank} />
        </div>
      )}
    </div>
  )
}

// ── Level column ─────────────────────────────────────────────────────

function LevelColumn({ level, result, role }: { level: Level; result: LevelTrendingResult; role: RoleTab }) {
  const items: TrendingBatter[] | TrendingPitcher[] =
    role === 'batters' ? result.batters : role === 'starters' ? result.startingPitchers : result.reliefPitchers
  const roleLabel = ROLE_TABS.find((t) => t.key === role)?.label.toLowerCase() ?? role

  return (
    <div className="trend-col">
      <div className="trend-col-head">
        <span className="trend-col-mark">⊕</span>
        <span className="trend-col-title">{LEVEL_LABEL[level]}</span>
        <span className="trend-col-sub">{LEVEL_SUB[level]}</span>
      </div>

      {items.length === 0 ? (
        <div className="trend-empty">No qualifying {roleLabel} for {LEVEL_LABEL[level]} right now.</div>
      ) : role === 'batters' ? (
        <div className="trend-list">
          {(items as TrendingBatter[]).map((b, i) => (
            <BatterCard key={b.personId} b={b} rank={i + 1} />
          ))}
        </div>
      ) : (
        <div className="trend-list">
          {(items as TrendingPitcher[]).map((p, i) => (
            <PitcherCard key={p.personId} p={p} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function TrendingPlayersSection({ trending }: Props) {
  const [role, setRole] = useState<RoleTab>('batters')

  return (
    <div className="trend-wrap">
      <style>{css}</style>

      <div className="trend-role-tabs">
        {ROLE_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setRole(t.key)}
            className={`trend-role-tab${role === t.key ? ' active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="trend-grid">
        {LEVEL_ORDER.map((level) => (
          <LevelColumn key={level} level={level} result={trending[level]} role={role} />
        ))}
      </div>
    </div>
  )
}

const css = `
.trend-wrap { font-family: 'JetBrains Mono', ui-monospace, monospace; }
.trend-role-tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.trend-role-tab { font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; padding: 8px 14px; border: 1px solid #1A1A1A; background: #FAF8F3; cursor: pointer; color: #1A1A1A; }
.trend-role-tab:hover { background: #1A1A1A; color: #FAF8F3; }
.trend-role-tab.active { background: #1A1A1A; color: #FAF8F3; }
.trend-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.trend-col { display: flex; flex-direction: column; gap: 10px; }
.trend-col-head { display: flex; align-items: baseline; gap: 6px; border-bottom: 2px solid #1A1A1A; padding-bottom: 6px; margin-bottom: 4px; }
.trend-col-mark { color: #FF5722; font-size: 16px; }
.trend-col-title { font-family: 'Bebas Neue', sans-serif; font-size: 20px; letter-spacing: .5px; }
.trend-col-sub { margin-left: auto; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #6b6b66; }
.trend-empty { border: 1px dashed #1A1A1A1a; padding: 14px; font-size: 12px; color: #6b6b66; background: #fff; }
.trend-list { display: flex; flex-direction: column; gap: 8px; }
.trend-card { border: 1px solid #1A1A1A1a; background: #fff; padding: 10px 12px; }
.trend-card-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.trend-rank { font-family: 'Bebas Neue', sans-serif; font-size: 22px; color: #FF5722; width: 22px; text-align: center; flex-shrink: 0; }
.trend-headshot { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; background: #F0EBE0; flex-shrink: 0; }
.trend-id { min-width: 0; }
.trend-name { font-family: Fraunces, Georgia, serif; font-weight: 700; font-size: 13.5px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.trend-meta { font-size: 9.5px; color: #6b6b66; text-transform: uppercase; letter-spacing: .5px; margin-top: 1px; }
.trend-stats { display: grid; gap: 4px; border-top: 1px dashed #1A1A1A1a; border-bottom: 1px dashed #1A1A1A1a; padding: 8px 0; margin-bottom: 8px; }
.trend-stat { text-align: center; }
.trend-stat-v { font-family: 'Bebas Neue', sans-serif; font-size: 15px; line-height: 1; }
.trend-stat-l { font-size: 8px; color: #6b6b66; text-transform: uppercase; letter-spacing: .5px; margin-top: 2px; }
.trend-card-bottom { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.trend-score { line-height: 1; }
.trend-score-v { font-family: 'Bebas Neue', sans-serif; font-size: 14px; }
.trend-score-l { font-size: 8px; color: #6b6b66; text-transform: uppercase; letter-spacing: .5px; margin-left: 5px; }
.trend-actions { display: flex; gap: 6px; }
.trend-copy-btn, .trend-graphic-btn { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; border: 1px solid #1A1A1A; background: #FAF8F3; padding: 5px 9px; cursor: pointer; color: #1A1A1A; }
.trend-copy-btn:hover, .trend-graphic-btn:hover { background: #1A1A1A; color: #FAF8F3; }
.trend-graphic-reveal { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #1A1A1A1a; }
@media (max-width: 900px) {
  .trend-grid { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .trend-stats { grid-template-columns: repeat(3, 1fr) !important; row-gap: 8px; }
}
`