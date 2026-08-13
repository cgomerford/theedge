// src/components/admin/VideoExportPanel.tsx
//
// UI for the MP4 export feature — pick one stat for a reveal loop, or pick
// several for a cycling reel, preview it live on a small canvas as it
// records, then transcode to MP4 and download.
//
// Reuses the SAME entries the A4 sheet already has (Top3StatsPayload) —
// no separate data fetch, no separate ranking logic. This panel is purely
// presentation/selection + the record pipeline in video-export.ts.

'use client'

import { useMemo, useRef, useState } from 'react'
import {
  preloadFonts,
  preloadItemImage,
  drawSingleStatFrame,
  drawReelFrame,
  reelDurationMs,
  recordToWebm,
  transcodeWebmToMp4,
  CANVAS,
  type VideoStatItem,
  type LoadedItemImage,
  type ReelConfig,
} from '@/lib/video-export'
import { playerHeadshotUrl, teamLogoUrlPng } from '@/lib/mlb'
import type { Top3StatsPayload } from '@/types/live-tracker'

const COLORS = { orange: '#FF5722', stone: '#1A1A1A', gray: '#A3A3A3', line: '#E2DCCF', cream: '#FAF8F3' } as const

const PREVIEW_W = 270
const PREVIEW_H = 480 // 9:16 at display scale

const REEL_MAX = 6
const SINGLE_DURATION_MS = 5000
const REEL_SLOT_MS = 3000
const REEL_CROSSFADE_MS = 300

type Mode = 'single' | 'reel'
type Stage = 'idle' | 'recording' | 'transcoding' | 'done' | 'error'

// Re-derive category from the flattened item for the key — Top3Entry itself
// doesn't carry its category, so the flattening step below tags it on.
// Re-derive category from the flattened item for the key — Top3Entry itself
// doesn't carry its category, so the flattening step below tags it on.
type FlatItem = VideoStatItem & { category: string }

function itemKey(item: FlatItem): string {
  return `${item.category}-${item.rank}-${item.gameSlug}`
}

function flattenPayload(payload: Top3StatsPayload): FlatItem[] {
  return payload.categories.flatMap(cat =>
    cat.entries.map(e => ({ ...e, categoryLabel: cat.label, category: cat.category }))
  )
}

