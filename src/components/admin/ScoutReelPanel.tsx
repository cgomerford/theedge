// src/components/admin/ScoutReelPanel.tsx
//
// UI for the Scout Report MP4 export — pick one row for a single reveal,
// or build a reel from several rows, in whatever order you want. Reuses
// scout-video.ts (drawing) and video-export.ts (record/transcode, via
// scout-video.ts's re-exports) — no new pipeline code here, just
// selection UI + wiring, same shape as VideoExportPanel.tsx.
//
// A "Load key edges" shortcut pre-selects report.keyEdges in weight order —
// that's already the report's own top-5 pick, so it's the fastest path to
// a reel with zero manual curation if you just want something posted fast.

'use client'

import { useMemo, useRef, useState } from 'react'
import {
  preloadFonts,
  preloadScoutRowImage,
  drawScoutRowFrame,
  drawScoutReelFrame,
  scoutReelDurationMs,
  recordToWebm,
  transcodeWebmToMp4,
  CANVAS,
  type ScoutImage,
  type ScoutReelConfig,
  type ScoutVideoContext,
} from '@/lib/scout-video'
import { playerHeadshotUrl, teamLogoUrlPng } from '@/lib/mlb'
import type { ScoutReport, ScoutRow, ScoutSection } from '@/lib/scout'

const COLORS = { orange: '#FF5722', stone: '#1A1A1A', gray: '#A3A3A3', line: '#E2DCCF', cream: '#FAF8F3' } as const

const PREVIEW_W = 270
const PREVIEW_H = 480
const REEL_MAX = 8
const SINGLE_DURATION_MS = 3200 // matches the 3200ms "settled" point used as the reel's cross-fade-in frame
const REEL_SLOT_MS = 4500        // longer than the Top3 stat reel — there's a sentence to read
const REEL_CROSSFADE_MS = 350

type Mode = 'single' | 'reel'
type Stage = 'idle' | 'recording' | 'transcoding' | 'done' | 'error'

const SECTION_LABEL: Record<ScoutSection, string> = {
  pitching: 'Pitching',
  batting: 'Batting',
  offense: 'Offense',
  bullpen: 'Bullpen',
  moves: 'Roster Moves',
  situation: 'Situation',
}

const SECTION_ORDER: ScoutSection[] = ['pitching', 'batting', 'bullpen', 'moves', 'situation', 'offense']

function ThumbImage({ row, context, size }: { row: ScoutRow; context: ScoutVideoContext; size: number }) {
  const [failed, setFailed] = useState(false)
  const isTeam = row.subsectionPlayerId == null
  const src = row.subsectionPlayerId != null
    ? playerHeadshotUrl(row.subsectionPlayerId, 80)
    : row.lean === 'home' ? teamLogoUrlPng(context.homeTeamId, 80)
    : row.lean === 'away' ? teamLogoUrlPng(context.awayTeamId, 80)
    : null

  if (!src || failed) {
    return (
      <div style={{
        width: size, height: size, borderRadius: isTeam ? 0 : '50%', flexShrink: 0,
        background: COLORS.stone, color: COLORS.cream, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'JetBrains Mono, monospace', fontSize: size * 0.36, fontWeight: 700,
      }}>
        ⊕
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src} alt="" onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: isTeam ? 0 : '50%', objectFit: isTeam ? 'contain' : 'cover', flexShrink: 0 }}
    />
  )
}

