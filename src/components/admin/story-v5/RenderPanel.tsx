'use client'

// src/components/admin/story-v5/RenderPanel.tsx
//
// Render section of the admin page: press Render, watch the progress, then download the MP4, the data JSON and the contact sheet, or copy the
// MP4 link. The render itself runs as a background process (render-actions.ts); this panel only starts it and polls its status file.

import { useCallback, useEffect, useRef, useState } from 'react'
import { SANS } from '@/components/team/ui'
import { getRender, listRenders, startRender, type RenderStatus } from './render-actions'
import type { PreviewProps } from './remotion/Preview'
import { FPS, MAX_FRAMES, layout } from './remotion/config'

const url = (s: RenderStatus, name: string, download = false) => `/admin/story-v5/files?game=${s.gamePk}&date=${s.slateDate}&job=${s.id}&name=${name}${download ? '&download=1' : ''}`

export default function RenderPanel({ gamePk, slateDate, props }: { gamePk: number; slateDate: string; props: PreviewProps }) {
  const [current, setCurrent] = useState<RenderStatus | null>(null)
  const [history, setHistory] = useState<RenderStatus[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const alive = useRef(true)
  const { total, scenes } = layout(props.scenes ?? [])
  const tooLong = total > MAX_FRAMES

  const refresh = useCallback(async () => { setHistory(await listRenders(gamePk, slateDate).catch(() => [])) }, [gamePk, slateDate])
  useEffect(() => { Promise.resolve().then(refresh) }, [refresh])
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  // Watch a running render until it finishes (a plain loop, stopped if the panel goes away).
  const watch = useCallback(async (id: string) => {
    while (alive.current) {
      const s = await getRender(gamePk, slateDate, id).catch(() => null)
      if (!s) { setError('lost track of the render'); return }
      setCurrent(s)
      if (s.state !== 'running') { refresh(); return }
      await new Promise(r => setTimeout(r, 1500))
    }
  }, [gamePk, slateDate, refresh])

  const start = async () => {
    setError(null); setCurrent(null)
    const r = await startRender(gamePk, slateDate, props)
    if (!r.ok) { setError(r.error); return }
    await watch(r.id)
  }
  const running = current?.state === 'running'
  const done = current?.state === 'done' ? current : null
  const copy = async (s: RenderStatus) => {
    try { await navigator.clipboard.writeText(`${window.location.origin}${url(s, 'x9lab-preview.mp4')}`); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { setError('could not copy, copy the link by hand') }
  }
  const btn = { border: '1px solid #1A1A1A', background: '#fff', color: '#1A1A1A', padding: '6px 12px', fontSize: 13, fontWeight: 700 as const, display: 'inline-block', textDecoration: 'none' }

  return (
    <div id="v5-render" style={{ fontFamily: SANS, marginTop: 24, borderTop: '2px solid #1A1A1A', paddingTop: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722' }}>RENDER</div>
      <p style={{ fontSize: 13, color: '#5C5A55', margin: '4px 0 10px', maxWidth: 640 }}>
        Makes the MP4 (1080x1350, 30 fps, H.264, no audio) from the slides ticked above, with the data and a contact sheet saved next to it. It runs in the background and takes a few minutes.
      </p>
      <button id="v5-render-btn" onClick={start} disabled={running || tooLong || !scenes.length} style={{ ...btn, background: '#FF5722', color: '#fff', border: '1px solid #FF5722', opacity: running || tooLong || !scenes.length ? 0.5 : 1 }}>
        {running ? 'Rendering…' : `Render MP4 · ${scenes.length} slides · ${(total / FPS).toFixed(1)} s`}
      </button>
      {tooLong ? <span style={{ marginLeft: 10, fontSize: 13, color: '#D4533B' }}>Over the {MAX_FRAMES / FPS} s limit, switch a slide off.</span> : null}
      {error ? <div id="v5-render-error" style={{ marginTop: 8, fontSize: 13, color: '#D4533B' }}>{error}</div> : null}
      {current && current.state !== 'done' ? (
        <div style={{ marginTop: 10, maxWidth: 560 }}>
          <div style={{ fontSize: 13, color: current.state === 'failed' ? '#D4533B' : '#5C5A55' }}>{current.state === 'failed' ? `Failed: ${current.error ?? current.stage}` : `${current.stage} · ${current.pct}%`}</div>
          <div style={{ height: 10, background: '#e7e2d8', marginTop: 4 }}><div style={{ width: `${current.pct}%`, height: '100%', background: current.state === 'failed' ? '#D4533B' : '#FF5722', transition: 'width .4s' }} /></div>
        </div>
      ) : null}
      {done ? (
        <div id="v5-render-done" style={{ marginTop: 12, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <video src={url(done, 'x9lab-preview.mp4')} controls style={{ width: 300, background: '#000' }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, maxWidth: 420 }}>
              <a href={url(done, 'x9lab-preview.mp4', true)} style={btn}>Download MP4 ({((done.bytes ?? 0) / 1e6).toFixed(1)} MB)</a>
              <button onClick={() => copy(done)} style={btn}>{copied ? 'Copied' : 'Copy MP4 link'}</button>
              <a href={url(done, 'data.json', true)} style={btn}>Data JSON</a>
              <a href={url(done, 'contact-sheet.png', true)} style={btn}>Contact sheet</a>
            </div>
          </div>
          <div style={{ flex: '1 1 320px', maxWidth: 560 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: done.spec?.ok ? '#1D9E75' : '#D4533B' }}>{done.spec?.ok ? 'MP4 meets the spec' : 'MP4 does not meet the spec'}</div>
            {done.spec?.ok ? <div style={{ fontSize: 12, color: '#5C5A55' }}>H.264 yuv420p, 1080x1350, 30 fps, no audio, faststart, {String(done.spec.report.frames)} frames.</div>
              : <ul style={{ fontSize: 12, color: '#D4533B', margin: '4px 0' }}>{done.spec?.issues.map(i => <li key={i}>{i}</li>)}</ul>}
            {/* eslint-disable-next-line @next/next/no-img-element -- admin-only preview of a local file */}
            <img src={url(done, 'contact-sheet.png')} alt="Contact sheet: one frame per slide" style={{ width: '100%', marginTop: 8, border: '1px solid #e7e2d8' }} />
          </div>
        </div>
      ) : null}
      {history.length ? (
        <div style={{ marginTop: 14, fontSize: 12, color: '#5C5A55' }}>
          <div style={{ fontWeight: 800, letterSpacing: '.1em' }}>EARLIER RENDERS FOR THIS GAME</div>
          {history.map(h => (
            <div key={h.id} style={{ marginTop: 4 }}>
              {h.startedAt ? new Date(h.startedAt).toLocaleString() : h.id} · {h.state}{h.state === 'done' ? <> · <a href={url(h, 'x9lab-preview.mp4')} target="_blank" rel="noreferrer">MP4</a> · <a href={url(h, 'contact-sheet.png')} target="_blank" rel="noreferrer">sheet</a> · <a href={url(h, 'data.json')} target="_blank" rel="noreferrer">data</a></> : h.error ? ` · ${h.error}` : ''}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
