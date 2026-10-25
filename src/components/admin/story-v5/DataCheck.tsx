'use client'

// src/components/admin/story-v5/DataCheck.tsx
//
// Stage 3 admin view: build the preview data for one gamePk and show the JSON or the full problem list.
// The scenes, Remotion Player and render job are wired onto this page in the next stages.

import { useState } from 'react'
import { SANS } from '@/components/team/ui'
import { runPreviewData, type PreviewResult } from './actions'
import PreviewPlayer from './PreviewPlayer'

export default function DataCheck({ defaultPk }: { defaultPk: number }) {
  const [pk, setPk] = useState(String(defaultPk))
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<PreviewResult | null>(null)
  const run = async (refresh: boolean) => {
    setBusy(true); setRes(null)
    setRes(await runPreviewData(Number(pk), { refresh, hook: { caption } }))
    setBusy(false)
  }
  return (
    <div style={{ fontFamily: SANS, maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Story v5 · data check</h1>
      <p style={{ color: '#5C5A55', fontSize: 14 }}>Builds the one JSON every scene reads. Any missing number or wrong roster is listed here instead of rendering a blank.</p>
      <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
        <input value={pk} onChange={e => setPk(e.target.value)} placeholder="gamePk" style={{ border: '1px solid #e7e2d8', padding: '6px 10px', width: 140, fontFamily: SANS }} />
        <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="hook caption (you type it)" style={{ border: '1px solid #e7e2d8', padding: '6px 10px', width: 360, fontFamily: SANS }} />
        <button disabled={busy} onClick={() => run(false)} style={{ background: '#FF5722', color: '#fff', padding: '6px 14px', fontWeight: 800 }}>{busy ? 'Building' : 'Build data'}</button>
        <button disabled={busy} onClick={() => run(true)} style={{ border: '1px solid #1A1A1A', padding: '6px 14px', fontWeight: 700 }}>Rebuild, ignore cache</button>
      </div>
      {res && !res.ok ? <ul id="v5-problems" style={{ color: '#D4533B', fontSize: 14 }}>{res.problems.map(p => <li key={p}>{p}</li>)}</ul> : null}
      {res?.ok ? <div id="v5-status" style={{ fontSize: 13, color: '#5C5A55', marginBottom: 6 }}>
        Starting pitchers: {res.data.starters.away.name} ({res.data.teams.away.abbr}) {res.data.starters.away.confirmed ? 'confirmed' : 'probable'}, {res.data.starters.home.name} ({res.data.teams.home.abbr}) {res.data.starters.home.confirmed ? 'confirmed' : 'probable'}. Lineups: {res.data.teams.away.abbr} {res.data.defense.away.lineupConfirmed ? 'confirmed' : 'not yet'}, {res.data.teams.home.abbr} {res.data.defense.home.lineupConfirmed ? 'confirmed' : 'not yet'}. Data built {new Date(res.data.generatedAt).toLocaleTimeString()}.
      </div> : null}
      {res?.ok ? <PreviewPlayer data={res.data} /> : null}
      {res?.ok ? <pre id="v5-json" style={{ fontSize: 12, background: '#fff', border: '1px solid #e7e2d8', padding: 12, overflow: 'auto', maxHeight: 640 }}>{JSON.stringify(res.data, (k, v) => (k === 'points' ? `[${(v as unknown[]).length} points]` : v), 1)}</pre> : null}
    </div>
  )
}