function ThumbImage({ item, size }: { item: FlatItem; size: number }) {
  const [failed, setFailed] = useState(false)
  const src = item.playerId != null
    ? playerHeadshotUrl(item.playerId, 80)
    : item.teamId != null
    ? teamLogoUrlPng(item.teamId, 80)
    : null
  const isTeam = item.playerId == null

  if (!src || failed) {
    const initials = (item.playerName ?? item.teamAbbr ?? '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
    return (
      <div style={{
        width: size, height: size, borderRadius: isTeam ? 0 : '50%', flexShrink: 0,
        background: COLORS.stone, color: COLORS.cream, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'JetBrains Mono, monospace', fontSize: size * 0.32, fontWeight: 700,
      }}>
        {initials}
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

export default function VideoExportPanel({ payload }: { payload: Top3StatsPayload }) {
  const flat = useMemo(() => flattenPayload(payload), [payload])
  const byCategory = useMemo(() => {
    const map = new Map<string, { label: string; items: FlatItem[] }>()
    for (const item of flat) {
      if (!map.has(item.category)) map.set(item.category, { label: item.categoryLabel, items: [] })
      map.get(item.category)!.items.push(item)
    }
    return [...map.values()]
  }, [flat])

  const [mode, setMode] = useState<Mode>('single')
  const [singleKey, setSingleKey] = useState<string | null>(null)
  const [reelKeys, setReelKeys] = useState<string[]>([])
  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const previewRef = useRef<HTMLCanvasElement>(null)

  function toggleReelItem(key: string) {
    setReelKeys(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key)
      if (prev.length >= REEL_MAX) return prev
      return [...prev, key]
    })
  }

  function moveReelItem(key: string, dir: -1 | 1) {
    setReelKeys(prev => {
      const i = prev.indexOf(key)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const canExport = mode === 'single' ? singleKey != null : reelKeys.length >= 1
  const busy = stage === 'recording' || stage === 'transcoding'

  async function handleExport() {
    setErrorMsg(null)
    setProgress(0)
    try {
      await preloadFonts()

      let drawFrame: (ctx: CanvasRenderingContext2D, elapsedMs: number) => void
      let durationMs: number

      if (mode === 'single') {
        const item = flat.find(f => itemKey(f) === singleKey)
        if (!item) throw new Error('No stat selected')
        const image: LoadedItemImage = await preloadItemImage(item)
        durationMs = SINGLE_DURATION_MS
        drawFrame = (ctx, elapsedMs) => drawSingleStatFrame(ctx, item, image, elapsedMs)
      } else {
        const items = reelKeys.map(k => flat.find(f => itemKey(f) === k)).filter((x): x is FlatItem => !!x)
        if (items.length === 0) throw new Error('No stats selected')
        const images = await Promise.all(items.map(preloadItemImage))
        const cfg: ReelConfig = { items, images, slotMs: REEL_SLOT_MS, crossfadeMs: REEL_CROSSFADE_MS }
        durationMs = reelDurationMs(cfg)
        drawFrame = (ctx, elapsedMs) => drawReelFrame(ctx, cfg, elapsedMs)
      }

      setStage('recording')
      const webm = await recordToWebm({
        durationMs, drawFrame, fps: 30,
        onProgress: pct => setProgress(pct * 0.6), // recording is ~60% of the visible progress bar
        previewCanvas: previewRef.current,
      })

      setStage('transcoding')
      const mp4 = await transcodeWebmToMp4(webm, pct => setProgress(60 + pct * 0.4))

      const url = URL.createObjectURL(mp4)
      const a = document.createElement('a')
      a.href = url
      a.download = `the-edge-${mode === 'single' ? 'stat' : 'reel'}-${payload.date}.mp4`
      a.click()
      URL.revokeObjectURL(url)

      setStage('done')
    } catch (err) {
      console.error('Video export failed:', err)
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
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['single', 'reel'] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            disabled={busy}
            className="ve-mode-btn"
            style={{
              background: mode === m ? COLORS.stone : '#fff',
              color: mode === m ? COLORS.cream : COLORS.stone,
              borderColor: COLORS.stone,
            }}
          >
            {m === 'single' ? 'Single stat reveal' : `Reel (up to ${REEL_MAX})`}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* ── Picker ── */}
        <div style={{ flex: '1 1 380px', minWidth: 320, maxHeight: 520, overflowY: 'auto', border: `1px solid ${COLORS.line}`, background: '#fff' }}>
          {byCategory.map(({ label, items }) => (
            <div key={label} style={{ borderBottom: `1px solid ${COLORS.line}` }}>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: COLORS.orange, padding: '8px 10px', background: '#FAF8F3',
              }}>
                {label}
              </div>
              {items.length === 0 ? (
                <div style={{ padding: '6px 10px', fontSize: 11, color: COLORS.gray, fontStyle: 'italic' }}>No qualifying performance</div>
              ) : items.map(item => {
                const key = itemKey(item)
                const selected = mode === 'single' ? singleKey === key : reelKeys.includes(key)
                const reelPos = mode === 'reel' ? reelKeys.indexOf(key) : -1
                return (
                  <button
                    key={key}
                    onClick={() => mode === 'single' ? setSingleKey(key) : toggleReelItem(key)}
                    disabled={busy || (mode === 'reel' && !selected && reelKeys.length >= REEL_MAX)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                      padding: '7px 10px', border: 'none', borderBottom: `1px solid ${COLORS.line}`,
                      background: selected ? '#FFF0EA' : 'transparent', cursor: busy ? 'default' : 'pointer',
                    }}
                  >
                    <ThumbImage item={item} size={26} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: COLORS.stone, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.playerName ?? item.teamAbbr ?? '—'}
                      </div>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: COLORS.gray }}>
                        {item.teamAbbr}{item.opponentAbbr ? ` vs ${item.opponentAbbr}` : ''}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, color: COLORS.stone }}>
                      {item.value}
                    </div>
                    {reelPos >= 0 && (
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%', background: COLORS.orange, color: '#fff',
                        fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
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

        {/* ── Reel order (only shown in reel mode with 2+ picks) ── */}
        {mode === 'reel' && reelKeys.length > 1 && (
          <div style={{ flex: '0 0 220px' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLORS.gray, marginBottom: 6 }}>
              Reel order
            </div>
            {reelKeys.map((k, i) => {
              const item = flat.find(f => itemKey(f) === k)
              if (!item) return null
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', fontSize: 11, fontFamily: 'Inter, sans-serif' }}>
                  <span style={{ width: 16, color: COLORS.gray, fontFamily: 'JetBrains Mono, monospace' }}>{i + 1}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.playerName ?? item.teamAbbr}</span>
                  <button onClick={() => moveReelItem(k, -1)} disabled={busy} className="ve-reorder-btn">↑</button>
                  <button onClick={() => moveReelItem(k, 1)} disabled={busy} className="ve-reorder-btn">↓</button>
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
          <button onClick={handleExport} disabled={!canExport || busy} className="ve-export-btn" style={{ width: PREVIEW_W, marginTop: 10 }}>
            {stage === 'recording' ? `Recording… ${Math.round(progress)}%`
              : stage === 'transcoding' ? `Encoding MP4… ${Math.round(progress)}%`
              : stage === 'done' ? 'Downloaded — export again'
              : 'Export MP4'}
          </button>
          {errorMsg && <div style={{ marginTop: 8, fontSize: 11, color: COLORS.orange, fontFamily: 'JetBrains Mono, monospace', width: PREVIEW_W }}>{errorMsg}</div>}
          <div style={{ marginTop: 8, fontSize: 10, color: COLORS.gray, fontFamily: 'JetBrains Mono, monospace', width: PREVIEW_W }}>
            {CANVAS.w}×{CANVAS.h} · first export loads the transcoder (~5s)
          </div>
        </div>
      </div>

      <style>{`
        .ve-mode-btn{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:1px;padding:8px 16px;border:1px solid;cursor:pointer}
        .ve-mode-btn:disabled{opacity:.5;cursor:default}
        .ve-export-btn{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:1px;background:#FF5722;color:#fff;border:none;padding:12px;cursor:pointer}
        .ve-export-btn:hover:not(:disabled){background:#e64a19}
        .ve-export-btn:disabled{opacity:.5;cursor:default}
        .ve-reorder-btn{font-family:'JetBrains Mono',monospace;font-size:10px;border:1px solid #1A1A1A;background:#fff;width:20px;height:20px;cursor:pointer;flex-shrink:0}
        .ve-reorder-btn:disabled{opacity:.4;cursor:default}
      `}</style>
    </div>
  )
}