'use client'

// src/components/admin/TrendingGraphicCard.tsx
//
// Shareable static graphic — now supports both batters and pitchers via
// a union prop (auto-detected: pitchers have an `era` field, batters
// don't). Dark-stage theme kept deliberately separate from the reel's
// white flip — this stays the "print card" look; the white theme was a
// request specific to the reel, not a signal to flip every trending
// visual.
//
// Renders at true export resolution (1080×1080) inside a scaled preview
// wrapper — html-to-image captures the unscaled ref so the downloaded
// PNG is always full-res regardless of on-screen preview size.

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { teamLogoUrl, teamLogoUrlPng } from '@/lib/mlb'
import type { TrendingBatter, TrendingPitcher, Level } from '@/lib/trending-players'

const LEVEL_LABEL: Record<Level, string> = { mlb: 'MLB', aaa: 'AAA', aa: 'AA' }

function fmtRate(n: number): string {
  return n.toFixed(3).replace(/^0/, '')
}

function isPitcher(x: TrendingBatter | TrendingPitcher): x is TrendingPitcher {
  return 'era' in x
}

const EXPORT_W = 1080
const EXPORT_H = 1080

// Team logo with a fallback chain: PNG spot logo -> SVG team-logos asset
// -> plain abbreviation monogram. PNG coverage has confirmed gaps for
// AAA/AA affiliates; the monogram guarantees the badge never just
// silently disappears.
function TeamLogoBadge({ teamId, teamAbbr, teamName }: { teamId: number | null; teamAbbr: string; teamName: string }) {
  const [stage, setStage] = useState<'png' | 'svg' | 'fallback'>('png')

  if (teamId == null || stage === 'fallback') {
    return (
      <div className="tg-team-logo tg-team-logo-fallback" aria-label={teamName}>
        {teamAbbr}
      </div>
    )
  }

  const src = stage === 'png' ? teamLogoUrlPng(teamId, 200) : teamLogoUrl(teamId)
  return (
    <img
      key={stage}
      src={src}
      alt={teamName}
      className="tg-team-logo"
      crossOrigin="anonymous"
      onError={() => setStage((s) => (s === 'png' ? 'svg' : 'fallback'))}
    />
  )
}

export default function TrendingGraphicCard({
  data,
  rank,
  previewScale = 0.32,
}: {
  data: TrendingBatter | TrendingPitcher
  rank: number
  previewScale?: number
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const pitcher = isPitcher(data)

  async function handleDownload() {
    if (!cardRef.current) return
    setExporting(true)
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true })
      const link = document.createElement('a')
      link.download = `trending-${data.level}-${data.teamAbbr}-${data.personId}.png`
      link.href = dataUrl
      link.click()
    } catch (e) {
      console.error('[trending-graphic] export failed:', e)
    } finally {
      setExporting(false)
    }
  }

  // Defensive: if h/ab are ever missing from batter data (rather than
  // genuinely 0), show '—' instead of a blank/confusing "-for-".
  const hasHitLine = !pitcher && data.h != null && data.ab != null
  const hasHr = !pitcher && data.hr != null
  const roleTag = pitcher ? (data.role === 'starter' ? 'STARTER' : 'RELIEVER') : ''

  return (
    <div className="tg-wrap">
      <style>{css}</style>

      <div
        className="tg-preview"
        style={{ width: EXPORT_W * previewScale, height: EXPORT_H * previewScale }}
      >
        <div
          ref={cardRef}
          className="tg-card"
          style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left' }}
        >
          <div className="tg-watermark" aria-hidden>
            {Array.from({ length: 30 }).map((_, i) => (
              <span key={i}>⊕</span>
            ))}
          </div>

          <div className="tg-topbar">
            <span className="tg-brand">⊕ THE EDGE</span>
            <span className="tg-level">
              {LEVEL_LABEL[data.level]} TRENDING{pitcher ? ` · ${roleTag}` : ''} · #{rank}
            </span>
          </div>

          <div className="tg-hero">
            <div className="tg-headshot-ring">
              <img
                src={data.headshot}
                alt={data.name}
                className="tg-headshot"
                crossOrigin="anonymous"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.visibility = 'hidden'
                }}
              />
              <TeamLogoBadge teamId={data.teamId} teamAbbr={data.teamAbbr} teamName={data.teamName} />
            </div>

            <div className="tg-name">{data.name}</div>
            <div className="tg-team">{data.teamAbbr}</div>
            {pitcher ? (
              <div className="tg-line">
                last {data.gamesCounted} {data.role === 'starter' ? 'starts' : 'outings'} · {data.ip} IP
              </div>
            ) : (
              <div className="tg-line">
                {hasHitLine ? `${data.h}-for-${data.ab}` : '—'} · last {data.gamesCounted} games
              </div>
            )}
          </div>

          <div className="tg-stats" style={{ gridTemplateColumns: pitcher ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)' }}>
            {pitcher ? (
              <>
                <div className="tg-stat"><div className="tg-v">{data.era.toFixed(2)}</div><div className="tg-l">ERA</div></div>
                <div className="tg-stat"><div className="tg-v">{data.whip.toFixed(2)}</div><div className="tg-l">WHIP</div></div>
                <div className="tg-stat"><div className="tg-v">{data.k}</div><div className="tg-l">K</div></div>
                <div className="tg-stat"><div className="tg-v">{data.bb}</div><div className="tg-l">BB</div></div>
                <div className="tg-stat"><div className="tg-v">{data.ip}</div><div className="tg-l">IP</div></div>
              </>
            ) : (
              <>
                <div className="tg-stat"><div className="tg-v">{fmtRate(data.avg)}</div><div className="tg-l">AVG</div></div>
                <div className="tg-stat"><div className="tg-v">{fmtRate(data.obp)}</div><div className="tg-l">OBP</div></div>
                <div className="tg-stat"><div className="tg-v">{fmtRate(data.slg)}</div><div className="tg-l">SLG</div></div>
                <div className="tg-stat"><div className="tg-v">{fmtRate(data.ops)}</div><div className="tg-l">OPS</div></div>
                <div className="tg-stat"><div className="tg-v">{hasHr ? data.hr : '—'}</div><div className="tg-l">HR</div></div>
                <div className="tg-stat"><div className="tg-v">{data.rbi}</div><div className="tg-l">RBI</div></div>
                <div className="tg-stat"><div className="tg-v">{data.r}</div><div className="tg-l">R</div></div>
                <div className="tg-stat"><div className="tg-v">{data.bb}</div><div className="tg-l">BB</div></div>
              </>
            )}
          </div>

          <div className="tg-foot">edgereportdaily.com</div>
        </div>
      </div>

      <button type="button" onClick={handleDownload} disabled={exporting} className="tg-download-btn">
        {exporting ? 'Exporting…' : 'Download PNG'}
      </button>
    </div>
  )
}