export default function ScoutReelPanel({ report, context }: { report: ScoutReport; context: ScoutVideoContext }) {
  const bySection = useMemo(() => {
    return SECTION_ORDER
      .map(sec => ({ section: sec, label: SECTION_LABEL[sec], rows: report.bySection[sec] ?? [] }))
      .filter(g => g.rows.length > 0)
  }, [report])

  const [mode, setMode] = useState<Mode>('single')
  const [singleId, setSingleId] = useState<string | null>(null)
  const [reelIds, setReelIds] = useState<string[]>([])
  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const previewRef = useRef<HTMLCanvasElement>(null)

  function rowById(id: string): ScoutRow | undefined {
    return report.rows.find(r => r.id === id)
  }

  function toggleReelRow(id: string) {
    setReelIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= REEL_MAX) return prev
      return [...prev, id]
    })
  }

  function moveReelRow(id: string, dir: -1 | 1) {
    setReelIds(prev => {
      const i = prev.indexOf(id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function loadKeyEdges() {
    setMode('reel')
    setReelIds(report.keyEdges.slice(0, REEL_MAX).map(r => r.id))
  }

  const canExport = mode === 'single' ? singleId != null : reelIds.length >= 1
  const busy = stage === 'recording' || stage === 'transcoding'

  async function handleExport() {
    setErrorMsg(null)
    setProgress(0)
    try {
      await preloadFonts()

      let drawFrame: (ctx: CanvasRenderingContext2D, elapsedMs: number) => void
      let durationMs: number

      if (mode === 'single') {
        const row = singleId ? rowById(singleId) : undefined
        if (!row) throw new Error('No row selected')
        const image: ScoutImage = await preloadScoutRowImage(row, context)
        durationMs = SINGLE_DURATION_MS + 1200 // hold on the settled frame briefly before stopping
        drawFrame = (ctx, elapsedMs) => drawScoutRowFrame(ctx, row, image, context, elapsedMs)
      } else {
        const rows = reelIds.map(rowById).filter((r): r is ScoutRow => !!r)
        if (rows.length === 0) throw new Error('No rows selected')
        const images = await Promise.all(rows.map(r => preloadScoutRowImage(r, context)))
        const cfg: ScoutReelConfig = { rows, images, context, slotMs: REEL_SLOT_MS, crossfadeMs: REEL_CROSSFADE_MS }
        durationMs = scoutReelDurationMs(cfg)
        drawFrame = (ctx, elapsedMs) => drawScoutReelFrame(ctx, cfg, elapsedMs)
      }

      setStage('recording')
      const webm = await recordToWebm({
        durationMs, drawFrame, fps: 30,
        onProgress: pct => setProgress(pct * 0.6),
        previewCanvas: previewRef.current,
      })

      setStage('transcoding')
      const mp4 = await transcodeWebmToMp4(webm, pct => setProgress(60 + pct * 0.4))

      const url = URL.createObjectURL(mp4)
      const a = document.createElement('a')
      a.href = url
      a.download = `the-edge-scout-${mode === 'single' ? 'row' : 'reel'}-${context.gameSlug}.mp4`
      a.click()
      URL.revokeObjectURL(url)

      setStage('done')
    } catch (err) {
      console.error('Scout reel export failed:', err)
      setErrorMsg(
        err instanceof Error && /captureStream|MediaRecorder/.test(err.message)
          ? 'This browser doesn\u2019t support canvas video recording. Try Chrome or Edge.'
          : 'Export failed \u2014 check the console for details.'
      )
      setStage('error')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['single', 'reel'] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            disabled={busy}
            className="sr-mode-btn"
            style={{
              background: mode === m ? COLORS.stone : '#fff',
              color: mode === m ? COLORS.cream : COLORS.stone,
              borderColor: COLORS.stone,
            }}
          >
            {m === 'single' ? 'Single row reveal' : `Reel (up to ${REEL_MAX})`}
          </button>
        ))}
        <button onClick={loadKeyEdges} disabled={busy} className="sr-mode-btn" style={{ background: '#fff', color: COLORS.orange, borderColor: COLORS.orange, marginLeft: 'auto' }}>
          Load key edges ({report.keyEdges.length})
        </button>
      </div>

      {report.degradedNote && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: COLORS.gray, marginBottom: 10 }}>
          Note: report ran short on some sections ({report.degradedNote}) — real data only, nothing padded.
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* ── Picker ── */}
        <div style={{ flex: '1 1 380px', minWidth: 320, maxHeight: 520, overflowY: 'auto', border: `1px solid ${COLORS.line}`, background: '#fff' }}>
          {bySection.map(({ section, label, rows }) => (
            <div key={section} style={{ borderBottom: `1px solid ${COLORS.line}` }}>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: COLORS.orange, padding: '8px 10px', background: '#FAF8F3',
              }}>
                {label}
              </div>
              {rows.map(row => {
                const selected = mode === 'single' ? singleId === row.id : reelIds.includes(row.id)
                const reelPos = mode === 'reel' ? reelIds.indexOf(row.id) : -1
                return (
                  <button
                    key={row.id}
                    onClick={() => mode === 'single' ? setSingleId(row.id) : toggleReelRow(row.id)}
                    disabled={busy || (mode === 'reel' && !selected && reelIds.length >= REEL_MAX)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', textAlign: 'left',
                      padding: '8px 10px', border: 'none', borderBottom: `1px solid ${COLORS.line}`,
                      background: selected ? '#FFF0EA' : 'transparent', cursor: busy ? 'default' : 'pointer',
                    }}
                  >
                    <ThumbImage row={row} context={context} size={26} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: COLORS.stone, lineHeight: 1.35 }}>
                        {row.line}
                      </div>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: COLORS.gray, marginTop: 2 }}>
                        {row.subsection ?? ''}{row.highlight ? ` · ${row.highlight}` : ''}
                      </div>
                    </div>
                    {reelPos >= 0 && (
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%', background: COLORS.orange, color: '#fff',
                        fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
                      }}>
                        {reelPos + 1}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* ── Reel order ── */}
        {mode === 'reel' && reelIds.length > 1 && (
          <div style={{ flex: '0 0 220px' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLORS.gray, marginBottom: 6 }}>
              Reel order
            </div>
            {reelIds.map((id, i) => {
              const row = rowById(id)
              if (!row) return null
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', fontSize: 11, fontFamily: 'Inter, sans-serif' }}>
                  <span style={{ width: 16, color: COLORS.gray, fontFamily: 'JetBrains Mono, monospace' }}>{i + 1}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.line}</span>
                  <button onClick={() => moveReelRow(id, -1)} disabled={busy} className="sr-reorder-btn">↑</button>
                  <button onClick={() => moveReelRow(id, 1)} disabled={busy} className="sr-reorder-btn">↓</button>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Preview + export ── */}
        <div style={{ flex: '0 0 auto' }}>
          <canvas
            ref={previewRef}
            width={PREVIEW_W}
            height={PREVIEW_H}
            style={{ width: PREVIEW_W, height: PREVIEW_H, background: COLORS.cream, border: `2px solid ${COLORS.stone}`, display: 'block' }}
          />
          <button onClick={handleExport} disabled={!canExport || busy} className="sr-export-btn" style={{ width: PREVIEW_W, marginTop: 10 }}>
            {stage === 'recording' ? `Recording… ${Math.round(progress)}%`
              : stage === 'transcoding' ? `Encoding MP4… ${Math.round(progress)}%`
              : stage === 'done' ? 'Downloaded — export again'
              : 'Export MP4'}
          </button>
          {errorMsg && <div style={{ marginTop: 8, fontSize: 11, color: COLORS.orange, fontFamily: 'JetBrains Mono, monospace', width: PREVIEW_W }}>{errorMsg}</div>}
          <div style={{ marginTop: 8, fontSize: 10, color: COLORS.gray, fontFamily: 'JetBrains Mono, monospace', width: PREVIEW_W }}>
            {CANVAS.w}×{CANVAS.h} · lean shown as plain text, never the raw score
          </div>
        </div>
      </div>

      <style>{`
        .sr-mode-btn{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:1px;padding:8px 16px;border:1px solid;cursor:pointer}
        .sr-mode-btn:disabled{opacity:.5;cursor:default}
        .sr-export-btn{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:1px;background:#FF5722;color:#fff;border:none;padding:12px;cursor:pointer}
        .sr-export-btn:hover:not(:disabled){background:#e64a19}
        .sr-export-btn:disabled{opacity:.5;cursor:default}
        .sr-reorder-btn{font-family:'JetBrains Mono',monospace;font-size:10px;border:1px solid #1A1A1A;background:#fff;width:20px;height:20px;cursor:pointer;flex-shrink:0}
        .sr-reorder-btn:disabled{opacity:.4;cursor:default}
      `}</style>
    </div>
  )
}