const css = `
.tg-wrap { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.tg-preview { overflow: hidden; position: relative; background: #1A1A1A; }
.tg-card {
  position: relative; overflow: hidden;
  width: ${EXPORT_W}px; height: ${EXPORT_H}px;
  background: #1A1A1A; color: #FAF8F3;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  padding: 60px 56px; box-sizing: border-box;
  display: flex; flex-direction: column; justify-content: space-between;
}
.tg-card::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 10px; background: #FF5722; }
.tg-watermark {
  position: absolute; inset: -100px; display: flex; flex-wrap: wrap; align-content: flex-start;
  gap: 40px; padding: 40px; opacity: .045; transform: rotate(-18deg) scale(1.3); pointer-events: none;
}
.tg-watermark span { font-size: 64px; color: #FAF8F3; }
.tg-topbar { position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: baseline; flex-shrink: 0; }
.tg-brand { font-family: Fraunces, Georgia, serif; font-weight: 900; font-size: 30px; letter-spacing: -.5px; }
.tg-level { font-size: 15px; letter-spacing: 1.5px; text-transform: uppercase; color: #FF5722; font-weight: 700; text-align: right; }
.tg-hero { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; text-align: center; flex-shrink: 0; }
.tg-headshot-ring { position: relative; width: 260px; height: 260px; border-radius: 50%; border: 5px solid #FF5722; padding: 6px; margin-bottom: 26px; box-sizing: border-box; }
.tg-headshot { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; background: #333; display: block; }
.tg-team-logo { position: absolute; bottom: -6px; right: -6px; width: 84px; height: 84px; object-fit: contain; background: #1A1A1A; border-radius: 50%; padding: 6px; box-sizing: border-box; }
.tg-team-logo-fallback {
  display: flex; align-items: center; justify-content: center;
  font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 20px; letter-spacing: .5px;
  color: #FAF8F3; background: #FF5722; border: 3px solid #1A1A1A;
}
.tg-name { font-family: Fraunces, Georgia, serif; font-weight: 700; font-size: 56px; line-height: 1.05; }
.tg-team { font-size: 19px; letter-spacing: 1.5px; text-transform: uppercase; color: #D8D8D8; margin-top: 10px; }
.tg-line { font-size: 16px; letter-spacing: .5px; color: #FF5722; margin-top: 12px; font-weight: 700; }
.tg-stats {
  position: relative; z-index: 1; display: grid; gap: 30px 10px;
  border-top: 1px solid rgba(255,255,255,.15); border-bottom: 1px solid rgba(255,255,255,.15);
  padding: 34px 0; flex-shrink: 0;
}
.tg-stat { text-align: center; }
.tg-v { font-family: 'Bebas Neue', sans-serif; font-size: 44px; line-height: 1; color: #FAF8F3; }
.tg-l { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #FF5722; margin-top: 8px; font-weight: 700; }
.tg-foot { position: relative; z-index: 1; text-align: center; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; color: #8a8a85; flex-shrink: 0; }
.tg-download-btn {
  font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
  border: 1px solid #1A1A1A; background: #FF5722; color: #fff; padding: 7px 14px; cursor: pointer;
}
.tg-download-btn:hover { background: #e14a19; }
.tg-download-btn:disabled { opacity: .5; cursor: not-allowed; }
`